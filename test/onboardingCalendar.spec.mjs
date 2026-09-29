import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const OWNER = 'owner-calendar-a';
const OTHER_OWNER = 'owner-calendar-b';
const ENCRYPTION_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const FULL_SCOPE = 'https://www.googleapis.com/auth/calendar';

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
    "  timezone TEXT NOT NULL DEFAULT 'UTC',",
    "  role TEXT NOT NULL CHECK (role IN ('owner', 'staff', 'admin'))",
    ');',
    'CREATE TABLE businessProfiles (',
    '  ownerId TEXT PRIMARY KEY,',
    "  businessTypesJson TEXT NOT NULL DEFAULT '[]',",
    '  country TEXT,',
    '  region TEXT,',
    '  existingPhoneNumber TEXT,',
    '  twilioNumber TEXT,',
    '  twilioNumberSid TEXT,',
    '  phoneProvisioningStatus TEXT,',
    '  carrierSetupStatus TEXT,',
    "  knowledgeBaseJson TEXT NOT NULL DEFAULT '{}',",
    "  calendarJson TEXT NOT NULL DEFAULT '{}',",
    '  voiceId TEXT,',
    "  agentName TEXT NOT NULL DEFAULT 'Nova',",
    "  greeting TEXT NOT NULL DEFAULT '',",
    '  operatorEnabled INTEGER NOT NULL DEFAULT 0,',
    '  onboardingStep INTEGER NOT NULL DEFAULT 1,',
    '  updatedAt TEXT NOT NULL',
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
    ');'
  ].join('\n'));
  return db;
}

const state = database();

function ownerQuery(sql) {
  if (!/\bownerId\b/.test(sql)) throw new Error(`Unscoped onboarding query: ${sql}`);
  return state.prepare(sql);
}

function reset() {
  state.exec('DELETE FROM bookingSettings; DELETE FROM calendarConnections; DELETE FROM businessProfiles; DELETE FROM users;');
  state.prepare("INSERT INTO users (id, ownerId, timezone, role) VALUES (?, ?, ?, 'owner')")
    .run(OWNER, OWNER, 'America/Halifax');
  state.prepare("INSERT INTO users (id, ownerId, timezone, role) VALUES (?, ?, ?, 'owner')")
    .run(OTHER_OWNER, OTHER_OWNER, 'UTC');
  const now = '2026-09-29T12:00:00.000Z';
  state.prepare(`INSERT INTO businessProfiles (
      ownerId, businessTypesJson, knowledgeBaseJson, calendarJson,
      agentName, greeting, operatorEnabled, onboardingStep, updatedAt
    ) VALUES (?, '[]', '{}', ?, 'Nova', '', 0, 8, ?)`)
    .run(OWNER, JSON.stringify({ provider: null, status: 'not_connected', calendlyUrl: null }), now);
  state.prepare(`INSERT INTO businessProfiles (
      ownerId, businessTypesJson, knowledgeBaseJson, calendarJson,
      agentName, greeting, operatorEnabled, onboardingStep, updatedAt
    ) VALUES (?, '[]', '{}', ?, 'Nova', '', 0, 8, ?)`)
    .run(OTHER_OWNER, JSON.stringify({ provider: null, status: 'not_connected', calendlyUrl: null }), now);
}

