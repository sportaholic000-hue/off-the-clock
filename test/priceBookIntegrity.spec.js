import { parseOwnerNumericInput, validatePricebookNumericDraft } from '../server/priceBookMoney.js';
import { servicePricing, editServiceField, editServiceTiers, editorServiceKey, editorServices } from '../client/src/pricebookEditing.js';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { CLASS2_DEFAULTS_BY_SERVICE, SAMPLE_INPUTS, getServiceMetadata } from '../server/priceBookMetadata.js';
import { generateQuote } from '../server/quoteEngine.js';
import { generateQuoteVNext, PRICE_BASIS_CATEGORIES, TAXABILITY_CATEGORIES } from '../server/quote-engine-vnext/index.js';
import { fixtureIdentity, fixtureOfferings } from './quoteEngineVNextFixtures.mjs';

// Only an isolated test store is used. Set the existing process-local seam
// before import; restore the caller's environment immediately afterward.
const storeRoot = mkdtempSync(join(tmpdir(), 'otc-pricebook-integrity-'));
const previousStore = process.env.PRICEBOOK_PATH;
process.env.PRICEBOOK_PATH = storeRoot;
let store;
try {
  store = await import('../server/priceBookService.js?scope=pricebook-integrity');
} finally {
  if (previousStore === undefined) delete process.env.PRICEBOOK_PATH;
  else process.env.PRICEBOOK_PATH = previousStore;
}
after(() => {
  const target = resolve(storeRoot);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep));
  assert.ok(target.slice(target.lastIndexOf(sep) + 1).startsWith('otc-pricebook-integrity-'));
  rmSync(target, { recursive: true, force: true });
});
const { dollarsToCents, centsToDollars, saveValidatedPricebook, loadPricebook,
  pricebookServiceStatus, pricebookDraftValidation } = store;
const neutralDefaults = {
  markupPercent:0, markupMode:'markup', taxMode:'TAX_NONE', taxPercent:0,
  overheadFixed:0, minimumJobPrice:0, travelFee:0, disposalFee:0, permitFee:0,
  rangeBufferPercent:0, peakMonths:[], peakSurchargePercent:0
};
const mowingInputs = { ...SAMPLE_INPUTS.LANDSCAPING_MOWING, yardSqft:10000 };
function mowing(rate = 0.005, overrides = {}) {
  return {
    id:'70551b78-7bc8-41b8-a705-7c9b21cdf701',
    serviceType:'LANDSCAPING_MOWING', service:'Synthetic mowing', source:'MANUAL', active:true,
    mowingBaseRatePerSqft:rate, minimumServiceCharge:0,
    frequencyMultipliers:{ weekly:1, biweekly:1, monthly:1, one_time:1 },
    overgrowthMultipliers:{ maintained:1, overgrown:1, severe:1 },
    baggingSurchargePercent:0, edgingPerLinearFoot:0.01,
    allowAssumptionBasedQuotes:false, validationInputs:structuredClone(mowingInputs), ...overrides
  };
}
function fencing(overrides = {}) {
  return {
    id:'9be50a21-bbb6-4db6-85c0-d4751792fed8',
    serviceType:'FENCING_INSTALL', service:'Synthetic fencing', source:'MANUAL', active:true,
    laborPerLinearFoot:14, materialPerLinearFoot:22, postSpacing:8, postPrice:38,
    concretePerPost:18, postsIncludedInMaterial:false, gatePrice:285, minimumJob:0,
    allowAssumptionBasedQuotes:false, ...overrides
  };
}
function book(services, defaults = neutralDefaults) {
  return { services, defaults:structuredClone(defaults) };
}
function withoutTimestamp(value) {
  const copy = structuredClone(value);
  delete copy.updatedAt;
  return copy;
}
function saveAndRead(ownerId, request) {
  const frozen = structuredClone(request);
  const saved = saveValidatedPricebook(ownerId, request);
  const file = readFileSync(join(storeRoot, ownerId + '.json'), 'utf8');
  const persisted = JSON.parse(file);
  const loaded = loadPricebook(ownerId);
  const dollars = centsToDollars(loaded);
  assert.deepEqual(request, frozen, 'save cannot mutate submitted pricing or owner controls');
  assert.deepEqual(saved.pricebook, persisted);
  assert.deepEqual(loaded, persisted);
  assert.deepEqual(structuredClone(saved), saved);
  return { saved, persisted, loaded, dollars, file };
}
// Independent decimal-token arithmetic. Expected rates below are literal values
// from the owner handoff; no converter or engine helper provides this oracle.
function decimalFraction(token) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(token);
  assert.ok(match, token);
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  let numerator = BigInt(whole + fraction) * (sign ? -1n : 1n);
  const scale = fraction.length - Number(exponent);
  if (scale < 0) numerator *= 10n ** BigInt(-scale);
  return [numerator, scale > 0 ? 10n ** BigInt(scale) : 1n];
}
function assertSameDecimal(actual, expectedToken) {
  const [a, ad] = decimalFraction(JSON.stringify(actual));
  const [e, ed] = decimalFraction(expectedToken);
  assert.equal(a * ed, e * ad);
}
function expectedBaseCents(rateCents, quantity, expected) {
  const [n, d] = decimalFraction(JSON.stringify(rateCents));
  assert.equal(n * BigInt(quantity), BigInt(expected) * d);
}
function checkedCandidateBase(savedService, expectedCents) {
  // Test-only use of the frozen candidate verifies the saved rate's financial
  // meaning. It neither imports VNext into production nor asserts a production
  // customer quote: all unrelated charges and scope choices are explicit here.
  const type = 'LANDSCAPING_MOWING';
  const ownerPricing = {
    ...fixtureIdentity('MANUAL', savedService.id, type), knownOfferings:fixtureOfferings(type),
    active:true, serviceType:type, service:type,
    pricing:{
      mowingBaseRatePerSqft:savedService.mowingBaseRatePerSqft,
      minimumServiceCharge:0,
      frequencyMultipliers:structuredClone(savedService.frequencyMultipliers),
      overgrowthMultipliers:structuredClone(savedService.overgrowthMultipliers)
    },
    feeRules:Object.fromEntries(['travel','disposal','permit','overhead'].map(key => [key, 'not_applicable'])),
    priceBasisByCategory:Object.fromEntries(PRICE_BASIS_CATEGORIES.map(key => [key, 'cost'])),
    taxabilityByCategory:Object.fromEntries(TAXABILITY_CATEGORIES.map(key => [key, false])),
    peakMonths:[], peakSurchargePercent:0
  };
  const businessDefaults = { ...structuredClone(neutralDefaults),
    markupApplies:Object.fromEntries(PRICE_BASIS_CATEGORIES.map(key => [key, true])) };
  const request = { serviceType:type, customerInputs:structuredClone(mowingInputs),
    ownerPricing, businessDefaults, callerType:'owner', currentMonth:1 };
  const frozen = structuredClone(request);
  const internal = generateQuoteVNext(request);
  assert.equal(internal.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(internal));
  assert.deepEqual(internal.submittedCustomerInputs, mowingInputs);
  assert.deepEqual(internal.calculationRecord.ownerConfiguration.pricing, ownerPricing.pricing);
  assert.equal(internal.options.length, 1);
  for (const scenario of Object.values(internal.options[0].calculationRecord.scenarios)) {
    assert.equal(scenario.finalTotalCents, expectedCents);
    assert.equal(scenario.lineItems.reduce((sum, line) => sum + BigInt(line.amountCents), 0n), BigInt(expectedCents));
  }
  const publicResult = generateQuoteVNext({ ...request, callerType:'customer' });
  assert.deepEqual(Object.keys(publicResult).sort(), ['resultType','quoteId','lowEstimate','midEstimate',
    'highEstimate','options','priceDrivers','disclaimer','rangeBufferUsed'].sort());
  for (const field of ['lowEstimate','midEstimate','highEstimate']) {
    const [n, d] = decimalFraction(JSON.stringify(publicResult[field]));
    assert.equal(n * 100n, BigInt(expectedCents) * d);
  }
  for (const option of publicResult.options) {
    assert.deepEqual(Object.keys(option).sort(), ['tierName','lowEstimate','midEstimate','highEstimate',
      'priceDrivers','skippedAddons','disclaimer','rangeBufferUsed'].sort());
  }
  assert.deepEqual(request, frozen);
}

