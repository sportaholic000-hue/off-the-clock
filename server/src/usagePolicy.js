// Owner-locked launch policy. Integer minutes/cents; no provider-duration rounding.
export const VOICE_USAGE_POLICY = Object.freeze({
  includedMinutes: Object.freeze({ Operator: 300, QuoteDone: 1200 }),
  trialMinutes: 60,
  overageUnitCents: 35,
  rounding: 'CEIL_PER_CONNECTED_CALL',
  attribution: 'ANSWERED_START',
  annualAllowanceInterval: 'month'
});

export function utcMilliseconds(value, field = 'Timestamp') {
  if (typeof value === 'number' && Number.isSafeInteger(value) && Number.isFinite(new Date(value).getTime())) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new TypeError(field + ' must be an exact UTC ISO timestamp or epoch milliseconds.');
  const result = Date.parse(value);
  if (!Number.isSafeInteger(result) || new Date(result).toISOString() !== value) throw new TypeError(field + ' is invalid.');
  return result;
}

export function billedCallMinutes(answeredStartAt, answeredEndAt) {
  const start = utcMilliseconds(answeredStartAt, 'Answered start');
  const end = utcMilliseconds(answeredEndAt, 'Answered end');
  const durationMs = end - start;
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) throw new TypeError('Answered end must not precede answered start.');
  return { start, end, durationMs, minutes: Math.ceil(durationMs / 60000) };
}
