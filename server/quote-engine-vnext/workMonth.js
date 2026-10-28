// Busy-season pricing follows the month the customer wants the work done.
// When the customer is not sure (or leaves it blank) the busy-season price is
// quoted and the quote says it is lower outside the busy months; the month the
// quote is made is never used in its place.
export const WORK_MONTHS = Object.freeze(['january','february','march','april','may','june','july','august','september','october','november','december']);
export const WORK_MONTH_NOT_SURE = 'not_sure';
const label = month => month[0].toUpperCase() + month.slice(1);
export const WORK_MONTH_FIELD = Object.freeze({
  name: 'workMonth',
  label: 'Month you want the work done',
  unit: null,
  type: 'enum',
  values: Object.freeze([...WORK_MONTHS, WORK_MONTH_NOT_SURE]),
  optionLabels: Object.freeze({...Object.fromEntries(WORK_MONTHS.map(month => [month, label(month)])), [WORK_MONTH_NOT_SURE]: 'Not sure'}),
  details: ['Busy-season pricing follows the month the work is done. If you are not sure, the busy-season price is shown.']
});
export function workMonthNumber(value) {
  const index = typeof value === 'string' ? WORK_MONTHS.indexOf(value.trim().toLowerCase()) : -1;
  return index < 0 ? null : index + 1;
}
export const validWorkMonth = value => value === WORK_MONTH_NOT_SURE || workMonthNumber(value) !== null;
export const workMonthName = month => label(WORK_MONTHS[month - 1]);
// The month the seasonal surcharge is priced for, and whether the busy-season
// price was assumed because no work month was given.
// A surcharge in every month is not a season: no month changes the price.
export function yearRoundSeason(months) {
  return Array.isArray(months) && WORK_MONTHS.every((_, index) => months.includes(index + 1));
}
export function seasonalPricingMonth(workMonth, months, percent) {
  const chosen = workMonthNumber(workMonth);
  if (chosen !== null) return {month: chosen, assumed: false};
  const busy = Array.isArray(months) && months.length > 0 && typeof percent === 'number' && percent > 0;
  if (busy && yearRoundSeason(months)) return {month: months[0], assumed: false};
  return busy ? {month: months[0], assumed: true} : {month: null, assumed: false};
}
// Busy months in season order: a December to February season reads
// December, January, February.
export function busySeasonMonths(months) {
  const set = new Set(months.filter(month => Number.isInteger(month) && month >= 1 && month <= 12));
  const sorted = [...set].sort((a, b) => a - b);
  const start = sorted.find(month => !set.has(month === 1 ? 12 : month - 1));
  if (start === undefined) return sorted;
  return [...sorted.filter(month => month >= start), ...sorted.filter(month => month < start)];
}
