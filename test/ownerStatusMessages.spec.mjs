import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {generateQuoteVNext, vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {vNextPricebookStatuses} from '../server/quote-engine-vnext/priceBook.js';

const status = f => vNextServiceStatus(f.ownerPricing, f.businessDefaults);
const condition = (s, name) => s.productCoverage.find(p => p.selection.surfaceCondition === name);
const noOptionalRequirements = s => {
  for (const group of [s, ...s.failedTierDiagnostics, ...s.productCoverage]) {
    assert.equal((group.ownerDiagnostics || []).some(d => d.type === 'missing' && /^offeringRates\.prep/.test(d.path)), false);
  }
};

for (const type of ['INTERIOR_PAINTING', 'EXTERIOR_PAINTING']) test(type + ': legacy baseline is the only required item; unpriced prep is separate', () => {
  const f = offeringFixture(type, 'itemized');
  if (type === 'INTERIOR_PAINTING') f.ownerPricing.pricing.offeringDetails.wallHeight = 'high';
  delete f.ownerPricing.pricing.offeringDetails.baselinePricesConfirmed;
  const s = status(f);
  assert.equal(s.status, 'NEEDS PRICING');
  assert.deepEqual(s.ownerDiagnostics.map(d => d.path), ['offeringDetails.baselinePricesConfirmed']);
  assert.deepEqual(s.missingOwnerFields, []);
  assert.equal(s.validationErrors.length, 1);
  for (const name of ['good', 'poor']) {
    assert.deepEqual(condition(s, name).unpricedOwnerFields, ['offeringRates.prepLaborPerSqft_' + name, 'offeringRates.prepMaterialPerSqft_' + name]);
    assert.equal(condition(s, name).coverageMessage, 'Not yet priced. Requests for this condition go to review.');
  }
  assert.deepEqual(condition(s, 'fair').unpricedOwnerFields, []);
  noOptionalRequirements(s);
  const bookStatus = vNextPricebookStatuses({services: [f.ownerPricing], defaults: f.businessDefaults})[0];
  assert.deepEqual(bookStatus.validationErrors, s.validationErrors);
});

test('clearing the actual blocker keeps fair live at $2,475 and good/poor review-only', () => {
  const f = offeringFixture('EXTERIOR_PAINTING', 'itemized');
  assert.equal(status(f).status, 'QUOTING LIVE');
  for (const name of ['good', 'fair', 'poor']) {
    f.customerInputs.surfaceCondition = name;
    const q = generateQuoteVNext(f);
    assert.equal(q.resultType, name === 'fair' ? 'INSTANT_ESTIMATE_READY' : 'ESTIMATE_REQUIRES_REVIEW');
    // 500 sqft: (2*100 + 100 prep + 50 primer)*1.10 labor
    // plus (2*30 + 20 prep + 20 primer)*1.10 material waste = 247500 cents.
    if (name === 'fair') assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents, 247500);
    else assert.equal(q.midEstimate, undefined);
  }
  noOptionalRequirements(status(f));
});

test('another required rate remains required without optional condition prices', () => {
  const f = offeringFixture('EXTERIOR_PAINTING', 'itemized');
  delete f.ownerPricing.pricing.offeringRates.wallLaborPerSqftPerCoat;
  const s = status(f);
  assert.equal(s.status, 'NEEDS PRICING');
  assert.deepEqual(s.missingOwnerFields, ['offeringRates.wallLaborPerSqftPerCoat']);
  noOptionalRequirements(s);
});

test('no priced prep condition still blocks, requiring one condition rather than every condition', () => {
  const f = offeringFixture('EXTERIOR_PAINTING', 'itemized');
  delete f.ownerPricing.pricing.offeringRates.prepLaborPerSqft;
  delete f.ownerPricing.pricing.offeringRates.prepMaterialPerSqft;
  const s = status(f);
  assert.equal(s.status, 'NEEDS PRICING');
  assert.deepEqual(s.validationErrors, ['Price preparation for at least one surface condition before this offering can quote.']);
  assert.equal(s.productCoverage.every(p => p.unpricedOwnerFields.length === 2), true);
  noOptionalRequirements(s);
  for (const name of ['good', 'fair', 'poor']) {
    f.customerInputs.surfaceCondition = name;
    assert.equal(generateQuoteVNext(f).resultType, 'ESTIMATE_REQUIRES_REVIEW');
  }
});

test('partial optional prices and unclassified zero prices retain existing review rules', () => {
  const f = offeringFixture('EXTERIOR_PAINTING', 'itemized');
  f.ownerPricing.pricing.offeringRates.prepLaborPerSqft_good = 100;
  let s = status(f);
  assert.equal(s.status, 'QUOTING LIVE');
  assert.deepEqual(condition(s, 'good').unpricedOwnerFields, ['offeringRates.prepMaterialPerSqft_good']);
  f.ownerPricing.pricing.offeringRates.prepLaborPerSqft_good = 0;
  f.ownerPricing.pricing.offeringRates.prepMaterialPerSqft_good = 0;
  s = status(f);
  assert.equal(s.status, 'QUOTING LIVE');
  assert.equal(condition(s, 'good').unpricedOwnerFields.length, 2);
  assert.equal(condition(s, 'good').configurationComplete, false);
  f.customerInputs.surfaceCondition = 'good';
  assert.equal(generateQuoteVNext(f).resultType, 'ESTIMATE_REQUIRES_REVIEW');
});

test('malformed condition prices remain genuine blockers', () => {
  const f = offeringFixture('EXTERIOR_PAINTING', 'itemized');
  f.ownerPricing.pricing.offeringRates.prepLaborPerSqft_good = -1;
  const s = status(f);
  assert.equal(s.status, 'NEEDS PRICING');
  assert.equal(s.invalidOwnerFields.includes('offeringRates.prepLaborPerSqft_good'), true);
  assert.equal(generateQuoteVNext(f).resultType, 'ESTIMATE_REQUIRES_REVIEW');
  noOptionalRequirements(s);
});

test('failed price-option messages separate optional prep without changing option eligibility', () => {
  const f = offeringFixture('EXTERIOR_PAINTING', 'itemized');
  f.ownerPricing.tiers = [{name: 'Standard', overrides: {}}, {name: 'Legacy', overrides: {offeringDetails: {baselinePricesConfirmed: false}}}];
  const s = status(f);
  assert.equal(s.status, 'QUOTING LIVE');
  assert.deepEqual(s.validTierNames, ['Standard']);
  assert.deepEqual(s.failedTierDiagnostics[0].ownerDiagnostics.map(d => d.path), ['offeringDetails.baselinePricesConfirmed']);
  noOptionalRequirements(s);
});
