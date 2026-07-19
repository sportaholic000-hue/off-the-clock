import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQuote } from '../server/quoteEngine.js';
import { getRequiredOwnerFields } from '../server/quoteTemplates.js';

const defaults = { markupPercent: 30, markupMode: 'markup', taxMode: 'TAX_NONE', minimumJobPrice: 0, rangeBufferPercent: 10 };
const mapLines = result => Object.fromEntries(result.lineItems.map(item => [item.name, item.amountCents]));

function assertEstimate(result, expected) {
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY');
  assert.deepEqual(mapLines(result), expected.lines);
  assert.equal(result.midEstimate, expected.mid);
  assert.equal(result.lowEstimate, expected.low);
  assert.equal(result.highEstimate, expected.high);
}

const cases = [
  ['build guide Test 1 roofing replacement','ROOFING_REPLACEMENT',{ roofSizeInput:2000, roofSizeMethod:'home_floor_area', roofType:'asphalt', pitch:'medium', stories:2, existingLayers:'1', roofComplexity:'moderate', serviceScope:'full' },{ laborPerSquare:4500, materialCostPerSquare:9000, tearOffPerSquare:2000, underlaymentPerSquare:1500 },defaults,{ lines:{ 'Roofing labor':68856, 'Field materials':123016, 'Tear-off':30603, Underlayment:20503, Markup:72893 }, mid:3160, low:2690, high:3630 }],
  ['roofing repair','ROOFING_REPAIR',{ repairType:'shingles', affectedArea:40, roofType:'asphalt', pitch:'medium', stories:1, leakPresent:false },{ laborHourlyRate:10000, repairMinimum:0, repairHours:{ shingles:{ small:2, medium:4, large:8 } }, repairMaterialAllowance:{ shingles:5000 } },defaults,{ lines:{ 'Repair labor':23000, 'Repair materials':5000, Markup:8400 }, mid:360, low:320, high:400 }],
  ['flat roof replacement','FLAT_ROOF_REPLACEMENT',{ roofSqft:1000, sqftMethod:'exact', membraneType:'epdm', existingLayers:'1', accessDifficulty:'easy', serviceScope:'full', buildingType:'residential' },{ laborPerSqft:{ epdm:500 }, membraneCostPerSqft:{ epdm:700 }, tearOffPerSqft:{ epdm:200 }, minimumJob:0 },defaults,{ lines:{ 'Flat roof labor':500000, Membrane:700000, 'Tear-off':200000, Markup:420000 }, mid:18200, low:16380, high:20020 }],
  ['flat roof repair','FLAT_ROOF_REPAIR',{ repairType:'leak', affectedArea:10, membraneType:'epdm', leakPresent:false, pondingWater:false },{ laborHourlyRate:10000, repairMinimum:0, patchRepairHours:{ leak:{ small:2, medium:4, large:8 } }, patchMaterialAllowance:{ leak:{ small:4000, medium:8000, large:16000 } } },defaults,{ lines:{ 'Flat roof repair labor':20000, 'Flat roof repair materials':4000, Markup:7200 }, mid:310, low:280, high:340 }],
  ['interior painting','INTERIOR_PAINTING',{ areaInputMethod:'sqft', floorAreaSqft:500, wallHeight:'standard', surfaceCondition:'good', coats:2, ceilingsIncluded:false, trimIncluded:true, roomCount:3 },{ laborPerFloorSqft:200, materialPerFloorSqft2Coats:60, minimumJob:0, trimLaborPerLF:125, trimMaterialPerLF:50, trimLinearFeetPerRoom:60 },defaults,{ lines:{ 'Wall labor':100000, 'Wall paint/materials':30000, 'Trim labor':22500, 'Trim materials':9000, Markup:48450 }, mid:2100, low:1890, high:2310 }],
  ['exterior painting','EXTERIOR_PAINTING',{ areaInputMethod:'sqft', exteriorAreaSqft:1000, stories:1, surfaceCondition:'good', coats:2 },{ exteriorLaborPerSqft:200, materialPerSqftPerCoat:50, minimumJob:0 },defaults,{ lines:{ 'Exterior labor':200000, 'Exterior materials':100000, Markup:90000 }, mid:3900, low:3510, high:4290 }],
  ['flooring install','FLOORING_INSTALL',{ sqft:300, sqftMethod:'exact', newFlooringType:'vinyl_plank', existingFloorType:'bare', removalNeeded:false, roomCount:1, layoutPattern:'straight', stairSteps:0 },{ laborPerSqft:300, materialPerSqft:500, minimumJob:0 },defaults,{ lines:{ 'Flooring labor':90000, 'Flooring materials':162000, Markup:75600 }, mid:3280, low:2950, high:3610 }],
  ['flooring replacement','FLOORING_REPLACEMENT',{ sqft:300, sqftMethod:'exact', newFlooringType:'tile', existingFloorType:'vinyl', removalNeeded:true, roomCount:1, layoutPattern:'straight', stairSteps:0, subfloorIssues:true },{ laborPerSqft:300, materialPerSqft:500, minimumJob:0, removalPerSqft:100, subfloorAllowancePerSqft:200 },defaults,{ lines:{ 'Flooring labor':90000, 'Flooring materials':168000, 'Existing flooring removal':30000, 'Subfloor allowance':60000, Markup:104400 }, mid:4520, low:4070, high:4970 }],
  ['fencing install','FENCING_INSTALL',{ linearFeet:100, lfMethod:'exact', fenceType:'wood', fenceHeight:6, gateCount:1, cornerCount:4, terrainSlope:'flat' },{ laborPerLinearFoot:1000, materialPerLinearFoot:2000, postSpacing:10, postPrice:2500, concretePerPost:700, postsIncludedInMaterial:false, gatePrice:25000, minimumJob:0 },defaults,{ lines:{ 'Fence labor':100000, 'Fence materials':200000, Posts:42500, 'Concrete footings':11900, Gates:25000, Markup:113820 }, mid:4930, low:4440, high:5420 }],
  ['fencing replacement','FENCING_REPLACEMENT',{ linearFeet:100, lfMethod:'exact', fenceType:'wood', fenceHeight:6, gateCount:1, cornerCount:4, terrainSlope:'flat', oldFenceRemoval:true },{ laborPerLinearFoot:1000, materialPerLinearFoot:2000, postSpacing:10, postPrice:2500, concretePerPost:700, postsIncludedInMaterial:false, gatePrice:25000, minimumJob:0, removalPerLinearFoot:500, disposalPerLF:200 },defaults,{ lines:{ 'Fence labor':100000, 'Fence materials':200000, Posts:42500, 'Concrete footings':11900, Gates:25000, 'Old fence removal':50000, Disposal:20000, Markup:134820 }, mid:5840, low:5260, high:6420 }],
  ['build guide Test 2 concrete driveway','CONCRETE_DRIVEWAY',{ dimensionMethod:'exact', length:50, width:11, thickness:4, finishType:'broom', demolitionNeeded:false, reinforcement:'wire_mesh', accessDifficulty:'easy', baseNeeded:true },{ laborPerSqft:600, concreteCostPerCubicYard:18000, formworkPerLF:2500, minimumJob:0, basePrepPerSqft:175, wireReinforcementPerSqft:150, concreteWasteFactor:0.10 },{ ...defaults, taxMode:'TAX_MATERIALS', taxPercent:8 },{ lines:{ 'Concrete labor':330000, Concrete:134444, Formwork:305000, 'Base prep':96250, 'Wire mesh reinforcement':82500, Markup:284458, Tax:54282 }, mid:12870, low:11580, high:14160 }],
  ['concrete patio slab','CONCRETE_PATIO_SLAB',{ dimensionMethod:'exact', length:20, width:10, thickness:4, finishType:'broom', reinforcement:'none', accessDifficulty:'easy', baseNeeded:true },{ laborPerSqft:600, concreteCostPerCubicYard:18000, formworkPerLF:2500, minimumJob:0, basePrepPerSqft:175, concreteWasteFactor:0.10 },defaults,{ lines:{ 'Concrete labor':120000, Concrete:48889, Formwork:150000, 'Base prep':35000, Markup:106167 }, mid:4600, low:4140, high:5060 }],
  ['landscaping cleanup','LANDSCAPING_CLEANUP',{ yardSize:1500, debrisLevel:'heavy', slope:'flat', haulAway:false },{ cleanupBaseRatePerSqft:10, debrisPricing:{ heavy:{ laborMultiplier:2, disposalFlat:15000 } }, minimumServiceCharge:0 },defaults,{ lines:{ 'Cleanup labor':30000, 'Debris disposal':15000, Markup:13500 }, mid:590, low:530, high:650 }],
  ['landscaping mulch','LANDSCAPING_MULCH',{ inputMethod:'sqft', mulchArea:300, mulchDepth:3, mulchType:'brown', bedCondition:'clean', edgingNeeded:false },{ mulchMaterialPerYard:{ brown:5000 }, mulchInstallLaborPerYard:3000, minimumServiceCharge:0 },defaults,{ lines:{ 'Mulch material':15972, 'Mulch install labor':8333, Markup:7292 }, mid:320, low:290, high:350 }],
  ['landscaping sod','LANDSCAPING_SOD',{ sodSqft:1000, sqftMethod:'exact', groundPrepNeeded:true, slope:'flat', accessDifficulty:'easy' },{ sodMaterialPerSqft:75, sodInstallLaborPerSqft:125, minimumServiceCharge:0, groundPrepPerSqft:50 },defaults,{ lines:{ 'Sod material':78750, 'Sod install labor':125000, 'Ground prep':50000, Markup:76125 }, mid:3300, low:2970, high:3630 }],
  ['landscaping planting','LANDSCAPING_PLANTING',{ plantCount:10, plantSize:'small', bedCondition:'clean', mulchNeeded:false },{ plantingLaborPerPlant:{ small:1000 }, plantMaterialAllowance:{ small:500 }, minimumServiceCharge:0 },defaults,{ lines:{ 'Planting labor':10000, 'Plant allowance':5000, Markup:4500 }, mid:200, low:180, high:220 }],
  ['landscaping mowing','LANDSCAPING_MOWING',{ yardSqft:5000, sqftMethod:'exact', serviceFrequency:'weekly', grassCondition:'maintained', bagClippings:false, edgingIncluded:false },{ mowingBaseRatePerSqft:2, minimumServiceCharge:0, frequencyMultipliers:{ weekly:1 }, overgrowthMultipliers:{ maintained:1 } },defaults,{ lines:{ 'Mowing labor':10000, Markup:3000 }, mid:130, low:120, high:140 }],
  ['siding replacement','SIDING_REPLACEMENT',{ areaInputMethod:'sqft', sidingAreaSqft:1000, sidingType:'vinyl', stories:1, oldSidingRemoval:false, trimIncluded:false },{ laborPerSqft:{ vinyl:400 }, materialPerSqft:{ vinyl:700 }, minimumJob:0 },defaults,{ lines:{ 'Siding labor':400000, 'Siding material':770000, Markup:351000 }, mid:15210, low:13690, high:16730 }],
  ['siding repair','SIDING_REPAIR',{ affectedArea:10, sidingType:'vinyl', damageLevel:'minor', stories:1 },{ laborHourlyRate:10000, repairMinimum:0, repairHours:{ minor:{ small:2, medium:4, large:8 } }, materialAllowance:{ minor:{ small:5000, medium:10000, large:20000 } } },defaults,{ lines:{ 'Siding repair labor':20000, 'Siding repair materials':5000, Markup:7500 }, mid:330, low:300, high:360 }],
  ['custom flat service','CUSTOM',{ service:'Handyman', unit:'flat' },{ low:10000, high:20000, unit:'flat' },defaults,{ lines:{ Handyman:15000, Markup:4500 }, mid:200, low:180, high:220 }]
];

