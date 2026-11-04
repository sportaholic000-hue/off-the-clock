import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {fixture,flooring,concrete,siding} from '../verification/engine-independent/fixtures.mjs';
import {synchronizeDependentLinesVNext,roofFlashingVentDefinitionVNext} from '../server/quote-engine-vnext/priceGroundwork.js';
import {carpet} from './quoteFlooring20261016Fixture.mjs';
import {normalizePostalCode,isValidCustomerPostalCode,matchTravelZone} from '../server/travelZones.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {vNextServiceStatus} from '../server/quote-engine-vnext/priceBook.js';

// Accuracy fixes of October 29, 2026. Every expected value below was worked
// out by hand, from the trade or tax rule named beside it, before the run.
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const line=(q,name)=>(q.options?.[0]?.lineItems||[]).find(l=>l.name===name);
const CATEGORIES=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const taxEvery=(f,mode,percent,taxable)=>{
  f.businessDefaults.taxMode=mode;f.businessDefaults.taxPercent=percent;
  f.ownerPricing.taxabilityByCategory=Object.fromEntries(CATEGORIES.map(c=>[c,taxable.includes(c)]));
  return f;
};

test('a minimum-charge top-up is taxed exactly like labor under materials-only tax',()=>{
  // 200 sq ft tile: labor 200 x 3.00 x 1.10 (medium room) = 660.00; material
  // 200 x 1.12 x 5.00 = 1,120.00. Minimum 10,000.00 adds 8,220.00.
  // Materials-only tax 15%, labor untaxed: 15% x 1,120.00 = 168.00 -> 10,168.00.
  let f=taxEvery(flooring('tile',200),'TAX_MATERIALS',15,['material']);f.ownerPricing.pricing.minimumJob=1000000;
  let q=generateQuoteVNext(f);
  assert.equal(line(q,'Minimum price adjustment').amountCents,822000);
  assert.equal(line(q,'Minimum price adjustment').taxable,false);
  assert.equal(cents(q),1016800);
  // Labor taxable too: the top-up is a charge for the work, so it is taxed like
  // labor and the whole 10,000.00 is taxed: 15% = 1,500.00 -> 11,500.00.
  f=taxEvery(flooring('tile',200),'TAX_MATERIALS',15,['material','labor']);f.ownerPricing.pricing.minimumJob=1000000;
  q=generateQuoteVNext(f);
  assert.equal(line(q,'Minimum price adjustment').taxable,true);
  assert.equal(cents(q),1150000);
  // Whole-job tax is unchanged: 15% x 10,000.00.
  f=taxEvery(flooring('tile',200),'TAX_ALL',15,[]);f.ownerPricing.pricing.minimumJob=1000000;
  assert.equal(cents(generateQuoteVNext(f)),1150000);
});

function roof(customer={},pricing={},adopted=true){
  const f=fixture('ROOFING_REPLACEMENT',{
    laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},
    tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:1000},
    underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},bundlesPerSquare:{asphalt_shingle:3},
    disposalPerSquare:2000,accessoryPricingMode:'per_square_allin',minimumJob:0,...pricing
  },{roofSizeMethod:'footprint',roofSizeInput:1500,pitchRisePer12:6,existingRoofType:'asphalt_shingle',
    replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,
    roofComplexity:'simple',serviceScope:'full',...customer});
  if(adopted){f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
    Object.assign(f.ownerPricing.pricing,{pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70});}
  return f;
}

test('installed roof decking is a selling price and is never marked up',()=>{
  // 1,500 sq ft footprint at 6/12: 1,500 x sqrt(1.25) = 1,677.05 sq ft = 16.7705 squares.
  // Labor 335,410; field material 18.6667 squares x 15,000 = 280,000; tear-off 100,623;
  // underlayment 16,771 (installed sell price); disposal 33,541; three installed sheets 27,000.
  // 20% markup only on the cost lines: (335,410 + 280,000 + 100,623 + 33,541) x 20% = 149,914.80 -> 149,915.
  const f=roof({deckingSheets:3},{deckingPerSheet:9000,deckingPriceBasis:'installed',installedLaborPercent:{deckingPerSheet:60},installedMaterialsPercent:{deckingPerSheet:40}});
  f.businessDefaults.markupPercent=20;
  const q=generateQuoteVNext(f);
  assert.equal(line(q,'Markup').amountCents,149915);
  assert.equal(cents(q),943260);
  // Material-only decking stays the owner's material cost and is marked up with it: 27,000 x 20% = 5,400 more.
  const g=roof({deckingSheets:3},{deckingPerSheet:9000,deckingPriceBasis:'material_only'});
  g.businessDefaults.markupPercent=20;
  assert.equal(line(generateQuoteVNext(g),'Markup').amountCents,155315);
});

function customJob({classification='addon',share,basis={},month=7}={}){
  const f=fixture('CUSTOM',{customPricingMode:'fixed',customChargeClassification:classification,price:100000,unit:'flat',minimumJob:0,...(share===undefined?{}:{installedMaterialsPercent:{price:share}})},{service:'[SYNTHETIC] Fixed service',serviceConfirmed:true,unit:'flat',workMonth:month===7?'july':'january'});
  f.ownerPricing.service=f.customerInputs.service;
  f.ownerPricing.priceBasisByCategory={...Object.fromEntries(CATEGORIES.map(c=>[c,'cost'])),addon:'sell_price',...basis};
  f.ownerPricing.peakMonths=[7];f.ownerPricing.peakSurchargePercent=10;f.currentMonth=month;
  f.businessDefaults.markupPercent=20;
  return f;
}
test('a custom materials share splits the price for tax and the busy season, never adds markup',()=>{
  // $1,000 add-on selling price. No share, July: no labor is known, so no busy-season charge: 1,000.00.
  assert.equal(cents(generateQuoteVNext(customJob())),100000);
  // 40% materials share: labor 600.00 + materials 400.00 stay selling prices; July adds
  // 10% of the 600.00 labor = 60.00, also a selling price. No markup: 1,060.00.
  const q=generateQuoteVNext(customJob({share:40}));
  assert.equal(line(q,'Markup'),undefined);
  assert.equal(cents(q),106000);
  // January: 1,000.00.
  assert.equal(cents(generateQuoteVNext(customJob({share:40,month:1}))),100000);
  // Classified as labor at cost: the owner's price is his cost. Split 600 + 400 at cost,
  // busy season 60 follows the surcharge setting (cost); 20% markup on 1,060 = 212 -> 1,272.00.
  assert.equal(cents(generateQuoteVNext(customJob({classification:'labor',share:40}))),127200);
});

