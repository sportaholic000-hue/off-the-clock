import {scopeLines,scopeRatePath,scopesSuppressPrice} from './scopePricing.js';
import {tradeAdjustment} from './tradeAdjustments.js';
import {installedPriceDefinitions,installedLaborFactorPath} from '../installedPriceConfiguration.js';
import { measuredOutlineVNext } from './geometry.js';
import {configuredOffering, offeringLines, offeringDisclosures, offeringRatePath, formatFenceHeight} from './configuredOfferings.js';
import {
  SERVICE_TYPES,
  inspectionOwnerDecisionsVNext,
  repairSizeFromAffectedArea,
  validateCustomerInputs,
  validateOwnerPricing,
  valueAtPath,
  vinylUnderlaymentApplies
} from './contracts.js';
import { ownDataValue, snapshotPlainData } from './safeData.js';
import {
  exactAdd,
  exactCompare,
  exactDecimal,
  exactDivide,
  exactEvidence,
  exactFromEvidence,
  exactMultiply,
  exactRound,
  exactSubtract,
  exactToNumber
} from './exactMath.js';

export class QuoteReviewError extends Error {
  constructor(reviewReason, details = {}) {
    super(reviewReason);
    this.name = 'QuoteReviewError';
    this.reviewReason = reviewReason;
    Object.assign(this, details);
  }
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function measured(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new QuoteReviewError(`${name} is missing or invalid.`, { invalidCustomerFields: [name] });
  }
  return value;
}

function count(value, name, allowZero = false) {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new QuoteReviewError(`${name} is missing or invalid.`, { invalidCustomerFields: [name] });
  }
  return value;
}

function money(value, path, { allowZero = true } = {}) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new QuoteReviewError('Pricing not fully configured for the measured scope.', {
      invalidOwnerFields: [path]
    });
  }
  return value;
}

function quantityFactor(value, path, { allowZero = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new QuoteReviewError('A quantity factor is missing or invalid.', {
      invalidOwnerFields: [path]
    });
  }
  return value;
}

function optionalMoney(value, path) {
  if (value === undefined || value === null || value === '') return undefined;
  return money(value, path, { allowZero: true });
}

function addonMoney(value, path) {
  if (value === undefined || value === null || value === '') return undefined;
  return money(value, path, { allowZero: true });
}

function addonPercent(value, path) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 500) {
    throw new QuoteReviewError(`${path} must be a finite percentage from 0 to 500.`, { invalidOwnerFields: [path] });
  }
  return value;
}

function makeLine({
  name,
  category,
  quantity,
  unit,
  rateCents,
  ratePath,
  multipliers = [],
  customerDriver,
  lowRateCents,
  highRateCents,
  priceBasis,
  allowZeroRate = true,
  allowZeroQuantity = false,
}) {
  let exactQuantity;
  let numericQuantity;
  try {
    exactQuantity = exactDecimal(quantity);
    numericQuantity = exactToNumber(exactQuantity);
  } catch {
    throw new QuoteReviewError(`${name} did not receive a finite measured quantity.`);
  }
  if (!(allowZeroQuantity && numericQuantity === 0)) measured(numericQuantity, `${name} quantity`);
  if(ratePath==='price'||ratePath==='mowingBaseRatePerSqft'||offeringRatePath(ratePath)||scopeRatePath(ratePath)) { if(typeof rateCents!=='number'||!Number.isFinite(rateCents)||rateCents<0||rateCents>Number.MAX_SAFE_INTEGER)throw new QuoteReviewError('Invalid fractional-cent unit rate.',{invalidOwnerFields:[ratePath]}); }
  else money(rateCents, ratePath, { allowZero: allowZeroRate });
  const checkedMultipliers = multipliers.map(multiplier => {
    let exactValue;
    let numericValue;
    try {
      // A line re-priced by a later step (waste, terrain, installed labor share)
      // carries its earlier factors' exact evidence; reuse it so a factor such as
      // 1/3 is never replaced by its rounded binary value.
      exactValue = multiplier.exactValue !== undefined ? exactFromEvidence(multiplier.exactValue) : exactDecimal(multiplier.value);
      numericValue = exactToNumber(exactValue);
    } catch {
      throw new QuoteReviewError('A quantity factor is missing or invalid.', { invalidOwnerFields: [multiplier.path] });
    }
    return {
      ...multiplier,
      value: quantityFactor(numericValue, multiplier.path, { allowZero: multiplier.allowZero }),
      exactValue: exactEvidence(exactValue)
    };
  });
  let exactUnroundedCents;
  let unroundedCents;
  let amountCents;
  try {
    exactUnroundedCents = exactMultiply(exactQuantity, rateCents, ...checkedMultipliers.map(multiplier => exactFromEvidence(multiplier.exactValue)));
    unroundedCents = exactToNumber(exactUnroundedCents);
    amountCents = exactRound(exactUnroundedCents);
  } catch {
    throw new QuoteReviewError(`${name} did not produce a valid charge.`, {
      invalidOwnerFields: [...new Set([ratePath, ...checkedMultipliers.map(multiplier => multiplier.path)].filter(Boolean))]
    });
  }
  if (!Number.isSafeInteger(amountCents) || amountCents < (allowZeroRate ? 0 : 1)) {
    throw new QuoteReviewError(`${name} did not produce a valid charge.`, {
      invalidOwnerFields: [...new Set([ratePath, ...checkedMultipliers.map(multiplier => multiplier.path)].filter(Boolean))]
    });
  }
  const result = {
    name,
    category,
    ...(priceBasis ? { priceBasis } : {}),
    amountCents,
    ownerVisible: true,
    customerVisible: false,
    ...(amountCents === 0 ? { noCharge: true, noChargeReason: numericQuantity === 0 ? 'zero_physical_scope' : rateCents === 0 ? 'explicitly_free' : 'rounded_fractional_cent' } : {}),
    calculation: {
      evidenceVariant: lowRateCents !== undefined || highRateCents !== undefined ? 'ranged' : 'quantity_rate',
      quantity: numericQuantity,
      exactQuantity: exactEvidence(exactQuantity),
      unit,
      rateCents,
      ratePath,
      ...(priceBasis ? { priceBasis } : {}),
      multipliers: checkedMultipliers,
      unroundedCents,
      exactUnroundedCents: exactEvidence(exactUnroundedCents),
      roundedAmountCents: amountCents
    }
  };
  if (customerDriver) result.customerDriver = customerDriver;
  if (lowRateCents !== undefined || highRateCents !== undefined) {
    const customRate = (value, path) => {if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)throw new QuoteReviewError('Invalid custom unit-price range.',{invalidOwnerFields:[path]});return value;};
    const low = ratePath === 'price' ? customRate(lowRateCents, 'low') : money(lowRateCents, 'low');
    const high = ratePath === 'price' ? customRate(highRateCents, 'high') : money(highRateCents, 'high');
    let lowAmountCents;
    let highAmountCents;
    try {
      const exactMultipliers = checkedMultipliers.map(multiplier => exactFromEvidence(multiplier.exactValue));
      lowAmountCents = exactRound(exactMultiply(exactQuantity, low, ...exactMultipliers));
      highAmountCents = exactRound(exactMultiply(exactQuantity, high, ...exactMultipliers));
    } catch {
      throw new QuoteReviewError('Configured range does not produce safe integer-cent scenario amounts.', {
        invalidOwnerFields: ['low', 'high']
      });
    }
    const invalidOwnerFields = [];
    if (!Number.isSafeInteger(lowAmountCents) || lowAmountCents < 0) invalidOwnerFields.push('low');
    if (!Number.isSafeInteger(highAmountCents) || highAmountCents < 0) invalidOwnerFields.push('high');
    if (invalidOwnerFields.length) {
      throw new QuoteReviewError('Configured range does not produce safe integer-cent scenario amounts.', { invalidOwnerFields });
    }
    result.calculation.midRateCents = rateCents;
    result.calculation.midAmountCents = amountCents;
    result.calculation.lowRateCents = low;
    result.calculation.highRateCents = high;
    result.rangeAmountCents = {
      low: lowAmountCents,
      high: highAmountCents
    };
  }
  return result;
}

function makeCompositeLine({ name, category, components, customerDriver }) {
  const normalized = components.map(component => {
    let exactQuantity;
    let numericQuantity;
    try {
      exactQuantity = exactDecimal(component.quantity);
      numericQuantity = exactToNumber(exactQuantity);
    } catch {
      throw new QuoteReviewError(`${name} did not receive a finite measured quantity.`);
    }
    measured(numericQuantity, `${name} quantity`);
    money(component.rateCents, component.ratePath);
    let multipliers;
    let exactUnroundedCents;
    let unroundedCents;
    let amountCents;
    try {
      multipliers = (component.multipliers || []).map(multiplier => {
        const exactValue = exactDecimal(multiplier.value);
        const value = quantityFactor(exactToNumber(exactValue), multiplier.path, { allowZero: multiplier.allowZero });
        return { ...multiplier, value, exactValue: exactEvidence(exactValue) };
      });
      exactUnroundedCents = exactMultiply(exactQuantity, component.rateCents, ...multipliers.map(multiplier => exactFromEvidence(multiplier.exactValue)));
      unroundedCents = exactToNumber(exactUnroundedCents);
      amountCents = exactRound(exactUnroundedCents);
    } catch (error) {
      if (error instanceof QuoteReviewError) throw error;
      throw new QuoteReviewError(`${name} did not produce a valid charge.`, {
        invalidOwnerFields: [...new Set([component.ratePath, ...(component.multipliers || []).map(multiplier => multiplier.path)].filter(Boolean))]
      });
    }
    return {
      ...component,
      quantity: numericQuantity,
      exactQuantity: exactEvidence(exactQuantity),
      multipliers,
      unroundedCents,
      exactUnroundedCents: exactEvidence(exactUnroundedCents),
      amountCents,
      roundedAmountCents: amountCents
    };
  });
  const invalidComponents = normalized.filter(component => !Number.isSafeInteger(component.amountCents) || component.amountCents < 0);
  const amountCents = normalized.reduce((sum, component) => sum + component.amountCents, 0);
  if (invalidComponents.length || !Number.isSafeInteger(amountCents) || amountCents < 0) {
    const responsible = invalidComponents.length ? invalidComponents : normalized;
    throw new QuoteReviewError(`${name} did not produce a valid charge.`, {
      invalidOwnerFields: [...new Set(responsible.flatMap(component => [
        component.ratePath, ...(component.multipliers || []).map(multiplier => multiplier.path)
      ]).filter(Boolean))]
    });
  }
  const noChargeReason = amountCents === 0
    ? normalized.every(component => component.rateCents === 0) ? 'explicitly_free' : 'rounded_fractional_cent'
    : null;
  return {
    name,
    category,
    amountCents,
    ownerVisible: true,
    ...(amountCents === 0 ? { noCharge: true, noChargeReason } : {}),
    customerVisible: false,
    calculation: { evidenceVariant: 'composite', components: normalized, roundedAmountCents: amountCents },
    ...(customerDriver ? { customerDriver } : {})
  };
}

function fixedLine(name, category, amountCents, ratePath, customerDriver, { allowZero = true } = {}) {
  const checked = money(amountCents, ratePath, { allowZero });
  return {
    name,
    category,
    amountCents: checked,
    ownerVisible: true,
    customerVisible: false,
    ...(checked === 0 ? { noCharge: true, noChargeReason: 'explicitly_free' } : {}),
    calculation: {
      evidenceVariant: 'fixed_amount',
      amountCents: checked,
      ratePath,
      roundedAmountCents: checked
    },
    ...(customerDriver ? { customerDriver } : {})
  };
}