const caseByType = Object.fromEntries(cases.map(([name, serviceType, customerInputs, ownerPricing, businessDefaults, expected]) => [serviceType, { name, serviceType, customerInputs, ownerPricing, businessDefaults, expected }]));

for (const [name, serviceType, customerInputs, ownerPricing, businessDefaults, expected] of cases) {
  test(name, () => assertEstimate(generateQuote({ serviceType, customerInputs, ownerPricing, businessDefaults }), expected));
}

test('minimum fields must be present, but zero means no minimum', () => {
  const customerInputs = { areaInputMethod:'sqft', floorAreaSqft:100, wallHeight:'standard', surfaceCondition:'good', coats:2, ceilingsIncluded:false, trimIncluded:false };
  const ready = generateQuote({ serviceType:'INTERIOR_PAINTING', customerInputs, ownerPricing:{ laborPerFloorSqft:200, materialPerFloorSqft2Coats:60, minimumJob:0 }, businessDefaults:defaults });
  const missingMinimum = generateQuote({ serviceType:'INTERIOR_PAINTING', customerInputs, ownerPricing:{ laborPerFloorSqft:200, materialPerFloorSqft2Coats:60 }, businessDefaults:defaults });
  const zeroRate = generateQuote({ serviceType:'INTERIOR_PAINTING', customerInputs, ownerPricing:{ laborPerFloorSqft:0, materialPerFloorSqft2Coats:60, minimumJob:0 }, businessDefaults:defaults });
  assert.equal(ready.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(missingMinimum.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(missingMinimum.missingOwnerFields, ['minimumJob']);
  assert.equal(zeroRate.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(zeroRate.missingOwnerFields, ['laborPerFloorSqft']);
});

test('cleanup disposal flat is not multiplied by 100', () => {
  const c = caseByType.LANDSCAPING_CLEANUP;
  assert.equal(mapLines(generateQuote(c))['Debris disposal'], 15000);
});

test('per-service minimums are enforced', () => {
  const minimumJob = generateQuote({ serviceType:'INTERIOR_PAINTING', customerInputs:{ areaInputMethod:'sqft', floorAreaSqft:10, wallHeight:'standard', surfaceCondition:'good', coats:1, ceilingsIncluded:false, trimIncluded:false }, ownerPricing:{ laborPerFloorSqft:100, materialPerFloorSqft2Coats:50, minimumJob:35000 }, businessDefaults:defaults });
  const repairMinimum = generateQuote({ serviceType:'ROOFING_REPAIR', customerInputs:{ repairType:'shingles', affectedArea:10, roofType:'asphalt', pitch:'low', stories:1, leakPresent:false }, ownerPricing:{ laborHourlyRate:10000, repairMinimum:50000, repairHours:{ shingles:{ small:1 } }, repairMaterialAllowance:{ shingles:1000 } }, businessDefaults:defaults });
  const serviceMinimum = generateQuote({ serviceType:'LANDSCAPING_MOWING', customerInputs:{ yardSqft:1000, sqftMethod:'exact', serviceFrequency:'weekly', grassCondition:'maintained', bagClippings:false, edgingIncluded:false }, ownerPricing:{ mowingBaseRatePerSqft:1, minimumServiceCharge:25000, frequencyMultipliers:{ weekly:1 }, overgrowthMultipliers:{ maintained:1 } }, businessDefaults:defaults });
  assert.equal(mapLines(minimumJob)['Minimum Price Adjustment'], 33765);
  assert.equal(mapLines(repairMinimum)['Minimum Price Adjustment'], 35700);
  assert.equal(mapLines(serviceMinimum)['Minimum Price Adjustment'], 23700);
});

test('interior painting sqft path with trim has no NaN line items', () => {
  const result = generateQuote(caseByType.INTERIOR_PAINTING);
  assert.deepEqual(result.lineItems.map(item => Number.isNaN(item.amountCents)), [false, false, false, false, false]);
});

test('TAX_ALL applies minimum pre-tax', () => {
  const result = generateQuote({ serviceType:'INTERIOR_PAINTING', customerInputs:{ areaInputMethod:'sqft', floorAreaSqft:10, wallHeight:'standard', surfaceCondition:'good', coats:1, ceilingsIncluded:false, trimIncluded:false }, ownerPricing:{ laborPerFloorSqft:100, materialPerFloorSqft2Coats:50, minimumJob:35000 }, businessDefaults:{ ...defaults, taxMode:'TAX_ALL', taxPercent:10 } });
  assert.equal(mapLines(result)['Minimum Price Adjustment'], 33765);
  assert.equal(mapLines(result).Tax, 3500);
});

test('TAX_MATERIALS taxes the marked-up material base', () => {
  assert.equal(mapLines(generateQuote(caseByType.CONCRETE_DRIVEWAY)).Tax, 54282);
});

test('TAX_NONE produces no tax line', () => {
  assert.equal(Object.hasOwn(mapLines(generateQuote(caseByType.ROOFING_REPLACEMENT)), 'Tax'), false);
});

test('every formula price field appears in its required owner field list', () => {
  const ignoredFields = new Set(['concreteWasteFactor', 'disposalPerLF']);
  const missingByService = cases.map(([, serviceType, customerInputs, ownerPricing]) => {
    const required = getRequiredOwnerFields(serviceType, customerInputs);
    const usedPriceFields = Object.keys(ownerPricing).filter(field => !ignoredFields.has(field));
    return [serviceType, usedPriceFields.filter(field => !required.includes(field))];
  }).filter(([, missing]) => missing.length !== 0);
  assert.deepEqual(missingByService, []);
});

test('tier overrides change only overridden fields', () => {
  const result = generateQuote({
    serviceType:'FENCING_INSTALL',
    customerInputs:{ linearFeet:100, lfMethod:'exact', fenceType:'wood', fenceHeight:6, gateCount:1, cornerCount:4, terrainSlope:'flat' },
    ownerPricing:{ laborPerLinearFoot:1000, materialPerLinearFoot:2000, postSpacing:10, postPrice:2500, concretePerPost:700, postsIncludedInMaterial:false, gatePrice:25000, minimumJob:0, tiers:[{ name:'Good', overrides:{} }, { name:'Better', overrides:{ materialPerLinearFoot:3000 } }] },
    businessDefaults:defaults
  });
  const good = mapLines(result.options[0]);
  const better = mapLines(result.options[1]);
  assert.equal(good['Fence labor'], better['Fence labor']);
  assert.equal(good.Posts, better.Posts);
  assert.equal(good['Concrete footings'], better['Concrete footings']);
  assert.equal(good.Gates, better.Gates);
  assert.equal(good['Fence materials'], 200000);
  assert.equal(better['Fence materials'], 300000);
});