test('the split custom quote and the decking quote pass the customer check unchanged',()=>{
  for(const f of [customJob({share:40}),customJob({classification:'labor',share:40}),roof({deckingSheets:3},{deckingPerSheet:9000,deckingPriceBasis:'installed',installedLaborPercent:{deckingPerSheet:60},installedMaterialsPercent:{deckingPerSheet:40}})]){
    const q=generateQuoteVNext(f),c=sanitizeForCustomerVNext(q);
    assert.equal(c.resultType,'INSTANT_ESTIMATE_READY');
    assert.equal(c.midEstimate,q.midEstimate);
  }
});

test('custom split parts are taxed like their category',()=>{
  // Materials-only tax 8%, labor and materials both taxed: 600 + 400 = 1,000 and the July 60.00
  // busy-season charge on labor are taxed like labor: 8% x 1,060 = 84.80 -> 1,144.80.
  const f=customJob({share:40});taxEvery(f,'TAX_MATERIALS',8,['labor','material']);
  assert.equal(cents(generateQuoteVNext(f)),114480);
  // Only materials taxed: 8% x 400 = 32.00 -> 1,092.00.
  const g=customJob({share:40});taxEvery(g,'TAX_MATERIALS',8,['material']);
  assert.equal(cents(generateQuoteVNext(g)),109200);
});

function flashingRoof(pricing={}){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:1},tearOffPerSquare:{asphalt_shingle:6000},
    underlaymentPerSquare:{asphalt_shingle:1},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:2000,minimumJob:0,
    accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories_flashing_vents',iceWaterBarrierUnit:'linear_feet',iceWaterBarrierPerLF:400,
    valleyPerLF:600,stepFlashingPerLF:800,pipeJackEach:4500,ridgeVentPerLF:900,...pricing},
   {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'area_by_pitch',pitchAreaUpTo6Sqft:2000,
    stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',iceWaterBarrierLengthLF:0,valleyLengthLF:40,stepFlashingLengthLF:30,pipeJackCount:3,ridgeVentLengthLF:0,
    starterLengthLF:0,dripEdgeLengthLF:0,ridgeCapLengthLF:0,workMonth:'july'});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  Object.assign(f.ownerPricing.pricing,{pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70});
  const dependent=roofFlashingVentDefinitionVNext('asphalt_shingle');
  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,[dependent],{ownerId:f.ownerPricing.origin.ownerId,reenteredIds:[dependent.id],confirmIds:[dependent.id],now:'2026-10-29T12:00:00.000Z'});
  taxEvery(f,'TAX_MATERIALS',13,['material']);
  f.ownerPricing.peakMonths=[7];f.ownerPricing.peakSurchargePercent=10;f.currentMonth=7;
  return f;
}
const FLASHING_SHARES={installedLaborPercent:{'underlaymentPerSquare.asphalt_shingle':0,valleyPerLF:70,stepFlashingPerLF:70,pipeJackEach:70},
  installedMaterialsPercent:{'underlaymentPerSquare.asphalt_shingle':100,valleyPerLF:30,stepFlashingPerLF:30,pipeJackEach:30}};
test('roof flashing and vent work is an installed selling price: tax on its materials, busy season on its labor',()=>{
  // 20 squares. Valley 40 LF x 6 = 240.00, step flashing 30 LF x 8 = 240.00, pipe jacks 3 x 45 = 135.00:
  // 615.00 of installed work at 70% labor / 30% materials.
  // Busy season 10%: roofing labor 4,000 + tear-off 1,200 = 520.00, plus 10% of 430.50 installed labor = 43.05.
  // Materials-only tax 13%: field material 0.22 + underlayment 0.20 + 30% of 615.00 = 184.92 -> 24.04.
  // 4,000 + 0.22 + 1,200 + 0.20 + 615.00 + 400 disposal = 6,215.42; + 563.05 + 24.04 = 6,802.51.
  const q=generateQuoteVNext(flashingRoof(FLASHING_SHARES));
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.invalidOwnerFields,q.unsupportedOwnerFields,q.validationMessages]));
  assert.equal(line(q,'Peak season adjustment on installed prices').amountCents,4305);
  assert.equal(line(q,'Tax').amountCents,2404);
  assert.equal(cents(q),680251);
  for(const name of ['Valley preparation','Step flashing','Pipe jacks'])assert.equal(line(q,name).calculation.effectivePriceBasis,'sell_price');
  assert.equal(sanitizeForCustomerVNext(q).midEstimate,q.midEstimate);
});
test('materials-only tax needs the materials share of each priced flashing item, like installed underlayment',()=>{
  const q=generateQuoteVNext(flashingRoof({installedLaborPercent:{'underlaymentPerSquare.asphalt_shingle':0},installedMaterialsPercent:{'underlaymentPerSquare.asphalt_shingle':100}}));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(q.missingOwnerFields.includes('installedMaterialsPercent.valleyPerLF'));
});