function installedAreaSellPriceBasis(value, path) {
  if (value !== 'installed_area_sell_price') {
    throw new QuoteReviewError('Underlayment price basis cannot be calculated without an installed-area sell-price classification.', {
      invalidOwnerFields: [path]
    });
  }
  return 'sell_price';
}

function baseOutput(serviceType) {
  return {
    serviceType,
    lineItems: [],
    measurements: [],
    quantityDerivations: [],
    ruleApplications: [],
    assumptions: [],
    disclosures: [],
    priceDrivers: [],
    feeScope: {
      travel: true,
      disposal: false,
      permit: false,
      overhead: true
    },
    replacedCommonFees: []
  };
}

function add(out, line) {
  out.lineItems.push(line);
}

function recordMeasurement(out, name, value, unit, source = 'customer_measured') {
  out.measurements.push({ name, value, unit, source });
}
function recordQuantityDerivation(out, { name, formula, inputs, result, unit, usedBy = [] }) {
  let exactResult;
  let numericResult;
  try {
    exactResult = exactDecimal(result);
    numericResult = exactToNumber(exactResult);
  } catch {
    throw new QuoteReviewError('A derived quantity is missing reproducible calculation evidence.');
  }
  if (typeof name !== 'string' || !name || typeof formula !== 'string' || !formula ||
      !Number.isFinite(numericResult) || numericResult < 0 ||
      !inputs || typeof inputs !== 'object' || Array.isArray(inputs) || !Array.isArray(usedBy)) {
    throw new QuoteReviewError('A derived quantity is missing reproducible calculation evidence.');
  }
  out.quantityDerivations.push({
    evidenceVariant: 'derived_quantity',
    name,
    formula,
    inputs: structuredClone(inputs),
    result: numericResult,
    exactResult: exactEvidence(exactResult),
    unit,
    usedBy: structuredClone(usedBy)
  });
}

function recordRuleApplication(out, rule) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule) ||
      typeof rule.name !== 'string' || !rule.name ||
      typeof rule.rule !== 'string' || !rule.rule) {
    throw new QuoteReviewError('A calculation rule is missing reproducible decision evidence.');
  }
  out.ruleApplications.push(structuredClone(rule));
}

function selectedRoofArea(c) {
  if (c.serviceScope !== 'partial') return exactDecimal(c.roofSizeInput);
  return c.partialAreaSqft !== undefined
    ? exactDecimal(c.partialAreaSqft)
    : exactDivide(exactMultiply(c.roofSizeInput, c.partialPercent), 100);
}

function selectedFlatRoofArea(c) {
  if (c.serviceScope !== 'partial') return exactDecimal(c.roofSqft);
  return c.partialAreaSqft !== undefined
    ? exactDecimal(c.partialAreaSqft)
    : exactDivide(exactMultiply(c.roofSqft, c.partialPercent), 100);
}

function addDisposalOverride(out, p, path, quantity, unit, label) {
  const rate = optionalMoney(p[path], path);
  if (rate === undefined) return;
  add(out, makeLine({ name: label, category: 'disposal', quantity, unit, rateCents: rate, ratePath: path, allowZeroRate: true }));
  out.replacedCommonFees.push('disposal');
}

function calculateRoofReplacement(c, p, ctx) {
  const out = baseOutput('ROOFING_REPLACEMENT');
  const exactAreaSqft = selectedRoofArea(c);
  const areaSqft = measured(exactToNumber(exactAreaSqft), 'roof area');
  const exactRoofSquares = exactDivide(exactAreaSqft, 100);
  const roofSquares = exactToNumber(exactRoofSquares);
  const waste = quantityFactor(p.wasteFactorByComplexity[c.roofComplexity], `wasteFactorByComplexity.${c.roofComplexity}`, { allowZero: true });
  const exactMaterialSquares = exactMultiply(exactRoofSquares, exactAdd(1, waste));
  const materialSquares = exactToNumber(exactMaterialSquares);
  const pitch = quantityFactor(p.pitchMultiplier[c.pitch], `pitchMultiplier.${c.pitch}`);
  const story = quantityFactor(p.storyMultiplier[c.stories], `storyMultiplier.${c.stories}`);
  const layers = count(c.existingLayers, 'existingLayers');
  const exactTearOffSquares = exactMultiply(exactRoofSquares, layers);
  const tearOffSquares = exactToNumber(exactTearOffSquares);

  if (c.serviceScope === 'partial' && c.partialAreaSqft === undefined) {
    recordQuantityDerivation(out, {
      name: 'selectedRoofAreaSqft',
      formula: 'roofSizeInput * partialPercent / 100',
      inputs: { roofSizeInput: c.roofSizeInput, partialPercent: c.partialPercent },
      result: areaSqft,
      unit: 'square feet',
      usedBy: ['roofSquares']
    });
  }
  recordQuantityDerivation(out, {
    name: 'roofSquares', formula: 'areaSqft / 100',
    inputs: { areaSqft }, result: exactRoofSquares, unit: 'roofing squares',
    usedBy: ['Roofing labor', 'Underlayment']
  });
  recordQuantityDerivation(out, {
    name: 'materialSquares', formula: 'roofSquares * (1 + wasteFactor)',
    inputs: { roofSquares, wasteFactor: waste }, result: exactMaterialSquares, unit: 'roofing squares',
    usedBy: ['Field materials']
  });
  recordQuantityDerivation(out, {
    name: 'tearOffSquares', formula: 'roofSquares * existingLayers',
    inputs: { roofSquares, existingLayers: layers }, result: exactTearOffSquares, unit: 'existing-layer roofing squares',
    usedBy: ['Tear-off', 'Roofing disposal']
  });

  recordRuleApplication(out, {
    name: 'roofAreaSelection',
    rule: 'full scope uses measured total area; partial measured area takes precedence when supplied; otherwise confirmed partial percent derives area',
    inputs: { serviceScope: c.serviceScope, totalAreaSqft: c.roofSizeInput, partialAreaSqft: c.partialAreaSqft ?? null, partialPercent: c.partialPercent ?? null },
    result: { areaSqft, source: c.serviceScope !== 'partial' ? 'measured_total_area' : c.partialAreaSqft !== undefined ? 'measured_partial_area' : 'confirmed_partial_percent' },
    usedBy: ['roofSquares']
  });
  add(out, makeLine({
    name: 'Roofing labor', category: 'labor', quantity: exactRoofSquares, unit: 'roofing squares',
    rateCents: valueAtPath(p, `laborPerSquare.${c.replacementRoofType}`),
    ratePath: `laborPerSquare.${c.replacementRoofType}`,
    multipliers: [
      { name: 'pitch', value: pitch, path: `pitchMultiplier.${c.pitch}` },
      { name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }
    ],
    customerDriver: `Measured roof area: ${roofSquares.toFixed(2)} roofing squares`
  }));
  add(out, makeLine({
    name: 'Field materials', category: 'material', quantity: exactMaterialSquares, unit: 'waste-adjusted roofing squares',
    rateCents: valueAtPath(p, `materialCostPerSquare.${c.replacementRoofType}`),
    ratePath: `materialCostPerSquare.${c.replacementRoofType}`,
    customerDriver: `Replacement material: ${c.replacementRoofType.replaceAll('_', ' ')}`
  }));
  add(out, makeLine({
    name: 'Tear-off', category: 'removal', quantity: exactTearOffSquares, unit: 'existing-layer roofing squares',
    rateCents: valueAtPath(p, `tearOffPerSquare.${c.existingRoofType}`),
    ratePath: `tearOffPerSquare.${c.existingRoofType}`,
    multipliers: [
      { name: 'pitch', value: pitch, path: `pitchMultiplier.${c.pitch}` },
      { name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }
    ],
    customerDriver: `${layers} existing layer${layers === 1 ? '' : 's'}`
  }));
  const underlaymentPath = `underlaymentPerSquare.${c.replacementRoofType}`;
  if(!p.scopeDetails?.['roof_underlayment_'+c.replacementRoofType] || p.underlaymentPriceBasis?.[c.replacementRoofType]!=='cost') add(out, makeLine({
    name: 'Underlayment', category: 'material', quantity: exactRoofSquares, unit: 'measured installed roofing squares',
    rateCents: valueAtPath(p, underlaymentPath),
    ratePath: underlaymentPath,
    priceBasis: installedAreaSellPriceBasis(valueAtPath(p, `underlaymentPriceBasis.${c.replacementRoofType}`), `underlaymentPriceBasis.${c.replacementRoofType}`)
  }));

  if (p.accessoryPricingMode === 'itemized') {
    const accessoryLines = [
      ['Starter strip', 'starterLengthLF', 'starterPerLF'],
      ['Drip edge', 'dripEdgeLengthLF', 'dripEdgePerLF'],
      ['Ridge cap', 'ridgeCapLengthLF', 'ridgeCapPerLF']
    ];
    for (const [name, inputField, priceField] of accessoryLines) {
      const length = c[inputField];
      recordMeasurement(out, inputField, length, 'linear feet');
      if (length > 0) add(out, makeLine({ name, category: 'material', quantity: length, unit: 'measured linear feet', rateCents: p[priceField], ratePath: priceField }));
    }
  }
  const deckingUnitPrice = optionalMoney(p.deckingPerSheet, 'deckingPerSheet');
  if (deckingUnitPrice !== undefined) {
    out.priceDrivers.push('Any additional decking is priced per sheet and confirmed on site.');
    if (c.deckingSheets !== undefined) out.priceDrivers.push(c.deckingSheets > 0 ? `${c.deckingSheets} decking sheet${c.deckingSheets === 1 ? '' : 's'} included` : 'No decking replacement is included in the confirmed scope.');
  }
  if (c.deckingSheets !== undefined) {
    recordMeasurement(out, 'deckingSheets', c.deckingSheets, 'confirmed sheets');
    if (c.deckingSheets > 0 || deckingUnitPrice !== undefined) add(out, makeLine({ name: 'Decking replacement', category: 'material', quantity: c.deckingSheets, allowZeroQuantity: true, unit: 'confirmed sheets', rateCents: p.deckingPerSheet, ratePath: 'deckingPerSheet', ...(c.deckingSheets > 0 ? {customerDriver: `${c.deckingSheets} decking sheet${c.deckingSheets === 1 ? '' : 's'} included`} : {}) }));
  }

  out.feeScope.disposal = layers > 0;
  addDisposalOverride(out, p, 'disposalPerSquare', exactTearOffSquares, 'existing-layer roofing squares', 'Roofing disposal');
  recordMeasurement(out, 'roofAreaSqft', areaSqft, 'square feet');
  recordMeasurement(out, 'existingLayers', layers, 'layers');
  out.priceDrivers.push(`Measured roof area: ${roofSquares.toFixed(2)} roofing squares`, `${layers} existing layer${layers === 1 ? '' : 's'}`);
  return out;
}

