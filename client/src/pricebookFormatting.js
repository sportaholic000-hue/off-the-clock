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

// Every owner control that names a product, gate or price row uses this one
// conversion, so a name registered in one place matches the same name typed in
// another. Stored names are lowercase words joined by underscores and must
// start with a letter (the engine's canonical form). Accents are folded
// (Épinette → epinette) and any other punctuation becomes a word break, so
// "O'Brien cedar" and "Vinyl (D4)" are accepted everywhere. A refused name
// returns a reason to show the owner; nothing is dropped silently.
export function productKeyFromName(name) {
  const key = String(name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) return { error: 'Enter a name using letters or numbers.' };
  if (!/^[a-z]/.test(key)) return { error: 'Start the name with a letter, for example "Three-tab shingle" instead of "3-tab shingle".' };
  return { key };
}
export const DUPLICATE_NAME_MESSAGE = 'That name is already listed.';

export function humanPricingKey(key) {
  if (SPECIAL_LABELS[key]) return SPECIAL_LABELS[key];
  const words = String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\bLF\b/gi, 'linear foot').replace(/\bsqft\b/gi, 'square foot').replace(/\bsq ft\b/gi, 'square foot')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
