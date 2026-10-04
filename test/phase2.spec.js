import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateQuote } from '../server/quoteEngine.js';
import { getRequiredOwnerFields, SERVICE_TYPES } from '../server/quoteTemplates.js';
import { getServiceMetadata, ALL_OWNER_FIELDS } from '../server/priceBookMetadata.js';
import { dollarsToCents, pricebookDraftStatuses, pricebookDraftValidation, pricebookServiceStatus, validatePricebookShape } from '../server/priceBookService.js';
import { humanPricingKey } from '../client/src/pricebookFormatting.js';
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
  assert.deepEqual([...unconfirmed.missingOwnerFields].sort(), ['high','low','unit']);

  const partial = pricebookServiceStatus({ ...service, confirmedFields:{ low:true, high:true } });
  assert.equal(partial.status, 'NEEDS PRICING');
  assert.deepEqual(partial.missingOwnerFields, ['unit']);

  const confirmed = pricebookServiceStatus({ ...service, confirmedFields:{ low:true, high:true, unit:true } });
  assert.equal(confirmed.status, 'QUOTING LIVE');

  const interview = pricebookServiceStatus({ ...service, source:'AI_INTERVIEW', confirmedFields:{} });
  assert.equal(interview.status, 'NEEDS PRICING');

  // Blocker 3 regression: an AI-injected CUSTOM minimum is exposed and gated
  const withMinimum = pricebookServiceStatus({ ...service, minimumJob:15000, confirmedFields:{ low:true, high:true, unit:true } });
  assert.equal(withMinimum.status, 'NEEDS PRICING');
  assert.equal(withMinimum.missingOwnerFields.includes('minimumJob'), true);
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
  const source = readFileSync('server/src/server.js', 'utf8') + readFileSync('server/src/quoteDoneRoutes.js', 'utf8');
  for (const route of [
    '/api/onboarding/state','/api/onboarding/account','/api/onboarding/business-types',
    '/api/business/jurisdiction','/api/onboarding/phone/provision',
    '/api/onboarding/phone/test','/api/onboarding/knowledge-base',
    '/api/operator/toggle','/api/onboarding/calendar','/api/onboarding/voice',
    '/api/pricebook/interview','/api/pricebook/meta','/api/pricebook/suggest',
    '/api/pricebook/validate','/api/pricebook/preview','/api/pricebook/save','/api/pricebook/:ownerId'
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
      serviceType:'SIDING_REPLACEMENT', trimPerLinearFoot:5
    }, {
      serviceType:'CONCRETE_DRIVEWAY', demolitionPerSqft:4, disposalPerSqft:2.25
    }],
    defaults:{}
  });
  assert.equal(converted.services[0].trimPerLinearFoot, 500);
  assert.equal(converted.services[1].demolitionPerSqft, 400);
  assert.equal(converted.services[1].disposalPerSqft, 225);
});

test('house wrap remains included in the all-in siding rate with no separate charge', () => {
  // The mandated materialPerSqft label includes house wrap. A separate field
  // is neither editable nor consumed, so it cannot double-count.
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
  }), /must be a finite number/);
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

