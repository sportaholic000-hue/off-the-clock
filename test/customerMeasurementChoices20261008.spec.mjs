import './pricebookTestEnv.mjs';
import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {applicationMetadata, applicationServiceDefinition} from '../server/src/quoteDoneBridge.js';
import {voiceQuestionContract} from '../server/src/voice/voiceQuoteContract.js';
import {SERVICE_TYPES, generateQuoteVNext, sanitizeForCustomerVNext, validateCustomerInputs} from '../server/quote-engine-vnext/index.js';
import {fixture, flooring, flatRoof, siding, concrete, mowing} from '../verification/engine-independent/fixtures.mjs';
import {roofingDisplayFixture} from './quoteDisplayFixtures20261006.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {fixtureIdentity} from './quoteEngineVNextFixtures.mjs';

// Owner ruling: only measured, caller-confirmed inputs are offered. Legacy
// shortcuts remain inspection/review cases, and never receive an amount.
const removed = {
  ROOFING_REPLACEMENT: {roofSizeMethod: ['home_floor_area', 'assumption']},
  FLAT_ROOF_REPLACEMENT: {sqftMethod: ['assumption']},
  FLOORING_INSTALL: {sqftMethod: ['assumption']},
  FLOORING_REPLACEMENT: {sqftMethod: ['assumption']},
  LANDSCAPING_CLEANUP: {sqftMethod: ['assumption']},
  LANDSCAPING_SOD: {sqftMethod: ['assumption']},
  LANDSCAPING_MOWING: {sqftMethod: ['assumption']},
  INTERIOR_PAINTING: {areaInputMethod: ['floor_sqft', 'rooms', 'homesize']},
  EXTERIOR_PAINTING: {areaInputMethod: ['homesize']},
  SIDING_REPLACEMENT: {areaInputMethod: ['homesize']},
  FENCING_INSTALL: {lfMethod: ['assumption']},
  FENCING_REPLACEMENT: {lfMethod: ['assumption']},
  CONCRETE_DRIVEWAY: {dimensionMethod: ['area_only', 'assumption']},
  CONCRETE_PATIO_SLAB: {dimensionMethod: ['area_only', 'assumption']}
};
const forbidden = [...new Set(Object.values(removed).flatMap(fields => Object.values(fields).flat()))];
const retained = {
  roofSizeMethod: ['roof_measured'], sqftMethod: ['exact'], lfMethod: ['exact'],
  dimensionMethod: ['exact', 'measured_area_perimeter', 'measured_outline']
};
let render, previewFields;
before(async () => {
  // Render the actual control used by the widget wizard and owner preview.
  const result = await build({bundle:true, write:false, platform:'node', format:'cjs', external:['react','react-dom/server'], stdin:{loader:'jsx', resolveDir:process.cwd(), contents:`
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
    export {offeringPreviewFields} from './client/src/offeringEditor.jsx';
    export function render(fields, knownOfferings) {
      return renderToStaticMarkup(<CustomerMeasurements fields={fields} value={{}} knownOfferings={knownOfferings} onChange={()=>{}}/>);
    }
  `}});
  const module = {exports:{}};
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  ({render, offeringPreviewFields:previewFields} = module.exports);
});

function assertChoices(service, fields, label) {
  const html = render(fields, service.knownOfferings || {});
  assert.match(html, /field-stack/, label + ' renders the real customer controls');
  for (const value of forbidden) assert.ok(!html.includes(`value="${value}"`), `${label} offers ${value}`);
  for (const [name, values] of Object.entries(removed[service.serviceType] || {})) {
    const field = fields.find(item => item.name === name);
    assert.ok(field, `${label} retains ${name}`);
    for (const value of values) assert.ok(!field.values.includes(value), `${label}.${name} offers ${value}`);
    const expected = name === 'areaInputMethod' ? [service.serviceType === 'SIDING_REPLACEMENT' ? 'sqft' : 'wall_sqft'] : retained[name];
    assert.deepEqual(field.values, expected, `${label}.${name} preserves measured choices`);
    for (const value of expected) assert.ok(html.includes(`value="${value}"`), `${label} renders ${value}`);
    assert.ok(html.includes('Unknown / not supplied'), `${label} allows unknown measurements to be left blank`);
  }
}

function assertSurfaces(service, meta) {
  const definition = applicationServiceDefinition(service);
  assertChoices(service, definition.customerFields, 'widget');
  const ownerFields = previewFields(meta, service);
  assert.deepEqual(ownerFields, definition.customerFields, 'owner and customer questions use the same effective contract');
  assertChoices(service, ownerFields, 'owner measurement preview');
  const phone = voiceQuestionContract(service, definition);
  for (const question of phone.fields) {
    for (const choice of question.choices || []) assert.ok(!forbidden.includes(choice.value), `phone ${question.field} offers ${choice.value}`);
    const field = definition.customerFields.find(field => field.name === question.field);
    if (field.type === 'enum') assert.deepEqual(question.choices.map(choice => choice.value), field.values);
  }
}

