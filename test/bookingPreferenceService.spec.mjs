import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  BookingPreferenceServiceError,
  createBookingPreferenceService
} from '../server/src/bookingPreferenceService.js';

const OWNER = 'owner-a';
const OTHER_OWNER = 'owner-b';
const INTENT = '30000000-0000-4000-8000-000000000001';
const PREFERENCE_ID = '40000000-0000-4000-8000-000000000001';
const START_NOW = Date.parse('2026-09-29T12:00:00.000Z');
const IDEMPOTENCY_KEY = '50000000-0000-4000-8000-000000000001';

function database() {
  const native = new DatabaseSync(':memory:');
  const db = {
    exec(sql) { return native.exec(sql); },
    prepare(sql) { return native.prepare(sql); },
    transaction(work) {
      const run = (...args) => {
        native.exec('BEGIN');
        try {
          const result = work(...args);
          native.exec('COMMIT');
          return result;
        } catch (error) {
          native.exec('ROLLBACK');
          throw error;
        }
      };
      run.immediate = (...args) => {
        native.exec('BEGIN IMMEDIATE');
        try {
          const result = work(...args);
          native.exec('COMMIT');
          return result;
        } catch (error) {
          native.exec('ROLLBACK');
          throw error;
        }
      };
      return run;
    },
    close() { native.close(); }
  };
  db.exec([
    'CREATE TABLE users (',
    '  id TEXT PRIMARY KEY,',
    '  timezone TEXT',
    ');',
    'CREATE TABLE bookingSettings (',
    '  ownerId TEXT PRIMARY KEY,',
    '  timezone TEXT',
    ');',
    'CREATE TABLE bookingIntents (',
    '  id TEXT PRIMARY KEY,',
    '  ownerId TEXT NOT NULL,',
    '  status TEXT NOT NULL,',
    '  expiresAtUtc TEXT NOT NULL',
    ');',
    'CREATE TABLE bookingPreferences (',
    '  id TEXT PRIMARY KEY,',
    '  ownerId TEXT NOT NULL,',
    '  intentId TEXT NOT NULL,',
    '  preferredWindowsJson TEXT NOT NULL,',
    '  customerJson TEXT NOT NULL,',
    '  locationJson TEXT NOT NULL,',
    '  note TEXT,',
    '  status TEXT NOT NULL,',
    '  createdAt TEXT NOT NULL,',
    '  updatedAt TEXT NOT NULL',
    ');',
    'CREATE TABLE bookingIdempotency (',
    '  ownerId TEXT NOT NULL,',
    '  operation TEXT NOT NULL,',
    '  idempotencyKey TEXT NOT NULL,',
    '  intentId TEXT NOT NULL,',
    '  requestDigest TEXT NOT NULL,',
    '  httpStatus INTEGER,',
    '  responseJson TEXT,',
    '  createdAt TEXT NOT NULL,',
    '  updatedAt TEXT NOT NULL,',
    '  PRIMARY KEY (ownerId, operation, idempotencyKey)',
    ');',
    'CREATE TABLE outboxEvents (',
    '  id TEXT PRIMARY KEY,',
    '  ownerId TEXT NOT NULL,',
    '  eventType TEXT NOT NULL,',
    '  aggregateId TEXT NOT NULL,',
    '  payloadJson TEXT NOT NULL,',
    '  status TEXT NOT NULL,',
    '  createdAt TEXT NOT NULL,',
    '  updatedAt TEXT NOT NULL',
    ');',
    'CREATE TABLE appointments (id TEXT PRIMARY KEY);',
    'CREATE TABLE bookingHolds (id TEXT PRIMARY KEY);'
  ].join('\n'));
  return db;
}

function preferenceBody(overrides = {}) {
  return {
    preferredWindows: [
      { date: '2026-09-30', timeOfDay: 'morning' },
      { date: '2026-10-01', timeOfDay: 'afternoon' }
    ],
    customer: {
      name: ' Alex Smith ',
      email: 'alex@example.com',
      phone: ''
    },
    location: {
      addressLine1: '123 Example Street',
      addressLine2: '',
      city: 'Halifax',
      region: 'ns',
      postalCode: 'B3H 0A1',
      country: 'ca'
    },
    note: ' Call before arriving ',
    ...overrides
  };
}

