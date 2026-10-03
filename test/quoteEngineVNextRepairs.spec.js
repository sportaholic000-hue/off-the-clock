import {exactToNumber as projectExact} from '../server/quote-engine-vnext/exactMath.js';
import {ENGINE_VERSION as currentEngineVersion} from '../server/quote-engine-vnext/engine.js';
import {editVNextService} from '../server/quote-engine-vnext/index.js';
import {explicitUnderlaymentFixtureShares, fixtureIdentity, fixtureOfferings, confirmedFixtureInputs, freeFixture, includedFixture} from './quoteEngineVNextFixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLASS2_DEFINITIONS,
  approveVNextValues,
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
  // Keep these historical defensive/precision fixtures at their explicitly
  // chosen pre-Oct3 quantities. quoteTradeDecisions.spec.mjs tests the new defaults.
  for(const field of ['membraneWasteFactor','paintWasteFactor','primerWasteFactor','prepMaterialWasteFactor','fenceWasteFactor','stampedMaterialWasteFactor'])if(field in configuredPricing && !(field in pricing))configuredPricing[field]=0;
  if('accessoryWasteFactor' in configuredPricing && !('accessoryWasteFactor' in pricing))configuredPricing.accessoryWasteFactor={starterPerLF:0,dripEdgePerLF:0,ridgeCapPerLF:0};
  if('reinforcementWasteFactor' in configuredPricing && !('reinforcementWasteFactor' in pricing))configuredPricing.reinforcementWasteFactor={wire_mesh:0,rebar:0};
  if('layoutLaborMultiplier' in configuredPricing && !('layoutLaborMultiplier' in pricing))configuredPricing.layoutLaborMultiplier={straight:1,diagonal_or_pattern:1};
  if (serviceType === 'ROOFING_REPLACEMENT' && configuredPricing.underlaymentPerSquare && configuredPricing.underlaymentPriceBasis === undefined) {
    configuredPricing.underlaymentPriceBasis = Object.fromEntries(Object.keys(configuredPricing.underlaymentPerSquare).map(key => [key, 'installed_area_sell_price']));
  }
  if (serviceType.startsWith('FLOORING_')) {
    if (pricing.roomSizeThresholds === undefined) configuredPricing.roomSizeThresholds = { smallMaxSqft: 149, mediumMaxSqft: 299 };
    if (configuredPricing.underlaymentPerSqft !== undefined && configuredPricing.underlaymentPriceBasis === undefined) configuredPricing.underlaymentPriceBasis = 'installed_area_sell_price';
  }
  explicitUnderlaymentFixtureShares(serviceType,configuredPricing);
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
  const exact=oracleDecimal(value);
  // Independent decimal long-division projection (production uses binary rounding).
  const scaled=exact.numerator*10n**4096n/exact.denominator;
  return Number(scaled.toString()+'e-4096');
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
  const inputs = {
    areaInputMethod: 'wall_sqft',
    wallAreaSqft: 100,
    wallHeight: 'standard', wallScopeUniform: true,
    surfaceCondition: 'good',
    coats: 1,
    ceilingsIncluded: false,
    trimIncluded: false,
    ...(overrides.ceilingsIncluded === true ? { ceilingCoats: overrides.coats ?? 1 } : {}),
    ...overrides
  };
  return confirmedFixtureInputs(inputs);
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
  const inputs = confirmedFixtureInputs({
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
  });  return confirmedFixtureInputs(inputs);
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
  const inputs = confirmedFixtureInputs({
    sqft: 300,
    sqftMethod: 'exact',
    newFlooringType: 'vinyl_plank',
    existingFloorType: 'none',
    removalNeeded: false,
    roomCount: 1,
    layoutPattern: 'straight',
    stairSteps: 0,
    ...overrides
  });  return confirmedFixtureInputs(inputs);
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
  const inputs = confirmedFixtureInputs({
    linearFeet: 100,
    lfMethod: 'exact',
    fenceType: 'wood',
    fenceHeight: 6,
    gateCount: 0,
    gateWidthTotalLF: 0,
    terrainSlope: 'flat',
    ...overrides
  });  return confirmedFixtureInputs(inputs);
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
  const inputs = {
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
  };  return confirmedFixtureInputs(inputs);
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
    TAX_MATERIALS: { tax: 500, adjustment: 5000, final: 20500, basis: 'pre_tax', order: ['fees', 'seasonal', 'taxability', 'markup', 'minimum', 'tax'] },
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

