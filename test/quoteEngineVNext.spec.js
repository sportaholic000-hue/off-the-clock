import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MEASUREMENT_CONTRACTS,
  PRICE_BASIS_CATEGORIES,
  SERVICE_TYPES,
  TAXABILITY_CATEGORIES,
  generateQuoteVNext,
  getVNextPriceBookMetadata,
  previewFromVNextPricebook,
  quoteFromVNextPricebook,
  sanitizeForCustomerVNext,
  validateBusinessDefaults,
  validateCustomerInputs,
  validateVNextPricebook,
  vNextServiceStatus,
  withClass2Defaults
} from '../server/quote-engine-vnext/index.js';

const feeRules = {
  travel: 'not_applicable',
  disposal: 'not_applicable',
  permit: 'not_applicable',
  overhead: 'not_applicable'
};

const costBasis = Object.fromEntries(PRICE_BASIS_CATEGORIES.map(category => [category, 'cost']));
const sellBasis = Object.fromEntries(PRICE_BASIS_CATEGORIES.map(category => [category, 'sell_price']));
const taxability = Object.fromEntries(TAXABILITY_CATEGORIES.map(category => [category, ['material', 'addon'].includes(category)]));
const markupApplies = Object.fromEntries(PRICE_BASIS_CATEGORIES.map(category => [category, true]));

const defaults = {
  markupPercent: 0,
  markupMode: 'markup',
  overheadFixed: 0,
  minimumJobPrice: 0,
  travelFee: 0,
  disposalFee: 0,
  permitFee: 0,
  taxMode: 'TAX_NONE',
  taxPercent: 0,
  rangeBufferPercent: 10,
  markupApplies,
  peakMonths: [],
  peakSurchargePercent: 0
};

function service(serviceType, pricing, overrides = {}) {
  return {
    active: true,
    serviceType,
    service: serviceType,
    pricing: withClass2Defaults(serviceType, pricing),
    feeRules: structuredClone(feeRules),
    priceBasisByCategory: structuredClone(costBasis),
    taxabilityByCategory: structuredClone(taxability),
    peakMonths: [],
    peakSurchargePercent: 0,
    ...overrides
  };
}

function lineMap(result) {
  return Object.fromEntries(result.lineItems.map(line => [line.name, line.amountCents]));
}

function quote(entry, overrides = {}) {
  return generateQuoteVNext({
    serviceType: entry.serviceType,
    customerInputs: entry.customerInputs,
    ownerPricing: entry.ownerPricing,
    businessDefaults: defaults,
    currentMonth: 1,
    ...overrides
  });
}

