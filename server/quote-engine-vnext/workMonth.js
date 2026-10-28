// Busy-season pricing follows the month the customer wants the work done.
// The question is optional: with no answer the quote month is used.
export const WORK_MONTHS = Object.freeze(['january','february','march','april','may','june','july','august','september','october','november','december']);
const label = month => month[0].toUpperCase() + month.slice(1);
export const WORK_MONTH_FIELD = Object.freeze({
  name: 'workMonth',
  label: 'Month you want the work done',
  unit: null,
  type: 'enum',
  values: WORK_MONTHS,
  optionLabels: Object.freeze(Object.fromEntries(WORK_MONTHS.map(month => [month, label(month)]))),
  details: ['Optional. Busy-season pricing follows the month the work is done.']
});
export function workMonthNumber(value) {
  const index = typeof value === 'string' ? WORK_MONTHS.indexOf(value.trim().toLowerCase()) : -1;
  return index < 0 ? null : index + 1;
}
