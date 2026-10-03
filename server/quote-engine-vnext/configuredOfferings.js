import {exactAdd, exactCompare, exactMultiply, exactDivide, exactDecimal} from './exactMath.js';

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
export const configuredOffering = (type,p) => OFFERING_TYPES.includes(type) && OFFERING_FIELDS.some(k=>own(p,k));
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

export function offeringRateDefinitions(type,p={}) {
  const installed=p.offeringMode==='installed', d=p.offeringDetails||{}, out={};
  const add=(key,label,category,unit,priceBasis)=>out[key]={label,category,unit,...(priceBasis?{priceBasis}:{})};
  if(fence(type)) {
    if(installed)add('installedFencePerLF','Installed fence including standard posts and footings','addon','fence linear feet','sell_price');
    else {
      add('fenceLaborPerLF','Fence infill installation labor','labor','fence linear feet');
      add('fenceMaterialPerLF','Fence infill materials','material','fence linear feet');
      add('postMaterialEach','Separately priced post materials','material','calculated posts');
      add('footingLaborEach','Post-hole and footing labor','labor','calculated posts');
      add('footingMaterialEach','Footing materials','material','calculated posts');
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
      else if(!rate(value))add('offeringRates.'+key,'Enter a finite non-negative unit rate in cents.');
    }
  }
  return errors;
}

