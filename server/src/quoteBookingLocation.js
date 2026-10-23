import { loadPricebook } from '../priceBookService.js';
import { checkQuoteBookingPostalCode, extractQuotedPostalCode, matchTravelZone, normalizePostalCode } from '../travelZones.js';
import { usageOwnerQuery } from './billingUsagePolicy.js';

function record(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try { return record(JSON.parse(value)); } catch { return null; }
}

// Use the immutable calculation evidence, not today's charge at the quoted code.
// Old quotes without zone pricing (or without a postal code) keep their behavior.
export function checkStoredQuoteBookingAddress({ quoteRow, submissionRow, bookingPostalCode, ownerId, loadBook = loadPricebook }) {
  const saved = record(submissionRow?.internalOutcomeJson) || record(quoteRow?.resultJson);
  const result = saved?.applicationOutcome?.internalResult || saved?.internalResult || saved;
  const quotedPostalCode = normalizePostalCode(result?.submittedCustomerInputs?.postalCode)
    || extractQuotedPostalCode({ quoteRow, submissionRow });
  const lines = result?.calculationRecord?.options?.flatMap(option => option.lineItems || []) || result?.lineItems || [];
  const carriesZoneCharge = lines.some(line =>
    line.category === 'travel' && line.calculation?.ratePath === 'businessDefaults.travelFee');
  if (!carriesZoneCharge) return { ok: true };
  const defaults = result?.calculationRecord?.financialInputs?.businessDefaults;
  const quotedZone = matchTravelZone(quotedPostalCode, defaults?.travelZones);
  if (!quotedPostalCode || quotedZone.status !== 'matched' || !Number.isSafeInteger(quotedZone.charge)) {
    return { ok: true };
  }
  const book = loadBook(ownerId);
  return checkQuoteBookingPostalCode({
    quotedPostalCode,
    quotedTravelCharge: quotedZone.charge,
    bookingPostalCode,
    travelZones: book?.defaults?.travelZones
  });
}

export function assertQuoteBookingAddress(database, { ownerId, intentId, location }) {
  const query = usageOwnerQuery(database);
  const intent = query('SELECT sourceType, sourceId FROM bookingIntents WHERE ownerId = ? AND id = ?').get(ownerId, intentId);
  if (!intent) return; // The booking service retains its existing context errors.
  // Released full/partial quotes live in quotes; review leads have no priced
  // travel charge to bind. Legacy booking-only contexts need no submission table.
  if (intent.sourceType !== 'quote') return;
  const quoteRow = query('SELECT customerInputsJson, resultJson FROM quotes WHERE ownerId = ? AND id = ?').get(ownerId, intent.sourceId);
  const check = checkStoredQuoteBookingAddress({ quoteRow, bookingPostalCode: location?.postalCode, ownerId });
  if (!check.ok) {
    throw Object.assign(new Error(check.message), {
      code: 'REQUOTE_REQUIRED', statusCode: 409,
      details: { reason: check.reason, recoveryAction: 'CHANGE_JOB_DETAILS', fields: ['postalCode'] }
    });
  }
}

// Keep the rule at the returned service boundary. The original booking flow,
// calendar/service-area decisions and frozen route declarations remain intact.
export function withQuoteBookingLocationGuard(service, database) {
  const availability = async args => {
    assertQuoteBookingAddress(database, { ...args, location: args.filters?.location });
    return service.availability(args);
  };
  const confirm = async args => {
    assertQuoteBookingAddress(database, { ...args, location: args.body?.location });
    return service.confirm(args);
  };
  return { ...service, availability, getAvailability: availability, confirm, confirmBooking: confirm };
}
