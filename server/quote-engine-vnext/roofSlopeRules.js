// Minimum roof slopes for steep-slope roof coverings (IRC 2021 section R905),
// matched from the owner's registered material name. NBC 9.26 uses the same
// breakpoints for asphalt shingles (low-slope application from 1 in 6 to
// 1 in 3, none below). Unrecognized materials carry no slope rule.
//   asphalt shingles R905.2.2: 2/12 or more; double underlayment 2/12 up to 4/12
//   clay and concrete tile R905.3.2: 2.5/12 or more; double underlayment up to 4/12
//   metal roof shingles R905.4.2, wood shingles R905.7.2, wood shakes R905.8.2: 3/12
//   slate R905.6.2: 4/12
export const LOW_SLOPE_BREAK = 4;
export function roofSlopeRule(material) {
  const name = typeof material === 'string' ? material.toLowerCase() : '';
  if (!name) return null;
  if (/slate/.test(name)) return {min: 4, doubleUnderlaymentBelow: null, label: 'Slate'};
  if (/shake/.test(name)) return {min: 3, doubleUnderlaymentBelow: null, label: 'Wood shakes'};
  if (/(wood|cedar)/.test(name) && /shingle/.test(name)) return {min: 3, doubleUnderlaymentBelow: null, label: 'Wood shingles'};
  if (/metal/.test(name) && /shingle/.test(name)) return {min: 3, doubleUnderlaymentBelow: null, label: 'Metal roof shingles'};
  if (/tile/.test(name)) return {min: 2.5, doubleUnderlaymentBelow: LOW_SLOPE_BREAK, label: 'Clay and concrete tile'};
  if (/(asphalt|shingle|architectural|three_tab|3_tab|laminated)/.test(name)) return {min: 2, doubleUnderlaymentBelow: LOW_SLOPE_BREAK, label: 'Asphalt shingles'};
  return null;
}
const formatSlope = value => (Number.isInteger(value) ? String(value) : String(value)) + '/12';
// Review message when the known slope is below the material's minimum.
export function roofSlopeIneligibleMessage(material, rise) {
  const rule = roofSlopeRule(material);
  if (!rule || !Number.isFinite(rise) || rise >= rule.min) return null;
  return `${rule.label} are installed only on roofs of ${formatSlope(rule.min)} or steeper. A ${formatSlope(rise)} roof needs a low-slope roof system; the business will inspect before quoting.`;
}
// Double underlayment applies when the known slope is at or above the minimum
// and below 4/12.
export function roofDoubleUnderlayment(material, rise) {
  const rule = roofSlopeRule(material);
  return Boolean(rule && rule.doubleUnderlaymentBelow && Number.isFinite(rise) && rise >= rule.min && rise < rule.doubleUnderlaymentBelow);
}
export const LOW_SLOPE_UNKNOWN_MESSAGE = 'Part or all of this roof is below 4/12. Low-slope roofs need extra underlayment or a different roof system, so the business will inspect before quoting.';