function calculateRoofRepair(c, p) {
  const out = baseOutput('ROOFING_REPAIR');
  const repairSize = repairSizeFromAffectedArea('ROOFING_REPAIR', c.affectedArea);
  const hoursPath = `repairHours.${c.roofType}.${c.repairType}.${repairSize}`;
  const materialPath = `repairMaterialAllowance.${c.roofType}.${c.repairType}.${repairSize}`;
  const hours = quantityFactor(valueAtPath(p, hoursPath), hoursPath);
  const pitch = quantityFactor(p.pitchMultiplier[c.pitch], `pitchMultiplier.${c.pitch}`);
  const story = quantityFactor(p.storyMultiplier[c.stories], `storyMultiplier.${c.stories}`);
  add(out, makeLine({
    name: 'Repair labor', category: 'labor', quantity: hours, unit: 'configured labor hours',
    rateCents: p.laborHourlyRate, ratePath: 'laborHourlyRate',
    multipliers: [
      { name: 'pitch', value: pitch, path: `pitchMultiplier.${c.pitch}` },
      { name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }
    ],
    customerDriver: `${repairSize} ${c.repairType.replaceAll('_', ' ')} repair`
  }));
  add(out, fixedLine('Repair materials', 'material', valueAtPath(p, materialPath), materialPath));
  out.measurements.push({ name: 'affectedAreaSqft', value: c.affectedArea, unit: 'square feet', source: 'customer_measured', derivedCategory: repairSize });
  recordRuleApplication(out, {
    name: 'repairSizeFromAffectedArea',
    rule: 'affectedArea < 50 => small; affectedArea <= 200 => medium; otherwise large',
    inputs: { serviceType: 'ROOFING_REPAIR', affectedAreaSqft: c.affectedArea },
    result: repairSize,
    usedBy: [hoursPath, materialPath]
  });
  out.priceDrivers.push(`${c.affectedArea} measured affected square feet`, `${c.stories}-story access`);
  return out;
}

function calculateFlatRoofReplacement(c, p, ctx) {
  const out = baseOutput('FLAT_ROOF_REPLACEMENT');
  const exactAreaSqft = selectedFlatRoofArea(c);
  const areaSqft = measured(exactToNumber(exactAreaSqft), 'flat-roof area');
  if (c.membraneType === 'unknown' || c.existingLayers === 'unknown') {
    throw new QuoteReviewError('Flat-roof membrane type and existing layer count must be confirmed before pricing.', {
      invalidCustomerFields: [
        ...(c.membraneType === 'unknown' ? ['membraneType'] : []),
        ...(c.existingLayers === 'unknown' ? ['existingLayers'] : [])
      ]
    });
  }
  const membraneKey = c.replacementMembraneType;
  const layers = count(c.existingLayers, 'existingLayers');
  const exactTearOffAreaSqft = exactMultiply(exactAreaSqft, layers);
  const tearOffAreaSqft = exactToNumber(exactTearOffAreaSqft);

  if (c.serviceScope === 'partial' && c.partialAreaSqft === undefined) {
    recordQuantityDerivation(out, {
      name: 'selectedFlatRoofAreaSqft', formula: 'roofSqft * partialPercent / 100',
      inputs: { roofSqft: c.roofSqft, partialPercent: c.partialPercent },
      result: exactAreaSqft, unit: 'square feet',
      usedBy: ['Flat roof labor', 'Membrane', 'Tear-off']
    });
  }
  recordQuantityDerivation(out, {
    name: 'flatRoofTearOffAreaSqft', formula: 'areaSqft * existingLayers',
    inputs: { areaSqft, existingLayers: layers },
    result: exactTearOffAreaSqft, unit: 'existing-layer square feet',
    usedBy: ['Tear-off', 'Flat-roof disposal']
  });
  recordRuleApplication(out, {
    name: 'flatRoofAreaSelection',
    rule: 'full scope uses measured total area; partial measured area takes precedence when supplied; otherwise confirmed partial percent derives area',
    inputs: { serviceScope: c.serviceScope, totalAreaSqft: c.roofSqft, partialAreaSqft: c.partialAreaSqft ?? null, partialPercent: c.partialPercent ?? null },
    result: { areaSqft, source: c.serviceScope !== 'partial' ? 'measured_total_area' : c.partialAreaSqft !== undefined ? 'measured_partial_area' : 'confirmed_partial_percent' },
    usedBy: ['Flat roof labor', 'Membrane', 'flatRoofTearOffAreaSqft']
  });
  const access = quantityFactor(p.accessMultiplier[c.accessDifficulty], `accessMultiplier.${c.accessDifficulty}`);
  add(out, makeLine({ name: 'Flat roof labor', category: 'labor', quantity: exactAreaSqft, unit: 'measured square feet', rateCents: valueAtPath(p, `laborPerSqft.${membraneKey}`), ratePath: `laborPerSqft.${membraneKey}`, multipliers: [{ name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }], customerDriver: `Measured flat-roof area: ${areaSqft} square feet` }));
  add(out, makeLine({ name: 'Membrane', category: 'material', quantity: exactAreaSqft, unit: 'measured square feet', rateCents: valueAtPath(p, `membraneCostPerSqft.${membraneKey}`), ratePath: `membraneCostPerSqft.${membraneKey}`, customerDriver: `Membrane: ${membraneKey.replaceAll('_', ' ')}` }));
  if (c.buildingType === 'commercial' && !p.scopeDetails?.insulation) add(out, makeLine({ name: 'Rigid insulation and coverboard', category: 'material', quantity: exactAreaSqft, unit: 'measured square feet', rateCents: p.insulationPerSqft, ratePath: 'insulationPerSqft' }));
  add(out, makeLine({ name: 'Tear-off', category: 'removal', quantity: exactTearOffAreaSqft, unit: 'existing-layer square feet', rateCents: valueAtPath(p, `tearOffPerSqft.${c.membraneType}`), ratePath: `tearOffPerSqft.${c.membraneType}`, multipliers: [{ name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }], customerDriver: `${layers} existing membrane layer${layers === 1 ? '' : 's'}` }));
  out.feeScope.disposal = true;
  addDisposalOverride(out, p, 'disposalPerSqft', exactTearOffAreaSqft, 'existing-layer square feet', 'Flat-roof disposal');
  recordMeasurement(out, 'roofAreaSqft', areaSqft, 'square feet');
  recordMeasurement(out, 'existingLayers', layers, 'layers', 'customer_measured');
  out.priceDrivers.push(`Measured flat-roof area: ${areaSqft} square feet`, `${layers} existing membrane layer${layers === 1 ? '' : 's'}`);
  return out;
}

function calculateFlatRoofRepair(c, p, ctx) {
  const out = baseOutput('FLAT_ROOF_REPAIR');
  const repairSize = repairSizeFromAffectedArea('FLAT_ROOF_REPAIR', c.affectedArea);
  const hoursPath = `patchRepairHours.${c.membraneType}.${c.repairType}.${repairSize}`;
  const materialPath = `patchMaterialAllowance.${c.membraneType}.${c.repairType}.${repairSize}`;
  const hours = quantityFactor(valueAtPath(p, hoursPath), hoursPath);
  add(out, makeLine({ name: 'Flat roof repair labor', category: 'labor', quantity: hours, unit: 'configured labor hours', rateCents: p.laborHourlyRate, ratePath: 'laborHourlyRate', customerDriver: `${repairSize} ${c.repairType.replaceAll('_', ' ')} repair` }));
  add(out, fixedLine('Flat roof repair materials', 'material', valueAtPath(p, materialPath), materialPath));
  if (c.pondingWater) {
    const rate = addonMoney(p.pondingWaterSurcharge, 'pondingWaterSurcharge');
    if (rate === undefined) ctx.skipAddon('Ponding water surcharge');
    else add(out, fixedLine('Ponding water surcharge', 'addon', rate, 'pondingWaterSurcharge', undefined, { allowZero: true }));
  }
  out.measurements.push({ name: 'affectedAreaSqft', value: c.affectedArea, unit: 'square feet', source: 'customer_measured', derivedCategory: repairSize });
  recordRuleApplication(out, {
    name: 'repairSizeFromAffectedArea',
    rule: 'affectedArea < 20 => small; affectedArea <= 80 => medium; otherwise large',
    inputs: { serviceType: 'FLAT_ROOF_REPAIR', affectedAreaSqft: c.affectedArea },
    result: repairSize,
    usedBy: [hoursPath, materialPath]
  });
  out.priceDrivers.push(`${c.affectedArea} measured affected square feet`, `Membrane: ${c.membraneType.replaceAll('_', ' ')}`);
  return out;
}

function calculateInteriorPainting(c, p, rules={}) {
  const out = baseOutput('INTERIOR_PAINTING');
  const wallArea = measured(c.wallAreaSqft, 'wallAreaSqft');
  const coats = count(c.coats, 'coats');
  const height = quantityFactor(p.wallHeightLaborMultiplier[c.wallHeight], `wallHeightLaborMultiplier.${c.wallHeight}`);
  const exactWallCoatSqft = exactMultiply(wallArea, coats);
  const wallCoatSqft = exactToNumber(exactWallCoatSqft);
  recordQuantityDerivation(out, {
    name: 'wallCoatSqft', formula: 'wallAreaSqft * coats',
    inputs: { wallAreaSqft: wallArea, coats },
    result: exactWallCoatSqft, unit: 'wall square-foot coats',
    usedBy: ['Wall labor', 'Wall paint and materials']
  });
  add(out, makeLine({ name: 'Wall labor', category: 'labor', quantity: exactWallCoatSqft, unit: 'measured wall square-foot coats', rateCents: p.laborPerWallSqftPerCoat, ratePath: 'laborPerWallSqftPerCoat', multipliers: [{ name: 'wall height labor', value: height, path: `wallHeightLaborMultiplier.${c.wallHeight}` }], customerDriver: `${wallArea} measured square feet of paintable wall area` }));
  if(!scopesSuppressPrice('INTERIOR_PAINTING',c,p,rules,'materialPerWallSqftPerCoat')) add(out, makeLine({ name: 'Wall paint and materials', category: 'material', quantity: exactWallCoatSqft, unit: 'measured wall square-foot coats', rateCents: p.materialPerWallSqftPerCoat, ratePath: 'materialPerWallSqftPerCoat', customerDriver: `${coats} paint coat${coats === 1 ? '' : 's'}` }));

  if (c.ceilingsIncluded) {
    const ceilingArea = measured(c.ceilingAreaSqft, 'ceilingAreaSqft');
    const exactCeilingCoatSqft = exactMultiply(ceilingArea, c.ceilingCoats);
    const ceilingCoatSqft = exactToNumber(exactCeilingCoatSqft);
    recordQuantityDerivation(out, {
      name: 'ceilingCoatSqft', formula: 'ceilingAreaSqft * ceilingCoats',
      inputs: { ceilingAreaSqft: ceilingArea, ceilingCoats: c.ceilingCoats },
      result: exactCeilingCoatSqft, unit: 'ceiling square-foot coats',
      usedBy: ['Ceiling labor', 'Ceiling materials']
    });
    add(out, makeLine({ name: 'Ceiling labor', category: 'labor', quantity: exactCeilingCoatSqft, unit: 'measured ceiling square-foot coats', rateCents: p.ceilingLaborPerSqftPerCoat, ratePath: 'ceilingLaborPerSqftPerCoat' }));
    if(!scopesSuppressPrice('INTERIOR_PAINTING',c,p,rules,'ceilingMaterialPerSqftPerCoat')) add(out, makeLine({ name: 'Ceiling materials', category: 'material', quantity: exactCeilingCoatSqft, unit: 'measured ceiling square-foot coats', rateCents: p.ceilingMaterialPerSqftPerCoat, ratePath: 'ceilingMaterialPerSqftPerCoat' }));
    recordMeasurement(out, 'ceilingAreaSqft', ceilingArea, 'square feet');
  }
  if (c.trimIncluded) {
    const trim = measured(c.trimLengthLF, 'trimLengthLF');
    add(out, makeLine({ name: 'Trim labor', category: 'labor', quantity: trim, unit: 'measured linear feet', rateCents: p.trimLaborPerLF, ratePath: 'trimLaborPerLF' }));
    if(!scopesSuppressPrice('INTERIOR_PAINTING',c,p,rules,'trimMaterialPerLF')) add(out, makeLine({ name: 'Trim materials', category: 'material', quantity: trim, unit: 'measured linear feet', rateCents: p.trimMaterialPerLF, ratePath: 'trimMaterialPerLF', customerDriver: `${trim} measured linear feet of trim materials` }));
    recordMeasurement(out, 'trimLengthLF', trim, 'linear feet');
  }
  recordMeasurement(out, 'wallAreaSqft', wallArea, 'square feet');
  recordMeasurement(out, 'appliedFinishCoats', coats, 'coats', 'customer_confirmed');
  out.priceDrivers.push(`${wallArea} measured square feet of paintable wall area`, `${coats} paint coat${coats === 1 ? '' : 's'}`);
  return out;
}

