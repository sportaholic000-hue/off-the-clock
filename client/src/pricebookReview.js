import {scaleOwnerDecimal,moneyKindForField} from '../../server/priceBookMoney.js';
import {humanPricingKey} from './pricebookFormatting.js';
import {scopeDefinitions,scopeRateDefinitions} from '../../server/scopeConfiguration.js';
import {offeringRateDefinitions,formatFenceHeight} from '../../server/quote-engine-vnext/configuredOfferings.js';
import {servicePricing} from './pricebookEditing.js';
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const omitted=new Set(['id','serviceType','origin','confirmedFields','approvedValues','quoteDoneApproval','starterSuggestion','createdAt','updatedAt','validationInputs']);
const defaultMoney=new Set(['overheadFixed','minimumJobPrice','travelFee','disposalFee','permitFee','laborHourlyRate']);
export const displayAmount=value=>'$'+String(value);
export function reviewLabel(path,service,meta={}) {
 const parts=path.replace(/^pricing\./,'').split('.'),root=parts.shift(),p=servicePricing(service);
 const definitions=root==='scopeRates'?scopeRateDefinitions(service.serviceType,p,true):root==='offeringRates'?offeringRateDefinitions(service.serviceType,{...p,offeringDetails:{...p.offeringDetails,primerCoats:1,ceilingsOffered:true,ceilingPrimerCoats:1,trimOffered:true,removalOffered:true}}):{};
 if(['installedLaborPercent','installedMaterialsPercent'].includes(root))return humanPricingKey(root)+' — '+reviewLabel(parts.join('.'),service,meta);
 if(definitions[parts.join('.')]){const field=definitions[parts.join('.')];return field.label+' (per '+field.unit+')';}
 if(root==='scopeDetails') {
  const def=scopeDefinitions(service.serviceType,p)[parts[0]];
  return [def?.label||humanPricingKey(parts[0]),...parts.slice(1).map(key=>def?.fields[key]?(def.fields[key].label+(def.fields[key].unit?' ('+def.fields[key].unit+')':'')):humanPricingKey(key))].join(' · ');
 }
 return [meta.fields?.find(f=>f.field===root)?.title||meta.fields?.find(f=>f.field===root)?.label||meta.class2Fields?.find(f=>f.name===root)?.label||humanPricingKey(root),...parts.map(humanPricingKey)].join(' · ');
}
// Prices that can take part in an "included" mapping: every money path in the
// base offering and in each price option (an option's own override shows with
// its name). Minimums can never be included or cover another price, so they are
// not offered.
const MINIMUM_FIELDS=new Set(['minimumJob','repairMinimum','minimumServiceCharge']);
export function priceChoices(service,meta={}) {
 const p={...service,...servicePricing(service)},fields=new Set((meta.fields||[]).filter(f=>f.money&&!MINIMUM_FIELDS.has(f.field)).map(f=>f.field));fields.add('offeringRates');fields.add('scopeRates');
 const out=[];function visit(value,path,option){if(record(value)){for(const [key,v]of Object.entries(value))visit(v,path+'.'+key,option);}else if(typeof value==='number')out.push({path,label:reviewLabel(path,service,meta)+(option?' — '+option+' option':''),value,option:option||null});}
 for(const field of fields)if(p[field]!==undefined)visit(p[field],field,null);
 for(const tier of service.tiers||[])for(const field of fields)if(tier?.overrides?.[field]!==undefined)visit(tier.overrides[field],field,tier.name);
 return out;
}
// One value formatter for the approval table and the retained-settings list,
// so a retained price reads exactly like an active one ($40, 12%, 1.1 ×).
function shownValue(path,value,service,meta,group,prices){
 const root=path.replace(/^pricing\./,'').split('.')[0];
 const numeric=typeof value==='number';
 // Fence heights read the way they were entered ("5 ft 3.65 in"), never as a long decimal.
 if(numeric&&Number.isFinite(value)&&value>0&&/(^|\.)fenceHeight$/.test(path.replace(/^pricing\./,'')))return formatFenceHeight(value);
 let shown=value===undefined||value===null?'Not entered':Array.isArray(value)?value.map(v=>typeof v==='string'?humanPricingKey(v):String(v)).join(', ')||'None':typeof value==='boolean'?(value?'Yes':'No'):typeof value==='string'?humanPricingKey(value):String(value);
 // Preserve descriptions and free text exactly; only named enum values get friendly labels.
 if(typeof value==='string'&&!/^[A-Za-z][A-Za-z0-9_]*$/.test(value))shown=value;
 if(typeof value==='string'&&/description|preparation|coating|substrate|service$|disclaimer/i.test(path))shown=value;
 const priceRoot=(meta.fields||[]).some(field=>field.field===root&&field.money)||['offeringRates','scopeRates'].includes(root)||Boolean(moneyKindForField(service.serviceType,root,servicePricing(service)));
 if(numeric&&(prices.has(path.replace(/^pricing\./,''))||priceRoot||group==='Business settings'&&defaultMoney.has(root)))shown=displayAmount(value);
 else if(numeric&&(/Percent$/.test(root)||root==='installedLaborPercent'||root==='installedMaterialsPercent'))shown=String(value)+'%';
 const factor=(meta.class2Fields||[]).find(field=>(field.name||field.field)===root);
 if(numeric&&factor?.unit==='decimal fraction')shown=String(scaleOwnerDecimal(value,2))+'%';
 else if(numeric&&factor?.unit==='multiplier')shown=String(value)+' ×';
 else if(numeric&&factor?.unit&&factor.unit!=='percent')shown+=' '+factor.unit;
 return shown;
}
// Retained (retired) settings: path as reported by the server's legacy list,
// e.g. "pricing.perStepPrice", "perStepPrice" or "defaults.laborHourlyRate".
export function retainedValueText(path,value,service,meta={}){
 const business=path.startsWith('defaults.');
 return shownValue(path.replace(/^defaults\./,''),value,service,meta,business?'Business settings':'Prices and factors',new Map(priceChoices(service,meta).map(row=>[row.path,row])));
}
// One labelled row per retained value; a retained map lists each saved entry
// instead of collapsing to an unreadable object.
export function retainedRows(path,value,service,meta={}){
 const rows=[];
 const visit=(v,at)=>{if(record(v)){for(const [key,child]of Object.entries(v))visit(child,at+'.'+key);return;}
  const shownPath=at.replace(/^defaults\./,'').replace(/^pricing\./,'');
  rows.push({path:at,label:reviewLabel(shownPath,service,meta),value:retainedValueText(at,v,service,meta)});};
 visit(value,path);
 return rows;
}
// Retained settings are listed separately for their own confirmation, so they
// never appear among the prices that current quotes use.
export function reviewRows(service,defaults,meta={},retainedPaths=[]) {
 const rows=[],prices=new Map(priceChoices(service,meta).map(row=>[row.path,row]));
 const retained=new Set(retainedPaths);
 const add=(label,value)=>rows.push({label,value});
 const walk=(value,path,group)=>{
  const root=path.replace(/^pricing\./,'').split('.')[0];
  if(group==='Prices and factors'&&(retained.has(root)||retained.has('pricing.'+root)))return;
  if(group==='Offering'&&retained.has(root))return;
  if(group==='Business settings'&&retained.has('defaults.'+root))return;
  if(record(value)){for(const [key,v]of Object.entries(value))walk(v,path?path+'.'+key:key,group);return;}
  const label=(group?group+' · ':'')+reviewLabel(path,service,meta);
  if(root==='knownOfferings'){add(label,'Registered');return;}
  add(label,shownValue(path,value,service,meta,group,prices));
 };
 for(const [key,value]of Object.entries(service)){
  if(omitted.has(key)||key==='tiers'||key==='zeroPricePolicy')continue;
  if(key==='pricing'){for(const [name,v]of Object.entries(value))walk(v,name,'Prices and factors');}
  else walk(value,key,'Offering');
 }
 // Default settings the quote uses but the saved record does not list yet.
 const pricing=servicePricing(service);
 for(const field of meta.class2Fields||[]){const name=field.name||field.field;if(name&&field.defaultValue!==undefined&&!Object.hasOwn(pricing,name)&&!Object.hasOwn(service,name)&&!retained.has(name))walk(field.defaultValue,name,'Prices and factors (default)');}
 for(const tier of service.tiers||[])for(const [key,value]of Object.entries(tier.overrides||{}))walk(value,key,'Price option: '+tier.name);
 for(const [key,value]of Object.entries(defaults||{}))walk(value,key,'Business settings');
 if(service.zeroPricePolicy){const zero=service.zeroPricePolicy;add('Entire base offering explicitly free',zero.freeCompleteService?'Yes':'No');add('Explicitly free price options',(zero.freeTiers||[]).join(', ')||'None');for(const [from,to]of Object.entries(zero.includedPrices||{}))add('Included price: '+reviewLabel(from,service,meta),reviewLabel(to,service,meta));}
 return rows;
}
