import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {CLASS2_DEFINITIONS} from '../server/quote-engine-vnext/contracts.js';
import {scopeDefinitions} from '../server/scopeConfiguration.js';
import {fixture,mowing} from '../verification/engine-independent/fixtures.mjs';
import {configuredScope,measuredScopeCases} from './measuredScopeFixtures.mjs';

// November 21, 2026 (v43). The smaller items from the audits of v41. Every
// expected value below was worked out by hand before the run.
const quote=f=>generateQuoteVNext(f);
const ready=f=>{const q=quote(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.missingCustomerFields,q.invalidCustomerFields]));return q;};
const mid=q=>q.options[0].calculationRecord.scenarios.mid;
const cents=q=>mid(q).finalTotalCents;
const lines=q=>Object.fromEntries(mid(q).lineItems.map(l=>[l.name,l.amountCents]));
const D=f=>f.businessDefaults,O=f=>f.ownerPricing;

// ---- Low-slope roofs with underlayment bought by the roll ----
// 2,000 sq ft, labor 500.00 per square, shingles 300.00 per square with 10% waste, tear-off 100.00 per square.
// Underlayment rolls cover 500 sq ft with 10% waste and cost 150.00 each.
const roofRolls=(c={},p={})=>{const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:50000},materialCostPerSquare:{asphalt_shingle:30000},tearOffPerSquare:{asphalt_shingle:10000},underlaymentPriceBasis:{asphalt_shingle:'cost'},minimumJob:0,accessoryPricingMode:'per_square_allin',...p},
  {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...c});
  O(f).startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  return configuredScope(f,'roof_underlayment_asphalt_shingle',{mode:'package_cost',productKey:'roof_roll',coverage:500,wastePercent:10},{roof_underlayment_asphalt_shingle:15000},{roofUnderlaymentScopeConfirmed:true});};
