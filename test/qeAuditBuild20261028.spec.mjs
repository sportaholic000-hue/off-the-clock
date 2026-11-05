import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {customerContractForVNext,validateBusinessDefaults,CLASS2_DEFINITIONS} from '../server/quote-engine-vnext/contracts.js';
import {fixture,flooring,flatRoof,concrete,mowing} from '../verification/engine-independent/fixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {carpet} from './quoteFlooring20261016Fixture.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {class2FieldCopy,ownerFieldCopy} from '../server/priceBookCopy.js';
import {WORK_MONTH_FIELD,workMonthNumber,busySeasonMonths} from '../server/quote-engine-vnext/workMonth.js';
import {pendingStartingFactorUpdates,startingFactorUpdateValues} from '../server/quote-engine-vnext/startingFactorUpdates.js';
import {EARLIER_ROOF_RULES_COPY} from '../server/priceBookCopy.js';
import {FLOOR_STAY_LABEL} from '../server/scopeConfiguration.js';

// Every expected value below was worked out by hand before the run.
const cents=q=>Math.round(q.options[0].midEstimate*100);
const lines=q=>q.options?.[0]?.lineItems||[];
const line=(q,name)=>lines(q).find(l=>l.name===name);

test('carpet lays full-width drops and fills the leftover strip lengthwise, every piece the same pile direction',()=>{
  const bought=q=>lines(q).find(l=>l.calculation?.ratePath==='materialPerSqft.carpet')?.calculation?.quantity;
  // Fills need the owner's crossgrain allowance; blank buys whole widths (CRI 105 5.1).
  const room=(w,l,extra={})=>{const f=carpet([{lengthFt:l,widthFt:w}],12);Object.assign(f.ownerPricing.pricing,{carpetCrossgrainSeams:'allowed',...extra});for(const [k,v] of Object.entries(extra))if(v===undefined)delete f.ownerPricing.pricing[k];return bought(generateQuoteVNext(f));};
  // 12 ft roll, 0.5 ft trim on every cut and on the fill width; fill = one roll
  // cut split into k strips joined end to end, cut (run + k x 0.5) / k long.
  // 13 x 13: 12 x 13.5 = 162 drop; 1.5 ft fill, 3 strips cut 14.5/3: 12 x 4.8333 = 58. 220.
  assert.equal(room(13,13),220);
  // 13 wide x 14 long: run 13: 162 + 2.5 ft fill 58 = 220 (run 14: 174 + 62 = 236).
  assert.equal(room(13,14),220);
  // 15 x 15: 12 x 15.5 = 186 + 3.5 ft fill, 3 strips cut 16.5/3 = 5.5: 66. 252.
  assert.equal(room(15,15),252);
  // 16 wide x 14 long: 12 x 14.5 = 174 + 4.5 ft fill, 2 strips cut 15/2 = 7.5: 90. 264.
  assert.equal(room(16,14),264);
  // 20 wide x 15 long: run 20: 12 x 20.5 = 246 + 3.5 ft fill, 3 strips cut 21.5/3: 86. 332.
  assert.equal(room(20,15),332);
  // 22 x 14: the 10.5 ft fill leaves no room for a second strip, so one more width: 2 x 12 x 14.5 = 348.
  assert.equal(room(22,14),348);
  // 25 wide x 14 long: 2 drops 348 + 1.5 ft fill 62 = 410 (run 25: 306 + 106 = 412; whole widths 522).
  assert.equal(room(25,14),410);
  // 3 in of trim along each wall (CRI 105 5.3) means a room fits one width only
  // up to 11.5 ft across a 12 ft roll: 11 x 14 is one width cut 14.5 = 174.
  assert.equal(room(11,14),174);
  // 12 x 12: 12.5 ft to cover, one drop 150 + a 0.5 ft fill, 3 strips cut 13.5/3 = 4.5: 54. 204.
  assert.equal(room(12,12),204);
  // 12 wide x 14 long: run 12 across 14: 150 + 2.5 ft fill 54 = 204 (run 14: 174 + 62 = 236).
  assert.equal(room(12,14),204);
  // 18 x 18: the 6.5 ft fill fits no second strip, so two widths cut 18.5 = 444.
  assert.equal(room(18,18),444);
  // Pattern repeat 2 ft goes on every cut: 15 x 15: 12 x 17.5 = 210 + 12 x (15 + 3 x 2.5)/3 = 90. 300.
  assert.equal(room(15,15,{carpetPatternRepeatFt:2}),300);
  // "No crossgrain seams" keeps whole widths: 15 x 15 = 2 x 12 x 15.5 = 372.
  assert.equal(room(15,15,{carpetCrossgrainSeams:'not_allowed'}),372);
  // Blank is the same as not allowed: seams run the length of the room (CRI 105 5.1).
  assert.equal(room(15,15,{carpetCrossgrainSeams:undefined}),372);
  const allowFills=f=>{f.ownerPricing.pricing.carpetCrossgrainSeams='allowed';return f;};
  // Two rooms cut separately: 12 x 14 = 204; 10 wide x 12 long: 10.5 ft across fits one width cut 12.5 = 150
  // (the other way 12.5 ft across needs a fill: 126 + 46 = 172). 204 + 150 = 354.
  assert.equal(bought(generateQuoteVNext(allowFills(carpet([{lengthFt:14,widthFt:12},{lengthFt:12,widthFt:10}],12,0,[[1],[2]])))),354);
  // 13 x 14 on a 15 ft roll fits one piece: 15 x 13.5 = 202.5.
  assert.equal(bought(generateQuoteVNext(carpet([{lengthFt:14,widthFt:13}],15))),202.5);
  // The cut plan records the fill and its crossgrain seams.
  const cuts=generateQuoteVNext(allowFills(carpet([{lengthFt:15,widthFt:15}],12))).options[0].calculationRecord.quantityDerivations.find(d=>d.name==='flooringMaterialSqft').inputs.cuts;
  assert.deepEqual(cuts[0].fill,{pieces:3,crossgrainSeams:2,widthFt:3.5,cutLengthFt:5.5});
  // An unknown switch value is an owner pricing error.
  const bad=carpet([{lengthFt:15,widthFt:15}],12);bad.ownerPricing.pricing.carpetCrossgrainSeams='sometimes';
  assert.equal(generateQuoteVNext(bad).resultType,'ESTIMATE_REQUIRES_REVIEW');
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
  // First layer: removal 20 x 6,000 x 0.26 = 31,200 and disposal 20 x 2,000 x 0.26 = 10,400,
  // kept as separate lines so disposal never takes the labor surcharge or labor markup.
  assert.equal(line(q,'Steep-pitch removal').amountCents,31200);
  assert.equal(line(q,'Steep-pitch disposal').amountCents,10400);
  assert.equal(line(q,'Steep-pitch disposal').category,'disposal');
  assert.equal(line(q,'Steep-pitch additional-layer disposal').category,'disposal');
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
function overlay(newType,old,extra={},own={}){
  const base=measuredScopeCases().find(row=>row.id==='overlay-installed');
  const f=structuredClone(base.input),p=f.ownerPricing.pricing;Object.assign(p,own);
  if(!f.ownerPricing.knownOfferings.existingFloorType[old])f.ownerPricing.knownOfferings.existingFloorType[old]=crypto.randomUUID();
  for(const map of [p.scopeDetails,p.scopeRates,p.installedLaborPercent,p.installedMaterialsPercent])for(const key of Object.keys(map||{}))if(key.includes('floor_overlay'))delete map[key];
  delete f.customerInputs.overlayScopeConfirmed;
  Object.assign(f.customerInputs,{newFlooringType:newType,existingFloorType:old,removalNeeded:false});
  f.customerInputs.confirmedFacts.existingFloorType={...f.customerInputs.confirmedFacts.existingFloorType,value:old,offeringId:f.ownerPricing.knownOfferings.existingFloorType[old]};
  Object.assign(f.customerInputs,extra);
  p.laborPerSqft[newType]??=300;p.materialPerSqft[newType]??=500;
  return generateQuoteVNext(f);
}
test('a floating floor over a sound, attached hard floor quotes without an overlay rule; carpet has to come out',()=>{
  const sound={existingFloorSound:'yes'},floating={vinylPlankInstallMethod:'floating'};
  // Bare vinyl no longer names a material (sheet, tile or plank) since v22.
  for(const old of ['tile','hardwood','ceramic','porcelain_tile','sheet_vinyl'])assert.equal(overlay('vinyl_plank',old,sound,floating).resultType,'INSTANT_ESTIMATE_READY',old);
  // The customer is asked whether the old floor is attached, flat and not
  // cushioned; a new laminate floor is asked too.
  assert.deepEqual(overlay('vinyl_plank','tile',{},floating).missingCustomerFields,['existingFloorSound']);
  assert.ok(overlay('laminate','tile').missingCustomerFields.includes('existingFloorSound'));
  for(const answer of ['no','not_sure'])assert.equal(overlay('vinyl_plank','tile',{existingFloorSound:answer},floating).resultType,'ESTIMATE_REQUIRES_REVIEW',answer);
  // Vinyl plank floats only when the owner says it does; glue-down needs the overlay rule.
  for(const own of [{},{vinylPlankInstallMethod:'glue_down'}])assert.equal(overlay('vinyl_plank','tile',sound,own).resultType,'ESTIMATE_REQUIRES_REVIEW');
  // A floor that always floats is refused outright (v21). Since v23 existing
  // laminate is a material, and an unrecognized name is unclassified: without the
  // product's rules both are priced as a partial estimate that leaves whether the
  // floor can stay for the site visit. Engineered hardwood is wood, and whether it
  // is attached is the customer's answer (v22).
  assert.match(overlay('vinyl_plank','floating',sound,floating).reviewReason,/existing floor has to come out first/);
  for(const old of ['laminate','luxury_vinyl_plank']){
    const q=overlay('vinyl_plank',old,sound,floating);
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',old);
    assert.deepEqual(q.options[0].skippedAddons,[FLOOR_STAY_LABEL],old);
  }
  assert.equal(overlay('vinyl_plank','engineered_hardwood',sound,floating).resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(overlay('vinyl_plank','engineered_hardwood',{existingFloorSound:'no'},floating).resultType,'ESTIMATE_REQUIRES_REVIEW');
  // Tile over vinyl is not a floating floor: it still needs the owner's overlay rule.
  assert.notEqual(overlay('tile','vinyl').resultType,'INSTANT_ESTIMATE_READY');
  for(const old of ['carpet','berber']){
    const carpetLeft=overlay('vinyl_plank',old,{},floating);
    assert.notEqual(carpetLeft.resultType,'INSTANT_ESTIMATE_READY');
    assert.match((carpetLeft.validationMessages||[]).join(' '),/Existing carpet has to be removed before a new floor is installed\./);
  }
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
test('a job outside every travel area goes to review instead of an in-town price',()=>{
  // Mowing 5,000 sq ft x 2 = 10,000. Outer zone adds 3,500.
  assert.equal(cents(generateQuoteVNext(zoned('E2H 1A1'))),13500);
  const outside=generateQuoteVNext(zoned('E3B 5A3'));
  assert.equal(outside.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(outside.reviewReason,'This location is outside the areas this business has set travel charges for; the business will confirm the travel charge and the price.');
  assert.equal(sanitizeForCustomerVNext(outside).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('interior painting no longer asks whether every wall is the same',()=>{
  const f=offeringFixture('INTERIOR_PAINTING','itemized');
  delete f.customerInputs.wallScopeUniform;
  // Unchanged total: 328,700.
  assert.equal(cents(generateQuoteVNext(f)),328700);
  const fields=customerContractForVNext('INTERIOR_PAINTING',f.ownerPricing.pricing,f.ownerPricing).fields;
  assert.equal(fields.wallScopeUniform.evidenceOnly,true);
  f.customerInputs.wallScopeUniform=false;
  assert.match((generateQuoteVNext(f).validationMessages||[]).join(' '),/Walls that need different numbers of coats are priced by the business\. Rooms of different heights can be entered room by room\./);
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
  // No month, or Not sure: the busy-season price, whatever month the quote is made, with a note.
  for(const [answer,month] of [[undefined,7],[undefined,3],['not_sure',1]]){
    const q=quote(answer,month);
    assert.equal(cents(q),184600,String(answer)+' '+month);
    assert.ok(JSON.stringify(sanitizeForCustomerVNext(q)).includes('Priced at the busy-season rate because no work month was given. The price is lower if the work is scheduled outside July.'));
  }
  // No busy season set: no question effect and no note.
  const plain=generateQuoteVNext(flooring('tile',200));
  assert.equal(cents(plain),178000);assert.equal(JSON.stringify(plain).includes('busy-season rate'),false);
  assert.equal(sanitizeForCustomerVNext(quote('july',3)).resultType,'INSTANT_ESTIMATE_READY');
  assert.deepEqual(quote('smarch',3).validationMessages,['Choose the month you want the work done.']);
  assert.equal(workMonthNumber('December'),12);
  assert.equal(WORK_MONTH_FIELD.values.length,13);assert.equal(WORK_MONTH_FIELD.optionLabels.not_sure,'Not sure');
});

test('every waste allowance is entered as a percent; mulch starts at 10% extra; hip roofs start at 15%',()=>{
  assert.deepEqual(CLASS2_DEFINITIONS.ROOFING_REPLACEMENT.wasteFactorByComplexity.defaultValue,{simple:0.10,moderate:0.15,complex:0.18});
  assert.equal(CLASS2_DEFINITIONS.LANDSCAPING_SOD.topsoilWasteFactor.defaultValue,0.10);
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

import {roofFlashingVentDefinitionVNext,synchronizeDependentLinesVNext} from '../server/quote-engine-vnext/priceGroundwork.js';
import {vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {fenceFixture} from './fenceLaneB20261016Fixture.mjs';
import {controlJointLength,concreteLandscapeNotices,FIELD_COPY as CONCRETE_COPY} from '../server/quote-engine-vnext/concreteLandscapePricing.js';
import {repairSizeFromAffectedArea} from '../server/quote-engine-vnext/contracts.js';
import {surfaceExtraDefinitions} from '../server/quote-engine-vnext/surfacePricing.js';
import {exactToNumber} from '../server/quote-engine-vnext/exactMath.js';

function flashingRoof(customer={}){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:1},tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:1},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:2000,minimumJob:0,
    accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories_flashing_vents',iceWaterBarrierUnit:'linear_feet',iceWaterBarrierPerLF:400,valleyPerLF:600,stepFlashingPerLF:800,pipeJackEach:4500,ridgeVentPerLF:900,starterPerLF:100,dripEdgePerLF:100,ridgeCapPerLF:100},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',starterLengthLF:0,dripEdgeLengthLF:0,ridgeCapLengthLF:0,...customer});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  Object.assign(f.ownerPricing.pricing,{pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70});
  const d=roofFlashingVentDefinitionVNext('asphalt_shingle');
  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,[d],{ownerId:f.ownerPricing.origin.ownerId,reenteredIds:[d.id],confirmIds:[d.id],now:'2026-10-16T12:00:00.000Z'});
  return f;
}
const FIVE={iceWaterBarrierLengthLF:120,valleyLengthLF:40,stepFlashingLengthLF:30,pipeJackCount:3,ridgeVentLengthLF:40};
test('roof flashing, vent and ice-and-water lines are asked once the field price excludes them',()=>{
  const ready=flashingRoof();
  assert.equal(vNextServiceStatus(ready.ownerPricing,ready.businessDefaults).status,'QUOTING LIVE');
  // Blank: no instant quote; the five quantities are asked by name.
  const blank=generateQuoteVNext(ready);
  assert.equal(blank.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(blank.missingCustomerFields,['iceWaterBarrierLengthLF','valleyLengthLF','stepFlashingLengthLF','pipeJackCount','ridgeVentLengthLF']);
  // All five: 120 x 400 + 40 x 600 + 30 x 800 + 3 x 4,500 + 40 x 900 = 145,500 on top of 560,042.
  assert.equal(cents(generateQuoteVNext(flashingRoof(FIVE))),705542);
  // Zero means none and quotes the base 560,042.
  assert.equal(cents(generateQuoteVNext(flashingRoof(Object.fromEntries(Object.keys(FIVE).map(k=>[k,0]))))),560042);
  // A requested item with no owner price is held for review naming that price.
  const unpriced=flashingRoof(FIVE);delete unpriced.ownerPricing.pricing.pipeJackEach;
  const held=generateQuoteVNext(unpriced);
  assert.equal(held.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(held.missingOwnerFields,['pipeJackEach']);
});

test('a confirmed exclusion with no ice-and-water unit needs pricing and sends roof quotes to review naming the barrier',()=>{
  const f=flashingRoof(Object.fromEntries(['valleyLengthLF','stepFlashingLengthLF','pipeJackCount','ridgeVentLengthLF'].map(k=>[k,0])));
  delete f.ownerPricing.pricing.iceWaterBarrierUnit;
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
  const q=generateQuoteVNext(f);
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(q.missingOwnerFields.includes('iceWaterBarrierUnit'));
  // Once the unit is set, its quantity is asked like the other four.
  f.ownerPricing.pricing.iceWaterBarrierUnit='square_feet';f.ownerPricing.pricing.iceWaterBarrierPerSqft=150;
  const asked=generateQuoteVNext(f);
  assert.deepEqual(asked.missingCustomerFields,['iceWaterBarrierSqft']);
  // 400 sq ft x 150 = 60,000 on top of 560,042.
  f.customerInputs.iceWaterBarrierSqft=400;
  assert.equal(cents(generateQuoteVNext(f)),620042);
});

test('roof repair: a walkable "medium" roof starts with no pitch charge',()=>{
  assert.deepEqual(CLASS2_DEFINITIONS.ROOFING_REPAIR.pitchMultiplier.defaultValue,{low:1,medium:1,steep:1.25,very_steep:1.40});
});

test('package painting covers surfaces in the priced condition or better; worse surfaces go to review',()=>{
  for(const [type,installed,price] of [['INTERIOR_PAINTING',380000],['EXTERIOR_PAINTING',300000]].map(([t,c])=>[t,true,c])){
    const run=condition=>{const f=offeringFixture(type,'installed');f.customerInputs.surfaceCondition=condition;if(type==='EXTERIOR_PAINTING'){f.customerInputs.stories=1;f.ownerPricing.pricing.offeringDetails.stories=1;}return generateQuoteVNext(f);};
    assert.equal(offeringFixture(type,'installed').ownerPricing.pricing.offeringDetails.surfaceCondition,'fair');
    assert.equal(cents(run('good')),price,type);
    assert.equal(cents(run('fair')),price,type);
    const poor=run('poor');
    assert.equal(poor.resultType,'ESTIMATE_REQUIRES_REVIEW');
    assert.match((poor.validationMessages||[]).join(' '),/These surfaces need more preparation than this price covers\./);
  }
});

test('basic interior painting quotes fair walls at the wall rate when the owner says it covers touch-up',()=>{
  const paint=(condition,touchUp)=>{const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:90,materialPerWallSqftPerCoat:20,minimumJob:0,...(touchUp?{wallPriceIncludesTouchUp:touchUp}:{})},{areaInputMethod:'wall_sqft',wallAreaSqft:800,wallHeight:'standard',surfaceCondition:condition,coats:2,ceilingsIncluded:false,trimIncluded:false});f.ownerPricing.priceBasisByCategory.material='sell_price';return generateQuoteVNext(f);};
  // 800 sq ft x 2 coats = 1,600: labor x 90 = 144,000; material x 1.10 paint waste x 20 = 35,200 -> 179,200.
  assert.equal(cents(paint('good')),179200);
  assert.equal(cents(paint('fair','yes')),179200);
  for(const touchUp of [undefined,'no'])assert.equal(paint('fair',touchUp).resultType,'ESTIMATE_REQUIRES_REVIEW');
  const poor=paint('poor','yes');
  assert.equal(poor.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(poor.reviewReason,'Poor walls go to review until you use itemized pricing with preparation rates.');
});

test('the touch-up answer covers fair ceilings too; poor ceilings stay in review',()=>{
  const paint=(ceiling,touchUp)=>{const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:90,materialPerWallSqftPerCoat:20,ceilingLaborPerSqftPerCoat:100,ceilingMaterialPerSqftPerCoat:20,minimumJob:0,paintingSettings:{primerCoats:0},...(touchUp?{wallPriceIncludesTouchUp:touchUp}:{})},{areaInputMethod:'wall_sqft',wallAreaSqft:800,wallHeight:'standard',surfaceCondition:'fair',coats:2,ceilingsIncluded:true,ceilingAreaSqft:200,ceilingCoats:2,ceilingSurfaceCondition:ceiling,trimIncluded:false});f.ownerPricing.priceBasisByCategory.material='sell_price';return generateQuoteVNext(f);};
  // Walls 1,600 coat-sq-ft: 144,000 + 35,200. Ceiling 400: 40,000 labor + 400 x 20 x 1.10 = 8,800. 228,000.
  assert.equal(cents(paint('good','yes')),228000);
  assert.equal(cents(paint('fair','yes')),228000);
  assert.equal(paint('poor','yes').resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(paint('fair','no').resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('a fence gate may end an open run; its end post is counted once',()=>{
  const layout=sections=>{const f=fenceFixture();for(const k of ['linearFeet','lfMethod','cornerCount','gates'])delete f.customerInputs[k];Object.assign(f.customerInputs,{fenceRunCount:1,fenceRuns:[{closed:false,sections}]});return generateQuoteVNext(f);};
  const posts=q=>line(q,'Separately priced post materials').calculation.quantity;
  // 40 ft then a walk gate at the house: 4 line posts (40 / 8 - 1) + start post + gate hinge post + gate latch post = 7.
  // 40 x 1,000 labor + 44 x 2,000 infill + 7 x (2,000 + 400 + 600) posts + 25,000 gate = 174,000.
  const end=layout([{lengthLF:40,gateAfter:'walk'}]);
  assert.equal(posts(end),7);assert.equal(cents(end),174000);
  // 60 ft, corner, 40 ft, gate at the end: 7 + 4 line posts + start, corner, hinge, latch = 15.
  assert.equal(posts(layout([{lengthLF:60},{lengthLF:40,gateAfter:'walk'}])),15);
  // The same yard measured with the gate between sections still quotes: 3 ft + gate + 37 + 60 + 40 = 536,000.
  assert.equal(cents(layout([{lengthLF:3,gateAfter:'walk'},{lengthLF:37},{lengthLF:60},{lengthLF:40}])),536000);
});

test('imported topsoil orders 10% extra for settling',()=>{
  const f=fixture('LANDSCAPING_SOD',{sodMaterialPerSqft:40,sodInstallLaborPerSqft:100,minimumServiceCharge:0,sodWasteFactor:0.05,slopeMultiplier:{flat:1,moderate:1.15,steep:1.35},accessMultiplier:{easy:1,moderate:1.10,difficult:1.25},
    sodRemovalPerSqft:10,topsoilPerCubicYard:4500,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:3,topsoilWasteFactor:0.10},{sodSqft:1000,sqftMethod:'exact',groundPrepNeeded:true,slope:'flat',accessDifficulty:'easy',usableTopsoilDepthInches:1});
  const q=generateQuoteVNext(f);
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  // 1,000 sq ft x 3 in / 324 = 9.2593 yd x 1.10 = 10.1852 yd x 4,500 = 45,833.
  const soil=line(q,'Imported topsoil');
  assert.ok(Math.abs(soil.calculation.quantity-10.185185185185185)<1e-9);
  assert.equal(soil.amountCents,45833);
});

test('control joints keep panels within 1.5 to 1; the spacing warning starts past 36 x thickness',()=>{
  const joints=(L,W)=>exactToNumber(controlJointLength({dimensionMethod:'exact',length:L,width:W},L*W,10).quantity);
  // 30 x 12 at 10 ft: 3 x 2 panels would be 10 x 6 (1.67:1), so 4 x 2 panels of 7.5 x 6: 3 x 12 + 1 x 30 = 66 LF.
  assert.equal(joints(30,12),66);
  // 24 x 24: 3 x 3 panels of 8 x 8: 2 x 24 + 2 x 24 = 96 LF. 3 x 30 walk: 7 panels of 4.29 x 3: 6 x 3 = 18 LF.
  assert.equal(joints(24,24),96);assert.equal(joints(30,3),18);
  const warns=(t,s)=>concreteLandscapeNotices('CONCRETE_PATIO_SLAB',{slabLaborMinThicknessInches:t,slabLaborMaxThicknessInches:t,controlJointPricing:'excluded',controlJointSpacingFt:s}).length>0;
  // 4 in: 36 x 4 in = 12 ft. 5 in: 15 ft. 6 in and up: 15 ft.
  assert.deepEqual([warns(4,12),warns(4,12.5),warns(5,12),warns(5,15),warns(5,15.5),warns(8,16)],[false,true,false,false,true,true]);
});

test('tile backer board is an optional owner scope; tile quotes without it are unchanged',()=>{
  assert.equal(cents(generateQuoteVNext(flooring('tile',200))),178000);
  const f=flooring('tile',200);
  Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_tile:{description:'[SYNTHETIC] Half-inch cement backer board, screwed and taped',mode:'installed_area_sell_price'}},scopeRates:{floor_underlayment_tile:250},installedLaborPercent:{'scopeRates.floor_underlayment_tile':50}});
  f.customerInputs.underlaymentScopeConfirmed=true;
  // 178,000 + 200 x 250 = 228,000.
  const q=generateQuoteVNext(f);
  assert.equal(cents(q),228000);
  assert.equal(line(q,'tile backer board or uncoupling membrane').amountCents,50000);
});

test('flat roofs price wall and parapet base flashing per linear foot when the owner sets it',()=>{
  const f=flatRoof();f.ownerPricing.pricing.flatRoofWallFlashingPerLF=1500;f.customerInputs.wallFlashingLF=60;
  // 1,470,000 + 60 x 1,500 = 1,560,000.
  const q=generateQuoteVNext(f);
  assert.equal(cents(q),1560000);
  assert.equal(line(q,'Wall and parapet base flashing').amountCents,90000);
});

test('exterior painting soffit can be priced by square or linear feet; repair size limits are owner-set',()=>{
  assert.equal(surfaceExtraDefinitions('EXTERIOR_PAINTING',{}).soffit.unit,'linear feet');
  assert.equal(surfaceExtraDefinitions('EXTERIOR_PAINTING',{paintingSettings:{soffitUnit:'square_feet'}}).soffit.unit,'square feet');
  assert.deepEqual([49,50,200,201].map(a=>repairSizeFromAffectedArea('ROOFING_REPAIR',a)),['small','medium','medium','large']);
  const own={repairSmallBelowSqft:30,repairMediumUpToSqft:120};
  assert.deepEqual([29,30,120,121].map(a=>repairSizeFromAffectedArea('ROOFING_REPAIR',a,own)),['small','medium','medium','large']);
  assert.deepEqual([19,20,80,81].map(a=>repairSizeFromAffectedArea('SIDING_REPAIR',a)),['small','medium','medium','large']);
  assert.equal(CONCRETE_COPY.baseCompactionAllowance.ownerInputUnit,'percent');
  assert.match(ownerFieldCopy('ROOFING_REPLACEMENT','tearOffPerSquare').help,/additional-layer factor/);
  assert.doesNotMatch(ownerFieldCopy('SIDING_REPLACEMENT','materialPerSqft').title||ownerFieldCopy('SIDING_REPLACEMENT','materialPerSqft').label,/20–30%/);
});

function roofRepair(pitch='low',stories=1,extra={},area=10){
  return fixture('ROOFING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1000,pitchMultiplier:{low:1,medium:1,steep:1.25,very_steep:1.40},storyMultiplier:{1:1,2:1.10,3:1.20},repairHours:{asphalt_shingle:{shingle_patch:{small:2,medium:4,large:8}}},repairMaterialAllowance:{asphalt_shingle:{shingle_patch:{small:5000,medium:9000,large:15000}}},...extra},{repairType:'shingle_patch',affectedArea:area,roofType:'asphalt_shingle',pitch,stories,leakPresent:false});
}
test('the largest repair is checked against the owner\'s own medium limit',()=>{
  const bands={repairSmallBelowSqft:40,repairMediumUpToSqft:150,largeRepairMaxSqft:180};
  // Small 2 h x 10,000 + 5,000; medium 4 h + 9,000; large 8 h + 15,000.
  assert.deepEqual([10,100,170].map(a=>cents(generateQuoteVNext(roofRepair('low',1,bands,a)))),[25000,49000,95000]);
  assert.equal(generateQuoteVNext(roofRepair('low',1,bands,181)).resultType,'ESTIMATE_REQUIRES_REVIEW');
  const live=roofRepair('low',1,bands);assert.equal(vNextServiceStatus(live.ownerPricing,live.businessDefaults).status,'QUOTING LIVE');
  // A largest repair at or below the owner's medium limit is rejected.
  const bad=roofRepair('low',1,{repairSmallBelowSqft:40,repairMediumUpToSqft:300,largeRepairMaxSqft:250});
  assert.equal(vNextServiceStatus(bad.ownerPricing,bad.businessDefaults).status,'NEEDS PRICING');
  assert.equal(generateQuoteVNext(roofRepair('low',1,{repairSmallBelowSqft:40,repairMediumUpToSqft:300,largeRepairMaxSqft:250},260)).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('roof repair adds pitch and story charges instead of multiplying them',()=>{
  // 2 h x 10,000 x (1 + pitch addition + story addition) + 5,000 materials.
  assert.equal(cents(generateQuoteVNext(roofRepair('low',1))),25000);
  assert.equal(cents(generateQuoteVNext(roofRepair('medium',1))),25000);
  // steep, two storeys: 1 + 0.25 + 0.10 = 1.35: 27,000 + 5,000.
  assert.equal(cents(generateQuoteVNext(roofRepair('steep',2))),32000);
  // very steep, three storeys: 1 + 0.40 + 0.20 = 1.60: 32,000 + 5,000 (multiplying gave 1.68: 38,600).
  assert.equal(cents(generateQuoteVNext(roofRepair('very_steep',3))),37000);
});

test('flat roof replacement asks every priced extra; 0 means none and a blank goes to review',()=>{
  const rates={flatRoofEdgeMetalPerLF:1500,flatRoofWallFlashingPerLF:1500,flatRoofPenetrationEach:15000,flatRoofDrainEach:39000};
  const roof=inputs=>{const f=flatRoof();Object.assign(f.ownerPricing.pricing,rates);Object.assign(f.customerInputs,inputs);return f;};
  const blank=generateQuoteVNext(roof({}));
  assert.equal(blank.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(blank.missingCustomerFields,['edgeMetalLF','wallFlashingLF','penetrationCount','drainCount']);
  assert.equal(cents(generateQuoteVNext(roof({edgeMetalLF:0,wallFlashingLF:0,penetrationCount:0,drainCount:0}))),1470000);
  // 140 x 1,500 + 60 x 1,500 + 3 x 15,000 + 1 x 39,000 = 384,000 on top of 1,470,000.
  assert.equal(cents(generateQuoteVNext(roof({edgeMetalLF:140,wallFlashingLF:60,penetrationCount:3,drainCount:1}))),1854000);
  const live=roof({});assert.equal(vNextServiceStatus(live.ownerPricing,live.businessDefaults).status,'QUOTING LIVE');
});

test('the busy-season note lists a season that wraps the year in season order',()=>{
  const f=flooring('tile',200);f.ownerPricing.peakMonths=[1,2,12];f.ownerPricing.peakSurchargePercent=10;
  const q=generateQuoteVNext(f);
  // Base 178,000 with 66,000 labor; busy price adds 10% of labor = 6,600.
  assert.equal(cents(q),184600);
  assert.ok(JSON.stringify(sanitizeForCustomerVNext(q)).includes('The price is lower if the work is scheduled outside December, January, February.'));
  f.ownerPricing.peakMonths=[1,2,3,4,5,6,7,8,9,10,11,12];
  const all=generateQuoteVNext(f);
  assert.equal(cents(all),184600);
  assert.equal(JSON.stringify(all).includes('busy-season rate'),false);
});

test('saved services still on an old starting value get it offered; owner values are left alone',()=>{
  const saved={pitchMultiplier:{low:1,medium:1.15,steep:1.25,very_steep:1.40},wasteFactorByComplexity:{simple:0.10,moderate:0.13,complex:0.18}};
  const read=field=>saved[field];
  assert.deepEqual(pendingStartingFactorUpdates('ROOFING_REPLACEMENT',read).map(u=>u.path),['wasteFactorByComplexity.moderate','pitchMultiplier.medium']);
  // On the October 16 rules the old pitch multiplier is unused, so only the waste is offered.
  assert.deepEqual(pendingStartingFactorUpdates('ROOFING_REPLACEMENT',read,{earlierRoofRules:false}).map(u=>u.path),['wasteFactorByComplexity.moderate']);
  const values=startingFactorUpdateValues(pendingStartingFactorUpdates('ROOFING_REPLACEMENT',read),read);
  assert.deepEqual(values,{wasteFactorByComplexity:{simple:0.10,moderate:0.15,complex:0.18},pitchMultiplier:{low:1,medium:1,steep:1.25,very_steep:1.40}});
  assert.equal(saved.pitchMultiplier.medium,1.15,'the saved service is not changed until the owner saves');
  // An owner value (1.20) is never offered a change.
  assert.deepEqual(pendingStartingFactorUpdates('ROOFING_REPAIR',f=>({pitchMultiplier:{low:1,medium:1.20,steep:1.25,very_steep:1.40}})[f]),[]);
  assert.deepEqual(startingFactorUpdateValues(pendingStartingFactorUpdates('LANDSCAPING_MULCH',()=>1.15),()=>1.15),{mulchOverageFactor:1.10});
  // Every offered value is the current starting value.
  for(const [type,defs] of Object.entries(CLASS2_DEFINITIONS))for(const u of pendingStartingFactorUpdates(type,()=>undefined))assert.fail(type+u.path);
  assert.equal(CLASS2_DEFINITIONS.ROOFING_REPLACEMENT.wasteFactorByComplexity.defaultValue.moderate,0.15);
  assert.equal(CLASS2_DEFINITIONS.ROOFING_REPLACEMENT.pitchMultiplier.defaultValue.medium,1);
  assert.equal(CLASS2_DEFINITIONS.LANDSCAPING_MULCH.mulchOverageFactor.defaultValue,1.10);
  assert.deepEqual(busySeasonMonths([1,2,12]),[12,1,2]);
  assert.deepEqual(busySeasonMonths([5,6,7,8]),[5,6,7,8]);
  assert.match(EARLIER_ROOF_RULES_COPY.tearOffPerSquare.help,/Every layer is charged in full, multiplied by the pitch and story adjustments/);
  assert.match(EARLIER_ROOF_RULES_COPY.laborPerSquare.help,/multiplied by the pitch and story adjustments/);
});