const metadata = applicationMetadata().services;
test('measurement choices: regression covers all 20 customer service question sets', () => {
  assert.equal(SERVICE_TYPES.length, 20);
  assert.deepEqual(metadata.map(service => service.serviceType).sort(), [...SERVICE_TYPES].sort());
});
for (const meta of metadata) test(`measurement choices: rendered widget, phone and owner preview — ${meta.serviceType}`, () => {
  const service = fixture(meta.serviceType, {}, {}).ownerPricing;
  assertChoices(service, meta.customerFields, 'application metadata');
  assertSurfaces(service, meta);
});
for (const type of ['FENCING_INSTALL', 'FENCING_REPLACEMENT', 'INTERIOR_PAINTING', 'EXTERIOR_PAINTING']) {
  for (const mode of ['installed', 'itemized']) test(`measurement choices: configured ${mode} offering — ${type}`, () => {
    const service = offeringFixture(type, mode).ownerPricing;
    assertSurfaces(service, metadata.find(meta => meta.serviceType === type));
    // Tier-only offerings must not restore the old options in the shared form.
    service.tiers = [{name:'[SYNTHETIC] Configured option', overrides:service.pricing}];
    service.pricing = {};
    assertSurfaces(service, metadata.find(meta => meta.serviceType === type));
  });
}

function measuredFixture(type) {
  let result;
  if (type === 'ROOFING_REPLACEMENT') result = roofingDisplayFixture();
  else if (type === 'FLAT_ROOF_REPLACEMENT') {
    result = flatRoof();
    Object.assign(result.customerInputs, {insulationNeeded:false, coverboardNeeded:false});
  } else if (type.startsWith('FLOORING_')) {
    result = flooring();
    if (type === 'FLOORING_REPLACEMENT') result.customerInputs.subfloorIssues = false;
  } else if (type.startsWith('FENCING_') || type.endsWith('_PAINTING')) result = offeringFixture(type, 'installed');
  else if (type === 'SIDING_REPLACEMENT') result = siding();
  else if (type.startsWith('CONCRETE_')) {
    result = concrete();
    result.customerInputs.adjoinsExistingConcrete = false;
  } else if (type === 'LANDSCAPING_MOWING') result = mowing();
  else if (type === 'LANDSCAPING_CLEANUP') result = fixture(type, {laborPerSqft:100, debrisPricing:{light:{laborMultiplier:1,disposalFlat:0}, moderate:{laborMultiplier:1.5,disposalFlat:0}, heavy:{laborMultiplier:2,disposalFlat:0}}, minimumServiceCharge:0}, {yardSqft:500, sqftMethod:'exact', debrisLevel:'light', slope:'flat', haulAway:false});
  else if (type === 'LANDSCAPING_SOD') result = fixture(type, {sodMaterialPerSqft:100, sodLaborPerSqft:200, minimumJob:0}, {sodSqft:500, sqftMethod:'exact', groundPrepNeeded:false, slope:'flat', accessDifficulty:'easy'});
  if (result.serviceType !== type) Object.assign(result.ownerPricing, fixtureIdentity('MANUAL', undefined, type));
  result.serviceType = result.ownerPricing.serviceType = type;
  return result;
}
function assertNoPrice(result) {
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  for (const name of ['lowEstimate', 'midEstimate', 'highEstimate', 'amount', 'amountCents', 'options', 'lineItems', 'calculationRecord']) assert.equal(Object.hasOwn(result, name), false, `review exposes ${name}`);
}
for (const [type, fields] of Object.entries(removed)) {
  for (const [field, values] of Object.entries(fields)) for (const value of values) test(`measurement choices: legacy ${type}.${field}=${value} remains no-price review`, () => {
    const f = measuredFixture(type);
    const valid = validateCustomerInputs(type, f.customerInputs, f.ownerPricing.pricing, f.ownerPricing);
    assert.equal(valid.ok, true, 'measured control is valid: ' + JSON.stringify(valid));
    f.customerInputs[field] = value;
    const legacy = validateCustomerInputs(type, f.customerInputs, f.ownerPricing.pricing, f.ownerPricing);
    assert.equal(legacy.ok, false);
    assert.equal(legacy.inspectionFirst, true, 'existing legacy measurement inspection guard remains active');
    assert.match(legacy.reviewReason, /[Mm]easured/);
    const result = generateQuoteVNext(f);
    assert.equal(result.inspectionFirst, true);
    assert.equal(result.reviewReason, legacy.reviewReason);
    assertNoPrice(result);
    assertNoPrice(sanitizeForCustomerVNext(result));
  });
  test(`measurement choices: unknown ${type} measurement remains no-price review`, () => {
    const f = measuredFixture(type);
    for (const field of Object.keys(fields)) delete f.customerInputs[field];
    const result = generateQuoteVNext(f);
    assertNoPrice(result);
    assertNoPrice(sanitizeForCustomerVNext(result));
  });
}
