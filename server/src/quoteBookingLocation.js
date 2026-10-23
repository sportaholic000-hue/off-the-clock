import { loadPricebook } from '../priceBookService.js';
import { checkQuoteBookingPostalCode, extractQuotedPostalCode, matchTravelZone } from '../travelZones.js';
import { usageOwnerQuery } from './billingUsagePolicy.js';

function record(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try { return record(JSON.parse(value)); } catch { return null; }
}

// Use the immutable calculation evidence, not today's charge at the quoted code.
// Old quotes without zone pricing (or without a postal code) keep their behavior.
export function checkStoredQuoteBookingAddress({ quoteRow, submissionRow, bookingPostalCode, ownerId, loadBook = loadPricebook }) {
  const quotedPostalCode = extractQuotedPostalCode({ quoteRow, submissionRow });
  const saved = record(submissionRow?.internalOutcomeJson) || record(quoteRow?.resultJson);
  const result = saved?.applicationOutcome?.internalResult || saved?.internalResult || saved;
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
  const submissionRow = query('SELECT originalSubmissionJson, internalOutcomeJson FROM quoteSubmissions WHERE ownerId = ? AND bookingIntentId = ?').get(ownerId, intentId);
  const quoteRow = intent.sourceType === 'quote'
    ? query('SELECT customerInputsJson, resultJson FROM quotes WHERE ownerId = ? AND id = ?').get(ownerId, intent.sourceId)
    : null;
  const check = checkStoredQuoteBookingAddress({ quoteRow, submissionRow, bookingPostalCode: location?.postalCode, ownerId });
  if (!check.ok) {
    throw Object.assign(new Error(check.message), {
      code: 'REQUOTE_REQUIRED', statusCode: 409,
      details: { reason: check.reason, recoveryAction: 'CHANGE_JOB_DETAILS', fields: ['postalCode'] }
    });
  }
}

// Decorate the application boundary so the pinned booking service and routes stay
// byte-identical. Every existing calendar/service-area decision stays in them.
export function withQuoteBookingLocationGuard(service, database) {
  const availability = args => {
    assertQuoteBookingAddress(database, { ...args, location: args.filters?.location });
    return service.availability(args);
  };
  const confirm = args => {
    assertQuoteBookingAddress(database, { ...args, location: args.body?.location });
    return service.confirm(args);
  };
  return Object.freeze({ ...service, availability, confirm, confirmBooking: confirm });
}