const happyCases = [
  {
    name: 'roof replacement uses measured itemized accessory lengths',
    serviceType: 'ROOFING_REPLACEMENT',
    customerInputs: {
      roofSizeMethod: 'roof_measured', roofSizeInput: 1000,
      existingRoofType: 'asphalt_shingle', replacementRoofType: 'asphalt_shingle',
      pitch: 'low', stories: 1, existingLayers: 1,
      roofComplexity: 'simple', serviceScope: 'full',
      starterLengthLF: 100, dripEdgeLengthLF: 100,
      ridgeCapLengthLF: 20, deckingSheets: 2
    },
    ownerPricing: service('ROOFING_REPLACEMENT', {
      laborPerSquare: { asphalt_shingle: 5000 },
      materialCostPerSquare: { asphalt_shingle: 10000 },
      tearOffPerSquare: { asphalt_shingle: 2000 },
      underlaymentPerSquare: { asphalt_shingle: 1500 },
      accessoryPricingMode: 'itemized', starterPerLF: 100,
      dripEdgePerLF: 200, ridgeCapPerLF: 300, deckingPerSheet: 5000
    }),
    expected: {
      lines: { 'Roofing labor': 50000, 'Field materials': 110000, 'Tear-off': 20000, Underlayment: 16500, 'Starter strip': 10000, 'Drip edge': 20000, 'Ridge cap': 6000, 'Decking replacement': 10000 },
      low: 2190, mid: 2430, high: 2670
    }
  },
  {
    name: 'roof repair maps the canonical medium size exactly',
    serviceType: 'ROOFING_REPAIR',
    customerInputs: { repairType: 'shingle_patch', repairSize: 'medium', roofType: 'asphalt_shingle', pitch: 'medium', stories: 2, leakPresent: false },
    ownerPricing: service('ROOFING_REPAIR', {
      laborHourlyRate: 10000, repairMinimum: 0,
      repairHours: { asphalt_shingle: { shingle_patch: { small: 2, medium: 4, large: 8 } } },
      repairMaterialAllowance: { asphalt_shingle: { shingle_patch: { small: 4000, medium: 8000, large: 16000 } } }
    }),
    expected: { lines: { 'Repair labor': 50600, 'Repair materials': 8000 }, low: 530, mid: 590, high: 650 }
  },
  {
    name: 'flat roof replacement uses measured area and layer count',
    serviceType: 'FLAT_ROOF_REPLACEMENT',
    customerInputs: { roofSqft: 1000, sqftMethod: 'exact', membraneType: 'epdm', existingLayers: 2, accessDifficulty: 'moderate', serviceScope: 'full', buildingType: 'residential' },
    ownerPricing: service('FLAT_ROOF_REPLACEMENT', {
      laborPerSqft: { epdm: 500, average: 500 }, membraneCostPerSqft: { epdm: 700, average: 700 },
      tearOffPerSqft: { epdm: 200, average: 200 }, minimumJob: 0,
      insulationPerSqft: 250, unknownMembraneRule: 'review'
    }),
    expected: { lines: { 'Flat roof labor': 575000, Membrane: 700000, 'Tear-off': 460000 }, low: 15620, mid: 17350, high: 19090 }
  },
  {
    name: 'flat roof repair consumes the selected nested size price',
    serviceType: 'FLAT_ROOF_REPAIR',
    customerInputs: { repairType: 'seam_patch', repairSize: 'small', membraneType: 'epdm', leakPresent: false, pondingWater: false },
    ownerPricing: service('FLAT_ROOF_REPAIR', {
      laborHourlyRate: 10000, repairMinimum: 0,
      patchRepairHours: { epdm: { seam_patch: { small: 3, medium: 5, large: 8 } } },
      patchMaterialAllowance: { epdm: { seam_patch: { small: 6000, medium: 9000, large: 14000 } } }
    }),
    expected: { lines: { 'Flat roof repair labor': 30000, 'Flat roof repair materials': 6000 }, low: 320, mid: 360, high: 400 }
  },
  {
    name: 'interior painting uses measured trim length',
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: { areaInputMethod: 'wall_sqft', wallAreaSqft: 500, wallHeight: 'standard', surfaceCondition: 'good', coats: 2, ceilingsIncluded: false, trimIncluded: true, trimLengthLF: 200 },
    ownerPricing: service('INTERIOR_PAINTING', {
      laborPerWallSqftPerCoat: 100, materialPerWallSqftPerCoat: 30,
      minimumJob: 0, laborHourlyRate: 10000,
      ceilingLaborPerSqftPerCoat: 100, ceilingMaterialPerSqftPerCoat: 30,
      trimLaborPerLF: 125, trimMaterialPerLF: 50
    }),
    expected: { lines: { 'Wall labor': 100000, 'Wall paint and materials': 30000, 'Trim labor': 25000, 'Trim materials': 10000 }, low: 1490, mid: 1650, high: 1820 }
  },
  {
    name: 'exterior painting records explicit prep and primer factors',
    serviceType: 'EXTERIOR_PAINTING',
    customerInputs: { areaInputMethod: 'wall_sqft', exteriorAreaSqft: 1000, stories: 2, surfaceCondition: 'poor', coats: 2 },
    ownerPricing: service('EXTERIOR_PAINTING', {
      exteriorLaborPerSqftPerCoat: 100, materialPerSqftPerCoat: 50,
      minimumJob: 0, laborHourlyRate: 10000
    }),
    expected: { lines: { 'Exterior labor': 330000, 'Exterior preparation': 200000, 'Exterior materials': 150000 }, low: 6120, mid: 6800, high: 7480 }
  },
  {
    name: 'flooring installation uses measured area and explicit vinyl rule',
    serviceType: 'FLOORING_INSTALL',
    customerInputs: { sqft: 300, sqftMethod: 'exact', newFlooringType: 'vinyl_plank', existingFloorType: 'none', removalNeeded: false, roomCount: 1, layoutPattern: 'straight', stairSteps: 0 },
    ownerPricing: service('FLOORING_INSTALL', {
      laborPerSqft: { vinyl_plank: 300 }, materialPerSqft: { vinyl_plank: 500 },
      minimumJob: 0, vinylPlankUnderlaymentRule: 'never_included'
    }),
    expected: { lines: { 'Flooring labor': 90000, 'Flooring materials': 162000 }, low: 2270, mid: 2520, high: 2770 }
  },
  {
    name: 'flooring replacement prices measured removal and subfloor scope',
    serviceType: 'FLOORING_REPLACEMENT',
    customerInputs: { sqft: 300, sqftMethod: 'exact', newFlooringType: 'tile', existingFloorType: 'vinyl', removalNeeded: true, roomCount: 2, layoutPattern: 'straight', stairSteps: 2, subfloorIssues: true, subfloorRepairAreaSqft: 30 },
    ownerPricing: service('FLOORING_REPLACEMENT', {
      laborPerSqft: { tile: 300 }, materialPerSqft: { tile: 500 }, minimumJob: 0,
      removalPerSqft: { vinyl: 100 }, perStepPrice: 10000,
      subfloorAllowancePerSqft: 200, vinylPlankUnderlaymentRule: 'never_included'
    }),
    expected: { lines: { 'Flooring labor': 99000, 'Flooring materials': 168000, 'Existing flooring removal': 30000, 'Stair installation': 20000, 'Subfloor repair allowance': 6000 }, low: 2910, mid: 3230, high: 3550 }
  },
  {
    name: 'fencing installation deducts measured gate openings from run pricing',
    serviceType: 'FENCING_INSTALL',
    customerInputs: { linearFeet: 100, lfMethod: 'exact', fenceType: 'wood', fenceHeight: 6, gateCount: 1, gateWidthTotalLF: 4, postCount: 17, cornerCount: 2, terrainSlope: 'flat' },
    ownerPricing: service('FENCING_INSTALL', {
      laborPerLinearFoot: { wood: 1000 }, materialPerLinearFoot: { wood: 2000 },
      postPrice: { wood: 2500 }, concretePerPost: 700,
      postsIncludedInMaterial: { wood: false }, gatePrice: { wood: 25000 }, minimumJob: 0
    }),
    expected: { lines: { 'Fence labor': 96000, 'Fence materials': 192000, 'Fence posts': 42500, 'Concrete footings': 11900, 'Installed gates': 25000 }, low: 3300, mid: 3670, high: 4040 }
  },
  {
    name: 'fencing replacement keeps removal tied to measured total length',
    serviceType: 'FENCING_REPLACEMENT',
    customerInputs: { linearFeet: 100, lfMethod: 'exact', fenceType: 'wood', fenceHeight: 6, gateCount: 1, gateWidthTotalLF: 4, postCount: 17, cornerCount: 2, terrainSlope: 'flat', oldFenceRemoval: true },
    ownerPricing: service('FENCING_REPLACEMENT', {
      laborPerLinearFoot: { wood: 1000 }, materialPerLinearFoot: { wood: 2000 },
      postPrice: { wood: 2500 }, concretePerPost: 700,
      postsIncludedInMaterial: { wood: false }, gatePrice: { wood: 25000 },
      minimumJob: 0, removalPerLinearFoot: { wood: 500 }
    }),
    expected: { lines: { 'Fence labor': 96000, 'Fence materials': 192000, 'Fence posts': 42500, 'Concrete footings': 11900, 'Installed gates': 25000, 'Old fence removal': 50000 }, low: 3750, mid: 4170, high: 4590 }
  },
  {
    name: 'concrete driveway uses measured dimensions and correct waste addition',
    serviceType: 'CONCRETE_DRIVEWAY',
    customerInputs: { dimensionMethod: 'exact', length: 50, width: 10, thickness: 4, finishType: 'broom', demolitionNeeded: false, reinforcement: 'wire_mesh', accessDifficulty: 'easy', baseNeeded: true },
    ownerPricing: service('CONCRETE_DRIVEWAY', {
      laborPerSqft: 600, concreteCostPerCubicYard: 18000,
      formworkPerLF: 2500, minimumJob: 0, basePrepPerSqft: 175,
      wireReinforcementPerSqft: 150
    }),
    expected: { lines: { 'Concrete labor': 300000, 'Ready-mix concrete': 122222, Formwork: 300000, 'Base preparation': 87500, 'Wire mesh reinforcement': 75000 }, low: 7970, mid: 8850, high: 9740 }
  },
  {
    name: 'concrete patio uses measured rectangular perimeter',
    serviceType: 'CONCRETE_PATIO_SLAB',
    customerInputs: { dimensionMethod: 'exact', length: 20, width: 10, thickness: 4, finishType: 'broom', demolitionNeeded: false, reinforcement: 'none', accessDifficulty: 'easy', baseNeeded: true },
    ownerPricing: service('CONCRETE_PATIO_SLAB', {
      laborPerSqft: 600, concreteCostPerCubicYard: 18000,
      formworkPerLF: 2500, minimumJob: 0, basePrepPerSqft: 175
    }),
    expected: { lines: { 'Concrete labor': 120000, 'Ready-mix concrete': 48889, Formwork: 150000, 'Base preparation': 35000 }, low: 3190, mid: 3540, high: 3890 }
  },
  {
    name: 'cleanup disposal remains integer cents with explicit debris pricing',
    serviceType: 'LANDSCAPING_CLEANUP',
    customerInputs: { yardSqft: 1000, sqftMethod: 'exact', debrisLevel: 'heavy', slope: 'flat', haulAway: true },
    ownerPricing: service('LANDSCAPING_CLEANUP', {
      cleanupBaseRatePerSqft: 10,
      debrisPricing: {
        light: { laborMultiplier: 1, disposalFlat: 5000 },
        moderate: { laborMultiplier: 1.5, disposalFlat: 10000 },
        heavy: { laborMultiplier: 2, disposalFlat: 15000 }
      },
      minimumServiceCharge: 0, haulAwayFee: 5000
    }),
    expected: { lines: { 'Cleanup labor': 20000, 'Debris disposal': 15000, 'Additional haul-away': 5000 }, low: 360, mid: 400, high: 440 }
  },
  {
    name: 'mulch bed preparation uses direct condition pricing without hidden multiplier',
    serviceType: 'LANDSCAPING_MULCH',
    customerInputs: { inputMethod: 'sqft', mulchArea: 270, mulchDepth: 3, mulchType: 'brown', bedCondition: 'needs_weeding', bedSqft: 270, edgingNeeded: true, edgeLF: 100 },
    ownerPricing: service('LANDSCAPING_MULCH', {
      mulchMaterialPerYard: { brown: 5000 }, mulchInstallLaborPerYard: 3000,
      minimumServiceCharge: 0,
      bedPrepLaborPerSqft: { needs_weeding: 20, overgrown: 40 },
      edgingPerLinearFoot: 50
    }),
    expected: { lines: { 'Bed preparation': 5400, 'Mulch material': 14375, 'Mulch installation labor': 7500, 'Bed edging': 5000 }, low: 290, mid: 320, high: 350 }
  },
  {
    name: 'sod installation uses measured area',
    serviceType: 'LANDSCAPING_SOD',
    customerInputs: { sodSqft: 1000, sqftMethod: 'exact', groundPrepNeeded: true, slope: 'flat', accessDifficulty: 'easy' },
    ownerPricing: service('LANDSCAPING_SOD', { sodMaterialPerSqft: 75, sodInstallLaborPerSqft: 125, minimumServiceCharge: 0, groundPrepPerSqft: 50 }),
    expected: { lines: { 'Sod material': 78750, 'Sod installation labor': 125000, 'Ground preparation': 50000 }, low: 2290, mid: 2540, high: 2790 }
  },
  {
    name: 'planting prices each measured plant-size count',
    serviceType: 'LANDSCAPING_PLANTING',
    customerInputs: { plantsBySize: { small: 2, medium: 1, large: 1 }, bedCondition: 'needs_weeding', bedSqft: 100, mulchNeeded: true, mulchYards: 2, mulchType: 'brown' },
    ownerPricing: service('LANDSCAPING_PLANTING', {
      plantingLaborPerPlant: { small: 1000, medium: 2000, large: 3000 },
      plantMaterialAllowance: { small: 500, medium: 1000, large: 1500 },
      minimumServiceCharge: 0,
      bedPrepLaborPerSqft: { needs_weeding: 20, overgrown: 40 },
      mulchMaterialPerYard: { brown: 5000 }, mulchInstallLaborPerYard: 3000
    }),
    expected: { lines: { 'Small plant installation labor': 2000, 'Small plant material allowance': 1000, 'Medium plant installation labor': 2000, 'Medium plant material allowance': 1000, 'Large plant installation labor': 3000, 'Large plant material allowance': 1500, 'Bed preparation': 2000, 'Mulch material': 11500, 'Mulch installation labor': 6000 }, low: 270, mid: 300, high: 330 }
  },
  {
    name: 'mowing uses measured lawn and edging lengths',
    serviceType: 'LANDSCAPING_MOWING',
    customerInputs: { yardSqft: 5000, sqftMethod: 'exact', serviceFrequency: 'weekly', grassCondition: 'maintained', bagClippings: true, edgingIncluded: true, edgingLengthLF: 100 },
    ownerPricing: service('LANDSCAPING_MOWING', {
      mowingBaseRatePerSqft: 2, minimumServiceCharge: 0,
      frequencyMultipliers: { weekly: 1, biweekly: 1.2, monthly: 1.5, one_time: 1.8 },
      overgrowthMultipliers: { maintained: 1, overgrown: 1.5, severe: 2 },
      baggingSurchargePercent: 10, edgingPerLinearFoot: 50
    }),
    expected: { lines: { 'Mowing labor': 10000, 'Clipping bagging and disposal': 1000, 'Lawn edging': 5000 }, low: 140, mid: 160, high: 180 }
  },
  {
    name: 'siding replacement uses measured wall and trim lengths',
    serviceType: 'SIDING_REPLACEMENT',
    customerInputs: { areaInputMethod: 'sqft', sidingAreaSqft: 1000, sidingType: 'vinyl', stories: 1, oldSidingRemoval: true, trimIncluded: true, trimLengthLF: 200 },
    ownerPricing: service('SIDING_REPLACEMENT', {
      laborPerSqft: { vinyl: 400 }, materialPerSqft: { vinyl: 700 },
      minimumJob: 0, removalPerSqft: 100, trimPerLinearFoot: 100
    }),
    expected: { lines: { 'Siding labor': 400000, 'Siding materials': 770000, 'Old siding removal': 100000, 'Siding trim': 20000 }, low: 11610, mid: 12900, high: 14190 }
  },
  {
    name: 'siding repair consumes material-type and damage-specific rates',
    serviceType: 'SIDING_REPAIR',
    customerInputs: { sidingType: 'vinyl', damageLevel: 'minor', repairSize: 'medium', stories: 2 },
    ownerPricing: service('SIDING_REPAIR', {
      laborHourlyRate: 10000, repairMinimum: 0,
      repairHours: { vinyl: { minor: { small: 2, medium: 4, large: 8 } } },
      materialAllowance: { vinyl: { minor: { small: 5000, medium: 10000, large: 20000 } } }
    }),
    expected: { lines: { 'Siding repair labor': 44000, 'Siding repair materials': 10000 }, low: 490, mid: 540, high: 590 }
  },
  {
    name: 'custom fixed hourly service honors exact configured unit',
    serviceType: 'CUSTOM',
    customerInputs: { service: 'Finish carpentry', serviceConfirmed: true, unit: 'per_hour', hours: 4 },
    ownerPricing: service('CUSTOM', { customPricingMode: 'fixed', price: 10000, unit: 'per_hour', minimumJob: 0 }, { service: 'Finish carpentry' }),
    expected: { lines: { 'Finish carpentry': 40000 }, low: 360, mid: 400, high: 440 }
  }
];

