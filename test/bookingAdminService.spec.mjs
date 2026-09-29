import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  BookingAdminServiceError,
  createBookingAdminService
} from '../server/src/bookingAdminService.js';

const OWNER = 'owner-a';
const OTHER_OWNER = 'owner-b';
const SERVICE = '10000000-0000-4000-8000-000000000001';
const OTHER_SERVICE = '10000000-0000-4000-8000-000000000002';
const NOW = '2026-09-29T12:00:00.000Z';

function database() {
  const native = new DatabaseSync(':memory:');
  const db = {
    exec(sql) { return native.exec(sql); },
    prepare(sql) { return native.prepare(sql); },
    transaction(work) {
      return (...args) => {
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
    },
    close() { native.close(); }
  };
  db.exec([
    'CREATE TABLE users (',
    '  id TEXT PRIMARY KEY,',
    '  ownerId TEXT,',
    '  businessName TEXT NOT NULL,',
    '  timezone TEXT NOT NULL,',
    "  role TEXT NOT NULL CHECK (role IN ('owner', 'staff', 'admin'))",
    ');',
    'CREATE TABLE bookingSettings (',
    '  ownerId TEXT PRIMARY KEY,',
    '  revision TEXT NOT NULL,',
    '  timezone TEXT NOT NULL,',
    '  provider TEXT,',
    '  calendarId TEXT,',
    '  externalUrl TEXT,',
    "  weeklyAvailabilityJson TEXT NOT NULL DEFAULT '{}',",
    "  blackoutsJson TEXT NOT NULL DEFAULT '[]',",
    '  bookingHorizonDays INTEGER,',
    '  minimumNoticeMinutes INTEGER,',
    '  slotIncrementMinutes INTEGER,',
    '  bufferBeforeMinutes INTEGER,',
    '  bufferAfterMinutes INTEGER,',
    '  directBookingEnabled INTEGER NOT NULL DEFAULT 0,',
    '  updatedAt TEXT NOT NULL',
    ');',
    'CREATE TABLE bookingPolicies (',
    '  ownerId TEXT NOT NULL,',
    '  serviceId TEXT NOT NULL,',
    '  revision TEXT NOT NULL,',
    '  bookingMode TEXT NOT NULL,',
    '  durationMinutes INTEGER,',
    '  enabled INTEGER NOT NULL,',
    '  updatedAt TEXT NOT NULL,',
    '  PRIMARY KEY (ownerId, serviceId)',
    ');',
    'CREATE TABLE widgetSettings (',
    '  ownerId TEXT PRIMARY KEY,',
    '  accentColor TEXT NOT NULL,',
    '  launcherLabel TEXT NOT NULL,',
    '  clickToCallNumber TEXT,',
    '  updatedAt TEXT NOT NULL',
    ');',
    'CREATE TABLE quoteAccessKeys (',
    '  ownerId TEXT PRIMARY KEY,',
    '  publicKey TEXT NOT NULL UNIQUE,',
    '  allowedOriginsJson TEXT NOT NULL,',
    '  createdAt TEXT NOT NULL',
    ');',
    'CREATE TABLE calendarConnections (',
    '  ownerId TEXT PRIMARY KEY,',
    '  provider TEXT NOT NULL,',
    '  status TEXT NOT NULL,',
    '  calendarId TEXT,',
    '  credentialsCiphertext TEXT,',
    '  credentialsIv TEXT,',
    '  credentialsTag TEXT,',
    '  keyVersion TEXT,',
    '  externalUrl TEXT,',
    '  expiresAtUtc TEXT,',
    "  scopesJson TEXT NOT NULL DEFAULT '[]',",
    '  createdAt TEXT NOT NULL,',
    '  updatedAt TEXT NOT NULL',
    ');'
    ,
    'CREATE TABLE businessProfiles (',
    '  ownerId TEXT PRIMARY KEY,',
    "  knowledgeBaseJson TEXT NOT NULL DEFAULT '{}'",
    ');'
  ].join('\n'));
  db.prepare("INSERT INTO users (id, businessName, timezone, role) VALUES (?, ?, ?, 'owner')")
    .run(OWNER, 'Example Contracting', 'UTC');
  db.prepare("INSERT INTO users (id, businessName, timezone, role) VALUES (?, ?, ?, 'owner')")
    .run(OTHER_OWNER, 'Other Contracting', 'UTC');
  const serviceArea = JSON.stringify({ serviceArea: { mode: 'all', cities: [] } });
  db.prepare('INSERT INTO businessProfiles (ownerId, knowledgeBaseJson) VALUES (?, ?)')
    .run(OWNER, serviceArea);
  db.prepare('INSERT INTO businessProfiles (ownerId, knowledgeBaseJson) VALUES (?, ?)')
    .run(OTHER_OWNER, serviceArea);
  return db;
}

function catalogState() {
  return {
    [OWNER]: {
      services: [{
        id: SERVICE,
        serviceType: 'ROOFING',
        service: 'Roof replacement',
        quoteStatus: 'QUOTING LIVE',
        tiers: [{ name: 'Good' }, { name: 'Better' }]
      }]
    },
    [OTHER_OWNER]: {
      services: [{
        id: OTHER_SERVICE,
        serviceType: 'CONCRETE',
        service: 'Concrete pad',
        quoteStatus: 'QUOTING LIVE',
        tiers: []
      }]
    }
  };
}

function connectGoogle(db, ownerId = OWNER, overrides = {}) {
  const row = {
    provider: 'google',
    status: 'connected',
    calendarId: 'primary',
    credentialsCiphertext: 'ciphertext',
    credentialsIv: 'iv',
    credentialsTag: 'tag',
    keyVersion: 'v1',
    externalUrl: null,
    expiresAtUtc: '2026-10-01T12:00:00.000Z',
    scopesJson: JSON.stringify(['https://www.googleapis.com/auth/calendar']),
    ...overrides
  };
  db.prepare(`INSERT INTO calendarConnections (
    ownerId, provider, status, calendarId, credentialsCiphertext, credentialsIv,
    credentialsTag, keyVersion, externalUrl, expiresAtUtc, scopesJson, createdAt, updatedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    ownerId, row.provider, row.status, row.calendarId, row.credentialsCiphertext,
    row.credentialsIv, row.credentialsTag, row.keyVersion, row.externalUrl,
    row.expiresAtUtc, row.scopesJson, NOW, NOW
  );
}

function settingsBody(overrides = {}) {
  return {
    timezone: 'America/Halifax',
    weeklyAvailability: {
      sun: [],
      mon: [{ start: '13:00', end: '17:00' }, { start: '09:00', end: '12:00' }],
      tue: [{ start: '09:00', end: '17:00' }],
      wed: [{ start: '09:00', end: '17:00' }],
      thu: [{ start: '09:00', end: '17:00' }],
      fri: [{ start: '09:00', end: '17:00' }],
      sat: []
    },
    blackouts: [{
      startAtUtc: '2026-10-10T12:00:00Z',
      endAtUtc: '2026-10-10T16:00:00Z'
    }],
    bookingHorizonDays: 30,
    minimumNoticeMinutes: 120,
    slotIncrementMinutes: 30,
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
    directBookingEnabled: true,
    ...overrides
  };
}

function policyBody(overrides = {}) {
  return {
    bookingMode: 'site_visit_first',
    durationMinutes: null,
    enabled: true,
    ...overrides
  };
}

function widgetBody(overrides = {}) {
  return {
    accentColor: '#1a2b3c',
    launcherLabel: 'Request an estimate',
    clickToCallNumber: '+19025550123',
    allowedOrigins: ['https://example.com'],
    ...overrides
  };
}

function harness({
  catalogs = catalogState(),
  randomBytes = () => Buffer.alloc(32, 7),
  allowInsecureLoopback = false
} = {}) {
  const db = database();
  let revision = 0;
  const admin = createBookingAdminService({
    db,
    loadServiceCatalog: ownerId => structuredClone(catalogs[ownerId] || { services: [] }),
    clock: () => new Date(NOW),
    randomUUID: () => `revision-${++revision}`,
    randomBytes,
    allowInsecureLoopback
  });
  return { db, admin, catalogs, revisions: () => revision };
}

function hasCode(code, statusCode) {
  return value => value instanceof BookingAdminServiceError &&
    value.code === code &&
    (statusCode === undefined || value.statusCode === statusCode);
}

test('owner settings and per-service policy become direct-ready only from owner-scoped saved state', () => {
  const state = harness();
  connectGoogle(state.db);

  const afterSettings = state.admin.updateSettings({ ownerId: OWNER, body: settingsBody() });
  assert.equal(afterSettings.owner.timezone, 'America/Halifax');
  assert.equal(afterSettings.settings.provider, 'google');
  assert.equal(afterSettings.settings.calendarId, 'primary');
  assert.deepEqual(afterSettings.settings.weeklyAvailability.mon, [
    { start: '09:00', end: '12:00' },
    { start: '13:00', end: '17:00' }
  ]);
  assert.deepEqual(afterSettings.settings.blackouts, [{
    startAtUtc: '2026-10-10T12:00:00.000Z',
    endAtUtc: '2026-10-10T16:00:00.000Z'
  }]);
  assert.equal(state.db.prepare('SELECT timezone FROM users WHERE id = ?').get(OWNER).timezone, 'America/Halifax');
  assert.ok(!Object.hasOwn(afterSettings.calendarConnection, 'credentialsCiphertext'));

  const ready = state.admin.updatePolicy({
    ownerId: OWNER,
    serviceId: SERVICE,
    body: policyBody()
  });
  assert.equal(ready.services[0].directBookingReady, true);
  assert.equal(ready.services[0].capability, 'DIRECT');
  assert.equal(ready.services[0].policy.effectiveDurationMinutes, 45);
  assert.deepEqual(ready.services[0].allowedQuoteTierNames, ['Good', 'Better']);
  assert.equal(ready.directBooking.configurationReady, true);
  assert.equal(ready.directBooking.ready, true);
  assert.deepEqual(ready.directBooking.releaseBlockers, []);
  assert.deepEqual(ready.serviceArea, { configured: true, mode: 'all', cityCount: 0 });
  assert.deepEqual(state.admin.getReadiness({ ownerId: OWNER }), {
    directBooking: ready.directBooking,
    services: ready.services
  });

  const settingsRevision = ready.settings.revision;
  const revisionsBeforeRetry = state.revisions();
  const exactRetry = state.admin.updateSettings({ ownerId: OWNER, body: settingsBody() });
  assert.equal(exactRetry.settings.revision, settingsRevision);
  assert.equal(state.revisions(), revisionsBeforeRetry);
});

test('tenant isolation prevents reading or writing another owner service policy', () => {
  const state = harness();
  assert.throws(
    () => state.admin.updatePolicy({
      ownerId: OWNER,
      serviceId: OTHER_SERVICE,
      body: policyBody()
    }),
    hasCode('SERVICE_NOT_FOUND', 409)
  );
  assert.equal(
    state.db.prepare('SELECT COUNT(*) AS count FROM bookingPolicies WHERE ownerId = ?').get(OWNER).count,
    0
  );

  state.admin.updatePolicy({
    ownerId: OTHER_OWNER,
    serviceId: OTHER_SERVICE,
    body: policyBody({ bookingMode: 'book_job', durationMinutes: 180 })
  });
  const ownerView = state.admin.getConfiguration({ ownerId: OWNER });
  assert.deepEqual(ownerView.services.map(service => service.serviceId), [SERVICE]);
  assert.equal(ownerView.services[0].policy, null);
  assert.equal(
    state.db.prepare('SELECT COUNT(*) AS count FROM bookingPolicies WHERE ownerId = ?').get(OTHER_OWNER).count,
    1
  );
});

test('settings validation is closed and rejects invalid timezone, hours, overlaps, and bounds without writes', () => {
  const invalidBodies = [];
  invalidBodies.push({ ...settingsBody(), unexpected: true });
  invalidBodies.push(settingsBody({ timezone: 'Atlantic/Imaginary' }));

  const missingWeekday = settingsBody();
  delete missingWeekday.weeklyAvailability.sun;
  invalidBodies.push(missingWeekday);

  invalidBodies.push(settingsBody({
    weeklyAvailability: {
      ...settingsBody().weeklyAvailability,
      mon: [{ start: '09:00', end: '12:00' }, { start: '11:59', end: '15:00' }]
    }
  }));
  invalidBodies.push(settingsBody({
    weeklyAvailability: {
      ...settingsBody().weeklyAvailability,
      mon: [{ start: '24:00', end: '25:00' }]
    }
  }));
  invalidBodies.push(settingsBody({
    weeklyAvailability: {
      ...settingsBody().weeklyAvailability,
      mon: [{ start: '17:00', end: '09:00' }]
    }
  }));
  invalidBodies.push(settingsBody({ minimumNoticeMinutes: 30 * 1440 + 1 }));
  invalidBodies.push(settingsBody({ bufferAfterMinutes: 1441 }));
  invalidBodies.push(settingsBody({ bookingHorizonDays: 30.5 }));
  invalidBodies.push(settingsBody({
    blackouts: [
      { startAtUtc: '2026-10-10T12:00:00Z', endAtUtc: '2026-10-10T16:00:00Z' },
      { startAtUtc: '2026-10-10T15:00:00Z', endAtUtc: '2026-10-10T18:00:00Z' }
    ]
  }));
  invalidBodies.push(settingsBody({
    blackouts: [{ startAtUtc: '2026-10-10T12:00:00-03:00', endAtUtc: '2026-10-10T16:00:00Z' }]
  }));
  invalidBodies.push(settingsBody({
    blackouts: [{ startAtUtc: '2026-02-30T12:00:00Z', endAtUtc: '2026-03-02T16:00:00Z' }]
  }));

  for (const body of invalidBodies) {
    const state = harness();
    assert.throws(
      () => state.admin.updateSettings({ ownerId: OWNER, body }),
      hasCode('INVALID_REQUEST', 400)
    );
    assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingSettings').get().count, 0);
    assert.equal(state.db.prepare('SELECT timezone FROM users WHERE id = ?').get(OWNER).timezone, 'UTC');
  }
});

test('policy validation rejects invalid modes, durations, fields, unknown services, and ambiguous tiers', () => {
  const invalidBodies = [
    { ...policyBody(), unexpected: true },
    policyBody({ bookingMode: 'maybe' }),
    policyBody({ bookingMode: 'book_job', durationMinutes: null }),
    policyBody({ durationMinutes: 0 }),
    policyBody({ durationMinutes: 10081 }),
    policyBody({ enabled: 1 })
  ];
  for (const body of invalidBodies) {
    const state = harness();
    assert.throws(
      () => state.admin.updatePolicy({ ownerId: OWNER, serviceId: SERVICE, body }),
      hasCode('INVALID_REQUEST', 400)
    );
    assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM bookingPolicies').get().count, 0);
  }

  const badCatalog = catalogState();
  badCatalog[OWNER].services[0].tiers = [{ name: 'Good' }, { name: 'good' }];
  const duplicateTiers = harness({ catalogs: badCatalog });
  assert.throws(
    () => duplicateTiers.admin.updatePolicy({
      ownerId: OWNER,
      serviceId: SERVICE,
      body: policyBody()
    }),
    hasCode('SERVICE_CATALOG_INVALID', 409)
  );
  assert.equal(duplicateTiers.db.prepare('SELECT COUNT(*) AS count FROM bookingPolicies').get().count, 0);

  const tooManyCatalog = catalogState();
  tooManyCatalog[OWNER].services[0].tiers = [
    { name: 'One' }, { name: 'Two' }, { name: 'Three' }, { name: 'Four' }
  ];
  const tooManyTiers = harness({ catalogs: tooManyCatalog });
  assert.throws(
    () => tooManyTiers.admin.updatePolicy({
      ownerId: OWNER,
      serviceId: SERVICE,
      body: policyBody()
    }),
    hasCode('SERVICE_CATALOG_INVALID', 409)
  );
});

test('widget branding and origin allowlist are strict, tenant-scoped, and preserve the public key', () => {
  const invalidBodies = [
    { ...widgetBody(), unexpected: true },
    widgetBody({ accentColor: 'green' }),
    widgetBody({ launcherLabel: 'Bad\u0000label' }),
    widgetBody({ clickToCallNumber: '902-555-0123' }),
    widgetBody({ allowedOrigins: [] }),
    widgetBody({ allowedOrigins: ['http://example.com'] }),
    widgetBody({ allowedOrigins: ['https://example.com/path'] }),
    widgetBody({ allowedOrigins: ['https://user:pass@example.com'] }),
    widgetBody({ allowedOrigins: ['https://example.com', 'https://example.com'] })
  ];
  for (const body of invalidBodies) {
    const state = harness();
    assert.throws(
      () => state.admin.updateWidget({ ownerId: OWNER, body }),
      hasCode('INVALID_REQUEST', 400)
    );
    assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM widgetSettings').get().count, 0);
    assert.equal(state.db.prepare('SELECT COUNT(*) AS count FROM quoteAccessKeys').get().count, 0);
  }

  const state = harness();
  const first = state.admin.updateWidget({ ownerId: OWNER, body: widgetBody() });
  assert.equal(first.widget.accentColor, '#1A2B3C');
  assert.equal(first.widget.launcherLabel, 'Request an estimate');
  assert.equal(first.widget.clickToCallNumber, '+19025550123');
  assert.deepEqual(first.widget.allowedOrigins, ['https://example.com']);
  assert.ok(first.widget.publicKey);

  const second = state.admin.updateWidget({
    ownerId: OWNER,
    body: widgetBody({
      launcherLabel: 'Get a quote',
      clickToCallNumber: null,
      allowedOrigins: ['https://www.example.com']
    })
  });
  assert.equal(second.widget.publicKey, first.widget.publicKey);
  assert.equal(second.widget.clickToCallNumber, null);
  assert.deepEqual(second.widget.allowedOrigins, ['https://www.example.com']);
  assert.equal(
    state.db.prepare('SELECT COUNT(*) AS count FROM quoteAccessKeys WHERE ownerId = ?').get(OWNER).count,
    1
  );
  assert.equal(state.admin.getConfiguration({ ownerId: OTHER_OWNER }).widget.publicKey, null);
});

test('widget settings and access-key creation roll back together on key collision', () => {
  const repeatedBytes = () => Buffer.alloc(32, 9);
  const state = harness({ randomBytes: repeatedBytes });
  const collidingKey = repeatedBytes().toString('base64url');
  state.db.prepare(`INSERT INTO quoteAccessKeys (
    ownerId, publicKey, allowedOriginsJson, createdAt
  ) VALUES (?, ?, ?, ?)`).run(
    OTHER_OWNER,
    collidingKey,
    JSON.stringify(['https://other.example.com']),
    NOW
  );

  assert.throws(
    () => state.admin.updateWidget({ ownerId: OWNER, body: widgetBody() }),
    /UNIQUE|constraint/i
  );
  assert.equal(
    state.db.prepare('SELECT COUNT(*) AS count FROM widgetSettings WHERE ownerId = ?').get(OWNER).count,
    0
  );
  assert.equal(
    state.db.prepare('SELECT COUNT(*) AS count FROM quoteAccessKeys WHERE ownerId = ?').get(OWNER).count,
    0
  );
});

test('readiness fails closed for missing credentials and empty hours, while Calendly is only an external handoff', () => {
  const missing = harness();
  const initial = missing.admin.getConfiguration({ ownerId: OWNER });
  assert.equal(initial.directBooking.configurationReady, false);
  assert.ok(initial.directBooking.globalBlockers.some(item => item.code === 'BOOKING_SETTINGS_MISSING'));
  assert.equal(initial.services[0].capability, 'PREFERRED_TIME_ONLY');

  connectGoogle(missing.db, OWNER, {
    credentialsCiphertext: null,
    credentialsIv: null,
    credentialsTag: null,
    keyVersion: null,
    scopesJson: JSON.stringify(['openid'])
  });
  missing.admin.updateSettings({
    ownerId: OWNER,
    body: settingsBody({
      weeklyAvailability: {
        sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: []
      }
    })
  });
  const notReady = missing.admin.updatePolicy({
    ownerId: OWNER,
    serviceId: SERVICE,
    body: policyBody()
  });
  assert.equal(notReady.services[0].capability, 'PREFERRED_TIME_ONLY');
  assert.ok(notReady.services[0].blockers.some(item => item.code === 'WEEKLY_AVAILABILITY_EMPTY'));
  assert.ok(notReady.services[0].blockers.some(item => item.code === 'CALENDAR_CREDENTIALS_MISSING'));
  assert.ok(notReady.services[0].blockers.some(item => item.code === 'CALENDAR_SCOPES_INSUFFICIENT'));

  const duration = harness();
  connectGoogle(duration.db);
  duration.admin.updateSettings({ ownerId: OWNER, body: settingsBody() });
  const tooLong = duration.admin.updatePolicy({
    ownerId: OWNER,
    serviceId: SERVICE,
    body: policyBody({ bookingMode: 'book_job', durationMinutes: 600 })
  });
  assert.equal(tooLong.services[0].directBookingReady, false);
  assert.ok(tooLong.services[0].blockers.some(item => item.code === 'DURATION_EXCEEDS_AVAILABILITY'));

  const calendly = harness();
  calendly.db.prepare(`INSERT INTO calendarConnections (
    ownerId, provider, status, calendarId, credentialsCiphertext, credentialsIv,
    credentialsTag, keyVersion, externalUrl, expiresAtUtc, scopesJson, createdAt, updatedAt
  ) VALUES (?, 'calendly', 'connected', NULL, NULL, NULL, NULL, NULL, ?, NULL, '[]', ?, ?)`)
    .run(OWNER, 'https://calendly.com/example/estimate', NOW, NOW);
  calendly.admin.updateSettings({ ownerId: OWNER, body: settingsBody() });
  const handoff = calendly.admin.updatePolicy({
    ownerId: OWNER,
    serviceId: SERVICE,
    body: policyBody()
  });
  assert.equal(handoff.services[0].capability, 'EXTERNAL_HANDOFF');
  assert.equal(handoff.services[0].directBookingReady, false);
  assert.equal(handoff.settings.externalUrl, 'https://calendly.com/example/estimate');
});

test('structured service-area readiness distinguishes missing, invalid, and valid policies without exposing city data', () => {
  const state = harness();
  connectGoogle(state.db);
  state.admin.updateSettings({ ownerId: OWNER, body: settingsBody() });
  state.admin.updatePolicy({ ownerId: OWNER, serviceId: SERVICE, body: policyBody() });

  state.db.prepare('DELETE FROM businessProfiles WHERE ownerId = ?').run(OWNER);
  const missing = state.admin.getReadiness({ ownerId: OWNER });
  assert.equal(missing.directBooking.configurationReady, true);
  assert.equal(missing.directBooking.ready, false);
  assert.deepEqual(
    missing.directBooking.releaseBlockers.map(item => item.code),
    ['SERVICE_AREA_MISSING']
  );
  assert.equal(missing.services[0].capability, 'PREFERRED_TIME_ONLY');

  state.db.prepare('INSERT INTO businessProfiles (ownerId, knowledgeBaseJson) VALUES (?, ?)')
    .run(OWNER, '{');
  const malformedJson = state.admin.getConfiguration({ ownerId: OWNER });
  assert.equal(malformedJson.directBooking.ready, false);
  assert.deepEqual(
    malformedJson.directBooking.releaseBlockers.map(item => item.code),
    ['SERVICE_AREA_INVALID']
  );

  state.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson = ? WHERE ownerId = ?')
    .run(JSON.stringify({ serviceArea: { mode: 'cities', cities: [] } }), OWNER);
  const malformedPolicy = state.admin.getConfiguration({ ownerId: OWNER });
  assert.equal(malformedPolicy.directBooking.ready, false);
  assert.deepEqual(
    malformedPolicy.directBooking.releaseBlockers.map(item => item.code),
    ['SERVICE_AREA_INVALID']
  );

  state.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson = ? WHERE ownerId = ?')
    .run(JSON.stringify({
      serviceArea: {
        mode: 'cities',
        cities: [{ city: 'Halifax', region: 'NS', country: 'CA' }]
      }
    }), OWNER);
  const valid = state.admin.getConfiguration({ ownerId: OWNER });
  assert.equal(valid.directBooking.ready, true);
  assert.deepEqual(valid.directBooking.releaseBlockers, []);
  assert.deepEqual(valid.serviceArea, { configured: true, mode: 'cities', cityCount: 1 });
  assert.equal(Object.hasOwn(valid.serviceArea, 'cities'), false);
  assert.equal(valid.services[0].capability, 'DIRECT');
});
