import { formatFenceHeight } from '../quote-engine-vnext/configuredOfferings.js';
// Presentation only: original measurements and the signed submission are unchanged.
const measurement = {exact:'Measured area',assumption:'Estimated area',roof_measured:'Measured roof area',home_floor_area:'Home floor area'};
const grass = {maintained:'Regularly maintained',overgrown:'Overgrown',severe:'Severely overgrown'};
export function customerSummaryValue(field, value, fallback) {
  // Fence heights read the way they were entered ("5 ft 3.65 in"), never as a long decimal.
  if (field?.name === 'fenceHeight' && typeof value === 'number' && Number.isFinite(value) && value > 0) return formatFenceHeight(value);
  if (typeof value === 'number' && Number.isFinite(value) && field?.unit) return fallback(value) + ' ' + field.unit;
  if (typeof value !== 'string') return fallback(value);
  if (field?.optionLabels && Object.hasOwn(field.optionLabels,value)) return field.optionLabels[value];
  if (field?.type !== 'slug' && (field?.type !== 'enum' || !field.values?.includes(value))) return fallback(value);
  if (['sqftMethod','roofSizeMethod'].includes(field.name) && measurement[value]) return measurement[value];
  if (field.name==='grassCondition' && grass[value]) return grass[value];
  const words=value.replaceAll('_',' ').replace(/([a-z])([A-Z])/g,'$1 $2');
  return words.charAt(0).toUpperCase()+words.slice(1);
}
