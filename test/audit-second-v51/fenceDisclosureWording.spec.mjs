// Second audit of v51 (November 26, 2026): customer fence wording. "2 4 ft
// gate(s)" read like 24 and "(s)" / "total-length allowance" are placeholder
// and estimator wording. Expected, written before the change (itemized fence,
// total length, no runs measured):
// - two 4 ft gates: "2 gates, 4 ft wide each: ..."; one: "1 gate, 4 ft wide: ...";
// - "Post quantities are estimated from the total fence length for 1 separate
//   fence run and are confirmed on site."; 2 runs: "... for 2 separate fence
//   runs and are confirmed on site."
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';

const text=(gates,runs)=>{const f=offeringFixture('FENCING_INSTALL','itemized');f.customerInputs.gates={walk:gates};if(runs)f.customerInputs.fenceRunCount=runs;
  const q=sanitizeForCustomerVNext(generateQuoteVNext(f));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return JSON.stringify(q);};
test('fence gate and post wording reads naturally',()=>{
  const two=text(2);assert.match(two,/2 gates, 4 ft wide each: /);assert.doesNotMatch(two,/gate\(s\)|run\(s\)|total-length allowance/);
  assert.match(two,/Post quantities are estimated from the total fence length for 1 separate fence run and are confirmed on site\./);
  assert.match(text(1),/1 gate, 4 ft wide: /);
  assert.match(text(1,2),/for 2 separate fence runs and are confirmed on site\./);
});