const low={pitchBand:'under_four',pitchRisePer12:3};
test('a low-slope roof with two underlayment layers buys rolls for twice the roof area',()=>{
  // 5/12: labor 10,000.00 + shingles 22 x 300.00 = 6,600.00 + tear-off 2,000.00 + ceil(2,000 x 1.10 / 500) = 5 rolls = 750.00: 19,350.00.
  assert.equal(cents(ready(roofRolls())),1935000);
  // 3/12, two layers: ceil(4,000 x 1.10 / 500) = ceil(8.8) = 9 rolls = 1,350.00: 19,950.00 (was held for the business).
  let q=ready(roofRolls(low,{lowSlopeAssemblyByProduct:{asphalt_shingle:'double_underlayment'}}));
  assert.equal(cents(q),1995000);assert.equal(lines(q)['Purchased materials: roof_roll'],135000);
  assert.ok(q.priceDrivers.includes('Two underlayment layers for a 3/12 roof'));
  // The area is doubled before rounding to whole rolls: 2,050 sq ft is ceil(4,100 x 1.10 / 500) = ceil(9.02) = 10 rolls, not 2 x 5.
  // Labor 10,250.00 + shingles 22.55 x 300.00 = 6,765.00 + tear-off 2,050.00 + 1,500.00: 20,565.00.
  q=ready(roofRolls({...low,roofSizeInput:2050},{lowSlopeAssemblyByProduct:{asphalt_shingle:'double_underlayment'}}));
  assert.equal(cents(q),2056500);assert.equal(lines(q)['Purchased materials: roof_roll'],150000);
});
test('a low-slope roof with one self-adhered layer buys no regular underlayment rolls',()=>{
  // Self-adhered underlayment 20 squares x 90.00 = 1,800.00 in place of the rolls: 10,000.00 + 6,600.00 + 2,000.00 + 1,800.00 = 20,400.00.
  // v44: the rolls are not bought, so their confirmation is not asked (qeNeonV44_20261122).
  const withoutRolls=f=>{delete f.customerInputs.roofUnderlaymentScopeConfirmed;return f;};
  const q=ready(withoutRolls(roofRolls(low,{lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'},selfAdheredUnderlaymentPerSquare:9000})));
  assert.equal(cents(q),2040000);assert.equal(lines(q)['Self-adhered underlayment'],180000);assert.equal(lines(q)['Purchased materials: roof_roll'],undefined);
  assert.ok(q.priceDrivers.includes('Self-adhered underlayment over the whole roof for a 3/12 roof'));
  // Without its price the owner is asked for it; nothing is guessed.
  const held=quote(withoutRolls(roofRolls(low,{lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'}})));
  assert.equal(held.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(held.missingOwnerFields.includes('selfAdheredUnderlaymentPerSquare'));
});

// ---- "Surcharge" is not a charge category an owner can file a price under ----
test('scope prices cannot be filed under the busy-season line category',()=>{
  const f=structuredClone(measuredScopeCases().find(c=>c.id==='stairs-installed').input);
  assert.deepEqual(scopeDefinitions('FLOORING_INSTALL',O(f).pricing).stairs.fields.category.values,['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead']);
  ready(f);
  O(f).pricing.scopeDetails.stairs.category='surcharge';
  assert.equal(quote(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

// ---- The busy-season note follows each mowing visit's own price ----
const seasonNote=/Priced at the busy-season rate because no work month was given/;
const mow=minimum=>{const f=mowing();delete O(f).peakMonths;delete O(f).peakSurchargePercent;Object.assign(D(f),{peakMonths:[5,6,7,8],peakSurchargePercent:10});O(f).pricing.minimumServiceCharge=minimum;Object.assign(f.customerInputs,{serviceFrequency:'weekly',grassCondition:'overgrown'});delete f.customerInputs.workMonth;return ready(f).options[0];};
const noted=option=>(option.calculationRecord.disclosures||[]).some(n=>seasonNote.test(n));
test('an overgrown first visit carries the busy-season note when its own price is lower off season',()=>{
  // Weekly visit 5,000 sq ft x 0.02 = 100.00 + 10% = 110.00; overgrown first visit 150.00 + 15.00 = 165.00.
  let o=mow(0);
  assert.equal(o.calculationRecord.scenarios.mid.finalTotalCents,11000);assert.equal(o.firstVisit.calculationRecord.scenarios.mid.finalTotalCents,16500);
  assert.ok(noted(o));assert.ok(noted(o.firstVisit));
  // Minimum 120.00: the regular visit is 120.00 in and out of season (no note); the first visit is 165.00 against 150.00 (note).
  o=mow(12000);
  assert.equal(o.calculationRecord.scenarios.mid.finalTotalCents,12000);assert.equal(o.firstVisit.calculationRecord.scenarios.mid.finalTotalCents,16500);
  assert.ok(!noted(o));assert.ok(noted(o.firstVisit));
  // Minimum 400.00: both visits are 400.00 either way, so neither carries the note.
  o=mow(40000);
  assert.equal(o.firstVisit.calculationRecord.scenarios.mid.finalTotalCents,40000);
  assert.ok(!noted(o));assert.ok(!noted(o.firstVisit));
});

// ---- Herringbone and chevron starting waste ----
test('herringbone and chevron have their own starting waste; diagonal is unchanged',()=>{
  const defs=CLASS2_DEFINITIONS.FLOORING_INSTALL;
  assert.deepEqual(defs.diagonalWasteAdderByType.defaultValue??defs.diagonalWasteAdderByType.value??defs.diagonalWasteAdderByType.starting,{laminate:0.06,vinyl_plank:0.04,hardwood:0.07,tile:0.03});
  assert.deepEqual(defs.herringboneWasteAdderByType.defaultValue??defs.herringboneWasteAdderByType.value??defs.herringboneWasteAdderByType.starting,{laminate:0.07,vinyl_plank:0.07,hardwood:0.07,tile:0.03});
  assert.deepEqual(CLASS2_DEFINITIONS.FLOORING_REPLACEMENT.herringboneWasteAdderByType,defs.herringboneWasteAdderByType);
});

// ---- One ceiling line for rooms of one height ----
test('rooms with different wall coats share one ceiling labor line',()=>{
  // Two 12 x 12 x 8 ft rooms, one door and one window each: walls 384 - 35 = 349 sq ft paint, 384 labor each.
  // Ceilings 144 sq ft each, one coat at 0.60: 86.40 each, 172.80 on one line (was two lines of 86.40).
  const room=coats=>({lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:1,coats});
  const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:75,materialPerWallSqftPerCoat:20,ceilingLaborPerSqftPerCoat:60,ceilingMaterialPerSqftPerCoat:20,trimLaborPerLF:150,trimMaterialPerLF:25,minimumJob:0},
    {areaInputMethod:'room_dimensions',rooms:[room(2),room(3)],wallHeight:'standard',surfaceCondition:'good',coats:2,ceilingsIncluded:true,ceilingCoats:1,ceilingSurfaceCondition:'good',trimIncluded:false});
  O(f).priceBasisByCategory.material='sell_price';
  const q=ready(f),ceiling=mid(q).lineItems.filter(l=>l.name==='Ceiling labor');
  assert.equal(ceiling.length,1);assert.equal(ceiling[0].amountCents,17280);
  // The total is the same as with two lines: 2,060.06.
  assert.equal(cents(q),206006);
  // Wall labor still follows each room's own coats: two lines.
  assert.equal(mid(q).lineItems.filter(l=>l.name==='Wall labor').length,2);
});
