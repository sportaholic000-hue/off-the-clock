import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';
import {
  createTelephonyOperations, selectTwilioNumber, provisionTwilioNumber,
  findProvisionedTwilioNumber
} from '../server/src/platformIntegrations.js';
import { installTelephonyOperationsSchema } from '../server/src/telephonyOperationsMigration.js';

// No real tenants, credentials, purchases or carrier traffic. Every provider
// method is injected; adapter tests replace fetch with a rejecting fake.
const OWNER = 'synthetic-owner-telephony';
const NUMBER = '+12025550100';
const DESTINATION = '+12025550101';
const SID = `PN${'1'.repeat(32)}`;
const OP_ID = '11111111-1111-4111-8111-111111111111';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const receipt = input => ({ existingNumber: input.existingNumber, twilioNumber: input.candidateNumber, twilioNumberSid: SID });

function fixture(t, overrides = {}, { enabled = false, provisioned = false, setup = 'connected', eligible = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'otc-synthetic-telephony-'));
  const filename = join(directory, 'synthetic.sqlite');
  const databases = [];
  const open = () => {
    const database = new DatabaseSync(filename);
    database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    databases.push(database);
    return database;
  };
  const database = open();
  database.exec(`CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE businessProfiles (
      ownerId TEXT PRIMARY KEY REFERENCES users(id), country TEXT,
      existingPhoneNumber TEXT, twilioNumber TEXT, twilioNumberSid TEXT,
      phoneProvisioningStatus TEXT, carrierSetupStatus TEXT,
      operatorEnabled INTEGER NOT NULL, onboardingStep INTEGER NOT NULL,
      knowledgeBaseJson TEXT NOT NULL
    );`);
  const addOwner = (ownerId, patch = {}) => {
    database.prepare('INSERT INTO users(id) VALUES (?)').run(ownerId);
    database.prepare(`INSERT INTO businessProfiles VALUES (?, 'US', ?, ?, ?, ?, ?, ?, 5, ?)`).run(
      ownerId, provisioned ? NUMBER : null, provisioned ? DESTINATION : null,
      provisioned ? SID : null, provisioned ? 'provisioned' : 'not_started', setup, enabled ? 1 : 0,
      JSON.stringify(eligible ? { about: '[SYNTHETIC] fixture business', hours: '[SYNTHETIC] hours' } : {})
    );
    for (const [key, value] of Object.entries(patch)) {
      assert.ok(['twilioNumberSid', 'carrierSetupStatus', 'twilioNumber', 'phoneProvisioningStatus', 'existingPhoneNumber'].includes(key));
      database.prepare(`UPDATE businessProfiles SET ${key} = ? WHERE ownerId = ?`).run(value, ownerId);
    }
  };
  addOwner(OWNER);
  const calls = { select: [], purchase: [], find: [] };
  const methods = {
    selectNumber: ['select', async () => DESTINATION],
    purchaseNumber: ['purchase', async input => receipt(input)],
    findPurchasedNumber: ['find', async () => null]
  };
  const provider = Object.fromEntries(Object.entries(methods).map(([method, [key, defaultImpl]]) => [method, async input => {
    calls[key].push({ ...input });
    return (overrides[method] || defaultImpl)(input);
  }]));
  let clock = 10_000;
  const hooks = { failProfileSave: false, failConfirmedSave: false };
  const bind = db => {
    const ownerQuery = sql => {
      assert.match(sql, /\bownerId\b/, 'all service tenant SQL must use ownerQuery and contain ownerId');
      return db.prepare(sql);
    };
    const getBusinessProfile = ownerId => {
      const row = ownerQuery('SELECT * FROM businessProfiles WHERE ownerId = ?').get(ownerId);
      assert.ok(row, 'only explicitly created synthetic owners exist');
      return { ...row, operatorEnabled: Boolean(row.operatorEnabled), knowledgeBase: JSON.parse(row.knowledgeBaseJson) };
    };
    const allowed = new Set(['existingPhoneNumber', 'twilioNumber', 'twilioNumberSid', 'phoneProvisioningStatus',
      'carrierSetupStatus', 'operatorEnabled', 'onboardingStep']);
    const updateBusinessProfile = (ownerId, patch) => {
      if (hooks.failConfirmedSave && 'operatorEnabled' in patch) throw new Error('SYNTHETIC_DB_CONFIRM_FAILURE');
      for (const key of Object.keys(patch)) assert.ok(allowed.has(key));
      const entries = Object.entries(patch);
      ownerQuery(`UPDATE businessProfiles SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE ownerId = ?`)
        .run(...entries.map(([, value]) => value), ownerId);
      return getBusinessProfile(ownerId);
    };
    const savePhoneProvisioning = (ownerId, input) => {
      if (hooks.failProfileSave) throw new Error('SYNTHETIC_POST_PURCHASE_FAILURE');
      return updateBusinessProfile(ownerId, {
        existingPhoneNumber: input.existingNumber, twilioNumber: input.twilioNumber,
        twilioNumberSid: input.twilioNumberSid, phoneProvisioningStatus: 'provisioned',
        carrierSetupStatus: input.carrierSetupStatus || 'queued',
        onboardingStep: Math.max(5, getBusinessProfile(ownerId).onboardingStep)
      });
    };
    const operatorEligibility = profile => {
      const missing = [];
      if (profile.phoneProvisioningStatus !== 'provisioned' || !profile.twilioNumberSid) missing.push('phone');
      if (!profile.knowledgeBase.about) missing.push('About & area');
      if (!profile.knowledgeBase.hours) missing.push('Hours');
      return { eligible: missing.length === 0, missing };
    };
    const options = { database: db, ownerQuery, getBusinessProfile, savePhoneProvisioning, updateBusinessProfile,
      operatorEligibility, provider, now: () => clock, leaseMs: 100 };
    return { ...options, service: createTelephonyOperations(options) };
  };
  const first = bind(database);
  t.after(() => {
    for (const db of databases) db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { ...first, database, filename, calls, provider, hooks, addOwner, second: () => bind(open()),
    expire: () => { clock += 101; },
    phone: () => database.prepare('SELECT * FROM phoneProvisioningOperations WHERE ownerId = ?').get(OWNER),
    coverage: () => database.prepare('SELECT * FROM operatorCoverageOperations WHERE ownerId = ?').get(OWNER),
    profile: () => first.getBusinessProfile(OWNER) };
}

for (const separateConnections of [false, true]) {
  test(`20 overlapping provisioning requests purchase exactly once (${separateConnections ? 'independent SQLite connections' : 'one connection'})`, async t => {
    const entered = deferred(), finish = deferred();
    const f = fixture(t, { purchaseNumber: async input => { entered.resolve(); await finish.promise; return receipt(input); } });
    const other = separateConnections ? f.second() : f;
    const requests = Array.from({ length: 20 }, (_, i) => (i % 2 ? other : f).service.provision(OWNER, NUMBER));
    await entered.promise;
    assert.equal(f.calls.purchase.length, 1);
    assert.equal(f.phone().purchaseState, 'purchasing');
    assert.equal(f.phone().existingNumber, NUMBER);
    finish.resolve();
    const results = await Promise.all(requests);
    assert.equal(new Set(results.map(result => result.operationId)).size, 1);
    assert.equal(f.calls.purchase.length, 1);
    assert.equal(f.phone().carrierSetupStatus, 'not_required');
    assert.equal(f.phone().twilioNumberSid, SID);
    assert.equal(f.profile().twilioNumberSid, SID);
    assert.equal(results.filter(result => result.statusCode === 201).length, 1);
    assert.equal(results.filter(result => result.statusCode === 202).length, 19);
    const replay = await other.service.provision(OWNER, NUMBER);
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.reused, true);
    assert.equal(f.calls.purchase.length, 1);
  });
}

