import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Regression coverage for the October 3 review follow-ups:
// 1. one product-name conversion for every owner name-entry control;
// 2. customer review wording classified from the engine's field metadata;
// 3. retained (retired) settings shown only as retained, formatted like prices;
// 4. the engine version change that requires fresh approval of changed arithmetic.
process.env.PRICEBOOK_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'otc-review-fixes-'));
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bridge = await import('../server/src/quoteDoneBridge.js');
const store = await import('../server/priceBookService.js');
const engine = await import('../server/quote-engine-vnext/engine.js');
const { MEASUREMENT_CONTRACTS, SERVICE_TYPES } = await import('../server/quote-engine-vnext/contracts.js');
const { OFFERING_TYPES, offeringContract } = await import('../server/quote-engine-vnext/configuredOfferings.js');
const { scopeDefinitions } = await import('../server/scopeConfiguration.js');
const { productKeyFromName, DUPLICATE_NAME_MESSAGE } = await import('../client/src/pricebookFormatting.js');
const { reviewRows, retainedRows } = await import('../client/src/pricebookReview.js');

const MEASUREMENTS = 'We need to confirm the job measurements or size before providing an estimate. The business will follow up.';
const DETAILS = 'We need to confirm a few details about the requested work before providing an estimate. The business will follow up.';
const INSPECTION = 'This work needs an inspection before a reliable estimate can be provided. The business will follow up.';
const GENERIC = 'We received your request. Someone will follow up to complete or verify the estimate.';
const CATEGORIES = ['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all = value => Object.fromEntries(CATEGORIES.map(key => [key, value]));
const defaults = () => ({ currency:'CAD', markupPercent:0, markupMode:'markup', overheadFixed:0, minimumJobPrice:0, travelFee:0, disposalFee:0, permitFee:0,
  taxMode:'TAX_NONE', taxPercent:0, rangeBufferPercent:0, markupApplies:all(true), peakMonths:[], peakSurchargePercent:0 });

function registry(values) {
  return Object.fromEntries(Object.entries(values).map(([field, keys]) => [field, Object.fromEntries(keys.map(key => [key, crypto.randomUUID()]))]));
}
function confirmed(inputs, known) {
  const facts = {};
  for (const [field, map] of Object.entries(known)) if (map[inputs[field]]) facts[field] = { status:'identified', field, value:inputs[field], offeringId:map[inputs[field]] };
  return { ...inputs, confirmedFacts:facts };
}
// Save, approve and quote through the same application functions the routes use.
function liveService(service, bookDefaults = defaults()) {
  const ownerId = 'review-fixes-' + crypto.randomUUID();
  const revision = bridge.readApplicationBook(ownerId).revision;
  bridge.saveApplicationBook(ownerId, { revision, services:[{ source:'MANUAL', active:true, tiers:[],
    feeRules:{ travel:'not_applicable', disposal:'not_applicable', permit:'not_applicable', overhead:'not_applicable' },
    priceBasisByCategory:all('cost'), taxabilityByCategory:all(false), ...service }], defaults:bookDefaults });
  let book = store.loadPricebook(ownerId);
  const status = bridge.applicationStatus(book.services[0], book);
  bridge.approveApplicationService(ownerId, book.services[0].id, { revision:bridge.bookRevision(book), confirmConfiguration:true,
    confirmLegacySettings:true, fields:status.confirmationFields });
  book = store.loadPricebook(ownerId);
  return { ownerId, book, raw:book.services[0], status:bridge.applicationStatus(book.services[0], book) };
}
function quote(live, customerInputs) {
  return bridge.calculateApplicationQuote(live.book, live.raw, { serviceId:live.raw.id, customerInputs }, { ownerId:live.ownerId });
}

const fenceKnown = registry({ fenceType:['wood'] });
const fence = { serviceType:'FENCING_INSTALL', service:'6 ft wood privacy', knownOfferings:fenceKnown,
  priceBasisByCategory:{ ...all('cost'), addon:'sell_price' },
  pricing:{ minimumJob:0, offeringMode:'itemized', offeringDetails:{ description:'6 ft wood privacy', fenceType:'wood', fenceHeight:6,
    postFootingDescription:'4x4 posts in concrete', gates:{ walk:{ widthLF:4, description:'Walk gate', postsAndFootingsIncluded:false } } },
  offeringRates:{ fenceLaborPerLF:9.5, fenceMaterialPerLF:14.25, postMaterialEach:28.75, footingLaborEach:22, footingMaterialEach:9.4, gate_walk:385 } } };
const fenceInputs = confirmed({ linearFeet:187, lfMethod:'exact', fenceType:'wood', fenceHeight:6, terrainSlope:'flat', gates:{ walk:1 }, cornerCount:3 }, fenceKnown);
const patio = { serviceType:'CONCRETE_PATIO_SLAB', service:'Patio', pricing:{ laborPerSqft:5.1, concreteCostPerCubicYard:172, formworkPerLF:2.85, minimumJob:0 } };
const patioInputs = { dimensionMethod:'measured_area_perimeter', areaSqft:300, perimeterLF:74, thickness:4, finishType:'broom', demolitionNeeded:false,
  reinforcement:'none', accessDifficulty:'easy', baseNeeded:false };
const mulchKnown = registry({ mulchType:['brown'] });
const mulch = { serviceType:'LANDSCAPING_MULCH', service:'Mulch', knownOfferings:mulchKnown, pricing:{ mulchMaterialPerYard:{ brown:42.5 },
  mulchInstallLaborPerYard:38, bedPrepLaborPerSqft:{ needs_weeding:0.18, overgrown:0.3 }, edgingPerLinearFoot:1.25, minimumServiceCharge:0 } };
const mulchInputs = confirmed({ inputMethod:'sqft', mulchArea:820, mulchDepth:3, mulchType:'brown', bedCondition:'needs_weeding', bedSqft:820,
  edgingNeeded:true, edgeLF:140, accessDifficulty:'moderate' }, mulchKnown);

test('one product-name conversion accepts punctuation and accents and explains every refusal', () => {
  const accepted = { 'Asphalt Shingle':'asphalt_shingle', 'Cedar - Premium':'cedar_premium', "O'Brien cedar":'o_brien_cedar',
    'Vinyl (D4)':'vinyl_d4', 'GAF Timberline HDZ':'gaf_timberline_hdz', 'Épinette blanche':'epinette_blanche', '  Vinyl   Plank ':'vinyl_plank', 'Walk gate #2':'walk_gate_2' };
  for (const [name, key] of Object.entries(accepted)) {
    assert.deepEqual(productKeyFromName(name), { key }, name);
    assert.match(key, /^[a-z][a-z0-9_]*$/, 'accepted names must be valid engine keys');
  }
  assert.match(productKeyFromName('3-tab shingle').error, /Start the name with a letter/);
  for (const empty of ['', '   ', '---', '()', undefined, null]) assert.match(productKeyFromName(empty).error, /Enter a name/);
  assert.equal(DUPLICATE_NAME_MESSAGE, 'That name is already listed.');
});

test('a product registered and priced under the same typed name goes live and quotes', () => {
  const name = 'Cedar (red) – premium', { key } = productKeyFromName(name);
  assert.equal(key, 'cedar_red_premium');
  const known = registry({ mulchType:[key] });
  const live = liveService({ ...mulch, knownOfferings:known, pricing:{ ...mulch.pricing, mulchMaterialPerYard:{ [key]:42.5 } } });
  assert.equal(live.status.status, 'QUOTING LIVE', JSON.stringify(live.status.validationErrors));
  const result = quote(live, confirmed({ ...mulchInputs, mulchType:key }, known));
  assert.equal(result.internalResult.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(result.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents, 104332);
});

test('every owner name-entry control uses the shared conversion and shows refusals', () => {
  const files = ['client/src/pricebook.jsx', 'client/src/quoteDoneControls.jsx', 'client/src/offeringEditor.jsx', 'client/src/interviewStructured.jsx'];
  for (const file of files) {
    const source = fs.readFileSync(path.join(repo, file), 'utf8');
    assert.ok(source.includes('productKeyFromName('), file + ' must use the shared conversion');
    assert.ok(!/\/\^\[a-z\]\[a-z0-9_\]\*\$\//.test(source), file + ' must not keep its own name pattern');
    assert.ok(!source.includes('offeringKey('), file + ' must not keep a separate conversion');
    assert.ok(source.includes('role="alert"') || source.includes("role=\"alert\""), file + ' must show a refused name');
    // The editor's Save treats any aria-invalid element as an invalid number, so a
    // refused name must not mark its input invalid (that blocked saving).
    assert.ok(!/aria-invalid=\{Boolean\((keyError|offeringError|gateError)/.test(source), file + ' must not block Save after a refused name');
  }
  // quoteDoneControls has two entry points: price trees and Registered products.
  const controls = fs.readFileSync(path.join(repo, 'client/src/quoteDoneControls.jsx'), 'utf8');
  assert.equal(controls.match(/productKeyFromName\(/g).length, 2);
});

test('customer review wording treats every measured size as a measurement, using field metadata', () => {
  const liveFence = liveService(fence);
  assert.equal(liveFence.status.status, 'QUOTING LIVE');
  const { linearFeet, ...noLength } = fenceInputs;
  assert.equal(quote(liveFence, noLength).customerResult.customerMessage, MEASUREMENTS, 'missing fence length');
  const { cornerCount, ...noCorners } = fenceInputs;
  assert.equal(quote(liveFence, noCorners).customerResult.customerMessage, DETAILS, 'a corner count is a job detail');
  const livePatio = liveService(patio);
  const { thickness, ...noThickness } = patioInputs;
  assert.equal(quote(livePatio, noThickness).customerResult.customerMessage, MEASUREMENTS, 'missing slab thickness');
  const liveMulch = liveService(mulch);
  const { edgeLF, ...noEdge } = mulchInputs;
  assert.equal(quote(liveMulch, noEdge).customerResult.customerMessage, MEASUREMENTS, 'missing edging length');
  const demolition = { ...patio, pricing:{ ...patio.pricing, scopeDetails:{ demolition:{ description:'Break out existing slab', mode:'itemized',
    maximumThickness:5, reinforcement:'none', accessDifficulty:'easy', disposalIncluded:true } }, scopeRates:{ demolition_removal:2.75, demolition_disposal:0.8 } } };
  const liveDemolition = liveService(demolition);
  assert.equal(liveDemolition.status.status, 'QUOTING LIVE');
  const demolitionInputs = { ...patioInputs, demolitionNeeded:true, demolitionAreaSqft:300, demolitionReinforcement:'none', demolitionAccessDifficulty:'easy', demolitionScopeConfirmed:true };
  assert.equal(quote(liveDemolition, demolitionInputs).customerResult.customerMessage, MEASUREMENTS, 'missing demolition thickness (scope field)');
});

function customerFields(type) {
  const rows = [...Object.entries(MEASUREMENT_CONTRACTS[type]?.fields || {}),
    ...(OFFERING_TYPES.includes(type) ? ['installed','itemized'].flatMap(offeringMode => Object.entries(offeringContract(type, { offeringMode, offeringDetails:{} }).fields)) : []),
    ...Object.values(scopeDefinitions(type, {})).flatMap(definition => Object.entries(definition.customerFields || {}))];
  return rows;
}
const SIZE_UNITS = ['feet','inches','linear feet','square feet','roofing squares','cubic yards','square feet or cubic yards','percent'];
const COUNT_UNITS = ['corners','gates','steps','sheets','layers','rooms','items','hours','coats','plants'];
const reviewMessage = (serviceType, field) => engine.sanitizeForCustomerVNext({ resultType:'ESTIMATE_REQUIRES_REVIEW', serviceType, missingCustomerFields:[field] }).customerMessage;

test('metadata sweep: every sized field reads as a measurement and every count as a job detail', () => {
  let sized = 0, counted = 0;
  for (const type of SERVICE_TYPES) {
    const rows = customerFields(type);
    const sizedNames = new Set(rows.filter(([, f]) => f.type === 'orthogonal_outline' || f.type === 'number' && SIZE_UNITS.includes(f.unit)).map(([name]) => name));
    for (const name of sizedNames) { assert.equal(reviewMessage(type, name), MEASUREMENTS, type + '.' + name); sized++; }
    for (const [name, f] of rows) if (!sizedNames.has(name) && ['number','integer_or_unknown','offering_counts','plant_counts'].includes(f.type) && COUNT_UNITS.includes(f.unit)) {
      assert.equal(reviewMessage(type, name), DETAILS, type + '.' + name); counted++;
    }
  }
  assert.ok(sized > 60 && counted > 10, `sweep covered ${sized} sized and ${counted} counted fields`);
  for (const method of ['roofSizeMethod','sqftMethod']) assert.equal(reviewMessage(method === 'roofSizeMethod' ? 'ROOFING_REPLACEMENT' : 'LANDSCAPING_SOD', method), MEASUREMENTS);
  assert.equal(engine.sanitizeForCustomerVNext({ resultType:'ESTIMATE_REQUIRES_REVIEW', serviceType:'FLAT_ROOF_REPAIR', missingCustomerFields:[],
    reviewReason:'The leak source must be specifically identified by inspection before pricing.' }).customerMessage, INSPECTION);
});

test('malformed review results keep the generic message and never invoke accessors', () => {
  assert.equal(reviewMessage('NOT_A_SERVICE', 'linearFeet'), GENERIC);
  assert.equal(engine.sanitizeForCustomerVNext({ resultType:'ESTIMATE_REQUIRES_REVIEW', serviceType:'FENCING_INSTALL', missingCustomerFields:['notAField', 7] }).customerMessage, GENERIC);
  let touched = false;
  const trap = { resultType:'ESTIMATE_REQUIRES_REVIEW', missingCustomerFields:['linearFeet'] };
  Object.defineProperty(trap, 'serviceType', { enumerable:true, get() { touched = true; return 'FENCING_INSTALL'; } });
  assert.equal(engine.sanitizeForCustomerVNext(trap).customerMessage, GENERIC);
  assert.equal(touched, false);
});

test('saved approval lists a retained price only under retained settings, formatted like a price', () => {
  const floor = { serviceType:'FLOORING_INSTALL', service:'Tile', knownOfferings:registry({ existingFloorType:['carpet'] }),
    pricing:{ laborPerSqft:{ tile:4.15 }, materialPerSqft:{ tile:3.6 }, removalPerSqft:{ carpet:0.65 }, minimumJob:0, vinylPlankUnderlaymentRule:'never_included', perStepPrice:40 } };
  const live = liveService(floor);
  const saved = bridge.readApplicationBook(live.ownerId), service = saved.services[0];
  const meta = bridge.applicationMetadata().services.find(row => row.serviceType === 'FLOORING_INSTALL');
  const retained = live.status.legacySettings.map(row => row.path);
  assert.ok(retained.includes('pricing.perStepPrice'), JSON.stringify(retained));
  const rows = reviewRows(service, saved.defaults, meta, retained);
  assert.ok(!rows.some(row => /per step/i.test(row.label)), 'retired price must not be listed with active prices');
  assert.ok(rows.some(row => row.label.startsWith('Prices and factors') && row.value === '$4.15'), 'active prices are still listed');
  assert.ok(reviewRows(service, saved.defaults, meta).some(row => /per step/i.test(row.label)), 'without the retained list the old row would appear');
  assert.deepEqual(retainedRows('pricing.perStepPrice', 40, service, meta).map(row => row.value), ['$40']);
  const mapRows = retainedRows('pricing.legacyMap', { small:12.5, large:20 }, service, meta);
  assert.equal(mapRows.length, 2);
  assert.ok(mapRows.every(row => !String(row.value).includes('[object Object]') && !String(row.label).includes('[object Object]')));
});

test('changed pricing requires fresh approval: the engine version moved on (v7 after the October 6 quote-date context change)', () => {
  assert.equal(engine.ENGINE_VERSION, 'quote-engine-vnext-date-context-20261006-v7');
  const live = liveService(patio);
  assert.equal(live.status.status, 'QUOTING LIVE');
  const book = store.loadPricebook(live.ownerId);
  const text = JSON.stringify(book).replaceAll(engine.ENGINE_VERSION, 'quote-engine-vnext-trade-decisions-20261003-v2');
  assert.notEqual(text, JSON.stringify(book), 'the approval receipt records the engine version');
  store.savePricebook(live.ownerId, JSON.parse(text));
  const stale = store.loadPricebook(live.ownerId);
  const status = bridge.applicationStatus(stale.services[0], stale);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.ok(status.applicationIssues.includes('Pricing rules changed — review and re-approve this service before customer quotes resume.'));
});
