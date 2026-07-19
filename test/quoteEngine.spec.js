import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQuote } from '../server/quoteEngine.js';
import { getRequiredOwnerFields } from '../server/quoteTemplates.js';

const defaults = { markupPercent: 30, markupMode: 'markup', taxMode: 'TAX_NONE', minimumJobPrice: 0, rangeBufferPercent: 10 };

function lineItemsByName(result) {
  return Object.fromEntries(result.lineItems.map(item => [item.name, item.amountCents]));
}

function assertReady(result, expected) {
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY');
  assert.deepEqual(lineItemsByName(result), expected.lines);
  assert.equal(result.midEstimate, expected.mid);
  assert.equal(result.lowEstimate, expected.low);
  assert.equal(result.highEstimate, expected.high);
}

const serviceCases = [
  {
    name: 'build guide Test 1 roofing replacement',
    serviceType: 'ROOFING_REPLACEMENT',
    customerInputs: { roofSizeInput:2000, roofSizeMethod:'home_floor_area', roofType:'asphalt', pitch:'medium', stories:2, existingLayers:'1', roofComplexity:'moderate', serviceScope:'full' },
    ownerPricing: { laborPerSquare:4500, materialCostPerSquare:9000, tearOffPerSquare:2000, underlaymentPerSquare:1500 },
    businessDefaults: defaults,
    expected: { lines: { 'Roofing labor':68856, 'Field materials':123016, 'Tear-off':30603, Underlayment:20503, Markup:72893 }, mid:3160, low:2690, high:3630 }
  },
  {
    name: 'roofing repair',
    serviceType: 'ROOFING_REPAIR',
    customerInputs: { repairType:'shingles', affectedArea:40, roofType:'asphalt', pitch:'medium', stories:1, leakPresent:false },
    ownerPricing: { laborHourlyRate:10000, repairMinimum:0, repairHours:{ shingles:{ small:2, medium:4, large:8 } }, repairMaterialAllowance:{ shingles:5000 } },
    businessDefaults: defaults,
    expected: { lines: { 'Repair labor':23000, 'Repair materials':5000, Markup:8400 }, mid:360, low:320, high:400 }
  },
  {
    name: 'flat roof replacement',
    serviceType: 'FLAT_ROOF_REPLACEMENT',
    customerInputs: { roofSqft:1000, sqftMethod:'exact', membraneType:'epdm', existingLayers:'1', accessDifficulty:'easy', serviceScope:'full', buildingType:'residential' },
    ownerPricing: { laborPerSqft:{ epdm:500 }, membraneCostPerSqft:{ epdm:700 }, tearOffPerSqft:{ epdm:200 }, minimumJob:0 },
    businessDefaults: defaults,
    expected: { lines: { 'Flat roof labor':500000, Membrane:700000, 'Tear-off':200000, Markup:420000 }, mid:18200, low:16380, high:20020 }
  },
  {
    name: 'flat roof repair',
    serviceType: 'FLAT_ROOF_REPAIR',
    customerInputs: { repairType:'leak', affectedArea:10, membraneType:'epdm', leakPresent:false, pondingWater:false },
    ownerPricing: { laborHourlyRate:10000, repairMinimum:0, patchRepairHours:{ leak:{ small:2, medium:4, large:8 } }, patchMaterialAllowance:{ leak:{ small:4000, medium:8000, large:16000 } } },
    businessDefaults: defaults,
    expected: { lines: { 'Flat roof repair labor':20000, 'Flat roof repair materials':4000, Markup:7200 }, mid:310, low:280, high:340 }
  },
  {
    name: 'interior painting',
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: { areaInputMethod:'sqft', floorAreaSqft:500, wallHeight:'standard', surfaceCondition:'good', coats:2, ceilingsIncluded:false, trimIncluded:true, roomCount:3 },
    ownerPricing: { laborPerFloorSqft:200, materialPerFloorSqft2Coats:60, minimumJob:0, trimLaborPerLF:125, trimMaterialPerLF:50, trimLinearFeetPerRoom:60 },
    businessDefaults: defaults,
    expected: { lines: { 'Wall labor':100000, 'Wall paint/materials':30000, 'Trim labor':22500, 'Trim materials':9000, Markup:48450 }, mid:2100, low:1890, high:2310 }
  },
  {
    name: 'exterior painting',
    serviceType: 'EXTERIOR_PAINTING',
    customerInputs: { areaInputMethod:'sqft', exteriorAreaSqft:1000, stories:1, surfaceCondition:'good', coats:2 },
    ownerPricing: { exteriorLaborPerSqft:200, materialPerSqftPerCoat:50, minimumJob:0 },
    businessDefaults: defaults,
    expected: { lines: { 'Exterior labor':200000, 'Exterior materials':100000, Markup:90000 }, mid:3900, low:3510, high:4290 }
  },
  {
    name: 'flooring install',
    serviceType: 'FLOORING_INSTALL',
    customerInputs: { sqft:300, sqftMethod:'exact', newFlooringType:'vinyl_plank', existingFloorType:'bare', removalNeeded:false, roomCount:1, layoutPattern:'straight', stairSteps:0 },
    ownerPricing: { laborPerSqft:300, materialPerSqft:500, minimumJob:0 },
    businessDefaults: defaults,
    expected: { lines: { 'Flooring labor':90000, 'Flooring materials':162000, Markup:75600 }, mid:3280, low:2950, high:3610 }
  },
  {
    name: 'flooring replacement',
    serviceType: 'FLOORING_REPLACEMENT',
    customerInputs: { sqft:300, sqftMethod:'exact', newFlooringType:'tile', existingFloorType:'vinyl', removalNeeded:true, roomCount:1, layoutPattern:'straight', stairSteps:0, subfloorIssues:true },
    ownerPricing: { laborPerSqft:300, materialPerSqft:500, minimumJob:0, removalPerSqft:100, subfloorAllowancePerSqft:200 },
    businessDefaults: defaults,
    expected: { lines: { 'Flooring labor':90000, 'Flooring materials':168000, 'Existing flooring removal':30000, 'Subfloor allowance':60000, Markup:104400 }, mid:4520, low:4070, high:4970 }
  },
  {
    name: 'fencing install',
    serviceType: 'FENCING_INSTALL',
    customerInputs: { linearFeet:100, lfMethod:'exact', fenceType:'wood', fenceHeight:6, gateCount:1, cornerCount:4, terrainSlope:'flat' },
    ownerPricing: { laborPerLinearFoot:1000, materialPerLinearFoot:2000, postSpacing:10, postPrice:2500, concretePerPost:700, postsIncludedInMaterial:false, gatePrice:25000, minimumJob:0 },
    businessDefaults: defaults,
    expected: { lines: { 'Fence labor':100000, 'Fence materials':200000, Posts:42500, 'Concrete footings':11900, Gates:25000, Markup:113820 }, mid:4930, low:4440, high:5420 }
  },
  {
    name: 'fencing replacement',
    serviceType: 'FENCING_REPLACEMENT',
    customerInputs: { linearFeet:100, lfMethod:'exact', fenceType:'wood', fenceHeight:6, gateCount:1, cornerCount:4, terrainSlope:'flat', oldFenceRemoval:true },
    ownerPricing: { laborPerLinearFoot:1000, materialPerLinearFoot:2000, postSpacing:10, postPrice:2500, concretePerPost:700, postsIncludedInMaterial:false, gatePrice:25000, minimumJob:0, removalPerLinearFoot:500, disposalPerLF:200 },
    businessDefaults: defaults,
    expected: { lines: { 'Fence labor':100000, 'Fence materials':200000, Posts:42500, 'Concrete footings':11900, Gates:25000, 'Old fence removal':50000, Disposal:20000, Markup:134820 }, mid:5840, low:5260, high:6420 }
  },
  {
    name: 'build guide Test 2 concrete driveway',
    serviceType: 'CONCRETE_DRIVEWAY',
    customerInputs: { dimensionMethod:'exact', length:50, width:11, thickness:4, finishType:'broom', demolitionNeeded:false, reinforcement:'wire_mesh', accessDifficulty:'easy', baseNeeded:true },
    ownerPricing: { laborPerSqft:600, concreteCostPerCubicYard:18000, formworkPerLF:2500, minimumJob:0, basePrepPerSqft:175, wireReinforcementPerSqft:150, concreteWasteFactor:0.10 },
    businessDefaults: { ...defaults, taxMode:'TAX_MATERIALS', taxPercent:8 },
    expected: { lines: { 'Concrete labor':330000, Concrete:134444, Formwork:305000, 'Base prep':96250, 'Wire mesh reinforcement':82500, Markup:284458, Tax:54282 }, mid:12870, low:11580, high:14160 }
  },
  {
    name: 'concrete patio slab',
    serviceType: 'CONCRETE_PATIO_SLAB',
    customerInputs: { dimensionMethod:'exact', length:20, width:10, thickness:4, finishType:'broom', reinforcement:'none', accessDifficulty:'easy', baseNeeded:true },
    ownerPricing: { laborPerSqft:600, concreteCostPerCubicYard:18000, formworkPerLF:2500, minimumJob:0, basePrepPerSqft:175, concreteWasteFactor:0.10 },
    businessDefaults: defaults,
    expected: { lines: { 'Concrete labor':120000, Concrete:48889, Formwork:150000, 'Base prep':35000, Markup:106167 }, mid:4600, low:4140, high:5060 }
  },
  {
    name: 'landscaping cleanup',
    serviceType: 'LANDSCAPING_CLEANUP',
    customerInputs: { yardSize:1500, debrisLevel:'heavy', slope:'flat', haulAway:false },
    ownerPricing: { cleanupBaseRatePerSqft:10, debrisPricing:{ heavy:{ laborMultiplier:2, disposalFlat:15000 } }, minimumServiceCharge:0 },
    businessDefaults: defaults,
    expected: { lines: { 'Cleanup labor':30000, 'Debris disposal':15000, Markup:13500 }, mid:590, low:530, high:650 }
  },
  {
    name: 'landscaping mulch',
    serviceType: 'LANDSCAPING_MULCH',
    customerInputs: { inputMethod:'sqft', mulchArea:300, mulchDepth:3, mulchType:'brown', bedCondition:'clean', edgingNeeded:false },
    ownerPricing: { mulchMaterialPerYard:{ brown:5000 }, mulchInstallLaborPerYard:3000, minimumServiceCharge:0 },
    businessDefaults: defaults,
    expected: { lines: { 'Mulch material':15972, 'Mulch install labor':8333, Markup:7292 }, mid:320, low:290, high:350 }
  },
  {
    name: 'landscaping sod',
    serviceType: 'LANDSCAPING_SOD',
    customerInputs: { sodSqft:1000, sqftMethod:'exact', groundPrepNeeded:true, slope:'flat', accessDifficulty:'easy' },
    ownerPricing: { sodMaterialPerSqft:75, sodInstallLaborPerSqft:125, minimumServiceCharge:0, groundPrepPerSqft:50 },
    businessDefaults: defaults,
    expected: { lines: { 'Sod material':78750, 'Sod install labor':125000, 'Ground prep':50000, Markup:76125 }, mid:3300, low:2970, high:3630 }
  },
  {
    name: 'landscaping planting',
    serviceType: 'LANDSCAPING_PLANTING',
    customerInputs: { plantCount:10, plantSize:'small', bedCondition:'clean', mulchNeeded:false },
    ownerPricing: { plantingLaborPerPlant:{ small:1000 }, plantMaterialAllowance:{ small:500 }, minimumServiceCharge:0 },
    businessDefaults: defaults,
    expected: { lines: { 'Planting labor':10000, 'Plant allowance':5000, Markup:4500 }, mid:200, low:180, high:220 }
  },
  {
    name: 'landscaping mowing',
    serviceType: 'LANDSCAPING_MOWING',
    customerInputs: { yardSqft:5000, sqftMethod:'exact', serviceFrequency:'weekly', grassCondition:'maintained', bagClippings:false, edgingIncluded:false },
    ownerPricing: { mowingBaseRatePerSqft:2, minimumServiceCharge:0, frequencyMultipliers:{ weekly:1 }, overgrowthMultipliers:{ maintained:1 } },
    businessDefaults: defaults,
    expected: { lines: { 'Mowing labor':10000, Markup:3000 }, mid:130, low:120, high:140 }
  },
  {
    name: 'siding replacement',
    serviceType: 'SIDING_REPLACEMENT',
    customerInputs: { areaInputMethod:'sqft', sidingAreaSqft:1000, sidingType:'vinyl', stories:1, oldSidingRemoval:false, trimIncluded:false },
    ownerPricing: { laborPerSqft:{ vinyl:400 }, materialPerSqft:{ vinyl:700 }, minimumJob:0 },
    businessDefaults: defaults,
    expected: { lines: { 'Siding labor':400000, 'Siding material':770000, Markup:351000 }, mid:15210, low:13690, high:16730 }
  },
  {
    name: 'siding repair',
    serviceType: 'SIDING_REPAIR',
    customerInputs: { affectedArea:10, sidingType:'vinyl', damageLevel:'minor', stories:1 },
    ownerPricing: { laborHourlyRate:10000, repairMinimum:0, repairHours:{ minor:{ small:2, medium:4, large:8 } }, materialAllowance:{ minor:{ small:5000, medium:10000, large:20000 } } },
    businessDefaults: defaults,
    expected: { lines: { 'Siding repair labor':20000, 'Siding repair materials':5000, Markup:7500 }, mid:330, low:300, high:360 }
  },
  {
    name: 'custom flat service',
    serviceType: 'CUSTOM',
    customerInputs: { service:'Handyman', unit:'flat' },
    ownerPricing: { low:10000, high:20000, unit:'flat' },
    businessDefaults: defaults,
    expected: { lines: { Handyman:15000, Markup:4500 }, mid:200, low:180, high:220 }
  }
];