test('pricebook integrity: fractional unit rates remain distinct through real persistence and frozen candidate base calculation', () => {
  for (const [dollars, cents, base] of [
    [0.0049, '0.49', 4900], [0.0050, '0.5', 5000], [0.0051, '0.51', 5100]
  ]) {
    const ownerId = 'fraction-' + base;
    const request = book([mowing(dollars)]);
    const result = saveAndRead(ownerId, request);
    assertSameDecimal(result.persisted.services[0].mowingBaseRatePerSqft, cents);
    assertSameDecimal(result.dollars.services[0].mowingBaseRatePerSqft, JSON.stringify(dollars));
    assert.deepEqual(result.dollars.services, request.services);
    expectedBaseCents(result.persisted.services[0].mowingBaseRatePerSqft, 10000, base);
    checkedCandidateBase(result.persisted.services[0], base);
    for (let cycle = 0; cycle < 3; cycle++) {
      const next = saveAndRead(ownerId, result.dollars);
      assert.deepEqual(withoutTimestamp(next.persisted), withoutTimestamp(result.persisted));
      assert.deepEqual(withoutTimestamp(next.dollars), withoutTimestamp(result.dollars));
    }
  }
});

test('pricebook integrity: ordinary rates and an existing whole-cent book survive repeated saves without drift or reinterpretation', () => {
  for (const [dollars, cents] of [[0.01, 1], [1.23, 123], [25, 2500]]) {
    const request = book([mowing(dollars)]);
    const first = saveAndRead('ordinary-' + cents, request);
    assert.equal(first.persisted.services[0].mowingBaseRatePerSqft, cents);
    assert.deepEqual(first.dollars.services, request.services);
    const second = saveAndRead('ordinary-' + cents, first.dollars);
    assert.deepEqual(withoutTimestamp(first.persisted), withoutTimestamp(second.persisted));
  }
  const legacy = book([{
    ...fencing(), ...structuredClone(CLASS2_DEFAULTS_BY_SERVICE.FENCING_INSTALL),
    laborPerLinearFoot:1400, materialPerLinearFoot:2200, postPrice:3800,
    concretePerPost:1800, gatePrice:28500
  }]);
  legacy.ownerId = 'legacy-book';
  legacy.updatedAt = '2026-09-01T12:00:00.000Z';
  store.savePricebook('legacy-book', legacy); // Existing cents contract; no dollar conversion here.
  const original = loadPricebook('legacy-book');
  const restored = saveAndRead('legacy-book', centsToDollars(original));
  assert.deepEqual(withoutTimestamp(restored.persisted), withoutTimestamp(original));
});

