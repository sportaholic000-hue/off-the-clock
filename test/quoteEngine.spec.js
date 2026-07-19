import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQuote } from '../server/quoteEngine.js';

const defaults = { markupPercent: 30, markupMode: 'markup', taxMode: 'TAX_NONE', minimumJobPrice: 0, rangeBufferPercent: 10 };

test('LANDSCAPING_CLEANUP disposal flat is not multiplied by 100', () => {
  const result = generateQuote({ serviceType:'LANDSCAPING_CLEANUP', customerInputs:{ yardSize:1500, debrisLevel:'heavy', slope:'flat', haulAway:false }, ownerPricing:{ cleanupBaseRatePerSqft:10, debrisPricing:{ heavy:{ laborMultiplier:1, disposalFlat:15000 } }, minimumServiceCharge:0 }, businessDefaults:defaults });
  const disposal = result.lineItems.find(i => i.name === 'Debris disposal');
  assert.equal(disposal.amountCents, 15000);
});

test('INTERIOR_PAINTING sqft path with trim has no NaN line items', () => {
  const result = generateQuote({ serviceType:'INTERIOR_PAINTING', customerInputs:{ areaInputMethod:'sqft', floorAreaSqft:500, wallHeight:'standard', surfaceCondition:'good', coats:2, ceilingsIncluded:false, trimIncluded:true, roomCount:3 }, ownerPricing:{ laborPerFloorSqft:200, materialPerFloorSqft2Coats:60, minimumJob:0, trimLaborPerLF:125, trimMaterialPerLF:50, trimLinearFeetPerRoom:60 }, businessDefaults:defaults });
  for (const item of result.lineItems) assert.equal(Number.isNaN(item.amountCents), false, item.name);
});

test('minimumJob is enforced', () => {
  const result = generateQuote({ serviceType:'INTERIOR_PAINTING', customerInputs:{ areaInputMethod:'sqft', floorAreaSqft:10, wallHeight:'standard', surfaceCondition:'good', coats:1, ceilingsIncluded:false, trimIncluded:false }, ownerPricing:{ laborPerFloorSqft:100, materialPerFloorSqft2Coats:50, minimumJob:35000 }, businessDefaults:defaults });
  assert.ok(result.lineItems.some(i => i.category === 'minimum_adjustment'));
  assert.ok(result.midEstimate >= 350);
});

test('TAX_ALL applies minimum before tax', () => {
  const result = generateQuote({ serviceType:'INTERIOR_PAINTING', customerInputs:{ areaInputMethod:'sqft', floorAreaSqft:10, wallHeight:'standard', surfaceCondition:'good', coats:1, ceilingsIncluded:false, trimIncluded:false }, ownerPricing:{ laborPerFloorSqft:100, materialPerFloorSqft2Coats:50, minimumJob:35000 }, businessDefaults:{ ...defaults, taxMode:'TAX_ALL', taxPercent:10 } });
  const minimum = result.lineItems.find(i => i.category === 'minimum_adjustment');
  const tax = result.lineItems.find(i => i.category === 'tax');
  assert.ok(minimum);
  assert.equal(tax.amountCents, 3500);
});

test('TAX_MATERIALS taxes marked-up material base and minimum after tax', () => {
  const result = generateQuote({ serviceType:'CONCRETE_DRIVEWAY', customerInputs:{ dimensionMethod:'exact', length:50, width:11, thickness:4, finishType:'broom', reinforcement:'wire_mesh', baseNeeded:true, demolitionNeeded:false, accessDifficulty:'easy' }, ownerPricing:{ laborPerSqft:600, concreteCostPerCubicYard:18000, formworkPerLF:2500, wireReinforcementPerSqft:150, basePrepPerSqft:175, concreteWasteFactor:0.10, assumedDrivewayWidthFt:11, minimumJob:0 }, businessDefaults:{ ...defaults, taxMode:'TAX_MATERIALS', taxPercent:8 } });
  assert.ok(result.lineItems.find(i => i.category === 'tax').amountCents > 0);
});

test('tier overrides produce distinct options', () => {
  const result = generateQuote({ serviceType:'FENCING_INSTALL', customerInputs:{ linearFeet:100, lfMethod:'exact', fenceType:'wood', fenceHeight:6, gateCount:1, cornerCount:4, terrainSlope:'flat' }, ownerPricing:{ laborPerLinearFoot:1000, materialPerLinearFoot:2000, postSpacing:8, postPrice:2500, concretePerPost:700, postsIncludedInMaterial:false, gatePrice:25000, minimumJob:0, tiers:[{ name:'Good', overrides:{ materialPerLinearFoot:2000 } }, { name:'Better', overrides:{ materialPerLinearFoot:3000 } }] }, businessDefaults:defaults });
  assert.equal(result.options.length, 2);
  assert.notEqual(result.options[0].midEstimate, result.options[1].midEstimate);
});

for (const serviceType of ['ROOFING_REPLACEMENT','ROOFING_REPAIR','FLAT_ROOF_REPLACEMENT','FLAT_ROOF_REPAIR','EXTERIOR_PAINTING','FLOORING_INSTALL','FLOORING_REPLACEMENT','FENCING_REPLACEMENT','CONCRETE_PATIO_SLAB','LANDSCAPING_MULCH','LANDSCAPING_SOD','LANDSCAPING_PLANTING','LANDSCAPING_MOWING','SIDING_REPLACEMENT','SIDING_REPAIR','CUSTOM']) {
  test(`${serviceType} review path returns one of two result types`, () => {
    const result = generateQuote({ serviceType, customerInputs:{}, ownerPricing:{}, businessDefaults:defaults });
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  });
}
