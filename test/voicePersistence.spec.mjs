import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { CREATE_TABLE_STATEMENTS, CREATE_INDEX_STATEMENTS } from '../server/src/schema.js';
import { createVoiceSessionNonceService } from '../server/src/voice/sessionNonceService.js';
import { createVoiceToolDispatcher } from '../server/src/voice/toolDispatcher.js';
import { createVoiceToolRuntime } from '../server/src/voice/voiceToolRuntime.js';
import {
  createVoiceHandleStore,
  createVoiceNonceRepository,
  createVoiceSessionStore,
  createVoiceToolIdempotencyStore,
  findVoiceTenantsByNumber,
  loadVoiceAccountContext
} from '../server/src/voice/voicePersistence.js';

const OWNER = 'owner-voice';
const ACCOUNT = `AC${'a'.repeat(32)}`;
const CALL = `CA${'b'.repeat(32)}`;
const FROM = '+19025550100';
const TO = '+19025550101';
const NOW = Date.parse('2026-09-29T12:00:00.000Z');
const context = { ownerId: OWNER, accountSid: ACCOUNT, callSid: CALL, from: FROM, to: TO };

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const statement of CREATE_TABLE_STATEMENTS) db.exec(statement);
  for (const statement of CREATE_INDEX_STATEMENTS) db.exec(statement);
  db.prepare(`INSERT INTO users (
    id, ownerId, email, passwordHash, firstName, businessName, plan, planStatus,
    trialEndsAt, timezone, role, createdAt
  ) VALUES (?, NULL, ?, 'hash', 'Owner', 'Voice Co', 'QuoteDone', 'trialing', ?, 'UTC', 'owner', ?)`)
    .run(OWNER, 'voice@example.invalid', '2026-10-01T00:00:00.000Z', '2026-09-29T00:00:00.000Z');
  db.prepare(`INSERT INTO businessProfiles (
    ownerId, businessTypesJson, knowledgeBaseJson, calendarJson, existingPhoneNumber,
    twilioNumber, twilioNumberSid, phoneProvisioningStatus, operatorEnabled,
    agentName, greeting, updatedAt
  ) VALUES (?, '[]', '{}', '{}', ?, ?, 'PN123', 'provisioned', 1, 'Nova', '', ?)`)
    .run(OWNER, '+19025550199', TO, '2026-09-29T00:00:00.000Z');
  return db;
}

test('nonce persistence is atomic, bound, expiring, and one use', async () => {
  const db = database();
  try {
    let ids = 0;
    const repository = createVoiceNonceRepository({ database: db, randomUUID: () => `nonce-${++ids}` });
    const nonceService = createVoiceSessionNonceService({
      repository,
      now: () => NOW,
      randomBytes: () => Buffer.alloc(32, 7),
      ttlMs: 60_000
    });
    const issued = await nonceService.issue(context);
    await assert.rejects(
      nonceService.consume({ nonce: issued.nonce, binding: { ...context, ownerId: 'other-owner' } }),
      error => error.code === 'INVALID_SESSION_NONCE'
    );
    assert.deepEqual(await nonceService.consume({ nonce: issued.nonce, binding: context }), {
      consumedAt: NOW,
      expiresAt: NOW + 60_000
    });
    await assert.rejects(
      nonceService.consume({ nonce: issued.nonce, binding: context }),
      error => error.code === 'SESSION_NONCE_REPLAYED'
    );
  } finally { db.close(); }
});