test('pricebook integrity: nested product-rate maps and tier overrides preserve their units keys and source identity', () => {
  const pricing = {
    laborPerSqft:{ vinyl:0.005 }, materialPerSqft:{ vinyl:0.0049 }, minimumJob:0,
    removalPerSqft:0.0051, trimPerLinearFoot:1.23, allowAssumptionBasedQuotes:false
  };
  const service = {
    id:'ce98c8ea-8ea5-41bb-8cae-504bf28e6b18',
    serviceType:'SIDING_REPLACEMENT', service:'Synthetic siding', source:'MANUAL', active:true,
    pricing, tiers:[{ name:'Alternate', overrides:{ laborPerSqft:{ vinyl:0.0051 }, materialPerSqft:{ vinyl:0.005 } } }]
  };
  const result = saveAndRead('nested-book', book([service]));
  const stored = result.persisted.services[0], reloaded = result.dollars.services[0];
  assert.deepEqual(stored.pricing, { ...structuredClone(CLASS2_DEFAULTS_BY_SERVICE.SIDING_REPLACEMENT), ...pricing, laborPerSqft:{ vinyl:0.5 },
    materialPerSqft:{ vinyl:0.49 }, removalPerSqft:0.51, trimPerLinearFoot:123 });
  assert.deepEqual(stored.tiers, [{ name:'Alternate', overrides:{ laborPerSqft:{ vinyl:0.51 }, materialPerSqft:{ vinyl:0.5 } } }]);
  assert.deepEqual(reloaded.pricing, { ...structuredClone(CLASS2_DEFAULTS_BY_SERVICE.SIDING_REPLACEMENT), ...pricing });
  assert.deepEqual(reloaded.tiers, service.tiers);
  for (const field of ['id','serviceType','service','source','active']) assert.equal(reloaded[field], service[field]);
  const repeated = saveAndRead('nested-book', result.dollars);
  assert.deepEqual(withoutTimestamp(repeated.persisted), withoutTimestamp(result.persisted));
});

test('pricebook integrity: monetary-looking keys inside factors quantities and retained suggestion metadata never become money', () => {
  const repair = {
    id:'71c9c575-e24a-4b17-a2d7-5b36f00573a9',
    serviceType:'ROOFING_REPAIR', service:'Synthetic roof repair', source:'MANUAL', active:true,
    laborHourlyRate:75.25, repairMinimum:0,
    repairHours:{ flashing:{ small:2.5, medium:4, large:8 } },
    repairMaterialAllowance:{ flashing:125.5 },
    ...structuredClone(CLASS2_DEFAULTS_BY_SERVICE.ROOFING_REPAIR),
    tiers:[{ name:'Alternate', overrides:{ pitchMultiplier:{ low:1.01, medium:1.15, steep:1.25, very_steep:1.4 } } }],
    starterSuggestion:{ serviceType:'CUSTOM', fields:{ low:0.005, high:0.015, unit:'per_sqft' } },
    validationInputs:structuredClone(SAMPLE_INPUTS.ROOFING_REPAIR)
  };
  const request = book([repair], { ...neutralDefaults, markupPercent:1200,
    peakMonths:[1,12], peakSurchargePercent:0.005 });
  const result = saveAndRead('nonmoney-book', request);
  assert.equal(result.persisted.services[0].laborHourlyRate, 7525);
  assert.deepEqual(result.persisted.services[0].repairMaterialAllowance, { flashing:12550 });
  for (const field of ['repairHours','pitchMultiplier','storyMultiplier','starterSuggestion','validationInputs']) {
    assert.deepEqual(result.persisted.services[0][field], repair[field], field);
    assert.deepEqual(result.dollars.services[0][field], repair[field], field);
  }
  assert.deepEqual(result.persisted.services[0].tiers, repair.tiers);
  assert.deepEqual(result.dollars.services, request.services);
  assert.deepEqual(result.persisted.defaults, request.defaults);
});

test('pricebook integrity: unsupported monetary representations are rejected before existing or new files change', () => {
  const valid = book([mowing(0.09)]);
  const initial = saveAndRead('protected-book', valid);
  // The entered decimal is 0.09000000000000001 dollars. Exact scaling requires
  // 9.000000000000001 cents, while the available Number serializes differently.
  const [inputN, inputD] = decimalFraction('0.09000000000000001');
  const [centsN, centsD] = decimalFraction('9.000000000000001');
  assert.equal(inputN * 100n * centsD, centsN * inputD);
  assert.notEqual(JSON.stringify(Number('9.000000000000001')), '9.000000000000001');
  const invalids = [
    book([mowing(0.09000000000000001)]),
    book([mowing(90071992547409.92)]),
    book([mowing(0.09)], { ...neutralDefaults, travelFee:0.005 }),
    book([mowing(0.09)], { ...neutralDefaults, minimumJobPrice:0.005 })
  ];
  for (const request of invalids) {
    const frozen = structuredClone(request);
    assert.throws(() => saveValidatedPricebook('protected-book', request), /represent|precision|cent|safely/i);
    assert.equal(readFileSync(join(storeRoot, 'protected-book.json'), 'utf8'), initial.file);
    assert.throws(() => saveValidatedPricebook('never-created', request), /represent|precision|cent|safely/i);
    assert.equal(existsSync(join(storeRoot, 'never-created.json')), false);
    assert.deepEqual(request, frozen);
  }
  const control = saveAndRead('protected-book', book([mowing(0.09)], { ...neutralDefaults, travelFee:0.01 }));
  assert.equal(control.persisted.defaults.travelFee, 1);
  assert.equal(control.persisted.services[0].mowingBaseRatePerSqft, 9);
});

