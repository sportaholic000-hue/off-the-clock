import {fixtureIdentity, fixtureOfferings, confirmedFixtureInputs, freeFixture, includedFixture} from './quoteEngineVNextFixtures.mjs';
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
import { calculateServiceVNext } from '../server/quote-engine-vnext/templates.js';

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
  const configuredPricing = withClass2Defaults(serviceType, pricing);
  if (serviceType === 'ROOFING_REPLACEMENT' && configuredPricing.underlaymentPerSquare && configuredPricing.underlaymentPriceBasis === undefined) {
    configuredPricing.underlaymentPriceBasis = Object.fromEntries(Object.keys(configuredPricing.underlaymentPerSquare).map(key => [key, 'installed_area_sell_price']));
  }
  if (serviceType.startsWith('FLOORING_')) {
    if (pricing.roomSizeThresholds === undefined) configuredPricing.roomSizeThresholds = { smallMaxSqft: 149, mediumMaxSqft: 299 };
    if (configuredPricing.underlaymentPerSqft !== undefined && configuredPricing.underlaymentPriceBasis === undefined) configuredPricing.underlaymentPriceBasis = 'installed_area_sell_price';
  }
  const basis = structuredClone(costBasis);
  if (['INTERIOR_PAINTING', 'EXTERIOR_PAINTING'].includes(serviceType)) basis.material = 'sell_price';
  return {
    ...fixtureIdentity(overrides.source || 'MANUAL', overrides.id, serviceType),
    knownOfferings: fixtureOfferings(serviceType),
    active: true,
    serviceType,
    service: serviceType,
    pricing: configuredPricing,
    feeRules: structuredClone(feeRules),
    priceBasisByCategory: basis,
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
    callerType: 'owner',
    currentMonth: 1,
    ...overrides
  });
}