function calculateExteriorPainting(c, p, rules={}) {
  if (c.surfaceCondition === 'poor') {
    throw new QuoteReviewError('Poor exterior surfaces require an explicitly confirmed primer pricing rule before pricing.', {
      ownerDecisionRequired: [{
        path: 'exteriorPrimerPricing',
        kind: 'primer_pricing_contract',
        message: 'Approve separate primer pricing or an explicit all-inclusive exterior rate rule.'
      }]
    });
  }
  const out = baseOutput('EXTERIOR_PAINTING');
  const area = measured(c.exteriorAreaSqft, 'exteriorAreaSqft');
  const finishCoats = count(c.coats, 'coats');
  const exactFinishCoatSqft = exactMultiply(area, finishCoats);
  const finishCoatSqft = exactToNumber(exactFinishCoatSqft);
  recordQuantityDerivation(out, {
    name: 'exteriorFinishCoatSqft', formula: 'exteriorAreaSqft * finishCoats',
    inputs: { exteriorAreaSqft: area, finishCoats },
    result: exactFinishCoatSqft, unit: 'wall square-foot finish coats',
    usedBy: ['Exterior labor', 'Exterior materials']
  });
  const story = quantityFactor(p.storyMultiplier[c.stories], `storyMultiplier.${c.stories}`);
  add(out, makeLine({ name: 'Exterior labor', category: 'labor', quantity: exactFinishCoatSqft, unit: 'measured wall square-foot finish coats', rateCents: p.exteriorLaborPerSqftPerCoat, ratePath: 'exteriorLaborPerSqftPerCoat', multipliers: [{ name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }], customerDriver: `${area} measured square feet of paintable wall area` }));
  if (c.surfaceCondition === 'fair') {
    const prepHoursPerSqft = quantityFactor(p.prepHoursPerSqft.fair, 'prepHoursPerSqft.fair');
    const exactPrepHours = exactMultiply(area, prepHoursPerSqft);
    const prepHours = exactToNumber(exactPrepHours);
    recordQuantityDerivation(out, {
      name: 'exteriorPreparationHours', formula: 'exteriorAreaSqft * prepHoursPerSqft',
      inputs: { exteriorAreaSqft: area, prepHoursPerSqft },
      result: exactPrepHours, unit: 'labor hours',
      usedBy: ['Exterior preparation']
    });
    add(out, makeLine({ name: 'Exterior preparation', category: 'prep', quantity: exactPrepHours, unit: 'configured preparation hours from measured wall area', rateCents: p.laborHourlyRate, ratePath: 'laborHourlyRate' }));
  }
  if(!scopesSuppressPrice('EXTERIOR_PAINTING',c,p,rules,'materialPerSqftPerCoat')) add(out, makeLine({ name: 'Exterior materials', category: 'material', quantity: exactFinishCoatSqft, unit: 'measured wall square-foot finish coats', rateCents: p.materialPerSqftPerCoat, ratePath: 'materialPerSqftPerCoat', customerDriver: `${finishCoats} finish coat${finishCoats === 1 ? '' : 's'}` }));
  recordMeasurement(out, 'exteriorAreaSqft', area, 'square feet');
  recordMeasurement(out, 'finishCoats', finishCoats, 'coats', 'customer_confirmed');
  out.priceDrivers.push(`${area} measured square feet of paintable wall area`, `${finishCoats} finish coat${finishCoats === 1 ? '' : 's'}`);
  return out;
}

function calculateFlooring(serviceType, c, p, ctx) {
  const out = baseOutput(serviceType);
  const sqft = measured(c.sqft, 'sqft');
  const roomCount = count(c.roomCount, 'roomCount');
  const exactAverageRoom = exactDivide(sqft, roomCount);
  const averageRoom = exactToNumber(exactAverageRoom);
  const thresholds = p.roomSizeThresholds;
  if (thresholds.smallMaxSqft >= thresholds.mediumMaxSqft) throw new QuoteReviewError('Flooring room-size thresholds are inconsistent.', { invalidOwnerFields: ['roomSizeThresholds'] });
  const roomBand = exactCompare(exactAverageRoom, thresholds.smallMaxSqft) < 0 ? 'small' : exactCompare(exactAverageRoom, thresholds.mediumMaxSqft) < 0 ? 'medium' : 'large';
  const roomMultiplier = quantityFactor(p.roomComplexityMultiplier[roomBand], `roomComplexityMultiplier.${roomBand}`);
  const productWasteFactor = quantityFactor(p.wasteFactorByType[c.newFlooringType], `wasteFactorByType.${c.newFlooringType}`, { allowZero: true });
  const patternWasteAdder = quantityFactor(p.patternWasteAdder[c.layoutPattern], `patternWasteAdder.${c.layoutPattern}`, { allowZero: true });
  const exactWaste = exactAdd(productWasteFactor, patternWasteAdder);
  const waste = exactToNumber(exactWaste);
  const exactMaterialSqft = exactMultiply(sqft, exactAdd(1, exactWaste));
  const materialSqft = exactToNumber(exactMaterialSqft);
  recordQuantityDerivation(out, {
    name: 'averageRoomSqft', formula: 'floorAreaSqft / roomCount',
    inputs: { floorAreaSqft: sqft, roomCount },
    result: exactAverageRoom, unit: 'square feet',
    usedBy: ['average-room complexity rule']
  });
  recordQuantityDerivation(out, {
    name: 'flooringMaterialSqft', formula: 'floorAreaSqft * (1 + productWasteFactor + patternWasteAdder)',
    inputs: { floorAreaSqft: sqft, productWasteFactor, patternWasteAdder },
    result: exactMaterialSqft, unit: 'square feet',
    usedBy: ['Flooring materials']
  });
  recordRuleApplication(out, {
    name: 'averageRoomComplexityBand',
    rule: 'averageRoomSqft < smallMaxSqft => small; averageRoomSqft < mediumMaxSqft => medium; otherwise large',
    inputs: { averageRoomSqft: averageRoom, smallMaxSqft: thresholds.smallMaxSqft, mediumMaxSqft: thresholds.mediumMaxSqft },
    result: roomBand,
    usedBy: ['Flooring labor']
  });
  add(out, makeLine({ name: 'Flooring labor', category: 'labor', quantity: sqft, unit: 'measured square feet', rateCents: valueAtPath(p, `laborPerSqft.${c.newFlooringType}`), ratePath: `laborPerSqft.${c.newFlooringType}`, multipliers: [{ name: 'average-room complexity', value: roomMultiplier, path: `roomComplexityMultiplier.${roomBand}` }], customerDriver: `${sqft} measured square feet` }));
  add(out, makeLine({ name: 'Flooring materials', category: 'material', quantity: exactMaterialSqft, unit: 'waste-adjusted square feet', rateCents: valueAtPath(p, `materialPerSqft.${c.newFlooringType}`), ratePath: `materialPerSqft.${c.newFlooringType}`, customerDriver: `Flooring type: ${c.newFlooringType.replaceAll('_', ' ')}` }));
  if (c.removalNeeded) add(out, makeLine({ name: 'Existing flooring removal', category: 'removal', quantity: c.removalAreaSqft, unit: 'measured square feet', rateCents: valueAtPath(p, `removalPerSqft.${c.existingFloorType}`), ratePath: `removalPerSqft.${c.existingFloorType}` }));
  const underlaymentApplies = vinylUnderlaymentApplies(c, p);
  if (c.newFlooringType === 'vinyl_plank') {
    recordRuleApplication(out, {
      name: 'vinylPlankUnderlayment',
      rule: 'always_included applies; never_included omits; customer_selectable_addon follows selection; subfloor_condition applies only when underlayment is required',
      inputs: { configuredRule: p.vinylPlankUnderlaymentRule, underlaymentSelected: c.underlaymentSelected ?? null, subfloorCondition: c.subfloorCondition ?? null },
      result: { applies: underlaymentApplies },
      usedBy: ['Underlayment line presence']
    });
  }
  if (underlaymentApplies && !p.scopeDetails?.['floor_underlayment_'+c.newFlooringType]) {
    add(out, makeLine({ name: 'Underlayment', category: 'material', quantity: sqft, unit: 'measured installed square feet', rateCents: p.underlaymentPerSqft, ratePath: 'underlaymentPerSqft', priceBasis: installedAreaSellPriceBasis(p.underlaymentPriceBasis, 'underlaymentPriceBasis') }));
  }
  if (c.stairSteps > 0 && !p.scopeDetails?.stairs) add(out, makeLine({ name: 'Stair installation', category: 'labor', quantity: c.stairSteps, unit: 'steps', rateCents: p.perStepPrice, ratePath: 'perStepPrice', customerDriver: `${c.stairSteps} stair step${c.stairSteps === 1 ? '' : 's'}` }));
  if (serviceType === 'FLOORING_REPLACEMENT' && c.subfloorIssues) {
    add(out, makeLine({ name: 'Subfloor repair allowance', category: 'prep', quantity: c.subfloorRepairAreaSqft, unit: 'measured affected square feet', rateCents: p.subfloorAllowancePerSqft, ratePath: 'subfloorAllowancePerSqft' }));
    out.disclosures.push('Subfloor repair allowance covers only the measured affected area and is confirmed after opening the floor.');
  }
  out.feeScope.disposal = c.removalNeeded;
  if (c.removalNeeded) addDisposalOverride(out, p, 'disposalPerSqft', c.removalAreaSqft, 'removed square feet', 'Flooring disposal');
  recordMeasurement(out, 'floorAreaSqft', sqft, 'square feet');
  recordMeasurement(out, 'averageRoomSqft', averageRoom, 'square feet', 'derived_from_measured_area_and_room_count');
  out.priceDrivers.push(`${sqft} measured square feet`, `Flooring type: ${c.newFlooringType.replaceAll('_', ' ')}`);
  return out;
}

