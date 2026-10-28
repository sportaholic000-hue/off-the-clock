import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {customerContractForVNext,validateBusinessDefaults,CLASS2_DEFINITIONS} from '../server/quote-engine-vnext/contracts.js';
import {fixture,flooring,flatRoof,concrete,mowing} from '../verification/engine-independent/fixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {carpet} from './quoteFlooring20261016Fixture.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {class2FieldCopy,ownerFieldCopy} from '../server/priceBookCopy.js';
import {WORK_MONTH_FIELD,workMonthNumber} from '../server/quote-engine-vnext/workMonth.js';

// Every expected value below was worked out by hand before the run.
const cents=q=>Math.round(q.options[0].midEstimate*100);
const lines=q=>q.options?.[0]?.lineItems||[];
const line=(q,name)=>lines(q).find(l=>l.name===name);

test('carpet buys whole roll widths cut to length plus 0.5 ft trim, with fill pieces when cheaper',()=>{
  const bought=q=>lines(q).find(l=>l.calculation?.ratePath==='materialPerSqft.carpet')?.calculation?.quantity;
  // 12 wide x 14 long, 12 ft roll: one width, 12 x 14.5 = 174.
  assert.equal(bought(generateQuoteVNext(carpet([{lengthFt:14,widthFt:12}],12))),174);
  // 13 x 14: one full width 12 x 14.5 = 174 plus a 1 ft strip from 2 fill cuts of 12 x 1.5 = 36 -> 210.
  assert.equal(bought(generateQuoteVNext(carpet([{lengthFt:14,widthFt:13}],12))),210);
  // 10 x 12: run the roll across 12 and cut 10.5 long: 12 x 10.5 = 126.
  assert.equal(bought(generateQuoteVNext(carpet([{lengthFt:12,widthFt:10}],12))),126);
  // Two rooms cut separately: 174 + 126 = 300.
  assert.equal(bought(generateQuoteVNext(carpet([{lengthFt:14,widthFt:12},{lengthFt:12,widthFt:10}],12,0,[[1],[2]]))),300);
  // 13 x 14 on a 15 ft roll: across 14, cut 13.5 long: 15 x 13.5 = 202.5.
  assert.equal(bought(generateQuoteVNext(carpet([{lengthFt:14,widthFt:13}],15))),202.5);
  // 25 x 14: two full widths 24 x 14.5 = 348 plus 2 fill cuts of 12 x 1.5 = 36 -> 384.
  assert.equal(bought(generateQuoteVNext(carpet([{lengthFt:14,widthFt:25}],12))),384);
});

function steepRoof(){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:30000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:2000,accessoryPricingMode:'per_square_allin',minimumJob:0},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',stories:1,existingLayers:2,roofComplexity:'simple',serviceScope:'full',pitchMethod:'whole_roof',pitchBand:'seven_to_nine'});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  return f;
}
test('steep pitch adds removal and disposal for the second layer, not only the first',()=>{
  const q=generateQuoteVNext(steepRoof());
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  // 20 squares x 6,000 tear-off x 0.7 second-layer factor x 0.26 pitch addition = 21,840.
  assert.equal(line(q,'Steep-pitch additional-layer removal').amountCents,21840);
  // 20 squares x 2,000 disposal x 0.26 = 10,400.
  assert.equal(line(q,'Steep-pitch additional-layer disposal').amountCents,10400);
  // First layer is unchanged: 20 x (6,000 + 2,000) x 0.26 = 41,600.
  assert.equal(line(q,'Steep-pitch removal').amountCents,41600);
});

