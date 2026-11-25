// Neon audit of v48 #12 (November 25, 2026): on a run that connects back to
// where it starts, a gate whose "corner right after the gate?" answer was
// left blank was read as "no corner", so an ordinary closed yard was refused
// with a shape error. Expected, written before the fix:
// - blank answer that makes the run impossible: review asking that question;
// - "yes": the 30/50/34/50 yard with a walk gate quotes 681000 cents;
// - explicit "no": the shape message, as before;
// - an open run with a blank answer: unchanged (quotes).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

function yard(closed,corner){
  const f=offeringFixture('FENCING_INSTALL','installed');for(const k of ['linearFeet','cornerCount','gates','lfMethod'])delete f.customerInputs[k];
  const gate={lengthLF:30,gateAfter:'walk',...(corner===undefined?{}:{cornerAfterGate:corner})};
  f.customerInputs.fenceRuns=[{closed,sections:closed?[gate,{lengthLF:50},{lengthLF:34},{lengthLF:50}]:[gate,{lengthLF:50}]}];f.customerInputs.fenceRunCount=1;
  return generateQuoteVNext(f);
}
test('Neon v48 #12: a blank corner answer that breaks a closed yard is asked',()=>{
  assert.match(yard(true,undefined).reviewReason,/turns a corner right after each gate/);
  assert.equal(yard(true,true).options[0].calculationRecord.scenarios.mid.finalTotalCents,681000);
  assert.match(yard(true,false).reviewReason,/A closed fence side must be shorter/);
  assert.equal(yard(false,undefined).resultType,'INSTANT_ESTIMATE_READY');
});