test('pricebook integrity: absent missing null empty zero and invalid owner values retain their existing distinct meanings', () => {
  for (const value of [undefined, null, '', 0]) {
    const incoming = book([mowing(0.01, { mowingBaseRatePerSqft:value })]);
    const copy = dollarsToCents(incoming);
    assert.equal(Object.hasOwn(copy.services[0], 'mowingBaseRatePerSqft'), true);
    assert.equal(copy.services[0].mowingBaseRatePerSqft, value);
    if (value === undefined || value === 0) {
      const result = saveAndRead(value === 0 ? 'zero-core' : 'missing-core', incoming);
      assert.equal(result.persisted.services[0].active, false);
      assert.notEqual(result.saved.statuses[0].status, 'QUOTING LIVE');
      assert.ok(result.saved.statuses[0].missingOwnerFields.includes('mowingBaseRatePerSqft'));
      assert.equal(Object.hasOwn(result.persisted.services[0], 'mowingBaseRatePerSqft'), value === 0);
    } else assert.throws(() => saveValidatedPricebook('invalid-shape', incoming), /finite|negative|number/);
  }
  assert.throws(() => saveValidatedPricebook('invalid-shape', book([mowing(-1)])), /negative|non-negative/);
  const absent = mowing(); delete absent.mowingBaseRatePerSqft;
  assert.equal(Object.hasOwn(dollarsToCents(book([absent])).services[0], 'mowingBaseRatePerSqft'), false);
  const minimum = saveAndRead('zero-minimum', book([mowing(0.005)]));
  assert.equal(minimum.persisted.services[0].minimumServiceCharge, 0);
  assert.equal(minimum.persisted.services[0].baggingSurchargePercent, 0);
  assert.equal(minimum.persisted.services[0].active, true);
});

test('pricebook integrity: explicit disable survives actual saves reloads unrelated edits and owner preview calculation', () => {
  const request = book([mowing(0.01, { active:false }), fencing()]);
  const first = saveAndRead('disabled-book', request);
  assert.equal(first.persisted.services[0].active, false);
  assert.notEqual(first.saved.statuses[0].status, 'QUOTING LIVE');
  assert.deepEqual(first.saved.statuses[0].missingOwnerFields, []);
  assert.equal(first.persisted.services[1].active, true);
  const changed = structuredClone(first.dollars);
  changed.services[1].laborPerLinearFoot = 14.01;
  const second = saveAndRead('disabled-book', changed);
  assert.deepEqual(second.persisted.services[0], first.persisted.services[0]);
  const expectedOther = { ...first.persisted.services[1], laborPerLinearFoot:1401 };
  assert.deepEqual(second.persisted.services[1], expectedOther);
  const previewRequest = { service:second.dollars.services[0], defaults:second.dollars.defaults };
  const frozen = structuredClone(previewRequest);
  const converted = dollarsToCents(previewRequest);
  // These are the current preview operation's existing pure calls. The separate
  // HTTP/browser evidence exercises its route; this test claims no HTTP request.
  generateQuote({ serviceType:converted.service.serviceType, customerInputs:mowingInputs,
    ownerPricing:converted.service, businessDefaults:converted.defaults, callerType:'owner' });
  assert.deepEqual(previewRequest, frozen);
  assert.equal(converted.service.active, false);
  assert.equal(readFileSync(join(storeRoot, 'disabled-book.json'), 'utf8'), second.file);
  assert.equal(loadPricebook('disabled-book').services[0].active, false);
  const repeated = saveAndRead('disabled-book', second.dollars);
  assert.deepEqual(withoutTimestamp(repeated.persisted), withoutTimestamp(second.persisted));
});

test('pricebook integrity: explicit enable succeeds only with complete approved pricing and never changes siblings', () => {
  const initial = saveAndRead('enable-book', book([mowing(0.01, { active:false }), fencing()]));
  const request = structuredClone(initial.dollars);
  request.services[0].active = true;
  const enabled = saveAndRead('enable-book', request);
  assert.equal(enabled.persisted.services[0].active, true);
  assert.equal(enabled.saved.statuses[0].status, 'QUOTING LIVE');
  assert.deepEqual(enabled.persisted.services[1], initial.persisted.services[1]);
  const expected = { ...initial.persisted.services[0], active:true };
  assert.deepEqual(enabled.persisted.services[0], expected);
  const missing = structuredClone(enabled.dollars);
  delete missing.services[0].mowingBaseRatePerSqft;
  const incomplete = saveAndRead('enable-book', missing);
  assert.equal(incomplete.persisted.services[0].active, false);
  assert.notEqual(incomplete.saved.statuses[0].status, 'QUOTING LIVE');
  assert.deepEqual(incomplete.persisted.services[1], enabled.persisted.services[1]);
  for (const active of [null, '', 'false', 0, 1]) {
    const invalid = book([mowing(0.01, { active })]);
    assert.throws(() => saveValidatedPricebook('bad-active', invalid), /active|true or false|boolean/i);
    assert.equal(existsSync(join(storeRoot, 'bad-active.json')), false);
  }
});

test('pricebook integrity: AI price edits remain unconfirmed through save and preview until explicit owner reconfirmation', () => {
  const ai = mowing(0.01, { source:'AI_SUGGESTED',
    confirmedFields:{ mowingBaseRatePerSqft:true, minimumServiceCharge:true,
      frequencyMultipliers:true, overgrowthMultipliers:true, baggingSurchargePercent:true,
      edgingPerLinearFoot:true, allowAssumptionBasedQuotes:true } });
  const first = saveAndRead('ai-book', book([ai, fencing({ active:false })]));
  assert.equal(first.persisted.services[0].active, true);
  const edited = structuredClone(first.dollars);
  edited.services[0].mowingBaseRatePerSqft = 0.005;
  // This is the current editor's explicit updateField result; route/browser
  // testing independently verifies the actual click/typing transition.
  edited.services[0].confirmedFields.mowingBaseRatePerSqft = false;
  const before = structuredClone(edited);
  const draft = pricebookDraftValidation(edited);
  assert.notEqual(draft.statuses[0].status, 'QUOTING LIVE');
  assert.ok(draft.statuses[0].missingOwnerFields.includes('mowingBaseRatePerSqft'));
  const converted = dollarsToCents({ service:edited.services[0], defaults:edited.defaults });
  generateQuote({ serviceType:converted.service.serviceType, customerInputs:mowingInputs,
    ownerPricing:converted.service, businessDefaults:converted.defaults, callerType:'owner' });
  assert.deepEqual(edited, before);
  assert.equal(readFileSync(join(storeRoot, 'ai-book.json'), 'utf8'), first.file);
  const unconfirmed = saveAndRead('ai-book', edited);
  assert.equal(unconfirmed.persisted.services[0].active, false);
  assert.equal(unconfirmed.persisted.services[0].confirmedFields.mowingBaseRatePerSqft, false);
  assert.deepEqual(unconfirmed.persisted.services[1], first.persisted.services[1]);
  const confirmed = structuredClone(unconfirmed.dollars);
  confirmed.services[0].confirmedFields.mowingBaseRatePerSqft = true;
  confirmed.services[0].active = true;
  const resumed = saveAndRead('ai-book', confirmed);
  assert.equal(resumed.persisted.services[0].active, true);
  assert.equal(resumed.saved.statuses[0].status, 'QUOTING LIVE');
  assert.equal(resumed.persisted.services[0].mowingBaseRatePerSqft, 0.5);
  assert.deepEqual(resumed.persisted.services[1], first.persisted.services[1]);
  assert.equal(pricebookServiceStatus(resumed.persisted.services[0]).status, 'QUOTING LIVE');
});


