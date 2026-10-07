import {scopeDefinitions,scopeRateDefinitions} from './scopeConfiguration.js';
import {offeringRateDefinitions} from './quote-engine-vnext/configuredOfferings.js';

const SPECIAL_LABELS = {
  disposalFlat: 'Flat disposal charge ($)',
  addon:'Additional work', customer_selectable_addon:'Customer can select this extra',
  customer_selected:'Customer chooses', owner_selected:'Owner chooses', when_scope_selected:'When the matching work is selected',
  included_in_rates:'Included in prices', not_applicable:'Does not apply', always:'Always applies',
  included_in_floor_price:'Included in flooring material price',
  installedLaborPercent:'Labor portion (%)', installedMaterialsPercent:'Materials share (%)',
  priceBasisByCategory:'Price meaning by category', taxabilityByCategory:'Tax treatment by category',
  feeRules:'Fixed charge rules', knownOfferings:'Registered products', offeringDetails:'Work included', offeringRates:'Offering prices',
  TAX_NONE:'No tax', TAX_ALL:'Tax entire job', TAX_MATERIALS:'Tax materials only'
};


export function humanPricingKey(key) {
  if (SPECIAL_LABELS[key]) return SPECIAL_LABELS[key];
  const words = String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\bLF\b/gi, 'linear foot').replace(/\bsqft\b/gi, 'square foot').replace(/\bsq ft\b/gi, 'square foot')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function reviewLabel(path,service,meta={},p=service.pricing||service) {
 const parts=path.replace(/^pricing\./,'').split('.'),root=parts.shift();
 const definitions=root==='scopeRates'?scopeRateDefinitions(service.serviceType,p,true):root==='offeringRates'?offeringRateDefinitions(service.serviceType,{...p,offeringDetails:{...p.offeringDetails,primerCoats:1,ceilingsOffered:true,ceilingPrimerCoats:1,trimOffered:true,removalOffered:true}}):{};
 if(['installedLaborPercent','installedMaterialsPercent'].includes(root))return humanPricingKey(root)+' — '+reviewLabel(parts.join('.'),service,meta,p);
 if(definitions[parts.join('.')]){const field=definitions[parts.join('.')];return field.label+' (per '+field.unit+')';}
 if(root==='scopeDetails') {
  const def=scopeDefinitions(service.serviceType,p)[parts[0]];
  return [def?.label||humanPricingKey(parts[0]),...parts.slice(1).map(key=>def?.fields[key]?(def.fields[key].label+(def.fields[key].unit?' ('+def.fields[key].unit+')':'')):humanPricingKey(key))].join(' · ');
 }
 return [meta.fields?.find(f=>f.field===root)?.title||meta.fields?.find(f=>f.field===root)?.label||meta.class2Fields?.find(f=>f.name===root)?.label||humanPricingKey(root),...parts.map(humanPricingKey)].join(' · ');
}
