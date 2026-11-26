import { checkQuoteBookingPostalCode, extractQuotedPostalCode, matchTravelZone, normalizePostalCode } from '../travelZones.js';
import { knownBusinessCountry, quotedTaxRateAt, serviceTaxRateBlank, taxByJobLocationActive } from '../taxJurisdiction.js';
import { usageOwnerQuery } from './billingUsagePolicy.js';
import { checkStoredQuoteBookingTerms, storedQuoteValidityEndsAt } from './quoteBookingTerms.js';

function record(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try { return record(JSON.parse(value)); } catch { return null; }
}

// Match both addresses against the quote's immutable zones and charges.
// Old quotes without zone pricing (or without a postal code) keep their behavior.
function taxRateDependsOnAddress(taxedAt, defaults, serviceRate) {
  if (!taxedAt) return false;
  if (['province', 'tax_zone', 'outside_country'].includes(taxedAt.source)) return true;
  if (serviceRate === 0 || !['TAX_ALL', 'TAX_MATERIALS'].includes(defaults.taxMode)) return false;
  return taxByJobLocationActive(defaults) || knownBusinessCountry(defaults) === 'CA';
}
export function checkStoredQuoteBookingAddress({ quoteRow, submissionRow, bookingPostalCode }) {
  const saved = record(submissionRow?.internalOutcomeJson) || record(quoteRow?.resultJson);
  const result = saved?.applicationOutcome?.internalResult || saved?.internalResult || saved;
  const quotedPostalCode = normalizePostalCode(result?.submittedCustomerInputs?.postalCode)
    || extractQuotedPostalCode({ quoteRow, submissionRow });
  // A quote taxed at its job location (or at the service's own rate, or with
  // no tax outside the business's country) keeps that rate only at an address
  // the same rate applies to, worked out as the quote was.
  const taxedAt = result?.calculationRecord?.options?.map(option => option?.scenarios?.mid?.tax?.location).find(Boolean);
  // A quote whose tax rate could be different at another address can only be
  // booked where the postal or ZIP code is known: a blank code skipped the
  // check (Neon audit of v48 #14; v49 NEW-8 added the business-rate quotes of
  // a business taxing by job location, or in Canada, where another province
  // has another rate).
  const serviceRate = result?.calculationRecord?.ownerConfiguration?.taxPercent;
  if (taxRateDependsOnAddress(taxedAt, result?.calculationRecord?.financialInputs?.businessDefaults || {}, serviceRate) && !normalizePostalCode(bookingPostalCode)) return {
    ok: false, reason: 'POSTAL_CODE_REQUIRED', quotedPostalCode,
    message: 'Enter the postal or ZIP code of the job address before booking.'
  };
  if (taxedAt && normalizePostalCode(bookingPostalCode)) {
    const booked = quotedTaxRateAt(bookingPostalCode, result?.calculationRecord?.financialInputs?.businessDefaults || {}, serviceTaxRateBlank(serviceRate) ? null : serviceRate);
    if (booked.status !== 'ok' || booked.percent !== taxedAt.percent) return {
      ok: false, reason: 'TAX_RATE_MISMATCH', quotedPostalCode, bookingPostalCode: normalizePostalCode(bookingPostalCode),
      message: 'This address needs a new quote before booking.'
    };
  }
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

// A quote booked as the job itself is priced for its work date (busy season,
// winter concrete). Returns what the date check needs, or null when it does
// not apply (not a quote, or a site visit first).
function quoteTermsContext(query, ownerId, intentId) {
  const intent = query('SELECT sourceType, sourceId, serviceId FROM bookingIntents WHERE ownerId = ? AND id = ?').get(ownerId, intentId);
  if (!intent || intent.sourceType !== 'quote') return null;
  const policy = query('SELECT bookingMode FROM bookingPolicies WHERE ownerId = ? AND serviceId = ?').get(ownerId, intent.serviceId);
  if (policy?.bookingMode !== 'book_job') return null;
  const settings = query('SELECT timezone FROM bookingSettings WHERE ownerId = ?').get(ownerId);
  const quoteRow = query('SELECT resultJson FROM quotes WHERE ownerId = ? AND id = ?').get(ownerId, intent.sourceId);
  return { quoteRow, timeZone: settings?.timezone };
}
const termsTier = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const termsError = terms => Object.assign(new Error(terms.message), {
  code: terms.code, statusCode: 409,
  details: { reason: terms.code, recoveryAction: 'REQUEST_NEW_QUOTE' }
});

// A booked job keeps the quoted price only when the held date falls in the same
// busy-season pricing as the quoted work month. Quote expiry is enforced by the
// booking intent, whose expiry is capped at the quote's validity end.
export function assertQuoteBookingTerms(database, { ownerId, intentId, body }) {
  if (!body || typeof body !== 'object' || typeof body.holdId !== 'string') return;
  const hold = usageOwnerQuery(database)('SELECT startAtUtc FROM bookingHolds WHERE ownerId = ? AND id = ? AND intentId = ?').get(ownerId, body.holdId, intentId);
  if (!hold) return; // The booking service retains its existing hold errors.
  const tierName = typeof body.tierName === 'string' && body.tierName.trim() ? body.tierName.trim() : null;
  assertQuoteBookingTermsAt(database, { ownerId, intentId, startAtUtc: hold.startAtUtc, tierName });
}

// The same busy-season check for a given start time: a new booking's held
// time, or the new time of a reschedule.
export function assertQuoteBookingTermsAt(database, { ownerId, intentId, startAtUtc, tierName = null }) {
  const query = usageOwnerQuery(database);
  const context = quoteTermsContext(query, ownerId, intentId);
  if (!context) return;
  const terms = checkStoredQuoteBookingTerms({ ...context, startAtUtc, tierName: termsTier(tierName) });
  if (!terms.ok) throw termsError(terms);
}

// The date check for one time on a booking intent: {ok:true} where it does
// not apply. Used by a phone reschedule before the calendar changes (Neon
// audit of v50, V50-1); the booking service makes the same check with
// assertQuoteBookingTermsAt when the reschedule is saved.
export function checkQuoteTermsAt(database, { ownerId, intentId, startAtUtc, tierName }) {
  const context = quoteTermsContext(usageOwnerQuery(database), ownerId, intentId);
  if (!context || typeof startAtUtc !== 'string') return { ok: true };
  return checkStoredQuoteBookingTerms({ ...context, startAtUtc, tierName: termsTier(tierName) });
}

// Offer only times confirm would accept (Neon v49 NEW-4). When the caller's
// dates are all on the other side of the busy season or winter period, answer
// with confirm's own reason so a new quote is requested before choosing a time.
export function filterAvailabilityByQuoteTerms(database, { ownerId, intentId, filters }, result) {
  const body = result?.body;
  if (!body || body.status !== 'AVAILABLE' || !Array.isArray(body.slots)) return result;
  const context = quoteTermsContext(usageOwnerQuery(database), ownerId, intentId);
  if (!context) return result;
  let refused = null;
  const slots = body.slots.filter(slot => {
    const terms = checkStoredQuoteBookingTerms({ ...context, startAtUtc: slot.startUtc, tierName: termsTier(filters?.tierName) });
    if (!terms.ok) refused ||= terms;
    return terms.ok;
  });
  if (!refused) return result;
  if (!slots.length) throw termsError(refused);
  return { ...result, body: { ...body, slots } };
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
    return filterAvailabilityByQuoteTerms(database, args, await service.availability(args));
  };
  const confirm = async input => {
    // A quote with exactly one option is booked under that option when none
    // is sent: the website shows no option picker for one option (Neon audit
    // of v50, V50-2).
    let args = input;
    if (input?.body && typeof input.body === 'object' && !(typeof input.body.tierName === 'string' && input.body.tierName.trim())) {
      const intent = usageOwnerQuery(database)('SELECT allowedTierNamesJson FROM bookingIntents WHERE ownerId = ? AND id = ?').get(input.ownerId, input.intentId);
      let tiers = [];
      try { tiers = JSON.parse(intent?.allowedTierNamesJson || '[]'); } catch { tiers = []; }
      if (Array.isArray(tiers) && tiers.length === 1 && typeof tiers[0] === 'string') args = { ...input, body: { ...input.body, tierName: tiers[0] } };
    }
    assertQuoteBookingAddress(database, { ...args, location: args.body?.location });
    assertQuoteBookingTerms(database, args);
    return service.confirm(args);
  };
  const createIntent = args => service.createIntent(capQuoteIntentExpiry(database, args));
  // A reschedule offers only times the quote price holds for, under the
  // option the customer booked (Neon audit of v50, V50-1).
  const appointmentAvailability = typeof service.appointmentAvailability === 'function' ? async args => {
    const result = await service.appointmentAvailability(args);
    const row = usageOwnerQuery(database)('SELECT tierChosen FROM appointments WHERE ownerId = ? AND id = ?').get(args.ownerId, args.appointmentId);
    return filterAvailabilityByQuoteTerms(database, { ownerId: args.ownerId, intentId: result?.intentId, filters: { tierName: row?.tierChosen } }, result);
  } : service.appointmentAvailability;
  return { ...service, createIntent, availability, getAvailability: availability, confirm, confirmBooking: confirm, appointmentAvailability };
}
