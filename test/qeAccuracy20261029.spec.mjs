import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {fixture,flooring} from '../verification/engine-independent/fixtures.mjs';
import {synchronizeDependentLinesVNext,roofFlashingVentDefinitionVNext} from '../server/quote-engine-vnext/priceGroundwork.js';

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

test('a minimum-charge top-up is a charge for the work: taxed exactly like labor',()=>{
  // 200 sq ft tile: labor 200 x 3.00 x 1.10 (medium room) = 660.00; material
  // 200 x 1.12 x 5.00 = 1,120.00. Minimum 10,000.00 adds 8,220.00.
  // Materials-only tax 15%, labor untaxed: 15% x 1,120.00 = 168.00 -> 10,168.00.
  let f=taxEvery(flooring('tile',200),'TAX_MATERIALS',15,['material']);f.ownerPricing.pricing.minimumJob=1000000;
  let q=generateQuoteVNext(f);
  assert.equal(line(q,'Minimum price adjustment').amountCents,822000);
  assert.equal(line(q,'Minimum price adjustment').taxable,false);
  assert.equal(cents(q),1016800);
  // Labor taxable too: the whole 10,000.00 is taxed, 1,500.00 -> 11,500.00.
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
  // Materials-only tax 8%, labor and materials both taxed: 600 + 400 = 1,000 taxed, 80.00; July 60.00 surcharge untaxed.
  const f=customJob({share:40});taxEvery(f,'TAX_MATERIALS',8,['labor','material']);
  assert.equal(cents(generateQuoteVNext(f)),114000);
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
