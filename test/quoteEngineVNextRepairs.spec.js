import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRICE_BASIS_CATEGORIES,
  TAXABILITY_CATEGORIES,
  generateQuoteVNext,
  previewFromVNextPricebook,
  quoteFromVNextPricebook,
  validateCustomerInputs,
  validateOwnerPricing,
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
const noTaxability = Object.fromEntries(TAXABILITY_CATEGORIES.map(category => [category, false]));
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
    taxabilityByCategory: structuredClone(noTaxability),
    peakMonths: [],
    peakSurchargePercent: 0,
    ...overrides
  };
}

function run(serviceType, customerInputs, ownerPricing, overrides = {}) {
  return generateQuoteVNext({
    serviceType,
    customerInputs,
    ownerPricing,
    businessDefaults: defaults,
    currentMonth: 1,
    ...overrides
  });
}

function line(result, name) {
  return (result.lineItems || []).find(item => item.name === name);
}

function lineAmount(result, name) {
  return line(result, name)?.amountCents;
}

function scenario(result, variant = 'mid') {
  return result.calculationRecord.options[0].scenarios[variant];
}

function assertLineReproducible(item) {
  const calculation = item.calculation;
  let expected;
  if (['quantity_rate', 'ranged'].includes(calculation.evidenceVariant)) {
    const multiplier = calculation.multipliers.reduce((product, entry) => product * entry.value, 1);
    expected = Math.round(calculation.quantity * calculation.rateCents * multiplier);
    if (calculation.evidenceVariant === 'ranged') {
      assert.equal(item.rangeAmountCents.low, Math.round(calculation.quantity * calculation.lowRateCents * multiplier));
      assert.equal(item.rangeAmountCents.high, Math.round(calculation.quantity * calculation.highRateCents * multiplier));
    }
  } else if (calculation.evidenceVariant === 'fixed_amount') {
    expected = calculation.subtotalBeforeMinimumCents === undefined
      ? calculation.amountCents
      : Math.max(0, calculation.effectiveMinimumCents - calculation.subtotalBeforeMinimumCents);
  } else if (calculation.evidenceVariant === 'percentage_derived') {
    expected = calculation.mode === 'margin'
      ? Math.round(calculation.basisAmountCents / (1 - calculation.percent / 100)) - calculation.basisAmountCents
      : Math.round(calculation.basisAmountCents * calculation.percent / 100);
  } else if (calculation.evidenceVariant === 'composite') {
    expected = calculation.components.reduce((sum, component) => {
      const multiplier = component.multipliers.reduce((product, entry) => product * entry.value, 1);
      const componentExpected = Math.round(component.quantity * component.rateCents * multiplier);
      assert.equal(component.amountCents, componentExpected);
      return sum + componentExpected;
    }, 0);
  } else {
    assert.fail('Unsupported evidence variant: ' + calculation.evidenceVariant);
  }
  assert.equal(calculation.roundedAmountCents, expected, item.name + ' evidence');
  assert.equal(item.amountCents, expected, item.name);
}

function interiorService(pricing = {}, overrides = {}) {
  return service('INTERIOR_PAINTING', {
    laborPerWallSqftPerCoat: 100,
    materialPerWallSqftPerCoat: 50,
    minimumJob: 0,
    ceilingLaborPerSqftPerCoat: 100,
    ceilingMaterialPerSqftPerCoat: 50,
    trimLaborPerLF: 100,
    trimMaterialPerLF: 50,
    ...pricing
  }, overrides);
}

function interiorInputs(overrides = {}) {
  return {
    areaInputMethod: 'wall_sqft',
    wallAreaSqft: 100,
    wallHeight: 'standard',
    surfaceCondition: 'good',
    coats: 1,
    ceilingsIncluded: false,
    trimIncluded: false,
    ...overrides
  };
}

function roofService(pricing = {}, overrides = {}) {
  return service('ROOFING_REPLACEMENT', {
    laborPerSquare: { asphalt_shingle: 5000 },
    materialCostPerSquare: { asphalt_shingle: 10000 },
    tearOffPerSquare: { asphalt_shingle: 2000 },
    underlaymentPerSquare: { asphalt_shingle: 1500 },
    accessoryPricingMode: 'per_square_allin',
    minimumJob: 0,
    ...pricing
  }, {
    priceBasisByCategory: { ...costBasis, material: 'sell_price' },
    ...overrides
  });
}

function roofInputs(overrides = {}) {
  return {
    roofSizeMethod: 'roof_measured',
    roofSizeInput: 1000,
    existingRoofType: 'asphalt_shingle',
    replacementRoofType: 'asphalt_shingle',
    pitch: 'low',
    stories: 1,
    existingLayers: 1,
    roofComplexity: 'simple',
    serviceScope: 'full',
    ...overrides
  };
}

function flooringService(pricing = {}, overrides = {}) {
  return service('FLOORING_INSTALL', {
    laborPerSqft: { vinyl_plank: 300 },
    materialPerSqft: { vinyl_plank: 500 },
    minimumJob: 0,
    perStepPrice: 10000,
    underlaymentPerSqft: 50,
    vinylPlankUnderlaymentRule: 'always_included',
    ...pricing
  }, {
    priceBasisByCategory: { ...costBasis, material: 'sell_price' },
    ...overrides
  });
}

function flooringInputs(overrides = {}) {
  return {
    sqft: 300,
    sqftMethod: 'exact',
    newFlooringType: 'vinyl_plank',
    existingFloorType: 'none',
    removalNeeded: false,
    roomCount: 1,
    layoutPattern: 'straight',
    stairSteps: 0,
    ...overrides
  };
}

