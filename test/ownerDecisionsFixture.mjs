// Owner decisions a price book now states explicitly. These fixture values
// reproduce the earlier implicit behavior so older hand-calculated
// expectations stay valid.
//
// Concrete: the slab thickness range the square-foot labor price covers,
// whether forming labor is inside that price, and how isolation joints against
// existing construction are priced (any 2–24 inch slab; forming and isolation
// joints inside the other prices).
export const CONCRETE_OWNER_DECISIONS=Object.freeze({
  slabLaborMinThicknessInches:2,
  slabLaborMaxThicknessInches:24,
  formingLaborPricing:'included_in_slab_labor',
  isolationJointPricing:'included'
});
export const withConcreteDecisions=pricing=>({...CONCRETE_OWNER_DECISIONS,...pricing});
// Roofing: the building code and each product's type set the minimum slope
// and the low-slope method. United States code, two underlayment layers on a
// low-slope shingle roof, and no blanket eave-protection rule reproduce the
// earlier behavior. Product types follow the fixture product keys.
const ROOF_PRODUCT_ROOTS=['laborPerSquare','materialCostPerSquare','underlaymentPerSquare','underlaymentPriceBasis','tearOffPerSquare'];
export function fixtureRoofClass(key){
  if(/slate/.test(key))return 'slate';
  if(/shake/.test(key))return 'wood_shake';
  if(/(wood|cedar)/.test(key)&&/shingle/.test(key))return 'wood_shingle';
  if(/metal/.test(key)&&/shingle/.test(key))return 'metal_shingle';
  if(/tile/.test(key))return 'concrete_tile';
  if(/standing_seam/.test(key))return 'standing_seam_metal';
  if(/metal/.test(key))return 'lapped_metal_panel';
  return 'asphalt_shingle';
}
export function withRoofDecisions(pricing={}){
  const keys=new Set(ROOF_PRODUCT_ROOTS.flatMap(root=>pricing[root]&&typeof pricing[root]==='object'?Object.keys(pricing[root]):[]));
  return {roofBuildingCode:'irc',lowSlopeAssembly:'double_underlayment',eaveProtectionRequired:'no',...pricing,
    roofProductClass:{...Object.fromEntries([...keys].map(key=>[key,fixtureRoofClass(key)])),...(pricing.roofProductClass||{})}};
}
export const withOwnerDecisions=(serviceType,pricing)=>typeof serviceType!=='string'?pricing
  :serviceType.startsWith('CONCRETE_')?withConcreteDecisions(pricing)
  :serviceType==='ROOFING_REPLACEMENT'?withRoofDecisions(pricing)
  :pricing;
