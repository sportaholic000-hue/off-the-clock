import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Expected money results written by hand before any money test runs:
// - A fixed custom price of $100.00 must store as 10,000 cents and reload as $100.00.
// - A fixed custom tier price of $125.00 must store as 12,500 cents and reload as $125.00.
// - 10,000 measured square feet at $0.005 per square foot must preview as $50.00.
// - Offering rates of $10, $20, $30, $40, $50 and $600 must remain those dollar values in an interview draft;
//   their eventual cent representations are 1,000, 2,000, 3,000, 4,000, 5,000 and 60,000 cents.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pricebookRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'otc-pricebook-persistence-editor-'));
process.env.PRICEBOOK_PATH = pricebookRoot;

const store = await import('../server/priceBookService.js');
const bridge = await import('../server/src/quoteDoneBridge.js');
const editing = await import('../client/src/pricebookEditing.js');
const database = await import('../server/src/db.js');
const onboarding = await import('../server/src/onboardingService.js');
database.migrate();

const categories = ['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all = value => Object.fromEntries(categories.map(category => [category, value]));
const defaults = () => ({
  currency:'CAD', markupPercent:0, markupMode:'markup', overheadFixed:0,
  minimumJobPrice:0, travelFee:0, disposalFee:0, permitFee:0,
  taxMode:'TAX_NONE', taxPercent:0, rangeBufferPercent:0,
  markupApplies:all(true), peakMonths:[], peakSurchargePercent:0
});
const rules = () => ({
  feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},
  priceBasisByCategory:all('cost'), taxabilityByCategory:all(false)
});
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function customService() {
  return {
    serviceType:'CUSTOM', service:'Synthetic fixed service', source:'MANUAL', active:false,
    ...rules(),
    pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price:100,minimumJob:0},
    tiers:[{name:'Premium',overrides:{price:125}}]
  };
}

test('one metadata-driven converter handles custom fixed prices identically at every boundary', () => {
  const direct = store.dollarsToCents(customService());
  assert.equal(direct.pricing.price, 10000);
  assert.equal(direct.tiers[0].overrides.price, 12500);
  const application = bridge.convertApplicationBook({services:[customService()],defaults:defaults()}, 'toCents');
  assert.equal(application.services[0].pricing.price, 10000);
  assert.equal(application.services[0].tiers[0].overrides.price, 12500);
  assert.deepEqual(store.centsToDollars(direct), customService());
});

test('a durable creation record distinguishes a new owner from a lost saved file and refuses replacement', () => {
  const ownerId = 'created-' + crypto.randomUUID();
  store.savePricebook(ownerId, {services:[],defaults:defaults()});
  fs.unlinkSync(path.join(pricebookRoot, ownerId + '.json'));
  assert.throws(() => store.loadPricebook(ownerId), error => error.code === 'PRICEBOOK_UNREADABLE' && /restore|recovery|missing/i.test(error.message));
  assert.throws(() => store.savePricebook(ownerId, {services:[],defaults:defaults()}), error => error.code === 'PRICEBOOK_UNREADABLE');
  const fresh = store.loadPricebook('new-' + crypto.randomUUID());
  assert.deepEqual(fresh.services, []);
});

test('shared saves assign valid IDs after spreading input and reject case-insensitive duplicates', () => {
  const ownerId = 'ids-' + crypto.randomUUID();
  const saved = store.savePricebook(ownerId, {services:[{id:null},{id:''}],defaults:defaults()}).pricebook;
  assert.equal(saved.services.every(service => uuid(service.id)), true);
  assert.notEqual(saved.services[0].id.toLowerCase(), saved.services[1].id.toLowerCase());
  const duplicate = crypto.randomUUID();
  assert.throws(() => store.savePricebook('duplicate-' + crypto.randomUUID(), {
    services:[{id:duplicate},{id:duplicate.toUpperCase()}],defaults:defaults()
  }), /unique|duplicate|UUID/i);
});

test('peak months reject invalid or duplicate values and save in canonical order', () => {
  for (const peakMonths of [[0],[13],[1.5],[1,1]]) {
    assert.throws(() => store.dollarsToCents({services:[],defaults:{peakMonths}}), /month|1.*12|duplicate|unique/i, JSON.stringify(peakMonths));
  }
  const converted = store.dollarsToCents({services:[],defaults:{peakMonths:[12,1,6]}});
  assert.deepEqual(converted.defaults.peakMonths, [1,6,12]);
});

test('readiness cache keeps distinct diagnostics for multiple unsaved services', () => {
  const first = {serviceType:'CUSTOM',service:'Unsaved A '+crypto.randomUUID(),source:'MANUAL',active:false,pricing:{},tiers:[]};
  const second = {serviceType:'LANDSCAPING_MOWING',service:'Unsaved B '+crypto.randomUUID(),source:'MANUAL',active:false,pricing:{},tiers:[]};
  const book = {ownerId:'cache-'+crypto.randomUUID(),services:[first,second],defaults:{},nonce:crypto.randomUUID()};
  const a = bridge.cachedApplicationStatus(first, book);
  const b = bridge.cachedApplicationStatus(second, book);
  assert.equal(a.serviceType, 'CUSTOM');
  assert.equal(b.serviceType, 'LANDSCAPING_MOWING');
});

