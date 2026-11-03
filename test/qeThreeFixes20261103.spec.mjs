import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {flooring} from '../verification/engine-independent/fixtures.mjs';

// November 3, 2026 fixes. Every expected value was worked out by hand before
// the run. Tile 200 sq ft fixture: labor 200 x 3.00 x 1.10 = 660.00; materials
// 224 x 5.00 = 1,120.00; subtotal 1,780.00.
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const line=(q,name)=>(q.options?.[0]?.lineItems||[]).find(l=>l.name===name);
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.ownerDecisionRequired]));return q;};
const taxed=(f,cats,percent=15)=>{f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=percent;for(const c of cats)f.ownerPricing.taxabilityByCategory[c]=true;return f;};

function carpet(rooms){
  const f=flooring('carpet',1);
  Object.assign(f.ownerPricing.pricing,{carpetRollWidthFt:12,scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] pad included',mode:'included_in_floor_price'}}});
  for(const k of ['sqft','sqftMethod','roomCount'])delete f.customerInputs[k];
  Object.assign(f.customerInputs,{underlaymentScopeConfirmed:true,carpetMeasurementMethod:'rooms',carpetRooms:rooms});
  return f;
}
test('a room as wide as the carpet roll takes one roll width; trim goes on the cut length (CRI 105 5.3)',()=>{
  // 12 x 12 on a 12 ft roll: one width x (12 + 0.5) = 150 sq ft, not two widths (300).
  assert.equal(line(ready(carpet([{lengthFt:12,widthFt:12}])),'Flooring materials').calculation.quantity,150);
  // 11.75 x 11.75: one width x 12.25 = 147.
  assert.equal(line(ready(carpet([{lengthFt:11.75,widthFt:11.75}])),'Flooring materials').calculation.quantity,147);
  // 24 x 13: run the 24 ft wall across: 2 widths x (13 + 0.5) = 324 (was 486 with a third width).
  assert.equal(line(ready(carpet([{lengthFt:24,widthFt:13}])),'Flooring materials').calculation.quantity,324);
  // 15 x 15 is unchanged: 2 widths x 15.5 = 372.
  assert.equal(line(ready(carpet([{lengthFt:15,widthFt:15}])),'Flooring materials').calculation.quantity,372);
});

test('the minimum top-up is taxed exactly like labor under materials-only tax',()=>{
  // $10,000 minimum. Labor and materials taxed at 15%: the whole $10,000 is taxed: $1,500.
  let f=taxed(flooring('tile',200),['material','labor']);f.ownerPricing.pricing.minimumJob=1000000;
  assert.equal(cents(ready(f)),1150000);
  // Materials only: 1,120.00 x 15% = 168.00; the 8,220.00 top-up is untaxed.
  f=taxed(flooring('tile',200),['material']);f.ownerPricing.pricing.minimumJob=1000000;
  assert.equal(cents(ready(f)),1016800);
});

test('the busy-season charge is taxed exactly like the labor it comes from',()=>{
  const peak=f=>{f.ownerPricing.peakMonths=[7];f.ownerPricing.peakSurchargePercent=20;f.customerInputs.workMonth='july';return f;};
  // 20% of 660.00 labor = 132.00. Labor and materials taxed at 10%:
  // (660 + 1,120 + 132) x 10% = 191.20; total 2,103.20.
  assert.equal(cents(ready(peak(taxed(flooring('tile',200),['material','labor'],10)))),210320);
  // Materials only: 1,120 x 10% = 112.00; labor and its busy-season charge untaxed: 2,024.00.
  assert.equal(cents(ready(peak(taxed(flooring('tile',200),['material'],10)))),202400);
});
