import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';

const rows=JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261121-seasonal.json',import.meta.url)));
const input=id=>structuredClone(rows.find(row=>row.id==='seasonal-20261121:'+id).input);
function quote(f){
  const q=generateQuoteVNext(f);
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  assert.equal(sanitizeForCustomerVNext(q).resultType,q.resultType);
  return q;
}
for (const [id,dollars] of [['labor-cost-surcharge-sell',1650],['labor-cost-surcharge-off',1650],['labor-sell-surcharge-cost',1100]]) {
  test(id,()=>{
    // $1,000 labor + $100 peak. Marking cost up by 50% gives $1,650; final selling prices give $1,100.
    assert.equal(quote(input(id)).midEstimate,dollars);
  });
}
test('labor markup disabled, margin, tax and non-season work',()=>{
  const f=input('labor-cost-surcharge-off');
  f.businessDefaults.markupApplies.labor=false;f.businessDefaults.markupApplies.surcharge=true;
  assert.equal(quote(f).midEstimate,1100);
  f.businessDefaults.markupApplies.labor=true;f.businessDefaults.markupMode='margin';f.businessDefaults.markupPercent=20;
  // $1,100 / .80 = $1,375. Taxing labor at 10% adds $137.50.
  f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;f.ownerPricing.taxabilityByCategory.labor=true;
  assert.equal(quote(f).midEstimate,1512.50);
  f.customerInputs.workMonth='january';assert.equal(quote(f).midEstimate,1375);
});
test('one busy season can include both cost labor and selling-price removal',()=>{
  const f=input('mixed-labor-and-removal'),q=quote(f);
  // $5,000 labor + $2,000 selling-price tear-off + $7,700 membrane. Surcharge is $500 + $200.
  // Only $5,500 receives markup: $2,750, making $18,150 total.
  assert.equal(q.midEstimate,18150);
  const parts=q.lineItems.filter(line=>line.category==='surcharge');
  assert.deepEqual(parts.map(line=>[line.amountCents,line.calculation.markupEligible]),[[50000,true],[20000,false]]);
  // Fractional cents: labor 10,005c, removal 10,005c. The total charge is 2,001c, split 1,001 + 1,000.
  f.ownerPricing.pricing.laborPerSqft.epdm=10.005;f.ownerPricing.pricing.tearOffPerSqft.epdm=10.005;
  const small=quote(f).lineItems;
  assert.deepEqual(small.filter(l=>l.category==='surcharge').map(l=>l.amountCents),[1001,1000]);
  assert.equal(small.find(l=>l.category==='markup').amountCents,5503);
});
test('a custom labor portion keeps the original category markup switch',()=>{
  const f=input('custom-cost-split');
  // $1,000 cost price, 60% labor = $60 busy-season charge. 50% markup on $1,060 yields $1,590.
  assert.equal(quote(f).midEstimate,1590);
  f.businessDefaults.markupApplies.addon=false;f.businessDefaults.markupApplies.surcharge=true;
  assert.equal(quote(f).midEstimate,1060);
});
