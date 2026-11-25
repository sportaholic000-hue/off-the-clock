// New-issues audit of v53: customer price-driver lines printed raw decimals
// ("103.8961 measured square feet", "1038.888888888889 measured mowable square
// feet"). Fix: customer text shows measurements to the nearest 0.1 with a
// trailing .0 dropped; prices keep the exact value. Expected, written before
// the change:
// - concrete 11.33 x 9.17 ft: "103.9 measured square feet at 4 inches thick";
// - mowing 1038.888888888889 sq ft: "1038.9 measured mowable square feet";
// - siding 1038.888888888889: "1038.9 measured square feet of siding wall area";
// - flat roof: "Measured flat-roof area: 1038.9 square feet";
// - whole numbers unchanged ("200 measured square feet at 4 inches thick");
// - totals identical to the unrounded calculation.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mowing,siding,concrete,flatRoof} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

const drivers=q=>{assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return q.options[0].priceDrivers.join(' | ');};
const odd=1038.888888888889;
test('customer measurement text is rounded to 0.1, prices are exact',()=>{
  let f=concrete();Object.assign(f.customerInputs,{length:11.33,width:9.17});
  assert.match(drivers(generateQuoteVNext(f)),/(^|\| )103\.9 measured square feet at 4 inches thick/);
  f=concrete();assert.match(drivers(generateQuoteVNext(f)),/(^|\| )200 measured square feet at 4 inches thick/);
  f=mowing();f.customerInputs.yardSqft=odd;f.customerInputs.sqftMethod='exact';const m=generateQuoteVNext(f);
  assert.match(drivers(m),/(^|\| )1038\.9 measured mowable square feet/);
  assert.doesNotMatch(drivers(m),/1038\.88/);
  // 1038.888... x 2 cents = 2077.78 -> exact calculation, unchanged by display.
  assert.equal(m.options[0].lineItems.find(l=>l.name==='Mowing labor').amountCents,Math.round(odd*2));
  f=siding();f.customerInputs.sidingAreaSqft=odd;assert.match(drivers(generateQuoteVNext(f)),/(^|\| )1038\.9 measured square feet of siding wall area/);
  f=flatRoof();f.customerInputs.roofSqft=odd;assert.match(drivers(generateQuoteVNext(f)),/Measured flat-roof area: 1038\.9 square feet/);
});