test('SID and local provisioning complete without a carrier operation', async t => {
  const f = fixture(t), other = f.second();
  const result = await f.service.provision(OWNER, NUMBER);
  assert.equal(result.statusCode, 201);
  assert.equal(other.ownerQuery('SELECT twilioNumberSid FROM phoneProvisioningOperations WHERE ownerId=?').get(OWNER).twilioNumberSid, SID);
  assert.equal(other.getBusinessProfile(OWNER).carrierSetupStatus, 'not_required');
  assert.equal(f.phone().carrierComplete, 1);
  assert.deepEqual(Object.keys(f.service), ['provision']);
});

test('failure immediately after purchase preserves the independent receipt; restarted service retries without purchase', async t => {
  const f = fixture(t);
  f.hooks.failProfileSave = true;
  await assert.rejects(f.service.provision(OWNER, NUMBER), /SYNTHETIC_POST_PURCHASE_FAILURE/);
  assert.equal(f.phone().twilioNumberSid, SID);
  assert.equal(f.phone().purchaseState, 'purchased');
  assert.equal(f.profile().twilioNumberSid, null);
  f.hooks.failProfileSave = false;
  const replay = await f.second().service.provision(OWNER, NUMBER);
  assert.equal(replay.statusCode, 200);
  assert.equal(f.profile().twilioNumberSid, SID);
  assert.equal(f.calls.purchase.length, 1);
});

