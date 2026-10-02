import {fixtureIdentity, fixtureOfferings, confirmedFixtureInputs, freeFixture, includedFixture} from '../../test/quoteEngineVNextFixtures.mjs';
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
} from '../../server/quote-engine-vnext/index.js';
import { calculateServiceVNext } from '../../server/quote-engine-vnext/templates.js';

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


export {happyCases,defaults};
