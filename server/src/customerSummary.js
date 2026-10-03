// Presentation only: original measurements and the signed submission are unchanged.
const measurement = {exact:'Measured area',assumption:'Estimated area',roof_measured:'Measured roof area',home_floor_area:'Home floor area'};
const grass = {maintained:'Regularly maintained',overgrown:'Overgrown',severe:'Severely overgrown'};
export function customerSummaryValue(field, value, fallback) {
  if (typeof value !== 'string') return fallback(value);
  if (field?.optionLabels && Object.hasOwn(field.optionLabels,value)) return field.optionLabels[value];
  if (field?.type !== 'slug' && (field?.type !== 'enum' || !field.values?.includes(value))) return fallback(value);
  if (['sqftMethod','roofSizeMethod'].includes(field.name) && measurement[value]) return measurement[value];
  if (field.name==='grassCondition' && grass[value]) return grass[value];
  const words=value.replaceAll('_',' ').replace(/([a-z])([A-Z])/g,'$1 $2');
  return words.charAt(0).toUpperCase()+words.slice(1);
}
