import {exactAdd, exactCompare, exactMultiply, exactDivide, exactDecimal,exactToNumber} from './exactMath.js';
import {mergePricingForValidationVNext} from './pricingMerge.js';
import {trimComponentPricing,trimPreparationNeeded,coatLaborParts,PAINTING_RATES} from './surfacePricing.js';
import {fenceCatalog,fenceHasRows,fenceHeightRows,fenceRowsDiagnostics,fenceSelection,resolvedFencePricing,fenceQuoteTiers,fenceCatalogVariants,fencePostQuantities,fenceLayout,exactFenceHeight,fenceHeightPrecision,FENCE_POST_RATES,FENCE_RUN_QUESTION,FENCE_CLOSED_QUESTION,FENCE_SECTION_QUESTION} from './fencePricing.js';
export {exactFenceHeight} from './fencePricing.js';

// Opt-in owner offerings. Existing pricing fields retain their original meaning.
// Rates contain money only; details contain scope and units only. Approval of the
// complete saved service binds both. Posts use the owner-approved spacing formula.
export const OFFERING_TYPES = ['FENCING_INSTALL','FENCING_REPLACEMENT','INTERIOR_PAINTING','EXTERIOR_PAINTING'];
export const OFFERING_FIELDS = ['offeringMode','offeringDetails','offeringRates'];
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (v,k) => Object.hasOwn(v||{},k);
const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000;
const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1_000_000;
const slug = v => typeof v === 'string' && /^[a-z][a-z0-9_]*$/.test(v);
const rate = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const integer = (v,min,max) => Number.isInteger(v) && v >= min && v <= max;
const fence = type => type.startsWith('FENCING_');
export const configuredOffering = (type,p) => OFFERING_TYPES.includes(type) && (OFFERING_FIELDS.some(k=>own(p,k))||fence(type)&&fenceHasRows(p));
export const offeringRatePath = path => typeof path === 'string' && path.startsWith('offeringRates.');
const number = (label,unit,min=0,max=1_000_000,extra={}) => ({label,unit,type:'number',min,max,...extra});
const choice = (label,values) => ({label,unit:null,type:'enum',values});
const bool = label => ({label,unit:null,type:'boolean'});

export function offeringPriceBaseline(type) {
  if(fence(type))return {field:'terrainSlope',value:'flat',condition:'flat ground',adjustment:'Terrain'};
  if(type==='INTERIOR_PAINTING')return {field:'wallHeight',value:'standard',condition:'standard-height walls',adjustment:'Wall-height'};
  if(type==='EXTERIOR_PAINTING')return {field:'stories',value:1,condition:'one-story building',adjustment:'Stories'};
  return null;
}

export function offeringBaselineConfirmation(type,p={}) {
  const baseline=offeringPriceBaseline(type),d=p.offeringDetails;
  if(!baseline||!configuredOffering(type,p)||!record(d)||d[baseline.field]===undefined||d[baseline.field]===baseline.value||d.baselinePricesConfirmed===true)return null;
  const saved=baseline.field==='stories'?`${d.stories}-story building`:baseline.field==='wallHeight'?`${d.wallHeight} walls`:`${d.terrainSlope} ground`;
  return {path:'offeringDetails.baselinePricesConfirmed',kind:'offering_price_baseline',message:`This offering was saved for ${saved}. Offering prices now cover ${baseline.condition}, with ${baseline.adjustment.toLowerCase()} adjustments applied on top to labor only. This offering does not quote until you review its prices and confirm them as baseline prices. Saved prices have not been changed.`};
}

export const offeringMoneyKind=key=>key.startsWith('gate_')||own(FENCE_POST_RATES,key)||['postMaterialEach','footingLaborEach','footingMaterialEach'].includes(key)?'fixed_amount':'unit_rate';

export function offeringRateDefinitions(type,p={}) {
  const installed=p.offeringMode==='installed', d=p.offeringDetails||{}, out={};
  const add=(key,label,category,unit,priceBasis)=>out[key]={label,category,unit,moneyKind:offeringMoneyKind(key),...(priceBasis?{priceBasis}:{})};
  if(fence(type)) {
    if(installed)add('installedFencePerLF','Installed fence including standard posts and footings','addon','fence linear feet','sell_price');
    else {
      add('fenceLaborPerLF','Fence infill installation labor','labor','fence linear feet');
      add('fenceMaterialPerLF','Fence infill materials','material','fence linear feet');
      add('postMaterialEach','Separately priced post materials','material','calculated posts');
      add('footingLaborEach','Post-hole and footing labor','labor','calculated posts');
      add('footingMaterialEach','Footing materials','material','calculated posts');
      for(const [key,[label,category]] of Object.entries(FENCE_POST_RATES))add(key,label,category,key.startsWith('terminal')?'terminal post':'line post');
    }
    if(record(d.gates))for(const key of Object.keys(d.gates))if(slug(key))add('gate_'+key,'Installed gate: '+key.replaceAll('_',' '),'addon','gates','sell_price');
    if(type==='FENCING_REPLACEMENT'&&d.removalOffered===true)add('removalPerLF','Fence removal','addon','removed fence linear feet','sell_price');
  } else {
    if(installed)add('installedWallPerSqft','Painting including the defined coats, preparation and primer','addon','paintable wall square feet','sell_price');
    else {
      add('wallLaborPerSqftPerCoat','Wall finish labor','labor','wall square-foot coats');
      add('wallMaterialPerSqftPerCoat','Wall finish materials','material','wall square-foot coats');
      add('prepLaborPerSqft','Saved preparation labor for the defined condition','prep','painted square feet');
      add('prepMaterialPerSqft','Saved preparation materials for the defined condition','material','painted square feet');
      for(const condition of ['good','fair','poor']){
        add('prepLaborPerSqft_'+condition,condition+' surface preparation labor','prep','painted square feet');
        add('prepMaterialPerSqft_'+condition,condition+' surface preparation materials','material','painted square feet');
      }
      if(d.primerCoats>0){add('primerLaborPerSqftPerCoat','Wall primer labor','labor','wall square-foot primer coats');add('primerMaterialPerSqftPerCoat','Wall primer materials','material','wall square-foot primer coats');}
    }
    if(type==='INTERIOR_PAINTING'&&d.ceilingsOffered===true) {
      if(installed)add('installedCeilingPerSqft','Ceiling painting including the defined coats, preparation and primer','addon','ceiling square feet','sell_price');
      else {
        add('ceilingLaborPerSqftPerCoat','Ceiling finish labor','labor','ceiling square-foot coats');
        add('ceilingMaterialPerSqftPerCoat','Ceiling finish materials','material','ceiling square-foot coats');
        if(d.ceilingPrimerCoats>0){add('ceilingPrimerLaborPerSqftPerCoat','Ceiling primer labor','labor','ceiling square-foot primer coats');add('ceilingPrimerMaterialPerSqftPerCoat','Ceiling primer materials','material','ceiling square-foot primer coats');}
      }
    }
    if(type==='INTERIOR_PAINTING'&&d.trimOffered===true)add('installedTrimPerLF','Installed trim painting including the defined scope','addon','trim linear feet','sell_price');
  }
  return out;
}

