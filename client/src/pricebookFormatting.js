export {productKeyFromName,DUPLICATE_NAME_MESSAGE} from '../../server/productNames.js';
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
