// Third audit of v51 (November 26, 2026), finding 4: removal is priced from
// the owner's removal price and description on the new fence's offering; an
// old fence unlike that description (chain link set in concrete under a new
// privacy fence) needs a site check. No new question (owner ruling: quote as
// many jobs as possible). Expected, written before the change: the removal
// sentence ends "A different existing fence is confirmed on site."; the
// price is unchanged.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';

test('fence removal says a different existing fence is confirmed on site',()=>{
  const f=offeringFixture('FENCING_REPLACEMENT','installed');Object.assign(f.customerInputs,{oldFenceRemoval:true,removalLengthLF:50});
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  assert.match(JSON.stringify(sanitizeForCustomerVNext(q)),/Removal: [^"]*A different existing fence is confirmed on site\./);
});
