import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTelephonyOperations } from '../server/src/platformIntegrations.js';

// Exercise the production driver's transaction.immediate path, not a driver mock.
// The separate native-SQLite suite supplies the adversarial interleaving matrix.
test('production better-sqlite3: durable provisioning completes without carrier coverage', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'otc-synthetic-better-sqlite-'));
  const database = new Database(join(directory, 'synthetic.sqlite'));
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = FULL');
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });
  const ownerId = 'synthetic-production-driver-owner';
  const sid = `PN${'3'.repeat(32)}`;
  database.exec('CREATE TABLE users (id TEXT PRIMARY KEY); CREATE TABLE businessProfiles (ownerId TEXT PRIMARY KEY REFERENCES users(id), json TEXT NOT NULL);');
  database.prepare('INSERT INTO users VALUES (?)').run(ownerId);
  database.prepare('INSERT INTO businessProfiles VALUES (?, ?)').run(ownerId, JSON.stringify({
    country: 'US', operatorEnabled: false, onboardingStep: 4, carrierSetupStatus: 'pending'
  }));
  const ownerQuery = sql => { assert.match(sql, /\bownerId\b/); return database.prepare(sql); };
  const getBusinessProfile = owner => JSON.parse(ownerQuery('SELECT json FROM businessProfiles WHERE ownerId = ?').get(owner).json);
  const updateBusinessProfile = (owner, patch) => {
    const profile = { ...getBusinessProfile(owner), ...patch };
    ownerQuery('UPDATE businessProfiles SET json = ? WHERE ownerId = ?').run(JSON.stringify(profile), owner);
    return profile;
  };
  let purchases = 0;
  let finishPurchase;
  const gate = new Promise(resolve => { finishPurchase = resolve; });
  const service = createTelephonyOperations({ database, ownerQuery, getBusinessProfile, updateBusinessProfile,
    savePhoneProvisioning: (owner, value) => updateBusinessProfile(owner, {
      existingPhoneNumber: value.existingNumber, twilioNumber: value.twilioNumber, twilioNumberSid: value.twilioNumberSid,
      phoneProvisioningStatus: 'provisioned', carrierSetupStatus: value.carrierSetupStatus
    }),
    provider: {
      selectNumber: async () => '+12025550103',
      purchaseNumber: async input => {
        purchases++;
        assert.equal(ownerQuery('SELECT purchaseState FROM phoneProvisioningOperations WHERE ownerId = ?').get(ownerId).purchaseState, 'purchasing');
        await gate;
        return { twilioNumber: input.candidateNumber, twilioNumberSid: sid };
      },
      findPurchasedNumber: async () => { throw new Error('SYNTHETIC_UNEXPECTED_RECONCILIATION'); }
    }
  });
  const requests = Array.from({ length: 20 }, () => service.provision(ownerId, '+12025550100'));
  finishPurchase();
  const results = await Promise.all(requests);
  assert.equal(purchases, 1);
  assert.equal(new Set(results.map(result => result.operationId)).size, 1);
  assert.equal(results.filter(result => result.statusCode === 201).length, 1);
  assert.equal(getBusinessProfile(ownerId).twilioNumberSid, sid);
  assert.equal((await service.provision(ownerId, '+12025550100')).statusCode, 200);
  assert.equal(purchases, 1);
  assert.equal(getBusinessProfile(ownerId).carrierSetupStatus, 'not_required');
  assert.equal(typeof service.setCoverage, 'undefined');
  assert.equal(Boolean(getBusinessProfile(ownerId).operatorEnabled), false);
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
});