test('QuoteDone access requires both an eligible plan and a current lifecycle entitlement', async () => {
  const { hasQuoteDoneAccess } = await import('../server/src/planAccess.js');
  const futureTrialEnd = new Date(Date.now() + 60_000).toISOString();
  assert.equal(hasQuoteDoneAccess({ plan:'Operator', planStatus:'trialing', trialEndsAt:futureTrialEnd }), false);
  assert.equal(hasQuoteDoneAccess({ plan:'Operator', planStatus:'active' }), false);
  assert.equal(hasQuoteDoneAccess({ plan:'QuoteDone', planStatus:'trialing', trialEndsAt:futureTrialEnd }), true);
  assert.equal(hasQuoteDoneAccess({ plan:'QuoteDone', planStatus:'trialing' }), false);
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
  assert.equal(starterFieldSpecs('SIDING_REPLACEMENT').some(def => def.field === 'laborPerSqft'), true, 'closed-domain shaped fields are suggestible per the key-domain ruling');

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

test('shaped fields enforce spec key domains and never silently drop the customer key', () => {
  const siding = {
    serviceType:'SIDING_REPLACEMENT', service:'Siding',
    laborPerSqft:{ vinyl:3 }, materialPerSqft:{ vinyl:4 }, minimumJob:500,
    allowAssumptionBasedQuotes:true
  };
  assert.throws(() => validatePricebookShape({
    defaults:{}, services:[{ ...siding, laborPerSqft:{ vinly:3 } }]
  }), /not a valid key/);
  assert.throws(() => validatePricebookShape({
    defaults:{}, services:[{ serviceType:'LANDSCAPING_CLEANUP', cleanupBaseRatePerSqft:0.1, minimumServiceCharge:0,
      debrisPricing:{ light:{ laborMultiplier:1, wrongKey:5 } } }]
  }), /not a valid key/);
  assert.equal(validatePricebookShape({ defaults:{}, services:[siding] }), true, 'a subset of valid domain keys is allowed');

  // Customer picks a siding type the owner has not priced: REVIEW, not a vanished labor line
  const quote = generateQuote({
    serviceType:'SIDING_REPLACEMENT',
    customerInputs:{ areaInputMethod:'sqft', sidingAreaSqft:1000, sidingType:'wood', stories:'1', oldSidingRemoval:false, trimIncluded:false },
    ownerPricing:{ laborPerSqft:{ vinyl:300 }, materialPerSqft:{ vinyl:400 }, minimumJob:0, allowAssumptionBasedQuotes:true },
    businessDefaults:{}
  });
  assert.equal(quote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(quote.missingOwnerFields.includes('laborPerSqft'), true);
});

test('every AI-populated field, optional included, must be confirmed before activation', () => {
  const service = {
    serviceType:'SIDING_REPLACEMENT', service:'Siding',
    laborPerSqft:{ vinyl:300, fiber_cement:350, wood:400, metal:450 },
    materialPerSqft:{ vinyl:400, fiber_cement:500, wood:600, metal:700 },
    minimumJob:0,
    removalPerSqft:100, trimPerLinearFoot:600,
    allowAssumptionBasedQuotes:true,
    source:'AI_SUGGESTED',
    confirmedFields:{ laborPerSqft:true, materialPerSqft:true, minimumJob:true, removalPerSqft:true, allowAssumptionBasedQuotes:true }
  };
  const status = pricebookServiceStatus(service);
  assert.equal(status.status, 'NEEDS PRICING', 'populated conditional field without confirmation blocks activation');
  assert.equal(status.missingOwnerFields.includes('trimPerLinearFoot'), true);
  const confirmed = pricebookServiceStatus({ ...service, confirmedFields:{ ...service.confirmedFields, trimPerLinearFoot:true } });
  assert.equal(confirmed.status, 'QUOTING LIVE');
});

test('CUSTOM exposes and enforces minimumJob; starter drafts cover closed-domain shaped fields', async () => {
  assert.equal(ALL_OWNER_FIELDS.CUSTOM.includes('minimumJob'), true);
  const { validateStarterServices, starterFieldSpecs } = await import('../server/src/platformIntegrations.js');
  assert.equal(starterFieldSpecs('SIDING_REPLACEMENT').some(def => def.field === 'laborPerSqft'), true, 'closed-domain shaped fields are now suggestible');
  assert.equal(starterFieldSpecs('FLAT_ROOF_REPLACEMENT').some(def => def.field === 'membraneCostPerSqft'), false, 'open-domain shaped fields stay excluded');
  const [siding] = validateStarterServices([
    { serviceType:'SIDING_REPLACEMENT', service:'Siding', fields:{
      laborPerSqft:{ vinyl:3, vinly:9, wood:5 }, materialPerSqft:{ vinyl:4 }, minimumJob:500, trimPerLinearFoot:6
    } }
  ], ['SIDING_REPLACEMENT']);
  assert.deepEqual(siding.fields.laborPerSqft, { vinyl:3, wood:5 }, 'out-of-domain keys are dropped, never coerced');
  assert.equal(siding.fields.trimPerLinearFoot, 6);
});


test('exact nested shaped prices are required for the selected quote', () => {
  const defaults = { markupPercent:0, taxMode:'TAX_NONE', rangeBufferPercent:10 };
  const cases = [
    {
      serviceType:'ROOFING_REPAIR',
      customerInputs:{ repairType:'flashing', affectedArea:80, roofType:'architectural', pitch:'low', stories:1, leakPresent:false },
      ownerPricing:{ laborHourlyRate:10000, repairMinimum:0, repairHours:{ flashing:{ small:2 } }, repairMaterialAllowance:{ flashing:15000 } },
      missing:['repairHours']
    },
    {
      serviceType:'SIDING_REPAIR',
      customerInputs:{ affectedArea:40, sidingType:'vinyl', damageLevel:'moderate', stories:1 },
      ownerPricing:{ laborHourlyRate:10000, repairMinimum:0, repairHours:{ moderate:{ small:2 } }, materialAllowance:{ moderate:{ small:15000 } } },
      missing:['repairHours','materialAllowance']
    },
    {
      serviceType:'FLAT_ROOF_REPAIR',
      customerInputs:{ repairType:'patch', affectedArea:40, membraneType:'epdm', leakPresent:false, pondingWater:false },
      ownerPricing:{ laborHourlyRate:10000, repairMinimum:0, patchRepairHours:{ patch:{ small:2 } }, patchMaterialAllowance:{ patch:{ small:15000 } } },
      missing:['patchRepairHours','patchMaterialAllowance']
    }
  ];
  for (const entry of cases) {
    const result = generateQuote({ ...entry, businessDefaults:defaults });
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW', entry.serviceType);
    for (const field of entry.missing) assert.equal(result.missingOwnerFields.includes(field), true, `${entry.serviceType} missing ${field}`);
  }

  const debris = generateQuote({
    serviceType:'LANDSCAPING_CLEANUP',
    customerInputs:{ yardSize:3500, debrisLevel:'moderate', slope:'flat', haulAway:false },
    ownerPricing:{
      cleanupBaseRatePerSqft:10,
      minimumServiceCharge:0,
      debrisPricing:{ moderate:{ laborMultiplier:1.15 } }
    },
    businessDefaults:defaults
  });
  assert.equal(debris.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(debris.missingOwnerFields.includes('debrisPricing'), true);
});

test('activation requires complete mandated shaped keys and nested rows', () => {
  const [repair] = pricebookDraftStatuses({ defaults:{}, services:[{
    serviceType:'ROOFING_REPAIR',
    laborHourlyRate:10000,
    repairMinimum:0,
    repairHours:{ flashing:{ small:2 } },
    repairMaterialAllowance:{ flashing:15000 }
  }] });
  assert.equal(repair.status, 'NEEDS PRICING');
  assert.equal(repair.missingOwnerFields.includes('repairHours'), true);

  const flatRoof = pricebookServiceStatus({
    serviceType:'FLAT_ROOF_REPLACEMENT',
    laborPerSqft:{ epdm:500 },
    membraneCostPerSqft:{ epdm:700 },
    tearOffPerSqft:{ epdm:200 },
    minimumJob:0,
    insulationPerSqft:200
  });
  assert.equal(flatRoof.status, 'NEEDS PRICING');
  for (const field of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft']) {
    assert.equal(flatRoof.missingOwnerFields.includes(field), true, `average fallback required for ${field}`);
  }

  const debris = pricebookServiceStatus({
    serviceType:'LANDSCAPING_CLEANUP',
    cleanupBaseRatePerSqft:0.1,
    minimumServiceCharge:0,
    haulAwayFee:100,
    debrisPricing:{
      light:{ laborMultiplier:1, disposalFlat:50 },
      moderate:{ laborMultiplier:1.2 },
      heavy:{ laborMultiplier:1.5, disposalFlat:200 }
    }
  });
  assert.equal(debris.status, 'NEEDS PRICING');
  assert.equal(debris.missingOwnerFields.includes('debrisPricing'), true);
});

test('Class 2 maps require the exact supported shape and the editor has no raw JSON factor control', () => {
  const fencing = {
    serviceType:'FENCING_INSTALL',
    laborPerLinearFoot:14,
    materialPerLinearFoot:22,
    postSpacing:8,
    postPrice:38,
    concretePerPost:18,
    postsIncludedInMaterial:false,
    gatePrice:285,
    minimumJob:0
  };
  assert.throws(() => validatePricebookShape({
    defaults:{},
    services:[{ ...fencing, terrainMultiplier:{ flat:1, modrate:1.15, steep:1.3 } }]
  }), /missing required keys: moderate/);
  assert.throws(() => validatePricebookShape({
    defaults:{},
    services:[{ ...fencing, terrainMultiplier:{ flat:1, moderate:1.15, steep:1.3, cliff:2 } }]
  }), /unsupported keys: cliff/);
  assert.throws(() => validatePricebookShape({
    defaults:{},
    services:[{ ...fencing, terrainMultipler:{ flat:1, moderate:1.15, steep:1.3 } }]
  }), /not a supported pricing field/);

  const client = readFileSync('client/src/pricebook.jsx', 'utf8');
  assert.match(client, /StructuredFactorField/);
  assert.match(client, /selectedMeta\.class2Fields/);
  assert.equal(/<JsonEditor value=\{selected\[field\]/.test(client), false);
});

test('current draft status follows dynamic server requirements and never trusts saved LIVE state', () => {
  const roof = {
    serviceType:'ROOFING_REPLACEMENT',
    service:'Roof replacement',
    laborPerSquare:300,
    materialCostPerSquare:500,
    tearOffPerSquare:100,
    underlaymentPerSquare:50,
    accessoryPricingMode:'itemized',
    active:true,
    validationInputs:{ roofSizeInput:2000, roofSizeMethod:'roof_measured', roofType:'architectural', pitch:'medium', stories:1, existingLayers:'1', roofComplexity:'simple', serviceScope:'full' }
  };
  const [status] = pricebookDraftStatuses({ defaults:{}, services:[roof] });
  assert.equal(status.status, 'NEEDS PRICING');
  for (const field of ['starterPerLF','dripEdgePerLF','ridgeCapPerLF']) {
    assert.equal(status.missingOwnerFields.includes(field), true, `itemized roofing requires ${field}`);
  }

  const client = readFileSync('client/src/pricebook.jsx', 'utf8');
  assert.match(client, /api\('\/api\/pricebook\/validate'/);
  // Status must never be assumed before the server confirms it. Previously the
  // client expressed this by setting statuses to null and treating null as a
  // failing status, which made every chip flash NEEDS PRICING on each
  // keystroke. The unknown state is now CHECKING, and statuses are only ever
  // populated from a completed /validate response -- never from saved state.
  assert.match(client, /status:\s*'CHECKING'/);
  // Clearing on load is fine -- nothing is known yet. Clearing inside the
  // draft-validation effect is the defect: it wiped known statuses on every
  // keystroke.
  const validationEffect = client.slice(
    client.indexOf('if (!book || locked) return;'),
    client.indexOf('}, [book, locked]);'));
  assert.equal(/setStatuses\(null\)/.test(validationEffect), false,
    'the validation effect must not clear known statuses while typing');
  assert.equal(/dash\.pricebookStatuses/.test(client), false);
});

test('CUSTOM starter suggestions drop negative and non-finite ranges and minimums', async () => {
  const { validateStarterServices } = await import('../server/src/platformIntegrations.js');
  const validated = validateStarterServices([
    { serviceType:'CUSTOM', service:'Negative low', low:-1, high:100, unit:'flat', minimumJob:0 },
    { serviceType:'CUSTOM', service:'Negative high', low:-20, high:-10, unit:'flat', minimumJob:0 },
    { serviceType:'CUSTOM', service:'Negative minimum', low:10, high:100, unit:'flat', minimumJob:-5 },
    { serviceType:'CUSTOM', service:'Infinite', low:10, high:Number.POSITIVE_INFINITY, unit:'flat', minimumJob:0 },
    { serviceType:'CUSTOM', service:'Valid', low:10, high:100, unit:'flat', minimumJob:0 }
  ], ['CUSTOM']);
  assert.equal(validated.length, 1);
  assert.equal(validated[0].service, 'Valid');
});

test('flooring uses keyed type rates and human pricing keys split snake_case and camelCase', () => {
  assert.equal(humanPricingKey('fiber_cement'), 'Fiber cement');
  assert.equal(humanPricingKey('laborMultiplier'), 'Labor multiplier');
  assert.equal(humanPricingKey('disposalFlat'), 'Flat disposal charge ($)');

  const metadata = getServiceMetadata().find(service => service.serviceType === 'FLOORING_INSTALL');
  const labor = metadata.fields.find(field => field.field === 'laborPerSqft');
  const material = metadata.fields.find(field => field.field === 'materialPerSqft');
  assert.equal(labor.type, 'json');
  assert.deepEqual(labor.shapedKeys.keys, ['hardwood','laminate','vinyl_plank','carpet','tile']);
  assert.equal(labor.label, 'Labor price per square foot by flooring type.');
  assert.equal(material.label, 'Material price per square foot by flooring type.');

  assert.throws(() => validatePricebookShape({
    defaults:{},
    services:[{
      serviceType:'FLOORING_INSTALL',
      laborPerSqft:3,
      materialPerSqft:{ hardwood:5, laminate:5, vinyl_plank:5, carpet:5, tile:5 },
      minimumJob:0
    }]
  }), /must be an object of numeric rates/);

  const missingTile = generateQuote({
    serviceType:'FLOORING_INSTALL',
    customerInputs:{ sqft:300, sqftMethod:'exact', newFlooringType:'tile', existingFloorType:'bare', removalNeeded:false, roomCount:1, layoutPattern:'straight', stairSteps:0 },
    ownerPricing:{ laborPerSqft:{ hardwood:300 }, materialPerSqft:{ hardwood:500 }, minimumJob:0 },
    businessDefaults:{ markupPercent:0, taxMode:'TAX_NONE', rangeBufferPercent:10 }
  });
  assert.equal(missingTile.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(missingTile.missingOwnerFields.includes('laborPerSqft'), true);
  assert.equal(missingTile.missingOwnerFields.includes('materialPerSqft'), true);

  const spec = readFileSync('specs/quote_engine_v2.md', 'utf8');
  for (const withdrawn of ['baseboardPerLF','transitionsEach','furnitureMovingFlat']) {
    assert.equal(spec.includes(withdrawn), false, `${withdrawn} must be absent from the launch spec`);
    assert.equal(Object.values(ALL_OWNER_FIELDS).flat().includes(withdrawn), false, `${withdrawn} must not be exposed`);
  }
});

test('starter warning ruling is exact across spec, API, and model prompt', () => {
  const approved = 'These are AI-suggested placeholder prices. Review and confirm each value before going live.';
  const sources = [
    readFileSync('specs/quote_engine_v2.md', 'utf8'),
    readFileSync('server/src/server.js', 'utf8'),
    readFileSync('server/src/platformIntegrations.js', 'utf8')
  ];
  for (const source of sources) assert.equal(source.includes(approved), true);
  const governingText = sources.join('\n');
  for (const obsolete of ['placeholder ranges', 'replace them with YOUR prices', 'owner will replace']) {
    assert.equal(governingText.includes(obsolete), false, `obsolete starter wording remains: ${obsolete}`);
  }
});


test('service-specific quote fields reject unsupported hidden values', () => {
  for (const [serviceType, field, value] of [
    ['ROOFING_REPAIR','minimumJob',999],
    ['FLOORING_INSTALL','low',100],
    ['SIDING_REPAIR','high',200],
    ['ROOFING_REPLACEMENT','unit','flat'],
    ['LANDSCAPING_CLEANUP','disposalPerSqft',2]
  ]) {
    assert.throws(() => validatePricebookShape({
      defaults:{},
      services:[{ serviceType, [field]:value }]
    }), /not a supported pricing field/, `${serviceType} must reject ${field}`);
  }

  const hiddenMinimum = generateQuote({
    serviceType:'ROOFING_REPAIR',
    customerInputs:{ repairType:'flashing', affectedArea:25, roofType:'architectural', pitch:'low', stories:1, leakPresent:false },
    ownerPricing:{
      laborHourlyRate:10000,
      repairMinimum:0,
      repairHours:{ flashing:{ small:2, medium:4, large:8 } },
      repairMaterialAllowance:{ flashing:15000 },
      minimumJob:999999
    },
    businessDefaults:{ markupPercent:0, taxMode:'TAX_NONE', rangeBufferPercent:10, minimumJobPrice:0 }
  });
  assert.equal(hiddenMinimum.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(hiddenMinimum.lineItems.some(line => line.name === 'Minimum Price Adjustment'), false);
});

test('ruled disposal overrides are exposed, validated, converted, and confirmed', () => {
  for (const serviceType of ['FLOORING_INSTALL','FLOORING_REPLACEMENT','SIDING_REPLACEMENT']) {
    assert.equal(ALL_OWNER_FIELDS[serviceType].includes('disposalPerSqft'), true, `${serviceType} exposes disposalPerSqft`);
  }
  assert.equal(ALL_OWNER_FIELDS.ROOFING_REPAIR.includes('disposalPerSqft'), false);

  const converted = dollarsToCents({
    defaults:{},
    services:[{ serviceType:'FLOORING_INSTALL', disposalPerSqft:2.5 }]
  });
  assert.equal(converted.services[0].disposalPerSqft, 250);

  assert.throws(() => validatePricebookShape({
    defaults:{},
    services:[{ serviceType:'FLOORING_INSTALL', disposalPerSqft:-1 }]
  }), /cannot be negative/);
  assert.throws(() => validatePricebookShape({
    defaults:{},
    services:[{ serviceType:'SIDING_REPLACEMENT', disposalPerSqft:'bad' }]
  }), /must be a finite number/);

  const types = ['hardwood','laminate','vinyl_plank','carpet','tile'];
  const rates = Object.fromEntries(types.map(type => [type, 500]));
  const service = {
    serviceType:'FLOORING_INSTALL',
    laborPerSqft:rates,
    materialPerSqft:rates,
    minimumJob:0,
    removalPerSqft:100,
    disposalPerSqft:20,
    perStepPrice:1000,
    underlaymentPerSqft:50,
    source:'AI_SUGGESTED',
    confirmedFields:{
      laborPerSqft:true,
      materialPerSqft:true,
      minimumJob:true,
      removalPerSqft:true,
      perStepPrice:true,
      underlaymentPerSqft:true
    }
  };
  const unconfirmed = pricebookServiceStatus(service);
  assert.equal(unconfirmed.status, 'NEEDS PRICING');
  assert.equal(unconfirmed.missingOwnerFields.includes('disposalPerSqft'), true);
  const confirmed = pricebookServiceStatus({
    ...service,
    confirmedFields:{ ...service.confirmedFields, disposalPerSqft:true }
  });
  assert.equal(confirmed.status, 'QUOTING LIVE');
});

test('disposal override falls back, prices removal, and reviews malformed values', () => {
  const customerInputs = {
    sqft:300,
    sqftMethod:'exact',
    newFlooringType:'tile',
    existingFloorType:'vinyl',
    removalNeeded:true,
    roomCount:1,
    layoutPattern:'straight',
    stairSteps:0
  };
  const basePricing = {
    laborPerSqft:{ tile:300 },
    materialPerSqft:{ tile:500 },
    minimumJob:0,
    removalPerSqft:100
  };
  const businessDefaults = {
    markupPercent:0,
    taxMode:'TAX_NONE',
    rangeBufferPercent:10,
    disposalFee:5000
  };
  const lineAmount = (result, name) => result.lineItems.find(line => line.name === name)?.amountCents;

  const fallback = generateQuote({ serviceType:'FLOORING_INSTALL', customerInputs, ownerPricing:basePricing, businessDefaults });
  assert.equal(fallback.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(lineAmount(fallback, 'Disposal'), 5000);

  const overridden = generateQuote({
    serviceType:'FLOORING_INSTALL',
    customerInputs,
    ownerPricing:{ ...basePricing, disposalPerSqft:20 },
    businessDefaults
  });
  assert.equal(overridden.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(lineAmount(overridden, 'Disposal'), 6000);

  for (const value of [-1, Number.NaN, 'bad']) {
    const invalid = generateQuote({
      serviceType:'FLOORING_INSTALL',
      customerInputs,
      ownerPricing:{ ...basePricing, disposalPerSqft:value },
      businessDefaults
    });
    assert.equal(invalid.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(invalid.missingOwnerFields.includes('disposalPerSqft'), true);
  }
});

test('current draft validates every quote-affecting business default before save', () => {
  const service = { serviceType:'CUSTOM', service:'Custom', low:100, high:200, unit:'flat', minimumJob:0 };
  const cases = [
    [{ markupPercent:-1 }, /Markup or margin percentage is invalid/],
    [{ markupMode:'margin', markupPercent:100 }, /Markup or margin percentage is invalid/],
    [{ taxPercent:101 }, /Tax rate is invalid/],
    [{ travelFee:-1 }, /Travel charge/],
    [{ disposalFee:'bad' }, /Business-wide disposal charge/],
    [{ permitFee:Number.NaN }, /Permit charge/],
    [{ overheadFixed:-1 }, /Fixed overhead charge/],
    [{ minimumJobPrice:-1 }, /Business-wide minimum job price/],
    [{ rangeBufferPercent:-1 }, /Estimate range buffer percentage/],
    [{ peakSurchargePercent:-1 }, /Peak-season surcharge percentage/]
  ];

  for (const [invalidDefaults, expected] of cases) {
    const result = pricebookDraftValidation({
      defaults:{ markupMode:'markup', taxMode:'TAX_NONE', ...invalidDefaults },
      services:[service]
    });
    assert.equal(result.statuses[0].status, 'NEEDS PRICING');
    assert.equal(result.validationErrors.some(message => expected.test(message)), true);
    assert.equal(result.statuses[0].missingOwnerLabels.some(message => expected.test(message)), true);
  }

  const client = readFileSync('client/src/pricebook.jsx', 'utf8');
  assert.match(client, /draftValidationErrors/);
  assert.match(client, /<Notice tone="warning">\{draftValidationErrors\.join\(' '\)\}<\/Notice>/);
});

test('owner-selectable product offerings activate on a supported subset', () => {
  // A vinyl-only siding contractor must not be forced to price fiber cement,
  // wood and metal. Absent types mean NOT OFFERED.
  const vinylOnly = {
    serviceType:'SIDING_REPLACEMENT', service:'Siding replacement',
    laborPerSqft:{ vinyl:300 }, materialPerSqft:{ vinyl:400 },
    removalPerSqft:120, trimPerLinearFoot:450,
    minimumJob:50000, allowAssumptionBasedQuotes:true
  };
  assert.equal(pricebookServiceStatus(vinylOnly).status, 'QUOTING LIVE',
    'a vinyl-only siding contractor activates without pricing every siding type');

  // A carpet + vinyl-plank flooring contractor likewise.
  const twoTypes = {
    serviceType:'FLOORING_INSTALL', service:'Flooring installation',
    laborPerSqft:{ carpet:200, vinyl_plank:250 },
    materialPerSqft:{ carpet:300, vinyl_plank:350 },
    removalPerSqft:100, disposalPerSqft:50, perStepPrice:1500,
    underlaymentPerSqft:75,
    minimumJob:40000, allowAssumptionBasedQuotes:true
  };
  assert.equal(pricebookServiceStatus(twoTypes).status, 'QUOTING LIVE',
    'a carpet and vinyl-plank contractor activates without hardwood, laminate or tile');
});

test('every ENABLED product offering must be completely priced', () => {
  // vinyl priced for labor but not material: still blocked. Partial is not offered.
  const partial = {
    serviceType:'SIDING_REPLACEMENT', service:'Siding replacement',
    laborPerSqft:{ vinyl:300, wood:280 }, materialPerSqft:{ vinyl:400, wood:0 },
    removalPerSqft:120, trimPerLinearFoot:450,
    minimumJob:50000, allowAssumptionBasedQuotes:true
  };
  assert.equal(pricebookServiceStatus(partial).status, 'NEEDS PRICING',
    'an enabled siding type missing its material price blocks activation');
  assert.equal(pricebookServiceStatus(partial).missingOwnerFields.includes('materialPerSqft'), true);

  // A zero or blank value inside an enabled type is never treated as free.
  const zeroed = {
    ...partial, laborPerSqft:{ vinyl:300 }, materialPerSqft:{ vinyl:0 }
  };
  assert.equal(pricebookServiceStatus(zeroed).status, 'NEEDS PRICING',
    'a zero price inside an enabled offering is not treated as free');
});

test('at least one product offering must be enabled and priced', () => {
  const noneOffered = {
    serviceType:'SIDING_REPLACEMENT', service:'Siding replacement',
    laborPerSqft:{}, materialPerSqft:{},
    removalPerSqft:120, trimPerLinearFoot:450,
    minimumJob:50000, allowAssumptionBasedQuotes:true
  };
  assert.equal(pricebookServiceStatus(noneOffered).status, 'NEEDS PRICING',
    'an empty offering map cannot activate');
});

test('a disabled product requested at quote time returns review, never a substituted rate', () => {
  const quote = generateQuote({
    serviceType:'FLOORING_INSTALL',
    customerInputs:{ sqft:600, sqftMethod:'exact', newFlooringType:'hardwood',
      existingFloorType:'none', removalNeeded:false, roomCount:3,
      layoutPattern:'straight', stairSteps:0 },
    ownerPricing:{ laborPerSqft:{ carpet:200, vinyl_plank:250 },
      materialPerSqft:{ carpet:300, vinyl_plank:350 },
      minimumJob:0, allowAssumptionBasedQuotes:true },
    businessDefaults:{}
  });
  assert.equal(quote.resultType, 'ESTIMATE_REQUIRES_REVIEW',
    'hardwood is not offered, so the estimate requires review');
  assert.equal(quote.missingOwnerFields.includes('laborPerSqft'), true);
  // Never silently priced from carpet or vinyl_plank.
  assert.equal(quote.low === undefined || quote.low === null, true,
    'no substituted rate produces a customer-facing number');
});

test('closed non-selectable domains still require complete coverage', () => {
  // Repair size shapes, condition domains and the flat-roof Average fallback
  // must NOT be loosened by the offered-subset ruling.
  const partialRepair = {
    serviceType:'SIDING_REPAIR', service:'Siding repair',
    laborHourlyRate:9500, repairMinimum:25000, materialAllowance:{ small:{}, medium:{}, large:{} },
    repairHours:{ small:1 }
  };
  const status = pricebookServiceStatus(partialRepair);
  assert.equal(status.status, 'NEEDS PRICING',
    'an incomplete Small/Medium/Large repair shape still blocks activation');
});

test('disjoint product offering maps must not activate', () => {
  // Siding labor priced only for vinyl, material priced only for wood.
  // Each field is individually well-formed; no product is actually sellable.
  const disjoint = {
    serviceType:'SIDING_REPLACEMENT', service:'Siding replacement',
    laborPerSqft:{ vinyl:300 }, materialPerSqft:{ wood:520 },
    removalPerSqft:120, trimPerLinearFoot:450,
    minimumJob:50000, allowAssumptionBasedQuotes:true
  };
  const status = pricebookServiceStatus(disjoint);
  assert.equal(status.status, 'NEEDS PRICING',
    'disjoint labor and material product sets must not activate');
  assert.deepEqual(status.incompleteOfferings, ['vinyl','wood'],
    'both half-priced products are reported as incomplete offerings');

  // Flooring equivalent.
  const flooringDisjoint = {
    serviceType:'FLOORING_INSTALL', service:'Flooring installation',
    laborPerSqft:{ carpet:200 }, materialPerSqft:{ tile:410 },
    removalPerSqft:100, disposalPerSqft:50, perStepPrice:1500,
    underlaymentPerSqft:75,
    minimumJob:40000, allowAssumptionBasedQuotes:true
  };
  assert.equal(pricebookServiceStatus(flooringDisjoint).status, 'NEEDS PRICING',
    'disjoint flooring labor and material sets must not activate');
});

test('a product in labor but absent from material blocks activation', () => {
  const partialOverlap = {
    serviceType:'SIDING_REPLACEMENT', service:'Siding replacement',
    laborPerSqft:{ vinyl:300, wood:280 }, materialPerSqft:{ vinyl:400 },
    removalPerSqft:120, trimPerLinearFoot:450,
    minimumJob:50000, allowAssumptionBasedQuotes:true
  };
  const status = pricebookServiceStatus(partialOverlap);
  assert.equal(status.status, 'NEEDS PRICING',
    'wood has labor but no material, so it is enabled and incomplete');
  assert.deepEqual(status.incompleteOfferings, ['wood']);
  assert.equal(status.missingOwnerFields.includes('materialPerSqft'), true);
});

test('a product in material but absent from labor blocks activation', () => {
  const reversed = {
    serviceType:'FLOORING_REPLACEMENT', service:'Flooring replacement',
    laborPerSqft:{ carpet:200 }, materialPerSqft:{ carpet:300, hardwood:800 },
    removalPerSqft:100, disposalPerSqft:50, perStepPrice:1500,
    underlaymentPerSqft:75, subfloorAllowancePerSqft:60,
    minimumJob:40000, allowAssumptionBasedQuotes:true
  };
  const status = pricebookServiceStatus(reversed);
  assert.equal(status.status, 'NEEDS PRICING',
    'hardwood has material but no labor, so it is enabled and incomplete');
  assert.deepEqual(status.incompleteOfferings, ['hardwood']);
});

test('a consistently priced subset still activates after the consistency check', () => {
  const consistent = {
    serviceType:'SIDING_REPLACEMENT', service:'Siding replacement',
    laborPerSqft:{ vinyl:300 }, materialPerSqft:{ vinyl:400 },
    removalPerSqft:120, trimPerLinearFoot:450,
    minimumJob:50000, allowAssumptionBasedQuotes:true
  };
  const status = pricebookServiceStatus(consistent);
  assert.equal(status.status, 'QUOTING LIVE');
  assert.deepEqual(status.incompleteOfferings, [],
    'a consistent single-product offering reports no gaps');

  // Two consistently priced products also activate.
  const twoConsistent = {
    ...consistent,
    laborPerSqft:{ vinyl:300, metal:360 }, materialPerSqft:{ vinyl:400, metal:610 }
  };
  assert.equal(pricebookServiceStatus(twoConsistent).status, 'QUOTING LIVE');
});

test('offering consistency does not affect services without selectable products', () => {
  // Fencing has no ownerSelectable product domain; behavior must be unchanged.
  const fencing = {
    serviceType:'FENCING_INSTALL', service:'Fencing installation',
    laborPerLinearFoot:1200, materialPerLinearFoot:1800,
    postsIncludedInMaterial:true, gatePrice:25000, minimumJob:50000,
    allowAssumptionBasedQuotes:true
  };
  const status = pricebookServiceStatus(fencing);
  assert.deepEqual(status.incompleteOfferings, [],
    'a service with no selectable product domain reports no offering gaps');
});

test('customer payloads are built from an allowlist, not by removing known keys', async () => {
  const { sanitizeForCustomer } = await import('../server/quoteEngine.js');

  // BEFORE THIS REPAIR: ready results spread the engine result and removed only
  // lineItems, so every other property -- including ones added later -- reached
  // the customer automatically.
  const ready = {
    resultType: 'INSTANT_ESTIMATE_READY',
    lowEstimate: 100, highEstimate: 200, midEstimate: 150, quoteId: 'q-1',
    options: [{
      tierName: 'Standard', lowEstimate: 100, highEstimate: 200, midEstimate: 150,
      priceDrivers: ['Siding labor'], skippedAddons: ['Trim'], disclaimer: 'Estimate only',
      lineItems: [{ name: 'Markup', category: 'markup', amountCents: 5000 }]
    }],
    lineItems: [{ name: 'Markup', category: 'markup', amountCents: 5000 }],
    appliedRules: ['MARKUP_30'],
    urgencyFlags: ['AFTER_HOURS'],
    rangeBufferPercent: 12,
    someFutureInternalField: 'must not leak',
    internalDebugTrace: 'owner labor rate 95/hr'
  };
  const safeReady = sanitizeForCustomer(ready);
  const readyJson = JSON.stringify(safeReady);

  // Customer-facing content survives.
  assert.equal(safeReady.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(safeReady.midEstimate, 150);
  assert.deepEqual(safeReady.options[0].priceDrivers, ['Siding labor']);
  assert.deepEqual(safeReady.options[0].skippedAddons, ['Trim']);
  assert.equal(safeReady.options[0].disclaimer, 'Estimate only');

  // Nothing internal survives -- including a property the engine does not have
  // today, which is the point of an allowlist.
  for (const leaked of ['lineItems', 'appliedRules', 'urgencyFlags', 'rangeBufferPercent',
                        'someFutureInternalField', 'internalDebugTrace', 'Markup', '95/hr']) {
    assert.equal(readyJson.includes(leaked), false, `${leaked} must not reach the customer`);
  }
  assert.equal(safeReady.options[0].lineItems, undefined, 'per-option line items stripped');
});

test('customer review outcomes never expose owner configuration', async () => {
  const { sanitizeForCustomer } = await import('../server/quoteEngine.js');

  // BEFORE THIS REPAIR: non-ready results were returned untouched, so
  // missingOwnerFields -- internal owner pricing-field identifiers -- and the
  // internal review reason went straight to the customer.
  const review = {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    missingOwnerFields: ['laborPerSqft', 'materialPerSqft'],
    missingCustomerFields: ['sqft'],
    reviewReason: 'Owner pricing incomplete for hardwood',
    appliedRules: ['NO_GUESSING'],
    quoteId: 'q-2'
  };
  const safe = sanitizeForCustomer(review);
  const json = JSON.stringify(safe);

  assert.equal(safe.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(safe.customerMessage, 'the customer gets a human follow-up message');
  assert.equal(safe.quoteId, 'q-2');
  for (const leaked of ['laborPerSqft', 'materialPerSqft', 'missingOwnerFields',
                        'missingCustomerFields', 'reviewReason', 'appliedRules', 'hardwood']) {
    assert.equal(json.includes(leaked), false, `${leaked} must not reach the customer`);
  }
});

test('owner results retain full diagnostics', async () => {
  const { generateQuote } = await import('../server/quoteEngine.js');
  const owner = generateQuote({
    serviceType: 'FLOORING_INSTALL',
    customerInputs: { areaInputMethod:'sqft', floorAreaSqft:600, newFlooringType:'hardwood',
      existingFloorType:'none', removalNeeded:false },
    ownerPricing: { laborPerSqft:{ carpet:2 }, materialPerSqft:{ carpet:3 },
      minimumJob:0, allowAssumptionBasedQuotes:true },
    businessDefaults: {},
    callerType: 'owner'
  });
  // The owner path is untouched by customer sanitization.
  assert.equal(owner.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(Array.isArray(owner.missingOwnerFields) || Array.isArray(owner.missingCustomerFields),
    'owner diagnostics remain available');
});

test('customer eligibility is enforced before quote generation', () => {
  // Completion authorization intentionally replaces the old inline legacy
  // handler. Actual HTTP positive/disabled/unapproved/forged-caller controls
  // live in verification/quotedone/{first,money,access-retry}-workflow.mjs.
  const bridge=readFileSync('server/src/quoteDoneBridge.js','utf8');
  const calculate=bridge.slice(bridge.indexOf('export function calculateApplicationQuote'),bridge.indexOf('export function applicationMetadata'));
  const eligibility=calculate.indexOf('const eligibility=cachedApplicationStatus(raw,book,{quick:true})'); // readiness is cached per saved revision
  const active=calculate.indexOf('service.active=raw.active===true&&ready');
  assert.ok(eligibility>=0&&active>eligibility&&active<calculate.indexOf('generateQuoteVNext(request)'));
  assert.match(calculate,/const ready=eligibility.status==='QUOTING LIVE'/);
  assert.match(bridge.slice(bridge.indexOf('export function applicationStatus'),bridge.indexOf('export function bookRevision')),/approvalCurrent\(raw,book\)/);
  assert.match(calculate,/sanitizeForCustomerVNext\(internalResult\)/);
  assert.doesNotMatch(calculate,/submission\.callerType|generateQuote\(/);
  const routes=readFileSync('server/src/quoteDoneRoutes.js','utf8');
  assert.match(routes,/submitQuote\(req\.tenantOwnerId,req\.body,/);
  assert.match(routes,/serviceFor\(book,body\)/);
  assert.match(routes,/requireAuth\(\['owner','staff'\]\)/);
});

test('a service that is not QUOTING LIVE cannot produce a customer estimate', async () => {
  const { pricebookServiceStatus } = await import('../server/priceBookService.js');
  const { sanitizeForCustomer } = await import('../server/quoteEngine.js');

  // An unconfirmed AI-suggested draft is NEEDS PRICING even though every
  // numeric value is present -- confirmation is what activates it.
  const aiDraft = {
    serviceType:'FLOORING_INSTALL', service:'Flooring installation',
    laborPerSqft:{ carpet:2.0, vinyl_plank:2.5 },
    materialPerSqft:{ carpet:3.0, vinyl_plank:3.5 },
    removalPerSqft:1.0, disposalPerSqft:0.5, perStepPrice:15, underlaymentPerSqft:0.75,
    minimumJob:400, allowAssumptionBasedQuotes:true,
    source:'AI_SUGGESTED', confirmedFields:{}
  };
  assert.equal(pricebookServiceStatus(aiDraft).status, 'NEEDS PRICING',
    'an unconfirmed AI draft is not live');

  // Confirming every gated field activates it -- proving the block is the
  // confirmation state, not missing numbers.
  const confirmed = { ...aiDraft, confirmedFields:Object.fromEntries(
    pricebookServiceStatus(aiDraft).missingOwnerFields.map(field => [field, true])) };
  assert.equal(pricebookServiceStatus(confirmed).status, 'QUOTING LIVE',
    'confirming the draft activates the service');

  // The deferral a blocked customer receives carries no owner detail.
  const deferred = sanitizeForCustomer({
    resultType:'ESTIMATE_REQUIRES_REVIEW',
    reviewReason:'Service is not currently active for instant quoting'
  });
  assert.equal(deferred.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(deferred.customerMessage);
  assert.equal(JSON.stringify(deferred).includes('not currently active'), false,
    'the internal reason must not reach the customer');
  assert.equal(deferred.midEstimate, undefined, 'no estimate is returned');
});
