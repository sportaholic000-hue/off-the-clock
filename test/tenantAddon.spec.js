import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import jwt from 'jsonwebtoken';
import {createAuthSessionService} from '../server/src/authSessionService.js';
import { generateQuote, sanitizeForCustomer } from '../server/quoteEngine.js';
import { requireAuth } from '../server/src/authMiddleware.js';
import { CREATE_TABLE_STATEMENTS } from '../server/src/schema.js';
import { migrateDatabase, usersTableNeedsRebuild } from '../server/src/migrations.js';

process.env.JWT_SECRET = 'phase-1-1-test-secret';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD_HASH = 'configured-for-test';

const defaults = { markupPercent: 30, markupMode: 'markup', taxMode: 'TAX_NONE', minimumJobPrice: 0, rangeBufferPercent: 10 };
const mapLines = result => Object.fromEntries(result.lineItems.map(item => [item.name, item.amountCents]));
const now = '2026-07-19T00:00:00.000Z';
const signUserToken=(user,database)=>createAuthSessionService(database).create({...user,passwordHash:'hash'}).token;
const signAdminToken=database=>createAuthSessionService(database).create({id:'admin',role:'admin',email:process.env.ADMIN_EMAIL,passwordHash:process.env.ADMIN_PASSWORD_HASH}).token;

function freshDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  migrateDatabase(database);
  return database;
}