test('unknown purchase result is recovered by operation receipt, never another purchase', async t => {
  const f = fixture(t, {
    purchaseNumber: async () => { throw new Error('SYNTHETIC_RESPONSE_LOST'); },
    findPurchasedNumber: async input => receipt(input)
  });
  const initial = await f.service.provision(OWNER, NUMBER);
  assert.equal(initial.statusCode, 202);
  assert.equal(f.phone().purchaseState, 'unknown');
  const replay = await f.second().service.provision(OWNER, NUMBER);
  assert.equal(replay.statusCode, 200);
  assert.equal(f.calls.purchase.length, 1);
  assert.equal(f.calls.find.length, 1);
  assert.equal(f.profile().twilioNumberSid, SID);
  assert.equal(f.calls.find[0].operationId, initial.operationId);
});

test('absence or failure of a reconciliation read is not permission to purchase again', async t => {
  const f = fixture(t, {
    purchaseNumber: async () => { throw new Error('SYNTHETIC_AMBIGUOUS'); },
    findPurchasedNumber: async () => f.calls.find.length % 2 ? null : Promise.reject(new Error('SYNTHETIC_READ_DOWN'))
  });
  await f.service.provision(OWNER, NUMBER);
  for (let i = 0; i < 5; i++) assert.equal((await f.second().service.provision(OWNER, NUMBER)).statusCode, 202);
  assert.equal(f.calls.purchase.length, 1);
  assert.equal(f.profile().twilioNumberSid, null);
});

test('expired selecting worker is fenced before the irreversible purchase boundary', async t => {
  const oldSelection = deferred(), entered = deferred();
  const f = fixture(t, { selectNumber: async () => {
    if (f.calls.select.length === 1) { entered.resolve(); return oldSelection.promise; }
    return DESTINATION;
  } });
  const old = f.service.provision(OWNER, NUMBER);
  await entered.promise;
  f.expire();
  const current = await f.second().service.provision(OWNER, NUMBER);
  assert.equal(current.statusCode, 201);
  oldSelection.resolve('+12025550102');
  await old;
  assert.equal(f.calls.purchase.length, 1);
  assert.equal(f.phone().twilioNumber, DESTINATION);
});

test('expired purchase worker is only reconciled, and its late valid receipt cannot overwrite another claim', async t => {
  const purchase = deferred(), entered = deferred();
  const f = fixture(t, { purchaseNumber: async input => { entered.resolve(input); return purchase.promise; } });
  const old = f.service.provision(OWNER, NUMBER);
  const input = await entered.promise;
  f.expire();
  const resumed = await f.second().service.provision(OWNER, NUMBER);
  assert.equal(resumed.statusCode, 202);
  assert.equal(f.calls.purchase.length, 1);
  purchase.resolve(receipt(input));
  await old;
  assert.equal(f.phone().twilioNumberSid, SID);
  await f.service.provision(OWNER, NUMBER);
  assert.equal(f.calls.purchase.length, 1);
  assert.equal(f.phone().carrierComplete, 1);
});