test('pricebook integrity: owner edits target the original pricing container and retain the rest of the service exactly', () => {
  const flat = mowing(0.005);
  const nested = { id:flat.id, service:flat.service, serviceType:flat.serviceType,
    source:flat.source, active:false, pricing:{
      mowingBaseRatePerSqft:0.005, minimumServiceCharge:0,
      frequencyMultipliers:structuredClone(flat.frequencyMultipliers),
      overgrowthMultipliers:structuredClone(flat.overgrowthMultipliers)
    }, tiers:[{ name:'Alternate', overrides:{ mowingBaseRatePerSqft:0.0051 } }],
    validationInputs:structuredClone(mowingInputs) };
  for (const original of [flat, nested]) {
    const before = structuredClone(original);
    assert.equal(servicePricing(original), original.pricing || original);
    const edited = editServiceField(original, 'mowingBaseRatePerSqft', 0.0051);
    const expected = structuredClone(original);
    if (expected.pricing) expected.pricing.mowingBaseRatePerSqft = 0.0051;
    else expected.mowingBaseRatePerSqft = 0.0051;
    assert.deepEqual(edited, expected);
    assert.deepEqual(original, before);
    if (original.pricing) assert.equal(Object.hasOwn(edited, 'mowingBaseRatePerSqft'), false);
    const stored = saveAndRead(original.pricing ? 'nested-edited' : 'flat-edited', book([edited]));
    assert.equal(servicePricing(stored.persisted.services[0]).mowingBaseRatePerSqft, 0.51);
    assert.deepEqual(servicePricing(stored.dollars.services[0]), servicePricing(edited));
    assert.equal(stored.persisted.services[0].active, edited.active);
  }
});

test('pricebook integrity: unchanged AI scalar or map prices retain approval while actual edits invalidate only the affected field', () => {
  const source = {
    id:'dfe19942-9ecb-4971-bcaa-67de62c9fc0a',
    serviceType:'SIDING_REPLACEMENT', service:'Synthetic approved siding', active:false,
    source:'AI_SUGGESTED', pricing:{
      laborPerSqft:{ vinyl:0.005, wood:1.23 }, materialPerSqft:{ vinyl:0.0051, wood:2 },
      minimumJob:0
    },
    confirmedFields:{ laborPerSqft:true, materialPerSqft:true, minimumJob:true },
    tiers:[{ name:'Base', overrides:{} }]
  };
  const before = structuredClone(source);
  assert.deepEqual(editServiceField(source, 'minimumJob', 0), source);
  assert.deepEqual(editServiceField(source, 'laborPerSqft', structuredClone(source.pricing.laborPerSqft)), source);
  // JSON object member order changes no price, unit, or selected product.
  assert.deepEqual(editServiceField(source, 'laborPerSqft', { wood:1.23, vinyl:0.005 }).confirmedFields, source.confirmedFields);
  const changed = editServiceField(source, 'laborPerSqft', { vinyl:0.0049, wood:1.23 });
  assert.deepEqual(changed, { ...source,
    pricing:{ ...source.pricing, laborPerSqft:{ vinyl:0.0049, wood:1.23 } },
    confirmedFields:{ ...source.confirmedFields, laborPerSqft:false } });
  assert.deepEqual(source, before);
  const manual = { ...source, source:'MANUAL' };
  assert.deepEqual(editServiceField(manual, 'minimumJob', 1).confirmedFields, manual.confirmedFields);
  const reapproved = { ...changed, confirmedFields:{ ...changed.confirmedFields, laborPerSqft:true } };
  assert.deepEqual(editServiceField(reapproved, 'laborPerSqft', structuredClone(reapproved.pricing.laborPerSqft)), reapproved);
  assert.deepEqual(editServiceField(reapproved, 'materialPerSqft', { vinyl:0.005, wood:2 }).confirmedFields,
    { laborPerSqft:true, materialPerSqft:false, minimumJob:true });
});