test('session storage binds a call to the nonce hash and exact signed context', async () => {
  const db = database();
  try {
    const repository = createVoiceNonceRepository({ database: db, randomUUID: () => 'nonce-row' });
    const nonceService = createVoiceSessionNonceService({
      repository,
      now: () => NOW,
      randomBytes: () => Buffer.alloc(32, 9),
      ttlMs: 60_000
    });
    const issued = await nonceService.issue(context);
    const sessionKey = (await import('node:crypto')).createHash('sha256').update(issued.nonce).digest('hex');
    const store = createVoiceSessionStore({
      database: db,
      clock: () => new Date(NOW),
      randomUUID: () => 'call-row'
    });
    assert.deepEqual(store.createSession({ sessionKey, context, expiresAt: issued.expiresAt }), {
      status: 'created', callRecordId: 'call-row'
    });
    assert.deepEqual(store.createSession({ sessionKey, context, expiresAt: issued.expiresAt }), {
      status: 'created', callRecordId: 'call-row'
    });
    assert.deepEqual(store.loadSessionByNonceHash({ sessionKey }), {
      context,
      session: { callRecordId: 'call-row', status: 'CONNECTING' }
    });
    assert.throws(() => store.createSession({
      sessionKey,
      context: { ...context, from: '+19025550102' },
      expiresAt: issued.expiresAt
    }), /mismatched/);
  } finally { db.close(); }
});

test('fallback persistence is idempotent and account context derives metered usage', () => {
  const db = database();
  try {
    const store = createVoiceSessionStore({
      database: db,
      clock: () => new Date(NOW),
      randomUUID: () => 'fallback-call'
    });
    assert.deepEqual(store.recordFallback({ context, reason: 'OPERATOR_TOGGLE_OFF' }), {
      callRecordId: 'fallback-call'
    });
    assert.deepEqual(store.recordFallback({ context, reason: 'VOICE_RUNTIME_DISABLED' }), {
      callRecordId: 'fallback-call'
    });
    db.prepare('UPDATE calls SET minutesBilled = 17 WHERE id = ?').run('fallback-call');
    assert.deepEqual(
      findVoiceTenantsByNumber(db, TO).map(row => ({ ...row })),
      [{ ownerId: OWNER, twilioNumber: TO }]
    );
    const loaded = loadVoiceAccountContext(db, OWNER);
    assert.equal(loaded.account.plan, 'QuoteDone');
    assert.equal(loaded.profile.operatorEnabled, 1);
    assert.equal(loaded.minutesUsed, 17);
  } finally { db.close(); }
});

test('durable tool idempotency replays across store restarts and rejects changed arguments', async () => {
  const db = database();
  try {
    let executions = 0;
    const request = {
      scope: 'a'.repeat(64),
      key: 'tool-call-1',
      digest: 'b'.repeat(64),
      execute: async () => ({ status: 'saved', executions: ++executions })
    };
    const firstStore = createVoiceToolIdempotencyStore({ database: db, clock: () => new Date(NOW) });
    assert.deepEqual(await firstStore.run(request), {
      status: 'executed', value: { status: 'saved', executions: 1 }
    });
    const restarted = createVoiceToolIdempotencyStore({ database: db, clock: () => new Date(NOW + 1_000) });
    assert.deepEqual(await restarted.run(request), {
      status: 'replayed', value: { status: 'saved', executions: 1 }
    });
    assert.deepEqual(await restarted.run({ ...request, digest: 'c'.repeat(64) }), { status: 'conflict' });
    assert.equal(executions, 1);
  } finally { db.close(); }
});

