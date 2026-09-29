import crypto from 'node:crypto';
import { requestDigest } from './bookingTokens.js';
import {
  compareLocalDates,
  isValidIanaTimeZone,
  localDateForInstant,
  parseLocalDate
} from './calendarTime.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_OF_DAY = new Set(['morning', 'afternoon', 'evening']);
const CUSTOMER_FIELDS = ['name', 'email', 'phone'];
const LOCATION_FIELDS = ['addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'country'];
const REQUEST_FIELDS = ['preferredWindows', 'customer', 'location', 'note'];
const RESPONSE_MESSAGE = 'The business will contact you to confirm a time.';
const OPERATION = 'preference';

function plainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validInstant(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function exactKeys(value, allowed, label) {
  if (!plainRecord(value)) throw invalid(label + ' must be an object.');
  const extras = Object.keys(value).filter(key => !allowed.includes(key));
  if (extras.length) {
    throw invalid(label + ' contains unsupported fields.', { fields: extras });
  }
}

export class BookingPreferenceServiceError extends Error {
  constructor(code, statusCode, message, details) {
    super(message);
    this.name = 'BookingPreferenceServiceError';
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) this.details = details;
  }
}

function preferenceError(code, statusCode, message, details) {
  return new BookingPreferenceServiceError(code, statusCode, message, details);
}

function invalid(message, details) {
  return preferenceError('INVALID_REQUEST', 400, message, details);
}

function validateCustomer(value) {
  exactKeys(value, CUSTOMER_FIELDS, 'Customer');
  for (const key of Object.keys(value)) {
    if (typeof value[key] !== 'string') throw invalid('Customer fields must be text.');
  }
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const email = typeof value.email === 'string' ? value.email.trim() : '';
  const phone = typeof value.phone === 'string' ? value.phone.trim() : '';
  if (!name) throw invalid('Customer name is required.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw invalid('Enter a valid customer email address.');
  }
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw invalid('Enter the customer phone number in international format.');
  }
  if (!email && !phone) throw invalid('A callback email or phone number is required.');
  return { name, email: email || null, phone: phone || null };
}

function validateLocation(value) {
  exactKeys(value, LOCATION_FIELDS, 'Location');
  for (const key of Object.keys(value)) {
    if (typeof value[key] !== 'string') throw invalid('Location fields must be text.');
  }
  const location = {};
  for (const key of LOCATION_FIELDS) {
    location[key] = typeof value[key] === 'string' ? value[key].trim() : '';
  }
  const missing = LOCATION_FIELDS
    .filter(key => key !== 'addressLine2')
    .filter(key => !location[key]);
  if (missing.length) {
    throw invalid('Confirm the complete project address before requesting a time.', { fields: missing });
  }
  location.country = location.country.toUpperCase();
  location.region = location.region.toUpperCase();
  return location;
}

function validateNote(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw invalid('Scheduling note must be text.');
  const note = value.trim();
  if ([...note].length > 500) throw invalid('Scheduling note must be at most 500 characters.');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(note)) {
    throw invalid('Scheduling note contains unsupported control characters.');
  }
  return note || null;
}

function validateWindows(value, timeZone, now) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw invalid('Choose one to three preferred time windows.');
  }
  const today = localDateForInstant(now, timeZone);
  const seen = new Set();
  return value.map(window => {
    exactKeys(window, ['date', 'timeOfDay'], 'Preferred time window');
    if (typeof window.date !== 'string' || typeof window.timeOfDay !== 'string') {
      throw invalid('Preferred time window fields must be text.');
    }
    try {
      parseLocalDate(window.date);
    } catch {
      throw invalid('Preferred dates must use a valid YYYY-MM-DD date.');
    }
    if (!TIME_OF_DAY.has(window.timeOfDay)) {
      throw invalid('Preferred time of day must be morning, afternoon, or evening.');
    }
    if (compareLocalDates(window.date, today) <= 0) {
      throw invalid('Preferred dates must be in the future in the business timezone.');
    }
    const key = window.date + ':' + window.timeOfDay;
    if (seen.has(key)) throw invalid('Preferred time windows must be unique.');
    seen.add(key);
    return { date: window.date, timeOfDay: window.timeOfDay };
  });
}

function validateBody(body, timeZone, now) {
  exactKeys(body, REQUEST_FIELDS, 'Preference request');
  return {
    preferredWindows: validateWindows(body.preferredWindows, timeZone, now),
    customer: validateCustomer(body.customer),
    location: validateLocation(body.location),
    note: validateNote(body.note)
  };
}

function receiptResponse(row) {
  let body;
  try { body = JSON.parse(row.responseJson); }
  catch { throw new Error('Stored booking preference receipt is invalid.'); }
  if (!plainRecord(body) || row.httpStatus !== 201) {
    throw new Error('Stored booking preference receipt is invalid.');
  }
  return { statusCode: row.httpStatus, body };
}

