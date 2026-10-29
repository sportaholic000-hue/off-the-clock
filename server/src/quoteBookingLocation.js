import { checkQuoteBookingPostalCode, extractQuotedPostalCode, matchTravelZone, normalizePostalCode } from '../travelZones.js';
import { usageOwnerQuery } from './billingUsagePolicy.js';
import { checkStoredQuoteBookingTerms, storedQuoteValidityEndsAt } from './quoteBookingTerms.js';

function record(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try { return record(JSON.parse(value)); } catch { return null; }
}

// Match both addresses against the quote's immutable zones and charges.
// Old quotes without zone pricing (or without a postal code) keep their behavior.
export function checkStoredQuoteBookingAddress({ quoteRow, submissionRow, bookingPostalCode }) {
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
  return checkQuoteBookingPostalCode({
    quotedPostalCode,
    quotedTravelCharge: quotedZone.charge,
    bookingPostalCode,
    travelZones: defaults.travelZones
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

// A booked job keeps the quoted price only when the held date falls in the same
// busy-season pricing as the quoted work month. Quote expiry is enforced by the
// booking intent, whose expiry is capped at the quote's validity end.
export function assertQuoteBookingTerms(database, { ownerId, intentId, body }) {
  if (!body || typeof body !== 'object' || typeof body.holdId !== 'string') return;
  const query = usageOwnerQuery(database);
  const intent = query('SELECT sourceType, sourceId, serviceId FROM bookingIntents WHERE ownerId = ? AND id = ?').get(ownerId, intentId);
  if (!intent || intent.sourceType !== 'quote') return;
  const policy = query('SELECT bookingMode FROM bookingPolicies WHERE ownerId = ? AND serviceId = ?').get(ownerId, intent.serviceId);
  if (policy?.bookingMode !== 'book_job') return;
  const hold = query('SELECT startAtUtc FROM bookingHolds WHERE ownerId = ? AND id = ? AND intentId = ?').get(ownerId, body.holdId, intentId);
  if (!hold) return; // The booking service retains its existing hold errors.
  const settings = query('SELECT timezone FROM bookingSettings WHERE ownerId = ?').get(ownerId);
  const quoteRow = query('SELECT resultJson FROM quotes WHERE ownerId = ? AND id = ?').get(ownerId, intent.sourceId);
  const tierName = typeof body.tierName === 'string' && body.tierName.trim() ? body.tierName.trim() : null;
  const terms = checkStoredQuoteBookingTerms({ quoteRow, startAtUtc: hold.startAtUtc, timeZone: settings?.timezone, tierName });
  if (!terms.ok) {
    throw Object.assign(new Error(terms.message), {
      code: terms.code, statusCode: 409,
      details: { reason: terms.code, recoveryAction: 'REQUEST_NEW_QUOTE' }
    });
  }
}

// A booking link for a priced quote never outlasts the quote's validity, so an
// expired quote cannot be booked at its old price.
export function capQuoteIntentExpiry(database, args) {
  if (!args || args.sourceType !== 'quote') return args;
  const quoteRow = usageOwnerQuery(database)('SELECT resultJson FROM quotes WHERE ownerId = ? AND id = ?').get(args.ownerId, args.sourceId);
  const ends = storedQuoteValidityEndsAt(quoteRow), asked = Date.parse(args.expiresAtUtc);
  if (ends === null || !Number.isFinite(asked) || asked <= ends) return args;
  return { ...args, expiresAtUtc: new Date(ends).toISOString() };
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
    assertQuoteBookingTerms(database, args);
    return service.confirm(args);
  };
  const createIntent = args => service.createIntent(capQuoteIntentExpiry(database, args));
  return { ...service, createIntent, availability, getAvailability: availability, confirm, confirmBooking: confirm };
}
