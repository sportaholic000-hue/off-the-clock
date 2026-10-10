import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  getTwilioCallStatus
} from '../server/src/platformIntegrations.js';

const ACCOUNT_SID = `AC${'a'.repeat(32)}`;
const API_KEY_SID = `SK${'b'.repeat(32)}`;
const API_KEY_SECRET = 'api-key-secret-for-tests';
const AUTH_TOKEN = 'inbound-signature-token-for-tests';
const CALL_SID = `CA${'c'.repeat(32)}`;

const TWILIO_ENV_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
  'TWILIO_AUTH_TOKEN'
];

function installTwilioEnvironment(t, overrides = {}) {
  const previous = Object.fromEntries(TWILIO_ENV_KEYS.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: ACCOUNT_SID,
    TWILIO_API_KEY_SID: API_KEY_SID,
    TWILIO_API_KEY_SECRET: API_KEY_SECRET,
    TWILIO_AUTH_TOKEN: AUTH_TOKEN,
    ...overrides
  });
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function installFetch(t, implementation) {
  const previous = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = previous;
  });
}

test('Twilio REST authenticates with API key credentials, never the Auth Token', { concurrency: false }, async t => {
  installTwilioEnvironment(t);
  let request;
  installFetch(t, async (url, options) => {
    request = { url: String(url), options };
    return {
      ok: true,
      async json() {
        return {
          sid: CALL_SID,
          status: 'completed',
          to: '+19025550100',
          from: '+19025550101',
          provider_internal_value: API_KEY_SECRET
        };
      }
    };
  });

  const result = await getTwilioCallStatus(CALL_SID);
  const authorization = request.options.headers.authorization;
  assert.match(authorization, /^Basic /);
  assert.equal(
    Buffer.from(authorization.slice('Basic '.length), 'base64').toString('utf8'),
    `${API_KEY_SID}:${API_KEY_SECRET}`
  );
  assert.equal(authorization.includes(AUTH_TOKEN), false);
  assert.match(request.url, new RegExp(`/Accounts/${ACCOUNT_SID}/Calls/${CALL_SID}\\.json$`));
  assert.deepEqual(result, {
    sid: CALL_SID,
    status: 'completed',
    to: '+19025550100',
    from: '+19025550101'
  });
  assert.equal(JSON.stringify(result).includes(API_KEY_SECRET), false);
});

test('Auth Token alone cannot authorize a Twilio REST request', { concurrency: false }, async t => {
  installTwilioEnvironment(t, { TWILIO_API_KEY_SID: '', TWILIO_API_KEY_SECRET: '' });
  let fetched = false;
  installFetch(t, async () => {
    fetched = true;
    throw new Error('fetch must not be reached');
  });

  await assert.rejects(
    getTwilioCallStatus(CALL_SID),
    error => error.message === 'TWILIO_API_KEY_SID is not configured'
  );
  assert.equal(fetched, false);
});

test('Twilio provider failures neither reflect nor log credential-bearing details', { concurrency: false }, async t => {
  installTwilioEnvironment(t);
  const providerMessage = `bad credentials ${API_KEY_SECRET} ${AUTH_TOKEN}`;
  installFetch(t, async () => ({
    ok: false,
    async json() {
      return { code: 20003, message: providerMessage };
    }
  }));

  const logs = [];
  const consoleMethods = ['log', 'warn', 'error'];
  const originals = Object.fromEntries(consoleMethods.map(method => [method, console[method]]));
  for (const method of consoleMethods) console[method] = (...args) => logs.push([method, ...args]);
  t.after(() => {
    for (const method of consoleMethods) console[method] = originals[method];
  });

  await assert.rejects(getTwilioCallStatus(CALL_SID), error => {
    assert.equal(error.message, 'Twilio request failed');
    assert.equal(error.code, 'TWILIO_REQUEST_FAILED');
    assert.equal(error.providerCode, 20003);
    assert.equal(error.statusCode, 502);
    assert.equal(String(error.stack).includes(API_KEY_SECRET), false);
    assert.equal(String(error.stack).includes(AUTH_TOKEN), false);
    return true;
  });
  assert.deepEqual(logs, []);
});

test('.env.example lists runtime/provider keys without sample secrets', async () => {
  const text = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  const values = new Map(
    text
      .split(/\r?\n/)
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );

  for (const name of [
    'JWT_SECRET',
    'TWILIO_API_KEY_SECRET',
    'TWILIO_AUTH_TOKEN',
    'GEMINI_API_KEY',
    'GOOGLE_CLIENT_SECRET',
    'CREDENTIAL_ENCRYPTION_KEY',
    'BOOKING_SLOT_TOKEN_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'ADMIN_PASSWORD_HASH'
  ]) {
    assert.equal(values.has(name), true, `${name} must be documented`);
    assert.equal(values.get(name), '', `${name} must not contain a sample secret`);
  }

  assert.equal(values.get('TWILIO_ACCOUNT_SID'), '');
  assert.equal(values.get('TWILIO_API_KEY_SID'), '');
  assert.equal(values.get('ALLOW_PROVIDER_WRITES'), 'false');
  assert.equal(values.get('CORS_ALLOWED_ORIGINS'), 'http://localhost:5173');
  assert.equal(values.get('CREDENTIAL_ENCRYPTION_KEY_VERSION'), 'v1');
  assert.equal(values.has('CARRIER_CONNECTION_URL'), false);
  assert.equal(values.has('CARRIER_CONNECTION_TOKEN'), false);
  const railway = await readFile(new URL('../deployment/railway.env.example', import.meta.url), 'utf8');
  assert.doesNotMatch(railway, /CARRIER_CONNECTION_(URL|TOKEN)/);
});