function calculateFencing(serviceType, c) {
  const gateCount = count(c.gateCount, 'gateCount', true);
  const ownerDecisionRequired = [{
    path: 'postDerivationRule',
    kind: 'post_geometry_contract',
    message: 'Approve post derivation from measured fence geometry, including spacing, ends, corners, and gate-post rules.'
  }, {
    path: 'concretePerPost',
    kind: 'mixed_charge_allocation',
    message: 'Provide separate labor and material prices, or an explicit owner-confirmed allocation rule.'
  }];
  if (gateCount > 0) {
    measured(c.gateWidthTotalLF, 'gateWidthTotalLF');
    ownerDecisionRequired.push({
      path: `gatePrice.${c.fenceType}`,
      kind: 'gate_width_pricing_contract',
      message: 'Choose and confirm a measured-width gate pricing model and owner rates; the existing per-gate price cannot distinguish opening widths.'
    });
  }
  throw new QuoteReviewError(`${serviceType} needs owner pricing decisions before a customer-ready quote can be calculated.`, {
    invalidOwnerFields: ownerDecisionRequired.map(item => item.path),
    ownerDecisionRequired
  });
}
function concreteMeasurements(c) {
  if(c.dimensionMethod==='measured_outline'){
    const measured=measuredOutlineVNext(c.outlinePoints);
    return {...measured,areaSqft:exactToNumber(measured.exactAreaSqft),perimeterLF:exactToNumber(measured.exactPerimeterLF),source:'derived_from_measured_closed_orthogonal_outline'};
  }
  if (c.dimensionMethod === 'exact') {
    const length = measured(c.length, 'length');
    const width = measured(c.width, 'width');
    const exactAreaSqft = exactMultiply(length, width);
    const exactPerimeterLF = exactMultiply(2, exactAdd(length, width));
    return {
      areaSqft: exactToNumber(exactAreaSqft),
      perimeterLF: exactToNumber(exactPerimeterLF),
      exactAreaSqft,
      exactPerimeterLF,
      source: 'derived_from_measured_length_and_width'
    };
  }
  const areaSqft = measured(c.areaSqft, 'areaSqft');
  const perimeterLF = measured(c.perimeterLF, 'perimeterLF');
  return {
    areaSqft,
    perimeterLF,
    exactAreaSqft: exactDecimal(areaSqft),
    exactPerimeterLF: exactDecimal(perimeterLF),
    source: 'customer_measured'
  };
}

function calculateConcrete(serviceType, c, p) {
  if (c.finishType === 'exposed_aggregate' && !p.scopeDetails?.exposed_aggregate) {
    throw new QuoteReviewError('Exposed-aggregate material pricing requires an approved owner pricing rule before quoting.', {
      ownerDecisionRequired: [{
        path: 'exposedAggregateMaterialPricing',
        kind: 'finish_material_pricing_contract',
        message: 'Approve an exposed-aggregate material price or an explicit all-inclusive finish rule.'
      }]
    });
  }
  const out = baseOutput(serviceType);
  const dimensions = concreteMeasurements(c);
  if(c.dimensionMethod==='measured_outline'){
    recordQuantityDerivation(out,{name:'concreteOutlineAreaSqft',formula:'absolute closed-outline cross-product sum / 2',inputs:{outlinePoints:c.outlinePoints},result:dimensions.exactAreaSqft,unit:'square feet',usedBy:['Concrete labor','Ready-mix concrete']});
    recordQuantityDerivation(out,{name:'concreteOutlinePerimeterLF',formula:'sum of measured horizontal and vertical edge lengths',inputs:{outlinePoints:c.outlinePoints},result:dimensions.exactPerimeterLF,unit:'linear feet',usedBy:['Formwork']});
  }
  const thickness = measured(c.thickness, 'thickness');
  const waste = quantityFactor(p.concreteWasteFactor, 'concreteWasteFactor', { allowZero: true });
  const exactYards = exactDivide(exactMultiply(dimensions.exactAreaSqft, thickness, exactAdd(1, waste)), 324);
  const yards = exactToNumber(exactYards);
  const access = quantityFactor(p.accessMultiplier[c.accessDifficulty], `accessMultiplier.${c.accessDifficulty}`);
  const finish = quantityFactor(c.finishType==='exposed_aggregate'&&p.scopeDetails?.exposed_aggregate?1:p.finishMultiplier[c.finishType], `finishMultiplier.${c.finishType}`);
  const exactFinishExtra = exactSubtract(finish, 1);
  if (c.dimensionMethod === 'exact') {
    recordQuantityDerivation(out, {
      name: 'concreteAreaSqft', formula: 'length * width',
      inputs: { length: c.length, width: c.width },
      result: dimensions.exactAreaSqft, unit: 'square feet',
      usedBy: ['Concrete labor', 'Ready-mix concrete', 'Base preparation', 'Reinforcement']
    });
    recordQuantityDerivation(out, {
      name: 'concretePerimeterLF', formula: '2 * (length + width)',
      inputs: { length: c.length, width: c.width },
      result: dimensions.exactPerimeterLF, unit: 'linear feet',
      usedBy: ['Formwork']
    });
  }
  recordQuantityDerivation(out, {
    name: 'concreteVolumeCubicYards', formula: 'areaSqft * (thicknessInches / 12) / 27 * (1 + concreteWasteFactor)',
    inputs: { areaSqft: dimensions.areaSqft, thicknessInches: thickness, concreteWasteFactor: waste },
    result: exactYards, unit: 'cubic yards',
    usedBy: ['Ready-mix concrete']
  });
  recordRuleApplication(out, {
    name: 'concreteFinishLabor',
    rule: 'access applies to base and extra finish labor; base labor is charged once and finishMultiplier - 1 adds a separately rounded extra labor component',
    inputs: { finishType: c.finishType, configuredFinishMultiplier: finish, accessDifficulty: c.accessDifficulty, accessMultiplier: access },
    result: { baseMultiplier: 1, extraMultiplier: exactToNumber(exactFinishExtra) },
    usedBy: ['Concrete labor']
  });
  add(out, makeCompositeLine({
    name: 'Concrete labor', category: 'labor', customerDriver: `${dimensions.areaSqft} measured square feet at ${thickness} inches thick`,
    components: [
      { quantity: dimensions.exactAreaSqft, unit: 'measured square feet', rateCents: p.laborPerSqft, ratePath: 'laborPerSqft', multipliers: [{ name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }] },
      ...(finish > 1 ? [{ quantity: dimensions.exactAreaSqft, unit: 'measured square feet', rateCents: p.laborPerSqft, ratePath: 'laborPerSqft', multipliers: [{ name: 'finish extra', value: exactFinishExtra, sourceValue: finish, transform: 'configured multiplier - 1', path: `finishMultiplier.${c.finishType}` }, { name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }] }] : [])
    ]
  }));
  add(out, makeLine({ name: 'Ready-mix concrete', category: 'material', quantity: exactYards, unit: 'waste-adjusted cubic yards', rateCents: p.concreteCostPerCubicYard, ratePath: 'concreteCostPerCubicYard' }));
  add(out, makeLine({ name: 'Formwork', category: 'material', quantity: dimensions.exactPerimeterLF, unit: 'measured linear feet', rateCents: p.formworkPerLF, ratePath: 'formworkPerLF', customerDriver: `${dimensions.perimeterLF} measured linear feet of formwork` }));
  if (c.baseNeeded) add(out, makeLine({ name: 'Base preparation', category: 'prep', quantity: dimensions.exactAreaSqft, unit: 'measured square feet', rateCents: p.basePrepPerSqft, ratePath: 'basePrepPerSqft' }));
  if (c.demolitionNeeded && !p.scopeDetails?.demolition) add(out, makeLine({ name: 'Concrete demolition', category: 'removal', quantity: c.demolitionAreaSqft, unit: 'measured demolition square feet', rateCents: p.demolitionPerSqft, ratePath: 'demolitionPerSqft', multipliers: [{ name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }] }));
  if (c.reinforcement === 'wire_mesh') add(out, makeLine({ name: 'Wire mesh reinforcement', category: 'material', quantity: dimensions.exactAreaSqft, unit: 'measured square feet', rateCents: p.wireReinforcementPerSqft, ratePath: 'wireReinforcementPerSqft' }));
  if (c.reinforcement === 'rebar') add(out, makeLine({ name: 'Rebar reinforcement', category: 'material', quantity: dimensions.exactAreaSqft, unit: 'measured square feet', rateCents: p.rebarReinforcementPerSqft, ratePath: 'rebarReinforcementPerSqft' }));
  if (c.finishType === 'stamped') add(out, makeLine({ name: 'Stamped finish materials', category: 'material', quantity: dimensions.exactAreaSqft, unit: 'measured square feet', rateCents: p.stampedMaterialPerSqft, ratePath: 'stampedMaterialPerSqft' }));
  out.feeScope.disposal = c.demolitionNeeded;
  if (c.demolitionNeeded && !p.scopeDetails?.demolition?.disposalIncluded) addDisposalOverride(out, p, 'disposalPerSqft', c.demolitionAreaSqft, 'measured demolition square feet', 'Concrete disposal');
  recordMeasurement(out, 'areaSqft', dimensions.areaSqft, 'square feet', dimensions.source);
  recordMeasurement(out, 'perimeterLF', dimensions.perimeterLF, 'linear feet', dimensions.source);
  recordMeasurement(out, 'concreteVolume', yards, 'cubic yards', 'derived_from_measured_area_thickness_and_owner_waste');
  out.priceDrivers.push(`${dimensions.areaSqft} measured square feet at ${thickness} inches thick`, `${c.finishType.replaceAll('_', ' ')} finish`);
  return out;
}

function calculateCleanup(c, p) {
  const out = baseOutput('LANDSCAPING_CLEANUP');
  const area = measured(c.yardSqft, 'yardSqft');
  const debris = p.debrisPricing[c.debrisLevel];
  const debrisMultiplier = quantityFactor(debris.laborMultiplier, `debrisPricing.${c.debrisLevel}.laborMultiplier`);
  const slope = quantityFactor(p.slopeMultiplier[c.slope], `slopeMultiplier.${c.slope}`);
  add(out, makeLine({ name: 'Cleanup labor', category: 'labor', quantity: area, unit: 'measured square feet', rateCents: p.cleanupBaseRatePerSqft, ratePath: 'cleanupBaseRatePerSqft', multipliers: [{ name: 'debris level', value: debrisMultiplier, path: `debrisPricing.${c.debrisLevel}.laborMultiplier` }, { name: 'slope', value: slope, path: `slopeMultiplier.${c.slope}` }], customerDriver: `${area} measured square feet` }));
  add(out, fixedLine('Debris disposal', 'disposal', debris.disposalFlat, `debrisPricing.${c.debrisLevel}.disposalFlat`, undefined, { allowZero: true }));
  if (c.haulAway) add(out, fixedLine('Additional haul-away', 'disposal', p.haulAwayFee, 'haulAwayFee'));
  out.feeScope.disposal = true;
  out.replacedCommonFees.push('disposal');
  recordMeasurement(out, 'cleanupAreaSqft', area, 'square feet');
  out.priceDrivers.push(`${area} measured square feet`, `${c.debrisLevel} debris level`);
  return out;
}

