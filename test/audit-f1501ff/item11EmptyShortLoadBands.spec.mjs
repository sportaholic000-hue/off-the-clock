// Audit f1501ff #11 (November 24, 2026): deleting the last short-load band
// saves shortLoadBands: {}, which counted as "bands set" and conflicted with a
// flat short-load fee (NEEDS PRICING, quotes held). Expected, written before
// the fix: {} behaves exactly like no bands — live; the patio quotes 353889
// cents (hand-checked base) + 15000 flat short-load fee = 368889 cents.
// One real band plus a flat fee is still a conflict.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {concrete} from '../../verification/engine-independent/fixtures.mjs';
import {vNextServiceStatus,generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

const withFlatFee=bands=>{const f=concrete();Object.assign(f.ownerPricing.pricing,{shortLoadFlatFee:15000,shortLoadThresholdCubicYards:6},bands===undefined?{}:{shortLoadBands:bands});return f;};
test('f1501ff #11: empty shortLoadBands {} with a flat fee is live and quotes 368889 cents',()=>{
  for(const bands of [undefined,{}]){
    const f=withFlatFee(bands);
    assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE',JSON.stringify(bands));
    assert.equal(generateQuoteVNext(f).options[0].calculationRecord.scenarios.mid.finalTotalCents,368889);
  }
});
test('f1501ff #11: a real band plus a flat fee is still a conflict',()=>{
  const f=withFlatFee({small:{upToQuantity:3,charge:10000}});
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
