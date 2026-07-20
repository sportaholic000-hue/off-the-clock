import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateQuote } from '../server/quoteEngine.js';
import { getRequiredOwnerFields, SERVICE_TYPES } from '../server/quoteTemplates.js';
import { getServiceMetadata, ALL_OWNER_FIELDS } from '../server/priceBookMetadata.js';
import { dollarsToCents, pricebookServiceStatus, validatePricebookShape } from '../server/priceBookService.js';
import { CREATE_TABLE_STATEMENTS } from '../server/src/schema.js';

test('Phase 2 metadata covers every engine service and formula owner field', () => {
  const metadata = getServiceMetadata();
  assert.deepEqual(metadata.map(service => service.serviceType), SERVICE_TYPES);
  for (const service of metadata) {
    const fields = new Set((ALL_OWNER_FIELDS[service.serviceType] || []));
    for (const required of getRequiredOwnerFields(service.serviceType, {})) {
      assert.equal(fields.has(required), true, `${service.serviceType} is missing ${required}`);
    }
  }
});

test('mandated owner labels are preserved verbatim', () => {
  const byType = Object.fromEntries(getServiceMetadata().map(service => [service.serviceType, service]));
  const label = (serviceType, field) => byType[serviceType].fields.find(item => item.field === field).label;
  assert.equal(label('ROOFING_REPLACEMENT','materialCostPerSquare'), 'Your all-in installed material price per square, INCLUDING starter, drip edge, ridge cap, flashing, and vents.');
  assert.equal(label('INTERIOR_PAINTING','laborPerFloorSqft'), 'Your labor price per square foot of FLOOR area — walls only, two coats, standard 8-ft ceilings.');
  assert.equal(label('INTERIOR_PAINTING','materialPerFloorSqft2Coats'), 'Your paint/material cost per square foot of FLOOR area for two coats on walls.');
  assert.equal(label('FENCING_INSTALL','concretePerPost'), 'Concrete + digging cost per post at your local frost/set depth.');
  assert.equal(label('FENCING_INSTALL','gatePrice'), "Installed price per gate INCLUDING gate posts' hardware; gate posts themselves are counted below.");
  assert.equal(label('CONCRETE_DRIVEWAY','basePrepPerSqft'), 'Excavation + compacted gravel base + grading, per square foot.');
  assert.equal(label('CONCRETE_DRIVEWAY','laborPerSqft'), 'Include forming labor, expansion joints, cure & seal in your per-sqft labor rate.');
});

test('dollar conversion handles nested owner rates and leaves factors alone', () => {
  const converted = dollarsToCents({
    services: [{
      serviceType:'ROOFING_REPAIR',
      laborHourlyRate:75.25,
      repairMaterialAllowance:{ flashing:125.50 },
      repairHours:{ flashing:{ small:2.5 } },
      tiers:[{ name:'Better', overrides:{ laborHourlyRate:80 } }]
    }],
    defaults:{ markupPercent:30, travelFee:45.75 }
  });
  assert.equal(converted.services[0].laborHourlyRate, 7525);
  assert.equal(converted.services[0].repairMaterialAllowance.flashing, 12550);
  assert.equal(converted.services[0].repairHours.flashing.small, 2.5);
  assert.equal(converted.services[0].tiers[0].overrides.laborHourlyRate, 8000);
  assert.equal(converted.defaults.markupPercent, 30);
  assert.equal(converted.defaults.travelFee, 4575);
});

test('minimum fields accept zero while rates still require a nonzero value', () => {
  const ready = pricebookServiceStatus({
    serviceType:'FENCING_INSTALL',
    laborPerLinearFoot:1400,
    materialPerLinearFoot:2200,
    postSpacing:8,
    postPrice:3800,
    concretePerPost:1800,
    postsIncludedInMaterial:false,
    gatePrice:28500,
    minimumJob:0
  });
  assert.equal(ready.status, 'QUOTING LIVE');
  const missing = pricebookServiceStatus({ ...ready, laborPerLinearFoot:0 });
  assert.deepEqual(missing.missingOwnerFields, ['laborPerLinearFoot']);
});

test('AI starter suggestions never activate without owner confirmation', () => {
  const status = pricebookServiceStatus({
    serviceType:'CUSTOM',
    service:'Sample',
    low:10000,
    high:20000,
    unit:'flat',
    source:'AI_SUGGESTED',
    ownerConfirmed:false
  });
  assert.equal(status.status, 'NEEDS PRICING');
  assert.deepEqual(status.missingOwnerFields, ['low','high','unit']);
});