for (const invalid of [{ twilioNumber: '+12025550109', twilioNumberSid: SID }, { twilioNumber: DESTINATION, twilioNumberSid: 'NOT_A_SID' }]) {
  test(`invalid purchased receipt cannot become a confirmed profile (${invalid.twilioNumberSid === SID ? 'wrong number' : 'wrong SID'})`, async t => {
    const f = fixture(t, { purchaseNumber: async () => invalid });
    assert.equal((await f.service.provision(OWNER, NUMBER)).statusCode, 202);
    assert.equal(f.profile().twilioNumberSid, null);
    await f.service.provision(OWNER, NUMBER);
    assert.equal(f.calls.purchase.length, 1);
  });
}

test('legacy purchased SID with failed setup is adopted and never repurchased', async t => {
  const f = fixture(t, {}, { provisioned: true, setup: 'failed' });
  const result = await f.service.provision(OWNER, NUMBER);
  assert.equal(result.statusCode, 200);
  assert.equal(f.calls.purchase.length, 0);
  assert.equal(f.phone().carrierComplete, 1);
  assert.equal(f.phone().twilioNumberSid, SID);
});

test('legacy completed provisioning is reused with no provider traffic', async t => {
  const f = fixture(t, {}, { provisioned: true });
  assert.equal((await f.service.provision(OWNER, NUMBER)).statusCode, 200);
  assert.ok(Object.values(f.calls).every(calls => calls.length === 0));
});

test('tenant operation cannot change the business number or adopt another tenant SID', async t => {
  const f = fixture(t);
  await f.service.provision(OWNER, NUMBER);
  await assert.rejects(f.service.provision(OWNER, '+12025550109'), { code: 'PHONE_OPERATION_CONFLICT' });
  f.addOwner('synthetic-other-tenant');
  await assert.rejects(f.service.provision('synthetic-other-tenant', NUMBER), /UNIQUE constraint failed/);
  assert.equal(f.getBusinessProfile('synthetic-other-tenant').twilioNumberSid, null);
  assert.equal(f.profile().twilioNumberSid, SID);
});