// Roof slope rules follow the owner's building code and product type (IRC R905,
// NBC Table 9.26.3.1), never the product's name. 20 squares at labor 200.00,
// material 150.00 with 10% waste, tear-off 60.00, underlayment 20.00 and
// disposal 30.00: 4,000 + 3,300 + 1,200 + 400 + 600 = 9,500.00.
function slopeRoof(customer={},pricing={},product='asphalt_shingle'){
  const p=Object.fromEntries(Object.entries({laborPerSquare:20000,materialCostPerSquare:15000,tearOffPerSquare:6000,underlaymentPerSquare:2000,underlaymentPriceBasis:'installed_area_sell_price'}).map(([k,v])=>[k,{[product]:v}]));
  const f=fixture('ROOFING_REPLACEMENT',{...p,disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70,...pricing},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:product,replacementRoofType:product,pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer});
  for(const [k,v] of Object.entries(pricing))if(v===undefined)delete f.ownerPricing.pricing[k];
  for(const [k,v] of Object.entries(customer))if(v===undefined)delete f.customerInputs[k];
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  // Register the product as an offering the customer can name.
  const facts={};
  for(const field of ['existingRoofType','replacementRoofType']){const id=randomUUID();f.ownerPricing.knownOfferings[field]={...f.ownerPricing.knownOfferings[field],[product]:id};facts[field]={status:'identified',field,value:product,offeringId:id};}
  f.customerInputs.confirmedFacts={...f.customerInputs.confirmedFacts,...facts};
  return f;
}
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.invalidOwnerFields]));assert.equal(sanitizeForCustomerVNext(q).resultType,'INSTANT_ESTIMATE_READY');return q;};
const review=(f,pattern)=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');if(pattern)assert.match(q.reviewReason,pattern);return q;};
test('a roofing product is checked by the type the owner gives it, never by its name',()=>{
  const name='gaf_timberline_hdz';
  // Unclassified: the owner is asked for the type before it quotes.
  const unclassified=slopeRoof({},{},name);delete unclassified.ownerPricing.pricing.roofProductClass;
  assert.ok(generateQuoteVNext(unclassified).missingOwnerFields.includes('roofProductClass.'+name));
  review(slopeRoof({pitchRisePer12:1},{},name),/Asphalt shingles are installed only on roofs of 2\/12 or steeper/);
  // Stone-coated steel is a metal shingle: 3/12 (IRC R905.4.2, DECRA), single underlayment.
  const steel=(rise,pricing={})=>slopeRoof({pitchBand:'under_four',pitchRisePer12:rise},{roofProductClass:{stone_coated_steel_tile:'metal_shingle'},...pricing},'stone_coated_steel_tile');
  review(steel(2.5),/Metal shingles and stone-coated steel are installed only on roofs of 3\/12 or steeper/);
  assert.equal(cents(ready(steel(3))),950000);
  // A manufacturer minimum above the code governs: 3.5/12 entered, so 3/12 goes to review.
  review(steel(3,{roofProductMinSlope:{stone_coated_steel_tile:3.5}}),/3\.5\/12 or steeper/);
});
test('Canadian roofs use NBC Table 9.26.3.1 minimums; US roofs use IRC R905',()=>{
  const slate=(code,customer)=>slopeRoof(customer,{roofBuildingCode:code,roofProductClass:{slate:'slate'}},'slate');
  // Slate: NBC 1 in 2 (6/12), IRC 4/12.
  review(slate('nbc',{pitchRisePer12:5}),/Slate is installed only on roofs of 6\/12 or steeper/);
  review(slate('nbc',{}),/6\/12 or steeper. The business will confirm/);
  assert.equal(generateQuoteVNext(slate('nbc',{pitchBand:'seven_to_nine'})).resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(cents(ready(slate('irc',{pitchRisePer12:4}))),950000);
  // Clay tile: NBC 6/12; IRC 2.5/12 with two underlayment layers below 4/12 (+ 400.00).
  const clay=(code,rise)=>slopeRoof({pitchBand:rise<4?'under_four':'up_to_six',pitchRisePer12:rise},{roofBuildingCode:code,roofProductClass:{clay:'clay_tile'}},'clay');
  review(clay('nbc',5),/Clay tile is installed only on roofs of 6\/12/);
  assert.equal(cents(ready(clay('irc',3))),990000);
  // Wood shakes: NBC 1 in 3 (4/12), IRC 3/12.
  const shake=code=>slopeRoof({pitchBand:'under_four',pitchRisePer12:3.5},{roofBuildingCode:code,roofProductClass:{shake:'wood_shake'}},'shake');
  review(shake('nbc'),/Wood shakes are installed only on roofs of 4\/12/);
  assert.equal(cents(ready(shake('irc'))),950000);
  // Concrete tile under NBC follows the manufacturer (CSA A220): asked for.
  assert.ok(generateQuoteVNext(slopeRoof({},{roofBuildingCode:'nbc',roofProductClass:{tile:'concrete_tile'}},'tile')).missingOwnerFields.includes('roofProductMinSlope.tile'));
  // Standing seam: IRC 1/4:12; NBC profiled metal 1 in 4 unless the manufacturer's low-slope system allows less.
  const seam=(code,pricing={})=>slopeRoof({pitchBand:'under_four',pitchRisePer12:1},{roofBuildingCode:code,roofProductClass:{seam:'standing_seam_metal'},...pricing},'seam');
  assert.equal(cents(ready(seam('irc'))),950000);
  review(seam('nbc'),/3\/12 or steeper/);
  assert.equal(cents(ready(seam('nbc',{roofProductMinSlope:{seam:0.5}}))),950000);
});
test('low-slope shingles from 2/12 to under 4/12 are priced by the owner\'s method',()=>{
  const low=(pricing={})=>slopeRoof({pitchBand:'under_four',pitchRisePer12:3},pricing);
  // No method chosen: the owner is asked.
  assert.deepEqual(review(low({lowSlopeAssembly:undefined})).missingOwnerFields,['lowSlopeAssembly']);
  // Two underlayment layers: + 20 x 20.00 = 400.00.
  assert.equal(cents(ready(low({lowSlopeAssembly:'double_underlayment'}))),990000);
  // One self-adhered layer at 45.00 installed replaces the 400.00 underlayment: 9,500 - 400 + 900 = 10,000.00.
  const sa=ready(low({lowSlopeAssembly:'self_adhered_underlayment',selfAdheredUnderlaymentPerSquare:4500}));
  assert.equal(cents(sa),1000000);assert.equal(line(sa,'Underlayment'),undefined);assert.equal(line(sa,'Self-adhered underlayment').amountCents,90000);
  assert.deepEqual(review(low({lowSlopeAssembly:'self_adhered_underlayment'})).missingOwnerFields,['selfAdheredUnderlaymentPerSquare']);
  // NBC 9.26.8: the factor applies to shingles alone. Field material stays
  // 20 x 1.10 = 22 squares x 150 (all-in, with accessories) = 3,300; extra
  // shingles 20 x 1.5 x 1.10 = 33 - 22 = 11 squares x 100 (shingles only) = 1,100;
  // cement 20 x 12 = 240; labor 20 x 30 = 600; one underlayment layer.
  // 4,000 + 3,300 + 1,100 + 1,200 + 400 + 600 + 240 + 600 = 11,440.00.
  const nbc=ready(low({roofBuildingCode:'nbc',lowSlopeAssembly:undefined,nbcLowSlopeShingleFactor:1.5,nbcLowSlopeShingleMaterialPerSquare:10000,nbcLowSlopeCementPerSquare:1200,nbcLowSlopeLaborPerSquare:3000}));
  assert.equal(cents(nbc),1144000);assert.equal(line(nbc,'Low-slope second underlayment layer'),undefined);
  assert.equal(line(nbc,'Field materials').calculation.quantity,22);
  assert.equal(line(nbc,'Low-slope extra shingles').calculation.quantity,11);
  assert.deepEqual(review(low({roofBuildingCode:'nbc'})).missingOwnerFields.sort(),['nbcLowSlopeCementPerSquare','nbcLowSlopeLaborPerSquare','nbcLowSlopeShingleFactor','nbcLowSlopeShingleMaterialPerSquare']);
  review(slopeRoof({pitchBand:'under_four',pitchRisePer12:1.5},{roofBuildingCode:'nbc'}),/2\/12 or steeper/);
});
test('older roofing services check slope too: a "low" pitch goes to review',()=>{
  const legacy=pitch=>{const f=slopeRoof({pitch,pitchMethod:undefined,pitchBand:undefined},{pitchMultiplier:{low:1,medium:1,steep:1,very_steep:1}});delete f.ownerPricing.startingValueAdoptions;return f;};
  review(legacy('low'),/below 4\/12/);
  assert.equal(generateQuoteVNext(legacy('medium')).resultType,'INSTANT_ESTIMATE_READY');
  const slate=legacy('medium');Object.assign(slate.ownerPricing.pricing,{roofBuildingCode:'nbc',roofProductClass:{asphalt_shingle:'slate'}});
  review(slate,/Slate is installed only on roofs of 6\/12/);
});
test('eave protection the owner requires is never quoted at zero, except where the code exempts it',()=>{
  const shares={installedLaborPercent:{...FLASHING_SHARES.installedLaborPercent,iceWaterBarrierPerLF:50},installedMaterialsPercent:{...FLASHING_SHARES.installedMaterialsPercent,iceWaterBarrierPerLF:50}};
  const eave=(pricing={},customer={})=>{const f=flashingRoof({...shares,eaveProtectionRequired:'yes',...pricing});Object.assign(f.customerInputs,customer);for(const [k,v] of Object.entries(customer))if(v===undefined)delete f.customerInputs[k];return f;};
  review(eave(),/Eave protection \(ice and water barrier\) is required on this roof/);
  assert.equal(line(ready(eave({},{iceWaterBarrierLengthLF:100})),'Ice and water barrier').amountCents,40000);
  // NBC 9.26.5.1(2)(d): none needed at 1 in 1.5 (8/12) or steeper; the IRC has no slope exemption.
  const steep={pitchMethod:'whole_roof',pitchBand:'ten_to_twelve',pitchAreaUpTo6Sqft:undefined};
  assert.equal(generateQuoteVNext(eave({roofBuildingCode:'nbc'},steep)).resultType,'INSTANT_ESTIMATE_READY');
  review(eave({roofBuildingCode:'irc'},steep),/Eave protection/);
  // The decision itself is required once the barrier is priced separately.
  assert.ok(generateQuoteVNext(eave({eaveProtectionRequired:undefined})).missingOwnerFields.includes('eaveProtectionRequired'));
});
test('a roofing service goes live only once its slope decisions are made',()=>{
  const status=f=>vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  const f=slopeRoof();delete f.ownerPricing.pricing.lowSlopeAssembly;
  let s=status(f);assert.equal(s.status,'NEEDS PRICING');assert.ok(s.missingOwnerFields.includes('lowSlopeAssembly'));
  f.ownerPricing.pricing.lowSlopeAssembly='double_underlayment';assert.equal(status(f).status,'QUOTING LIVE');
  delete f.ownerPricing.pricing.roofBuildingCode;s=status(f);assert.ok(s.missingOwnerFields.includes('roofBuildingCode'));
  // Slate in Canada still goes live: roofs below 6/12 go to review by design.
  const slate=slopeRoof({},{roofBuildingCode:'nbc',roofProductClass:{slate:'slate'}},'slate');
  assert.equal(status(slate).status,'QUOTING LIVE');
});

// Carpet: a 15 x 15 room on a 12 ft roll. Cut length 15 + 0.5 trim = 15.5 ft; 15.5 ft across
// needs 2 roll widths: 2 x 12 x 15.5 = 372 sq ft. With crossgrain fills: one full width
// (12 x 15.5 = 186) plus a 3.5 ft fill cut 3 strips from one 5.5 ft cut (12 x 5.5 = 66): 252 sq ft.
// Labor 225 sq ft x 3.00 x 1.10 (medium room) = 742.50; carpet 3.00 per sq ft; pad (carpet
// underlayment) 0.01 per measured sq ft = 2.25.
const carpetRoom=(pricing={},rooms=[{lengthFt:15,widthFt:15}])=>{const f=carpet(rooms);Object.assign(f.ownerPricing.pricing,pricing);return f;};
test('carpet seams run the length of the room unless the owner allows crossgrain fills (CRI 105)',()=>{
  let q=ready(carpetRoom());
  assert.equal(line(q,'Flooring materials').calculation.quantity,372);assert.equal(cents(q),186075);
  q=ready(carpetRoom({carpetCrossgrainSeams:'allowed'}));
  assert.equal(line(q,'Flooring materials').calculation.quantity,252);assert.equal(cents(q),150075);
});
test('carpet can be priced per square yard, converted exactly',()=>{
  // 27.00 per square yard is 3.00 per square foot: 25 yd of labor, 41.33 yd of carpet.
  const yd=ready(carpetRoom({carpetPriceUnit:'square_yard',laborPerSqft:{carpet:2700},materialPerSqft:{carpet:2700}}));
  assert.equal(cents(yd),186075);assert.equal(line(yd,'Flooring labor').calculation.quantity,25);
  assert.equal(line(yd,'Flooring materials').amountCents,111600);
});
test('measured rooms each take their own labor size band',()=>{
  // 5 x 8 bathroom (40 sq ft, small 1.20) = 48; 20 x 20 room (400 sq ft, large 1.00) = 400, above its
  // floors of 150 x 1.20 = 180 and 300 x 1.10 = 330. 448 x 3.00 = 1,344.00. (Averaging the two rooms
  // as 220 sq ft medium would charge 440 x 1.10 x 3.00 = 1,452.00.)
  const q=ready(carpetRoom({},[{lengthFt:5,widthFt:8},{lengthFt:20,widthFt:20}]));
  assert.equal(line(q,'Flooring labor').amountCents,134400);
});
test('floor leveling states the depth its price covers; floating floors over an old floor carry the manufacturer check',()=>{
  const level=pricing=>{const f=flooring('tile',200);Object.assign(f.ownerPricing.pricing,{floorLevelingPerSqft:200,...pricing});Object.assign(f.customerInputs,{floorLevelingNeeded:true,floorLevelingSqft:50});return f;};
  assert.deepEqual(review(level()).missingOwnerFields,['floorLevelingMaxDepthInches']);
  assert.match(ready(level({floorLevelingMaxDepthInches:0.25})).disclaimer,/Floor leveling is priced for up to 0\.25 inches of depth; deeper leveling is confirmed on site/);
  const over=flooring('vinyl_plank',200);over.ownerPricing.pricing.vinylPlankInstallMethod='floating';
  over.customerInputs=confirmedFixtureInputs({...over.customerInputs,existingFloorType:'tile',removalNeeded:false,existingFloorSound:'yes'});
  assert.match(ready(over).disclaimer,/manufacturer's flatness and moisture limits are confirmed on site/);
  // The customer's Not sure is a site check, not missing pricing.
  over.customerInputs.existingFloorSound='not_sure';
  const unsure=review(over,/on-site check/);assert.deepEqual(unsure.missingOwnerFields,[]);assert.deepEqual(unsure.ownerDecisionRequired,[]);
});
test('removing more floor than is installed is priced on the measured removal area',()=>{
  // 200 sq ft of new tile; 250 sq ft of old vinyl out at 1.00 = 250.00.
  const f=flooring('tile',200);f.ownerPricing.pricing.removalPerSqft={vinyl:100};
  f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:'vinyl',removalNeeded:true,removalAreaSqft:250});
  assert.equal(line(ready(f),'Existing flooring removal').amountCents,25000);
});
test('siding area follows the convention the owner set the rate on',()=>{
  // 160 ft perimeter x 10 ft = 1,600 sq ft; 2 doors (40), 10 windows (150), one 16 x 7 garage door (112).
  const wall=convention=>{const f=siding();f.ownerPricing.pricing.sidingSettings={areaConventionByType:{vinyl:convention}};
    delete f.customerInputs.sidingAreaSqft;Object.assign(f.customerInputs,{areaInputMethod:'building_dimensions',gables:[],buildingPerimeterFeet:160,wallHeightFeet:10,doorCount:2,windowCount:10,garageDoorCount:1,garageDoorWidthFeet:16,garageDoorHeightFeet:7});
    return line(ready(f),'Siding labor').calculation.quantity;};
  assert.equal(wall('openings_left_in'),1600);
  assert.equal(wall('large_openings_subtracted'),1488);
  assert.equal(wall('openings_subtracted'),1298);
});

