import {quoteValidityEndsAtVNext,winterMonthApplies,parseMonthDay} from './quoteDoneBridge.js';

function record(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try { return record(JSON.parse(value)); } catch { return null; }
}
const storedResult = quoteRow => {
  const saved = record(quoteRow?.resultJson);
  return saved?.applicationOutcome?.internalResult || saved?.internalResult || saved;
};
const optionRecords = result => {
  const options = Array.isArray(result?.options) && result.options.length ? result.options : [result];
  return options.map(option => ({tierName: option?.tierName ?? null, calculationRecord: option?.calculationRecord})).filter(row => row.calculationRecord);
};
function localMonth(instant, timeZone) {
  try {
    const month = new Intl.DateTimeFormat('en-US', {timeZone, month: 'numeric'}).formatToParts(new Date(instant)).find(part => part.type === 'month')?.value;
    return Number(month) || null;
  } catch { return null; }
}

// The latest instant a job can be booked at this quote's price, or null when
// the quote states no validity period.
export function storedQuoteValidityEndsAt(quoteRow) {
  const result = storedResult(quoteRow), calc = result?.calculationRecord || optionRecords(result)[0]?.calculationRecord;
  if (!calc?.quoteDate) return null;
  try { return quoteValidityEndsAtVNext(calc.financialInputs?.businessDefaults || {}, calc.quoteDate); } catch { return null; }
}

// A booked job keeps the quoted price only while the quote is valid and the
// appointment falls in the same busy-season and winter concrete pricing as the
// quoted work month.
// Without a clock (now) only the season is checked; the booking intent's own
// expiry, capped at the quote's validity end, refuses an expired quote.
export function checkStoredQuoteBookingTerms({quoteRow, startAtUtc, timeZone, now = null, tierName = null}) {
  const result = storedResult(quoteRow);
  if (!result) return {ok: true};
  const ends = storedQuoteValidityEndsAt(quoteRow);
  if (now && ends !== null && now.getTime() >= ends) {
    return {ok: false, code: 'QUOTE_EXPIRED', message: 'This quote has expired. Request a new quote before booking the job.'};
  }
  const rows = optionRecords(result), chosen = rows.find(row => row.tierName === tierName) || rows[0];
  const month = localMonth(startAtUtc, timeZone);
  if (month === null) return {ok: true};
  const seasonal = chosen?.calculationRecord?.scenarios?.mid?.seasonal;
  if (seasonal && seasonal.percent > 0 && Array.isArray(seasonal.configuredMonths) && seasonal.configuredMonths.length
    && seasonal.configuredMonths.includes(month) !== Boolean(seasonal.seasonActive)) {
    return {ok: false, code: 'REQUOTE_REQUIRED', message: seasonal.seasonActive
      ? 'This quote was priced for busy-season work. The chosen date is outside the busy season, so request a new quote for that date before booking the job.'
      : 'This quote was priced for work outside the busy season. The chosen date is in the busy season, so request a new quote for that date before booking the job.'};
  }
  // The winter concrete charge follows the pour month the same way the quote
  // does (any day of the month in the winter dates). A quote with no work month
  // (Not sure) that includes the charge counts as priced for the winter period
  // (November 22, 2026). One priced at the assumed busy-season rate includes
  // the charge only when a busy month is in the winter period, so some month
  // always satisfies both checks.
  const winter = (chosen?.calculationRecord?.ruleApplications || []).find(rule => rule?.name === 'winterConcreteCharge');
  const dates = {winterConcreteStart: winter?.inputs?.winterConcreteStart, winterConcreteEnd: winter?.inputs?.winterConcreteEnd};
  if (winter && parseMonthDay(dates.winterConcreteStart) && parseMonthDay(dates.winterConcreteEnd)
    && winterMonthApplies(dates, month) !== Boolean(winter.result?.applied)) {
    return {ok: false, code: 'REQUOTE_REQUIRED', message: winter.result?.applied
      ? 'This quote was priced for concrete work in the winter period. The chosen date is outside the winter period, so request a new quote for that date before booking the job.'
      : 'This quote was priced for concrete work outside the winter period. The chosen date is in the winter period, so request a new quote for that date before booking the job.'};
  }
  return {ok: true};
}