export function createBookingPreferenceService({
  db,
  clock = () => new Date(),
  randomUUID = crypto.randomUUID
}) {
  if (!db || typeof db.prepare !== 'function' || typeof db.transaction !== 'function') {
    throw new TypeError('BookingPreferenceService requires a better-sqlite3 compatible database.');
  }
  if (typeof clock !== 'function' || typeof randomUUID !== 'function') {
    throw new TypeError('BookingPreferenceService requires clock and UUID dependencies.');
  }

  const contextStatement = db.prepare([
    'SELECT i.id AS intentId, i.ownerId, i.status AS intentStatus, i.expiresAtUtc,',
    's.timezone AS settingsTimezone, u.timezone AS ownerTimezone',
    'FROM bookingIntents AS i',
    'LEFT JOIN bookingSettings AS s ON s.ownerId = i.ownerId',
    'LEFT JOIN users AS u ON u.id = i.ownerId',
    'WHERE i.id = ? AND i.ownerId = ?'
  ].join(' '));
  const receiptStatement = db.prepare([
    'SELECT intentId, requestDigest, httpStatus, responseJson',
    'FROM bookingIdempotency',
    'WHERE ownerId = ? AND operation = ? AND idempotencyKey = ?'
  ].join(' '));
  const insertPreferenceStatement = db.prepare([
    'INSERT INTO bookingPreferences (',
    'id, ownerId, intentId, preferredWindowsJson, customerJson, locationJson,',
    'note, status, createdAt, updatedAt',
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ].join(' '));
  const insertOutboxStatement = db.prepare([
    'INSERT INTO outboxEvents (',
    'id, ownerId, eventType, aggregateId, payloadJson, status, createdAt, updatedAt',
    ") VALUES (?, ?, 'booking.preference_requested', ?, ?, 'PENDING', ?, ?)"
  ].join(' '));
  const insertReceiptStatement = db.prepare([
    'INSERT INTO bookingIdempotency (',
    'ownerId, operation, idempotencyKey, intentId, requestDigest,',
    'httpStatus, responseJson, createdAt, updatedAt',
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ].join(' '));

  function immediate(work) {
    return db.transaction(work).immediate();
  }

  function request({ ownerId, intentId, idempotencyKey, body }) {
    if (typeof ownerId !== 'string' || !ownerId || typeof intentId !== 'string' || !intentId) {
      throw invalid('A tenant and booking request are required.');
    }
    if (typeof idempotencyKey !== 'string' || !UUID.test(idempotencyKey)) {
      throw invalid('A UUID Idempotency-Key is required.');
    }
    let digest;
    try { digest = requestDigest({ intentId, body }); }
    catch { throw invalid('Preference request must contain plain JSON data.'); }

    return immediate(() => {
      const existing = receiptStatement.get(ownerId, OPERATION, idempotencyKey);
      if (existing) {
        if (existing.intentId !== intentId || existing.requestDigest !== digest) {
          throw preferenceError(
            'IDEMPOTENCY_CONFLICT',
            409,
            'This idempotency key was already used with different preference details.'
          );
        }
        return receiptResponse(existing);
      }

      const now = validInstant(clock());
      if (!now) throw new TypeError('Clock must return a valid instant.');
      const context = contextStatement.get(intentId, ownerId);
      if (!context) {
        throw preferenceError('BOOKING_CONTEXT_NOT_FOUND', 404, 'The booking request was not found.');
      }
      const expiry = validInstant(context.expiresAtUtc);
      if (context.intentStatus !== 'ACTIVE' || !expiry || expiry <= now) {
        throw preferenceError('BOOKING_CONTEXT_EXPIRED', 410, 'This booking request has expired.');
      }
      const timeZone = isValidIanaTimeZone(context.settingsTimezone)
        ? context.settingsTimezone
        : isValidIanaTimeZone(context.ownerTimezone)
          ? context.ownerTimezone
          : null;
      if (!timeZone) {
        throw preferenceError(
          'BOOKING_CONFIGURATION_INCOMPLETE',
          409,
          'The business timezone is not configured.'
        );
      }
      const validated = validateBody(body, timeZone, now);
      const preferenceRequestId = randomUUID();
      if (typeof preferenceRequestId !== 'string' || !UUID.test(preferenceRequestId)) {
        throw new TypeError('UUID generator returned an invalid identifier.');
      }
      const nowIso = now.toISOString();
      const responseBody = {
        status: 'REQUESTED',
        preferenceRequestId,
        message: RESPONSE_MESSAGE
      };

      insertPreferenceStatement.run(
        preferenceRequestId,
        ownerId,
        intentId,
        JSON.stringify(validated.preferredWindows),
        JSON.stringify(validated.customer),
        JSON.stringify(validated.location),
        validated.note,
        'REQUESTED',
        nowIso,
        nowIso
      );
      insertOutboxStatement.run(
        preferenceRequestId + ':requested',
        ownerId,
        preferenceRequestId,
        JSON.stringify({
          status: 'REQUESTED',
          preferenceRequestId,
          intentId,
          preferredWindows: validated.preferredWindows,
          customer: validated.customer,
          location: validated.location,
          note: validated.note
        }),
        nowIso,
        nowIso
      );
      insertReceiptStatement.run(
        ownerId,
        OPERATION,
        idempotencyKey,
        intentId,
        digest,
        201,
        JSON.stringify(responseBody),
        nowIso,
        nowIso
      );
      return { statusCode: 201, body: responseBody };
    });
  }

  return Object.freeze({ request });
}