test('pricebook integrity: tier price edits clear only their own AI field confirmations and preserve base prices and source identity', () => {
  const source = mowing(0.01, { source:'AI_INTERVIEW',
    confirmedFields:{ mowingBaseRatePerSqft:true, minimumServiceCharge:true,
      frequencyMultipliers:true, overgrowthMultipliers:true, baggingSurchargePercent:true,
      edgingPerLinearFoot:true, allowAssumptionBasedQuotes:true },
    tiers:[{ name:'Base', overrides:{} }, { name:'Alternate', overrides:{ mowingBaseRatePerSqft:0.005, edgingPerLinearFoot:1.23 } }]
  });
  const frozen = structuredClone(source);
  assert.deepEqual(editServiceTiers(source, structuredClone(source.tiers)), source);
  const renamed = structuredClone(source.tiers); renamed[1].name = 'Renamed';
  assert.deepEqual(editServiceTiers(source, renamed).confirmedFields, source.confirmedFields);
  const tiers = structuredClone(source.tiers); tiers[1].overrides.mowingBaseRatePerSqft = 0.0051;
  const changed = editServiceTiers(source, tiers);
  assert.deepEqual(changed, { ...source, tiers,
    confirmedFields:{ ...source.confirmedFields, mowingBaseRatePerSqft:false } });
  assert.deepEqual(source, frozen);
  const result = saveAndRead('edited-tier', book([changed]));
  assert.equal(result.persisted.services[0].mowingBaseRatePerSqft, 1);
  assert.equal(result.persisted.services[0].tiers[1].overrides.mowingBaseRatePerSqft, 0.51);
  assert.equal(result.persisted.services[0].active, false);
  assert.deepEqual(result.persisted.services[0].confirmedFields, changed.confirmedFields);
  const removed = structuredClone(source.tiers); delete removed[1].overrides.edgingPerLinearFoot;
  assert.deepEqual(editServiceTiers(source, removed).confirmedFields,
    { ...source.confirmedFields, edgingPerLinearFoot:false });
  const manual = { ...source, source:'MANUAL' };
  assert.deepEqual(editServiceTiers(manual, tiers).confirmedFields, source.confirmedFields);
});


test('pricebook integrity: CUSTOM tier unit changes validate inherited amounts without silently reclassifying or rounding them', () => {
  const service = {
    id:'38cb16b3-0842-4a10-b097-43ba9d4e330a', serviceType:'CUSTOM', service:'Synthetic custom units',
    source:'MANUAL', active:false, low:0.005, high:0.01, unit:'per_sqft',
    tiers:[{ name:'Same unit', overrides:{ unit:'per_sqft' } }]
  };
  const initial = saveAndRead('custom-unit', book([service]));
  assert.equal(initial.persisted.services[0].low, 0.5);
  assert.equal(initial.persisted.services[0].high, 1);
  assert.deepEqual(initial.persisted.services[0].tiers, service.tiers);
  assert.deepEqual(initial.dollars.services, [service]);
  const flatTier = structuredClone(initial.dollars);
  flatTier.services[0].tiers[0].overrides.unit = 'flat';
  assert.throws(() => saveValidatedPricebook('custom-unit', flatTier), /whole.cent|fixed|cent/i);
  assert.equal(readFileSync(join(storeRoot, 'custom-unit.json'), 'utf8'), initial.file);
  const fixedControl = structuredClone(flatTier);
  fixedControl.services[0].low = 0.01;
  fixedControl.services[0].high = 0.02;
  const valid = saveAndRead('custom-unit', fixedControl);
  assert.equal(valid.persisted.services[0].low, 1);
  assert.equal(valid.persisted.services[0].high, 2);
  assert.deepEqual(valid.persisted.services[0].tiers, fixedControl.services[0].tiers);
});

test('pricebook integrity: owner numeric text is validated before lossy Number conversion or save submission', () => {
  for (const [raw, expected] of [['0.0049', 0.0049], ['0.0050', 0.005], ['5.1e-3', 0.0051], ['1.2300', 1.23]]) {
    assertSameDecimal(parseOwnerNumericInput(raw, { kind:'unit_rate', path:'mowingBaseRatePerSqft' }), String(expected));
  }
  assert.equal(parseOwnerNumericInput('', { kind:'unit_rate' }), undefined);
  assert.equal(parseOwnerNumericInput('  ', { kind:'unit_rate' }), undefined);
  assert.equal(parseOwnerNumericInput('0', { kind:'fixed_amount' }), 0);
  assert.equal(parseOwnerNumericInput('0.01', { kind:'fixed_amount' }), 0.01);
  assert.equal(parseOwnerNumericInput('1200'), 1200);
  assert.equal(parseOwnerNumericInput('1e308'), 1e308); // Non-money factors get no monetary cap.
  for (const raw of ['9007199254740993', '1e309', '2e-324', '0x10', '1.2.3']) {
    assert.throws(() => parseOwnerNumericInput(raw), /represent|finite|decimal|exact/i);
  }
  assert.throws(() => parseOwnerNumericInput('0.005', { kind:'fixed_amount' }), /whole.cent|fixed|cent/i);
  assert.throws(() => parseOwnerNumericInput('0.09000000000000001', { kind:'unit_rate' }), /represent|exact/i);
  const valid = book([mowing(0.005)]);
  assert.equal(validatePricebookNumericDraft(valid), true);
  for (const bad of [
    book([mowing('0.005x')]),
    book([mowing(0.005, { frequencyMultipliers:{ weekly:'1x', biweekly:1, monthly:1, one_time:1 } })]),
    book([mowing(0.005)], { ...neutralDefaults, markupPercent:'1200x' })
  ]) {
    const frozen = structuredClone(bad);
    assert.throws(() => validatePricebookNumericDraft(bad), /numeric|number|finite/i);
    assert.deepEqual(bad, frozen);
  }
});