function fenceService(pricing = {}, overrides = {}) {
  return service('FENCING_INSTALL', {
    laborPerLinearFoot: { wood: 1000 },
    materialPerLinearFoot: { wood: 2000 },
    postPrice: { wood: 2500 },
    concretePerPost: 700,
    postsIncludedInMaterial: { wood: false },
    gatePrice: { wood: 10000 },
    minimumJob: 0,
    ...pricing
  }, overrides);
}

function fenceInputs(overrides = {}) {
  return {
    linearFeet: 100,
    lfMethod: 'exact',
    fenceType: 'wood',
    fenceHeight: 6,
    gateCount: 0,
    gateWidthTotalLF: 0,
    postCount: 10,
    terrainSlope: 'flat',
    ...overrides
  };
}

function concreteService(pricing = {}, serviceType = 'CONCRETE_DRIVEWAY') {
  return service(serviceType, {
    laborPerSqft: 600,
    concreteCostPerCubicYard: 18000,
    formworkPerLF: 2500,
    minimumJob: 0,
    ...pricing
  });
}

function concreteInputs(overrides = {}) {
  return {
    dimensionMethod: 'exact',
    length: 20,
    width: 10,
    thickness: 4,
    finishType: 'broom',
    demolitionNeeded: false,
    reinforcement: 'none',
    accessDifficulty: 'easy',
    baseNeeded: false,
    ...overrides
  };
}

test('repair 1: tax modes use independently calculated bases', () => {
  const ownerPricing = interiorService({
    laborPerWallSqftPerCoat: 1000,
    materialPerWallSqftPerCoat: 400,
    trimLaborPerLF: 700,
    trimMaterialPerLF: 40
  }, {
    feeRules: { ...feeRules, overhead: 'always' },
    priceBasisByCategory: structuredClone(sellBasis),
    taxabilityByCategory: { ...noTaxability, material: true }
  });
  const customerInputs = interiorInputs({ trimIncluded: true, trimLengthLF: 100 });
  const common = { ...defaults, overheadFixed: 20000, rangeBufferPercent: 0 };
  const none = run('INTERIOR_PAINTING', customerInputs, ownerPricing, { businessDefaults: common });
  const materials = run('INTERIOR_PAINTING', customerInputs, ownerPricing, { businessDefaults: { ...common, taxMode: 'TAX_MATERIALS', taxPercent: 10 } });
  const all = run('INTERIOR_PAINTING', customerInputs, ownerPricing, { businessDefaults: { ...common, taxMode: 'TAX_ALL', taxPercent: 10 } });

  assert.equal(scenario(none).tax.taxCents, 0);
  assert.equal(scenario(none).tax.finalTotalCents, 234000);
  assert.equal(scenario(materials).tax.taxableSubtotalCents, 44000);
  assert.equal(scenario(materials).tax.taxCents, 4400);
  assert.equal(scenario(materials).tax.finalTotalCents, 238400);
  assert.equal(scenario(all).tax.taxableSubtotalCents, 234000);
  assert.equal(scenario(all).tax.taxCents, 23400);
  assert.equal(scenario(all).tax.finalTotalCents, 257400);
  assert.notEqual(scenario(all).tax.taxableSubtotalCents, scenario(materials).tax.taxableSubtotalCents);
  assert.equal(JSON.stringify(all).includes('rateCents'), true);
});

test('repairs 2 and 4: tax mode controls minimum ordering and adjustment tax', () => {
  const inputs = interiorInputs();
  const expected = {
    TAX_NONE: { tax: 0, adjustment: 5000, final: 20000, basis: 'post_markup', order: ['fees', 'seasonal', 'taxability', 'markup', 'minimum'] },
    TAX_MATERIALS: { tax: 500, adjustment: 4500, final: 20000, basis: 'post_tax', order: ['fees', 'seasonal', 'taxability', 'markup', 'tax', 'minimum'] },
    TAX_ALL: { tax: 2000, adjustment: 5000, final: 22000, basis: 'pre_tax', order: ['fees', 'seasonal', 'taxability', 'markup', 'minimum', 'tax'] }
  };
  for (const minimumTaxable of [false, true]) {
    const ownerPricing = interiorService({ minimumJob: 20000 }, { taxabilityByCategory: { ...noTaxability, material: true, minimum_adjustment: minimumTaxable } });
    for (const [taxMode, values] of Object.entries(expected)) {
      const businessDefaults = { ...defaults, taxMode, taxPercent: taxMode === 'TAX_NONE' ? 0 : 10 };
      const result = run('INTERIOR_PAINTING', inputs, ownerPricing, { businessDefaults });
      assert.equal(scenario(result).tax.taxCents, values.tax, `${taxMode} tax`);
      assert.equal(scenario(result).minimum.adjustmentCents, values.adjustment, `${taxMode} minimum`);
      assert.equal(scenario(result).tax.finalTotalCents, values.final, `${taxMode} final`);
      assert.equal(scenario(result).minimum.basis, values.basis, `${taxMode} basis`);
      assert.deepEqual(scenario(result).order, values.order, `${taxMode} order`);
    }
  }
});

test('repair 3: minimum floor uses tax attributable to the minimum scenario', () => {
  const ownerPricing = interiorService({ minimumJob: 10000 }, { taxabilityByCategory: { ...noTaxability, material: true } });
  const result = run('INTERIOR_PAINTING', interiorInputs(), ownerPricing, {
    businessDefaults: { ...defaults, taxMode: 'TAX_ALL', taxPercent: 10, rangeBufferPercent: 25 }
  });
  assert.equal(scenario(result).tax.preTaxSubtotalCents, 15000);
  assert.equal(scenario(result).tax.taxCents, 1500);
  assert.equal(result.calculationRecord.options[0].range.minimumCustomerFloorCents, 11000);
  assert.notEqual(result.calculationRecord.options[0].range.minimumCustomerFloorCents, 11500);
});

