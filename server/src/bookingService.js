import crypto from 'node:crypto';
import {
  createBookingToken,
  hashBookingToken,
  openSlotToken,
  requestDigest,
  sealSlotToken
} from './bookingTokens.js';
import {
  formatLocalIso,
  formatSlotLabel,
  generateCandidateSlots,
  intervalsOverlap,
  isValidIanaTimeZone
} from './calendarTime.js';

const HOLD_DURATION_MS = 5 * 60 * 1000;
const SLOT_TOKEN_DURATION_MS = 2 * 60 * 1000;
const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOOKING_MODES = new Set(['site_visit_first', 'book_job']);
const DIRECT_PROVIDER = 'google';
const RELEASED_QUOTE_RESULTS = new Set(['INSTANT_ESTIMATE_READY', 'PARTIAL_ESTIMATE_READY']);
const CONFIRMATION_HANDLE_KIND = 'booking-confirmation';
const CONFIRMATION_RETRY_SECONDS = 3;
const PENDING_APPOINTMENT_STATUSES = new Set(['CONFIRMING', 'PENDING_PROVIDER', 'PENDING_CONFIRMATION']);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(value, fallback) {
  try { return value === null || value === undefined || value === '' ? fallback : JSON.parse(value); }
  catch { return fallback; }
}

