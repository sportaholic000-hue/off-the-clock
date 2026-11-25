// Neon audit of v51, V51-4 (November 26, 2026): interior painting priced
// itemized, with a second option overriding to an installed package (the
// painter's own 2 coats), quoted ready for the owner (Itemized $2,407,
// Turnkey Installed $3,800) but the customer check refused it: it filled the
// painter's coats only when the BASE service was installed, not the option.
// Expected, written before the fix: the customer gets both options at the
// owner's prices ($2,407 and $3,800). (First version read internal
// calculation records, which the customer shape does not carry; corrected.)
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

test('V51-4: an installed option on an itemized painting service reaches the customer',()=>{
  const f=offeringFixture('INTERIOR_PAINTING','itemized'),inst=offeringFixture('INTERIOR_PAINTING','installed');
  f.ownerPricing.tiers=[{name:'Itemized',overrides:{}},{name:'Turnkey Installed',overrides:{offeringMode:'installed',offeringRates:inst.ownerPricing.pricing.offeringRates,offeringDetails:inst.ownerPricing.pricing.offeringDetails}}];
  f.customerInputs.coats=1;
  const q=generateQuoteVNext({...f,callerType:'customer'});
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  assert.deepEqual(q.options.map(o=>[o.tierName,o.midEstimate]),[['Itemized',2407],['Turnkey Installed',3800]]);
});
