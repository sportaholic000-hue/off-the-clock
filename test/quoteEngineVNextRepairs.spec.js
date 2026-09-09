import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLASS2_DEFINITIONS,
  MEASUREMENT_CONTRACTS,
  PRICE_BASIS_CATEGORIES,
  TAXABILITY_CATEGORIES,
  buildInternalLeadVNext,
  generateQuoteVNext,
  getVNextPriceBookMetadata,
  liveQuoteVNext,
  materializeScenarioLinesVNext,
  materializeVNextService,
  mergePricingVNext,
  previewFromVNextPricebook,
  previewQuoteVNext,
  quoteFromVNextPricebook,
  sanitizeForCustomerVNext,
  validateBusinessDefaults,
  validateClass2FactorsDetailed,
  validateCustomerInputs,
  validatePricingStructuresDetailed,
  validateOwnerPricing,
  validateServiceRules,
  validateServiceRulesDetailed,
  validateVNextPricebook,
  validateTierDefinitionsDetailedVNext,
  validateTierDefinitionsVNext,
  vNextPricebookStatuses,
  vNextServiceStatus,
  withClass2Defaults
} from '../server/quote-engine-vnext/index.js';
import { calculateServiceVNext } from '../server/quote-engine-vnext/templates.js';
import { aiConfirmationFieldsVNext } from '../server/quote-engine-vnext/contracts.js';
import { denseArrayIssue, snapshotPlainData } from '../server/quote-engine-vnext/safeData.js';

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
    active: true,
    serviceType,
    service: serviceType,
    pricing: configuredPricing,
    feeRules: structuredClone(feeRules),
    priceBasisByCategory: basis,
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
    callerType: 'owner',
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

function oracleGcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function oracleRational(numerator, denominator = 1n) {
  if (denominator < 0n) [numerator, denominator] = [-numerator, -denominator];
  if (numerator === 0n) return { numerator: 0n, denominator: 1n };
  const divisor = oracleGcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function oracleDecimal(value) {
  if (value && typeof value === 'object' && typeof value.numerator === 'bigint') return value;
  if (value && typeof value === 'object' && typeof value.numerator === 'string' && typeof value.denominator === 'string') {
    return oracleRational(BigInt(value.numerator), BigInt(value.denominator));
  }
  assert.equal(typeof value, 'number');
  assert.equal(Number.isFinite(value), true);
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value.toString());
  assert.ok(match);
  const [, sign, whole, fraction = '', exponentText = '0'] = match;
  let numerator = BigInt((whole + fraction).replace(/^0+(?=\d)/, '') || '0');
  const scale = fraction.length - Number(exponentText);
  let denominator = 1n;
  if (scale > 0) denominator = 10n ** BigInt(scale);
  else if (scale < 0) numerator *= 10n ** BigInt(-scale);
  if (sign === '-') numerator = -numerator;
  return oracleRational(numerator, denominator);
}

function oracleMultiply(...values) {
  return values.reduce((product, value) => {
    const next = oracleDecimal(value);
    return oracleRational(product.numerator * next.numerator, product.denominator * next.denominator);
  }, oracleRational(1n));
}