function harness({
  settingsTimezone = 'America/Halifax',
  ownerTimezone = 'UTC',
  intentStatus = 'ACTIVE',
  expiresAtUtc = '2026-10-29T12:00:00.000Z',
  preferenceId = PREFERENCE_ID
} = {}) {
  const db = database();
  db.prepare('INSERT INTO users (id, timezone) VALUES (?, ?)').run(OWNER, ownerTimezone);
  db.prepare('INSERT INTO users (id, timezone) VALUES (?, ?)').run(OTHER_OWNER, 'UTC');
  db.prepare('INSERT INTO bookingSettings (ownerId, timezone) VALUES (?, ?)').run(OWNER, settingsTimezone);
  db.prepare('INSERT INTO bookingIntents (id, ownerId, status, expiresAtUtc) VALUES (?, ?, ?, ?)').run(
    INTENT, OWNER, intentStatus, expiresAtUtc
  );
  let nowMs = START_NOW;
  let uuidCalls = 0;
  function service(randomUUID = () => {
    uuidCalls += 1;
    return preferenceId;
  }) {
    return createBookingPreferenceService({
      db,
      clock: () => new Date(nowMs),
      randomUUID
    });
  }
  return {
    db,
    service,
    preference: service(),
    advance(milliseconds) { nowMs += milliseconds; },
    uuidCalls() { return uuidCalls; }
  };
}

function request(state, body = preferenceBody(), overrides = {}) {
  return state.preference.request({
    ownerId: OWNER,
    intentId: INTENT,
    idempotencyKey: IDEMPOTENCY_KEY,
    body,
    ...overrides
  });
}

function hasCode(code, statusCode) {
  return error => error instanceof BookingPreferenceServiceError &&
    error.code === code &&
    (statusCode === undefined || error.statusCode === statusCode);
}

test('preference request atomically stores a callback request without claiming a booking', () => {
  const state = harness();
  const result = request(state);
  assert.deepEqual(result, {
    statusCode: 201,
    body: {
      status: 'REQUESTED',
      preferenceRequestId: PREFERENCE_ID,
      message: 'The business will contact you to confirm a time.'
    }
  });
  const stored = state.db.prepare('SELECT * FROM bookingPreferences').get();
  assert.equal(stored.ownerId, OWNER);
  assert.equal(stored.intentId, INTENT);
  assert.equal(stored.status, 'REQUESTED');
  assert.deepEqual(JSON.parse(stored.preferredWindowsJson), preferenceBody().preferredWindows);
  assert.deepEqual(JSON.parse(stored.customerJson), {
    name: 'Alex Smith',
    email: 'alex@example.com',
    phone: null
  });
  assert.deepEqual(JSON.parse(stored.locationJson), {
    addressLine1: '123 Example Street',
    addressLine2: '',
    city: 'Halifax',
    region: 'NS',
    postalCode: 'B3H 0A1',
    country: 'CA'
  });
  assert.equal(stored.note, 'Call before arriving');
  const event = state.db.prepare('SELECT * FROM outboxEvents').get();
  assert.equal(event.eventType, 'booking.preference_requested');
  assert.equal(event.aggregateId, PREFERENCE_ID);
  assert.equal(event.status, 'PENDING');
  const payload = JSON.parse(event.payloadJson);
  assert.equal(payload.status, 'REQUESTED');
  assert.equal(payload.preferenceRequestId, PREFERENCE_ID);
  assert.ok(!event.payloadJson.includes('CONFIRMED'));
  assert.ok(!event.payloadJson.includes('BOOKED'));
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingIdempotency').get().count, 1);
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM appointments').get().count, 0);
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingHolds').get().count, 0);
});

test('tenant isolation and expired or inactive intent checks happen before writes', () => {
  const tenant = harness();
  assert.throws(() => request(tenant, preferenceBody(), { ownerId: OTHER_OWNER }), hasCode('BOOKING_CONTEXT_NOT_FOUND', 404));
  assert.equal(tenant.db.prepare('SELECT COUNT(*) AS count FROM bookingPreferences').get().count, 0);
  assert.equal(tenant.db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 0);
  assert.equal(tenant.db.prepare('SELECT COUNT(*) AS count FROM bookingIdempotency').get().count, 0);

  const expired = harness({ expiresAtUtc: new Date(START_NOW).toISOString() });
  assert.throws(() => request(expired), hasCode('BOOKING_CONTEXT_EXPIRED', 410));
  assert.equal(expired.db.prepare('SELECT COUNT(*) AS count FROM bookingPreferences').get().count, 0);

  const inactive = harness({ intentStatus: 'CANCELLED' });
  assert.throws(() => request(inactive), hasCode('BOOKING_CONTEXT_EXPIRED', 410));
  assert.equal(inactive.db.prepare('SELECT COUNT(*) AS count FROM bookingPreferences').get().count, 0);
});