const happyCases = [
  {
    name: 'roof replacement uses measured itemized accessory lengths',
    serviceType: 'ROOFING_REPLACEMENT',
    customerInputs: confirmedFixtureInputs({
      roofSizeMethod: 'roof_measured', roofSizeInput: 1000,
      existingRoofType: 'asphalt_shingle', replacementRoofType: 'asphalt_shingle',
      pitch: 'low', stories: 1, existingLayers: 1,
      roofComplexity: 'simple', serviceScope: 'full',
      starterLengthLF: 100, dripEdgeLengthLF: 100,
      ridgeCapLengthLF: 20, deckingSheets: 2
    }),
    ownerPricing: service('ROOFING_REPLACEMENT', {
      laborPerSquare: { asphalt_shingle: 5000 },
      materialCostPerSquare: { asphalt_shingle: 10000 },
      tearOffPerSquare: { asphalt_shingle: 2000 },
      underlaymentPerSquare: { asphalt_shingle: 1500 },
      accessoryPricingMode: 'itemized', materialAccessoryBasis: 'excludes_itemized_accessories', starterPerLF: 100,
      dripEdgePerLF: 200, ridgeCapPerLF: 300, deckingPerSheet: 5000,
      minimumJob: 0
    }, { priceBasisByCategory: { ...costBasis, material: 'sell_price' } }),
    expected: {
      lines: { 'Roofing labor': 50000, 'Field materials': 110000, 'Tear-off': 20000, Underlayment: 15000, 'Starter strip': 10000, 'Drip edge': 20000, 'Ridge cap': 6000, 'Decking replacement': 10000 },
      low: 2170, mid: 2410, high: 2650
    }
  },
  {
    name: 'roof repair maps the canonical medium size exactly',
    serviceType: 'ROOFING_REPAIR',
    customerInputs: confirmedFixtureInputs({ repairType: 'shingle_patch', affectedArea: 100, roofType: 'asphalt_shingle', pitch: 'medium', stories: 2, leakPresent: false }),
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
    customerInputs: confirmedFixtureInputs({ roofSqft: 1000, sqftMethod: 'exact', membraneType: 'epdm', replacementMembraneType: 'epdm', existingLayers: 2, accessDifficulty: 'moderate', serviceScope: 'full', buildingType: 'residential' }),
    ownerPricing: service('FLAT_ROOF_REPLACEMENT', {
      laborPerSqft: { epdm: 500, average: 500 }, membraneCostPerSqft: { epdm: 700, average: 700 },
      tearOffPerSqft: { epdm: 200, average: 200 }, minimumJob: 0,
      insulationPerSqft: 250
    }),
    expected: { lines: { 'Flat roof labor': 575000, Membrane: 700000, 'Tear-off': 460000 }, low: 15620, mid: 17350, high: 19090 }
  },
  {
    name: 'flat roof repair consumes the selected nested size price',
    serviceType: 'FLAT_ROOF_REPAIR',
    customerInputs: confirmedFixtureInputs({ repairType: 'seam_patch', affectedArea: 10, membraneType: 'epdm', leakPresent: false, pondingWater: false }),
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
    customerInputs: { areaInputMethod: 'wall_sqft', wallAreaSqft: 500, wallHeight: 'standard', wallScopeUniform: true, surfaceCondition: 'good', coats: 2, ceilingsIncluded: false, trimIncluded: true, trimLengthLF: 200 },
    ownerPricing: service('INTERIOR_PAINTING', {
      laborPerWallSqftPerCoat: 100, materialPerWallSqftPerCoat: 30,
      minimumJob: 0,
      ceilingLaborPerSqftPerCoat: 100, ceilingMaterialPerSqftPerCoat: 30,
      trimLaborPerLF: 125, trimMaterialPerLF: 50
    }),
    expected: { lines: { 'Wall labor': 100000, 'Wall paint and materials': 30000, 'Trim labor': 25000, 'Trim materials': 10000 }, low: 1490, mid: 1650, high: 1820 }
  },
  {
    name: 'exterior painting records measured fair-condition preparation',
    serviceType: 'EXTERIOR_PAINTING',
    customerInputs: { areaInputMethod: 'wall_sqft', exteriorAreaSqft: 1000, stories: 2, surfaceCondition: 'fair', coats: 2 },
    ownerPricing: service('EXTERIOR_PAINTING', {
      exteriorLaborPerSqftPerCoat: 100, materialPerSqftPerCoat: 50,
      minimumJob: 0, laborHourlyRate: 10000
    }),
    expected: { lines: { 'Exterior labor': 220000, 'Exterior preparation': 80000, 'Exterior materials': 100000 }, low: 3600, mid: 4000, high: 4400 }
  },
  {
    name: 'flooring installation uses measured area and explicit vinyl rule',
    serviceType: 'FLOORING_INSTALL',
    customerInputs: confirmedFixtureInputs({ sqft: 300, sqftMethod: 'exact', newFlooringType: 'vinyl_plank', existingFloorType: 'none', removalNeeded: false, roomCount: 1, layoutPattern: 'straight', stairSteps: 0 }),
    ownerPricing: service('FLOORING_INSTALL', {
      laborPerSqft: { vinyl_plank: 300 }, materialPerSqft: { vinyl_plank: 500 },
      minimumJob: 0, vinylPlankUnderlaymentRule: 'never_included'
    }),
    expected: { lines: { 'Flooring labor': 90000, 'Flooring materials': 162000 }, low: 2270, mid: 2520, high: 2770 }
  },
  {
    name: 'flooring replacement prices measured removal and subfloor scope',
    serviceType: 'FLOORING_REPLACEMENT',
    customerInputs: confirmedFixtureInputs({ sqft: 300, sqftMethod: 'exact', newFlooringType: 'tile', existingFloorType: 'vinyl', removalNeeded: true, removalAreaSqft: 300, roomCount: 2, layoutPattern: 'straight', stairSteps: 0, subfloorIssues: true, subfloorRepairAreaSqft: 30 }),
    ownerPricing: service('FLOORING_REPLACEMENT', {
      laborPerSqft: { tile: 300 }, materialPerSqft: { tile: 500 }, minimumJob: 0,
      removalPerSqft: { vinyl: 100 }, perStepPrice: 10000,
      subfloorAllowancePerSqft: 200, vinylPlankUnderlaymentRule: 'never_included'
    }),
    expected: { lines: { 'Flooring labor': 99000, 'Flooring materials': 168000, 'Existing flooring removal': 30000, 'Subfloor repair allowance': 6000 }, low: 2910, mid: 3230, high: 3550 }
  },
  {
    name: 'fencing installation defers the mixed concrete-and-digging allocation',
    serviceType: 'FENCING_INSTALL',
    customerInputs: confirmedFixtureInputs({ linearFeet: 100, lfMethod: 'exact', fenceType: 'wood', fenceHeight: 6, gateCount: 1, gateWidthTotalLF: 4, terrainSlope: 'flat' }),
    ownerPricing: service('FENCING_INSTALL', {
      laborPerLinearFoot: { wood: 1000 }, materialPerLinearFoot: { wood: 2000 },
      postPrice: { wood: 2500 }, concretePerPost: 700,
      postsIncludedInMaterial: { wood: false }, gatePrice: { wood: 25000 }, minimumJob: 0
    }),
    expectedOwnerDecision: 'mixed_charge_allocation'
  },
  {
    name: 'fencing replacement defers the mixed concrete-and-digging allocation',
    serviceType: 'FENCING_REPLACEMENT',
    customerInputs: confirmedFixtureInputs({ linearFeet: 100, lfMethod: 'exact', fenceType: 'wood', fenceHeight: 6, gateCount: 1, gateWidthTotalLF: 4, terrainSlope: 'flat', oldFenceRemoval: true }),
    ownerPricing: service('FENCING_REPLACEMENT', {
      laborPerLinearFoot: { wood: 1000 }, materialPerLinearFoot: { wood: 2000 },
      postPrice: { wood: 2500 }, concretePerPost: 700,
      postsIncludedInMaterial: { wood: false }, gatePrice: { wood: 25000 },
      minimumJob: 0, removalPerLinearFoot: { wood: 500 }
    }),
    expectedOwnerDecision: 'mixed_charge_allocation'
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
    customerInputs: confirmedFixtureInputs({ inputMethod: 'sqft', mulchArea: 270, mulchDepth: 3, mulchType: 'brown', bedCondition: 'needs_weeding', bedSqft: 270, edgingNeeded: true, edgeLF: 100 }),
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
    expectedOwnerDecision: 'mixed_charge_classification'
  },
  {
    name: 'siding repair consumes material-type and damage-specific rates',
    serviceType: 'SIDING_REPAIR',
    customerInputs: confirmedFixtureInputs({ sidingType: 'vinyl', damageLevel: 'minor', affectedArea: 50, stories: 2 }),
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
    expectedOwnerDecision: 'custom_charge_classification'
  }
];