function insertUser(database, { id, ownerId = null, role = 'owner', email = `${id}@example.com` }) {
  database.prepare(`INSERT INTO users (id, ownerId, email, passwordHash, firstName, businessName, role, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, ownerId, email, 'hash', id, `${id} Co`, role, now);
  return { id, ownerId, role, email };
}

function responseAdapter(nodeResponse) {
  return {
    status(code) {
      nodeResponse.statusCode = code;
      return this;
    },
    json(payload) {
      nodeResponse.setHeader('content-type', 'application/json');
      nodeResponse.end(JSON.stringify(payload));
      return this;
    }
  };
}

async function createAuthServer(database) {
  const tenantAuth = requireAuth(['owner', 'staff'], { database });
  const adminAuth = requireAuth(['admin'], { database });
  const server = createServer((req, nodeResponse) => {
    const res = responseAdapter(nodeResponse);
    if (req.method === 'GET' && req.url === '/protected') {
      return tenantAuth(req, res, () => {
        res.json({ role:req.role, userId:req.userId, tenantOwnerId:req.tenantOwnerId });
      });
    }
    if (req.method === 'GET' && req.url === '/tenant-data') {
      return tenantAuth(req, res, () => {
        const records = database.prepare('SELECT id, ownerId, value FROM tenant_records WHERE ownerId = ? ORDER BY id').all(req.tenantOwnerId);
        res.json({ role:req.role, tenantOwnerId:req.tenantOwnerId, records });
      });
    }
    if (req.method === 'GET' && req.url === '/admin') {
      return adminAuth(req, res, () => {
        res.json({
          role: req.role,
          hasTenantOwnerId: Object.hasOwn(req, 'tenantOwnerId'),
          hasOwnerId: Object.hasOwn(req, 'ownerId')
        });
      });
    }
    return res.status(404).json({ error:'Not found' });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

async function getWithToken(baseUrl, path, token) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return { response, body: await response.json() };
}

function assertSkippedAddon(result, addonName) {
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(Object.hasOwn(mapLines(result), addonName), false);
  assert.ok(result.appliedRules.includes(`${addonName} skipped: price not configured`));
  assert.deepEqual(result.options[0].skippedAddons, [addonName]);
  assert.ok(result.options[0].disclaimer.endsWith(`This estimate does not include: ${addonName}.`));
  assert.equal(result.disclaimer, result.options[0].disclaimer);

  const customer = sanitizeForCustomer(result);
  assert.deepEqual(customer.options[0].skippedAddons, [addonName]);
  assert.equal(customer.options[0].disclaimer, result.options[0].disclaimer);
  assert.equal(Object.hasOwn(customer.options[0], 'lineItems'), false);
}

function flatRoofRepairQuote(overrides = {}) {
  return generateQuote({
    serviceType: 'FLAT_ROOF_REPAIR',
    customerInputs: { repairType:'leak', affectedArea:10, membraneType:'epdm', leakPresent:false, pondingWater:true },
    ownerPricing: {
      laborHourlyRate:10000,
      repairMinimum:0,
      patchRepairHours:{ leak:{ small:2, medium:4, large:8 } },
      patchMaterialAllowance:{ leak:{ small:4000, medium:8000, large:16000 } },
      ...overrides
    },
    businessDefaults: defaults
  });
}



test('add-on missing-price guard executes every priced and unpriced path without a helper ReferenceError', () => {
  const mowing = overrides => generateQuote({
    serviceType:'LANDSCAPING_MOWING',
    customerInputs:{ yardSqft:5000, sqftMethod:'exact', serviceFrequency:'weekly', grassCondition:'maintained', bagClippings:true, edgingIncluded:true },
    ownerPricing:{
      mowingBaseRatePerSqft:2,
      minimumServiceCharge:0,
      frequencyMultipliers:{ weekly:1 },
      overgrowthMultipliers:{ maintained:1 },
      ...overrides
    },
    businessDefaults:defaults
  });

  for (const run of [
    () => flatRoofRepairQuote(),
    () => flatRoofRepairQuote({ pondingWaterSurcharge:2500 }),
    () => flatRoofRepairQuote({ tiers:[{ name:'Good', overrides:{} }, { name:'Better', overrides:{ pondingWaterSurcharge:2500 } }] }),
    () => mowing({}),
    () => mowing({ baggingSurchargePercent:10, edgingPerLinearFoot:50 })
  ]) {
    assert.doesNotThrow(run);
  }
});

test('unpriced ponding water addon is skipped and disclosed', () => {
  assertSkippedAddon(flatRoofRepairQuote(), 'Ponding water surcharge');
});

test('unpriced mowing bagging addon is skipped and disclosed', () => {
  const result = generateQuote({
    serviceType: 'LANDSCAPING_MOWING',
    customerInputs: { yardSqft:5000, sqftMethod:'exact', serviceFrequency:'weekly', grassCondition:'maintained', bagClippings:true, edgingIncluded:false },
    ownerPricing: { mowingBaseRatePerSqft:2, minimumServiceCharge:0, frequencyMultipliers:{ weekly:1 }, overgrowthMultipliers:{ maintained:1 } },
    businessDefaults: defaults
  });
  assertSkippedAddon(result, 'Clipping bagging & disposal');
});

test('unpriced mowing edging addon is skipped and disclosed', () => {
  const result = generateQuote({
    serviceType: 'LANDSCAPING_MOWING',
    customerInputs: { yardSqft:5000, sqftMethod:'exact', serviceFrequency:'weekly', grassCondition:'maintained', bagClippings:false, edgingIncluded:true },
    ownerPricing: { mowingBaseRatePerSqft:2, minimumServiceCharge:0, frequencyMultipliers:{ weekly:1 }, overgrowthMultipliers:{ maintained:1 } },
    businessDefaults: defaults
  });
  assertSkippedAddon(result, 'Perimeter edging');
});

test('both unpriced mowing addons are skipped and disclosed together', () => {
  const result = generateQuote({
    serviceType: 'LANDSCAPING_MOWING',
    customerInputs: { yardSqft:5000, sqftMethod:'exact', serviceFrequency:'weekly', grassCondition:'maintained', bagClippings:true, edgingIncluded:true },
    ownerPricing: { mowingBaseRatePerSqft:2, minimumServiceCharge:0, frequencyMultipliers:{ weekly:1 }, overgrowthMultipliers:{ maintained:1 } },
    businessDefaults: defaults
  });
  assert.deepEqual(result.options[0].skippedAddons, ['Clipping bagging & disposal', 'Perimeter edging']);
  assert.ok(result.options[0].disclaimer.endsWith('This estimate does not include: Clipping bagging & disposal, Perimeter edging.'));
  assert.equal(result.disclaimer, result.options[0].disclaimer);
  assert.ok(result.appliedRules.includes('Clipping bagging & disposal skipped: price not configured'));
  assert.ok(result.appliedRules.includes('Perimeter edging skipped: price not configured'));
  assert.equal(Object.hasOwn(mapLines(result), 'Clipping bagging & disposal'), false);
  assert.equal(Object.hasOwn(mapLines(result), 'Perimeter edging'), false);
});

test('tier addon divergence keeps option disclaimers separate and top-level base-only', () => {
  const result = flatRoofRepairQuote({
    tiers: [
      { name:'Good', overrides:{} },
      { name:'Better', overrides:{ pondingWaterSurcharge:2500 } }
    ]
  });
  const [good, better] = result.options;
  assert.deepEqual(good.skippedAddons, ['Ponding water surcharge']);
  assert.ok(good.disclaimer.endsWith('This estimate does not include: Ponding water surcharge.'));
  assert.equal(Object.hasOwn(mapLines(good), 'Ponding water surcharge'), false);
  assert.deepEqual(better.skippedAddons, []);
  assert.equal(better.disclaimer.includes('This estimate does not include:'), false);
  assert.equal(mapLines(better)['Ponding water surcharge'], 2500);
  assert.equal(result.disclaimer.includes('This estimate does not include:'), false);
  assert.ok(result.appliedRules.includes('Good tier: Ponding water surcharge skipped: price not configured'));
  assert.equal(result.appliedRules.some(rule => /null tier|undefined tier/.test(rule)), false);

  const customer = sanitizeForCustomer(result);
  assert.deepEqual(customer.options.map(option => option.skippedAddons), [['Ponding water surcharge'], []]);
  assert.equal(customer.options[0].disclaimer, good.disclaimer);
  assert.equal(customer.options[1].disclaimer, better.disclaimer);
  assert.equal(customer.options.some(option => Object.hasOwn(option, 'lineItems')), false);
});

test('tiers sharing the same addon exclusion may disclose it at top level', () => {
  const result = flatRoofRepairQuote({
    tiers: [
      { name:'Good', overrides:{} },
      { name:'Better', overrides:{} }
    ]
  });
  assert.ok(result.disclaimer.endsWith('This estimate does not include: Ponding water surcharge.'));
  assert.deepEqual(result.options.map(option => option.skippedAddons), [
    ['Ponding water surcharge'],
    ['Ponding water surcharge']
  ]);
  assert.ok(result.appliedRules.includes('Good tier: Ponding water surcharge skipped: price not configured'));
  assert.ok(result.appliedRules.includes('Better tier: Ponding water surcharge skipped: price not configured'));
});

test('deleted staff token returns 401 through requireAuth', async () => {
  const database = freshDatabase();
  insertUser(database, { id:'owner-1' });
  const staff = insertUser(database, { id:'staff-1', ownerId:'owner-1', role:'staff' });
  const token = signUserToken(staff, database);
  database.prepare('DELETE FROM users WHERE id = ?').run(staff.id);
  const server = await createAuthServer(database);
  try {
    const { response } = await getWithToken(server.baseUrl, '/protected', token);
    assert.equal(response.status, 401);
  } finally {
    await server.close();
    database.close();
  }
});

test('deleted owner token returns 401 through requireAuth', async () => {
  const database = freshDatabase();
  const owner = insertUser(database, { id:'owner-1' });
  const token = signUserToken(owner, database);
  database.prepare('DELETE FROM users WHERE id = ?').run(owner.id);
  const server = await createAuthServer(database);
  try {
    const { response } = await getWithToken(server.baseUrl, '/protected', token);
    assert.equal(response.status, 401);
  } finally {
    await server.close();
    database.close();
  }
});

test('role-changed token returns 401 through requireAuth', async () => {
  const database = freshDatabase();
  const owner = insertUser(database, { id:'owner-1' });
  const token = signUserToken(owner, database);
  database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(owner.id);
  const server = await createAuthServer(database);
  try {
    const { response } = await getWithToken(server.baseUrl, '/protected', token);
    assert.equal(response.status, 401);
  } finally {
    await server.close();
    database.close();
  }
});

test('staff protected route reads only the current database owner tenant', async () => {
  const database = freshDatabase();
  insertUser(database, { id:'owner-1' });
  insertUser(database, { id:'owner-2' });
  const staff = insertUser(database, { id:'staff-1', ownerId:'owner-1', role:'staff' });
  database.exec(`CREATE TABLE tenant_records (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    value TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`);
  database.prepare('INSERT INTO tenant_records (id, ownerId, value) VALUES (?, ?, ?)').run('record-1', 'owner-1', 'owner one');
  database.prepare('INSERT INTO tenant_records (id, ownerId, value) VALUES (?, ?, ?)').run('record-2', 'owner-2', 'owner two');
  const token = signUserToken(staff, database);
  const server = await createAuthServer(database);
  try {
    const { response, body } = await getWithToken(server.baseUrl, '/tenant-data', token);
    assert.equal(response.status, 200);
    assert.equal(body.tenantOwnerId, 'owner-1');
    assert.deepEqual(body.records, [{ id:'record-1', ownerId:'owner-1', value:'owner one' }]);
  } finally {
    await server.close();
    database.close();
  }
});

test('environment admin path works without tenant context', async () => {
  const database = freshDatabase();
  const server = await createAuthServer(database);
  try {
    const { response, body } = await getWithToken(server.baseUrl, '/admin', signAdminToken(database));
    assert.equal(response.status, 200);
    assert.deepEqual(body, { role:'admin', hasTenantOwnerId:false, hasOwnerId:false });
  } finally {
    await server.close();
    database.close();
  }
});

test('users table rejects staff without ownerId at the DB level', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(CREATE_TABLE_STATEMENTS[0]);
  insertUser(database, { id:'owner-1' });
  assert.throws(() => insertUser(database, { id:'staff-missing-owner', role:'staff' }), /constraint|CHECK/i);
  database.close();
});

test('triggers reject staff and admin rows as staff parents', () => {
  const database = freshDatabase();
  insertUser(database, { id:'owner-1' });
  insertUser(database, { id:'admin-1', role:'admin' });
  insertUser(database, { id:'staff-1', ownerId:'owner-1', role:'staff' });

  assert.throws(
    () => insertUser(database, { id:'staff-2', ownerId:'staff-1', role:'staff' }),
    /staff ownerId must reference an owner/
  );
  assert.throws(
    () => database.prepare('UPDATE users SET ownerId = ? WHERE id = ?').run('admin-1', 'staff-1'),
    /staff ownerId must reference an owner/
  );
  database.close();
});

test('owner demotion is blocked while staff reference the owner', () => {
  const database = freshDatabase();
  insertUser(database, { id:'owner-1' });
  insertUser(database, { id:'staff-1', ownerId:'owner-1', role:'staff' });
  assert.throws(
    () => database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run('owner-1'),
    /owner role cannot change while staff reference it/
  );
  assert.equal(database.prepare('SELECT role FROM users WHERE id = ?').get('owner-1').role, 'owner');
  database.close();
});

test('constraint detection requires the full role and nullability CHECK', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    ownerId TEXT,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    firstName TEXT NOT NULL,
    businessName TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'Operator',
    planStatus TEXT NOT NULL DEFAULT 'trialing',
    trialEndsAt TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    role TEXT NOT NULL CHECK (role IN ('owner', 'staff', 'admin')),
    createdAt TEXT NOT NULL,
    CHECK ((role = 'staff' AND ownerId IS NOT NULL) OR role IN ('owner', 'admin')),
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`);
  assert.equal(usersTableNeedsRebuild(database), true);
  insertUser(database, { id:'owner-1' });
  migrateDatabase(database);
  assert.equal(usersTableNeedsRebuild(database), false);
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  database.close();
});

test('migration aborts for legacy staff linked to a non-owner parent', () => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    ownerId TEXT,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    firstName TEXT NOT NULL,
    businessName TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'Operator',
    planStatus TEXT NOT NULL DEFAULT 'trialing',
    trialEndsAt TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    role TEXT NOT NULL CHECK (role IN ('owner', 'staff', 'admin')),
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`);
  insertUser(database, { id:'admin-parent', role:'admin' });
  insertUser(database, { id:'legacy-staff', ownerId:'admin-parent', role:'staff' });

  assert.throws(
    () => migrateDatabase(database),
    /Users migration validation failed:.*tenant invariant: legacy-staff->admin-parent \(admin\)/
  );
  assert.equal(database.prepare('SELECT role FROM users WHERE id = ?').get('legacy-staff').role, 'staff');
  database.close();
});