test('flat roof: an optional second-layer factor prices extra layers at a share of the first',()=>{
  const roof=(factor)=>{const f=flatRoof();f.customerInputs.existingLayers=2;if(factor!==undefined)f.ownerPricing.pricing.flatRoofAdditionalLayerFactor=factor;return generateQuoteVNext(f);};
  // Blank: unchanged, 1,000 sq ft x 2 layers x 200 = 400,000 on one line.
  const blank=roof();
  assert.equal(line(blank,'Tear-off').amountCents,400000);
  assert.equal(line(blank,'Additional-layer tear-off'),undefined);
  // 0.7: first layer 1,000 x 200 = 200,000; second 1,000 x 200 x 0.7 = 140,000.
  const set=roof(0.7);
  assert.equal(line(set,'Tear-off').amountCents,200000);
  assert.equal(line(set,'Additional-layer tear-off').amountCents,140000);
});

test('fence posts by total length count runs that close on themselves',()=>{
  const posts=inputs=>{
    const f=offeringFixture('FENCING_INSTALL','itemized');
    Object.assign(f.customerInputs,{gates:{},...inputs});
    const q=generateQuoteVNext(f);
    return q.resultType==='INSTANT_ESTIMATE_READY'?line(q,'Separately priced post materials').calculation.quantity:q.resultType+' '+(q.validationMessages||[]).join(' ');
  };
  // Section lengths are unknown, so line posts are the most any split can need:
  // ceil(length / 8) - 1. A closed run has corner posts but no end posts.
  // Closed 120 ft, 4 corners: 14 line + 4 corners = 18 (two fewer than open).
  assert.equal(posts({linearFeet:120,cornerCount:4,fenceRunCount:1,closedRunCount:1}),18);
  // Open 120 ft, 4 corners: 14 line + 2 ends + 4 corners = 20.
  assert.equal(posts({linearFeet:120,cornerCount:4,fenceRunCount:1,closedRunCount:0}),20);
  // Open 64 ft, 1 corner: 7 line + 2 ends + 1 corner = 10.
  assert.equal(posts({linearFeet:64,cornerCount:1,fenceRunCount:1}),10);
  // Straight 120 ft: 14 line posts plus 2 ends = 16.
  assert.equal(posts({linearFeet:120,cornerCount:0,fenceRunCount:1}),16);
  // More closed runs than runs is refused.
  assert.match(String(posts({linearFeet:120,cornerCount:4,fenceRunCount:1,closedRunCount:2})),/REVIEW|INVALID|ESTIMATE_REQUIRES/);
});

test('installed fence: a steep yard raises run labor, not the gate price',()=>{
  const f=offeringFixture('FENCING_INSTALL','installed');
  const flat=generateQuoteVNext(f);
  f.customerInputs.terrainSlope='steep';
  const steep=generateQuoteVNext(f);
  const gate=q=>lines(q).filter(l=>/gate/i.test(l.name)).map(l=>l.amountCents);
  assert.deepEqual(gate(steep),gate(flat));
  assert.ok(cents(steep)>cents(flat));
});

// The measured-scope overlay case with its owner overlay rule taken out.
function overlay(newType,old){
  const base=measuredScopeCases().find(row=>row.id==='overlay-installed');
  const f=structuredClone(base.input),p=f.ownerPricing.pricing;
  for(const map of [p.scopeDetails,p.scopeRates,p.installedLaborPercent,p.installedMaterialsPercent])for(const key of Object.keys(map||{}))if(key.includes('floor_overlay'))delete map[key];
  delete f.customerInputs.overlayScopeConfirmed;
  Object.assign(f.customerInputs,{newFlooringType:newType,existingFloorType:old,removalNeeded:false});
  f.customerInputs.confirmedFacts.existingFloorType={...f.customerInputs.confirmedFacts.existingFloorType,value:old,offeringId:f.ownerPricing.knownOfferings.existingFloorType[old]};
  p.laborPerSqft[newType]??=300;p.materialPerSqft[newType]??=500;
  return generateQuoteVNext(f);
}
test('floating floor over a hard floor quotes without an overlay rule; carpet has to come out',()=>{
  for(const old of ['tile','vinyl','hardwood'])assert.equal(overlay('vinyl_plank',old).resultType,'INSTANT_ESTIMATE_READY',old);
  // Tile over vinyl is not a floating floor: it still needs the owner's overlay rule.
  assert.notEqual(overlay('tile','vinyl').resultType,'INSTANT_ESTIMATE_READY');
  const carpetLeft=overlay('vinyl_plank','carpet');
  assert.notEqual(carpetLeft.resultType,'INSTANT_ESTIMATE_READY');
  assert.match((carpetLeft.validationMessages||[]).join(' '),/Existing carpet has to be removed before a new floor is installed\./);
});