for (const item of serviceCases) {
  test(item.name, () => {
    const result = generateQuote(item);
    assertReady(result, item.expected);
  });
}

test('minimum fields must be present, but zero means no minimum', () => {
  const ready = generateQuote({
    serviceType:'INTERIOR_PAINTING',
    customerInputs:{ areaInputMethod:'sqft', floorAreaSqft:100, wallHeight:'standard', surfaceCondition:'good', coats:2, ceilingsIncluded:false, trimIncluded:false },
    ownerPricing:{ laborPerFloorSqft:200, materialPerFloorSqft2Coats:60, minimumJob:0 },
    businessDefaults:defaults
  });
  const missingMinimum = generateQuote({
    serviceType:'INTERIOR_PAINTING',
    customerInputs:{ areaInputMethod:'sqft', floorAreaSqft:100, wallHeight:'standard', surfaceCondition:'good', coats:2, ceilingsIncluded:false, trimIncluded:false },
    ownerPricing:{ laborPerFloorSqft:200, materialPerFloorSqft2Coats:60 },
    businessDefaults:defaults
  });
  const zeroRate = generateQuote({
    serviceType:'INTERIOR_PAINTING',
    customerInputs:{ areaInputMethod:'sqft', floorAreaSqft:100, wallHeight:'standard', surfaceCondition:'good', coats:2, ceilingsIncluded:false, trimIncluded:false },
    ownerPricing:{ laborPerFloorSqft:0, materialPerFloorSqft2Coats:60, minimumJob:0 },
    businessDefaults:defaults
  });
  assert.equal(ready.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(missingMinimum.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(missingMinimum.missingOwnerFields, ['minimumJob']);
  assert.equal(zeroRate.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(zeroRate.missingOwnerFields, ['laborPerFloorSqft']);
});

test('cleanup disposal flat is not multiplied by 100', () => {
  const result = generateQuote(serviceCases.find(item => item.serviceType === 'LANDSCAPING_CLEANUP'));
  assert.equal(lineItemsByName(result)['Debris disposal'], 15000);
});

test('per-service minimums are enforced', () => {
  const minimumJob = generateQuote({ serviceType:'INTERIOR_PAINTING', customerInputs:{ areaInputMethod:'sqft', floorAreaSqft:10, wallHeight:'standard', surfaceCondition:'good', coats:1, ceilingsIncluded:false, trimIncluded:false }, ownerPricing:{ laborPerFloorSqft:100, materialPerFloorSqft2Coats:50, minimumJob:35000 }, businessDefaults:defaults });
  const repairMinimum = generateQuote({ serviceType:'ROOFING_REPAIR', customerInputs:{ repairType:'shingles', affectedArea:10, roofType:'asphalt', pitch:'low', stories:1, leakPresent:false }, ownerPricing:{ laborHourlyRate:10000, repairMinimum:50000, repairHours:{ shingles:{ small:1 } }, repairMaterialAllowance:{ shingles:1000 } }, businessDefaults:defaults });
  const serviceMinimum = generateQuote({ serviceType:'LANDSCAPING_MOWING', customerInputs:{ yardSqft:1000, sqftMethod:'exact', serviceFrequency:'weekly', grassCondition:'maintained', bagClippings:false, edgingIncluded:false }, ownerPricing:{ mowingBaseRatePerSqft:1, minimumServiceCharge:25000, frequencyMultipliers:{ weekly:1 }, overgrowthMultipliers:{ maintained:1 } }, businessDefaults:defaults });
  assert.equal(lineItemsByName(minimumJob)['Minimum Price Adjustment'], 34305);
  assert.equal(lineItemsByName(repairMinimum)['Minimum Price Adjustment'], 35700);
  assert.equal(lineItemsByName(serviceMinimum)['Minimum Price Adjustment'], 23700);
});

test('interior painting sqft path with trim has no NaN line items', () => {
  const result = generateQuote(serviceCases.find(item => item.serviceType === 'INTERIOR_PAINTING'));
  assert.deepEqual(result.lineItems.map(item => Number.isNaN(item.amountCents)), [false, false, false, false, false]);
});

test('TAX_ALL applies minimum pre-tax', () => {
  const result = generateQuote({ serviceType:'INTERIOR_PAINTING', customerInputs:{ areaInputMethod:'sqft', floorAreaSqft:10, wallHeight:'standard', surfaceCondition:'good', coats:1, ceilingsIncluded:false, trimIncluded:false }, ownerPricing:{ laborPerFloorSqft:100, materialPerFloorSqft2Coats:50, minimumJob:35000 }, businessDefaults:{ ...defaults, taxMode:'TAX_ALL', taxPercent:10 } });
  assert.equal(lineItemsByName(result)['Minimum Price Adjustment'], 34305);
  assert.equal(lineItemsByName(result).Tax, 3500);
});

test('TAX_MATERIALS taxes the marked-up material base', () => {
  const result = generateQuote(serviceCases.find(item => item.serviceType === 'CONCRETE_DRIVEWAY'));
  assert.equal(lineItemsByName(result).Tax, 54282);
});

test('TAX_NONE produces no tax line', () => {
  const result = generateQuote(serviceCases.find(item => item.serviceType === 'ROOFING_REPLACEMENT'));
  assert.equal(Object.hasOwn(lineItemsByName(result), 'Tax'), false);
});

test('every formula price field appears in its required owner field list', () => {
  const formulaFields = Object.fromEntries(serviceCases.map(item => [item.serviceType, Object.keys(item.ownerPricing).filter(field => !['tiers', 'concreteWasteFactor', 'disposalPerLF'].includes(field))]));
  const missingByService = serviceCases.map(item => {
    const required = getRequiredOwnerFields(item.serviceType, item.customerInputs);
    return [item.serviceType, formulaFields[item.serviceType].filter(field => !required.includes(field))];
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
  const good = lineItemsByName(result.options[0]);
  const better = lineItemsByName(result.options[1]);
  assert.equal(good['Fence labor'], better['Fence labor']);
  assert.equal(good.Posts, better.Posts);
  assert.equal(good['Concrete footings'], better['Concrete footings']);
  assert.equal(good.Gates, better.Gates);
  assert.equal(good['Fence materials'], 200000);
  assert.equal(better['Fence materials'], 300000);
});