for (const entry of happyCases) {
  test(`vNext hand calculation: ${entry.name}`, () => {
    const result = quote(entry);
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY');
    assert.deepEqual(lineMap(result), entry.expected.lines);
    assert.equal(result.lowEstimate, entry.expected.low);
    assert.equal(result.midEstimate, entry.expected.mid);
    assert.equal(result.highEstimate, entry.expected.high);
    assert.equal(result.calculationRecord.options[0].measurements.length > 0, true);
  });
}

const malformedCases = [
  ['ROOFING_REPLACEMENT', 'roofSizeInput', value => ({ ...value, roofSizeInput: 0 })],
  ['ROOFING_REPAIR', 'repairSize', value => ({ ...value, repairSize: 'Medium' })],
  ['FLAT_ROOF_REPLACEMENT', 'existingLayers', value => ({ ...value, existingLayers: 0 })],
  ['FLAT_ROOF_REPAIR', 'membraneType', value => ({ ...value, membraneType: 'NOT VALID' })],
  ['INTERIOR_PAINTING', 'coats', value => ({ ...value, coats: 4 })],
  ['EXTERIOR_PAINTING', 'exteriorAreaSqft', value => ({ ...value, exteriorAreaSqft: Infinity })],
  ['FLOORING_INSTALL', 'sqft', value => ({ ...value, sqft: -1 })],
  ['FLOORING_REPLACEMENT', 'subfloorRepairAreaSqft', value => ({ ...value, subfloorRepairAreaSqft: value.sqft + 1 })],
  ['FENCING_INSTALL', 'gateWidthTotalLF', value => ({ ...value, gateWidthTotalLF: value.linearFeet })],
  ['FENCING_REPLACEMENT', 'cornerCount', value => ({ ...value, cornerCount: 1.5 })],
  ['CONCRETE_DRIVEWAY', 'thickness', value => ({ ...value, thickness: 1 })],
  ['CONCRETE_PATIO_SLAB', 'reinforcement', value => ({ ...value, reinforcement: 'mesh' })],
  ['LANDSCAPING_CLEANUP', 'debrisLevel', value => ({ ...value, debrisLevel: 'extreme' })],
  ['LANDSCAPING_MULCH', 'mulchDepth', value => ({ ...value, mulchDepth: 0 })],
  ['LANDSCAPING_SOD', 'sodSqft', value => ({ ...value, sodSqft: '1000' })],
  ['LANDSCAPING_PLANTING', 'plantsBySize', value => ({ ...value, plantsBySize: { small: 0, medium: 0, large: 0 } })],
  ['LANDSCAPING_MOWING', 'serviceFrequency', value => ({ ...value, serviceFrequency: 'sometimes' })],
  ['SIDING_REPLACEMENT', 'stories', value => ({ ...value, stories: 4 })],
  ['SIDING_REPAIR', 'repairSize', value => ({ ...value, repairSize: 75 })],
  ['CUSTOM', 'hours', value => ({ ...value, hours: 'half day' })]
];

