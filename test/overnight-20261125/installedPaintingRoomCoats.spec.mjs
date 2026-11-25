// Found by the harness choice sweep (November 25, 2026, overnight): on an
// installed interior painting price, a customer who measures room by room
// with ceilings included was asked for ceiling coats, a question the form
// does not show (the installed price includes the owner's own coats, audit
// f1501ff #8), so every such job was held for review. Expected, written
// before the fix:
// - room-by-room with ceilings, no ceiling coats given: ready;
// - its price equals the same request with ceiling coats 2 (the owner's own
//   coats, which the engine already substitutes when an answer is given);
// - an itemized price still asks the customer for ceiling coats.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

function rooms(mode,extra={}){
  const f=offeringFixture('INTERIOR_PAINTING',mode),c=f.customerInputs;
  for(const k of ['wallAreaSqft','ceilingAreaSqft','wallScopeUniform','trimLengthLF'])delete c[k];
  Object.assign(c,{areaInputMethod:'room_dimensions',rooms:[{lengthFeet:20,widthFeet:15,heightFeet:8,doorCount:1,windowCount:2}],ceilingsIncluded:true,ceilingSurfaceCondition:'fair',trimIncluded:false},extra);
  return f;
}
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
test('installed painting, rooms with ceilings: the owner\'s ceiling coats are used, not asked',()=>{
  const q=generateQuoteVNext(rooms('installed'));
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingCustomerFields]));
  const answered=generateQuoteVNext(rooms('installed',{ceilingCoats:2}));
  assert.equal(answered.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(cents(q),cents(answered));
});
test('itemized painting, rooms with ceilings: ceiling coats are still asked',()=>{
  assert.ok(generateQuoteVNext(rooms('itemized')).missingCustomerFields.includes('ceilingCoats'));
});