function calculateMulch(c, p) {
  const out = baseOutput('LANDSCAPING_MULCH');
  const exactYards = c.inputMethod === 'sqft'
    ? exactDivide(exactMultiply(measured(c.mulchArea, 'mulchArea'), measured(c.mulchDepth, 'mulchDepth')), 324)
    : exactDecimal(measured(c.mulchArea, 'mulchArea'));
  const yards = exactToNumber(exactYards);
  const overage = c.inputMethod==='sqft' ? quantityFactor(p.mulchOverageFactor, 'mulchOverageFactor') : 1;
  const exactOrderYards = exactMultiply(exactYards, overage);
  const orderYards = exactToNumber(exactOrderYards);
  if (c.inputMethod === 'sqft') {
    recordQuantityDerivation(out, {
      name: 'installedMulchYards', formula: 'mulchAreaSqft * (mulchDepthInches / 12) / 27',
      inputs: { mulchAreaSqft: c.mulchArea, mulchDepthInches: c.mulchDepth },
      result: exactYards, unit: 'cubic yards',
      usedBy: ['Mulch installation labor', 'mulchOrderYards']
    });
  }
  recordQuantityDerivation(out, {
    name: 'mulchOrderYards', formula: 'installedMulchYards * mulchOverageFactor',
    inputs: { installedMulchYards: yards, mulchOverageFactor: overage },
    result: exactOrderYards, unit: 'cubic yards',
    usedBy: ['Mulch material']
  });
  if (c.bedCondition !== 'clean') add(out, makeLine({ name: 'Bed preparation', category: 'labor', quantity: c.bedSqft, unit: 'measured square feet', rateCents: valueAtPath(p, `bedPrepLaborPerSqft.${c.bedCondition}`), ratePath: `bedPrepLaborPerSqft.${c.bedCondition}`, customerDriver: `${c.bedSqft} square feet of bed preparation: ${c.bedCondition==='needs_weeding'?'weeding':'clearing overgrowth'}` }));
  add(out, makeLine({ name: 'Mulch material', category: 'material', quantity: exactOrderYards, unit: 'owner-adjusted cubic yards ordered', rateCents: valueAtPath(p, `mulchMaterialPerYard.${c.mulchType}`), ratePath: `mulchMaterialPerYard.${c.mulchType}`, customerDriver: `${yards.toFixed(2)} ${c.inputMethod!=='sqft'?'customer-stated':'calculated'} cubic yards of ${c.mulchType.replaceAll('_', ' ')} mulch` }));
  add(out, makeLine({ name: 'Mulch installation labor', category: 'labor', quantity: exactYards, unit: 'calculated cubic yards installed', rateCents: p.mulchInstallLaborPerYard, ratePath: 'mulchInstallLaborPerYard' }));
  if (c.edgingNeeded) add(out, makeLine({ name: 'Bed edging', category: 'labor', quantity: c.edgeLF, unit: 'measured linear feet', rateCents: p.edgingPerLinearFoot, ratePath: 'edgingPerLinearFoot', customerDriver: `${c.edgeLF} measured linear feet of bed edging` }));
  out.feeScope.disposal = c.bedCondition !== 'clean';
  recordMeasurement(out, 'mulchVolume', yards, 'cubic yards', c.inputMethod === 'sqft' ? 'derived_from_measured_area_and_depth' : 'customer_measured');
  if (c.edgingNeeded) recordMeasurement(out, 'edgeLengthLF', c.edgeLF, 'linear feet');
  out.priceDrivers.push(`${yards.toFixed(2)} ${c.inputMethod!=='sqft'?'customer-stated':'calculated'} cubic yards of ${c.mulchType.replaceAll('_', ' ')} mulch`, c.edgingNeeded ? `${c.edgeLF} measured linear feet of bed edging` : `Bed condition: ${c.bedCondition.replaceAll('_', ' ')}`);
  return out;
}

function calculateSod(c, p, ctx) {
  const out = baseOutput('LANDSCAPING_SOD');
  const sqft = measured(c.sodSqft, 'sodSqft');
  const waste = quantityFactor(p.sodWasteFactor, 'sodWasteFactor', { allowZero: true });
  const slope = quantityFactor(p.slopeMultiplier[c.slope], `slopeMultiplier.${c.slope}`);
  const access = quantityFactor(p.accessMultiplier[c.accessDifficulty], `accessMultiplier.${c.accessDifficulty}`);
  const exactSodOrderSqft = exactMultiply(sqft, exactAdd(1, waste));
  const sodOrderSqft = exactToNumber(exactSodOrderSqft);
  recordQuantityDerivation(out, {
    name: 'sodOrderSqft', formula: 'sodAreaSqft * (1 + sodWasteFactor)',
    inputs: { sodAreaSqft: sqft, sodWasteFactor: waste },
    result: exactSodOrderSqft, unit: 'square feet',
    usedBy: ['Sod material']
  });
  add(out, makeLine({ name: 'Sod material', category: 'material', quantity: exactSodOrderSqft, unit: 'waste-adjusted square feet', rateCents: p.sodMaterialPerSqft, ratePath: 'sodMaterialPerSqft', customerDriver: `${sqft} measured square feet of sod` }));
  add(out, makeLine({ name: 'Sod installation labor', category: 'labor', quantity: sqft, unit: 'measured square feet', rateCents: p.sodInstallLaborPerSqft, ratePath: 'sodInstallLaborPerSqft', multipliers: [{ name: 'slope', value: slope, path: `slopeMultiplier.${c.slope}` }, { name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }] }));
  if (c.groundPrepNeeded) {
    add(out, makeLine({ name: 'Ground preparation', category: 'prep', quantity: sqft, unit: 'measured square feet', rateCents: p.groundPrepPerSqft, ratePath: 'groundPrepPerSqft' }));
  }
  const separate = ctx.ownerPricing?.disposalScope === 'separate_project_debris';
  if(separate && typeof c.separateDisposalSelected!=='boolean')throw new QuoteReviewError('Confirm whether separate project-debris disposal is selected.',{missingCustomerFields:['separateDisposalSelected']});
  if(!separate && c.separateDisposalSelected!==undefined)throw new QuoteReviewError('Separate disposal requires an explicit owner scope declaration.',{invalidCustomerFields:['separateDisposalSelected']});
  out.feeScope.disposal = separate && c.separateDisposalSelected===true;
  if((c.groundPrepNeeded || separate) && !out.feeScope.disposal)out.replacedCommonFees.push('disposal');
  recordRuleApplication(out,{name:'sodDisposalOwnership',rule:'Ground preparation includes old-lawn haul-away; common disposal covers only explicitly separate selected project debris.',inputs:{groundPrepNeeded:c.groundPrepNeeded,disposalScope:ctx.ownerPricing?.disposalScope??null,separateDisposalSelected:c.separateDisposalSelected??null},result:{oldLawnDisposalOwner:c.groundPrepNeeded?'groundPrepPerSqft':null,commonDisposalScope:out.feeScope.disposal?'separate_project_debris':null},usedBy:['Ground preparation','Disposal']});
  recordMeasurement(out, 'sodAreaSqft', sqft, 'square feet');
  out.priceDrivers.push(`${sqft} measured square feet of sod`, c.groundPrepNeeded ? 'Existing-ground preparation included' : `Slope: ${c.slope}`);
  return out;
}

function calculatePlanting(c, p) {
  const out = baseOutput('LANDSCAPING_PLANTING');
  let totalPlants = 0;
  for (const size of ['small', 'medium', 'large']) {
    const plantCount = c.plantsBySize[size];
    totalPlants += plantCount;
    if (plantCount <= 0) continue;
    add(out, makeLine({ name: `${size[0].toUpperCase()}${size.slice(1)} plant installation labor`, category: 'labor', quantity: plantCount, unit: `${size} plants`, rateCents: valueAtPath(p, `plantingLaborPerPlant.${size}`), ratePath: `plantingLaborPerPlant.${size}` }));
    add(out, makeLine({ name: `${size[0].toUpperCase()}${size.slice(1)} plant material allowance`, category: 'material', quantity: plantCount, unit: `${size} plants`, rateCents: valueAtPath(p, `plantMaterialAllowance.${size}`), ratePath: `plantMaterialAllowance.${size}` }));
  }
  if (c.bedCondition !== 'clean') add(out, makeLine({ name: 'Bed preparation', category: 'labor', quantity: c.bedSqft, unit: 'measured square feet', rateCents: valueAtPath(p, `bedPrepLaborPerSqft.${c.bedCondition}`), ratePath: `bedPrepLaborPerSqft.${c.bedCondition}` }));
  if (c.mulchNeeded) {
    const overage = 1; // Caller-stated cubic yards are already an ordering quantity.
    const exactMulchOrderYards = exactMultiply(c.mulchYards, overage);
    const mulchOrderYards = exactToNumber(exactMulchOrderYards);
    recordQuantityDerivation(out, {
      name: 'plantingMulchOrderYards', formula: 'installedMulchYards * mulchOverageFactor',
      inputs: { installedMulchYards: c.mulchYards, mulchOverageFactor: overage },
      result: exactMulchOrderYards, unit: 'cubic yards',
      usedBy: ['Mulch material']
    });
    add(out, makeLine({ name: 'Mulch material', category: 'material', quantity: exactMulchOrderYards, unit: 'owner-adjusted cubic yards ordered', rateCents: valueAtPath(p, `mulchMaterialPerYard.${c.mulchType}`), ratePath: `mulchMaterialPerYard.${c.mulchType}` }));
    add(out, makeLine({ name: 'Mulch installation labor', category: 'labor', quantity: c.mulchYards, unit: 'measured cubic yards installed', rateCents: p.mulchInstallLaborPerYard, ratePath: 'mulchInstallLaborPerYard' }));
    recordMeasurement(out, 'mulchYards', c.mulchYards, 'cubic yards');
  }
  out.feeScope.disposal = c.bedCondition !== 'clean';
  recordMeasurement(out, 'plantsBySize', structuredClone(c.plantsBySize), 'plant counts');
  out.priceDrivers.push(`${totalPlants} confirmed plant${totalPlants === 1 ? '' : 's'}`, `Bed condition: ${c.bedCondition.replaceAll('_', ' ')}`);
  return out;
}

function calculateMowing(c, p, ctx) {
  const out = baseOutput('LANDSCAPING_MOWING');
  const sqft = measured(c.yardSqft, 'yardSqft');
  const frequency = quantityFactor(p.frequencyMultipliers[c.serviceFrequency], `frequencyMultipliers.${c.serviceFrequency}`);
  const overgrowth = quantityFactor(p.overgrowthMultipliers[c.grassCondition], `overgrowthMultipliers.${c.grassCondition}`);
  const labor = makeLine({ name: 'Mowing labor', category: 'labor', quantity: sqft, unit: 'measured mowable square feet', rateCents: p.mowingBaseRatePerSqft, ratePath: 'mowingBaseRatePerSqft', multipliers: [{ name: 'frequency', value: frequency, path: `frequencyMultipliers.${c.serviceFrequency}` }, { name: 'grass condition', value: overgrowth, path: `overgrowthMultipliers.${c.grassCondition}` }], customerDriver: `${sqft} measured mowable square feet` });
  add(out, labor);
  let baggingPriced = false;
  if (c.bagClippings) {
    const percent = addonPercent(p.baggingSurchargePercent, 'baggingSurchargePercent');
    if (percent === undefined) ctx.skipAddon('Clipping bagging and disposal');
    else {
      const exactAmount = exactDivide(exactMultiply(labor.amountCents, percent), 100);
      const amount = exactRound(exactAmount);
      if (!Number.isSafeInteger(amount) || amount < 0) throw new QuoteReviewError('Bagging surcharge did not produce a valid charge.', { invalidOwnerFields: ['baggingSurchargePercent'] });
      out.lineItems.push({
        name: 'Clipping bagging and disposal',
        category: 'disposal',
        amountCents: amount,
        ownerVisible: true,
        customerVisible: false,
        ...(amount === 0 ? {
          noCharge: true,
          noChargeReason: percent === 0
            ? 'configured_zero_percentage'
            : labor.amountCents === 0 ? 'zero_basis' : 'rounded_fractional_cent'
        } : {}),
        calculation: {
          evidenceVariant: 'percentage_derived',
          basisLine: 'Mowing labor',
          basisAmountCents: labor.amountCents,
          percent,
          ratePath: 'baggingSurchargePercent',
          unroundedCents: exactToNumber(exactAmount),
          exactUnroundedCents: exactEvidence(exactAmount),
          roundedAmountCents: amount
        }
      });
      out.replacedCommonFees.push('disposal');
      baggingPriced = true;
    }
  }
  if (c.edgingIncluded) {
    const rate = addonMoney(p.edgingPerLinearFoot, 'edgingPerLinearFoot');
    if (rate === undefined) ctx.skipAddon('Lawn edging');
    else add(out, makeLine({ name: 'Lawn edging', category: 'addon', quantity: c.edgingLengthLF, unit: 'measured linear feet', rateCents: rate, ratePath: 'edgingPerLinearFoot', customerDriver: `${c.edgingLengthLF} measured linear feet of edging`, allowZeroRate: true }));
  }
  out.feeScope.disposal = baggingPriced;
  recordMeasurement(out, 'mowableAreaSqft', sqft, 'square feet');
  if (c.edgingIncluded) recordMeasurement(out, 'edgingLengthLF', c.edgingLengthLF, 'linear feet');
  out.priceDrivers.push(`${sqft} measured mowable square feet`, `${c.serviceFrequency.replaceAll('_', ' ')} service`);
  return out;
}