test('concrete: owner thickness, reinforcement and base defaults price the same as the customer answering',()=>{
  const answered=concrete();
  const asked=customerContractForVNext('CONCRETE_PATIO_SLAB',answered.ownerPricing.pricing,answered.ownerPricing).fields;
  const owner=concrete();
  owner.ownerPricing.pricing.defaultSlabThicknessInches=owner.customerInputs.thickness;
  owner.ownerPricing.pricing.defaultReinforcement=owner.customerInputs.reinforcement;
  owner.ownerPricing.pricing.newSlabBase=owner.customerInputs.baseNeeded?'included':'not_included';
  for(const key of ['thickness','reinforcement','baseNeeded'])delete owner.customerInputs[key];
  const shown=customerContractForVNext('CONCRETE_PATIO_SLAB',owner.ownerPricing.pricing,owner.ownerPricing).fields;
  // Labor 120,000 + concrete round(200 x 4/324 x 1.10 x 18,000) = 48,889 + forms 150,000 + prep 35,000 = 353,889.
  assert.equal(cents(generateQuoteVNext(answered)),353889);
  assert.equal(cents(generateQuoteVNext(owner)),353889);
  assert.ok(!asked.thickness?.evidenceOnly);
  for(const key of ['thickness','reinforcement','baseNeeded'])assert.equal(shown[key]?.evidenceOnly,true,key);
});