for (const [serviceType, field, mutate] of malformedCases) {
  const entry = happyCases.find(candidate => candidate.serviceType === serviceType);
  test(`vNext negative control: ${serviceType} rejects malformed ${field}`, () => {
    const result = quote({ ...entry, customerInputs: mutate(entry.customerInputs) });
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(result.invalidCustomerFields.includes(field), true);
  });
}

const missingMeasurementCases = [
  ['ROOFING_REPLACEMENT', 'starterLengthLF'],
  ['ROOFING_REPAIR', 'repairSize'],
  ['FLAT_ROOF_REPLACEMENT', 'roofSqft'],
  ['FLAT_ROOF_REPAIR', 'repairSize'],
  ['INTERIOR_PAINTING', 'trimLengthLF'],
  ['EXTERIOR_PAINTING', 'exteriorAreaSqft'],
  ['FLOORING_INSTALL', 'sqft'],
  ['FLOORING_REPLACEMENT', 'subfloorRepairAreaSqft'],
  ['FENCING_INSTALL', 'gateWidthTotalLF'],
  ['FENCING_REPLACEMENT', 'linearFeet'],
  ['CONCRETE_DRIVEWAY', 'width'],
  ['CONCRETE_PATIO_SLAB', 'length'],
  ['LANDSCAPING_CLEANUP', 'yardSqft'],
  ['LANDSCAPING_MULCH', 'edgeLF'],
  ['LANDSCAPING_SOD', 'sodSqft'],
  ['LANDSCAPING_PLANTING', 'plantsBySize'],
  ['LANDSCAPING_MOWING', 'edgingLengthLF'],
  ['SIDING_REPLACEMENT', 'trimLengthLF'],
  ['SIDING_REPAIR', 'repairSize'],
  ['CUSTOM', 'hours']
];