for (const entry of happyCases) {
  entry.customerInputs=confirmedFixtureInputs(entry.customerInputs);
  if(entry.serviceType==='EXTERIOR_PAINTING')entry.expectedOwnerDecision='exterior_coating_scope_contract';
  if(entry.expected){const total=Object.values(entry.expected.lines).reduce((a,b)=>a+b,0);entry.expected.low=Number(((BigInt(total)*90n+50n)/100n)/100n);entry.expected.mid=Number((BigInt(total)+50n)/100n);entry.expected.high=Number((((BigInt(total)*110n+50n)/100n)+99n)/100n);}
  test(`${entry.expectedOwnerDecision ? 'vNext fail-closed contract' : 'vNext hand calculation'}: ${entry.name}`, () => {
    const result = quote(entry);
    if (entry.expectedOwnerDecision) {
      assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
      assert.equal(result.ownerDecisionRequired.some(item => item.kind === entry.expectedOwnerDecision), true);
      return;
    }
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
  ['ROOFING_REPAIR', 'affectedArea', value => ({ ...value, affectedArea: 0 })],
  ['FLAT_ROOF_REPLACEMENT', 'existingLayers', value => ({ ...value, existingLayers: 0 })],
  ['FLAT_ROOF_REPAIR', 'membraneType', value => (confirmedFixtureInputs({ ...value, membraneType: 'NOT VALID' }))],
  ['INTERIOR_PAINTING', 'coats', value => ({ ...value, coats: 4 })],
  ['EXTERIOR_PAINTING', 'exteriorAreaSqft', value => ({ ...value, exteriorAreaSqft: Infinity })],
  ['FLOORING_INSTALL', 'sqft', value => ({ ...value, sqft: -1 })],
  ['FLOORING_REPLACEMENT', 'subfloorRepairAreaSqft', value => ({ ...value, subfloorRepairAreaSqft: value.sqft + 1 })],
  ['FENCING_INSTALL', 'gateWidthTotalLF', value => ({ ...value, gateWidthTotalLF: value.linearFeet })],
  ['FENCING_REPLACEMENT', 'cornerCount', value => ({ ...value, cornerCount: 2 })],
  ['CONCRETE_DRIVEWAY', 'thickness', value => ({ ...value, thickness: 1 })],
  ['CONCRETE_PATIO_SLAB', 'reinforcement', value => ({ ...value, reinforcement: 'mesh' })],
  ['LANDSCAPING_CLEANUP', 'debrisLevel', value => ({ ...value, debrisLevel: 'extreme' })],
  ['LANDSCAPING_MULCH', 'mulchDepth', value => ({ ...value, mulchDepth: 0 })],
  ['LANDSCAPING_SOD', 'sodSqft', value => ({ ...value, sodSqft: '1000' })],
  ['LANDSCAPING_PLANTING', 'plantsBySize', value => ({ ...value, plantsBySize: { small: 0, medium: 0, large: 0 } })],
  ['LANDSCAPING_MOWING', 'serviceFrequency', value => ({ ...value, serviceFrequency: 'sometimes' })],
  ['SIDING_REPLACEMENT', 'stories', value => ({ ...value, stories: 4 })],
  ['SIDING_REPAIR', 'affectedArea', value => ({ ...value, affectedArea: 0 })],
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
  ['ROOFING_REPAIR', 'affectedArea'],
  ['FLAT_ROOF_REPLACEMENT', 'roofSqft'],
  ['FLAT_ROOF_REPAIR', 'affectedArea'],
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
  ['SIDING_REPAIR', 'affectedArea'],
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

test('selected mandatory scope distinguishes missing prices from intentionally free prices', () => {
  const controls = [
    ['ROOFING_REPLACEMENT', 'dripEdgePerLF', 'Drip edge'],
    ['INTERIOR_PAINTING', 'trimLaborPerLF', 'Trim labor'],
    ['FLOORING_REPLACEMENT', 'subfloorAllowancePerSqft', 'Subfloor repair allowance'],
    ['CONCRETE_DRIVEWAY', 'basePrepPerSqft', 'Base preparation'],
    ['LANDSCAPING_MULCH', 'bedPrepLaborPerSqft', 'Bed preparation'],
    ['LANDSCAPING_SOD', 'groundPrepPerSqft', 'Ground preparation']
  ];
  for (const [serviceType, field, lineName] of controls) {
    const entry = happyCases.find(candidate => candidate.serviceType === serviceType);
    const missingPricing = structuredClone(entry.ownerPricing);
    if (field === 'bedPrepLaborPerSqft') delete missingPricing.pricing[field].needs_weeding;
    else delete missingPricing.pricing[field];
    assert.equal(quote({ ...entry, ownerPricing: missingPricing }).resultType, 'ESTIMATE_REQUIRES_REVIEW', `${serviceType}.${field} missing`);

    const freePricing = structuredClone(entry.ownerPricing);
    if (field === 'bedPrepLaborPerSqft') freePricing.pricing[field].needs_weeding = 0;
    else freePricing.pricing[field] = 0;
    assert.equal(quote({ ...entry, ownerPricing: freePricing }).resultType, 'ESTIMATE_REQUIRES_REVIEW');
    const includedIn={ROOFING_REPLACEMENT:'materialCostPerSquare.asphalt_shingle',INTERIOR_PAINTING:'laborPerWallSqftPerCoat',FLOORING_REPLACEMENT:'laborPerSqft.'+entry.customerInputs.newFlooringType,CONCRETE_DRIVEWAY:'laborPerSqft',LANDSCAPING_MULCH:'mulchInstallLaborPerYard',LANDSCAPING_SOD:'sodInstallLaborPerSqft'}[serviceType];
    const path=field==='bedPrepLaborPerSqft'?field+'.needs_weeding':field;
    const free = quote({ ...entry, ownerPricing: includedFixture(freePricing,{[path]:includedIn}) });
    if (['FLOORING_REPLACEMENT','CONCRETE_DRIVEWAY','LANDSCAPING_SOD'].includes(serviceType)) {
      assert.equal(free.resultType, 'ESTIMATE_REQUIRES_REVIEW');
      assert.ok(free.ownerDecisionRequired.some(d=>d.kind==='included_price_allocation'));
      continue;
    }
    assert.equal(free.resultType, 'INSTANT_ESTIMATE_READY', `${serviceType}.${field}=0`);
    const freeLine = free.lineItems.find(item => item.name === lineName);
    assert.equal(freeLine.amountCents, 0, `${serviceType}.${lineName}`);
    assert.equal(freeLine.noCharge, true, `${serviceType}.${lineName} no-charge marker`);
  }
});

test('caller-selected repair sizes are rejected instead of overriding measured affected area', () => {
  for (const serviceType of ['ROOFING_REPAIR', 'FLAT_ROOF_REPAIR', 'SIDING_REPAIR']) {
    const entry = happyCases.find(candidate => candidate.serviceType === serviceType);
    const invalid = quote({ ...entry, customerInputs: { ...entry.customerInputs, repairSize: 'large' } });
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

test('custom units are validated, but public quoting waits for an approved charge classification', () => {
  const ownerPricing = service('CUSTOM', { customPricingMode: 'range', low: 8000, high: 12000, unit: 'per_unit', minimumJob: 0 }, { service: 'Fixture install' });
  const customerInputs = { service: 'Fixture install', serviceConfirmed: true, unit: 'per_unit', itemCount: 3 };
  const publicResult = generateQuoteVNext({ serviceType: 'CUSTOM', customerInputs, ownerPricing, businessDefaults: defaults, callerType: 'owner', currentMonth: 1 });
  assert.equal(publicResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(publicResult.ownerDecisionRequired.some(item => item.kind === 'custom_charge_classification'), true);

  assert.throws(
    () => calculateServiceVNext('CUSTOM', customerInputs, ownerPricing.pricing, {}),
    error => {
      assert.equal(error.name, 'QuoteReviewError');
      assert.deepEqual(error.ownerDecisionRequired.map(item => item.kind), ['custom_charge_classification']);
      assert.equal(Object.hasOwn(error, 'lineItems'), false);
      return true;
    }
  );

  const wrongUnit = generateQuoteVNext({ serviceType: 'CUSTOM', customerInputs: { ...customerInputs, unit: 'per_hour', hours: 3 }, ownerPricing, businessDefaults: defaults, callerType: 'owner', currentMonth: 1 });
  assert.equal(wrongUnit.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(wrongUnit.invalidCustomerFields.includes('unit'), true);
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
    ownerPricing.pricing.underlaymentPriceBasis = 'installed_area_sell_price';
    return ownerPricing;
  };
  assert.equal(Object.hasOwn(lineMap(quote(base)), 'Underlayment'), false);
  assert.equal(lineMap(quote({ ...base, ownerPricing: withPrice('always_included') })).Underlayment, 15000);
  assert.equal(Object.hasOwn(lineMap(quote({ ...base, ownerPricing: withPrice('customer_selectable_addon'), customerInputs: { ...base.customerInputs, underlaymentSelected: false } })), 'Underlayment'), false);
  assert.equal(lineMap(quote({ ...base, ownerPricing: withPrice('customer_selectable_addon'), customerInputs: { ...base.customerInputs, underlaymentSelected: true } })).Underlayment, 15000);
  assert.equal(lineMap(quote({ ...base, ownerPricing: withPrice('subfloor_condition'), customerInputs: { ...base.customerInputs, subfloorCondition: 'requires_underlayment' } })).Underlayment, 15000);
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
  const entry = happyCases.find(candidate => candidate.serviceType === 'CONCRETE_PATIO_SLAB');
  const markedDefaults = { ...defaults, markupPercent: 30 };
  const cost = quote(entry, { businessDefaults: markedDefaults });
  const sellOwner = { ...entry.ownerPricing, priceBasisByCategory: structuredClone(sellBasis) };
  const sell = quote({ ...entry, ownerPricing: sellOwner }, { businessDefaults: markedDefaults });
  assert.equal(lineMap(cost).Markup, 106167);
  assert.equal(Object.hasOwn(lineMap(sell), 'Markup'), false);
  assert.deepEqual(sell.calculationRecord.options[0].scenarios.mid.markup.sellPriceLinesExcluded.sort(), ['Concrete labor', 'Ready-mix concrete', 'Formwork', 'Base preparation'].sort());
});

test('minimum is pre-tax and every displayed range stays above the customer minimum floor', () => {
  const entry = happyCases.find(candidate => candidate.serviceType === 'INTERIOR_PAINTING');
  const ownerPricing = structuredClone(entry.ownerPricing);
  ownerPricing.pricing.minimumJob = 300000;
  const taxedDefaults = { ...defaults, taxMode: 'TAX_ALL', taxPercent: 10, rangeBufferPercent: 25 };
  const result = quote({ ...entry, ownerPricing }, { businessDefaults: taxedDefaults });
  assert.equal(lineMap(result)['Minimum price adjustment'], 135000);
  assert.equal(lineMap(result).Tax, 30000);
  assert.equal(result.lowEstimate, 3300);
  assert.equal(result.midEstimate, 3300);
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
  const activation = vNextServiceStatus(completeService, defaults);
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
  const status = vNextServiceStatus(aiService, defaults);
  assert.equal(status.status, 'NEEDS PRICING');
});

test('customer payload remains strictly allowlisted while owner record remains complete', () => {
  const result = quote(happyCases[0]);
  const safe = sanitizeForCustomerVNext(result);
  const serialized = JSON.stringify(safe);
  for (const forbidden of ['lineItems', 'calculationRecord', 'rateCents', 'ratePath', 'appliedRules', 'urgencyFlags']) assert.equal(serialized.includes(forbidden), false, forbidden);
  assert.equal(result.calculationRecord.options[0].lineItems[0].calculation.rateCents, 5000);
  assert.equal(result.calculationRecord.options[0].scenarios.mid.tax.finalTotalCents, 241000);
});

test('selected scope with missing prices reviews without omitting the request', () => {
  const flat = happyCases.find(candidate => candidate.serviceType === 'FLAT_ROOF_REPAIR');
  const flatInputs = { ...flat.customerInputs, pondingWater: true };
  const flatResult = quote({ ...flat, customerInputs: flatInputs });
  assert.equal(flatResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(flatResult.missingOwnerFields, ['pondingWaterSurcharge']);
  assert.deepEqual(flatResult.submittedCustomerInputs, flatInputs);
  assert.deepEqual(Object.keys(sanitizeForCustomerVNext(flatResult)).sort(), ['customerMessage', 'quoteId', 'resultType']);

  const mowing = happyCases.find(candidate => candidate.serviceType === 'LANDSCAPING_MOWING');
  const ownerPricing = structuredClone(mowing.ownerPricing);
  delete ownerPricing.pricing.baggingSurchargePercent;
  delete ownerPricing.pricing.edgingPerLinearFoot;
  const mowingResult = quote({ ...mowing, ownerPricing });
  assert.equal(mowingResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(mowingResult.missingOwnerFields.sort(), ['baggingSurchargePercent', 'edgingPerLinearFoot']);
  assert.deepEqual(mowingResult.submittedCustomerInputs, mowing.customerInputs);
});

test('every tier validates effective pricing and only its explicit override changes', () => {
  const entry = happyCases.find(candidate => candidate.serviceType === 'INTERIOR_PAINTING');
  const ownerPricing = structuredClone(entry.ownerPricing);
  ownerPricing.tiers = [
    { name: 'Good', overrides: {} },
    { name: 'Better', overrides: { materialPerWallSqftPerCoat: 40 } },
    { name: 'Broken', overrides: { laborPerWallSqftPerCoat: -1 } }
  ];
  const result = quote({ ...entry, ownerPricing });
  assert.equal(result.options.length, 2);
  assert.equal(lineMap(result.options[0])['Wall labor'], lineMap(result.options[1])['Wall labor']);
  assert.equal(lineMap(result.options[0])['Wall paint and materials'], 30000);
  assert.equal(lineMap(result.options[1])['Wall paint and materials'], 40000);
  assert.equal(result.appliedRules.some(rule => rule.startsWith('Broken tier skipped:')), true);
});

test('no valid service calculation emits NaN, Infinity, undefined money, or omitted mandatory lines', () => {
  for (const entry of happyCases) {
    const result = quote(entry);
    if (entry.expectedOwnerDecision) {
      assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW', entry.serviceType);
      assert.equal(result.ownerDecisionRequired.some(item => item.kind === entry.expectedOwnerDecision), true);
      continue;
    }
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


// These expectations start from the explicit hand-calculated service line tables
// above. Financial arithmetic uses independent integer fractions, never the
// engine's exactMath helpers or returned rates, categories, bases or subtotals.
const precisionCategories = {
  'Roofing labor':'labor','Field materials':'material','Tear-off':'removal',
  'Underlayment':'material','Starter strip':'material','Drip edge':'material','Ridge cap':'material','Decking replacement':'material',
  'Repair labor':'labor','Repair materials':'material','Flat roof labor':'labor','Membrane':'material',
  'Flat roof repair labor':'labor','Flat roof repair materials':'material',
  'Wall labor':'labor','Wall paint and materials':'material','Trim labor':'labor','Trim materials':'material',
  'Flooring labor':'labor','Flooring materials':'material','Existing flooring removal':'removal','Subfloor repair allowance':'prep',
  'Concrete labor':'labor','Ready-mix concrete':'material','Formwork':'material','Base preparation':'prep','Wire mesh reinforcement':'material',
  'Cleanup labor':'labor','Debris disposal':'disposal','Additional haul-away':'disposal',
  'Bed preparation':'labor','Mulch material':'material','Mulch installation labor':'labor','Bed edging':'labor',
  'Sod material':'material','Sod installation labor':'labor','Ground preparation':'prep',
  'Small plant installation labor':'labor','Small plant material allowance':'material',
  'Medium plant installation labor':'labor','Medium plant material allowance':'material',
  'Large plant installation labor':'labor','Large plant material allowance':'material',
  'Mowing labor':'labor','Clipping bagging and disposal':'disposal','Lawn edging':'addon',
  'Siding labor':'labor','Siding materials':'material','Siding repair labor':'labor','Siding repair materials':'material'
};
const precisionEntries = happyCases.map(original => {
  const entry=structuredClone(original);
  if(entry.serviceType==='SIDING_REPLACEMENT'){
    entry.customerInputs.oldSidingRemoval=false;entry.customerInputs.trimIncluded=false;delete entry.customerInputs.trimLengthLF;
    delete entry.expectedOwnerDecision;
    // 1,000 measured sq ft * 400 labor cents; 1,100 waste-adjusted sq ft * 700 material cents.
    entry.expected={lines:{'Siding labor':400000,'Siding materials':770000}};
  }
  return entry;
});
function precisionFraction(value) {
  const [whole,part='']=String(value).split('.');
  return [BigInt(whole+part),10n**BigInt(part.length)];
}
function precisionRound(n,d=1n) {assert.ok(n>=0n&&d>0n);return Number((2n*n+d)/(2n*d));}
function precisionPercent(cents,percent) {const[n,d]=precisionFraction(percent);return precisionRound(BigInt(cents)*n,100n*d);}
function precisionMarkup(cents,b) {
  const[n,d]=precisionFraction(b.markupPercent);
  return b.markupMode==='margin'?precisionRound(BigInt(cents)*100n*d,100n*d-n)-cents:precisionPercent(cents,b.markupPercent);
}
function precisionMinimumField(entry) {
  const keys=['minimumJob','repairMinimum','minimumServiceCharge'].filter(k=>Object.hasOwn(entry.ownerPricing.pricing,k));
  assert.equal(keys.length,1);return keys[0];
}
function precisionExpected(entry,p,b,{fees=[],month=1}={}) {
  const lines=Object.entries(entry.expected.lines).map(([name,cents])=>{
    assert.ok(precisionCategories[name],name);return {name,cents,category:precisionCategories[name]};
  });
  for(const fee of fees)lines.push({...fee});
  const months=p.peakMonths===undefined?b.peakMonths:p.peakMonths,percent=p.peakSurchargePercent===undefined?b.peakSurchargePercent:p.peakSurchargePercent;
  const labor=lines.filter(l=>l.category==='labor').reduce((sum,l)=>sum+l.cents,0);
  const seasonal=months.includes(month)?precisionPercent(labor,percent):0;
  if(seasonal)lines.push({name:'Peak season adjustment',cents:seasonal,category:'surcharge'});
  const eligible=l=>(l.name==='Underlayment'?'sell_price':p.priceBasisByCategory[l.category])==='cost'&&b.markupApplies[l.category]===true;
  const sum=values=>values.reduce((total,l)=>total+l.cents,0);
  const base=sum(lines.filter(eligible)),markup=precisionMarkup(base,b),subtotal=sum(lines)+markup;
  const taxable=lines.filter(l=>p.taxabilityByCategory[l.category]===true);
  const taxableSubtotal=sum(taxable)+precisionMarkup(sum(taxable.filter(eligible)),b);
  const minimum=Math.max(b.minimumJobPrice,p.pricing[precisionMinimumField(entry)]);
  const tax=b.taxMode==='TAX_NONE'?0:precisionPercent(b.taxMode==='TAX_ALL'?Math.max(subtotal,minimum):taxableSubtotal,b.taxPercent);
  const adjustment=Math.max(0,minimum-(subtotal+(b.taxMode==='TAX_MATERIALS'?tax:0)));
  const total=subtotal+adjustment+tax;
  const amounts=Object.fromEntries(lines.map(l=>[l.name,l.cents]));
  if(markup)amounts.Markup=markup;
  if(tax)amounts.Tax=tax;
  if(adjustment)amounts['Minimum price adjustment']=adjustment;
  const floor=minimum+(b.taxMode==='TAX_ALL'?precisionPercent(minimum,b.taxPercent):0);
  const low=Math.max(precisionPercent(total,100-b.rangeBufferPercent),floor,1),high=precisionPercent(total,100+b.rangeBufferPercent);
  const preserveCents=b.rangeBufferPercent===0 || (low>0&&low<100) || Math.floor(low/100)*100<floor;
  const display=preserveCents?[low/100,total/100,high/100]:[Math.floor(low/100),precisionRound(BigInt(total),100n),Math.ceil(high/100)];
  return {amounts,total,markup,tax,adjustment,subtotal,floor,range:[low,total,high],display};
}
function precisionInspect(value) {
  if(value===null||typeof value!=='object'){
    if(typeof value==='number')assert.ok(Number.isFinite(value));
    assert.ok(!['function','symbol','bigint'].includes(typeof value));return;
  }
  for(const d of Object.values(Object.getOwnPropertyDescriptors(value))){assert.ok(Object.hasOwn(d,'value'));precisionInspect(d.value);}
}
const precisionPublicKeys=['disclaimer','highEstimate','lowEstimate','midEstimate','options','priceDrivers','quoteId','rangeBufferUsed','resultType'];
const precisionOptionKeys=['disclaimer','highEstimate','lowEstimate','midEstimate','priceDrivers','rangeBufferUsed','skippedAddons','tierName'];
let precisionChecks=0;
function precisionCheck(entry,p,b,extras={}) {
  precisionChecks++;
  const expected=precisionExpected(entry,p,b,extras);
  const request={serviceType:entry.serviceType,customerInputs:entry.customerInputs,ownerPricing:p,businessDefaults:b,callerType:'owner',currentMonth:extras.month??1,feeSelections:extras.feeSelections??{}};
  const r=generateQuoteVNext(request);precisionInspect(r);
  assert.equal(r.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify({request,result:r}));
  assert.deepEqual(r.submittedCustomerInputs,entry.customerInputs);assert.equal(r.serviceId,p.id);
  assert.deepEqual(r.calculationRecord.financialInputs,{businessDefaults:b,feeSelections:request.feeSelections,currentMonth:request.currentMonth});
  assert.deepEqual(r.calculationRecord.options,r.options.map(o=>o.calculationRecord));
  for(const option of r.options){
    assert.deepEqual(Object.keys(option.calculationRecord.scenarios),['mid']);
    assert.equal(option.calculationRecord.scenarios.mid.finalTotalCents,expected.total);
    for(const s of Object.values(option.calculationRecord.scenarios)){
      assert.deepEqual(Object.fromEntries(s.lineItems.map(l=>[l.name,l.amountCents])),expected.amounts);
      assert.equal(s.markup.amountCents,expected.markup);assert.equal(s.tax.taxCents,expected.tax);assert.equal(s.minimum.adjustmentCents,expected.adjustment);
      assert.equal(s.lineItems.reduce((sum,l)=>sum+BigInt(l.amountCents),0n),BigInt(expected.total));
    }
    const range=option.calculationRecord.range;
    assert.deepEqual([range.lowCents,range.midCents,range.highCents],expected.range);
    assert.equal(range.minimumCustomerFloorCents,expected.floor);
    assert.deepEqual([option.lowEstimate,option.midEstimate,option.highEstimate],expected.display);
  }
  const publicResult=sanitizeForCustomerVNext(r);precisionInspect(publicResult);
  assert.equal(publicResult.resultType,'INSTANT_ESTIMATE_READY');
  assert.deepEqual(Object.keys(publicResult).filter(k=>k!=='optionAvailabilityNotice').sort(),precisionPublicKeys);
  assert.deepEqual([publicResult.lowEstimate,publicResult.midEstimate,publicResult.highEstimate],expected.display);
  for(const option of publicResult.options)assert.deepEqual(Object.keys(option).sort(),precisionOptionKeys);
  assert.equal(/ratePath|rateCents|ownerConfiguration|financialInputs|noChargeReason|markup|margin|overhead/i.test(JSON.stringify(publicResult)),false);
  return r;
}
test('precision follow-up: all-service catalog covers every registered ready or review path and public entry point',()=>{
  assert.deepEqual(precisionEntries.map(e=>e.serviceType).sort(),[...SERVICE_TYPES].sort());
  let ready=0,review=0;
  for(const entry of precisionEntries){
    const p=entry.ownerPricing,c=entry.customerInputs,request={serviceType:entry.serviceType,customerInputs:c,pricebook:{defaults,services:[p]},currentMonth:1};
    if(entry.expectedOwnerDecision){
      review++;
      for(const r of [quote(entry),previewFromVNextPricebook(request),quoteFromVNextPricebook({...request,callerType:'owner'})]){
        precisionInspect(r);assert.equal(r.resultType,'ESTIMATE_REQUIRES_REVIEW');
        assert.ok(r.ownerDecisionRequired.some(d=>d.kind===entry.expectedOwnerDecision));
        assert.deepEqual(Object.keys(sanitizeForCustomerVNext(r)).sort(),['customerMessage','quoteId','resultType']);
      }
      continue;
    }
    ready++;const r=precisionCheck(entry,p,defaults);
    for(const result of [previewFromVNextPricebook(request),quoteFromVNextPricebook({...request,callerType:'owner'})]){
      precisionInspect(result);assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');assert.deepEqual(result.lineItems,r.lineItems);
    }
    for(const result of [quoteFromVNextPricebook(request),generateQuoteVNext({serviceType:entry.serviceType,customerInputs:c,ownerPricing:p,businessDefaults:defaults,currentMonth:1})]){
      precisionInspect(result);assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');
      assert.deepEqual(Object.keys(result).sort(),precisionPublicKeys);
      assert.deepEqual([result.lowEstimate,result.midEstimate,result.highEstimate],[r.lowEstimate,r.midEstimate,r.highEstimate]);
    }
  }
  assert.equal(ready,16);assert.equal(review,4);
});
for(const entry of precisionEntries.filter(e=>!e.expectedOwnerDecision)){
  test('precision follow-up: '+entry.serviceType+' independent finance matrix fees tiers minima and range boundaries',t=>{
    const startChecks=precisionChecks;
    const original=entry.ownerPricing;
    for(const basis of ['configured','sell_price']){
      const p=structuredClone(original);if(basis==='sell_price')p.priceBasisByCategory=structuredClone(sellBasis);
      for(const taxMode of ['TAX_NONE','TAX_MATERIALS','TAX_ALL'])for(const [markupMode,markupPercent]of [['markup',0],['markup',17.5],['margin',17.5],['margin',90],['margin',99],['margin',99.9]]){
        precisionCheck(entry,p,{...defaults,taxMode,taxPercent:taxMode==='TAX_NONE'?0:7.5,markupMode,markupPercent});
      }
    }
    const taxed={...defaults,markupPercent:17.5,taxMode:'TAX_MATERIALS',taxPercent:7.5};
    for(const category of PRICE_BASIS_CATEGORIES)precisionCheck(entry,original,{...taxed,markupApplies:{...taxed.markupApplies,[category]:false}});
    for(const category of TAXABILITY_CATEGORIES){
      const p=structuredClone(original);p.taxabilityByCategory[category]=!p.taxabilityByCategory[category];precisionCheck(entry,p,taxed);
    }
    const feeDefaults={...taxed,travelFee:233,overheadFixed:379,permitFee:401,disposalFee:503};
    const feeOwner=structuredClone(original);for(const fee of Object.keys(feeRules))feeOwner.feeRules[fee]='always';
    const fees=[{name:'Travel',category:'travel',cents:233},{name:'Overhead',category:'overhead',cents:379},{name:'Permit',category:'permit',cents:401}];
    if(!['LANDSCAPING_CLEANUP','LANDSCAPING_SOD','LANDSCAPING_MOWING'].includes(entry.serviceType))fees.push({name:'Disposal',category:'disposal',cents:503});
    precisionCheck(entry,feeOwner,feeDefaults,{fees});
    for(const mode of ['owner_selected','customer_selected'])for(const selected of [false,true]){
      const p=structuredClone(original);p.feeRules.travel=mode;const actor=mode==='owner_selected'?'owner':'customer';
      precisionCheck(entry,p,feeDefaults,{feeSelections:{[actor]:{travel:selected}},fees:selected?[{name:'Travel',category:'travel',cents:233}]:[]});
      const missing=generateQuoteVNext({serviceType:entry.serviceType,customerInputs:entry.customerInputs,ownerPricing:p,businessDefaults:feeDefaults,callerType:'owner',currentMonth:1});
      precisionInspect(missing);assert.equal(missing.resultType,'ESTIMATE_REQUIRES_REVIEW');
    }
    const seasonal=structuredClone(original);seasonal.peakMonths=[1];seasonal.peakSurchargePercent=7.5;
    for(const month of [1,2])precisionCheck(entry,seasonal,taxed,{month});
    const inherited=structuredClone(original);delete inherited.peakMonths;delete inherited.peakSurchargePercent;
    precisionCheck(entry,inherited,{...taxed,peakMonths:[1],peakSurchargePercent:7.5});
    const minField=precisionMinimumField(entry);
    for(const taxMode of ['TAX_NONE','TAX_MATERIALS','TAX_ALL']){
      const b={...taxed,taxMode,taxPercent:taxMode==='TAX_NONE'?0:7.5};
      const e=precisionExpected(entry,original,b),threshold=taxMode==='TAX_ALL'?e.subtotal:e.total;
      for(const amount of [threshold-1,threshold,threshold+1]){
        const p=structuredClone(original);p.pricing[minField]=amount;precisionCheck(entry,p,b);
        precisionCheck(entry,original,{...b,minimumJobPrice:amount});
      }
    }
    for(const rangeBufferPercent of [0,0.5,10,25])precisionCheck(entry,original,{...taxed,rangeBufferPercent});
    const tiered=structuredClone(original);tiered.tiers=[{name:'First',overrides:{}},{name:'Second',overrides:{}},{name:'Invalid',overrides:{[minField]:-1}}];
    const tiers=precisionCheck(entry,tiered,taxed);assert.deepEqual(tiers.options.map(o=>o.tierName),['First','Second']);assert.equal(tiers.failedTierDiagnostics[0].tierName,'Invalid');
    for(const markupPercent of [100,100.1,Infinity]){
      const r=generateQuoteVNext({serviceType:entry.serviceType,customerInputs:entry.customerInputs,ownerPricing:original,businessDefaults:{...defaults,markupMode:'margin',markupPercent},callerType:'owner',currentMonth:1});
      precisionInspect(r);assert.equal(r.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(Object.keys(sanitizeForCustomerVNext(r)).sort(),['customerMessage','quoteId','resultType']);
    }
    t.diagnostic(JSON.stringify({serviceType:entry.serviceType,independentReadyChecks:precisionChecks-startChecks,reviewControls:7}));
  });
}
