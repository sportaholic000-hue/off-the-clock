import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,customerContractForVNext} from '../server/quote-engine-vnext/index.js';
import {scopeKeysForRequest,customerFieldVisible,clearChangedScopeConfirmations} from '../server/scopeConfiguration.js';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {configuredScope} from './measuredScopeFixtures.mjs';

// November 22, 2026 (v44). One layer of self-adhered underlayment over a
// low-slope roof replaces the regular underlayment: the customer is not asked
// to confirm rolls that are not bought, and the owner is not asked for an
// underlayment price that is not used. Every expected value was worked out by
// hand before the run.
const quote=f=>generateQuoteVNext(f);
const ready=f=>{const q=quote(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.missingCustomerFields,q.invalidCustomerFields]));return q;};
const mid=q=>q.options[0].calculationRecord.scenarios.mid;
const cents=q=>mid(q).finalTotalCents;
const lines=q=>Object.fromEntries(mid(q).lineItems.map(l=>[l.name,l.amountCents]));
const O=f=>f.ownerPricing;
// 2,000 sq ft, labor 500.00 per square, shingles 300.00 per square with 10% waste, tear-off 100.00 per square.
// The fixture's book: IRC, asphalt shingles, manufacturer minimum slope 2/12.
const roof=(c={},p={})=>{const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:50000},materialCostPerSquare:{asphalt_shingle:30000},tearOffPerSquare:{asphalt_shingle:10000},minimumJob:0,accessoryPricingMode:'per_square_allin',...p},
  {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...c});
  O(f).startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};return f;};
// Underlayment rolls cover 500 sq ft with 10% waste and cost 150.00 each.
const rolls=(c,p,confirm)=>configuredScope(roof(c,{underlaymentPriceBasis:{asphalt_shingle:'cost'},...p}),'roof_underlayment_asphalt_shingle',{mode:'package_cost',productKey:'roof_roll',coverage:500,wastePercent:10},{roof_underlayment_asphalt_shingle:15000},confirm?{roofUnderlaymentScopeConfirmed:true}:{});
const selfAdhered={lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'},selfAdheredUnderlaymentPerSquare:9000};
const low={pitchBand:'under_four',pitchRisePer12:3};
// 10,000.00 labor + 22 squares x 300.00 = 6,600.00 + tear-off 2,000.00 + self-adhered 20 x 90.00 = 1,800.00.
const SELF_ADHERED_TOTAL=2040000;

test('a 3/12 self-adhered roof quotes without the unused roll confirmation',()=>{
  const f=rolls(low,selfAdhered,false),q=ready(f);
  assert.equal(cents(q),SELF_ADHERED_TOTAL);assert.equal(lines(q)['Self-adhered underlayment'],180000);assert.equal(lines(q)['Purchased materials: roof_roll'],undefined);
  assert.ok(!scopeKeysForRequest('ROOFING_REPLACEMENT',f.customerInputs,O(f).pricing).includes('roof_underlayment_asphalt_shingle'));
  // Before v44 this quote was held with missingCustomerFields ['roofUnderlaymentScopeConfirmed'].
});
test('the roll confirmation shows only where the rolls are bought',()=>{
  const f=rolls(low,selfAdhered,false),field=customerContractForVNext('ROOFING_REPLACEMENT',O(f).pricing).fields.roofUnderlaymentScopeConfirmed;
  const shown=c=>customerFieldVisible({...field,name:'roofUnderlaymentScopeConfirmed'},{...f.customerInputs,...c});
  assert.equal(shown({pitchRisePer12:3}),false);
  assert.equal(shown({pitchRisePer12:2}),false);   // the product's lowest allowed slope
  assert.equal(shown({pitchRisePer12:3.99}),false);
  assert.equal(shown({pitchRisePer12:4}),true);
  assert.equal(shown({pitchRisePer12:5}),true);
  assert.equal(shown({pitchRisePer12:1.5}),true);  // below 2/12: the product cannot be quoted; the roof goes to review either way
  assert.equal(shown({pitchRisePer12:undefined}),true);
  assert.equal(shown({pitchMethod:'pitch_band',pitchRisePer12:undefined}),true);
  assert.equal(shown({replacementRoofType:'metal'}),false);
});
test('a confirmation given at 5/12 is cleared when the customer corrects the roof to 3/12',()=>{
  const f=rolls({},selfAdhered,true),fields=Object.entries(customerContractForVNext('ROOFING_REPLACEMENT',O(f).pricing).fields).map(([name,d])=>({name,...d}));
  const before={...f.customerInputs,pitchRisePer12:5};assert.equal(before.roofUnderlaymentScopeConfirmed,true);
  // 5/12 with rolls: 10,000.00 + 6,600.00 + 2,000.00 + ceil(2,000 x 1.10 / 500) = 5 rolls = 750.00: 19,350.00.
  assert.equal(cents(ready({...f,customerInputs:before})),1935000);
  const after=clearChangedScopeConfirmations(fields,before,{...before,pitchBand:'under_four',pitchRisePer12:3});
  assert.equal(Object.hasOwn(after,'roofUnderlaymentScopeConfirmed'),false);
  assert.equal(cents(ready({...f,customerInputs:after})),SELF_ADHERED_TOTAL);
  // Back to 5/12 the confirmation is asked again, not assumed.
  const again=clearChangedScopeConfirmations(fields,after,{...after,pitchBand:'up_to_six',pitchRisePer12:5});
  assert.equal(Object.hasOwn(again,'roofUnderlaymentScopeConfirmed'),false);
  assert.deepEqual(quote({...f,customerInputs:again}).missingCustomerFields,['roofUnderlaymentScopeConfirmed']);
});
test('two underlayment layers still buy and confirm the rolls',()=>{
  const p={lowSlopeAssemblyByProduct:{asphalt_shingle:'double_underlayment'}};
  // ceil(4,000 x 1.10 / 500) = 9 rolls = 1,350.00: 10,000.00 + 6,600.00 + 2,000.00 + 1,350.00 = 19,950.00.
  assert.equal(cents(ready(rolls(low,p,true))),1995000);
  assert.deepEqual(quote(rolls(low,p,false)).missingCustomerFields,['roofUnderlaymentScopeConfirmed']);
});
test('a self-adhered low-slope roof bought by the roll needs no per-square underlayment price',()=>{
  // Rolls set up, no per-square underlayment price saved: the roof quotes at 3/12.
  const f=rolls(low,selfAdhered,false);delete O(f).pricing.underlaymentPerSquare;
  assert.equal(cents(ready(f)),SELF_ADHERED_TOTAL);
  // Before v44 the rolls' scope stood in for that price; with the scope no
  // longer requested the owner would have been asked for it.
});
test('the price book still needs a regular underlayment price for every roof product',()=>{
  // Underlayment priced per square with no per-square price saved: this is a
  // gap in the book (every roof of 4/12 or more uses that price), so even the
  // 3/12 self-adhered roof is held until it is entered, as before v44.
  const f=roof(low,{underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},...selfAdhered});delete O(f).pricing.underlaymentPerSquare;
  const held=quote(f);assert.equal(held.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(held.missingOwnerFields,['underlaymentPerSquare.asphalt_shingle']);
  // With it saved, the 3/12 roof uses the self-adhered layer and not that price.
  const priced=roof(low,{underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},underlaymentPerSquare:{asphalt_shingle:2000},...selfAdhered});
  const q=ready(priced);assert.equal(cents(q),SELF_ADHERED_TOTAL);assert.equal(lines(q).Underlayment,undefined);
});