for (const [serviceType, field] of missingMeasurementCases) {
  const entry = happyCases.find(candidate => candidate.serviceType === serviceType);
  test(`vNext sufficiency contract: ${serviceType} requires ${field}`, () => {
    const customerInputs = structuredClone(entry.customerInputs);
    delete customerInputs[field];
    const result = quote({ ...entry, customerInputs });
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(result.missingCustomerFields.includes(field), true);
  });
}

test('every built-in service has a documented measurement-sufficiency contract', () => {
  assert.deepEqual(Object.keys(MEASUREMENT_CONTRACTS).sort(), [...SERVICE_TYPES].sort());
  for (const serviceType of SERVICE_TYPES) {
    assert.equal(Object.keys(MEASUREMENT_CONTRACTS[serviceType].fields).length > 0, true, serviceType);
    for (const [name, definition] of Object.entries(MEASUREMENT_CONTRACTS[serviceType].fields)) {
      assert.equal(Boolean(definition.label), true, `${serviceType}.${name} label`);
      assert.equal(Boolean(definition.type), true, `${serviceType}.${name} type`);
    }
  }
});

test('area and perimeter shortcuts are inspection-first, never customer-ready', () => {
  const roofing = happyCases[0];
  const exterior = happyCases.find(entry => entry.serviceType === 'EXTERIOR_PAINTING');
  const concrete = happyCases.find(entry => entry.serviceType === 'CONCRETE_DRIVEWAY');
  const mowing = happyCases.find(entry => entry.serviceType === 'LANDSCAPING_MOWING');
  assert.equal(quote({ ...roofing, customerInputs: { ...roofing.customerInputs, roofSizeMethod: 'home_floor_area' } }).inspectionFirst, true);
  assert.equal(quote({ ...exterior, customerInputs: { ...exterior.customerInputs, areaInputMethod: 'homesize' } }).inspectionFirst, true);
  assert.equal(quote({ ...concrete, customerInputs: { ...concrete.customerInputs, dimensionMethod: 'area_only', areaSqft: 500 } }).inspectionFirst, true);
  assert.equal(quote({ ...mowing, customerInputs: { ...mowing.customerInputs, sqftMethod: 'assumption' } }).inspectionFirst, true);
});

test('itemized roofing has no square-root geometry and uses each measured length independently', () => {
  const source = readFileSync('server/quote-engine-vnext/templates.js', 'utf8');
  assert.equal(source.includes('Math.sqrt'), false);
  const entry = happyCases[0];
  const changed = quote({ ...entry, customerInputs: { ...entry.customerInputs, dripEdgeLengthLF: 125 } });
  assert.equal(lineMap(changed)['Drip edge'], 25000);
  assert.equal(lineMap(changed)['Starter strip'], 10000);
  assert.equal(lineMap(changed)['Ridge cap'], 6000);
});

