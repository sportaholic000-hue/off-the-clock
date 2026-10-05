import {MEASUREMENT_CONTRACTS} from './quote-engine-vnext/contracts.js';
import { scopeDefinitions, scopeRateDefinitions, scopeOverlapDiagnostics, MULTI_SCOPE_KEYS } from './scopeConfiguration.js';
import { offeringRateDefinitions } from './quote-engine-vnext/configuredOfferings.js';
import { parseOwnerNumericInput } from './priceBookMoney.js';

export const CONFIGURATION_FIELDS=['offeringMode','offeringDetails','offeringRates','scopeDetails','scopeRates','knownOfferings'];
const text=label=>({type:'string',label});
const choice=(label,values)=>({type:'enum',label,values});
const bool=label=>({type:'boolean',label});
const number=(label,unit,min=0,max=1_000_000)=>({type:'number',label,unit,min,max});
const object=(label,fields)=>({type:'object',label,fields});
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

export function interviewConfigurationSchema(type,field,pricing={},value){
 if(field==='knownOfferings')return object('Products you explicitly offer',Object.fromEntries(Object.entries(MEASUREMENT_CONTRACTS[type]?.fields||{}).filter(([,f])=>f.type==='slug').map(([name,f])=>[name,{type:'map',label:f.label,entry:choice('This product is offered',[true])}])));
 if(field==='offeringMode')return choice('Offering pricing',['installed','itemized']);
 if(field==='scopeDetails'){
  const catalog=scopeDefinitions(type,{...pricing,scopeDetails:value??pricing.scopeDetails});
  return {type:'map',label:'Additional priced scope',entries:Object.fromEntries(Object.entries(catalog).map(([key,def])=>[key,object(def.label,def.fields)])),multiple:MULTI_SCOPE_KEYS};
 }
 if(field==='scopeRates'||field==='offeringRates'){
  const defs=field==='scopeRates'?scopeRateDefinitions(type,pricing,true):offeringRateDefinitions(type,pricing);
  return object(field==='scopeRates'?'Additional scope prices':'Offering prices',Object.fromEntries(Object.entries(defs).map(([key,f])=>[key,{...number(f.label,'$ per '+f.unit,0,Number.MAX_SAFE_INTEGER),moneyKind:f.moneyKind}])));
 }
 const fence=type.startsWith('FENCING_'),interior=type==='INTERIOR_PAINTING';
 const fields={description:text('Included job description')};
 if(fence)Object.assign(fields,{
  fenceType:{...text('Offered fence type'),slug:true},fenceHeight:number('Height these prices are for (priced for flat ground)','feet',Number.MIN_VALUE),postFootingDescription:text('Standard posts, footings and digging included'),
  gates:{type:'map',label:'Offered gates',entry:object('Gate',{widthLF:number('Gate opening width','feet',Number.MIN_VALUE),description:text('Gate, hardware and installation included'),postsAndFootingsIncluded:bool('Gate price includes gate posts and footings')})},
  ...(type==='FENCING_REPLACEMENT'?{removalOffered:bool('Old-fence removal offered'),removalDescription:text('Fence removal included'),removalIncludesDisposal:bool('Removal includes disposal')}: {})
 });
 else Object.assign(fields,{
  substrate:text('Paintable substrate'),coating:text('Coating/product system'),finishCoats:{...number('Finish coats','coats',1,3),integer:true},surfaceCondition:choice('Surface condition',['good','fair','poor']),preparation:text('Included preparation'),primerCoats:{...number('Primer coats','coats',0,3),integer:true},
  ...(interior?{ceilingsOffered:bool('Ceiling painting offered'),trimOffered:bool('Trim painting offered'),ceilingCoats:{...number('Ceiling finish coats','coats',1,3),integer:true},ceilingPrimerCoats:{...number('Ceiling primer coats','coats',0,3),integer:true},trimDescription:text('Trim work included')}: {})
 });
 return object('Offering details',fields);
}
// Drafts may be incomplete. Supplied settings must have exact supported types;
// live readiness and owner approval still require the whole effective contract.
export function validateInterviewConfiguration(type,field,value,pricing={}){
 const fail=message=>{throw Object.assign(new Error(message),{statusCode:422});};
 let nodes=0;
 function visit(v,schema,path){
  if(++nodes>5000)fail('This configuration is too large.');
  if(schema.type==='object'||schema.type==='map'){
   if(!record(v))fail(path+': enter the displayed settings.');
   for(const [key,child] of Object.entries(v)){
    if(['__proto__','prototype','constructor'].includes(key)||!(schema.type==='map'?/^[a-z][a-z0-9_]*$/:/^[a-zA-Z][a-zA-Z0-9_]*$/).test(key))fail(path+': unsupported entry name.');
    const def=schema.fields?.[key]||schema.entries?.[key]||schema.entry;
    if(!def)fail(path+': unsupported setting '+key+'.');
    visit(child,def,path+'.'+key);
   }
  }else if(schema.type==='boolean'){if(typeof v!=='boolean')fail(path+': choose Yes or No.');}
  else if(schema.type==='enum'){if(!schema.values.includes(v))fail(path+': choose a displayed option.');}
  else if(schema.type==='number'){
   if(typeof v!=='number'||!Number.isFinite(v)||v<(schema.min??0)||v>(schema.max??Number.MAX_SAFE_INTEGER)||schema.integer&&!Number.isInteger(v))fail(path+': enter a number within the displayed limits.');
   if(schema.moneyKind)parseOwnerNumericInput(v,{kind:schema.moneyKind,path});
  }else if(typeof v!=='string'||!v.trim()||v.length>2000||schema.slug&&!/^[a-z][a-z0-9_]*$/.test(v))fail(path+': enter a supported description or product name.');
 }
 visit(value,interviewConfigurationSchema(type,field,pricing,value),field);
 if(field==='scopeDetails'){const errors=scopeOverlapDiagnostics(type,{...pricing,scopeDetails:value});if(errors.length)fail(errors[0].message);}
 return structuredClone(value);
}
export function describeInterviewConfiguration(type,field,value,pricing={}){
 const schema=interviewConfigurationSchema(type,field,pricing,value),parts=[];
 function visit(v,d,path=[]){
  if(record(v)){if(!Object.keys(v).length)parts.push([...path,'None configured'].join(': '));for(const [key,child] of Object.entries(v)){const def=d.fields?.[key]||d.entries?.[key]||d.entry;visit(child,def,[...path,def?.label||key.replaceAll('_',' ')]);}}
  else parts.push(path.join(' / ')+': '+(typeof v==='boolean'?(v?'Yes':'No'):String(v))+(d?.unit?' '+d.unit:''));
 }
 visit(value,schema,[schema.label]);return parts.join('; ');
}

// Registration is an explicit interview answer, separate from prices. Never
// derive it from price-map keys or accept provider-generated identifiers.
export function materializeInterviewFields(type,fields,createId){
 const pricing=structuredClone(fields),knownOfferings={};
 if(Object.hasOwn(pricing,'knownOfferings')){
  const choices=validateInterviewConfiguration(type,'knownOfferings',pricing.knownOfferings,pricing);
  for(const [field,products] of Object.entries(choices))knownOfferings[field]=Object.fromEntries(Object.keys(products).map(product=>[product,createId()]));
  delete pricing.knownOfferings;
 }
 return {pricing,knownOfferings};
}
