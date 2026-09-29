import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createBookingService, BookingServiceError } from '../server/src/bookingService.js';
import { localDateTimeCandidates } from '../server/src/calendarTime.js';

const OWNER = 'owner-a';
const OTHER_OWNER = 'owner-b';
const SERVICE = 'service-a';
const SLOT_SECRET = 'test-only-slot-secret-with-enough-entropy';
const START_NOW = Date.parse('2026-09-29T12:00:00.000Z');
const HALIFAX_LOCATION = {
  addressLine1: '123 Example Street',
  addressLine2: '',
  city: 'Halifax',
  region: 'NS',
  postalCode: 'B3H 0A1',
  country: 'CA'
};

const keys = {
  hold1: '10000000-0000-4000-8000-000000000001',
  hold2: '10000000-0000-4000-8000-000000000002',
  hold3: '10000000-0000-4000-8000-000000000003',
  release1: '15000000-0000-4000-8000-000000000001',
  release2: '15000000-0000-4000-8000-000000000002',
  release3: '15000000-0000-4000-8000-000000000003',
  confirm1: '20000000-0000-4000-8000-000000000001',
  confirm2: '20000000-0000-4000-8000-000000000002',
  confirm3: '20000000-0000-4000-8000-000000000003'
};

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
  db.exec(`
    CREATE TABLE bookingSettings (
      ownerId TEXT PRIMARY KEY,
      revision TEXT NOT NULL,
      timezone TEXT,
      provider TEXT,
      calendarId TEXT,
      externalUrl TEXT,
      weeklyAvailabilityJson TEXT,
      blackoutsJson TEXT,
      bookingHorizonDays INTEGER,
      minimumNoticeMinutes INTEGER,
      slotIncrementMinutes INTEGER,
      bufferBeforeMinutes INTEGER,
      bufferAfterMinutes INTEGER,
      directBookingEnabled INTEGER,
      updatedAt TEXT
    );
    CREATE TABLE bookingPolicies (
      ownerId TEXT NOT NULL,
      serviceId TEXT NOT NULL,
      revision TEXT NOT NULL,
      bookingMode TEXT,
      durationMinutes INTEGER,
      enabled INTEGER,
      updatedAt TEXT,
      PRIMARY KEY (ownerId, serviceId)
    );
    CREATE TABLE businessProfiles (
      ownerId TEXT PRIMARY KEY,
      knowledgeBaseJson TEXT NOT NULL
    );
    CREATE TABLE bookingIntents (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      sourceType TEXT NOT NULL,
      sourceId TEXT NOT NULL,
      serviceId TEXT NOT NULL,
      resultType TEXT NOT NULL,
      allowedTierNamesJson TEXT NOT NULL,
      status TEXT NOT NULL,
      expiresAtUtc TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE bookingHolds (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      intentId TEXT NOT NULL,
      calendarId TEXT NOT NULL,
      slotIdDigest TEXT NOT NULL,
      startAtUtc TEXT NOT NULL,
      endAtUtc TEXT NOT NULL,
      lockStartAtUtc TEXT NOT NULL,
      lockEndAtUtc TEXT NOT NULL,
      policyRevision TEXT NOT NULL,
      status TEXT NOT NULL,
      expiresAtUtc TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE bookingIdempotency (
      ownerId TEXT NOT NULL,
      operation TEXT NOT NULL,
      idempotencyKey TEXT NOT NULL,
      intentId TEXT NOT NULL,
      requestDigest TEXT NOT NULL,
      httpStatus INTEGER NOT NULL,
      responseJson TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (ownerId, operation, idempotencyKey)
    );
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      customerId TEXT,
      quoteId TEXT,
      serviceType TEXT,
      bookingMode TEXT,
      datetime TEXT,
      durationMinutes INTEGER,
      status TEXT,
      depositRequested INTEGER NOT NULL DEFAULT 0,
      depositPaid INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      bookingIntentId TEXT,
      holdId TEXT,
      provider TEXT,
      providerCalendarId TEXT,
      providerEventId TEXT,
      providerEventStatus TEXT,
      startAtUtc TEXT,
      endAtUtc TEXT,
      lockStartAtUtc TEXT,
      lockEndAtUtc TEXT,
      timezone TEXT,
      policyRevision TEXT,
      tierChosen TEXT,
      customerJson TEXT,
      locationJson TEXT,
      confirmedAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE outboxEvents (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      aggregateId TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  return db;
}

class FakeCalendar {
  constructor() {
    this.busy = [];
    this.mode = 'CONFIRMED';
    this.createCalls = [];
    this.busyCalls = [];
    this.getCalls = [];
    this.recoveredEvent = null;
  }

  async listBusy(request) {
    this.busyCalls.push(structuredClone(request));
    if (this.busyError) throw this.busyError;
    return structuredClone(this.busy);
  }

  async createEvent(request) {
    this.createCalls.push(structuredClone(request));
    if (this.mode === 'THROW') throw new Error('known provider failure');
    if (this.mode === 'AMBIGUOUS') {
      const error = new Error('provider timeout');
      error.ambiguous = true;
      throw error;
    }
    return { status: this.mode, eventId: request.eventId };
  }

  async getEvent(request) {
    this.getCalls.push(structuredClone(request));
    return this.recoveredEvent;
  }
}

function seedPolicy(db, ownerId = OWNER) {
  const weekly = {
    sun: [], mon: [], tue: [],
    wed: [{ start: '09:00', end: '12:00' }],
    thu: [], fri: [], sat: []
  };
  db.prepare(`INSERT INTO businessProfiles (ownerId, knowledgeBaseJson)
    VALUES (?, ?)`).run(ownerId, JSON.stringify({ serviceArea: { mode: 'all', cities: [] } }));
  db.prepare(`INSERT INTO bookingSettings (
    ownerId, revision, timezone, provider, calendarId, externalUrl,
    weeklyAvailabilityJson, blackoutsJson, bookingHorizonDays,
    minimumNoticeMinutes, slotIncrementMinutes, bufferBeforeMinutes,
    bufferAfterMinutes, directBookingEnabled, updatedAt
  ) VALUES (?, 'settings-r1', 'UTC', 'google', 'calendar-1', NULL, ?, '[]', 30, 0, 15, 0, 0, 1, ?)`).run(
    ownerId, JSON.stringify(weekly), new Date(START_NOW).toISOString()
  );
  db.prepare(`INSERT INTO bookingPolicies (
    ownerId, serviceId, revision, bookingMode, durationMinutes, enabled, updatedAt
  ) VALUES (?, ?, 'policy-r1', 'site_visit_first', 45, 1, ?)`).run(
    ownerId, SERVICE, new Date(START_NOW).toISOString()
  );
}

function harness({ calendarMode = 'CONFIRMED', resultType = 'INSTANT_ESTIMATE_READY', allowedTierNames = [] } = {}) {
  const db = database();
  seedPolicy(db);
  seedPolicy(db, OTHER_OWNER);
  let nowMs = START_NOW;
  const calendar = new FakeCalendar();
  calendar.mode = calendarMode;
  const booking = createBookingService({
    db,
    calendar,
    slotTokenSecret: SLOT_SECRET,
    clock: () => new Date(nowMs)
  });
  const intent = booking.createIntent({
    ownerId: OWNER,
    sourceType: 'quote',
    sourceId: 'quote-row-1',
    serviceId: SERVICE,
    resultType,
    allowedTierNames,
    expiresAtUtc: '2026-10-29T12:00:00.000Z'
  });
  return {
    db,
    calendar,
    booking,
    intent,
    advance(milliseconds) { nowMs += milliseconds; },
    now() { return new Date(nowMs); },
    restart() {
      return createBookingService({
        db,
        calendar,
        slotTokenSecret: SLOT_SECRET,
        clock: () => new Date(nowMs)
      });
    }
  };
}

async function slots(state) {
  const result = await state.booking.availability({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    filters: { fromDate: '2026-09-30', days: 1, location: HALIFAX_LOCATION }
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'AVAILABLE');
  assert.ok(result.body.slots.length >= 3);
  return result.body.slots;
}

function confirmation(held, overrides = {}) {
  return {
    holdId: held.body.holdId,
    confirmedSlotId: held.body.slot.slotId,
    explicitConfirmation: true,
    addressConfirmation: true,
    customer: {
      name: 'Alex Smith',
      email: 'alex@example.com',
      phone: '+19025550123'
    },
    location: { ...HALIFAX_LOCATION },
    ...overrides
  };
}

function hasCode(code) {
  return error => error instanceof BookingServiceError && error.code === code;
}

test('booking tokens resolve tenant context without accepting a body ownerId', () => {
  const state = harness();
  assert.deepEqual(state.booking.resolveBookingToken(state.intent.bookingToken), {
    ownerId: OWNER,
    intentId: state.intent.intentId,
    expiresAtUtc: '2026-10-29T12:00:00.000Z'
  });
  assert.throws(() => state.booking.resolveBookingToken(`${state.intent.bookingToken.slice(0, -1)}x`), hasCode('BOOKING_CONTEXT_NOT_FOUND'));
});

test('tenant-scoped availability does not reveal another owner intent', async () => {
  const state = harness();
  await assert.rejects(
    state.booking.availability({ ownerId: OTHER_OWNER, intentId: state.intent.intentId }),
    hasCode('BOOKING_CONTEXT_NOT_FOUND')
  );
});

test('unconfigured and out-of-area requests fall back before any calendar read', async () => {
  const state = harness();
  state.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson = ? WHERE ownerId = ?')
    .run(JSON.stringify({ about: 'Legacy profile without structured coverage' }), OWNER);
  const unconfigured = await state.booking.availability({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    filters: { fromDate: '2026-09-30', days: 1, location: HALIFAX_LOCATION }
  });
  assert.deepEqual(unconfigured.body, {
    status: 'PREFERRED_TIME_ONLY',
    reason: 'SERVICE_AREA_UNCONFIGURED',
    timezone: 'UTC'
  });
  assert.equal(state.calendar.busyCalls.length, 0);

  state.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson = ? WHERE ownerId = ?').run(
    JSON.stringify({
      serviceArea: {
        mode: 'cities',
        cities: [{ city: 'Halifax', region: 'NS', country: 'CA' }]
      }
    }),
    OWNER
  );
  const outOfArea = await state.booking.availability({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    filters: {
      fromDate: '2026-09-30',
      days: 1,
      location: { ...HALIFAX_LOCATION, city: 'Moncton', region: 'NB' }
    }
  });
  assert.deepEqual(outOfArea.body, {
    status: 'PREFERRED_TIME_ONLY',
    reason: 'OUT_OF_AREA',
    timezone: 'UTC'
  });
  const missingAddress = await state.booking.availability({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    filters: { fromDate: '2026-09-30', days: 1 }
  });
  assert.deepEqual(missingAddress.body, {
    status: 'PREFERRED_TIME_ONLY',
    reason: 'ADDRESS_REQUIRED',
    timezone: 'UTC'
  });
  assert.equal(state.calendar.busyCalls.length, 0);
});

test('confirmation rechecks current service-area policy before provider work', async () => {
  const state = harness();
  state.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson = ? WHERE ownerId = ?').run(
    JSON.stringify({
      serviceArea: {
        mode: 'cities',
        cities: [{ city: 'Halifax', region: 'NS', country: 'CA' }]
      }
    }),
    OWNER
  );
  const [slot] = await slots(state);
  const held = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: slot.slotId
  });
  state.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson = ? WHERE ownerId = ?').run(
    JSON.stringify({
      serviceArea: {
        mode: 'cities',
        cities: [{ city: 'Moncton', region: 'NB', country: 'CA' }]
      }
    }),
    OWNER
  );
  const readsBeforeConfirmation = state.calendar.busyCalls.length;
  await assert.rejects(
    state.booking.confirm({
      ownerId: OWNER,
      intentId: state.intent.intentId,
      idempotencyKey: keys.confirm1,
      body: confirmation(held)
    }),
    error => hasCode('SERVICE_AREA_MISMATCH')(error) &&
      error.details?.recoveryAction === 'REQUEST_PREFERRED_TIME'
  );
  assert.equal(state.calendar.busyCalls.length, readsBeforeConfirmation);
  assert.equal(state.calendar.createCalls.length, 0);
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM appointments').get().count, 0);
});

test('slot IDs are opaque and tampering is rejected without creating a hold', async () => {
  const state = harness();
  const [slot] = await slots(state);
  assert.ok(!slot.slotId.includes(OWNER));
  const tamperIndex = slot.slotId.indexOf('.') + 1;
  const current = slot.slotId[tamperIndex];
  const tampered = `${slot.slotId.slice(0, tamperIndex)}${current === 'A' ? 'B' : 'A'}${slot.slotId.slice(tamperIndex + 1)}`;
  assert.throws(() => state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: tampered
  }), hasCode('INVALID_REQUEST'));
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingHolds').get().count, 0);
});

test('holds last exactly five minutes, retry exactly, block overlap, and release after expiry', async () => {
  const state = harness();
  const available = await slots(state);
  const first = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: available[0].slotId
  });
  assert.equal(first.statusCode, 201);
  assert.deepEqual(Object.keys(first.body), ['status', 'holdId', 'expiresAtUtc', 'slot']);
  assert.deepEqual(Object.keys(first.body.slot), [
    'slotId', 'startUtc', 'endUtc', 'startLocal', 'endLocal', 'label'
  ]);
  assert.equal(first.body.expiresAtUtc, new Date(START_NOW + 5 * 60 * 1000).toISOString());
  const exactRetry = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: available[0].slotId
  });
  assert.deepEqual(exactRetry, first);
  assert.throws(() => state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold2,
    slotId: available[1].slotId
  }), hasCode('SLOT_UNAVAILABLE'));

  state.advance(5 * 60 * 1000 + 1);
  const refreshed = await slots(state);
  const replacement = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold3,
    slotId: refreshed[0].slotId
  });
  assert.equal(replacement.statusCode, 201);
  assert.notEqual(replacement.body.holdId, first.body.holdId);
  assert.equal(state.db.prepare('SELECT status FROM bookingHolds WHERE id = ?').get(first.body.holdId).status, 'EXPIRED');
  await assert.rejects(
    state.booking.confirm({
      ownerId: OWNER,
      intentId: state.intent.intentId,
      idempotencyKey: keys.confirm1,
      body: confirmation(first)
    }),
    hasCode('HOLD_EXPIRED')
  );
});

test('hold release is tenant-scoped, exact-replay idempotent, and stable after expiry', async () => {
  const state = harness();
  const available = await slots(state);
  const held = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: available[0].slotId
  });
  const request = {
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.release1,
    holdId: held.body.holdId
  };
  const released = state.booking.releaseHold(request);
  assert.deepEqual(released, {
    statusCode: 200,
    body: { status: 'RELEASED', holdId: held.body.holdId }
  });
  assert.deepEqual(state.restart().releaseHold(request), released);
  assert.deepEqual(state.booking.releaseHold({ ...request, idempotencyKey: keys.release2 }), released);
  assert.equal(state.db.prepare('SELECT status FROM bookingHolds WHERE id = ?').get(held.body.holdId).status, 'RELEASED');
  assert.throws(() => state.booking.releaseHold({
    ...request,
    holdId: '99999999-9999-4999-8999-999999999999'
  }), hasCode('IDEMPOTENCY_CONFLICT'));
  assert.throws(() => state.booking.releaseHold({
    ownerId: OTHER_OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.release3,
    holdId: held.body.holdId
  }), hasCode('BOOKING_CONTEXT_NOT_FOUND'));

  const expired = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold2,
    slotId: available[1].slotId
  });
  state.advance(5 * 60 * 1000 + 1);
  assert.deepEqual(state.booking.releaseHold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.release3,
    holdId: expired.body.holdId
  }), {
    statusCode: 200,
    body: { status: 'RELEASED', holdId: expired.body.holdId }
  });
  assert.equal(state.db.prepare('SELECT status FROM bookingHolds WHERE id = ?').get(expired.body.holdId).status, 'RELEASED');
});

test('idempotency key reuse with a changed hold payload is rejected', async () => {
  const state = harness();
  const available = await slots(state);
  state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: available[0].slotId
  });
  assert.throws(() => state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: available[2].slotId
  }), hasCode('IDEMPOTENCY_CONFLICT'));
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingHolds').get().count, 1);
});

test('a policy revision change invalidates a held slot before provider work', async () => {
  const state = harness();
  const [slot] = await slots(state);
  const held = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: slot.slotId
  });
  state.db.prepare(`UPDATE bookingPolicies SET revision = 'policy-r2' WHERE ownerId = ? AND serviceId = ?`).run(OWNER, SERVICE);
  await assert.rejects(
    state.booking.confirm({
      ownerId: OWNER,
      intentId: state.intent.intentId,
      idempotencyKey: keys.confirm1,
      body: confirmation(held)
    }),
    hasCode('SCHEDULE_CHANGED')
  );
  assert.equal(state.calendar.createCalls.length, 0);
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM appointments').get().count, 0);
});

test('review outcomes cannot book a job directly, and released multi-tier jobs require a valid tier', async () => {
  const review = harness({ resultType: 'ESTIMATE_REQUIRES_REVIEW' });
  review.db.prepare(`UPDATE bookingPolicies SET bookingMode = 'book_job', durationMinutes = 120
    WHERE ownerId = ? AND serviceId = ?`).run(OWNER, SERVICE);
  const blocked = await review.booking.availability({
    ownerId: OWNER,
    intentId: review.intent.intentId,
    filters: { fromDate: '2026-09-30', days: 1 }
  });
  assert.deepEqual(blocked.body, { status: 'UNAVAILABLE', reason: 'REVIEW_REQUIRES_SITE_VISIT' });

  const ready = harness({ allowedTierNames: ['Good', 'Better'] });
  ready.db.prepare(`UPDATE bookingPolicies SET bookingMode = 'book_job', durationMinutes = 120
    WHERE ownerId = ? AND serviceId = ?`).run(OWNER, SERVICE);
  const [slot] = await slots(ready);
  const held = ready.booking.hold({
    ownerId: OWNER,
    intentId: ready.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: slot.slotId
  });
  await assert.rejects(
    ready.booking.confirm({
      ownerId: OWNER,
      intentId: ready.intent.intentId,
      idempotencyKey: keys.confirm1,
      body: confirmation(held)
    }),
    hasCode('INVALID_REQUEST')
  );
  const confirmed = await ready.booking.confirm({
    ownerId: OWNER,
    intentId: ready.intent.intentId,
    idempotencyKey: keys.confirm2,
    body: confirmation(held, { tierName: 'Better' })
  });
  assert.equal(confirmed.statusCode, 201);
  assert.equal(ready.db.prepare('SELECT tierChosen FROM appointments').get().tierChosen, 'Better');
});

test('confirmed provider result commits one appointment and one outbox event, with exact retry', async () => {
  const state = harness();
  const [slot] = await slots(state);
  const held = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: slot.slotId
  });
  const body = confirmation(held);
  const confirmed = await state.booking.confirm({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.confirm1,
    body
  });
  assert.equal(confirmed.statusCode, 201);
  assert.equal(confirmed.body.status, 'CONFIRMED');
  assert.equal(state.calendar.createCalls.length, 1);
  assert.equal(state.db.prepare('SELECT status FROM appointments').get().status, 'CONFIRMED');
  assert.equal(state.db.prepare('SELECT status FROM bookingHolds').get().status, 'CONFIRMED');
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 1);

  const exactRetry = await state.restart().confirm({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.confirm1,
    body
  });
  assert.deepEqual(exactRetry, confirmed);
  assert.equal(state.calendar.createCalls.length, 1);
  await assert.rejects(
    state.booking.confirm({
      ownerId: OWNER,
      intentId: state.intent.intentId,
      idempotencyKey: keys.confirm1,
      body: confirmation(held, { customer: { ...body.customer, name: 'Changed Name' } })
    }),
    hasCode('IDEMPOTENCY_CONFLICT')
  );
});

test('pending confirmation is customer-safe, opaque, pollable, and exact-replay idempotent', async () => {
  const state = harness({ calendarMode: 'PENDING_CONFIRMATION' });
  const [slot] = await slots(state);
  const held = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: slot.slotId
  });
  const request = {
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.confirm1,
    body: confirmation(held)
  };
  const result = await state.booking.confirm(request);
  assert.equal(result.statusCode, 202);
  assert.deepEqual(result.body, {
    status: 'PENDING_CONFIRMATION',
    confirmationId: result.body.confirmationId,
    appointmentId: result.body.appointmentId,
    retryAfterSeconds: 3
  });
  assert.ok(!result.body.confirmationId.includes(OWNER));
  assert.ok(!result.body.confirmationId.includes(result.body.appointmentId));
  assert.deepEqual(await state.restart().confirm(request), result);
  const pendingPoll = await state.booking.getConfirmationStatus({
    bookingToken: state.intent.bookingToken,
    confirmationId: result.body.confirmationId
  });
  assert.deepEqual(pendingPoll, { statusCode: 200, body: result.body });
  assert.equal(state.db.prepare('SELECT status FROM appointments').get().status, 'PENDING_CONFIRMATION');
  assert.equal(state.db.prepare('SELECT status FROM bookingHolds').get().status, 'CONFIRMING');
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 0);
  assert.throws(() => state.booking.releaseHold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.release1,
    holdId: held.body.holdId
  }), hasCode('HOLD_NOT_RELEASABLE'));

  const otherIntent = state.booking.createIntent({
    ownerId: OTHER_OWNER,
    sourceType: 'quote',
    sourceId: 'quote-row-other',
    serviceId: SERVICE,
    resultType: 'INSTANT_ESTIMATE_READY',
    expiresAtUtc: '2026-10-29T12:00:00.000Z'
  });
  await assert.rejects(state.booking.getConfirmationStatus({
    bookingToken: otherIntent.bookingToken,
    confirmationId: result.body.confirmationId
  }), hasCode('CONFIRMATION_NOT_FOUND'));
  const split = Math.floor(result.body.confirmationId.length / 2);
  const current = result.body.confirmationId[split];
  const tampered = `${result.body.confirmationId.slice(0, split)}${current === 'A' ? 'B' : 'A'}${result.body.confirmationId.slice(split + 1)}`;
  await assert.rejects(state.booking.getConfirmationStatus({
    bookingToken: state.intent.bookingToken,
    confirmationId: tampered
  }), hasCode('CONFIRMATION_NOT_FOUND'));
});

test('confirmation polling reconciles pending to the full confirmed public shape without changing the confirm receipt', async () => {
  const state = harness({ calendarMode: 'PENDING_CONFIRMATION' });
  const [slot] = await slots(state);
  const held = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: slot.slotId
  });
  const request = {
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.confirm1,
    body: confirmation(held)
  };
  const pending = await state.booking.confirm(request);
  state.calendar.recoveredEvent = { status: 'CONFIRMED', eventId: 'provider-event-found' };
  const reconciled = await state.booking.getConfirmationStatus({
    bookingToken: state.intent.bookingToken,
    confirmationId: pending.body.confirmationId
  });
  assert.deepEqual(reconciled, {
    statusCode: 200,
    body: {
      status: 'CONFIRMED',
      appointmentId: pending.body.appointmentId,
      bookingMode: 'site_visit_first',
      startUtc: slot.startUtc,
      endUtc: slot.endUtc,
      startLocal: slot.startLocal,
      endLocal: slot.endLocal,
      timezone: 'UTC',
      provider: 'google',
      calendarEventStatus: 'CONFIRMED'
    }
  });
  assert.equal(state.db.prepare('SELECT status FROM appointments').get().status, 'CONFIRMED');
  assert.equal(state.db.prepare('SELECT providerEventId FROM appointments').get().providerEventId, 'provider-event-found');
  assert.equal(state.db.prepare('SELECT status FROM bookingHolds').get().status, 'CONFIRMED');
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 1);
  assert.deepEqual(await state.restart().confirm(request), pending);
  assert.deepEqual(await state.booking.getConfirmationStatus({
    bookingToken: state.intent.bookingToken,
    confirmationId: pending.body.confirmationId
  }), reconciled);
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 1);
});

test('confirmation polling returns an exact customer-safe failure shape', async () => {
  const state = harness({ calendarMode: 'PENDING_CONFIRMATION' });
  const [slot] = await slots(state);
  const held = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: slot.slotId
  });
  const pending = await state.booking.confirm({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.confirm1,
    body: confirmation(held)
  });
  state.calendar.recoveredEvent = {
    status: 'FAILED',
    providerError: 'raw-provider-detail-that-must-not-leak'
  };
  const failed = await state.booking.getConfirmationStatus({
    bookingToken: state.intent.bookingToken,
    confirmationId: pending.body.confirmationId
  });
  assert.deepEqual(failed, {
    statusCode: 200,
    body: {
      status: 'FAILED',
      code: 'PROVIDER_UNAVAILABLE',
      recoveryAction: 'REQUEST_NEW_SLOT'
    }
  });
  assert.equal(state.db.prepare('SELECT status FROM appointments').get().status, 'PROVIDER_FAILED');
  assert.equal(state.db.prepare('SELECT status FROM bookingHolds').get().status, 'RELEASED');
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 0);
});

test('a provider conflict discovered after the hold releases it without creating an event', async () => {
  const state = harness();
  const [slot] = await slots(state);
  const held = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: slot.slotId
  });
  state.calendar.busy = [{ startAtUtc: slot.startUtc, endAtUtc: slot.endUtc }];
  await assert.rejects(
    state.booking.confirm({
      ownerId: OWNER,
      intentId: state.intent.intentId,
      idempotencyKey: keys.confirm1,
      body: confirmation(held)
    }),
    hasCode('SLOT_UNAVAILABLE')
  );
  assert.equal(state.calendar.createCalls.length, 0);
  assert.equal(state.db.prepare('SELECT status FROM appointments').get().status, 'CONFLICTED');
  assert.equal(state.db.prepare('SELECT status FROM bookingHolds').get().status, 'RELEASED');
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 0);
});

test('known provider failure returns 503, preserves the unexpired hold, and retries from receipt', async () => {
  const state = harness({ calendarMode: 'THROW' });
  const [slot] = await slots(state);
  const held = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: slot.slotId
  });
  const request = {
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.confirm1,
    body: confirmation(held)
  };
  await assert.rejects(state.booking.confirm(request), hasCode('PROVIDER_UNAVAILABLE'));
  assert.equal(state.calendar.createCalls.length, 1);
  assert.equal(state.db.prepare('SELECT status FROM appointments').get().status, 'PROVIDER_FAILED');
  assert.equal(state.db.prepare('SELECT status FROM bookingHolds').get().status, 'HELD');
  assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 0);
  await assert.rejects(state.booking.confirm(request), hasCode('PROVIDER_UNAVAILABLE'));
  assert.equal(state.calendar.createCalls.length, 1);
});

test('ambiguous provider timeout reconciles by deterministic event lookup', async () => {
  const state = harness({ calendarMode: 'AMBIGUOUS' });
  state.calendar.recoveredEvent = { eventId: 'provider-event-found' };
  const [slot] = await slots(state);
  const held = state.booking.hold({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.hold1,
    slotId: slot.slotId
  });
  const result = await state.booking.confirm({
    ownerId: OWNER,
    intentId: state.intent.intentId,
    idempotencyKey: keys.confirm1,
    body: confirmation(held)
  });
  assert.equal(result.statusCode, 201);
  assert.equal(result.body.status, 'CONFIRMED');
  assert.equal(state.db.prepare('SELECT providerEventId FROM appointments').get().providerEventId, 'provider-event-found');
});

test('calendar conversion rejects a spring-forward wall time and preserves both fall-back instants', () => {
  assert.deepEqual(localDateTimeCandidates('2026-03-08', '02:30', 'America/Halifax'), []);
  const repeated = localDateTimeCandidates('2026-11-01', '01:30', 'America/Halifax');
  assert.equal(repeated.length, 2);
  assert.equal(new Date(repeated[1]) - new Date(repeated[0]), 60 * 60 * 1000);
});

