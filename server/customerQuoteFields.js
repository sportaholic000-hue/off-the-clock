import {customerContractForVNext} from './quote-engine-vnext/contracts.js';
import {mergePricingVNext} from './quote-engine-vnext/pricingMerge.js';
import {configuredOffering,offeringContract} from './quote-engine-vnext/configuredOfferings.js';
import {mergeCustomerFieldDefinitions} from './scopeConfiguration.js';

// One tier-aware contract for public intake and the owner's measurement preview.
export function customerQuoteFields(raw,p){
  const type=raw.serviceType;
  const variants=Array.isArray(raw.tiers)&&raw.tiers.length?raw.tiers.map(tier=>({tierName:tier.name,fields:customerContractForVNext(type,mergePricingVNext(p,tier.overrides||{}),raw).fields})):[{tierName:null,fields:customerContractForVNext(type,p,raw).fields}];
  const displayedVariants=variants.map(variant=>({...variant,fields:Object.fromEntries(Object.entries(variant.fields).filter(([,field])=>!field.evidenceOnly))}));
  const customerFields=Object.entries(mergeCustomerFieldDefinitions(displayedVariants)).filter(([name])=>name!=='permitRequired').map(([name,field])=>({name,...field}));
  // Gate selectors describe the confirmed measurement. Tier price changes may
  // upgrade hardware, but cannot relabel that measurement in shared scope.
  const baseGates=type.startsWith('FENCING_')&&configuredOffering(type,p)?offeringContract(type,p).fields.gates:null;
  const gates=customerFields.find(field=>field.name==='gates');
  if(gates&&baseGates)gates.options={...gates.options,...baseGates.options};
  return customerFields;
}