export function offeringContract(type,p) {
  const d=p.offeringDetails||{}, installed=p.offeringMode==='installed';
  const fields={permitRequired:bool('Permit required for this measured project')};
  if(fence(type))Object.assign(fields,{
    linearFeet:number('Measured fence length excluding gate openings','linear feet',1),
    lfMethod:choice('Fence measurement method',['exact','assumption']),
    fenceType:{label:'Fence type',type:'slug',unit:null},fenceHeight:number('Fence height','feet',Number.MIN_VALUE,Number.MAX_VALUE),
    terrainSlope:choice('Terrain slope',['flat','moderate','steep']),
    gates:{label:'Gates by measured opening width',type:'offering_counts',unit:'gates',values:record(d.gates)?Object.keys(d.gates):[],options:record(d.gates)?Object.fromEntries(Object.entries(d.gates).map(([k,v])=>[k,`${k.replaceAll('_',' ')} — ${typeof v?.widthLF==='number'?v.widthLF:'undefined'} ft opening; ${typeof v?.description==='string'?v.description:''}`])):{}},
    confirmedFacts:{label:'Affirmatively identified owner offerings',type:'confirmed_facts',unit:null},
    cornerCount:number('Fence corners','corners',0,1_000_000,{integer:true}),
    ...(type==='FENCING_REPLACEMENT'?{oldFenceRemoval:bool('Old fence removal included'),removalLengthLF:number('Measured old fence length to remove','linear feet',0.1)}:{})
  });
  else Object.assign(fields,{
    areaInputMethod:choice('Wall area measurement method',['wall_sqft','homesize']),
    [type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft']:number('Measured paintable wall area','square feet',1,2_000_000),
    coats:number(installed?'Finish paint coats':'Finish coats on walls and selected ceilings','coats',1,3,{integer:true}),surfaceCondition:choice('Surface condition',['good','fair','poor']),
    ...(type==='INTERIOR_PAINTING'?{wallHeight:choice('Wall height',['standard','high','vaulted']),wallScopeUniform:bool('All wall area shares the confirmed height, access, and finish-coat count'),ceilingsIncluded:bool('Ceiling painting included'),ceilingAreaSqft:number('Measured ceiling area','square feet',1,2_000_000),trimIncluded:bool('Trim painting included'),trimLengthLF:number('Measured trim length','linear feet',0.1)}:{stories:choice('Building stories',[1,2,3])})
  });
  return {fields,required:c=>{
    if(fence(type))return ['linearFeet','lfMethod','fenceType','fenceHeight','terrainSlope','gates','cornerCount',...(type==='FENCING_REPLACEMENT'?['oldFenceRemoval',...(c.oldFenceRemoval?['removalLengthLF']:[])]:[])];
    return ['areaInputMethod',type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft','coats','surfaceCondition',...(type==='INTERIOR_PAINTING'?['wallHeight','wallScopeUniform','ceilingsIncluded','trimIncluded',...(c.ceilingsIncluded?['ceilingAreaSqft']:[]),...(c.trimIncluded?['trimLengthLF']:[])]:['stories'])];
  },inspection:c=>fence(type)?c.lfMethod!=='exact'?'Measured fence length is required.':null:c.areaInputMethod!=='wall_sqft'?'Measured paintable wall area is required.':null,
  crossValidate:c=>{
    const errors=[],bad=(field,message)=>errors.push({field,message});
    const equal=(field,expected)=>{if(c[field]!==undefined&&c[field]!==expected)bad(field,'This detail does not match the selected owner offering.');};
    if(fence(type)) {
      // Any positive height is quotable (owner ruling, Oct 3): only the fence type must match.
      equal('fenceType',d.fenceType);
      if(c.oldFenceRemoval===true&&!d.removalOffered)bad('oldFenceRemoval','Removal is not included in this offering.');
      if(c.oldFenceRemoval===false&&c.removalLengthLF!==undefined)bad('removalLengthLF','Removal length cannot be supplied when removal is excluded.');
    } else {
      if(installed){equal('coats',d.finishCoats);equal('surfaceCondition',d.surfaceCondition);}
      if(c.wallScopeUniform===false)bad('wallScopeUniform','Price differing wall zones as their separate measured offerings.');
      if(c.ceilingsIncluded===true&&!d.ceilingsOffered)bad('ceilingsIncluded','Ceilings are not offered in this configuration.');
      if(c.trimIncluded===true&&!d.trimOffered)bad('trimIncluded','Trim is not offered in this configuration.');
      if(c.ceilingsIncluded===false&&c.ceilingAreaSqft!==undefined)bad('ceilingAreaSqft','Ceiling area cannot be supplied when ceilings are excluded.');
      if(c.trimIncluded===false&&c.trimLengthLF!==undefined)bad('trimLengthLF','Trim length cannot be supplied when trim is excluded.');

    }
    return errors;
  }};
}

function prepRateKey(p,category,condition) {
 const key='prep'+category+'PerSqft_'+condition;
 return own(p.offeringRates,key)||condition!==p.offeringDetails?.surfaceCondition?key:'prep'+category+'PerSqft';
}
export function calculatedFencePosts(c,p) {
 const ratio=exactDecimal(exactDivide(c.linearFeet,p.postSpacingLF));
 const spans=(ratio.numerator+ratio.denominator-1n)/ratio.denominator;
 const gatePosts=Object.entries(c.gates||{}).reduce((sum,[key,count])=>sum+(p.offeringDetails.gates[key]?.postsAndFootingsIncluded?0:count*2),0);
 const count=Number(spans)+1+c.cornerCount+gatePosts;
 if(!Number.isSafeInteger(count)||count<1)throw new RangeError('Fence post quantity is outside the supported range.');
 return count;
}
// Fence prices are entered for the offering's height. Any other requested height
// is priced in proportion to height (price per square foot of fence face): fence
// labor and material per foot, posts, footings and gates all scale by
// requested height / priced height. Post and footing depth follow the standard
// rule of burying a fixed fraction of the post, so they scale the same way.
// Removal of an existing fence is priced per foot as entered.
export function fenceHeightFactor(c,d){
  const ratio=exactDivide(c.fenceHeight,d.fenceHeight);
  return exactCompare(ratio,1)===0?null:ratio;
}
export function formatFenceHeight(feet){
  let whole=Math.floor(feet),inches=Math.round((feet-whole)*1200)/100;
  if(inches>=12){whole+=1;inches=0;}
  return inches?(whole?whole+' ft ':'')+inches+' in':whole+' ft';
}
export function offeringLines(type,c,p) {
  const d=p.offeringDetails||{},installed=p.offeringMode==='installed',definitions=offeringRateDefinitions(type,p),lines=[];
  const add=(key,quantity,derivation,multipliers)=>{const def=definitions[key];lines.push({key,quantity,...def,ratePath:'offeringRates.'+key,rateCents:p.offeringRates?.[key],...(derivation?{derivation}:{}),...(multipliers?.length?{multipliers}:{})});};
  const coated=(key,area,coats)=>add(key,exactMultiply(area,coats),{formula:'measuredAreaSqft * definedCoats',inputs:{measuredAreaSqft:area,definedCoats:coats}});
  if(fence(type)) {
    const factor=fenceHeightFactor(c,d),height=factor?[{name:'Fence height adjustment (requested height / priced height)',path:'offeringDetails.fenceHeight',value:factor}]:[];
    if(installed)add('installedFencePerLF',c.linearFeet,undefined,height);
    else {add('fenceLaborPerLF',c.linearFeet,undefined,height);add('fenceMaterialPerLF',c.linearFeet,undefined,height);for(const key of ['postMaterialEach','footingLaborEach','footingMaterialEach'])add(key,calculatedFencePosts(c,p),{formula:'ceil(fence length excluding gates / owner spacing) + 1 end + corners + gate posts not included in gate prices',inputs:{linearFeet:c.linearFeet,postSpacingLF:p.postSpacingLF,cornerCount:c.cornerCount,gates:c.gates}},height);}
    if(record(c.gates))for(const [key,count] of Object.entries(c.gates))if(count>0)add('gate_'+key,count,undefined,height);
    if(c.oldFenceRemoval===true)add('removalPerLF',c.removalLengthLF);
  } else {
    const area=c[type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft'];
    if(installed)add('installedWallPerSqft',area);
    else {
      for(const key of ['wallLaborPerSqftPerCoat','wallMaterialPerSqftPerCoat'])coated(key,area,c.coats);
      if(d.primerCoats>0)for(const key of ['primerLaborPerSqftPerCoat','primerMaterialPerSqftPerCoat'])coated(key,area,d.primerCoats);
      for(const category of ['Labor','Material'])add(prepRateKey(p,category,c.surfaceCondition),exactAdd(area,c.ceilingsIncluded?c.ceilingAreaSqft:0),{formula:'measured walls + selected measured ceilings',inputs:{wallArea:area,ceilingArea:c.ceilingsIncluded?c.ceilingAreaSqft:0,surfaceCondition:c.surfaceCondition}});
    }
    if(c.ceilingsIncluded) {
      if(installed)add('installedCeilingPerSqft',c.ceilingAreaSqft);
      else {
        for(const key of ['ceilingLaborPerSqftPerCoat','ceilingMaterialPerSqftPerCoat'])coated(key,c.ceilingAreaSqft,c.coats);
        if(d.ceilingPrimerCoats>0)for(const key of ['ceilingPrimerLaborPerSqftPerCoat','ceilingPrimerMaterialPerSqftPerCoat'])coated(key,c.ceilingAreaSqft,d.ceilingPrimerCoats);
      }
    }
    if(c.trimIncluded)add('installedTrimPerLF',c.trimLengthLF);
  }
  return lines;
}

export function offeringRequirements(type,c,p) {
  // Quantity construction can be incomplete while diagnosing missing customer
  // facts. Required price paths are selected independently from arithmetic.
  const d=p.offeringDetails||{}, definitions=offeringRateDefinitions(type,p), names=Object.keys(definitions).filter(key=>{
    if(key.startsWith('gate_'))return c.gates?.[key.slice(5)]>0;
    if(key==='removalPerLF')return c.oldFenceRemoval===true;
    if(/^(?:installedCeiling|ceiling)/.test(key))return c.ceilingsIncluded===true;
    if(key==='installedTrimPerLF')return c.trimIncluded===true;
    if(key.startsWith('prepLabor'))return key===prepRateKey(p,'Labor',c.surfaceCondition);
    if(key.startsWith('prepMaterial'))return key===prepRateKey(p,'Material',c.surfaceCondition);
    return true;
  });
  return [{path:'minimumJob',label:'Minimum job price',kind:'minimum'},...names.map(key=>({path:'offeringRates.'+key,label:definitions[key].label,kind:'non_negative_number'}))];
}

export function offeringDisclosures(type,p,c) {
  const d=p.offeringDetails||{}, out=[d.description];
  if(fence(type)) {
    out.push('Standard posts and footings: '+d.postFootingDescription,'Fence length excludes gate openings.');
    if(fenceHeightFactor(c,d))out.push(`Priced from this business's ${formatFenceHeight(d.fenceHeight)} fence prices, scaled to the requested ${formatFenceHeight(c.fenceHeight)} height.`);
    for(const [key,count] of Object.entries(c.gates||{}))if(count>0){const g=d.gates[key];out.push(`${count} ${g.widthLF} ft gate(s): ${g.description}${/[.!?]$/.test(g.description.trim())?'':'.'} Gate posts and footings ${g.postsAndFootingsIncluded?'included in the gate price':'included in the calculated post total'}.`);}
    if(c.oldFenceRemoval)out.push('Removal: '+d.removalDescription+(d.removalIncludesDisposal?' Disposal is included.':' Disposal is not included in the removal price.'));
  } else {
    out.push('Surface and coating: '+d.substrate+'; '+d.coating,`${p.offeringMode==='itemized'?c.coats:d.finishCoats} wall finish coat(s); ${d.primerCoats} wall primer coat(s).`,'Preparation: '+d.preparation);
    if(c.ceilingsIncluded)out.push(`${p.offeringMode==='itemized'?c.coats:d.ceilingCoats} ceiling finish coat(s); ${d.ceilingPrimerCoats} ceiling primer coat(s).`);
    if(c.trimIncluded)out.push('Trim: '+d.trimDescription);
  }
  return out.filter(text);
}

export function offeringActivationScenarios(type,p) {
  const d=p.offeringDetails||{};
  if(fence(type)) {
    const base={linearFeet:100,lfMethod:'exact',fenceType:d.fenceType,fenceHeight:d.fenceHeight,terrainSlope:d.terrainSlope??'flat',gates:{},cornerCount:0,...(type==='FENCING_REPLACEMENT'?{oldFenceRemoval:false}:{})};
    return [base,...Object.keys(d.gates||{}).filter(key=>own(p.offeringRates,'gate_'+key)).map(key=>({...base,gates:{[key]:1}})),...(d.removalOffered&&own(p.offeringRates,'removalPerLF')?[{...base,oldFenceRemoval:true,removalLengthLF:50}]:[])];
  }
  const interior=type==='INTERIOR_PAINTING';
  const base={areaInputMethod:'wall_sqft',[interior?'wallAreaSqft':'exteriorAreaSqft']:500,coats:p.offeringMode==='itemized'?2:d.finishCoats,surfaceCondition:d.surfaceCondition||['good','fair','poor'].find(condition=>own(p.offeringRates,prepRateKey(p,'Labor',condition))),...(interior?{wallHeight:d.wallHeight??'standard',wallScopeUniform:true,ceilingsIncluded:false,trimIncluded:false}:{stories:d.stories??1})};
  const scopes=[base,...(d.ceilingsOffered?[{...base,ceilingsIncluded:true,ceilingAreaSqft:100}]:[]),...(d.trimOffered?[{...base,trimIncluded:true,trimLengthLF:100}]:[])];
  return p.offeringMode==='itemized'?['good','fair','poor'].flatMap(surfaceCondition=>scopes.map(scope=>({...scope,surfaceCondition}))):scopes;
}
