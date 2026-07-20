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
  const fencing = {
    serviceType:'FENCING_INSTALL',
    laborPerLinearFoot:1400,
    materialPerLinearFoot:2200,
    postSpacing:8,
    postPrice:3800,
    concretePerPost:1800,
    postsIncludedInMaterial:false,
    gatePrice:28500,
    minimumJob:0
  };
  const ready = pricebookServiceStatus(fencing);
  assert.equal(ready.status, 'QUOTING LIVE');
  const missing = pricebookServiceStatus({ ...fencing, laborPerLinearFoot:0 });
  assert.deepEqual(missing.missingOwnerFields, ['laborPerLinearFoot']);
});

test('AI-sourced services require individual confirmation of every field', () => {
  const service = {
    serviceType:'CUSTOM',
    service:'Sample',
    low:10000,
    high:20000,
    unit:'flat',
    source:'AI_SUGGESTED',
    confirmedFields:{}
  };
  const unconfirmed = pricebookServiceStatus(service);
  assert.equal(unconfirmed.status, 'NEEDS PRICING');
  assert.deepEqual(unconfirmed.missingOwnerFields, ['low','high','unit']);

  const partial = pricebookServiceStatus({ ...service, confirmedFields:{ low:true, high:true } });
  assert.equal(partial.status, 'NEEDS PRICING');
  assert.deepEqual(partial.missingOwnerFields, ['unit']);

  const confirmed = pricebookServiceStatus({ ...service, confirmedFields:{ low:true, high:true, unit:true } });
  assert.equal(confirmed.status, 'QUOTING LIVE');

  const interview = pricebookServiceStatus({ ...service, source:'AI_INTERVIEW', confirmedFields:{} });
  assert.equal(interview.status, 'NEEDS PRICING');
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
  assert.match(client, /Tax settings are your responsibility\. Off The Clock applies the mode and rate you set — it does not provide tax advice\./);
  assert.match(client, /OPERATOR LIVE — every call from here on is covered\./);
  assert.equal(/planStatus === 'trialing' \|\|/.test(client), false, 'client must not widen plan access for trials');
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

test('every owner field is classified as money or explicitly non-money', async () => {
  const { MONEY_FIELD_NAMES, NON_MONEY_OWNER_FIELDS } = await import('../server/priceBookMetadata.js');
  for (const [serviceType, fields] of Object.entries(ALL_OWNER_FIELDS)) {
    for (const field of fields) {
      const classified = MONEY_FIELD_NAMES.has(field) || NON_MONEY_OWNER_FIELDS.has(field);
      assert.equal(classified, true, `${serviceType}.${field} must be in MONEY_FIELD_NAMES or NON_MONEY_OWNER_FIELDS`);
      assert.equal(MONEY_FIELD_NAMES.has(field) && NON_MONEY_OWNER_FIELDS.has(field), false, `${serviceType}.${field} cannot be both money and non-money`);
    }
  }
});

test('previously skipped monetary fields now convert dollars to cents', () => {
  const converted = dollarsToCents({
    services: [{
      serviceType:'SIDING_REPLACEMENT', trimPerLinearFoot:5, houseWrapPerSqft:1.5
    }, {
      serviceType:'CONCRETE_DRIVEWAY', demolitionPerSqft:4, disposalPerSqft:2.25
    }],
    defaults:{}
  });
  assert.equal(converted.services[0].trimPerLinearFoot, 500);
  assert.equal(converted.services[0].houseWrapPerSqft, 150);
  assert.equal(converted.services[1].demolitionPerSqft, 400);
  assert.equal(converted.services[1].disposalPerSqft, 225);
});

test('houseWrapPerSqft is withdrawn pending the pricing-mode ruling (no exposure, no line, no double count)', () => {
  // The mandated materialPerSqft label says house wrap is INCLUDED, while the
  // spec also allows houseWrapPerSqft as a separate charge. Until the owner
  // rules on a pricing mode, the field is neither editable nor consumed, so
  // it can neither double-count nor sit dead in the editor.
  assert.equal(ALL_OWNER_FIELDS.SIDING_REPLACEMENT.includes('houseWrapPerSqft'), false);
  const customerInputs = { sidingType:'vinyl', areaInputMethod:'sqft', sidingAreaSqft:1000, stories:'1', oldSidingRemoval:false, trimIncluded:false };
  const ownerPricing = {
    laborPerSqft:{ vinyl:300 }, materialPerSqft:{ vinyl:400 }, minimumJob:0,
    houseWrapPerSqft:50, allowAssumptionBasedQuotes:true
  };
  const result = generateQuote({ serviceType:'SIDING_REPLACEMENT', customerInputs, ownerPricing, businessDefaults:{ markupPercent:0, taxMode:'TAX_NONE', rangeBufferPercent:10 } });
  assert.equal(result.lineItems.find(item => item.name === 'House wrap'), undefined);
});

test('malformed leaves and business defaults are rejected at save', () => {
  const base = {
    serviceType:'FENCING_INSTALL', laborPerLinearFoot:14, materialPerLinearFoot:22,
    postSpacing:8, postPrice:38, concretePerPost:18, postsIncludedInMaterial:false,
    gatePrice:285, minimumJob:0
  };
  assert.throws(() => validatePricebookShape({
    defaults:{}, services:[{ ...base, terrainMultiplier:{ flat:1, moderate:'bad', steep:1.3 } }]
  }), /must be a number/);
  assert.throws(() => validatePricebookShape({
    defaults:{}, services:[{ ...base, laborPerLinearFoot:'14' }]
  }), /must be a finite number/);
  assert.throws(() => validatePricebookShape({
    defaults:{}, services:[{ ...base, postsIncludedInMaterial:'yes' }]
  }), /must be true or false/);
  assert.throws(() => validatePricebookShape({
    defaults:{ travelFee:-50 }, services:[]
  }), /defaults\.travelFee/);
  assert.throws(() => validatePricebookShape({
    defaults:{ rangeBufferPercent:'nonsense' }, services:[]
  }), /defaults\.rangeBufferPercent/);
  assert.throws(() => validatePricebookShape({
    defaults:{ overheadFixed:Number.NaN }, services:[]
  }), /defaults\.overheadFixed/);
  assert.equal(validatePricebookShape({
    defaults:{ travelFee:45.5, rangeBufferPercent:10, peakSurchargePercent:0 }, services:[base]
  }), true);
});

test('negative pricing is rejected at save and treated as unconfigured by the engine', () => {
  const base = {
    serviceType:'FENCING_INSTALL', laborPerLinearFoot:14, materialPerLinearFoot:22,
    postSpacing:8, postPrice:38, concretePerPost:18, postsIncludedInMaterial:false,
    gatePrice:285, minimumJob:0
  };
  assert.throws(() => validatePricebookShape({
    defaults:{}, services:[{ ...base, laborPerLinearFoot:-14 }]
  }), /cannot be negative/);
  assert.throws(() => validatePricebookShape({
    defaults:{}, services:[{ ...base, tiers:[{ name:'Budget', overrides:{ laborPerLinearFoot:-4 } }] }]
  }), /cannot be negative/);
  assert.throws(() => validatePricebookShape({
    defaults:{}, services:[{ ...base, tiers:[{ name:'Budget', overrides:{ notARealField:4 } }] }]
  }), /not a pricing field/);

  const status = pricebookServiceStatus({ ...base, laborPerLinearFoot:-1400, materialPerLinearFoot:2200, postPrice:3800, concretePerPost:1800, gatePrice:28500 });
  assert.equal(status.status, 'NEEDS PRICING');
  assert.equal(status.missingOwnerFields.includes('laborPerLinearFoot'), true);

  const quote = generateQuote({
    serviceType:'FENCING_INSTALL',
    customerInputs:{ linearFeet:200, lfMethod:'exact', fenceType:'wood_privacy', fenceHeight:'6', gateCount:1, cornerCount:2, terrainSlope:'flat' },
    ownerPricing:{ ...base, laborPerLinearFoot:-1400, materialPerLinearFoot:2200, postPrice:3800, concretePerPost:1800, gatePrice:28500 },
    businessDefaults:{}
  });
  assert.equal(quote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(quote.missingOwnerFields.includes('laborPerLinearFoot'), true);
});

test('missing-field statuses carry exact human-facing labels', () => {
  const status = pricebookServiceStatus({ serviceType:'FENCING_INSTALL' });
  const index = status.missingOwnerFields.indexOf('concretePerPost');
  assert.equal(index >= 0, true);
  assert.equal(status.missingOwnerLabels[index], 'Concrete + digging cost per post at your local frost/set depth.');
});

test('QuoteDone access is decided by plan, never widened by trial status', async () => {
  const { hasQuoteDoneAccess } = await import('../server/src/planAccess.js');
  assert.equal(hasQuoteDoneAccess({ plan:'Operator', planStatus:'trialing' }), false);
  assert.equal(hasQuoteDoneAccess({ plan:'Operator', planStatus:'active' }), false);
  assert.equal(hasQuoteDoneAccess({ plan:'QuoteDone', planStatus:'trialing' }), true);
  assert.equal(hasQuoteDoneAccess({ plan:'Scale', planStatus:'active' }), true);
  assert.equal(hasQuoteDoneAccess(null), false);
  const source = readFileSync('server/src/server.js', 'utf8');
  assert.match(source, /hasQuoteDoneAccess/);
  assert.equal(/planStatus !== 'trialing'/.test(source), false, 'server must not widen plan access for trials');
});

test('Class 2 defaults are stored per service on save, and money fields round-trip', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  process.env.PRICEBOOK_PATH = mkdtempSync(join(tmpdir(), 'otc-pricebook-'));
  const fresh = await import('../server/priceBookService.js?scope=class2-persistence');
  const saved = fresh.saveValidatedPricebook('owner-class2', {
    defaults:{},
    services:[{
      serviceType:'SIDING_REPLACEMENT', service:'Siding',
      laborPerSqft:{ vinyl:3 }, materialPerSqft:{ vinyl:4 }, minimumJob:500,
      trimPerLinearFoot:5, allowAssumptionBasedQuotes:true
    }]
  });
  const stored = fresh.loadPricebook('owner-class2').services[0];
  assert.equal(stored.trimPerLinearFoot, 500, 'dollars convert to cents on save');
  assert.equal(typeof stored.wasteFactorByType, 'object', 'untouched Class 2 defaults are persisted');
  assert.equal(stored.wasteFactorByType.vinyl, 0.10);
  assert.equal(typeof stored.storyMultiplier, 'object');
  assert.equal(saved.statuses[0].serviceType, 'SIDING_REPLACEMENT');
});

test('upgraded starter book: per-field Class 1 drafts for formula services, ranges only for CUSTOM', async () => {
  const { validateStarterServices, starterFieldSpecs } = await import('../server/src/platformIntegrations.js');
  // Scalar Class 1 fields only; shaped/select/boolean excluded
  const fenceFields = starterFieldSpecs('FENCING_INSTALL').map(def => def.field);
  assert.deepEqual(fenceFields, ['laborPerLinearFoot','materialPerLinearFoot','postSpacing','postPrice','concretePerPost','gatePrice','minimumJob']);
  assert.equal(starterFieldSpecs('SIDING_REPLACEMENT').some(def => def.field === 'laborPerSqft'), false, 'shaped fields are never AI-suggested');

  const validated = validateStarterServices([
    { serviceType:'FENCING_INSTALL', service:'Fence install', fields:{ laborPerLinearFoot:14, materialPerLinearFoot:22, postSpacing:8, postPrice:38, concretePerPost:18, gatePrice:285, minimumJob:600, notAField:9, laborPerSqft:{ vinyl:3 } } },
    { serviceType:'FENCING_INSTALL', service:'Duplicate ignored', fields:{ laborPerLinearFoot:1 } },
    { serviceType:'CUSTOM', service:'Junk hauling', low:150, high:600, unit:'flat', minimumJob:150 },
    { serviceType:'ROOFING_REPLACEMENT', service:'Bad values', fields:{ laborPerSquare:'bad', materialCostPerSquare:-5 } },
    { serviceType:'SIDING_REPLACEMENT', service:'Not requested', fields:{ minimumJob:500 } }
  ], ['FENCING_INSTALL','CUSTOM','ROOFING_REPLACEMENT']);

  assert.equal(validated.length, 2, 'invalid-only and unrequested services are dropped');
  const fence = validated.find(item => item.serviceType === 'FENCING_INSTALL');
  assert.equal(fence.fields.laborPerLinearFoot, 14);
  assert.equal(fence.fields.notAField, undefined, 'unknown fields are dropped, never coerced');
  assert.equal(fence.fields.laborPerSqft, undefined);
  const custom = validated.find(item => item.serviceType === 'CUSTOM');
  assert.deepEqual(custom.fields, { low:150, high:600, unit:'flat', minimumJob:150 });

  // A starter draft still cannot activate without per-field confirmation
  const status = pricebookServiceStatus({ serviceType:'FENCING_INSTALL', ...fence.fields, postsIncludedInMaterial:false, source:'AI_SUGGESTED', confirmedFields:{} });
  assert.equal(status.status, 'NEEDS PRICING');
});