test('panel fences are priced per panel, one for each bay between posts',()=>{
  // 8 ft post spacing. A run of 20 ft and 13 ft sections at a corner: ceil(20/8) + ceil(13/8) = 3 + 2
  // = 5 panels at 90.00 = 450.00. Posts: line (3 - 1) + (2 - 1) = 3, terminal 2 ends + 1 corner = 3;
  // 6 posts x (20 + 4 + 6) = 180.00. Labor 33 ft x 10.00 = 330.00. Total 960.00.
  const panels=customer=>{const f=offeringFixture('FENCING_INSTALL','itemized');const p=f.ownerPricing.pricing;
    p.offeringDetails={...p.offeringDetails,infillPricing:'per_panel'};delete p.offeringRates.fenceMaterialPerLF;p.offeringRates.fencePanelEach=9000;
    f.customerInputs=confirmedFixtureInputs({fenceType:'wood',fenceHeight:6,terrainSlope:'flat',...customer});return f;};
  const measured=ready(panels({fenceRunCount:1,fenceRuns:[{closed:false,sections:[{lengthLF:20},{lengthLF:13}]}]}));
  assert.equal(line(measured,'Fence panels').calculation.quantity,5);assert.equal(cents(measured),96000);
  assert.equal(line(measured,'Fence infill materials'),undefined);
  // From a 33 ft total with one corner, sections are unknown: ceil(33/8) - 1 = 4 line spans + 1 corner + 1 run = 6 panels.
  const total=ready(panels({linearFeet:33,lfMethod:'exact',cornerCount:1,gates:{walk:0}}));
  assert.equal(line(total,'Fence panels').calculation.quantity,6);
  // Panels are priced only by an itemized offering.
  const installed=offeringFixture('FENCING_INSTALL','installed');installed.ownerPricing.pricing.offeringDetails.infillPricing='per_panel';
  assert.equal(generateQuoteVNext(installed).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('postal codes: Canada Post letters only, a hyphen accepted, and a partial code never picks a cheaper zone',()=>{
  assert.equal(normalizePostalCode('k1a-0b1'),'K1A0B1');assert.equal(isValidCustomerPostalCode('K1A-0B1'),true);
  // D, F, I, O, Q and U are never used; W and Z never start a code.
  for(const code of ['D1A 1A1','K1A 0U1','K1O 0B1','W1A 1A1','Z1A 1A1'])assert.equal(isValidCustomerPostalCode(code),false,code);
  for(const code of ['X0A 0H0','Y1A 1A1','E2L 4L1','04101','04101-1234'])assert.equal(isValidCustomerPostalCode(code),true,code);
  const zones=[{name:'Core',codes:['E2L'],charge:1000},{name:'Uptown',codes:['E2L1A1'],charge:10000}];
  assert.equal(matchTravelZone('E2L',zones).status,'invalid');assert.match(matchTravelZone('E2L',zones).message,/full postal code/);
  assert.equal(matchTravelZone('E2L 4L1',zones).charge,1000);assert.equal(matchTravelZone('e2l-1a1',zones).charge,10000);
  // The same charge everywhere in the area: the 3-character answer is enough.
  assert.equal(matchTravelZone('E2L',[{name:'Core',codes:['E2L','E2L1A1'],charge:1000}]).charge,1000);
});

const customerQuote=f=>{const q=generateQuoteVNext(f);return {q,c:sanitizeForCustomerVNext(q)};};
test('concrete owner defaults reach the customer: blank or stale answers still get the owner-spec quote',()=>{
  // 20 x 10 slab, 60 LF form, base included. At 6 in: 200 x 6/324 x 1.10 = 4.0741 yd x 180 = 733.33;
  // labor 1,200 + forms 1,500 + base 350 = 3,783.33. At 4 in: 488.89 -> 3,538.89.
  const withDefault=(field,value,drop)=>{const f=concrete();f.ownerPricing.pricing[field]=value;if(drop)delete f.customerInputs[drop];return f;};
  for(const [f,expected] of [
    [withDefault('defaultSlabThicknessInches',6,'thickness'),3783.33],
    [(()=>{const f=withDefault('defaultSlabThicknessInches',6);f.customerInputs.thickness=4;return f;})(),3783.33],
    [withDefault('defaultReinforcement','none','reinforcement'),3538.89],
    [withDefault('newSlabBase','included','baseNeeded'),3538.89]
  ]){
    const {q,c}=customerQuote(f);
    assert.equal(q.midEstimate,expected);
    assert.equal(c.resultType,'INSTANT_ESTIMATE_READY');
    assert.equal(c.midEstimate,expected);
  }
});

function slabJob(customer={},pricing={}){
  const f=concrete();Object.assign(f.ownerPricing.pricing,pricing);
  for(const [k,v] of Object.entries(customer)){if(v===undefined)delete f.customerInputs[k];else f.customerInputs[k]=v;}
  return f;
}
const outline=points=>({dimensionMethod:'measured_outline',length:undefined,width:undefined,outlinePoints:[...points,points[0]]});
const sawCut={controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:150};
test('a blank chute answer is priced and disclosed as Not sure',()=>{
  // 20 x 10 x 4 in slab: 3,538.89. With a 500.00 pump allowance for Not sure: 4,038.89.
  let q=generateQuoteVNext(slabJob({chuteAccess:undefined},{placementFlat:{pump:50000},uncertainPlacementMethod:'pump'}));
  assert.equal(q.midEstimate,4038.89);assert.match(q.disclaimer,/Concrete placement is an allowance/);
  // No placement priced: same as the chute price, with the extra-placement note.
  q=generateQuoteVNext(slabJob({chuteAccess:undefined}));
  assert.equal(q.midEstimate,3538.89);assert.match(q.disclaimer,/Placement other than the truck chute would be extra/);
  assert.equal(generateQuoteVNext(slabJob({chuteAccess:'yes'})).disclaimer.includes('truck chute'),false);
});
test('slabs under 1 ft wide go to review, and no outline can stall the joint layout',()=>{
  const narrow=/narrower than 1 foot/;
  assert.match(generateQuoteVNext(slabJob({length:100,width:0.5})).reviewReason,narrow);
  const start=Date.now();
  assert.match(generateQuoteVNext(slabJob(outline([{x:0,y:0},{x:100000,y:0},{x:100000,y:0.00001},{x:0,y:0.00001}]),sawCut)).reviewReason,narrow);
  assert.match(generateQuoteVNext(slabJob(outline([{x:0,y:0},{x:100,y:0},{x:100,y:0.01},{x:0,y:0.01}]),sawCut)).reviewReason,narrow);
  assert.ok(Date.now()-start<2000);
  // A 1 ft x 100 ft strip quotes; panels at most 1.5 ft long: ceil(200/3) = 67 panels, 66 cuts x 1 ft = 66 LF.
  assert.equal(line(generateQuoteVNext(slabJob({length:100,width:1},sawCut)),'Saw-cut control joints').calculation.quantity,66);
});
test('joints on L- and U-shaped slabs follow the outline: a joint from each inside corner, then the panel rule',()=>{
  const cut=points=>line(generateQuoteVNext(slabJob(outline(points),sawCut)),'Saw-cut control joints')?.calculation.quantity;
  // 8 x 8 L with a 4 x 4 corner out: one 4 ft joint from the inside corner, and the 8 x 4 leg
  // split into two 4 x 4 panels by a 4 ft joint: 8 LF.
  assert.equal(cut([{x:0,y:0},{x:8,y:0},{x:8,y:4},{x:4,y:4},{x:4,y:8},{x:0,y:8}]),8);
  // 30 x 30 L with 10 ft legs: inside-corner joint 10 ft; 30 x 10 leg in three panels, 20 ft;
  // 10 x 20 leg in two panels, 10 ft: 40 LF.
  assert.equal(cut([{x:0,y:0},{x:30,y:0},{x:30,y:10},{x:10,y:10},{x:10,y:30},{x:0,y:30}]),40);
  // 30 x 20 U with a 10 x 10 notch: two 10 ft inside-corner joints, 30 x 10 base in three panels (20 ft): 40 LF.
  assert.equal(cut([{x:0,y:0},{x:30,y:0},{x:30,y:20},{x:20,y:20},{x:20,y:10},{x:10,y:10},{x:10,y:20},{x:0,y:20}]),40);
  // A rectangle outline matches the rectangle rule: 40 x 10 -> four panels, 30 LF.
  assert.equal(cut([{x:0,y:0},{x:40,y:0},{x:40,y:10},{x:0,y:10}]),30);
  const q=generateQuoteVNext(slabJob(outline([{x:0,y:0},{x:8,y:0},{x:8,y:4},{x:4,y:4},{x:4,y:8},{x:0,y:8}]),sawCut));
  assert.doesNotMatch(q.disclaimer,/square of the same area/);
});
test('a concrete slab labor rate needs its thickness range and a forming-labor decision',()=>{
  let q=generateQuoteVNext(slabJob({},{slabLaborMinThicknessInches:undefined,slabLaborMaxThicknessInches:undefined}));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(q.missingOwnerFields.includes('slabLaborMinThicknessInches'));
  q=generateQuoteVNext(slabJob({thickness:8},{slabLaborMinThicknessInches:4,slabLaborMaxThicknessInches:6}));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
  q=generateQuoteVNext(slabJob({},{formingLaborPricing:undefined}));
  assert.ok(q.missingOwnerFields.includes('formingLaborPricing'));
});
test('forming labor follows the open edge, so a walk costs more than a pad of the same area',()=>{
  const forming={formingLaborPricing:'per_linear_foot',formingLaborPerLF:200};
  // 10 x 10 pad: labor 600.00 + concrete 244.44 + forms 40 x 25 = 1,000.00 + base 175.00
  // + forming 40 x 2.00 = 80.00 -> 2,099.44.
  assert.equal(generateQuoteVNext(slabJob({length:10,width:10},forming)).midEstimate,2099.44);
  // 25 x 4 walk, same 100 sq ft: forms 58 x 25 = 1,450.00, forming 58 x 2.00 = 116.00 -> 2,585.44.
  assert.equal(generateQuoteVNext(slabJob({length:25,width:4},forming)).midEstimate,2585.44);
});
test('edges against existing construction get an isolation joint decision and price',()=>{
  // 20 x 10 with 20 ft against the house: forms 40 x 25 = 1,000.00; isolation 20 x 3.00 = 60.00.
  // 1,200 labor + 488.89 concrete + 1,000 forms + 350 base + 60 = 3,098.89.
  const adj={adjoinsExistingConcrete:true,adjoiningEdgeLF:20};
  const q=generateQuoteVNext(slabJob(adj,{isolationJointPricing:'per_linear_foot',isolationJointPerLF:300}));
  assert.equal(line(q,'Isolation joints').amountCents,6000);
  assert.equal(q.midEstimate,3098.89);
  assert.equal(generateQuoteVNext(slabJob(adj,{isolationJointPricing:'included'})).midEstimate,3038.89);
  assert.ok(generateQuoteVNext(slabJob(adj,{isolationJointPricing:undefined})).missingOwnerFields.includes('isolationJointPricing'));
});
test('a concrete service goes live only after the isolation joint decision, since slabs against a house are common',()=>{
  const f=concrete();delete f.ownerPricing.pricing.isolationJointPricing;
  let s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(s.status,'NEEDS PRICING');assert.deepEqual(s.missingOwnerFields,['isolationJointPricing']);
  f.ownerPricing.pricing.isolationJointPricing='per_linear_foot';
  s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.deepEqual(s.missingOwnerFields,['isolationJointPerLF']);
  f.ownerPricing.pricing.isolationJointPerLF=300;
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
});
test('the owner mix shows on the concrete quote',()=>{
  const c=sanitizeForCustomerVNext(generateQuoteVNext(slabJob({},{concreteMixDescription:'32 MPa air-entrained'})));
  assert.ok(c.priceDrivers.includes('Concrete mix: 32 MPa air-entrained'));
});

// Sales tax by job location. 200 sq ft tile, before tax: labor 660.00 +
// material 1,120.00 = 1,780.00. CRA rates (GST/HST calculator, April 1, 2025
// on): Ontario 13%, Nova Scotia 14%. A service in relation to real property is
// supplied where the property is (GST/HST Memorandum 3-3-6-1).
test('tax by job location: CRA province rates, owner provincial rates and US ZIP zones',async()=>{
  const {validateBusinessDefaults}=await import('../server/quote-engine-vnext/contracts.js');
  const {checkStoredQuoteBookingAddress}=await import('../server/src/quoteBookingLocation.js');
  const ca=code=>{const f=flooring('tile',200);Object.assign(f.businessDefaults,{currency:'CAD',taxMode:'TAX_ALL',taxPercent:13,taxByJobLocation:true,provinceTaxPercent:{QC:14.975}});if(code!==undefined)f.customerInputs.postalCode=code;return f;};
  assert.equal(cents(generateQuoteVNext(ca('K1A 0B1'))),201140);            // 1,780.00 x 1.13
  assert.equal(cents(generateQuoteVNext(ca('B3H 1A1'))),202920);            // 1,780.00 x 1.14
  const qc=generateQuoteVNext(ca('J8T-1A1'));                              // 1,780.00 x 1.14975 = 2,046.555
  assert.equal(cents(qc),204656);
  assert.deepEqual(qc.options[0].calculationRecord.scenarios.mid.tax.location,{place:'Quebec',percent:14.975,source:'province'});
  // No code: the customer is asked for one. A province with no owner rate,
  // or a job outside the business's country, goes to the business.
  assert.deepEqual(generateQuoteVNext(ca()).missingCustomerFields,['postalCode']);
  assert.deepEqual(generateQuoteVNext(ca('S4P 1A1')).missingOwnerFields,['businessDefaults.provinceTaxPercent.SK']);
  assert.equal(generateQuoteVNext(ca('98101')).ownerDecisionRequired[0].kind,'tax_outside_country');
  // Off: the business rate applies wherever the job is.
  const off=ca('J8T 1A1');off.businessDefaults.taxByJobLocation=false;assert.equal(cents(generateQuoteVNext(off)),201140);
  // United States: owner zones, a full ZIP over a prefix, the business rate elsewhere.
  const us=code=>{const f=flooring('tile',200);Object.assign(f.businessDefaults,{currency:'USD',taxMode:'TAX_ALL',taxPercent:6,taxByJobLocation:true,taxZones:[{name:'Metro',codes:['981'],percent:10.35},{name:'Downtown',codes:['98101'],percent:10.55}]});f.customerInputs.postalCode=code;return f;};
  assert.equal(cents(generateQuoteVNext(us('98101-1234'))),196779);         // 1,780.00 x 1.1055 = 1,967.79
  assert.equal(cents(generateQuoteVNext(us('98102'))),196423);              // 1,780.00 x 1.1035 = 1,964.23
  // Outside every zone: the business confirms the tax unless the owner chose
  // his own rate there (WA DOR: 5-digit ZIPs do not match tax boundaries).
  assert.equal(generateQuoteVNext(us('99201')).ownerDecisionRequired[0].kind,'tax_outside_zones');
  const fallback=us('99201');fallback.businessDefaults.taxOutsideZones='business_rate';
  assert.equal(cents(generateQuoteVNext(fallback)),188680);               // 1,780.00 x 1.06 = 1,886.80
  // A 0% rate outside the zones is a real choice with tax by job location.
  const zero=us('99201');Object.assign(zero.businessDefaults,{taxOutsideZones:'business_rate',taxPercent:0});
  assert.equal(cents(generateQuoteVNext(zero)),178000);
  const zeroIn=us('98102');zeroIn.businessDefaults.taxPercent=0;assert.equal(cents(generateQuoteVNext(zeroIn)),196423);
  // Booking at an address with another rate needs a new quote.
  const stored={resultJson:JSON.stringify(qc)};
  assert.equal(checkStoredQuoteBookingAddress({quoteRow:stored,bookingPostalCode:'J8T 2B2'}).ok,true);
  assert.equal(checkStoredQuoteBookingAddress({quoteRow:stored,bookingPostalCode:'K1A 0B1'}).reason,'TAX_RATE_MISMATCH');
  // Settings are checked.
  const bad=validateBusinessDefaults({...ca().businessDefaults,provinceTaxPercent:{ON:13},taxZones:[{name:'A',codes:['981'],percent:5},{name:'B',codes:['981'],percent:6}]});
  assert.ok(bad.invalidFields.includes('provinceTaxPercent.ON'));assert.ok(bad.invalidFields.includes('taxZones[1].codes[0]'));
  // The service goes live and its customers are asked for a code.
  const live=ca();assert.equal(vNextServiceStatus(live.ownerPricing,live.businessDefaults).status,'QUOTING LIVE');
});
test('tax by job location asks the customer for a postal or ZIP code',async()=>{
  const {applicationServiceDefinition}=await import('../server/src/quoteDoneBridge.js');
  const raw=flooring('tile',200).ownerPricing,asked=defaults=>applicationServiceDefinition(raw,{defaults,services:[raw]}).customerFields.some(x=>x.name==='postalCode');
  assert.equal(asked({taxMode:'TAX_ALL',taxPercent:13}),false);
  assert.equal(asked({taxMode:'TAX_ALL',taxPercent:13,taxByJobLocation:true}),true);
  assert.equal(asked({taxMode:'TAX_NONE',taxPercent:0,taxByJobLocation:true}),false);
});

// Year built. EPA RRP: painting that disturbs paint in a home built before
// 1978 needs a lead-safe certified firm. OSHA 1926.1101: vinyl and asphalt
// flooring installed in 1980 or earlier is treated as asbestos-containing.
// WorkSafeBC: a hazardous-materials survey before renovating a pre-1990 building.
test('painting asks when the home was built and reviews homes that may have lead paint',()=>{
  for(const mode of ['installed','itemized']){
    const f=offeringFixture('INTERIOR_PAINTING',mode);delete f.ownerPricing.pricing.leadSafePainting;
    assert.deepEqual(generateQuoteVNext(f).missingCustomerFields,['buildingAge']);
    const at=(age,rule)=>{const g=structuredClone(f);if(age)g.customerInputs.buildingAge=age;if(rule)g.ownerPricing.pricing.leadSafePainting=rule;return g;};
    const priced=cents(ready(at(null,'included')));
    // The price never changes with the answer; only whether it is quoted.
    assert.equal(cents(ready(at('1990_or_later'))),priced);
    for(const age of ['before_1978','not_sure'])review(at(age),/lead/);
    // With no business currency, 1978 to 1989 is reviewed (the stricter line).
    review(at('1978_to_1989'),/lead/);
    // An owner who reviews up to 1990 (Health Canada: paint to 1990 may contain lead).
    review(at('1978_to_1989','review_before_1990'),/lead/);
    // Blank policy: a business pricing in Canadian dollars reviews to 1990, one in US dollars to 1978 (EPA).
    const canada=at('1978_to_1989');canada.businessDefaults.currency='CAD';review(canada,/lead/);
    const us=at('1978_to_1989');us.businessDefaults.currency='USD';assert.equal(cents(ready(us)),priced);
    assert.equal(cents(ready(at('1990_or_later','review_before_1990'))),priced);
    // Owners whose prices cover lead-safe work are not asked.
    assert.equal(generateQuoteVNext(at(null,'included')).resultType,'INSTANT_ESTIMATE_READY');
    assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
  }
});
test('removal in an older building is screened by default; an owner may quote it with the exclusion',()=>{
  // 200 sq ft of new tile; 250 sq ft of old vinyl out at 1.00 = 250.00.
  const job=(rule,age)=>{const f=flooring('tile',200);f.ownerPricing.pricing.removalPerSqft={vinyl:100};delete f.ownerPricing.pricing.olderMaterialRemoval;if(rule)f.ownerPricing.pricing.olderMaterialRemoval=rule;
    f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:'vinyl',removalNeeded:true,removalAreaSqft:250,...(age?{buildingAge:age}:{})});return f;};
  // Blank: the customer is asked; before 1990 or Not sure goes to review.
  assert.deepEqual(generateQuoteVNext(job()).missingCustomerFields,['buildingAge']);
  for(const age of ['before_1978','1978_to_1989','not_sure'])review(job(undefined,age),/asbestos/);
  let q=ready(job(undefined,'1990_or_later'));assert.equal(line(q,'Existing flooring removal').amountCents,25000);assert.doesNotMatch(q.disclaimer,/asbestos/);
  // The owner's explicit exclusion: quoted, with the exclusion stated.
  q=ready(job('exclude'));assert.equal(line(q,'Existing flooring removal').amountCents,25000);
  assert.match(q.disclaimer,/Removal does not include testing for or removing asbestos or lead paint\. Older flooring can contain them/);
  // No removal: nothing is asked and nothing is excluded.
  const keep=flooring('tile',200);delete keep.ownerPricing.pricing.olderMaterialRemoval;assert.doesNotMatch(ready(keep).disclaimer,/asbestos/);
  const bad=flooring('tile',200);bad.ownerPricing.pricing.olderMaterialRemoval='always';assert.ok(generateQuoteVNext(bad).invalidOwnerFields.includes('olderMaterialRemoval'));
});
test('an extra the customer asked for that has no price makes the quote partial in every trade',async()=>{
  const {customerContractForVNext}=await import('../server/quote-engine-vnext/contracts.js');
  const {discloseQuoteScope}=await import('../server/src/quoteScopeDisclosure.js');
  const present=f=>{const q=sanitizeForCustomerVNext(generateQuoteVNext(f)),contract=customerContractForVNext(f.serviceType,f.ownerPricing.pricing);
    return discloseQuoteScope(q,f.ownerPricing,{customerFields:Object.entries(contract.fields).map(([name,d])=>({name,...d}))},{customerInputs:f.customerInputs},1);};
  // Toilets requested; the business has no toilet price. 200 sq ft tile stays 1,780.00.
  const f=flooring('tile',200);f.customerInputs.toiletPullResetCount=1;
  const shown=present(f);
  assert.equal(shown.resultType,'PARTIAL_ESTIMATE_READY');
  assert.deepEqual(shown.additionalWork,[{source:'unpriced_requested_work',description:'Toilet pull and reset'}]);
  assert.equal(shown.pricedEstimate.options[0].midEstimate,1780);
  // Nothing extra requested: an ordinary quote.
  assert.equal(present(flooring('tile',200)).resultType,'INSTANT_ESTIMATE_READY');
});
test('painting states the door and window paint allowance on the direct-area route too',()=>{
  // 500 sq ft of wall, 2 doors and 3 windows: paint on 500 - 40 - 45 = 415 sq ft,
  // 2 coats x 1.10 = 913 sq ft of finish material.
  const f=offeringFixture('INTERIOR_PAINTING','itemized');Object.assign(f.customerInputs,{doorCount:2,windowCount:3,buildingAge:'1990_or_later'});
  const q=ready(f);assert.equal(line(q,'Wall finish materials').calculation.quantity,913);
  assert.match(q.disclaimer,/allows 20 square feet for each door and 15 square feet for each window/);
});
