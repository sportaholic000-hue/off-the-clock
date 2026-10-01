import {exactAdd, exactCompare, exactMultiply} from './exactMath.js';

// Opt-in owner offerings. Existing pricing fields retain their original meaning.
// Rates contain money only; details contain scope and units only. Approval of the
// complete saved service binds both. Nothing here estimates a physical quantity.
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

export function offeringRateDefinitions(type,p={}) {
  const installed=p.offeringMode==='installed', d=p.offeringDetails||{}, out={};
  const add=(key,label,category,unit,priceBasis)=>out[key]={label,category,unit,...(priceBasis?{priceBasis}:{})};
  if(fence(type)) {
    if(installed)add('installedFencePerLF','Installed fence including standard posts and footings','addon','fence linear feet','sell_price');
    else {
      add('fenceLaborPerLF','Fence infill installation labor','labor','fence linear feet');
      add('fenceMaterialPerLF','Fence infill materials','material','fence linear feet');
      add('postMaterialEach','Separately priced post materials','material','confirmed planned posts');
      add('footingLaborEach','Post-hole and footing labor','labor','confirmed planned posts');
      add('footingMaterialEach','Footing materials','material','confirmed planned posts');
    }
    if(record(d.gates))for(const key of Object.keys(d.gates))if(slug(key))add('gate_'+key,'Installed gate: '+key.replaceAll('_',' '),'addon','gates','sell_price');
    if(type==='FENCING_REPLACEMENT'&&d.removalOffered===true)add('removalPerLF','Fence removal','addon','removed fence linear feet','sell_price');
  } else {
    if(installed)add('installedWallPerSqft','Painting including the defined coats, preparation and primer','addon','paintable wall square feet','sell_price');
    else {
      add('wallLaborPerSqftPerCoat','Wall finish labor','labor','wall square-foot coats');
      add('wallMaterialPerSqftPerCoat','Wall finish materials','material','wall square-foot coats');
      add('prepLaborPerSqft','Measured preparation labor','prep','affected square feet');
      add('prepMaterialPerSqft','Measured preparation materials','material','affected square feet');
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
  if(fence(type)) {
    check('fenceType',slug,'Identify the offered fence material/style.');
    check('fenceHeight',v=>typeof v==='number'&&Number.isFinite(v)&&v>0,'Enter the positive height in feet covered by these prices.');
    check('terrainSlope',v=>['flat','moderate','steep'].includes(v),'Choose the terrain covered by these prices.');
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
    check('finishCoats',v=>integer(v,1,3),'Define one, two or three finish coats.');
    check('surfaceCondition',v=>['good','fair','poor'].includes(v),'Choose the surface condition covered.');
    check('preparation',text,'Define the preparation included or separately measured.');
    check('primerCoats',v=>integer(v,0,3),'Explicitly define the primer coats, including zero when excluded.');
    if(type==='INTERIOR_PAINTING') {
      check('wallHeight',v=>['standard','high','vaulted'].includes(v),'Choose the wall-height category covered.');
      check('ceilingsOffered',v=>typeof v==='boolean','State whether ceiling painting is offered.');
      check('trimOffered',v=>typeof v==='boolean','State whether trim painting is offered.');
      if(d.ceilingsOffered){check('ceilingCoats',v=>integer(v,1,3),'Define ceiling finish coats.');check('ceilingPrimerCoats',v=>integer(v,0,3),'Define ceiling primer coats.');}
      if(d.trimOffered)check('trimDescription',text,'Define the trim preparation, finish coats and primer included.');
    } else check('stories',v=>[1,2,3].includes(v),'Choose the building stories covered by these prices.');
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
    ...(!installed?{postCount:number('Confirmed planned posts not included in selected gate prices','posts',1,1_000_000,{integer:true})}:{}),
    ...(type==='FENCING_REPLACEMENT'?{oldFenceRemoval:bool('Old fence removal included'),removalLengthLF:number('Measured old fence length to remove','linear feet',0.1)}:{})
  });
  else Object.assign(fields,{
    areaInputMethod:choice('Wall area measurement method',['wall_sqft','homesize']),
    [type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft']:number('Measured paintable wall area','square feet',1,2_000_000),
    coats:number('Finish paint coats','coats',1,3,{integer:true}),surfaceCondition:choice('Surface condition',['good','fair','poor']),
    ...(type==='INTERIOR_PAINTING'?{wallHeight:choice('Wall height',['standard','high','vaulted']),wallScopeUniform:bool('All wall area shares the confirmed height, access, and finish-coat count'),ceilingsIncluded:bool('Ceiling painting included'),ceilingAreaSqft:number('Measured ceiling area','square feet',1,2_000_000),trimIncluded:bool('Trim painting included'),trimLengthLF:number('Measured trim length','linear feet',0.1)}:{stories:choice('Building stories',[1,2,3])}),
    ...(!installed?{prepAreaSqft:number('Measured area requiring the defined preparation, including selected ceilings','square feet',0,4_000_000)}:{})
  });
  return {fields,required:c=>{
    if(fence(type))return ['linearFeet','lfMethod','fenceType','fenceHeight','terrainSlope','gates',...(!installed?['postCount']:[]),...(type==='FENCING_REPLACEMENT'?['oldFenceRemoval',...(c.oldFenceRemoval?['removalLengthLF']:[])]:[])];
    return ['areaInputMethod',type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft','coats','surfaceCondition',...(!installed?['prepAreaSqft']:[]),...(type==='INTERIOR_PAINTING'?['wallHeight','wallScopeUniform','ceilingsIncluded','trimIncluded',...(c.ceilingsIncluded?['ceilingAreaSqft']:[]),...(c.trimIncluded?['trimLengthLF']:[])]:['stories'])];
  },inspection:c=>fence(type)?c.lfMethod!=='exact'?'Measured fence length is required.':null:c.areaInputMethod!=='wall_sqft'?'Measured paintable wall area is required.':null,
  crossValidate:c=>{
    const errors=[],bad=(field,message)=>errors.push({field,message});
    const equal=(field,expected)=>{if(c[field]!==undefined&&c[field]!==expected)bad(field,'This detail does not match the selected owner offering.');};
    if(fence(type)) {
      for(const key of ['fenceType','fenceHeight','terrainSlope'])equal(key,d[key]);
      if(c.oldFenceRemoval===true&&!d.removalOffered)bad('oldFenceRemoval','Removal is not included in this offering.');
      if(c.oldFenceRemoval===false&&c.removalLengthLF!==undefined)bad('removalLengthLF','Removal length cannot be supplied when removal is excluded.');
    } else {
      equal('coats',d.finishCoats);equal('surfaceCondition',d.surfaceCondition);
      equal(type==='INTERIOR_PAINTING'?'wallHeight':'stories',type==='INTERIOR_PAINTING'?d.wallHeight:d.stories);
      if(c.wallScopeUniform===false)bad('wallScopeUniform','Price differing wall zones as their separate measured offerings.');
      if(c.ceilingsIncluded===true&&!d.ceilingsOffered)bad('ceilingsIncluded','Ceilings are not offered in this configuration.');
      if(c.trimIncluded===true&&!d.trimOffered)bad('trimIncluded','Trim is not offered in this configuration.');
      if(c.ceilingsIncluded===false&&c.ceilingAreaSqft!==undefined)bad('ceilingAreaSqft','Ceiling area cannot be supplied when ceilings are excluded.');
      if(c.trimIncluded===false&&c.trimLengthLF!==undefined)bad('trimLengthLF','Trim length cannot be supplied when trim is excluded.');
      const area=c[type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft'];
      if(Number.isFinite(c.prepAreaSqft)&&Number.isFinite(area)&&(!c.ceilingsIncluded||Number.isFinite(c.ceilingAreaSqft))) {
        if(exactCompare(c.prepAreaSqft,exactAdd(area,c.ceilingsIncluded?c.ceilingAreaSqft:0))>0)bad('prepAreaSqft','Preparation area exceeds the selected painted area.');
        if(d.surfaceCondition!=='good'&&c.prepAreaSqft===0)bad('prepAreaSqft','Measure the preparation required for this surface condition.');
      }
    }
    return errors;
  }};
}

export function offeringLines(type,c,p) {
  const d=p.offeringDetails||{},installed=p.offeringMode==='installed',definitions=offeringRateDefinitions(type,p),lines=[];
  const add=(key,quantity,derivation)=>{const def=definitions[key];lines.push({key,quantity,...def,ratePath:'offeringRates.'+key,rateCents:p.offeringRates?.[key],...(derivation?{derivation}:{})});};
  const coated=(key,area,coats)=>add(key,exactMultiply(area,coats),{formula:'measuredAreaSqft * definedCoats',inputs:{measuredAreaSqft:area,definedCoats:coats}});
  if(fence(type)) {
    if(installed)add('installedFencePerLF',c.linearFeet);
    else {add('fenceLaborPerLF',c.linearFeet);add('fenceMaterialPerLF',c.linearFeet);for(const key of ['postMaterialEach','footingLaborEach','footingMaterialEach'])add(key,c.postCount);}
    if(record(c.gates))for(const [key,count] of Object.entries(c.gates))if(count>0)add('gate_'+key,count);
    if(c.oldFenceRemoval===true)add('removalPerLF',c.removalLengthLF);
  } else {
    const area=c[type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft'];
    if(installed)add('installedWallPerSqft',area);
    else {
      for(const key of ['wallLaborPerSqftPerCoat','wallMaterialPerSqftPerCoat'])coated(key,area,d.finishCoats);
      if(d.primerCoats>0)for(const key of ['primerLaborPerSqftPerCoat','primerMaterialPerSqftPerCoat'])coated(key,area,d.primerCoats);
      if(c.prepAreaSqft>0)for(const key of ['prepLaborPerSqft','prepMaterialPerSqft'])add(key,c.prepAreaSqft);
    }
    if(c.ceilingsIncluded) {
      if(installed)add('installedCeilingPerSqft',c.ceilingAreaSqft);
      else {
        for(const key of ['ceilingLaborPerSqftPerCoat','ceilingMaterialPerSqftPerCoat'])coated(key,c.ceilingAreaSqft,d.ceilingCoats);
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
    if(key.startsWith('prep'))return c.prepAreaSqft>0;
    return true;
  });
  return [{path:'minimumJob',label:'Minimum job price',kind:'minimum'},...names.map(key=>({path:'offeringRates.'+key,label:definitions[key].label,kind:'non_negative_number'}))];
}

export function offeringDisclosures(type,p,c) {
  const d=p.offeringDetails||{}, out=[d.description];
  if(fence(type)) {
    out.push('Standard posts and footings: '+d.postFootingDescription,'Fence length excludes gate openings.');
    for(const [key,count] of Object.entries(c.gates||{}))if(count>0){const g=d.gates[key];out.push(`${count} ${g.widthLF} ft gate(s): ${g.description}. Gate posts and footings ${g.postsAndFootingsIncluded?'included in the gate price':'priced in the confirmed separate post quantity'}.`);}
    if(c.oldFenceRemoval)out.push('Removal: '+d.removalDescription+(d.removalIncludesDisposal?' Disposal is included.':' Disposal follows the configured fee selection.'));
  } else {
    out.push('Surface and coating: '+d.substrate+'; '+d.coating,`${d.finishCoats} wall finish coat(s); ${d.primerCoats} wall primer coat(s).`,'Preparation: '+d.preparation);
    if(c.ceilingsIncluded)out.push(`${d.ceilingCoats} ceiling finish coat(s); ${d.ceilingPrimerCoats} ceiling primer coat(s).`);
    if(c.trimIncluded)out.push('Trim: '+d.trimDescription);
  }
  return out.filter(text);
}

export function offeringActivationScenarios(type,p) {
  const d=p.offeringDetails||{};
  if(fence(type)) {
    const base={linearFeet:100,lfMethod:'exact',fenceType:d.fenceType,fenceHeight:d.fenceHeight,terrainSlope:d.terrainSlope,gates:{},...(p.offeringMode==='itemized'?{postCount:14}:{}),...(type==='FENCING_REPLACEMENT'?{oldFenceRemoval:false}:{})};
    return [base,...Object.keys(d.gates||{}).filter(key=>own(p.offeringRates,'gate_'+key)).map(key=>({...base,gates:{[key]:1}})),...(d.removalOffered&&own(p.offeringRates,'removalPerLF')?[{...base,oldFenceRemoval:true,removalLengthLF:50}]:[])];
  }
  const interior=type==='INTERIOR_PAINTING';
  const base={areaInputMethod:'wall_sqft',[interior?'wallAreaSqft':'exteriorAreaSqft']:500,coats:d.finishCoats,surfaceCondition:d.surfaceCondition,...(p.offeringMode==='itemized'?{prepAreaSqft:d.surfaceCondition==='good'?0:100}:{}),...(interior?{wallHeight:d.wallHeight,wallScopeUniform:true,ceilingsIncluded:false,trimIncluded:false}:{stories:d.stories})};
  return [base,...(d.ceilingsOffered?[{...base,ceilingsIncluded:true,ceilingAreaSqft:100}]:[]),...(d.trimOffered?[{...base,trimIncluded:true,trimLengthLF:100}]:[])];
}