function oracleSubtract(left, right) {
  left = oracleDecimal(left);
  right = oracleDecimal(right);
  return oracleRational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

function oracleDivide(left, right) {
  left = oracleDecimal(left);
  right = oracleDecimal(right);
  assert.notEqual(right.numerator, 0n);
  return oracleRational(left.numerator * right.denominator, left.denominator * right.numerator);
}

function oracleRound(value) {
  value = oracleDecimal(value);
  assert.ok(value.numerator >= 0n);
  const quotient = value.numerator / value.denominator;
  const remainder = value.numerator % value.denominator;
  return Number(remainder * 2n >= value.denominator ? quotient + 1n : quotient);
}

function oracleNumber(value) {
  value = oracleDecimal(value);
  return Number(value.numerator) / Number(value.denominator);
}

function oracleEvidence(value) {
  value = oracleDecimal(value);
  return { numerator: value.numerator.toString(), denominator: value.denominator.toString() };
}

function assertLineReproducible(item) {
  const calculation = item.calculation;
  let expected;
  if (['quantity_rate', 'ranged'].includes(calculation.evidenceVariant)) {
    const quantity = oracleDecimal(calculation.exactQuantity);
    assert.equal(Object.is(oracleNumber(quantity), calculation.quantity), true);
    const multipliers = calculation.multipliers.map(entry => {
      const exact = oracleDecimal(entry.exactValue);
      assert.equal(Object.is(oracleNumber(exact), entry.value), true);
      return exact;
    });
    const exactUnrounded = oracleMultiply(quantity, calculation.rateCents, ...multipliers);
    assert.deepEqual(calculation.exactUnroundedCents, oracleEvidence(exactUnrounded));
    assert.equal(Object.is(calculation.unroundedCents, oracleNumber(exactUnrounded)), true);
    expected = oracleRound(exactUnrounded);
    if (calculation.evidenceVariant === 'ranged') {
      assert.equal(item.rangeAmountCents.low, oracleRound(oracleMultiply(quantity, calculation.lowRateCents, ...multipliers)));
      assert.equal(calculation.midAmountCents, oracleRound(oracleMultiply(quantity, calculation.midRateCents, ...multipliers)));
      assert.equal(item.rangeAmountCents.high, oracleRound(oracleMultiply(quantity, calculation.highRateCents, ...multipliers)));
    }
  } else if (calculation.evidenceVariant === 'fixed_amount') {
    expected = calculation.subtotalBeforeMinimumCents === undefined
      ? calculation.amountCents
      : Math.max(0, calculation.effectiveMinimumCents - calculation.subtotalBeforeMinimumCents);
  } else if (calculation.evidenceVariant === 'percentage_derived') {
    const fraction = oracleDivide(calculation.percent, 100);
    const exactUnrounded = calculation.mode === 'margin'
      ? oracleSubtract(oracleDivide(calculation.basisAmountCents, oracleSubtract(1, fraction)), calculation.basisAmountCents)
      : oracleMultiply(calculation.basisAmountCents, fraction);
    assert.deepEqual(calculation.exactUnroundedCents, oracleEvidence(exactUnrounded));
    assert.equal(Object.is(calculation.unroundedCents, oracleNumber(exactUnrounded)), true);
    expected = oracleRound(exactUnrounded);
  } else if (calculation.evidenceVariant === 'composite') {
    expected = calculation.components.reduce((sum, component) => {
      const quantity = oracleDecimal(component.exactQuantity);
      const multipliers = component.multipliers.map(entry => oracleDecimal(entry.exactValue));
      const exactUnrounded = oracleMultiply(quantity, component.rateCents, ...multipliers);
      assert.deepEqual(component.exactUnroundedCents, oracleEvidence(exactUnrounded));
      const componentExpected = oracleRound(exactUnrounded);
      assert.equal(component.amountCents, componentExpected);
      return sum + componentExpected;
    }, 0);
  } else {
    assert.fail('Unsupported evidence variant: ' + calculation.evidenceVariant);
  }
  assert.equal(calculation.roundedAmountCents, expected, item.name + ' evidence');
  assert.equal(item.amountCents, expected, item.name);
}

function rangedEvidenceLine({ quantity = 1, lowRateCents, highRateCents, ratePath = 'rangePricing' }) {
  const exactQuantity = oracleDecimal(quantity);
  const rateCents = lowRateCents + oracleRound(oracleDivide(highRateCents - lowRateCents, 2));
  const exactUnrounded = oracleMultiply(exactQuantity, rateCents);
  const amountCents = oracleRound(exactUnrounded);
  return {
    name: 'Intrinsic range evidence fixture',
    category: 'equipment',
    amountCents,
    ownerVisible: true,
    customerVisible: false,
    ...(amountCents === 0 ? { noCharge: true } : {}),
    calculation: {
      evidenceVariant: 'ranged',
      quantity,
      exactQuantity: oracleEvidence(exactQuantity),
      unit: 'measured units',
      rateCents,
      midRateCents: rateCents,
      midAmountCents: amountCents,
      ratePath,
      lowRateCents,
      highRateCents,
      multipliers: [],
      unroundedCents: oracleNumber(exactUnrounded),
      exactUnroundedCents: oracleEvidence(exactUnrounded),
      roundedAmountCents: amountCents
    },
    rangeAmountCents: {
      low: oracleRound(oracleMultiply(exactQuantity, lowRateCents)),
      high: oracleRound(oracleMultiply(exactQuantity, highRateCents))
    }
  };
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
  }, overrides);
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
  }, overrides);
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
  const ownerPricing = interiorService({ minimumJob: 20000 }, { taxabilityByCategory: { ...noTaxability, material: true } });
  for (const [taxMode, values] of Object.entries(expected)) {
    const businessDefaults = { ...defaults, taxMode, taxPercent: taxMode === 'TAX_NONE' ? 0 : 10 };
    const result = run('INTERIOR_PAINTING', inputs, ownerPricing, { businessDefaults });
    assert.equal(scenario(result).tax.taxCents, values.tax, `${taxMode} tax`);
    assert.equal(scenario(result).minimum.adjustmentCents, values.adjustment, `${taxMode} minimum`);
    assert.equal(scenario(result).tax.finalTotalCents, values.final, `${taxMode} final`);
    assert.equal(scenario(result).minimum.basis, values.basis, `${taxMode} basis`);
    assert.deepEqual(scenario(result).order, values.order, `${taxMode} order`);
    assert.equal(line(result, 'Minimum price adjustment').taxable, false, `${taxMode} adjustment category`);
  }

  const obsoleteControl = interiorService(
    { minimumJob: 20000 },
    { taxabilityByCategory: { ...noTaxability, material: true, minimum_adjustment: true } }
  );
  const rejected = run('INTERIOR_PAINTING', inputs, obsoleteControl);
  assert.equal(rejected.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(rejected.unsupportedOwnerFields.includes('taxabilityByCategory.minimum_adjustment'), true);
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
  const expectedRanges = new Map([
    [1, [1, 1, 1]],
    [499, [374, 499, 624]],
    [500, [375, 500, 625]],
    [501, [376, 501, 626]],
    [999, [749, 999, 1249]],
    [1000, [1000, 1000, 1000]],
    [1001, [1000, 1000, 1001]]
  ]);
  for (const [price, expectedRange] of expectedRanges) {
    const ownerPricing = interiorService({
      laborPerWallSqftPerCoat: price,
      materialPerWallSqftPerCoat: 0,
      minimumJob: 0
    });
    const result = run('INTERIOR_PAINTING', interiorInputs({ wallAreaSqft: 1, coats: 1 }), ownerPricing, {
      businessDefaults: { ...defaults, rangeBufferPercent: 25 }
    });
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', `${price} cents`);
    const range = result.calculationRecord.options[0].range;
    assert.deepEqual([range.lowCents, range.midCents, range.highCents], expectedRange, `${price} cents`);
    assert.equal(range.exactMidScenarioTotalCents, price, `${price} exact total`);
  }

  const free = run(
    'INTERIOR_PAINTING',
    interiorInputs({ wallAreaSqft: 1, coats: 1 }),
    interiorService({
      laborPerWallSqftPerCoat: 0,
      materialPerWallSqftPerCoat: 0,
      minimumJob: 0
    }),
    { businessDefaults: { ...defaults, rangeBufferPercent: 25 } }
  );
  assert.equal(free.resultType, 'INSTANT_ESTIMATE_READY');
  assert.deepEqual([free.lowEstimate, free.midEstimate, free.highEstimate], [0, 0, 0]);
  assert.equal(free.lineItems.every(item => item.noCharge === true), true);
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

test('repair 10: flooring underlayment has a field-specific installed-area sell basis', () => {
  const straight = run('FLOORING_INSTALL', flooringInputs({ layoutPattern: 'straight' }), flooringService());
  const patterned = run('FLOORING_INSTALL', flooringInputs({ layoutPattern: 'diagonal_or_pattern' }), flooringService());
  const changedWaste = flooringService({ wasteFactorByType: { hardwood: 0.10, laminate: 0.08, vinyl_plank: 0.30, carpet: 0.10, tile: 0.12 } });
  const wasteChanged = run('FLOORING_INSTALL', flooringInputs(), changedWaste);
  assert.equal(lineAmount(straight, 'Underlayment'), 15000);
  assert.equal(lineAmount(patterned, 'Underlayment'), 15000);
  assert.equal(lineAmount(wasteChanged, 'Underlayment'), 15000);
  assert.notEqual(lineAmount(straight, 'Flooring materials'), lineAmount(patterned, 'Flooring materials'));

  const mixedBasis = run('FLOORING_INSTALL', flooringInputs(), flooringService(), {
    businessDefaults: { ...defaults, markupPercent: 100 }
  });
  assert.equal(mixedBasis.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(mixedBasis));
  assert.equal(line(mixedBasis, 'Underlayment').priceBasis, 'sell_price');
  assert.equal(scenario(mixedBasis).markup.eligibleLines.some(item => item.name === 'Flooring materials'), true);
  assert.equal(scenario(mixedBasis).markup.eligibleLines.some(item => item.name === 'Underlayment'), false);
  assert.equal(scenario(mixedBasis).markup.sellPriceLinesExcluded.includes('Underlayment'), true);
});

test('repair 10: roofing underlayment has a field-specific installed-area sell basis', () => {
  const simple = run('ROOFING_REPLACEMENT', roofInputs({ roofComplexity: 'simple' }), roofService());
  const complex = run('ROOFING_REPLACEMENT', roofInputs({ roofComplexity: 'complex' }), roofService());
  assert.equal(lineAmount(simple, 'Underlayment'), 15000);
  assert.equal(lineAmount(complex, 'Underlayment'), 15000);
  assert.notEqual(lineAmount(simple, 'Field materials'), lineAmount(complex, 'Field materials'));

  const mixedBasis = run('ROOFING_REPLACEMENT', roofInputs(), roofService(), {
    businessDefaults: { ...defaults, markupPercent: 100 }
  });
  assert.equal(mixedBasis.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(mixedBasis));
  assert.equal(line(mixedBasis, 'Underlayment').priceBasis, 'sell_price');
  assert.equal(scenario(mixedBasis).markup.eligibleLines.some(item => item.name === 'Field materials'), true);
  assert.equal(scenario(mixedBasis).markup.eligibleLines.some(item => item.name === 'Underlayment'), false);
  assert.equal(scenario(mixedBasis).markup.sellPriceLinesExcluded.includes('Underlayment'), true);
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
    failedTiers.tiers = [{ name: 'Good', overrides: { laborHourlyRate: -1 } }, { name: 'Better', overrides: { repairMinimum: -1 } }];
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

test('repair 16: fencing requires executable post prices but never consumes the obsolete per-gate scalar', () => {
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
  assert.equal(selectedMissingPrice.missingOwnerFields.includes('gatePrice.wood'), false);
  assert.equal(selectedMissingPrice.ownerDecisionRequired.some(item => item.kind === 'gate_width_pricing_contract' && item.path === 'gatePrice.wood'), true);

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
  const freeStair = run('FLOORING_INSTALL', flooringInputs({ stairSteps: 1 }), flooringService({ perStepPrice: 0 }));
  assert.equal(freeStair.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(lineAmount(freeStair, 'Stair installation'), 0);
  assert.equal(line(freeStair, 'Stair installation').noCharge, true);

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
  assert.equal(class2Result.ownerDiagnostics.some(item => item.type === 'unsupported' && item.path === 'pitchMultiplier.medum'), true);
  assert.equal(class2Result.ownerDiagnostics.some(item => item.type === 'missing' && item.path === 'pitchMultiplier.medium'), true);
  assert.equal(class2Result.ownerDiagnostics.some(item => item.path === 'pitchMultiplier'), false);

  const unsupported = roofService({ hiddenMultiplier: 2 });
  const unsupportedResult = run('ROOFING_REPLACEMENT', roofInputs(), unsupported);
  assert.deepEqual(unsupportedResult.unsupportedOwnerFields, ['hiddenMultiplier']);
  assert.equal(unsupportedResult.ownerDiagnostics.some(item => item.type === 'unsupported' && item.path === 'hiddenMultiplier'), true);

  const malformedRepair = repairFixture('ROOFING_REPAIR');
  malformedRepair.ownerPricing.pricing.repairHours.asphalt_shingle.patch = { small: 1, medum: 2, large: 3 };
  const repairResult = run(
    'ROOFING_REPAIR',
    { ...malformedRepair.inputs, affectedArea: 75 },
    malformedRepair.ownerPricing
  );
  assert.equal(repairResult.ownerDiagnostics.some(item => item.type === 'unsupported' && item.path === 'repairHours.asphalt_shingle.patch.medum'), true);
  assert.equal(repairResult.ownerDiagnostics.some(item => item.type === 'missing' && item.path === 'repairHours.asphalt_shingle.patch.medium'), true);

  const cleanupPricing = service('LANDSCAPING_CLEANUP', {
    cleanupBaseRatePerSqft: 10,
    debrisPricing: {
      light: { laborMultipler: 1, disposalFlat: 0 },
      moderate: { laborMultiplier: 1.5, disposalFlat: 10000 },
      heavy: { laborMultiplier: 2, disposalFlat: 15000 }
    },
    minimumServiceCharge: 0
  });
  const debrisResult = run(
    'LANDSCAPING_CLEANUP',
    { yardSqft: 1000, sqftMethod: 'exact', debrisLevel: 'light', slope: 'flat', haulAway: false },
    cleanupPricing
  );
  assert.equal(debrisResult.ownerDiagnostics.some(item => item.type === 'unsupported' && item.path === 'debrisPricing.light.laborMultipler'), true);
  assert.equal(debrisResult.ownerDiagnostics.some(item => item.type === 'missing' && item.path === 'debrisPricing.light.laborMultiplier'), true);

  const badThresholds = flooringService({ roomSizeThresholds: { smallMaxSqft: 400, mediumMaxSqft: 200 } });
  const owner = validateOwnerPricing('FLOORING_INSTALL', flooringInputs(), badThresholds.pricing);
  assert.equal(owner.crossFieldOwnerFields.includes('roomSizeThresholds.smallMaxSqft'), true);
  assert.equal(owner.crossFieldOwnerFields.includes('roomSizeThresholds.mediumMaxSqft'), true);

  const badRules = interiorService({}, {
    feeRules: { ...feeRules, travel: 'sometimes', travle: 'always' },
    priceBasisByCategory: { ...costBasis, labor: 'wholesale', labr: 'cost' },
    taxabilityByCategory: { ...noTaxability, labor: 'yes', labr: false }
  });
  const ruleResult = run('INTERIOR_PAINTING', interiorInputs(), badRules);
  for (const [type, path] of [
    ['invalid', 'feeRules.travel'],
    ['unsupported', 'feeRules.travle'],
    ['invalid', 'priceBasisByCategory.labor'],
    ['unsupported', 'priceBasisByCategory.labr'],
    ['invalid', 'taxabilityByCategory.labor'],
    ['unsupported', 'taxabilityByCategory.labr']
  ]) {
    assert.equal(ruleResult.ownerDiagnostics.some(item => item.type === type && item.path === path), true, `${type} ${path}`);
  }

  const badDefaults = {
    ...defaults,
    travelFee: -1,
    markupApplies: { ...markupApplies, labr: true }
  };
  delete badDefaults.markupApplies.labor;
  const defaultResult = run('INTERIOR_PAINTING', interiorInputs(), interiorService(), {
    businessDefaults: badDefaults
  });
  for (const [type, path] of [
    ['invalid', 'businessDefaults.travelFee'],
    ['missing', 'businessDefaults.markupApplies.labor'],
    ['unsupported', 'businessDefaults.markupApplies.labr']
  ]) {
    assert.equal(defaultResult.ownerDiagnostics.some(item => item.type === type && item.path === path), true, `${type} ${path}`);
  }

  const badTier = interiorService({}, {
    tiers: [
      { name: 'Good', overrides: { hiddenRate: 100 } },
      { name: ' good ', overrides: {} }
    ]
  });
  const tierResult = run('INTERIOR_PAINTING', interiorInputs(), badTier);
  assert.equal(tierResult.ownerDiagnostics.some(item => item.type === 'unsupported' && item.path === 'tiers.0.overrides.hiddenRate'), true);
  assert.equal(tierResult.ownerDiagnostics.some(item => item.type === 'cross_field' && item.path === 'tiers.1.name'), true);
  assert.equal(tierResult.failedTierDiagnostics.some(item => item.tierName === 'Good' && item.unsupportedOwnerFields.includes('tiers.0.overrides.hiddenRate')), true);
});

function tieredInterior(tiers) {
  return interiorService({}, { tiers });
}

test('repair 22: every failed tier retains separate field diagnostics', () => {
  const allFailed = run('INTERIOR_PAINTING', interiorInputs(), tieredInterior([
    { name: 'Good', overrides: { laborPerWallSqftPerCoat: -1 } },
    { name: 'Better', overrides: { materialPerWallSqftPerCoat: -1 } },
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
    { name: 'Better', overrides: { materialPerWallSqftPerCoat: -1 } },
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
    { name: 'Better', overrides: { materialPerWallSqftPerCoat: -1 } }
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
    run('INTERIOR_PAINTING', interiorInputs(), interiorService({ laborPerWallSqftPerCoat: -1 }), { callerType: 'customer' }),
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
  ownerPricing.feeRules.overhead = 'always';
  const result = run('INTERIOR_PAINTING', interiorInputs({ ceilingsIncluded: true, ceilingAreaSqft: 100, trimIncluded: true, trimLengthLF: 10 }), ownerPricing, {
    callerType: 'customer',
    businessDefaults: { ...defaults, overheadFixed: 1000000 }
  });
  assert.equal(result.priceDrivers.includes('10 measured linear feet of trim materials'), true, JSON.stringify(result.priceDrivers));
  assert.equal(result.priceDrivers[0], '10 measured linear feet of trim materials');
  for (const forbidden of ['rate', 'cost', 'markup', 'overhead', 'margin']) {
    assert.equal(JSON.stringify(result).toLowerCase().includes(forbidden), false, forbidden);
  }

  const roof = roofService({
    accessoryPricingMode: 'itemized',
    starterPerLF: 100,
    dripEdgePerLF: 100,
    ridgeCapPerLF: 100,
    deckingPerSheet: 1000000
  }, { feeRules: { ...feeRules, overhead: 'always' } });
  const roofResult = run('ROOFING_REPLACEMENT', roofInputs({
    starterLengthLF: 0,
    dripEdgeLengthLF: 0,
    ridgeCapLengthLF: 0,
    deckingSheets: 1
  }), roof, {
    callerType: 'customer',
    businessDefaults: { ...defaults, overheadFixed: 2000000 }
  });
  assert.equal(roofResult.priceDrivers.length > 4, true, JSON.stringify(roofResult.priceDrivers));
  assert.equal(roofResult.priceDrivers.includes('1 existing layer'), true);
  assert.equal(roofResult.priceDrivers.join(' ').toLowerCase().includes('overhead'), false);
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

  const rangedLine = rangedEvidenceLine({ lowRateCents: 8000, highRateCents: 12000 });
  assert.equal(rangedLine.calculation.evidenceVariant, 'ranged');
  assert.equal(rangedLine.rangeAmountCents.low, 8000);
  assert.equal(rangedLine.rangeAmountCents.high, 12000);
  assertLineReproducible(rangedLine);

  const minimum = run('INTERIOR_PAINTING', interiorInputs(), interiorService({ minimumJob: 20000 }));
  const feeAndSeasonalOwner = interiorService({}, {
    feeRules: { ...feeRules, travel: 'always' },
    peakMonths: [1],
    peakSurchargePercent: 10
  });
  const feeAndSeasonal = run('INTERIOR_PAINTING', interiorInputs(), feeAndSeasonalOwner, {
    businessDefaults: { ...defaults, travelFee: 5000 }
  });
  for (const result of [quantity, fixed, percentage, composite, minimum, feeAndSeasonal]) {
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
  assert.equal(result.rangeBufferUsed, 17);
  assert.equal(result.options[0].rangeBufferUsed, 17);
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
  assert.equal(unknown.rangeBufferUsed, undefined);
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

test('repair 29: the real price-book preview can calculate an unconfirmed AI draft without confirming it', () => {
  const aiDraft = interiorService({}, {
    source: 'AI_SUGGESTED',
    confirmedFields: {}
  });
  const before = structuredClone(aiDraft.confirmedFields);
  const pricebook = { defaults, services: [aiDraft] };

  const status = vNextServiceStatus(aiDraft, defaults);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.equal(status.missingOwnerFields.includes('confirmedFields.laborPerWallSqftPerCoat'), true);

  const preview = previewFromVNextPricebook({
    pricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    currentMonth: 1
  });
  assert.equal(preview.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(preview));
  assert.equal(preview.unconfirmedOwnerFields.includes('laborPerWallSqftPerCoat'), true);
  assert.equal(preview.unconfirmedOwnerFields.includes('materialPerWallSqftPerCoat'), true);
  assert.equal(preview.appliedRules.some(rule => rule.includes('unconfirmed AI draft fields')), true);
  assert.deepEqual(aiDraft.confirmedFields, before);

  const ownerLivePath = quoteFromVNextPricebook({
    pricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(ownerLivePath.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(ownerLivePath.unconfirmedOwnerFields.includes('laborPerWallSqftPerCoat'), true);

  const customer = quoteFromVNextPricebook({
    pricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'customer',
    currentMonth: 1
  });
  assert.deepEqual(Object.keys(customer).sort(), ['customerMessage', 'quoteId', 'resultType']);
  assert.deepEqual(aiDraft.confirmedFields, before);
});

test('repair 30: configured zero money is intentionally free across disposal and selected scope', () => {
  const assertFree = (result, lineName) => {
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', lineName + ': ' + JSON.stringify(result));
    assert.equal(lineAmount(result, lineName), 0, lineName);
    assert.equal(line(result, lineName).noCharge, true, lineName);
  };
  const disposalDefaults = { ...defaults, disposalFee: 5000 };

  const roofOwner = roofService(
    { disposalPerSquare: 0 },
    { feeRules: { ...feeRules, disposal: 'when_scope_selected' } }
  );
  const roof = run('ROOFING_REPLACEMENT', roofInputs(), roofOwner, { businessDefaults: disposalDefaults });
  assertFree(roof, 'Roofing disposal');
  assert.equal(line(roof, 'Disposal'), undefined);

  const flatOwner = service('FLAT_ROOF_REPLACEMENT', {
    laborPerSqft: { epdm: 500, average: 500 },
    membraneCostPerSqft: { epdm: 700, average: 700 },
    tearOffPerSqft: { epdm: 200, average: 200 },
    minimumJob: 0,
    disposalPerSqft: 0
  }, { feeRules: { ...feeRules, disposal: 'when_scope_selected' } });
  const flat = run('FLAT_ROOF_REPLACEMENT', {
    roofSqft: 1000,
    sqftMethod: 'exact',
    membraneType: 'epdm',
    existingLayers: 1,
    accessDifficulty: 'easy',
    serviceScope: 'full',
    buildingType: 'residential'
  }, flatOwner, { businessDefaults: disposalDefaults });
  assertFree(flat, 'Flat-roof disposal');
  assert.equal(line(flat, 'Disposal'), undefined);

  const flooringOwner = flooringService({
    removalPerSqft: { carpet: 0 },
    disposalPerSqft: 0
  }, { feeRules: { ...feeRules, disposal: 'when_scope_selected' } });
  const flooring = run('FLOORING_INSTALL', flooringInputs({
    existingFloorType: 'carpet',
    removalNeeded: true
  }), flooringOwner, { businessDefaults: disposalDefaults });
  assertFree(flooring, 'Existing flooring removal');
  assertFree(flooring, 'Flooring disposal');
  assert.equal(line(flooring, 'Disposal'), undefined);

  const concreteOwner = concreteService({
    demolitionPerSqft: 0,
    disposalPerSqft: 0
  });
  concreteOwner.feeRules.disposal = 'when_scope_selected';
  const concrete = run('CONCRETE_DRIVEWAY', concreteInputs({
    demolitionNeeded: true,
    demolitionAreaSqft: 200
  }), concreteOwner, { businessDefaults: disposalDefaults });
  assertFree(concrete, 'Concrete demolition');
  assertFree(concrete, 'Concrete disposal');
  assert.equal(line(concrete, 'Disposal'), undefined);

  const sidingOwner = service('SIDING_REPLACEMENT', {
    laborPerSqft: { vinyl: 400 },
    materialPerSqft: { vinyl: 700 },
    minimumJob: 0,
    removalPerSqft: 0,
    disposalPerSqft: 0
  }, { feeRules: { ...feeRules, disposal: 'when_scope_selected' } });
  const siding = run('SIDING_REPLACEMENT', {
    areaInputMethod: 'sqft',
    sidingAreaSqft: 1000,
    sidingType: 'vinyl',
    stories: 1,
    oldSidingRemoval: true,
    trimIncluded: false
  }, sidingOwner, { businessDefaults: disposalDefaults });
  assertFree(siding, 'Old siding removal');
  assertFree(siding, 'Siding disposal');

  const cleanup = run('LANDSCAPING_CLEANUP', {
    yardSqft: 1000,
    sqftMethod: 'exact',
    debrisLevel: 'light',
    slope: 'flat',
    haulAway: true
  }, service('LANDSCAPING_CLEANUP', {
    cleanupBaseRatePerSqft: 10,
    debrisPricing: {
      light: { laborMultiplier: 1, disposalFlat: 0 },
      moderate: { laborMultiplier: 1.5, disposalFlat: 0 },
      heavy: { laborMultiplier: 2, disposalFlat: 0 }
    },
    minimumServiceCharge: 0,
    haulAwayFee: 0
  }));
  assertFree(cleanup, 'Debris disposal');
  assertFree(cleanup, 'Additional haul-away');

  const mulch = run('LANDSCAPING_MULCH', {
    inputMethod: 'yards',
    mulchArea: 2,
    mulchType: 'brown',
    bedCondition: 'clean',
    edgingNeeded: true,
    edgeLF: 50
  }, service('LANDSCAPING_MULCH', {
    mulchMaterialPerYard: { brown: 5000 },
    mulchInstallLaborPerYard: 3000,
    minimumServiceCharge: 0,
    edgingPerLinearFoot: 0
  }));
  assertFree(mulch, 'Bed edging');

  const itemized = run('ROOFING_REPLACEMENT', roofInputs({
    starterLengthLF: 100,
    dripEdgeLengthLF: 100,
    ridgeCapLengthLF: 20
  }), roofService({
    accessoryPricingMode: 'itemized',
    starterPerLF: 0,
    dripEdgePerLF: 0,
    ridgeCapPerLF: 0
  }));
  for (const lineName of ['Starter strip', 'Drip edge', 'Ridge cap']) assertFree(itemized, lineName);

  const fencePricing = service('FENCING_REPLACEMENT', {
    laborPerLinearFoot: { wood: 1000 },
    materialPerLinearFoot: { wood: 2000 },
    postPrice: { wood: 0 },
    concretePerPost: 0,
    postsIncludedInMaterial: { wood: false },
    gatePrice: { wood: 0 },
    minimumJob: 0,
    removalPerLinearFoot: { wood: 0 },
    disposalPerLF: 0
  });
  const fenceValidation = validateOwnerPricing(
    'FENCING_REPLACEMENT',
    { ...fenceInputs(), oldFenceRemoval: true },
    fencePricing.pricing
  );
  for (const path of ['postPrice.wood', 'concretePerPost', 'removalPerLinearFoot.wood', 'disposalPerLF']) {
    assert.equal(fenceValidation.invalidOwnerFields.includes(path), false, path);
  }
  assert.equal(fenceValidation.ownerDecisionRequired.some(item => item.kind === 'post_geometry_contract'), true);
  assert.equal(fenceValidation.ownerDecisionRequired.some(item => item.kind === 'mixed_charge_allocation'), true);
});

test('repair 31: flooring underlayment requirements are product-specific and vinyl-only controls do not block tile', () => {
  const tileOwner = service('FLOORING_INSTALL', {
    laborPerSqft: { tile: 300 },
    materialPerSqft: { tile: 500 },
    minimumJob: 0
  });
  const tileInputs = flooringInputs({ newFlooringType: 'tile' });
  const tile = run('FLOORING_INSTALL', tileInputs, tileOwner);
  assert.equal(tile.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(tile));
  assert.equal(line(tile, 'Underlayment'), undefined);

  for (const flooringType of ['hardwood', 'laminate', 'carpet']) {
    const ownerPricing = service('FLOORING_INSTALL', {
      laborPerSqft: { [flooringType]: 300 },
      materialPerSqft: { [flooringType]: 500 },
      minimumJob: 0
    });
    const result = run('FLOORING_INSTALL', flooringInputs({ newFlooringType: flooringType }), ownerPricing);
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW', flooringType);
    assert.equal(result.ownerDecisionRequired.some(item => item.kind === 'product_specific_underlayment_contract' && item.path.endsWith(flooringType)), true, flooringType);
  }

  const vinylWithoutRule = service('FLOORING_INSTALL', {
    laborPerSqft: { vinyl_plank: 300 },
    materialPerSqft: { vinyl_plank: 500 },
    minimumJob: 0
  });
  const vinyl = run('FLOORING_INSTALL', flooringInputs(), vinylWithoutRule);
  assert.equal(vinyl.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(vinyl.missingOwnerFields.includes('vinylPlankUnderlaymentRule'), true);
});

test('repair 32: unresolved cost purchase contracts and exact flooring thresholds fail closed', () => {
  const roofCost = run('ROOFING_REPLACEMENT', roofInputs(), roofService({
    underlaymentPriceBasis: { asphalt_shingle: 'cost' }
  }));
  assert.equal(roofCost.ownerDecisionRequired.some(item => item.kind === 'purchasable_underlayment_contract'), true);

  const floorCost = run('FLOORING_INSTALL', flooringInputs(), flooringService({
    underlaymentPriceBasis: 'cost'
  }));
  assert.equal(floorCost.ownerDecisionRequired.some(item => item.kind === 'purchasable_underlayment_contract'), true);

  const paintCost = run('INTERIOR_PAINTING', interiorInputs(), interiorService({}, {
    priceBasisByCategory: structuredClone(costBasis)
  }));
  assert.equal(paintCost.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(paintCost.ownerDecisionRequired.some(item => item.kind === 'purchasable_paint_contract'), true);

  const thresholdOwner = flooringService({ vinylPlankUnderlaymentRule: 'never_included' });
  for (const exactAverage of [149, 299]) {
    const result = run('FLOORING_INSTALL', flooringInputs({ sqft: exactAverage, roomCount: 1 }), thresholdOwner);
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW', String(exactAverage));
    assert.equal(result.ownerDecisionRequired.some(item => item.kind === 'inclusive_boundary_contract'), true);
  }
  for (const nonBoundary of [148, 150, 298, 300]) {
    assert.equal(run('FLOORING_INSTALL', flooringInputs({ sqft: nonBoundary, roomCount: 1 }), thresholdOwner).resultType, 'INSTANT_ESTIMATE_READY', String(nonBoundary));
  }
});

test('repair 33: conditional customer fields are rejected whenever their selected scope cannot consume them', () => {
  const checks = [];
  checks.push([
    'roof partial area on full replacement',
    validateCustomerInputs('ROOFING_REPLACEMENT', roofInputs({ partialAreaSqft: 100 }), roofService().pricing),
    ['partialAreaSqft']
  ]);
  checks.push([
    'all-in roof accessory measurements',
    validateCustomerInputs('ROOFING_REPLACEMENT', roofInputs({
      starterLengthLF: 0,
      dripEdgeLengthLF: 0,
      ridgeCapLengthLF: 0
    }), roofService().pricing),
    ['starterLengthLF', 'dripEdgeLengthLF', 'ridgeCapLengthLF']
  ]);
  checks.push([
    'flat-roof partial area on full replacement',
    validateCustomerInputs('FLAT_ROOF_REPLACEMENT', {
      roofSqft: 1000,
      sqftMethod: 'exact',
      membraneType: 'epdm',
      existingLayers: 1,
      accessDifficulty: 'easy',
      serviceScope: 'full',
      buildingType: 'residential',
      partialAreaSqft: 100
    }, {}),
    ['partialAreaSqft']
  ]);
  checks.push([
    'interior ceiling and trim measurements without selected scope',
    validateCustomerInputs('INTERIOR_PAINTING', interiorInputs({
      ceilingsIncluded: false,
      ceilingAreaSqft: 100,
      trimIncluded: false,
      trimLengthLF: 50
    }), interiorService().pricing),
    ['ceilingAreaSqft', 'trimLengthLF']
  ]);

  const flooringReplacement = service('FLOORING_REPLACEMENT', {
    laborPerSqft: { vinyl_plank: 300 },
    materialPerSqft: { vinyl_plank: 500 },
    minimumJob: 0,
    vinylPlankUnderlaymentRule: 'never_included'
  });
  checks.push([
    'subfloor area without reported issues',
    validateCustomerInputs('FLOORING_REPLACEMENT', {
      ...flooringInputs(),
      subfloorIssues: false,
      subfloorRepairAreaSqft: 25
    }, flooringReplacement.pricing),
    ['subfloorRepairAreaSqft']
  ]);
  checks.push([
    'demolition area without demolition',
    validateCustomerInputs('CONCRETE_DRIVEWAY', concreteInputs({
      demolitionNeeded: false,
      demolitionAreaSqft: 50
    }), concreteService().pricing),
    ['demolitionAreaSqft']
  ]);
  checks.push([
    'mulch depth on direct-yards input',
    validateCustomerInputs('LANDSCAPING_MULCH', {
      inputMethod: 'yards',
      mulchArea: 3,
      mulchDepth: 3,
      mulchType: 'brown',
      bedCondition: 'clean',
      edgingNeeded: false
    }, {}),
    ['mulchDepth']
  ]);
  checks.push([
    'clean mulch bed preparation and unselected edging',
    validateCustomerInputs('LANDSCAPING_MULCH', {
      inputMethod: 'yards',
      mulchArea: 3,
      mulchType: 'brown',
      bedCondition: 'clean',
      bedSqft: 100,
      edgingNeeded: false,
      edgeLF: 20
    }, {}),
    ['bedSqft', 'edgeLF']
  ]);
  checks.push([
    'clean planting bed and unselected mulch',
    validateCustomerInputs('LANDSCAPING_PLANTING', {
      plantsBySize: { small: 1, medium: 0, large: 0 },
      bedCondition: 'clean',
      bedSqft: 100,
      mulchNeeded: false,
      mulchYards: 2,
      mulchType: 'brown'
    }, {}),
    ['bedSqft', 'mulchYards', 'mulchType']
  ]);
  checks.push([
    'mowing edge length without edging',
    validateCustomerInputs('LANDSCAPING_MOWING', {
      yardSqft: 5000,
      sqftMethod: 'exact',
      serviceFrequency: 'weekly',
      grassCondition: 'maintained',
      bagClippings: false,
      edgingIncluded: false,
      edgingLengthLF: 100
    }, {}),
    ['edgingLengthLF']
  ]);
  checks.push([
    'siding trim length without trim',
    validateCustomerInputs('SIDING_REPLACEMENT', {
      areaInputMethod: 'sqft',
      sidingAreaSqft: 1000,
      sidingType: 'vinyl',
      stories: 1,
      oldSidingRemoval: false,
      trimIncluded: false,
      trimLengthLF: 50
    }, {}),
    ['trimLengthLF']
  ]);
  checks.push([
    'custom area on an hourly service',
    validateCustomerInputs('CUSTOM', {
      service: 'Measured service',
      serviceConfirmed: true,
      unit: 'per_hour',
      hours: 2,
      areaSqft: 500
    }, { unit: 'per_hour', customPricingMode: 'fixed' }),
    ['areaSqft']
  ]);

  for (const [name, validation, expectedFields] of checks) {
    assert.equal(validation.ok, false, name);
    for (const field of expectedFields) assert.equal(validation.invalidCustomerFields.includes(field), true, name + ': ' + field);
  }

  const realPath = run('FLOORING_REPLACEMENT', {
    ...flooringInputs(),
    subfloorIssues: false,
    subfloorRepairAreaSqft: 25
  }, flooringReplacement);
  assert.equal(realPath.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(realPath.invalidCustomerFields.includes('subfloorRepairAreaSqft'), true);
});

test('repair 34: missing and duplicate service previews report the lookup defect instead of inactive status', () => {
  const missing = previewFromVNextPricebook({
    pricebook: { defaults, services: [] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    currentMonth: 1
  });
  assert.equal(missing.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.match(missing.reviewReason, /No matching service is configured/);
  assert.equal(missing.reviewReason.includes('not active'), false);
  assert.equal(missing.ownerDiagnostics.some(item => item.kind === 'missing_service' && item.path === 'services'), true);

  const configured = interiorService();
  const duplicatePricebook = { defaults, services: [configured, structuredClone(configured)] };
  const duplicate = previewFromVNextPricebook({
    pricebook: duplicatePricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    currentMonth: 1
  });
  assert.equal(duplicate.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.match(duplicate.reviewReason, /Multiple matching service definitions/);
  assert.equal(duplicate.reviewReason.includes('not active'), false);
  assert.equal(duplicate.ownerDiagnostics.some(item => item.kind === 'duplicate_service' && item.path === 'services'), true);

  const customer = quoteFromVNextPricebook({
    pricebook: duplicatePricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'customer',
    currentMonth: 1
  });
  assert.deepEqual(Object.keys(customer).sort(), ['customerMessage', 'quoteId', 'resultType']);
});

test('repair 35: decking distinguishes missing scope from confirmed zero and always preserves the approved unit-price driver', () => {
  const ownerPricing = roofService({ deckingPerSheet: 12345 });
  const approvedDriver = 'Decking replacement, if needed, billed at $123.45/sheet';

  const missingScope = run('ROOFING_REPLACEMENT', roofInputs(), ownerPricing);
  assert.equal(missingScope.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(missingScope.priceDrivers.includes(approvedDriver), true);
  assert.equal(missingScope.calculationRecord.options[0].measurements.some(item => item.name === 'deckingSheets'), false);
  assert.equal(JSON.stringify(missingScope).includes('no replacement sheet count was confirmed'), false);

  const confirmedZero = run('ROOFING_REPLACEMENT', roofInputs({ deckingSheets: 0 }), ownerPricing);
  assert.equal(confirmedZero.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(line(confirmedZero, 'Decking replacement'), undefined);
  assert.equal(confirmedZero.priceDrivers.includes(approvedDriver), true);
  const zeroMeasurement = confirmedZero.calculationRecord.options[0].measurements.find(item => item.name === 'deckingSheets');
  assert.deepEqual([zeroMeasurement.value, zeroMeasurement.unit], [0, 'confirmed sheets']);
  assert.equal(JSON.stringify(confirmedZero).includes('no replacement sheet count was confirmed'), false);

  const selected = run('ROOFING_REPLACEMENT', roofInputs({ deckingSheets: 2 }), ownerPricing);
  assert.equal(lineAmount(selected, 'Decking replacement'), 24690);
  assert.equal(selected.priceDrivers.includes(approvedDriver), true);

  const customer = run('ROOFING_REPLACEMENT', roofInputs({ deckingSheets: 0 }), ownerPricing, { callerType: 'customer' });
  assert.equal(customer.priceDrivers.includes(approvedDriver), true);
  assert.equal(JSON.stringify(customer).includes('lineItems'), false);
});

test('repair 36: internal review retains lead evidence and customer sanitization removes it', () => {
  const fixture = repairFixture('ROOFING_REPAIR');
  const ownerPricing = structuredClone(fixture.ownerPricing);
  delete ownerPricing.pricing.repairHours.asphalt_shingle.patch.medium;
  const customerInputs = { ...fixture.inputs, affectedArea: 75, leakPresent: true };
  const result = quoteFromVNextPricebook({
    pricebook: { defaults, services: [ownerPricing] },
    serviceType: 'ROOFING_REPAIR',
    customerInputs,
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(result.serviceType, 'ROOFING_REPAIR');
  assert.deepEqual(result.submittedCustomerInputs, customerInputs);
  assert.equal(result.normalizedScope.affectedArea, 75);
  assert.equal(result.validatedMeasurements.some(item => item.name === 'affectedArea' && item.value === 75), true);
  assert.deepEqual(result.urgencyFlags, ['Active leak reported']);
  assert.equal(result.missingOwnerFields.includes('repairHours.asphalt_shingle.patch.medium'), true);

  const originalRequest = {
    serviceType: 'ROOFING_REPAIR',
    customerInputs,
    source: 'voice'
  };
  const lead = buildInternalLeadVNext({ request: originalRequest, internalResult: result });
  assert.equal(lead.quoteId, result.quoteId);
  assert.equal(lead.serviceType, 'ROOFING_REPAIR');
  assert.deepEqual(lead.originalRequest, originalRequest);
  assert.deepEqual(lead.submittedCustomerInputs, customerInputs);
  assert.deepEqual(lead.internalReviewResult, result);
  assert.deepEqual(lead.urgencyFlags, ['Active leak reported']);
  originalRequest.customerInputs.affectedArea = 999;
  assert.equal(lead.originalRequest.customerInputs.affectedArea, 75);

  const customer = sanitizeForCustomerVNext(result);
  assert.deepEqual(Object.keys(customer).sort(), ['customerMessage', 'quoteId', 'resultType']);
  assert.throws(
    () => buildInternalLeadVNext({ request: originalRequest, internalResult: customer }),
    /unsanitized internal review result/
  );
  for (const hidden of ['serviceType', 'submittedCustomerInputs', 'normalizedScope', 'validatedMeasurements', 'urgencyFlags']) {
    assert.equal(JSON.stringify(customer).includes(hidden), false, hidden);
  }
});

test('repair 37: metadata and customer results describe only behavior the candidate actually implements', () => {
  const metadata = getVNextPriceBookMetadata();
  const exterior = metadata.find(item => item.serviceType === 'EXTERIOR_PAINTING');
  const exteriorLabor = exterior.pricingFields.find(item => item.field === 'exteriorLaborPerSqftPerCoat');
  assert.equal(/owner-configured primer coats/i.test(exteriorLabor.help), false);
  assert.match(exteriorLabor.help, /Poor surfaces remain review-only/);

  for (const serviceMetadata of metadata) {
    for (const factor of serviceMetadata.class2Fields) {
      assert.equal(/physical quantity assumption/i.test(factor.help), false, serviceMetadata.serviceType + '.' + factor.name);
      assert.match(factor.help, /Owner-editable/);
    }
  }
  const roofing = metadata.find(item => item.serviceType === 'ROOFING_REPLACEMENT');
  const decking = roofing.pricingFields.find(item => item.field === 'deckingPerSheet');
  assert.match(decking.help, /configured per-sheet price is disclosed/);

  const sidingOwner = service('SIDING_REPLACEMENT', {
    laborPerSqft: { vinyl: 400 },
    materialPerSqft: { vinyl: 700 },
    minimumJob: 0,
    trimPerLinearFoot: 100
  });
  const siding = run('SIDING_REPLACEMENT', {
    areaInputMethod: 'sqft',
    sidingAreaSqft: 1000,
    sidingType: 'vinyl',
    stories: 1,
    oldSidingRemoval: false,
    trimIncluded: true,
    trimLengthLF: 100
  }, sidingOwner);
  assert.equal(siding.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(siding.ownerDecisionRequired.some(item => item.kind === 'mixed_charge_classification'), true);
  assert.equal(siding.lineItems, undefined);

  const freeStairCustomer = run('FLOORING_INSTALL', flooringInputs({ stairSteps: 1 }), flooringService({ perStepPrice: 0 }), { callerType: 'customer' });
  assert.equal(freeStairCustomer.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(freeStairCustomer.priceDrivers.some(driver => /stair/i.test(driver)), false);

  const rangedCustomer = run('INTERIOR_PAINTING', interiorInputs(), interiorService(), {
    callerType: 'customer',
    businessDefaults: { ...defaults, rangeBufferPercent: 17 }
  });
  assert.equal(rangedCustomer.rangeBufferUsed, 17);
  assert.equal(Object.hasOwn(rangedCustomer, 'effectiveRangeBufferPercent'), false);
  assert.equal(rangedCustomer.options[0].rangeBufferUsed, 17);
});
test('repair 38: intrinsic range scenarios rewrite amount and evidence together, including an intentional free low bound', () => {
  const template = { lineItems: [rangedEvidenceLine({ quantity: 2, lowRateCents: 0, highRateCents: 12000 })] };

  const expected = {
    low: { rateCents: 0, amountCents: 0, noCharge: true },
    mid: { rateCents: 6000, amountCents: 12000, noCharge: false },
    high: { rateCents: 12000, amountCents: 24000, noCharge: false }
  };
  for (const variant of ['low', 'mid', 'high']) {
    const materialized = materializeScenarioLinesVNext(template.lineItems, variant);
    const item = materialized[0];
    assert.equal(item.amountCents, expected[variant].amountCents, variant);
    assert.equal(item.calculation.selectedVariant, variant, variant);
    assert.equal(item.calculation.rateCents, expected[variant].rateCents, variant);
    assert.equal(item.calculation.unroundedCents, expected[variant].amountCents, variant);
    assert.equal(item.calculation.roundedAmountCents, expected[variant].amountCents, variant);
    assert.equal(item.noCharge === true, expected[variant].noCharge, variant);
    assertLineReproducible(item);
  }
});

test('repair 39: inspection-first reviews retain submitted scope and validated measurements through the real price-book path', () => {
  const ownerPricing = service('EXTERIOR_PAINTING', {
    exteriorLaborPerSqftPerCoat: 100,
    materialPerSqftPerCoat: 50,
    minimumJob: 0,
    laborHourlyRate: 10000
  });
  const customerInputs = {
    areaInputMethod: 'wall_sqft',
    exteriorAreaSqft: 1200,
    stories: 2,
    surfaceCondition: 'poor',
    coats: 2
  };
  const pricebook = { defaults, services: [ownerPricing] };
  const internal = quoteFromVNextPricebook({
    pricebook,
    serviceType: 'EXTERIOR_PAINTING',
    customerInputs,
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(internal.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(internal.inspectionFirst, true);
  assert.deepEqual(internal.submittedCustomerInputs, customerInputs);
  assert.deepEqual(internal.normalizedScope, customerInputs);
  assert.equal(internal.validatedMeasurements.some(item => item.name === 'exteriorAreaSqft' && item.value === 1200), true);
  assert.equal(internal.ownerDecisionRequired.some(item => item.kind === 'primer_pricing_contract'), true);

  const lead = buildInternalLeadVNext({
    request: { serviceType: 'EXTERIOR_PAINTING', customerInputs, source: 'owner_preview' },
    internalResult: internal
  });
  assert.deepEqual(lead.internalReviewResult.normalizedScope, customerInputs);
  assert.equal(lead.internalReviewResult.validatedMeasurements.some(item => item.name === 'exteriorAreaSqft'), true);

  const customer = quoteFromVNextPricebook({
    pricebook,
    serviceType: 'EXTERIOR_PAINTING',
    customerInputs,
    callerType: 'customer',
    currentMonth: 1
  });
  assert.deepEqual(Object.keys(customer).sort(), ['customerMessage', 'quoteId', 'resultType']);
});

test('repair 40: invalid provenance and disclaimer values fail every status, preview, and live path closed', () => {
  const invalidSource = interiorService({}, {
    source: 'AI_SUGESTED',
    confirmedFields: {
      laborPerWallSqftPerCoat: true,
      materialPerWallSqftPerCoat: true,
      minimumJob: true,
      ceilingLaborPerSqftPerCoat: true,
      ceilingMaterialPerSqftPerCoat: true,
      trimLaborPerLF: true,
      trimMaterialPerLF: true
    }
  });
  const sourceStatus = vNextServiceStatus(invalidSource, defaults);
  assert.equal(sourceStatus.status, 'NEEDS PRICING');
  assert.equal(sourceStatus.invalidOwnerFields.includes('source'), true);
  assert.equal(sourceStatus.ownerDiagnostics.some(item => item.type === 'invalid' && item.path === 'source'), true);

  const sourcePricebook = { defaults, services: [invalidSource] };
  const preview = previewFromVNextPricebook({
    pricebook: sourcePricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    currentMonth: 1
  });
  assert.equal(preview.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(preview.invalidOwnerFields.includes('source'), true);
  const customer = quoteFromVNextPricebook({
    pricebook: sourcePricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'customer',
    currentMonth: 1
  });
  assert.deepEqual(Object.keys(customer).sort(), ['customerMessage', 'quoteId', 'resultType']);

  const invalidDisclaimer = interiorService({}, { disclaimer: '   ' });
  const disclaimerStatus = vNextServiceStatus(invalidDisclaimer, defaults);
  assert.equal(disclaimerStatus.status, 'NEEDS PRICING');
  assert.equal(disclaimerStatus.invalidOwnerFields.includes('disclaimer'), true);
});

test('repair 41: only an explicit owner caller can receive internal quote or review data', () => {
  const ownerPricing = interiorService();
  const direct = run('INTERIOR_PAINTING', interiorInputs(), ownerPricing, { callerType: 'internal_tool' });
  assert.deepEqual(Object.keys(direct).sort(), ['customerMessage', 'quoteId', 'resultType']);

  const pricebook = { defaults, services: [ownerPricing] };
  const lookup = quoteFromVNextPricebook({
    pricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'staff',
    currentMonth: 1
  });
  assert.deepEqual(Object.keys(lookup).sort(), ['customerMessage', 'quoteId', 'resultType']);

  const missing = quoteFromVNextPricebook({
    pricebook: { defaults, services: [] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'automation',
    currentMonth: 1
  });
  assert.deepEqual(Object.keys(missing).sort(), ['customerMessage', 'quoteId', 'resultType']);

  const explicitOwner = run('INTERIOR_PAINTING', interiorInputs(), ownerPricing, { callerType: 'owner' });
  assert.equal(explicitOwner.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(Array.isArray(explicitOwner.lineItems), true);
});

test('repair 42: every open shaped-map family rejects noncanonical keys at the exact dotted path', () => {
  const row = { small: 1, medium: 2, large: 3 };
  const cases = [
    ['ROOFING_REPLACEMENT', { laborPerSquare: { 'bad-key': 100 } }, 'laborPerSquare.bad-key'],
    ['ROOFING_REPLACEMENT', { materialCostPerSquare: { 'bad-key': 100 } }, 'materialCostPerSquare.bad-key'],
    ['ROOFING_REPLACEMENT', { tearOffPerSquare: { 'bad-key': 100 } }, 'tearOffPerSquare.bad-key'],
    ['ROOFING_REPLACEMENT', { underlaymentPerSquare: { 'bad-key': 100 } }, 'underlaymentPerSquare.bad-key'],
    ['ROOFING_REPLACEMENT', { underlaymentPriceBasis: { 'bad-key': 'installed_area_sell_price' } }, 'underlaymentPriceBasis.bad-key'],
    ['FLAT_ROOF_REPLACEMENT', { laborPerSqft: { 'bad-key': 100 } }, 'laborPerSqft.bad-key'],
    ['FLAT_ROOF_REPLACEMENT', { membraneCostPerSqft: { 'bad-key': 100 } }, 'membraneCostPerSqft.bad-key'],
    ['FLAT_ROOF_REPLACEMENT', { tearOffPerSqft: { 'bad-key': 100 } }, 'tearOffPerSqft.bad-key'],
    ['ROOFING_REPAIR', { repairHours: { 'bad-key': { patch: row } } }, 'repairHours.bad-key'],
    ['ROOFING_REPAIR', { repairHours: { asphalt_shingle: { 'bad-key': row } } }, 'repairHours.asphalt_shingle.bad-key'],
    ['FLAT_ROOF_REPAIR', { patchRepairHours: { epdm: { 'bad-key': row } } }, 'patchRepairHours.epdm.bad-key'],
    ['SIDING_REPAIR', { repairHours: { vinyl: { 'bad-key': row } } }, 'repairHours.vinyl.bad-key'],
    ['FLOORING_INSTALL', { removalPerSqft: { 'bad-key': 100 } }, 'removalPerSqft.bad-key'],
    ['FENCING_INSTALL', { laborPerLinearFoot: { 'bad-key': 100 } }, 'laborPerLinearFoot.bad-key'],
    ['FENCING_INSTALL', { materialPerLinearFoot: { 'bad-key': 100 } }, 'materialPerLinearFoot.bad-key'],
    ['FENCING_INSTALL', { postPrice: { 'bad-key': 100 } }, 'postPrice.bad-key'],
    ['FENCING_INSTALL', { gatePrice: { 'bad-key': 100 } }, 'gatePrice.bad-key'],
    ['FENCING_REPLACEMENT', { removalPerLinearFoot: { 'bad-key': 100 } }, 'removalPerLinearFoot.bad-key'],
    ['FENCING_INSTALL', { postsIncludedInMaterial: { 'bad-key': true } }, 'postsIncludedInMaterial.bad-key'],
    ['LANDSCAPING_MULCH', { mulchMaterialPerYard: { 'bad-key': 100 } }, 'mulchMaterialPerYard.bad-key'],
    ['LANDSCAPING_PLANTING', { mulchMaterialPerYard: { 'bad-key': 100 } }, 'mulchMaterialPerYard.bad-key']
  ];
  for (const [serviceType, pricing, path] of cases) {
    const diagnostics = validatePricingStructuresDetailed(serviceType, pricing);
    assert.equal(
      diagnostics.some(item => item.path === path && ['invalid', 'unsupported'].includes(item.type)),
      true,
      serviceType + ': ' + path + ': ' + JSON.stringify(diagnostics)
    );
  }

  const malformed = roofService();
  malformed.pricing.laborPerSquare = { 'asphalt-shingle': 5000 };
  const status = vNextServiceStatus(malformed, defaults);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.equal(status.invalidOwnerFields.includes('laborPerSquare.asphalt-shingle'), true);
  const quote = run('ROOFING_REPLACEMENT', roofInputs(), malformed);
  assert.equal(quote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(quote.invalidOwnerFields.includes('laborPerSquare.asphalt-shingle'), true);
});

test('repair 43: a concrete finish multiplier below one cannot save or disappear from the calculation', () => {
  const ownerPricing = concreteService();
  ownerPricing.pricing.finishMultiplier.broom = 0.9;
  const status = vNextServiceStatus(ownerPricing, defaults);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.equal(status.invalidOwnerFields.includes('finishMultiplier.broom'), true);

  const quote = run('CONCRETE_DRIVEWAY', concreteInputs({ finishType: 'broom' }), ownerPricing);
  assert.equal(quote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(quote.invalidOwnerFields.includes('finishMultiplier.broom'), true);
  assert.equal(quote.lineItems, undefined);
});

test('repair 44: money-driving derived quantities are hand-recomputed across every affected trade', () => {
  const getDerivation = (result, name) => {
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', name + ': ' + JSON.stringify(result));
    const found = result.calculationRecord.options[0].quantityDerivations.find(item => item.name === name);
    assert.ok(found, name);
    assert.equal(found.evidenceVariant, 'derived_quantity', name);
    return found;
  };
  const close = (actual, expected, name) => assert.ok(Math.abs(actual - expected) < 1e-10, name + ': ' + actual + ' !== ' + expected);

  const roof = run('ROOFING_REPLACEMENT', roofInputs({
    roofSizeInput: 1000,
    serviceScope: 'partial',
    partialPercent: 40,
    existingLayers: 2
  }), roofService());
  assert.equal(getDerivation(roof, 'selectedRoofAreaSqft').result, 400);
  assert.equal(getDerivation(roof, 'roofSquares').result, 4);
  assert.equal(getDerivation(roof, 'materialSquares').inputs.wasteFactor, 0.1);
  close(getDerivation(roof, 'materialSquares').result, 4.4, 'roof material squares');
  assert.equal(getDerivation(roof, 'tearOffSquares').result, 8);
  assert.equal(line(roof, 'Field materials').calculation.quantity, 4.4);
  assert.equal(line(roof, 'Tear-off').calculation.quantity, 8);

  const flatOwner = service('FLAT_ROOF_REPLACEMENT', {
    laborPerSqft: { epdm: 500, average: 550 },
    membraneCostPerSqft: { epdm: 700, average: 750 },
    tearOffPerSqft: { epdm: 200, average: 225 },
    minimumJob: 0
  });
  const flat = run('FLAT_ROOF_REPLACEMENT', {
    roofSqft: 2000,
    sqftMethod: 'exact',
    membraneType: 'epdm',
    existingLayers: 2,
    accessDifficulty: 'easy',
    serviceScope: 'partial',
    partialPercent: 25,
    buildingType: 'residential'
  }, flatOwner);
  assert.equal(getDerivation(flat, 'selectedFlatRoofAreaSqft').result, 500);
  assert.equal(getDerivation(flat, 'flatRoofTearOffAreaSqft').result, 1000);
  assert.equal(line(flat, 'Tear-off').calculation.quantity, 1000);

  const interior = run('INTERIOR_PAINTING', interiorInputs({
    wallAreaSqft: 100,
    coats: 2,
    ceilingsIncluded: true,
    ceilingAreaSqft: 50
  }), interiorService());
  assert.equal(getDerivation(interior, 'wallCoatSqft').result, 200);
  assert.equal(getDerivation(interior, 'ceilingCoatSqft').result, 100);

  const exteriorOwner = service('EXTERIOR_PAINTING', {
    exteriorLaborPerSqftPerCoat: 100,
    materialPerSqftPerCoat: 50,
    minimumJob: 0,
    laborHourlyRate: 10000
  });
  const exterior = run('EXTERIOR_PAINTING', {
    areaInputMethod: 'wall_sqft',
    exteriorAreaSqft: 1000,
    stories: 1,
    surfaceCondition: 'fair',
    coats: 2
  }, exteriorOwner);
  assert.equal(getDerivation(exterior, 'exteriorFinishCoatSqft').result, 2000);
  assert.equal(getDerivation(exterior, 'exteriorPreparationHours').result, 8);

  const flooring = run('FLOORING_INSTALL', flooringInputs({
    sqft: 400,
    roomCount: 2,
    layoutPattern: 'diagonal_or_pattern'
  }), flooringService());
  assert.equal(getDerivation(flooring, 'averageRoomSqft').result, 200);
  const flooringMaterial = getDerivation(flooring, 'flooringMaterialSqft');
  assert.deepEqual(flooringMaterial.inputs, {
    floorAreaSqft: 400,
    productWasteFactor: 0.08,
    patternWasteAdder: 0.07
  });
  close(flooringMaterial.result, 460, 'flooring material square feet');
  assert.equal(flooring.calculationRecord.options[0].ruleApplications.find(item => item.name === 'averageRoomComplexityBand').result, 'medium');

  const concrete = run('CONCRETE_DRIVEWAY', concreteInputs(), concreteService());
  assert.equal(getDerivation(concrete, 'concreteAreaSqft').result, 200);
  assert.equal(getDerivation(concrete, 'concretePerimeterLF').result, 60);
  const concreteVolume = getDerivation(concrete, 'concreteVolumeCubicYards');
  close(concreteVolume.result, 200 * (4 / 12) / 27 * 1.1, 'concrete cubic yards');
  close(line(concrete, 'Ready-mix concrete').calculation.quantity, concreteVolume.result, 'concrete line quantity');

  const mulch = run('LANDSCAPING_MULCH', {
    inputMethod: 'sqft',
    mulchArea: 1080,
    mulchDepth: 3,
    mulchType: 'brown',
    bedCondition: 'clean',
    edgingNeeded: false
  }, service('LANDSCAPING_MULCH', {
    mulchMaterialPerYard: { brown: 5000 },
    mulchInstallLaborPerYard: 3000,
    minimumServiceCharge: 0
  }));
  assert.equal(getDerivation(mulch, 'installedMulchYards').result, 10);
  close(getDerivation(mulch, 'mulchOrderYards').result, 11.5, 'mulch order yards');

  const sod = run('LANDSCAPING_SOD', {
    sodSqft: 1000,
    sqftMethod: 'exact',
    groundPrepNeeded: false,
    slope: 'flat',
    accessDifficulty: 'easy'
  }, service('LANDSCAPING_SOD', {
    sodMaterialPerSqft: 100,
    sodInstallLaborPerSqft: 100,
    minimumServiceCharge: 0
  }));
  assert.equal(getDerivation(sod, 'sodOrderSqft').result, 1050);
  assert.equal(line(sod, 'Sod material').calculation.quantity, 1050);

  const planting = run('LANDSCAPING_PLANTING', {
    plantsBySize: { small: 1, medium: 1, large: 0 },
    bedCondition: 'clean',
    mulchNeeded: true,
    mulchYards: 2,
    mulchType: 'brown'
  }, service('LANDSCAPING_PLANTING', {
    plantingLaborPerPlant: { small: 1000, medium: 2000, large: 3000 },
    plantMaterialAllowance: { small: 2000, medium: 4000, large: 6000 },
    minimumServiceCharge: 0,
    mulchMaterialPerYard: { brown: 5000 },
    mulchInstallLaborPerYard: 3000
  }));
  close(getDerivation(planting, 'plantingMulchOrderYards').result, 2.3, 'planting mulch order yards');

  const siding = run('SIDING_REPLACEMENT', {
    areaInputMethod: 'sqft',
    sidingAreaSqft: 1000,
    sidingType: 'vinyl',
    stories: 1,
    oldSidingRemoval: false,
    trimIncluded: false
  }, service('SIDING_REPLACEMENT', {
    laborPerSqft: { vinyl: 400 },
    materialPerSqft: { vinyl: 700 },
    minimumJob: 0
  }));
  const sidingMaterial = getDerivation(siding, 'sidingMaterialSqft');
  close(sidingMaterial.result, 1000 * (1 + sidingMaterial.inputs.sidingWasteFactor), 'siding material square feet');
  close(line(siding, 'Siding materials').calculation.quantity, sidingMaterial.result, 'siding line quantity');

  for (const serviceType of ['ROOFING_REPAIR', 'FLAT_ROOF_REPAIR', 'SIDING_REPAIR']) {
    const fixture = repairFixture(serviceType);
    const result = run(serviceType, { ...fixture.inputs, affectedArea: 75 }, fixture.ownerPricing);
    const rule = result.calculationRecord.options[0].ruleApplications.find(item => item.name === 'repairSizeFromAffectedArea');
    assert.ok(rule, serviceType);
    assert.equal(rule.result, serviceType === 'ROOFING_REPAIR' ? 'medium' : 'medium', serviceType);
    assert.equal(rule.inputs.affectedAreaSqft, 75, serviceType);
  }
});

test('repair 45: every scenario line records its effective basis, markup eligibility, and exact scenario cents', () => {
  const ownerPricing = roofService();
  const result = run('ROOFING_REPLACEMENT', roofInputs(), ownerPricing, {
    businessDefaults: { ...defaults, markupPercent: 10 }
  });
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY');

  const mid = scenario(result);
  assert.equal(Array.isArray(mid.lineItems), true);
  assert.equal(mid.finalTotalCents, mid.lineItems.reduce((sum, item) => sum + item.amountCents, 0));
  for (const item of mid.lineItems) assertLineReproducible(item);

  const treatments = mid.markup.lineTreatment;
  const fieldMaterial = treatments.find(item => item.name === 'Field materials');
  const underlayment = treatments.find(item => item.name === 'Underlayment');
  assert.deepEqual(
    [fieldMaterial.effectivePriceBasis, fieldMaterial.markupEligible],
    ['cost', true]
  );
  assert.deepEqual(
    [underlayment.effectivePriceBasis, underlayment.markupEligible],
    ['sell_price', false]
  );

  for (const treatment of treatments) {
    const scenarioLine = mid.lineItems.find(item => item.name === treatment.name);
    assert.ok(scenarioLine, treatment.name);
    assert.equal(scenarioLine.calculation.effectivePriceBasis, treatment.effectivePriceBasis, treatment.name);
    assert.equal(scenarioLine.calculation.markupEligible, treatment.markupEligible, treatment.name);
  }
});
test('repair 46: blocked scopes expose only executable Class 2 controls and the actual owner decision', () => {
  const metadata = getVNextPriceBookMetadata();
  const exterior = metadata.find(item => item.serviceType === 'EXTERIOR_PAINTING');
  const prep = exterior.class2Fields.find(item => item.name === 'prepHoursPerSqft');
  assert.deepEqual(Object.keys(prep.defaultValue), ['fair']);

  const concrete = metadata.find(item => item.serviceType === 'CONCRETE_DRIVEWAY');
  const finish = concrete.class2Fields.find(item => item.name === 'finishMultiplier');
  assert.deepEqual(Object.keys(finish.defaultValue).sort(), ['broom', 'smooth', 'stamped']);

  for (const serviceType of ['FENCING_INSTALL', 'FENCING_REPLACEMENT']) {
    const fencing = metadata.find(item => item.serviceType === serviceType);
    assert.deepEqual(fencing.class2Fields, [], serviceType);
  }

  const staleExterior = service('EXTERIOR_PAINTING', {
    exteriorLaborPerSqftPerCoat: 100,
    materialPerSqftPerCoat: 50,
    minimumJob: 0,
    laborHourlyRate: 10000,
    prepHoursPerSqft: { fair: 0.008, poor: 0.02 }
  });
  const exteriorStatus = vNextServiceStatus(staleExterior, defaults);
  assert.equal(exteriorStatus.status, 'NEEDS PRICING');
  assert.equal(exteriorStatus.unsupportedOwnerFields.includes('prepHoursPerSqft.poor'), true);

  const staleConcrete = concreteService({
    finishMultiplier: { broom: 1, smooth: 1.05, exposed_aggregate: 1.2, stamped: 1.5 }
  });
  const concreteStatus = vNextServiceStatus(staleConcrete, defaults);
  assert.equal(concreteStatus.status, 'NEEDS PRICING');
  assert.equal(concreteStatus.unsupportedOwnerFields.includes('finishMultiplier.exposed_aggregate'), true);

  const gatedFence = fenceService();
  delete gatedFence.pricing.gatePrice;
  const fenceReview = run('FENCING_INSTALL', fenceInputs({
    gateCount: 1,
    gateWidthTotalLF: 4
  }), gatedFence);
  assert.equal(fenceReview.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(fenceReview.missingOwnerFields.some(path => path.startsWith('gatePrice.')), false);
  assert.equal(fenceReview.ownerDecisionRequired.some(item => item.kind === 'gate_width_pricing_contract'), true);

  const trimReview = run('SIDING_REPLACEMENT', {
    areaInputMethod: 'sqft',
    sidingAreaSqft: 1000,
    sidingType: 'vinyl',
    stories: 1,
    oldSidingRemoval: false,
    trimIncluded: true,
    trimLengthLF: 100
  }, service('SIDING_REPLACEMENT', {
    laborPerSqft: { vinyl: 400 },
    materialPerSqft: { vinyl: 700 },
    minimumJob: 0
  }));
  assert.equal(trimReview.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(trimReview.missingOwnerFields.includes('trimPerLinearFoot'), false);
  assert.equal(trimReview.ownerDecisionRequired.some(item => item.kind === 'mixed_charge_classification'), true);
});
test('repair 47: intrinsic range multiplication and midpoint arithmetic stay within safe integer cents', () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  assert.throws(
    () => materializeScenarioLinesVNext([rangedEvidenceLine({ quantity: 1.1, lowRateCents: 0, highRateCents: maximum })], 'high'),
    error => {
      assert.equal(error.name, 'QuoteReviewError');
      assert.deepEqual(error.invalidOwnerFields, ['high']);
      return true;
    }
  );

  const nearLimit = rangedEvidenceLine({ lowRateCents: maximum - 10, highRateCents: maximum });
  const [item] = materializeScenarioLinesVNext([nearLimit], 'mid');
  assert.equal(item.calculation.rateCents, maximum - 5);
  assert.equal(item.calculation.unroundedCents, maximum - 5);
  assert.equal(item.rangeAmountCents.low, maximum - 10);
  assert.equal(item.rangeAmountCents.high, maximum);
  assertLineReproducible(item);
});
test('repairs 48 and 73: branch matrices execute every trade and consumed pricing paths fail closed', () => {
  const assertReadyCases = (serviceType, ownerPricing, cases, knownUnconsumed = []) => {
    const status = vNextServiceStatus(ownerPricing, defaults);
    assert.equal(status.status, 'QUOTING LIVE', serviceType + ': ' + JSON.stringify(status));
    const pricebook = { defaults, services: [ownerPricing] };
    const baselineSignatures = [];
    const consumedPricingSamples = new Map();
    const recordConsumedPricingPath = (path, customerInputs, calculationRecord) => {
      if (typeof path !== 'string' || path.startsWith('businessDefaults.')) return;
      if (!consumedPricingSamples.has(path)) {
        consumedPricingSamples.set(path, {
          customerInputs: structuredClone(customerInputs),
          baselineCalculationRecord: JSON.stringify(calculationRecord)
        });
      }
    };
    const quoteSignature = result => JSON.stringify({
      resultType: result.resultType,
      lowEstimate: result.lowEstimate,
      midEstimate: result.midEstimate,
      highEstimate: result.highEstimate,
      options: result.calculationRecord?.options || [],
      reviewReason: result.reviewReason,
      missingOwnerFields: result.missingOwnerFields || [],
      invalidOwnerFields: result.invalidOwnerFields || [],
      ownerDecisionRequired: result.ownerDecisionRequired || [],
      urgencyFlags: result.urgencyFlags || []
    });
    for (let index = 0; index < cases.length; index += 1) {
      const customerInputs = cases[index];
      const label = serviceType + ' case ' + index;
      const internal = quoteFromVNextPricebook({
        pricebook,
        serviceType,
        customerInputs,
        callerType: 'owner',
        currentMonth: 1
      });
      assert.equal(internal.resultType, 'INSTANT_ESTIMATE_READY', label + ': ' + JSON.stringify(internal));
      assert.equal(internal.options.length > 0, true, label);
      baselineSignatures.push(quoteSignature(internal));
      for (const optionRecord of internal.calculationRecord.options) {
        for (const scenarioRecord of Object.values(optionRecord.scenarios)) {
          assert.equal(Number.isSafeInteger(scenarioRecord.finalTotalCents), true, label);
          assert.equal(
            scenarioRecord.finalTotalCents,
            scenarioRecord.lineItems.reduce((sum, item) => sum + item.amountCents, 0),
            label
          );
          for (const item of scenarioRecord.lineItems) {
            assert.equal(Number.isSafeInteger(item.amountCents), true, label + ': ' + item.name);
            assertLineReproducible(item);
            const calculations = item.calculation.evidenceVariant === 'composite'
              ? item.calculation.components
              : [item.calculation];
            for (const calculation of calculations) {
              recordConsumedPricingPath(calculation.ratePath, customerInputs, internal.calculationRecord);
              for (const multiplier of calculation.multipliers || []) {
                recordConsumedPricingPath(multiplier.path, customerInputs, internal.calculationRecord);
              }
            }
          }
        }
        for (const item of optionRecord.quantityDerivations) {
          assert.equal(Number.isFinite(item.result), true, label + ': ' + item.name);
          assert.equal(item.result >= 0, true, label + ': ' + item.name);
        }
      }

      const customer = quoteFromVNextPricebook({
        pricebook,
        serviceType,
        customerInputs,
        callerType: 'customer',
        currentMonth: 1
      });
      assert.equal(customer.resultType, 'INSTANT_ESTIMATE_READY', label + ': ' + JSON.stringify(customer));
      assert.equal(Object.hasOwn(customer, 'lineItems'), false, label);
      assert.equal(Object.hasOwn(customer, 'calculationRecord'), false, label);
      for (const value of [customer.lowEstimate, customer.midEstimate, customer.highEstimate]) {
        assert.equal(Number.isFinite(value), true, label);
        assert.equal(value >= 0, true, label);
      }
    }
    const mutationSamples = new Map();
    for (let index = 0; index < cases.length; index += 1) {
      const customerInputs = cases[index];
      for (const field of Object.keys(customerInputs)) {
        if (!mutationSamples.has(field)) mutationSamples.set(field, { sample: customerInputs, index });
      }
    }
    for (const [field, { sample }] of mutationSamples) {
      const mutated = structuredClone(sample);
      const original = mutated[field];
      mutated[field] = typeof original === 'number'
        ? Number.NaN
        : typeof original === 'boolean'
          ? 'not_a_boolean'
          : typeof original === 'string'
            ? 'INVALID VALUE'
            : null;
      const review = quoteFromVNextPricebook({
        pricebook,
        serviceType,
        customerInputs: mutated,
        callerType: 'owner',
        currentMonth: 1
      });
      const label = serviceType + ' invalid customer field ' + field;
      assert.equal(review.resultType, 'ESTIMATE_REQUIRES_REVIEW', label + ': ' + JSON.stringify(review));
      assert.equal(
        [...(review.missingCustomerFields || []), ...(review.invalidCustomerFields || [])].includes(field),
        true,
        label
      );
    }
    const validAlternative = (definition, original) => {
      if (definition.type === 'boolean') return !original;
      if (definition.type === 'enum') return definition.values.find(value => value !== original);
      if (definition.type === 'slug') return original === 'audit_alternate' ? 'audit_second' : 'audit_alternate';
      if (definition.type === 'integer_or_unknown') {
        if (original === 'unknown') return definition.min;
        return original < definition.max ? original + 1 : original - 1;
      }
      if (definition.type === 'number') {
        if (definition.integer) return original < definition.max ? original + 1 : original - 1;
        const upward = Math.max(definition.min, Math.min(definition.max, original + Math.max(0.01, Math.abs(original) * 0.01)));
        if (upward !== original) return upward;
        return Math.max(definition.min, original - Math.max(0.01, Math.abs(original) * 0.01));
      }
      if (definition.type === 'plant_counts') {
        const next = structuredClone(original);
        next.small = (next.small || 0) + 1;
        return next;
      }
      if (definition.type === 'string') return original + ' audit alternate';
      return undefined;
    };
    for (const [field, { sample, index }] of mutationSamples) {
      const definition = MEASUREMENT_CONTRACTS[serviceType].fields[field];
      const alternative = validAlternative(definition, sample[field]);
      assert.notEqual(alternative, undefined, serviceType + ' has no valid customer mutation for ' + field);
      assert.notDeepEqual(alternative, sample[field], serviceType + ' customer mutation did not change ' + field);
      const changed = structuredClone(sample);
      changed[field] = alternative;
      const changedResult = quoteFromVNextPricebook({
        pricebook,
        serviceType,
        customerInputs: changed,
        callerType: 'owner',
        currentMonth: 1
      });
      const label = serviceType + ' valid customer mutation ' + field;
      if (changedResult.resultType === 'ESTIMATE_REQUIRES_REVIEW') continue;
      assert.equal(changedResult.resultType, 'INSTANT_ESTIMATE_READY', label + ': ' + JSON.stringify(changedResult));
      assert.notEqual(quoteSignature(changedResult), baselineSignatures[index], label + ' was silently ignored');
    }
    const pricingLeaves = [];
    const collectPricingLeaves = (value, prefix = '') => {
      for (const [key, child] of Object.entries(value || {})) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (child && typeof child === 'object' && !Array.isArray(child)) collectPricingLeaves(child, path);
        else pricingLeaves.push([path, child]);
      }
    };
    const setPricingLeaf = (target, path, value) => {
      const segments = path.split('.');
      const leaf = segments.pop();
      const parent = segments.reduce((current, segment) => current[segment], target);
      parent[leaf] = value;
    };
    const deletePricingLeaf = (target, path) => {
      const segments = path.split('.');
      const leaf = segments.pop();
      const parent = segments.reduce((current, segment) => current?.[segment], target);
      assert.equal(Boolean(parent) && Object.hasOwn(parent, leaf), true, `${serviceType} evidence path ${path} is not configured`);
      delete parent[leaf];
    };
    collectPricingLeaves(ownerPricing.pricing);

    assert.equal(consumedPricingSamples.size > 0, true, serviceType + ' emitted no owner-pricing evidence paths');
    for (const [path, sample] of consumedPricingSamples) {
      const missing = structuredClone(ownerPricing);
      deletePricingLeaf(missing.pricing, path);
      const missingStatus = vNextServiceStatus(missing, defaults);
      const label = serviceType + ' missing consumed owner pricing ' + path;
      const rerun = quoteFromVNextPricebook({
        pricebook: { defaults, services: [missing] },
        serviceType,
        customerInputs: sample.customerInputs,
        callerType: 'owner',
        currentMonth: 1
      });
      if (missingStatus.status === 'NEEDS PRICING') {
        assert.equal(
          missingStatus.ownerDiagnostics.some(item =>
            item.path === path ||
            (item.kind === 'structure' && path.startsWith(`${item.path}.`))
          ),
          true,
          label + ': ' + JSON.stringify(missingStatus.ownerDiagnostics)
        );
        assert.equal(rerun.resultType, 'ESTIMATE_REQUIRES_REVIEW', label + ': ' + JSON.stringify(rerun));
        assert.equal(Object.hasOwn(rerun, 'lineItems'), false, label);
        assert.equal(Object.hasOwn(rerun, 'options'), false, label);
        continue;
      }

      if (rerun.resultType === 'ESTIMATE_REQUIRES_REVIEW') {
        assert.equal(
          [...(rerun.missingOwnerFields || []), ...(rerun.invalidOwnerFields || [])].includes(path),
          true,
          label + ': ' + JSON.stringify(rerun)
        );
        assert.equal(Object.hasOwn(rerun, 'lineItems'), false, label);
        assert.equal(Object.hasOwn(rerun, 'options'), false, label);
        continue;
      }

      assert.equal(rerun.resultType, 'INSTANT_ESTIMATE_READY', label + ': ' + JSON.stringify(rerun));
      const rerunEvidence = JSON.stringify(rerun.calculationRecord);
      assert.notEqual(rerunEvidence, sample.baselineCalculationRecord, label + ' was silently ignored');
      const removedPathStillClaimed = rerun.calculationRecord.options.some(option =>
        Object.values(option.scenarios).some(scenarioRecord =>
          scenarioRecord.lineItems.some(item => {
            const calculations = item.calculation.evidenceVariant === 'composite'
              ? item.calculation.components
              : [item.calculation];
            return calculations.some(calculation =>
              calculation.ratePath === path ||
              (calculation.multipliers || []).some(multiplier => multiplier.path === path)
            );
          })
        )
      );
      assert.equal(removedPathStillClaimed, false, label + ' remained in calculation evidence after deletion');
    }

    for (const [path, original] of pricingLeaves) {
      const corruptions = typeof original === 'number'
        ? [-1, Number.NaN, Number.POSITIVE_INFINITY]
        : typeof original === 'boolean'
          ? ['not_a_boolean']
          : typeof original === 'string'
            ? ['INVALID_VALUE']
            : [null];
      for (const corruption of corruptions) {
        const corrupted = structuredClone(ownerPricing);
        setPricingLeaf(corrupted.pricing, path, corruption);
        const corruptedStatus = vNextServiceStatus(corrupted, defaults);
        const label = serviceType + ' invalid owner pricing ' + path + ' = ' + String(corruption);
        assert.equal(corruptedStatus.status, 'NEEDS PRICING', label + ': ' + JSON.stringify(corruptedStatus));
        assert.equal(
          corruptedStatus.ownerDiagnostics.some(item => item.path === path),
          true,
          label + ': ' + JSON.stringify(corruptedStatus.ownerDiagnostics)
        );
      }

      if (typeof original !== 'number') continue;
      const class2 = CLASS2_DEFINITIONS[serviceType]?.[path.split('.')[0]];
      const requiresPositive = class2
        ? class2.min > 0
        : /^(?:repairHours|patchRepairHours)(?:\.|$)|\.laborMultiplier$|^(?:frequencyMultipliers|overgrowthMultipliers)\./.test(path);
      const zeroed = structuredClone(ownerPricing);
      setPricingLeaf(zeroed.pricing, path, 0);
      const zeroStatus = vNextServiceStatus(zeroed, defaults);
      const zeroLabel = serviceType + ' configured zero pricing ' + path;
      if (requiresPositive) {
        assert.equal(zeroStatus.status, 'NEEDS PRICING', zeroLabel);
        assert.equal(zeroStatus.ownerDiagnostics.some(item => item.path === path), true, zeroLabel);
        continue;
      }
      assert.equal(zeroStatus.status, 'QUOTING LIVE', zeroLabel + ': ' + JSON.stringify(zeroStatus));
      for (const customerInputs of cases) {
        const zeroQuote = quoteFromVNextPricebook({
          pricebook: { defaults, services: [zeroed] },
          serviceType,
          customerInputs,
          callerType: 'owner',
          currentMonth: 1
        });
        assert.equal(zeroQuote.resultType, 'INSTANT_ESTIMATE_READY', zeroLabel + ': ' + JSON.stringify(zeroQuote));
      }
    }
    const alternativeValue = (path, original) => {
      const class2 = CLASS2_DEFINITIONS[serviceType]?.[path.split('.')[0]];
      if (typeof original === 'number') {
        if (class2) {
          const span = class2.max - class2.min;
          const step = Number.isInteger(original) ? 1 : Math.max(0.01, span / 100);
          return original + step <= class2.max ? original + step : original - step;
        }
        return original < Number.MAX_SAFE_INTEGER ? original + 1 : original - 1;
      }
      if (typeof original === 'boolean') return !original;
      if (path === 'accessoryPricingMode') return original === 'itemized' ? 'all_included' : 'itemized';
      if (path === 'vinylPlankUnderlaymentRule') return original === 'always_included' ? 'never_included' : 'always_included';
      if (path === 'underlaymentPriceBasis' || path.startsWith('underlaymentPriceBasis.')) {
        return original === 'installed_area_sell_price' ? 'cost' : 'installed_area_sell_price';
      }
      return undefined;
    };
    const unconsumed = [];
    for (const [path, original] of pricingLeaves) {
      const alternative = alternativeValue(path, original);
      assert.notEqual(alternative, undefined, serviceType + ' has no valid differential mutation for ' + path);
      assert.notEqual(alternative, original, serviceType + ' differential mutation did not change ' + path);
      const changed = structuredClone(ownerPricing);
      setPricingLeaf(changed.pricing, path, alternative);
      const changedStatus = vNextServiceStatus(changed, defaults);
      let observed = changedStatus.status !== 'QUOTING LIVE';
      if (observed) {
        const diagnostics = [
          ...(changedStatus.ownerDiagnostics || []),
          ...(changedStatus.failedTierDiagnostics || []).flatMap(item => item.ownerDiagnostics || [])
        ];
        assert.equal(diagnostics.length > 0, true, serviceType + ' rejected ' + path + ' without diagnostics');
      } else {
        for (let index = 0; index < cases.length; index += 1) {
          const changedQuote = run(serviceType, cases[index], changed);
          if (quoteSignature(changedQuote) !== baselineSignatures[index]) {
            observed = true;
            break;
          }
        }
      }
      if (!observed) unconsumed.push(path);
    }
    assert.deepEqual(
      unconsumed.sort(),
      [...knownUnconsumed].sort(),
      serviceType + ' has configured pricing leaves that neither affect evidence nor fail closed'
    );
  };

  const roofCases = [];
  let roofIndex = 0;
  for (const pitch of ['low', 'medium', 'steep', 'very_steep']) {
    for (const stories of [1, 2, 3]) {
      for (const roofComplexity of ['simple', 'moderate', 'complex']) {
        const scopeIndex = roofIndex % 3;
        roofCases.push({
          roofSizeMethod: 'roof_measured',
          roofSizeInput: 1000,
          existingRoofType: 'asphalt_shingle',
          replacementRoofType: 'asphalt_shingle',
          pitch,
          stories,
          existingLayers: roofIndex % 2 + 1,
          roofComplexity,
          serviceScope: scopeIndex === 0 ? 'full' : 'partial',
          ...(scopeIndex === 1 ? { partialPercent: 25 } : {}),
          ...(scopeIndex === 2 ? { partialAreaSqft: 250 } : {}),
          starterLengthLF: roofIndex % 2 === 0 ? 180 : 0,
          dripEdgeLengthLF: roofIndex % 2 === 0 ? 160 : 0,
          ridgeCapLengthLF: roofIndex % 2 === 0 ? 40 : 0,
          ...(roofIndex % 3 === 0 ? {} : { deckingSheets: roofIndex % 3 === 1 ? 0 : 2 })
        });
        roofIndex += 1;
      }
    }
  }
  const matrixRoof = roofService({
    accessoryPricingMode: 'itemized',
    starterPerLF: 100,
    dripEdgePerLF: 125,
    ridgeCapPerLF: 200,
    deckingPerSheet: 5000,
    disposalPerSquare: 0
  });
  assertReadyCases('ROOFING_REPLACEMENT', matrixRoof, roofCases);

  const roofRepair = repairFixture('ROOFING_REPAIR');
  const roofRepairCases = [];
  for (const pitch of ['low', 'medium', 'steep', 'very_steep']) {
    for (const stories of [1, 2, 3]) {
      for (const affectedArea of [25, 100, 250]) {
        roofRepairCases.push({ ...roofRepair.inputs, pitch, stories, affectedArea, leakPresent: affectedArea === 25 });
      }
    }
  }
  assertReadyCases('ROOFING_REPAIR', roofRepair.ownerPricing, roofRepairCases);

  const flatOwner = service('FLAT_ROOF_REPLACEMENT', {
    laborPerSqft: { epdm: 500, average: 550 },
    membraneCostPerSqft: { epdm: 700, average: 750 },
    tearOffPerSqft: { epdm: 200, average: 225 },
    minimumJob: 0,
    insulationPerSqft: 300,
    disposalPerSqft: 0
  });
  const flatCases = [];
  let flatIndex = 0;
  for (const accessDifficulty of ['easy', 'moderate', 'difficult']) {
    for (const buildingType of ['residential', 'commercial']) {
      for (const scopeMode of ['full', 'percent', 'area']) {
        flatCases.push({
          roofSqft: 1200,
          sqftMethod: 'exact',
          membraneType: 'epdm',
          existingLayers: flatIndex % 2 + 1,
          accessDifficulty,
          serviceScope: scopeMode === 'full' ? 'full' : 'partial',
          buildingType,
          ...(scopeMode === 'percent' ? { partialPercent: 25 } : {}),
          ...(scopeMode === 'area' ? { partialAreaSqft: 300 } : {})
        });
        flatIndex += 1;
      }
    }
  }
  assertReadyCases('FLAT_ROOF_REPLACEMENT', flatOwner, flatCases, [
    'laborPerSqft.average',
    'membraneCostPerSqft.average',
    'tearOffPerSqft.average'
  ]);

  const flatRepair = repairFixture('FLAT_ROOF_REPAIR');
  flatRepair.ownerPricing.pricing.pondingWaterSurcharge = 0;
  const flatRepairCases = [];
  for (const affectedArea of [10, 50, 100]) {
    for (const pondingWater of [false, true]) {
      flatRepairCases.push({ ...flatRepair.inputs, affectedArea, pondingWater, leakPresent: affectedArea === 10 });
    }
  }
  assertReadyCases('FLAT_ROOF_REPAIR', flatRepair.ownerPricing, flatRepairCases);

  const interiorCases = [];
  for (const wallHeight of ['standard', 'high', 'vaulted']) {
    for (const coats of [1, 2, 3]) {
      for (const ceilingsIncluded of [false, true]) {
        for (const trimIncluded of [false, true]) {
          interiorCases.push({
            areaInputMethod: 'wall_sqft',
            wallAreaSqft: 1000,
            wallHeight,
            surfaceCondition: 'good',
            coats,
            ceilingsIncluded,
            ...(ceilingsIncluded ? { ceilingAreaSqft: 500 } : {}),
            trimIncluded,
            ...(trimIncluded ? { trimLengthLF: 200 } : {})
          });
        }
      }
    }
  }
  assertReadyCases('INTERIOR_PAINTING', interiorService(), interiorCases);

  const exteriorOwner = service('EXTERIOR_PAINTING', {
    exteriorLaborPerSqftPerCoat: 100,
    materialPerSqftPerCoat: 50,
    minimumJob: 0,
    laborHourlyRate: 10000
  });
  const exteriorCases = [];
  for (const stories of [1, 2, 3]) {
    for (const coats of [1, 2, 3]) {
      for (const surfaceCondition of ['good', 'fair']) {
        exteriorCases.push({
          areaInputMethod: 'wall_sqft',
          exteriorAreaSqft: 1200,
          stories,
          surfaceCondition,
          coats
        });
      }
    }
  }
  assertReadyCases('EXTERIOR_PAINTING', exteriorOwner, exteriorCases);

  const floorPricing = {
    laborPerSqft: { tile: 500, vinyl_plank: 300 },
    materialPerSqft: { tile: 700, vinyl_plank: 500 },
    minimumJob: 0,
    removalPerSqft: { carpet: 100 },
    disposalPerSqft: 0,
    perStepPrice: 0,
    underlaymentPerSqft: 50,
    underlaymentPriceBasis: 'installed_area_sell_price',
    vinylPlankUnderlaymentRule: 'always_included'
  };
  const flooringOwner = service('FLOORING_INSTALL', floorPricing);
  const flooringCases = [];
  for (const newFlooringType of ['tile', 'vinyl_plank']) {
    for (const removalNeeded of [false, true]) {
      for (const layoutPattern of ['straight', 'diagonal_or_pattern']) {
        for (const sqft of [100, 200, 400]) {
          for (const stairSteps of [0, 2]) {
            flooringCases.push({
              sqft,
              sqftMethod: 'exact',
              newFlooringType,
              existingFloorType: removalNeeded ? 'carpet' : 'none',
              removalNeeded,
              roomCount: 1,
              layoutPattern,
              stairSteps
            });
          }
        }
      }
    }
  }
  assertReadyCases('FLOORING_INSTALL', flooringOwner, flooringCases, [
    'wasteFactorByType.carpet',
    'wasteFactorByType.hardwood',
    'wasteFactorByType.laminate'
  ]);

  const replacementOwner = service('FLOORING_REPLACEMENT', {
    ...floorPricing,
    subfloorAllowancePerSqft: 200
  });
  const replacementCases = [];
  for (const newFlooringType of ['tile', 'vinyl_plank']) {
    for (const subfloorIssues of [false, true]) {
      for (const layoutPattern of ['straight', 'diagonal_or_pattern']) {
        for (const sqft of [100, 200, 400]) {
          for (const stairSteps of [0, 2]) {
            replacementCases.push({
              sqft,
              sqftMethod: 'exact',
              newFlooringType,
              existingFloorType: 'carpet',
              removalNeeded: true,
              roomCount: 1,
              layoutPattern,
              stairSteps,
              subfloorIssues,
              ...(subfloorIssues ? { subfloorRepairAreaSqft: 40 } : {})
            });
          }
        }
      }
    }
  }
  assertReadyCases('FLOORING_REPLACEMENT', replacementOwner, replacementCases, [
    'wasteFactorByType.carpet',
    'wasteFactorByType.hardwood',
    'wasteFactorByType.laminate'
  ]);

  const concretePricing = {
    laborPerSqft: 600,
    concreteCostPerCubicYard: 18000,
    formworkPerLF: 2500,
    minimumJob: 0,
    demolitionPerSqft: 300,
    basePrepPerSqft: 200,
    wireReinforcementPerSqft: 150,
    rebarReinforcementPerSqft: 250,
    stampedMaterialPerSqft: 400,
    disposalPerSqft: 0
  };
  for (const serviceType of ['CONCRETE_DRIVEWAY', 'CONCRETE_PATIO_SLAB']) {
    const ownerPricing = service(serviceType, concretePricing);
    const cases = [];
    let index = 0;
    for (const finishType of ['broom', 'smooth', 'stamped']) {
      for (const reinforcement of ['none', 'wire_mesh', 'rebar']) {
        for (const accessDifficulty of ['easy', 'moderate', 'difficult']) {
          for (const dimensionMethod of ['exact', 'measured_area_perimeter']) {
            const demolitionNeeded = index % 2 === 0;
            cases.push({
              dimensionMethod,
              ...(dimensionMethod === 'exact'
                ? { length: 20, width: 10 }
                : { areaSqft: 200, perimeterLF: 60 }),
              thickness: 4,
              finishType,
              demolitionNeeded,
              ...(demolitionNeeded ? { demolitionAreaSqft: 100 } : {}),
              reinforcement,
              accessDifficulty,
              baseNeeded: index % 3 !== 0
            });
            index += 1;
          }
        }
      }
    }
    assertReadyCases(serviceType, ownerPricing, cases);
  }

  const cleanupOwner = service('LANDSCAPING_CLEANUP', {
    cleanupBaseRatePerSqft: 10,
    debrisPricing: {
      light: { laborMultiplier: 1, disposalFlat: 0 },
      moderate: { laborMultiplier: 1.5, disposalFlat: 10000 },
      heavy: { laborMultiplier: 2, disposalFlat: 15000 }
    },
    minimumServiceCharge: 0,
    haulAwayFee: 0
  });
  const cleanupCases = [];
  for (const debrisLevel of ['light', 'moderate', 'heavy']) {
    for (const slope of ['flat', 'moderate', 'steep']) {
      for (const haulAway of [false, true]) {
        cleanupCases.push({ yardSqft: 1000, sqftMethod: 'exact', debrisLevel, slope, haulAway });
      }
    }
  }
  assertReadyCases('LANDSCAPING_CLEANUP', cleanupOwner, cleanupCases);

  const mulchOwner = service('LANDSCAPING_MULCH', {
    mulchMaterialPerYard: { brown: 5000, red: 6000 },
    mulchInstallLaborPerYard: 3000,
    minimumServiceCharge: 0,
    bedPrepLaborPerSqft: { needs_weeding: 20, overgrown: 40 },
    edgingPerLinearFoot: 0
  });
  const mulchCases = [];
  let mulchIndex = 0;
  for (const inputMethod of ['sqft', 'yards']) {
    for (const bedCondition of ['clean', 'needs_weeding', 'overgrown']) {
      for (const edgingNeeded of [false, true]) {
        mulchCases.push({
          inputMethod,
          mulchArea: inputMethod === 'sqft' ? 1080 : 10,
          ...(inputMethod === 'sqft' ? { mulchDepth: 3 } : {}),
          mulchType: mulchIndex % 2 === 0 ? 'brown' : 'red',
          bedCondition,
          ...(bedCondition !== 'clean' ? { bedSqft: 500 } : {}),
          edgingNeeded,
          ...(edgingNeeded ? { edgeLF: 100 } : {})
        });
        mulchIndex += 1;
      }
    }
  }
  assertReadyCases('LANDSCAPING_MULCH', mulchOwner, mulchCases);

  const sodOwner = service('LANDSCAPING_SOD', {
    sodMaterialPerSqft: 100,
    sodInstallLaborPerSqft: 100,
    minimumServiceCharge: 0,
    groundPrepPerSqft: 50
  });
  const sodCases = [];
  for (const slope of ['flat', 'moderate', 'steep']) {
    for (const accessDifficulty of ['easy', 'moderate', 'difficult']) {
      for (const groundPrepNeeded of [false, true]) {
        sodCases.push({ sodSqft: 1000, sqftMethod: 'exact', groundPrepNeeded, slope, accessDifficulty });
      }
    }
  }
  assertReadyCases('LANDSCAPING_SOD', sodOwner, sodCases);

  const plantingOwner = service('LANDSCAPING_PLANTING', {
    plantingLaborPerPlant: { small: 1000, medium: 2000, large: 3000 },
    plantMaterialAllowance: { small: 2000, medium: 4000, large: 6000 },
    minimumServiceCharge: 0,
    bedPrepLaborPerSqft: { needs_weeding: 20, overgrown: 40 },
    mulchMaterialPerYard: { brown: 5000, red: 6000 },
    mulchInstallLaborPerYard: 3000
  });
  const plantingCases = [];
  let plantingIndex = 0;
  for (const bedCondition of ['clean', 'needs_weeding', 'overgrown']) {
    for (const mulchType of [null, 'brown', 'red']) {
      const mulchNeeded = mulchType !== null;
      plantingCases.push({
        plantsBySize: {
          small: plantingIndex % 3 === 0 ? 2 : 0,
          medium: plantingIndex % 3 === 1 ? 2 : 1,
          large: plantingIndex % 3 === 2 ? 2 : 0
        },
        bedCondition,
        ...(bedCondition !== 'clean' ? { bedSqft: 300 } : {}),
        mulchNeeded,
        ...(mulchNeeded ? { mulchYards: 2, mulchType } : {})
      });
      plantingIndex += 1;
    }
  }
  assertReadyCases('LANDSCAPING_PLANTING', plantingOwner, plantingCases);

  const mowingOwner = service('LANDSCAPING_MOWING', {
    mowingBaseRatePerSqft: 10,
    minimumServiceCharge: 0,
    frequencyMultipliers: { weekly: 1, biweekly: 1.1, monthly: 1.2, one_time: 1.4 },
    overgrowthMultipliers: { maintained: 1, overgrown: 1.5, severe: 2 },
    baggingSurchargePercent: 10,
    edgingPerLinearFoot: 50
  });
  const mowingCases = [];
  for (const serviceFrequency of ['weekly', 'biweekly', 'monthly', 'one_time']) {
    for (const grassCondition of ['maintained', 'overgrown', 'severe']) {
      for (const bagClippings of [false, true]) {
        for (const edgingIncluded of [false, true]) {
          mowingCases.push({
            yardSqft: 5000,
            sqftMethod: 'exact',
            serviceFrequency,
            grassCondition,
            bagClippings,
            edgingIncluded,
            ...(edgingIncluded ? { edgingLengthLF: 200 } : {})
          });
        }
      }
    }
  }
  assertReadyCases('LANDSCAPING_MOWING', mowingOwner, mowingCases);

  const sidingTypes = ['vinyl', 'fiber_cement', 'wood', 'metal'];
  const sidingOwner = service('SIDING_REPLACEMENT', {
    laborPerSqft: Object.fromEntries(sidingTypes.map((type, index) => [type, 400 + index * 10])),
    materialPerSqft: Object.fromEntries(sidingTypes.map((type, index) => [type, 700 + index * 10])),
    minimumJob: 0,
    removalPerSqft: 200,
    disposalPerSqft: 0
  });
  const sidingCases = [];
  for (const sidingType of sidingTypes) {
    for (const stories of [1, 2, 3]) {
      for (const oldSidingRemoval of [false, true]) {
        sidingCases.push({
          areaInputMethod: 'sqft',
          sidingAreaSqft: 1000,
          sidingType,
          stories,
          oldSidingRemoval,
          trimIncluded: false
        });
      }
    }
  }
  assertReadyCases('SIDING_REPLACEMENT', sidingOwner, sidingCases);

  const sidingRow = { minor: { small: 1, medium: 2, large: 3 } };
  const sidingAllowance = { minor: { small: 1000, medium: 2000, large: 3000 } };
  const sidingRepairOwner = service('SIDING_REPAIR', {
    laborHourlyRate: 10000,
    repairMinimum: 0,
    repairHours: Object.fromEntries(sidingTypes.map(type => [type, structuredClone(sidingRow)])),
    materialAllowance: Object.fromEntries(sidingTypes.map(type => [type, structuredClone(sidingAllowance)]))
  });
  const sidingRepairCases = [];
  for (const sidingType of sidingTypes) {
    for (const stories of [1, 2, 3]) {
      for (const affectedArea of [10, 50, 100]) {
        sidingRepairCases.push({ sidingType, damageLevel: 'minor', affectedArea, stories });
      }
    }
  }
  assertReadyCases('SIDING_REPAIR', sidingRepairOwner, sidingRepairCases);

  const partialRoof = quoteFromVNextPricebook({
    pricebook: { defaults, services: [matrixRoof] },
    serviceType: 'ROOFING_REPLACEMENT',
    customerInputs: roofCases.find(item => item.partialAreaSqft !== undefined),
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(partialRoof.calculationRecord.options[0].ruleApplications.find(item => item.name === 'roofAreaSelection').result.source, 'measured_partial_area');

  const partialFlat = quoteFromVNextPricebook({
    pricebook: { defaults, services: [flatOwner] },
    serviceType: 'FLAT_ROOF_REPLACEMENT',
    customerInputs: flatCases.find(item => item.partialPercent !== undefined),
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(partialFlat.calculationRecord.options[0].ruleApplications.find(item => item.name === 'flatRoofAreaSelection').result.source, 'confirmed_partial_percent');

  const vinyl = quoteFromVNextPricebook({
    pricebook: { defaults, services: [flooringOwner] },
    serviceType: 'FLOORING_INSTALL',
    customerInputs: flooringCases.find(item => item.newFlooringType === 'vinyl_plank'),
    callerType: 'owner',
    currentMonth: 1
  });
  const underlaymentRule = vinyl.calculationRecord.options[0].ruleApplications.find(item => item.name === 'vinylPlankUnderlayment');
  assert.deepEqual([underlaymentRule.inputs.configuredRule, underlaymentRule.result.applies], ['always_included', true]);

  for (const serviceType of ['FENCING_INSTALL', 'FENCING_REPLACEMENT']) {
    const ownerPricing = serviceType === 'FENCING_INSTALL'
      ? fenceService()
      : service(serviceType, {
          laborPerLinearFoot: { wood: 1000 },
          materialPerLinearFoot: { wood: 2000 },
          postPrice: { wood: 2500 },
          concretePerPost: 700,
          postsIncludedInMaterial: { wood: false },
          gatePrice: { wood: 10000 },
          minimumJob: 0,
          removalPerLinearFoot: { wood: 500 },
          disposalPerLF: 0
        });
    const customerInputs = {
      ...fenceInputs(),
      ...(serviceType === 'FENCING_REPLACEMENT' ? { oldFenceRemoval: true } : {})
    };
    const review = quoteFromVNextPricebook({
      pricebook: { defaults, services: [ownerPricing] },
      serviceType,
      customerInputs,
      callerType: 'owner',
      currentMonth: 1
    });
    assert.equal(review.resultType, 'ESTIMATE_REQUIRES_REVIEW', serviceType);
    assert.equal(review.ownerDecisionRequired.some(item => item.kind === 'post_geometry_contract'), true, serviceType);
    assert.equal(review.ownerDecisionRequired.some(item => item.kind === 'mixed_charge_allocation'), true, serviceType);
  }

  for (const unitCase of [
    ['flat', {}],
    ['per_hour', { hours: 2 }],
    ['per_unit', { itemCount: 2 }],
    ['per_sqft', { areaSqft: 200 }],
    ['per_LF', { linearFeet: 100 }],
    ['per_square', { roofSquares: 20 }]
  ]) {
    const [unit, quantity] = unitCase;
    const configured = service('CUSTOM', {
      customPricingMode: 'fixed',
      price: 10000,
      unit,
      minimumJob: 0
    }, { service: 'Matrix custom ' + unit });
    const review = quoteFromVNextPricebook({
      pricebook: { defaults, services: [configured] },
      serviceType: 'CUSTOM',
      customerInputs: {
        service: 'Matrix custom ' + unit,
        serviceConfirmed: true,
        unit,
        ...quantity
      },
      callerType: 'owner',
      currentMonth: 1
    });
    assert.equal(review.resultType, 'ESTIMATE_REQUIRES_REVIEW', unit);
    assert.equal(review.ownerDecisionRequired.some(item => item.kind === 'custom_charge_classification'), true, unit);
  }
});
test('repair 49: a positive peak percentage over intentionally free labor remains a valid zero charge', () => {
  const ownerPricing = interiorService({
    laborPerWallSqftPerCoat: 0,
    materialPerWallSqftPerCoat: 0
  }, {
    peakMonths: [1],
    peakSurchargePercent: 25
  });
  const result = run('INTERIOR_PAINTING', interiorInputs(), ownerPricing, { currentMonth: 1 });
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY');
  assert.deepEqual([result.lowEstimate, result.midEstimate, result.highEstimate], [0, 0, 0]);
  const seasonal = result.calculationRecord.options[0].scenarios.mid.seasonal;
  assert.deepEqual(
    {
      configuredMonths: seasonal.configuredMonths,
      percent: seasonal.percent,
      laborSubtotalCents: seasonal.laborSubtotalCents,
      applied: seasonal.applied,
      amountCents: seasonal.amountCents
    },
    {
      configuredMonths: [1],
      percent: 25,
      laborSubtotalCents: 0,
      applied: false,
      amountCents: 0
    }
  );
  assert.equal(result.lineItems.some(item => item.name === 'Peak season adjustment'), false);
});

test('repair 50: misplaced quote-affecting service controls fail closed instead of being ignored', () => {
  const misplaced = interiorService();
  misplaced.minimumJob = 999999;
  misplaced.markupPercent = 500;

  const status = vNextServiceStatus(misplaced, defaults);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.equal(status.unsupportedOwnerFields.includes('minimumJob'), true);
  assert.equal(status.unsupportedOwnerFields.includes('markupPercent'), true);
  assert.equal(status.ownerDiagnostics.some(item => item.kind === 'misplaced_pricing' && item.path === 'minimumJob'), true);
  assert.equal(status.ownerDiagnostics.some(item => item.kind === 'misplaced_business_default' && item.path === 'markupPercent'), true);

  const result = run('INTERIOR_PAINTING', interiorInputs(), misplaced);
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(result.unsupportedOwnerFields.includes('minimumJob'), true);
  assert.equal(result.unsupportedOwnerFields.includes('markupPercent'), true);
  assert.equal(result.lineItems, undefined);

  const malformedContainer = interiorService();
  malformedContainer.pricing = [];
  const malformedStatus = vNextServiceStatus(malformedContainer, defaults);
  assert.equal(malformedStatus.status, 'NEEDS PRICING');
  assert.equal(malformedStatus.invalidOwnerFields.includes('pricing'), true);
});

test('repair 51: malformed top-level quote containers return review diagnostics instead of throwing', () => {
  const cases = [
    ['customerInputs', { customerInputs: null }, 'invalidCustomerFields'],
    ['ownerPricing', { ownerPricing: null }, 'invalidOwnerFields'],
    ['businessDefaults', { businessDefaults: null }, 'invalidOwnerFields']
  ];
  for (const [field, overrides, collection] of cases) {
    let result;
    assert.doesNotThrow(() => {
      result = run('INTERIOR_PAINTING', interiorInputs(), interiorService(), overrides);
    }, field);
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW', field);
    assert.equal(result[collection].includes(field), true, field);
  }

  const directDefaults = validateBusinessDefaults(null);
  assert.equal(directDefaults.ok, false);
  assert.deepEqual(directDefaults.invalidFields, ['businessDefaults']);
  assert.equal(directDefaults.diagnostics[0].path, 'businessDefaults');

  const uncloneable = interiorService();
  uncloneable.pricing.invalidFunction = () => 1;
  const uncloneableResult = run('INTERIOR_PAINTING', interiorInputs(), uncloneable);
  assert.equal(uncloneableResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(uncloneableResult.invalidOwnerFields.includes('invalidFunction'), true);
  assert.equal(uncloneableResult.unsupportedOwnerFields.includes('invalidFunction'), true);

  const customerSafe = run('INTERIOR_PAINTING', interiorInputs(), null, { callerType: 'customer' });
  assert.deepEqual(Object.keys(customerSafe).sort(), ['customerMessage', 'quoteId', 'resultType']);
});

test('repair 52: activation executes formulas and cannot mark an overflowing service live', () => {
  const overflowing = interiorService({ laborPerWallSqftPerCoat: Number.MAX_SAFE_INTEGER });
  const status = vNextServiceStatus(overflowing, defaults);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.equal(status.invalidOwnerFields.includes('laborPerWallSqftPerCoat'), true);
  assert.equal(status.ownerDiagnostics.some(item => item.kind === 'activation_calculation' && item.path === 'laborPerWallSqftPerCoat'), true);

  const direct = run('INTERIOR_PAINTING', interiorInputs(), overflowing);
  assert.equal(direct.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(direct.invalidOwnerFields.includes('laborPerWallSqftPerCoat'), true);

  const tiered = interiorService({}, {
    tiers: [
      { name: 'Executable', overrides: {} },
      { name: 'Overflowing', overrides: { laborPerWallSqftPerCoat: Number.MAX_SAFE_INTEGER } }
    ]
  });
  const tierStatus = vNextServiceStatus(tiered, defaults);
  assert.equal(tierStatus.status, 'QUOTING LIVE');
  assert.deepEqual(tierStatus.validTierNames, ['Executable']);
  assert.equal(tierStatus.failedTierDiagnostics[0].tierName, 'Overflowing');
  assert.equal(tierStatus.failedTierDiagnostics[0].invalidOwnerFields.includes('laborPerWallSqftPerCoat'), true);

  const result = quoteFromVNextPricebook({
    pricebook: { defaults, services: [tiered] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'customer',
    currentMonth: 1
  });
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY');
  assert.deepEqual(result.options.map(option => option.tierName), ['Executable']);
  assert.equal(typeof result.optionAvailabilityNotice, 'string');
});

test('repair 53: displayed ranges fail closed before integer-cent rounding or buffering overflows', () => {
  const nearLimit = interiorService({
    laborPerWallSqftPerCoat: Number.MAX_SAFE_INTEGER,
    materialPerWallSqftPerCoat: 0
  });
  const overflow = run('INTERIOR_PAINTING', interiorInputs({ wallAreaSqft: 1 }), nearLimit);
  assert.equal(overflow.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(overflow.invalidOwnerFields.includes('rangeBufferPercent'), true);
  assert.equal(overflow.lineItems, undefined);

  const representableRate = Math.floor(Number.MAX_SAFE_INTEGER / 2);
  const representable = run(
    'INTERIOR_PAINTING',
    interiorInputs({ wallAreaSqft: 1 }),
    interiorService({
      laborPerWallSqftPerCoat: representableRate,
      materialPerWallSqftPerCoat: 0
    })
  );
  assert.equal(representable.resultType, 'INSTANT_ESTIMATE_READY');
  const range = representable.calculationRecord.options[0].range;
  for (const cents of [range.lowCents, range.midCents, range.highCents, range.minimumCustomerFloorCents]) {
    assert.equal(Number.isSafeInteger(cents), true);
  }
  assert.equal(range.lowCents <= range.midCents && range.midCents <= range.highCents, true);
});

test('repair 54: exported validators and tier boundaries fail closed on malformed structured data', () => {
  const class2 = validateClass2FactorsDetailed('INTERIOR_PAINTING', null);
  assert.deepEqual(class2.map(item => item.path), ['pricing']);

  const structures = validatePricingStructuresDetailed('INTERIOR_PAINTING', null);
  assert.deepEqual(structures.map(item => item.path), ['pricing']);

  const malformedOwner = validateOwnerPricing('INTERIOR_PAINTING', interiorInputs(), null);
  assert.equal(malformedOwner.ok, false);
  assert.deepEqual(malformedOwner.invalidOwnerFields, ['pricing']);

  const unknownOwner = validateOwnerPricing('NOT_A_SERVICE', {}, {});
  assert.equal(unknownOwner.ok, false);
  assert.deepEqual(unknownOwner.invalidOwnerFields, ['serviceType']);

  const malformedTiers = validateTierDefinitionsDetailedVNext(null, 'INTERIOR_PAINTING');
  assert.deepEqual(malformedTiers.map(item => item.path), ['ownerPricing']);

  const unsafeTier = interiorService({}, {
    tiers: [{ name: 'Unsafe', overrides: { laborPerWallSqftPerCoat: () => 1 } }]
  });
  let status;
  assert.doesNotThrow(() => {
    status = vNextServiceStatus(unsafeTier, defaults);
  });
  assert.equal(status.status, 'NEEDS PRICING');
  assert.equal(status.failedTierDiagnostics[0].invalidOwnerFields.includes('laborPerWallSqftPerCoat'), true);

  let preview;
  assert.doesNotThrow(() => {
    preview = previewFromVNextPricebook({
      pricebook: { defaults, services: [unsafeTier] },
      serviceType: 'INTERIOR_PAINTING',
      customerInputs: interiorInputs(),
      currentMonth: 1
    });
  });
  assert.equal(preview.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(preview.invalidOwnerFields.includes('laborPerWallSqftPerCoat'), true);

  let lookup;
  assert.doesNotThrow(() => {
    lookup = quoteFromVNextPricebook({
      pricebook: { defaults, services: [] },
      serviceType: 'INTERIOR_PAINTING',
      customerInputs: { uncloneable: () => 1 },
      callerType: 'owner'
    });
  });
  assert.equal(lookup.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(lookup.submittedCustomerInputs, {});
});

test('repair 55: an independent arithmetic oracle matches the shared pipeline across 1,152 policy combinations', () => {
  const categoryMap = value => Object.fromEntries(PRICE_BASIS_CATEGORIES.map(category => [category, value]));
  const markupAmount = (baseCents, config) => {
    if (baseCents <= 0 || config.markupPercent === 0) return 0;
    if (config.markupMode === 'margin') {
      return Math.round(baseCents / (1 - config.markupPercent / 100)) - baseCents;
    }
    return Math.round(baseCents * config.markupPercent / 100);
  };
  const roundedRange = (totalCents, minimumCents, config) => {
    const minimumFloorCents = config.taxMode === 'TAX_ALL'
      ? minimumCents + Math.round(minimumCents * config.taxPercent / 100)
      : minimumCents;
    if (totalCents === 0) {
      return { lowCents: 0, midCents: 0, highCents: 0, minimumFloorCents };
    }
    const increment = totalCents < 1000 ? 1 : 1000;
    const rounded = value => Math.round(value / increment) * increment;
    let midCents = rounded(totalCents);
    let lowCents = rounded(midCents * (1 - config.rangeBufferPercent / 100));
    let highCents = rounded(midCents * (1 + config.rangeBufferPercent / 100));
    lowCents = Math.min(Math.max(lowCents, minimumFloorCents, 1), totalCents);
    highCents = Math.max(highCents, totalCents, lowCents, 1);
    midCents = Math.min(Math.max(midCents, lowCents, 1), highCents);
    return { lowCents, midCents, highCents, minimumFloorCents };
  };
  const oracle = ({ ownerPricing, config, seasonActive }) => {
    const lines = [
      { category: 'material', amountCents: 13 * 223 },
      { category: 'labor', amountCents: 13 * 137 }
    ];
    const fees = [
      ['travel', config.travelFee],
      ['disposal', config.disposalFee],
      ['permit', config.permitFee],
      ['overhead', config.overheadFixed]
    ];
    for (const [category, amountCents] of fees) {
      if (ownerPricing.feeRules[category] === 'always' && amountCents > 0) {
        lines.push({ category, amountCents });
      }
    }
    const laborSubtotalCents = lines.filter(item => item.category === 'labor').reduce((sum, item) => sum + item.amountCents, 0);
    const seasonalCents = seasonActive ? Math.round(laborSubtotalCents * 12.5 / 100) : 0;
    if (seasonalCents > 0) lines.push({ category: 'surcharge', amountCents: seasonalCents });

    const eligible = lines.filter(item =>
      ownerPricing.priceBasisByCategory[item.category] === 'cost' &&
      config.markupApplies[item.category] === true
    );
    const markupBaseCents = eligible.reduce((sum, item) => sum + item.amountCents, 0);
    const markupCents = markupAmount(markupBaseCents, config);
    if (markupCents > 0) lines.push({ category: 'markup', amountCents: markupCents });

    const minimumCents = Math.max(ownerPricing.pricing.minimumServiceCharge, config.minimumJobPrice);
    let taxPreTaxSubtotalCents;
    let taxableMarkupCents = 0;
    let taxableSubtotalCents = 0;
    let taxCents = 0;
    let minimumAdjustmentCents = 0;
    let minimumBasis;
    let order;

    if (config.taxMode === 'TAX_MATERIALS') {
      taxPreTaxSubtotalCents = lines.reduce((sum, item) => sum + item.amountCents, 0);
      const taxableNonMarkupCents = lines
        .filter(item => item.category !== 'markup' && ownerPricing.taxabilityByCategory[item.category] === true)
        .reduce((sum, item) => sum + item.amountCents, 0);
      const taxableMarkupBaseCents = eligible
        .filter(item => ownerPricing.taxabilityByCategory[item.category] === true)
        .reduce((sum, item) => sum + item.amountCents, 0);
      taxableMarkupCents = markupAmount(taxableMarkupBaseCents, config);
      taxableSubtotalCents = taxableNonMarkupCents + taxableMarkupCents;
      taxCents = Math.round(taxableSubtotalCents * config.taxPercent / 100);
      if (taxCents > 0) lines.push({ category: 'tax', amountCents: taxCents });
      minimumAdjustmentCents = Math.max(0, minimumCents - lines.reduce((sum, item) => sum + item.amountCents, 0));
      if (minimumAdjustmentCents > 0) lines.push({ category: 'minimum_adjustment', amountCents: minimumAdjustmentCents });
      minimumBasis = 'post_tax';
      order = ['fees', 'seasonal', 'taxability', 'markup', 'tax', 'minimum'];
    } else {
      minimumAdjustmentCents = Math.max(0, minimumCents - lines.reduce((sum, item) => sum + item.amountCents, 0));
      if (minimumAdjustmentCents > 0) lines.push({ category: 'minimum_adjustment', amountCents: minimumAdjustmentCents });
      taxPreTaxSubtotalCents = lines.reduce((sum, item) => sum + item.amountCents, 0);
      if (config.taxMode === 'TAX_ALL') {
        taxableSubtotalCents = taxPreTaxSubtotalCents;
        taxableMarkupCents = markupCents;
        taxCents = Math.round(taxableSubtotalCents * config.taxPercent / 100);
        if (taxCents > 0) lines.push({ category: 'tax', amountCents: taxCents });
        minimumBasis = 'pre_tax';
        order = ['fees', 'seasonal', 'taxability', 'markup', 'minimum', 'tax'];
      } else {
        minimumBasis = 'post_markup';
        order = ['fees', 'seasonal', 'taxability', 'markup', 'minimum'];
      }
    }

    const finalTotalCents = lines.reduce((sum, item) => sum + item.amountCents, 0);
    return {
      lines,
      laborSubtotalCents,
      seasonalCents,
      markupBaseCents,
      markupCents,
      minimumCents,
      minimumAdjustmentCents,
      minimumBasis,
      taxableMarkupCents,
      taxableSubtotalCents,
      taxPreTaxSubtotalCents,
      taxCents,
      finalTotalCents,
      order,
      range: roundedRange(finalTotalCents, minimumCents, config)
    };
  };

  const basisProfiles = [
    categoryMap('cost'),
    { ...categoryMap('cost'), material: 'sell_price', travel: 'sell_price', overhead: 'sell_price' }
  ];
  const markupProfiles = [
    Object.fromEntries(PRICE_BASIS_CATEGORIES.map(category => [category, true])),
    { ...Object.fromEntries(PRICE_BASIS_CATEGORIES.map(category => [category, false])), labor: true, material: true, prep: true, removal: true, addon: true }
  ];
  const taxabilityProfiles = [
    { ...noTaxability, material: true, travel: true, permit: true },
    { ...noTaxability, labor: true, disposal: true, overhead: true, surcharge: true }
  ];
  const feeProfiles = [
    { travel: 'not_applicable', disposal: 'not_applicable', permit: 'not_applicable', overhead: 'not_applicable' },
    { travel: 'always', disposal: 'always', permit: 'always', overhead: 'always' }
  ];
  const minimumProfiles = [
    { service: 0, business: 0 },
    { service: 15000, business: 10000 },
    { service: 5000, business: 18000 }
  ];

  let caseCount = 0;
  for (const taxMode of ['TAX_NONE', 'TAX_MATERIALS', 'TAX_ALL']) {
    for (const markupMode of ['markup', 'margin']) {
      for (const priceBasisByCategory of basisProfiles) {
        for (const configuredMarkupApplies of markupProfiles) {
          for (const taxabilityByCategory of taxabilityProfiles) {
            for (const configuredFeeRules of feeProfiles) {
              for (const seasonActive of [false, true]) {
                for (const minimum of minimumProfiles) {
                  for (const rangeBufferPercent of [0, 13]) {
                    const config = {
                      ...defaults,
                      markupMode,
                      markupPercent: markupMode === 'markup' ? 17.5 : 23.1,
                      markupApplies: structuredClone(configuredMarkupApplies),
                      taxMode,
                      taxPercent: taxMode === 'TAX_NONE' ? 0 : 8.25,
                      travelFee: 137,
                      disposalFee: 211,
                      permitFee: 307,
                      overheadFixed: 419,
                      minimumJobPrice: minimum.business,
                      rangeBufferPercent
                    };
                    const ownerPricing = service('LANDSCAPING_SOD', {
                      sodMaterialPerSqft: 223,
                      sodInstallLaborPerSqft: 137,
                      minimumServiceCharge: minimum.service,
                      groundPrepPerSqft: 0,
                      sodWasteFactor: 0,
                      slopeMultiplier: { flat: 1, moderate: 1, steep: 1 },
                      accessMultiplier: { easy: 1, moderate: 1, difficult: 1 }
                    }, {
                      feeRules: structuredClone(configuredFeeRules),
                      priceBasisByCategory: structuredClone(priceBasisByCategory),
                      taxabilityByCategory: structuredClone(taxabilityByCategory),
                      peakMonths: seasonActive ? [1] : [],
                      peakSurchargePercent: 12.5
                    });
                    const expected = oracle({ ownerPricing, config, seasonActive });
                    const result = generateQuoteVNext({
                      serviceType: 'LANDSCAPING_SOD',
                      customerInputs: { sodSqft: 13, sqftMethod: 'exact', groundPrepNeeded: false, slope: 'flat', accessDifficulty: 'easy' },
                      ownerPricing,
                      businessDefaults: config,
                      callerType: 'owner',
                      currentMonth: 1
                    });
                    const label = [
                      taxMode,
                      markupMode,
                      basisProfiles.indexOf(priceBasisByCategory),
                      markupProfiles.indexOf(configuredMarkupApplies),
                      taxabilityProfiles.indexOf(taxabilityByCategory),
                      feeProfiles.indexOf(configuredFeeRules),
                      seasonActive,
                      minimum.service,
                      minimum.business,
                      rangeBufferPercent
                    ].join(':');
                    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', label + ': ' + JSON.stringify(result));
                    const record = scenario(result);
                    assert.deepEqual(
                      record.lineItems.map(item => ({ category: item.category, amountCents: item.amountCents })),
                      expected.lines,
                      label + ' lines'
                    );
                    assert.deepEqual(record.order, expected.order, label + ' order');
                    assert.equal(record.seasonal.laborSubtotalCents, expected.laborSubtotalCents, label + ' seasonal basis');
                    assert.equal(record.seasonal.amountCents, expected.seasonalCents, label + ' seasonal');
                    assert.equal(record.markup.baseCents, expected.markupBaseCents, label + ' markup basis');
                    assert.equal(record.markup.amountCents, expected.markupCents, label + ' markup');
                    assert.equal(record.minimum.effectiveMinimumCents, expected.minimumCents, label + ' minimum');
                    assert.equal(record.minimum.adjustmentCents, expected.minimumAdjustmentCents, label + ' minimum adjustment');
                    assert.equal(record.minimum.basis, expected.minimumBasis, label + ' minimum basis');
                    assert.equal(record.tax.preTaxSubtotalCents, expected.taxPreTaxSubtotalCents, label + ' pre-tax subtotal');
                    assert.equal(record.tax.taxableMarkupCents, expected.taxableMarkupCents, label + ' taxable markup');
                    assert.equal(record.tax.taxableSubtotalCents, expected.taxableSubtotalCents, label + ' taxable subtotal');
                    assert.equal(record.tax.taxCents, expected.taxCents, label + ' tax');
                    assert.equal(record.finalTotalCents, expected.finalTotalCents, label + ' final');
                    assert.equal(record.finalTotalCents, record.lineItems.reduce((sum, item) => sum + item.amountCents, 0), label + ' line sum');
                    assert.deepEqual(
                      result.calculationRecord.options[0].range,
                      {
                        source: 'business_range_buffer',
                        bufferPercent: rangeBufferPercent,
                        effectiveRangeBufferPercent: rangeBufferPercent,
                        rangeBufferUsed: rangeBufferPercent,
                        minimumCustomerFloorCents: expected.range.minimumFloorCents,
                        lowCents: expected.range.lowCents,
                        midCents: expected.range.midCents,
                        highCents: expected.range.highCents,
                        exactMidScenarioTotalCents: expected.finalTotalCents
                      },
                      label + ' range'
                    );
                    assert.deepEqual(
                      [result.lowEstimate, result.midEstimate, result.highEstimate],
                      [expected.range.lowCents / 100, expected.range.midCents / 100, expected.range.highCents / 100],
                      label + ' displayed range'
                    );
                    caseCount += 1;
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  assert.equal(caseCount, 1152);
});

test('repair 56: direct calculator boundaries fail closed with exact defensive diagnostics', () => {
  const captureReview = callback => {
    try {
      callback();
    } catch (error) {
      assert.equal(error.name, 'QuoteReviewError');
      return error;
    }
    assert.fail('Expected QuoteReviewError');
  };

  const unsupported = captureReview(() => calculateServiceVNext('NOT_A_SERVICE', {}, {}));
  assert.deepEqual(unsupported.invalidCustomerFields, ['serviceType']);

  const badCustomer = captureReview(() => calculateServiceVNext('INTERIOR_PAINTING', null, {}));
  assert.deepEqual(badCustomer.invalidCustomerFields, ['customerInputs']);

  const badPricing = captureReview(() => calculateServiceVNext('INTERIOR_PAINTING', interiorInputs(), null));
  assert.deepEqual(badPricing.invalidOwnerFields, ['pricing']);

  const flatReplacementPricing = service('FLAT_ROOF_REPLACEMENT', {
    laborPerSqft: { epdm: 500, average: 550 },
    membraneCostPerSqft: { epdm: 700, average: 750 },
    tearOffPerSqft: { epdm: 200, average: 225 },
    minimumJob: 0
  }).pricing;
  const unknownFlat = captureReview(() => calculateServiceVNext('FLAT_ROOF_REPLACEMENT', {
    roofSqft: 1000,
    sqftMethod: 'exact',
    membraneType: 'unknown',
    existingLayers: 'unknown',
    accessDifficulty: 'easy',
    serviceScope: 'full',
    buildingType: 'residential'
  }, flatReplacementPricing));
  assert.equal(unknownFlat.inspectionFirst, true);
  assert.match(unknownFlat.reviewReason, /membrane type/i);
  assert.equal(Object.hasOwn(unknownFlat, 'lineItems'), false);

  const exteriorPoor = captureReview(() => calculateServiceVNext('EXTERIOR_PAINTING', {
    areaInputMethod: 'wall_sqft',
    exteriorAreaSqft: 1000,
    stories: 1,
    surfaceCondition: 'poor',
    coats: 2
  }, service('EXTERIOR_PAINTING', {
    exteriorLaborPerSqftPerCoat: 100,
    materialPerSqftPerCoat: 50,
    minimumJob: 0,
    laborHourlyRate: 10000
  }).pricing));
  assert.equal(exteriorPoor.ownerDecisionRequired[0].kind, 'primer_pricing_contract');

  const interiorOwner = interiorService();
  const fairInterior = captureReview(() => calculateServiceVNext(
    'INTERIOR_PAINTING',
    interiorInputs({ surfaceCondition: 'fair' }),
    interiorOwner.pricing,
    { ownerPricing: interiorOwner }
  ));
  assert.equal(fairInterior.inspectionFirst, true);
  assert.deepEqual(fairInterior.ownerDecisionRequired.map(item => item.kind), ['measured_prep_pricing_contract']);

  const missingInteriorCondition = captureReview(() => calculateServiceVNext(
    'INTERIOR_PAINTING',
    interiorInputs({ surfaceCondition: undefined }),
    interiorOwner.pricing,
    { ownerPricing: interiorOwner }
  ));
  assert.deepEqual(missingInteriorCondition.missingCustomerFields, ['surfaceCondition']);
  assert.deepEqual(missingInteriorCondition.invalidCustomerFields, []);
  assert.deepEqual(missingInteriorCondition.ownerDecisionRequired, []);

  const invalidInteriorCondition = captureReview(() => calculateServiceVNext(
    'INTERIOR_PAINTING',
    interiorInputs({ surfaceCondition: 'damaged' }),
    interiorOwner.pricing,
    { ownerPricing: interiorOwner }
  ));
  assert.deepEqual(invalidInteriorCondition.missingCustomerFields, []);
  assert.deepEqual(invalidInteriorCondition.invalidCustomerFields, ['surfaceCondition']);
  assert.deepEqual(invalidInteriorCondition.ownerDecisionRequired, []);

  const unclassifiedPaint = captureReview(() => calculateServiceVNext('INTERIOR_PAINTING', interiorInputs(), interiorOwner.pricing));
  assert.deepEqual(unclassifiedPaint.missingOwnerFields, ['priceBasisByCategory.material']);

  const costPaintOwner = interiorService({}, { priceBasisByCategory: structuredClone(costBasis) });
  const costPaint = captureReview(() => calculateServiceVNext(
    'INTERIOR_PAINTING',
    interiorInputs(),
    costPaintOwner.pricing,
    { ownerPricing: costPaintOwner }
  ));
  assert.deepEqual(costPaint.ownerDecisionRequired.map(item => item.kind), ['purchasable_paint_contract']);

  const sellPaint = calculateServiceVNext(
    'INTERIOR_PAINTING',
    interiorInputs(),
    interiorOwner.pricing,
    { ownerPricing: interiorOwner }
  );
  assert.equal(lineAmount(sellPaint, 'Wall paint and materials'), 5000);

  const flatRepair = repairFixture('FLAT_ROOF_REPAIR');
  const undisclosedAddon = captureReview(() => calculateServiceVNext(
    'FLAT_ROOF_REPAIR',
    { ...flatRepair.inputs, pondingWater: true },
    flatRepair.ownerPricing.pricing
  ));
  assert.deepEqual(undisclosedAddon.invalidOwnerFields, ['addonDisclosureContext']);

  const mowingPricing = service('LANDSCAPING_MOWING', {
    mowingBaseRatePerSqft: 10,
    minimumServiceCharge: 0,
    frequencyMultipliers: { weekly: 1, biweekly: 1.1, monthly: 1.2, one_time: 1.4 },
    overgrowthMultipliers: { maintained: 1, overgrown: 1.5, severe: 2 },
    edgingPerLinearFoot: 50
  }).pricing;
  const undisclosedMowingAddon = captureReview(() => calculateServiceVNext('LANDSCAPING_MOWING', {
    yardSqft: 1000,
    sqftMethod: 'exact',
    serviceFrequency: 'weekly',
    grassCondition: 'maintained',
    bagClippings: true,
    edgingIncluded: false
  }, mowingPricing));
  assert.deepEqual(undisclosedMowingAddon.invalidOwnerFields, ['addonDisclosureContext']);

  const gatelessFence = captureReview(() => calculateServiceVNext('FENCING_INSTALL', fenceInputs(), fenceService().pricing));
  assert.deepEqual(gatelessFence.ownerDecisionRequired.map(item => item.kind), [
    'post_geometry_contract',
    'mixed_charge_allocation'
  ]);
  const gatedFence = captureReview(() => calculateServiceVNext(
    'FENCING_INSTALL',
    fenceInputs({ gateCount: 1, gateWidthTotalLF: 4 }),
    fenceService().pricing
  ));
  assert.deepEqual(gatedFence.ownerDecisionRequired.map(item => item.kind), [
    'post_geometry_contract',
    'mixed_charge_allocation',
    'gate_width_pricing_contract'
  ]);

  const exposed = captureReview(() => calculateServiceVNext(
    'CONCRETE_DRIVEWAY',
    concreteInputs({ finishType: 'exposed_aggregate' }),
    concreteService().pricing
  ));
  assert.equal(exposed.ownerDecisionRequired[0].kind, 'finish_material_pricing_contract');

  const trim = captureReview(() => calculateServiceVNext('SIDING_REPLACEMENT', {
    areaInputMethod: 'sqft',
    sidingAreaSqft: 1000,
    sidingType: 'vinyl',
    stories: 1,
    oldSidingRemoval: false,
    trimIncluded: true,
    trimLengthLF: 100
  }, service('SIDING_REPLACEMENT', {
    laborPerSqft: { vinyl: 400 },
    materialPerSqft: { vinyl: 700 },
    minimumJob: 0,
    trimPerLinearFoot: 500
  }).pricing));
  assert.equal(trim.ownerDecisionRequired[0].kind, 'mixed_charge_classification');

  const costUnderlayment = flooringService({ underlaymentPriceBasis: 'cost' });
  const underlayment = captureReview(() => calculateServiceVNext(
    'FLOORING_INSTALL',
    flooringInputs(),
    costUnderlayment.pricing
  ));
  assert.deepEqual(underlayment.ownerDecisionRequired.map(item => item.kind), ['purchasable_underlayment_contract']);

  const hardwoodOwner = flooringService({
    laborPerSqft: { hardwood: 500 },
    materialPerSqft: { hardwood: 900 }
  });
  const hardwoodUnderlayment = captureReview(() => calculateServiceVNext(
    'FLOORING_INSTALL',
    flooringInputs({ newFlooringType: 'hardwood' }),
    hardwoodOwner.pricing,
    { ownerPricing: hardwoodOwner }
  ));
  assert.deepEqual(hardwoodUnderlayment.ownerDecisionRequired.map(item => item.kind), ['product_specific_underlayment_contract']);

  const thresholdOwner = flooringService({ roomSizeThresholds: { smallMaxSqft: 150, mediumMaxSqft: 300 } });
  const threshold = captureReview(() => calculateServiceVNext(
    'FLOORING_INSTALL',
    flooringInputs({ sqft: 300, roomCount: 2 }),
    thresholdOwner.pricing,
    { ownerPricing: thresholdOwner }
  ));
  assert.deepEqual(threshold.ownerDecisionRequired.map(item => item.kind), ['inclusive_boundary_contract']);

  const itemizedRoofOwner = roofService({
    accessoryPricingMode: 'itemized',
    starterPerLF: 0,
    dripEdgePerLF: 0,
    ridgeCapPerLF: 0
  });
  const itemizedMeasurements = captureReview(() => calculateServiceVNext(
    'ROOFING_REPLACEMENT',
    roofInputs(),
    itemizedRoofOwner.pricing,
    { ownerPricing: itemizedRoofOwner }
  ));
  assert.deepEqual(itemizedMeasurements.missingCustomerFields.sort(), ['dripEdgeLengthLF', 'ridgeCapLengthLF', 'starterLengthLF']);

  const invalidCustomUnit = captureReview(() => calculateServiceVNext('CUSTOM', {
    service: 'Direct custom',
    serviceConfirmed: true,
    unit: 'invalid'
  }, {
    customPricingMode: 'fixed',
    price: 10000,
    unit: 'invalid',
    minimumJob: 0
  }));
  assert.deepEqual(invalidCustomUnit.invalidCustomerFields, ['unit']);

  const inspectionCustom = captureReview(() => calculateServiceVNext('CUSTOM', {
    service: 'Direct custom',
    serviceConfirmed: true,
    unit: 'flat'
  }, {
    customPricingMode: 'inspection_first',
    unit: 'flat',
    minimumJob: 0
  }));
  assert.match(inspectionCustom.reviewReason, /inspection-first/);

  const compositeOverflow = captureReview(() => calculateServiceVNext(
    'CONCRETE_DRIVEWAY',
    concreteInputs(),
    concreteService({ laborPerSqft: Number.MAX_SAFE_INTEGER }).pricing
  ));
  assert.deepEqual(compositeOverflow.invalidOwnerFields, ['laborPerSqft', 'accessMultiplier.easy']);
});

test('repair 57: every selected common fee follows its exact owner or customer boolean without cross-fee leakage', () => {
  const feeAmounts = { travel: 137, disposal: 211, permit: 307, overhead: 419 };
  const feeDefaults = {
    ...defaults,
    travelFee: feeAmounts.travel,
    disposalFee: feeAmounts.disposal,
    permitFee: feeAmounts.permit,
    overheadFixed: feeAmounts.overhead
  };
  const inputs = { sodSqft: 100, sqftMethod: 'exact', groundPrepNeeded: false, slope: 'flat', accessDifficulty: 'easy' };

  for (const fee of Object.keys(feeAmounts)) {
    for (const mode of ['owner_selected', 'customer_selected']) {
      const ownerPricing = service('LANDSCAPING_SOD', {
        sodMaterialPerSqft: 100,
        sodInstallLaborPerSqft: 100,
        minimumServiceCharge: 0,
        groundPrepPerSqft: 0
      }, {
        feeRules: { ...feeRules, [fee]: mode }
      });
      for (const selected of [false, true]) {
        const feeSelections = mode === 'owner_selected'
          ? { owner: { [fee]: selected } }
          : { customer: { [fee]: selected } };
        const result = generateQuoteVNext({
          serviceType: 'LANDSCAPING_SOD',
          customerInputs: inputs,
          ownerPricing,
          businessDefaults: feeDefaults,
          feeSelections,
          callerType: 'owner',
          currentMonth: 1
        });
        const label = fee + ':' + mode + ':' + selected;
        assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', label + ': ' + JSON.stringify(result));
        const record = scenario(result);
        const feeRecord = record.fees.find(item => item.fee === fee);
        assert.deepEqual(
          { mode: feeRecord.mode, applied: feeRecord.applied, amountCents: feeRecord.amountCents },
          { mode, applied: selected, amountCents: selected ? feeAmounts[fee] : 0 },
          label
        );
        const feeLines = record.lineItems.filter(item => item.category === fee);
        assert.equal(feeLines.length, selected ? 1 : 0, label);
        if (selected) assert.equal(feeLines[0].amountCents, feeAmounts[fee], label);

        if (mode === 'customer_selected' && selected) {
          const customer = generateQuoteVNext({
            serviceType: 'LANDSCAPING_SOD',
            customerInputs: inputs,
            ownerPricing,
            businessDefaults: feeDefaults,
            feeSelections,
            callerType: 'customer',
            currentMonth: 1
          });
          assert.equal(customer.resultType, 'INSTANT_ESTIMATE_READY', label);
          assert.deepEqual(
            [customer.lowEstimate, customer.midEstimate, customer.highEstimate],
            [result.lowEstimate, result.midEstimate, result.highEstimate],
            label
          );
          assert.equal(Object.hasOwn(customer, 'lineItems'), false, label);
        }
      }

      const missingSelection = generateQuoteVNext({
        serviceType: 'LANDSCAPING_SOD',
        customerInputs: inputs,
        ownerPricing,
        businessDefaults: feeDefaults,
        callerType: 'owner',
        currentMonth: 1
      });
      assert.equal(missingSelection.resultType, 'ESTIMATE_REQUIRES_REVIEW', fee + ':' + mode);
      const collection = mode === 'owner_selected' ? missingSelection.invalidOwnerFields : missingSelection.invalidCustomerFields;
      assert.equal(collection.includes('feeSelections.' + (mode === 'owner_selected' ? 'owner' : 'customer') + '.' + fee), true);
    }
  }
});

test('repair 58: cross-field and shaped-structure validators reject every adversarial relationship at its exact path', () => {
  const roofPricing = roofService().pricing;
  for (const inputs of [
    roofInputs({ serviceScope: 'partial', partialPercent: 50, partialAreaSqft: 600 }),
    roofInputs({ serviceScope: 'partial', partialAreaSqft: 1200 })
  ]) {
    const validation = validateCustomerInputs('ROOFING_REPLACEMENT', inputs, roofPricing);
    assert.equal(validation.ok, false);
    assert.equal(validation.invalidCustomerFields.includes('partialAreaSqft'), true);
  }

  const floorPricing = flooringService().pricing;
  for (const [inputs, field] of [
    [flooringInputs({ removalNeeded: true, existingFloorType: 'none' }), 'existingFloorType'],
    [flooringInputs({ underlaymentSelected: true }), 'underlaymentSelected'],
    [flooringInputs({ subfloorCondition: 'good' }), 'subfloorCondition']
  ]) {
    const validation = validateCustomerInputs('FLOORING_INSTALL', inputs, floorPricing);
    assert.equal(validation.ok, false, field);
    assert.equal(validation.invalidCustomerFields.includes(field), true, field);
  }

  const replacementPricing = service('FLOORING_REPLACEMENT', {
    ...floorPricing,
    subfloorAllowancePerSqft: 100
  }).pricing;
  const replacementBase = {
    ...flooringInputs(),
    subfloorIssues: true,
    subfloorRepairAreaSqft: 301
  };
  const oversizedSubfloor = validateCustomerInputs('FLOORING_REPLACEMENT', replacementBase, replacementPricing);
  assert.equal(oversizedSubfloor.invalidCustomerFields.includes('subfloorRepairAreaSqft'), true);
  const contradictorySubfloor = validateCustomerInputs(
    'FLOORING_REPLACEMENT',
    { ...replacementBase, subfloorIssues: false, subfloorRepairAreaSqft: 10 },
    replacementPricing
  );
  assert.equal(contradictorySubfloor.invalidCustomerFields.includes('subfloorRepairAreaSqft'), true);

  for (const gateWidthTotalLF of [0, 100]) {
    const validation = validateCustomerInputs(
      'FENCING_INSTALL',
      fenceInputs({ gateCount: 1, gateWidthTotalLF }),
      fenceService().pricing
    );
    assert.equal(validation.ok, false, String(gateWidthTotalLF));
    assert.equal(validation.invalidCustomerFields.includes('gateWidthTotalLF'), true, String(gateWidthTotalLF));
  }

  const plantingBase = { bedCondition: 'clean', mulchNeeded: false };
  for (const plantsBySize of [
    null,
    { small: 1, medium: 1, large: 1, extra: 1 },
    { small: -1, medium: 1, large: 1 },
    { small: 0, medium: 0, large: 0 }
  ]) {
    const validation = validateCustomerInputs('LANDSCAPING_PLANTING', { ...plantingBase, plantsBySize }, {});
    assert.equal(validation.ok, false, JSON.stringify(plantsBySize));
    assert.equal(
      [...validation.missingCustomerFields, ...validation.invalidCustomerFields].includes('plantsBySize'),
      true,
      JSON.stringify(plantsBySize)
    );
  }

  const invalidPricingContext = validateCustomerInputs('FLOORING_INSTALL', flooringInputs(), null);
  assert.equal(invalidPricingContext.ok, false);
  assert.deepEqual(invalidPricingContext.invalidOwnerFields, ['pricing']);

  assert.deepEqual(validateClass2FactorsDetailed('NOT_A_SERVICE', {}).map(item => item.path), ['serviceType']);
  const scalarClass2 = validateClass2FactorsDetailed('INTERIOR_PAINTING', {
    ...interiorService().pricing,
    wallHeightLaborMultiplier: 1
  });
  assert.equal(scalarClass2.some(item => item.path === 'wallHeightLaborMultiplier'), true);

  assert.deepEqual(validatePricingStructuresDetailed('NOT_A_SERVICE', {}).map(item => item.path), ['serviceType']);
  const emptyMap = validatePricingStructuresDetailed('ROOFING_REPLACEMENT', { laborPerSquare: {} });
  assert.equal(emptyMap.some(item => item.path === 'laborPerSquare'), true);
  const malformedCube = validatePricingStructuresDetailed('ROOFING_REPAIR', {
    repairHours: { asphalt_shingle: { patch: null } },
    repairMaterialAllowance: { asphalt_shingle: { patch: { small: 100, medium: 200, large: 300 } } }
  });
  assert.equal(malformedCube.some(item => item.path === 'repairHours.asphalt_shingle.patch'), true);
  const unsupportedSiding = validatePricingStructuresDetailed('SIDING_REPAIR', {
    repairHours: { stucco: { patch: { small: 1, medium: 2, large: 3 } } },
    materialAllowance: { stucco: { patch: { small: 100, medium: 200, large: 300 } } }
  });
  assert.equal(unsupportedSiding.some(item => item.path === 'repairHours.stucco' && item.type === 'unsupported'), true);

  const equalRange = validateOwnerPricing('CUSTOM', {
    service: 'Equal range',
    serviceConfirmed: true,
    unit: 'flat'
  }, {
    customPricingMode: 'range',
    low: 10000,
    high: 10000,
    unit: 'flat',
    minimumJob: 0
  });
  assert.equal(equalRange.crossFieldOwnerFields.includes('high'), true);
  assert.equal(equalRange.ownerDiagnostics.some(item => item.kind === 'range_order' && item.path === 'high'), true);

  const detailedRules = validateServiceRulesDetailed(null, 'INTERIOR_PAINTING');
  assert.deepEqual(detailedRules.map(item => item.path), ['ownerPricing']);
  assert.equal(validateServiceRules(null, 'INTERIOR_PAINTING').length, 1);
});

test('repair 59: public wrappers, materializers, and deep merges have explicit boundary behavior', () => {
  const missing = generateQuoteVNext();
  assert.equal(missing.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(Object.keys(missing).sort(), ['customerMessage', 'quoteId', 'resultType']);
  assert.equal(liveQuoteVNext().resultType, 'ESTIMATE_REQUIRES_REVIEW');

  const inactive = interiorService();
  inactive.active = false;
  const preview = previewQuoteVNext({
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    ownerPricing: inactive,
    businessDefaults: defaults,
    currentMonth: 1
  });
  assert.equal(preview.resultType, 'INSTANT_ESTIMATE_READY');
  const live = liveQuoteVNext({
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    ownerPricing: inactive,
    businessDefaults: defaults,
    currentMonth: 1
  });
  assert.equal(live.resultType, 'ESTIMATE_REQUIRES_REVIEW');

  const source = { serviceType: 'LANDSCAPING_SOD', pricing: { sodMaterialPerSqft: 100 } };
  const materialized = materializeVNextService(source);
  assert.equal(materialized.pricing.sodWasteFactor, CLASS2_DEFINITIONS.LANDSCAPING_SOD.sodWasteFactor.defaultValue);
  assert.equal(source.pricing.sodWasteFactor, undefined);
  assert.throws(() => materializeVNextService(null), /Service must be an object/);
  assert.throws(() => materializeVNextService({ serviceType: 'NOT_A_SERVICE', pricing: {} }), /unsupported/);
  assert.throws(() => materializeVNextService({ serviceType: 'LANDSCAPING_SOD', pricing: [] }), /pricing must be an object/i);
  assert.throws(() => withClass2Defaults('NOT_A_SERVICE', {}), /unsupported/);
  assert.throws(() => withClass2Defaults('LANDSCAPING_SOD', null), /Pricing must be an object/);

  const base = { map: { first: 1, second: 2 }, scalar: 3 };
  const override = { map: { second: 20 }, scalar: 30 };
  const merged = mergePricingVNext(base, override);
  assert.deepEqual(merged, { map: { first: 1, second: 20 }, scalar: 30 });
  assert.deepEqual(base, { map: { first: 1, second: 2 }, scalar: 3 });
  assert.throws(() => mergePricingVNext(null, {}), /must both be objects/);
  assert.throws(() => mergePricingVNext({}, null), /must both be objects/);

  assert.throws(() => materializeScenarioLinesVNext({}, 'mid'), /Scenario lines/);
  assert.throws(() => materializeScenarioLinesVNext([], 'invalid'), /Scenario lines/);
  assert.deepEqual(
    validateTierDefinitionsDetailedVNext({}, 'NOT_A_SERVICE').map(item => item.path),
    ['serviceType']
  );
});

test('repair 60: exported raw boundaries reject unresolved custom classification and malformed intrinsic range evidence', () => {
  const customInputs = { service: 'Boundary audit', serviceConfirmed: true, unit: 'per_hour', hours: 2 };
  const customPricing = { customPricingMode: 'range', low: 0, high: 12000, unit: 'per_hour', minimumJob: 0 };
  assert.throws(
    () => calculateServiceVNext('CUSTOM', customInputs, customPricing, {}),
    error => {
      assert.equal(error.name, 'QuoteReviewError');
      assert.deepEqual(error.ownerDecisionRequired.map(item => item.kind), ['custom_charge_classification']);
      assert.equal(Object.hasOwn(error, 'lineItems'), false);
      return true;
    }
  );
  assert.equal(readFileSync('server/quote-engine-vnext/templates.js', 'utf8').includes('function calculateCustom'), false);
  assert.equal(readFileSync('server/quote-engine-vnext/index.js', 'utf8').includes('calculateServiceVNext'), false);

  const valid = rangedEvidenceLine({ quantity: 2, lowRateCents: 0, highRateCents: 12000 });
  for (const variant of ['low', 'mid', 'high']) {
    const [item] = materializeScenarioLinesVNext([valid], variant);
    assert.equal(Number.isSafeInteger(item.amountCents), true, variant);
    assertLineReproducible(item);
  }

  const mutations = [
    line => { line.rangeAmountCents.high += 1; },
    line => { line.calculation.lowRateCents = -1; },
    line => { line.calculation.quantity = 0; },
    line => { line.calculation.multipliers = [{ value: Infinity }]; },
    line => { line.calculation.rateCents = line.calculation.highRateCents + 1; },
    line => { line.rangeAmountCents = null; }
  ];
  for (const mutate of mutations) {
    const malformed = structuredClone(valid);
    mutate(malformed);
    assert.throws(
      () => materializeScenarioLinesVNext([malformed], 'mid'),
      error => error.name === 'QuoteReviewError' && error.invalidOwnerFields.length > 0
    );
  }
});

test('repair 61: price-book LIVE status executes fees, markup, add-ons, and final-total integrity through the real pipeline', () => {
  const ordinaryOwner = interiorService();
  assert.equal(vNextServiceStatus(ordinaryOwner, defaults).status, 'QUOTING LIVE');
  assert.equal(vNextPricebookStatuses({ defaults, services: [ordinaryOwner] })[0].status, 'QUOTING LIVE');

  const overheadOwner = interiorService({}, {
    feeRules: { ...feeRules, overhead: 'always' }
  });
  const overheadDefaults = { ...defaults, overheadFixed: Number.MAX_SAFE_INTEGER };
  assert.equal(vNextServiceStatus(overheadOwner, defaults).status, 'QUOTING LIVE');
  const overheadStatus = vNextPricebookStatuses({ defaults: overheadDefaults, services: [overheadOwner] })[0];
  assert.equal(overheadStatus.status, 'NEEDS PRICING');
  assert.equal(overheadStatus.invalidOwnerFields.includes('pricingCalculation'), true, JSON.stringify(overheadStatus));
  const overheadQuote = quoteFromVNextPricebook({
    pricebook: { defaults: overheadDefaults, services: [overheadOwner] },
    serviceType: 'INTERIOR_PAINTING',
    callerType: 'owner',
    customerInputs: interiorInputs(),
    currentMonth: 1
  });
  assert.equal(overheadQuote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(overheadQuote.invalidOwnerFields.includes('pricingCalculation'), true);

  const markupOwner = interiorService({
    laborPerWallSqftPerCoat: 1_000_000_000,
    materialPerWallSqftPerCoat: 0
  });
  assert.equal(vNextServiceStatus(markupOwner, defaults).status, 'QUOTING LIVE');
  const markupStatus = vNextPricebookStatuses({
    defaults: { ...defaults, markupPercent: 1000 },
    services: [markupOwner]
  })[0];
  assert.equal(markupStatus.status, 'NEEDS PRICING');
  assert.equal(markupStatus.invalidOwnerFields.includes('markupPercent'), true, JSON.stringify(markupStatus));

  const flatRepair = repairFixture('FLAT_ROOF_REPAIR').ownerPricing;
  flatRepair.pricing.pondingWaterSurcharge = Number.MAX_SAFE_INTEGER;
  const flatStatus = vNextServiceStatus(flatRepair, defaults);
  assert.equal(flatStatus.status, 'NEEDS PRICING');
  assert.equal(flatStatus.invalidOwnerFields.includes('pricingCalculation'), true, JSON.stringify(flatStatus));

  const mowing = service('LANDSCAPING_MOWING', {
    mowingBaseRatePerSqft: 10,
    minimumServiceCharge: 0,
    frequencyMultipliers: { weekly: 1, biweekly: 1.1, monthly: 1.2, one_time: 1.4 },
    overgrowthMultipliers: { maintained: 1, overgrown: 1.5, severe: 2 }
  });
  const mowingStatus = vNextServiceStatus(mowing, defaults);
  assert.equal(mowingStatus.status, 'QUOTING LIVE', JSON.stringify(mowingStatus));
});

test('repair 62: inherited properties and prototype-shaped tier overrides cannot supply hidden quote rates or approvals', () => {
  const poisonedLabor = {};
  const poisonedMaterial = {};
  Object.defineProperty(poisonedLabor, '__proto__', { value: { tile: 777 }, enumerable: true });
  Object.defineProperty(poisonedMaterial, '__proto__', { value: { tile: 999 }, enumerable: true });

  const merged = mergePricingVNext(
    { laborPerSqft: { vinyl_plank: 300 }, materialPerSqft: { vinyl_plank: 500 } },
    { laborPerSqft: poisonedLabor, materialPerSqft: poisonedMaterial }
  );
  assert.equal(Object.getPrototypeOf(merged.laborPerSqft), Object.prototype);
  assert.equal(Object.hasOwn(merged.laborPerSqft, '__proto__'), true);
  assert.equal(Object.hasOwn(merged.laborPerSqft, 'tile'), false);
  assert.equal(merged.laborPerSqft.tile, undefined);

  const poisonedOwner = flooringService({}, {
    tiers: [{ name: 'Poisoned', overrides: { laborPerSqft: poisonedLabor, materialPerSqft: poisonedMaterial } }]
  });
  const poisonedStatus = vNextPricebookStatuses({ defaults, services: [poisonedOwner] })[0];
  assert.equal(poisonedStatus.status, 'NEEDS PRICING');
  assert.equal(poisonedStatus.failedTierDiagnostics[0].unsupportedOwnerFields.includes('laborPerSqft.__proto__'), true, JSON.stringify(poisonedStatus));
  assert.equal(poisonedStatus.failedTierDiagnostics[0].unsupportedOwnerFields.includes('materialPerSqft.__proto__'), true, JSON.stringify(poisonedStatus));

  const poisonedQuote = quoteFromVNextPricebook({
    pricebook: { defaults, services: [poisonedOwner] },
    serviceType: 'FLOORING_INSTALL',
    callerType: 'owner',
    customerInputs: flooringInputs({ newFlooringType: 'tile' }),
    currentMonth: 1
  });
  assert.equal(poisonedQuote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(poisonedQuote.unsupportedOwnerFields.includes('laborPerSqft.__proto__'), true, JSON.stringify(poisonedQuote));
  assert.equal(poisonedQuote.missingOwnerFields.includes('laborPerSqft.tile'), true, JSON.stringify(poisonedQuote));

  const cleanOwner = flooringService({}, {
    tiers: [{ name: 'Clean', overrides: { laborPerSqft: { tile: 777 }, materialPerSqft: { tile: 999 } } }]
  });
  const cleanStatus = vNextPricebookStatuses({ defaults, services: [cleanOwner] })[0];
  assert.equal(cleanStatus.status, 'QUOTING LIVE', JSON.stringify(cleanStatus));
  const cleanQuote = quoteFromVNextPricebook({
    pricebook: { defaults, services: [cleanOwner] },
    serviceType: 'FLOORING_INSTALL',
    callerType: 'owner',
    customerInputs: flooringInputs({ newFlooringType: 'tile' }),
    currentMonth: 1
  });
  assert.equal(cleanQuote.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(cleanQuote));
  assert.equal(lineAmount(cleanQuote, 'Flooring labor'), 233100);
  assert.equal(lineAmount(cleanQuote, 'Flooring materials'), 335664);

  const inheritedDefaults = Object.create(defaults);
  const hiddenDefaults = generateQuoteVNext({
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    ownerPricing: interiorService(),
    callerType: 'owner',
    businessDefaults: inheritedDefaults,
    currentMonth: 1
  });
  assert.equal(hiddenDefaults.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(hiddenDefaults.invalidOwnerFields, ['businessDefaults']);

  const selectedFeeOwner = interiorService({}, { feeRules: { ...feeRules, travel: 'owner_selected' } });
  const inheritedFeeSelection = generateQuoteVNext({
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    ownerPricing: selectedFeeOwner,
    businessDefaults: { ...defaults, travelFee: 500 },
    callerType: 'owner',
    feeSelections: { owner: Object.create({ travel: true }) },
    currentMonth: 1
  });
  assert.equal(inheritedFeeSelection.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(inheritedFeeSelection.invalidOwnerFields, ['feeSelections.owner']);

  const aiOwner = interiorService({}, { source: 'AI_SUGGESTED' });
  aiOwner.confirmedFields = Object.create(Object.fromEntries(Object.keys(aiOwner.pricing).map(field => [field, true])));
  const inheritedConfirmation = run('INTERIOR_PAINTING', interiorInputs(), aiOwner);
  assert.equal(inheritedConfirmation.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(inheritedConfirmation.invalidOwnerFields, ['confirmedFields']);
});

test('repair 63: zero-charge evidence distinguishes configured free prices from positive amounts rounded below one cent', () => {
  const feeOwner = interiorService({}, { feeRules: { ...feeRules, travel: 'owner_selected' } });
  const selectedFreeFee = run('INTERIOR_PAINTING', interiorInputs(), feeOwner, {
    businessDefaults: { ...defaults, travelFee: 0 },
    feeSelections: { owner: { travel: true } }
  });
  assert.equal(selectedFreeFee.resultType, 'INSTANT_ESTIMATE_READY');
  const freeTravel = line(selectedFreeFee, 'Travel');
  assert.deepEqual(
    { amountCents: freeTravel.amountCents, noCharge: freeTravel.noCharge, noChargeReason: freeTravel.noChargeReason },
    { amountCents: 0, noCharge: true, noChargeReason: 'configured_zero_price' }
  );
  const freeTravelRecord = scenario(selectedFreeFee).fees.find(item => item.fee === 'travel');
  assert.deepEqual(
    { applied: freeTravelRecord.applied, charged: freeTravelRecord.charged, noCharge: freeTravelRecord.noCharge, amountCents: freeTravelRecord.amountCents },
    { applied: true, charged: false, noCharge: true, amountCents: 0 }
  );

  const unselectedFreeFee = run('INTERIOR_PAINTING', interiorInputs(), feeOwner, {
    businessDefaults: { ...defaults, travelFee: 0 },
    feeSelections: { owner: { travel: false } }
  });
  assert.equal(line(unselectedFreeFee, 'Travel'), undefined);
  const unselectedTravelRecord = scenario(unselectedFreeFee).fees.find(item => item.fee === 'travel');
  assert.deepEqual(
    { applied: unselectedTravelRecord.applied, charged: unselectedTravelRecord.charged, noCharge: unselectedTravelRecord.noCharge },
    { applied: false, charged: false, noCharge: false }
  );

  const mulchInputs = {
    inputMethod: 'yards', mulchArea: 0.01, mulchType: 'brown',
    bedCondition: 'clean', edgingNeeded: false
  };
  const subCent = run('LANDSCAPING_MULCH', mulchInputs, service('LANDSCAPING_MULCH', {
    mulchMaterialPerYard: { brown: 1 },
    mulchInstallLaborPerYard: 1,
    minimumServiceCharge: 0
  }));
  assert.equal(subCent.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(subCent.invalidOwnerFields.includes('mulchMaterialPerYard.brown'), true, JSON.stringify(subCent));
  assert.equal(subCent.invalidOwnerFields.includes('mulchInstallLaborPerYard'), true, JSON.stringify(subCent));

  const intentionallyFree = run('LANDSCAPING_MULCH', mulchInputs, service('LANDSCAPING_MULCH', {
    mulchMaterialPerYard: { brown: 0 },
    mulchInstallLaborPerYard: 0,
    minimumServiceCharge: 0
  }));
  assert.equal(intentionallyFree.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(intentionallyFree));
  assert.deepEqual([intentionallyFree.lowEstimate, intentionallyFree.midEstimate, intentionallyFree.highEstimate], [0, 0, 0]);
  assert.equal(intentionallyFree.lineItems.every(item => item.noChargeReason === 'configured_zero_price'), true);

  const ranged = rangedEvidenceLine({ quantity: 2, lowRateCents: 0, highRateCents: 100 });
  const [freeLow] = materializeScenarioLinesVNext([ranged], 'low');
  assert.deepEqual(
    { amountCents: freeLow.amountCents, noCharge: freeLow.noCharge, noChargeReason: freeLow.noChargeReason },
    { amountCents: 0, noCharge: true, noChargeReason: 'configured_zero_price' }
  );
});

test('repair 64: AI-sourced service rules cannot change a customer quote before explicit own-field confirmation', () => {
  const aiDraft = interiorService({}, {
    source: 'AI_SUGGESTED',
    feeRules: { ...feeRules, overhead: 'always' },
    peakMonths: [1],
    peakSurchargePercent: 50,
    disclaimer: 'AI-drafted customer disclaimer.',
    confirmedFields: {}
  });
  for (const fieldName of Object.keys(aiDraft.pricing)) aiDraft.confirmedFields[fieldName] = true;
  const before = structuredClone(aiDraft.confirmedFields);
  const aiPricebook = {
    defaults: { ...defaults, overheadFixed: 12345 },
    services: [aiDraft]
  };
  const requiredRuleConfirmations = [
    'feeRules',
    'priceBasisByCategory',
    'taxabilityByCategory',
    'peakMonths',
    'peakSurchargePercent',
    'disclaimer'
  ];

  const status = vNextPricebookStatuses(aiPricebook)[0];
  assert.equal(status.status, 'NEEDS PRICING');
  for (const fieldName of requiredRuleConfirmations) {
    assert.equal(
      status.missingOwnerFields.includes(`confirmedFields.${fieldName}`),
      true,
      `${fieldName}: ${JSON.stringify(status)}`
    );
  }

  const preview = previewFromVNextPricebook({
    pricebook: aiPricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    currentMonth: 1
  });
  assert.equal(preview.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(preview));
  assert.deepEqual([...preview.unconfirmedOwnerFields].sort(), requiredRuleConfirmations.sort());
  assert.equal(lineAmount(preview, 'Wall labor'), 10000);
  assert.equal(lineAmount(preview, 'Wall paint and materials'), 5000);
  assert.equal(lineAmount(preview, 'Overhead'), 12345);
  assert.equal(lineAmount(preview, 'Peak season adjustment'), 5000);
  assert.deepEqual([preview.lowEstimate, preview.midEstimate, preview.highEstimate], [290, 320, 350]);
  assert.deepEqual(aiDraft.confirmedFields, before);

  const blockedOwner = quoteFromVNextPricebook({
    pricebook: aiPricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(blockedOwner.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual([...blockedOwner.missingOwnerFields].sort(), requiredRuleConfirmations.sort());

  const blockedCustomer = quoteFromVNextPricebook({
    pricebook: aiPricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'customer',
    currentMonth: 1
  });
  assert.deepEqual(Object.keys(blockedCustomer).sort(), ['customerMessage', 'quoteId', 'resultType']);
  assert.deepEqual(aiDraft.confirmedFields, before);

  const confirmed = structuredClone(aiDraft);
  for (const fieldName of requiredRuleConfirmations) confirmed.confirmedFields[fieldName] = true;
  const confirmedPricebook = { ...aiPricebook, services: [confirmed] };
  const confirmedStatus = vNextPricebookStatuses(confirmedPricebook)[0];
  assert.equal(confirmedStatus.status, 'QUOTING LIVE', JSON.stringify(confirmedStatus));
  const confirmedQuote = quoteFromVNextPricebook({
    pricebook: confirmedPricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(confirmedQuote.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(confirmedQuote));
  assert.deepEqual(confirmedQuote.unconfirmedOwnerFields, []);
  assert.equal(lineAmount(confirmedQuote, 'Overhead'), 12345);
  assert.equal(lineAmount(confirmedQuote, 'Peak season adjustment'), 5000);

  const manualService = structuredClone(aiDraft);
  delete manualService.source;
  delete manualService.confirmedFields;
  const manualQuote = quoteFromVNextPricebook({
    pricebook: { ...aiPricebook, services: [manualService] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(manualQuote.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(manualQuote));
  assert.deepEqual(manualQuote.unconfirmedOwnerFields, []);
});

test('repair 65: LIVE activation executes worst-case configured branches across every variable-scope trade', () => {
  const assertBlockedAtStatusAndQuote = ({ serviceType, ownerPricing, customerInputs, expectedPaths }) => {
    const pricebook = { defaults, services: [ownerPricing] };
    const status = vNextPricebookStatuses(pricebook)[0];
    assert.equal(status.status, 'NEEDS PRICING', JSON.stringify(status));
    for (const path of expectedPaths) assert.equal(status.invalidOwnerFields.includes(path), true, `${path}: ${JSON.stringify(status)}`);

    const quote = quoteFromVNextPricebook({
      pricebook, serviceType, customerInputs, callerType: 'owner', currentMonth: 1
    });
    assert.equal(quote.resultType, 'ESTIMATE_REQUIRES_REVIEW', JSON.stringify(quote));
    for (const path of expectedPaths) assert.equal(quote.invalidOwnerFields.includes(path), true, `${path}: ${JSON.stringify(quote)}`);
  };

  const mowingOverflow = service('LANDSCAPING_MOWING', {
    mowingBaseRatePerSqft: 1,
    minimumServiceCharge: 0,
    frequencyMultipliers: { weekly: 1, biweekly: 1, monthly: 1, one_time: Number.MAX_VALUE },
    overgrowthMultipliers: { maintained: 1, overgrown: 1, severe: 1 }
  });
  assertBlockedAtStatusAndQuote({
    serviceType: 'LANDSCAPING_MOWING',
    ownerPricing: mowingOverflow,
    customerInputs: {
      yardSqft: 10_000_000, sqftMethod: 'exact',
      serviceFrequency: 'one_time', grassCondition: 'maintained',
      bagClippings: false, edgingIncluded: false
    },
    expectedPaths: ['mowingBaseRatePerSqft', 'frequencyMultipliers.one_time', 'overgrowthMultipliers.maintained']
  });

  const roofOverflow = roofService({ laborPerSquare: { asphalt_shingle: 1_000_000_000_000 } });
  roofOverflow.pricing.pitchMultiplier.very_steep = 5;
  roofOverflow.pricing.storyMultiplier[3] = 5;
  assertBlockedAtStatusAndQuote({
    serviceType: 'ROOFING_REPLACEMENT',
    ownerPricing: roofOverflow,
    customerInputs: roofInputs({
      roofSizeInput: 1_000_000, pitch: 'very_steep', stories: 3,
      existingLayers: 10, roofComplexity: 'complex'
    }),
    expectedPaths: ['laborPerSquare.asphalt_shingle', 'pitchMultiplier.very_steep', 'storyMultiplier.3']
  });

  const flooringOverflow = flooringService({ laborPerSqft: { vinyl_plank: 9_000_000_000 } });
  assertBlockedAtStatusAndQuote({
    serviceType: 'FLOORING_INSTALL',
    ownerPricing: flooringOverflow,
    customerInputs: flooringInputs({
      sqft: 1_000_000, roomCount: 4000,
      layoutPattern: 'diagonal_or_pattern', stairSteps: 10_000
    }),
    expectedPaths: ['laborPerSqft.vinyl_plank', 'roomComplexityMultiplier.medium']
  });

  const concreteOverflow = concreteService({
    laborPerSqft: 1_000_000_000,
    demolitionPerSqft: 0,
    basePrepPerSqft: 0,
    wireReinforcementPerSqft: 0,
    rebarReinforcementPerSqft: 0,
    stampedMaterialPerSqft: 0
  });
  assertBlockedAtStatusAndQuote({
    serviceType: 'CONCRETE_DRIVEWAY',
    ownerPricing: concreteOverflow,
    customerInputs: concreteInputs({
      length: 10_000, width: 1_000, thickness: 24,
      demolitionNeeded: true, demolitionAreaSqft: 10_000_000,
      accessDifficulty: 'difficult', baseNeeded: true
    }),
    expectedPaths: ['laborPerSqft', 'accessMultiplier.difficult']
  });

  const cleanupOverflow = service('LANDSCAPING_CLEANUP', {
    cleanupBaseRatePerSqft: 1,
    debrisPricing: {
      light: { laborMultiplier: 1, disposalFlat: 0 },
      moderate: { laborMultiplier: 1, disposalFlat: 0 },
      heavy: { laborMultiplier: Number.MAX_VALUE, disposalFlat: 0 }
    },
    minimumServiceCharge: 0,
    haulAwayFee: 0
  });
  assertBlockedAtStatusAndQuote({
    serviceType: 'LANDSCAPING_CLEANUP',
    ownerPricing: cleanupOverflow,
    customerInputs: { yardSqft: 10_000_000, sqftMethod: 'exact', debrisLevel: 'heavy', slope: 'steep', haulAway: true },
    expectedPaths: ['cleanupBaseRatePerSqft', 'debrisPricing.heavy.laborMultiplier', 'slopeMultiplier.steep']
  });

  const sidingOverflow = service('SIDING_REPLACEMENT', {
    laborPerSqft: { vinyl: 4_000_000_000 },
    materialPerSqft: { vinyl: 0 },
    minimumJob: 0,
    removalPerSqft: 0,
    disposalPerSqft: 0
  });
  assertBlockedAtStatusAndQuote({
    serviceType: 'SIDING_REPLACEMENT',
    ownerPricing: sidingOverflow,
    customerInputs: {
      areaInputMethod: 'sqft', sidingAreaSqft: 2_000_000, sidingType: 'vinyl',
      stories: 3, oldSidingRemoval: true, trimIncluded: false
    },
    expectedPaths: ['laborPerSqft.vinyl', 'storyMultiplier.3']
  });

  const ordinaryConcrete = concreteService({
    demolitionPerSqft: 0,
    basePrepPerSqft: 0,
    wireReinforcementPerSqft: 0,
    rebarReinforcementPerSqft: 0,
    stampedMaterialPerSqft: 0
  });
  const ordinaryCleanup = service('LANDSCAPING_CLEANUP', {
    cleanupBaseRatePerSqft: 10,
    debrisPricing: {
      light: { laborMultiplier: 1, disposalFlat: 0 },
      moderate: { laborMultiplier: 1.5, disposalFlat: 1000 },
      heavy: { laborMultiplier: 2, disposalFlat: 2000 }
    },
    minimumServiceCharge: 0,
    haulAwayFee: 0
  });
  const ordinaryMowing = service('LANDSCAPING_MOWING', {
    mowingBaseRatePerSqft: 10,
    minimumServiceCharge: 0,
    frequencyMultipliers: { weekly: 1, biweekly: 1.1, monthly: 1.2, one_time: 1.4 },
    overgrowthMultipliers: { maintained: 1, overgrown: 1.5, severe: 2 }
  });
  const ordinarySiding = service('SIDING_REPLACEMENT', {
    laborPerSqft: { vinyl: 400 },
    materialPerSqft: { vinyl: 700 },
    minimumJob: 0,
    removalPerSqft: 0,
    disposalPerSqft: 0
  });
  for (const ownerPricing of [roofService(), flooringService(), ordinaryConcrete, ordinaryCleanup, ordinaryMowing, ordinarySiding]) {
    const status = vNextPricebookStatuses({ defaults, services: [ownerPricing] })[0];
    assert.equal(status.status, 'QUOTING LIVE', `${ownerPricing.serviceType}: ${JSON.stringify(status)}`);
  }
});

test('repair 66: customer and lead boundaries reject malformed, inherited, or aliased records', () => {
  const ownerResult = run('INTERIOR_PAINTING', interiorInputs(), interiorService());
  assert.equal(ownerResult.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(ownerResult));

  const malformedOptions = sanitizeForCustomerVNext({ ...ownerResult, options: {} });
  assert.deepEqual(malformedOptions, {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.',
    quoteId: ownerResult.quoteId
  });

  const inheritedReady = Object.create({
    ...ownerResult,
    priceDrivers: ['Inherited secret owner rate']
  });
  assert.deepEqual(sanitizeForCustomerVNext(inheritedReady), {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.'
  });

  const throwingOptions = { ...ownerResult };
  Object.defineProperty(throwingOptions, 'options', {
    enumerable: true,
    get() { throw new Error('do not evaluate malformed customer data'); }
  });
  assert.deepEqual(sanitizeForCustomerVNext(throwingOptions), {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.',
    quoteId: ownerResult.quoteId
  });

  const ownerEvidenceBefore = structuredClone({
    priceDrivers: ownerResult.priceDrivers,
    options: ownerResult.options
  });
  const customerResult = sanitizeForCustomerVNext(ownerResult);
  customerResult.priceDrivers[0] = 'Tampered top-level driver';
  customerResult.options[0].priceDrivers[0] = 'Tampered option driver';
  customerResult.options[0].skippedAddons.push('Tampered exclusion');
  assert.deepEqual(ownerResult.priceDrivers, ownerEvidenceBefore.priceDrivers);
  assert.deepEqual(ownerResult.options, ownerEvidenceBefore.options);

  const internalReview = run(
    'INTERIOR_PAINTING',
    { ...interiorInputs(), wallAreaSqft: undefined },
    interiorService()
  );
  assert.equal(internalReview.resultType, 'ESTIMATE_REQUIRES_REVIEW', JSON.stringify(internalReview));
  const request = { customerInputs: interiorInputs(), contact: { name: 'Local test owner' } };
  const lead = buildInternalLeadVNext({ request, internalResult: internalReview });
  assert.deepEqual(lead.originalRequest, request);
  lead.originalRequest.contact.name = 'Mutated lead';
  assert.equal(request.contact.name, 'Local test owner');

  assert.throws(
    () => buildInternalLeadVNext({ request, internalResult: Object.create(internalReview) }),
    /unsanitized internal review result/
  );
  const inheritedQuoteId = { ...internalReview };
  delete inheritedQuoteId.quoteId;
  Object.setPrototypeOf(inheritedQuoteId, { quoteId: internalReview.quoteId });
  assert.throws(
    () => buildInternalLeadVNext({ request, internalResult: inheritedQuoteId }),
    /unsanitized internal review result/
  );
  assert.throws(
    () => buildInternalLeadVNext({ request: [], internalResult: internalReview }),
    /unsanitized internal review result/
  );
  assert.throws(
    () => buildInternalLeadVNext({ request: { callback: () => {} }, internalResult: internalReview }),
    /safely cloneable/
  );
});

test('repair 67: public registries and malformed request boundaries cannot poison or crash the engine', () => {
  const metadata = getVNextPriceBookMetadata();
  const pitchCopy = metadata
    .find(item => item.serviceType === 'ROOFING_REPLACEMENT')
    .customerFields.find(item => item.name === 'pitch');
  pitchCopy.values.push('poisoned_pitch');
  assert.equal(MEASUREMENT_CONTRACTS.ROOFING_REPLACEMENT.fields.pitch.values.includes('poisoned_pitch'), false);
  assert.equal(
    getVNextPriceBookMetadata()
      .find(item => item.serviceType === 'ROOFING_REPLACEMENT')
      .customerFields.find(item => item.name === 'pitch').values.includes('poisoned_pitch'),
    false
  );
  assert.throws(
    () => { CLASS2_DEFINITIONS.ROOFING_REPLACEMENT.wasteFactorByComplexity.defaultValue.simple = 0.49; },
    TypeError
  );
  assert.equal(withClass2Defaults('ROOFING_REPLACEMENT', {}).wasteFactorByComplexity.simple, 0.10);

  for (const [name, invoke] of [
    ['generateQuoteVNext', () => generateQuoteVNext(null)],
    ['liveQuoteVNext', () => liveQuoteVNext(null)],
    ['previewQuoteVNext', () => previewQuoteVNext(null)],
    ['quoteFromVNextPricebook', () => quoteFromVNextPricebook(null)],
    ['previewFromVNextPricebook', () => previewFromVNextPricebook(null)]
  ]) {
    let result;
    assert.doesNotThrow(() => { result = invoke(); }, name);
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW', name);
  }
  assert.throws(() => buildInternalLeadVNext(null), /unsanitized internal review result/);

  let malformedCustom;
  assert.doesNotThrow(() => {
    malformedCustom = quoteFromVNextPricebook({
      pricebook: { defaults, services: [] },
      serviceType: 'CUSTOM',
      customerInputs: { service: Object.create(null) }
    });
  });
  assert.equal(malformedCustom.resultType, 'ESTIMATE_REQUIRES_REVIEW');

  let sparse;
  assert.doesNotThrow(() => {
    sparse = validateVNextPricebook({
      defaults,
      services: new Array(1)
    });
  });
  assert.equal(sparse.ok, false);
  assert.equal(sparse.statuses.length, 1);
  assert.deepEqual(sparse.statuses[0].invalidOwnerFields, ['pricebook.services.0']);
});

test('repair 68: nested pricing is the one canonical service shape across status, preview, and live quotes', () => {
  const nested = interiorService();
  const customerInputs = interiorInputs();
  const nestedPricebook = { defaults, services: [nested] };
  assert.equal(vNextServiceStatus(nested, defaults).status, 'QUOTING LIVE');
  assert.equal(quoteFromVNextPricebook({
    pricebook: nestedPricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs,
    callerType: 'owner',
    currentMonth: 1
  }).resultType, 'INSTANT_ESTIMATE_READY');

  const flat = { ...nested, ...nested.pricing };
  delete flat.pricing;
  const flatStatus = vNextServiceStatus(flat, defaults);
  assert.equal(flatStatus.status, 'NEEDS PRICING');
  assert.equal(flatStatus.missingOwnerFields.includes('pricing'), true);
  assert.equal(flatStatus.unsupportedOwnerFields.includes('laborPerWallSqftPerCoat'), true);

  const direct = generateQuoteVNext({
    serviceType: 'INTERIOR_PAINTING',
    customerInputs,
    ownerPricing: flat,
    callerType: 'owner',
    businessDefaults: defaults,
    currentMonth: 1
  });
  assert.equal(direct.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(direct.missingOwnerFields.includes('pricing'), true);
  assert.equal(direct.unsupportedOwnerFields.includes('laborPerWallSqftPerCoat'), true);

  for (const invoke of [
    () => quoteFromVNextPricebook({
      pricebook: { defaults, services: [flat] },
      serviceType: 'INTERIOR_PAINTING', customerInputs, callerType: 'owner', currentMonth: 1
    }),
    () => previewFromVNextPricebook({
      pricebook: { defaults, services: [flat] },
      serviceType: 'INTERIOR_PAINTING', customerInputs, currentMonth: 1
    })
  ]) {
    const result = invoke();
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(result.missingOwnerFields.includes('pricing'), true);
  }
});

test('repair 69: unresolved dual partial measurements and flooring overlays fail closed without changing valid controls', () => {
  const roofOwner = roofService();
  const roofBoth = run('ROOFING_REPLACEMENT', roofInputs({
    serviceScope: 'partial',
    partialAreaSqft: 500,
    partialPercent: 50
  }), roofOwner);
  assert.equal(roofBoth.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(roofBoth.ownerDecisionRequired.map(item => item.kind), ['partial_measurement_reconciliation']);
  assert.equal(run('ROOFING_REPLACEMENT', roofInputs({
    serviceScope: 'partial', partialAreaSqft: 500
  }), roofOwner).resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(run('ROOFING_REPLACEMENT', roofInputs({
    serviceScope: 'partial', partialPercent: 50
  }), roofOwner).resultType, 'INSTANT_ESTIMATE_READY');

  const flatOwner = service('FLAT_ROOF_REPLACEMENT', {
    laborPerSqft: { epdm: 500, average: 550 },
    membraneCostPerSqft: { epdm: 700, average: 750 },
    tearOffPerSqft: { epdm: 200, average: 225 },
    minimumJob: 0
  });
  const flatBase = {
    roofSqft: 2000, sqftMethod: 'exact', membraneType: 'epdm',
    existingLayers: 2, accessDifficulty: 'easy', serviceScope: 'partial',
    buildingType: 'residential'
  };
  const flatBoth = run('FLAT_ROOF_REPLACEMENT', {
    ...flatBase, partialAreaSqft: 500, partialPercent: 25
  }, flatOwner);
  assert.equal(flatBoth.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(flatBoth.ownerDecisionRequired.map(item => item.kind), ['partial_measurement_reconciliation']);
  assert.equal(run('FLAT_ROOF_REPLACEMENT', {
    ...flatBase, partialAreaSqft: 500
  }, flatOwner).resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(run('FLAT_ROOF_REPLACEMENT', {
    ...flatBase, partialPercent: 25
  }, flatOwner).resultType, 'INSTANT_ESTIMATE_READY');

  const overlay = run('FLOORING_INSTALL', flooringInputs({
    existingFloorType: 'tile',
    removalNeeded: false
  }), flooringService());
  assert.equal(overlay.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(overlay.ownerDecisionRequired.map(item => item.kind), ['floor_overlay_contract']);
  assert.equal(run('FLOORING_INSTALL', flooringInputs({
    existingFloorType: 'none',
    removalNeeded: false
  }), flooringService()).resultType, 'INSTANT_ESTIMATE_READY');
});

test('repair 70: malformed business-default containers keep one exact root path across public APIs', () => {
  for (const malformedDefaults of [null, [], 'not-an-object']) {
    const pricebook = { defaults: malformedDefaults, services: [interiorService()] };
    const [status] = vNextPricebookStatuses(pricebook);
    assert.equal(status.status, 'NEEDS PRICING');
    assert.deepEqual(status.invalidOwnerFields, ['businessDefaults']);
    assert.equal(status.ownerDiagnostics.some(item => (
      item.kind === 'business_default'
      && item.path === 'businessDefaults'
      && item.message === 'Business defaults must be an object.'
    )), true, JSON.stringify(status));
    assert.equal(status.ownerDiagnostics.some(item => item.path.includes('businessDefaults.businessDefaults')), false);

    const validation = validateVNextPricebook(pricebook);
    assert.equal(validation.ok, false);
    assert.equal(validation.statuses[0].invalidOwnerFields.includes('businessDefaults'), true);
    assert.equal(validation.errors.some(message => message.includes('businessDefaults.businessDefaults')), false);

    const quote = quoteFromVNextPricebook({
      pricebook,
      serviceType: 'INTERIOR_PAINTING',
      customerInputs: interiorInputs(),
      callerType: 'owner',
      currentMonth: 1
    });
    assert.equal(quote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(quote.invalidOwnerFields, ['businessDefaults']);
  }
});

test('repair 71: accessor-backed public requests fail closed without leaking customer diagnostics', () => {
  const accessorRecord = field => {
    const value = {};
    Object.defineProperty(value, field, {
      enumerable: true,
      get() { throw new Error(`unexpected ${field} read`); }
    });
    return value;
  };

  let generated;
  assert.doesNotThrow(() => { generated = generateQuoteVNext(accessorRecord('serviceType')); });
  assert.equal(generated.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(Object.keys(generated).sort(), ['customerMessage', 'quoteId', 'resultType']);

  const customerRequest = { callerType: 'customer' };
  Object.defineProperty(customerRequest, 'ownerPricing', {
    enumerable: true,
    get() { throw new Error('owner pricing getter ran'); }
  });
  const customerResult = generateQuoteVNext(customerRequest);
  assert.deepEqual(Object.keys(customerResult).sort(), ['customerMessage', 'quoteId', 'resultType']);

  for (const invoke of [
    () => quoteFromVNextPricebook(accessorRecord('pricebook')),
    () => previewFromVNextPricebook(accessorRecord('pricebook'))
  ]) {
    let result;
    assert.doesNotThrow(() => { result = invoke(); });
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(Object.keys(result).sort(), ['customerMessage', 'quoteId', 'resultType']);
  }

  const customerLookup = { callerType: 'customer' };
  Object.defineProperty(customerLookup, 'pricebook', {
    enumerable: true,
    get() { throw new Error('price book getter ran'); }
  });
  assert.deepEqual(
    Object.keys(quoteFromVNextPricebook(customerLookup)).sort(),
    ['customerMessage', 'quoteId', 'resultType']
  );

  const status = vNextServiceStatus(accessorRecord('serviceType'));
  assert.equal(status.status, 'NEEDS PRICING');
  assert.deepEqual(status.invalidOwnerFields, ['service.serviceType']);

  const statuses = vNextPricebookStatuses(accessorRecord('defaults'));
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].status, 'NEEDS PRICING');
  assert.deepEqual(statuses[0].invalidOwnerFields, ['pricebook.defaults']);

  const validation = validateVNextPricebook(accessorRecord('services'));
  assert.equal(validation.ok, false);
  assert.match(validation.errors[0], /pricebook\.services/);
  assert.throws(() => materializeVNextService(accessorRecord('serviceType')), TypeError);

  const validatorCases = [
    {
      invoke: () => validateBusinessDefaults(accessorRecord('markupPercent')),
      path: 'businessDefaults.markupPercent', fields: result => result.invalidFields
    },
    {
      invoke: () => validateCustomerInputs('INTERIOR_PAINTING', accessorRecord('wallAreaSqft'), {}),
      path: 'wallAreaSqft', fields: result => result.invalidCustomerFields
    },
    {
      invoke: () => validateClass2FactorsDetailed('INTERIOR_PAINTING', accessorRecord('wallHeightLaborMultiplier')),
      path: 'wallHeightLaborMultiplier', fields: result => result.map(item => item.path)
    },
    {
      invoke: () => validatePricingStructuresDetailed('INTERIOR_PAINTING', accessorRecord('minimumJob')),
      path: 'minimumJob', fields: result => result.map(item => item.path)
    },
    {
      invoke: () => validateOwnerPricing('INTERIOR_PAINTING', {}, accessorRecord('minimumJob'), {}),
      path: 'minimumJob', fields: result => result.invalidOwnerFields
    },
    {
      invoke: () => validateServiceRulesDetailed(accessorRecord('pricing'), 'INTERIOR_PAINTING'),
      path: 'pricing', fields: result => result.map(item => item.path)
    }
  ];
  for (const entry of validatorCases) {
    let result;
    assert.doesNotThrow(() => { result = entry.invoke(); }, entry.path);
    assert.equal(entry.fields(result).includes(entry.path), true, `${entry.path}: ${JSON.stringify(result)}`);
  }
  assert.throws(() => withClass2Defaults('INTERIOR_PAINTING', accessorRecord('wallHeightLaborMultiplier')), TypeError);
});

test('repair 72: sparse tiers and seasonal arrays are rejected at exact paths', () => {
  const sparseTiers = new Array(1);
  const ownerPricing = interiorService({}, { tiers: sparseTiers });
  const tierDiagnostics = validateTierDefinitionsDetailedVNext(ownerPricing, 'INTERIOR_PAINTING');
  assert.equal(tierDiagnostics.some(item => item.path === 'tiers.0'), true, JSON.stringify(tierDiagnostics));

  const status = vNextServiceStatus(ownerPricing, defaults);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.equal(status.invalidOwnerFields.includes('tiers.0'), true, JSON.stringify(status));

  const direct = run('INTERIOR_PAINTING', interiorInputs(), ownerPricing);
  assert.equal(direct.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(direct.invalidOwnerFields.includes('tiers.0'), true, JSON.stringify(direct));

  const throughPricebook = quoteFromVNextPricebook({
    pricebook: { defaults, services: [ownerPricing] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(throughPricebook.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(throughPricebook.invalidOwnerFields.includes('tiers.0'), true, JSON.stringify(throughPricebook));

  const namedTiers = [];
  namedTiers.unexpected = { name: 'Hidden', overrides: {} };
  const namedTierDiagnostics = validateTierDefinitionsDetailedVNext(
    interiorService({}, { tiers: namedTiers }),
    'INTERIOR_PAINTING'
  );
  assert.equal(namedTierDiagnostics.some(item => item.path === 'tiers.unexpected'), true, JSON.stringify(namedTierDiagnostics));

  const sparseMonths = new Array(1);
  const serviceWithSparseMonths = interiorService({}, { peakMonths: sparseMonths });
  const seasonalStatus = vNextServiceStatus(serviceWithSparseMonths, defaults);
  assert.equal(seasonalStatus.status, 'NEEDS PRICING');
  assert.equal(seasonalStatus.invalidOwnerFields.includes('peakMonths.0'), true, JSON.stringify(seasonalStatus));

  const defaultValidation = validateBusinessDefaults({ ...defaults, peakMonths: sparseMonths });
  assert.equal(defaultValidation.ok, false);
  assert.equal(defaultValidation.invalidFields.includes('peakMonths.0'), true, JSON.stringify(defaultValidation));

  const [pricebookStatus] = vNextPricebookStatuses({
    defaults: { ...defaults, peakMonths: sparseMonths },
    services: [interiorService()]
  });
  assert.equal(pricebookStatus.status, 'NEEDS PRICING');
  assert.equal(pricebookStatus.invalidOwnerFields.includes('businessDefaults.peakMonths.0'), true, JSON.stringify(pricebookStatus));
});

test('repair 74: snapshot trust is non-observable and cannot be forged through an exported value', () => {
  const exportedSnapshot = withClass2Defaults('INTERIOR_PAINTING', {});
  const leakedSymbols = [];
  const collectSymbols = value => {
    if (!value || typeof value !== 'object') return;
    leakedSymbols.push(...Object.getOwnPropertySymbols(value));
    for (const child of Object.values(value)) collectSymbols(child);
  };
  collectSymbols(exportedSnapshot);
  assert.deepEqual(leakedSymbols, []);

  let mutatedSnapshotReads = 0;
  Object.defineProperty(exportedSnapshot, 'minimumJob', {
    enumerable: true,
    get() {
      mutatedSnapshotReads += 1;
      throw new Error('mutated trusted snapshot getter ran');
    }
  });
  let mutatedSnapshotResult;
  assert.doesNotThrow(() => {
    mutatedSnapshotResult = validateOwnerPricing('INTERIOR_PAINTING', {}, exportedSnapshot, {});
  });
  assert.equal(mutatedSnapshotReads, 0);
  assert.equal(mutatedSnapshotResult.invalidOwnerFields.includes('minimumJob'), true);

  let getterReads = 0;
  const forged = { callerType: 'owner' };
  Object.defineProperty(forged, 'serviceType', {
    enumerable: true,
    get() {
      getterReads += 1;
      throw new Error('forged snapshot getter ran');
    }
  });
  for (const symbol of leakedSymbols) {
    Object.defineProperty(forged, symbol, { value: true });
  }

  let result;
  assert.doesNotThrow(() => { result = generateQuoteVNext(forged); });
  assert.equal(getterReads, 0);
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(result.invalidCustomerFields, ['quoteRequest.serviceType']);
});

test('repair 75: every exported evidence helper rejects accessors, sparse arrays, and named array data', () => {
  const ready = run('INTERIOR_PAINTING', interiorInputs(), interiorService());
  assert.equal(ready.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(ready));

  let sanitizerGetterReads = 0;
  const accessorReady = { ...ready };
  Object.defineProperty(accessorReady, 'options', {
    enumerable: true,
    get() {
      sanitizerGetterReads += 1;
      throw new Error('customer sanitizer evaluated an accessor');
    }
  });
  assert.deepEqual(sanitizeForCustomerVNext(accessorReady), {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.',
    quoteId: ready.quoteId
  });
  assert.equal(sanitizerGetterReads, 0);

  const namedOptions = structuredClone(ready);
  namedOptions.options.internal = { tierName: 'Hidden' };
  assert.equal(sanitizeForCustomerVNext(namedOptions).resultType, 'ESTIMATE_REQUIRES_REVIEW');

  let mergeGetterReads = 0;
  const accessorBase = {};
  Object.defineProperty(accessorBase, 'laborPerSqft', {
    enumerable: true,
    get() {
      mergeGetterReads += 1;
      throw new Error('pricing merge evaluated an accessor');
    }
  });
  assert.throws(() => mergePricingVNext(accessorBase, {}), /could not be read safely/);
  assert.equal(mergeGetterReads, 0);

  const validLine = rangedEvidenceLine({ quantity: 2, lowRateCents: 100, highRateCents: 300 });
  const sparseLines = new Array(1);
  assert.throws(() => materializeScenarioLinesVNext(sparseLines, 'mid'), /scenario\.lines\.0/);
  const namedLines = [validLine];
  namedLines.hidden = validLine;
  assert.throws(() => materializeScenarioLinesVNext(namedLines, 'mid'), /scenario\.lines\.hidden/);

  let lineGetterReads = 0;
  const accessorLines = new Array(1);
  Object.defineProperty(accessorLines, 0, {
    enumerable: true,
    get() {
      lineGetterReads += 1;
      throw new Error('scenario materializer evaluated an accessor');
    }
  });
  assert.throws(() => materializeScenarioLinesVNext(accessorLines, 'mid'), /could not be read safely/);
  assert.equal(lineGetterReads, 0);

  const internalReview = run(
    'INTERIOR_PAINTING',
    { ...interiorInputs(), wallAreaSqft: undefined },
    interiorService()
  );
  assert.equal(internalReview.resultType, 'ESTIMATE_REQUIRES_REVIEW', JSON.stringify(internalReview));
  let leadGetterReads = 0;
  const accessorLeadInput = { request: {} };
  Object.defineProperty(accessorLeadInput, 'internalResult', {
    enumerable: true,
    get() {
      leadGetterReads += 1;
      throw new Error('lead builder evaluated an accessor');
    }
  });
  assert.throws(() => buildInternalLeadVNext(accessorLeadInput), /unsanitized internal review result/);
  assert.equal(leadGetterReads, 0);

  const namedUrgency = structuredClone(internalReview);
  namedUrgency.urgencyFlags.hidden = 'Hidden urgency';
  assert.throws(
    () => buildInternalLeadVNext({ request: {}, internalResult: namedUrgency }),
    /unsanitized internal review result/
  );
});

test('repair 76: price-book service arrays cannot hide sparse or named definitions', () => {
  const namedServices = [interiorService()];
  namedServices.shadow = interiorService();
  const namedPricebook = { defaults, services: namedServices };

  const namedStatuses = vNextPricebookStatuses(namedPricebook);
  assert.equal(namedStatuses.length, 1);
  assert.equal(namedStatuses[0].status, 'NEEDS PRICING');
  assert.equal(namedStatuses[0].invalidOwnerFields.includes('pricebook.services.shadow'), true, JSON.stringify(namedStatuses));

  const namedValidation = validateVNextPricebook(namedPricebook);
  assert.equal(namedValidation.ok, false);
  assert.equal(namedValidation.errors.some(message => message.includes('pricebook.services.shadow')), true, JSON.stringify(namedValidation));

  const namedOwnerQuote = quoteFromVNextPricebook({
    pricebook: namedPricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner'
  });
  assert.equal(namedOwnerQuote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(namedOwnerQuote.invalidOwnerFields, ['pricebook.services.shadow']);

  const namedCustomerQuote = quoteFromVNextPricebook({
    pricebook: namedPricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'customer'
  });
  assert.deepEqual(Object.keys(namedCustomerQuote).sort(), ['customerMessage', 'quoteId', 'resultType']);

  const sparseServices = new Array(2);
  sparseServices[1] = interiorService();
  const sparsePricebook = { defaults, services: sparseServices };
  const sparseStatuses = vNextPricebookStatuses(sparsePricebook);
  assert.equal(sparseStatuses[0].invalidOwnerFields.includes('pricebook.services.0'), true, JSON.stringify(sparseStatuses));
  const sparseQuote = previewFromVNextPricebook({
    pricebook: sparsePricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs()
  });
  assert.equal(sparseQuote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(sparseQuote.invalidOwnerFields, ['pricebook.services.0']);
});

test('repair 77: function and symbol values fail at their exact quote-data paths', () => {
  for (const [path, value] of [
    ['quoteRequest.extraFunction', () => 'not quote data'],
    ['quoteRequest.extraSymbol', Symbol('not quote data')]
  ]) {
    const key = path.split('.').at(-1);
    let result;
    assert.doesNotThrow(() => {
      result = generateQuoteVNext({
        serviceType: 'INTERIOR_PAINTING',
        customerInputs: interiorInputs(),
        ownerPricing: interiorService(),
        businessDefaults: defaults,
        callerType: 'owner',
        [key]: value
      });
    });
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(result.invalidCustomerFields, [path]);
  }
});

test('repair 78: landscaping fields explicitly sold as labor use labor financial treatment', () => {
  const mulchOwner = service('LANDSCAPING_MULCH', {
    mulchMaterialPerYard: { brown: 0 },
    mulchInstallLaborPerYard: 0,
    minimumServiceCharge: 0,
    bedPrepLaborPerSqft: { needs_weeding: 100, overgrown: 100 },
    edgingPerLinearFoot: 200
  }, {
    peakMonths: [1],
    peakSurchargePercent: 10
  });
  const mulch = run('LANDSCAPING_MULCH', {
    inputMethod: 'yards',
    mulchArea: 1,
    mulchType: 'brown',
    bedCondition: 'needs_weeding',
    bedSqft: 100,
    edgingNeeded: true,
    edgeLF: 10
  }, mulchOwner);
  assert.equal(mulch.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(mulch));
  assert.deepEqual(
    ['Bed preparation', 'Bed edging'].map(name => ({
      name,
      category: line(mulch, name).category,
      amountCents: line(mulch, name).amountCents
    })),
    [
      { name: 'Bed preparation', category: 'labor', amountCents: 10000 },
      { name: 'Bed edging', category: 'labor', amountCents: 2000 }
    ]
  );
  const mulchSeasonal = line(mulch, 'Peak season adjustment');
  assert.equal(mulchSeasonal.calculation.basisCategory, 'labor');
  assert.equal(mulchSeasonal.calculation.basisAmountCents, 12000);
  assert.equal(mulchSeasonal.amountCents, 1200);

  const planting = run('LANDSCAPING_PLANTING', {
    plantsBySize: { small: 1, medium: 0, large: 0 },
    bedCondition: 'overgrown',
    bedSqft: 50,
    mulchNeeded: false
  }, service('LANDSCAPING_PLANTING', {
    plantingLaborPerPlant: { small: 1000, medium: 2000, large: 3000 },
    plantMaterialAllowance: { small: 0, medium: 0, large: 0 },
    minimumServiceCharge: 0,
    bedPrepLaborPerSqft: { needs_weeding: 100, overgrown: 100 },
    mulchMaterialPerYard: { brown: 0 },
    mulchInstallLaborPerYard: 0
  }, {
    peakMonths: [1],
    peakSurchargePercent: 10
  }));
  assert.equal(planting.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(planting));
  assert.equal(line(planting, 'Bed preparation').category, 'labor');
  assert.equal(line(planting, 'Peak season adjustment').calculation.basisAmountCents, 6000);
  assert.equal(line(planting, 'Peak season adjustment').amountCents, 600);
});

test('repair 79: customer estimates require cent precision and a consistent first-option projection', () => {
  const ready = run('INTERIOR_PAINTING', interiorInputs(), interiorService());
  assert.equal(ready.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(ready));
  assert.equal(sanitizeForCustomerVNext(ready).resultType, 'INSTANT_ESTIMATE_READY');

  const fractionalCents = structuredClone(ready);
  fractionalCents.lowEstimate += 0.001;
  fractionalCents.options[0].lowEstimate += 0.001;

  const mismatchedMidpoint = structuredClone(ready);
  mismatchedMidpoint.midEstimate = Math.min(
    mismatchedMidpoint.highEstimate,
    mismatchedMidpoint.midEstimate + 0.01
  );

  const emptyDrivers = structuredClone(ready);
  emptyDrivers.priceDrivers = [];
  emptyDrivers.options[0].priceDrivers = [];

  const mismatchedDrivers = structuredClone(ready);
  mismatchedDrivers.options[0].priceDrivers = [...mismatchedDrivers.options[0].priceDrivers, 'Injected driver'];

  const mismatchedDisclaimer = structuredClone(ready);
  mismatchedDisclaimer.disclaimer = `${mismatchedDisclaimer.disclaimer} Injected disclaimer.`;

  const mismatchedBuffer = structuredClone(ready);
  mismatchedBuffer.rangeBufferUsed = mismatchedBuffer.rangeBufferUsed === 25
    ? 24
    : mismatchedBuffer.rangeBufferUsed + 1;

  const duplicateUnnamedOptions = structuredClone(ready);
  duplicateUnnamedOptions.options.push(structuredClone(duplicateUnnamedOptions.options[0]));

  for (const malformed of [
    fractionalCents,
    mismatchedMidpoint,
    emptyDrivers,
    mismatchedDrivers,
    mismatchedDisclaimer,
    mismatchedBuffer,
    duplicateUnnamedOptions
  ]) {
    assert.deepEqual(sanitizeForCustomerVNext(malformed), {
      resultType: 'ESTIMATE_REQUIRES_REVIEW',
      customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.',
      quoteId: ready.quoteId
    });
  }
});

test('repair 80: customer projections are independent and bound to safe calculation evidence', () => {
  const ownerResult = run('INTERIOR_PAINTING', interiorInputs(), interiorService());
  assert.equal(ownerResult.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(ownerResult));
  const firstOption = ownerResult.options[0];

  assert.notStrictEqual(ownerResult.priceDrivers, firstOption.priceDrivers);
  assert.notStrictEqual(ownerResult.lineItems, firstOption.lineItems);
  assert.notStrictEqual(firstOption.calculationRecord, ownerResult.calculationRecord.options[0]);
  assert.notStrictEqual(firstOption.priceDrivers, firstOption.calculationRecord.customerProjection.priceDrivers);

  const originalOptionDriver = firstOption.priceDrivers[0];
  const originalOptionAmount = firstOption.lineItems[0].amountCents;
  ownerResult.priceDrivers[0] = 'Mutated owner projection';
  ownerResult.lineItems[0].amountCents += 1;
  assert.equal(firstOption.priceDrivers[0], originalOptionDriver);
  assert.equal(firstOption.lineItems[0].amountCents, originalOptionAmount);

  const safeSource = run('INTERIOR_PAINTING', interiorInputs(), interiorService());
  const unsafeDriver = structuredClone(safeSource);
  unsafeDriver.priceDrivers[0] = 'Internal overhead rate: 30%';
  unsafeDriver.options[0].priceDrivers[0] = 'Internal overhead rate: 30%';

  const evidenceMismatch = structuredClone(safeSource);
  evidenceMismatch.midEstimate += 0.01;
  evidenceMismatch.options[0].midEstimate += 0.01;
  evidenceMismatch.options[0].calculationRecord.customerProjection.midEstimate += 0.01;

  const unsupportedExclusion = structuredClone(safeSource);
  unsupportedExclusion.options[0].skippedAddons.push('Markup details');
  unsupportedExclusion.options[0].calculationRecord.customerProjection.skippedAddons.push('Markup details');

  const inventedNotice = structuredClone(safeSource);
  inventedNotice.optionAvailabilityNotice = 'One option was removed for an internal pricing reason.';

  for (const malformed of [unsafeDriver, evidenceMismatch, unsupportedExclusion, inventedNotice]) {
    assert.deepEqual(sanitizeForCustomerVNext(malformed), {
      resultType: 'ESTIMATE_REQUIRES_REVIEW',
      customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.',
      quoteId: safeSource.quoteId
    });
  }
});

test('repair 81: malformed pricing primitives retain exact paths through direct and price-book execution', () => {
  const malformedBase = interiorService();
  malformedBase.pricing.invalidFunction = () => 1;
  const directBase = run('INTERIOR_PAINTING', interiorInputs(), malformedBase);
  assert.equal(directBase.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(directBase.invalidOwnerFields.includes('invalidFunction'), true, JSON.stringify(directBase));
  assert.equal(directBase.unsupportedOwnerFields.includes('invalidFunction'), true, JSON.stringify(directBase));

  const baseStatus = vNextServiceStatus(malformedBase, defaults);
  assert.equal(baseStatus.status, 'NEEDS PRICING');
  assert.equal(baseStatus.failedTierDiagnostics[0].invalidOwnerFields.includes('invalidFunction'), true, JSON.stringify(baseStatus));

  const malformedOnlyTier = interiorService({}, {
    tiers: [{ name: 'Unsafe', overrides: { laborPerWallSqftPerCoat: () => 1 } }]
  });
  const malformedOnlyStatus = vNextServiceStatus(malformedOnlyTier, defaults);
  assert.equal(malformedOnlyStatus.status, 'NEEDS PRICING');
  assert.deepEqual(malformedOnlyStatus.failedTierDiagnostics[0].invalidOwnerFields, ['laborPerWallSqftPerCoat']);

  const isolatedTier = interiorService({}, {
    tiers: [
      { name: 'Good', overrides: {} },
      { name: 'Unsafe', overrides: { laborPerWallSqftPerCoat: () => 1 } }
    ]
  });
  const isolatedStatus = vNextServiceStatus(isolatedTier, defaults);
  assert.equal(isolatedStatus.status, 'QUOTING LIVE', JSON.stringify(isolatedStatus));
  assert.deepEqual(isolatedStatus.validTierNames, ['Good']);
  assert.deepEqual(isolatedStatus.failedTierDiagnostics[0].invalidOwnerFields, ['laborPerWallSqftPerCoat']);

  const isolatedCustomer = quoteFromVNextPricebook({
    pricebook: { defaults, services: [isolatedTier] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'customer',
    currentMonth: 1
  });
  assert.equal(isolatedCustomer.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(isolatedCustomer));
  assert.deepEqual(isolatedCustomer.options.map(option => option.tierName), ['Good']);
  assert.equal(isolatedCustomer.optionAvailabilityNotice, 'Fewer options are available because one or more configured options need owner review.');

  const symbolPrice = interiorService();
  symbolPrice.pricing.minimumJob = Symbol('free');
  const symbolResult = run('INTERIOR_PAINTING', interiorInputs(), symbolPrice);
  assert.equal(symbolResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(symbolResult.invalidOwnerFields.includes('minimumJob'), true, JSON.stringify(symbolResult));

  const nonPlainRoof = roofService();
  nonPlainRoof.pricing.pitchMultiplier.medium = new Date(0);
  const directNonPlain = run('ROOFING_REPLACEMENT', roofInputs(), nonPlainRoof);
  assert.deepEqual(directNonPlain.invalidOwnerFields, ['pitchMultiplier.medium']);

  const serviceNonPlain = vNextServiceStatus(nonPlainRoof, defaults);
  assert.deepEqual(serviceNonPlain.invalidOwnerFields, ['pitchMultiplier.medium']);

  const nonPlainPricebook = { defaults, services: [nonPlainRoof] };
  const pricebookStatuses = vNextPricebookStatuses(nonPlainPricebook);
  assert.deepEqual(pricebookStatuses[0].invalidOwnerFields, ['pricebook.services.0.pricing.pitchMultiplier.medium']);
  const pricebookValidation = validateVNextPricebook(nonPlainPricebook);
  assert.equal(pricebookValidation.ok, false);
  assert.equal(pricebookValidation.errors.some(message => message.includes('pricebook.services.0.pricing.pitchMultiplier.medium')), true);
  const pricebookQuote = quoteFromVNextPricebook({
    pricebook: nonPlainPricebook,
    serviceType: 'ROOFING_REPLACEMENT',
    customerInputs: roofInputs(),
    callerType: 'owner',
    currentMonth: 1
  });
  assert.deepEqual(pricebookQuote.invalidOwnerFields, ['pricebook.services.0.pricing.pitchMultiplier.medium']);

  assert.throws(
    () => mergePricingVNext({ laborPerWallSqftPerCoat: () => 1 }, {}),
    /cannot be returned as plain quote data/
  );
});

test('repair 82: prototype-backed approvals and fee selections are rejected across public APIs', () => {
  const aiOwner = interiorService({}, { source: 'AI_SUGGESTED' });
  const confirmationFields = [
    ...Object.keys(aiOwner.pricing),
    'feeRules',
    'priceBasisByCategory',
    'taxabilityByCategory',
    'peakMonths',
    'peakSurchargePercent'
  ].sort();
  aiOwner.confirmedFields = Object.create(Object.fromEntries(confirmationFields.map(field => [field, true])));

  const directStatus = vNextServiceStatus(aiOwner, defaults);
  assert.equal(directStatus.status, 'NEEDS PRICING');
  assert.deepEqual(directStatus.invalidOwnerFields, ['confirmedFields']);

  const pricebook = { defaults, services: [aiOwner] };
  const pricebookStatus = vNextPricebookStatuses(pricebook)[0];
  assert.equal(pricebookStatus.status, 'NEEDS PRICING');
  assert.deepEqual(pricebookStatus.invalidOwnerFields, ['pricebook.services.0.confirmedFields']);

  const validation = validateVNextPricebook(pricebook);
  assert.equal(validation.ok, false);
  assert.deepEqual(validation.statuses[0].invalidOwnerFields, ['pricebook.services.0.confirmedFields']);

  const ownerQuote = quoteFromVNextPricebook({
    pricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(ownerQuote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(ownerQuote.invalidOwnerFields, ['pricebook.services.0.confirmedFields']);

  const preview = previewFromVNextPricebook({
    pricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    currentMonth: 1
  });
  assert.equal(preview.resultType, 'ESTIMATE_REQUIRES_REVIEW', JSON.stringify(preview));
  assert.deepEqual(preview.invalidOwnerFields, ['pricebook.services.0.confirmedFields']);
  assert.equal(Object.keys(aiOwner.confirmedFields).length, 0);

  const customerQuote = quoteFromVNextPricebook({
    pricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'customer',
    currentMonth: 1
  });
  assert.deepEqual(Object.keys(customerQuote).sort(), ['customerMessage', 'quoteId', 'resultType']);

  const ownerSelected = interiorService({}, {
    feeRules: { ...feeRules, travel: 'owner_selected' }
  });
  const hiddenOwnerFee = quoteFromVNextPricebook({
    pricebook: { defaults: { ...defaults, travelFee: 500 }, services: [ownerSelected] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    feeSelections: { owner: Object.create({ travel: true }) },
    currentMonth: 1
  });
  assert.deepEqual(hiddenOwnerFee.invalidOwnerFields, ['feeSelections.owner']);

  const customerSelected = interiorService({}, {
    feeRules: { ...feeRules, travel: 'customer_selected' }
  });
  const hiddenCustomerFee = quoteFromVNextPricebook({
    pricebook: { defaults: { ...defaults, travelFee: 500 }, services: [customerSelected] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    feeSelections: { customer: Object.create({ travel: true }) },
    currentMonth: 1
  });
  assert.deepEqual(hiddenCustomerFee.invalidCustomerFields, ['feeSelections.customer']);
});

test('repair 83: an exported service status cannot report LIVE without complete business defaults', () => {
  const configured = interiorService();
  const missingDefaults = vNextServiceStatus(configured);
  assert.equal(missingDefaults.status, 'NEEDS PRICING');
  assert.deepEqual(missingDefaults.missingOwnerFields, ['businessDefaults']);
  assert.equal(missingDefaults.validationErrors.includes('Complete business defaults are required before quoting can be live.'), true);

  const complete = vNextServiceStatus(configured, defaults);
  assert.equal(complete.status, 'QUOTING LIVE', JSON.stringify(complete));

  const invalidDefaults = { ...defaults, markupPercent: -1 };
  const invalid = vNextServiceStatus(configured, invalidDefaults);
  assert.equal(invalid.status, 'NEEDS PRICING');
  assert.equal(invalid.invalidOwnerFields.includes('businessDefaults.markupPercent'), true, JSON.stringify(invalid));

  const wholeBook = vNextPricebookStatuses({ defaults: invalidDefaults, services: [configured] })[0];
  assert.equal(wholeBook.status, 'NEEDS PRICING');
  assert.equal(wholeBook.invalidOwnerFields.includes('businessDefaults.markupPercent'), true, JSON.stringify(wholeBook));
});

test('repair 84: fee selections and tier definitions enforce exact supported request shapes', () => {
  const ownerSelected = interiorService({}, {
    feeRules: { ...feeRules, travel: 'owner_selected' }
  });
  const directCases = [
    {
      label: 'array container',
      feeSelections: [],
      invalidOwnerFields: [],
      invalidCustomerFields: ['feeSelections']
    },
    {
      label: 'unsupported root key',
      feeSelections: { owner: { travel: true }, operator: { travel: true } },
      invalidOwnerFields: [],
      invalidCustomerFields: ['feeSelections.operator']
    },
    {
      label: 'misspelled owner key',
      feeSelections: { owner: { travel: true, travle: true } },
      invalidOwnerFields: ['feeSelections.owner.travle'],
      invalidCustomerFields: []
    },
    {
      label: 'wrong owner value type',
      feeSelections: { owner: { travel: 'yes' } },
      invalidOwnerFields: ['feeSelections.owner.travel'],
      invalidCustomerFields: []
    },
    {
      label: 'missing selected owner decision',
      feeSelections: {},
      invalidOwnerFields: ['feeSelections.owner.travel'],
      invalidCustomerFields: []
    }
  ];
  for (const entry of directCases) {
    const result = run('INTERIOR_PAINTING', interiorInputs(), ownerSelected, {
      feeSelections: entry.feeSelections
    });
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW', entry.label);
    assert.deepEqual(result.invalidOwnerFields, entry.invalidOwnerFields, entry.label);
    assert.deepEqual(result.invalidCustomerFields, entry.invalidCustomerFields, entry.label);
  }

  const customerSelected = interiorService({}, {
    feeRules: { ...feeRules, travel: 'customer_selected' }
  });
  const misspelledCustomer = run('INTERIOR_PAINTING', interiorInputs(), customerSelected, {
    feeSelections: { customer: { travel: true, travle: false } }
  });
  assert.deepEqual(misspelledCustomer.invalidCustomerFields, ['feeSelections.customer.travle']);
  const missingCustomer = run('INTERIOR_PAINTING', interiorInputs(), customerSelected);
  assert.deepEqual(missingCustomer.invalidCustomerFields, ['feeSelections.customer.travel']);

  const ownerPricebook = { defaults, services: [ownerSelected] };
  const throughPricebook = quoteFromVNextPricebook({
    pricebook: ownerPricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    feeSelections: { owner: { travel: true, travle: true } },
    currentMonth: 1
  });
  assert.deepEqual(throughPricebook.invalidOwnerFields, ['feeSelections.owner.travle']);

  const customerSafe = quoteFromVNextPricebook({
    pricebook: { defaults, services: [customerSelected] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'customer',
    feeSelections: { customer: { travel: true, travle: true } },
    currentMonth: 1
  });
  assert.deepEqual(Object.keys(customerSafe).sort(), ['customerMessage', 'quoteId', 'resultType']);
  assert.equal(customerSafe.resultType, 'ESTIMATE_REQUIRES_REVIEW');

  const extraTierField = interiorService({}, {
    tiers: [{ name: 'Good', overrides: {}, hiddenPrice: 100 }]
  });
  const extraStatus = vNextServiceStatus(extraTierField, defaults);
  assert.equal(extraStatus.status, 'NEEDS PRICING');
  assert.equal(extraStatus.unsupportedOwnerFields.includes('tiers.0.hiddenPrice'), true, JSON.stringify(extraStatus));
  const extraDirect = run('INTERIOR_PAINTING', interiorInputs(), extraTierField);
  assert.equal(extraDirect.unsupportedOwnerFields.includes('tiers.0.hiddenPrice'), true, JSON.stringify(extraDirect));
  const extraPricebook = quoteFromVNextPricebook({
    pricebook: { defaults, services: [extraTierField] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(extraPricebook.unsupportedOwnerFields.includes('tiers.0.hiddenPrice'), true, JSON.stringify(extraPricebook));

  const paddedTierName = interiorService({}, {
    tiers: [{ name: ' Good ', overrides: {} }]
  });
  const paddedStatus = vNextServiceStatus(paddedTierName, defaults);
  assert.equal(paddedStatus.status, 'NEEDS PRICING');
  assert.equal(paddedStatus.invalidOwnerFields.includes('tiers.0.name'), true, JSON.stringify(paddedStatus));
  const paddedCustomer = run('INTERIOR_PAINTING', interiorInputs(), paddedTierName, { callerType: 'customer' });
  assert.equal(paddedCustomer.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(Object.keys(paddedCustomer).sort(), ['customerMessage', 'quoteId', 'resultType']);
});

test('repair 85: mutation after snapshot cannot bypass any later public boundary inspection', () => {
  const trustedEngineRequest = snapshotPlainData({ serviceType: 'INTERIOR_PAINTING', callerType: 'owner' }, 'quoteRequest').value;
  let engineGetterReads = 0;
  Object.defineProperty(trustedEngineRequest, 'serviceType', {
    enumerable: true,
    get() {
      engineGetterReads += 1;
      throw new Error('post-snapshot engine accessor executed');
    }
  });
  let engineResult;
  assert.doesNotThrow(() => { engineResult = generateQuoteVNext(trustedEngineRequest); });
  assert.equal(engineGetterReads, 0);
  assert.equal(engineResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(engineResult.invalidCustomerFields, ['quoteRequest.serviceType']);

  const trustedLookup = snapshotPlainData({
    pricebook: { defaults, services: [interiorService()] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    currentMonth: 1
  }, 'quoteRequest').value;
  let lookupGetterReads = 0;
  Object.defineProperty(trustedLookup, 'serviceType', {
    enumerable: true,
    get() {
      lookupGetterReads += 1;
      throw new Error('post-snapshot lookup accessor executed');
    }
  });
  let lookupResult;
  assert.doesNotThrow(() => { lookupResult = quoteFromVNextPricebook(trustedLookup); });
  assert.equal(lookupGetterReads, 0);
  assert.equal(lookupResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');

  const ready = run('INTERIOR_PAINTING', interiorInputs(), interiorService());
  const trustedReady = snapshotPlainData(ready, 'internalResult').value;
  let sanitizerGetterReads = 0;
  Object.defineProperty(trustedReady, 'options', {
    enumerable: true,
    get() {
      sanitizerGetterReads += 1;
      throw new Error('post-snapshot sanitizer accessor executed');
    }
  });
  const sanitized = sanitizeForCustomerVNext(trustedReady);
  assert.equal(sanitizerGetterReads, 0);
  assert.equal(sanitized.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(sanitized.quoteId, ready.quoteId);
});

test('repair 86: customer projections remain bound to scenario totals, line sums, and the root calculation record', () => {
  const ready = run('INTERIOR_PAINTING', interiorInputs(), interiorService());
  assert.equal(ready.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(ready));

  const alteredScenarioTotal = structuredClone(ready);
  for (const record of [
    alteredScenarioTotal.options[0].calculationRecord,
    alteredScenarioTotal.calculationRecord.options[0]
  ]) {
    record.scenarios.mid.finalTotalCents += 1;
  }

  const alteredLineEvidence = structuredClone(ready);
  alteredLineEvidence.options[0].lineItems[0].amountCents += 1;
  for (const record of [
    alteredLineEvidence.options[0].calculationRecord,
    alteredLineEvidence.calculationRecord.options[0]
  ]) {
    record.lineItems[0].amountCents += 1;
    record.scenarios.mid.lineItems[0].amountCents += 1;
    record.scenarios.mid.finalTotalCents += 1;
    record.range.exactMidScenarioTotalCents += 1;
  }

  const shiftedProjection = structuredClone(ready);
  for (const field of ['lowEstimate', 'midEstimate', 'highEstimate']) {
    shiftedProjection[field] += 0.01;
    shiftedProjection.options[0][field] += 0.01;
    shiftedProjection.options[0].calculationRecord.customerProjection[field] += 0.01;
    shiftedProjection.calculationRecord.options[0].customerProjection[field] += 0.01;
  }
  for (const field of ['lowCents', 'midCents', 'highCents']) {
    shiftedProjection.options[0].calculationRecord.range[field] += 1;
    shiftedProjection.calculationRecord.options[0].range[field] += 1;
  }

  const mismatchedRootRecord = structuredClone(ready);
  mismatchedRootRecord.calculationRecord.options[0].range.midCents += 1;

  for (const malformed of [
    alteredScenarioTotal,
    alteredLineEvidence,
    shiftedProjection,
    mismatchedRootRecord
  ]) {
    assert.deepEqual(sanitizeForCustomerVNext(malformed), {
      resultType: 'ESTIMATE_REQUIRES_REVIEW',
      customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.',
      quoteId: ready.quoteId
    });
  }
});

test('repair 87: AI confirmation maps reject ignored keys and non-boolean approvals at every activation boundary', () => {
  const aiService = interiorService({}, { source: 'AI_SUGGESTED' });
  const confirmationFields = aiConfirmationFieldsVNext(aiService, aiService.pricing);
  aiService.confirmedFields = Object.fromEntries(confirmationFields.map(field => [field, true]));
  assert.equal(vNextServiceStatus(aiService, defaults).status, 'QUOTING LIVE');

  const misspelled = structuredClone(aiService);
  misspelled.confirmedFields.laborPerWalSqftPerCoat = true;
  const misspelledStatus = vNextServiceStatus(misspelled, defaults);
  assert.equal(misspelledStatus.status, 'NEEDS PRICING');
  assert.equal(misspelledStatus.unsupportedOwnerFields.includes('confirmedFields.laborPerWalSqftPerCoat'), true, JSON.stringify(misspelledStatus));
  const misspelledPreview = previewFromVNextPricebook({
    pricebook: { defaults, services: [misspelled] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    currentMonth: 1
  });
  assert.equal(misspelledPreview.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(misspelledPreview.unsupportedOwnerFields.includes('confirmedFields.laborPerWalSqftPerCoat'), true, JSON.stringify(misspelledPreview));

  const wrongType = structuredClone(aiService);
  wrongType.confirmedFields.laborPerWallSqftPerCoat = 'yes';
  const wrongTypeStatus = vNextServiceStatus(wrongType, defaults);
  assert.equal(wrongTypeStatus.status, 'NEEDS PRICING');
  assert.equal(wrongTypeStatus.invalidOwnerFields.includes('confirmedFields.laborPerWallSqftPerCoat'), true, JSON.stringify(wrongTypeStatus));
  assert.equal(wrongTypeStatus.missingOwnerFields.includes('confirmedFields.laborPerWallSqftPerCoat'), true, JSON.stringify(wrongTypeStatus));

  const explicitlyUnconfirmed = structuredClone(aiService);
  explicitlyUnconfirmed.confirmedFields.laborPerWallSqftPerCoat = false;
  const unconfirmedStatus = vNextServiceStatus(explicitlyUnconfirmed, defaults);
  assert.equal(unconfirmedStatus.status, 'NEEDS PRICING');
  assert.equal(unconfirmedStatus.invalidOwnerFields.includes('confirmedFields.laborPerWallSqftPerCoat'), false);
  assert.equal(unconfirmedStatus.missingOwnerFields.includes('confirmedFields.laborPerWallSqftPerCoat'), true);

  const manualWithIgnoredApproval = interiorService({}, {
    confirmedFields: { laborPerWallSqftPerCoat: true }
  });
  const manualStatus = vNextServiceStatus(manualWithIgnoredApproval, defaults);
  assert.equal(manualStatus.status, 'NEEDS PRICING');
  assert.equal(manualStatus.unsupportedOwnerFields.includes('confirmedFields.laborPerWallSqftPerCoat'), true, JSON.stringify(manualStatus));
  assert.equal(vNextServiceStatus(interiorService({}, { confirmedFields: {} }), defaults).status, 'QUOTING LIVE');
});
test('repair 88: deeply nested quote data fails closed without executing past the shared snapshot boundary', () => {
  const nested = depth => {
    const root = {};
    let cursor = root;
    for (let index = 0; index < depth; index += 1) {
      cursor.next = {};
      cursor = cursor.next;
    }
    return root;
  };
  const deep = nested(150);

  const directSnapshot = snapshotPlainData({ deep }, 'probe');
  assert.equal(directSnapshot.ok, false);
  assert.match(directSnapshot.reason, /nesting exceeds 100 levels/);

  let engineResult;
  assert.doesNotThrow(() => {
    engineResult = generateQuoteVNext({
      serviceType: 'INTERIOR_PAINTING',
      customerInputs: deep,
      callerType: 'owner'
    });
  });
  assert.equal(engineResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.match(engineResult.reviewReason, /nesting exceeds 100 levels/);

  let lookupResult;
  assert.doesNotThrow(() => {
    lookupResult = quoteFromVNextPricebook({
      pricebook: { defaults, services: [interiorService()] },
      serviceType: 'INTERIOR_PAINTING',
      customerInputs: deep,
      callerType: 'owner',
      currentMonth: 1
    });
  });
  assert.equal(lookupResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.match(lookupResult.reviewReason, /nesting exceeds 100 levels/);

  const ready = run('INTERIOR_PAINTING', interiorInputs(), interiorService());
  const malformedReady = structuredClone(ready);
  malformedReady.deep = deep;
  let customerResult;
  assert.doesNotThrow(() => { customerResult = sanitizeForCustomerVNext(malformedReady); });
  assert.deepEqual(customerResult, {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.',
    quoteId: ready.quoteId
  });
});
test('repair 89: oversized sparse arrays fail before any dense-array scan can exhaust the request boundary', () => {
  const oversized = new Array(10_001);
  assert.deepEqual(denseArrayIssue(oversized), {
    path: '',
    reason: 'may contain at most 10000 entries'
  });

  const snapshot = snapshotPlainData({ oversized }, 'probe');
  assert.equal(snapshot.ok, false);
  assert.equal(snapshot.errorPath, 'probe.oversized');
  assert.match(snapshot.reason, /at most 10000 entries/);

  let engineResult;
  assert.doesNotThrow(() => {
    engineResult = generateQuoteVNext({
      serviceType: 'INTERIOR_PAINTING',
      customerInputs: { oversized },
      callerType: 'owner'
    });
  });
  assert.equal(engineResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.match(engineResult.reviewReason, /at most 10000 entries/);

  let lookupResult;
  assert.doesNotThrow(() => {
    lookupResult = quoteFromVNextPricebook({
      pricebook: { defaults, services: oversized },
      serviceType: 'INTERIOR_PAINTING',
      customerInputs: interiorInputs(),
      callerType: 'owner',
      currentMonth: 1
    });
  });
  assert.equal(lookupResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.match(lookupResult.reviewReason, /at most 10000 entries/);

  assert.throws(
    () => materializeScenarioLinesVNext(oversized, 'mid'),
    /at most 10000 entries/
  );
});
test('repair 90: omitted caller context is customer-safe and only explicit owner paths expose internal evidence', () => {
  const ownerPricing = interiorService();
  const directRequest = {
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    ownerPricing,
    businessDefaults: defaults,
    currentMonth: 1
  };
  const pricebookRequest = {
    pricebook: { defaults, services: [ownerPricing] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    currentMonth: 1
  };

  for (const result of [
    generateQuoteVNext(directRequest),
    liveQuoteVNext(directRequest),
    quoteFromVNextPricebook(pricebookRequest)
  ]) {
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(result));
    for (const internalField of [
      'lineItems', 'calculationRecord', 'submittedCustomerInputs',
      'serviceType', 'appliedRules', 'failedTierDiagnostics'
    ]) {
      assert.equal(Object.hasOwn(result, internalField), false, internalField);
    }
  }

  for (const malformed of [
    generateQuoteVNext(null),
    quoteFromVNextPricebook(null)
  ]) {
    assert.equal(malformed.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(Object.keys(malformed).sort(), ['customerMessage', 'quoteId', 'resultType']);
    assert.equal(typeof malformed.quoteId, 'string');
  }

  const explicitOwner = generateQuoteVNext({ ...directRequest, callerType: 'owner' });
  assert.equal(Array.isArray(explicitOwner.lineItems), true);
  assert.equal(Object.hasOwn(explicitOwner, 'calculationRecord'), true);

  const directPreview = previewQuoteVNext(directRequest);
  const pricebookPreview = previewFromVNextPricebook(pricebookRequest);
  assert.equal(Array.isArray(directPreview.lineItems), true);
  assert.equal(Array.isArray(pricebookPreview.lineItems), true);
});
test('repair 91: the direct calculator never rereads validated proxies or accessor-backed context', () => {
  const owner = interiorService();
  let pricingReads = 0;
  const pricingProxy = new Proxy(owner.pricing, {
    get(target, key, receiver) {
      pricingReads += 1;
      if (key === 'laborPerWallSqftPerCoat') throw new Error('validated pricing was reread');
      return Reflect.get(target, key, receiver);
    }
  });
  let calculated;
  assert.doesNotThrow(() => {
    calculated = calculateServiceVNext(
      'INTERIOR_PAINTING',
      interiorInputs(),
      pricingProxy,
      { ownerPricing: owner }
    );
  });
  assert.equal(pricingReads, 0);
  assert.equal(lineAmount(calculated, 'Wall labor'), 10000);
  assert.equal(lineAmount(calculated, 'Wall paint and materials'), 5000);

  let ownerRulesReads = 0;
  const accessorRules = {};
  Object.defineProperty(accessorRules, 'ownerPricing', {
    enumerable: true,
    get() {
      ownerRulesReads += 1;
      throw new Error('owner pricing context getter executed');
    }
  });
  assert.throws(
    () => calculateServiceVNext('INTERIOR_PAINTING', interiorInputs(), owner.pricing, accessorRules),
    error => {
      assert.equal(error.name, 'QuoteReviewError');
      assert.deepEqual(error.invalidOwnerFields, ['serviceRules.ownerPricing']);
      return true;
    }
  );
  assert.equal(ownerRulesReads, 0);

  const flatRepair = repairFixture('FLAT_ROOF_REPAIR');
  let addonGetterReads = 0;
  const accessorAddonContext = { ownerPricing: flatRepair.ownerPricing };
  Object.defineProperty(accessorAddonContext, 'skipAddon', {
    enumerable: true,
    get() {
      addonGetterReads += 1;
      throw new Error('add-on context getter executed');
    }
  });
  assert.throws(
    () => calculateServiceVNext(
      'FLAT_ROOF_REPAIR',
      { ...flatRepair.inputs, pondingWater: true },
      flatRepair.ownerPricing.pricing,
      accessorAddonContext
    ),
    error => {
      assert.equal(error.name, 'QuoteReviewError');
      assert.deepEqual(error.invalidOwnerFields, ['addonDisclosureContext']);
      return true;
    }
  );
  assert.equal(addonGetterReads, 0);

  assert.throws(
    () => calculateServiceVNext(
      'FLAT_ROOF_REPAIR',
      { ...flatRepair.inputs, pondingWater: true },
      flatRepair.ownerPricing.pricing,
      { ownerPricing: flatRepair.ownerPricing, skipAddon() { throw new Error('callback failed'); } }
    ),
    error => {
      assert.equal(error.name, 'QuoteReviewError');
      assert.deepEqual(error.invalidOwnerFields, ['addonDisclosureContext']);
      return true;
    }
  );
});
test('repair 92: standalone validation and owner previews cannot launder nested prototype-backed quote data', () => {
  const owner = interiorService();
  const prototypeBackedFactors = Object.create({ hiddenMultiplier: 9 });
  Object.assign(prototypeBackedFactors, owner.pricing.wallHeightLaborMultiplier);
  owner.pricing.wallHeightLaborMultiplier = prototypeBackedFactors;

  const ownerValidation = validateOwnerPricing('INTERIOR_PAINTING', interiorInputs(), owner.pricing, owner);
  assert.equal(ownerValidation.ok, false);
  assert.deepEqual(ownerValidation.invalidOwnerFields, ['wallHeightLaborMultiplier']);
  assert.deepEqual(
    validateClass2FactorsDetailed('INTERIOR_PAINTING', owner.pricing).map(item => item.path),
    ['wallHeightLaborMultiplier']
  );
  assert.deepEqual(
    validatePricingStructuresDetailed('INTERIOR_PAINTING', owner.pricing).map(item => item.path),
    ['wallHeightLaborMultiplier']
  );
  assert.deepEqual(
    validateCustomerInputs('INTERIOR_PAINTING', interiorInputs(), owner.pricing).invalidOwnerFields,
    ['wallHeightLaborMultiplier']
  );
  assert.throws(
    () => withClass2Defaults('INTERIOR_PAINTING', owner.pricing),
    /wallHeightLaborMultiplier is not plain data/
  );
  assert.equal(
    validateServiceRulesDetailed(owner, 'INTERIOR_PAINTING')[0].path,
    'pricing.wallHeightLaborMultiplier'
  );
  assert.equal(
    validateTierDefinitionsDetailedVNext(owner, 'INTERIOR_PAINTING')[0].path,
    'pricing.wallHeightLaborMultiplier'
  );
  assert.match(
    validateTierDefinitionsVNext(owner, 'INTERIOR_PAINTING')[0],
    /plain data value/
  );
  assert.throws(
    () => materializeVNextService(owner),
    /service\.pricing\.wallHeightLaborMultiplier is not plain data/
  );

  const directRequest = {
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    ownerPricing: owner,
    businessDefaults: defaults,
    callerType: 'owner',
    currentMonth: 1
  };
  for (const result of [
    generateQuoteVNext(directRequest),
    previewQuoteVNext(directRequest)
  ]) {
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(result.invalidOwnerFields, ['wallHeightLaborMultiplier']);
  }

  const pricebookRequest = {
    pricebook: { defaults, services: [owner] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    currentMonth: 1
  };
  for (const result of [
    quoteFromVNextPricebook(pricebookRequest),
    previewFromVNextPricebook(pricebookRequest)
  ]) {
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(result.invalidOwnerFields, ['pricebook.services.0.pricing.wallHeightLaborMultiplier']);
  }

  const plantsBySize = Object.create({ ignoredSize: 1 });
  Object.assign(plantsBySize, { small: 1, medium: 0, large: 0 });
  const customerValidation = validateCustomerInputs(
    'LANDSCAPING_PLANTING',
    { plantsBySize },
    {}
  );
  assert.equal(customerValidation.ok, false);
  assert.deepEqual(customerValidation.invalidCustomerFields, ['plantsBySize']);

  const nonPlainDefaults = structuredClone(defaults);
  const markupMap = Object.create({ hiddenCategory: true });
  Object.assign(markupMap, nonPlainDefaults.markupApplies);
  nonPlainDefaults.markupApplies = markupMap;
  const defaultsValidation = validateBusinessDefaults(nonPlainDefaults);
  assert.equal(defaultsValidation.ok, false);
  assert.deepEqual(defaultsValidation.invalidFields, ['markupApplies']);

  const ruleOwner = interiorService();
  const feeMap = Object.create({ hiddenFee: 'always' });
  Object.assign(feeMap, ruleOwner.feeRules);
  ruleOwner.feeRules = feeMap;
  assert.deepEqual(
    validateServiceRulesDetailed(ruleOwner, 'INTERIOR_PAINTING').map(item => item.path),
    ['feeRules']
  );
});

test('repair 93: exact decimal half-cents round correctly without an epsilon across measured and derived quantities', () => {
  assert.equal(Math.round(1.005 * 100), 100, 'the native floating-point defect must remain reproducible');
  const ownerPricing = service('LANDSCAPING_MULCH', {
    mulchMaterialPerYard: { brown: 100 },
    mulchInstallLaborPerYard: 100,
    mulchOverageFactor: 1,
    minimumServiceCharge: 0
  });

  const measuredQuote = run('LANDSCAPING_MULCH', {
    inputMethod: 'yards',
    mulchArea: 1.005,
    mulchType: 'brown',
    bedCondition: 'clean',
    edgingNeeded: false
  }, ownerPricing);
  assert.equal(measuredQuote.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(measuredQuote));
  assert.equal(lineAmount(measuredQuote, 'Mulch material'), 101);
  assert.equal(lineAmount(measuredQuote, 'Mulch installation labor'), 101);
  for (const item of scenario(measuredQuote).lineItems) assertLineReproducible(item);
  assert.deepEqual(
    line(measuredQuote, 'Mulch installation labor').calculation.exactUnroundedCents,
    { numerator: '201', denominator: '2' }
  );

  const derivedQuote = run('LANDSCAPING_MULCH', {
    inputMethod: 'sqft',
    mulchArea: 325.62,
    mulchDepth: 1,
    mulchType: 'brown',
    bedCondition: 'clean',
    edgingNeeded: false
  }, ownerPricing);
  assert.equal(derivedQuote.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(derivedQuote));
  assert.equal(lineAmount(derivedQuote, 'Mulch material'), 101);
  assert.equal(lineAmount(derivedQuote, 'Mulch installation labor'), 101);
  assert.deepEqual(
    derivedQuote.calculationRecord.options[0].quantityDerivations.find(item => item.name === 'installedMulchYards').exactResult,
    { numerator: '201', denominator: '200' }
  );
  for (const item of scenario(derivedQuote).lineItems) assertLineReproducible(item);

  const belowHalf = run('LANDSCAPING_MULCH', {
    inputMethod: 'yards',
    mulchArea: 1.0049999999999997,
    mulchType: 'brown',
    bedCondition: 'clean',
    edgingNeeded: false
  }, ownerPricing);
  assert.equal(belowHalf.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(belowHalf));
  assert.equal(lineAmount(belowHalf, 'Mulch material'), 100, 'a true value below half a cent must not be epsilon-rounded up');
  assert.equal(lineAmount(belowHalf, 'Mulch installation labor'), 100);
});

test('repair 93: exact percentage arithmetic governs seasonal, markup, tax, add-on, and customer-range rounding', () => {
  const pricedInterior = interiorService({
    laborPerWallSqftPerCoat: 100,
    materialPerWallSqftPerCoat: 0
  }, {
    peakMonths: [1],
    peakSurchargePercent: 0.5
  });
  const percentageQuote = run('INTERIOR_PAINTING', interiorInputs({
    wallAreaSqft: 1,
    coats: 1,
    wallHeight: 'standard',
    ceilingsIncluded: false,
    trimIncluded: false
  }), pricedInterior, {
    businessDefaults: {
      ...defaults,
      markupPercent: 0.5,
      taxMode: 'TAX_ALL',
      taxPercent: 0.5,
      rangeBufferPercent: 0.5
    }
  });
  assert.equal(percentageQuote.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(percentageQuote));
  assert.equal(lineAmount(percentageQuote, 'Peak season adjustment'), 1);
  assert.equal(lineAmount(percentageQuote, 'Markup'), 1);
  assert.equal(lineAmount(percentageQuote, 'Tax'), 1);
  for (const item of scenario(percentageQuote).lineItems) assertLineReproducible(item);

  const rangeQuote = run('INTERIOR_PAINTING', interiorInputs({
    wallAreaSqft: 1,
    coats: 1,
    wallHeight: 'standard',
    ceilingsIncluded: false,
    trimIncluded: false
  }), interiorService({
    laborPerWallSqftPerCoat: 100,
    materialPerWallSqftPerCoat: 0
  }), {
    businessDefaults: { ...defaults, rangeBufferPercent: 0.5 }
  });
  assert.deepEqual(
    { low: rangeQuote.lowEstimate, mid: rangeQuote.midEstimate, high: rangeQuote.highEstimate },
    { low: 1, mid: 1, high: 1.01 }
  );

  const mowingQuote = run('LANDSCAPING_MOWING', {
    yardSqft: 100,
    sqftMethod: 'exact',
    serviceFrequency: 'weekly',
    grassCondition: 'maintained',
    bagClippings: true,
    edgingIncluded: false
  }, service('LANDSCAPING_MOWING', {
    mowingBaseRatePerSqft: 1,
    minimumServiceCharge: 0,
    frequencyMultipliers: { weekly: 1, biweekly: 1, monthly: 1, one_time: 1 },
    overgrowthMultipliers: { maintained: 1, overgrown: 1, severe: 1 },
    baggingSurchargePercent: 0.5
  }));
  assert.equal(mowingQuote.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(mowingQuote));
  assert.equal(lineAmount(mowingQuote, 'Clipping bagging and disposal'), 1);
  assertLineReproducible(line(mowingQuote, 'Clipping bagging and disposal'));
});

test('repair 94: customer sanitization independently rejects forged exact line evidence', () => {
  const source = run('INTERIOR_PAINTING', interiorInputs(), interiorService());
  assert.equal(source.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(source));
  const forged = structuredClone(source);
  const corruptedEvidence = { numerator: '1', denominator: '1' };

  forged.lineItems[0].calculation.exactUnroundedCents = structuredClone(corruptedEvidence);
  forged.options[0].lineItems[0].calculation.exactUnroundedCents = structuredClone(corruptedEvidence);
  forged.options[0].calculationRecord.lineItems[0].calculation.exactUnroundedCents = structuredClone(corruptedEvidence);
  forged.options[0].calculationRecord.scenarios.mid.lineItems[0].calculation.exactUnroundedCents = structuredClone(corruptedEvidence);
  forged.calculationRecord.options[0] = structuredClone(forged.options[0].calculationRecord);

  assert.deepEqual(sanitizeForCustomerVNext(forged), {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.',
    quoteId: source.quoteId
  });

  const forgedAmount = structuredClone(source);
  for (const item of [
    forgedAmount.lineItems[0],
    forgedAmount.options[0].lineItems[0],
    forgedAmount.options[0].calculationRecord.lineItems[0],
    forgedAmount.options[0].calculationRecord.scenarios.mid.lineItems[0]
  ]) {
    item.amountCents += 1;
    item.calculation.roundedAmountCents += 1;
  }
  forgedAmount.options[0].calculationRecord.scenarios.mid.finalTotalCents += 1;
  forgedAmount.options[0].calculationRecord.range.exactMidScenarioTotalCents += 1;
  forgedAmount.calculationRecord.options[0] = structuredClone(forgedAmount.options[0].calculationRecord);

  assert.deepEqual(sanitizeForCustomerVNext(forgedAmount), {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.',
    quoteId: source.quoteId
  });
});
test('repair 95: preview-only results cannot be laundered into customer-ready estimates', () => {
  const request = {
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    businessDefaults: defaults,
    currentMonth: 1
  };
  const customerReview = quoteId => ({
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.',
    quoteId
  });

  const inactiveOwner = interiorService({}, { active: false });
  const inactivePreview = previewQuoteVNext({ ...request, ownerPricing: inactiveOwner });
  assert.equal(inactivePreview.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(inactivePreview));
  assert.equal(inactivePreview.customerEligible, false);
  assert.equal(inactivePreview.calculationRecord.customerEligible, false);
  assert.deepEqual(sanitizeForCustomerVNext(inactivePreview), customerReview(inactivePreview.quoteId));

  const inactivePricebookPreview = previewFromVNextPricebook({
    pricebook: { defaults, services: [inactiveOwner] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    currentMonth: 1
  });
  assert.equal(inactivePricebookPreview.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(inactivePricebookPreview));
  assert.equal(inactivePricebookPreview.customerEligible, false);
  assert.deepEqual(
    sanitizeForCustomerVNext(inactivePricebookPreview),
    customerReview(inactivePricebookPreview.quoteId)
  );

  const aiDraft = interiorService({}, {
    source: 'AI_SUGGESTED',
    confirmedFields: {}
  });
  const unconfirmedPreview = previewQuoteVNext({ ...request, ownerPricing: aiDraft });
  assert.equal(unconfirmedPreview.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(unconfirmedPreview));
  assert.equal(unconfirmedPreview.unconfirmedOwnerFields.length > 0, true);
  assert.equal(unconfirmedPreview.customerEligible, false);
  assert.equal(unconfirmedPreview.calculationRecord.customerEligible, false);
  assert.deepEqual(sanitizeForCustomerVNext(unconfirmedPreview), customerReview(unconfirmedPreview.quoteId));
  assert.deepEqual(aiDraft.confirmedFields, {});

  const confirmedAI = structuredClone(aiDraft);
  confirmedAI.confirmedFields = Object.fromEntries(
    aiConfirmationFieldsVNext(confirmedAI, confirmedAI.pricing).map(field => [field, true])
  );
  const confirmedPreview = previewQuoteVNext({ ...request, ownerPricing: confirmedAI });
  assert.equal(confirmedPreview.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(confirmedPreview));
  assert.deepEqual(confirmedPreview.unconfirmedOwnerFields, []);
  assert.equal(confirmedPreview.customerEligible, true);
  assert.equal(confirmedPreview.calculationRecord.customerEligible, true);
  assert.equal(sanitizeForCustomerVNext(confirmedPreview).resultType, 'INSTANT_ESTIMATE_READY');
});

test('repair 96: class-instance approvals and fee selections cannot cross plain-data trust boundaries', () => {
  class BooleanSelections {
    constructor(fields) {
      for (const field of fields) this[field] = true;
    }
  }

  const aiOwner = interiorService({}, { source: 'AI_SUGGESTED' });
  const confirmationFields = aiConfirmationFieldsVNext(aiOwner, aiOwner.pricing);
  aiOwner.confirmedFields = new BooleanSelections(confirmationFields);

  const status = vNextServiceStatus(aiOwner, defaults);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.deepEqual(status.invalidOwnerFields, ['confirmedFields']);

  for (const result of [
    run('INTERIOR_PAINTING', interiorInputs(), aiOwner),
    previewQuoteVNext({
      serviceType: 'INTERIOR_PAINTING',
      customerInputs: interiorInputs(),
      ownerPricing: aiOwner,
      businessDefaults: defaults,
      currentMonth: 1
    })
  ]) {
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(result.invalidOwnerFields, ['confirmedFields']);
  }

  const ownerSelected = interiorService({}, {
    feeRules: { ...feeRules, travel: 'owner_selected' }
  });
  const classOwnerSelection = run('INTERIOR_PAINTING', interiorInputs(), ownerSelected, {
    businessDefaults: { ...defaults, travelFee: 500 },
    feeSelections: { owner: new BooleanSelections(['travel']) }
  });
  assert.deepEqual(classOwnerSelection.invalidOwnerFields, ['feeSelections.owner']);

  const customerSelected = interiorService({}, {
    feeRules: { ...feeRules, travel: 'customer_selected' }
  });
  const classCustomerSelection = run('INTERIOR_PAINTING', interiorInputs(), customerSelected, {
    businessDefaults: { ...defaults, travelFee: 500 },
    feeSelections: { customer: new BooleanSelections(['travel']) }
  });
  assert.deepEqual(classCustomerSelection.invalidCustomerFields, ['feeSelections.customer']);

  const plainSelection = run('INTERIOR_PAINTING', interiorInputs(), ownerSelected, {
    businessDefaults: { ...defaults, travelFee: 500 },
    feeSelections: { owner: { travel: true } }
  });
  assert.equal(plainSelection.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(plainSelection));
  assert.equal(lineAmount(plainSelection, 'Travel'), 500);
});

test('repair 97: every markup percentage accepted by defaults validation has reproducible exact evidence', () => {
  for (const [markupPercent, expectedMarkupCents] of [
    [499.99, 49999],
    [499.99999999999994, 50000],
    [500, 50000],
    [500.00000000000006, 50000],
    [500.01, 50001],
    [600, 60000],
    [999.99, 99999],
    [999.9999999999999, 100000],
    [1000, 100000]
  ]) {
    const configuredDefaults = {
      ...defaults,
      markupPercent,
      markupMode: 'markup',
      rangeBufferPercent: 0
    };
    assert.equal(validateBusinessDefaults(configuredDefaults).ok, true, String(markupPercent));
    const result = run('INTERIOR_PAINTING', interiorInputs(), interiorService(), {
      businessDefaults: configuredDefaults
    });
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(result));
    const markupLine = line(result, 'Markup');
    assert.equal(markupLine.calculation.basisAmountCents, 10000);
    assert.equal(markupLine.calculation.percent, markupPercent);
    assert.equal(markupLine.amountCents, expectedMarkupCents);
    assertLineReproducible(markupLine);
    assert.equal(sanitizeForCustomerVNext(result).resultType, 'INSTANT_ESTIMATE_READY');
  }

  const aboveValidatedMaximum = { ...defaults, markupPercent: 1000.0000000000001, rangeBufferPercent: 0 };
  const validation = validateBusinessDefaults(aboveValidatedMaximum);
  assert.equal(validation.ok, false);
  assert.deepEqual(validation.invalidFields, ['markupPercent']);
  const rejected = run('INTERIOR_PAINTING', interiorInputs(), interiorService(), {
    businessDefaults: aboveValidatedMaximum
  });
  assert.equal(rejected.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(rejected.invalidOwnerFields, ['businessDefaults.markupPercent']);
});

test('repair 98: fee selections are accepted only for the matching configured selection mode', () => {
  const noSelectionMode = interiorService();
  for (const selected of [false, true]) {
    const ownerInput = run('INTERIOR_PAINTING', interiorInputs(), noSelectionMode, {
      feeSelections: { owner: { travel: selected } }
    });
    assert.equal(ownerInput.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(ownerInput.invalidOwnerFields, ['feeSelections.owner.travel']);

    const customerInput = run('INTERIOR_PAINTING', interiorInputs(), noSelectionMode, {
      feeSelections: { customer: { travel: selected } }
    });
    assert.equal(customerInput.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(customerInput.invalidCustomerFields, ['feeSelections.customer.travel']);
  }

  const ownerSelected = interiorService({}, {
    feeRules: { ...feeRules, travel: 'owner_selected' }
  });
  const selectedOwnerFee = run('INTERIOR_PAINTING', interiorInputs(), ownerSelected, {
    businessDefaults: { ...defaults, travelFee: 500 },
    feeSelections: { owner: { travel: true } }
  });
  assert.equal(selectedOwnerFee.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(lineAmount(selectedOwnerFee, 'Travel'), 500);

  const declinedOwnerFee = run('INTERIOR_PAINTING', interiorInputs(), ownerSelected, {
    businessDefaults: { ...defaults, travelFee: 500 },
    feeSelections: { owner: { travel: false } }
  });
  assert.equal(declinedOwnerFee.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(line(declinedOwnerFee, 'Travel'), undefined);

  const wrongSide = run('INTERIOR_PAINTING', interiorInputs(), ownerSelected, {
    businessDefaults: { ...defaults, travelFee: 500 },
    feeSelections: { owner: { travel: true }, customer: { travel: false } }
  });
  assert.deepEqual(wrongSide.invalidCustomerFields, ['feeSelections.customer.travel']);

  const throughPricebook = quoteFromVNextPricebook({
    pricebook: { defaults, services: [noSelectionMode] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    feeSelections: { customer: { travel: true } },
    currentMonth: 1
  });
  assert.equal(throughPricebook.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(throughPricebook.invalidCustomerFields, ['feeSelections.customer.travel']);
});

test('repair 99: the exported scenario materializer never returns an unvalidated regular line', () => {
  const ready = run('INTERIOR_PAINTING', interiorInputs(), interiorService());
  assert.equal(ready.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(ready));
  const regularLine = line(ready, 'Wall labor');
  assert.deepEqual(materializeScenarioLinesVNext([regularLine], 'mid'), [regularLine]);

  const forgedRate = structuredClone(regularLine);
  forgedRate.calculation.rateCents += 1;
  assert.throws(
    () => materializeScenarioLinesVNext([forgedRate], 'mid'),
    /complete reproducible calculation evidence/
  );
  assert.throws(
    () => materializeScenarioLinesVNext([{ name: 'Fabricated line', amountCents: 1 }], 'mid'),
    /complete reproducible calculation evidence/
  );
  assert.throws(
    () => materializeScenarioLinesVNext([], 'mid'),
    /complete reproducible calculation evidence/
  );

  const ranged = rangedEvidenceLine({ quantity: 2, lowRateCents: 100, highRateCents: 300 });
  const materialized = materializeScenarioLinesVNext([ranged], 'high');
  assert.equal(materialized[0].amountCents, 600);
  assert.equal(materialized[0].calculation.selectedVariant, 'high');
});

test('repair 100: exact concrete dimensions obey the same practical area bound as direct area input', () => {
  const owner = concreteService({
    demolitionPerSqft: 0,
    basePrepPerSqft: 0,
    wireReinforcementPerSqft: 0,
    rebarReinforcementPerSqft: 0,
    stampedMaterialPerSqft: 0,
    disposalPerSqft: 0
  });
  const atLimitInputs = concreteInputs({ length: 10_000, width: 1_000 });
  const atLimit = run('CONCRETE_DRIVEWAY', atLimitInputs, owner);
  assert.equal(atLimit.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(atLimit));
  assert.equal(lineAmount(atLimit, 'Concrete labor'), 6_000_000_000);
  for (const item of atLimit.lineItems) assertLineReproducible(item);

  const aboveLimitInputs = concreteInputs({ length: 10_000, width: 1_000.0001 });
  const customerValidation = validateCustomerInputs(
    'CONCRETE_DRIVEWAY',
    aboveLimitInputs,
    owner.pricing
  );
  assert.equal(customerValidation.ok, false);
  assert.deepEqual(customerValidation.invalidCustomerFields.sort(), ['length', 'width']);
  const aboveLimit = run('CONCRETE_DRIVEWAY', aboveLimitInputs, owner);
  assert.equal(aboveLimit.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(aboveLimit.invalidCustomerFields.sort(), ['length', 'width']);

  const measuredAreaAtLimit = run('CONCRETE_DRIVEWAY', {
    dimensionMethod: 'measured_area_perimeter',
    areaSqft: 10_000_000,
    perimeterLF: 22_000,
    thickness: 4,
    finishType: 'broom',
    demolitionNeeded: false,
    reinforcement: 'none',
    accessDifficulty: 'easy',
    baseNeeded: false
  }, owner);
  assert.equal(measuredAreaAtLimit.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(measuredAreaAtLimit));

  // 125 * 80,000 is exactly 10,000,000; only width changes at its
  // adjacent representable values. The two services share this contract.
  for (const serviceType of ['CONCRETE_DRIVEWAY', 'CONCRETE_PATIO_SLAB']) {
    const configured = { ...owner, serviceType, service: serviceType };
    for (const [width, ready] of [[79999.99999999999, true], [80000, true], [80000.00000000001, false]]) {
      const result = run(serviceType, concreteInputs({ length: 125, width }), configured);
      assert.equal(result.resultType, ready ? 'INSTANT_ESTIMATE_READY' : 'ESTIMATE_REQUIRES_REVIEW', JSON.stringify(result));
      if (ready) {
        assert.equal(lineAmount(result, 'Concrete labor'), 6_000_000_000);
        for (const item of result.lineItems) assertLineReproducible(item);
        assert.equal(sanitizeForCustomerVNext(result).resultType, 'INSTANT_ESTIMATE_READY');
      } else {
        assert.deepEqual(result.invalidCustomerFields.sort(), ['length', 'width']);
        assert.deepEqual(Object.keys(sanitizeForCustomerVNext(result)).sort(), ['customerMessage', 'quoteId', 'resultType']);
      }
    }
    // Independent integer-decimal product: 10,000,000 + 181/500,000,000,000.
    assert.ok(1002n * 9980039920159681n > 10_000_000n * 10n * 100_000_000_000n);
    assert.equal(100.2 * 99800.39920159681, 10_000_000); // rounded binary trap
    const trap = run(serviceType, concreteInputs({ length: 100.2, width: 99800.39920159681 }), configured);
    assert.equal(trap.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(trap.invalidCustomerFields.sort(), ['length', 'width']);
  }

  const status = vNextServiceStatus(owner, defaults);
  assert.equal(status.status, 'QUOTING LIVE', JSON.stringify(status));
});


test('repair 101: positive quantities and factors below machine epsilon retain exact cents without admitting zero or negative values', () => {
  const fixture = repairFixture('ROOFING_REPAIR');
  const inputs = { ...fixture.inputs, affectedArea: fixture.first - 1 };
  const path = `repairHours.${inputs.roofType}.${inputs.repairType}.small`;
  // Hourly rate is 10^15 cents. These literal decimal hours produce 0.01,
  // 0.222..., and amounts immediately around half a cent, independently.
  for (const [hours, expectedCents] of [
    [1e-17, 0],
    [2.2204460492503128e-16, 0],
    [Number.EPSILON, 0],
    [2.2204460492503136e-16, 0],
    [4.999999999999999e-16, 0],
    [5e-16, 1],
    [5.000000000000001e-16, 1]
  ]) {
    const owner = structuredClone(fixture.ownerPricing);
    owner.pricing.laborHourlyRate = 1_000_000_000_000_000;
    owner.pricing.repairHours[inputs.roofType][inputs.repairType].small = hours;
    owner.pricing.repairMaterialAllowance[inputs.roofType][inputs.repairType].small = 1000;
    const result = run('ROOFING_REPAIR', inputs, owner);
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(result));
    const labor = line(result, fixture.laborLine);
    assert.deepEqual(labor.calculation.exactQuantity, oracleEvidence(oracleDecimal(hours)));
    assert.equal(labor.amountCents, expectedCents);
    assertLineReproducible(labor);
    if (expectedCents === 0) assert.equal(labor.noChargeReason, 'rounded_fractional_cent');
    assert.equal(sanitizeForCustomerVNext(result).resultType, 'INSTANT_ESTIMATE_READY');
  }
  for (const hours of [0, -1e-17]) {
    const owner = structuredClone(fixture.ownerPricing);
    owner.pricing.laborHourlyRate = 1_000_000_000_000_000;
    owner.pricing.repairMaterialAllowance[inputs.roofType][inputs.repairType].small = 1000;
    owner.pricing.repairHours[inputs.roofType][inputs.repairType].small = hours;
    const result = run('ROOFING_REPAIR', inputs, owner);
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(result.invalidOwnerFields, [path]);
  }

  const mowingInputs = { yardSqft: 100, sqftMethod: 'exact', serviceFrequency: 'weekly', grassCondition: 'maintained', bagClippings: false, edgingIncluded: false };
  for (const [factor, expectedCents] of [[1e-17, 1], [2.2204460492503128e-16, 22], [Number.EPSILON, 22], [2.2204460492503136e-16, 22]]) {
    const owner = service('LANDSCAPING_MOWING', {
      mowingBaseRatePerSqft: 1_000_000_000_000_000, minimumServiceCharge: 0,
      frequencyMultipliers: { weekly: factor, biweekly: 1, monthly: 1, one_time: 1 },
      overgrowthMultipliers: { maintained: 1, overgrown: 1, severe: 1 }
    });
    const result = run('LANDSCAPING_MOWING', mowingInputs, owner);
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(result));
    assert.equal(lineAmount(result, 'Mowing labor'), expectedCents);
    assertLineReproducible(line(result, 'Mowing labor'));
    assert.equal(sanitizeForCustomerVNext(result).resultType, 'INSTANT_ESTIMATE_READY');
    for (const invalidFactor of [0, -1e-17]) {
      const invalidOwner = structuredClone(owner);
      invalidOwner.pricing.frequencyMultipliers.weekly = invalidFactor;
      const rejected = run('LANDSCAPING_MOWING', mowingInputs, invalidOwner);
      assert.equal(rejected.resultType, 'ESTIMATE_REQUIRES_REVIEW');
      assert.deepEqual(rejected.invalidOwnerFields, ['frequencyMultipliers.weekly']);
    }
  }
});

test('repair 102: request diagnostics retain owner versus customer responsibility across direct and price-book boundaries', () => {
  const owner = interiorService({}, { feeRules: { ...feeRules, travel: 'owner_selected' } });
  const direct = { serviceType: 'INTERIOR_PAINTING', customerInputs: interiorInputs(), ownerPricing: owner, businessDefaults: defaults, callerType: 'owner', currentMonth: 1 };
  const book = { serviceType: 'INTERIOR_PAINTING', customerInputs: interiorInputs(), pricebook: { defaults, services: [owner] }, callerType: 'owner', currentMonth: 1 };
  class Selections { constructor() { this.travel = true; } }
  const customerReview = quoteId => ({ resultType: 'ESTIMATE_REQUIRES_REVIEW', customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.', quoteId });
  for (const [entry, request] of [[generateQuoteVNext, direct], [quoteFromVNextPricebook, book]]) {
    const valid = entry({ ...request, feeSelections: { owner: { travel: true } } });
    assert.equal(valid.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(valid));
    for (const side of ['owner', 'customer']) {
      const result = entry({ ...request, feeSelections: { [side]: new Selections() } });
      assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
      assert.deepEqual(result[side === 'owner' ? 'invalidOwnerFields' : 'invalidCustomerFields'], [`feeSelections.${side}`]);
      assert.deepEqual(result[side === 'owner' ? 'invalidCustomerFields' : 'invalidOwnerFields'], []);
      assert.deepEqual(sanitizeForCustomerVNext(result), customerReview(result.quoteId));
      let getterCalls = 0;
      const selection = {};
      Object.defineProperty(selection, 'travel', { enumerable: true, get() { getterCalls++; return true; } });
      const accessorResult = entry({ ...request, feeSelections: { [side]: selection } });
      assert.equal(getterCalls, 0);
      assert.equal(accessorResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
      const expectedPath = entry === generateQuoteVNext && side === 'owner' ? 'feeSelections.owner.travel' : `quoteRequest.feeSelections.${side}.travel`;
      assert.deepEqual(accessorResult[side === 'owner' ? 'invalidOwnerFields' : 'invalidCustomerFields'], [expectedPath]);
      assert.deepEqual(accessorResult[side === 'owner' ? 'invalidCustomerFields' : 'invalidOwnerFields'], []);
      assert.deepEqual(sanitizeForCustomerVNext(accessorResult), customerReview(accessorResult.quoteId));
    }
  }
  for (const [patch, expected] of [[{ serviceType: 'UNSUPPORTED' }, 'serviceType'], [{ ignored: true }, 'quoteRequest.ignored']]) {
    const result = quoteFromVNextPricebook({ ...book, ...patch });
    assert.deepEqual(result.invalidCustomerFields, [expected]);
    assert.deepEqual(result.invalidOwnerFields, []);
    assert.deepEqual(result.ownerDiagnostics, []);
    assert.deepEqual(sanitizeForCustomerVNext(result), customerReview(result.quoteId));
  }
  const absentService = quoteFromVNextPricebook({ ...book, pricebook: { defaults, services: [] } });
  assert.deepEqual(absentService.invalidOwnerFields, ['services']);
  assert.deepEqual(absentService.invalidCustomerFields, []);
});

test('repair 103: standard and composite lines calculate from original exact multipliers, never their floating-point projections', () => {
  for (const [factor, wallCents, concreteCents] of [
    [1, 10000, 120000],
    [1.1000000000000016, 11000, 132000],
    [1.1000000000000019, 11000, 132000],
    [1.100000000000002, 11000, 132000]
  ]) {
    const paintingOwner = interiorService();
    paintingOwner.pricing.wallHeightLaborMultiplier.standard = factor;
    const painting = run('INTERIOR_PAINTING', interiorInputs(), paintingOwner);
    assert.equal(painting.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(painting));
    const wall = line(painting, 'Wall labor');
    assert.equal(wall.amountCents, wallCents);
    assert.deepEqual(wall.calculation.multipliers[0].exactValue, oracleEvidence(oracleDecimal(factor)));
    assertLineReproducible(wall);
    assert.equal(sanitizeForCustomerVNext(painting).resultType, 'INSTANT_ESTIMATE_READY');

    const concreteOwner = concreteService();
    concreteOwner.pricing.accessMultiplier.easy = factor;
    const concrete = run('CONCRETE_DRIVEWAY', concreteInputs(), concreteOwner);
    assert.equal(concrete.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(concrete));
    const labor = line(concrete, 'Concrete labor');
    assert.equal(labor.amountCents, concreteCents);
    assert.deepEqual(labor.calculation.components[0].multipliers[0].exactValue, oracleEvidence(oracleDecimal(factor)));
    assertLineReproducible(labor);
    assert.equal(sanitizeForCustomerVNext(concrete).resultType, 'INSTANT_ESTIMATE_READY');
  }
});
