// Audit f1501ff #3 (November 24, 2026): with the base material wording
// "Excludes starter, drip edge, ridge cap, flashing and vents", a roof quote
// without itemized flashing and vent lines had no flashing or vent line and
// did not say they were excluded. Expected, written before the fix:
// - the price is unchanged. 20 squares: labor 20 x 20000 = 400000; shingles
//   22 x 15000 = 330000; tear-off 20 x 6000 = 120000; underlayment 20 x 2000
//   = 40000; disposal 20 x 3000 = 60000; accessories with the 10% accessory
//   waste starting value: starter 220 LF x 200 = 44000, drip edge 220 x 300
//   = 66000, ridge cap 44 x 500 = 22000. Total 1082000 cents. (A first
//   version of this comment left out the accessory waste; corrected after
//   the run showed 44000 for the starter.)
// - the quote (owner and customer) says flashing and vents are not included
//   and are confirmed and priced on site; it stays QUOTING LIVE and ready,
//   and a full estimate, not partial (corrected after the Neon audit of v48:
//   the first version left them for the site, which made every such roof a
//   partial quote with no total);
// - with itemized flashing and vent lines on, only unlisted flashing and
//   vents are disclosed;
// - with the narrower wording (starter, drip edge, ridge cap only) nothing
//   about flashing is added.
// New line items (chimney, skylight, box vents, exhaust caps, headwall) are
// NOT part of this fix: they are new scope awaiting an owner ruling.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {roofExcludingFlashingVents} from './fixtures.mjs';
import {confirmAccessories} from '../../verification/qe-agent1-core-accuracy-20261018/fixtures.mjs';
import {vNextServiceStatus,generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';

const quote=f=>{const q=generateQuoteVNext(structuredClone(f));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return q;};
const total=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const lines=q=>Object.fromEntries(q.options[0].lineItems.map(l=>[l.name,l.amountCents]));

test('f1501ff #3: the flashing-and-vents wording without flashing lines is disclosed; price unchanged',()=>{
  const f=roofExcludingFlashingVents();
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
  const q=quote(f),l=lines(q);
  assert.equal(l['Starter strip'],44000);assert.equal(l['Drip edge'],66000);assert.equal(l['Hip-and-ridge cap'],22000);
  assert.equal(total(q),1082000);
  assert.equal(total(q),total(quote(roofExcludingFlashingVents('excludes_itemized_accessories'))));
  // Neon audit of v48 #1: a written exclusion, not work left for the site, so
  // the quote stays a full estimate (it was partial on every such roof).
  assert.deepEqual(q.options[0].skippedAddons,[]);
  const customer=sanitizeForCustomerVNext(q);
  assert.equal(customer.resultType,'INSTANT_ESTIMATE_READY');
  assert.match(JSON.stringify(customer),/Not included; confirmed and priced on site: flashing and vents/);
});
test('f1501ff #3: with itemized flashing lines on, only unlisted flashing and vents are disclosed',()=>{
  const f=confirmAccessories(roofExcludingFlashingVents());
  Object.assign(f.ownerPricing.pricing,{valleyPerLF:1000,stepFlashingPerLF:800,pipeJackEach:4000,ridgeVentPerLF:600,iceWaterBarrierUnit:'linear_feet',iceWaterBarrierPerLF:500});
  Object.assign(f.customerInputs,{valleyLengthLF:20,stepFlashingLengthLF:0,pipeJackCount:0,ridgeVentLengthLF:0,iceWaterBarrierLengthLF:0});
  const q=quote(f);
  assert.equal(lines(q)['Valley flashing'],20000);
  assert.deepEqual(q.options[0].skippedAddons,[]);
  assert.match(JSON.stringify(sanitizeForCustomerVNext(q)),/chimney, skylight or wall flashing, are confirmed and priced on site/);
});
test('f1501ff #3: the narrower wording adds no flashing disclosure',()=>{
  const q=quote(roofExcludingFlashingVents('excludes_itemized_accessories'));
  assert.deepEqual(q.options[0].skippedAddons,[]);
  assert.doesNotMatch(JSON.stringify(sanitizeForCustomerVNext(q)),/flashing/i);
});

test('f1501ff #3 / Neon v48 #1: the application keeps a flashing-wording roof a full estimate',async()=>{
  const {discloseQuoteScope}=await import('../../server/src/quoteScopeDisclosure.js');
  const f=roofExcludingFlashingVents(),q=generateQuoteVNext(structuredClone(f)),customer=sanitizeForCustomerVNext(q);
  const service={...f.ownerPricing,serviceType:f.serviceType},submission={customerInputs:f.customerInputs,additionalWork:[]};
  assert.equal(discloseQuoteScope(customer,service,{customerFields:[]},submission,'rev').resultType,'INSTANT_ESTIMATE_READY');
  assert.deepEqual(q.options[0].skippedAddons,[]);
});