function seedSettings(ownerId, overrides = {}) {
  const value = {
    revision: 'settings-old',
    timezone: ownerId === OWNER ? 'America/Halifax' : 'UTC',
    provider: null,
    calendarId: null,
    externalUrl: null,
    weeklyAvailabilityJson: JSON.stringify({ mon: [{ start: '09:00', end: '17:00' }] }),
    blackoutsJson: '[]',
    bookingHorizonDays: 45,
    minimumNoticeMinutes: 120,
    slotIncrementMinutes: 30,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 15,
    directBookingEnabled: 1,
    updatedAt: '2026-09-29T12:00:00.000Z',
    ...overrides
  };
  state.prepare(`INSERT INTO bookingSettings (
      ownerId, revision, timezone, provider, calendarId, externalUrl,
      weeklyAvailabilityJson, blackoutsJson, bookingHorizonDays,
      minimumNoticeMinutes, slotIncrementMinutes, bufferBeforeMinutes,
      bufferAfterMinutes, directBookingEnabled, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      ownerId, value.revision, value.timezone, value.provider, value.calendarId,
      value.externalUrl, value.weeklyAvailabilityJson, value.blackoutsJson,
      value.bookingHorizonDays, value.minimumNoticeMinutes, value.slotIncrementMinutes,
      value.bufferBeforeMinutes, value.bufferAfterMinutes, value.directBookingEnabled,
      value.updatedAt
    );
}

function row(table, ownerId = OWNER) {
  return state.prepare(`SELECT * FROM ${table} WHERE ownerId = ?`).get(ownerId) || null;
}

if (typeof mock.module !== 'function') {
  test('calendar onboarding canonical persistence (requires Node module mocks)', { skip: true }, () => {});
} else {
  process.env.CREDENTIAL_ENCRYPTION_KEY = ENCRYPTION_KEY;
  process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION = 'onboarding-test-v1';
  mock.module(new URL('../server/src/db.js', import.meta.url).href, {
    namedExports: { db: state, ownerQuery }
  });
  const {
    saveCalendar,
    saveGoogleCalendarTokens
  } = await import(`../server/src/onboardingService.js?calendar-onboarding-test=${Date.now()}`);

  test('Calendly onboarding synchronizes profile, canonical connection, and existing booking settings', () => {
    reset();
    seedSettings(OWNER, { provider: 'google', calendarId: 'old-calendar' });
    seedSettings(OTHER_OWNER, { revision: 'other-revision' });
    const otherBefore = row('bookingSettings', OTHER_OWNER);

    const profile = saveCalendar(OWNER, {
      provider: 'calendly',
      calendlyUrl: 'https://Calendly.com/example-contracting/estimate',
      skipped: false
    });

    assert.deepEqual(profile.calendar, {
      provider: 'calendly',
      status: 'connected',
      calendlyUrl: 'https://calendly.com/example-contracting/estimate',
      calendarId: null,
      expiresAtUtc: null
    });
    assert.equal(profile.onboardingStep, 9);
    const connection = row('calendarConnections');
    assert.equal(connection.provider, 'calendly');
    assert.equal(connection.status, 'connected');
    assert.equal(connection.externalUrl, 'https://calendly.com/example-contracting/estimate');
    assert.equal(connection.credentialsCiphertext, null);
    assert.equal(connection.scopesJson, '[]');
    const settings = row('bookingSettings');
    assert.equal(settings.provider, 'calendly');
    assert.equal(settings.calendarId, null);
    assert.equal(settings.externalUrl, connection.externalUrl);
    assert.equal(settings.timezone, 'America/Halifax');
    assert.equal(settings.weeklyAvailabilityJson, JSON.stringify({ mon: [{ start: '09:00', end: '17:00' }] }));
    assert.equal(settings.bookingHorizonDays, 45);
    assert.equal(settings.directBookingEnabled, 1);
    assert.notEqual(settings.revision, 'settings-old');
    assert.deepEqual(row('bookingSettings', OTHER_OWNER), otherBefore);
    assert.equal(row('calendarConnections', OTHER_OWNER), null);
  });

  test('calendar selection rejects ambiguous providers, unsafe URLs, and unknown fields without writes', () => {
    const invalid = [
      { provider: 'outlook', calendlyUrl: '', skipped: false },
      { provider: 'calendly', calendlyUrl: 'http://calendly.com/example/estimate', skipped: false },
      { provider: 'calendly', calendlyUrl: 'https://calendly.com.evil.example/example', skipped: false },
      { provider: 'calendly', calendlyUrl: 'https://calendly.com/example?month=2026-09', skipped: false },
      { provider: 'google', calendlyUrl: 'https://calendly.com/example', skipped: false },
      { provider: 'outlook', calendlyUrl: '', skipped: true },
      { provider: 'calendly', calendlyUrl: 'https://calendly.com/example', skipped: false, admin: true }
    ];
    for (const input of invalid) {
      reset();
      const profileBefore = row('businessProfiles').calendarJson;
      assert.throws(
        () => saveCalendar(OWNER, input),
        error => error?.code === 'INVALID_REQUEST' && error?.statusCode === 400
      );
      assert.equal(row('businessProfiles').calendarJson, profileBefore);
      assert.equal(row('calendarConnections'), null);
      assert.equal(row('bookingSettings'), null);
    }
  });

  test('Google selection initializes fail-closed booking metadata while OAuth is pending', () => {
    reset();
    const profile = saveCalendar(OWNER, {
      provider: 'google',
      calendlyUrl: '',
      skipped: false
    });
    const connection = row('calendarConnections');
    assert.equal(connection.provider, 'google');
    assert.equal(connection.status, 'pending_oauth');
    assert.equal(connection.credentialsCiphertext, null);
    assert.equal(connection.scopesJson, '[]');
    const settings = row('bookingSettings');
    assert.ok(settings.revision);
    assert.equal(settings.timezone, 'America/Halifax');
    assert.equal(settings.provider, null);
    assert.equal(settings.calendarId, null);
    assert.equal(settings.externalUrl, null);
    assert.equal(settings.directBookingEnabled, 0);
    assert.deepEqual(profile.calendar, {
      provider: 'google',
      status: 'pending_oauth',
      calendlyUrl: null,
      calendarId: null,
      expiresAtUtc: null
    });
  });

  test('skip disconnects only the authenticated owner and preserves non-calendar scheduling rules', () => {
    reset();
    seedSettings(OWNER, {
      provider: 'calendly',
      externalUrl: 'https://calendly.com/example/estimate'
    });
    seedSettings(OTHER_OWNER, { revision: 'other-revision' });
    saveCalendar(OWNER, {
      provider: 'calendly',
      calendlyUrl: 'unfinished-but-ignored',
      skipped: true
    });
    const settings = row('bookingSettings');
    assert.equal(row('calendarConnections'), null);
    assert.equal(settings.provider, null);
    assert.equal(settings.calendarId, null);
    assert.equal(settings.externalUrl, null);
    assert.equal(settings.bookingHorizonDays, 45);
    assert.equal(settings.minimumNoticeMinutes, 120);
    assert.equal(settings.directBookingEnabled, 1);
    assert.notEqual(settings.revision, 'settings-old');
    assert.deepEqual(JSON.parse(row('businessProfiles').calendarJson), {
      provider: null,
      status: 'skipped',
      calendlyUrl: null
    });
    assert.equal(row('bookingSettings', OTHER_OWNER).revision, 'other-revision');
  });

  test('invalid owner timezone blocks calendar persistence and leaves canonical rows untouched', () => {
    reset();
    state.prepare('UPDATE users SET timezone = ? WHERE id = ?').run('Mars/Olympus', OWNER);
    assert.throws(
      () => saveCalendar(OWNER, {
        provider: 'calendly',
        calendlyUrl: 'https://calendly.com/example/estimate',
        skipped: false
      }),
      error => error?.code === 'TIMEZONE_INVALID' && error?.statusCode === 409
    );
    assert.equal(row('calendarConnections'), null);
    assert.equal(row('bookingSettings'), null);
    assert.equal(JSON.parse(row('businessProfiles').calendarJson).status, 'not_connected');
  });

  test('Google callback validates and encrypts credentials, then synchronizes safe metadata atomically', () => {
    reset();
    seedSettings(OWNER);
    const access = 'synthetic-google-access-token';
    const refresh = 'synthetic-google-refresh-token';
    const profile = saveGoogleCalendarTokens(OWNER, {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: FULL_SCOPE,
      id_token: 'ignored-provider-field'
    });

    const connection = row('calendarConnections');
    assert.equal(connection.provider, 'google');
    assert.equal(connection.status, 'connected');
    assert.equal(connection.calendarId, 'primary');
    assert.equal(connection.keyVersion, 'onboarding-test-v1');
    assert.deepEqual(JSON.parse(connection.scopesJson), [FULL_SCOPE]);
    assert.ok(connection.expiresAtUtc.endsWith('Z'));
    assert.equal(JSON.stringify(connection).includes(access), false);
    assert.equal(JSON.stringify(connection).includes(refresh), false);
    const settings = row('bookingSettings');
    assert.equal(settings.provider, 'google');
    assert.equal(settings.calendarId, 'primary');
    assert.equal(settings.externalUrl, null);
    assert.equal(settings.bookingHorizonDays, 45);
    assert.notEqual(settings.revision, 'settings-old');
    assert.deepEqual(profile.calendar, {
      provider: 'google',
      status: 'connected',
      calendlyUrl: null,
      calendarId: 'primary',
      expiresAtUtc: connection.expiresAtUtc
    });
    assert.equal(JSON.stringify(profile).includes(access), false);
    assert.equal(JSON.stringify(row('businessProfiles')).includes(refresh), false);
  });

  test('Google callback fails closed on missing refresh, unsafe destination, expiry, token type, or scopes', () => {
    const valid = {
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: FULL_SCOPE
    };
    const invalid = [
      { ...valid, refresh_token: undefined },
      { ...valid, calendarId: 'primary\nsecondary' },
      { ...valid, expires_in: '3600' },
      { ...valid, token_type: 'MAC' },
      { ...valid, scope: 'openid email' }
    ];
    for (const tokens of invalid) {
      reset();
      seedSettings(OWNER);
      assert.throws(
        () => saveGoogleCalendarTokens(OWNER, tokens),
        error => ['INVALID_REQUEST', 'CALENDAR_SCOPES_INSUFFICIENT'].includes(error?.code) &&
          [400, 409].includes(error?.statusCode)
      );
      assert.equal(row('calendarConnections'), null);
      assert.equal(row('bookingSettings').revision, 'settings-old');
      assert.equal(JSON.parse(row('businessProfiles').calendarJson).status, 'not_connected');
    }
  });

  test('reselecting an already usable Google connection is non-destructive and revision-stable', () => {
    reset();
    seedSettings(OWNER);
    saveGoogleCalendarTokens(OWNER, {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      scope: FULL_SCOPE
    });
    const connectionBefore = row('calendarConnections');
    const settingsBefore = row('bookingSettings');

    const profile = saveCalendar(OWNER, {
      provider: 'google',
      calendlyUrl: '',
      skipped: false
    });

    const connectionAfter = row('calendarConnections');
    const settingsAfter = row('bookingSettings');
    assert.equal(connectionAfter.credentialsCiphertext, connectionBefore.credentialsCiphertext);
    assert.equal(connectionAfter.updatedAt, connectionBefore.updatedAt);
    assert.equal(settingsAfter.revision, settingsBefore.revision);
    assert.equal(profile.calendar.status, 'connected');
  });
}