test('request validation is closed and rejects malformed nested data', () => {
  const cases = [
    { ...preferenceBody(), extra: true },
    preferenceBody({ customer: { ...preferenceBody().customer, company: 'Unexpected' } }),
    preferenceBody({ customer: { name: 'Alex', email: '', phone: '' } }),
    preferenceBody({ customer: { name: 'Alex', email: 'bad', phone: '+19025550123' } }),
    preferenceBody({ location: { ...preferenceBody().location, instructions: 'side door' } }),
    preferenceBody({ location: { ...preferenceBody().location, city: 123 } }),
    preferenceBody({ preferredWindows: [] }),
    preferenceBody({ preferredWindows: [
      { date: '2026-09-30', timeOfDay: 'morning' },
      { date: '2026-10-01', timeOfDay: 'afternoon' },
      { date: '2026-10-02', timeOfDay: 'evening' },
      { date: '2026-10-03', timeOfDay: 'morning' }
    ] }),
    preferenceBody({ preferredWindows: [{ date: '2026-02-30', timeOfDay: 'morning' }] }),
    preferenceBody({ preferredWindows: [{ date: '2026-09-30', timeOfDay: 'night' }] }),
    preferenceBody({ preferredWindows: [{ date: '2026-09-30', timeOfDay: 'morning', timezone: 'UTC' }] }),
    preferenceBody({ preferredWindows: [
      { date: '2026-09-30', timeOfDay: 'morning' },
      { date: '2026-09-30', timeOfDay: 'morning' }
    ] }),
    preferenceBody({ note: 'x'.repeat(501) }),
    preferenceBody({ note: 'unsafe\u0000note' })
  ];
  for (const body of cases) {
    const state = harness();
    assert.throws(() => request(state, body), hasCode('INVALID_REQUEST', 400));
    assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingPreferences').get().count, 0);
    assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 0);
    assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingIdempotency').get().count, 0);
  }
});

test('future dates use settings timezone, then a valid owner timezone fallback', () => {
  const past = harness();
  assert.throws(() => request(past, preferenceBody({
    preferredWindows: [{ date: '2026-09-29', timeOfDay: 'evening' }]
  })), hasCode('INVALID_REQUEST', 400));

  const fallback = harness({
    settingsTimezone: 'Mars/Olympus',
    ownerTimezone: 'America/Halifax'
  });
  assert.equal(request(fallback).body.status, 'REQUESTED');

  const invalidTimezone = harness({
    settingsTimezone: 'Mars/Olympus',
    ownerTimezone: 'Also/Invalid'
  });
  assert.throws(
    () => request(invalidTimezone),
    hasCode('BOOKING_CONFIGURATION_INCOMPLETE', 409)
  );
  assert.equal(invalidTimezone.db.prepare('SELECT COUNT(*) AS count FROM bookingPreferences').get().count, 0);
});

test('exact retry survives restart and expiry while changed payload conflicts', () => {
  const state = harness();
  const body = preferenceBody();
  const first = request(state, body);
  assert.equal(state.uuidCalls(), 1);
  state.advance(31 * 24 * 60 * 60 * 1000);
  state.preference = state.service(() => {
    throw new Error('Exact receipt replay must not allocate another ID.');
  });
  assert.deepEqual(request(state, body), first);
  assert.throws(
    () => request(state, preferenceBody({ note: 'Changed scheduling note' })),
    hasCode('IDEMPOTENCY_CONFLICT', 409)
  );
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingPreferences').get().count, 1);
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 1);
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingIdempotency').get().count, 1);
});

test('outbox failure rolls back preference and idempotency receipt atomically', () => {
  const state = harness();
  state.db.prepare([
    'INSERT INTO outboxEvents (',
    'id, ownerId, eventType, aggregateId, payloadJson, status, createdAt, updatedAt',
    ") VALUES (?, ?, 'existing', ?, '{}', 'PENDING', ?, ?)"
  ].join(' ')).run(
    PREFERENCE_ID + ':requested',
    OWNER,
    'existing-record',
    new Date(START_NOW).toISOString(),
    new Date(START_NOW).toISOString()
  );
  assert.throws(() => request(state), /UNIQUE|constraint/i);
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingPreferences').get().count, 0);
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingIdempotency').get().count, 0);
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 1);
});