test('pricebook integrity: a changed AI optional price configured only in a tier needs its own renewed confirmation', () => {
  const source = mowing(0.01, { source:'AI_SUGGESTED',
    confirmedFields:{ mowingBaseRatePerSqft:true, minimumServiceCharge:true,
      frequencyMultipliers:true, overgrowthMultipliers:true, baggingSurchargePercent:true,
      edgingPerLinearFoot:true, allowAssumptionBasedQuotes:true },
    tiers:[{ name:'Bagging option', overrides:{ baggingSurchargePercent:10 } }]
  });
  delete source.baggingSurchargePercent;
  const first = saveAndRead('tier-only-approval', book([source, fencing({ active:false })]));
  assert.equal(first.persisted.services[0].active, true);
  assert.equal(Object.hasOwn(first.persisted.services[0], 'baggingSurchargePercent'), false);
  const updatedTiers = structuredClone(first.dollars.services[0].tiers);
  updatedTiers[0].overrides.baggingSurchargePercent = 20;
  const edited = editServiceTiers(first.dollars.services[0], updatedTiers);
  assert.deepEqual(edited.confirmedFields, { ...source.confirmedFields, baggingSurchargePercent:false });
  const request = { ...first.dollars, services:[edited, first.dollars.services[1]] };
  const frozen = structuredClone(request);
  const draft = pricebookDraftValidation(request);
  assert.notEqual(draft.statuses[0].status, 'QUOTING LIVE');
  assert.ok(draft.statuses[0].missingOwnerFields.includes('baggingSurchargePercent'));
  const converted = dollarsToCents({ service:edited, defaults:request.defaults });
  generateQuote({ serviceType:converted.service.serviceType,
    customerInputs:{ ...mowingInputs, bagClippings:true }, ownerPricing:converted.service,
    businessDefaults:converted.defaults, callerType:'owner' });
  assert.deepEqual(request, frozen);
  assert.equal(readFileSync(join(storeRoot, 'tier-only-approval.json'), 'utf8'), first.file);
  const unconfirmed = saveAndRead('tier-only-approval', request);
  assert.equal(unconfirmed.persisted.services[0].active, false);
  assert.equal(unconfirmed.persisted.services[0].confirmedFields.baggingSurchargePercent, false);
  assert.deepEqual(unconfirmed.persisted.services[1], first.persisted.services[1]);
  const approved = structuredClone(unconfirmed.dollars);
  approved.services[0].confirmedFields.baggingSurchargePercent = true;
  approved.services[0].active = true;
  const restored = saveAndRead('tier-only-approval', approved);
  assert.equal(restored.persisted.services[0].active, true);
  assert.equal(restored.persisted.services[0].tiers[0].overrides.baggingSurchargePercent, 20);
  assert.equal(Object.hasOwn(restored.persisted.services[0], 'baggingSurchargePercent'), false);
  assert.deepEqual(restored.persisted.services[1], first.persisted.services[1]);
  const unselected = structuredClone(source);
  delete unselected.tiers;
  delete unselected.confirmedFields.baggingSurchargePercent;
  const control = saveAndRead('no-tier-optional', book([unselected]));
  assert.equal(control.persisted.services[0].active, true, 'An absent unselected optional price requires no invented price or approval');
});


test('pricebook integrity: equal duplicate containers survive and contradictory prices or factors require an explicit resolving edit', () => {
  const flat = fencing();
  const { id, serviceType, service, source, active, ...pricing } = flat;
  const terrain = { flat:1, moderate:1.15, steep:1.3 };
  const dual = { id, serviceType, service, source, active,
    laborPerLinearFoot:14, terrainMultiplier:structuredClone(terrain),
    pricing:{ ...pricing, terrainMultiplier:structuredClone(terrain) } };
  const initial = saveAndRead('duplicate-containers', book([dual]));
  const stored = initial.persisted.services[0];
  assert.equal(stored.laborPerLinearFoot, 1400);
  assert.equal(stored.pricing.laborPerLinearFoot, 1400);
  assert.deepEqual(stored.terrainMultiplier, terrain);
  assert.deepEqual(stored.pricing.terrainMultiplier, terrain);
  const reordered = structuredClone(initial.dollars);
  reordered.services[0].terrainMultiplier = { steep:1.3, moderate:1.15, flat:1 };
  const equivalent = saveAndRead('duplicate-containers', reordered);
  assert.deepEqual(withoutTimestamp(equivalent.persisted), withoutTimestamp(initial.persisted));

  for (const field of ['laborPerLinearFoot', 'terrainMultiplier']) {
    const conflict = structuredClone(equivalent.dollars);
    if (field === 'laborPerLinearFoot') conflict.services[0].laborPerLinearFoot = 14.01;
    else conflict.services[0].terrainMultiplier.flat = 1.01;
    const frozen = structuredClone(conflict);
    assert.throws(() => saveValidatedPricebook('duplicate-containers', conflict), /conflict|contradict|agree|duplicate|differ/i);
    assert.equal(readFileSync(join(storeRoot, 'duplicate-containers.json'), 'utf8'), equivalent.file);
    assert.deepEqual(conflict, frozen);
  }

  // An existing ambiguous cents book remains viewable without silently choosing
  // one representation. Only the explicit edit below resolves the ambiguity.
  const ambiguous = structuredClone(equivalent.persisted);
  ambiguous.services[0].laborPerLinearFoot = 1401;
  const before = structuredClone(ambiguous);
  const displayed = centsToDollars(ambiguous);
  assert.equal(displayed.services[0].laborPerLinearFoot, 14.01);
  assert.equal(displayed.services[0].pricing.laborPerLinearFoot, 14);
  assert.deepEqual(ambiguous, before);
  const edited = editServiceField(displayed.services[0], 'laborPerLinearFoot', 14.02);
  assert.equal(edited.laborPerLinearFoot, 14.02);
  assert.equal(edited.pricing.laborPerLinearFoot, 14.02);
  const expected = structuredClone(displayed.services[0]);
  expected.laborPerLinearFoot = 14.02;
  expected.pricing.laborPerLinearFoot = 14.02;
  assert.deepEqual(edited, expected);
  assert.deepEqual(ambiguous, before);
  const resolved = saveAndRead('duplicate-containers', { ...displayed, services:[edited] });
  const expectedStored = structuredClone(equivalent.persisted.services[0]);
  expectedStored.laborPerLinearFoot = 1402;
  expectedStored.pricing.laborPerLinearFoot = 1402;
  assert.deepEqual(resolved.persisted.services[0], expectedStored);
});


