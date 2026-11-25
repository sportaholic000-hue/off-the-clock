// Owner ruling (November 26, 2026): quote by industry best practice, as many
// jobs as possible. Neon v49 NEW-7: the clipping bagging surcharge is a
// percentage of the whole mowing price for the visit, including the per-visit
// charge (it was the area labor only, which gave $0 bagging on flat per-visit
// pricing). Expected, written before the change:
// - 5,000 sq ft at 0.2 cents/sq ft (1000 cents) + 4500 visit charge, 20%:
//   bagging 20% x 5500 = 1100 cents (was 200);
// - flat per-visit pricing (0 area rate) with a 5000 visit charge, 20%:
//   quotes (it was held as an unclassified $0 price: a $0 area rate with a
//   positive per-visit charge is flat per-visit pricing, common in lawn
//   care), bagging 1000 cents, total 6000;
// - no visit charge: unchanged (20% of area labor).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mowing} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

function bagging(rate,visit){
  const f=mowing(),p=f.ownerPricing.pricing;
  Object.assign(p,{mowingBaseRatePerSqft:rate,baggingSurchargePercent:20,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},overgrowthMultipliers:{maintained:1,overgrown:1,severe:1}});
  if(visit!==undefined)p.mowingVisitCharge=visit;else delete p.mowingVisitCharge;
  // Flat per-visit pricing needs its size limit since the new-issues audit of v53.
  if(rate===0)p.mowingFlatVisitMaxSqft=20000;
  Object.assign(f.customerInputs,{yardSqft:5000,sqftMethod:'exact',grassCondition:'maintained',bagClippings:true,edgingIncluded:false});
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  return [q.options[0].lineItems.find(l=>l.name==='Clipping bagging and disposal').amountCents,q.options[0].calculationRecord.scenarios.mid.finalTotalCents];
}
test('bagging is a percentage of the whole visit price',()=>{
  assert.deepEqual(bagging(0.2,4500),[1100,6600]);
  assert.deepEqual(bagging(0,5000),[1000,6000]);
  {const f=mowing();Object.assign(f.ownerPricing.pricing,{mowingBaseRatePerSqft:0,mowingVisitCharge:5000,mowingFlatVisitMaxSqft:20000});assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');}
  assert.deepEqual(bagging(0.2),[200,1200]);
});