function calculateSidingReplacement(c, p) {
  const out = baseOutput('SIDING_REPLACEMENT');
  const area = measured(c.sidingAreaSqft, 'sidingAreaSqft');
  const waste = quantityFactor(p.wasteFactorByType[c.sidingType], `wasteFactorByType.${c.sidingType}`, { allowZero: true });
  const exactSidingMaterialSqft = exactMultiply(area, exactAdd(1, waste));
  const sidingMaterialSqft = exactToNumber(exactSidingMaterialSqft);
  recordQuantityDerivation(out, {
    name: 'sidingMaterialSqft', formula: 'sidingAreaSqft * (1 + sidingWasteFactor)',
    inputs: { sidingAreaSqft: area, sidingWasteFactor: waste },
    result: exactSidingMaterialSqft, unit: 'square feet',
    usedBy: ['Siding materials']
  });
  if (c.trimIncluded && !p.scopeDetails?.siding_trim) {
    throw new QuoteReviewError('Siding trim installation needs an approved labor/material classification before pricing.', {
      ownerDecisionRequired: [{
        path: 'trimPerLinearFoot',
        kind: 'mixed_charge_classification',
        message: 'Approve separate siding-trim labor and material rates, or an explicit category and allocation rule.'
      }]
    });
  }
  const story = quantityFactor(p.storyMultiplier[c.stories], `storyMultiplier.${c.stories}`);
  add(out, makeLine({ name: 'Siding labor', category: 'labor', quantity: area, unit: 'measured wall square feet', rateCents: valueAtPath(p, `laborPerSqft.${c.sidingType}`), ratePath: `laborPerSqft.${c.sidingType}`, multipliers: [{ name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }], customerDriver: `${area} measured square feet of siding wall area` }));
  add(out, makeLine({ name: 'Siding materials', category: 'material', quantity: exactSidingMaterialSqft, unit: 'waste-adjusted wall square feet', rateCents: valueAtPath(p, `materialPerSqft.${c.sidingType}`), ratePath: `materialPerSqft.${c.sidingType}`, customerDriver: `Siding type: ${c.sidingType.replaceAll('_', ' ')}` }));
  if (c.oldSidingRemoval && !p.scopeDetails?.siding_removal) add(out, makeLine({ name: 'Old siding removal', category: 'removal', quantity: area, unit: 'measured wall square feet', rateCents: p.removalPerSqft, ratePath: 'removalPerSqft', multipliers: [{ name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }] }));
  out.feeScope.disposal = c.oldSidingRemoval;
  if (c.oldSidingRemoval && !p.scopeDetails?.siding_removal?.disposalIncluded) addDisposalOverride(out, p, 'disposalPerSqft', p.scopeDetails?.siding_removal?c.sidingRemovalAreaSqft:area, 'removed square feet', 'Siding disposal');
  recordMeasurement(out, 'sidingAreaSqft', area, 'square feet');
  if (c.trimIncluded) recordMeasurement(out, 'trimLengthLF', c.trimLengthLF, 'linear feet');
  out.priceDrivers.push(`${area} measured square feet of siding wall area`, `Siding type: ${c.sidingType.replaceAll('_', ' ')}`);
  return out;
}

function calculateSidingRepair(c, p) {
  const out = baseOutput('SIDING_REPAIR');
  const repairSize = repairSizeFromAffectedArea('SIDING_REPAIR', c.affectedArea);
  const hoursPath = `repairHours.${c.sidingType}.${c.damageLevel}.${repairSize}`;
  const materialPath = `materialAllowance.${c.sidingType}.${c.damageLevel}.${repairSize}`;
  const hours = quantityFactor(valueAtPath(p, hoursPath), hoursPath);
  const story = quantityFactor(p.storyMultiplier[c.stories], `storyMultiplier.${c.stories}`);
  add(out, makeLine({ name: 'Siding repair labor', category: 'labor', quantity: hours, unit: 'configured labor hours', rateCents: p.laborHourlyRate, ratePath: 'laborHourlyRate', multipliers: [{ name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }], customerDriver: `${repairSize} ${c.damageLevel.replaceAll('_', ' ')} ${c.sidingType.replaceAll('_', ' ')} repair` }));
  add(out, fixedLine('Siding repair materials', 'material', valueAtPath(p, materialPath), materialPath));
  out.measurements.push({ name: 'affectedAreaSqft', value: c.affectedArea, unit: 'square feet', source: 'customer_measured', derivedCategory: repairSize });
  recordRuleApplication(out, {
    name: 'repairSizeFromAffectedArea',
    rule: 'affectedArea < 20 => small; affectedArea <= 80 => medium; otherwise large',
    inputs: { serviceType: 'SIDING_REPAIR', affectedAreaSqft: c.affectedArea },
    result: repairSize,
    usedBy: [hoursPath, materialPath]
  });
  out.priceDrivers.push(`${c.affectedArea} measured affected square feet`, `Siding type: ${c.sidingType.replaceAll('_', ' ')}`);
  return out;
}

function inspectedServiceRules(value) {
  const snapshot = snapshotPlainData(value, 'serviceRules');
  const unsafePath = snapshot.ok ? snapshot.nonPlainPaths[0] : snapshot.errorPath;
  if (unsafePath) {
    const path = unsafePath.startsWith('serviceRules.')
      ? unsafePath.slice('serviceRules.'.length)
      : unsafePath;
    const reason = snapshot.ok ? 'nested value is not plain data' : snapshot.reason;
    throw new QuoteReviewError(`Service rules could not be read safely: ${reason}.`, { invalidOwnerFields: [path] });
  }
  return snapshot.value;
}

function serviceRulesFromContext(ctx) {
  if (!isPlainRecord(ctx)) return {};
  const ownerDescriptor = ownDataValue(ctx, 'ownerPricing');
  if (!ownerDescriptor.ok) {
    throw new QuoteReviewError('Service rules could not be inspected safely.', { invalidOwnerFields: ['serviceRules.ownerPricing'] });
  }
  if (ownerDescriptor.present && ownerDescriptor.value !== undefined) {
    if (!isPlainRecord(ownerDescriptor.value)) {
      throw new QuoteReviewError('Owner pricing context must be an object.', { invalidOwnerFields: ['serviceRules.ownerPricing'] });
    }
    return inspectedServiceRules(ownerDescriptor.value);
  }
  const basisDescriptor = ownDataValue(ctx, 'priceBasisByCategory');
  if (!basisDescriptor.ok) {
    throw new QuoteReviewError('Price-basis context could not be inspected safely.', { invalidOwnerFields: ['priceBasisByCategory'] });
  }
  if (basisDescriptor.present && basisDescriptor.value !== undefined) {
    if (!isPlainRecord(basisDescriptor.value)) {
      throw new QuoteReviewError('Price-basis context must be an object.', { invalidOwnerFields: ['priceBasisByCategory'] });
    }
    return inspectedServiceRules({ priceBasisByCategory: basisDescriptor.value });
  }
  return {};
}

