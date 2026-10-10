import {usageOwnerQuery} from './billingUsagePolicy.js';
import {linkWidgetBookingLead} from './widgetBookingLead.js';
import crypto from 'node:crypto';
import { serviceAreaFromKnowledgeBase, serviceAreaDecision } from './serviceArea.js';
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
const CHANGE_PREPARATION_LEASE_MS = 120000;
const CHANGE_SETTLE_MS = 30000;
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

// A lookup/create acknowledgement proves a booking only for this deterministic
// event and both instants the customer confirmed. Never substitute the provider's
// identity or silently accept an event moved to another day or duration.
function confirmationStatus(result, expected) {
  if (!record(result) || result.eventId !== expected.eventId || typeof result.status !== 'string') return 'PENDING_CONFIRMATION';
  const status = result.status.toUpperCase();
  if (['FAILED', 'CANCELLED', 'CANCELED'].includes(status)) return status;
  if (status !== 'CONFIRMED') return 'PENDING_CONFIRMATION';
  const timed = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  if (!timed(result.startAtUtc) || !timed(result.endAtUtc) || Date.parse(result.endAtUtc) <= Date.parse(result.startAtUtc)) return 'PENDING_CONFIRMATION';
  return Date.parse(result.startAtUtc) === Date.parse(expected.startAtUtc) && Date.parse(result.endAtUtc) === Date.parse(expected.endAtUtc) ? 'CONFIRMED' : 'PENDING_CONFIRMATION';
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

  const policyStatement = usageOwnerQuery(db)(`
    SELECT i.id AS intentId, i.ownerId, i.sourceType, i.sourceId, i.serviceId,
      i.resultType AS intentResultType, i.allowedTierNamesJson, i.status AS intentStatus,
      i.expiresAtUtc, s.revision AS settingsRevision, s.timezone, s.provider,
      s.calendarId, s.externalUrl, s.weeklyAvailabilityJson, s.blackoutsJson,
      s.bookingHorizonDays, s.minimumNoticeMinutes, s.slotIncrementMinutes,
      s.bufferBeforeMinutes, s.bufferAfterMinutes, s.directBookingEnabled,
      p.revision AS policyRevision, p.bookingMode, p.durationMinutes,
      p.enabled AS policyEnabled, profile.knowledgeBaseJson
    FROM bookingIntents AS i
    LEFT JOIN bookingSettings AS s ON s.ownerId = i.ownerId
    LEFT JOIN bookingPolicies AS p ON p.ownerId = i.ownerId AND p.serviceId = i.serviceId
    LEFT JOIN businessProfiles AS profile ON profile.ownerId = i.ownerId
    WHERE i.id = ? AND i.ownerId = ?
  `);
  const tokenIntentStatement = db.prepare(`
    SELECT id AS intentId, ownerId, status AS intentStatus, expiresAtUtc
    FROM bookingIntents WHERE tokenHash = ?
  `);
  const receiptStatement = usageOwnerQuery(db)(`
    SELECT intentId, requestDigest, httpStatus, responseJson
    FROM bookingIdempotency
    WHERE ownerId = ? AND operation = ? AND idempotencyKey = ?
  `);
  const insertReceiptStatement = usageOwnerQuery(db)(`
    INSERT INTO bookingIdempotency (
      ownerId, operation, idempotencyKey, intentId, requestDigest,
      httpStatus, responseJson, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateReceiptStatement = usageOwnerQuery(db)(`
    UPDATE bookingIdempotency SET httpStatus = ?, responseJson = ?, updatedAt = ?
    WHERE ownerId = ? AND operation = ? AND idempotencyKey = ? AND intentId = ?
  `);

  function immediate(work) {
    return db.transaction(work).immediate();
  }

  const changesInFlight=new Set();
  const changeRow=(ownerId,id)=>usageOwnerQuery(db)('SELECT * FROM appointmentChanges WHERE ownerId=? AND id=?').get(ownerId,id);
  function changeResult(change) {
    const slot=parseJson(change.newSlotJson,null);
    return {status:change.status==='CONFIRMED'?'CONFIRMED':change.status==='REJECTED'?'REJECTED':'PENDING_CONFIRMATION',
      appointmentId:change.appointmentId,action:change.action,
      ...(change.status==='CONFIRMED'&&slot?{startUtc:slot.startAtUtc,endUtc:slot.endAtUtc}:{}),
      ...(change.lastError?{reason:change.lastError}:{})};
  }
  function finishChange(change,{rejected=false,reason=null}={}) {
    return immediate(()=>{
      const current=changeRow(change.ownerId,change.id);
      if(!current||!['PREPARING','PENDING'].includes(current.status))return current;
      const old=parseJson(current.oldSlotJson,{}),next=parseJson(current.newSlotJson,null),at=nowFrom(clock).toISOString();
      const appointment=usageOwnerQuery(db)("SELECT * FROM appointments WHERE ownerId=? AND id=? AND providerEventStatus='CHANGE_PENDING'").get(current.ownerId,current.appointmentId);
      if(!appointment||appointment.bookingIntentId!==old.bookingIntentId||appointment.holdId!==old.holdId)throw providerError('The appointment change needs reconciliation.');
      if(rejected){
        usageOwnerQuery(db)("UPDATE appointments SET status='CONFIRMED',providerEventStatus=?,updatedAt=? WHERE ownerId=? AND id=?")
          .run(old.providerEventStatus,at,current.ownerId,current.appointmentId);
        if(next)usageOwnerQuery(db)("UPDATE bookingHolds SET status='RELEASED',updatedAt=? WHERE ownerId=? AND id=? AND intentId=?")
          .run(at,current.ownerId,next.id,next.intentId);
      }else{
        if(current.action==='cancel')usageOwnerQuery(db)("UPDATE appointments SET status='CANCELLED',providerEventStatus='CANCELLED',updatedAt=? WHERE ownerId=? AND id=?")
          .run(at,current.ownerId,current.appointmentId);
        else{
          const lock=usageOwnerQuery(db)("SELECT * FROM bookingHolds WHERE ownerId=? AND id=? AND intentId=? AND status='CONFIRMING'").get(current.ownerId,next.id,next.intentId);
          if(!lock)throw providerError('The replacement slot needs reconciliation.');
          usageOwnerQuery(db)("UPDATE appointments SET status='CONFIRMED',bookingIntentId=?,holdId=?,startAtUtc=?,endAtUtc=?,datetime=?,lockStartAtUtc=?,lockEndAtUtc=?,providerEventStatus='CONFIRMED',updatedAt=? WHERE ownerId=? AND id=?")
            .run(lock.intentId,lock.id,lock.startAtUtc,lock.endAtUtc,lock.startAtUtc,lock.lockStartAtUtc,lock.lockEndAtUtc,at,current.ownerId,current.appointmentId);
          usageOwnerQuery(db)("UPDATE bookingHolds SET status='CONFIRMED',updatedAt=? WHERE ownerId=? AND id=? AND intentId=?")
            .run(at,current.ownerId,lock.id,lock.intentId);
        }
        if(old.holdId)usageOwnerQuery(db)("UPDATE bookingHolds SET status='RELEASED',updatedAt=? WHERE ownerId=? AND id=? AND intentId=?")
          .run(at,current.ownerId,old.holdId,old.bookingIntentId);
      }
      usageOwnerQuery(db)('UPDATE appointmentChanges SET status=?,lastError=?,completedAt=?,updatedAt=? WHERE ownerId=? AND id=?')
        .run(rejected?'REJECTED':'CONFIRMED',reason,at,at,current.ownerId,current.id);
      usageOwnerQuery(db)("INSERT OR IGNORE INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES(?,?,'appointment.changed',?,?,'PENDING',?,?)")
        .run(current.id+'-changed',current.ownerId,current.appointmentId,JSON.stringify({appointmentId:current.appointmentId,action:current.action,
          status:rejected?'REJECTED':'CONFIRMED',reason,startAtUtc:rejected?old.startAtUtc:next?.startAtUtc||null,endAtUtc:rejected?old.endAtUtc:next?.endAtUtc||null}),at,at);
      // A delayed read can resolve a request whose voice call has already ended.
      usageOwnerQuery(db)("UPDATE outboxEvents SET status=?,updatedAt=? WHERE ownerId=? AND id=? AND eventType='voice.appointment_change_requested'")
        .run(rejected?'FAILED':'CONFIRMED',at,current.ownerId,current.id);
      return changeRow(current.ownerId,current.id);
    });
  }
  async function reconcileAppointmentChange({ownerId,appointmentId}) {
    let change=usageOwnerQuery(db)("SELECT * FROM appointmentChanges WHERE ownerId=? AND appointmentId=? AND status IN ('PREPARING','PENDING') ORDER BY rowid DESC LIMIT 1").get(ownerId,appointmentId);
    if(!change||changesInFlight.has(change.id))return change;
    if(change.status==='PREPARING')return nowFrom(clock).getTime()-Date.parse(change.updatedAt)<CHANGE_PREPARATION_LEASE_MS?change:finishChange(change,{rejected:true,reason:'PREPARATION_INTERRUPTED'});
    if(change.lastError==='CALENDAR_REQUEST_REJECTED')return finishChange(change,{rejected:true,reason:change.lastError});
    const appointment=usageOwnerQuery(db)('SELECT * FROM appointments WHERE ownerId=? AND id=?').get(ownerId,appointmentId);
    if(!appointment||typeof calendar.getEvent!=='function')return change;
    let event;
    try{event=await calendar.getEvent({ownerId,provider:appointment.provider,calendarId:appointment.providerCalendarId,eventId:appointment.providerEventId});}
    catch{return change;}
    const next=parseJson(change.newSlotJson,null);
    const status=confirmationStatus(event,{eventId:appointment.providerEventId,startAtUtc:next?.startAtUtc,endAtUtc:next?.endAtUtc});
    if(change.action==='cancel'&&['CANCELLED','CANCELED'].includes(status)||change.action==='reschedule'&&status==='CONFIRMED')return finishChange(change);
    // Seeing the old time alone cannot prove rejection: a delayed PATCH may
    // still finish. Only retire a guarded write after its original version is
    // gone. A missing event must never enter the booking-create retry path.
    const old=parseJson(change.oldSlotJson,{});
    const original=confirmationStatus(event,{eventId:appointment.providerEventId,startAtUtc:old.startAtUtc,endAtUtc:old.endAtUtc});
    if(original==='CONFIRMED'&&old.etag&&event.etag){
      if(event.etag!==old.etag)return finishChange(change,{rejected:true,reason:'ORIGINAL_SLOT_RECONCILED'});
      if(change.lastError==='ORIGINAL_SLOT_STILL_PRESENT'&&nowFrom(clock).getTime()-Date.parse(change.updatedAt)>=CHANGE_SETTLE_MS&&typeof calendar.fenceEventChange==='function'){
        try{
          const fenced=await calendar.fenceEventChange({ownerId,calendarId:appointment.providerCalendarId,eventId:appointment.providerEventId,ifMatch:old.etag,operationId:change.id});
          if(confirmationStatus(fenced,{eventId:appointment.providerEventId,startAtUtc:old.startAtUtc,endAtUtc:old.endAtUtc})==='CONFIRMED'&&fenced.etag&&fenced.etag!==old.etag)return finishChange(change,{rejected:true,reason:'ORIGINAL_SLOT_RECONCILED'});
        }catch{/* Read again, including after a lost fence response or a 412. */}
        return changeRow(ownerId,change.id);
      }
    }
    if(original==='CONFIRMED'&&change.lastError==='ORIGINAL_SLOT_STILL_PRESENT')return change;
    usageOwnerQuery(db)("UPDATE appointmentChanges SET lastError=?,updatedAt=? WHERE ownerId=? AND id=? AND status='PENDING'")
      .run(original==='CONFIRMED'?'ORIGINAL_SLOT_STILL_PRESENT':'PROVIDER_CONFIRMATION_PENDING',nowFrom(clock).toISOString(),ownerId,change.id);
    return changeRow(ownerId,change.id);
  }
  async function reconcilePendingAppointmentChanges({ownerId}) {
    const rows=usageOwnerQuery(db)("SELECT appointmentId FROM appointmentChanges WHERE ownerId=? AND status IN ('PREPARING','PENDING') ORDER BY requestedAt,id").all(ownerId);
    for(const row of rows)await reconcileAppointmentChange({ownerId,appointmentId:row.appointmentId});
  }
  function startChangeReconciler({enabled=()=>true,onError=()=>{},intervalMs=30000}={}) {
    let running=null,stopped=false;
    const tick=()=>{
      if(stopped||running||!enabled())return running;
      running=(async()=>{
        const owners=db.prepare("SELECT DISTINCT ownerId FROM appointmentChanges WHERE status IN ('PREPARING','PENDING') ORDER BY ownerId").all();
        for(const {ownerId} of owners){if(stopped)break;try{await reconcilePendingAppointmentChanges({ownerId});}catch{onError('APPOINTMENT_CHANGE_RECONCILIATION_PENDING');}}
      })().finally(()=>{running=null;});return running;
    };
    const timer=setInterval(tick,intervalMs);timer.unref?.();void tick();
    return async()=>{stopped=true;clearInterval(timer);if(running)await running;};
  }

  function context(ownerId, intentId, now = nowFrom(clock)) {
    return safeIntent(policyStatement.get(intentId, ownerId), now);
  }

  const preparationsInFlight = new Set();

  function requireUnbookedIntent(ownerId, intentId) {
    const appointment = usageOwnerQuery(db)(`SELECT id, status FROM appointments
      WHERE ownerId = ? AND bookingIntentId = ?
        AND status IN ('CONFIRMING', 'PENDING_PROVIDER', 'PENDING_CONFIRMATION', 'CONFIRMED')
      LIMIT 1`).get(ownerId, intentId);
    if (appointment) throw bookingError('BOOKING_ALREADY_EXISTS', 409,
      appointment.status === 'CONFIRMED'
        ? 'This quote already has a confirmed appointment. Contact the business to change it.'
        : 'An appointment confirmation is already in progress for this quote. Check that confirmation before choosing another time.');
  }

  function releaseInterruptedPreparation(appointment) {
    // PREPARING is durable proof that createEvent has not started. An old
    // handler must atomically leave this phase before writing to the provider.
    // A new service instance can therefore release an interrupted preparation
    // without guessing whether an ambiguous provider write succeeded.
    if (appointment.providerEventStatus !== 'PREPARING' || preparationsInFlight.has(appointment.id)) return;
    immediate(() => {
      const nowIso = nowFrom(clock).toISOString();
      const revoked = usageOwnerQuery(db)(`UPDATE appointments SET status = 'PROVIDER_FAILED',
        providerEventStatus = 'CONFIRMATION_INTERRUPTED', updatedAt = ?
        WHERE id = ? AND ownerId = ? AND bookingIntentId = ?
          AND status = 'PENDING_PROVIDER' AND providerEventStatus = 'PREPARING'`).run(
        nowIso, appointment.id, appointment.ownerId, appointment.bookingIntentId
      );
      if (revoked.changes === 1) usageOwnerQuery(db)(`UPDATE bookingHolds SET status = 'RELEASED', updatedAt = ?
        WHERE id = ? AND ownerId = ? AND intentId = ? AND status = 'CONFIRMING'`).run(
        nowIso, appointment.holdId, appointment.ownerId, appointment.bookingIntentId
      );
    });
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
    if (![...RELEASED_QUOTE_RESULTS, 'ESTIMATE_REQUIRES_REVIEW','APPOINTMENT_REQUEST'].includes(resultType)) {
      throw invalid('The booking source has an unsupported quote outcome.');
    }
    if(resultType==='APPOINTMENT_REQUEST'&&(sourceType!=='lead'||serviceId!=='voice-appointment'||!usageOwnerQuery(db)('SELECT id FROM leads WHERE ownerId=? AND id=?').get(ownerId,sourceId)))throw invalid('A saved owner-scoped lead is required for an appointment request.');
    const now = nowFrom(clock);
    const expiry = instant(expiresAtUtc, 'Booking expiry');
    if (expiry <= now) throw invalid('Booking expiry must be in the future.');
    const tierNames = [...new Set((Array.isArray(allowedTierNames) ? allowedTierNames : []).map(String).map(value => value.trim()).filter(Boolean))];
    const id = randomUUID();
    const bookingToken = createBookingToken(randomBytes);
    usageOwnerQuery(db)(`INSERT INTO bookingIntents (
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
    requireUnbookedIntent(ownerId, intentId);
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
    const coverage = serviceAreaDecision(serviceAreaFromKnowledgeBase(row.knowledgeBaseJson), filters.location);
    if (!coverage.eligible) {
      return {
        statusCode: 200,
        body: { status: 'PREFERRED_TIME_ONLY', reason: coverage.reason, timezone: policy.timezone }
      };
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
    const localHolds = usageOwnerQuery(db)(`SELECT lockStartAtUtc, lockEndAtUtc FROM bookingHolds
      WHERE ownerId = ? AND calendarId = ?
        AND status IN ('HELD', 'CONFIRMING') AND expiresAtUtc > ?`).all(ownerId, policy.calendarId, nowIso);
    const localAppointments = usageOwnerQuery(db)(`SELECT lockStartAtUtc, lockEndAtUtc FROM appointments
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
        requireUnbookedIntent(ownerId, intentId);
        const { payload } = validateSlot(slotId, ownerId, intentId, row, now);
        usageOwnerQuery(db)(`UPDATE bookingHolds SET status = 'EXPIRED', updatedAt = ?
          WHERE ownerId = ? AND status = 'HELD' AND expiresAtUtc <= ?`).run(nowIso, ownerId, nowIso);
        const conflictingHold = usageOwnerQuery(db)(`SELECT id FROM bookingHolds
          WHERE ownerId = ? AND calendarId = ? AND status IN ('HELD', 'CONFIRMING')
            AND expiresAtUtc > ? AND lockStartAtUtc < ? AND lockEndAtUtc > ?
          LIMIT 1`).get(ownerId, payload.calendarId, nowIso, payload.lockEndAtUtc, payload.lockStartAtUtc);
        const conflictingAppointment = usageOwnerQuery(db)(`SELECT id FROM appointments
          WHERE ownerId = ? AND providerCalendarId = ?
            AND status IN ('CONFIRMING', 'PENDING_PROVIDER', 'PENDING_CONFIRMATION', 'CONFIRMED')
            AND lockStartAtUtc < ? AND lockEndAtUtc > ?
          LIMIT 1`).get(ownerId, payload.calendarId, payload.lockEndAtUtc, payload.lockStartAtUtc);
        if (conflictingHold || conflictingAppointment) {
          throw bookingError('SLOT_UNAVAILABLE', 409, 'That time was just taken. Request fresh availability.');
        }
        const holdId = randomUUID();
        const expiresAtUtc = minInstant(new Date(now.getTime() + holdDurationMs), row.expiresAtUtc);
        usageOwnerQuery(db)(`INSERT INTO bookingHolds (
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
        const holdRow = usageOwnerQuery(db)(`SELECT id, status, expiresAtUtc FROM bookingHolds
          WHERE id = ? AND ownerId = ? AND intentId = ?`).get(holdId, ownerId, intentId);
        if (!holdRow) throw bookingError('HOLD_NOT_FOUND', 404, 'The held time was not found.');
        if (holdRow.status === 'CONFIRMING' || holdRow.status === 'CONFIRMED') {
          throw bookingError('HOLD_NOT_RELEASABLE', 409, 'This hold cannot be released after confirmation has started.');
        }
        if (!['HELD', 'EXPIRED', 'RELEASED'].includes(holdRow.status)) {
          throw bookingError('HOLD_NOT_RELEASABLE', 409, 'This hold cannot be released.');
        }
        if (holdRow.status !== 'RELEASED') {
          usageOwnerQuery(db)(`UPDATE bookingHolds SET status = 'RELEASED', updatedAt = ?
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
    if (Date.parse(payload.startAtUtc) < now.getTime() + policy.minimumNoticeMinutes * 60000) {
      throw bookingError('SLOT_UNAVAILABLE', 409, 'That time is no longer available. Request fresh availability.');
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
      if (!RELEASED_QUOTE_RESULTS.has(row.intentResultType)&&row.intentResultType!=='APPOINTMENT_REQUEST') {
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
    const interrupted = immediate(() => {
      const current = usageOwnerQuery(db)('SELECT status, providerEventStatus FROM appointments WHERE id = ? AND ownerId = ? AND bookingIntentId = ?').get(appointmentId, ownerId, intentId);
      if (!current || !PENDING_APPOINTMENT_STATUSES.has(current.status)) return true;
      usageOwnerQuery(db)(`UPDATE appointments SET status = ?, providerEventStatus = ?, updatedAt = ?
        WHERE id = ? AND ownerId = ?`).run(
        error.code === 'SLOT_UNAVAILABLE' ? 'CONFLICTED' : 'PROVIDER_FAILED',
        error.code, nowIso, appointmentId, ownerId
      );
      const holdRow = usageOwnerQuery(db)('SELECT expiresAtUtc FROM bookingHolds WHERE id = ? AND ownerId = ?').get(holdId, ownerId);
      const holdStatus = releaseHold ? 'RELEASED' : holdRow && instant(holdRow.expiresAtUtc, 'Hold expiry') > now ? 'HELD' : 'EXPIRED';
      usageOwnerQuery(db)('UPDATE bookingHolds SET status = ?, updatedAt = ? WHERE id = ? AND ownerId = ?')
        .run(holdStatus, nowIso, holdId, ownerId);
      updateReceipt(ownerId, 'confirm', idempotencyKey, intentId, error.statusCode, body, nowIso);
    });
    if (interrupted) return settledConfirmation(ownerId, intentId, idempotencyKey, appointmentId);
    throwStored(error, body);
  }

  function settledConfirmation(ownerId, intentId, idempotencyKey, appointmentId) {
    return immediate(() => {
      const row = usageOwnerQuery(db)('SELECT * FROM appointments WHERE id = ? AND ownerId = ? AND bookingIntentId = ?').get(appointmentId, ownerId, intentId);
      if (row?.status === 'CONFIRMED') {
        const body = confirmedAppointmentBody(row);
        updateReceipt(ownerId, 'confirm', idempotencyKey, intentId, 201, body, nowFrom(clock).toISOString());
        return {statusCode: 201, body};
      }
      return responseFromReceipt(receiptStatement.get(ownerId, 'confirm', idempotencyKey));
    });
  }

  function finalizePending({ ownerId, intentId, idempotencyKey, appointmentId, confirmationId, holdId, providerEventId: eventId }) {
    const nowIso = nowFrom(clock).toISOString();
    const body = pendingConfirmationBody(confirmationId, appointmentId);
    const settled = immediate(() => {
      const current = usageOwnerQuery(db)('SELECT status FROM appointments WHERE id = ? AND ownerId = ? AND bookingIntentId = ?').get(appointmentId, ownerId, intentId);
      if (!current || !PENDING_APPOINTMENT_STATUSES.has(current.status)) return true;
      usageOwnerQuery(db)(`UPDATE appointments SET status = 'PENDING_CONFIRMATION',
        providerEventId = ?, providerEventStatus = 'PENDING_CONFIRMATION', updatedAt = ?
        WHERE id = ? AND ownerId = ?`).run(eventId, nowIso, appointmentId, ownerId);
      usageOwnerQuery(db)(`UPDATE bookingHolds SET status = 'CONFIRMING', updatedAt = ?
        WHERE id = ? AND ownerId = ?`).run(nowIso, holdId, ownerId);
      updateReceipt(ownerId, 'confirm', idempotencyKey, intentId, 202, body, nowIso);
    });
    if (settled) return settledConfirmation(ownerId, intentId, idempotencyKey, appointmentId);
    return { statusCode: 202, body };
  }

  function finalizeConfirmed({ ownerId, intentId, idempotencyKey, appointmentId, holdId, providerEventId: eventId, result }) {
    const nowIso = nowFrom(clock).toISOString();
    const body = confirmedAppointmentBody({ id: appointmentId, ...result });
    const settled = immediate(() => {
      const current = usageOwnerQuery(db)('SELECT status FROM appointments WHERE id = ? AND ownerId = ? AND bookingIntentId = ?').get(appointmentId, ownerId, intentId);
      if (!current || !PENDING_APPOINTMENT_STATUSES.has(current.status)) return true;
      usageOwnerQuery(db)(`UPDATE appointments SET status = 'CONFIRMED', providerEventId = ?,
        providerEventStatus = 'CONFIRMED', confirmedAt = ?, updatedAt = ?
        WHERE id = ? AND ownerId = ?`).run(eventId, nowIso, nowIso, appointmentId, ownerId);
      linkWidgetBookingLead(db,{ownerId,intentId,appointmentId,createdAt:nowIso});
      usageOwnerQuery(db)(`UPDATE bookingHolds SET status = 'CONFIRMED', updatedAt = ?
        WHERE id = ? AND ownerId = ?`).run(nowIso, holdId, ownerId);
      usageOwnerQuery(db)(`INSERT OR IGNORE INTO outboxEvents (
        id, ownerId, eventType, aggregateId, payloadJson, status, createdAt, updatedAt
      ) VALUES (?, ?, 'appointment.booked', ?, ?, 'PENDING', ?, ?)`).run(
        `${appointmentId}:booked`, ownerId, appointmentId, JSON.stringify(body), nowIso, nowIso
      );
      updateReceipt(ownerId, 'confirm', idempotencyKey, intentId, 201, body, nowIso);
    });
    if (settled) return settledConfirmation(ownerId, intentId, idempotencyKey, appointmentId);
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
        requireUnbookedIntent(ownerId, intentId);
        if (!record(body) || !uuid(body.holdId) || typeof body.confirmedSlotId !== 'string') {
          throw invalid('A valid hold and confirmed slot are required.');
        }
        const holdRow = usageOwnerQuery(db)(`SELECT * FROM bookingHolds
          WHERE id = ? AND ownerId = ? AND intentId = ?`).get(body.holdId, ownerId, intentId);
        if (!holdRow || holdRow.status !== 'HELD' || instant(holdRow.expiresAtUtc, 'Hold expiry') <= now) {
          if (holdRow && holdRow.status === 'HELD') {
            usageOwnerQuery(db)(`UPDATE bookingHolds SET status = 'EXPIRED', updatedAt = ?
              WHERE id = ? AND ownerId = ?`).run(nowIso, body.holdId, ownerId);
          }
          throw bookingError('HOLD_EXPIRED', 410, 'The held time has expired. Request fresh availability.');
        }
        const validated = validateConfirmation(row, holdRow, body.confirmedSlotId, body, now);
        const coverage = serviceAreaDecision(
          serviceAreaFromKnowledgeBase(row.knowledgeBaseJson), validated.location
        );
        if (!coverage.eligible) {
          throw bookingError('SERVICE_AREA_MISMATCH', 409,
            'The project address needs owner follow-up before booking.',
            { details: { reason: coverage.reason, recoveryAction: 'REQUEST_PREFERRED_TIME' } });
        }
        const conflictingAppointment = usageOwnerQuery(db)(`SELECT id FROM appointments
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
        usageOwnerQuery(db)(`UPDATE bookingHolds SET status = 'CONFIRMING', updatedAt = ?
          WHERE id = ? AND ownerId = ?`).run(nowIso, holdRow.id, ownerId);
        usageOwnerQuery(db)(`INSERT INTO appointments (
          id, ownerId, customerId, quoteId, serviceType, bookingMode, datetime,
          durationMinutes, status, depositRequested, depositPaid, createdAt,
          bookingIntentId, holdId, provider, providerCalendarId, providerEventId,
          providerEventStatus, startAtUtc, endAtUtc, lockStartAtUtc, lockEndAtUtc,
          timezone, policyRevision, tierChosen, customerJson, locationJson,
          confirmedAt, updatedAt
        ) VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, 'PENDING_PROVIDER', 0, 0, ?,
          ?, ?, ?, ?, ?, 'PREPARING', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`).run(
          appointmentId, ownerId, row.sourceType === 'quote' ? row.sourceId : null,
          validated.policy.bookingMode, holdRow.startAtUtc, validated.policy.durationMinutes,
          nowIso, intentId, holdRow.id, validated.policy.provider, validated.policy.calendarId,
          eventId, holdRow.startAtUtc, holdRow.endAtUtc, holdRow.lockStartAtUtc,
          holdRow.lockEndAtUtc, validated.policy.timezone, validated.policy.policyRevision,
          validated.tierName, JSON.stringify(validated.customer), JSON.stringify(validated.location), nowIso
        );
        usageOwnerQuery(db)(`UPDATE bookingHolds SET status = 'RELEASED', updatedAt = ?
          WHERE ownerId = ? AND intentId = ? AND id <> ? AND status = 'HELD'`).run(
          nowIso, ownerId, intentId, holdRow.id
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

    preparationsInFlight.add(phase.appointmentId);
    try {
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

    // The asynchronous provider read can outlive the available start/notice
    // boundary. No provider write has happened yet, so releasing is safe.
    if (Date.parse(phase.holdRow.startAtUtc) < nowFrom(clock).getTime() + phase.policy.minimumNoticeMinutes * 60000) {
      return finalizeError({ownerId, intentId, idempotencyKey,
        appointmentId: phase.appointmentId, holdId: phase.holdRow.id,
        error: bookingError('SLOT_UNAVAILABLE', 409, 'That time is no longer available. Request fresh availability.'),
        releaseHold: true});
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
    let claimed;
    try {
      claimed = immediate(() => {
        const current = usageOwnerQuery(db)('SELECT status, providerEventStatus FROM appointments WHERE id = ? AND ownerId = ? AND bookingIntentId = ?').get(phase.appointmentId, ownerId, intentId);
        if (current?.status !== 'PENDING_PROVIDER' || current.providerEventStatus !== 'PREPARING') return false;
        const now = nowFrom(clock), row = context(ownerId, intentId, now);
        validateConfirmation(row, phase.holdRow, body.confirmedSlotId, body, now);
        if (!serviceAreaDecision(serviceAreaFromKnowledgeBase(row.knowledgeBaseJson), phase.location).eligible) {
          throw bookingError('SERVICE_AREA_MISMATCH', 409, 'The project address needs owner follow-up before booking.');
        }
        return usageOwnerQuery(db)(`UPDATE appointments SET providerEventStatus = 'PENDING_PROVIDER', updatedAt = ?
          WHERE id = ? AND ownerId = ? AND bookingIntentId = ?
            AND status = 'PENDING_PROVIDER' AND providerEventStatus = 'PREPARING'`).run(
          now.toISOString(), phase.appointmentId, ownerId, intentId
        ).changes === 1;
      });
    } catch (error) {
      if (!(error instanceof BookingServiceError)) throw error;
      return finalizeError({ownerId, intentId, idempotencyKey,
        appointmentId: phase.appointmentId, holdId: phase.holdRow.id,
        error, releaseHold: true});
    }
    if (!claimed) return currentReceipt(ownerId, 'confirm', idempotencyKey, intentId, digest);
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
        providerResult = recovered || { status: 'PENDING_CONFIRMATION' };
      } catch {
        providerResult = { status: 'PENDING_CONFIRMATION' };
      }
    }
    const status = confirmationStatus(providerResult, providerRequest);
    if (['FAILED', 'CANCELLED', 'CANCELED'].includes(status)) {
      return finalizeError({
        ownerId, intentId, idempotencyKey,
        appointmentId: phase.appointmentId, holdId: phase.holdRow.id,
        error: providerError(), releaseHold: status !== 'FAILED'
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
        providerEventId: phase.providerEventId
      });
    }
    return finalizeConfirmed({
      ownerId, intentId, idempotencyKey,
      appointmentId: phase.appointmentId, holdId: phase.holdRow.id,
      providerEventId: phase.providerEventId,
      result
    });
    } finally {
      preparationsInFlight.delete(phase.appointmentId);
    }
  }

  const recoveryInFlight = new Set();

  async function recoverMissingEvent(appointment) {
    // Retry only a provider that explicitly supports the same caller-supplied
    // event ID. Never choose a new ID or release an ambiguously written slot.
    if (appointment.status !== 'PENDING_PROVIDER' || calendar.idempotentCreateByEventId !== true || preparationsInFlight.has(appointment.id) ||
        recoveryInFlight.has(appointment.id) || appointment.providerEventStatus === 'PREPARING') return null;
    recoveryInFlight.add(appointment.id);
    try {
      const now = nowFrom(clock), row = context(appointment.ownerId, appointment.bookingIntentId, now);
      const policy = policyConfiguration(row);
      const customer = safeCustomer(parseJson(appointment.customerJson, null));
      const location = safeLocation(parseJson(appointment.locationJson, null));
      if (policy.capability !== 'direct' || policy.provider !== appointment.provider ||
          policy.calendarId !== appointment.providerCalendarId || policy.policyRevision !== appointment.policyRevision ||
          Date.parse(appointment.startAtUtc) <= now.getTime() + policy.minimumNoticeMinutes * 60000 ||
          !serviceAreaDecision(serviceAreaFromKnowledgeBase(row.knowledgeBaseJson), location).eligible) return null;
      const busy = normalizeBusy(await calendar.listBusy({ownerId:appointment.ownerId,provider:appointment.provider,
        calendarId:appointment.providerCalendarId,timeMinUtc:appointment.lockStartAtUtc,timeMaxUtc:appointment.lockEndAtUtc}));
      if (busy.some(interval=>intervalsOverlap(appointment.lockStartAtUtc,appointment.lockEndAtUtc,interval.startAtUtc,interval.endAtUtc))) return null;
      // Recheck after the asynchronous read; another poll may already have
      // reconciled this appointment. Only the persisted confirmed request is retried.
      const current = usageOwnerQuery(db)('SELECT status FROM appointments WHERE id = ? AND ownerId = ? AND bookingIntentId = ?')
        .get(appointment.id,appointment.ownerId,appointment.bookingIntentId);
      if (!current || !PENDING_APPOINTMENT_STATUSES.has(current.status)) return null;
      return await calendar.createEvent({ownerId:appointment.ownerId,provider:appointment.provider,
        calendarId:appointment.providerCalendarId,eventId:appointment.providerEventId,appointmentId:appointment.id,
        startAtUtc:appointment.startAtUtc,endAtUtc:appointment.endAtUtc,timezone:appointment.timezone,
        bookingMode:appointment.bookingMode,customer,location,sourceType:row.sourceType,sourceId:row.sourceId,tierName:appointment.tierChosen});
    } catch {
      // A retry can conflict with an earlier successful write. The next lookup
      // reconciles it; a transport or authorization failure is never "not found".
      return null;
    } finally {
      recoveryInFlight.delete(appointment.id);
    }
  }

  async function getConfirmationStatus({ bookingToken, confirmationId }) {
    const resolved = resolveBookingToken(bookingToken);
    const now = nowFrom(clock);
    const handle = openConfirmationId(confirmationId, resolved, now);
    const appointmentStatement = usageOwnerQuery(db)('SELECT * FROM appointments WHERE id=? AND ownerId=?');
    let appointment = appointmentStatement.get(handle.appointmentId, resolved.ownerId);
    const historicalIntent=usageOwnerQuery(db)("SELECT id FROM appointmentChanges WHERE ownerId=? AND appointmentId=? AND json_extract(oldSlotJson,'$.bookingIntentId')=? LIMIT 1");
    if (!appointment||appointment.bookingIntentId!==resolved.intentId&&!historicalIntent.get(resolved.ownerId,handle.appointmentId,resolved.intentId)) throw confirmationNotFound();
    releaseInterruptedPreparation(appointment);
    appointment = appointmentStatement.get(handle.appointmentId, resolved.ownerId);
    if(appointment.providerEventStatus==='CHANGE_PENDING'){
      const change=await reconcileAppointmentChange({ownerId:resolved.ownerId,appointmentId:appointment.id});
      appointment=appointmentStatement.get(handle.appointmentId,resolved.ownerId);
      if(!change||['PREPARING','PENDING'].includes(change.status))return {statusCode:200,body:pendingConfirmationBody(confirmationId,appointment.id)};
      return {statusCode:200,body:appointment.status==='CANCELLED'?{status:'CANCELLED',appointmentId:appointment.id}: {...confirmedAppointmentBody(appointment),changeStatus:change.status}};
    }
    if (appointment.status === 'CONFIRMED') {
      return { statusCode: 200, body: confirmedAppointmentBody(appointment) };
    }
    if(appointment.status==='CANCELLED')return {statusCode:200,body:{status:'CANCELLED',appointmentId:appointment.id}};
    if (!PENDING_APPOINTMENT_STATUSES.has(appointment.status)) {
      const code = appointment.status === 'CONFLICTED' ? 'SLOT_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE';
      return { statusCode: 200, body: failedConfirmationBody(code) };
    }

    let providerResult = null, eventAbsent = false;
    if (typeof calendar.getEvent === 'function') {
      try {
        providerResult = await calendar.getEvent({
          ownerId: resolved.ownerId,
          provider: appointment.provider,
          calendarId: appointment.providerCalendarId,
          eventId: appointment.providerEventId
        });
        eventAbsent = providerResult === null;
      } catch {
        providerResult = null;
      }
    }
    if (eventAbsent) providerResult = await recoverMissingEvent(appointment);
    if (!providerResult) {
      return { statusCode: 200, body: pendingConfirmationBody(confirmationId, appointment.id) };
    }

    const providerStatus = confirmationStatus(providerResult, {
      eventId: appointment.providerEventId,
      startAtUtc: appointment.startAtUtc,
      endAtUtc: appointment.endAtUtc
    });
    if (['FAILED', 'CANCELLED', 'CANCELED'].includes(providerStatus)) {
      const nowIso = nowFrom(clock).toISOString();
      immediate(() => {
        const transition = usageOwnerQuery(db)(`UPDATE appointments SET status = 'PROVIDER_FAILED',
          providerEventStatus = 'PROVIDER_UNAVAILABLE', updatedAt = ?
          WHERE id = ? AND ownerId = ? AND bookingIntentId = ?
            AND status IN ('CONFIRMING', 'PENDING_PROVIDER', 'PENDING_CONFIRMATION')`).run(
          nowIso, appointment.id, resolved.ownerId, resolved.intentId
        );
        if (transition.changes === 1) {
          usageOwnerQuery(db)(`UPDATE bookingHolds SET status = 'RELEASED', updatedAt = ?
            WHERE id = ? AND ownerId = ? AND intentId = ?
              AND status = 'CONFIRMING'`).run(
            nowIso, appointment.holdId, resolved.ownerId, resolved.intentId
          );
        }
      });
      appointment = appointmentStatement.get(handle.appointmentId, resolved.ownerId);
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
      const transition = usageOwnerQuery(db)(`UPDATE appointments SET status = 'CONFIRMED', providerEventId = ?,
        providerEventStatus = 'CONFIRMED', confirmedAt = ?, updatedAt = ?
        WHERE id = ? AND ownerId = ? AND bookingIntentId = ?
          AND status IN ('CONFIRMING', 'PENDING_PROVIDER', 'PENDING_CONFIRMATION')`).run(
        appointment.providerEventId,
        nowIso,
        nowIso,
        appointment.id,
        resolved.ownerId,
        resolved.intentId
      );
      if (transition.changes === 1) {
        linkWidgetBookingLead(db,{ownerId:resolved.ownerId,intentId:resolved.intentId,appointmentId:appointment.id,createdAt:nowIso});
        usageOwnerQuery(db)(`UPDATE bookingHolds SET status = 'CONFIRMED', updatedAt = ?
          WHERE id = ? AND ownerId = ? AND intentId = ?
            AND status = 'CONFIRMING'`).run(
          nowIso, appointment.holdId, resolved.ownerId, resolved.intentId
        );
        const body = confirmedAppointmentBody(appointment);
        usageOwnerQuery(db)(`INSERT OR IGNORE INTO outboxEvents (
          id, ownerId, eventType, aggregateId, payloadJson, status, createdAt, updatedAt
        ) VALUES (?, ?, 'appointment.booked', ?, ?, 'PENDING', ?, ?)`).run(
          `${appointment.id}:booked`, resolved.ownerId, appointment.id,
          JSON.stringify(body), nowIso, nowIso
        );
      }
    });
    appointment = appointmentStatement.get(handle.appointmentId, resolved.ownerId);
    if (appointment?.status === 'CONFIRMED') {
      return { statusCode: 200, body: confirmedAppointmentBody(appointment) };
    }
    if (appointment && !PENDING_APPOINTMENT_STATUSES.has(appointment.status)) {
      const code = appointment.status === 'CONFLICTED' ? 'SLOT_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE';
      return { statusCode: 200, body: failedConfirmationBody(code) };
    }
    return { statusCode: 200, body: pendingConfirmationBody(confirmationId, handle.appointmentId) };
  }

  function ownedAppointment(ownerId,id,callerNumber){
    const row=usageOwnerQuery(db)('SELECT * FROM appointments WHERE ownerId=? AND id=?').get(ownerId,id);
    if(!row||!/^\+[1-9]\d{7,14}$/.test(callerNumber||'')||parseJson(row.customerJson,{})?.phone!==callerNumber)throw invalid('Appointment contact does not match this caller.');
    return row;
  }
  async function appointmentAvailability({ownerId,appointmentId,callerNumber,filters={}}){
    const row=ownedAppointment(ownerId,appointmentId,callerNumber);
    if(row.status!=='CONFIRMED'||row.providerEventStatus==='CHANGE_PENDING')throw invalid('Appointment cannot be changed right now.');
    const source=usageOwnerQuery(db)('SELECT * FROM bookingIntents WHERE ownerId=? AND id=?').get(ownerId,row.bookingIntentId);
    if(!source)throw invalid('Appointment booking context is unavailable.');
    const fresh=createIntent({ownerId,sourceType:source.sourceType,sourceId:source.sourceId,serviceId:source.serviceId,resultType:source.resultType,allowedTierNames:parseJson(source.allowedTierNamesJson,[]),expiresAtUtc:new Date(nowFrom(clock).getTime()+3600000).toISOString()});
    const location=parseJson(row.locationJson,{});
    const result=await availability({ownerId,intentId:fresh.intentId,filters:{...filters,location}});
    return {...result,intentId:fresh.intentId};
  }
  async function modifyAppointment({ownerId,callSid,action,appointment,slotId,intentId,idempotencyKey}){
    const call=usageOwnerQuery(db)('SELECT callerNumber FROM calls WHERE ownerId=? AND callSid=?').get(ownerId,callSid);
    const row=ownedAppointment(ownerId,appointment.id,call?.callerNumber);
    if(!['cancel','reschedule'].includes(action)||!uuid(idempotencyKey))throw invalid('Choose a valid appointment action and request key.');
    const requestJson=JSON.stringify({appointmentId:row.id,action,intentId:intentId||null,slotId:slotId||null});
    const prior=changeRow(ownerId,idempotencyKey);
    if(prior){
      if(prior.requestJson!==requestJson)throw bookingError('IDEMPOTENCY_CONFLICT',409,'This request key was already used for a different appointment change.');
      await reconcileAppointmentChange({ownerId,appointmentId:row.id});
      return changeResult(changeRow(ownerId,idempotencyKey));
    }
    if(row.status!=='CONFIRMED'||row.providerEventStatus==='CHANGE_PENDING'||row.provider!=='google'||typeof calendar.changeEvent!=='function')throw invalid('Appointment change is unavailable.');
    let held;
    if(action==='reschedule'){
      const replacement=usageOwnerQuery(db)('SELECT serviceId,sourceType,sourceId FROM bookingIntents WHERE ownerId=? AND id=?').get(ownerId,intentId);
      const original=usageOwnerQuery(db)('SELECT serviceId,sourceType,sourceId FROM bookingIntents WHERE ownerId=? AND id=?').get(ownerId,row.bookingIntentId);
      if(!replacement||!original||JSON.stringify(replacement)!==JSON.stringify(original)||intentId===row.bookingIntentId)throw invalid('Replacement slot does not belong to this appointment.');
      held=hold({ownerId,intentId,idempotencyKey,slotId}).body;
      if(held.status!=='HELD')throw invalid('Replacement slot unavailable.');
    }
    changesInFlight.add(idempotencyKey);
    try{
      immediate(()=>{
        const at=nowFrom(clock).toISOString();
        const claimed=usageOwnerQuery(db)("UPDATE appointments SET status='PENDING_CONFIRMATION',providerEventStatus='CHANGE_PENDING',updatedAt=? WHERE ownerId=? AND id=? AND status='CONFIRMED' AND (providerEventStatus IS NULL OR providerEventStatus!='CHANGE_PENDING')").run(at,ownerId,row.id);
        if(claimed.changes!==1)throw invalid('An appointment change is already in progress.');
        const next=held?usageOwnerQuery(db)("SELECT * FROM bookingHolds WHERE ownerId=? AND id=? AND intentId=? AND status='HELD' AND expiresAtUtc>?").get(ownerId,held.holdId,intentId,at):null;
        if(held&&!next)throw invalid('Replacement slot unavailable.');
        const old={bookingIntentId:row.bookingIntentId,holdId:row.holdId,providerEventStatus:row.providerEventStatus,
          startAtUtc:row.startAtUtc,endAtUtc:row.endAtUtc,lockStartAtUtc:row.lockStartAtUtc,lockEndAtUtc:row.lockEndAtUtc};
        usageOwnerQuery(db)("INSERT INTO appointmentChanges(id,ownerId,appointmentId,requestJson,action,status,oldSlotJson,newSlotJson,requestedAt,updatedAt) VALUES(?,?,?,?,?,'PREPARING',?,?,?,?)")
          .run(idempotencyKey,ownerId,row.id,requestJson,action,JSON.stringify(old),next?JSON.stringify(next):null,at,at);
        if(next)usageOwnerQuery(db)("UPDATE bookingHolds SET status='CONFIRMING',expiresAtUtc='9999-12-31T23:59:59.999Z',updatedAt=? WHERE ownerId=? AND id=? AND intentId=?").run(at,ownerId,next.id,intentId);
      });
      let change=changeRow(ownerId,idempotencyKey);
      if(held){
        const lock=JSON.parse(change.newSlotJson);
        try{
          const busy=normalizeBusy(await calendar.listBusy({ownerId,calendarId:row.providerCalendarId,timeMinUtc:lock.lockStartAtUtc,timeMaxUtc:lock.lockEndAtUtc}));
          if(busy.some(item=>intervalsOverlap(lock.lockStartAtUtc,lock.lockEndAtUtc,item.startAtUtc,item.endAtUtc)))throw bookingError('SLOT_UNAVAILABLE',409,'That replacement time is no longer available.');
        }catch(error){finishChange(change,{rejected:true,reason:'REPLACEMENT_SLOT_UNAVAILABLE'});throw error;}
      }
      if(calendar.conditionalChanges===true){
        try{
          const original=await calendar.getEvent({ownerId,calendarId:row.providerCalendarId,eventId:row.providerEventId});
          if(!original?.etag||confirmationStatus(original,{eventId:row.providerEventId,startAtUtc:row.startAtUtc,endAtUtc:row.endAtUtc})!=='CONFIRMED')throw providerError('The original calendar appointment could not be verified.');
          const old={...JSON.parse(change.oldSlotJson),etag:original.etag};
          usageOwnerQuery(db)("UPDATE appointmentChanges SET oldSlotJson=? WHERE ownerId=? AND id=? AND status='PREPARING'").run(JSON.stringify(old),ownerId,idempotencyKey);
        }catch(error){finishChange(change,{rejected:true,reason:'CALENDAR_CHANGE_NOT_STARTED'});throw error;}
      }
      // Persist the write boundary before PATCH. Restart recovery only reads it;
      // it cannot know whether a write begun before a crash reached Google.
      const ready=usageOwnerQuery(db)("UPDATE appointmentChanges SET status='PENDING',updatedAt=? WHERE ownerId=? AND id=? AND status='PREPARING'").run(nowFrom(clock).toISOString(),ownerId,idempotencyKey);
      if(ready.changes!==1)return changeResult(changeRow(ownerId,idempotencyKey));
      change=changeRow(ownerId,idempotencyKey);
      try{
        const changed=await calendar.changeEvent({ownerId,calendarId:row.providerCalendarId,eventId:row.providerEventId,action,
          ...(JSON.parse(change.oldSlotJson).etag?{ifMatch:JSON.parse(change.oldSlotJson).etag}:{}),
          ...(held?{startAtUtc:held.slot.startUtc,endAtUtc:held.slot.endUtc}:{})});
        const expected=confirmationStatus(changed,{eventId:row.providerEventId,startAtUtc:held?.slot.startUtc,endAtUtc:held?.slot.endUtc});
        if(action==='cancel'?!['CANCELLED','CANCELED'].includes(expected):expected!=='CONFIRMED')throw providerError();
        return changeResult(finishChange(change));
      }catch(error){
        if(error?.ambiguous===false&&[400,403].includes(error.providerStatus)){
          usageOwnerQuery(db)("UPDATE appointmentChanges SET lastError='CALENDAR_REQUEST_REJECTED',updatedAt=? WHERE ownerId=? AND id=? AND status='PENDING'").run(nowFrom(clock).toISOString(),ownerId,idempotencyKey);
          finishChange(change,{rejected:true,reason:'CALENDAR_REQUEST_REJECTED'});
          throw bookingError('CALENDAR_CHANGE_REJECTED',502,'The calendar rejected this change. The original appointment remains confirmed.',{retryable:false});
        }
        usageOwnerQuery(db)("UPDATE appointmentChanges SET lastError='PROVIDER_CONFIRMATION_PENDING',updatedAt=? WHERE ownerId=? AND id=? AND status='PENDING'").run(nowFrom(clock).toISOString(),ownerId,idempotencyKey);
        return changeResult(changeRow(ownerId,idempotencyKey));
      }
    }finally{changesInFlight.delete(idempotencyKey);}
  }

  return {
    createIntent,
    appointmentAvailability,
    modifyAppointment,
    reconcileAppointmentChange,
    reconcilePendingAppointmentChanges,
    startChangeReconciler,
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
