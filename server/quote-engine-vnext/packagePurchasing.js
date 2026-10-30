// A cost-priced material is bought in whole packages: shingle bundles,
// flooring and siding cartons, sod pallets, mulch and ready-mix order
// increments. Without the package size a quote prices only the exact quantity,
// up to one package short of what is bought. So a quote whose material has no
// package size goes to the business for review, unless the owner has chosen to
// price the exact quantity (partial packages, with leftover material used on
// other jobs). Selling-rate (installed) material prices are the owner's own
// normalized rate and are not affected.
export const PACKAGE_PURCHASE_TYPES = Object.freeze(['ROOFING_REPLACEMENT', 'FLOORING_INSTALL', 'FLOORING_REPLACEMENT', 'SIDING_REPLACEMENT', 'CONCRETE_DRIVEWAY', 'CONCRETE_PATIO_SLAB', 'LANDSCAPING_SOD', 'LANDSCAPING_MULCH']);
export const PARTIAL_PACKAGE_PRICING = Object.freeze(['whole_packages', 'exact_quantity']);

export const PARTIAL_PACKAGE_OWNER_COPY = Object.freeze({
  label: 'Materials bought in packages',
  help: 'Materials priced at your cost are bought in whole packages: bundles, cartons, pallets or ready-mix order increments. Enter each package size so quotes price what you buy. Blank, or Whole packages, sends a quote to you for review when its material has no package size. Choose Exact quantity only if you price partial packages because you use the leftover material on other jobs.',
  optionLabels: {
    whole_packages: 'Whole packages; send quotes to me when a package size is missing',
    exact_quantity: 'Exact quantity; I use leftover material on other jobs'
  }
});

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

// The package-size field the quoted material needs, or null when it is set or
// not needed. Carpet is bought by the roll from measured rooms instead.
export function packageSizePath(serviceType, c = {}, p = {}) {
  if (serviceType === 'ROOFING_REPLACEMENT') return positive(p.bundlesPerSquare?.[c.replacementRoofType]) ? null : `bundlesPerSquare.${c.replacementRoofType}`;
  if (serviceType === 'FLOORING_INSTALL' || serviceType === 'FLOORING_REPLACEMENT') return c.newFlooringType === 'carpet' || positive(p.cartonCoverageSqft?.[c.newFlooringType]) ? null : `cartonCoverageSqft.${c.newFlooringType}`;
  if (serviceType === 'SIDING_REPLACEMENT') return positive(p.sidingCartonCoverageSqft?.[c.sidingType]) ? null : `sidingCartonCoverageSqft.${c.sidingType}`;
  if (serviceType === 'CONCRETE_DRIVEWAY' || serviceType === 'CONCRETE_PATIO_SLAB') return positive(p.readyMixOrderIncrementCubicYards) ? null : 'readyMixOrderIncrementCubicYards';
  if (serviceType === 'LANDSCAPING_SOD') return positive(p.sodPalletSizeSqft) ? null : 'sodPalletSizeSqft';
  if (serviceType === 'LANDSCAPING_MULCH') return positive(p.mulchOrderIncrementCubicYards?.[c.mulchType]) ? null : `mulchOrderIncrementCubicYards.${c.mulchType}`;
  return null;
}

// The missing package size that sends this quote to review, or null.
export function packageSizeReview(serviceType, c, p = {}, rules = {}) {
  if (!PACKAGE_PURCHASE_TYPES.includes(serviceType) || rules?.priceBasisByCategory?.material !== 'cost' || p.partialPackagePricing === 'exact_quantity') return null;
  return packageSizePath(serviceType, c, p);
}

export function partialPackageDiagnostics(type, p = {}) {
  if (p.partialPackagePricing === undefined) return [];
  if (PACKAGE_PURCHASE_TYPES.includes(type) && PARTIAL_PACKAGE_PRICING.includes(p.partialPackagePricing)) return [];
  return [{ type: 'invalid', kind: 'service_rule', path: 'partialPackagePricing', message: 'Choose whole packages or exact quantity for materials bought in packages.' }];
}