test('repair 5: positive cent totals remain exact and free complete offerings require classification', () => {
  const expectedRanges = new Map([
    [1, [1, 1, 1]],
    [499, [374, 499, 624]],
    [500, [375, 500, 625]],
    [501, [376, 501, 626]],
    [999, [749, 999, 1249]],
    [1000, [750, 1000, 1250]],
    [1001, [751, 1001, 1251]]
  ]);
  for (const [price, expectedRange] of expectedRanges) {
    const ownerPricing = auditMowP();
    ownerPricing.pricing.mowingBaseRatePerSqft = price;
    const result = run('LANDSCAPING_MOWING', { ...auditMowC(), yardSqft: 1 }, ownerPricing, {
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
    freeFixture(interiorService({
      laborPerWallSqftPerCoat: 0,
      materialPerWallSqftPerCoat: 0,
      minimumJob: 0
    })),
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
  for(const result of [good,fair,poor]){assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(result.inspectionFirst,true);assert.equal(sanitizeForCustomerVNext(result).lowEstimate,undefined);}
  assert.ok(poor.ownerDecisionRequired.some(x=>x.kind==='primer_pricing_contract'));
});

test('Oct3: wall height adjusts ceiling labor with the shared height factor', () => {
  const inputs = interiorInputs({ ceilingsIncluded: true, ceilingAreaSqft: 100 });
  const standard = run('INTERIOR_PAINTING', inputs, interiorService());
  const vaulted = run('INTERIOR_PAINTING', { ...inputs, wallHeight: 'vaulted' }, interiorService());
  assert.equal(lineAmount(standard, 'Ceiling labor'), 10000);
  assert.equal(lineAmount(vaulted, 'Ceiling labor'), 12500);
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
  const base = confirmedFixtureInputs({ roofSqft: 1000, sqftMethod: 'exact', membraneType: 'epdm', replacementMembraneType: 'epdm', existingLayers: 1, accessDifficulty: 'easy', serviceScope: 'full', buildingType: 'residential' });
  assert.equal(run('FLAT_ROOF_REPLACEMENT', base, ownerPricing).resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(run('FLAT_ROOF_REPLACEMENT', confirmedFixtureInputs({ ...base, membraneType: 'unknown' }), ownerPricing).resultType, 'ESTIMATE_REQUIRES_REVIEW');
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
    inputs: confirmedFixtureInputs({ repairType: 'patch', affectedArea: 10, roofType: 'asphalt_shingle', pitch: 'low', stories: 1, leakPresent: false }),
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
    inputs: confirmedFixtureInputs({ repairType: 'seam_patch', affectedArea: 10, membraneType: 'epdm', leakPresent: false, pondingWater: false }),
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
    inputs: confirmedFixtureInputs({ sidingType: 'vinyl', damageLevel: 'minor', affectedArea: 10, stories: 1 }),
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
    const leaking = { ...fixture.inputs, leakPresent: true, leakSourceIdentified: true };
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
  const validContract = validateCustomerInputs('FENCING_INSTALL', validInputs, fenceService().pricing, fenceService());
  assert.equal(validContract.ok, true);

  const heldForOwnerDecision = run('FENCING_INSTALL', validInputs, fenceService());
  assert.equal(heldForOwnerDecision.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(heldForOwnerDecision.invalidCustomerFields, []);

  const supplied = validateCustomerInputs('FENCING_INSTALL', { ...validInputs, cornerCount: 2 }, fenceService().pricing, fenceService());
  assert.equal(supplied.ok, false);
  assert.equal(supplied.invalidCustomerFields.includes('cornerCount'), true);
});

test('repair 16: fencing requires executable post prices but never consumes the obsolete per-gate scalar', () => {
  const gatelessInputs = fenceInputs({ gateWidthTotalLF: undefined });
  const gatelessMissingPrice = fenceService({ gatePrice: undefined });
  const gateless = validateOwnerPricing('FENCING_INSTALL', gatelessInputs, gatelessMissingPrice.pricing, gatelessMissingPrice);
  assert.equal(gateless.missingOwnerFields.includes('gatePrice.wood'), false);

  const zeroWidth = validateCustomerInputs('FENCING_INSTALL', fenceInputs({ gateWidthTotalLF: 0 }), gatelessMissingPrice.pricing, gatelessMissingPrice);
  assert.equal(zeroWidth.ok, true);
  const impossibleWidth = validateCustomerInputs('FENCING_INSTALL', fenceInputs({ gateWidthTotalLF: 4 }), gatelessMissingPrice.pricing, gatelessMissingPrice);
  assert.equal(impossibleWidth.ok, false);
  assert.equal(impossibleWidth.invalidCustomerFields.includes('gateWidthTotalLF'), true);

  const selectedInputs = fenceInputs({ gateCount: 1, gateWidthTotalLF: 4 });
  const selectedMissingPrice = validateOwnerPricing('FENCING_INSTALL', selectedInputs, gatelessMissingPrice.pricing, gatelessMissingPrice);
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
  assert.equal(freeStair.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(freeStair.inspectionFirst, true);

  const pondingPricing = service('FLAT_ROOF_REPAIR', {
    laborHourlyRate: 10000,
    repairMinimum: 0,
    pondingWaterSurcharge: 0,
    patchRepairHours: { epdm: { seam_patch: { small: 1, medium: 2, large: 3 } } },
    patchMaterialAllowance: { epdm: { seam_patch: { small: 1000, medium: 2000, large: 3000 } } }
  });
  const ponding = run('FLAT_ROOF_REPAIR', confirmedFixtureInputs({ repairType: 'seam_patch', affectedArea: 10, membraneType: 'epdm', leakPresent: false, pondingWater: true }), pondingPricing);
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
  assert.equal(omitted.resultType, 'INSTANT_ESTIMATE_READY');
  assert.deepEqual(omitted.options[0].skippedAddons, ['Clipping bagging and disposal', 'Lawn edging']);
  assert.deepEqual(omitted.submittedCustomerInputs, mowingInputs);
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

test('repair 24: customer review wording distinguishes missing measurements and details without exposing owner setup', () => {
  const expected = 'We received your request. Someone will follow up to complete or verify the estimate.';
  const cases = [
    run('INTERIOR_PAINTING', { ...interiorInputs(), wallAreaSqft: undefined }, interiorService(), { callerType: 'customer' }),
    run('INTERIOR_PAINTING', { ...interiorInputs(), coats: 9 }, interiorService(), { callerType: 'customer' }),
    run('INTERIOR_PAINTING', interiorInputs(), interiorService({ laborPerWallSqftPerCoat: -1 }), { callerType: 'customer' }),
    run('INTERIOR_PAINTING', interiorInputs({ areaInputMethod: 'rooms' }), interiorService(), { callerType: 'customer' })
  ];
  for (const result of cases) {
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.ok([expected,'We need to confirm the job measurements or size before providing an estimate. The business will follow up.','We need to confirm a few details about the requested work before providing an estimate. The business will follow up.'].includes(result.customerMessage));
  }
  assert.notEqual(cases[0].customerMessage,cases[2].customerMessage);
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
    accessoryPricingMode: 'itemized', materialAccessoryBasis: 'excludes_itemized_accessories',
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
  const unknown = run('FLAT_ROOF_REPLACEMENT', confirmedFixtureInputs({ roofSqft: 1000, sqftMethod: 'exact', membraneType: 'unknown', replacementMembraneType: 'epdm', existingLayers: 1, accessDifficulty: 'easy', serviceScope: 'full', buildingType: 'residential' }), flat);
  assert.equal(unknown.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(unknown.rangeBufferUsed, undefined);
  assert.equal(unknown.effectiveRangeBufferPercent, undefined);
});

test('repair 28: ordinary tests include every VNext suite and keep the dedicated gate', async () => {
  // npm test runs every spec file (CI's suite and known-failure check); the
  // quote gate runs every quote-engine/price-book spec, found by what it imports.
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts.test, 'node scripts/test-full.mjs');
  assert.equal(pkg.scripts['test:quote'], 'node server/scripts/quote-vnext-gate.js');
  assert.equal(pkg.scripts['test:vnext'], 'node server/scripts/quote-vnext-gate.js');
  const { allSpecFiles, quotePricebookSpecFiles } = await import('../scripts/testSelection.mjs');
  const everything = allSpecFiles(process.cwd()), quote = quotePricebookSpecFiles(process.cwd());
  for (const file of ['test/quoteEngineVNext.spec.js', 'test/quoteEngineVNextAdversarial.spec.js', 'test/quoteEngineVNextRepairs.spec.js',
    'test/fenceAnyHeight.spec.mjs', 'test/quoteTradeDecisions.spec.mjs', 'test/componentPricingRepairs.spec.mjs', 'test/pricebookDurability.spec.mjs']) {
    assert.equal(everything.includes(file), true, file);
    assert.equal(quote.includes(file), true, file);
  }
  assert.equal(quote.some(file => /voice/i.test(file)), false);
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

test('repair 30: permitted zero disposal and explicit included scope stay distinct from unclassified core zero', () => {
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
  const flat = run('FLAT_ROOF_REPLACEMENT', confirmedFixtureInputs({
    roofSqft: 1000,
    sqftMethod: 'exact',
    membraneType: 'epdm', replacementMembraneType: 'epdm',
    existingLayers: 1,
    accessDifficulty: 'easy',
    serviceScope: 'full',
    buildingType: 'residential'
  }), flatOwner, { businessDefaults: disposalDefaults });
  assertFree(flat, 'Flat-roof disposal');
  assert.equal(line(flat, 'Disposal'), undefined);

  const flooringOwner = flooringService({
    removalPerSqft: { carpet: 1 },
    disposalPerSqft: 0
  }, { feeRules: { ...feeRules, disposal: 'when_scope_selected' } });
  const unallocatedFlooring = includedFixture(structuredClone(flooringOwner),{'removalPerSqft.carpet':'laborPerSqft.vinyl_plank'});
  unallocatedFlooring.pricing.removalPerSqft.carpet = 0;
  const selectedRemoval = flooringInputs({existingFloorType:'carpet',removalNeeded:true,removalAreaSqft:300});
  assert.equal(run('FLOORING_INSTALL',selectedRemoval,unallocatedFlooring,{businessDefaults:disposalDefaults}).resultType,'ESTIMATE_REQUIRES_REVIEW');
  const classifiedFlooring = flooringOwner;
  const flooring = run('FLOORING_INSTALL', flooringInputs(confirmedFixtureInputs({
    existingFloorType: 'carpet',
    removalNeeded: true, removalAreaSqft: 300
  })), classifiedFlooring, { businessDefaults: disposalDefaults });
  assert.equal(lineAmount(flooring, 'Existing flooring removal'), 300);
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
  assert.equal(concrete.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(concrete.ownerDecisionRequired.some(x=>x.kind==='existing_slab_demolition_contract'));
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
  assert.equal(siding.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(siding.ownerDecisionRequired.some(x=>x.kind==='existing_siding_removal_contract'));

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

  const mulch = run('LANDSCAPING_MULCH', confirmedFixtureInputs({
    inputMethod: 'yards',
    mulchArea: 2,
    mulchType: 'brown',
    bedCondition: 'clean',
    edgingNeeded: true,
    edgeLF: 50
  }), service('LANDSCAPING_MULCH', {
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
    accessoryPricingMode: 'itemized', materialAccessoryBasis: 'excludes_itemized_accessories',
    starterPerLF: 0,
    dripEdgePerLF: 0,
    ridgeCapPerLF: 0
  }));
  assert.equal(itemized.resultType,'ESTIMATE_REQUIRES_REVIEW');
  for (const path of ['starterPerLF','dripEdgePerLF','ridgeCapPerLF']) assert.ok(itemized.missingOwnerFields.includes(path));

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

test('repair 32: unresolved material cost inputs review while exact flooring thresholds quote', () => {
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
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', String(exactAverage));
    assert.equal(result.options[0].calculationRecord.ruleApplications.find(item => item.name === 'averageRoomComplexityBand').result, exactAverage === 149 ? 'medium' : 'large');
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
    validateCustomerInputs('FLAT_ROOF_REPLACEMENT', confirmedFixtureInputs({
      roofSqft: 1000,
      sqftMethod: 'exact',
      membraneType: 'epdm', replacementMembraneType: 'epdm',
      existingLayers: 1,
      accessDifficulty: 'easy',
      serviceScope: 'full',
      buildingType: 'residential',
      partialAreaSqft: 100
    }), {}),
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
    validateCustomerInputs('LANDSCAPING_MULCH', confirmedFixtureInputs({
      inputMethod: 'yards',
      mulchArea: 3,
      mulchDepth: 3,
      mulchType: 'brown',
      bedCondition: 'clean',
      edgingNeeded: false
    }), {}),
    ['mulchDepth']
  ]);
  checks.push([
    'clean mulch bed preparation and unselected edging',
    validateCustomerInputs('LANDSCAPING_MULCH', confirmedFixtureInputs({
      inputMethod: 'yards',
      mulchArea: 3,
      mulchType: 'brown',
      bedCondition: 'clean',
      bedSqft: 100,
      edgingNeeded: false,
      edgeLF: 20
    }), {}),
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

test('repair 35: decking distinguishes missing scope from confirmed zero and preserves the per-sheet explanation without its owner rate', () => {
  const ownerPricing = roofService({ deckingPerSheet: 12345 }, {priceBasisByCategory: sellBasis});
  const approvedDriver = 'Any additional decking is priced per sheet and confirmed on site.';

  const missingScope = run('ROOFING_REPLACEMENT', roofInputs(), ownerPricing);
  assert.equal(missingScope.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(missingScope.priceDrivers.includes(approvedDriver), true);
  assert.equal(missingScope.calculationRecord.options[0].measurements.some(item => item.name === 'deckingSheets'), false);
  assert.equal(JSON.stringify(missingScope).includes('no replacement sheet count was confirmed'), false);

  const confirmedZero = run('ROOFING_REPLACEMENT', roofInputs({ deckingSheets: 0 }), ownerPricing);
  assert.equal(confirmedZero.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(line(confirmedZero, 'Decking replacement').noChargeReason, 'zero_physical_scope');
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
  const customerInputs = { ...fixture.inputs, affectedArea: 75, leakPresent: true, leakSourceIdentified: true };
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
    serviceId: result.serviceId,
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
  assert.equal(exteriorLabor.reviewOnly, true);
  assert.match(exteriorLabor.help, /this legacy scalar alone is incomplete/);
  assert.match(exteriorLabor.help, /Fence and painting offering/);
  assert.ok(exterior.offeringRateFields.installed);
  assert.ok(exterior.offeringRateFields.itemized);

  for (const serviceMetadata of metadata) {
    for (const factor of serviceMetadata.class2Fields) {
      assert.equal(/physical quantity assumption/i.test(factor.help), false, serviceMetadata.serviceType + '.' + factor.name);
      assert.match(factor.help, /Owner-editable/);
    }
  }
  const roofing = metadata.find(item => item.serviceType === 'ROOFING_REPLACEMENT');
  const decking = roofing.pricingFields.find(item => item.field === 'deckingPerSheet');
  assert.match(decking.help, /Only confirmed sell-price units may be disclosed/);

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
  assert.equal(freeStairCustomer.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(Object.keys(freeStairCustomer).sort(),['customerMessage','quoteId','resultType']);

  const rangedCustomer = run('INTERIOR_PAINTING', interiorInputs(), interiorService(), {
    callerType: 'customer',
    businessDefaults: { ...defaults, rangeBufferPercent: 17 }
  });
  assert.equal(rangedCustomer.rangeBufferUsed, undefined);
  assert.equal(Object.hasOwn(rangedCustomer, 'effectiveRangeBufferPercent'), false);
  assert.equal(rangedCustomer.options[0].rangeBufferUsed, undefined);
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
    request: { serviceType: 'EXTERIOR_PAINTING', serviceId: internal.serviceId, customerInputs, source: 'owner_preview' },
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
  const flat = run('FLAT_ROOF_REPLACEMENT', confirmedFixtureInputs({
    roofSqft: 2000,
    sqftMethod: 'exact',
    membraneType: 'epdm', replacementMembraneType: 'epdm',
    existingLayers: 2,
    accessDifficulty: 'easy',
    serviceScope: 'partial',
    partialPercent: 25,
    buildingType: 'residential'
  }), flatOwner);
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
  assert.equal(exterior.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(exterior.ownerDecisionRequired.some(x=>x.kind==='exterior_coating_scope_contract'));
  assert.equal(sanitizeForCustomerVNext(exterior).lowEstimate,undefined);

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

  const mulch = run('LANDSCAPING_MULCH', confirmedFixtureInputs({
    inputMethod: 'sqft',
    mulchArea: 1080,
    mulchDepth: 3,
    mulchType: 'brown',
    bedCondition: 'clean',
    edgingNeeded: false
  }), service('LANDSCAPING_MULCH', {
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

  const planting = run('LANDSCAPING_PLANTING', confirmedFixtureInputs({
    plantsBySize: { small: 1, medium: 1, large: 0 },
    bedCondition: 'clean',
    mulchNeeded: true,
    mulchYards: 2,
    mulchType: 'brown'
  }), service('LANDSCAPING_PLANTING', {
    plantingLaborPerPlant: { small: 1000, medium: 2000, large: 3000 },
    plantMaterialAllowance: { small: 2000, medium: 4000, large: 6000 },
    minimumServiceCharge: 0,
    mulchMaterialPerYard: { brown: 5000 },
    mulchInstallLaborPerYard: 3000
  }));
  close(getDerivation(planting, 'plantingMulchOrderYards').result, 2, 'planting mulch order yards');

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
    assert.deepEqual(fencing.class2Fields.map(field=>field.name), ['postSpacingLF','fenceWasteFactor','terrainLaborMultiplier'], serviceType);
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
    for(let index=0;index<cases.length;index++)cases[index]=confirmedFixtureInputs(cases[index]);
    const reviewScope=c=>serviceType==='EXTERIOR_PAINTING'||(serviceType==='FLAT_ROOF_REPLACEMENT'&&c.buildingType==='commercial')||(serviceType.startsWith('FLOORING_')&&c.stairSteps>0)||(serviceType.startsWith('CONCRETE_')&&c.demolitionNeeded)||(serviceType==='SIDING_REPLACEMENT'&&c.oldSidingRemoval);
    for(const c of cases.filter(reviewScope)){
      const result=run(serviceType,c,ownerPricing);assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW',JSON.stringify(result));assert.ok(result.inspectionFirst);assert.ok(result.ownerDecisionRequired.length);assert.deepEqual(result.submittedCustomerInputs,c);assert.equal(sanitizeForCustomerVNext(result).lowEstimate,undefined);
    }
    cases=cases.filter(c=>!reviewScope(c));
    if(!cases.length){assert.equal(vNextServiceStatus(ownerPricing,defaults).status,'NEEDS PRICING');return;}
    const dormant=serviceType==='LANDSCAPING_PLANTING'?['mulchOverageFactor']:serviceType==='FLAT_ROOF_REPLACEMENT'?['insulationPerSqft']:serviceType.startsWith('FLOORING_')?['perStepPrice']:serviceType.startsWith('CONCRETE_')?['demolitionPerSqft','disposalPerSqft']:serviceType==='SIDING_REPLACEMENT'?['removalPerSqft','disposalPerSqft']:[];
    knownUnconsumed=[...knownUnconsumed,...dormant.filter(path=>Object.hasOwn(ownerPricing.pricing,path))];
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
              if (calculation.quantity !== 0) recordConsumedPricingPath(calculation.ratePath, customerInputs, internal.calculationRecord);
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
        [...(review.missingCustomerFields || []), ...(review.invalidCustomerFields || [])].some(path=>path===field||path.startsWith(field+'.')),
        true,
        label
      );
    }
    const validAlternative = (definition, original) => {
      if (definition.type === 'confirmed_facts') { const next=structuredClone(original); next[Object.keys(next)[0]].status='unknown'; return next; }
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
      if (definition.type === 'orthogonal_outline') return original.map(point=>({...point,x:point.x*2}));
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
      const parts = path.split('.');
      const segments = /^installed(?:Labor|Materials)Percent\./.test(path)?[parts[0],parts.slice(1).join('.')]:parts;
      const leaf = segments.pop();
      const parent = segments.reduce((current, segment) => current[segment], target);
      parent[leaf] = value;
    };
    const deletePricingLeaf = (target, path) => {
      const parts = path.split('.');
      const segments = /^installed(?:Labor|Materials)Percent\./.test(path)?[parts[0],parts.slice(1).join('.')]:parts;
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
      // Owner ruling: minima, physical-zero factors, optional add-ons and disposal
      // retain zero semantics. Indispensable selected rates need classification.
      const permittedZero = !!class2 || /^installed(?:Labor|Materials)Percent\./.test(path) || /^(minimumJob|minimumServiceCharge|repairMinimum|disposalPerSquare|disposalPerSqft|disposalPerLF|baggingSurchargePercent|edgingPerLinearFoot|pondingWaterSurcharge|haulAwayFee)$|\.disposalFlat$/.test(path) ||
        knownUnconsumed.includes(path);
      if (!permittedZero) {
        // Optional work that has not been priced does not disable complete
        // base work. The selected-scope assertion below still requires review.
        const optionalPrices={
          INTERIOR_PAINTING:['ceilingLaborPerSqftPerCoat','ceilingMaterialPerSqftPerCoat','trimLaborPerLF','trimMaterialPerLF'],
          CONCRETE_DRIVEWAY:['basePrepPerSqft','wireReinforcementPerSqft','rebarReinforcementPerSqft','stampedMaterialPerSqft'],
          CONCRETE_PATIO_SLAB:['basePrepPerSqft','wireReinforcementPerSqft','rebarReinforcementPerSqft','stampedMaterialPerSqft'],
          LANDSCAPING_MULCH:['bedPrepLaborPerSqft'],LANDSCAPING_SOD:['groundPrepPerSqft'],
          LANDSCAPING_PLANTING:['bedPrepLaborPerSqft','mulchMaterialPerYard','mulchInstallLaborPerYard']
        };
        const productOnly=['FLOORING_INSTALL','FLOORING_REPLACEMENT','ROOFING_REPLACEMENT'].includes(serviceType)&&zeroStatus.productCoverage?.some(product=>product.configurationComplete)&&zeroStatus.productCoverage.some(product=>!product.configurationComplete);
        const leadOnly=optionalPrices[serviceType]?.includes(path.split('.')[0])===true||productOnly;
        assert.equal(zeroStatus.status,leadOnly?'QUOTING LIVE':'NEEDS PRICING',zeroLabel);
        if(leadOnly)assert.ok(productOnly||zeroStatus.scopeCoverage.some(scope=>!scope.configurationComplete&&/leads/.test(scope.message)),zeroLabel);
        else assert.ok(zeroStatus.missingOwnerFields.includes(path),zeroLabel);
        const sample=consumedPricingSamples.get(path);
        if(sample){
          const held=quoteFromVNextPricebook({pricebook:{defaults,services:[zeroed]},serviceType,customerInputs:sample.customerInputs,callerType:'owner',currentMonth:1});
          assert.equal(held.resultType,'ESTIMATE_REQUIRES_REVIEW',zeroLabel+': '+JSON.stringify(held));
          assert.ok(held.missingOwnerFields.includes(path),zeroLabel);
          assert.equal(sanitizeForCustomerVNext(held).lowEstimate,undefined);
        }
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
      if (path === 'materialAccessoryBasis') return 'unconfirmed';
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
    accessoryPricingMode: 'itemized', materialAccessoryBasis: 'excludes_itemized_accessories',
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
        roofRepairCases.push({ ...roofRepair.inputs, pitch, stories, affectedArea, leakPresent: affectedArea === 25, leakSourceIdentified: true });
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
          membraneType: 'epdm', replacementMembraneType: 'epdm',
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
      flatRepairCases.push({ ...flatRepair.inputs, affectedArea, pondingWater, leakPresent: affectedArea === 10, leakSourceIdentified: true });
    }
  }
  assertReadyCases('FLAT_ROOF_REPAIR', flatRepair.ownerPricing, flatRepairCases.flatMap(c=>['easy','moderate','difficult'].map(accessDifficulty=>({...c,accessDifficulty}))));

  const interiorCases = [];
  for (const wallHeight of ['standard', 'high', 'vaulted']) {
    for (const coats of [1, 2, 3]) {
      for (const ceilingsIncluded of [false, true]) {
        for (const trimIncluded of [false, true]) {
          interiorCases.push({
            areaInputMethod: 'wall_sqft',
            wallAreaSqft: 1000,
            wallHeight, wallScopeUniform: true,
            surfaceCondition: 'good',
            coats,
            ceilingsIncluded,
            ...(ceilingsIncluded ? { ceilingAreaSqft: 500, ceilingCoats: coats } : {}),
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
              removalNeeded, ...(removalNeeded?{removalAreaSqft:sqft}:{}),
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
              removalNeeded: true, removalAreaSqft:sqft,
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
          for (const dimensionMethod of ['exact', 'measured_outline']) {
            const demolitionNeeded = index % 2 === 0;
            cases.push({
              dimensionMethod,
              ...(dimensionMethod === 'exact'
                ? { length: 20, width: 10 }
                : { outlinePoints:[{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:0,y:10},{x:0,y:0}] }),
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
  assertReadyCases('LANDSCAPING_MULCH', mulchOwner, mulchCases.flatMap(c=>['easy','moderate','difficult'].map(accessDifficulty=>({...c,accessDifficulty}))));

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
  assertReadyCases('LANDSCAPING_PLANTING', plantingOwner, plantingCases.flatMap(c=>['easy','moderate','difficult'].map(accessDifficulty=>({...c,accessDifficulty}))));

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
        sidingRepairCases.push(confirmedFixtureInputs({ sidingType, damageLevel: 'minor', affectedArea, stories }));
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
  const ownerPricing = freeFixture(interiorService({
    laborPerWallSqftPerCoat: 0,
    materialPerWallSqftPerCoat: 0
  }, {
    peakMonths: [1],
    peakSurchargePercent: 25
  }));
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
    laborPerWallSqftPerCoat: Number.MAX_SAFE_INTEGER - 1,
    materialPerWallSqftPerCoat: 1
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
      laborPerWallSqftPerCoat: representableRate - 1,
      materialPerWallSqftPerCoat: 1
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
  const roundedRange = (totalCents, minimumCents, config, taxCents) => {
    const minimumFloorCents = config.taxMode === 'TAX_ALL'
      ? minimumCents + Math.round(minimumCents * config.taxPercent / 100)
      : minimumCents + (config.taxMode === 'TAX_MATERIALS' && minimumCents > 0 ? taxCents : 0);
    if (totalCents === 0) {
      return { lowCents: 0, midCents: 0, highCents: 0, minimumFloorCents };
    }
    if(totalCents===minimumFloorCents&&minimumFloorCents>0)return {lowCents:totalCents,midCents:totalCents,highCents:totalCents,minimumFloorCents};
    const increment = 1;
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
      minimumAdjustmentCents = Math.max(0, minimumCents - lines.reduce((sum, item) => sum + item.amountCents, 0));
      if (minimumAdjustmentCents > 0) lines.push({ category: 'minimum_adjustment', amountCents: minimumAdjustmentCents });
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
      minimumBasis = 'pre_tax';
      order = ['fees', 'seasonal', 'taxability', 'markup', 'minimum', 'tax'];
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
      range: roundedRange(finalTotalCents, minimumCents, config, taxCents)
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
                      (rangeBufferPercent===0 || Math.floor(expected.range.lowCents/100)*100<expected.range.minimumFloorCents) ? [expected.range.lowCents / 100, expected.range.midCents / 100, expected.range.highCents / 100] : [Math.floor(expected.range.lowCents/100),Math.floor((expected.range.midCents+50)/100),Math.ceil(expected.range.highCents/100)],
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
  const unknownFlat = captureReview(() => calculateServiceVNext('FLAT_ROOF_REPLACEMENT', confirmedFixtureInputs({
    roofSqft: 1000,
    sqftMethod: 'exact',
    membraneType: 'unknown', replacementMembraneType: 'epdm',
    existingLayers: 'unknown',
    accessDifficulty: 'easy',
    serviceScope: 'full',
    buildingType: 'residential'
  }), flatReplacementPricing));
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
    flatRepair.ownerPricing.pricing,
    {ownerPricing:flatRepair.ownerPricing}
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

  const gatelessFence = captureReview(() => calculateServiceVNext('FENCING_INSTALL', fenceInputs(), fenceService().pricing, {ownerPricing:fenceService()}));
  assert.deepEqual(gatelessFence.ownerDecisionRequired.map(item => item.kind), [
    'post_geometry_contract',
    'mixed_charge_allocation'
  ]);
  const gatedFence = captureReview(() => calculateServiceVNext(
    'FENCING_INSTALL',
    fenceInputs({ gateCount: 1, gateWidthTotalLF: 4 }),
    fenceService().pricing,
    {ownerPricing:fenceService()}
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
  const threshold = calculateServiceVNext(
    'FLOORING_INSTALL',
    flooringInputs({ sqft: 300, roomCount: 2 }),
    thresholdOwner.pricing,
    { ownerPricing: thresholdOwner }
  );
  assert.equal(threshold.ruleApplications.find(item => item.name === 'averageRoomComplexityBand').result, 'medium');

  const itemizedRoofOwner = roofService({
    accessoryPricingMode: 'itemized', materialAccessoryBasis: 'excludes_itemized_accessories',
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
        if(fee==='permit'&&mode==='customer_selected'){assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(result.ownerDiagnostics.some(d=>d.path==='feeRules.permit'));continue;}
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
      if(fee==='permit'&&mode==='customer_selected'){assert.ok(missingSelection.ownerDiagnostics.some(d=>d.path==='feeRules.permit'));continue;}
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
    [flooringInputs(confirmedFixtureInputs({ removalNeeded: true, existingFloorType: 'none' })), 'existingFloorType'],
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
    materialPerWallSqftPerCoat: 1
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
    { amountCents: 0, noCharge: true, noChargeReason: 'explicitly_free' }
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

  const mulchInputs = confirmedFixtureInputs({
    inputMethod: 'yards', mulchArea: 0.01, mulchType: 'brown',
    bedCondition: 'clean', edgingNeeded: false
  });
  const subCent = run('LANDSCAPING_MULCH', mulchInputs, service('LANDSCAPING_MULCH', {
    mulchMaterialPerYard: { brown: 1 },
    mulchInstallLaborPerYard: 1,
    minimumServiceCharge: 0
  }));
  assert.equal(subCent.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(subCent.invalidOwnerFields.includes('mulchMaterialPerYard.brown'), true, JSON.stringify(subCent));
  assert.equal(subCent.invalidOwnerFields.includes('mulchInstallLaborPerYard'), true, JSON.stringify(subCent));

  const intentionallyFree = run('LANDSCAPING_MULCH', mulchInputs, freeFixture(service('LANDSCAPING_MULCH', {
    mulchMaterialPerYard: { brown: 0 },
    mulchInstallLaborPerYard: 0,
    minimumServiceCharge: 0
  })));
  assert.equal(intentionallyFree.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(intentionallyFree));
  assert.deepEqual([intentionallyFree.lowEstimate, intentionallyFree.midEstimate, intentionallyFree.highEstimate], [0, 0, 0]);
  assert.equal(intentionallyFree.lineItems.every(item => item.noChargeReason === 'explicitly_free'), true);

  const ranged = rangedEvidenceLine({ quantity: 2, lowRateCents: 0, highRateCents: 100 });
  const [freeLow] = materializeScenarioLinesVNext([ranged], 'low');
  assert.deepEqual(
    { amountCents: freeLow.amountCents, noCharge: freeLow.noCharge, noChargeReason: freeLow.noChargeReason },
    { amountCents: 0, noCharge: true, noChargeReason: 'explicitly_free' }
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
  Object.assign(aiDraft, auditApprove(aiDraft,Object.keys(aiDraft.pricing)));
  const before = structuredClone(aiDraft.confirmedFields);
  const aiPricebook = {
    defaults: { ...defaults, overheadFixed: 12345 },
    services: [aiDraft]
  };
  const requiredRuleConfirmations = [
    'knownOfferings',
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
  assert.deepEqual([preview.lowEstimate, preview.midEstimate, preview.highEstimate], [291, 323, 356]);
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
  Object.assign(confirmed,auditApprove(confirmed,requiredRuleConfirmations));
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
  delete manualService.approvedValues;
  const manualQuote = quoteFromVNextPricebook({
    pricebook: { ...aiPricebook, services: [manualService] },
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    callerType: 'owner',
    currentMonth: 1
  });
  assert.equal(manualQuote.resultType, 'ESTIMATE_REQUIRES_REVIEW', JSON.stringify(manualQuote));
  assert.ok(manualQuote.missingOwnerFields.includes('source'));
  assert.ok(manualQuote.invalidOwnerFields.includes('origin'));
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
      layoutPattern: 'diagonal_or_pattern', stairSteps: 0
    }),
    expectedPaths: ['laborPerSqft.vinyl_plank', 'roomComplexityMultiplier.medium']
  });

  const concreteOverflow = includedFixture(concreteService({
    laborPerSqft: 1_000_000_000,
    demolitionPerSqft: 0,
    basePrepPerSqft: 1,
    wireReinforcementPerSqft: 0,
    rebarReinforcementPerSqft: 0,
    stampedMaterialPerSqft: 0
  }),{wireReinforcementPerSqft:'concreteCostPerCubicYard',rebarReinforcementPerSqft:'concreteCostPerCubicYard',stampedMaterialPerSqft:'concreteCostPerCubicYard'});
  assertBlockedAtStatusAndQuote({
    serviceType: 'CONCRETE_DRIVEWAY',
    ownerPricing: concreteOverflow,
    customerInputs: concreteInputs({
      length: 10_000, width: 1_000, thickness: 24,
      demolitionNeeded: false,
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

  const sidingOverflow = includedFixture(service('SIDING_REPLACEMENT', {
    laborPerSqft: { vinyl: 4_000_000_000 },
    materialPerSqft: { vinyl: 0 },
    minimumJob: 0,
    removalPerSqft: 0,
    disposalPerSqft: 0
  }),{'materialPerSqft.vinyl':'laborPerSqft.vinyl'});
  assertBlockedAtStatusAndQuote({
    serviceType: 'SIDING_REPLACEMENT',
    ownerPricing: sidingOverflow,
    customerInputs: {
      areaInputMethod: 'sqft', sidingAreaSqft: 2_000_000, sidingType: 'vinyl',
      stories: 3, oldSidingRemoval: false, trimIncluded: false
    },
    expectedPaths: ['laborPerSqft.vinyl', 'storyMultiplier.3']
  });

  const ordinaryConcrete = includedFixture(concreteService({
    demolitionPerSqft: 0,
    basePrepPerSqft: 1,
    wireReinforcementPerSqft: 0,
    rebarReinforcementPerSqft: 0,
    stampedMaterialPerSqft: 0
  }),{wireReinforcementPerSqft:'concreteCostPerCubicYard',rebarReinforcementPerSqft:'concreteCostPerCubicYard',stampedMaterialPerSqft:'concreteCostPerCubicYard'});
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
  const request = { serviceType: 'INTERIOR_PAINTING', serviceId: internalReview.serviceId, customerInputs: structuredClone(internalReview.submittedCustomerInputs), contact: { name: 'Local test owner' } };
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
    () => buildInternalLeadVNext({ request: { ...request, callback: () => {} }, internalResult: internalReview }),
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

test('repair 69: equal partial measurements quote; unconfigured flooring overlays still require setup', () => {
  const roofOwner = roofService();
  const roofBoth = run('ROOFING_REPLACEMENT', roofInputs({
    serviceScope: 'partial',
    partialAreaSqft: 500,
    partialPercent: 50
  }), roofOwner);
  assert.equal(roofBoth.resultType, 'INSTANT_ESTIMATE_READY');
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
  const flatBase = confirmedFixtureInputs({
    roofSqft: 2000, sqftMethod: 'exact', membraneType: 'epdm', replacementMembraneType: 'epdm',
    existingLayers: 2, accessDifficulty: 'easy', serviceScope: 'partial',
    buildingType: 'residential'
  });
  const flatBoth = run('FLAT_ROOF_REPLACEMENT', {
    ...flatBase, partialAreaSqft: 500, partialPercent: 25
  }, flatOwner);
  assert.equal(flatBoth.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(run('FLAT_ROOF_REPLACEMENT', {
    ...flatBase, partialAreaSqft: 500
  }, flatOwner).resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(run('FLAT_ROOF_REPLACEMENT', {
    ...flatBase, partialPercent: 25
  }, flatOwner).resultType, 'INSTANT_ESTIMATE_READY');

  const overlay = run('FLOORING_INSTALL', flooringInputs(confirmedFixtureInputs({
    existingFloorType: 'tile',
    removalNeeded: false
  })), flooringService());
  assert.equal(overlay.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(overlay.ownerDecisionRequired.map(item => item.kind), ['floor_overlay_contract']);
  assert.equal(run('FLOORING_INSTALL', flooringInputs(confirmedFixtureInputs({
    existingFloorType: 'none',
    removalNeeded: false
  })), flooringService()).resultType, 'INSTANT_ESTIMATE_READY');
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
    mulchMaterialPerYard: { brown: 1 },
    mulchInstallLaborPerYard: 0,
    minimumServiceCharge: 0,
    bedPrepLaborPerSqft: { needs_weeding: 100, overgrown: 100 },
    edgingPerLinearFoot: 200
  }, {
    peakMonths: [1],
    peakSurchargePercent: 10
  });
  const classifiedMulch=includedFixture(mulchOwner,{mulchInstallLaborPerYard:'bedPrepLaborPerSqft.needs_weeding'});
  const mulch = run('LANDSCAPING_MULCH', confirmedFixtureInputs({
    inputMethod: 'yards',
    mulchArea: 1,
    mulchType: 'brown',
    bedCondition: 'needs_weeding',
    bedSqft: 100,
    edgingNeeded: true,
    edgeLF: 10
  }), classifiedMulch);
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
    mulchNeeded: false,accessDifficulty:'easy'
  }, includedFixture(service('LANDSCAPING_PLANTING', {
    plantingLaborPerPlant: { small: 1000, medium: 2000, large: 3000 },
    plantMaterialAllowance: { small: 1, medium: 1, large: 1 },
    minimumServiceCharge: 0,
    bedPrepLaborPerSqft: { needs_weeding: 100, overgrown: 100 },
    mulchMaterialPerYard: { brown: 0 },
    mulchInstallLaborPerYard: 0
  }, {
    peakMonths: [1],
    peakSurchargePercent: 10
  }),{}));
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

  const isolatedInternal = run('INTERIOR_PAINTING', interiorInputs(), isolatedTier);
  auditInspect(isolatedInternal);
  assert.deepEqual(isolatedInternal.options.map(option => option.tierName), ['Good']);
  assert.deepEqual(isolatedInternal.calculationRecord.ownerConfiguration.tiers[1].overrides.laborPerWallSqftPerCoat, { invalidValueType: 'function' });
  assert.deepEqual(isolatedInternal.failedTierDiagnostics[0].invalidOwnerFields, ['laborPerWallSqftPerCoat']);
  const validTierControl = interiorService({}, {
    tiers: [{ name: 'Good', overrides: {} }, { name: 'Unsafe', overrides: { laborPerWallSqftPerCoat: 100 } }]
  });
  const control = run('INTERIOR_PAINTING', interiorInputs(), validTierControl);
  auditInspect(control);
  assert.deepEqual(control.options.map(option => option.tierName), ['Good', 'Unsafe']);
  assert.equal(control.calculationRecord.ownerConfiguration.tiers[1].overrides.laborPerWallSqftPerCoat, 100);
  assert.deepEqual(control.failedTierDiagnostics, []);

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
  Object.assign(aiService,auditApprove(aiService,confirmationFields));
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

  let skippedCalls = 0;
  assert.throws(
    () => calculateServiceVNext(
      'FLAT_ROOF_REPAIR',
      { ...flatRepair.inputs, pondingWater: true },
      flatRepair.ownerPricing.pricing,
      { ownerPricing: flatRepair.ownerPricing, skipAddon() { skippedCalls++; throw new Error('callback failed'); } }
    ),
    error => {
      assert.equal(error.name, 'QuoteReviewError');
      assert.deepEqual(error.invalidOwnerFields, ['addonDisclosureContext']);
      return true;
    }
  );
  assert.equal(skippedCalls, 1);
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

  const measuredQuote = run('LANDSCAPING_MULCH', confirmedFixtureInputs({
    inputMethod: 'yards',
    mulchArea: 1.005,
    mulchType: 'brown',
    bedCondition: 'clean',
    edgingNeeded: false
  }), ownerPricing);
  assert.equal(measuredQuote.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(measuredQuote));
  assert.equal(lineAmount(measuredQuote, 'Mulch material'), 101);
  assert.equal(lineAmount(measuredQuote, 'Mulch installation labor'), 101);
  for (const item of scenario(measuredQuote).lineItems) assertLineReproducible(item);
  assert.deepEqual(
    line(measuredQuote, 'Mulch installation labor').calculation.exactUnroundedCents,
    { numerator: '201', denominator: '2' }
  );

  const derivedQuote = run('LANDSCAPING_MULCH', confirmedFixtureInputs({
    inputMethod: 'sqft',
    mulchArea: 325.62,
    mulchDepth: 1,
    mulchType: 'brown',
    bedCondition: 'clean',
    edgingNeeded: false
  }), ownerPricing);
  assert.equal(derivedQuote.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(derivedQuote));
  assert.equal(lineAmount(derivedQuote, 'Mulch material'), 101);
  assert.equal(lineAmount(derivedQuote, 'Mulch installation labor'), 101);
  assert.deepEqual(
    derivedQuote.calculationRecord.options[0].quantityDerivations.find(item => item.name === 'installedMulchYards').exactResult,
    { numerator: '201', denominator: '200' }
  );
  for (const item of scenario(derivedQuote).lineItems) assertLineReproducible(item);

  const belowHalf = run('LANDSCAPING_MULCH', confirmedFixtureInputs({
    inputMethod: 'yards',
    mulchArea: 1.0049999999999997,
    mulchType: 'brown',
    bedCondition: 'clean',
    edgingNeeded: false
  }), ownerPricing);
  assert.equal(belowHalf.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(belowHalf));
  assert.equal(lineAmount(belowHalf, 'Mulch material'), 100, 'a true value below half a cent must not be epsilon-rounded up');
  assert.equal(lineAmount(belowHalf, 'Mulch installation labor'), 100);
});

test('repair 93: exact percentage arithmetic governs seasonal, markup, tax, add-on, and customer-range rounding', () => {
  const pricedInterior = interiorService({
    laborPerWallSqftPerCoat: 100,
    materialPerWallSqftPerCoat: 1
  }, {
    peakMonths: [1],
    peakSurchargePercent: 0.5
  });
  const percentageQuote = run('INTERIOR_PAINTING', interiorInputs({
    wallAreaSqft: 1,
    coats: 1,
    wallHeight: 'standard', wallScopeUniform: true,
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
    wallHeight: 'standard', wallScopeUniform: true,
    ceilingsIncluded: false,
    trimIncluded: false
  }), interiorService({
    laborPerWallSqftPerCoat: 99,
    materialPerWallSqftPerCoat: 1
  }), {
    businessDefaults: { ...defaults, rangeBufferPercent: 0.5 }
  });
  assert.deepEqual(
    { low: rangeQuote.lowEstimate, mid: rangeQuote.midEstimate, high: rangeQuote.highEstimate },
    { low: 1, mid: 1, high: 2 }
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
  Object.assign(confirmedAI,auditApprove(confirmedAI));
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
    [1000, 100000],
    [1000.0000000000001, 100000],
    [1000.01, 100001],
    [1200, 120000]
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

  // The former commercial cap is superseded; invalid negative markup still reviews.
  const invalidMarkup = { ...defaults, markupPercent: -1, rangeBufferPercent: 0 };
  const validation = validateBusinessDefaults(invalidMarkup);
  assert.equal(validation.ok, false);
  assert.deepEqual(validation.invalidFields, ['markupPercent']);
  const rejected = run('INTERIOR_PAINTING', interiorInputs(), interiorService(), {
    businessDefaults: invalidMarkup
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
  const owner = includedFixture(concreteService({
    demolitionPerSqft: 0,
    basePrepPerSqft: 1,
    wireReinforcementPerSqft: 0,
    rebarReinforcementPerSqft: 0,
    stampedMaterialPerSqft: 0,
    disposalPerSqft: 0
  }),{wireReinforcementPerSqft:'concreteCostPerCubicYard',rebarReinforcementPerSqft:'concreteCostPerCubicYard',stampedMaterialPerSqft:'concreteCostPerCubicYard'});
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
  assert.equal(measuredAreaAtLimit.submittedCustomerInputs.areaSqft,10000000);

  // 125 * 80,000 is exactly 10,000,000; only width changes at its
  // adjacent representable values. The two services share this contract.
  for (const serviceType of ['CONCRETE_DRIVEWAY', 'CONCRETE_PATIO_SLAB']) {
    const configured = includedFixture(concreteService(structuredClone(owner.pricing), serviceType), structuredClone(owner.zeroPricePolicy.includedPrices));
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
    for (const side of ['owner', 'customer']) {
      const matchingRequest = structuredClone(request);
      const matchingService = entry === generateQuoteVNext ? matchingRequest.ownerPricing : matchingRequest.pricebook.services[0];
      matchingService.feeRules.travel = side === 'owner' ? 'owner_selected' : 'customer_selected';
      const valid = entry({ ...matchingRequest, feeSelections: { [side]: { travel: true } } });
      assert.equal(valid.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(valid));
      assert.equal(sanitizeForCustomerVNext(valid).resultType, 'INSTANT_ESTIMATE_READY');
      // Keep the matching fee mode and every other request field fixed.
      const result = entry({ ...matchingRequest, feeSelections: { [side]: new Selections() } });
      assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
      assert.deepEqual(result[side === 'owner' ? 'invalidOwnerFields' : 'invalidCustomerFields'], [`feeSelections.${side}`]);
      assert.deepEqual(result[side === 'owner' ? 'invalidCustomerFields' : 'invalidOwnerFields'], []);
      assert.deepEqual(sanitizeForCustomerVNext(result), customerReview(result.quoteId));
      let getterCalls = 0;
      const selection = {};
      Object.defineProperty(selection, 'travel', { enumerable: true, get() { getterCalls++; return true; } });
      const accessorResult = entry({ ...matchingRequest, feeSelections: { [side]: selection } });
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

// September audit repairs 104-127. Rates below are internal fixtures, not owner defaults.
const auditReady='INSTANT_ESTIMATE_READY',auditReview='ESTIMATE_REQUIRES_REVIEW';
function auditInspect(result) {
  const publicResult=sanitizeForCustomerVNext(result);
  const walk=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));if(value&&typeof value==='object'){assert.ok(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);for(const child of Object.values(value))walk(child);}};
  walk(result);walk(publicResult);
  assert.deepEqual(publicResult,sanitizeForCustomerVNext(structuredClone(result)));
  const publicText=JSON.stringify(publicResult);
  for(const hidden of ['rateCents','ratePath','calculationRecord','ownerDiagnostics','submittedCustomerInputs','approvedValues','markupPercent','priceBasisByCategory'])assert.equal(publicText.includes('"'+hidden+'"'),false,hidden);
  if(result.resultType===auditReady){
    assert.equal(publicResult.resultType,auditReady,JSON.stringify(result));
    for(const option of result.calculationRecord.options)for(const record of Object.values(option.scenarios)){
      for(const item of record.lineItems||[])assertLineReproducible(item);
    }
    for(const item of result.lineItems) {
      const c=item.calculation;
      if(c.evidenceVariant==='quantity_rate'){
        // Derived quantities retain an exact fraction beyond their display Number.
        const exact=oracleMultiply(oracleRational(BigInt(c.exactQuantity.numerator),BigInt(c.exactQuantity.denominator)),oracleDecimal(c.rateCents),...c.multipliers.map(m=>oracleRational(BigInt(m.exactValue.numerator),BigInt(m.exactValue.denominator))));
        assert.equal(item.amountCents,oracleRound(exact));assert.deepEqual(c.exactUnroundedCents,oracleEvidence(exact));
      }
    }
  } else {assert.equal(publicResult.resultType,auditReview);assert.equal(publicResult.reviewReason,undefined);}
  return result;
}
function auditRun(c,p,options={}) {return auditInspect(run(p.serviceType,c,p,options));}
function auditApprove(p,fields=aiConfirmationFieldsVNext(p,p.pricing),operationId='fixture-approval-1'){return approveVNextValues(p,{fields,ownerId:'internal-fixture-owner',operationId,approvedAt:'2026-09-09T12:00:00.000Z'});}
const auditFlatP=()=>service('FLAT_ROOF_REPLACEMENT',{laborPerSqft:{epdm:500,tpo:600},membraneCostPerSqft:{epdm:700,tpo:800},tearOffPerSqft:{epdm:200,tpo:300},minimumJob:0,insulationPerSqft:250});
const auditFlatC=()=>(confirmedFixtureInputs({roofSqft:1000,sqftMethod:'exact',membraneType:'epdm',replacementMembraneType:'tpo',existingLayers:1,accessDifficulty:'easy',serviceScope:'full',buildingType:'residential'}));
const auditMowP=()=>service('LANDSCAPING_MOWING',{mowingBaseRatePerSqft:1,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},overgrowthMultipliers:{maintained:1,overgrown:1,severe:1}});
const auditMowC=()=>({yardSqft:10000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false});
const auditSodP=()=>service('LANDSCAPING_SOD',{sodMaterialPerSqft:100,sodInstallLaborPerSqft:100,groundPrepPerSqft:100,minimumServiceCharge:0});
const auditSodC=()=>({sodSqft:100,sqftMethod:'exact',groundPrepNeeded:true,slope:'flat',accessDifficulty:'easy'});

test('repair 104: AI approval binds scalar map leaves added leaves rule maps and tiers to exact approved values',()=>{
  const initial=roofService({}, {source:'AI_SUGGESTED',tiers:[{name:'Standard',overrides:{minimumJob:0}}]});
  const approved=auditApprove(initial);assert.equal(auditRun(roofInputs(),approved).resultType,auditReady);
  const mutations=[['minimumJob',p=>p.pricing.minimumJob=1],['laborPerSquare',p=>p.pricing.laborPerSquare.asphalt_shingle=5001],['tearOffPerSquare',p=>p.pricing.tearOffPerSquare.new_material=5000],['feeRules',p=>p.feeRules.travel='always'],['tiers',p=>p.tiers[0].overrides.minimumJob=1]];
  for(const [field,change] of mutations){const changed=structuredClone(approved);change(changed);const blocked=auditRun(roofInputs(),changed);assert.equal(blocked.resultType,auditReview);assert.ok(blocked.unconfirmedOwnerFields.includes(field));const fresh=auditApprove(changed,[field],'fixture-approval-2');assert.equal(fresh.approvedValues[field].operationId,'fixture-approval-2');assert.equal(auditRun(roofInputs(),fresh).resultType,auditReady);}
  const approvedResult=auditRun(roofInputs(),approved);
  assert.deepEqual(approvedResult.calculationRecord.ownerConfiguration.approvedValues,approved.approvedValues);
  const tampered=structuredClone(approvedResult);tampered.calculationRecord.ownerConfiguration.pricing.minimumJob=1;
  assert.equal(sanitizeForCustomerVNext(tampered).resultType,auditReview);
  assert.equal(sanitizeForCustomerVNext(approvedResult).resultType,auditReady);
  const legacy=structuredClone(approved);delete legacy.approvedValues;assert.equal(auditRun(roofInputs(),legacy).resultType,auditReview);
  assert.throws(()=>approveVNextValues(initial,{fields:['minimumJob']}));assert.equal(vNextServiceStatus(approved,defaults).status,'QUOTING LIVE');
});
test('repair 105: decking rates stay internal under markup, margin and sell-price basis',()=>{
  for(const [mode,total] of [['markup',252500],['margin',268333]]){const r=auditRun(roofInputs({deckingSheets:2}),roofService({deckingPerSheet:5000}),{businessDefaults:{...defaults,markupMode:mode,markupPercent:25}});assert.equal(r.resultType,auditReady);assert.equal(scenario(r).tax.finalTotalCents,total);assert.equal(JSON.stringify(sanitizeForCustomerVNext(r)).includes('$50.00/sheet'),false);}
  const sell=auditRun(roofInputs({deckingSheets:2}),roofService({deckingPerSheet:5000},{priceBasisByCategory:sellBasis}));assert.ok(sell.priceDrivers.some(x=>x.includes('priced per sheet')));assert.doesNotMatch(JSON.stringify(sanitizeForCustomerVNext(sell)),/\$50\.00\/sheet/);assert.equal(lineAmount(sell,'Decking replacement'),10000);
});
test('repair 106: included and explicitly exclusive itemized accessories charge each component once',()=>{
  const included=auditRun(roofInputs(),roofService());assert.equal(scenario(included).tax.finalTotalCents,195000);assert.equal(line(included,'Starter strip'),undefined);
  const p=roofService({accessoryPricingMode:'itemized',starterPerLF:100,dripEdgePerLF:100,ridgeCapPerLF:100}),c=roofInputs({starterLengthLF:10,dripEdgeLengthLF:10,ridgeCapLengthLF:10});
  assert.equal(auditRun(c,p).resultType,auditReview);p.pricing.materialAccessoryBasis='excludes_itemized_accessories';const r=auditRun(c,p);assert.equal(scenario(r).tax.finalTotalCents,198000);for(const name of ['Starter strip','Drip edge','Ridge cap'])assert.equal(lineAmount(r,name),1000);
  const metadata=getVNextPriceBookMetadata().find(x=>x.serviceType==='ROOFING_REPLACEMENT');assert.ok(JSON.stringify(metadata).includes('EXCLUDE'));
});
test('repair 107: flat roof existing membrane selects removal and explicit replacement selects installation',()=>{
  for(const [oldType,newType,expected] of [['epdm','tpo',[600000,800000,200000]],['tpo','epdm',[500000,700000,300000]],['epdm','epdm',[500000,700000,200000]]]){const r=auditRun(confirmedFixtureInputs({...auditFlatC(),membraneType:oldType,replacementMembraneType:newType}),auditFlatP());assert.deepEqual(['Flat roof labor','Membrane','Tear-off'].map(n=>lineAmount(r,n)),expected);}
  for(const field of ['membraneType','replacementMembraneType'])for(const value of [undefined,'unknown','average'])assert.equal(auditRun({...auditFlatC(),[field]:value},auditFlatP()).resultType,auditReview);
});
test('repair 108: sod preparation owns old-lawn disposal and common fees require separate declared debris',()=>{
  const p=auditSodP();p.feeRules.disposal='always';const options={businessDefaults:{...defaults,disposalFee:10000}};
  const r=auditRun(auditSodC(),p,options);assert.equal(lineAmount(r,'Ground preparation'),10000);assert.equal(line(r,'Disposal'),undefined);assert.ok(JSON.stringify(r.calculationRecord).includes('oldLawnDisposalOwner'));
  const noFee=auditRun(auditSodC(),auditSodP(),options);assert.equal(scenario(r).tax.finalTotalCents,scenario(noFee).tax.finalTotalCents);
  p.disposalScope='separate_project_debris';const separate=auditRun({...auditSodC(),separateDisposalSelected:true},p,options);assert.equal(lineAmount(separate,'Disposal'),10000);assert.equal(scenario(separate).tax.finalTotalCents-scenario(r).tax.finalTotalCents,10000);
  assert.equal(line(auditRun({...auditSodC(),separateDisposalSelected:false},p,options),'Disposal'),undefined);
});
test('repair 109: replaced owner and customer common disposal need no selection but active fees do',()=>{
  for(const side of ['owner','customer']){const p=roofService({disposalPerSquare:100});p.feeRules.disposal=side+'_selected';const r=auditRun(roofInputs(),p);assert.equal(r.resultType,auditReady);assert.equal(lineAmount(r,'Roofing disposal'),1000);assert.equal(line(r,'Disposal'),undefined);delete p.pricing.disposalPerSquare;assert.equal(auditRun(roofInputs(),p).resultType,auditReview);assert.equal(auditRun(roofInputs(),p,{feeSelections:{[side]:{disposal:false}}}).resultType,auditReady);assert.equal(auditRun(roofInputs(),p,{feeSelections:{[side]:{travel:true}}}).resultType,auditReview);}
});
test('repair 110: exact derived areas enforce direct minimum maximum and strict partial scope bounds',()=>{
  for(const flat of [false,true]){const p=flat?auditFlatP():roofService(),base=flat?auditFlatC():roofInputs(),totalField=flat?'roofSqft':'roofSizeInput',max=flat?2000000:1000000;
    for(const [area,ready] of [[0.999,false],[1,true],[1.001,true]])for(const method of ['partialAreaSqft','partialPercent']){const r=auditRun({...base,[totalField]:100,serviceScope:'partial',[method]:area},p);assert.equal(r.resultType,ready?auditReady:auditReview);}
    for(const area of [max-0.001,max,max+0.001]){const r=auditRun({...base,[totalField]:max,serviceScope:'partial',partialAreaSqft:area},p);assert.equal(r.resultType,area<max?auditReady:auditReview);}
    for(const percent of [99.9999999,100,100.0000001])assert.equal(auditRun({...base,[totalField]:max,serviceScope:'partial',partialPercent:percent},p).resultType,percent<100?auditReady:auditReview);
  }
  for(const [area,ready] of [[0.999,false],[1,true],[1.001,true],[9999999.99,true],[10000000,true],[10000000.01,false]]){const width=area>100?100000:1,length=area>100?area/width:area;const r=auditRun(concreteInputs({length,width}),concreteService());assert.equal(r.resultType,ready?auditReady:auditReview,JSON.stringify({area,r}));}
});
test('repair 111: decimal flooring bands use exact division at and around the threshold',()=>{
 const p=flooringService({roomSizeThresholds:{smallMaxSqft:100.1,mediumMaxSqft:200}});
 for(const [sqft,band] of [[300.29999999999995,'small'],[300.3,'medium'],[300.30000000000007,'medium']]){const r=auditRun(flooringInputs({sqft,roomCount:3}),p);assert.equal(r.resultType,auditReady);assert.equal(r.options[0].calculationRecord.ruleApplications.find(x=>x.name==='averageRoomComplexityBand').result,band);}
});
test('repair 112: uncertainty slugs and an unidentified leak require inspection even with matching rates',()=>{
 for(const type of ['ROOFING_REPAIR','FLAT_ROOF_REPAIR'])for(const slug of ['unknown','unknown_leak','unsure','unidentified','unidentified_leak','unknown_source','unknown_leak_source','other','average','named_patch']){
   const flat=type==='FLAT_ROOF_REPAIR',p=service(type,{laborHourlyRate:10000,repairMinimum:0,[flat?'patchRepairHours':'repairHours']:{epdm:{[slug]:{small:1,medium:1,large:1}}},[flat?'patchMaterialAllowance':'repairMaterialAllowance']:{epdm:{[slug]:{small:100,medium:100,large:100}}}}),c={repairType:slug,affectedArea:1,leakPresent:true,...(flat?confirmedFixtureInputs({membraneType:'epdm',pondingWater:false}):confirmedFixtureInputs({roofType:'epdm',pitch:'low',stories:1}))};
   assert.equal(auditRun(c,p).resultType,auditReview);const identified=auditRun(confirmedFixtureInputs({...c,leakSourceIdentified:true}),p);assert.equal(identified.resultType,slug==='named_patch'?auditReady:auditReview);
 }
});
test('repair 113: membrane-specific maps activate without dormant average rates and unknown never falls back',()=>{
 assert.equal(vNextServiceStatus(auditFlatP(),defaults).status,'QUOTING LIVE');assert.equal(auditRun(auditFlatC(),auditFlatP()).resultType,auditReady);assert.equal(auditRun(confirmedFixtureInputs({...auditFlatC(),membraneType:'unknown'}),auditFlatP()).resultType,auditReview);
 for(const field of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft']){
   const p=auditFlatP();p.pricing[field].average=777;
   assert.equal(vNextServiceStatus(p,defaults).status,'QUOTING LIVE','A dormant '+field+'.average must not require averages in another map');
   const result=auditRun(auditFlatC(),p);assert.equal(result.resultType,auditReady);assert.equal(scenario(result).tax.finalTotalCents,1600000); // 1000 sqft: TPO labor600 + TPO material800 + EPDM tear-off200 cents/sqft.
   assert.equal(auditRun(confirmedFixtureInputs({...auditFlatC(),membraneType:'average'}),p).resultType,auditReview);
   delete p.pricing.membraneCostPerSqft.tpo;
   const missing=auditRun(auditFlatC(),p);assert.equal(missing.resultType,auditReview);assert.ok(missing.missingOwnerFields.includes('membraneCostPerSqft.tpo'));
 }

});
test('repair 114: unsupported legacy or misspelled service roots are rejected at the exact path',()=>{
 for(const field of ['taxable','allowAssumptionBasedQuotes','feeRuels']){const p={...roofService(),[field]:true},r=auditRun(roofInputs(),p);assert.equal(r.resultType,auditReview);assert.ok(r.unsupportedOwnerFields.includes(field));assert.ok(vNextServiceStatus(p,defaults).unsupportedOwnerFields.includes(field));}assert.equal(auditRun(roofInputs(),roofService()).resultType,auditReady);
});
test('repair 115: leads require actionable reasons and matching request identity and submitted scope',()=>{
 const c={},p=roofService(),r=auditRun(c,p),request={serviceType:p.serviceType,customerInputs:c,ownerPricing:p};const valid=buildInternalLeadVNext({request,internalResult:r});assert.equal(valid.quoteId,r.quoteId);assert.deepEqual(valid.urgencyFlags,r.urgencyFlags);
 for(const change of [x=>delete x.reviewReason,x=>{for(const k of ['missingCustomerFields','invalidCustomerFields','missingOwnerFields','invalidOwnerFields','unsupportedOwnerFields','crossFieldOwnerFields','unconfirmedOwnerFields','ownerDiagnostics','ownerDecisionRequired'])x[k]=[];x.inspectionFirst=false;}]){const bad=structuredClone(r);change(bad);assert.throws(()=>buildInternalLeadVNext({request,internalResult:bad}));}
 assert.throws(()=>buildInternalLeadVNext({request:{...request,serviceType:'LANDSCAPING_MOWING'},internalResult:r}));assert.throws(()=>buildInternalLeadVNext({request:{...request,customerInputs:{roofSizeInput:50}},internalResult:r}));assert.throws(()=>buildInternalLeadVNext({request,internalResult:sanitizeForCustomerVNext(r)}));
});
test('repair 116: fractional mowing cents represent fifty dollars per ten thousand square feet exactly',()=>{
 for(const [rate,cents] of [[0.4999,4999],[0.5,5000],[0.5001,5001],[1,10000]]){const p=auditMowP();p.pricing.mowingBaseRatePerSqft=rate;const r=auditRun(auditMowC(),p);assert.equal(r.resultType,auditReady);assert.equal(lineAmount(r,'Mowing labor'),cents);assert.equal(scenario(r).tax.finalTotalCents,cents);}
 for(const rate of [-0.0001,Infinity]){const p=auditMowP();p.pricing.mowingBaseRatePerSqft=rate;assert.equal(auditRun(auditMowC(),p).resultType,auditReview);}
});
test('repair 117: permits require owner-controlled applicability with always and included controls',()=>{
 const p=roofService();p.feeRules.permit='when_scope_selected';const opts={businessDefaults:{...defaults,permitFee:10000}};
 for(const required of [false,true,undefined]){const r=auditRun(roofInputs({permitRequired:required}),p,opts);assert.equal(r.resultType,auditReview);assert.ok(r.ownerDiagnostics.some(d=>d.path==='feeRules.permit'));}
 for(const mode of ['always','included_in_rates']){p.feeRules.permit=mode;const r=auditRun(roofInputs(),p,opts);assert.equal(r.resultType,auditReady);assert.equal(lineAmount(r,'Permit'),mode==='always'?10000:undefined);}
});
test('repair 118: smallest finite factors and their products remain exact while unsupported factors fail validation',()=>{
 for(const factor of [Number.MIN_VALUE,1e-323,1e-210,0.000001,1]){const p=auditMowP();p.pricing.minimumServiceCharge=1;p.pricing.frequencyMultipliers.weekly=factor;const single=auditRun(auditMowC(),p);assert.equal(single.resultType,auditReady,JSON.stringify(single));assert.equal(lineAmount(single,'Mowing labor'),oracleRound(oracleMultiply(10000,oracleDecimal(factor))));p.pricing.overgrowthMultipliers.maintained=factor;const r=auditRun(auditMowC(),p);assert.equal(r.resultType,auditReady,JSON.stringify(r));assert.equal(lineAmount(r,'Mowing labor'),oracleRound(oracleMultiply(10000,oracleDecimal(factor),oracleDecimal(factor))));}
 for(const factor of [0,-Number.MIN_VALUE,Infinity]){const p=auditMowP();p.pricing.frequencyMultipliers.weekly=factor;assert.ok(validatePricingStructuresDetailed(p.serviceType,p.pricing).some(x=>x.path==='frequencyMultipliers.weekly'));assert.equal(auditRun(auditMowC(),p).resultType,auditReview);}
 const overflow=auditMowP();overflow.pricing.frequencyMultipliers.weekly=1e308;overflow.pricing.overgrowthMultipliers.maintained=1e308;assert.ok(validatePricingStructuresDetailed(overflow.serviceType,overflow.pricing).some(x=>x.path==='frequencyMultipliers.weekly'));
});
test('repair 119: customer ranges retain cent precision through ten and twenty dollar boundaries',()=>{
 for(const buffer of [0,10,25])for(const cents of [999,1000,1001,1499,1500,1501,1999,2000,2001]){const r=auditRun(interiorInputs({wallAreaSqft:1}),interiorService({laborPerWallSqftPerCoat:cents-1,materialPerWallSqftPerCoat:1}),{businessDefaults:{...defaults,rangeBufferPercent:buffer}});const range=r.calculationRecord.options[0].range;assert.deepEqual([range.lowCents,range.midCents,range.highCents],[Math.floor((cents*(100-buffer)+50)/100),cents,Math.floor((cents*(100+buffer)+50)/100)]);}
});
test('repair 120: stair counts remain review-only until an all-inclusive or allocated owner contract exists',()=>{
 for(const count of [0,1,2]){const r=auditRun(flooringInputs({stairSteps:count}),flooringService());assert.equal(r.resultType,count===0?auditReady:auditReview);if(count)assert.ok(r.inspectionFirst);}
});
test('repair 121: flooring removal and disposal use only independently measured removal area',()=>{
 const p=flooringService({removalPerSqft:{vinyl:100},disposalPerSqft:50}),c=flooringInputs(confirmedFixtureInputs({removalNeeded:true,existingFloorType:'vinyl'}));assert.equal(auditRun(c,p).resultType,auditReview);
 for(const area of [0.999,1,1.001,100,999999.999,1000000,1000000.001]){const r=auditRun({...c,removalAreaSqft:area},p);assert.equal(r.resultType,area>=1&&area<=1000000?auditReady:auditReview);if(r.resultType===auditReady){assert.equal(lineAmount(r,'Existing flooring removal'),oracleRound(oracleMultiply(oracleDecimal(area),100)));assert.equal(lineAmount(r,'Flooring disposal'),oracleRound(oracleMultiply(oracleDecimal(area),50)));assert.equal(lineAmount(r,'Flooring materials'),162000);}}
 assert.equal(auditRun(flooringInputs({removalAreaSqft:100}),p).resultType,auditReview);
});
test('repair 122: siding removal cannot reuse replacement type and installation area',()=>{
 const p=service('SIDING_REPLACEMENT',{laborPerSqft:{vinyl:100},materialPerSqft:{vinyl:100},removalPerSqft:100,minimumJob:0}),c={areaInputMethod:'sqft',sidingAreaSqft:100,sidingType:'vinyl',stories:1,oldSidingRemoval:false,trimIncluded:false};assert.equal(auditRun(c,p).resultType,auditReady);const r=auditRun({...c,oldSidingRemoval:true},p);assert.equal(r.resultType,auditReview);assert.ok(r.inspectionFirst);
});
test('repair 123: concrete rejects impossible geometry and supports a measured closed irregular outline',()=>{
 const p=concreteService(),c=concreteInputs({dimensionMethod:'measured_area_perimeter',areaSqft:1000,perimeterLF:1});delete c.length;delete c.width;assert.equal(auditRun(c,p).resultType,auditReview);
 const points=[{x:0,y:0},{x:10,y:0},{x:10,y:5},{x:5,y:5},{x:5,y:10},{x:0,y:10},{x:0,y:0}],outline=concreteInputs({dimensionMethod:'measured_outline',outlinePoints:points});delete outline.length;delete outline.width;const r=auditRun(outline,p);assert.equal(r.resultType,auditReady,JSON.stringify(r));assert.equal(lineAmount(r,'Concrete labor'),45000);assert.equal(lineAmount(r,'Formwork'),100000);assert.equal(lineAmount(r,'Ready-mix concrete'),18333); // 75 sqft; 40 feet; 75*4/324*1.1 yards at 18000 cents.
 for(const [height,ready] of [[0.9999999999999999,false],[1,true],[1.0000000000000002,true]]){
   const rectangle={...outline,outlinePoints:[{x:0,y:0},{x:1,y:0},{x:1,y:height},{x:0,y:height},{x:0,y:0}]};assert.equal(auditRun(rectangle,p).resultType,ready?auditReady:auditReview);
 }
 for(const [height,ready] of [[99.99999999999999,true],[100,true],[100.00000000000001,false]]){
   const rectangle={...outline,outlinePoints:[{x:0,y:0},{x:100000,y:0},{x:100000,y:height},{x:0,y:height},{x:0,y:0}]};assert.equal(auditRun(rectangle,p).resultType,ready?auditReady:auditReview);
 }
 // A translated copy preserves measured shape while testing the coordinate limit.
 for(const rightmost of [99999.99999999999,100000,100000.00000000001]){
   const translated={...outline,outlinePoints:points.map(point=>({...point,x:point.x+rightmost-10}))};
   assert.equal(auditRun(translated,p).resultType,rightmost<=100000?auditReady:auditReview);
 }
 for(const notchY of [1,-5]){
   const crossed={...outline,outlinePoints:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:5,y:10},{x:5,y:notchY},{x:0,y:notchY},{x:0,y:0}]};
   const result=auditRun(crossed,p);assert.equal(result.resultType,notchY===1?auditReady:auditReview);
   if(notchY===1){assert.equal(lineAmount(result,'Concrete labor'),33000);assert.equal(lineAmount(result,'Formwork'),100000);} // 100 - 5*9 = 55 sqft; perimeter 40 LF.
 }
 const open=structuredClone(outline);open.outlinePoints.pop();assert.equal(auditRun(open,p).resultType,auditReview);const diagonal=structuredClone(outline);diagonal.outlinePoints[1].y=1;assert.equal(auditRun(diagonal,p).resultType,auditReview);
});
test('repair 124: concrete demolition is review-only without existing-slab pricing facts',()=>{
 const p=concreteService({demolitionPerSqft:100});assert.equal(auditRun(concreteInputs(),p).resultType,auditReady);for(const thickness of [2,4,24])assert.equal(auditRun(concreteInputs({demolitionNeeded:true,demolitionAreaSqft:100,thickness}),p).resultType,auditReview);
});
test('repair 125: commercial building type does not establish insulation or coverboard scope',()=>{
 assert.equal(auditRun(auditFlatC(),auditFlatP()).resultType,auditReady);const r=auditRun({...auditFlatC(),buildingType:'commercial'},auditFlatP());assert.equal(r.resultType,auditReview);assert.ok(r.inspectionFirst);
});
test('repair 126: wall uniformity is explicit and ceiling coats are independently measured',()=>{
 const p=interiorService(),c=interiorInputs();for(const uniform of [true,false,undefined])assert.equal(auditRun({...c,wallScopeUniform:uniform},p).resultType,uniform===true?auditReady:auditReview);
 for(const coats of [0,1,2,3,4]){const r=auditRun({...c,ceilingsIncluded:true,ceilingAreaSqft:100,ceilingCoats:coats},p);assert.equal(r.resultType,coats>=1&&coats<=3?auditReady:auditReview);if(r.resultType===auditReady){assert.equal(lineAmount(r,'Ceiling labor'),10000*coats);assert.equal(lineAmount(r,'Ceiling materials'),5000*coats);assert.equal(lineAmount(r,'Wall labor'),10000);}}
});
test('repair 127: exterior substrate coating and affected preparation remain review-only without an owner contract',()=>{
 const p=service('EXTERIOR_PAINTING',{exteriorLaborPerSqftPerCoat:100,materialPerSqftPerCoat:50,laborHourlyRate:10000,minimumJob:0});for(const condition of ['good','fair','poor']){const r=auditRun({areaInputMethod:'wall_sqft',exteriorAreaSqft:100,stories:1,surfaceCondition:condition,coats:2},p);assert.equal(r.resultType,auditReview);assert.ok(r.inspectionFirst);}assert.equal(auditRun(interiorInputs(),interiorService()).resultType,auditReady);
});

function currentInspect(result) {
  auditInspect(result);
  assert.equal(result.engineVersion, currentEngineVersion);
  assert.deepEqual(structuredClone(result), result);
  const customer = sanitizeForCustomerVNext(result);
  if (result.resultType === auditReady) {
    assert.equal(result.calculationRecord.serviceId, result.serviceId);
    assert.equal(result.calculationRecord.engineVersion, currentEngineVersion);
    for (const option of result.options) {
      assert.equal(option.calculationRecord.engineVersion, currentEngineVersion);
      assert.equal(option.calculationRecord.serviceId, result.serviceId);
      const r=option.calculationRecord.range;
      const exact=r.bufferPercent===0 && r.source==='business_range_buffer' && r.lowCents===r.highCents;
      const subDollar=r.lowCents>0&&r.lowCents<100;
      const minimumWouldBeUndercut=Math.floor(r.lowCents/100)*100<r.minimumCustomerFloorCents;
      assert.deepEqual([option.lowEstimate,option.midEstimate,option.highEstimate], (exact||subDollar||minimumWouldBeUndercut)
        ? [r.lowCents/100,r.midCents/100,r.highCents/100]
        : [Number(BigInt(r.lowCents)/100n),Number((BigInt(r.midCents)+50n)/100n),Number((BigInt(r.highCents)+99n)/100n)]);
      assert.ok(oracleSubtract(oracleMultiply(option.lowEstimate,100),r.lowCents).numerator <= 0n);
      assert.ok(oracleSubtract(oracleMultiply(option.highEstimate,100),r.highCents).numerator >= 0n);
    }
    assert.equal(/ownerId|serviceId|engineVersion|approvedValues|knownOfferings|confirmedFacts|ratePath|rateCents|markup|margin/i.test(JSON.stringify(customer)),false);
  } else assert.deepEqual(Object.keys(customer).sort(),['customerMessage','quoteId','resultType']);
  return result;
}
function currentRun(c,p,options={}) {
  return currentInspect(generateQuoteVNext({serviceType:p.serviceType,customerInputs:c,ownerPricing:p,businessDefaults:defaults,callerType:'owner',currentMonth:1,...options}));
}
function currentRepairFixture(type) {
  const flat=type==='FLAT_ROOF_REPAIR',siding=type==='SIDING_REPAIR';
  const p=service(type,siding
    ? {laborHourlyRate:10000,repairMinimum:0,repairHours:{vinyl:{minor:{small:2,medium:4,large:8}}},materialAllowance:{vinyl:{minor:{small:4000,medium:8000,large:16000}}}}
    : flat ? {laborHourlyRate:10000,repairMinimum:0,patchRepairHours:{epdm:{seam_patch:{small:2,medium:4,large:8}}},patchMaterialAllowance:{epdm:{seam_patch:{small:4000,medium:8000,large:16000}}}}
    : {laborHourlyRate:10000,repairMinimum:0,repairHours:{asphalt_shingle:{shingle_patch:{small:2,medium:4,large:8}}},repairMaterialAllowance:{asphalt_shingle:{shingle_patch:{small:4000,medium:8000,large:16000}}}});
  const c=confirmedFixtureInputs(siding ? confirmedFixtureInputs({sidingType:'vinyl',damageLevel:'minor',affectedArea:10,stories:1})
    : flat ? confirmedFixtureInputs({membraneType:'epdm',repairType:'seam_patch',affectedArea:10,leakPresent:false,pondingWater:false})
    : confirmedFixtureInputs({roofType:'asphalt_shingle',repairType:'shingle_patch',affectedArea:25,pitch:'low',stories:1,leakPresent:false}));
  return {p,c};
}
test('repair 128: explicit zero semantics distinguish core prices free offerings included components and valid tiers',()=>{
  const c=interiorInputs(),p=interiorService();
  assert.equal(scenario(currentRun(c,p)).finalTotalCents,15000);
  for(const field of ['laborPerWallSqftPerCoat','materialPerWallSqftPerCoat']){
    for(const value of [-1,0,1]){
      const changed=structuredClone(p);changed.pricing[field]=value;
      const r=currentRun(c,changed);
      assert.equal(r.resultType,value>0?auditReady:auditReview);
      if(value===0)assert.ok(r.missingOwnerFields.includes(field));
    }
  }
  const tampered=currentRun(c,p);tampered.calculationRecord.ownerConfiguration.pricing.laborPerWallSqftPerCoat=0;
  assert.equal(sanitizeForCustomerVNext(tampered).resultType,auditReview);
  const zero=interiorService({laborPerWallSqftPerCoat:0,materialPerWallSqftPerCoat:0});
  assert.equal(currentRun(c,zero).resultType,auditReview);
  const free=currentRun(c,freeFixture(zero));
  assert.equal(scenario(free).finalTotalCents,0);
  assert.deepEqual([free.lowEstimate,free.midEstimate,free.highEstimate],[0,0,0]);
  assert.equal(currentRun(c,freeFixture(p)).resultType,auditReview);
  const included=freeFixture(interiorService({materialPerWallSqftPerCoat:0}),{freeCompleteService:false,includedPrices:{materialPerWallSqftPerCoat:'laborPerWallSqftPerCoat'}});
  assert.equal(currentRun(c,included).resultType,auditReview);
  const wrong=structuredClone(included);wrong.zeroPricePolicy.includedPrices.materialPerWallSqftPerCoat='minimumJob';
  assert.equal(currentRun(c,wrong).resultType,auditReview);
  const roof=roofService();roof.pricing.laborPerSquare.asphalt_shingle=0;
  assert.equal(currentRun(roofInputs(),roof).resultType,auditReview);
  const repair=currentRepairFixture('ROOFING_REPAIR');
  assert.equal(scenario(currentRun(repair.c,repair.p)).finalTotalCents,24000);
  repair.p.pricing.repairMaterialAllowance.asphalt_shingle.shingle_patch.small=0;
  assert.equal(currentRun(repair.c,repair.p).resultType,auditReview);
  const tiers=interiorService({}, {tiers:[{name:'Good',overrides:{}},{name:'Zero',overrides:{laborPerWallSqftPerCoat:0}}]});
  const r=currentRun(c,tiers);assert.equal(r.resultType,auditReady);assert.deepEqual(r.options.map(o=>o.tierName),['Good']);assert.equal(r.failedTierDiagnostics[0].tierName,'Zero');
  const freeTier=interiorService({}, {tiers:[{name:'Good',overrides:{}},{name:'Free',overrides:{laborPerWallSqftPerCoat:0,materialPerWallSqftPerCoat:0,ceilingLaborPerSqftPerCoat:0,ceilingMaterialPerSqftPerCoat:0,trimLaborPerLF:0,trimMaterialPerLF:0}}]});
  assert.deepEqual(currentRun(c,freeTier).options.map(o=>o.tierName),['Good']);
  const designated=freeFixture(freeTier,{freeCompleteService:false,freeTiers:['Free']});
  for(const tiers of [{},null,'Free']) {const malformed=structuredClone(designated);malformed.tiers=tiers;assert.equal(currentRun(c,malformed).resultType,auditReview);}
  for(const field of ['serviceId','ownerId','operationId','approvedAt']) {const malformed=structuredClone(designated);malformed.zeroPricePolicy[field]=undefined;assert.equal(currentRun(c,malformed).resultType,auditReview);}
  const offers=currentRun(c,designated);
  assert.deepEqual(offers.options.map(o=>[o.tierName,o.calculationRecord.scenarios.mid.finalTotalCents]),[['Good',15000],['Free',0]]);
  assert.equal(vNextServiceStatus(designated,defaults).status,'QUOTING LIVE');
  assert.deepEqual(vNextServiceStatus(designated,defaults).validTierNames,['Good','Free']);
  const aiOffering=service('INTERIOR_PAINTING',freeTier.pricing,{source:'AI_SUGGESTED',tiers:[{name:'Good',overrides:{laborPerWallSqftPerCoat:101}},freeTier.tiers[1]]});
  const approvedOffering=auditApprove(freeFixture(aiOffering,{freeCompleteService:false,freeTiers:['Free']}));
  const aiQuote=currentRun(c,approvedOffering);
  assert.deepEqual(aiQuote.options.map(o=>[o.tierName,o.calculationRecord.scenarios.mid.finalTotalCents]),[['Good',15100],['Free',0]]);
  const aiStatus=vNextServiceStatus(approvedOffering,defaults);
  assert.deepEqual(aiStatus.validTierNames,['Good','Free'],JSON.stringify({aiQuote,aiStatus}));
  const staleOffering=structuredClone(approvedOffering);staleOffering.tiers[0].overrides.laborPerWallSqftPerCoat=102;
  assert.equal(currentRun(c,staleOffering).resultType,auditReview);
  assert.equal(vNextServiceStatus(staleOffering,defaults).status,'NEEDS PRICING');

  const mow=auditMowP();mow.pricing.baggingSurchargePercent=0;
  assert.equal(currentRun({...auditMowC(),bagClippings:true},mow).resultType,auditReady);

  // Activation exercises every configured preparation branch. An unpriced
  // optional branch remains lead-only while clean-bed planting stays quotable.
  const planting=service('LANDSCAPING_PLANTING',{
    plantingLaborPerPlant:{small:1000,medium:2000,large:3000},
    plantMaterialAllowance:{small:2000,medium:4000,large:6000},
    minimumServiceCharge:0,bedPrepLaborPerSqft:{needs_weeding:20,overgrown:40},
    mulchMaterialPerYard:{brown:5000},mulchInstallLaborPerYard:3000
  });
  const selected={accessDifficulty:'easy',plantsBySize:{small:1,medium:0,large:0},bedCondition:'needs_weeding',bedSqft:10,mulchNeeded:false};
  const clean={accessDifficulty:'easy',plantsBySize:{small:1,medium:0,large:0},bedCondition:'clean',mulchNeeded:false};
  const evidence=[];
  for(const value of [-1,0,1]){
    const changed=structuredClone(planting);changed.pricing.bedPrepLaborPerSqft.needs_weeding=value;
    const quote=currentRun(selected,changed),status=vNextServiceStatus(changed,defaults);
    evidence.push({value,quote,status});
    assert.equal(quote.resultType,value>0?auditReady:auditReview);
    if(value===0)assert.ok(quote.missingOwnerFields.includes('bedPrepLaborPerSqft.needs_weeding'));
    if(value===1)assert.equal(scenario(quote).finalTotalCents,3010); // 1000 + 2000 + 10 cents.
    if(value>=0)assert.equal(scenario(currentRun(clean,changed)).finalTotalCents,3000);
  }
  for(const {value,status} of evidence){
    assert.equal(status.status,value>=0?'QUOTING LIVE':'NEEDS PRICING',JSON.stringify(evidence));
    if(value===0)assert.ok(status.scopeCoverage.some(scope=>!scope.configurationComplete&&scope.variants.some(variant=>variant.missingFields.includes('bedPrepLaborPerSqft.needs_weeding'))));
  }
});
test('repair 129: persisted service UUID survives status preview quote and lead and rejects malformed or missing identity',()=>{
  const p=interiorService({}, {id:'30b0b04f-f459-4e8e-8a1f-aa0ce9310de4'}),c=interiorInputs();
  const request={pricebook:{services:[p],defaults},serviceType:p.serviceType,customerInputs:c,currentMonth:1,callerType:'owner'};
  assert.equal(vNextServiceStatus(p,defaults).status,'QUOTING LIVE');
  for(const r of [previewFromVNextPricebook(request),quoteFromVNextPricebook(request)])assert.equal(currentInspect(r).serviceId,p.id);
  for(const id of [undefined,'bad-id']){const bad=structuredClone(p);if(id===undefined)delete bad.id;else bad.id=id;const r=currentRun(c,bad);assert.equal(r.resultType,auditReview);assert.ok([...r.invalidOwnerFields,...r.missingOwnerFields].includes('id'));}
  const missing={...c};delete missing.wallAreaSqft;
  const internal=currentRun(missing,p);
  const lead=buildInternalLeadVNext({request:{serviceType:p.serviceType,customerInputs:missing,ownerPricing:p},internalResult:internal});
  assert.equal(lead.serviceId,p.id);assert.equal(lead.internalReviewResult.serviceId,p.id);
  const duplicate=quoteFromVNextPricebook({...request,pricebook:{services:[p,interiorService()],defaults}});
  assert.equal(currentInspect(duplicate).resultType,auditReview);assert.ok(duplicate.ownerDiagnostics.some(d=>d.kind==='duplicate_service'));
});
test('repair 130: AI approval cannot be bypassed by deletion ordinary origin edits or same-type service copying',()=>{
  const c=interiorInputs(),p=auditApprove(interiorService({}, {source:'AI_SUGGESTED'}));
  assert.equal(currentRun(c,p).resultType,auditReady);
  for(const key of ['source','origin','confirmedFields','approvedValues']){
    const bad=structuredClone(p);delete bad[key];assert.equal(currentRun(c,bad).resultType,auditReview);
  }
  const all=structuredClone(p);for(const key of ['source','origin','confirmedFields','approvedValues'])delete all[key];
  assert.equal(currentRun(c,all).resultType,auditReview);
  const copied=interiorService({}, {source:'AI_SUGGESTED'});copied.approvedValues=structuredClone(p.approvedValues);copied.confirmedFields=structuredClone(p.confirmedFields);
  assert.equal(currentRun(c,copied).resultType,auditReview);
  for(const key of ['id','source','origin','confirmedFields','approvedValues'])assert.throws(()=>editVNextService(p,{[key]:p[key]}),/cannot change/);
  let getterCalls=0;const hostile={};Object.defineProperty(hostile,'pricing',{enumerable:true,get(){getterCalls++;return p.pricing;}});
  assert.throws(()=>editVNextService(p,hostile));assert.equal(getterCalls,0);
  const edit=editVNextService(p,{service:'Owner edited label'});assert.equal(currentRun(c,edit).resultType,auditReady);
  const manual=interiorService();assert.equal(currentRun(c,manual).resultType,auditReady);
  const convert=structuredClone(p);convert.source='MANUAL';delete convert.approvedValues;delete convert.confirmedFields;
  assert.equal(currentRun(c,convert).resultType,auditReview);
  for(const key of ['value','serviceId','ownerId','operationId','approvedAt']){
    const bad=structuredClone(p);const a=bad.approvedValues.laborPerWallSqftPerCoat;
    a[key]=key==='value'?101:key==='approvedAt'?'invalid':key==='operationId'?'':'different';
    assert.equal(currentRun(c,bad).resultType,auditReview);
  }
  assert.throws(()=>approveVNextValues(p,{fields:['minimumJob'],ownerId:'another-owner',operationId:'x',approvedAt:'2026-09-09T12:00:00.000Z'}));
});
test('repair 131: price-map aliases require affirmative registered offering facts across materials and repairs',()=>{
  const cases=[
    {p:roofService(),c:roofInputs(),fields:{existingRoofType:['tearOffPerSquare'],replacementRoofType:['laborPerSquare','materialCostPerSquare','underlaymentPerSquare','underlaymentPriceBasis']}},
    {p:auditFlatP(),c:confirmedFixtureInputs(auditFlatC()),fields:{membraneType:['tearOffPerSqft'],replacementMembraneType:['laborPerSqft','membraneCostPerSqft']}}
  ];
  for(const {p,c,fields} of cases){
    assert.equal(currentRun(c,p).resultType,auditReady);
    for(const [field,maps] of Object.entries(fields)){
      const tampered=currentRun(c,p);
      tampered.submittedCustomerInputs.confirmedFacts[field].status='unknown';
      for(const option of tampered.options)option.calculationRecord.normalizedCustomerInputs.confirmedFacts[field].status='unknown';
      tampered.calculationRecord.options=structuredClone(tampered.options.map(option=>option.calculationRecord));
      assert.equal(sanitizeForCustomerVNext(tampered).resultType,auditReview);
      const noRegistry=structuredClone(p);delete noRegistry.knownOfferings[field];
      const held=currentRun(c,noRegistry);assert.ok(held.missingOwnerFields.includes('knownOfferings.'+field));
      const removed=structuredClone(c);delete removed.confirmedFacts[field];
      assert.equal(currentRun(removed,p).resultType,auditReview);
      for(const alias of ['not_identified','mystery_source','cannot_locate','unknown_problem','new_unrecognized_alias']){
        const changed=structuredClone(p);for(const map of maps)changed.pricing[map][alias]=changed.pricing[map][c[field]];
        const bad=structuredClone(c);bad[field]=alias;
        assert.equal(currentRun(bad,changed).resultType,auditReview);
        const unknown=structuredClone(c);unknown.confirmedFacts[field].status='unknown';
        assert.equal(currentRun(unknown,p).resultType,auditReview);
      }
    }
  }
  for(const type of ['ROOFING_REPAIR','FLAT_ROOF_REPAIR','SIDING_REPAIR']){
    const {p,c}=currentRepairFixture(type),field=type==='SIDING_REPAIR'?'damageLevel':'repairType';
    assert.equal(currentRun(c,p).resultType,auditReady);
    const maps=type==='FLAT_ROOF_REPAIR'?['patchRepairHours','patchMaterialAllowance']:type==='SIDING_REPAIR'?['repairHours','materialAllowance']:['repairHours','repairMaterialAllowance'];
    const material=type==='FLAT_ROOF_REPAIR'?c.membraneType:type==='SIDING_REPAIR'?c.sidingType:c.roofType;
    for(const alias of ['not_identified','mystery_source','cannot_locate','unknown_problem','new_unrecognized_alias']){
      const changed=structuredClone(p);for(const map of maps)changed.pricing[map][material][alias]=structuredClone(changed.pricing[map][material][c[field]]);
      const bad={...c,[field]:alias,...(type==='SIDING_REPAIR'?{}:{leakPresent:true,leakSourceIdentified:true})};
      assert.equal(currentRun(bad,changed).resultType,auditReview);
    }
    const unknown=structuredClone(c);unknown.confirmedFacts[field].status='unknown';
    if(type!=='SIDING_REPAIR'){unknown.leakPresent=true;unknown.leakSourceIdentified=true;}
    assert.equal(currentRun(unknown,p).resultType,auditReview);
  }
});
test('repair 132: sod separate disposal uses one shared quote activation metadata and customer contract',()=>{
  const p=auditSodP();p.disposalScope='separate_project_debris';p.feeRules.disposal='when_scope_selected';
  const d={...defaults,disposalFee:12345};
  assert.equal(vNextServiceStatus(p,d).status,'QUOTING LIVE');
  const metadata=getVNextPriceBookMetadata().find(m=>m.serviceType===p.serviceType);
  assert.ok(metadata.ruleFields.some(f=>f.field==='disposalScope'&&f.help.includes('separate_project_debris')));
  for(const selected of [false,true]){
    const c={...auditSodC(),separateDisposalSelected:selected};
    assert.equal(validateCustomerInputs(p.serviceType,c,p.pricing,p).ok,true);
    const r=currentRun(c,p,{businessDefaults:d});
    assert.equal(p.pricing.sodWasteFactor,0.05);
    // 100 measured sq ft + 5% material waste = 105 bought sq ft. Labor/prep use 100.
    assert.equal(scenario(r).finalTotalCents,105*100+100*100+100*100+(selected?12345:0));
    assert.equal(r.lineItems.filter(l=>l.name==='Disposal').length,selected?1:0);
    assert.equal(lineAmount(r,'Ground preparation'),10000);
  }
  assert.equal(currentRun(auditSodC(),p,{businessDefaults:d}).resultType,auditReview);
  const unsafeDefaults={...d,disposalFee:Number.MAX_SAFE_INTEGER};
  assert.equal(currentRun({...auditSodC(),separateDisposalSelected:false},p,{businessDefaults:unsafeDefaults}).resultType,auditReady);
  assert.equal(currentRun({...auditSodC(),separateDisposalSelected:true},p,{businessDefaults:unsafeDefaults}).resultType,auditReview);
  assert.equal(vNextServiceStatus(p,unsafeDefaults).status,'NEEDS PRICING');
  const plain=auditSodP();
  for(const selected of [false,true]){
    const c={...auditSodC(),separateDisposalSelected:selected};
    assert.equal(validateCustomerInputs(plain.serviceType,c,plain.pricing,plain).ok,false);
    assert.equal(currentRun(c,plain).resultType,auditReview);
  }
});
test('repair 133: decking disclosures distinguish measured inclusion unmeasured scope and sell units without private prices',()=>{
  for(const basis of ['cost','sell_price'])for(const sheets of [undefined,0,1,2]){
    const p=roofService({deckingPerSheet:5000},{priceBasisByCategory:{...costBasis,material:basis}});
    const c=roofInputs();if(sheets!==undefined)c.deckingSheets=sheets;
    const r=currentRun(c,p,{businessDefaults:{...defaults,markupPercent:25}});
    const customer=sanitizeForCustomerVNext(r),copy=JSON.stringify(customer);
    if(basis==='cost'){
      assert.equal(copy.includes('$50.00/sheet'),false);
      assert.equal(copy.includes('requires a confirmed sheet count'),false);
      assert.ok(copy.includes('Any additional decking is priced per sheet and confirmed on site.'));
    }else {assert.equal(copy.includes('$50.00/sheet'),false);assert.ok(copy.includes('priced per sheet'));}
    assert.equal(lineAmount(r,'Decking replacement')??0,(sheets??0)*5000);
  }
});
test('repair 134: candidate metadata describes actual review-only scopes and removes obsolete flat Average advice',()=>{
  const metadata=getVNextPriceBookMetadata();
  const flat=metadata.find(m=>m.serviceType==='FLAT_ROOF_REPLACEMENT');
  for(const field of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft']){
    const copy=flat.pricingFields.find(f=>f.field===field);
    assert.equal(/average/i.test(copy.help),false);
  }
  const expected={FLOORING_INSTALL:'Stairs',SIDING_REPLACEMENT:'removal',CONCRETE_DRIVEWAY:'Demolition',FLAT_ROOF_REPLACEMENT:'Commercial',FENCING_INSTALL:'Every fence',EXTERIOR_PAINTING:'Every exterior'};
  for(const [type,word] of Object.entries(expected)){
    const m=metadata.find(m=>m.serviceType===type);
    const scope=m.reviewOnlyScopes.find(s=>s.when.toLowerCase().includes(word.toLowerCase()));
    assert.ok(scope);assert.ok(scope.ownerDecisions.length,type);
    assert.ok(m.pricingFields.some(f=>f.reviewOnly===true),type);
  }
  assert.ok(metadata.find(m=>m.serviceType==='CONCRETE_DRIVEWAY').reviewOnlyScopes.some(s=>s.when.includes('Exposed')));
  assert.equal(metadata.find(m=>m.serviceType==='LANDSCAPING_MOWING').reviewOnlyScopes.length,0);
});
test('repair 135: lead urgency must equal the independently derived roof-leak facts',()=>{
  for(const type of ['ROOFING_REPAIR','FLAT_ROOF_REPAIR'])for(const leak of [false,true]){
    const {p,c}=currentRepairFixture(type);c.leakPresent=leak;if(leak)c.leakSourceIdentified=true;delete c.affectedArea;
    const request={serviceType:type,customerInputs:c,ownerPricing:p},r=currentRun(c,p);
    const lead=buildInternalLeadVNext({request,internalResult:r});
    assert.deepEqual(lead.urgencyFlags,leak?['Active leak reported']:[]);
    assert.equal(lead.quoteId,r.quoteId);assert.equal(lead.serviceId,p.id);assert.equal(lead.engineVersion,currentEngineVersion);
    const tampered=structuredClone(r);tampered.urgencyFlags=leak?[]:['Active leak reported'];
    assert.throws(()=>buildInternalLeadVNext({request,internalResult:tampered}));
    assert.deepEqual(buildInternalLeadVNext({request,internalResult:r}),lead);
  }
});
test('repair 136: ready review and lead records require the current immutable behavior build identifier',()=>{
  assert.notEqual(currentEngineVersion,'quote-engine-vnext-audit-1');
  const p=interiorService(),c=interiorInputs(),r=currentRun(c,p);
  for(const target of ['root','calculation','option']){
    const changed=structuredClone(r);
    if(target==='root')changed.engineVersion='quote-engine-vnext-audit-1';
    if(target==='calculation')changed.calculationRecord.engineVersion='quote-engine-vnext-audit-1';
    if(target==='option')changed.options[0].calculationRecord.engineVersion='quote-engine-vnext-audit-1';
    assert.equal(sanitizeForCustomerVNext(changed).resultType,auditReview);
  }
  assert.equal(sanitizeForCustomerVNext(r).resultType,auditReady);
  delete c.wallAreaSqft;const review=currentRun(c,p),request={serviceType:p.serviceType,customerInputs:c,ownerPricing:p};
  const bad=structuredClone(review);bad.engineVersion='quote-engine-vnext-audit-1';
  assert.throws(()=>buildInternalLeadVNext({request,internalResult:bad}));
  assert.equal(buildInternalLeadVNext({request,internalResult:review}).engineVersion,currentEngineVersion);
});
test('repair 137: direct rational projection handles the one-ULP counterexample halfway neighbors and subnormals',()=>{
  const n=5080245942540820752868626828963n,d=50000000000000000000000000000000000000000000n;
  const value=projectExact({numerator:n,denominator:d});
  assert.equal(value,1.0160491885081641e-13);assert.notEqual(value,Number(n)/Number(d));
  const rationalCases=[{numerator:n,denominator:d}];
  for(const sign of [-1n,1n]){
    // The normal midpoint between 1 and 1+2^-52, and values on either side.
    for(const delta of [-1n,0n,1n])rationalCases.push({numerator:sign*((2n**53n+1n)*2n+delta),denominator:2n**54n});
    // Half the smallest subnormal and the next halfway, with exact neighbors.
    for(const center of [2n,6n])for(const delta of [-1n,0n,1n])rationalCases.push({numerator:sign*(center+delta),denominator:2n**1076n});
  }
  for(const q of rationalCases)assert.ok(Object.is(projectExact(q),oracleNumber(q)));
  assert.equal(scenario(currentRun(interiorInputs(),interiorService())).finalTotalCents,15000);
});
test('repair 138: continuing collinear measured edges preserve exact geometry and reject backtracking crossing and nonclosure',()=>{
  for(const [x,y] of [[10,20],[10.2,20.4]]){
    const p=concreteService(),simple=[{x:0,y:0},{x,y:0},{x,y},{x:0,y},{x:0,y:0}];
    const middle=[simple[0],{x:x/2,y:0},...simple.slice(1)];
    const base={dimensionMethod:'measured_outline',outlinePoints:simple,thickness:4,finishType:'broom',demolitionNeeded:false,reinforcement:'none',accessDifficulty:'easy',baseNeeded:false};
    const a=currentRun(base,p),b=currentRun({...base,outlinePoints:middle},p);
    const rotated=[...middle.slice(1,-1),middle[0],middle[1]];
    assert.deepEqual(currentRun({...base,outlinePoints:rotated},p).lineItems,a.lineItems);
    if(x===10)for(const [at,ready] of [[9.999999999999998,true],[10,false],[10.000000000000002,false]])assert.equal(currentRun({...base,outlinePoints:[simple[0],{x:at,y:0},...simple.slice(1)]},p).resultType,ready?auditReady:auditReview);
    assert.equal(a.resultType,auditReady);assert.deepEqual(a.lineItems,b.lineItems);
    assert.equal(p.pricing.concreteWasteFactor,0.1);
    // Measured 10x20 or 10.2x20.4 rectangles: independently derived area,
    // perimeter, 4-inch volume (12 inches/foot and 27 cubic feet/yard), plus 10% ordering waste.
    const expected=x===10?{area:200,perimeter:60,labor:120000,formwork:150000,material:48889,total:318889}
      :{area:208.08,perimeter:61.2,labor:124848,formwork:153000,material:50864,total:328712};
    assert.equal(lineAmount(a,'Concrete labor'),expected.labor);
    assert.equal(lineAmount(a,'Formwork'),expected.formwork);
    assert.equal(a.lineItems.find(l=>l.calculation.ratePath==='concreteCostPerCubicYard').amountCents,expected.material);
    assert.equal(scenario(a).finalTotalCents,expected.total);
    assert.deepEqual([a.lowEstimate,a.midEstimate,a.highEstimate],[b.lowEstimate,b.midEstimate,b.highEstimate]);
    const bad=[
      [simple[0],{x:3*x/4,y:0},{x:x/2,y:0},...simple.slice(1)],
      simple.slice(0,-1),
      [simple[0],{x,y:1},...simple.slice(2)],
      [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:5,y:10},{x:5,y:0},{x:0,y:0}],
      [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:-5,y:10},{x:-5,y:5},{x:15,y:5},{x:15,y:-5},{x:0,y:-5},{x:0,y:0}]
    ];
    for(const points of bad)assert.equal(currentRun({...base,outlinePoints:points},p).resultType,auditReview);
  }
});
test('owner ruling: customer ranges expand to whole dollars while exact single prices retain cents',()=>{
  const p=auditMowP();
  for(const cents of [949,950,951,999,1000,1001]){
    const r=currentRun({...auditMowC(),yardSqft:cents},p);
    assert.equal(scenario(r).finalTotalCents,cents);
    assert.deepEqual([r.lowEstimate,r.midEstimate,r.highEstimate],[Math.floor(Math.round(cents*0.9)/100),Math.floor((cents+50)/100),Math.ceil(Math.round(cents*1.1)/100)]);
    const exact=currentRun({...auditMowC(),yardSqft:cents},p,{businessDefaults:{...defaults,rangeBufferPercent:0}});
    assert.deepEqual([exact.lowEstimate,exact.midEstimate,exact.highEstimate],[cents/100,cents/100,cents/100]);
  }
});
test('owner ruling: all safe margins below one hundred percent apply exactly without an arbitrary cap',()=>{
  for(const [percent,total] of [[0,10000],[90,100000],[99,1000000],[99.9,10000000],[99.99,100000000]]){
    const r=currentRun(auditMowC(),auditMowP(),{businessDefaults:{...defaults,markupMode:'margin',markupPercent:percent,rangeBufferPercent:0}});
    assert.equal(scenario(r).finalTotalCents,total);
    assert.equal(scenario(r).markup.amountCents,total-10000);
  }
  const justBelow=99.99999999999999;
  assert.equal(validateBusinessDefaults({...defaults,markupMode:'margin',markupPercent:justBelow}).ok,true);
  const sell=auditMowP();sell.priceBasisByCategory=structuredClone(sellBasis);
  assert.equal(currentRun(auditMowC(),sell,{businessDefaults:{...defaults,markupMode:'margin',markupPercent:justBelow}}).resultType,auditReady);
  assert.equal(currentRun(auditMowC(),auditMowP(),{businessDefaults:{...defaults,markupMode:'margin',markupPercent:justBelow}}).resultType,auditReview);
  for(const percent of [-0.001,100,100.00000000000001,100.001,Infinity,NaN])assert.equal(currentRun(auditMowC(),auditMowP(),{businessDefaults:{...defaults,markupMode:'margin',markupPercent:percent}}).resultType,auditReview);
  const high=auditMowP();high.pricing.mowingBaseRatePerSqft=Number.MAX_SAFE_INTEGER;
  assert.equal(currentRun(auditMowC(),high,{businessDefaults:{...defaults,markupMode:'margin',markupPercent:99.9}}).resultType,auditReview);
});


function exactRepairQuote139(c,p,b=defaults,extra={}) {
  return currentRun(c,p,{businessDefaults:b,...extra});
}
function forgeConsistentResult139(original, rebuilt) {
  const forged=structuredClone(original);
  Object.assign(forged,structuredClone(rebuilt));
  forged.quoteId=original.quoteId;forged.calculationRecord.quoteId=original.quoteId;
  forged.calculationRecord.ownerConfiguration=structuredClone(original.calculationRecord.ownerConfiguration);
  forged.calculationRecord.financialInputs=structuredClone(original.calculationRecord.financialInputs);
  for(const o of forged.options){
    assert.deepEqual(o.calculationRecord.lineItems,o.lineItems);
    for(const record of Object.values(o.calculationRecord.scenarios)){
      for(const item of record.lineItems)assertLineReproducible(item);
      assert.equal(record.lineItems.reduce((sum,l)=>sum+BigInt(l.amountCents),0n),BigInt(record.finalTotalCents));
    }
  }
  assert.deepEqual(forged.calculationRecord.options,forged.options.map(o=>o.calculationRecord));
  return forged;
}
test('repair 139: offering UUIDs are unique per selector and facts bind the exact field value and UUID',()=>{
  const p=roofService({laborPerSquare:{asphalt_shingle:5000,metal:15000},materialCostPerSquare:{asphalt_shingle:10000,metal:30000},underlaymentPerSquare:{asphalt_shingle:1500,metal:1500}});
  const c=roofInputs();assert.equal(currentRun(c,p).resultType,auditReady);
  assert.equal(currentRun(roofInputs({replacementRoofType:'metal'}),p).resultType,auditReady);
  assert.equal(currentRun({...c,replacementRoofType:'metal'},p).resultType,auditReview);
  const duplicate=structuredClone(p);duplicate.knownOfferings.replacementRoofType.metal=p.knownOfferings.replacementRoofType.asphalt_shingle;
  for(const metalId of [duplicate.knownOfferings.replacementRoofType.metal,duplicate.knownOfferings.replacementRoofType.metal.toUpperCase()]){
    duplicate.knownOfferings.replacementRoofType.metal=metalId;
    for(const result of [vNextServiceStatus(duplicate,defaults),currentRun(c,duplicate),currentRun({...c,replacementRoofType:'metal'},duplicate)]){
      assert.ok(result.ownerDiagnostics.some(d=>d.kind==='duplicate_offering_id'&&d.path==='knownOfferings.replacementRoofType.asphalt_shingle'));
      assert.ok(result.ownerDiagnostics.some(d=>d.kind==='duplicate_offering_id'&&d.path==='knownOfferings.replacementRoofType.metal'));
      assert.equal(result.status??result.resultType,result.status?'NEEDS PRICING':auditReview);
    }
  }
  for(const [key,value]of [['offeringId',p.knownOfferings.replacementRoofType.metal],['field','existingRoofType'],['value','metal']]){
    const changed=structuredClone(c);changed.confirmedFacts.replacementRoofType[key]=value;
    assert.equal(currentRun(changed,p).resultType,auditReview);
  }
  const alias=structuredClone(p);for(const key of ['laborPerSquare','materialCostPerSquare','underlaymentPerSquare'])alias.pricing[key].mystery_alias=alias.pricing[key].asphalt_shingle;
  assert.equal(currentRun({...c,replacementRoofType:'mystery_alias'},alias).resultType,auditReview);
});
test('repair 140: colliding persisted service IDs diagnose both records while unique IDs retain quote approval and lead identity',()=>{
  const a=interiorService(),b=roofService();
  assert.equal(validateVNextPricebook({defaults,services:[a,b]}).ok,true);
  const collision=structuredClone(b);collision.id=a.id;collision.origin.serviceId=a.id;
  for(const services of [[a,collision],[a,{...collision,id:a.id.toUpperCase(),origin:{...collision.origin,serviceId:a.id.toUpperCase()}}]]){
    const validation=validateVNextPricebook({defaults,services});
    assert.equal(validation.ok,false);
    for(const index of [0,1])assert.ok(validation.statuses[index].invalidOwnerFields.includes('services.'+index+'.id'));
    for(const [serviceType,customerInputs]of [[a.serviceType,interiorInputs()],[b.serviceType,roofInputs()]]){
      const r=currentInspect(quoteFromVNextPricebook({pricebook:{defaults,services},serviceType,customerInputs,callerType:'owner',currentMonth:1}));
      assert.equal(r.resultType,auditReview);assert.deepEqual(r.invalidOwnerFields,['services.0.id','services.1.id']);
    }
  }
  const custom=service('CUSTOM',{unit:'flat',customPricingMode:'fixed',price:10000},{service:'Synthetic custom A'});
  const customB={...structuredClone(custom),service:'Synthetic custom B'};
  const customValidation=validateVNextPricebook({defaults,services:[custom,customB]});
  assert.equal(customValidation.ok,false);
  for(const index of [0,1])assert.ok(customValidation.statuses[index].ownerDiagnostics.some(d=>d.kind==='duplicate_service_id'&&d.path==='services.'+index+'.id'));
  const uniqueCustom={...customB,...fixtureIdentity('MANUAL',undefined,'CUSTOM')};
  assert.equal(validateVNextPricebook({defaults,services:[custom,uniqueCustom]}).statuses.some(s=>s.ownerDiagnostics.some(d=>d.kind==='duplicate_service_id')),false);
  // CUSTOM remains review-only under its pre-existing allocation gate.
  const ai=auditApprove(interiorService({}, {source:'AI_SUGGESTED'}));
  const q=currentRun(interiorInputs(),ai);assert.equal(q.serviceId,ai.id);assert.equal(ai.approvedValues.laborPerWallSqftPerCoat.serviceId,ai.id);
  const free=freeFixture(interiorService({laborPerWallSqftPerCoat:0,materialPerWallSqftPerCoat:0}));assert.equal(currentRun(interiorInputs(),free).serviceId,free.zeroPricePolicy.serviceId);
  const missing=interiorInputs();delete missing.wallAreaSqft;const r=currentRun(missing,ai);
  const lead=buildInternalLeadVNext({request:{serviceType:ai.serviceType,customerInputs:missing,ownerPricing:ai},internalResult:r});assert.equal(lead.serviceId,ai.id);
});
test('repair 141: missing registries inconsistent registries unsupported offerings and missing facts have distinct responsibility',()=>{
  const p=roofService(),c=roofInputs(),field='replacementRoofType';
  const ownerMissing=structuredClone(p);delete ownerMissing.knownOfferings[field];
  const missing=currentRun(c,ownerMissing);
  assert.deepEqual(missing.missingOwnerFields,['knownOfferings.'+field]);
  assert.deepEqual(missing.missingCustomerFields,[]);assert.deepEqual(missing.invalidCustomerFields,[]);assert.equal(missing.inspectionFirst,false);
  const noFact=structuredClone(c);delete noFact.confirmedFacts[field];
  const customerMissing=currentRun(noFact,p);
  assert.deepEqual(customerMissing.missingCustomerFields,['confirmedFacts.'+field]);assert.equal(customerMissing.inspectionFirst,true);
  assert.deepEqual(customerMissing.missingOwnerFields,[]);assert.deepEqual(customerMissing.invalidOwnerFields,[]);
  const inconsistent=structuredClone(p);delete inconsistent.knownOfferings[field].asphalt_shingle;
  const bad=currentRun(c,inconsistent);
  assert.deepEqual(bad.invalidOwnerFields,['knownOfferings.'+field+'.asphalt_shingle']);assert.ok(bad.ownerDiagnostics.some(d=>d.kind==='offering_registry_inconsistency'));
  assert.deepEqual(bad.invalidCustomerFields,[]);assert.deepEqual(bad.missingCustomerFields,[]);assert.equal(bad.inspectionFirst,false);
  const unavailable=currentRun({...c,replacementRoofType:'unoffered_product'},p);
  assert.deepEqual(unavailable.invalidCustomerFields,[field]);assert.deepEqual(unavailable.missingOwnerFields,[]);assert.deepEqual(unavailable.invalidOwnerFields,[]);
  assert.match(unavailable.reviewReason,/not an offered service option/);assert.equal(unavailable.inspectionFirst,false);
  assert.equal(currentRun(c,p).resultType,auditReady);
});
test('repair 142: configured leads require the exact selected service and only explicit lookup reviews accept null identity',()=>{
  const a=interiorService(),b=interiorService(),c=interiorInputs();delete c.wallAreaSqft;
  const result=currentRun(c,a),base={serviceType:a.serviceType,customerInputs:c};
  const accepted=buildInternalLeadVNext({request:{...base,ownerPricing:a},internalResult:result});
  assert.equal(accepted.serviceId,a.id);assert.equal(accepted.quoteId,result.quoteId);assert.equal(accepted.engineVersion,currentEngineVersion);
  assert.equal(buildInternalLeadVNext({request:{...base,serviceId:a.id},internalResult:result}).serviceId,a.id);
  for(const request of [base,{...base,ownerPricing:b},{...base,serviceId:b.id},{...base,serviceId:null},{...base,serviceId:b.id,ownerPricing:a}])assert.throws(()=>buildInternalLeadVNext({request,internalResult:result}));
  for(const services of [[],[a,b]]){
    const lookup=currentInspect(quoteFromVNextPricebook({pricebook:{defaults,services},...base,callerType:'owner'}));
    assert.equal(lookup.serviceId,null);
    const lead=buildInternalLeadVNext({request:{...base,serviceId:null},internalResult:lookup});
    assert.equal(lead.serviceId,null);assert.deepEqual(lead.internalReviewResult.serviceResolution,lookup.serviceResolution);
    assert.throws(()=>buildInternalLeadVNext({request:base,internalResult:lookup}));
  }
  const disguised=structuredClone(result);disguised.serviceId=null;
  assert.throws(()=>buildInternalLeadVNext({request:{...base,serviceId:null},internalResult:disguised}));
});
test('repair 143: included zero prices retain category and basis with independently calculated tax and markup controls',()=>{
  const c=interiorInputs({ceilingsIncluded:true,ceilingAreaSqft:100,ceilingCoats:1});
  const p=includedFixture(interiorService({ceilingMaterialPerSqftPerCoat:0}),{ceilingMaterialPerSqftPerCoat:'materialPerWallSqftPerCoat'});
  p.taxabilityByCategory.material=true;
  // Labor 10000+10000, material 5000; 20% markup on 20000 labor cost = 4000.
  // TAX_NONE = 29000; materials-only tax = 500; all-price tax = 2900.
  for(const [taxMode,total,tax]of [['TAX_NONE',29000,0],['TAX_MATERIALS',29500,500],['TAX_ALL',31900,2900]]){
    const b={...defaults,markupPercent:20,taxMode,taxPercent:taxMode==='TAX_NONE'?0:10};
    const r=exactRepairQuote139(c,p,b);assert.equal(scenario(r).finalTotalCents,total);assert.equal(lineAmount(r,'Tax')??0,tax);
    const included=line(r,'Ceiling materials');assert.equal(included.category,'material');assert.equal(included.amountCents,0);
    assert.equal(included.noChargeReason,'included_in_another_price');assert.equal(included.includedInPricePath,'materialPerWallSqftPerCoat');
    for(const [zero,cover]of [['materialPerWallSqftPerCoat','laborPerWallSqftPerCoat'],['laborPerWallSqftPerCoat','materialPerWallSqftPerCoat']]){
      const cross=includedFixture(interiorService({[zero]:0}),{[zero]:cover});cross.taxabilityByCategory.material=true;
      const held=exactRepairQuote139(interiorInputs(),cross,b);
      assert.equal(held.resultType,auditReview);assert.ok(held.ownerDecisionRequired.some(d=>d.kind==='included_price_allocation'));
      assert.equal(vNextServiceStatus(cross,b).status,'NEEDS PRICING');
      assert.throws(()=>calculateServiceVNext(cross.serviceType,interiorInputs(),cross.pricing,{ownerPricing:cross}),error=>error.ownerDecisionRequired?.some(d=>d.kind==='included_price_allocation'));
      const separatelyPriced=structuredClone(cross);separatelyPriced.pricing[zero]=1;
      assert.equal(exactRepairQuote139(interiorInputs(),separatelyPriced,b).resultType,auditReady);
    }
  }
  const direct=calculateServiceVNext(p.serviceType,c,p.pricing,{ownerPricing:p});
  assert.equal(line(direct,'Ceiling materials').includedInPricePath,'materialPerWallSqftPerCoat');
  const mixedBasis=includedFixture(roofService({materialCostPerSquare:{asphalt_shingle:0}}),{'materialCostPerSquare.asphalt_shingle':'underlaymentPerSquare.asphalt_shingle'});
  assert.equal(currentRun(roofInputs(),mixedBasis).resultType,auditReview);
  const sameBasis=structuredClone(mixedBasis);sameBasis.priceBasisByCategory.material='sell_price';
  assert.equal(currentRun(roofInputs(),sameBasis).resultType,auditReady);
  for(const value of [-1,0,1]){
    const changed=structuredClone(p);changed.pricing.ceilingMaterialPerSqftPerCoat=value;
    const r=exactRepairQuote139(c,changed,{...defaults,markupPercent:20,taxMode:'TAX_MATERIALS',taxPercent:10});
    assert.equal(r.resultType,value<0?auditReview:auditReady);
    if(value>=0)assert.equal(scenario(r).finalTotalCents,value===0?29500:29610);
  }
});
test('repair 144: review-only metadata names exact supported fields and the actual outstanding scope decisions',()=>{
  const metadata=getVNextPriceBookMetadata(),find=t=>metadata.find(m=>m.serviceType===t);
  for(const type of ['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB']){
    const m=find(type),aggregate=m.reviewOnlyScopes.find(s=>s.when==='Exposed aggregate selected'),demo=m.reviewOnlyScopes.find(s=>s.when==='Demolition selected');
    assert.deepEqual(aggregate.fields,['finishMultiplier']);assert.ok(aggregate.ownerDecisions.some(d=>d.path==='exposedAggregateMaterialPricing'&&d.kind==='finish_material_pricing_contract'));
    assert.deepEqual(demo.fields,['demolitionPerSqft','disposalPerSqft']);
    for(const f of demo.fields)assert.equal(m.pricingFields.find(p=>p.field===f).reviewOnly,true);
    assert.equal(JSON.stringify(m).includes('finishLaborMultiplier'),false);
    for(const scope of m.reviewOnlyScopes)for(const f of scope.fields)assert.ok(m.allowedPricingFields.includes(f));
    const p=concreteService({},type),c={dimensionMethod:'exact',length:10,width:20,thickness:4,finishType:'broom',demolitionNeeded:false,reinforcement:'none',accessDifficulty:'easy',baseNeeded:false};
    assert.equal(currentRun(c,p).resultType,auditReady);
    assert.equal(currentRun({...c,finishType:'exposed_aggregate'},p).resultType,auditReview);
    assert.equal(currentRun({...c,demolitionNeeded:true,demolitionAreaSqft:200},p).resultType,auditReview);
  }
  const siding=find('SIDING_REPLACEMENT'),removal=siding.reviewOnlyScopes.find(s=>s.when==='Existing siding removal selected');
  assert.deepEqual(removal.fields,['removalPerSqft','disposalPerSqft']);for(const f of removal.fields)assert.equal(siding.pricingFields.find(p=>p.field===f).reviewOnly,true);
  for(const m of metadata)for(const scope of m.reviewOnlyScopes){assert.ok(scope.ownerDecisions.length);for(const f of scope.fields)assert.ok(m.allowedPricingFields.includes(f));}
  assert.deepEqual(find('LANDSCAPING_MOWING').reviewOnlyScopes,[]);
});
test('repair 145: fully rebuilt rate multiplier fee tax and markup forgeries cannot detach calculations from retained configuration',()=>{
  const p=interiorService(),c=interiorInputs(),original=currentRun(c,p);
  assert.equal(scenario(original).finalTotalCents,15000);
  const rate=structuredClone(p);rate.pricing.laborPerWallSqftPerCoat=200;
  const factor=structuredClone(p);factor.pricing.wallHeightLaborMultiplier.standard=2;
  for(const [owner,b,total]of [[rate,defaults,25000],[factor,defaults,25000],[p,{...defaults,markupPercent:50},20000],[p,{...defaults,taxMode:'TAX_ALL',taxPercent:10},16500]]){
    const rebuilt=exactRepairQuote139(c,owner,b);assert.equal(scenario(rebuilt).finalTotalCents,total);
    const forged=forgeConsistentResult139(original,rebuilt);
    assert.deepEqual(forged.calculationRecord.ownerConfiguration,original.calculationRecord.ownerConfiguration);
    assert.deepEqual(forged.calculationRecord.financialInputs,original.calculationRecord.financialInputs);
    assert.equal(sanitizeForCustomerVNext(forged).resultType,auditReview);
  }
  const feeOwner=interiorService({}, {feeRules:{...feeRules,travel:'always'}});
  const feeOriginal=exactRepairQuote139(c,feeOwner,{...defaults,travelFee:100});
  const feeChanged=exactRepairQuote139(c,feeOwner,{...defaults,travelFee:200});
  assert.equal(scenario(feeOriginal).finalTotalCents,15100);assert.equal(scenario(feeChanged).finalTotalCents,15200);
  assert.equal(sanitizeForCustomerVNext(forgeConsistentResult139(feeOriginal,feeChanged)).resultType,auditReview);
  const seasonal=interiorService({}, {peakMonths:[1],peakSurchargePercent:10});
  const inSeason=exactRepairQuote139(c,seasonal,defaults,{currentMonth:1}),outSeason=exactRepairQuote139(c,seasonal,defaults,{currentMonth:2});
  assert.equal(scenario(inSeason).finalTotalCents,16000);assert.equal(scenario(outSeason).finalTotalCents,15000);
  assert.equal(sanitizeForCustomerVNext(forgeConsistentResult139(inSeason,outSeason)).resultType,auditReview);
  for(const financialInputs of [undefined,{},null]){const changed=structuredClone(original);changed.calculationRecord.financialInputs=financialInputs;assert.equal(sanitizeForCustomerVNext(changed).resultType,auditReview);}
  assert.equal(sanitizeForCustomerVNext(structuredClone(original)).resultType,auditReady);
  assert.deepEqual(original.calculationRecord.financialInputs,{businessDefaults:defaults,feeSelections:{},currentMonth:1});
});
test('repair 146: free included zero physical scope and sub-cent rounding have distinct private evidence reasons',()=>{
  const c=interiorInputs({ceilingsIncluded:true,ceilingAreaSqft:100,ceilingCoats:1});
  const p=includedFixture(interiorService({ceilingMaterialPerSqftPerCoat:0}),{ceilingMaterialPerSqftPerCoat:'materialPerWallSqftPerCoat'});
  const included=currentRun(c,p),inc=line(included,'Ceiling materials');
  const free=currentRun(interiorInputs(),freeFixture(interiorService({laborPerWallSqftPerCoat:0,materialPerWallSqftPerCoat:0}))),freeLine=line(free,'Wall paint and materials');
  const noScope=currentRun(roofInputs({deckingSheets:0}),roofService({deckingPerSheet:5000})),scopeLine=line(noScope,'Decking replacement');
  const fractionalOwner=auditMowP();fractionalOwner.pricing.mowingBaseRatePerSqft=0.01;fractionalOwner.pricing.minimumServiceCharge=100;
  const fractional=currentRun({...auditMowC(),yardSqft:1},fractionalOwner);
  const rounded=line(fractional,'Mowing labor');
  assert.deepEqual([freeLine.noChargeReason,inc.noChargeReason,scopeLine.noChargeReason,rounded.noChargeReason],['explicitly_free','included_in_another_price','zero_physical_scope','rounded_fractional_cent']);
  assert.equal(inc.includedInPricePath,'materialPerWallSqftPerCoat');
  assert.equal(scopeLine.calculation.quantity,0);assert.deepEqual(scopeLine.calculation.exactQuantity,{numerator:'0',denominator:'1'});
  assert.equal(rounded.amountCents,0);assert.equal(rounded.calculation.rateCents,0.01);assert.equal(rounded.calculation.quantity,1);assert.deepEqual(rounded.calculation.exactUnroundedCents,{numerator:'1',denominator:'100'});
  for(const [rate,expected] of [[0.49,0],[0.5,1],[0.51,1]]){
    const changed=structuredClone(fractionalOwner);changed.pricing.mowingBaseRatePerSqft=rate;
    const r=currentRun({...auditMowC(),yardSqft:1},changed),item=line(r,'Mowing labor');
    assert.equal(item.amountCents,expected);assert.equal(item.noChargeReason,expected===0?'rounded_fractional_cent':undefined);
    assert.equal(scenario(r).finalTotalCents,100);
  }
  for(const sheets of [-1,0,1]){
    const r=currentRun(roofInputs({deckingSheets:sheets}),roofService({deckingPerSheet:5000}));
    assert.equal(r.resultType,sheets<0?auditReview:auditReady);
    if(sheets>=0)assert.equal(lineAmount(r,'Decking replacement'),sheets*5000);
  }
  for(const result of [included,free,noScope,fractional])assert.equal(/includedInPricePath|ratePath|rateCents|noChargeReason/.test(JSON.stringify(sanitizeForCustomerVNext(result))),false);
  const positive=currentRun(roofInputs({deckingSheets:1}),roofService({deckingPerSheet:5000}));assert.equal(lineAmount(positive,'Decking replacement'),5000);assert.equal(line(positive,'Decking replacement').noChargeReason,undefined);
});

test('precision follow-up: composite sub-cent components retain rounding provenance and cannot activate dormant inclusion',()=>{
  for(const serviceType of ['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB']){
    for(const finish of [1,1.0196,1.02,1.0204]){
      const p=concreteService({laborPerSqft:1},serviceType);p.pricing.finishMultiplier.smooth=finish;
      const c=concreteInputs({length:5,width:5,finishType:'smooth'});
      for(const owner of [p,includedFixture(structuredClone(p),{laborPerSqft:'concreteCostPerCubicYard'})]){
        const r=currentRun(c,owner);assert.equal(r.resultType,auditReady,JSON.stringify(r));
        const labor=line(r,'Concrete labor'),components=labor.calculation.components;
        // 25 sq ft * 1 cent base = 25 cents. Finish extras are 0, .49, .50, .51 cents.
        assert.equal(labor.amountCents,finish<1.02?25:26);
        assert.equal(components.length,finish===1?1:2);
        if(finish>1){
          const extra=components[1],expected=finish<1.02?0:1;
          assert.equal(extra.amountCents,expected);
          assert.equal(extra.noChargeReason,expected===0?'rounded_fractional_cent':undefined);
          assert.equal(extra.includedInPricePath,undefined);
        }
        assert.equal(scenario(r).finalTotalCents,finish<1.02?56136:56137);
        const direct=calculateServiceVNext(serviceType,c,owner.pricing,{ownerPricing:owner});
        assert.deepEqual(line(direct,'Concrete labor').calculation.components,components);
        assert.equal(/ratePath|noChargeReason|includedInPricePath/.test(JSON.stringify(sanitizeForCustomerVNext(r))),false);
      }
    }
    const p=freeFixture(concreteService({laborPerSqft:0,concreteCostPerCubicYard:0,formworkPerLF:0},serviceType));
    const c=concreteInputs({length:5,width:5,finishType:'smooth'});
    const free=currentRun(c,p);
    assert.equal(scenario(free).finalTotalCents,0);
    assert.ok(line(free,'Concrete labor').calculation.components.every(x=>x.noChargeReason==='explicitly_free'));
    const unclassified=structuredClone(p);delete unclassified.zeroPricePolicy;
    assert.equal(currentRun(c,unclassified).resultType,auditReview);
  }
});

test('repair 147: requested stored and receipt service types agree for every source and ordinary edits cannot convert identity',()=>{
  const c=interiorInputs();
  for(const source of ['MANUAL','AI_SUGGESTED','AI_INTERVIEW']){
    let p=interiorService({}, {source});if(source!=='MANUAL')p=auditApprove(p);
    const good=currentRun(c,p);assert.equal(scenario(good).finalTotalCents,15000);
    assert.equal(good.calculationRecord.ownerConfiguration.origin.serviceType,p.serviceType);
    for(const [path,change] of [
      ['serviceType',x=>delete x.serviceType],
      ['serviceType',x=>x.serviceType='LANDSCAPING_MOWING'],
      ['origin.serviceType',x=>delete x.origin.serviceType],
      ['origin.serviceType',x=>x.origin.serviceType='LANDSCAPING_MOWING']
    ]){
      const bad=structuredClone(p);change(bad);
      const r=currentRun(c,bad,{serviceType:p.serviceType});
      assert.equal(r.resultType,auditReview);
      assert.ok(r.ownerDiagnostics.some(d=>d.kind==='service_identity'&&d.path===path),JSON.stringify(r));
      assert.ok(validateServiceRulesDetailed(bad,p.serviceType).some(d=>d.kind==='service_identity'&&d.path===path));
    }
    assert.throws(()=>editVNextService(p,{serviceType:'LANDSCAPING_MOWING'}),/cannot change/);
    const labelEdit=editVNextService(p,{service:'Updated owner label'});
    assert.equal(labelEdit.id,p.id);assert.deepEqual(labelEdit.origin,p.origin);
    assert.equal(scenario(currentRun(c,labelEdit)).finalTotalCents,15000);
    let converted=service('LANDSCAPING_MOWING',auditMowP().pricing,{source});
    if(source!=='MANUAL')converted=auditApprove(converted);
    assert.notEqual(converted.id,p.id);
    assert.equal(converted.origin.serviceType,'LANDSCAPING_MOWING');
    assert.equal(scenario(currentRun(auditMowC(),converted)).finalTotalCents,10000);
    const forged=structuredClone(good);forged.calculationRecord.ownerConfiguration.serviceType='LANDSCAPING_MOWING';
    const publicResult=sanitizeForCustomerVNext(forged);
    assert.equal(publicResult.resultType,auditReview);
    assert.deepEqual(Object.keys(publicResult).sort(),['customerMessage','quoteId','resultType']);
  }
});

test('repair 147: equivalent UUID spellings canonicalize consistently across identity approvals zero policy offerings facts and duplicate detection',()=>{
  for(const source of ['MANUAL','AI_SUGGESTED','AI_INTERVIEW']){
    let p=includedFixture(interiorService({}, {source}),{});
    if(source!=='MANUAL')p=auditApprove(p);
    const changes=[
      x=>x.id=x.id.toUpperCase(),
      x=>x.origin.serviceId=x.origin.serviceId.toUpperCase(),
      x=>x.zeroPricePolicy.serviceId=x.zeroPricePolicy.serviceId.toUpperCase()
    ];
    if(source!=='MANUAL')changes.push(x=>x.approvedValues.laborPerWallSqftPerCoat.serviceId=x.id.toUpperCase());
    for(const change of changes){
      const changed=structuredClone(p);change(changed);
      const r=currentRun(interiorInputs(),changed),stored=r.calculationRecord.ownerConfiguration;
      assert.equal(scenario(r).finalTotalCents,15000);
      assert.equal(r.serviceId,p.id.toLowerCase());
      assert.equal(stored.id,stored.origin.serviceId);assert.equal(stored.id,stored.zeroPricePolicy.serviceId);
      for(const approval of Object.values(stored.approvedValues||{}))assert.equal(approval.serviceId,stored.id);
      assert.equal(materializeVNextService(changed).id,p.id.toLowerCase());
      assert.equal(editVNextService(changed,{service:'Canonical label'}).id,p.id.toLowerCase());
      assert.equal(vNextServiceStatus(changed,defaults).status,'QUOTING LIVE');
      const c=interiorInputs();delete c.wallAreaSqft;
      const review=currentRun(c,changed);
      const lead=buildInternalLeadVNext({request:{serviceType:p.serviceType,ownerPricing:changed,serviceId:p.id.toUpperCase(),customerInputs:c},internalResult:review});
      assert.equal(lead.serviceId,p.id.toLowerCase());assert.equal(lead.originalRequest.serviceId,p.id.toUpperCase());
    }
    const invalid=structuredClone(p);invalid.origin.serviceId='not-a-uuid';
    assert.equal(currentRun(interiorInputs(),invalid).resultType,auditReview);
  }
  for(const source of ['MANUAL','AI_SUGGESTED','AI_INTERVIEW']){
    let p=roofService({}, {source});if(source!=='MANUAL')p=auditApprove(p);
    const c=roofInputs(),field='replacementRoofType',value=c[field],id=p.knownOfferings[field][value];
    const baseline=currentRun(c,p);
    const registry=structuredClone(p);registry.knownOfferings[field][value]=id.toUpperCase();
    const fromRegistry=currentRun(c,registry);
    assert.equal(scenario(fromRegistry).finalTotalCents,scenario(baseline).finalTotalCents);
    assert.equal(fromRegistry.calculationRecord.ownerConfiguration.knownOfferings[field][value],id);
    const fact=structuredClone(c);fact.confirmedFacts[field].offeringId=id.toUpperCase();
    const fromFact=currentRun(fact,p);
    assert.equal(scenario(fromFact).finalTotalCents,scenario(baseline).finalTotalCents);
    assert.equal(fromFact.submittedCustomerInputs.confirmedFacts[field].offeringId,id.toUpperCase());
    assert.equal(fromFact.options[0].calculationRecord.normalizedCustomerInputs.confirmedFacts[field].offeringId,id);
    const mismatch=structuredClone(fact);mismatch.confirmedFacts[field].offeringId=p.knownOfferings[field].metal;
    assert.equal(currentRun(mismatch,p).resultType,auditReview);
    const collision=structuredClone(p);collision.knownOfferings[field].metal=id.toUpperCase();
    assert.ok(validateServiceRulesDetailed(collision,p.serviceType).some(d=>d.kind==='duplicate_offering_id'));
  }
  const a=interiorService(),b=auditMowP();b.id=a.id.toUpperCase();b.origin.serviceId=b.id;
  const statuses=vNextPricebookStatuses({defaults,services:[a,b]});
  for(let i=0;i<2;i++)assert.ok(statuses[i].ownerDiagnostics.some(d=>d.kind==='duplicate_service_id'&&d.path==='services.'+i+'.id'));
});

test('repair 148: explicit free offerings bypass only their own minima with private evidence and paid sibling controls',()=>{
  const c=interiorInputs();
  for(const taxMode of ['TAX_NONE','TAX_MATERIALS','TAX_ALL']){
    const b={...defaults,taxMode,taxPercent:taxMode==='TAX_NONE'?0:10,minimumJobPrice:20000};
    for(const serviceMinimum of [0,1,19999,20000,20001]){
      const p=freeFixture(interiorService({laborPerWallSqftPerCoat:0,materialPerWallSqftPerCoat:0,minimumJob:serviceMinimum}));
      const r=currentRun(c,p,{businessDefaults:b});
      assert.equal(r.resultType,auditReady,JSON.stringify(r));
      const m=scenario(r).minimum;
      assert.equal(scenario(r).finalTotalCents,0);
      assert.deepEqual([r.lowEstimate,r.midEstimate,r.highEstimate],[0,0,0]);
      assert.equal(m.businessMinimumCents,20000);assert.equal(m.serviceMinimumCents,serviceMinimum);
      assert.equal(m.configuredMinimumCents,Math.max(20000,serviceMinimum));
      assert.equal(m.effectiveMinimumCents,0);assert.equal(m.adjustmentCents,0);
      assert.equal(m.bypassed,true);assert.equal(m.bypassReason,'explicit_free_offering');
      assert.equal(/bypass|zeroPricePolicy|ownerId|serviceId/i.test(JSON.stringify(sanitizeForCustomerVNext(r))),false);
      const paid=interiorService({minimumJob:serviceMinimum});
      const paidResult=currentRun(c,paid,{businessDefaults:b});
      // 15,000 base cents; the minimum dominates. TAX_ALL adds 10% after that floor.
      const floor=Math.max(20000,serviceMinimum);
      assert.equal(scenario(paidResult).finalTotalCents,floor+(taxMode==='TAX_ALL'?oracleRound(oracleDivide(floor,10)):0));
      assert.equal(scenario(paidResult).minimum.bypassed,undefined);
    }
    const tiered=freeFixture(interiorService({minimumJob:17000}),{freeCompleteService:false,freeTiers:['Free']});
    tiered.tiers=[{name:'Free',overrides:{laborPerWallSqftPerCoat:0,materialPerWallSqftPerCoat:0}},{name:'Paid',overrides:{}}];
    const r=currentRun(c,tiered,{businessDefaults:b});
    assert.deepEqual(r.options.map(o=>[o.tierName,o.calculationRecord.scenarios.mid.finalTotalCents]),[['Free',0],['Paid',taxMode==='TAX_ALL'?22000:20000]]);
    assert.equal(r.options[0].calculationRecord.scenarios.mid.minimum.bypassed,true);
    assert.equal(r.options[1].calculationRecord.scenarios.mid.minimum.bypassed,undefined);
  }
  const p=freeFixture(interiorService({laborPerWallSqftPerCoat:0,materialPerWallSqftPerCoat:0}));
  p.feeRules.travel='always';
  for(const travelFee of [0,1]){
    const r=currentRun(c,p,{businessDefaults:{...defaults,minimumJobPrice:100,travelFee}});
    assert.equal(r.resultType,travelFee===0?auditReady:auditReview);
    if(travelFee===1)assert.ok(r.invalidOwnerFields.includes('zeroPricePolicy'));
  }
  const paidCore=structuredClone(p);paidCore.pricing.laborPerWallSqftPerCoat=1;
  assert.equal(currentRun(c,paidCore).resultType,auditReview);
});

test('repair 149: positive cent ranges never display free and retain exact cents only when whole-dollar display would contain zero',()=>{
  // Explicit integer-cent controls derived from one measured sq ft at the entered cent rate.
  const cases=[
    [1,0,[1,1,1],[.01,.01,.01]],[1,1,[1,1,1],[.01,.01,.01]],[1,10,[1,1,1],[.01,.01,.01]],[1,25,[1,1,1],[.01,.01,.01]],
    [49,0,[49,49,49],[.49,.49,.49]],[49,1,[49,49,49],[.49,.49,.49]],[49,10,[44,49,54],[.44,.49,.54]],[49,25,[37,49,61],[.37,.49,.61]],
    [50,0,[50,50,50],[.5,.5,.5]],[50,1,[50,50,51],[.5,.5,.51]],[50,10,[45,50,55],[.45,.5,.55]],[50,25,[38,50,63],[.38,.5,.63]],
    [99,0,[99,99,99],[.99,.99,.99]],[99,1,[98,99,100],[.98,.99,1]],[99,10,[89,99,109],[.89,.99,1.09]],[99,25,[74,99,124],[.74,.99,1.24]],
    [100,0,[100,100,100],[1,1,1]],[100,1,[99,100,101],[.99,1,1.01]],[100,10,[90,100,110],[.9,1,1.1]],[100,25,[75,100,125],[.75,1,1.25]],
    [101,0,[101,101,101],[1.01,1.01,1.01]],[101,1,[100,101,102],[1,1,2]],[101,10,[91,101,111],[.91,1.01,1.11]],[101,25,[76,101,126],[.76,1.01,1.26]],
    [110,10,[99,110,121],[.99,1.1,1.21]],[111,10,[100,111,122],[1,1,2]],[112,10,[101,112,123],[1,1,2]],
    [1000,10,[900,1000,1100],[9,10,11]]
  ];
  const c={...auditMowC(),yardSqft:1};
  for(const [cents,buffer,expectedRange,display]of cases){
    const p=auditMowP();p.pricing.mowingBaseRatePerSqft=cents;
    const r=currentRun(c,p,{businessDefaults:{...defaults,rangeBufferPercent:buffer}});
    assert.equal(scenario(r).finalTotalCents,cents);
    const range=r.calculationRecord.options[0].range;
    assert.deepEqual([range.lowCents,range.midCents,range.highCents],expectedRange);
    assert.deepEqual([r.lowEstimate,r.midEstimate,r.highEstimate],display);
    const customer=sanitizeForCustomerVNext(r);
    assert.deepEqual([customer.lowEstimate,customer.midEstimate,customer.highEstimate],display);
    assert.ok(display.every(v=>v>0));
    assert.ok(oracleDecimal(oracleSubtract(oracleMultiply(display[0],100),expectedRange[0])).numerator<=0n);
    assert.ok(oracleDecimal(oracleSubtract(oracleMultiply(display[2],100),expectedRange[2])).numerator>=0n);
  }
  const zero=auditMowP();zero.pricing.mowingBaseRatePerSqft=0;
  assert.equal(currentRun(c,zero).resultType,auditReview);
  const free=currentRun(c,freeFixture(zero));
  assert.deepEqual([free.lowEstimate,free.midEstimate,free.highEstimate],[0,0,0]);
});

test('repair 150: every inclusion path belongs to the exact configured service price contract',()=>{
  const c=interiorInputs();
  const mappings=[
    {materialPerWallSqftPerCot:'laborPerWallSqftPerCoat'},
    {materialPerWallSqftPerCoat:'laborPerWallSqftPerCot'},
    {concreteCostPerCubicYard:'materialPerWallSqftPerCoat'},
    {materialPerWallSqftPerCoat:'wallHeightLaborMultiplier.standard'},
    {materialPerWallSqftPerCoat:'taxabilityByCategory.material'},
    {materialPerWallSqftPerCoat:'minimumJob'}
  ];
  for(const mapping of mappings){
    const p=includedFixture(interiorService(),mapping),path='zeroPricePolicy.includedPrices.'+Object.keys(mapping)[0];
    const r=currentRun(c,p);
    assert.equal(r.resultType,auditReview);assert.ok(r.ownerDiagnostics.some(d=>d.path===path&&d.kind==='included_price_path'));
    assert.ok(vNextServiceStatus(p,defaults).ownerDiagnostics.some(d=>d.path===path));
    const book=quoteFromVNextPricebook({pricebook:{defaults,services:[p]},serviceType:p.serviceType,customerInputs:c,callerType:'owner',currentMonth:1});
    assert.equal(currentInspect(book).resultType,auditReview);
  }
  const roof=includedFixture(roofService(),{'materialCostPerSquare.typo':'materialCostPerSquare.asphalt_shingle'});
  assert.ok(currentRun(roofInputs(),roof).ownerDiagnostics.some(d=>d.path==='zeroPricePolicy.includedPrices.materialCostPerSquare.typo'));
  const valid=includedFixture(interiorService({ceilingMaterialPerSqftPerCoat:0}),{ceilingMaterialPerSqftPerCoat:'materialPerWallSqftPerCoat'});
  const selected=interiorInputs({ceilingsIncluded:true,ceilingAreaSqft:100,ceilingCoats:1});
  const r=currentRun(selected,valid);
  assert.equal(scenario(r).finalTotalCents,25000);
  assert.equal(line(r,'Ceiling materials').includedInPricePath,'materialPerWallSqftPerCoat');
  const cross=includedFixture(interiorService({materialPerWallSqftPerCoat:0}),{materialPerWallSqftPerCoat:'laborPerWallSqftPerCoat'});
  assert.ok(currentRun(c,cross).ownerDecisionRequired.some(d=>d.kind==='included_price_allocation'));
});

test('repair 150: dormant tier inclusion is validated using effective tier prices and preserves valid sibling options',()=>{
  const p=interiorService();delete p.pricing.ceilingMaterialPerSqftPerCoat;
  p.tiers=[{name:'Base',overrides:{}},{name:'Included',overrides:{ceilingMaterialPerSqftPerCoat:0}}];
  const configured=includedFixture(p,{ceilingMaterialPerSqftPerCoat:'materialPerWallSqftPerCoat'});
  const c=interiorInputs();
  const valid=currentRun(c,configured);
  assert.deepEqual(valid.options.map(o=>o.tierName),['Base','Included']);
  assert.ok(valid.options.every(o=>o.calculationRecord.scenarios.mid.finalTotalCents===15000));
  for(const price of [-1,0,1]){
    const changed=structuredClone(configured);changed.tiers[1].overrides.materialPerWallSqftPerCoat=price;
    const r=currentRun(c,changed);
    assert.equal(r.resultType,auditReady);
    assert.deepEqual(r.options.map(o=>o.tierName),price>0?['Base','Included']:['Base']);
    if(price<=0)assert.ok(r.failedTierDiagnostics[0].ownerDiagnostics.some(d=>d.path==='zeroPricePolicy.includedPrices.ceilingMaterialPerSqftPerCoat'));
    else assert.equal(r.options[1].calculationRecord.scenarios.mid.finalTotalCents,10100); // 100*100 labor + 100*1 material.
  }
  assert.ok(validateServiceRulesDetailed(configured,p.serviceType).every(d=>d.kind!=='included_price_path'));
  const unconfigured=structuredClone(configured);unconfigured.tiers[1].overrides={};
  assert.ok(currentRun(c,unconfigured).ownerDiagnostics.some(d=>d.path==='zeroPricePolicy.includedPrices.ceilingMaterialPerSqftPerCoat'));
});


// Revised owner handoff, starting at 6036cdb. Literal monetary expectations below
// are derived from stated fixture prices, independently of candidate helpers.
function handoffMowing(overrides = {}) {
  return service('LANDSCAPING_MOWING', {
    mowingBaseRatePerSqft: 10000, minimumServiceCharge: 0,
    frequencyMultipliers: { weekly: 1, biweekly: 1.2, monthly: 1.5, one_time: 1.8 },
    overgrowthMultipliers: { maintained: 1, overgrown: 1.5, severe: 2 },
    baggingSurchargePercent: 10, edgingPerLinearFoot: 100, ...overrides
  });
}
function handoffLawn(overrides = {}) {
  return { yardSqft: 1, sqftMethod: 'exact', serviceFrequency: 'weekly',
    grassCondition: 'maintained', bagClippings: false, edgingIncluded: false, ...overrides };
}
function handoffRequest(p, c, b = {}) {
  return { serviceType: p.serviceType, customerInputs: c, ownerPricing: p,
    businessDefaults: { ...defaults, rangeBufferPercent: 0, ...b }, callerType: 'owner', currentMonth: 1 };
}
function handoffPaths(request) {
  const book = { pricebook: { defaults: request.businessDefaults, services: [request.ownerPricing] },
    serviceType: request.serviceType, customerInputs: request.customerInputs, currentMonth: 1, callerType: 'owner' };
  const results = [generateQuoteVNext(request), previewQuoteVNext(request), quoteFromVNextPricebook(book), previewFromVNextPricebook(book)];
  for (const result of results) currentInspect(result);
  const customer = quoteFromVNextPricebook({ ...book, callerType: 'customer' });
  assert.equal(customer.resultType, sanitizeForCustomerVNext(results[0]).resultType);
  const withoutId = r => { const copy = structuredClone(r); delete copy.quoteId; return copy; };
  assert.deepEqual(withoutId(customer), withoutId(sanitizeForCustomerVNext(results[0])));
  return results;
}
function handoffTotal(result, expected) {
  assert.equal(result.resultType, auditReady, JSON.stringify(result));
  for (const option of result.options) {
    assert.equal(option.calculationRecord.scenarios.mid.finalTotalCents, expected);
    assert.equal(option.disclaimer.includes('This estimate does not include:'),option.skippedAddons.length>0);
    for(const name of option.skippedAddons)assert.ok(option.disclaimer.includes(name));
  }
}

test('handoff A: unrestricted markup has exact positive boundary and gross-margin controls', () => {
  const p = handoffMowing(), c = handoffLawn();
  // One measured square foot at 10000 cents and both owner factors 1 gives $100 cost.
  for (const [percent, total] of [[0,10000],[50,15000],[99.99,19999],[100,20000],[100.01,20001],
    [149.99,24999],[150,25000],[150.01,25001],[499.99,59999],[500,60000],[500.01,60001],
    [999.99,109999],[1000,110000],[1000.0000000000001,110000],[1000.01,110001],[1200,130000],[1000000,100010000]]) {
    const request = handoffRequest(p,c,{markupPercent:percent});
    assert.equal(validateBusinessDefaults(request.businessDefaults).ok,true);
    const result = currentInspect(generateQuoteVNext(request));
    handoffTotal(result,total);
    assert.equal(scenario(result).markup.percent,percent);
    assert.equal(scenario(result).markup.amountCents,total-10000);
  }
  for (const [percent,total] of [[0,10000],[50,20000],[90,100000],[99,1000000],[99.9,10000000]]) {
    handoffTotal(currentInspect(generateQuoteVNext(handoffRequest(p,c,{markupMode:'margin',markupPercent:percent}))),total);
  }
  for (const percent of [-1,NaN,Infinity,-Infinity]) {
    assert.equal(currentInspect(generateQuoteVNext(handoffRequest(p,c,{markupPercent:percent}))).resultType,auditReview);
  }
  for (const percent of [100,100.00000000000001,1200]) {
    assert.equal(currentInspect(generateQuoteVNext(handoffRequest(p,c,{markupMode:'margin',markupPercent:percent}))).resultType,auditReview);
  }
  // A technical monetary overflow is separate from percentage validation.
  const overflow = handoffRequest(p,c,{markupPercent:1e308});
  assert.equal(validateBusinessDefaults(overflow.businessDefaults).ok,true);
  const blocked = currentInspect(generateQuoteVNext(overflow));
  assert.equal(blocked.resultType,auditReview);
  assert.ok(blocked.invalidOwnerFields.includes('markupPercent'));
  // The same finite percentage is valid when there is no eligible cost to mark up.
  const sold = structuredClone(p); sold.priceBasisByCategory.labor='sell_price';
  handoffTotal(currentInspect(generateQuoteVNext(handoffRequest(sold,c,{markupPercent:1e308}))),10000);
  // Ordinary markup does not relax the distinct optional surcharge contract.
  const badBag = handoffMowing({baggingSurchargePercent:500.01});
  assert.equal(currentInspect(generateQuoteVNext(handoffRequest(badBag,handoffLawn({bagClippings:true})))).resultType,auditReview);
});

test('handoff A: quote preview price-book activation and evidence agree above the former cap', () => {
  const p=handoffMowing(), c=handoffLawn(), request=handoffRequest(p,c,{markupPercent:1200});
  for(const result of handoffPaths(request)) handoffTotal(result,130000);
  assert.equal(vNextServiceStatus(p,request.businessDefaults).status,'QUOTING LIVE');
  assert.equal(validateVNextPricebook({defaults:request.businessDefaults,services:[p]}).ok,true);
  const sold=structuredClone(p);sold.priceBasisByCategory.labor='sell_price';
  for(const result of handoffPaths(handoffRequest(sold,c,{markupPercent:1200})))handoffTotal(result,10000);
  handoffTotal(currentInspect(generateQuoteVNext(handoffRequest(p,c,{markupPercent:1200,markupApplies:{...markupApplies,labor:false}}))),10000);
  const inactive={...p,active:false};const frozen=structuredClone(inactive);
  const preview=previewQuoteVNext(handoffRequest(inactive,c,{markupPercent:1200}));
  handoffTotal(preview,130000);assert.equal(preview.customerEligible,false);
  assert.equal(sanitizeForCustomerVNext(preview).resultType,auditReview);assert.deepEqual(inactive,frozen);
  const valid=generateQuoteVNext(request), forged=structuredClone(valid);
  forged.calculationRecord.financialInputs.businessDefaults.markupPercent=1199;
  assert.equal(sanitizeForCustomerVNext(forged).resultType,auditReview);
});

test('handoff A: high markup preserves category tax fee and tier arithmetic', () => {
  const p=handoffMowing(), c=handoffLawn({bagClippings:true,edgingIncluded:true,edgingLengthLF:10});
  p.feeRules.travel='always';p.taxabilityByCategory.addon=true;p.taxabilityByCategory.disposal=true;
  // Labor10000 + bagging1000 + edging1000 + travel500 =12500; markup1200%=150000.
  // TAX_MATERIALS configured taxable extras2000 + their markup24000 =>2600 tax.
  for(const [taxMode,total] of [['TAX_NONE',162500],['TAX_MATERIALS',165100],['TAX_ALL',178750]]) {
    const r=currentInspect(generateQuoteVNext(handoffRequest(p,c,{markupPercent:1200,travelFee:500,taxMode,taxPercent:taxMode==='TAX_NONE'?0:10})));
    handoffTotal(r,total);assert.equal(lineAmount(r,'Travel'),500);
    assert.equal(lineAmount(r,'Clipping bagging and disposal'),1000);assert.equal(lineAmount(r,'Lawn edging'),1000);
  }
  const tiers=handoffMowing();tiers.tiers=[{name:'Base',overrides:{}},{name:'Higher',overrides:{mowingBaseRatePerSqft:20000}}];
  const r=currentInspect(generateQuoteVNext(handoffRequest(tiers,handoffLawn(),{markupPercent:1200})));
  assert.deepEqual(r.options.map(o=>o.calculationRecord.scenarios.mid.finalTotalCents),[130000,260000]);
});

function handoffSelections() {
  const flat=service('FLAT_ROOF_REPAIR',{laborHourlyRate:10000,repairMinimum:0,
    patchRepairHours:{epdm:{seam_patch:{small:2,medium:4,large:8}}},
    patchMaterialAllowance:{epdm:{seam_patch:{small:4000,medium:8000,large:16000}}},pondingWaterSurcharge:1000});
  const flatInputs=confirmedFixtureInputs({repairType:'seam_patch',affectedArea:10,membraneType:'epdm',leakPresent:false,pondingWater:false});
  return [
    {p:handoffMowing(),c:handoffLawn(),select:{bagClippings:true},field:'baggingSurchargePercent',name:'Clipping bagging and disposal',base:10000,rate:10,one:100},
    {p:handoffMowing(),c:handoffLawn(),select:{edgingIncluded:true,edgingLengthLF:10},field:'edgingPerLinearFoot',name:'Lawn edging',base:10000,rate:100,one:10},
    {p:flat,c:flatInputs,select:{pondingWater:true},field:'pondingWaterSurcharge',name:'Ponding water surcharge',base:24000,rate:1000,one:1}
  ];
}

test('optional extras: absent prices disclose exclusions; malformed values and disclosure failures still review', () => {
  for(const f of handoffSelections()) {
    const p=structuredClone(f.p);delete p.pricing[f.field];
    const c={...f.c,...f.select}, request=handoffRequest(p,c);
    for(const result of handoffPaths(request)) {
      handoffTotal(result,f.base);
      assert.deepEqual(result.submittedCustomerInputs,c);
      assert.deepEqual(result.options[0].skippedAddons,[f.name]);
      assert.ok(result.options[0].disclaimer.includes('This estimate does not include: '+f.name+'.'));
    }
    assert.deepEqual(generateQuoteVNext(request).submittedCustomerInputs,c);
    assert.throws(()=>calculateServiceVNext(p.serviceType,c,p.pricing,{ownerPricing:p,skipAddon(){throw Error('disclosure failure');}}),e=>e.invalidOwnerFields?.includes('addonDisclosureContext'));
    assert.equal(vNextServiceStatus(p,request.businessDefaults).status,'QUOTING LIVE');
    for(const malformed of [null,'']) {
      const bad=structuredClone(p);bad.pricing[f.field]=malformed;
      const badRequest=handoffRequest(bad,c);
      const lead=buildInternalLeadVNext({request:badRequest,internalResult:generateQuoteVNext(badRequest)});
      assert.deepEqual(lead.originalRequest,badRequest);assert.deepEqual(lead.submittedCustomerInputs,c);
      for(const result of handoffPaths(badRequest)) {
        assert.equal(result.resultType,auditReview);
        assert.ok(result.invalidOwnerFields.includes(f.field));
        assert.deepEqual(result.submittedCustomerInputs,c);
      }
    }
  }
});

test('handoff B: priced and explicitly zero selections charge once with signed price boundaries', () => {
  for(const f of handoffSelections())for(const [rate,extra] of [[-1,null],[0,0],[1,f.one],[f.rate,1000]]) {
    const p=structuredClone(f.p);p.pricing[f.field]=rate;
    const request=handoffRequest(p,{...f.c,...f.select}),result=currentInspect(generateQuoteVNext(request));
    if(rate<0){assert.equal(result.resultType,auditReview);continue;}
    handoffTotal(result,f.base+extra);
    assert.equal(result.options[0].lineItems.filter(l=>l.name===f.name).length,1);
    assert.equal(lineAmount(result,f.name),extra);
    if(rate===0)assert.equal(line(result,f.name).noCharge,true);
    assert.equal(vNextServiceStatus(p,request.businessDefaults).status,'QUOTING LIVE');
  }
  const p=handoffMowing();p.feeRules.disposal='always';
  const c=handoffLawn({bagClippings:true});
  const priced=currentInspect(generateQuoteVNext(handoffRequest(p,c,{disposalFee:50000})));
  handoffTotal(priced,11000);assert.equal(priced.lineItems.some(l=>l.name==='Disposal'),false);
  handoffTotal(currentInspect(generateQuoteVNext(handoffRequest(p,handoffLawn(),{disposalFee:50000}))),60000);
  // Selected mowing edging uses the existing 0.1-LF minimum; no-edging is the false selection.
  for (const length of [0,0.0999,0.1,0.1001]) {
    const result=currentInspect(generateQuoteVNext(handoffRequest(p,handoffLawn({edgingIncluded:true,edgingLengthLF:length}),{disposalFee:50000})));
    if (length<0.1) { assert.equal(result.resultType,auditReview); assert.deepEqual(result.invalidCustomerFields,['edgingLengthLF']); }
    else { handoffTotal(result,60010); assert.equal(lineAmount(result,'Lawn edging'),10); }
  }
  const malformed=handoffMowing({baggingSurchargePercent:null});
  const blocked=currentInspect(generateQuoteVNext(handoffRequest(malformed,handoffLawn())));
  assert.equal(blocked.resultType,auditReview);assert.ok(blocked.invalidOwnerFields.includes('baggingSurchargePercent'));
});

test('optional extras: tiers disclose their own exclusions and price edits invalidate AI approval', () => {
  for(const f of handoffSelections()) {
    const p=structuredClone(f.p);delete p.pricing[f.field];
    p.tiers=[{name:'Incomplete',overrides:{}},{name:'Complete',overrides:{[f.field]:f.rate}}];
    for(const result of handoffPaths(handoffRequest(p,{...f.c,...f.select}))) {
      assert.equal(result.resultType,auditReady);assert.equal(result.options[0].calculationRecord.scenarios.mid.finalTotalCents,f.base);assert.deepEqual(result.options.map(o=>o.tierName),['Incomplete','Complete']);
      assert.deepEqual(result.options.map(o=>o.skippedAddons),[[f.name],[]]);
      assert.equal(result.options[1].calculationRecord.scenarios.mid.finalTotalCents,f.base+1000);
      assert.equal(result.optionAvailabilityNotice,undefined);
    }
    const unselected=currentInspect(generateQuoteVNext(handoffRequest(p,f.c)));
    assert.deepEqual(unselected.options.map(o=>o.tierName),['Incomplete','Complete']);handoffTotal(unselected,f.base);
    const draft={...f.p,...fixtureIdentity('AI_SUGGESTED',undefined,f.p.serviceType)};
    const approved=approveVNextValues(draft,{fields:aiConfirmationFieldsVNext(draft,draft.pricing),ownerId:draft.origin.ownerId,operationId:'handoff-approve',approvedAt:'2026-09-10T12:00:00.000Z'});
    const c={...f.c,...f.select};handoffTotal(currentInspect(generateQuoteVNext(handoffRequest(approved,c))),f.base+1000);
    const changed=structuredClone(approved);changed.pricing[f.field]=0;
    const changedRequest=handoffRequest(changed,c),blocked=currentInspect(generateQuoteVNext(changedRequest));
    assert.equal(blocked.resultType,auditReview);assert.ok(blocked.unconfirmedOwnerFields.includes(f.field));
    const preview=previewQuoteVNext(changedRequest);handoffTotal(preview,f.base);
    assert.equal(preview.customerEligible,false);assert.equal(sanitizeForCustomerVNext(preview).resultType,auditReview);
    const reapproved=approveVNextValues(changed,{fields:[f.field],ownerId:draft.origin.ownerId,operationId:'handoff-reapprove',approvedAt:'2026-09-10T12:01:00.000Z'});
    handoffTotal(currentInspect(generateQuoteVNext(handoffRequest(reapproved,c))),f.base);
  }
});

test('handoff C: customer minima retain exact cents across all tax modes service floors and buffers', () => {
  for(const taxMode of ['TAX_NONE','TAX_MATERIALS','TAX_ALL'])for(const minimum of [19999,20000,20001])for(const buffer of [0,0.5,10,25])for(const source of ['business','service']) {
    const p=handoffMowing(source==='service'?{minimumServiceCharge:minimum}:{});
    const b={minimumJobPrice:source==='business'?minimum:0,taxMode,taxPercent:taxMode==='TAX_NONE'?0:10,rangeBufferPercent:buffer};
    // The $100 nontaxable cost is below the floor. Only TAX_ALL adds floor tax.
    const floor=taxMode==='TAX_ALL'?Number((BigInt(minimum)*110n+50n)/100n):minimum;
    const high=floor; // Owner decision: binding minimum is one price.
    const r=currentInspect(generateQuoteVNext(handoffRequest(p,handoffLawn(),b)));handoffTotal(r,floor);
    const range=r.options[0].calculationRecord.range;
    assert.deepEqual([range.lowCents,range.midCents,range.highCents],[floor,floor,high]);
    assert.equal(range.minimumCustomerFloorCents,floor);
    const expected=buffer===0||floor%100!==0?[floor/100,floor/100,high/100]:[floor/100,floor/100,Math.ceil(high/100)];
    const safe=sanitizeForCustomerVNext(r);assert.deepEqual([safe.lowEstimate,safe.midEstimate,safe.highEstimate],expected);
    assert.ok(oracleSubtract(oracleMultiply(safe.lowEstimate,100),floor).numerator>=0n);
    assert.ok(oracleSubtract(oracleMultiply(safe.midEstimate,100),floor).numerator>=0n);
  }
});

test('handoff C: minimum display agrees across entrypoints and does not change nonbinding ranges', () => {
  const p=handoffMowing(),c=handoffLawn();
  for(const result of handoffPaths(handoffRequest(p,c,{minimumJobPrice:20001,rangeBufferPercent:10}))) {
    handoffTotal(result,20001);assert.deepEqual([result.lowEstimate,result.midEstimate,result.highEstimate],[200.01,200.01,200.01]);
  }
  const taxable=structuredClone(p);taxable.taxabilityByCategory.labor=true;
  for(const [taxMode,total,tax,adjustment] of [['TAX_MATERIALS',21001,1000,10001],['TAX_ALL',22001,2000,10001]]) {
    const result=currentInspect(generateQuoteVNext(handoffRequest(taxable,c,{taxMode,taxPercent:10,minimumJobPrice:20001,rangeBufferPercent:10})));
    handoffTotal(result,total);assert.equal(scenario(result).tax.taxCents,tax);assert.equal(scenario(result).minimum.adjustmentCents,adjustment);
    assert.equal(result.lowEstimate,total/100);assert.equal(result.midEstimate,total/100);
  }
  const tiered=handoffMowing();tiered.tiers=[{name:'Fractional',overrides:{minimumServiceCharge:20001}},{name:'Whole',overrides:{minimumServiceCharge:25000}}];
  const tierResult=currentInspect(generateQuoteVNext(handoffRequest(tiered,c,{rangeBufferPercent:10})));
  assert.deepEqual(tierResult.options.map(o=>[o.lowEstimate,o.midEstimate,o.highEstimate]),[[200.01,200.01,200.01],[250,250,250]]);
  const ordinary=currentInspect(generateQuoteVNext(handoffRequest(p,handoffLawn({yardSqft:4}),{minimumJobPrice:20001,rangeBufferPercent:10})));
  assert.deepEqual([ordinary.lowEstimate,ordinary.midEstimate,ordinary.highEstimate],[360,400,440]);handoffTotal(ordinary,40000);
  const valid=generateQuoteVNext(handoffRequest(p,c,{minimumJobPrice:20001,rangeBufferPercent:10}));
  const forged=structuredClone(valid);forged.lowEstimate=200;forged.options[0].lowEstimate=200;
  forged.options[0].calculationRecord.customerProjection.lowEstimate=200;
  forged.calculationRecord.options[0].customerProjection.lowEstimate=200;
  assert.equal(sanitizeForCustomerVNext(forged).resultType,auditReview);
  const exact=currentInspect(generateQuoteVNext(handoffRequest(p,c,{minimumJobPrice:20001,rangeBufferPercent:0})));
  assert.deepEqual([exact.lowEstimate,exact.midEstimate,exact.highEstimate],[200.01,200.01,200.01]);
});

test('handoff C: free sub-dollar and safe-money boundary controls retain their distinct behavior', () => {
  for(const [rate,display] of [[1,[0.01,0.01,0.01]],[49,[0.44,0.49,0.54]],[50,[0.45,0.5,0.55]],
    [99,[0.89,0.99,1.09]],[100,[0.9,1,1.1]],[101,[0.91,1.01,1.11]],[110,[0.99,1.1,1.21]],[111,[1,1,2]],[112,[1,1,2]]]) {
    const r=currentInspect(generateQuoteVNext(handoffRequest(handoffMowing({mowingBaseRatePerSqft:rate}),handoffLawn(),{rangeBufferPercent:10})));
    assert.deepEqual([r.lowEstimate,r.midEstimate,r.highEstimate],display);
  }
  const zero=handoffMowing({mowingBaseRatePerSqft:0}),free=freeFixture(zero);
  const request=handoffRequest(free,handoffLawn(),{minimumJobPrice:20001,rangeBufferPercent:10,markupPercent:1200});
  const r=currentInspect(generateQuoteVNext(request));handoffTotal(r,0);
  assert.deepEqual([r.lowEstimate,r.midEstimate,r.highEstimate],[0,0,0]);
  assert.equal(currentInspect(generateQuoteVNext({...request,ownerPricing:zero})).resultType,auditReview);
  for(const minimum of [Number.MAX_SAFE_INTEGER-1,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1]) {
    const unsafe=currentInspect(generateQuoteVNext(handoffRequest(handoffMowing(),handoffLawn(),{minimumJobPrice:minimum,rangeBufferPercent:25})));
    assert.equal(unsafe.resultType,minimum===Number.MAX_SAFE_INTEGER-1?auditReady:auditReview); // Binding minimum suppresses the buffer; unrepresentable or unsafe amounts still review.
  }
});


test('handoff B: candidate metadata identifies missing selected prices without changing production copy', () => {
  const metadata=getVNextPriceBookMetadata();
  for(const [type,field] of [['LANDSCAPING_MOWING','baggingSurchargePercent'],['LANDSCAPING_MOWING','edgingPerLinearFoot'],['FLAT_ROOF_REPAIR','pondingWaterSurcharge']]) {
    const value=metadata.find(s=>s.serviceType===type).pricingFields.find(f=>f.field===field);
    assert.match(value.help,/optional extra/i);assert.match(value.help,/explicitly excludes/);assert.match(value.help,/explicit zero/i);
  }
});


// September 12 owner precision handoff: these expected decimal cents are written
// independently of the candidate formatter and its rational arithmetic helpers.
const precisionAmountFields = ['lowEstimate', 'midEstimate', 'highEstimate'];
function precisionWireCents(token) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  assert.ok(match, 'Expected a JSON numeric token: ' + token);
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  let numerator = BigInt(whole + fraction) * 100n;
  const scale = fraction.length - Number(exponent);
  const denominator = scale > 0 ? 10n ** BigInt(scale) : 1n;
  if (scale < 0) numerator *= 10n ** BigInt(-scale);
  if (sign) numerator = -numerator;
  assert.equal(numerator % denominator, 0n, 'Wire amount contains a fractional cent: ' + token);
  return numerator / denominator;
}
function precisionCustomerReview(quoteId) {
  return { resultType: auditReview,
    customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.', quoteId };
}
function precisionPublic(result, expectedOptions) {
  const text = JSON.stringify(result);
  assert.deepEqual(JSON.parse(text), result);
  if (!expectedOptions) {
    assert.deepEqual(result, precisionCustomerReview(result.quoteId));
    return;
  }
  const rootFields = ['resultType', 'quoteId', 'lowEstimate', 'midEstimate', 'highEstimate',
    'priceDrivers', 'disclaimer', 'options', 'priceUnit', 'taxTreatment'];
  if (Object.hasOwn(result, 'optionAvailabilityNotice')) rootFields.push('optionAvailabilityNotice');
  assert.deepEqual(Object.keys(result).sort(), rootFields.sort());
  assert.equal(result.resultType, auditReady);
  assert.equal(result.options.length, expectedOptions.length);
  for (const option of result.options) {
    assert.deepEqual(Object.keys(option).sort(), ['tierName', 'lowEstimate', 'midEstimate', 'highEstimate',
      'priceDrivers', 'skippedAddons', 'disclaimer', 'priceUnit', 'taxTreatment'].sort());
  }
  // Inspect decimal tokens from the complete serialized public object, including
  // every root and option amount. No binary multiply-back or toFixed oracle.
  const tokens = [...text.matchAll(/"(lowEstimate|midEstimate|highEstimate)":(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=[,}])/g)];
  assert.equal(tokens.length, 3 * (1 + expectedOptions.length));
  const expected = [expectedOptions[0], ...expectedOptions].flat();
  for (let index = 0; index < tokens.length; index++) {
    assert.equal(tokens[index][1], precisionAmountFields[index % 3]);
    assert.equal(precisionWireCents(tokens[index][2]), BigInt(expected[index]), text);
  }
}
function precisionInspect(result, request, expectedOptions) {
  auditInspect(result); // Walk every value, reproduce internal line evidence, and test clone sanitization.
  assert.equal(result.engineVersion, currentEngineVersion);
  assert.equal(result.serviceType, request.serviceType);
  assert.equal(result.serviceId, request.ownerPricing.id);
  assert.deepEqual(result.submittedCustomerInputs, request.customerInputs);
  assert.deepEqual(structuredClone(result), result);
  const customer = sanitizeForCustomerVNext(result);
  precisionPublic(customer, expectedOptions);
  if (expectedOptions) {
    assert.equal(result.resultType, auditReady, JSON.stringify(result));
    assert.deepEqual(result.calculationRecord.options, result.options.map(option => option.calculationRecord));
    assert.deepEqual(result.calculationRecord.financialInputs.businessDefaults, request.businessDefaults);
    assert.deepEqual(result.calculationRecord.ownerConfiguration.pricing, request.ownerPricing.pricing);
    for (const option of result.options) {
      for (const field of precisionAmountFields) {
        assert.equal(option[field], option.calculationRecord.customerProjection[field]);
      }
    }
  } else {
    assert.equal(result.resultType, auditReview, JSON.stringify(result));
    for (const field of [...precisionAmountFields, 'options', 'lineItems', 'calculationRecord']) {
      assert.equal(Object.hasOwn(result, field), false, field);
    }
  }
  return result;
}
function precisionRepresentationReason(result) {
  assert.match(result.reviewReason, /represent|serializ/i);
  for (const field of ['missingOwnerFields', 'invalidOwnerFields', 'missingCustomerFields',
    'invalidCustomerFields', 'unsupportedOwnerFields', 'unconfirmedOwnerFields', 'ownerDecisionRequired']) {
    assert.deepEqual(result[field] || [], [], field);
  }
  assert.ok(result.ownerDiagnostics.some(item => item.kind === 'customer_amount_representation' &&
    /^customerProjection\.(low|mid|high)Estimate$/.test(item.path)), JSON.stringify(result));
  assert.ok(result.normalizedScope);
  assert.ok(result.validatedMeasurements.length);
}
function precisionRequest(type, source, cents, buffer = 0) {
  const painting = type === 'INTERIOR_PAINTING';
  const p = painting ? interiorService() : handoffMowing({ mowingBaseRatePerSqft: 100 });
  const c = painting ? interiorInputs({ wallAreaSqft: 1 }) : handoffLawn();
  const b = { rangeBufferPercent: buffer };
  if(painting)p.pricing.paintWasteFactor=0; // Owner-selected zero isolates numeric projection boundaries.
  if (source === 'business') b.minimumJobPrice = cents;
  if (source === 'service') p.pricing[painting ? 'minimumJob' : 'minimumServiceCharge'] = cents;
  // Painting is one wall sq ft, one coat, unit factors: entered labor + 50 cents material.
  if (source === 'rate') p.pricing[painting ? 'laborPerWallSqftPerCoat' : 'mowingBaseRatePerSqft'] = painting ? cents - 50 : cents;
  return handoffRequest(p, c, b);
}
function precisionExact(request, expectedCents) {
  const result = generateQuoteVNext(request);
  precisionInspect(result, request, [[expectedCents, expectedCents, expectedCents]]);
  for (const option of result.options) {
    assert.equal(BigInt(option.calculationRecord.scenarios.mid.finalTotalCents), BigInt(expectedCents));
    const range = option.calculationRecord.range;
    assert.deepEqual([range.lowCents, range.midCents, range.highCents].map(BigInt),
      [BigInt(expectedCents), BigInt(expectedCents), BigInt(expectedCents)]);
  }
  return result;
}

test('customer amount precision: maximum down-error reviews exact and cents-preserving prices while adjacent cents stay distinct', () => {
  for (const buffer of [0, 1e-16]) {
    // Adjustment at the tiny buffer is 0.009007199254740991 cents, below half a cent.
    // The intended low/mid/high therefore remain exactly 9007199254740991 cents.
    precisionExact(precisionRequest('LANDSCAPING_MOWING', 'business', 9007199254740990, buffer), '9007199254740990');
    const request = precisionRequest('LANDSCAPING_MOWING', 'business', 9007199254740991, buffer);
    const blocked = precisionInspect(generateQuoteVNext(request), request);
    precisionRepresentationReason(blocked);
    assert.equal(blocked.normalizedScope.yardSqft, 1);
    const unsafe = precisionRequest('LANDSCAPING_MOWING', 'business', 9007199254740992, buffer);
    const invalid = precisionInspect(generateQuoteVNext(unsafe), unsafe);
    assert.ok(invalid.invalidOwnerFields.includes('businessDefaults.minimumJobPrice'));
    assert.equal(invalid.ownerDiagnostics.some(item => item.kind === 'customer_amount_representation'), false);
  }
  // This second representable neighbor defeats a blanket large-value rejection.
  precisionExact(precisionRequest('LANDSCAPING_MOWING', 'business', 9007199254740989), '9007199254740989');
});

test('customer amount precision: positive one-cent errors review and both neighboring interior-painting amounts remain exact', () => {
  for (const buffer of [0, 1e-16]) {
    for (const cents of [7036874417766400, 7036874417766402]) {
      precisionExact(precisionRequest('INTERIOR_PAINTING', 'business', cents, buffer), String(cents));
    }
    const request = precisionRequest('INTERIOR_PAINTING', 'business', 7036874417766401, buffer);
    const result = precisionInspect(generateQuoteVNext(request), request);
    precisionRepresentationReason(result);
    assert.equal(result.normalizedScope.wallAreaSqft, 1);
  }
});

test('customer amount precision: service minima and entered-rate totals use the same guard in two services', () => {
  for (const [type, bad, good] of [
    ['LANDSCAPING_MOWING', 9007199254740991, 9007199254740990],
    ['INTERIOR_PAINTING', 7036874417766401, 7036874417766402]
  ]) for (const source of ['service', 'rate']) {
    precisionExact(precisionRequest(type, source, good), String(good));
    const request = precisionRequest(type, source, bad);
    const result = precisionInspect(generateQuoteVNext(request), request);
    precisionRepresentationReason(result);
    assert.equal(request.businessDefaults.minimumJobPrice, 0);
    if (source === 'rate') assert.equal(request.ownerPricing.pricing[type === 'INTERIOR_PAINTING' ? 'minimumJob' : 'minimumServiceCharge'], 0);
  }
  const overflowing = precisionRequest('LANDSCAPING_MOWING', 'rate', 9007199254740990, 25);
  const overflow = precisionInspect(generateQuoteVNext(overflowing), overflowing);
  assert.ok(overflow.invalidOwnerFields.includes('rangeBufferPercent'));
  const missing = precisionRequest('LANDSCAPING_MOWING', 'rate', 10000);
  delete missing.ownerPricing.pricing.mowingBaseRatePerSqft;
  const incomplete = precisionInspect(generateQuoteVNext(missing), missing);
  assert.ok(incomplete.missingOwnerFields.includes('mowingBaseRatePerSqft'));
  assert.equal(incomplete.ownerDiagnostics.some(item => item.kind === 'customer_amount_representation'), false);
});

test('customer amount precision: generation live preview and price-book entrypoints preserve the same complete outcome', () => {
  for (const [cents, ready] of [[9007199254740990, true], [9007199254740991, false],
    [7036874417766401, false], [7036874417766402, true]]) {
    const request = precisionRequest('LANDSCAPING_MOWING', 'business', cents);
    const frozen = structuredClone(request);
    const book = { pricebook: { defaults: request.businessDefaults, services: [request.ownerPricing] },
      serviceType: request.serviceType, customerInputs: request.customerInputs, currentMonth: 1, callerType: 'owner' };
    const internal = [generateQuoteVNext(request), liveQuoteVNext(request), previewQuoteVNext(request),
      quoteFromVNextPricebook(book), previewFromVNextPricebook(book)];
    const expected = ready ? [[String(cents), String(cents), String(cents)]] : undefined;
    const publicResults = internal.map(result => {
      precisionInspect(result, request, expected);
      if (!ready) precisionRepresentationReason(result);
      return sanitizeForCustomerVNext(result);
    });
    publicResults.push(generateQuoteVNext({ ...request, callerType: 'customer' }),
      liveQuoteVNext({ ...request, callerType: 'customer' }), quoteFromVNextPricebook({ ...book, callerType: 'customer' }));
    const withoutId = result => { const copy = structuredClone(result); delete copy.quoteId; return copy; };
    for (const result of publicResults) {
      precisionPublic(result, expected);
      assert.deepEqual(withoutId(result), withoutId(publicResults[0]));
    }
    assert.deepEqual(request, frozen);
  }
});

test('customer amount precision: unsupported tier representations preserve supported siblings and exact availability notices', () => {
  const p = handoffMowing({ mowingBaseRatePerSqft: 100 });
  p.tiers = [
    { name: 'Changed decimal', overrides: { minimumServiceCharge: 9007199254740991 } },
    { name: 'Exact adjacent decimal', overrides: { minimumServiceCharge: 9007199254740990 } },
    { name: 'Ordinary', overrides: { minimumServiceCharge: 10000 } }
  ];
  const request = handoffRequest(p, handoffLawn());
  const result = precisionInspect(generateQuoteVNext(request), request,
    [['9007199254740990', '9007199254740990', '9007199254740990'], ['10000', '10000', '10000']]);
  assert.deepEqual(result.options.map(option => option.tierName), ['Exact adjacent decimal', 'Ordinary']);
  assert.equal(result.failedTierDiagnostics.length, 1);
  const failed = result.failedTierDiagnostics[0];
  assert.equal(failed.tierName, 'Changed decimal');
  precisionRepresentationReason(failed);
  const notice = 'Fewer options are available because one or more configured options need owner review.';
  assert.equal(result.optionAvailabilityNotice, notice);
  assert.equal(sanitizeForCustomerVNext(result).optionAvailabilityNotice, notice);
  assert.equal(JSON.stringify(sanitizeForCustomerVNext(result)).includes('Changed decimal'), false);
  // Only the previously unrepresentable tier price changes.
  const corrected = structuredClone(request);
  corrected.ownerPricing.tiers[0].overrides.minimumServiceCharge = 9007199254740989;
  const all = precisionInspect(generateQuoteVNext(corrected), corrected,
    [['9007199254740989', '9007199254740989', '9007199254740989'],
      ['9007199254740990', '9007199254740990', '9007199254740990'], ['10000', '10000', '10000']]);
  assert.deepEqual(all.options.map(option => option.tierName), p.tiers.map(tier => tier.name));
  assert.deepEqual(all.failedTierDiagnostics, []);
  assert.equal(all.optionAvailabilityNotice, undefined);
  assert.equal(sanitizeForCustomerVNext(all).optionAvailabilityNotice, undefined);
});

test('customer amount precision: all-failed tiers retain scope and technical diagnostics in a buildable internal lead', () => {
  const p = handoffMowing({ mowingBaseRatePerSqft: 100 });
  p.tiers = [
    { name: 'Downward', overrides: { minimumServiceCharge: 9007199254740991 } },
    { name: 'Upward', overrides: { minimumServiceCharge: 7036874417766401 } }
  ];
  const request = handoffRequest(p, handoffLawn());
  const result = precisionInspect(generateQuoteVNext(request), request);
  precisionRepresentationReason(result);
  assert.deepEqual(result.failedTierDiagnostics.map(item => item.tierName), ['Downward', 'Upward']);
  for (const failed of result.failedTierDiagnostics) {
    precisionRepresentationReason(failed);
    assert.equal(failed.normalizedScope.yardSqft, 1);
  }
  const lead = buildInternalLeadVNext({ request, internalResult: result });
  assert.equal(lead.quoteId, result.quoteId);
  assert.deepEqual(lead.originalRequest.customerInputs, request.customerInputs);
  assert.deepEqual(lead.internalReviewResult, result);
  precisionPublic(sanitizeForCustomerVNext(result));
});

test('customer amount precision: ordinary ranges fractional minima sub-dollar free and unrestricted markup controls retain wire cents', () => {
  const cases = [
    [handoffRequest(handoffMowing(), handoffLawn(), { minimumJobPrice: 20001, rangeBufferPercent: 10 }), ['20001', '20001', '20001'], 20001],
    [handoffRequest(handoffMowing(), handoffLawn({ yardSqft: 4 }), { minimumJobPrice: 20001, rangeBufferPercent: 10 }), ['36000', '40000', '44000'], 40000],
    [handoffRequest(handoffMowing({ mowingBaseRatePerSqft: 110 }), handoffLawn(), { rangeBufferPercent: 10 }), ['99', '110', '121'], 110],
    [handoffRequest(handoffMowing({ mowingBaseRatePerSqft: 111 }), handoffLawn(), { rangeBufferPercent: 10 }), ['100', '100', '200'], 111],
    [handoffRequest(handoffMowing(), handoffLawn(), { markupPercent: 1200 }), ['130000', '130000', '130000'], 130000]
  ];
  const sold = handoffMowing(); sold.priceBasisByCategory.labor = 'sell_price';
  cases.push([handoffRequest(sold, handoffLawn(), { markupPercent: 1200 }), ['10000', '10000', '10000'], 10000]);
  cases.push([handoffRequest(handoffMowing(), handoffLawn(), {
    markupPercent: 1200, markupApplies: { ...markupApplies, labor: false }
  }), ['10000', '10000', '10000'], 10000]);
  const free = freeFixture(handoffMowing({ mowingBaseRatePerSqft: 0 }));
  cases.push([handoffRequest(free, handoffLawn(), { minimumJobPrice: 20001, markupPercent: 1200, rangeBufferPercent: 10 }),
    ['0', '0', '0'], 0]);
  for (const [request, amounts, cents] of cases) {
    const result = precisionInspect(generateQuoteVNext(request), request, [amounts]);
    assert.equal(result.options[0].calculationRecord.scenarios.mid.finalTotalCents, cents);
  }
  const unclassified = handoffRequest(handoffMowing({ mowingBaseRatePerSqft: 0 }), handoffLawn());
  const result = precisionInspect(generateQuoteVNext(unclassified), unclassified);
  assert.equal(result.ownerDiagnostics.some(item => item.kind === 'customer_amount_representation'), false);
});

test('customer amount precision: synchronized public projection copies cannot replace the price fixed by original cents and configuration', () => {
  for (const [cents, changed] of [[9007199254740990, 90071992547409.89], [7036874417766402, 70368744177664]]) {
    const request = precisionRequest('LANDSCAPING_MOWING', 'business', cents);
    const original = precisionExact(request, String(cents));
    const forged = structuredClone(original);
    for (const field of precisionAmountFields) {
      forged[field] = changed;
      forged.options[0][field] = changed;
      forged.options[0].calculationRecord.customerProjection[field] = changed;
      forged.calculationRecord.options[0].customerProjection[field] = changed;
    }
    assert.deepEqual(forged.calculationRecord.options, forged.options.map(option => option.calculationRecord));
    assert.deepEqual(forged.calculationRecord.ownerConfiguration, original.calculationRecord.ownerConfiguration);
    assert.deepEqual(forged.calculationRecord.financialInputs, original.calculationRecord.financialInputs);
    assert.deepEqual(forged.options[0].calculationRecord.range, original.options[0].calculationRecord.range);
    assert.notEqual(precisionWireCents(JSON.stringify(changed)), BigInt(cents));
    precisionPublic(sanitizeForCustomerVNext(forged));
    precisionPublic(sanitizeForCustomerVNext(original), [[String(cents), String(cents), String(cents)]]);
  }
});


test('customer amount precision: outward high display and cents-preserving high endpoints fail safely at their own boundaries', () => {
  const scale = 1000000000000000000n; // 1e-16 percent = 1 / 1e18.
  const fixtures = [
    [9007199254740899, ['9007199254740800', '9007199254740900', '9007199254740900']],
    [9007199254740900, ['9007199254740900', '9007199254740900', '9007199254740900']],
    [9007199254740901, undefined]
  ];
  for (const [cents, expected] of fixtures) {
    const total = BigInt(cents);
    // Both independently rounded buffer endpoints remain equal to the entered
    // total: the exact adjustment is less than 0.01 cent, below half a cent.
    assert.equal((total * (scale - 1n) + scale / 2n) / scale, total);
    assert.equal((total * (scale + 1n) + scale / 2n) / scale, total);
    const display = [total / 100n * 100n, (total + 50n) / 100n * 100n, (total + 99n) / 100n * 100n];
    if (expected) assert.deepEqual(display.map(String), expected);
    else {
      assert.equal(display[2], 9007199254741000n);
      assert.ok(display[2] > 9007199254740991n);
    }
    // Only the rate changes between the three fixtures; no minimum applies.
    const request = precisionRequest('LANDSCAPING_MOWING', 'rate', cents, 1e-16);
    const result = precisionInspect(generateQuoteVNext(request), request, expected ? [expected] : undefined);
    if (expected) {
      const range = result.options[0].calculationRecord.range;
      assert.deepEqual([range.lowCents, range.midCents, range.highCents].map(BigInt), [total, total, total]);
    } else {
      precisionRepresentationReason(result);
      assert.ok(result.ownerDiagnostics.some(item => item.kind === 'customer_amount_representation' &&
        item.path === 'customerProjection.highEstimate'));
    }
  }
  // 1e-14 percent = 1 / 1e16. The exact adjustment is
  // 0.900719925474099 cents, which rounds to one cent. The minimum fixes low/mid
  // at M-1; the high is M. Only high has an inaccurate decimal representation.
  const minimum = 9007199254740990n;
  const highScale = 10000000000000000n;
  assert.equal((minimum * (highScale + 1n) + highScale / 2n) / highScale, 9007199254740991n);
  precisionExact(precisionRequest('LANDSCAPING_MOWING', 'business', Number(minimum), 0), String(minimum));
  // A binding minimum now suppresses even a tiny range buffer. The exact
  // representable floor is returned; the hypothetical unsafe high is not used.
  precisionExact(precisionRequest('LANDSCAPING_MOWING', 'business', Number(minimum), 1e-14),String(minimum));
});
