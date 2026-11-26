// Backlog (verdicts audit): itemized fence infill priced per linear foot used
// only the 10% waste factor, though chain link fabric is bought by the roll
// (often 50 ft). Expected, written before the change (100 ft fence, infill
// material $20/ft, 10% waste):
// - blank: 110 ft, 220000 cents (unchanged);
// - 50 ft rolls: 110 / 50 -> 3 rolls, 150 ft, 300000 cents;
//   40 ft rolls: 3 rolls, 120 ft, 240000 cents;
// - the same in a fence catalog (one fence type's own setting);
// - refused: 0, more than 1000, with per-panel infill or installed pricing.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {fenceFixture} from '../fenceLaneB20261016Fixture.mjs';

const infill=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);const l=q.lineItems.find(row=>row.calculation?.ratePath==='offeringRates.fenceMaterialPerLF');return [l.calculation.quantity,l.amountCents];};
function single(roll){const f=offeringFixture('FENCING_INSTALL','itemized');if(roll!==undefined)f.ownerPricing.pricing.offeringDetails.infillRollLF=roll;return f;}
test('infill rounds up to whole rolls; blank keeps the exact length after waste',()=>{
  assert.deepEqual(infill(single()),[110,220000]);
  assert.deepEqual(infill(single(50)),[150,300000]);
  assert.deepEqual(infill(single(40)),[120,240000]);
});
test('a fence catalog uses each fence type\'s own roll length',()=>{
  const f=fenceFixture();f.customerInputs.fenceHeight=6;
  const [qty]=infill(f);
  f.ownerPricing.pricing.fenceOfferings.wood.offeringDetails.infillRollLF=50;
  const [rolled,cents]=infill(f);
  assert.equal(rolled,Math.ceil(qty/50)*50);assert.equal(cents,rolled*2000);
});
test('a roll length is refused when out of range or not used',()=>{
  const check=f=>{const s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(s.status,'NEEDS PRICING');assert.ok(s.validationErrors.some(m=>m.startsWith('Infill roll length (linear feet): enter a number of feet from more than 0 to 1,000')),JSON.stringify(s.validationErrors));};
  check(single(0));check(single(1001));
  const panel=single(50);panel.ownerPricing.pricing.offeringDetails.infillPricing='per_panel';check(panel);
  const installed=offeringFixture('FENCING_INSTALL','installed');installed.ownerPricing.pricing.offeringDetails.infillRollLF=50;check(installed);
});
