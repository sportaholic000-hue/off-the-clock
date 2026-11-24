// Audit f1501ff #5e (November 24, 2026): with underlayment bought by the roll,
// readiness never tested a low-slope roof, so a missing self-adhered price
// left the service QUOTING LIVE while every 3/12 quote was held. Expected,
// written before the fix (every price worked out by hand in
// qeNeonV44_20261122.spec.mjs: 2,000 sq ft, IRC, 2/12 minimum):
// - self-adhered chosen, no self-adhered price: NEEDS PRICING naming
//   selfAdheredUnderlaymentPerSquare, as without rolls;
// - self-adhered priced at $90.00/square: live; 3/12 quotes 2040000 cents;
// - two layers (rolls): live; 3/12 quotes 1995000 cents.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../verification/engine-independent/fixtures.mjs';
import {configuredScope} from '../measuredScopeFixtures.mjs';
import {vNextServiceStatus,generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

const roof=(c={},p={})=>{const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:50000},materialCostPerSquare:{asphalt_shingle:30000},tearOffPerSquare:{asphalt_shingle:10000},minimumJob:0,accessoryPricingMode:'per_square_allin',...p},
  {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...c});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};return f;};
const rolls=(c,p,confirm)=>configuredScope(roof(c,{underlaymentPriceBasis:{asphalt_shingle:'cost'},...p}),'roof_underlayment_asphalt_shingle',{mode:'package_cost',productKey:'roof_roll',coverage:500,wastePercent:10},{roof_underlayment_asphalt_shingle:15000},confirm?{roofUnderlaymentScopeConfirmed:true}:{});
const low={pitchBand:'under_four',pitchRisePer12:3};
const total=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;

test('f1501ff #5e: rolls + self-adhered with no self-adhered price is NEEDS PRICING naming the field',()=>{
  const f=rolls(low,{lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'}},false);
  const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(status.status,'NEEDS PRICING');
  assert.ok(status.missingOwnerFields.includes('selfAdheredUnderlaymentPerSquare'),JSON.stringify(status.missingOwnerFields));
  assert.deepEqual(generateQuoteVNext(f).missingOwnerFields,['selfAdheredUnderlaymentPerSquare']);
});
test('f1501ff #5e: priced low-slope roll roofs stay live and quote the hand-checked totals',()=>{
  const self=rolls(low,{lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'},selfAdheredUnderlaymentPerSquare:9000},false);
  assert.equal(vNextServiceStatus(self.ownerPricing,self.businessDefaults).status,'QUOTING LIVE');
  assert.equal(total(generateQuoteVNext(self)),2040000);
  const two=rolls(low,{lowSlopeAssemblyByProduct:{asphalt_shingle:'double_underlayment'}},true);
  assert.equal(vNextServiceStatus(two.ownerPricing,two.businessDefaults).status,'QUOTING LIVE');
  assert.equal(total(generateQuoteVNext(two)),1995000);
});
