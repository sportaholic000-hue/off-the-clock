// New-issues audit of v53, finding 1 (release-blocking): flat per-visit mowing
// (a $0 area rate with a per-visit charge, opened in v53) quoted the same
// price for every lot size and every lawn condition. Industry practice: a flat
// visit price is set for a lot size, and overgrown, less frequent or
// hard-access lawns cost more per visit.
// Fix: in flat mode the owner enters "Largest lawn this flat price covers";
// larger lawns go to review, and the owner's own frequency, grass-condition
// and mower-access multipliers apply to the flat charge.
// Expected, written before the change ($50 visit, max 20,000 sq ft):
// - 5,000 sq ft weekly maintained: 5000 cents;
// - 5,000 sq ft one-time severe (one_time 1.5, severe 2): 5000 x 3 = 15000;
// - 5,000 sq ft weekly maintained, no riding mower (1.5): 7500;
// - 20,000 sq ft (at the limit): quotes; 20,001 sq ft: review;
// - flat mode without the limit: NEEDS PRICING, the limit listed as missing;
// - area pricing with a visit charge: unchanged (visit charge not multiplied).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mowing} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';

function setup(pricing,inputs){
  const f=mowing(),p=f.ownerPricing.pricing;
  Object.assign(p,{mowingBaseRatePerSqft:0,mowingVisitCharge:5000,mowingFlatVisitMaxSqft:20000,minimumServiceCharge:0,
    frequencyMultipliers:{weekly:1,biweekly:1.1,monthly:1.5,one_time:1.5},overgrowthMultipliers:{maintained:1,overgrown:1.5,severe:2}},pricing);
  for(const [k,v] of Object.entries(pricing))if(v===undefined)delete p[k];
  Object.assign(f.customerInputs,{yardSqft:5000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false},inputs);
  return f;
}
const total=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;

test('flat per-visit mowing applies the owner multipliers to the flat charge',()=>{
  let q=generateQuoteVNext(setup({},{}));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);assert.equal(total(q),5000);
  q=generateQuoteVNext(setup({},{serviceFrequency:'one_time',grassCondition:'severe'}));assert.equal(total(q),15000);
  q=generateQuoteVNext(setup({noRidingMowerLaborMultiplier:1.5},{ridingMowerReachesLawn:false}));assert.equal(total(q),7500);
});
test('flat per-visit mowing sends lawns larger than the owner limit to review',()=>{
  const f=setup({},{yardSqft:20000});
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
  assert.equal(generateQuoteVNext(f).resultType,'INSTANT_ESTIMATE_READY');
  for(const yardSqft of [20001,435600,10_000_000]){
    const q=generateQuoteVNext(setup({},{yardSqft}));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',String(yardSqft));
    assert.equal(sanitizeForCustomerVNext(q).lowEstimate,undefined);
  }
});
test('flat per-visit mowing needs the size limit before it goes live',()=>{
  const f=setup({mowingFlatVisitMaxSqft:undefined},{});
  const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(status.status,'NEEDS PRICING');
  assert.ok(status.missingOwnerFields.includes('mowingFlatVisitMaxSqft'),JSON.stringify(status.missingOwnerFields));
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
  for(const bad of [0,-5,'big',Number.POSITIVE_INFINITY]){
    const g=setup({mowingFlatVisitMaxSqft:bad},{});
    assert.equal(vNextServiceStatus(g.ownerPricing,g.businessDefaults).status,'NEEDS PRICING',String(bad));
  }
});
test('area-priced mowing with a per-visit charge is unchanged',()=>{
  // 5,000 sq ft x 0.2 cents x 1.5 x 2 = 3000 cents labor + 4500 visit charge.
  const q=generateQuoteVNext(setup({mowingBaseRatePerSqft:0.2,mowingVisitCharge:4500,mowingFlatVisitMaxSqft:undefined},{serviceFrequency:'one_time',grassCondition:'severe',yardSqft:5000}));
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);assert.equal(total(q),7500);
  // No size limit applies to area pricing.
  assert.equal(generateQuoteVNext(setup({mowingBaseRatePerSqft:0.2,mowingFlatVisitMaxSqft:undefined},{yardSqft:435600})).resultType,'INSTANT_ESTIMATE_READY');
});
