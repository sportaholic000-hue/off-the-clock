import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { generateQuote } from '../server/quoteEngine.js';
import { CREATE_TABLE_STATEMENTS } from '../server/src/schema.js';
import { attachTenantContext } from '../server/src/tenant.js';

const defaults = { markupPercent: 30, markupMode: 'markup', taxMode: 'TAX_NONE', minimumJobPrice: 0, rangeBufferPercent: 10 };
const mapLines = result => Object.fromEntries(result.lineItems.map(item => [item.name, item.amountCents]));

function assertSkippedAddon(result, addonName) {
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(Object.hasOwn(mapLines(result), addonName), false);
  assert.ok(result.appliedRules.includes(`${addonName} skipped: price not configured`));
  assert.ok(result.disclaimer.endsWith(`This estimate does not include: ${addonName}.`));
}

test('unpriced ponding water addon is skipped and disclosed', () => {
  const result = generateQuote({
    serviceType: 'FLAT_ROOF_REPAIR',
    customerInputs: { repairType:'leak', affectedArea:10, membraneType:'epdm', leakPresent:false, pondingWater:true },
    ownerPricing: {
      laborHourlyRate:10000,
      repairMinimum:0,
      patchRepairHours:{ leak:{ small:2, medium:4, large:8 } },
      patchMaterialAllowance:{ leak:{ small:4000, medium:8000, large:16000 } }
    },
    businessDefaults: defaults
  });
  assertSkippedAddon(result, 'Ponding water surcharge');
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

test('staff tenant context scopes to the owning ownerId', () => {
  const req = {};
  const tenantOwnerId = attachTenantContext(req, { sub:'staff-1', role:'staff', ownerId:'owner-1', email:'staff@example.com' });
  assert.equal(tenantOwnerId, 'owner-1');
  assert.equal(req.userId, 'staff-1');
  assert.equal(req.role, 'staff');
  assert.equal(req.tenantOwnerId, 'owner-1');
  assert.equal(req.ownerId, 'owner-1');
});

test('users table rejects staff without ownerId at the DB level', () => {
  const database = new DatabaseSync(':memory:');
  const usersTable = CREATE_TABLE_STATEMENTS.find(statement => statement.includes('CREATE TABLE IF NOT EXISTS users'));
  database.exec(usersTable);
  database.prepare(`INSERT INTO users (id, ownerId, email, passwordHash, firstName, businessName, role, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('owner-1', null, 'owner@example.com', 'hash', 'Owner', 'Owner Co', 'owner', '2026-07-19T00:00:00.000Z');

  assert.throws(() => {
    database.prepare(`INSERT INTO users (id, ownerId, email, passwordHash, firstName, businessName, role, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('staff-missing-owner', null, 'staff-missing@example.com', 'hash', 'Staff', 'Owner Co', 'staff', '2026-07-19T00:00:00.000Z');
  }, /constraint|CHECK/i);

  database.prepare(`INSERT INTO users (id, ownerId, email, passwordHash, firstName, businessName, role, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('staff-1', 'owner-1', 'staff@example.com', 'hash', 'Staff', 'Owner Co', 'staff', '2026-07-19T00:00:00.000Z');
  assert.equal(database.prepare('SELECT ownerId FROM users WHERE id = ?').get('staff-1').ownerId, 'owner-1');
  database.close();
});
