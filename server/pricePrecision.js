// Discrete purchases and fixed charges have whole-cent prices. Measured rates
// retain fractional cents until their extended line is rounded by the engine.
export const FIXED_PRICE_FIELDS = new Set([
  'deckingPerSheet','perStepPrice','postPrice','concretePerPost','gatePrice',
  'plantingLaborPerPlant','plantMaterialAllowance','repairMinimum',
  'repairMaterialAllowance','minimumJob','minimumServiceCharge','disposalFlat',
  'haulAwayFee','materialAllowance','patchMaterialAllowance','pondingWaterSurcharge',
  'travelFee','disposalFee','permitFee','overheadFixed','minimumJobPrice'
]);
export function fixedPriceField(field, pricing = {}) {
  return FIXED_PRICE_FIELDS.has(field) || ['price','low','high'].includes(field) && ['flat','per_unit'].includes(pricing.unit);
}