export function calculateServiceVNext(serviceType, customerInputs, pricing, ctx) {
  if (!SERVICE_TYPES.includes(serviceType)) {
    throw new QuoteReviewError('Unsupported service type.', { invalidCustomerFields: ['serviceType'] });
  }
  if (!isPlainRecord(customerInputs)) {
    throw new QuoteReviewError('Customer inputs must be an object.', { invalidCustomerFields: ['customerInputs'] });
  }
  if (!isPlainRecord(pricing)) {
    throw new QuoteReviewError('Pricing must be an object.', { invalidOwnerFields: ['pricing'] });
  }
  const customerSnapshot = snapshotPlainData(customerInputs, 'customerInputs');
  const unsafeCustomerPath = customerSnapshot.ok ? customerSnapshot.nonPlainPaths[0] : customerSnapshot.errorPath;
  if (unsafeCustomerPath) {
    const path = unsafeCustomerPath.startsWith('customerInputs.')
      ? unsafeCustomerPath.slice('customerInputs.'.length)
      : unsafeCustomerPath;
    const reason = customerSnapshot.ok ? 'nested value is not plain data' : customerSnapshot.reason;
    throw new QuoteReviewError(`Customer inputs could not be read safely: ${reason}.`, { invalidCustomerFields: [path] });
  }
  customerInputs = customerSnapshot.value;
  const pricingSnapshot = snapshotPlainData(pricing, 'pricing');
  const unsafePricingPath = pricingSnapshot.ok ? pricingSnapshot.nonPlainPaths[0] : pricingSnapshot.errorPath;
  if (unsafePricingPath) {
    const path = unsafePricingPath.startsWith('pricing.')
      ? unsafePricingPath.slice('pricing.'.length)
      : unsafePricingPath;
    const reason = pricingSnapshot.ok ? 'nested value is not plain data' : pricingSnapshot.reason;
    throw new QuoteReviewError(`Pricing could not be read safely: ${reason}.`, { invalidOwnerFields: [path] });
  }
  pricing = pricingSnapshot.value;
  const serviceRules = serviceRulesFromContext(ctx);
  const customerValidation = validateCustomerInputs(serviceType, customerInputs, pricing, serviceRules);
  if (!customerValidation.ok) {
    throw new QuoteReviewError(customerValidation.reviewReason, {
      ...customerValidation,
      ownerDecisionRequired: inspectionOwnerDecisionsVNext(serviceType, customerInputs, pricing)
    });
  }
  customerInputs = customerValidation.normalized;
  const tier = ownDataValue(ctx, 'tierName');
  const ownerValidation = validateOwnerPricing(serviceType, customerInputs, pricing, serviceRules, tier.ok && tier.present ? tier.value : null);
  if (!ownerValidation.ok) {
    throw new QuoteReviewError('Pricing not fully configured for the measured scope.', ownerValidation);
  }
  if (['INTERIOR_PAINTING', 'EXTERIOR_PAINTING'].includes(serviceType)) {
    const path = 'priceBasisByCategory.material';
    const basis = serviceRules.priceBasisByCategory?.material;
    if (!['cost', 'sell_price'].includes(basis)) {
      const message = 'Painting calculations require an explicit material price-basis classification.';
      throw new QuoteReviewError(message, {
        missingOwnerFields: [path],
        invalidOwnerFields: [],
        unsupportedOwnerFields: [],
        crossFieldOwnerFields: [],
        ownerDecisionRequired: [],
        ownerDiagnostics: [{ type: 'missing', kind: 'service_rule', path, message }],
        validationMessages: [message]
      });
    }
  }

  const skipAddonDescriptor = ownDataValue(ctx, 'skipAddon');
  const addonContext = skipAddonDescriptor.ok && skipAddonDescriptor.present && typeof skipAddonDescriptor.value === 'function'
    ? {
        skipAddon(name) {
          try {
            skipAddonDescriptor.value(name);
          } catch (error) {
            if (error instanceof QuoteReviewError) throw error;
            throw new QuoteReviewError('Optional add-on disclosure context failed safely.', { invalidOwnerFields: ['addonDisclosureContext'] });
          }
        }
      }
    : {
        skipAddon() {
          throw new QuoteReviewError('Optional add-on exclusions require an engine disclosure context.', { invalidOwnerFields: ['addonDisclosureContext'] });
        }
      };
  const finalize = result => {
    const extra=scopeLines(serviceType,customerInputs,pricing,serviceRules);
    for(const line of extra.lines)add(result,makeLine(line));
    result.disclosures.push(...extra.disclosures);
    for(const rule of extra.rules)recordRuleApplication(result,rule);
    result.replacedCommonFees=[...new Set([...result.replacedCommonFees,...extra.replacedCommonFees])];
    Object.assign(result.feeScope,extra.feeScope);
    result.lineItems=result.lineItems.map(line=>{
      const ratePath=line.calculation?.ratePath;
      if(Object.hasOwn(installedPriceDefinitions(serviceType,pricing),ratePath)) {
        const factorPath=installedLaborFactorPath(serviceType,customerInputs,ratePath);
        const factor=factorPath?valueAtPath(pricing,factorPath):1;
        const laborShare=pricing.installedLaborPercent?.[ratePath];
        const base=exactFromEvidence(line.calculation.exactUnroundedCents);
        if(factor!==1 && laborShare===undefined)throw new QuoteReviewError('Set the labor portion of this installed price before applying a labor adjustment.',{missingOwnerFields:['installedLaborPercent.'+ratePath]});
        const adjusted=factor===1?line:makeLine({...line,...line.calculation,multipliers:[...line.calculation.multipliers,{name:'Installed labor portion adjustment',path:factorPath,value:exactAdd(1,exactMultiply(exactDivide(laborShare,100),exactSubtract(factor,1))),laborSharePercent:laborShare,laborFactor:factor}]});
        adjusted.installedBaseExactCents=exactEvidence(base);
        if(laborShare!==undefined)adjusted.installedLaborExactCents=exactEvidence(exactMultiply(base,exactDivide(laborShare,100),factor));
        return adjusted;
      }
      const adjustment=tradeAdjustment(serviceType,customerInputs,pricing,line);
      if(!adjustment)return line;
      const rebuilt=makeLine({...line,...line.calculation,...adjustment});
      if(adjustment.wastePath)recordQuantityDerivation(result,{name:line.name+' material quantity',formula:'measured quantity * (1 + owner material waste)',inputs:{measuredQuantity:adjustment.originalQuantity,wasteFactor:adjustment.waste,wastePath:adjustment.wastePath},result:adjustment.quantity,unit:line.calculation.unit,usedBy:[line.name]});
      return rebuilt;
    });
    return recordNoChargeClassification(result,serviceRules);
  };
  if(configuredOffering(serviceType,pricing)) {
    const out=baseOutput(serviceType);
    for(const item of offeringLines(serviceType,customerInputs,pricing)) {
      if(scopesSuppressPrice(serviceType,customerInputs,pricing,serviceRules,item.ratePath))continue;
      add(out,makeLine({name:item.label,category:item.category,quantity:item.quantity,unit:item.unit,rateCents:item.rateCents,ratePath:item.ratePath,priceBasis:item.priceBasis,multipliers:item.multipliers||[]}));
      if(item.derivation)recordQuantityDerivation(out,{name:item.key+'Quantity',...item.derivation,result:item.quantity,unit:item.unit,usedBy:[item.label]});
      else recordMeasurement(out,item.key,exactToNumber(exactDecimal(item.quantity)),item.unit,'confirmed_offering_scope');
    }
    out.disclosures.push(...offeringDisclosures(serviceType,pricing,customerInputs));
    out.priceDrivers.push(serviceType.startsWith('FENCING_')
      ? `${customerInputs.linearFeet} measured linear feet of ${formatFenceHeight(customerInputs.fenceHeight)} ${customerInputs.fenceType.replaceAll('_', ' ')} fencing`
      : `${customerInputs[serviceType==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft']} measured square feet of paintable wall area`);
    out.feeScope.disposal=customerInputs.oldFenceRemoval===true;
    if(customerInputs.oldFenceRemoval&&pricing.offeringDetails.removalIncludesDisposal)out.replacedCommonFees.push('disposal');
    return finalize(out);
  }
  if (serviceType === 'ROOFING_REPLACEMENT') return finalize(calculateRoofReplacement(customerInputs, pricing, ctx));
  if (serviceType === 'ROOFING_REPAIR') return finalize(calculateRoofRepair(customerInputs, pricing, ctx));
  if (serviceType === 'FLAT_ROOF_REPLACEMENT') return finalize(calculateFlatRoofReplacement(customerInputs, pricing, ctx));
  if (serviceType === 'FLAT_ROOF_REPAIR') return finalize(calculateFlatRoofRepair(customerInputs, pricing, addonContext));
  if (serviceType === 'INTERIOR_PAINTING') return finalize(calculateInteriorPainting(customerInputs, pricing, serviceRules));
  if (serviceType === 'EXTERIOR_PAINTING') return finalize(calculateExteriorPainting(customerInputs, pricing, serviceRules));
  if (serviceType === 'FLOORING_INSTALL' || serviceType === 'FLOORING_REPLACEMENT') return finalize(calculateFlooring(serviceType, customerInputs, pricing, ctx));
  if (serviceType === 'FENCING_INSTALL' || serviceType === 'FENCING_REPLACEMENT') return finalize(calculateFencing(serviceType, customerInputs, pricing));
  if (serviceType === 'CONCRETE_DRIVEWAY' || serviceType === 'CONCRETE_PATIO_SLAB') return finalize(calculateConcrete(serviceType, customerInputs, pricing));
  if (serviceType === 'LANDSCAPING_CLEANUP') return finalize(calculateCleanup(customerInputs, pricing));
  if (serviceType === 'LANDSCAPING_MULCH') return finalize(calculateMulch(customerInputs, pricing));
  if (serviceType === 'LANDSCAPING_SOD') return finalize(calculateSod(customerInputs, pricing, ctx));
  if (serviceType === 'LANDSCAPING_PLANTING') return finalize(calculatePlanting(customerInputs, pricing));
  if (serviceType === 'LANDSCAPING_MOWING') return finalize(calculateMowing(customerInputs, pricing, addonContext));
  if (serviceType === 'SIDING_REPLACEMENT') return finalize(calculateSidingReplacement(customerInputs, pricing));
  if (serviceType === 'SIDING_REPAIR') return finalize(calculateSidingRepair(customerInputs, pricing));
  const out = baseOutput('CUSTOM');
  const quantities = {flat: 1, per_hour: customerInputs.hours, per_unit: customerInputs.itemCount, per_sqft: customerInputs.areaSqft, per_LF: customerInputs.linearFeet, per_square: customerInputs.roofSquares};
  const category = pricing.customChargeClassification;
  if (!['cost', 'sell_price'].includes(serviceRules.priceBasisByCategory?.[category])) throw new QuoteReviewError('Choose the price basis for this custom service charge category.', {missingOwnerFields: ['priceBasisByCategory.' + category]});
  let rateCents = pricing.price;
  if (pricing.customPricingMode === 'range') {
    const mid = exactDivide(exactAdd(pricing.low, pricing.high), 2);
    rateCents = exactToNumber(mid);
    if (exactCompare(rateCents, mid) !== 0) throw new QuoteReviewError('The custom range midpoint cannot be represented exactly.', {invalidOwnerFields:['low','high']});
  }
  add(out, makeLine({name: 'Custom service', category, quantity: quantities[pricing.unit], unit: pricing.unit, rateCents, ratePath: 'price',
    ...(pricing.customPricingMode === 'range' ? {lowRateCents:pricing.low, highRateCents:pricing.high} : {})}));
  recordMeasurement(out, 'customQuantity', quantities[pricing.unit], pricing.unit, pricing.unit === 'flat' ? 'one_confirmed_service' : 'customer_measured');
  out.priceDrivers.push(pricing.unit === 'flat' ? 'Confirmed fixed service' : 'Confirmed service quantity: ' + quantities[pricing.unit]);
  return finalize(out);
}


// Included prices retain the category and basis of the concrete billed
// components. An allocation across categories or bases is never inferred.
function recordNoChargeClassification(result, rules) {
  const entries=[];
  for(const line of result.lineItems){
    const components=line.calculation.evidenceVariant==='composite'?line.calculation.components:null;
    if(components)for(const component of components)entries.push({holder:component,calculation:component,path:component.ratePath,category:line.category,basis:component.priceBasis||line.priceBasis||rules.priceBasisByCategory?.[line.category]});
    else entries.push({holder:line,calculation:line.calculation,path:line.calculation.ratePath,category:line.category,basis:line.priceBasis||rules.priceBasisByCategory?.[line.category]});
  }
  for(const entry of entries){
    const {holder,calculation,path}=entry;
    if(holder.amountCents!==0)continue;
    const includedIn=rules.zeroPricePolicy?.includedPrices?.[path];
    if(calculation.quantity===0){holder.noCharge=true;holder.noChargeReason='zero_physical_scope';continue;}
    // A composite component's amountCents is rounded output, not its configured price.
    const zeroConfiguredPrice = calculation.rateCents === 0 ||
      (calculation.evidenceVariant === 'fixed_amount' && calculation.amountCents === 0);
    if(includedIn && zeroConfiguredPrice){
      const covering=entries.filter(other=>other.path===includedIn && other.holder.amountCents>0);
      if(!covering.length || covering.some(other=>other.category!==entry.category || other.basis!==entry.basis)){
        const diagnostic={path:'zeroPricePolicy.includedPrices.'+path,kind:'included_price_allocation',message:'Included pricing requires a billed covering component with the same financial category and price basis; a different category or basis needs an explicit owner allocation contract.'};
        throw new QuoteReviewError(diagnostic.message,{ownerDecisionRequired:[diagnostic],ownerDiagnostics:[{type:'owner_decision',...diagnostic}],crossFieldOwnerFields:[diagnostic.path]});
      }
      holder.noCharge=true;holder.noChargeReason='included_in_another_price';holder.includedInPricePath=includedIn;
    } else if(zeroConfiguredPrice) {
      holder.noCharge=true;holder.noChargeReason='explicitly_free';
    } else if(calculation.evidenceVariant===undefined){
      holder.noCharge=true;holder.noChargeReason='rounded_fractional_cent';
    }
  }
  for(const line of result.lineItems){
    if(line.amountCents!==0 || line.calculation.evidenceVariant!=='composite')continue;
    const components=line.calculation.components, included=[...new Set(components.map(c=>c.includedInPricePath).filter(Boolean))];
    if(included.length){line.noChargeReason='included_in_another_price';if(included.length===1)line.includedInPricePath=included[0];else line.includedInPricePaths=included;}
    else if(components.every(c=>c.noChargeReason==='zero_physical_scope'))line.noChargeReason='zero_physical_scope';
    else if(components.every(c=>c.noChargeReason==='explicitly_free'))line.noChargeReason='explicitly_free';
    else line.noChargeReason='rounded_fractional_cent';
  }
  return result;
}