const ZONES=[{name:'Core',codes:['E2L'],charge:0},{name:'Outer',codes:['E2H'],charge:3500}];
const zoned=postal=>{const f=mowing();f.ownerPricing.feeRules.travel='always';f.businessDefaults.travelFee=2500;f.businessDefaults.travelZones=structuredClone(ZONES);f.customerInputs.postalCode=postal;return f;};
test('a job outside the travel areas is quoted without a travel charge and says so',()=>{
  // Mowing 5,000 sq ft x 2 = 10,000. Outer zone adds 3,500; outside adds nothing.
  assert.equal(cents(generateQuoteVNext(zoned('E2H 1A1'))),13500);
  const outside=generateQuoteVNext(zoned('E3B 5A3'));
  assert.equal(outside.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(cents(outside),10000);
  assert.ok(JSON.stringify(outside).includes('This location is outside the areas with a set travel charge; the business will confirm the travel charge.'));
  assert.equal(sanitizeForCustomerVNext(outside).resultType,'INSTANT_ESTIMATE_READY');
});

test('interior painting no longer asks whether every wall is the same',()=>{
  const f=offeringFixture('INTERIOR_PAINTING','itemized');
  delete f.customerInputs.wallScopeUniform;
  // Unchanged total: 328,700.
  assert.equal(cents(generateQuoteVNext(f)),328700);
  const fields=customerContractForVNext('INTERIOR_PAINTING',f.ownerPricing.pricing,f.ownerPricing).fields;
  assert.equal(fields.wallScopeUniform.evidenceOnly,true);
  f.customerInputs.wallScopeUniform=false;
  assert.match((generateQuoteVNext(f).validationMessages||[]).join(' '),/Enter each room's measurements so each room keeps its own height and coats\./);
});

test('a new price book starts with markup and range blank and cannot quote until they are entered',()=>{
  const fresh={markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,peakMonths:[],peakSurchargePercent:0};
  const result=validateBusinessDefaults(fresh);
  assert.equal(result.ok,false);
  assert.ok(result.missingFields.includes('markupPercent'));
  assert.ok(result.missingFields.includes('rangeBufferPercent'));
});

test('busy-season pricing follows the month the customer wants the work done',()=>{
  const quote=(workMonth,month)=>{const f=flooring('tile',200);f.ownerPricing.peakMonths=[7];f.ownerPricing.peakSurchargePercent=10;f.currentMonth=month;if(workMonth!==undefined)f.customerInputs.workMonth=workMonth;return generateQuoteVNext(f);};
  // Base 178,000 with 66,000 labor; July is busy at 10% of labor = 6,600 -> 184,600.
  assert.equal(cents(quote('july',3)),184600);
  assert.equal(cents(quote('march',7)),178000);
  assert.equal(cents(quote(undefined,7)),184600);
  assert.equal(cents(quote(undefined,3)),178000);
  assert.equal(sanitizeForCustomerVNext(quote('july',3)).resultType,'INSTANT_ESTIMATE_READY');
  assert.deepEqual(quote('smarch',3).validationMessages,['Choose the month you want the work done.']);
  assert.equal(workMonthNumber('December'),12);
  assert.equal(WORK_MONTH_FIELD.values.length,12);
});

test('every waste allowance is entered as a percent; mulch starts at 10% extra',()=>{
  for(const [type,field] of [['ROOFING_REPLACEMENT','wasteFactorByComplexity'],['FLOORING_INSTALL','wasteFactorByType'],['FLOORING_INSTALL','patternWasteAdder'],['SIDING_REPLACEMENT','wasteFactorByType'],['FENCING_INSTALL','fenceWasteFactor'],['CONCRETE_PATIO_SLAB','concreteWasteFactor'],['LANDSCAPING_SOD','sodWasteFactor']]){
    assert.equal(class2FieldCopy(type,field,CLASS2_DEFINITIONS[type][field].defaultValue).ownerInputUnit,'percent',type+' '+field);
  }
  assert.equal(class2FieldCopy('ROOFING_REPLACEMENT','wasteFactorByComplexity',{simple:0.1}).label,'Roofing material waste by roof complexity');
  assert.match(class2FieldCopy('FENCING_INSTALL','fenceWasteFactor',0.1).help,/already includes waste, enter 0\./);
  assert.equal(CLASS2_DEFINITIONS.LANDSCAPING_MULCH.mulchOverageFactor.defaultValue,1.10);
  const mulch=class2FieldCopy('LANDSCAPING_MULCH','mulchOverageFactor',1.10);
  assert.equal(mulch.ownerInputUnit,'overage_percent');
  assert.match(mulch.help,/Enter 10 to order 10% extra; the saved calculation factor is 1\.10\./);
  assert.match(ownerFieldCopy('ROOFING_REPLACEMENT','underlaymentPerSquare').help,/measured installed roofing square/);
});

test('offering control totals, line by line',()=>{
  // Fence itemized, 100 ft, 2 walk gates: labor 100 x 1,000 = 100,000; infill 110 x 2,000 = 220,000;
  // 18 posts x (2,000 + 400 + 600) = 54,000; gates 2 x 25,000 = 50,000 -> 424,000.
  assert.equal(cents(generateQuoteVNext(offeringFixture('FENCING_INSTALL','itemized'))),424000);
  // Exterior installed: 500 sq ft x 600 x 1.06 = 318,000.
  assert.equal(cents(generateQuoteVNext(offeringFixture('EXTERIOR_PAINTING','installed'))),318000);
  // Exterior itemized: finish 110,000 + 33,000; primer 27,500 + 11,000; prep 55,000 + 11,000 -> 247,500.
  assert.equal(cents(generateQuoteVNext(offeringFixture('EXTERIOR_PAINTING','itemized'))),247500);
});