test('selected mandatory scope never disappears when its owner rate is missing or zero', () => {
  const controls = [
    ['ROOFING_REPLACEMENT', 'dripEdgePerLF'],
    ['INTERIOR_PAINTING', 'trimLaborPerLF'],
    ['FLOORING_REPLACEMENT', 'subfloorAllowancePerSqft'],
    ['FENCING_REPLACEMENT', 'removalPerLinearFoot'],
    ['CONCRETE_DRIVEWAY', 'basePrepPerSqft'],
    ['LANDSCAPING_MULCH', 'bedPrepLaborPerSqft'],
    ['LANDSCAPING_SOD', 'groundPrepPerSqft'],
    ['SIDING_REPLACEMENT', 'trimPerLinearFoot']
  ];
  for (const [serviceType, field] of controls) {
    const entry = happyCases.find(candidate => candidate.serviceType === serviceType);
    for (const missingValue of [undefined, 0]) {
      const ownerPricing = structuredClone(entry.ownerPricing);
      if (field === 'removalPerLinearFoot') ownerPricing.pricing[field].wood = missingValue;
      else if (field === 'bedPrepLaborPerSqft') ownerPricing.pricing[field].needs_weeding = missingValue;
      else ownerPricing.pricing[field] = missingValue;
      const result = quote({ ...entry, ownerPricing });
      assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW', `${serviceType}.${field}=${missingValue}`);
    }
  }
});