test('Class 2 fencing override changes labor without changing materials', () => {
  const customerInputs = { linearFeet:120, lfMethod:'exact', fenceType:'cedar', fenceHeight:6, gateCount:1, cornerCount:2, terrainSlope:'moderate' };
  const ownerPricing = {
    laborPerLinearFoot:1400, materialPerLinearFoot:2200, postSpacing:8,
    postPrice:3800, concretePerPost:1800, postsIncludedInMaterial:false,
    gatePrice:28500, minimumJob:0
  };
  const defaults = { markupPercent:0, taxMode:'TAX_NONE', rangeBufferPercent:10 };
  const base = generateQuote({ serviceType:'FENCING_INSTALL', customerInputs, ownerPricing, businessDefaults:defaults });
  const changed = generateQuote({
    serviceType:'FENCING_INSTALL',
    customerInputs,
    ownerPricing:{ ...ownerPricing, terrainMultiplier:{ flat:1, moderate:2, steep:3 } },
    businessDefaults:defaults
  });
  const lines = result => Object.fromEntries(result.lineItems.map(item => [item.name,item.amountCents]));
  assert.equal(lines(changed)['Fence labor'] > lines(base)['Fence labor'], true);
  assert.equal(lines(changed)['Fence materials'], lines(base)['Fence materials']);
  assert.equal(lines(changed).Posts, lines(base).Posts);
  assert.equal(lines(changed)['Concrete footings'], lines(base)['Concrete footings']);
});

test('Phase 2 tables enforce DRAFT-only interview persistence', () => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  for (const statement of CREATE_TABLE_STATEMENTS) database.exec(statement);
  database.prepare(`INSERT INTO users (
    id, ownerId, email, passwordHash, firstName, businessName, plan,
    planStatus, trialEndsAt, timezone, role, createdAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'owner-1', null, 'owner@example.com', 'hash', 'Mike', 'Test Co',
    'QuoteDone', 'trialing', null, 'UTC', 'owner', new Date().toISOString()
  );
  database.prepare(`INSERT INTO priceBookDrafts (
    id, ownerId, status, mode, serviceTypesJson, fieldsJson,
    confirmedFieldsJson, currentField, createdAt, updatedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'draft-1','owner-1','DRAFT','browser','[]','{}','{}',null,'now','now'
  );
  assert.throws(() => database.prepare(`INSERT INTO priceBookDrafts (
    id, ownerId, status, mode, serviceTypesJson, fieldsJson,
    confirmedFieldsJson, currentField, createdAt, updatedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'draft-2','owner-1','LIVE','browser','[]','{}','{}',null,'now','now'
  ));
  database.close();
});

test('price book shape rejects more than three tiers', () => {
  assert.throws(() => validatePricebookShape({
    defaults:{ markupMode:'markup', taxMode:'TAX_NONE' },
    services:[{
      serviceType:'CUSTOM',
      tiers:['Good','Better','Best','Extra'].map(name => ({ name, overrides:{} }))
    }]
  }), /at most three tiers/);
});

test('owner-facing Phase 2 source has no gradients or forwarding mechanics', () => {
  const client = [
    'client/src/onboarding.jsx','client/src/pricebook.jsx',
    'client/src/dashboard.jsx','client/src/styles.css'
  ].map(path => readFileSync(path, 'utf8')).join('\n');
  assert.equal(/gradient/i.test(client), false);
  assert.equal(/forward(?:ing|ed|s)?/i.test(client), false);
  assert.match(client, /Keep the number your customers already know/);
  assert.match(client, /CALLS RING YOUR PHONE/);
  assert.match(client, /Tax settings are your responsibility\. Off The Clock applies the mode and rate you set\. It does not provide tax advice\./);
});

test('server exposes the complete Phase 2 route surface', () => {
  const source = readFileSync('server/src/server.js', 'utf8');
  for (const route of [
    '/api/onboarding/state','/api/onboarding/account','/api/onboarding/business-types',
    '/api/business/jurisdiction','/api/onboarding/phone/provision',
    '/api/onboarding/phone/test','/api/onboarding/knowledge-base',
    '/api/operator/toggle','/api/onboarding/calendar','/api/onboarding/voice',
    '/api/pricebook/interview','/api/pricebook/meta','/api/pricebook/suggest',
    '/api/pricebook/preview','/api/pricebook/save','/api/pricebook/:ownerId'
  ]) assert.match(source, new RegExp(route.replaceAll('/','\\/')));
});