test('pricebook integrity: nested nondefault Class 2 factors survive two saves without creating conflicting root defaults', () => {
  const flat = fencing();
  const { id, serviceType, service, source, active, ...basePricing } = flat;
  const terrainMultiplier = { flat:1.07, moderate:1.15, steep:1.3 };
  const container = { id, serviceType, service, source, active,
    pricing:{ ...basePricing, terrainMultiplier } };
  const expectedPricing = {
    ...structuredClone(CLASS2_DEFAULTS_BY_SERVICE.FENCING_INSTALL),
    ...basePricing, terrainMultiplier,
    laborPerLinearFoot:1400, materialPerLinearFoot:2200, postPrice:3800,
    concretePerPost:1800, gatePrice:28500
  };
  const first = saveAndRead('nested-factors', book([container]));
  assert.deepEqual(first.persisted.services[0].pricing, expectedPricing);
  for (const field of Object.keys(CLASS2_DEFAULTS_BY_SERVICE.FENCING_INSTALL)) {
    assert.equal(Object.hasOwn(first.persisted.services[0], field), false, field);
  }
  assert.deepEqual(first.dollars.services[0].pricing.terrainMultiplier, terrainMultiplier);
  const second = saveAndRead('nested-factors', first.dollars);
  assert.deepEqual(withoutTimestamp(second.persisted), withoutTimestamp(first.persisted));

  // Existing root-only Class 2 placement remains intact. Merely saving a book
  // is not authorization to migrate those existing fields into pricing.
  const rootFactors = { ...structuredClone(CLASS2_DEFAULTS_BY_SERVICE.FENCING_INSTALL), terrainMultiplier };
  const legacyPricing = { ...basePricing, laborPerLinearFoot:1400,
    materialPerLinearFoot:2200, postPrice:3800, concretePerPost:1800, gatePrice:28500 };
  const legacy = book([{ id, serviceType, service, source, active, ...rootFactors, pricing:legacyPricing }]);
  store.savePricebook('legacy-root-factors', legacy);
  const retained = loadPricebook('legacy-root-factors');
  const again = saveAndRead('legacy-root-factors', centsToDollars(retained));
  assert.deepEqual(withoutTimestamp(again.persisted), withoutTimestamp(retained));
  for (const field of Object.keys(rootFactors)) {
    assert.deepEqual(again.persisted.services[0][field], rootFactors[field]);
    assert.equal(Object.hasOwn(again.persisted.services[0].pricing, field), false, field);
  }
});


test('pricebook integrity: two saved CUSTOM services retain separate identities controls approvals and prices when one is edited', () => {
  const first = {
    id:'e6c6e8e2-dbf9-47cb-b6c4-8d916a111a3e',
    serviceType:'CUSTOM', service:'Synthetic tune up', source:'MANUAL',
    active:false, low:100, high:200, unit:'flat'
  };
  const second = {
    id:'4b4c251d-c1ee-462a-b060-d7a9d2ccddf9',
    serviceType:'CUSTOM', service:'Synthetic setup', source:'AI_SUGGESTED',
    active:true, low:300, high:400, unit:'flat',
    confirmedFields:{ low:true, high:true, unit:true }
  };
  const saved = [first, second], frozen = structuredClone(saved), metadata = getServiceMetadata();
  const editor = editorServices(saved, metadata, ['CUSTOM']);
  assert.deepEqual(editor, frozen);
  assert.deepEqual(editor.map(editorServiceKey), [first.id, second.id]);
  assert.notEqual(editorServiceKey({ serviceType:'CUSTOM' }, 0), editorServiceKey({ serviceType:'CUSTOM' }, 1));
  const withNewType = editorServices(saved, metadata, ['CUSTOM','LANDSCAPING_MOWING']);
  assert.equal(withNewType.length, 3);
  assert.deepEqual(withNewType.slice(0, 2), frozen);
  assert.deepEqual(withNewType[2], { serviceType:'LANDSCAPING_MOWING', service:'Mowing',
    tiers:[], validationInputs:structuredClone(SAMPLE_INPUTS.LANDSCAPING_MOWING) });
  assert.deepEqual(saved, frozen);
  const initial = saveAndRead('two-custom-services', book(editor));
  assert.deepEqual(initial.persisted.services.map(service => service.active), [false, true]);
  assert.notEqual(initial.saved.statuses[0].status, 'QUOTING LIVE');
  assert.equal(initial.saved.statuses[1].status, 'QUOTING LIVE');
  assert.deepEqual(initial.dollars.services, frozen);
  const edited = editServiceField(initial.dollars.services[0], 'low', 125.5);
  assert.deepEqual(edited, { ...first, low:125.5 });
  assert.deepEqual(initial.dollars.services[1], second);
  const result = saveAndRead('two-custom-services', { ...initial.dollars, services:[edited, initial.dollars.services[1]] });
  assert.deepEqual(result.persisted.services[1], initial.persisted.services[1]);
  assert.deepEqual(result.persisted.services[0], { ...initial.persisted.services[0], low:12550 });
  assert.deepEqual(result.persisted.services.map(service => service.active), [false, true]);
  assert.notEqual(result.saved.statuses[0].status, 'QUOTING LIVE');
  assert.equal(result.saved.statuses[1].status, 'QUOTING LIVE');
  assert.deepEqual(editorServices(result.dollars.services, metadata, ['CUSTOM']), result.dollars.services);
  const repeated = saveAndRead('two-custom-services', result.dollars);
  assert.deepEqual(withoutTimestamp(repeated.persisted), withoutTimestamp(result.persisted));
});