export function offeringStructureDiagnostics(type,p) {
  if(!configuredOffering(type,p))return [];
  if(fence(type)&&['fenceOfferings','heightRows'].some(k=>own(p,k)&&!record(p[k])))return [{type:'invalid',kind:'fence_height_rows',path:'heightRows',message:'Fence offerings and height rows must be named maps.'}];
  if(fence(type)&&fenceCatalog(p))return fenceCatalogDiagnostics(type,p);
  if(fence(type)&&record(p.heightRows)){
    const errors=fenceRowsDiagnostics(p,'pricing');
    for(const [key,row] of Object.entries(p.heightRows))if(record(row)){
      const {heightRows,fenceOfferings,...base}=p;
      const at={...base,...row,offeringDetails:{...p.offeringDetails,fenceHeight:row.exactHeight??row.maximumHeight}};
      for(const name of ['exactHeight','minimumHeight','maximumHeight'])delete at[name];
      errors.push(...offeringStructureDiagnostics(type,at).map(d=>({...d,path:'heightRows.'+key+'.'+d.path})));
    }
    return errors;
  }
  const errors=[],add=(path,message,kind='invalid')=>errors.push({type:kind,kind:'offering_configuration',path,message});
  if(!['installed','itemized'].includes(p.offeringMode))add('offeringMode','Choose installed or itemized pricing for this offering.');
  if(!record(p.offeringDetails)){add('offeringDetails','Define what this offering includes.');return errors;}
  const d=p.offeringDetails,allowed=['description'];
  const check=(key,valid,message)=>{allowed.push(key);if(!valid(d[key]))add('offeringDetails.'+key,message);};
  check('description',text,'Describe the complete offered job.');
  check('baselinePricesConfirmed',v=>v===undefined||typeof v==='boolean','Explicitly confirm baseline prices with Yes or No.');
  if(fence(type)) {
    check('fenceType',slug,'Identify the offered fence material/style.');
    check('fenceHeight',v=>typeof v==='number'&&Number.isFinite(v)&&v>0,'Enter the positive height in feet covered by these prices.');
    check('fenceHeight',v=>!(typeof v==='number'&&Number.isFinite(v)&&v>0)||fenceHeightWithinPrecision(v),FENCE_HEIGHT_PRECISION_MESSAGE);
    check('terrainSlope',v=>v===undefined||['flat','moderate','steep'].includes(v),'Choose the terrain covered by these prices.');
    check('postFootingDescription',text,'Define the standard posts, footings and digging covered by these prices.');
    check('gates',record,'Define offered gates, or an empty map when none are offered.');
    if(record(d.gates))for(const [key,g] of Object.entries(d.gates)) {
      const at='offeringDetails.gates.'+key;
      if(!slug(key)||!record(g)){add(at,'Each gate needs a named definition.');continue;}
      for(const k of Object.keys(g))if(!['widthLF','description','postsAndFootingsIncluded'].includes(k))add(at+'.'+k,'Unsupported gate detail.','unsupported');
      if(!positive(g.widthLF))add(at+'.widthLF','Enter the measured opening width covered by this gate price.');
      if(!text(g.description))add(at+'.description','Define the installed gate and hardware included.');
      if(typeof g.postsAndFootingsIncluded!=='boolean'||p.offeringMode==='installed'&&!g.postsAndFootingsIncluded)add(at+'.postsAndFootingsIncluded','Installed fence gate prices must include their gate posts and footings; itemized gates must explicitly state inclusion.');
    }
    if(type==='FENCING_REPLACEMENT') {
      check('removalOffered',v=>typeof v==='boolean','State whether removal is offered.');
      if(d.removalOffered){check('removalDescription',text,'Define the fence removal included.');check('removalIncludesDisposal',v=>typeof v==='boolean','State whether removal includes disposal.');}
    }
  } else {
    check('substrate',text,'Define the paintable substrate covered.');
    check('coating',text,'Define the coating/product system covered.');
    check('finishCoats',v=>p.offeringMode==='itemized'&&v===undefined||integer(v,1,3),'Define one, two or three finish coats.');
    check('surfaceCondition',v=>p.offeringMode==='itemized'&&v===undefined||['good','fair','poor'].includes(v),'Choose the surface condition covered.');
    check('preparation',text,'Define the preparation included for each priced surface condition.');
    check('primerCoats',v=>integer(v,0,3),'Explicitly define the primer coats, including zero when excluded.');
    if(type==='INTERIOR_PAINTING') {
      check('wallHeight',v=>v===undefined||['standard','high','vaulted'].includes(v),'Choose the wall-height category covered.');
      check('ceilingsOffered',v=>typeof v==='boolean','State whether ceiling painting is offered.');
      check('trimOffered',v=>typeof v==='boolean','State whether trim painting is offered.');
      if(d.ceilingsOffered){check('ceilingCoats',v=>p.offeringMode==='itemized'&&v===undefined||integer(v,1,3),'Define ceiling finish coats.');check('ceilingPrimerCoats',v=>integer(v,0,3),'Define ceiling primer coats.');}
      if(d.trimOffered)check('trimDescription',text,'Define the trim preparation, finish coats and primer included.');
      for(const key of ['ceilingSurfaceCondition','trimSurfaceCondition'])check(key,v=>v===undefined||['good','fair','poor'].includes(v),'Choose the condition covered for this surface.');
      check('trimFinishCoats',v=>v===undefined||integer(v,1,3),'Define the finish coats covered by the installed trim price.');
    } else check('stories',v=>v===undefined||[1,2,3].includes(v),'Choose the building stories covered by these prices.');
  }
  // Switching an explicit option off preserves its saved definition. Validate
  // retained fields but use only the selected scope in quantities and charges.
  const optional=type==='FENCING_REPLACEMENT'?{removalDescription:text,removalIncludesDisposal:v=>typeof v==='boolean'}:type==='INTERIOR_PAINTING'?{ceilingCoats:v=>integer(v,1,3),ceilingPrimerCoats:v=>integer(v,0,3),trimDescription:text}:{};
  for(const [key,valid] of Object.entries(optional))if(!allowed.includes(key)){allowed.push(key);if(own(d,key)&&!valid(d[key]))add('offeringDetails.'+key,'Retained offering detail is invalid.');}
  for(const key of Object.keys(d))if(!allowed.includes(key))add('offeringDetails.'+key,'Unsupported offering detail.','unsupported');
  if(!record(p.offeringRates))add('offeringRates','Enter the owner prices for this offering.');
  else {
    const allDetails={...d,primerCoats:1,ceilingsOffered:true,ceilingPrimerCoats:1,trimOffered:true,removalOffered:true};
    const definitions={...offeringRateDefinitions(type,{offeringMode:'installed',offeringDetails:allDetails}),...offeringRateDefinitions(type,{offeringMode:'itemized',offeringDetails:allDetails})};
    for(const [key,value] of Object.entries(p.offeringRates)) {
      if(!own(definitions,key))add('offeringRates.'+key,'This price is not supported by this offering.','unsupported');
      else if(!rate(value)||definitions[key].moneyKind==='fixed_amount'&&!Number.isSafeInteger(value))add('offeringRates.'+key,'Enter a finite non-negative unit rate in cents.');
    }
  }
  return errors;
}