function instant(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} must be a valid instant.`);
  return date;
}

function nowFrom(clock) {
  return instant(clock(), 'Clock value');
}

function uuid(value) {
  return typeof value === 'string' && IDEMPOTENCY_KEY.test(value);
}

function safeInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function minInstant(...values) {
  return new Date(Math.min(...values.map(value => instant(value, 'Instant').getTime()))).toISOString();
}

function addMinutes(value, minutes) {
  return new Date(instant(value, 'Instant').getTime() + minutes * 60000).toISOString();
}

function combineRevision(settingsRevision, policyRevision) {
  return `${settingsRevision}:${policyRevision}`;
}

function errorBody(error) {
  return {
    error: error.message,
    code: error.code,
    ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
    ...(error.details === undefined ? {} : error.details)
  };
}

export class BookingServiceError extends Error {
  constructor(code, statusCode, message, { retryable, details } = {}) {
    super(message);
    this.name = 'BookingServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.details = details;
  }
}

function bookingError(code, statusCode, message, options) {
  return new BookingServiceError(code, statusCode, message, options);
}

function invalid(message, details) {
  return bookingError('INVALID_REQUEST', 400, message, { details });
}

function providerError(message = 'The calendar is temporarily unavailable.') {
  return bookingError('PROVIDER_UNAVAILABLE', 503, message, { retryable: true });
}

function confirmationNotFound() {
  return bookingError('CONFIRMATION_NOT_FOUND', 404, 'The booking confirmation was not found.');
}

function pendingConfirmationBody(confirmationId, appointmentId) {
  return {
    status: 'PENDING_CONFIRMATION',
    confirmationId,
    appointmentId,
    retryAfterSeconds: CONFIRMATION_RETRY_SECONDS
  };
}

function confirmedAppointmentBody(row) {
  return {
    status: 'CONFIRMED',
    appointmentId: row.id ?? row.appointmentId,
    bookingMode: row.bookingMode,
    startUtc: row.startAtUtc,
    endUtc: row.endAtUtc,
    startLocal: formatLocalIso(row.startAtUtc, row.timezone),
    endLocal: formatLocalIso(row.endAtUtc, row.timezone),
    timezone: row.timezone,
    provider: row.provider,
    calendarEventStatus: 'CONFIRMED'
  };
}

function failedConfirmationBody(code = 'PROVIDER_UNAVAILABLE') {
  return {
    status: 'FAILED',
    code,
    recoveryAction: 'REQUEST_NEW_SLOT'
  };
}

function normalizeBusy(value) {
  const rows = Array.isArray(value) ? value : Array.isArray(value?.intervals) ? value.intervals : Array.isArray(value?.busy) ? value.busy : null;
  if (!rows) throw providerError();
  return rows.map(row => {
    const startAtUtc = instant(row.startAtUtc ?? row.start, 'Busy interval start').toISOString();
    const endAtUtc = instant(row.endAtUtc ?? row.end, 'Busy interval end').toISOString();
    if (startAtUtc >= endAtUtc) throw providerError();
    return { startAtUtc, endAtUtc };
  });
}

function responseFromReceipt(row) {
  const body = parseJson(row.responseJson, null);
  if (!record(body)) throw new Error('Stored booking idempotency receipt is invalid.');
  if (row.httpStatus >= 400) {
    throw new BookingServiceError(
      typeof body.code === 'string' ? body.code : 'BOOKING_REQUEST_FAILED',
      row.httpStatus,
      typeof body.error === 'string' ? body.error : 'The booking request failed.',
      { retryable: body.retryable, details: Object.fromEntries(Object.entries(body).filter(([key]) => !['error', 'code', 'retryable'].includes(key))) }
    );
  }
  return { statusCode: row.httpStatus, body };
}

function policyConfiguration(row) {
  if (!row) return { capability: 'missing', reason: 'BOOKING_CONFIGURATION_INCOMPLETE' };
  if (row.provider === 'calendly') {
    const externalUrl = typeof row.externalUrl === 'string' && /^https:\/\//i.test(row.externalUrl) ? row.externalUrl : null;
    return externalUrl
      ? { capability: 'external', externalUrl }
      : { capability: 'missing', reason: 'BOOKING_CONFIGURATION_INCOMPLETE' };
  }
  const durationMinutes = row.bookingMode === 'site_visit_first' && !safeInteger(row.durationMinutes, { min: 1 })
    ? 45
    : row.durationMinutes;
  const weeklyAvailability = parseJson(row.weeklyAvailabilityJson, null);
  const blackouts = parseJson(row.blackoutsJson, null);
  const complete = row.directBookingEnabled === 1 && row.policyEnabled === 1 && row.provider === DIRECT_PROVIDER &&
    typeof row.calendarId === 'string' && row.calendarId.trim() && isValidIanaTimeZone(row.timezone) &&
    BOOKING_MODES.has(row.bookingMode) && safeInteger(durationMinutes, { min: 1, max: 10080 }) &&
    safeInteger(row.bookingHorizonDays, { min: 1, max: 366 }) &&
    safeInteger(row.minimumNoticeMinutes, { min: 0, max: 525600 }) &&
    safeInteger(row.slotIncrementMinutes, { min: 1, max: 1440 }) &&
    safeInteger(row.bufferBeforeMinutes, { min: 0, max: 1440 }) &&
    safeInteger(row.bufferAfterMinutes, { min: 0, max: 1440 }) &&
    record(weeklyAvailability) && Array.isArray(blackouts) &&
    typeof row.settingsRevision === 'string' && row.settingsRevision &&
    typeof row.policyRevision === 'string' && row.policyRevision;
  if (!complete) return { capability: 'missing', reason: 'BOOKING_CONFIGURATION_INCOMPLETE' };
  if (row.bookingMode === 'book_job' && row.intentResultType === 'ESTIMATE_REQUIRES_REVIEW') {
    return { capability: 'unavailable', reason: 'REVIEW_REQUIRES_SITE_VISIT' };
  }
  return {
    capability: 'direct',
    provider: row.provider,
    calendarId: row.calendarId,
    timezone: row.timezone,
    bookingMode: row.bookingMode,
    durationMinutes,
    bookingHorizonDays: row.bookingHorizonDays,
    minimumNoticeMinutes: row.minimumNoticeMinutes,
    slotIncrementMinutes: row.slotIncrementMinutes,
    bufferBeforeMinutes: row.bufferBeforeMinutes,
    bufferAfterMinutes: row.bufferAfterMinutes,
    weeklyAvailability,
    blackouts,
    policyRevision: combineRevision(row.settingsRevision, row.policyRevision)
  };
}

function safeIntent(row, now) {
  if (!row) throw bookingError('BOOKING_CONTEXT_NOT_FOUND', 404, 'The booking request was not found.');
  if (row.intentStatus !== 'ACTIVE' || instant(row.expiresAtUtc, 'Booking expiry') <= now) {
    throw bookingError('BOOKING_CONTEXT_EXPIRED', 410, 'This booking request has expired.');
  }
  return row;
}

function safeCustomer(customer) {
  if (!record(customer)) throw invalid('Customer contact details are required.');
  const name = typeof customer.name === 'string' ? customer.name.trim() : '';
  const email = typeof customer.email === 'string' ? customer.email.trim() : '';
  const phone = typeof customer.phone === 'string' ? customer.phone.trim() : '';
  if (!name || (!email && !phone)) throw invalid('Confirm the customer name and a callback email or phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('Enter a valid customer email address.');
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) throw invalid('Enter the customer phone number in international format.');
  return { name, email: email || null, phone: phone || null };
}

function safeLocation(location) {
  if (!record(location)) throw invalid('The project address is required.');
  const required = ['addressLine1', 'city', 'region', 'postalCode', 'country'];
  const clean = {};
  for (const key of [...required, 'addressLine2']) clean[key] = typeof location[key] === 'string' ? location[key].trim() : '';
  if (required.some(key => !clean[key])) throw invalid('Confirm the complete project address before booking.');
  clean.country = clean.country.toUpperCase();
  clean.region = clean.region.toUpperCase();
  return clean;
}

export function createBookingService({
  db,
  calendar,
  slotTokenSecret,
  clock = () => new Date(),
  randomUUID = crypto.randomUUID,
  randomBytes = crypto.randomBytes,
  holdDurationMs = HOLD_DURATION_MS,
  slotTokenDurationMs = SLOT_TOKEN_DURATION_MS
}) {
  if (!db || typeof db.prepare !== 'function' || typeof db.transaction !== 'function') {
    throw new TypeError('BookingService requires a better-sqlite3 compatible database.');
  }
  if (!calendar || typeof calendar.listBusy !== 'function' || typeof calendar.createEvent !== 'function') {
    throw new TypeError('BookingService requires a calendar adapter.');
  }
  if (!(typeof slotTokenSecret === 'string' || Buffer.isBuffer(slotTokenSecret)) ||
      Buffer.byteLength(slotTokenSecret) < 32) {
    throw new TypeError('BookingService requires a slot-token secret of at least 32 bytes.');
  }
  if (!safeInteger(holdDurationMs, { min: 1 }) || !safeInteger(slotTokenDurationMs, { min: 1 })) {
    throw new TypeError('Booking durations must be positive integer milliseconds.');
  }

  const policyStatement = db.prepare(`
    SELECT i.id AS intentId, i.ownerId, i.sourceType, i.sourceId, i.serviceId,
      i.resultType AS intentResultType, i.allowedTierNamesJson, i.status AS intentStatus,
      i.expiresAtUtc, s.revision AS settingsRevision, s.timezone, s.provider,
      s.calendarId, s.externalUrl, s.weeklyAvailabilityJson, s.blackoutsJson,
      s.bookingHorizonDays, s.minimumNoticeMinutes, s.slotIncrementMinutes,
      s.bufferBeforeMinutes, s.bufferAfterMinutes, s.directBookingEnabled,
      p.revision AS policyRevision, p.bookingMode, p.durationMinutes,
      p.enabled AS policyEnabled
    FROM bookingIntents AS i
    LEFT JOIN bookingSettings AS s ON s.ownerId = i.ownerId
    LEFT JOIN bookingPolicies AS p ON p.ownerId = i.ownerId AND p.serviceId = i.serviceId
    WHERE i.id = ? AND i.ownerId = ?
  `);
  const tokenIntentStatement = db.prepare(`
    SELECT id AS intentId, ownerId, status AS intentStatus, expiresAtUtc
    FROM bookingIntents WHERE tokenHash = ?
  `);
  const receiptStatement = db.prepare(`
    SELECT intentId, requestDigest, httpStatus, responseJson
    FROM bookingIdempotency
    WHERE ownerId = ? AND operation = ? AND idempotencyKey = ?
  `);
  const insertReceiptStatement = db.prepare(`
    INSERT INTO bookingIdempotency (
      ownerId, operation, idempotencyKey, intentId, requestDigest,
      httpStatus, responseJson, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateReceiptStatement = db.prepare(`
    UPDATE bookingIdempotency SET httpStatus = ?, responseJson = ?, updatedAt = ?
    WHERE ownerId = ? AND operation = ? AND idempotencyKey = ? AND intentId = ?
  `);

  function immediate(work) {
    return db.transaction(work).immediate();
  }

  function context(ownerId, intentId, now = nowFrom(clock)) {
    return safeIntent(policyStatement.get(intentId, ownerId), now);
  }

  function currentReceipt(ownerId, operation, idempotencyKey, intentId, digest) {
    const row = receiptStatement.get(ownerId, operation, idempotencyKey);
    if (!row) return null;
    if (row.intentId !== intentId || row.requestDigest !== digest) {
      throw bookingError('IDEMPOTENCY_CONFLICT', 409, 'This idempotency key was already used with different booking details.');
    }
    return responseFromReceipt(row);
  }

  function insertReceipt(ownerId, operation, idempotencyKey, intentId, digest, statusCode, body, nowIso) {
    insertReceiptStatement.run(
      ownerId, operation, idempotencyKey, intentId, digest,
      statusCode, JSON.stringify(body), nowIso, nowIso
    );
  }

  function updateReceipt(ownerId, operation, idempotencyKey, intentId, statusCode, body, nowIso) {
    updateReceiptStatement.run(
      statusCode, JSON.stringify(body), nowIso,
      ownerId, operation, idempotencyKey, intentId
    );
  }

  function validateIdempotencyKey(value) {
    if (!uuid(value)) throw invalid('A UUID Idempotency-Key is required.');
  }

  function storedErrorResult(error, ownerId, operation, idempotencyKey, intentId, digest, nowIso) {
    if (!(error instanceof BookingServiceError)) throw error;
    // A tenant mismatch is intentionally indistinguishable from a missing
    // intent and must not create a cross-tenant receipt referencing it.
    if (error.code === 'BOOKING_CONTEXT_NOT_FOUND') throw error;
    const body = errorBody(error);
    insertReceipt(ownerId, operation, idempotencyKey, intentId, digest, error.statusCode, body, nowIso);
    return { error, body };
  }

  function throwStored(error, body) {
    throw new BookingServiceError(error.code, error.statusCode, error.message, {
      retryable: error.retryable,
      details: Object.fromEntries(Object.entries(body).filter(([key]) => !['error', 'code', 'retryable'].includes(key)))
    });
  }

  function createIntent({ ownerId, sourceType, sourceId, serviceId, resultType, allowedTierNames = [], expiresAtUtc }) {
    if (typeof ownerId !== 'string' || !ownerId || !['quote', 'lead'].includes(sourceType) ||
        typeof sourceId !== 'string' || !sourceId || typeof serviceId !== 'string' || !serviceId) {
      throw invalid('A tenant, persisted source, and saved service are required for booking.');
    }
    if (![...RELEASED_QUOTE_RESULTS, 'ESTIMATE_REQUIRES_REVIEW'].includes(resultType)) {
      throw invalid('The booking source has an unsupported quote outcome.');
    }
    const now = nowFrom(clock);
    const expiry = instant(expiresAtUtc, 'Booking expiry');
    if (expiry <= now) throw invalid('Booking expiry must be in the future.');
    const tierNames = [...new Set((Array.isArray(allowedTierNames) ? allowedTierNames : []).map(String).map(value => value.trim()).filter(Boolean))];
    const id = randomUUID();
    const bookingToken = createBookingToken(randomBytes);
    db.prepare(`INSERT INTO bookingIntents (
      id, ownerId, tokenHash, sourceType, sourceId, serviceId, resultType,
      allowedTierNamesJson, status, expiresAtUtc, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`).run(
      id, ownerId, hashBookingToken(bookingToken), sourceType, sourceId, serviceId,
      resultType, JSON.stringify(tierNames), expiry.toISOString(), now.toISOString()
    );
    return { intentId: id, bookingToken, expiresAtUtc: expiry.toISOString() };
  }

  function resolveBookingToken(bookingToken) {
    const now = nowFrom(clock);
    const row = safeIntent(tokenIntentStatement.get(hashBookingToken(bookingToken)), now);
    return { ownerId: row.ownerId, intentId: row.intentId, expiresAtUtc: row.expiresAtUtc };
  }

  async function availability({ ownerId, intentId, filters = {} }) {
    if (!record(filters)) throw invalid('Availability filters must be an object.');
    const now = nowFrom(clock);
    const row = context(ownerId, intentId, now);
    const policy = policyConfiguration(row);
    if (policy.capability === 'external') {
      return { statusCode: 200, body: { status: 'EXTERNAL_HANDOFF', externalUrl: policy.externalUrl } };
    }
    if (policy.capability === 'missing') {
      return {
        statusCode: 200,
        body: {
          status: 'PREFERRED_TIME_ONLY',
          reason: policy.reason,
          ...(isValidIanaTimeZone(row.timezone) ? { timezone: row.timezone } : {})
        }
      };
    }
    if (policy.capability === 'unavailable') {
      return { statusCode: 200, body: { status: 'UNAVAILABLE', reason: policy.reason } };
    }
    let candidates;
    try {
      candidates = generateCandidateSlots({
        now,
        timeZone: policy.timezone,
        weeklyAvailability: policy.weeklyAvailability,
        blackouts: policy.blackouts,
        fromDate: filters.fromDate,
        days: filters.days ?? Math.min(7, policy.bookingHorizonDays),
        timeOfDay: filters.timeOfDay ?? [],
        durationMinutes: policy.durationMinutes,
        slotIncrementMinutes: policy.slotIncrementMinutes,
        minimumNoticeMinutes: policy.minimumNoticeMinutes,
        bookingHorizonDays: policy.bookingHorizonDays
      });
    } catch (error) {
      throw invalid(error.message);
    }
    if (!candidates.length) {
      return {
        statusCode: 200,
        body: {
          status: 'UNAVAILABLE', reason: 'NO_SLOTS', timezone: policy.timezone,
          bookingMode: policy.bookingMode, durationMinutes: policy.durationMinutes, slots: []
        }
      };
    }
    const rangeStart = addMinutes(candidates[0].startAtUtc, -policy.bufferBeforeMinutes);
    const rangeEnd = addMinutes(candidates[candidates.length - 1].endAtUtc, policy.bufferAfterMinutes);
    let providerBusy;
    try {
      providerBusy = normalizeBusy(await calendar.listBusy({
        ownerId, provider: policy.provider, calendarId: policy.calendarId,
        timeMinUtc: rangeStart, timeMaxUtc: rangeEnd
      }));
    } catch (error) {
      if (error instanceof BookingServiceError) throw error;
      throw providerError();
    }
    const nowIso = now.toISOString();
    const localHolds = db.prepare(`SELECT lockStartAtUtc, lockEndAtUtc FROM bookingHolds
      WHERE ownerId = ? AND calendarId = ?
        AND status IN ('HELD', 'CONFIRMING') AND expiresAtUtc > ?`).all(ownerId, policy.calendarId, nowIso);
    const localAppointments = db.prepare(`SELECT lockStartAtUtc, lockEndAtUtc FROM appointments
      WHERE ownerId = ? AND providerCalendarId = ?
        AND status IN ('CONFIRMING', 'PENDING_PROVIDER', 'PENDING_CONFIRMATION', 'CONFIRMED')`).all(ownerId, policy.calendarId);
    const blocked = [...localHolds, ...localAppointments]
      .filter(item => item.lockStartAtUtc && item.lockEndAtUtc)
      .map(item => ({ startAtUtc: item.lockStartAtUtc, endAtUtc: item.lockEndAtUtc }));
    const validUntilUtc = minInstant(
      new Date(now.getTime() + slotTokenDurationMs),
      row.expiresAtUtc
    );
    const slots = [];
    for (const candidate of candidates) {
      const lockStartAtUtc = addMinutes(candidate.startAtUtc, -policy.bufferBeforeMinutes);
      const lockEndAtUtc = addMinutes(candidate.endAtUtc, policy.bufferAfterMinutes);
      const unavailable = [...providerBusy, ...blocked].some(item =>
        intervalsOverlap(lockStartAtUtc, lockEndAtUtc, item.startAtUtc, item.endAtUtc)
      );
      if (unavailable) continue;
      const slotPayload = {
        ownerId,
        intentId,
        calendarId: policy.calendarId,
        provider: policy.provider,
        policyRevision: policy.policyRevision,
        startAtUtc: candidate.startAtUtc,
        endAtUtc: candidate.endAtUtc,
        lockStartAtUtc,
        lockEndAtUtc,
        expiresAtUtc: validUntilUtc
      };
      slots.push({
        slotId: sealSlotToken(slotPayload, slotTokenSecret),
        startUtc: candidate.startAtUtc,
        endUtc: candidate.endAtUtc,
        startLocal: candidate.startLocal,
        endLocal: candidate.endLocal,
        label: formatSlotLabel(candidate.startAtUtc, policy.timezone)
      });
    }
    return {
      statusCode: 200,
      body: {
        status: slots.length ? 'AVAILABLE' : 'UNAVAILABLE',
        ...(slots.length ? {} : { reason: 'NO_SLOTS' }),
        timezone: policy.timezone,
        bookingMode: policy.bookingMode,
        durationMinutes: policy.durationMinutes,
        validUntilUtc,
        slots
      }
    };
  }

  function validateSlot(slotId, ownerId, intentId, row, now, { checkExpiry = true } = {}) {
    let payload;
    try { payload = openSlotToken(slotId, slotTokenSecret); }
    catch { throw invalid('The selected time is invalid or has been changed.'); }
    const policy = policyConfiguration(row);
    if (policy.capability !== 'direct') throw bookingError('SCHEDULE_CHANGED', 409, 'Booking settings changed. Request fresh availability.');
    const fields = ['calendarId', 'policyRevision', 'startAtUtc', 'endAtUtc', 'lockStartAtUtc', 'lockEndAtUtc', 'expiresAtUtc'];
    if (payload.ownerId !== ownerId || payload.intentId !== intentId || payload.provider !== policy.provider ||
        fields.some(field => typeof payload[field] !== 'string')) {
      throw invalid('The selected time is invalid or has been changed.');
    }
    if (payload.calendarId !== policy.calendarId || payload.policyRevision !== policy.policyRevision) {
      throw bookingError('SCHEDULE_CHANGED', 409, 'Booking settings changed. Request fresh availability.');
    }
    if (checkExpiry && instant(payload.expiresAtUtc, 'Slot expiry') <= now) {
      throw bookingError('SLOT_UNAVAILABLE', 409, 'That time is no longer available. Request fresh availability.');
    }
    const duration = (instant(payload.endAtUtc, 'Slot end') - instant(payload.startAtUtc, 'Slot start')) / 60000;
    if (duration !== policy.durationMinutes || payload.startAtUtc >= payload.endAtUtc ||
        payload.lockStartAtUtc > payload.startAtUtc || payload.lockEndAtUtc < payload.endAtUtc) {
      throw invalid('The selected time is invalid or has been changed.');
    }
    return { payload, policy };
  }

  function hold({ ownerId, intentId, idempotencyKey, slotId }) {
    validateIdempotencyKey(idempotencyKey);
    const digest = requestDigest({ intentId, slotId });
    const transactionResult = immediate(() => {
      const existing = currentReceipt(ownerId, 'hold', idempotencyKey, intentId, digest);
      if (existing) return { existing };
      const now = nowFrom(clock);
      const nowIso = now.toISOString();
      try {
        const row = context(ownerId, intentId, now);
        const { payload } = validateSlot(slotId, ownerId, intentId, row, now);
        db.prepare(`UPDATE bookingHolds SET status = 'EXPIRED', updatedAt = ?
          WHERE ownerId = ? AND status = 'HELD' AND expiresAtUtc <= ?`).run(nowIso, ownerId, nowIso);
        const conflictingHold = db.prepare(`SELECT id FROM bookingHolds
          WHERE ownerId = ? AND calendarId = ? AND status IN ('HELD', 'CONFIRMING')
            AND expiresAtUtc > ? AND lockStartAtUtc < ? AND lockEndAtUtc > ?
          LIMIT 1`).get(ownerId, payload.calendarId, nowIso, payload.lockEndAtUtc, payload.lockStartAtUtc);
        const conflictingAppointment = db.prepare(`SELECT id FROM appointments
          WHERE ownerId = ? AND providerCalendarId = ?
            AND status IN ('CONFIRMING', 'PENDING_PROVIDER', 'PENDING_CONFIRMATION', 'CONFIRMED')
            AND lockStartAtUtc < ? AND lockEndAtUtc > ?
          LIMIT 1`).get(ownerId, payload.calendarId, payload.lockEndAtUtc, payload.lockStartAtUtc);
        if (conflictingHold || conflictingAppointment) {
          throw bookingError('SLOT_UNAVAILABLE', 409, 'That time was just taken. Request fresh availability.');
        }
        const holdId = randomUUID();
        const expiresAtUtc = minInstant(new Date(now.getTime() + holdDurationMs), row.expiresAtUtc);
        db.prepare(`INSERT INTO bookingHolds (
          id, ownerId, intentId, calendarId, slotIdDigest, startAtUtc, endAtUtc,
          lockStartAtUtc, lockEndAtUtc, policyRevision, status, expiresAtUtc,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'HELD', ?, ?, ?)`).run(
          holdId, ownerId, intentId, payload.calendarId, requestDigest(slotId),
          payload.startAtUtc, payload.endAtUtc, payload.lockStartAtUtc,
          payload.lockEndAtUtc, payload.policyRevision, expiresAtUtc, nowIso, nowIso
        );
        const body = {
          status: 'HELD', holdId, expiresAtUtc,
          slot: {
            slotId,
            startUtc: payload.startAtUtc,
            endUtc: payload.endAtUtc,
            startLocal: formatLocalIso(payload.startAtUtc, policyConfiguration(row).timezone),
            endLocal: formatLocalIso(payload.endAtUtc, policyConfiguration(row).timezone),
            label: formatSlotLabel(payload.startAtUtc, policyConfiguration(row).timezone)
          }
        };
        insertReceipt(ownerId, 'hold', idempotencyKey, intentId, digest, 201, body, nowIso);
        return { response: { statusCode: 201, body } };
      } catch (error) {
        return storedErrorResult(error, ownerId, 'hold', idempotencyKey, intentId, digest, nowIso);
      }
    });
    if (transactionResult.existing) return transactionResult.existing;
    if (transactionResult.error) throwStored(transactionResult.error, transactionResult.body);
    return transactionResult.response;
  }

  function releaseHold({ ownerId, intentId, idempotencyKey, holdId }) {
    validateIdempotencyKey(idempotencyKey);
    if (!uuid(holdId)) throw invalid('A valid hold is required.');
    const operation = 'release_hold';
    const digest = requestDigest({ intentId, holdId });
    const transactionResult = immediate(() => {
      const existing = currentReceipt(ownerId, operation, idempotencyKey, intentId, digest);
      if (existing) return { existing };
      const now = nowFrom(clock);
      const nowIso = now.toISOString();
      try {
        context(ownerId, intentId, now);
        const holdRow = db.prepare(`SELECT id, status, expiresAtUtc FROM bookingHolds
          WHERE id = ? AND ownerId = ? AND intentId = ?`).get(holdId, ownerId, intentId);
        if (!holdRow) throw bookingError('HOLD_NOT_FOUND', 404, 'The held time was not found.');
        if (holdRow.status === 'CONFIRMING' || holdRow.status === 'CONFIRMED') {
          throw bookingError('HOLD_NOT_RELEASABLE', 409, 'This hold cannot be released after confirmation has started.');
        }
        if (!['HELD', 'EXPIRED', 'RELEASED'].includes(holdRow.status)) {
          throw bookingError('HOLD_NOT_RELEASABLE', 409, 'This hold cannot be released.');
        }
        if (holdRow.status !== 'RELEASED') {
          db.prepare(`UPDATE bookingHolds SET status = 'RELEASED', updatedAt = ?
            WHERE id = ? AND ownerId = ? AND intentId = ?`).run(nowIso, holdId, ownerId, intentId);
        }
        const body = { status: 'RELEASED', holdId };
        insertReceipt(ownerId, operation, idempotencyKey, intentId, digest, 200, body, nowIso);
        return { response: { statusCode: 200, body } };
      } catch (error) {
        return storedErrorResult(error, ownerId, operation, idempotencyKey, intentId, digest, nowIso);
      }
    });
    if (transactionResult.existing) return transactionResult.existing;
    if (transactionResult.error) throwStored(transactionResult.error, transactionResult.body);
    return transactionResult.response;
  }

  function validateConfirmation(row, holdRow, slotId, body, now) {
    if (!record(body) || body.explicitConfirmation !== true || body.addressConfirmation !== true) {
      throw invalid('Explicit date, time, and address confirmation is required.');
    }
    if (requestDigest(slotId) !== holdRow.slotIdDigest) throw invalid('The confirmed time does not match the held time.');
    const { payload, policy } = validateSlot(slotId, row.ownerId, row.intentId, row, now, { checkExpiry: false });
    if (payload.startAtUtc !== holdRow.startAtUtc || payload.endAtUtc !== holdRow.endAtUtc ||
        payload.lockStartAtUtc !== holdRow.lockStartAtUtc || payload.lockEndAtUtc !== holdRow.lockEndAtUtc) {
      throw invalid('The confirmed time does not match the held time.');
    }
    if (holdRow.policyRevision !== policy.policyRevision) {
      throw bookingError('SCHEDULE_CHANGED', 409, 'Booking settings changed. Request fresh availability.');
    }
    const customer = safeCustomer(body.customer);
    const location = safeLocation(body.location);
    const tiers = parseJson(row.allowedTierNamesJson, null);
    if (!Array.isArray(tiers) || tiers.some(name => typeof name !== 'string' || !name.trim())) {
      throw bookingError('SCHEDULE_CHANGED', 409, 'The quote options changed. Request fresh booking details.');
    }
    const tierName = typeof body.tierName === 'string' ? body.tierName.trim() : '';
    if (tierName && (!Array.isArray(tiers) || !tiers.includes(tierName))) throw invalid('Choose a current quote option before booking.');
    if (policy.bookingMode === 'book_job') {
      if (!RELEASED_QUOTE_RESULTS.has(row.intentResultType)) {
        throw bookingError('QUOTE_NEEDS_DETAILS', 422, 'This request needs a site visit or owner review before the job can be booked.');
      }
      if (Array.isArray(tiers) && tiers.length && !tierName) throw invalid('Choose a quote option before booking the job.');
    }
    return { payload, policy, customer, location, tierName: tierName || null };
  }

  function providerEventId(ownerId, appointmentId) {
    return `b${crypto.createHash('sha256').update(`${ownerId}\0${appointmentId}`, 'utf8').digest('hex').slice(0, 31)}`;
  }

  function createConfirmationId({ ownerId, intentId, appointmentId, expiresAtUtc }) {
    return sealSlotToken({
      kind: CONFIRMATION_HANDLE_KIND,
      ownerId,
      intentId,
      appointmentId,
      expiresAtUtc
    }, slotTokenSecret);
  }

  function openConfirmationId(confirmationId, expected, now) {
    let payload;
    try { payload = openSlotToken(confirmationId, slotTokenSecret); }
    catch { throw confirmationNotFound(); }
    if (!record(payload) || payload.kind !== CONFIRMATION_HANDLE_KIND ||
        payload.ownerId !== expected.ownerId || payload.intentId !== expected.intentId ||
        !uuid(payload.appointmentId) || typeof payload.expiresAtUtc !== 'string') {
      throw confirmationNotFound();
    }
    try {
      if (instant(payload.expiresAtUtc, 'Confirmation expiry') <= now) throw confirmationNotFound();
    } catch (error) {
      if (error instanceof BookingServiceError) throw error;
      throw confirmationNotFound();
    }
    return payload;
  }

  function finalizeError({ ownerId, intentId, idempotencyKey, appointmentId, holdId, error, releaseHold }) {
    const now = nowFrom(clock);
    const nowIso = now.toISOString();
    const body = errorBody(error);
    immediate(() => {
      db.prepare(`UPDATE appointments SET status = ?, providerEventStatus = ?, updatedAt = ?
        WHERE id = ? AND ownerId = ?`).run(
        error.code === 'SLOT_UNAVAILABLE' ? 'CONFLICTED' : 'PROVIDER_FAILED',
        error.code, nowIso, appointmentId, ownerId
      );
      const holdRow = db.prepare('SELECT expiresAtUtc FROM bookingHolds WHERE id = ? AND ownerId = ?').get(holdId, ownerId);
      const holdStatus = releaseHold ? 'RELEASED' : holdRow && instant(holdRow.expiresAtUtc, 'Hold expiry') > now ? 'HELD' : 'EXPIRED';
      db.prepare('UPDATE bookingHolds SET status = ?, updatedAt = ? WHERE id = ? AND ownerId = ?')
        .run(holdStatus, nowIso, holdId, ownerId);
      updateReceipt(ownerId, 'confirm', idempotencyKey, intentId, error.statusCode, body, nowIso);
    });
    throwStored(error, body);
  }

  function finalizePending({ ownerId, intentId, idempotencyKey, appointmentId, confirmationId, holdId, providerEventId: eventId }) {
    const nowIso = nowFrom(clock).toISOString();
    const body = pendingConfirmationBody(confirmationId, appointmentId);
    immediate(() => {
      db.prepare(`UPDATE appointments SET status = 'PENDING_CONFIRMATION',
        providerEventId = ?, providerEventStatus = 'PENDING_CONFIRMATION', updatedAt = ?
        WHERE id = ? AND ownerId = ?`).run(eventId, nowIso, appointmentId, ownerId);
      db.prepare(`UPDATE bookingHolds SET status = 'CONFIRMING', updatedAt = ?
        WHERE id = ? AND ownerId = ?`).run(nowIso, holdId, ownerId);
      updateReceipt(ownerId, 'confirm', idempotencyKey, intentId, 202, body, nowIso);
    });
    return { statusCode: 202, body };
  }

  function finalizeConfirmed({ ownerId, intentId, idempotencyKey, appointmentId, holdId, providerEventId: eventId, result }) {
    const nowIso = nowFrom(clock).toISOString();
    const body = confirmedAppointmentBody({ id: appointmentId, ...result });
    immediate(() => {
      db.prepare(`UPDATE appointments SET status = 'CONFIRMED', providerEventId = ?,
        providerEventStatus = 'CONFIRMED', confirmedAt = ?, updatedAt = ?
        WHERE id = ? AND ownerId = ?`).run(eventId, nowIso, nowIso, appointmentId, ownerId);
      db.prepare(`UPDATE bookingHolds SET status = 'CONFIRMED', updatedAt = ?
        WHERE id = ? AND ownerId = ?`).run(nowIso, holdId, ownerId);
      db.prepare(`INSERT OR IGNORE INTO outboxEvents (
        id, ownerId, eventType, aggregateId, payloadJson, status, createdAt, updatedAt
      ) VALUES (?, ?, 'appointment.booked', ?, ?, 'PENDING', ?, ?)`).run(
        `${appointmentId}:booked`, ownerId, appointmentId, JSON.stringify(body), nowIso, nowIso
      );
      updateReceipt(ownerId, 'confirm', idempotencyKey, intentId, 201, body, nowIso);
    });
    return { statusCode: 201, body };
  }

  async function confirm({ ownerId, intentId, idempotencyKey, body }) {
    validateIdempotencyKey(idempotencyKey);
    const digest = requestDigest({ intentId, body });
    const phase = immediate(() => {
      const existing = currentReceipt(ownerId, 'confirm', idempotencyKey, intentId, digest);
      if (existing) return { existing };
      const now = nowFrom(clock);
      const nowIso = now.toISOString();
      try {
        const row = context(ownerId, intentId, now);
        if (!record(body) || !uuid(body.holdId) || typeof body.confirmedSlotId !== 'string') {
          throw invalid('A valid hold and confirmed slot are required.');
        }
        const holdRow = db.prepare(`SELECT * FROM bookingHolds
          WHERE id = ? AND ownerId = ? AND intentId = ?`).get(body.holdId, ownerId, intentId);
        if (!holdRow || holdRow.status !== 'HELD' || instant(holdRow.expiresAtUtc, 'Hold expiry') <= now) {
          if (holdRow && holdRow.status === 'HELD') {
            db.prepare(`UPDATE bookingHolds SET status = 'EXPIRED', updatedAt = ?
              WHERE id = ? AND ownerId = ?`).run(nowIso, body.holdId, ownerId);
          }
          throw bookingError('HOLD_EXPIRED', 410, 'The held time has expired. Request fresh availability.');
        }
        const validated = validateConfirmation(row, holdRow, body.confirmedSlotId, body, now);
        const conflictingAppointment = db.prepare(`SELECT id FROM appointments
          WHERE ownerId = ? AND providerCalendarId = ?
            AND status IN ('CONFIRMING', 'PENDING_PROVIDER', 'PENDING_CONFIRMATION', 'CONFIRMED')
            AND lockStartAtUtc < ? AND lockEndAtUtc > ? LIMIT 1`).get(
          ownerId, holdRow.calendarId, holdRow.lockEndAtUtc, holdRow.lockStartAtUtc
        );
        if (conflictingAppointment) throw bookingError('SLOT_UNAVAILABLE', 409, 'That time was just taken. Request fresh availability.', { details: { slots: [] } });
        const appointmentId = randomUUID();
        const eventId = providerEventId(ownerId, appointmentId);
        const confirmationId = createConfirmationId({
          ownerId,
          intentId,
          appointmentId,
          expiresAtUtc: row.expiresAtUtc
        });
        db.prepare(`UPDATE bookingHolds SET status = 'CONFIRMING', updatedAt = ?
          WHERE id = ? AND ownerId = ?`).run(nowIso, holdRow.id, ownerId);
        db.prepare(`INSERT INTO appointments (
          id, ownerId, customerId, quoteId, serviceType, bookingMode, datetime,
          durationMinutes, status, depositRequested, depositPaid, createdAt,
          bookingIntentId, holdId, provider, providerCalendarId, providerEventId,
          providerEventStatus, startAtUtc, endAtUtc, lockStartAtUtc, lockEndAtUtc,
          timezone, policyRevision, tierChosen, customerJson, locationJson,
          confirmedAt, updatedAt
        ) VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, 'PENDING_PROVIDER', 0, 0, ?,
          ?, ?, ?, ?, ?, 'PENDING_PROVIDER', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`).run(
          appointmentId, ownerId, row.sourceType === 'quote' ? row.sourceId : null,
          validated.policy.bookingMode, holdRow.startAtUtc, validated.policy.durationMinutes,
          nowIso, intentId, holdRow.id, validated.policy.provider, validated.policy.calendarId,
          eventId, holdRow.startAtUtc, holdRow.endAtUtc, holdRow.lockStartAtUtc,
          holdRow.lockEndAtUtc, validated.policy.timezone, validated.policy.policyRevision,
          validated.tierName, JSON.stringify(validated.customer), JSON.stringify(validated.location), nowIso
        );
        const pendingBody = pendingConfirmationBody(confirmationId, appointmentId);
        insertReceipt(ownerId, 'confirm', idempotencyKey, intentId, digest, 202, pendingBody, nowIso);
        return {
          appointmentId,
          confirmationId,
          providerEventId: eventId,
          holdRow,
          row,
          ...validated
        };
      } catch (error) {
        return storedErrorResult(error, ownerId, 'confirm', idempotencyKey, intentId, digest, nowIso);
      }
    });
    if (phase.existing) return phase.existing;
    if (phase.error) throwStored(phase.error, phase.body);

    let busy;
    try {
      busy = normalizeBusy(await calendar.listBusy({
        ownerId,
        provider: phase.policy.provider,
        calendarId: phase.policy.calendarId,
        timeMinUtc: phase.holdRow.lockStartAtUtc,
        timeMaxUtc: phase.holdRow.lockEndAtUtc
      }));
    } catch (error) {
      return finalizeError({
        ownerId, intentId, idempotencyKey,
        appointmentId: phase.appointmentId, holdId: phase.holdRow.id,
        error: error instanceof BookingServiceError ? error : providerError(),
        releaseHold: false
      });
    }
    if (busy.some(interval => intervalsOverlap(
      phase.holdRow.lockStartAtUtc, phase.holdRow.lockEndAtUtc,
      interval.startAtUtc, interval.endAtUtc
    ))) {
      return finalizeError({
        ownerId, intentId, idempotencyKey,
        appointmentId: phase.appointmentId, holdId: phase.holdRow.id,
        error: bookingError('SLOT_UNAVAILABLE', 409, 'That time was just taken. Request fresh availability.', { details: { slots: [] } }),
        releaseHold: true
      });
    }

    const providerRequest = {
      ownerId,
      provider: phase.policy.provider,
      calendarId: phase.policy.calendarId,
      eventId: phase.providerEventId,
      appointmentId: phase.appointmentId,
      startAtUtc: phase.holdRow.startAtUtc,
      endAtUtc: phase.holdRow.endAtUtc,
      timezone: phase.policy.timezone,
      bookingMode: phase.policy.bookingMode,
      customer: phase.customer,
      location: phase.location,
      sourceType: phase.row.sourceType,
      sourceId: phase.row.sourceId,
      tierName: phase.tierName
    };
    let providerResult;
    try {
      providerResult = await calendar.createEvent(providerRequest);
    } catch (error) {
      if (!error?.ambiguous) {
        return finalizeError({
          ownerId, intentId, idempotencyKey,
          appointmentId: phase.appointmentId, holdId: phase.holdRow.id,
          error: providerError(), releaseHold: false
        });
      }
      try {
        const recovered = typeof calendar.getEvent === 'function'
          ? await calendar.getEvent({
              ownerId, provider: phase.policy.provider, calendarId: phase.policy.calendarId,
              eventId: phase.providerEventId
            })
          : null;
        providerResult = recovered ? { status: 'CONFIRMED', eventId: recovered.eventId || phase.providerEventId } : { status: 'PENDING_CONFIRMATION' };
      } catch {
        providerResult = { status: 'PENDING_CONFIRMATION' };
      }
    }
    const status = String(providerResult?.status || 'PENDING_CONFIRMATION').toUpperCase();
    if (status === 'FAILED') {
      return finalizeError({
        ownerId, intentId, idempotencyKey,
        appointmentId: phase.appointmentId, holdId: phase.holdRow.id,
        error: providerError(), releaseHold: false
      });
    }
    const result = {
      provider: phase.policy.provider,
      bookingMode: phase.policy.bookingMode,
      timezone: phase.policy.timezone,
      startAtUtc: phase.holdRow.startAtUtc,
      endAtUtc: phase.holdRow.endAtUtc
    };
    if (status !== 'CONFIRMED') {
      return finalizePending({
        ownerId, intentId, idempotencyKey,
        appointmentId: phase.appointmentId, confirmationId: phase.confirmationId,
        holdId: phase.holdRow.id,
        providerEventId: providerResult?.eventId || phase.providerEventId
      });
    }
    return finalizeConfirmed({
      ownerId, intentId, idempotencyKey,
      appointmentId: phase.appointmentId, holdId: phase.holdRow.id,
      providerEventId: providerResult?.eventId || phase.providerEventId,
      result
    });
  }

  async function getConfirmationStatus({ bookingToken, confirmationId }) {
    const resolved = resolveBookingToken(bookingToken);
    const now = nowFrom(clock);
    const handle = openConfirmationId(confirmationId, resolved, now);
    const appointmentStatement = db.prepare(`SELECT * FROM appointments
      WHERE id = ? AND ownerId = ? AND bookingIntentId = ?`);
    let appointment = appointmentStatement.get(handle.appointmentId, resolved.ownerId, resolved.intentId);
    if (!appointment) throw confirmationNotFound();
    if (appointment.status === 'CONFIRMED') {
      return { statusCode: 200, body: confirmedAppointmentBody(appointment) };
    }
    if (!PENDING_APPOINTMENT_STATUSES.has(appointment.status)) {
      const code = appointment.status === 'CONFLICTED' ? 'SLOT_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE';
      return { statusCode: 200, body: failedConfirmationBody(code) };
    }

    let providerResult = null;
    if (typeof calendar.getEvent === 'function') {
      try {
        providerResult = await calendar.getEvent({
          ownerId: resolved.ownerId,
          provider: appointment.provider,
          calendarId: appointment.providerCalendarId,
          eventId: appointment.providerEventId
        });
      } catch {
        providerResult = null;
      }
    }
    if (!providerResult) {
      return { statusCode: 200, body: pendingConfirmationBody(confirmationId, appointment.id) };
    }

    const providerStatus = typeof providerResult.status === 'string'
      ? providerResult.status.toUpperCase()
      : 'CONFIRMED';
    if (['FAILED', 'CANCELLED', 'CANCELED'].includes(providerStatus)) {
      const nowIso = nowFrom(clock).toISOString();
      immediate(() => {
        const transition = db.prepare(`UPDATE appointments SET status = 'PROVIDER_FAILED',
          providerEventStatus = 'PROVIDER_UNAVAILABLE', updatedAt = ?
          WHERE id = ? AND ownerId = ? AND bookingIntentId = ?
            AND status IN ('CONFIRMING', 'PENDING_PROVIDER', 'PENDING_CONFIRMATION')`).run(
          nowIso, appointment.id, resolved.ownerId, resolved.intentId
        );
        if (transition.changes === 1) {
          db.prepare(`UPDATE bookingHolds SET status = 'RELEASED', updatedAt = ?
            WHERE id = ? AND ownerId = ? AND intentId = ?
              AND status = 'CONFIRMING'`).run(
            nowIso, appointment.holdId, resolved.ownerId, resolved.intentId
          );
        }
      });
      appointment = appointmentStatement.get(handle.appointmentId, resolved.ownerId, resolved.intentId);
      if (appointment?.status === 'CONFIRMED') {
        return { statusCode: 200, body: confirmedAppointmentBody(appointment) };
      }
      const code = appointment?.status === 'CONFLICTED' ? 'SLOT_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE';
      return { statusCode: 200, body: failedConfirmationBody(code) };
    }
    if (providerStatus !== 'CONFIRMED') {
      return { statusCode: 200, body: pendingConfirmationBody(confirmationId, appointment.id) };
    }

    const nowIso = nowFrom(clock).toISOString();
    immediate(() => {
      const transition = db.prepare(`UPDATE appointments SET status = 'CONFIRMED', providerEventId = ?,
        providerEventStatus = 'CONFIRMED', confirmedAt = ?, updatedAt = ?
        WHERE id = ? AND ownerId = ? AND bookingIntentId = ?
          AND status IN ('CONFIRMING', 'PENDING_PROVIDER', 'PENDING_CONFIRMATION')`).run(
        providerResult.eventId || appointment.providerEventId,
        nowIso,
        nowIso,
        appointment.id,
        resolved.ownerId,
        resolved.intentId
      );
      if (transition.changes === 1) {
        db.prepare(`UPDATE bookingHolds SET status = 'CONFIRMED', updatedAt = ?
          WHERE id = ? AND ownerId = ? AND intentId = ?
            AND status = 'CONFIRMING'`).run(
          nowIso, appointment.holdId, resolved.ownerId, resolved.intentId
        );
        const body = confirmedAppointmentBody(appointment);
        db.prepare(`INSERT OR IGNORE INTO outboxEvents (
          id, ownerId, eventType, aggregateId, payloadJson, status, createdAt, updatedAt
        ) VALUES (?, ?, 'appointment.booked', ?, ?, 'PENDING', ?, ?)`).run(
          `${appointment.id}:booked`, resolved.ownerId, appointment.id,
          JSON.stringify(body), nowIso, nowIso
        );
      }
    });
    appointment = appointmentStatement.get(handle.appointmentId, resolved.ownerId, resolved.intentId);
    if (appointment?.status === 'CONFIRMED') {
      return { statusCode: 200, body: confirmedAppointmentBody(appointment) };
    }
    if (appointment && !PENDING_APPOINTMENT_STATUSES.has(appointment.status)) {
      const code = appointment.status === 'CONFLICTED' ? 'SLOT_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE';
      return { statusCode: 200, body: failedConfirmationBody(code) };
    }
    return { statusCode: 200, body: pendingConfirmationBody(confirmationId, handle.appointmentId) };
  }

  return {
    createIntent,
    resolveBookingToken,
    availability,
    getAvailability: availability,
    hold,
    holdSlot: hold,
    releaseHold,
    confirm,
    confirmBooking: confirm,
    getConfirmationStatus
  };
}