test('tool idempotency coalesces concurrent retries and removes a failed uncommitted receipt', async () => {
  const db = database();
  try {
    const store = createVoiceToolIdempotencyStore({ database: db, clock: () => new Date(NOW) });
    let release;
    let executions = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const request = {
      scope: 'd'.repeat(64), key: 'parallel', digest: 'e'.repeat(64),
      execute: async () => { executions += 1; await gate; return { status: 'ok' }; }
    };
    const first = store.run(request);
    await Promise.resolve();
    const second = store.run(request);
    release();
    assert.deepEqual((await Promise.all([first, second])).map(row => row.status), ['executed', 'replayed']);
    assert.equal(executions, 1);

    const failed = {
      scope: 'f'.repeat(64), key: 'failure', digest: '1'.repeat(64),
      execute: async () => { throw new Error('controlled failure'); }
    };
    await assert.rejects(store.run(failed), /controlled failure/);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM voiceToolIdempotencyReceipts
      WHERE scopeHash = ? AND idempotencyKey = ?`).get(failed.scope, failed.key).count, 0);
    assert.deepEqual(await store.run({ ...failed, execute: async () => ({ status: 'recovered' }) }), {
      status: 'executed', value: { status: 'recovered' }
    });
  } finally { db.close(); }
});

test('opaque handles are persisted, deterministic, expiring, and bound to tenant, call, and type', () => {
  const db = database();
  try {
    let now = NOW;
    const store = createVoiceHandleStore({
      database: db,
      secret: 'h'.repeat(64),
      clock: () => new Date(now)
    });
    const handle = store.issue({
      context,
      type: 'lead',
      resourceKey: 'lead:one',
      reference: { leadId: 'internal-lead-one' },
      expiresAt: NOW + 60_000
    });
    assert.match(handle, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(store.issue({
      context,
      type: 'lead',
      resourceKey: 'lead:one',
      reference: { leadId: 'internal-lead-one' },
      expiresAt: NOW + 60_000
    }), handle);
    assert.deepEqual(store.resolve({ context, handle, expectedType: 'lead' }).reference, {
      leadId: 'internal-lead-one'
    });
    assert.throws(() => store.resolve({ context, handle, expectedType: 'quote' }), /unavailable/i);
    assert.throws(() => store.resolve({ context: { ...context, ownerId: 'other-owner' }, handle, expectedType: 'lead' }), /unavailable/i);
    assert.throws(() => store.resolve({ context: { ...context, callSid: `CA${'c'.repeat(32)}` }, handle, expectedType: 'lead' }), /unavailable/i);
    now = NOW + 60_001;
    assert.throws(() => store.resolve({ context, handle, expectedType: 'lead' }), /unavailable/i);
    assert.equal(db.prepare('SELECT handleHash FROM voiceOpaqueHandles').all().length, 1);
    assert.equal(db.prepare('SELECT referenceJson FROM voiceOpaqueHandles').get().referenceJson.includes(handle), false);
  } finally { db.close(); }
});

test('voice tool runtime persists a safe review quote and lead without exposing internal identities', async () => {
  const db = database();
  try {
    db.prepare(`INSERT INTO calls (
      id, ownerId, callSid, accountSid, callerNumber, destinationNumber,
      status, transcriptJson, minutesBilled, createdAt, updatedAt
    ) VALUES ('runtime-call', ?, ?, ?, ?, ?, 'CONNECTED', '[]', 0, ?, ?)`).run(
      OWNER, CALL, ACCOUNT, FROM, TO,
      new Date(NOW).toISOString(), new Date(NOW).toISOString()
    );
    const service = { id: 'service-one', serviceType: 'PAINTING_INTERIOR', service: 'Interior Painting', active: true };
    const book = { ownerId: OWNER, services: [service], defaults: {} };
    const runtime = createVoiceToolRuntime({
      database: db,
      callContext: context,
      handleSecret: 'runtime-test-secret'.padEnd(64, 'x'),
      bookingCapabilityResolver: () => 'NONE',
      clock: () => new Date(NOW),
      quoteApplication: {
        loadBook: () => structuredClone(book),
        status: () => ({ status: 'QUOTING LIVE', approvalCurrent: true }),
        serviceName: () => 'Interior Painting',
        serviceMatches: (value, id) => value.services.filter(row => row.id === id),
        revision: () => 'revision-one',
        prepare: () => ({ status: 'needs_details', followUps: ['Check square footage.'] }),
        calculate: () => ({ customerResult: {
          resultType: 'ESTIMATE_REQUIRES_REVIEW',
          quoteId: 'internal-quote-id',
          customerMessage: 'A confirmed measurement is still required.'
        } })
      }
    });
    const dispatcher = createVoiceToolDispatcher({
      handlers: runtime.handlers,
      callContext: context,
      idempotencyStore: runtime.idempotencyStore
    });
    const matched = await dispatcher.dispatch({ name: 'matchService', args: { query: 'Interior Painting' } });
    const quoteRequest = {
      name: 'getQuote', toolCallId: 'runtime-quote-one',
      args: { serviceHandle: matched.serviceHandle, customerInputs: {}, customerConfirmed: true }
    };
    const quote = await dispatcher.dispatch(quoteRequest);
    assert.equal(quote.status, 'needs_details');
    assert.equal(quote.lowEstimate, undefined);
    assert.deepEqual(quote.followUps, ['Check square footage.']);
    assert.equal(JSON.stringify(quote).includes('service-one'), false);
    assert.deepEqual(await dispatcher.dispatch(quoteRequest), quote);
    const lead = await dispatcher.dispatch({
      name: 'captureLead', toolCallId: 'runtime-lead-one',
      args: {
        name: 'Alex Smith', email: 'alex@example.com',
        address: { line1: '123 Main St', city: 'Halifax', region: 'NS', postalCode: 'B3H 1A1', country: 'CA' }
      }
    });
    assert.equal(lead.status, 'captured');
    assert.match(lead.leadHandle, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM quoteSubmissions').get().count, 1);
    assert.equal(db.prepare(`SELECT callerNumber FROM leads WHERE type = 'voice_lead'`).get().callerNumber, FROM);
    assert.deepEqual(Object.keys(runtime.handlers).sort(), [
      'bookAppointment', 'captureLead', 'checkAvailability', 'flagUrgent',
      'getCustomerContext', 'getQuote', 'logQuoteRequest', 'matchService',
      'modifyAppointment', 'sendSms', 'transferCall'
    ]);
  } finally { db.close(); }
});

test('voice runtime binds availability to quote plus lead and sequences one hold before one confirmation', async () => {
  const db = database();
  try {
    db.prepare(`INSERT INTO calls (
      id, ownerId, callSid, accountSid, callerNumber, destinationNumber,
      status, transcriptJson, minutesBilled, createdAt, updatedAt
    ) VALUES ('booking-call', ?, ?, ?, ?, ?, 'CONNECTED', '[]', 0, ?, ?)`).run(
      OWNER, CALL, ACCOUNT, FROM, TO, new Date(NOW).toISOString(), new Date(NOW).toISOString()
    );
    db.prepare('UPDATE businessProfiles SET knowledgeBaseJson = ? WHERE ownerId = ?').run(
      JSON.stringify({ serviceArea: { mode: 'all', cities: [] } }), OWNER
    );
    const details = {
      voiceVersion: 1,
      customerId: 'customer-one',
      contact: { name: 'Alex', email: 'alex@example.com', phone: FROM },
      address: { line1: '123 Main St', line2: '', city: 'Halifax', region: 'NS', postalCode: 'B3H 1A1', country: 'CA' },
      notes: null
    };
    db.prepare(`INSERT INTO leads (
      id, ownerId, callId, customerName, callerNumber, collectedInputsJson, type, status, createdAt
    ) VALUES ('lead-one', ?, 'booking-call', 'Alex', ?, ?, 'voice_lead', 'CAPTURED', ?)`).run(
      OWNER, FROM, JSON.stringify(details), new Date(NOW).toISOString()
    );
    db.prepare(`INSERT INTO quoteSubmissions (
      ownerId, requestId, contentDigest, recordId, resultType, bookRevision,
      originalSubmissionJson, internalOutcomeJson, customerResponseJson,
      bookingIntentId, bookingTokenReceipt, createdAt
    ) VALUES (?, 'request-one', ?, 'record-one', 'INSTANT_ESTIMATE_READY', 'revision-one',
      ?, '{}', ?, 'intent-one', NULL, ?)`).run(
      OWNER, 'a'.repeat(64), JSON.stringify({ serviceId: 'service-one' }),
      JSON.stringify({ resultType: 'INSTANT_ESTIMATE_READY', bookingCapability: 'DIRECT' }),
      new Date(NOW).toISOString()
    );
    const sequence = [];
    const runtime = createVoiceToolRuntime({
      database: db,
      callContext: context,
      handleSecret: 'booking-runtime-test'.padEnd(64, 'x'),
      clock: () => new Date(NOW),
      quoteApplication: {},
      bookingService: {
        async availability({ filters }) {
          sequence.push(['availability', filters]);
          return { body: { status: 'AVAILABLE', validUntilUtc: new Date(NOW + 60_000).toISOString(), slots: [
            { slotId: 'internal-signed-slot', label: 'Thursday at 10:00 AM' }
          ] } };
        },
        hold() {
          sequence.push(['hold']);
          return { body: { status: 'HELD', holdId: 'hold-one' } };
        },
        async confirm() {
          sequence.push(['confirm']);
          return { body: { status: 'CONFIRMED', appointmentId: 'appointment-one', startLocal: 'Thursday at 10:00 AM' } };
        }
      }
    });
    const quoteHandle = runtime.handleStore.issue({
      context, type: 'quote', resourceKey: 'quote:request-one',
      reference: {
        requestId: 'request-one', recordId: 'record-one', intentId: 'intent-one',
        serviceId: 'service-one', resultType: 'INSTANT_ESTIMATE_READY',
        allowedTierNames: [], bookingCapability: 'DIRECT'
      },
      expiresAt: NOW + 60_000
    });
    const leadHandle = runtime.handleStore.issue({
      context, type: 'lead', resourceKey: 'lead:lead-one',
      reference: { leadId: 'lead-one', customerId: 'customer-one' },
      expiresAt: NOW + 60_000
    });
    const dispatcher = createVoiceToolDispatcher({
      handlers: runtime.handlers, callContext: context, idempotencyStore: runtime.idempotencyStore
    });
    const available = await dispatcher.dispatch({
      name: 'checkAvailability', toolCallId: 'availability-one',
      args: { quoteHandle, leadHandle, preference: { days: 7, timeOfDay: ['morning'] } }
    });
    assert.equal(available.status, 'available');
    assert.equal(JSON.stringify(available).includes('internal-signed-slot'), false);
    const bookingRequest = {
      name: 'bookAppointment', toolCallId: 'booking-one',
      args: { slotHandle: available.slotOptions[0].slotHandle, leadHandle, customerConfirmed: true }
    };
    const booked = await dispatcher.dispatch(bookingRequest);
    assert.equal(booked.status, 'confirmed');
    assert.deepEqual(sequence.map(item => item[0]), ['availability', 'hold', 'confirm']);
    assert.deepEqual(await dispatcher.dispatch(bookingRequest), booked);
    assert.deepEqual(sequence.map(item => item[0]), ['availability', 'hold', 'confirm']);
  } finally { db.close(); }
});


test('a reused signed CallSid cannot change its tenant, caller, account or destination',()=>{
  const db=database();
  try {
    const store=createVoiceSessionStore({database:db,clock:()=>new Date(NOW),randomUUID:()=> 'synthetic-bound-call'});
    store.recordFallback({context,reason:'OPERATOR_TOGGLE_OFF'});
    const before=db.prepare('SELECT * FROM calls WHERE callSid=?').get(CALL);
    assert.equal(store.validateIncomingCall({call:context}),true);
    assert.equal(store.validateCallBinding({context}),true);
    for(const changed of [{ownerId:'synthetic-other'},{accountSid:'AC'+'c'.repeat(32)},{from:'+19025550200'},{to:'+19025550201'}]) {
      const foreign={...context,...changed};
      assert.equal(store.validateCallBinding({context:foreign}),false);
      if(!changed.ownerId)assert.equal(store.validateIncomingCall({call:foreign}),false);
      assert.throws(()=>store.recordFallback({context:foreign,reason:'VOICE_RUNTIME_DISABLED'}),{code:'VOICE_CALL_BINDING_MISMATCH'});
      assert.deepEqual(db.prepare('SELECT * FROM calls WHERE callSid=?').get(CALL),before);
    }
    assert.equal(store.validateIncomingCall({call:{...context,callSid:'CA'+'e'.repeat(32)}}),true);
    assert.equal(store.validateIncomingCall({call:{}}),false);
  }finally{db.close();}
});
