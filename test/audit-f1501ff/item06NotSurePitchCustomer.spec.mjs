// Audit f1501ff #6 (November 24, 2026): a caller "not sure" of the pitch who
// then gives a band or rise is priced as that whole-roof pitch in the owner
// preview, but the customer check refused it (it compared the submitted
// inputs with the derived ones). Expected, written before the fix: the
// customer sees the same price as the owner.
// 2,000 sq ft = 20 squares, pitch 7-9:
//   labor 20 x 200.00 x 1.20 = 4,800.00; shingles 20 x 1.10 x 150.00 =
//   3,300.00; underlayment 20 x 20.00 = 400.00; tear-off 20 x 60.00 x 1.26 =
//   1,512.00; disposal 20 x 30.00 = 600.00; total 10,612.00.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {slopeRoof} from './roofFixture.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';

for(const [label,answers] of [['band 7-9',{pitchMethod:'not_sure',pitchBand:'seven_to_nine'}],['rise 8/12',{pitchMethod:'not_sure',pitchBand:undefined,pitchRisePer12:8}],['whole roof 7-9 (control)',{pitchBand:'seven_to_nine'}]])
test('f1501ff #6: not sure + '+label+' reaches the customer at $10,612',()=>{
  const q=generateQuoteVNext(slopeRoof(answers));
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,1061200);
  const customer=sanitizeForCustomerVNext(q);
  assert.equal(customer.resultType,'INSTANT_ESTIMATE_READY',customer.reviewReason);
  assert.equal(customer.midEstimate,10612);
});