test('effective editor pricing preserves root-only, nested-only and mixed offering and scope settings', () => {
  const rootOnly = {offeringMode:'itemized',offeringDetails:{description:'root offering'},scopeDetails:{stairs:{description:'root scope'}}};
  assert.equal(editing.servicePricing(rootOnly).offeringDetails.description, 'root offering');
  const nestedOnly = {pricing:{offeringMode:'installed',offeringDetails:{description:'nested offering'},scopeDetails:{stairs:{description:'nested scope'}}}};
  assert.equal(editing.servicePricing(nestedOnly).scopeDetails.stairs.description, 'nested scope');
  const mixed = {
    offeringMode:'itemized',offeringDetails:{description:'root offering'},scopeDetails:{stairs:{description:'root scope'}},
    pricing:{minimumJob:100,offeringRates:{wallLaborPerSqftPerCoat:2}}
  };
  const effective = editing.servicePricing(mixed);
  assert.equal(effective.offeringMode, 'itemized');
  assert.equal(effective.offeringDetails.description, 'root offering');
  assert.equal(effective.scopeDetails.stairs.description, 'root scope');
  assert.equal(effective.minimumJob, 100);
  assert.equal(effective.offeringRates.wallLaborPerSqftPerCoat, 2);
});

function mowingService(name) {
  return {
    serviceType:'LANDSCAPING_MOWING',service:name,source:'MANUAL',active:false,tiers:[],...rules(),
    pricing:{mowingBaseRatePerSqft:0.005,minimumServiceCharge:0,
      frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},
      overgrowthMultipliers:{maintained:1,overgrown:1,severe:1}}
  };
}
const mowingInputs = {yardSqft:10000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false};

test('owner preview uses the draft service for both calculation and scope presentation', () => {
  const ownerId = 'preview-' + crypto.randomUUID();
  const initial = bridge.readApplicationBook(ownerId);
  bridge.saveApplicationBook(ownerId, {revision:initial.revision,services:[mowingService('Saved mowing')],defaults:defaults()});
  const saved = bridge.readApplicationBook(ownerId);
  const draft = structuredClone(saved.services[0]);
  draft.service = 'Draft mowing';
  const preview = bridge.previewApplicationQuote(ownerId, {
    revision:saved.revision,serviceId:draft.id,service:draft,defaults:saved.defaults,customerInputs:mowingInputs
  });
  assert.equal(preview.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(preview));
  assert.equal(preview.options[0].midEstimate, 50);
  assert.equal(preview.pricedScope.service, 'Draft mowing');
});

function insertSyntheticOwner(ownerId) {
  database.db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(ownerId,ownerId+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner','2026-10-05T12:00:00Z');
}

test('batch interview normalization resolves structural names before dependent offering rates', () => {
  const ownerId = 'interview-normalize-' + crypto.randomUUID();
  insertSyntheticOwner(ownerId);
  const draft = onboarding.createInterviewDraft(ownerId,{serviceTypes:['FENCING_INSTALL']});
  const fields = {
    offeringMode:'itemized',
    offeringDetails:{description:'Synthetic fence',fenceType:'Wood Privacy',fenceHeight:6,
      postFootingDescription:'Synthetic posts and footings',gates:{'Double Drive':{widthLF:10,description:'Synthetic double gate',postsAndFootingsIncluded:false}}},
    offeringRates:{fenceLaborPerLF:10,fenceMaterialPerLF:20,postMaterialEach:30,
      footingLaborEach:40,footingMaterialEach:50,gate_double_drive:600}
  };
  const saved = onboarding.saveInterviewDraft(ownerId,draft.id,{fields:{FENCING_INSTALL:fields}});
  assert.equal(saved.fields.FENCING_INSTALL.offeringDetails.fenceType, 'wood_privacy');
  assert.deepEqual(Object.keys(saved.fields.FENCING_INSTALL.offeringDetails.gates), ['double_drive']);
  assert.equal(saved.fields.FENCING_INSTALL.offeringRates.gate_double_drive, 600);
});

test('interview draft compare-and-swap rejects a stale revision without losing the accepted update', () => {
  const ownerId = 'interview-cas-' + crypto.randomUUID();
  insertSyntheticOwner(ownerId);
  const original = onboarding.createInterviewDraft(ownerId,{serviceTypes:['CUSTOM']});
  const accepted = onboarding.saveInterviewDraft(ownerId,original.id,{
    revision:original.revision,fields:{CUSTOM:{unit:'flat'}}
  });
  assert.equal(accepted.fields.CUSTOM.unit, 'flat');
  assert.throws(() => onboarding.saveInterviewDraft(ownerId,original.id,{
    revision:original.revision,fields:{CUSTOM:{unit:'per_hour'}}
  }), error => error.statusCode === 409);
  assert.equal(onboarding.getInterviewDraft(ownerId,original.id).fields.CUSTOM.unit, 'flat');
});

test('configured-offering tier controls expose installed labor and material share maps', async () => {
  const output = await build({
    absWorkingDir:repo,bundle:true,write:false,platform:'node',format:'esm',
    stdin:{contents:"export { offeringTierFields } from './client/src/offeringEditor.jsx';",resolveDir:repo,loader:'js'}
  });
  const module = await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
  const service = {
    serviceType:'INTERIOR_PAINTING',offeringMode:'installed',
    offeringDetails:{description:'Synthetic walls',substrate:'drywall',coating:'paint',finishCoats:2,surfaceCondition:'good',preparation:'standard',primerCoats:0,wallHeight:'standard',ceilingsOffered:false,trimOffered:false},
    offeringRates:{installedWallPerSqft:5},
    installedLaborPercent:{'offeringRates.installedWallPerSqft':60},
    installedMaterialsPercent:{'offeringRates.installedWallPerSqft':40}
  };
  const meta = bridge.applicationMetadata().services.find(row => row.serviceType === service.serviceType);
  const fields = module.offeringTierFields(meta,service);
  for (const fieldName of ['installedLaborPercent','installedMaterialsPercent']) {
    const field = fields.find(entry => entry.field === fieldName);
    assert.ok(field, fieldName);
    assert.ok(field.tree.leafKeys.includes('offeringRates.installedWallPerSqft'));
  }
});