test('migration is idempotent and database uniqueness, not application locks, enforces tenant claims', async t => {
  const f = fixture(t);
  await f.service.provision(OWNER, NUMBER);
  installTelephonyOperationsSchema(f.database);
  assert.throws(() => f.database.prepare(`INSERT INTO phoneProvisioningOperations
    (ownerId, operationId, existingNumber, country, purchaseState, createdAt, updatedAt)
    VALUES (?, ?, ?, 'US', 'ready', 0, 0)`).run(OWNER, OP_ID, NUMBER), /UNIQUE constraint failed/);
  assert.throws(() => f.database.prepare(`INSERT INTO phoneProvisioningOperations
    (ownerId, operationId, existingNumber, country, purchaseState, createdAt, updatedAt)
    VALUES ('synthetic-missing-tenant', ?, ?, 'US', 'ready', 0, 0)`).run(OP_ID, NUMBER), /FOREIGN KEY constraint failed/);
  assert.equal(f.phone().twilioNumberSid, SID);
  assert.equal(f.database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
});

test('the retired dashboard coverage operation is absent', async t => {
  const f = fixture(t, {}, { provisioned: true });
  assert.equal(typeof f.service.setCoverage, 'undefined');
  assert.equal(f.profile().operatorEnabled, false);
});

test('phone provisioning keeps owner/provider gates and rejects a forged body owner', async t => {
  const f = fixture(t);
  const source = readFileSync(new URL('../server/src/server.js', import.meta.url), 'utf8');
  const paths = ['/api/onboarding/phone/provision'];
  const routes = new Map();
  const auth = () => {}, providerGate = () => {};
  const context = {
    app: { post: (path, ...handlers) => routes.set(path, handlers) },
    requireAuth: roles => { assert.deepEqual([...roles], ['owner']); return auth; },
    requireProviderWrites: providerGate, asyncHandler: handler => handler,
    telephonyOperations: f.service, clientOnboardingState: ownerId => ({ operator: { enabled: f.getBusinessProfile(ownerId).operatorEnabled } })
  };
  for (const path of paths) {
    const start = source.indexOf(`app.post('${path}'`);
    assert.ok(start > 0);
    const end = source.indexOf('\n}));', start) + '\n}));'.length;
    vm.runInNewContext(source.slice(start, end), context);
    assert.equal(routes.get(path)[0], auth);
    assert.equal(routes.get(path)[1], providerGate);
  }
  const call = async (path, body) => {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
    await routes.get(path).at(-1)({ tenantOwnerId: OWNER, body }, response);
    return response;
  };
  const provisioned = await call(paths[0], { existingNumber: NUMBER, ownerId: 'synthetic-spoofed', operationId: OP_ID });
  assert.equal(provisioned.statusCode, 201);
  assert.equal(f.phone().ownerId, OWNER);
  assert.notEqual(provisioned.body.operationId, OP_ID);
  assert.doesNotMatch(source,/app\.post\('\/api\/operator\/toggle'/);
});

function adapterFixture(t, impl) {
  const keys = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'PUBLIC_BASE_URL'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_SYNTHETIC_NOT_A_REAL_ACCOUNT', TWILIO_API_KEY_SID: 'SK_SYNTHETIC', TWILIO_API_KEY_SECRET: 'SYNTHETIC_NOT_A_CREDENTIAL',
    PUBLIC_BASE_URL: 'https://synthetic.invalid'
  });
  t.mock.method(globalThis, 'fetch', impl);
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
}
const jsonResponse = value => ({ ok: true, json: async () => value });

test('Twilio adapter separates selection from purchase and binds immutable operation receipt without changing incoming route', async t => {
  const calls = [];
  adapterFixture(t, async (url, options) => {
    calls.push({ url: new URL(url), options });
    if (options.method === 'GET') return jsonResponse({ available_phone_numbers: [{ phone_number: DESTINATION }] });
    return jsonResponse({ phone_number: DESTINATION, sid: SID });
  });
  const candidateNumber = await selectTwilioNumber({ country: 'US', existingNumber: NUMBER });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  const result = await provisionTwilioNumber({ existingNumber: NUMBER, candidateNumber, operationId: OP_ID });
  assert.equal(result.twilioNumberSid, SID);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.body.get('FriendlyName'), `otc-provision-${OP_ID}`);
  assert.equal(calls[1].options.body.get('PhoneNumber'), DESTINATION);
  assert.equal(calls[1].options.body.get('VoiceUrl'), 'https://synthetic.invalid/api/twilio/voice/incoming');
});

test('Twilio receipt reconciliation rejects partial, unrelated and paginated results', async t => {
  let payload = {};
  adapterFixture(t, async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(new URL(url).searchParams.get('FriendlyName'), `otc-provision-${OP_ID}`);
    return jsonResponse(payload);
  });
  const input = { operationId: OP_ID, candidateNumber: DESTINATION, existingNumber: NUMBER };
  assert.equal(await findProvisionedTwilioNumber(input), null);
  payload = { incoming_phone_numbers: [{ sid: SID, phone_number: DESTINATION, friendly_name: 'unrelated' }] };
  assert.equal(await findProvisionedTwilioNumber(input), null);
  payload.incoming_phone_numbers[0].friendly_name = `otc-provision-${OP_ID}`;
  payload.next_page_uri = '/synthetic-page';
  assert.equal(await findProvisionedTwilioNumber(input), null);
  delete payload.next_page_uri;
  assert.equal((await findProvisionedTwilioNumber(input)).twilioNumberSid, SID);
});

