// Audit f1501ff #2 (November 24, 2026): a roof given as areas by pitch with
// any area under 4/12 (a typical porch) always went to review. Owner
// direction: quote by industry standard, and ask only what a homeowner can
// answer over the phone. A homeowner cannot measure the porch's rise but can
// say what covers it now. Shingles there mean the section takes shingles
// from 2/12 up to 4/12 (IRC R905.2.2); estimates charge the low-slope
// underlayment on those squares only. Expected, written before the fix
// (2,000 sq ft = 20 squares; 1,800 at 4/12-6/12; 200 sq ft = 2 squares low):
// - whole roof 6/12 control: 950000 cents (labor 400000, shingles 330000,
//   tear-off 120000, underlayment 40000, disposal 60000);
// - porch with shingles, two layers: + 2 squares x 2000 = 954000;
// - porch with shingles, self-adhered at 9000: underlayment 18 x 2000 = 36000
//   + self-adhered 2 x 9000 = 18000: 950000 - 40000 + 54000 = 964000;
// - self-adhered chosen with no price: NEEDS PRICING naming the price;
// - no answer yet: the question is asked; flat roofing or not sure: review.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {porchRoof} from './fixtures.mjs';
import {slopeRoof} from './roofFixture.mjs';
import {vNextServiceStatus,generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';

const total=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);assert.equal(sanitizeForCustomerVNext(q).resultType,'INSTANT_ESTIMATE_READY');return q;};
const self={lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'}};

test('f1501ff #2: a shingled porch is priced with the low-slope method on its squares only',()=>{
  assert.equal(total(ready(slopeRoof())),950000);
  const two=ready(porchRoof('shingles',{lowSlopeAssemblyByProduct:{asphalt_shingle:'double_underlayment'}}));
  assert.equal(total(two),954000);
  assert.match(JSON.stringify(sanitizeForCustomerVNext(two)),/its slope is confirmed on site/);
  assert.equal(total(ready(porchRoof('shingles',{...self,selfAdheredUnderlaymentPerSquare:9000}))),964000);
  const f=porchRoof('shingles',{...self,selfAdheredUnderlaymentPerSquare:9000});
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
});
test('f1501ff #2: unpriced self-adhered blocks; unanswered asks; flat roofing or not sure goes to review',()=>{
  const unpriced=porchRoof('shingles',self);
  assert.equal(vNextServiceStatus(unpriced.ownerPricing,unpriced.businessDefaults).status,'NEEDS PRICING');
  assert.deepEqual(generateQuoteVNext(unpriced).missingOwnerFields,['selfAdheredUnderlaymentPerSquare']);
  assert.deepEqual(generateQuoteVNext(porchRoof(null)).missingCustomerFields,['lowSlopeSectionSurface']);
  assert.match(generateQuoteVNext(porchRoof('flat_roofing')).reviewReason,/flat roofing now/);
  assert.match(generateQuoteVNext(porchRoof('not_sure')).reviewReason,/below 4\/12/);
});