// A gate key identifies a measured opening, not a tier-specific measurement.
// The saved base definition wins; a tier-only gate takes its first definition.
export function offeringGateDefinitions(p={},rules={}) {
  const source=record(rules.pricing)?rules.pricing:record(rules.offeringDetails)?rules:p;
  const base=source.fenceOfferings?.[p.offeringDetails?.fenceType]||source;
  const gates={...(base.offeringDetails?.gates||{})};
  for(const tier of Array.isArray(base.tiers)?base.tiers:Array.isArray(rules.tiers)?rules.tiers:[])for(const [key,gate] of Object.entries(tier.overrides?.offeringDetails?.gates||{}))if(!own(gates,key))gates[key]={...gate};
  return gates;
}

export function offeringContract(type,p,rules={}) {
  if(fence(type)&&fenceCatalog(p))return fenceCatalogContract(type,p,rules);
  const d=p.offeringDetails||{}, installed=p.offeringMode==='installed';
  const fields={permitRequired:bool('Permit required for this measured project')};
  if(fence(type))Object.assign(fields,{
    linearFeet:number('Measured fence length excluding gate openings','linear feet',1),
    lfMethod:choice('Fence measurement method',['exact']),
    fenceType:{label:'Fence type',type:'slug',unit:null},fenceHeight:number('Fence height','feet',Number.MIN_VALUE,Number.MAX_VALUE),
    terrainSlope:choice('Terrain slope',['flat','moderate','steep']),
    gates:{label:'Gates by measured opening width',type:'offering_counts',unit:'gates',values:record(d.gates)?Object.keys(d.gates):[],options:record(d.gates)?Object.fromEntries(Object.entries(d.gates).map(([k,v])=>[k,`${k.replaceAll('_',' ')} — ${typeof v?.widthLF==='number'?v.widthLF:'undefined'} ft opening; ${typeof v?.description==='string'?v.description:''}`])):{}},
    confirmedFacts:{label:'Affirmatively identified owner offerings',type:'confirmed_facts',unit:null},
    fenceRunCount:{...number(FENCE_RUN_QUESTION,'runs',1,1_000_000,{integer:true,required:true}),summaryLabel:'Fence runs'},
    fenceRuns:{label:FENCE_SECTION_QUESTION,summaryLabel:'Fence layout',type:'fence_runs',unit:'feet',closedQuestion:FENCE_CLOSED_QUESTION,sectionQuestion:FENCE_SECTION_QUESTION,gateChoices:record(d.gates)?Object.entries(d.gates).map(([value,g])=>({value,label:`${value.replaceAll('_',' ')} — ${g?.widthLF} ft opening; ${g?.description??''}`})):[]},
    cornerCount:number('Fence corners','corners',0,1_000_000,{integer:true}),
    ...(type==='FENCING_REPLACEMENT'?{oldFenceRemoval:bool('Old fence removal included'),removalLengthLF:number('Measured old fence length to remove','linear feet',0.1)}:{})
  });
  else Object.assign(fields,{
    areaInputMethod:choice('Wall area measurement method',['wall_sqft']),
    [type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft']:number('Measured paintable wall area','square feet',1,2_000_000),
    coats:number(installed?'Finish paint coats':'Finish coats on walls and selected ceilings','coats',1,3,{integer:true}),surfaceCondition:choice('Surface condition',['good','fair','poor']),
    ...(type==='INTERIOR_PAINTING'?{wallHeight:choice('Wall height',['standard','high','vaulted']),wallScopeUniform:bool('All wall area shares the confirmed height, access, and finish-coat count'),ceilingsIncluded:bool('Ceiling painting included'),ceilingAreaSqft:number('Measured ceiling area','square feet',1,2_000_000),trimIncluded:bool('Trim painting included'),trimLengthLF:number('Measured trim length','linear feet',0.1)}:{stories:choice('Building stories',[1,2,3])})
  });
  return {fields,required:c=>{
    if(fence(type))return [...(c.fenceRuns!==undefined?['fenceRunCount','fenceRuns']:['linearFeet','lfMethod','gates','cornerCount',...(fenceHasRows(p)?['fenceRunCount']:[])]),'fenceType','fenceHeight','terrainSlope',...(type==='FENCING_REPLACEMENT'?['oldFenceRemoval',...(c.oldFenceRemoval?['removalLengthLF']:[])]:[])];
    return ['areaInputMethod',type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft','coats','surfaceCondition',...(type==='INTERIOR_PAINTING'?['wallHeight','wallScopeUniform','ceilingsIncluded','trimIncluded',...(c.ceilingsIncluded?['ceilingAreaSqft']:[]),...(c.trimIncluded?['trimLengthLF']:[])]:['stories'])];
  },inspection:c=>fence(type)?c.lfMethod!=='exact'&&c.fenceRuns===undefined?'Measured fence length is required.':positive(c.fenceHeight)&&c.fenceType===d.fenceType?fenceSelection(p,c).error||null:null:c.areaInputMethod!=='wall_sqft'?'Measured paintable wall area is required.':null,
  crossValidate:c=>{
    const errors=[],bad=(field,message)=>errors.push({field,message});
    const equal=(field,expected)=>{if(c[field]!==undefined&&c[field]!==expected)bad(field,'This detail does not match the selected owner offering.');};
    if(fence(type)) {
      equal('fenceType',d.fenceType);
      if(positive(c.fenceHeight)&&c.fenceType===d.fenceType){const selected=fenceSelection(p,c);if(selected.error)bad(selected.field,selected.error);}
      if(c.fenceRuns!==undefined)try{fenceLayout(c,p);}catch(error){bad('fenceRuns',error.message);}
      const confirmedGates=offeringGateDefinitions(p,rules);
      for(const [key,count] of Object.entries(c.gates||{}))if(count>0&&positive(d.gates?.[key]?.widthLF)&&positive(confirmedGates[key]?.widthLF)&&exactCompare(d.gates[key].widthLF,confirmedGates[key].widthLF)!==0)bad('gates.'+key,'This option changes the confirmed gate-opening width. Choose an offering for the measured opening.');
      if(c.fenceHeight!==undefined&&typeof c.fenceHeight==='number'&&Number.isFinite(c.fenceHeight)&&c.fenceHeight>0&&!fenceHeightWithinPrecision(c.fenceHeight))bad('fenceHeight',FENCE_HEIGHT_PRECISION_MESSAGE);
      if(c.oldFenceRemoval===true&&!d.removalOffered)bad('oldFenceRemoval','Removal is not included in this offering.');
      if(c.oldFenceRemoval===false&&c.removalLengthLF!==undefined)bad('removalLengthLF','Removal length cannot be supplied when removal is excluded.');
    } else {
      if(installed){equal('coats',d.finishCoats);equal('surfaceCondition',d.surfaceCondition);}
      if(installed&&c.ceilingsIncluded){equal('ceilingCoats',d.ceilingCoats);equal('ceilingSurfaceCondition',d.ceilingSurfaceCondition??d.surfaceCondition);}
      if(c.trimIncluded&&(installed||!trimComponentPricing(p))){
        equal('trimCoats',d.trimFinishCoats);equal('trimSurfaceCondition',d.trimSurfaceCondition);
      }
      if(c.wallScopeUniform===false)bad('wallScopeUniform','Price differing wall zones as their separate measured offerings.');
      if(c.ceilingsIncluded===true&&!d.ceilingsOffered)bad('ceilingsIncluded','Ceilings are not offered in this configuration.');
      if(c.trimIncluded===true&&!d.trimOffered)bad('trimIncluded','Trim is not offered in this configuration.');
      if(c.ceilingsIncluded===false&&c.ceilingAreaSqft!==undefined)bad('ceilingAreaSqft','Ceiling area cannot be supplied when ceilings are excluded.');
      if(c.trimIncluded===false&&c.trimLengthLF!==undefined)bad('trimLengthLF','Trim length cannot be supplied when trim is excluded.');

    }
    return errors;
  }};
}

function fenceCatalogDiagnostics(type,p){
  const errors=fenceRowsDiagnostics(p,'pricing');
  if(!Object.keys(p.fenceOfferings).length)errors.push({type:'missing',kind:'fence_offerings',path:'fenceOfferings',message:'Add an offering for each fence type you build.'});
  for(const [name,offer] of Object.entries(p.fenceOfferings)){
    const at='fenceOfferings.'+name;
    if(!record(offer))continue;
    for(const field of Object.keys(offer))if(!['offeringMode','offeringDetails','heightRows','tiers','installedLaborPercent','installedMaterialsPercent','minimumJob'].includes(field))errors.push({type:'unsupported',kind:'fence_offerings',path:at+'.'+field,message:'Unsupported fence offering field.'});
    if(offer.offeringDetails?.fenceType!==name)errors.push({type:'invalid',kind:'fence_offerings',path:at+'.offeringDetails.fenceType',message:'The offering key must match its registered fence type.'});
    const variants=[{name:null,overrides:{}},...(Array.isArray(offer.tiers)?offer.tiers:[])];
    for(const [index,tier] of variants.entries()){
      if(!record(tier)||!record(tier.overrides))continue;
      if(own(tier.overrides,'fenceOfferings')||own(tier.overrides,'tiers')){errors.push({type:'unsupported',kind:'fence_offerings',path:at+'.tiers',message:'A fence tier may change its own height rows and details, not another offering or its tiers.'});continue;}
      const effective=mergePricingForRows(offer,tier.overrides);
      const {fenceOfferings,heightRows,tiers,...common}=p;
      const {tiers:unused,...settings}=effective;
      const prefix=at+(index?'.tiers.'+(index-1)+'.overrides':'');
      errors.push(...offeringStructureDiagnostics(type,{...common,...settings}).map(d=>({...d,path:prefix+'.'+d.path})));
    }
  }
  return errors;
}
function mergePricingForRows(base,overrides){
  return mergePricingForValidationVNext(base,overrides);
}
function fenceCatalogContract(type,p,rules){
  let variants=[];
  try{variants=fenceCatalogVariants(p,rules.tiers);}catch{}
  const single=v=>{const {fenceOfferings,...pricing}=v;return pricing;};
  const fallback={offeringMode:'itemized',offeringDetails:{gates:{}},heightRows:{}};
  const base=offeringContract(type,variants[0]?single(variants[0].pricing):fallback,rules);
  const choices=variants.map(v=>{
    const contract=offeringContract(type,single(v.pricing),rules),row=v.row;
    const confirmed=offeringGateDefinitions(v.pricing,{...rules,pricing:p});
    const options=Object.fromEntries(contract.fields.gates.values.map(key=>{
      const g=confirmed[key];return [key,`${key.replaceAll('_',' ')} — ${g?.widthLF} ft opening; ${g?.description??''}`];
    }));
    const conditions=[['fenceType','eq',v.type],...(row.exactHeight!==undefined?[['fenceHeight','eq',row.exactHeight]]:[['fenceHeight','gt',row.minimumHeight],['fenceHeight','lte',row.maximumHeight]])];
    return {visibleWhen:[conditions],values:contract.fields.gates.values,options,gateChoices:Object.entries(options).map(([value,label])=>({value,label}))};
  });
  base.fields.gates={...base.fields.gates,values:[...new Set(choices.flatMap(v=>v.values))],choiceVariants:choices};
  base.fields.fenceRuns={...base.fields.fenceRuns,choiceVariants:choices};
  const selected=c=>{
    try{return offeringContract(type,single(resolvedFencePricing(p,c)),rules);}catch{return null;}
  };
  return {...base,required:c=>selected(c)?.required(c)||base.required(c),
    inspection:c=>positive(c.fenceHeight)&&typeof c.fenceType==='string'?fenceSelection(p,c).error||selected(c)?.inspection(c):base.inspection(c),
    crossValidate:c=>{const s=fenceSelection(p,c);return s.error&&positive(c.fenceHeight)&&typeof c.fenceType==='string'?[{field:s.field,message:s.error}]:selected(c)?.crossValidate(c)||[];}};
}

function prepRateKey(p,category,condition) {
 const key='prep'+category+'PerSqft_'+condition;
 return own(p.offeringRates,key)||condition!==p.offeringDetails?.surfaceCondition?key:'prep'+category+'PerSqft';
}
export function calculatedFencePosts(c,p) {
 return fencePostQuantities(c,p).total;
}
// Fence prices are entered for the offering's height. Any other requested height
// is priced in proportion to height (price per square foot of fence face): fence
// labor and material per foot, posts, footings and gates all scale by
// requested height / priced height. Post and footing depth follow the standard
// rule of burying a fixed fraction of the post, so they scale the same way.
// Removal of an existing fence is priced per foot as entered.
// Heights arrive as binary numbers, and a feet-and-inches entry (feet + inches/12)
// is usually not exactly representable (5 ft 3.65 in = 63.65/12 ft). Recover the
// exact value that was entered: the first scale 12 x 10^k (inches with up to six
// decimals, which also covers decimal feet) at which the number is a whole count
// to within binary rounding. Any other number is used exactly as given.
// Fence heights are feet and inches, with inches to at most two decimal places
// (for example 5 ft 3.65 in). Anything finer is refused with this message rather
// than silently rounded; no real fence is measured that finely.
export const FENCE_HEIGHT_PRECISION_MESSAGE='Enter inches with no more than 2 decimal places, for example 5 ft 3.65 in.';
export function fenceHeightWithinPrecision(feet){
  return fenceHeightPrecision(feet);
}
// Exact decimal text of a rational that terminates within maxDigits, else null.
function decimalText(numerator,denominator,maxDigits=6){
  for(let k=0;k<=maxDigits;k++){
    const scaled=numerator*10n**BigInt(k);
    if(scaled%denominator!==0n)continue;
    const digits=(scaled/denominator).toString().padStart(k+1,'0');
    return k?(digits.slice(0,-k)+'.'+digits.slice(-k)).replace(/\.?0+$/,''):digits;
  }
  return null;
}
// Whole feet and exact decimal inches of a height, never "12 in".
export function fenceHeightParts(feet){
  const inches=exactMultiply(exactFenceHeight(feet),12),whole=inches.numerator/(inches.denominator*12n);
  const rest=decimalText(inches.numerator-whole*12n*inches.denominator,inches.denominator);
  if(rest!==null)return {feet:String(whole),inches:rest};
  let w=Math.floor(feet),i=Math.round((feet-w)*1200)/100;if(i>=12){w+=1;i=0;}
  return {feet:String(w),inches:String(i)};
}
// Shows a height the way it was entered: "6 ft", "5 ft 3.65 in", "9 in".
export function formatFenceHeight(feet){
  const {feet:whole,inches}=fenceHeightParts(feet);
  return inches==='0'?whole+' ft':(whole!=='0'?whole+' ft ':'')+inches+' in';
}
export function offeringLines(type,c,p) {
  const d=p.offeringDetails||{},installed=p.offeringMode==='installed',definitions=offeringRateDefinitions(type,p),lines=[];
  const add=(key,quantity,derivation,multipliers)=>{const def=definitions[key];lines.push({key,quantity,...def,ratePath:'offeringRates.'+key,rateCents:p.offeringRates?.[key],...(derivation?{derivation}:{}),...(multipliers?.length?{multipliers}:{})});};
  const coated=(key,area,coats)=>add(key,exactMultiply(area,coats),{formula:'measuredAreaSqft * definedCoats',inputs:{measuredAreaSqft:exactToNumber(exactDecimal(area)),definedCoats:coats}});
  const labor=(key,area,coats,ratio)=>{
    for(const part of coatLaborParts(area,coats,p.paintingSettings?.[ratio],'paintingSettings.'+ratio)){
      add(key,part.quantity,undefined,part.multipliers);
      lines.at(-1).label+=part.suffix;
    }
  };
  if(fence(type)) {
    if(installed)add('installedFencePerLF',c.linearFeet);
    else {
      add('fenceLaborPerLF',c.linearFeet);add('fenceMaterialPerLF',c.linearFeet);
      const posts=fencePostQuantities(c,p),split=Object.keys(FENCE_POST_RATES).some(key=>own(p.offeringRates,key));
      const keys=split?Object.keys(FENCE_POST_RATES):['postMaterialEach','footingLaborEach','footingMaterialEach'];
      const combined=new Set(),pairs=[['terminalPostMaterialEach','linePostMaterialEach','postMaterialEach'],['terminalFootingLaborEach','lineFootingLaborEach','footingLaborEach'],['terminalFootingMaterialEach','lineFootingMaterialEach','footingMaterialEach']];
      for(const key of keys){
        if(combined.has(key))continue;
        let quantity=split?(key.startsWith('terminal')?posts.terminal:posts.line):posts.total;
        const pair=split&&pairs.find(([terminal])=>terminal===key);
        const equal=pair&&posts.terminal>0&&posts.line>0&&typeof p.offeringRates?.[key]==='number'&&p.offeringRates[key]>0&&p.offeringRates[key]===p.offeringRates[pair[1]];
        if(equal){quantity=posts.total;combined.add(pair[1]);}
        const totalFormula=posts.method==='sections'?'sum(ceil(section / spacing)) + gates + open runs - included gate posts':'ceil(total length / spacing) + 1 + corners + separate gate posts + 2 * (runs - 1)';
        const formula=!split||equal?totalFormula:key.startsWith('terminal')?(posts.method==='sections'?'2 * open runs + corners + 2 * gates without included posts':'2 * runs + corners + 2 * gates without included posts'):(posts.method==='sections'?'sum(ceil(section / spacing) - 1)':'ceil(total length / spacing) - 1');
        if(quantity>0){
          add(key,quantity,{formula,inputs:{...posts.inputs,postSpacingLF:p.postSpacingLF,terminal:posts.terminal,line:posts.line}});
          // Identical prices share one rounding boundary, preserving the exact
          // cents of an existing single-post price after explicit migration.
          if(equal)Object.assign(lines.at(-1),{label:definitions[pair[2]].label,unit:'calculated posts',contributingRatePaths:pair.slice(0,2).map(k=>'offeringRates.'+k)});
        }
      }
    }
    if(record(c.gates))for(const [key,count] of Object.entries(c.gates))if(count>0)add('gate_'+key,count);
    if(c.oldFenceRemoval===true)add('removalPerLF',c.removalLengthLF);
  } else {
    const area=c._surfaceGeometry?.labor??c[type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft'],ceilingArea=c._surfaceGeometry?.ceiling??c.ceilingAreaSqft;
    const paintArea=c._surfaceGeometry?.paint??area;
    const groups=c._surfaceGeometry?.groups||[{area,ceiling:c.ceilingAreaSqft,height:c.wallHeight}];
    const heightLines=(key,quantity,coats,ratio,height)=>{
      const at=lines.length;labor(key,quantity,coats,ratio);
      if(type==='INTERIOR_PAINTING')for(const line of lines.slice(at))line.multipliers=[...(line.multipliers||[]),{name:'Wall-height labor',path:'wallHeightLaborMultiplier.'+height,value:p.wallHeightLaborMultiplier[height]}];
    };
    if(installed){for(const group of groups){add('installedWallPerSqft',group.area);if(type==='INTERIOR_PAINTING')lines.at(-1).surfaceHeightBand=group.height;}}
    else {
      for(const group of groups)heightLines('wallLaborPerSqftPerCoat',group.area,c.coats,'wallAdditionalCoatRatio',group.height);
      coated('wallMaterialPerSqftPerCoat',paintArea,c.coats);
      if(d.primerCoats>0){for(const group of groups)heightLines('primerLaborPerSqftPerCoat',group.area,d.primerCoats,'primerAdditionalCoatRatio',group.height);coated('primerMaterialPerSqftPerCoat',paintArea,d.primerCoats);}
      for(const category of ['Labor','Material']){
        if(category==='Labor'&&type==='INTERIOR_PAINTING'&&groups.length>1){
          for(const group of groups){
            const same=!c.ceilingsIncluded||c.ceilingSurfaceCondition===undefined||c.ceilingSurfaceCondition===c.surfaceCondition;
            const multiplier=[{name:'Wall-height labor',path:'wallHeightLaborMultiplier.'+group.height,value:p.wallHeightLaborMultiplier[group.height]}];
            add(prepRateKey(p,category,c.surfaceCondition),exactAdd(group.area,same&&c.ceilingsIncluded?group.ceiling:0),undefined,multiplier);
            if(!same)add(prepRateKey(p,category,c.ceilingSurfaceCondition),group.ceiling,undefined,multiplier);
          }
          continue;
        }
        if(c.ceilingsIncluded&&c.ceilingSurfaceCondition!==undefined&&c.ceilingSurfaceCondition!==c.surfaceCondition){
          add(prepRateKey(p,category,c.surfaceCondition),area);
          add(prepRateKey(p,category,c.ceilingSurfaceCondition),ceilingArea);lines.at(-1).label+=' — ceilings';
        }else add(prepRateKey(p,category,c.surfaceCondition),exactAdd(area,c.ceilingsIncluded?ceilingArea:0),{formula:'measured walls + selected measured ceilings',inputs:{wallArea:exactToNumber(exactDecimal(area)),ceilingArea:c.ceilingsIncluded?exactToNumber(exactDecimal(ceilingArea)):0,surfaceCondition:c.surfaceCondition}});
      }
    }
    if(c.ceilingsIncluded) {
      if(installed){for(const group of groups){add('installedCeilingPerSqft',group.ceiling);lines.at(-1).surfaceHeightBand=group.height;}}
      else {
        for(const group of groups)heightLines('ceilingLaborPerSqftPerCoat',group.ceiling,c.ceilingCoats??c.coats,'ceilingAdditionalCoatRatio',group.height);
        coated('ceilingMaterialPerSqftPerCoat',ceilingArea,c.ceilingCoats??c.coats);
        if(d.ceilingPrimerCoats>0){for(const group of groups)heightLines('ceilingPrimerLaborPerSqftPerCoat',group.ceiling,d.ceilingPrimerCoats,'ceilingPrimerAdditionalCoatRatio',group.height);coated('ceilingPrimerMaterialPerSqftPerCoat',ceilingArea,d.ceilingPrimerCoats);}
      }
    }
    if(c.trimIncluded){
      if(!installed&&trimComponentPricing(p)){
        const trim=(key,quantity,category,multipliers=[],suffix='')=>lines.push({key,label:PAINTING_RATES[key]+suffix,quantity,category,unit:'trim linear-foot coats',ratePath:'paintingRates.'+key,rateCents:p.paintingRates[key],multipliers});
        for(const part of coatLaborParts(c.trimLengthLF,c.trimCoats??1,p.paintingSettings?.trimAdditionalCoatRatio,'paintingSettings.trimAdditionalCoatRatio'))trim('trimLaborPerLFPerCoat',part.quantity,'labor',part.multipliers,part.suffix);
        trim('trimMaterialPerLFPerCoat',exactMultiply(c.trimLengthLF,c.trimCoats??1),'material');
        if(trimPreparationNeeded(c,p))for(const category of ['Labor','Material'])trim('trimPrep'+category+'PerLF_'+c.trimSurfaceCondition,c.trimLengthLF,category==='Labor'?'prep':'material');
        if(p.paintingSettings?.trimPrimerCoats>0){
          for(const part of coatLaborParts(c.trimLengthLF,p.paintingSettings.trimPrimerCoats,p.paintingSettings.trimPrimerAdditionalCoatRatio,'paintingSettings.trimPrimerAdditionalCoatRatio'))trim('trimPrimerLaborPerLFPerCoat',part.quantity,'labor',part.multipliers);
          trim('trimPrimerMaterialPerLFPerCoat',exactMultiply(c.trimLengthLF,p.paintingSettings.trimPrimerCoats),'material');
        }
      }else add('installedTrimPerLF',c.trimLengthLF);
    }
  }
  return lines;
}

export function offeringRequirements(type,c,p) {
  // Quantity construction can be incomplete while diagnosing missing customer
  // facts. Required price paths are selected independently from arithmetic.
  const d=p.offeringDetails||{}, definitions=offeringRateDefinitions(type,p), names=Object.keys(definitions).filter(key=>{
    if(fence(type)&&(['postMaterialEach','footingLaborEach','footingMaterialEach'].includes(key)||own(FENCE_POST_RATES,key))){
      const split=Object.keys(FENCE_POST_RATES).some(name=>own(p.offeringRates,name));
      if(split!==own(FENCE_POST_RATES,key))return false;
      if(split&&c.linearFeet!==undefined)try{const n=fencePostQuantities(c,p);return key.startsWith('terminal')?n.terminal>0:n.line>0;}catch{}
    }
    if(key.startsWith('gate_'))return c.gates?.[key.slice(5)]>0;
    if(key==='removalPerLF')return c.oldFenceRemoval===true;
    if(/^(?:installedCeiling|ceiling)/.test(key))return c.ceilingsIncluded===true;
    if(key==='installedTrimPerLF')return c.trimIncluded===true&&!(p.offeringMode==='itemized'&&trimComponentPricing(p));
    if(key.startsWith('prepLabor'))return key===prepRateKey(p,'Labor',c.surfaceCondition)||c.ceilingsIncluded&&key===prepRateKey(p,'Labor',c.ceilingSurfaceCondition??c.surfaceCondition);
    if(key.startsWith('prepMaterial'))return key===prepRateKey(p,'Material',c.surfaceCondition)||c.ceilingsIncluded&&key===prepRateKey(p,'Material',c.ceilingSurfaceCondition??c.surfaceCondition);
    return true;
  });
  return [{path:'minimumJob',label:'Minimum job price',kind:'minimum'},...names.map(key=>({path:'offeringRates.'+key,label:definitions[key].label,kind:definitions[key].moneyKind==='fixed_amount'?'non_negative_money':'non_negative_number'}))];
}

export function offeringDisclosures(type,p,c) {
  const d=p.offeringDetails||{}, out=[d.description];
  if(fence(type)) {
    out.push('Standard posts and footings: '+d.postFootingDescription,'Fence length excludes gate openings.');
    if(c.fenceRuns===undefined)out.push('Post quantities use the total-length allowance for '+(c.fenceRunCount??1)+' separate fence run(s).');
    for(const [key,count] of Object.entries(c.gates||{}))if(count>0){const g=d.gates[key];out.push(`${count} ${g.widthLF} ft gate(s): ${g.description}${/[.!?]$/.test(g.description.trim())?'':'.'} Gate posts and footings ${g.postsAndFootingsIncluded?'included in the gate price':'included in the calculated post total'}.`);}
    if(c.oldFenceRemoval)out.push('Removal: '+d.removalDescription+(d.removalIncludesDisposal?' Disposal is included.':' Disposal is not included in the removal price.'));
  } else {
    out.push('Surface and coating: '+d.substrate+'; '+d.coating,`${p.offeringMode==='itemized'?c.coats:d.finishCoats} wall finish coat(s); ${d.primerCoats} wall primer coat(s).`,'Preparation: '+d.preparation);
    if(c.ceilingsIncluded)out.push(`${p.offeringMode==='itemized'?(c.ceilingCoats??c.coats):d.ceilingCoats} ceiling finish coat(s); ${d.ceilingPrimerCoats} ceiling primer coat(s).`);
    if(c.trimIncluded)out.push('Trim: '+d.trimDescription);
  }
  return out.filter(text);
}

export function offeringActivationScenarios(type,p,rules={}) {
  if(fence(type)&&fenceHasRows(p))return fenceCatalogVariants(p,rules.tiers).flatMap(v=>{
    const {fenceOfferings,heightRows,...single}=v.pricing;
    return offeringActivationScenarios(type,single,rules).map(c=>({...c,fenceHeight:v.height,fenceRunCount:1}));
  });
  const d=p.offeringDetails||{};
  if(fence(type)) {
    const base={linearFeet:100,lfMethod:'exact',fenceType:d.fenceType,fenceHeight:d.fenceHeight,terrainSlope:'flat',gates:{},cornerCount:0,...(type==='FENCING_REPLACEMENT'?{oldFenceRemoval:false}:{})};
    const confirmedGates=offeringGateDefinitions(p,rules);
    return [base,...Object.keys(d.gates||{}).filter(key=>own(p.offeringRates,'gate_'+key)&&positive(d.gates[key]?.widthLF)&&positive(confirmedGates[key]?.widthLF)&&exactCompare(d.gates[key].widthLF,confirmedGates[key].widthLF)===0).map(key=>({...base,gates:{[key]:1}})),...(d.removalOffered&&own(p.offeringRates,'removalPerLF')?[{...base,oldFenceRemoval:true,removalLengthLF:50}]:[])];
  }
  const interior=type==='INTERIOR_PAINTING';
  const base={areaInputMethod:'wall_sqft',[interior?'wallAreaSqft':'exteriorAreaSqft']:500,coats:p.offeringMode==='itemized'?2:d.finishCoats,surfaceCondition:d.surfaceCondition||['good','fair','poor'].find(condition=>own(p.offeringRates,prepRateKey(p,'Labor',condition))),...(interior?{wallHeight:'standard',wallScopeUniform:true,ceilingsIncluded:false,trimIncluded:false}:{stories:1})};
  const scopes=[base,...(d.ceilingsOffered?[{...base,ceilingsIncluded:true,ceilingAreaSqft:100}]:[]),...(d.trimOffered?[{...base,trimIncluded:true,trimLengthLF:100}]:[])];
  return p.offeringMode==='itemized'?['good','fair','poor'].flatMap(surfaceCondition=>scopes.map(scope=>({...scope,surfaceCondition}))):scopes;
}
