import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateQuoteVNext, sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';

const cases = JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261121-owner-season.json', import.meta.url)));
const earlier = JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261121-seasonal.json', import.meta.url)));
const fixture = id => structuredClone([...cases, ...earlier].find(row => row.id.endsWith(':' + id)).input);

function quote(input) {
  const result = generateQuoteVNext(input);
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', result.reviewReason);
  assert.equal(sanitizeForCustomerVNext(result).resultType, result.resultType);
  return result;
}

test('a $1,000 labor job costs $1,650 at cost or $1,100 at selling price for every old surcharge setting', () => {
  const f = fixture('labor-cost-surcharge-sell');
  for (const mode of ['cost', 'sell_price', undefined]) {
    for (const enabled of [true, false, undefined]) {
      if (mode === undefined) delete f.ownerPricing.priceBasisByCategory.surcharge;
      else f.ownerPricing.priceBasisByCategory.surcharge = mode;
      if (enabled === undefined) delete f.businessDefaults.markupApplies.surcharge;
      else f.businessDefaults.markupApplies.surcharge = enabled;
      f.ownerPricing.priceBasisByCategory.labor = 'cost';
      assert.equal(quote(f).midEstimate, 1650);
      f.ownerPricing.priceBasisByCategory.labor = 'sell_price';
      assert.equal(quote(f).midEstimate, 1100);
    }
  }
});

test('24 squares: $360 from installation receives $180 markup and $144 from tear-off receives zero', () => {
  const f = fixture('roof-24-squares');
  // 24 squares at $150 labor and $60 tear-off produce $3,600 and $1,440.
  // 50% on the labor plus its $360 seasonal portion gives $1,980 total markup.
  const q = quote(f);
  assert.equal(q.lineItems.find(l => l.name === 'Roofing labor').amountCents, 360000);
  assert.equal(q.lineItems.find(l => l.name === 'Tear-off').amountCents, 144000);
  const portions = q.lineItems.filter(l => l.category === 'surcharge');
  assert.deepEqual(portions.map(l => [l.markupCategory,l.amountCents,l.priceBasis,l.calculation.markupEligible]),
    [['labor',36000,'cost',true],['removal',14400,'cost',false]]);
  assert.equal(q.lineItems.find(l => l.category === 'markup').amountCents, 198000);
  for (const part of portions) assert.ok(part.calculation.sourceLineIndexes.every(i => q.lineItems[i].category === part.markupCategory));
  f.businessDefaults.markupApplies.removal = true;
  assert.equal(quote(f).lineItems.find(l => l.category === 'markup').amountCents, 277200);
  f.ownerPricing.priceBasisByCategory.removal = 'sell_price';
  assert.equal(quote(f).lineItems.find(l => l.category === 'markup').amountCents, 198000);
});

test('only preparation markup is enabled on an itemized painting job', () => {
  const f = fixture('painting-prep');
  // $120 direct labor plus $20 prep give $12 and $2 of seasonal pricing.
  // Only $20 + $2 receives 50% markup, for $11.
  const q = quote(f);
  assert.deepEqual(q.lineItems.filter(l => l.category === 'surcharge').map(l => [l.markupCategory,l.amountCents,l.calculation.markupEligible]),
    [['labor',1200,false],['prep',200,true]]);
  assert.equal(q.lineItems.find(l => l.category === 'markup').amountCents, 1100);
  f.ownerPricing.priceBasisByCategory.prep = 'sell_price';
  assert.equal(quote(f).lineItems.some(l => l.category === 'markup'), false);
});

test('a legacy custom service explicitly classified as a surcharge retains its configured price', () => {
  const f = fixture('legacy-custom');
  assert.equal(quote(f).midEstimate, 187.50); // $125 cost with 50% markup.
  f.ownerPricing.priceBasisByCategory.surcharge = 'sell_price';
  assert.equal(quote(f).midEstimate, 125);
  delete f.businessDefaults.markupApplies.surcharge;
  const held = generateQuoteVNext(f);
  assert.ok(held.missingOwnerFields.includes('customChargeClassification'));
});