test('two isolated workers issuing 10 simultaneous requests each share one database purchase claim', { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const workers = [];
  const replies = [];
  let ready = 0, purchases = 0;
  const source = `
    const { parentPort, workerData } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    (async () => {
      const { createTelephonyOperations } = await import(workerData.moduleUrl);
      const db = new DatabaseSync(workerData.filename);
      db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
      let sequence = 0;
      const pending = new Map();
      const remote = (method, input) => new Promise((resolve, reject) => {
        const id = ++sequence; pending.set(id, { resolve, reject });
        parentPort.postMessage({ type: 'provider', id, method, input });
      });
      const ownerQuery = sql => { if (!/\\bownerId\\b/.test(sql)) throw Error('Unscoped query'); return db.prepare(sql); };
      const getBusinessProfile = owner => {
        const row = ownerQuery('SELECT * FROM businessProfiles WHERE ownerId = ?').get(owner);
        return { ...row, operatorEnabled: Boolean(row.operatorEnabled) };
      };
      const updateBusinessProfile = (owner, patch) => {
        const entries = Object.entries(patch);
        ownerQuery('UPDATE businessProfiles SET ' + entries.map(([key]) => key + ' = ?').join(', ') + ' WHERE ownerId = ?')
          .run(...entries.map(([, value]) => value), owner);
        return getBusinessProfile(owner);
      };
      const service = createTelephonyOperations({ database: db, ownerQuery, getBusinessProfile, updateBusinessProfile,
        savePhoneProvisioning: (owner, value) => updateBusinessProfile(owner, {
          existingPhoneNumber: value.existingNumber, twilioNumber: value.twilioNumber, twilioNumberSid: value.twilioNumberSid,
          phoneProvisioningStatus: 'provisioned', carrierSetupStatus: value.carrierSetupStatus
        }), operatorEligibility: () => ({ eligible: true, missing: [] }),
        provider: Object.fromEntries(['selectNumber','purchaseNumber','findPurchasedNumber']
          .map(method => [method, input => remote(method, input)]))
      });
      parentPort.on('message', async message => {
        if (message.type === 'reply') {
          const p = pending.get(message.id); pending.delete(message.id);
          if (message.error) p.reject(new Error(message.error)); else p.resolve(message.value);
        }
        if (message.type === 'start') {
          try {
            const result = await Promise.all(Array.from({ length: 10 }, () => service.provision(workerData.owner, workerData.number)));
            parentPort.postMessage({ type: 'done', result }); db.close(); parentPort.close();
          } catch (error) { parentPort.postMessage({ type: 'failed', error: error.stack }); parentPort.close(); }
        }
      });
      parentPort.postMessage({ type: 'ready' });
    })().catch(error => { parentPort.postMessage({ type: 'failed', error: error.stack }); parentPort.close(); });
  `;
  const completed = Array.from({ length: 2 }, () => new Promise((resolve, reject) => {
    const worker = new Worker(source, { eval: true, workerData: {
      filename: f.filename, owner: OWNER, number: NUMBER,
      moduleUrl: new URL('../server/src/platformIntegrations.js', import.meta.url).href
    } });
    workers.push(worker);
    worker.on('error', reject);
    worker.on('message', message => {
      if (message.type === 'ready' && ++ready === 2) workers.forEach(w => w.postMessage({ type: 'start' }));
      if (message.type === 'failed') reject(new Error(message.error));
      if (message.type === 'done') { replies.push(...message.result); resolve(); }
      if (message.type !== 'provider') return;
      const reply = value => worker.postMessage({ type: 'reply', id: message.id, value });
      switch (message.method) {
        case 'selectNumber': return reply(DESTINATION);
        case 'purchaseNumber': purchases++; return reply(receipt(message.input));
        default: return reject(new Error('Unexpected fake provider call: ' + message.method));
      }
    });
  }));
  t.after(async () => { await Promise.all(workers.map(worker => worker.terminate())); });
  await Promise.all(completed);
  assert.equal(replies.length, 20);
  assert.equal(new Set(replies.map(result => result.operationId)).size, 1);
  assert.equal(purchases, 1);
  assert.equal(f.phone().carrierSetupStatus, 'not_required');
  assert.equal(f.phone().twilioNumberSid, SID);
});