test('repair 5: positive totals never round to a zero customer value', () => {
  for (const price of [1, 499, 500, 501, 999, 1000, 1001]) {
    const ownerPricing = service('CUSTOM', { customPricingMode: 'fixed', price, unit: 'flat', minimumJob: 0 }, { service: 'Boundary service' });
    const result = run('CUSTOM', { service: 'Boundary service', serviceConfirmed: true, unit: 'flat' }, ownerPricing, {
      businessDefaults: { ...defaults, rangeBufferPercent: 25 }
    });
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', `${price} cents`);
    assert.equal(result.lowEstimate > 0, true, `${price} low`);
    assert.equal(result.midEstimate > 0, true, `${price} mid`);
    assert.equal(result.highEstimate > 0, true, `${price} high`);
  }
});

test('repair 6: roof replacement enforces only its supported service minimum', () => {
  const ownerPricing = roofService({ minimumJob: 10000 });
  const below = run('ROOFING_REPLACEMENT', roofInputs({ serviceScope: 'partial', partialAreaSqft: 10 }), ownerPricing);
  assert.equal(below.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(below));
  assert.equal(scenario(below).minimum.serviceMinimumField, 'minimumJob');
  assert.equal(scenario(below).minimum.serviceMinimumCents, 10000);
  assert.equal(scenario(below).minimum.adjustmentCents, 8050);
  assert.equal(scenario(below).tax.finalTotalCents, 10000);

  const above = run('ROOFING_REPLACEMENT', roofInputs(), ownerPricing);
  assert.equal(scenario(above).minimum.adjustmentCents, 0);
  assert.equal(scenario(above).tax.finalTotalCents, 195000);

  const unsupported = structuredClone(ownerPricing);
  unsupported.pricing.repairMinimum = 50000;
  const rejected = run('ROOFING_REPLACEMENT', roofInputs(), unsupported);
  assert.equal(rejected.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(rejected.unsupportedOwnerFields.includes('repairMinimum'), true);
});

test('repair 7: inherited interior prep factors cannot price measured wall area', () => {
  const good = run('INTERIOR_PAINTING', interiorInputs({ surfaceCondition: 'good' }), interiorService());
  assert.equal(good.resultType, 'INSTANT_ESTIMATE_READY');
  for (const surfaceCondition of ['fair', 'poor']) {
    const result = run('INTERIOR_PAINTING', interiorInputs({ surfaceCondition }), interiorService());
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW', surfaceCondition);
    assert.equal(result.inspectionFirst, true, surfaceCondition);
    assert.equal(lineAmount(result, 'Wall preparation'), undefined);
  }
});

test('repair 8: exterior primer scope fails closed without an approved primer price contract', () => {
  const ownerPricing = service('EXTERIOR_PAINTING', {
    exteriorLaborPerSqftPerCoat: 100,
    materialPerSqftPerCoat: 50,
    minimumJob: 0,
    laborHourlyRate: 10000
  });
  const base = { areaInputMethod: 'wall_sqft', exteriorAreaSqft: 1000, stories: 1, coats: 2 };
  const good = run('EXTERIOR_PAINTING', { ...base, surfaceCondition: 'good' }, ownerPricing);
  const fair = run('EXTERIOR_PAINTING', { ...base, surfaceCondition: 'fair' }, ownerPricing);
  const poor = run('EXTERIOR_PAINTING', { ...base, surfaceCondition: 'poor' }, ownerPricing);
  assert.equal(good.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(fair.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(poor.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(lineAmount(good, 'Exterior labor'), 200000);
  assert.equal(lineAmount(fair, 'Exterior labor'), 200000);
  assert.equal(lineAmount(good, 'Exterior materials'), 100000);
  assert.equal(lineAmount(fair, 'Exterior materials'), 100000);
});

test('repair 9: wall height does not alter ceiling labor', () => {
  const inputs = interiorInputs({ ceilingsIncluded: true, ceilingAreaSqft: 100 });
  const standard = run('INTERIOR_PAINTING', inputs, interiorService());
  const vaulted = run('INTERIOR_PAINTING', { ...inputs, wallHeight: 'vaulted' }, interiorService());
  assert.equal(lineAmount(standard, 'Ceiling labor'), 10000);
  assert.equal(lineAmount(vaulted, 'Ceiling labor'), 10000);
  assert.notEqual(lineAmount(standard, 'Wall labor'), lineAmount(vaulted, 'Wall labor'));
});

test('repair 10: flooring underlayment uses installed area, not finish waste', () => {
  const straight = run('FLOORING_INSTALL', flooringInputs({ layoutPattern: 'straight' }), flooringService());
  const patterned = run('FLOORING_INSTALL', flooringInputs({ layoutPattern: 'diagonal_or_pattern' }), flooringService());
  const changedWaste = flooringService({ wasteFactorByType: { hardwood: 0.10, laminate: 0.08, vinyl_plank: 0.30, carpet: 0.10, tile: 0.12 } });
  const wasteChanged = run('FLOORING_INSTALL', flooringInputs(), changedWaste);
  assert.equal(lineAmount(straight, 'Underlayment'), 15000);
  assert.equal(lineAmount(patterned, 'Underlayment'), 15000);
  assert.equal(lineAmount(wasteChanged, 'Underlayment'), 15000);
  assert.notEqual(lineAmount(straight, 'Flooring materials'), lineAmount(patterned, 'Flooring materials'));

  const costBased = run('FLOORING_INSTALL', flooringInputs(), flooringService({}, {
    priceBasisByCategory: structuredClone(costBasis)
  }));
  assert.equal(costBased.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(costBased.invalidOwnerFields.includes('underlaymentPerSqft'), true);
  assert.equal(costBased.ownerDecisionRequired.some(item => item.kind === 'purchasable_quantity_contract'), true);
});

test('repair 10: roofing underlayment uses installed roof area, not shingle waste', () => {
  const simple = run('ROOFING_REPLACEMENT', roofInputs({ roofComplexity: 'simple' }), roofService());
  const complex = run('ROOFING_REPLACEMENT', roofInputs({ roofComplexity: 'complex' }), roofService());
  assert.equal(lineAmount(simple, 'Underlayment'), 15000);
  assert.equal(lineAmount(complex, 'Underlayment'), 15000);
  assert.notEqual(lineAmount(simple, 'Field materials'), lineAmount(complex, 'Field materials'));

  const costBased = run('ROOFING_REPLACEMENT', roofInputs(), roofService({}, {
    priceBasisByCategory: structuredClone(costBasis)
  }));
  assert.equal(costBased.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(costBased.invalidOwnerFields.includes('underlaymentPerSquare.asphalt_shingle'), true);
  assert.equal(costBased.ownerDecisionRequired.some(item => item.kind === 'purchasable_quantity_contract'), true);
});

test('repair 11: unknown flat-roof membrane or layer count always requires review', () => {
  const ownerPricing = service('FLAT_ROOF_REPLACEMENT', {
    laborPerSqft: { epdm: 500, average: 550 },
    membraneCostPerSqft: { epdm: 700, average: 750 },
    tearOffPerSqft: { epdm: 200, average: 225 },
    minimumJob: 0
  });
  const base = { roofSqft: 1000, sqftMethod: 'exact', membraneType: 'epdm', existingLayers: 1, accessDifficulty: 'easy', serviceScope: 'full', buildingType: 'residential' };
  assert.equal(run('FLAT_ROOF_REPLACEMENT', base, ownerPricing).resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(run('FLAT_ROOF_REPLACEMENT', { ...base, membraneType: 'unknown' }, ownerPricing).resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(run('FLAT_ROOF_REPLACEMENT', { ...base, existingLayers: 'unknown' }, ownerPricing).resultType, 'ESTIMATE_REQUIRES_REVIEW');
});

function repairFixture(serviceType) {
  if (serviceType === 'ROOFING_REPAIR') return {
    ownerPricing: service(serviceType, {
      laborHourlyRate: 10000,
      repairMinimum: 0,
      repairHours: { asphalt_shingle: { patch: { small: 1, medium: 2, large: 3 } } },
      repairMaterialAllowance: { asphalt_shingle: { patch: { small: 1000, medium: 2000, large: 3000 } } }
    }),
    inputs: { repairType: 'patch', affectedArea: 10, roofType: 'asphalt_shingle', pitch: 'low', stories: 1, leakPresent: false },
    first: 50,
    second: 200,
    laborLine: 'Repair labor'
  };
  if (serviceType === 'FLAT_ROOF_REPAIR') return {
    ownerPricing: service(serviceType, {
      laborHourlyRate: 10000,
      repairMinimum: 0,
      patchRepairHours: { epdm: { seam_patch: { small: 1, medium: 2, large: 3 } } },
      patchMaterialAllowance: { epdm: { seam_patch: { small: 1000, medium: 2000, large: 3000 } } }
    }),
    inputs: { repairType: 'seam_patch', affectedArea: 10, membraneType: 'epdm', leakPresent: false, pondingWater: false },
    first: 20,
    second: 80,
    laborLine: 'Flat roof repair labor'
  };
  return {
    ownerPricing: service(serviceType, {
      laborHourlyRate: 10000,
      repairMinimum: 0,
      repairHours: { vinyl: { minor: { small: 1, medium: 2, large: 3 } } },
      materialAllowance: { vinyl: { minor: { small: 1000, medium: 2000, large: 3000 } } }
    }),
    inputs: { sidingType: 'vinyl', damageLevel: 'minor', affectedArea: 10, stories: 1 },
    first: 20,
    second: 80,
    laborLine: 'Siding repair labor'
  };
}

test('repair 12: measured affected area derives repair categories at every boundary', () => {
  for (const serviceType of ['ROOFING_REPAIR', 'FLAT_ROOF_REPAIR', 'SIDING_REPAIR']) {
    const fixture = repairFixture(serviceType);
    const cases = [
      [fixture.first - 0.01, 'small', 10000],
      [fixture.first, 'medium', 20000],
      [fixture.first + 0.01, 'medium', 20000],
      [fixture.second - 0.01, 'medium', 20000],
      [fixture.second, 'medium', 20000],
      [fixture.second + 0.01, 'large', 30000]
    ];
    for (const [affectedArea, category, expectedLabor] of cases) {
      const result = run(serviceType, { ...fixture.inputs, affectedArea }, fixture.ownerPricing);
      assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', `${serviceType} ${affectedArea}`);
      assert.equal(lineAmount(result, fixture.laborLine), expectedLabor, `${serviceType} ${affectedArea}`);
      const measurement = result.calculationRecord.options[0].measurements.find(item => item.name === 'affectedAreaSqft');
      assert.deepEqual([measurement.value, measurement.derivedCategory], [affectedArea, category]);
    }
    const missing = structuredClone(fixture.inputs);
    delete missing.affectedArea;
    assert.equal(run(serviceType, missing, fixture.ownerPricing).resultType, 'ESTIMATE_REQUIRES_REVIEW');
    const categoryOnly = { ...missing, repairSize: 'small' };
    const rejected = run(serviceType, categoryOnly, fixture.ownerPricing);
    assert.equal(rejected.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(rejected.missingCustomerFields.includes('affectedArea'), true);
    assert.equal(rejected.invalidCustomerFields.includes('repairSize'), true);
  }
});

test('repair 13: active leak urgency survives every review path', () => {
  for (const serviceType of ['ROOFING_REPAIR', 'FLAT_ROOF_REPAIR']) {
    const fixture = repairFixture(serviceType);
    const leaking = { ...fixture.inputs, leakPresent: true };
    const cases = [];
    const missingArea = structuredClone(leaking);
    delete missingArea.affectedArea;
    cases.push([missingArea, fixture.ownerPricing]);
    cases.push([{ ...leaking, repairType: serviceType === 'ROOFING_REPAIR' ? 'unknown' : 'unknown_leak' }, fixture.ownerPricing]);
    const missingPricing = structuredClone(fixture.ownerPricing);
    delete missingPricing.pricing.laborHourlyRate;
    cases.push([leaking, missingPricing]);
    cases.push([leaking, { ...fixture.ownerPricing, pricing: { ...fixture.ownerPricing.pricing, laborHourlyRate: -1 } }]);
    const failedTiers = structuredClone(fixture.ownerPricing);
    failedTiers.tiers = [{ name: 'Good', overrides: { laborHourlyRate: 0 } }, { name: 'Better', overrides: { repairMinimum: -1 } }];
    cases.push([leaking, failedTiers]);
    for (const [inputs, pricing] of cases) {
      const result = run(serviceType, inputs, pricing);
      assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
      assert.deepEqual(result.urgencyFlags, ['Active leak reported']);
      const noLeak = run(serviceType, { ...inputs, leakPresent: false }, pricing);
      assert.deepEqual(noLeak.urgencyFlags, []);
    }
  }
});

test('repair 14: selected gate widths fail closed without an approved width-pricing contract', () => {
  for (const gateWidthTotalLF of [4, 12]) {
    const result = run('FENCING_INSTALL', fenceInputs({ gateCount: 1, gateWidthTotalLF }), fenceService());
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(result.lineItems, undefined);
    assert.equal(result.ownerDecisionRequired.some(item => item.kind === 'mixed_charge_allocation'), true);
    const gateDecision = result.ownerDecisionRequired.find(item => item.kind === 'gate_width_pricing_contract');
    assert.equal(gateDecision.path, 'gatePrice.wood');
    assert.match(gateDecision.message, /existing per-gate price cannot distinguish opening widths/);
  }

  const gateless = run('FENCING_INSTALL', fenceInputs({ gateCount: 0, gateWidthTotalLF: 0 }), fenceService());
  assert.equal(gateless.ownerDecisionRequired.some(item => item.kind === 'gate_width_pricing_contract'), false);
});

test('repair 15: corner count is not required and cannot be silently ignored', () => {
  const validInputs = fenceInputs();
  const validContract = validateCustomerInputs('FENCING_INSTALL', validInputs, fenceService().pricing);
  assert.equal(validContract.ok, true);

  const heldForOwnerDecision = run('FENCING_INSTALL', validInputs, fenceService());
  assert.equal(heldForOwnerDecision.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(heldForOwnerDecision.invalidCustomerFields, []);

  const supplied = validateCustomerInputs('FENCING_INSTALL', { ...validInputs, cornerCount: 2 }, fenceService().pricing);
  assert.equal(supplied.ok, false);
  assert.equal(supplied.invalidCustomerFields.includes('cornerCount'), true);
});

test('repair 16: fencing requires prices only for selected gate and post scope', () => {
  const gatelessInputs = fenceInputs({ gateWidthTotalLF: undefined });
  const gatelessMissingPrice = fenceService({ gatePrice: undefined });
  const gateless = validateOwnerPricing('FENCING_INSTALL', gatelessInputs, gatelessMissingPrice.pricing);
  assert.equal(gateless.missingOwnerFields.includes('gatePrice.wood'), false);

  const zeroWidth = validateCustomerInputs('FENCING_INSTALL', fenceInputs({ gateWidthTotalLF: 0 }), gatelessMissingPrice.pricing);
  assert.equal(zeroWidth.ok, true);
  const impossibleWidth = validateCustomerInputs('FENCING_INSTALL', fenceInputs({ gateWidthTotalLF: 4 }), gatelessMissingPrice.pricing);
  assert.equal(impossibleWidth.ok, false);
  assert.equal(impossibleWidth.invalidCustomerFields.includes('gateWidthTotalLF'), true);

  const selectedInputs = fenceInputs({ gateCount: 1, gateWidthTotalLF: 4 });
  const selectedMissingPrice = validateOwnerPricing('FENCING_INSTALL', selectedInputs, gatelessMissingPrice.pricing);
  assert.equal(selectedMissingPrice.missingOwnerFields.includes('gatePrice.wood'), true);

  const includedPosts = fenceService({ postsIncludedInMaterial: { wood: true }, postPrice: undefined });
  const included = validateOwnerPricing('FENCING_INSTALL', gatelessInputs, includedPosts.pricing);
  assert.equal(included.missingOwnerFields.includes('postPrice.wood'), false);

  const separatePosts = fenceService({ postsIncludedInMaterial: { wood: false }, postPrice: undefined });
  const separate = validateOwnerPricing('FENCING_INSTALL', gatelessInputs, separatePosts.pricing);
  assert.equal(separate.missingOwnerFields.includes('postPrice.wood'), true);

  for (const result of [gateless, selectedMissingPrice, included, separate]) {
    assert.equal(result.ownerDecisionRequired.some(item => item.kind === 'mixed_charge_allocation'), true);
  }
});

test('repair 17: mixed concrete and digging charge fails closed without an allocation rule', () => {
  const pricing = fenceService({
    laborPerLinearFoot: { wood: 1 },
    materialPerLinearFoot: { wood: 1 },
    postsIncludedInMaterial: { wood: true },
    postPrice: undefined,
    gatePrice: undefined,
    concretePerPost: 700
  });
  for (const priceBasisByCategory of [
    { ...sellBasis, labor: 'cost' },
    { ...sellBasis, material: 'cost' }
  ]) {
    const result = run('FENCING_INSTALL', fenceInputs(), { ...pricing, priceBasisByCategory }, {
      businessDefaults: { ...defaults, markupPercent: 100, taxMode: 'TAX_MATERIALS', taxPercent: 10 }
    });
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(result.invalidOwnerFields.includes('concretePerPost'), false);
    assert.equal(result.ownerDecisionRequired.some(item => item.kind === 'mixed_charge_allocation'), true);
    assert.equal(lineAmount(result, 'Markup'), undefined);
    assert.equal(lineAmount(result, 'Tax'), undefined);
  }
});
test('repair 18: exposed aggregate fails closed without approved material pricing', () => {
  const exposed = run('CONCRETE_DRIVEWAY', concreteInputs({ finishType: 'exposed_aggregate' }), concreteService());
  assert.equal(exposed.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(exposed.ownerDecisionRequired.some(item => item.kind === 'finish_material_pricing_contract'), true);
  for (const finishType of ['broom', 'smooth']) {
    assert.equal(run('CONCRETE_DRIVEWAY', concreteInputs({ finishType }), concreteService()).resultType, 'INSTANT_ESTIMATE_READY');
  }
  const stamped = run('CONCRETE_DRIVEWAY', concreteInputs({ finishType: 'stamped' }), concreteService({ stampedMaterialPerSqft: 100 }));
  assert.equal(stamped.resultType, 'INSTANT_ESTIMATE_READY');
});

test('repair 19: zero and missing remain distinct for conditional prices', () => {
  const cleanupPricing = service('LANDSCAPING_CLEANUP', {
    cleanupBaseRatePerSqft: 10,
    debrisPricing: {
      light: { laborMultiplier: 1, disposalFlat: 0 },
      moderate: { laborMultiplier: 1.5, disposalFlat: 10000 },
      heavy: { laborMultiplier: 2, disposalFlat: 15000 }
    },
    minimumServiceCharge: 0,
    haulAwayFee: 5000
  });
  const cleanupBase = { yardSqft: 1000, sqftMethod: 'exact', slope: 'flat', haulAway: false };
  const heavy = run('LANDSCAPING_CLEANUP', { ...cleanupBase, debrisLevel: 'heavy' }, cleanupPricing);
  assert.equal(heavy.resultType, 'INSTANT_ESTIMATE_READY');
  const freeLight = run('LANDSCAPING_CLEANUP', { ...cleanupBase, debrisLevel: 'light' }, cleanupPricing);
  assert.equal(freeLight.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(lineAmount(freeLight, 'Debris disposal'), 0);

  assert.equal(run('FLOORING_INSTALL', flooringInputs({ stairSteps: 0 }), flooringService({ perStepPrice: 0 })).resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(run('FLOORING_INSTALL', flooringInputs({ stairSteps: 1 }), flooringService({ perStepPrice: 0 })).resultType, 'ESTIMATE_REQUIRES_REVIEW');

  const pondingPricing = service('FLAT_ROOF_REPAIR', {
    laborHourlyRate: 10000,
    repairMinimum: 0,
    pondingWaterSurcharge: 0,
    patchRepairHours: { epdm: { seam_patch: { small: 1, medium: 2, large: 3 } } },
    patchMaterialAllowance: { epdm: { seam_patch: { small: 1000, medium: 2000, large: 3000 } } }
  });
  const ponding = run('FLAT_ROOF_REPAIR', { repairType: 'seam_patch', affectedArea: 10, membraneType: 'epdm', leakPresent: false, pondingWater: true }, pondingPricing);
  assert.equal(ponding.resultType, 'INSTANT_ESTIMATE_READY');
  assert.deepEqual(ponding.options[0].skippedAddons, []);
  assert.equal(lineAmount(ponding, 'Ponding water surcharge'), 0);

  const mowingPricing = service('LANDSCAPING_MOWING', {
    mowingBaseRatePerSqft: 2,
    minimumServiceCharge: 0,
    frequencyMultipliers: { weekly: 1, biweekly: 1.2, monthly: 1.5, one_time: 1.8 },
    overgrowthMultipliers: { maintained: 1, overgrown: 1.5, severe: 2 },
    baggingSurchargePercent: 0,
    edgingPerLinearFoot: 0
  });
  const mowingInputs = { yardSqft: 5000, sqftMethod: 'exact', serviceFrequency: 'weekly', grassCondition: 'maintained', bagClippings: true, edgingIncluded: true, edgingLengthLF: 100 };
  const mowing = run('LANDSCAPING_MOWING', mowingInputs, mowingPricing);
  assert.equal(mowing.resultType, 'INSTANT_ESTIMATE_READY');
  assert.deepEqual(mowing.options[0].skippedAddons, []);
  assert.equal(lineAmount(mowing, 'Clipping bagging and disposal'), 0);
  assert.equal(lineAmount(mowing, 'Lawn edging'), 0);
  assert.equal(/does not include/i.test(mowing.disclaimer), false);

  const missing = structuredClone(mowingPricing);
  delete missing.pricing.baggingSurchargePercent;
  delete missing.pricing.edgingPerLinearFoot;
  const omitted = run('LANDSCAPING_MOWING', mowingInputs, missing);
  assert.deepEqual(omitted.options[0].skippedAddons.sort(), ['Clipping bagging and disposal', 'Lawn edging'].sort());
});

test('repair 20: owner preview evaluates a valid inactive draft without enabling customer quote', () => {
  const inactive = { ...interiorService(), active: false };
  const pricebook = { defaults, services: [inactive] };
  const preview = previewFromVNextPricebook({ pricebook, serviceType: 'INTERIOR_PAINTING', customerInputs: interiorInputs(), currentMonth: 1 });
  const customer = quoteFromVNextPricebook({ pricebook, serviceType: 'INTERIOR_PAINTING', customerInputs: interiorInputs(), callerType: 'customer', currentMonth: 1 });
  assert.equal(preview.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(customer.resultType, 'ESTIMATE_REQUIRES_REVIEW');
});

test('repair 21: owner pricing diagnostics identify exact fields and failure kinds', () => {
  const badClass2 = roofService({ pitchMultiplier: { low: 1, medum: 1.15, steep: 1.25, very_steep: 1.4 } });
  const class2Result = run('ROOFING_REPLACEMENT', roofInputs(), badClass2);
  assert.equal(class2Result.ownerDiagnostics.some(item => item.type === 'invalid' && item.path === 'pitchMultiplier'), true);

  const unsupported = roofService({ hiddenMultiplier: 2 });
  const unsupportedResult = run('ROOFING_REPLACEMENT', roofInputs(), unsupported);
  assert.deepEqual(unsupportedResult.unsupportedOwnerFields, ['hiddenMultiplier']);
  assert.equal(unsupportedResult.ownerDiagnostics.some(item => item.type === 'unsupported' && item.path === 'hiddenMultiplier'), true);

  const badThresholds = flooringService({ roomSizeThresholds: { smallMaxSqft: 400, mediumMaxSqft: 200 } });
  const owner = validateOwnerPricing('FLOORING_INSTALL', flooringInputs(), badThresholds.pricing);
  assert.equal(owner.crossFieldOwnerFields.includes('roomSizeThresholds.smallMaxSqft'), true);
  assert.equal(owner.crossFieldOwnerFields.includes('roomSizeThresholds.mediumMaxSqft'), true);
});

function tieredInterior(tiers) {
  return interiorService({}, { tiers });
}

test('repair 22: every failed tier retains separate field diagnostics', () => {
  const allFailed = run('INTERIOR_PAINTING', interiorInputs(), tieredInterior([
    { name: 'Good', overrides: { laborPerWallSqftPerCoat: 0 } },
    { name: 'Better', overrides: { materialPerWallSqftPerCoat: 0 } },
    { name: 'Best', overrides: { minimumJob: -1 } }
  ]));
  assert.equal(allFailed.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(allFailed.failedTierDiagnostics.map(item => [item.tierName, item.invalidOwnerFields[0]]), [
    ['Good', 'laborPerWallSqftPerCoat'],
    ['Better', 'materialPerWallSqftPerCoat'],
    ['Best', 'minimumJob']
  ]);

  const oneValid = run('INTERIOR_PAINTING', interiorInputs(), tieredInterior([
    { name: 'Good', overrides: {} },
    { name: 'Better', overrides: { materialPerWallSqftPerCoat: 0 } },
    { name: 'Best', overrides: { minimumJob: -1 } }
  ]));
  assert.equal(oneValid.options.length, 1);
  assert.equal(oneValid.failedTierDiagnostics.length, 2);

  const twoValid = run('INTERIOR_PAINTING', interiorInputs(), tieredInterior([
    { name: 'Good', overrides: {} },
    { name: 'Better', overrides: { laborPerWallSqftPerCoat: 120 } },
    { name: 'Best', overrides: { minimumJob: -1 } }
  ]));
  assert.equal(twoValid.options.length, 2);
  assert.equal(twoValid.failedTierDiagnostics.length, 1);
  assert.equal(twoValid.failedTierDiagnostics[0].tierName, 'Best');
});

test('repair 23: customer sees unavailable option notice without owner diagnostics', () => {
  const ownerPricing = tieredInterior([
    { name: 'Good', overrides: {} },
    { name: 'Better', overrides: { materialPerWallSqftPerCoat: 0 } }
  ]);
  const customer = run('INTERIOR_PAINTING', interiorInputs(), ownerPricing, { callerType: 'customer' });
  assert.equal(customer.resultType, 'INSTANT_ESTIMATE_READY');
  assert.match(customer.optionAvailabilityNotice, /fewer options/i);
  const serialized = JSON.stringify(customer);
  for (const forbidden of ['materialPerWallSqftPerCoat', 'failedTierDiagnostics', 'invalidOwnerFields', 'rateCents']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('repair 24: every customer review uses the same truthful request message', () => {
  const expected = 'We received your request. Someone will follow up to complete or verify the estimate.';
  const cases = [
    run('INTERIOR_PAINTING', { ...interiorInputs(), wallAreaSqft: undefined }, interiorService(), { callerType: 'customer' }),
    run('INTERIOR_PAINTING', { ...interiorInputs(), coats: 9 }, interiorService(), { callerType: 'customer' }),
    run('INTERIOR_PAINTING', interiorInputs(), interiorService({ laborPerWallSqftPerCoat: 0 }), { callerType: 'customer' }),
    run('INTERIOR_PAINTING', interiorInputs({ areaInputMethod: 'rooms' }), interiorService(), { callerType: 'customer' })
  ];
  for (const result of cases) {
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(result.customerMessage, expected);
  }
});

test('repair 25: customer-safe price drivers rank by financial significance', () => {
  const ownerPricing = interiorService({
    laborPerWallSqftPerCoat: 1,
    materialPerWallSqftPerCoat: 1,
    ceilingLaborPerSqftPerCoat: 1,
    ceilingMaterialPerSqftPerCoat: 1,
    trimLaborPerLF: 1,
    trimMaterialPerLF: 10000
  });
  const result = run('INTERIOR_PAINTING', interiorInputs({ ceilingsIncluded: true, ceilingAreaSqft: 100, trimIncluded: true, trimLengthLF: 10 }), ownerPricing);
  assert.equal(result.priceDrivers.includes('Trim materials'), true, JSON.stringify(result.priceDrivers));
  assert.equal(result.priceDrivers[0], 'Trim materials');
  for (const forbidden of ['rate', 'cost', 'markup', 'overhead', 'margin']) {
    assert.equal(result.priceDrivers.join(' ').toLowerCase().includes(forbidden), false);
  }
});

test('repair 26: every calculation line declares a reproducible evidence variant', () => {
  const quantity = run('INTERIOR_PAINTING', interiorInputs(), interiorService());
  const quantityLine = line(quantity, 'Wall labor');
  assert.equal(quantityLine.calculation.evidenceVariant, 'quantity_rate');
  const product = quantityLine.calculation.multipliers.reduce((total, item) => total * item.value, 1);
  assert.equal(Math.round(quantityLine.calculation.quantity * quantityLine.calculation.rateCents * product), quantityLine.amountCents);

  const fixed = run('LANDSCAPING_CLEANUP', { yardSqft: 1000, sqftMethod: 'exact', debrisLevel: 'heavy', slope: 'flat', haulAway: false }, service('LANDSCAPING_CLEANUP', {
    cleanupBaseRatePerSqft: 10,
    debrisPricing: {
      light: { laborMultiplier: 1, disposalFlat: 5000 },
      moderate: { laborMultiplier: 1.5, disposalFlat: 10000 },
      heavy: { laborMultiplier: 2, disposalFlat: 15000 }
    },
    minimumServiceCharge: 0
  }));
  assert.equal(line(fixed, 'Debris disposal').calculation.evidenceVariant, 'fixed_amount');
  assert.equal(line(fixed, 'Debris disposal').calculation.amountCents, 15000);

  const percentage = run('INTERIOR_PAINTING', interiorInputs(), interiorService({}, { taxabilityByCategory: { ...noTaxability, material: true } }), {
    businessDefaults: { ...defaults, markupPercent: 10, taxMode: 'TAX_MATERIALS', taxPercent: 10 }
  });
  for (const name of ['Markup', 'Tax']) assert.equal(line(percentage, name).calculation.evidenceVariant, 'percentage_derived');

  const composite = run('CONCRETE_DRIVEWAY', concreteInputs(), concreteService());
  const compositeLine = line(composite, 'Concrete labor');
  assert.equal(compositeLine.calculation.evidenceVariant, 'composite');
  assert.equal(compositeLine.calculation.components.reduce((sum, item) => sum + item.amountCents, 0), compositeLine.amountCents);

  const rangedOwner = service('CUSTOM', { customPricingMode: 'range', low: 8000, high: 12000, unit: 'flat', minimumJob: 0 }, { service: 'Ranged service' });
  const ranged = run('CUSTOM', { service: 'Ranged service', serviceConfirmed: true, unit: 'flat' }, rangedOwner);
  assert.equal(line(ranged, 'Ranged service').calculation.evidenceVariant, 'ranged');
  assert.equal(line(ranged, 'Ranged service').rangeAmountCents.low, 8000);
  assert.equal(line(ranged, 'Ranged service').rangeAmountCents.high, 12000);

  const minimum = run('INTERIOR_PAINTING', interiorInputs(), interiorService({ minimumJob: 20000 }));
  const feeAndSeasonalOwner = interiorService({}, {
    feeRules: { ...feeRules, travel: 'always' },
    peakMonths: [1],
    peakSurchargePercent: 10
  });
  const feeAndSeasonal = run('INTERIOR_PAINTING', interiorInputs(), feeAndSeasonalOwner, {
    businessDefaults: { ...defaults, travelFee: 5000 }
  });
  for (const result of [quantity, fixed, percentage, composite, ranged, minimum, feeAndSeasonal]) {
    for (const item of result.lineItems) assertLineReproducible(item);
  }

  const readme = readFileSync('server/quote-engine-vnext/README.md', 'utf8');
  for (const variant of ['quantity_rate', 'fixed_amount', 'percentage_derived', 'composite', 'ranged']) {
    assert.equal(readme.includes(String.fromCharCode(96) + variant + String.fromCharCode(96)), true, variant);
  }
});

test('repair 27: measured quotes expose the exact effective range buffer', () => {
  const result = run('INTERIOR_PAINTING', interiorInputs(), interiorService(), {
    businessDefaults: { ...defaults, rangeBufferPercent: 17 }
  });
  assert.equal(result.effectiveRangeBufferPercent, 17);
  assert.equal(result.options[0].effectiveRangeBufferPercent, 17);
  assert.equal(result.calculationRecord.options[0].range.bufferPercent, 17);

  const flat = service('FLAT_ROOF_REPLACEMENT', {
    laborPerSqft: { epdm: 500 },
    membraneCostPerSqft: { epdm: 700 },
    tearOffPerSqft: { epdm: 200 },
    minimumJob: 0
  });
  const unknown = run('FLAT_ROOF_REPLACEMENT', { roofSqft: 1000, sqftMethod: 'exact', membraneType: 'unknown', existingLayers: 1, accessDifficulty: 'easy', serviceScope: 'full', buildingType: 'residential' }, flat);
  assert.equal(unknown.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(unknown.effectiveRangeBufferPercent, undefined);
});

test('repair 28: ordinary tests include every VNext suite and keep the dedicated gate', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const gate = readFileSync('server/scripts/quote-vnext-gate.js', 'utf8');
  for (const file of ['test/quoteEngineVNext.spec.js', 'test/quoteEngineVNextAdversarial.spec.js', 'test/quoteEngineVNextRepairs.spec.js']) {
    assert.equal(pkg.scripts.test.includes(file), true, file);
    assert.equal(pkg.scripts['test:vnext'].includes(file), true, file);
    assert.equal(gate.includes(file), true, file);
  }
  assert.equal(pkg.scripts['gate:quote-vnext'], 'node server/scripts/quote-vnext-gate.js');
});