test('repair sizes never coerce or fall through to large', () => {
  for (const serviceType of ['ROOFING_REPAIR', 'FLAT_ROOF_REPAIR', 'SIDING_REPAIR']) {
    const entry = happyCases.find(candidate => candidate.serviceType === serviceType);
    const invalid = quote({ ...entry, customerInputs: { ...entry.customerInputs, repairSize: '75' } });
    assert.equal(invalid.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(invalid.invalidCustomerFields.includes('repairSize'), true);
  }
});

test('partial flat-roof calculations require valid measured partial scope', () => {
  const entry = happyCases.find(candidate => candidate.serviceType === 'FLAT_ROOF_REPLACEMENT');
  const missing = { ...entry.customerInputs, serviceScope: 'partial' };
  const invalid = { ...missing, partialPercent: 0 };
  const valid = { ...missing, partialAreaSqft: 250 };
  assert.equal(quote({ ...entry, customerInputs: missing }).resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(quote({ ...entry, customerInputs: invalid }).resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(lineMap(quote({ ...entry, customerInputs: valid }))['Flat roof labor'], 143750);
});

test('custom service units require exact matching quantities and preserve configured ranges', () => {
  const ownerPricing = service('CUSTOM', { customPricingMode: 'range', low: 8000, high: 12000, unit: 'per_unit', minimumJob: 0 }, { service: 'Fixture install' });
  const customerInputs = { service: 'Fixture install', serviceConfirmed: true, unit: 'per_unit', itemCount: 3 };
  const result = generateQuoteVNext({ serviceType: 'CUSTOM', customerInputs, ownerPricing, businessDefaults: defaults, currentMonth: 1 });
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(result.lowEstimate, 240);
  assert.equal(result.midEstimate, 300);
  assert.equal(result.highEstimate, 360);
  const wrongUnit = generateQuoteVNext({ serviceType: 'CUSTOM', customerInputs: { ...customerInputs, unit: 'per_hour', hours: 3 }, ownerPricing, businessDefaults: defaults, currentMonth: 1 });
  assert.equal(wrongUnit.resultType, 'ESTIMATE_REQUIRES_REVIEW');
});

test('mulch prep has no hidden half-rate branch', () => {
  const source = readFileSync('server/quote-engine-vnext/templates.js', 'utf8');
  assert.equal(/bedCondition\s*===\s*['"]needs_weeding['"]\s*\?\s*0\.5/.test(source), false);
  const entry = happyCases.find(candidate => candidate.serviceType === 'LANDSCAPING_MULCH');
  assert.equal(lineMap(quote(entry))['Bed preparation'], 270 * 20);
});

test('vinyl-plank underlayment follows every explicit owner rule', () => {
  const base = happyCases.find(candidate => candidate.serviceType === 'FLOORING_INSTALL');
  const withPrice = rule => {
    const ownerPricing = structuredClone(base.ownerPricing);
    ownerPricing.pricing.vinylPlankUnderlaymentRule = rule;
    ownerPricing.pricing.underlaymentPerSqft = 50;
    return ownerPricing;
  };
  assert.equal(Object.hasOwn(lineMap(quote(base)), 'Underlayment'), false);
  assert.equal(lineMap(quote({ ...base, ownerPricing: withPrice('always_included') })).Underlayment, 16200);
  assert.equal(Object.hasOwn(lineMap(quote({ ...base, ownerPricing: withPrice('customer_selectable_addon'), customerInputs: { ...base.customerInputs, underlaymentSelected: false } })), 'Underlayment'), false);
  assert.equal(lineMap(quote({ ...base, ownerPricing: withPrice('customer_selectable_addon'), customerInputs: { ...base.customerInputs, underlaymentSelected: true } })).Underlayment, 16200);
  assert.equal(lineMap(quote({ ...base, ownerPricing: withPrice('subfloor_condition'), customerInputs: { ...base.customerInputs, subfloorCondition: 'requires_underlayment' } })).Underlayment, 16200);
  assert.equal(quote({ ...base, ownerPricing: withPrice('subfloor_condition'), customerInputs: { ...base.customerInputs, subfloorCondition: 'unknown' } }).resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(quote({ ...base, ownerPricing: withPrice('owner_review') }).inspectionFirst, true);
});

test('per-service taxability changes taxable subtotal and is preserved in the record', () => {
  const entry = happyCases.find(candidate => candidate.serviceType === 'INTERIOR_PAINTING');
  const taxedDefaults = { ...defaults, taxMode: 'TAX_MATERIALS', taxPercent: 10 };
  const materialTaxed = quote(entry, { businessDefaults: taxedDefaults });
  const noTaxOwner = structuredClone(entry.ownerPricing);
  noTaxOwner.taxabilityByCategory.material = false;
  const untaxed = quote({ ...entry, ownerPricing: noTaxOwner }, { businessDefaults: taxedDefaults });
  assert.equal(lineMap(materialTaxed).Tax, 4000);
  assert.equal(Object.hasOwn(lineMap(untaxed), 'Tax'), false);
  assert.equal(materialTaxed.calculationRecord.options[0].scenarios.mid.tax.taxableSubtotalCents, 40000);
});

test('sell-price categories are never marked up twice', () => {
  const entry = happyCases.find(candidate => candidate.serviceType === 'INTERIOR_PAINTING');
  const markedDefaults = { ...defaults, markupPercent: 30 };
  const cost = quote(entry, { businessDefaults: markedDefaults });
  const sellOwner = { ...entry.ownerPricing, priceBasisByCategory: structuredClone(sellBasis) };
  const sell = quote({ ...entry, ownerPricing: sellOwner }, { businessDefaults: markedDefaults });
  assert.equal(lineMap(cost).Markup, 49500);
  assert.equal(Object.hasOwn(lineMap(sell), 'Markup'), false);
  assert.deepEqual(sell.calculationRecord.options[0].scenarios.mid.markup.sellPriceLinesExcluded.sort(), ['Trim labor', 'Trim materials', 'Wall labor', 'Wall paint and materials'].sort());
});

test('minimum is pre-tax and every displayed range stays above the customer minimum floor', () => {
  const entry = happyCases.find(candidate => candidate.serviceType === 'INTERIOR_PAINTING');
  const ownerPricing = structuredClone(entry.ownerPricing);
  ownerPricing.pricing.minimumJob = 300000;
  const taxedDefaults = { ...defaults, taxMode: 'TAX_ALL', taxPercent: 10, rangeBufferPercent: 25 };
  const result = quote({ ...entry, ownerPricing }, { businessDefaults: taxedDefaults });
  assert.equal(lineMap(result)['Minimum price adjustment'], 135000);
  assert.equal(lineMap(result).Tax, 4000);
  assert.equal(result.lowEstimate, 3040);
  assert.equal(result.midEstimate, 3040);
  assert.equal(result.highEstimate >= result.midEstimate, true);
  assert.equal(result.calculationRecord.options[0].scenarios.mid.minimum.basis, 'pre_tax');
});

test('common fees obey service rules and per-quantity disposal cannot be charged twice', () => {
  const entry = happyCases.find(candidate => candidate.serviceType === 'FLOORING_REPLACEMENT');
  const feeDefaults = { ...defaults, travelFee: 5000, disposalFee: 10000, permitFee: 2000, overheadFixed: 3000 };
  const ownerPricing = structuredClone(entry.ownerPricing);
  ownerPricing.feeRules = { travel: 'always', disposal: 'when_scope_selected', permit: 'not_applicable', overhead: 'included_in_rates' };
  ownerPricing.pricing.disposalPerSqft = 25;
  const result = quote({ ...entry, ownerPricing }, { businessDefaults: feeDefaults });
  assert.equal(lineMap(result).Travel, 5000);
  assert.equal(lineMap(result)['Flooring disposal'], 7500);
  assert.equal(Object.keys(lineMap(result)).filter(name => name === 'Disposal').length, 0);
  const disposalRecord = result.calculationRecord.options[0].scenarios.mid.fees.find(fee => fee.fee === 'disposal');
  assert.equal(disposalRecord.replaced, true);
  assert.equal(disposalRecord.applied, false);
});

test('preview and live price-book paths use identical validation and calculation', () => {
  const entry = happyCases.find(candidate => candidate.serviceType === 'CONCRETE_PATIO_SLAB');
  const completeService = structuredClone(entry.ownerPricing);
  Object.assign(completeService.pricing, { demolitionPerSqft: 300, wireReinforcementPerSqft: 150, rebarReinforcementPerSqft: 250, stampedMaterialPerSqft: 100 });
  const pricebook = { defaults, services: [completeService] };
  const activation = vNextServiceStatus(completeService);
  assert.equal(activation.status, 'QUOTING LIVE', JSON.stringify(activation));
  const preview = previewFromVNextPricebook({ pricebook, serviceType: entry.serviceType, customerInputs: entry.customerInputs, currentMonth: 1 });
  const live = quoteFromVNextPricebook({ pricebook, serviceType: entry.serviceType, customerInputs: entry.customerInputs, callerType: 'owner', currentMonth: 1 });
  assert.equal(preview.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(preview));
  assert.equal(live.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(live));
  assert.deepEqual(lineMap(preview), lineMap(live));
  assert.deepEqual([preview.lowEstimate, preview.midEstimate, preview.highEstimate], [live.lowEstimate, live.midEstimate, live.highEstimate]);
});

test('inactive and AI-unconfirmed services cannot produce customer-ready quotes', () => {
  const entry = happyCases.find(candidate => candidate.serviceType === 'INTERIOR_PAINTING');
  const inactive = quote({ ...entry, ownerPricing: { ...entry.ownerPricing, active: false } });
  assert.equal(inactive.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  const aiService = { ...entry.ownerPricing, source: 'AI_SUGGESTED', confirmedFields: {} };
  const status = vNextServiceStatus(aiService);
  assert.equal(status.status, 'NEEDS PRICING');
});

test('customer payload remains strictly allowlisted while owner record remains complete', () => {
  const result = quote(happyCases[0]);
  const safe = sanitizeForCustomerVNext(result);
  const serialized = JSON.stringify(safe);
  for (const forbidden of ['lineItems', 'calculationRecord', 'rateCents', 'ratePath', 'appliedRules', 'urgencyFlags']) assert.equal(serialized.includes(forbidden), false, forbidden);
  assert.equal(result.calculationRecord.options[0].lineItems[0].calculation.rateCents, 5000);
  assert.equal(result.calculationRecord.options[0].scenarios.mid.tax.finalTotalCents, 242500);
});

test('missing optional add-ons stay disclosed and never throw', () => {
  const flat = happyCases.find(candidate => candidate.serviceType === 'FLAT_ROOF_REPAIR');
  const flatInputs = { ...flat.customerInputs, pondingWater: true };
  const flatResult = quote({ ...flat, customerInputs: flatInputs });
  assert.deepEqual(flatResult.options[0].skippedAddons, ['Ponding water surcharge']);
  assert.match(flatResult.options[0].disclaimer, /does not include: Ponding water surcharge/);

  const mowing = happyCases.find(candidate => candidate.serviceType === 'LANDSCAPING_MOWING');
  const ownerPricing = structuredClone(mowing.ownerPricing);
  delete ownerPricing.pricing.baggingSurchargePercent;
  delete ownerPricing.pricing.edgingPerLinearFoot;
  const mowingResult = quote({ ...mowing, ownerPricing });
  assert.deepEqual(mowingResult.options[0].skippedAddons.sort(), ['Clipping bagging and disposal', 'Lawn edging'].sort());
});

test('every tier validates effective pricing and only its explicit override changes', () => {
  const entry = happyCases.find(candidate => candidate.serviceType === 'SIDING_REPLACEMENT');
  const ownerPricing = structuredClone(entry.ownerPricing);
  ownerPricing.tiers = [
    { name: 'Good', overrides: {} },
    { name: 'Better', overrides: { materialPerSqft: { vinyl: 900 } } },
    { name: 'Broken', overrides: { laborPerSqft: { vinyl: 0 } } }
  ];
  const result = quote({ ...entry, ownerPricing });
  assert.equal(result.options.length, 2);
  assert.equal(lineMap(result.options[0])['Siding labor'], lineMap(result.options[1])['Siding labor']);
  assert.equal(lineMap(result.options[0])['Siding materials'], 770000);
  assert.equal(lineMap(result.options[1])['Siding materials'], 990000);
  assert.equal(result.appliedRules.some(rule => rule.startsWith('Broken tier skipped:')), true);
});

test('no valid service calculation emits NaN, Infinity, undefined money, or omitted mandatory lines', () => {
  for (const entry of happyCases) {
    const result = quote(entry);
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', entry.serviceType);
    assert.equal(result.lineItems.length > 0, true, entry.serviceType);
    for (const line of result.lineItems) {
      assert.equal(Number.isSafeInteger(line.amountCents), true, `${entry.serviceType}.${line.name}`);
      assert.equal(line.amountCents > 0, true, `${entry.serviceType}.${line.name}`);
      assert.equal(typeof line.calculation, 'object', `${entry.serviceType}.${line.name} calculation evidence`);
    }
  }
});

test('price-book metadata exposes readable controls for every candidate factor and rule', () => {
  const metadata = getVNextPriceBookMetadata();
  assert.equal(metadata.length, SERVICE_TYPES.length);
  for (const service of metadata) {
    for (const definition of [...service.pricingFields, ...service.ruleFields, ...service.class2Fields]) {
      assert.equal(typeof definition.label, 'string');
      assert.equal(definition.label.length > 3, true, `${service.serviceType}.${definition.field || definition.name}`);
      assert.equal(/[a-z][A-Z]|_/.test(definition.label), false, definition.label);
    }
  }
});

test('candidate price-book validation rejects incomplete rules and invalid defaults', () => {
  const entry = happyCases.find(candidate => candidate.serviceType === 'INTERIOR_PAINTING');
  const valid = validateVNextPricebook({ defaults, services: [entry.ownerPricing] });
  assert.equal(valid.ok, true, JSON.stringify(valid));
  const invalidService = structuredClone(entry.ownerPricing);
  delete invalidService.taxabilityByCategory.material;
  const invalidDefaults = { ...defaults, rangeBufferPercent: -1 };
  const invalid = validateVNextPricebook({ defaults: invalidDefaults, services: [invalidService] });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.some(error => /rangeBufferPercent/.test(error)), true);
  assert.equal(invalid.statuses[0].status, 'NEEDS PRICING');
});

test('business-wide defaults fail closed across markup, tax, fees, minimums, ranges, and seasonal settings', () => {
  const controls = [
    ['markupPercent', Infinity], ['markupMode', 'profit'], ['travelFee', -1],
    ['disposalFee', NaN], ['permitFee', -1], ['overheadFixed', -1],
    ['minimumJobPrice', -1], ['taxMode', 'TAX_SOME'], ['taxPercent', 101],
    ['rangeBufferPercent', 26], ['peakMonths', [13]], ['peakSurchargePercent', -1]
  ];
  for (const [field, value] of controls) {
    const validation = validateBusinessDefaults({ ...defaults, [field]: value });
    assert.equal(validation.ok, false, field);
  }
});

test('the isolated candidate is not imported by the production server', () => {
  const productionServer = readFileSync('server/src/server.js', 'utf8');
  assert.equal(productionServer.includes('quote-engine-vnext'), false);
  assert.equal(productionServer.includes('generateQuoteVNext'), false);
});
