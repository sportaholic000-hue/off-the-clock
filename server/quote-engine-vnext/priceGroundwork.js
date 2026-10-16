const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.hasOwn(value||{},key);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clone=value=>structuredClone(value);

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(record(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
function signature(value){return JSON.stringify(canonical(value));}
function pathParts(path){return String(path).split('.').filter(Boolean);}
function hasPath(source,path){
  let value=source;
  for(const part of pathParts(path)){if(!record(value)||!own(value,part))return false;value=value[part];}
  return true;
}
function getPath(source,path){let value=source;for(const part of pathParts(path))value=record(value)?value[part]:undefined;return value;}
function setPath(source,path,value){
  const parts=pathParts(path);let target=source;
  for(const part of parts.slice(0,-1)){if(!record(target[part]))target[part]={};target=target[part];}
  target[parts.at(-1)]=clone(value);
}

function startingLeaves(value,prefix=''){
  if(record(value))return Object.entries(value).flatMap(([key,child])=>startingLeaves(child,prefix?prefix+'.'+key:key));
  return [{path:prefix,value}];
}

export function startingValueDefinitionsVNext(definitions={}){
  const out=[];
  for(const [field,definition] of Object.entries(record(definitions)?definitions:{})){
    if(!record(definition)||!own(definition,'startingValue'))continue;
    if(typeof definition.startingValueSource!=='string'||!definition.startingValueSource.trim()||typeof definition.startingValueAssumption!=='string'||!definition.startingValueAssumption.trim())throw new TypeError('A starting value requires owner-facing source and assumption text.');
    for(const leaf of startingLeaves(definition.startingValue)){
      if(!finite(leaf.value))throw new TypeError('Starting factor values must be finite numbers.');
      const path=leaf.path?field+'.'+leaf.path:field;
      out.push({
        path,value:leaf.value,label:definition.startingValueLabel||definition.label||path,
        source:definition.startingValueSource,assumption:definition.startingValueAssumption,
        ...(definition.startingValueGroup?{group:definition.startingValueGroup}:{}),
        definitionSignature:signature({path,value:leaf.value,source:definition.startingValueSource,assumption:definition.startingValueAssumption,label:definition.startingValueLabel||definition.label||path})
      });
    }
  }
  return out;
}

// Starting values are system-owned only while their provenance record remains.
// A pre-existing owner value has no record and is never overwritten. Changing
// a recorded value by hand retires the record, while a definition change may
// replace only the still-system-owned value and requires a new confirmation.
export function synchronizeStartingValuesVNext(service,definitions={},options={}){
  if(!record(service))throw new TypeError('A service is required.');
  const next=clone(service);next.pricing=record(next.pricing)?next.pricing:{};
  const state=record(next.startingValueState)?clone(next.startingValueState):{},adoptions=record(next.startingValueAdoptions)?clone(next.startingValueAdoptions):{};
  const confirm=new Set(options.confirmPaths||[]),ownerEntered=new Set(options.ownerEnteredPaths||[]);
  const legacyGroups=new Set(options.legacyGroups||[]),newGroups=new Set(options.newGroups||[]),adoptGroups=new Set(options.adoptGroups||[]);
  const now=typeof options.now==='string'?options.now:new Date().toISOString();
  const definitionRows=startingValueDefinitionsVNext(definitions),definitionPaths=new Set(definitionRows.map(item=>item.path));
  for(const group of new Set(definitionRows.map(item=>item.group).filter(Boolean))){
    if(!adoptions[group]&&legacyGroups.has(group))adoptions[group]={mode:'legacy',introducedAt:now};
    else if(!adoptions[group]&&newGroups.has(group))adoptions[group]={mode:'new',introducedAt:now};
  }
  for(const path of Object.keys(state))if(!definitionPaths.has(path))delete state[path];
  for(const item of definitionRows){
    const current=getPath(next.pricing,item.path),prior=state[item.path];
    if(ownerEntered.has(item.path)){
      if(!hasPath(next.pricing,item.path)||!finite(current))throw new TypeError('An owner-entered starting-value replacement must be a finite stored factor.');
      delete state[item.path];continue;
    }
    if(prior){
      if(!Object.is(current,prior.value)){delete state[item.path];continue;}
      if(prior.definitionSignature!==item.definitionSignature){
        setPath(next.pricing,item.path,item.value);
        state[item.path]={...item,confirmed:false,introducedAt:now};
      }
    }else if(!hasPath(next.pricing,item.path)){
      setPath(next.pricing,item.path,item.value);
      state[item.path]={...item,confirmed:false,introducedAt:now};
    }
    if(confirm.has(item.path)){
      const row=state[item.path];
      if(!row||row.definitionSignature!==item.definitionSignature||!Object.is(getPath(next.pricing,item.path),item.value))throw new TypeError('Only the current stored starting value can be confirmed.');
      const ownerId=options.ownerId||next.origin?.ownerId;
      if(typeof ownerId!=='string'||!ownerId.trim()||next.origin?.ownerId&&ownerId!==next.origin.ownerId)throw new TypeError('Starting-value confirmation must match the service owner.');
      state[item.path]={...row,confirmed:true,confirmedAt:now,ownerId};
    }
  }
  for(const group of adoptGroups){
    const rows=definitionRows.filter(item=>item.group===group);
    if(!rows.length)throw new TypeError('The requested starting-value group is not defined for this service.');
    const ownerId=options.ownerId||next.origin?.ownerId;
    if(typeof ownerId!=='string'||!ownerId.trim()||next.origin?.ownerId&&ownerId!==next.origin.ownerId)throw new TypeError('Starting-value adoption must match the service owner.');
    for(const item of rows){
      const row=state[item.path];
      if(row&&row.definitionSignature===item.definitionSignature&&Object.is(getPath(next.pricing,item.path),item.value))state[item.path]={...row,confirmed:true,confirmedAt:now,ownerId};
    }
    adoptions[group]={mode:'adopted',adoptedAt:now,ownerId};
  }
  if(Object.keys(state).length)next.startingValueState=state;else delete next.startingValueState;
  if(Object.keys(adoptions).length)next.startingValueAdoptions=adoptions;else delete next.startingValueAdoptions;
  return next;
}

function evidencePaths(template){
  const paths=new Set();
  const add=value=>{if(typeof value==='string'&&value)paths.add(value);};
  for(const line of template?.lineItems||[]){
    const calculation=line?.calculation||{};add(calculation.ratePath);
    for(const path of calculation.contributingRatePaths||[])add(path);
    for(const multiplier of calculation.multipliers||[])add(multiplier?.path);
    for(const component of calculation.components||[]){add(component?.ratePath);for(const multiplier of component?.multipliers||[])add(multiplier?.path);}
  }
  for(const derivation of template?.quantityDerivations||[])for(const [key,value] of Object.entries(derivation?.inputs||{}))if(/Path$/.test(key))add(value);
  return paths;
}

export function unconfirmedStartingValueUsesVNext(service,template){
  const used=evidencePaths(template),state=record(service?.startingValueState)?service.startingValueState:{};
  return Object.entries(state).filter(([path,row])=>used.has(path)&&(!record(row)||row.confirmed!==true)&&(!row?.group||service?.startingValueAdoptions?.[row.group]?.mode!=='legacy')).map(([path,row])=>({
    path:'startingValueState.'+path,
    factorPath:path,
    message:'Confirm the starting value for '+String(record(row)&&row.label||path).toLowerCase()+' in your price book.'
  }));
}

export function startingValueGroupsVNext(definitions={}){
  return [...new Set(startingValueDefinitionsVNext(definitions).map(item=>item.group).filter(Boolean))];
}

function dependentSignature(definition){
  if(!record(definition)||typeof definition.id!=='string'||!definition.id.trim()||typeof definition.basePricePath!=='string'||!definition.basePricePath.trim()||typeof definition.basePriceNewWording!=='string'||!definition.basePriceNewWording.trim())throw new TypeError('A dependent line requires an id, base-price path and new base-price wording.');
  return signature({id:definition.id,basePricePath:definition.basePricePath,basePriceNewWording:definition.basePriceNewWording});
}

// A dependent line cannot activate merely because its rate exists. Its base
// receipt proves that the old all-in price was re-entered under the declared
// exclusion wording and then explicitly confirmed.
export function synchronizeDependentLinesVNext(service,definitions=[],options={}){
  if(!record(service)||!record(service.pricing))throw new TypeError('A priced service is required.');
  const next=clone(service),state=record(next.dependentLineState)?clone(next.dependentLineState):{};
  const reentered=new Set(options.reenteredIds||[]),confirm=new Set(options.confirmIds||[]);
  const now=typeof options.now==='string'?options.now:new Date().toISOString();
  for(const definition of definitions){
    const key=dependentSignature(definition),baseValue=getPath(next.pricing,definition.basePricePath);
    let row=state[definition.id];
    if(!row||row.definitionSignature!==key)row={definitionSignature:key,basePricePath:definition.basePricePath,basePriceNewWording:definition.basePriceNewWording,baseValue:clone(baseValue),reentered:false,confirmed:false,introducedAt:now};
    else if(!Object.is(baseValue,row.baseValue))row={...row,baseValue:clone(baseValue),reentered:true,confirmed:false,reenteredAt:now};
    if(reentered.has(definition.id))row={...row,baseValue:clone(baseValue),reentered:true,confirmed:false,reenteredAt:now};
    if(confirm.has(definition.id)){
      if(!row.reentered)throw new TypeError('Re-enter the base price under its new wording before confirming the extracted line.');
      const ownerId=options.ownerId||next.origin?.ownerId;
      if(typeof ownerId!=='string'||!ownerId.trim()||next.origin?.ownerId&&ownerId!==next.origin.ownerId)throw new TypeError('Dependent-line confirmation must match the service owner.');
      row={...row,confirmed:true,confirmedAt:now,ownerId};
    }
    state[definition.id]=row;
  }
  if(Object.keys(state).length)next.dependentLineState=state;else delete next.dependentLineState;
  return next;
}

export function dependentLineEnabledVNext(service,definition){
  const row=service?.dependentLineState?.[definition.id];
  return record(row)&&row.confirmed===true&&row.reentered===true&&row.definitionSignature===dependentSignature(definition)&&Object.is(getPath(service.pricing,definition.basePricePath),row.baseValue);
}

export function activeDependentLinesVNext(lines,service,definitions=[]){
  const definitionsById=new Map(definitions.map(definition=>[definition.id,definition]));
  return lines.filter(line=>{
    if(!line?.dependentLineId)return true;
    const definition=definitionsById.get(line.dependentLineId);
    return Boolean(definition)&&dependentLineEnabledVNext(service,definition);
  });
}

export function roofFlashingVentDefinitionVNext(materialType){
  if(typeof materialType!=='string'||!/^[a-z][a-z0-9_]*$/.test(materialType))throw new TypeError('A canonical roof material type is required.');
  return {
    id:'roofing_flashing_vents.'+materialType,
    label:'Itemized roof flashing and vent lines',
    basePricePath:'materialCostPerSquare.'+materialType,
    basePriceNewWording:'Field material price per square, excluding ice and water barrier, valley work, step flashing, pipe jacks and ridge vent.'
  };
}
