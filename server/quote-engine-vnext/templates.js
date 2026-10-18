import {FLAT_ROOF_ITEMS,repairUnitLines,repairUnitConfig,REPAIR_SERVICES} from './flatRoofRepairPricing.js';
import {cleanupDisposalPlan,optionalPricePresent} from './landscapePricing.js';
import {present,separateBase,separateSodPrep,placementFor,PLACEMENT_LABELS,controlJointLength,topsoilQuantity,customPlantSizes,plantSizeKeys,plantSizeLabel,JOINT_SITE_NOTE,JOINT_EXTRA_NOTE,PLACEMENT_SITE_NOTE,PLACEMENT_EXTRA_NOTE,TOPSOIL_SITE_NOTE} from './concreteLandscapePricing.js';
import {flooringLayoutValue,carpetRollPurchase,FLOORING_ADDONS,pricePresent,CARPET_QUANTITY_NOTE,LEVELING_UNKNOWN_NOTE} from './flooringPricing.js';
import {fixedPriceField} from '../pricePrecision.js';
import {scopeKeysForRequest,scopeBaseKey} from '../scopeConfiguration.js';
import {scopeLines,scopeRatePath,scopesSuppressPrice,purchasedQuantityVNext} from './scopePricing.js';
import {tradeAdjustment} from './tradeAdjustments.js';
import {trimComponentPricing,trimPreparationNeeded,surfaceType,surfaceCalculationInputs,coatLaborParts,requestedSurfaceExtras} from './surfacePricing.js';
import {installedPriceDefinitions,installedLaborFactorPath,repairOrDeckInstalled,installedMaterialsShare} from '../installedPriceConfiguration.js';
import { measuredOutlineVNext } from './geometry.js';
import {configuredOffering, offeringLines, offeringDisclosures, offeringRatePath, formatFenceHeight} from './configuredOfferings.js';
import {fenceType,fenceHasRows,resolvedFencePricing,qualifiedFenceRatePath,localFenceRatePath} from './fencePricing.js';
import {
  validationSnapshotVNext,
  SERVICE_TYPES,
  inspectionOwnerDecisionsVNext,
  repairSizeFromAffectedArea,
  validateCustomerInputs,
  validateOwnerPricing,
  valueAtPath,
  vinylUnderlaymentApplies,
  usesNewRoofReplacementRulesVNext
} from './contracts.js';
import {dependentLineEnabledVNext,roofFlashingVentDefinitionVNext} from './priceGroundwork.js';
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

function priceRate(value,path,{allowZero=true}={}){
 const fixed=fixedPriceField(path.split('.')[0])||/^offeringRates\.(?:gate_|(?:postMaterial|footingLabor|footingMaterial)Each$)/.test(path);
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER||!allowZero&&value===0||fixed&&!Number.isSafeInteger(value))throw new QuoteReviewError('Invalid price precision.',{invalidOwnerFields:[path]});
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
  return priceRate(value, path, { allowZero: true });
}

function addonMoney(value, path) {
  if (value === undefined || value === null || value === '') return undefined;
  return priceRate(value, path, { allowZero: true });
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
  contributingRatePaths,
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
  priceRate(rateCents,ratePath,{allowZero:allowZeroRate});
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
      ...(contributingRatePaths?{contributingRatePaths:[...contributingRatePaths]}:{}),
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
    priceRate(component.rateCents, component.ratePath);
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
  if(usesNewRoofReplacementRulesVNext(ctx.ownerPricing))return calculateRoofReplacementAdopted(c,p,ctx);
  const out = baseOutput('ROOFING_REPLACEMENT');
  const exactAreaSqft = selectedRoofArea(c);
  const areaSqft = measured(exactToNumber(exactAreaSqft), 'roof area');
  const exactRoofSquares = exactDivide(exactAreaSqft, 100);
  const roofSquares = exactToNumber(exactRoofSquares);
  const waste = quantityFactor(p.wasteFactorByComplexity[c.roofComplexity], `wasteFactorByComplexity.${c.roofComplexity}`, { allowZero: true });
  const bundlesPerSquare=p.bundlesPerSquare?.[c.replacementRoofType];
  const roofPurchase=purchasedQuantityVNext(exactRoofSquares,waste,bundlesPerSquare===undefined?undefined:exactDivide(1,bundlesPerSquare));
  const exactMaterialSquares = roofPurchase.purchasedQuantity;
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
      result: exactAreaSqft,
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
    name: 'materialSquares', formula: bundlesPerSquare===undefined?'roofSquares * (1 + wasteFactor)':'ceil(roofSquares * (1 + wasteFactor) * bundlesPerSquare) / bundlesPerSquare',
    inputs: { roofSquares, wasteFactor: waste,...(bundlesPerSquare===undefined?{}:{bundlesPerSquare}) }, result: exactMaterialSquares, unit: 'roofing squares',
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


function addUnitRepair(out,type,c,p) {
  const lines=repairUnitLines(type,c,p);if(!lines)return false;
  for(const item of lines)add(out,makeLine(item));
  recordMeasurement(out,'affectedAreaSqft',c.affectedArea,'square feet');
  const row=repairUnitConfig(type,c,p);
  if(row.unit==='square_feet')recordRuleApplication(out,{name:'areaRepairPrice',rule:'minimum covers first area; additional square feet use the extra-area price',inputs:{affectedAreaSqft:c.affectedArea,firstAreaSqft:row.firstArea},result:{unit:row.unit},usedBy:lines.map(l=>l.name)});
  else recordMeasurement(out,row.unit==='linear_feet'?'repairLengthLF':'repairItemCount',row.unit==='linear_feet'?c.repairLengthLF:c.repairItemCount,row.unit==='linear_feet'?'linear feet':'each');
  out.priceDrivers.push(`${c.affectedArea} affected square feet`,`${(c.repairType||c.damageLevel).replaceAll('_',' ')} repair`);
  return true;
}

function calculateRoofReplacementAdopted(c,p,ctx){
  const out=baseOutput('ROOFING_REPLACEMENT');
  let totalArea;
  if(c.roofSizeMethod==='footprint'){
    const surface=Math.round(c.roofSizeInput*Math.sqrt(1+(c.pitchRisePer12/12)**2)*100)/100;
    totalArea=exactDecimal(surface);
    recordQuantityDerivation(out,{name:'roofSurfaceAreaSqft',formula:'round(footprintSqft * sqrt(1 + (risePer12 / 12)^2), 0.01)',inputs:{footprintSqft:c.roofSizeInput,risePer12:c.pitchRisePer12},result:totalArea,unit:'square feet',usedBy:['roofSquares']});
  }else totalArea=exactDecimal(c.roofSizeInput);
  const exactAreaSqft=c.serviceScope==='partial'?(c.partialAreaSqft!==undefined?exactDecimal(c.partialAreaSqft):exactDivide(exactMultiply(totalArea,c.partialPercent),100)):totalArea;
  const areaSqft=measured(exactToNumber(exactAreaSqft),'roof area'),squares=exactDivide(exactAreaSqft,100),squareNumber=exactToNumber(squares);
  const waste=quantityFactor(p.wasteFactorByComplexity[c.roofComplexity],`wasteFactorByComplexity.${c.roofComplexity}`,{allowZero:true});
  const bundles=p.bundlesPerSquare?.[c.replacementRoofType],purchase=purchasedQuantityVNext(squares,waste,bundles===undefined?undefined:exactDivide(1,bundles));
  const layers=count(c.existingLayers,'existingLayers'),story=quantityFactor(p.storyMultiplier[c.stories],`storyMultiplier.${c.stories}`),complexity=quantityFactor(p.complexityLaborMultiplier[c.roofComplexity],`complexityLaborMultiplier.${c.roofComplexity}`);
  // Subtract before recording evidence: native 1.15 - 1 loses the half-cent tie.
  // Keep separate adjustment lines and the exact rational through all later pricing.
  const storyAddition=exactEvidence(exactSubtract(story,1)),complexityAddition=exactEvidence(exactSubtract(complexity,1));
  const exactTearOffSquares=exactMultiply(squares,layers);
  if(c.serviceScope==='partial'&&c.partialAreaSqft===undefined)recordQuantityDerivation(out,{
    name:'selectedRoofAreaSqft',formula:(c.roofSizeMethod==='footprint'?'roofSurfaceAreaSqft':'roofSizeInput')+' * partialPercent / 100',
    inputs:{[c.roofSizeMethod==='footprint'?'roofSurfaceAreaSqft':'roofSizeInput']:exactToNumber(totalArea),partialPercent:c.partialPercent},result:exactAreaSqft,unit:'square feet',usedBy:['roofSquares']
  });
  recordQuantityDerivation(out,{name:'roofSquares',formula:'areaSqft / 100',inputs:{areaSqft},result:squares,unit:'roofing squares',usedBy:['Roofing labor','Underlayment']});
  recordQuantityDerivation(out,{
    name:'materialSquares',formula:bundles===undefined?'roofSquares * (1 + wasteFactor)':'ceil(roofSquares * (1 + wasteFactor) * bundlesPerSquare) / bundlesPerSquare',
    inputs:{roofSquares:squareNumber,wasteFactor:waste,...(bundles===undefined?{}:{bundlesPerSquare:bundles})},result:purchase.purchasedQuantity,unit:'roofing squares',usedBy:['Field materials']
  });
  recordQuantityDerivation(out,{name:'tearOffSquares',formula:'roofSquares * existingLayers',inputs:{roofSquares:squareNumber,existingLayers:layers},result:exactTearOffSquares,unit:'existing-layer roofing squares',usedBy:['Tear-off','Roofing disposal']});
  recordRuleApplication(out,{
    name:'roofAreaSelection',rule:'full scope uses measured total area; partial measured area takes precedence when supplied; otherwise confirmed partial percent derives area',
    inputs:{serviceScope:c.serviceScope,totalAreaSqft:exactToNumber(totalArea),partialAreaSqft:c.partialAreaSqft??null,partialPercent:c.partialPercent??null},
    result:{areaSqft,source:c.serviceScope!=='partial'?'measured_total_area':c.partialAreaSqft!==undefined?'measured_partial_area':'confirmed_partial_percent'},usedBy:['roofSquares']
  });
  const laborPath=`laborPerSquare.${c.replacementRoofType}`,tearPath=`tearOffPerSquare.${c.existingRoofType}`;
  const laborRate=valueAtPath(p,laborPath),tearRate=valueAtPath(p,tearPath),disposalRate=optionalMoney(p.disposalPerSquare,'disposalPerSquare')??0;
  add(out,makeLine({name:'Roofing labor',category:'labor',quantity:squares,unit:'roofing squares',rateCents:laborRate,ratePath:laborPath,customerDriver:`Measured roof area: ${squareNumber.toFixed(2)} roofing squares`}));
  if(story!==1)add(out,makeLine({name:'Story labor adjustment',category:'labor',quantity:squares,unit:'roofing squares',rateCents:laborRate,ratePath:laborPath,multipliers:[{name:'story addition',exactValue:storyAddition,path:`storyMultiplier.${c.stories}`}]}));
  if(complexity!==1)add(out,makeLine({name:'Roof-shape labor adjustment',category:'labor',quantity:squares,unit:'roofing squares',rateCents:laborRate,ratePath:laborPath,multipliers:[{name:'complexity addition',exactValue:complexityAddition,path:`complexityLaborMultiplier.${c.roofComplexity}`}]}));
  const areas={up_to_six:0,seven_to_nine:0,ten_to_twelve:0,over_twelve:0};
  let assumed=false;
  if(c.pitchMethod==='area_by_pitch')Object.assign(areas,{up_to_six:c.pitchAreaUpTo6Sqft||0,seven_to_nine:c.pitchArea7To9Sqft||0,ten_to_twelve:c.pitchArea10To12Sqft||0,over_twelve:c.pitchAreaOver12Sqft||0});
  else {
    let band=c.pitchBand;
    if(c.pitchMethod==='not_sure'){band=p.unknownPitchBand;if(!band)throw new QuoteReviewError('Choose the owner\'s "not sure" pitch band before quoting an unknown roof pitch.',{missingOwnerFields:['unknownPitchBand']});assumed=true;}
    areas[band]=areaSqft;
  }
  const installFactors={seven_to_nine:p.pitchInstallationAdder?.seven_to_nine,ten_to_twelve:p.pitchInstallationAdder?.ten_to_twelve,over_twelve:p.pitchInstallationAdderOverTwelve};
  const removalFactors={seven_to_nine:p.pitchRemovalAdder?.seven_to_nine,ten_to_twelve:p.pitchRemovalAdder?.ten_to_twelve,over_twelve:p.pitchRemovalAdderOverTwelve};
  // These adopted additions accept explicit numeric zero. Opt in only on those
  // multipliers; preserve missing/invalid rejection and positive-factor evidence.
  for(const band of ['seven_to_nine','ten_to_twelve','over_twelve'])if(areas[band]>0){
    if(installFactors[band]===undefined||removalFactors[band]===undefined)throw new QuoteReviewError('The owner has not priced the '+(band==='over_twelve'?'over 12/12':band.replaceAll('_','-'))+' roof-pitch band.',{missingOwnerFields:[installFactors[band]===undefined?'pitchInstallationAdderOverTwelve':'pitchRemovalAdderOverTwelve']});
    const q=exactDivide(areas[band],100),installPath=band==='over_twelve'?'pitchInstallationAdderOverTwelve':'pitchInstallationAdder.'+band,removePath=band==='over_twelve'?'pitchRemovalAdderOverTwelve':'pitchRemovalAdder.'+band;
    add(out,makeLine({name:'Steep-pitch installation',category:'labor',quantity:q,unit:'roofing squares at '+band.replaceAll('_','-'),rateCents:laborRate,ratePath:laborPath,multipliers:[{name:'pitch addition',value:installFactors[band],path:installPath,...(installFactors[band]===0?{allowZero:true}:{})}]}));
    add(out,makeLine({name:'Steep-pitch removal',category:'removal',quantity:q,unit:'roofing squares at '+band.replaceAll('_','-'),rateCents:exactToNumber(exactAdd(tearRate,disposalRate)),ratePath:tearPath,contributingRatePaths:disposalRate?['disposalPerSquare']:[],multipliers:[{name:'pitch removal addition',value:removalFactors[band],path:removePath,...(removalFactors[band]===0?{allowZero:true}:{})}]}));
  }
  if(assumed)out.priceDrivers.push('The owner-selected pitch band was used because the roof pitch was not known; the business will confirm the pitch on site.');
  add(out,makeLine({name:'Field materials',category:'material',quantity:purchase.purchasedQuantity,unit:'waste-adjusted roofing squares',rateCents:valueAtPath(p,`materialCostPerSquare.${c.replacementRoofType}`),ratePath:`materialCostPerSquare.${c.replacementRoofType}`}));
  add(out,makeLine({name:'Tear-off',category:'removal',quantity:squares,unit:'first-layer roofing squares',rateCents:tearRate,ratePath:tearPath}));
  if(layers>1)add(out,makeLine({name:'Additional-layer tear-off',category:'removal',quantity:exactMultiply(squares,layers-1),unit:'additional-layer roofing squares',rateCents:tearRate,ratePath:tearPath,multipliers:[{name:'additional layer removal factor',value:p.additionalLayerRemovalFactor,path:'additionalLayerRemovalFactor',...(p.additionalLayerRemovalFactor===0?{allowZero:true}:{})}]}));
  if(story!==1){
    add(out,makeLine({name:'Story tear-off adjustment',category:'removal',quantity:squares,unit:'first-layer roofing squares',rateCents:tearRate,ratePath:tearPath,multipliers:[{name:'story addition',exactValue:storyAddition,path:`storyMultiplier.${c.stories}`}]}));
    if(layers>1)add(out,makeLine({name:'Additional-layer story adjustment',category:'removal',quantity:exactMultiply(squares,layers-1),unit:'additional-layer roofing squares',rateCents:tearRate,ratePath:tearPath,multipliers:[{name:'additional layer removal factor',value:p.additionalLayerRemovalFactor,path:'additionalLayerRemovalFactor',...(p.additionalLayerRemovalFactor===0?{allowZero:true}:{})},{name:'story addition',exactValue:storyAddition,path:`storyMultiplier.${c.stories}`}]}));
  }
  const underPath=`underlaymentPerSquare.${c.replacementRoofType}`;
  if(!p.scopeDetails?.['roof_underlayment_'+c.replacementRoofType]||p.underlaymentPriceBasis?.[c.replacementRoofType]!=='cost')add(out,makeLine({name:'Underlayment',category:'material',quantity:squares,unit:'measured installed roofing squares',rateCents:valueAtPath(p,underPath),ratePath:underPath,priceBasis:installedAreaSellPriceBasis(valueAtPath(p,`underlaymentPriceBasis.${c.replacementRoofType}`),`underlaymentPriceBasis.${c.replacementRoofType}`)}));
  if(p.accessoryPricingMode==='itemized')for(const [name,inputField,priceField] of [['Starter strip','starterLengthLF','starterPerLF'],['Drip edge','dripEdgeLengthLF','dripEdgePerLF'],['Hip-and-ridge cap','ridgeCapLengthLF','ridgeCapPerLF']])if(c[inputField]>0)add(out,makeLine({name,category:'material',quantity:c[inputField],unit:'measured linear feet',rateCents:p[priceField],ratePath:priceField}));
  const dependent=roofFlashingVentDefinitionVNext(c.replacementRoofType);
  if(dependentLineEnabledVNext(ctx.ownerPricing,dependent)){
    const optional=[
      ['Ice and water barrier',p.iceWaterBarrierUnit==='square_feet'?'iceWaterBarrierSqft':'iceWaterBarrierLengthLF',p.iceWaterBarrierUnit==='square_feet'?'iceWaterBarrierPerSqft':'iceWaterBarrierPerLF',p.iceWaterBarrierUnit==='square_feet'?'square feet':'linear feet'],
      ['Valley preparation','valleyLengthLF','valleyPerLF','linear feet'],['Step flashing','stepFlashingLengthLF','stepFlashingPerLF','linear feet'],['Pipe jacks','pipeJackCount','pipeJackEach','each'],['Ridge vent','ridgeVentLengthLF','ridgeVentPerLF','linear feet']
    ];
    for(const [name,input,rate,unit] of optional)if(c[input]!==undefined&&c[input]>0)add(out,makeLine({name,category:'material',quantity:c[input],unit,rateCents:p[rate],ratePath:rate}));
  }
  const deckingUnitPrice=optionalMoney(p.deckingPerSheet,'deckingPerSheet');
  if(deckingUnitPrice!==undefined){
    out.priceDrivers.push('Any additional decking is priced per sheet and confirmed on site.');
    if(c.deckingSheets!==undefined)out.priceDrivers.push(c.deckingSheets>0?`${c.deckingSheets} decking sheet${c.deckingSheets===1?'':'s'} included`:'No decking replacement is included in the confirmed scope.');
  }
  if(c.deckingSheets!==undefined){
    recordMeasurement(out,'deckingSheets',c.deckingSheets,'confirmed sheets');
    if(c.deckingSheets>0||deckingUnitPrice!==undefined)add(out,makeLine({name:'Decking replacement',category:'material',quantity:c.deckingSheets,allowZeroQuantity:true,unit:'confirmed sheets',rateCents:deckingUnitPrice,ratePath:'deckingPerSheet',...(c.deckingSheets>0?{customerDriver:`${c.deckingSheets} decking sheet${c.deckingSheets===1?'':'s'} included`}:{})}));
  }
  out.feeScope.disposal=layers>0;
  if(disposalRate||p.disposalPerSquare===0)addDisposalOverride(out,p,'disposalPerSquare',exactTearOffSquares,'existing-layer roofing squares','Roofing disposal');
  recordMeasurement(out,'roofAreaSqft',areaSqft,'square feet');recordMeasurement(out,'existingLayers',layers,'layers');
  out.priceDrivers.push(`Measured roof area: ${squareNumber.toFixed(2)} roofing squares`,`${layers} existing layer${layers===1?'':'s'}`);
  return out;
}

function calculateRoofRepair(c, p) {
  const out = baseOutput('ROOFING_REPAIR');
  if(addUnitRepair(out,'ROOFING_REPAIR',c,p))return out;
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
  add(out, makeLine({ name: 'Tear-off', category: 'removal', quantity: exactTearOffAreaSqft, unit: 'existing-layer square feet', rateCents: valueAtPath(p, `tearOffPerSqft.${c.membraneType}`), ratePath: `tearOffPerSqft.${c.membraneType}`, multipliers: [{ name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }], customerDriver: `${layers} existing membrane layer${layers === 1 ? '' : 's'}` }));
  out.feeScope.disposal = true;
  addDisposalOverride(out, p, 'disposalPerSqft', exactTearOffAreaSqft, 'existing-layer square feet', 'Flat-roof disposal');
  recordMeasurement(out, 'roofAreaSqft', areaSqft, 'square feet');
  recordMeasurement(out, 'existingLayers', layers, 'layers', 'customer_measured');
  for(const item of FLAT_ROOF_ITEMS)if(c[item.field]>0){
    const materialOnly=item.field==='deckSheets'&&p.flatRoofDeckPriceBasis!=='installed';
    add(out,makeLine({name:item.label,category:materialOnly?'material':'addon',priceBasis:'sell_price',quantity:c[item.field],unit:item.unit,rateCents:p[item.rate],ratePath:item.rate}));
    recordMeasurement(out,item.field,c[item.field],item.unit);
  }
  out.priceDrivers.push(`Measured flat-roof area: ${areaSqft} square feet`, `${layers} existing membrane layer${layers === 1 ? '' : 's'}`);
  return out;
}

function calculateFlatRoofRepair(c, p, ctx) {
  const out = baseOutput('FLAT_ROOF_REPAIR');
  if(addUnitRepair(out,'FLAT_ROOF_REPAIR',c,p)){
    if(c.pondingWater){const rate=addonMoney(p.pondingWaterSurcharge,'pondingWaterSurcharge');if(rate===undefined)ctx.skipAddon('Ponding water surcharge');else add(out,fixedLine('Ponding water surcharge','addon',rate,'pondingWaterSurcharge',undefined,{allowZero:true}));}
    return out;
  }
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
  const labor=(name,area,n,rate,path,ratio,multipliers=[])=>{
    for(const part of coatLaborParts(area,n,p.paintingSettings?.[ratio],'paintingSettings.'+ratio))add(out,makeLine({name:name+part.suffix,category:'labor',quantity:part.quantity,unit:'measured surface-unit coats',rateCents:rate,ratePath:path,multipliers:[...part.multipliers,...multipliers]}));
  };
  const groups=c._surfaceGeometry?.groups||[{area:wallArea,ceiling:c.ceilingAreaSqft,height:c.wallHeight}];
  for(const group of groups)labor('Wall labor',group.area,coats,p.laborPerWallSqftPerCoat,'laborPerWallSqftPerCoat','wallAdditionalCoatRatio',[{name:'wall height labor',value:p.wallHeightLaborMultiplier[group.height],path:'wallHeightLaborMultiplier.'+group.height}]);
  const paintArea=c._surfaceGeometry?.paint??wallArea;
  if(!scopesSuppressPrice('INTERIOR_PAINTING',c,p,rules,'materialPerWallSqftPerCoat')) add(out, makeLine({ name: 'Wall paint and materials', category: 'material', quantity: exactMultiply(paintArea,coats),allowZeroQuantity:true, unit: 'measured wall square-foot coats', rateCents: p.materialPerWallSqftPerCoat, ratePath: 'materialPerWallSqftPerCoat', customerDriver: `${coats} paint coat${coats === 1 ? '' : 's'}` }));
  const primer=(prefix,paint,n,ratio)=>{
    if(!(n>0))return;
    for(const group of groups)labor(prefix==='primer'?'Wall primer labor':'Ceiling primer labor',prefix==='primer'?group.area:group.ceiling,n,p.paintingRates?.[prefix+'LaborPerSqftPerCoat'],'paintingRates.'+prefix+'LaborPerSqftPerCoat',ratio,[{name:'wall height labor',value:p.wallHeightLaborMultiplier[group.height],path:'wallHeightLaborMultiplier.'+group.height}]);
    if(!scopesSuppressPrice('INTERIOR_PAINTING',c,p,rules,'paintingRates.'+prefix+'MaterialPerSqftPerCoat'))add(out,makeLine({name:prefix==='primer'?'Wall primer materials':'Ceiling primer materials',category:'material',quantity:exactMultiply(paint,n),allowZeroQuantity:true,unit:'square-foot primer coats',rateCents:p.paintingRates?.[prefix+'MaterialPerSqftPerCoat'],ratePath:'paintingRates.'+prefix+'MaterialPerSqftPerCoat'}));
  };
  primer('primer',paintArea,p.paintingSettings?.primerCoats,'primerAdditionalCoatRatio');

  if (c.ceilingsIncluded) {
    const ceilingArea = measured(c.ceilingAreaSqft, 'ceilingAreaSqft');
    const exactCeilingCoatSqft = exactMultiply(c._surfaceGeometry?.ceiling??ceilingArea, c.ceilingCoats);
    const ceilingCoatSqft = exactToNumber(exactCeilingCoatSqft);
    recordQuantityDerivation(out, {
      name: 'ceilingCoatSqft', formula: 'ceilingAreaSqft * ceilingCoats',
      inputs: { ceilingAreaSqft: ceilingArea, ceilingCoats: c.ceilingCoats },
      result: exactCeilingCoatSqft, unit: 'ceiling square-foot coats',
      usedBy: ['Ceiling labor', 'Ceiling materials']
    });
    for(const group of groups)labor('Ceiling labor',group.ceiling,c.ceilingCoats,p.ceilingLaborPerSqftPerCoat,'ceilingLaborPerSqftPerCoat','ceilingAdditionalCoatRatio',[{name:'wall height labor',value:p.wallHeightLaborMultiplier[group.height],path:'wallHeightLaborMultiplier.'+group.height}]);
    if(!scopesSuppressPrice('INTERIOR_PAINTING',c,p,rules,'ceilingMaterialPerSqftPerCoat')) add(out, makeLine({ name: 'Ceiling materials', category: 'material', quantity: exactCeilingCoatSqft, unit: 'measured ceiling square-foot coats', rateCents: p.ceilingMaterialPerSqftPerCoat, ratePath: 'ceilingMaterialPerSqftPerCoat' }));
    recordMeasurement(out, 'ceilingAreaSqft', ceilingArea, 'square feet');
    primer('ceilingPrimer',c._surfaceGeometry?.ceiling??ceilingArea,p.paintingSettings?.ceilingPrimerCoats,'ceilingPrimerAdditionalCoatRatio');
  }
  if (c.trimIncluded) {
    const trim = measured(c.trimLengthLF, 'trimLengthLF');
    const component=trimComponentPricing(p),laborPath=component?'paintingRates.trimLaborPerLFPerCoat':'trimLaborPerLF',materialPath=component?'paintingRates.trimMaterialPerLFPerCoat':'trimMaterialPerLF';
    labor('Trim labor',trim,c.trimCoats??1,component?p.paintingRates.trimLaborPerLFPerCoat:p.trimLaborPerLF,laborPath,'trimAdditionalCoatRatio');
    if(!scopesSuppressPrice('INTERIOR_PAINTING',c,p,rules,materialPath)) add(out, makeLine({ name: 'Trim materials', category: 'material', quantity: exactMultiply(trim,c.trimCoats??1), unit: 'measured linear-foot coats', rateCents: component?p.paintingRates.trimMaterialPerLFPerCoat:p.trimMaterialPerLF, ratePath: materialPath, customerDriver: `${trim} measured linear feet of trim materials` }));
    if(trimPreparationNeeded(c,p))for(const category of ['Labor','Material']){
      const key='trimPrep'+category+'PerLF_'+c.trimSurfaceCondition;
      if(category==='Labor'||!scopesSuppressPrice('INTERIOR_PAINTING',c,p,rules,'paintingRates.'+key))add(out,makeLine({name:'Trim preparation '+category.toLowerCase(),category:category==='Labor'?'prep':'material',quantity:trim,unit:'linear feet',rateCents:p.paintingRates?.[key],ratePath:'paintingRates.'+key}));
    }
    if(p.paintingSettings?.trimPrimerCoats>0){
      labor('Trim primer labor',trim,p.paintingSettings.trimPrimerCoats,p.paintingRates?.trimPrimerLaborPerLFPerCoat,'paintingRates.trimPrimerLaborPerLFPerCoat','trimPrimerAdditionalCoatRatio');
      if(!scopesSuppressPrice('INTERIOR_PAINTING',c,p,rules,'paintingRates.trimPrimerMaterialPerLFPerCoat'))add(out,makeLine({name:'Trim primer materials',category:'material',quantity:exactMultiply(trim,p.paintingSettings.trimPrimerCoats),unit:'linear-foot primer coats',rateCents:p.paintingRates?.trimPrimerMaterialPerLFPerCoat,ratePath:'paintingRates.trimPrimerMaterialPerLFPerCoat'}));
    }
    recordMeasurement(out, 'trimLengthLF', trim, 'linear feet');
  }
  recordMeasurement(out, 'wallAreaSqft', wallArea, 'square feet');
  recordMeasurement(out, 'appliedFinishCoats', coats, 'coats', 'customer_confirmed');
  out.priceDrivers.push(`${wallArea} measured square feet of paintable wall area`, `${coats} paint coat${coats === 1 ? '' : 's'}`);
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
  const roomBand = exactCompare(exactAverageRoom, thresholds.smallMaxSqft) <= 0 ? 'small' : exactCompare(exactAverageRoom, thresholds.mediumMaxSqft) <= 0 ? 'medium' : 'large';
  const roomMultiplier = quantityFactor(p.roomComplexityMultiplier[roomBand], `roomComplexityMultiplier.${roomBand}`);
  let laborEquivalentSqft=exactMultiply(sqft,roomMultiplier),laborFactorBand=roomBand;
  for(const [limit,band] of [[thresholds.smallMaxSqft,'small'],[thresholds.mediumMaxSqft,'medium']])if(exactCompare(exactAverageRoom,limit)>0){
    const candidate=exactMultiply(roomCount,limit,quantityFactor(p.roomComplexityMultiplier[band],`roomComplexityMultiplier.${band}`));
    if(exactCompare(candidate,laborEquivalentSqft)>0){laborEquivalentSqft=candidate;laborFactorBand=band;}
  }
  const exactRoomLaborFactor=exactDivide(laborEquivalentSqft,sqft);
  const productWasteFactor = quantityFactor(p.wasteFactorByType[c.newFlooringType], `wasteFactorByType.${c.newFlooringType}`, { allowZero: true });
  const patternMode=ctx.ownerPricing?.startingValueAdoptions?.flooring_patterns_20261017?.mode;
  if(['new','adopted'].includes(patternMode)&&c.newFlooringType==='tile'&&c.layoutPattern==='herringbone_or_chevron'&&p.herringboneLaborMultiplierByType?.tile===undefined)throw new QuoteReviewError('Enter your tile herringbone or chevron labor adjustment.',{missingOwnerFields:['herringboneLaborMultiplierByType.tile']});
  const patternLabor=flooringLayoutValue(c,p,'labor');
  recordQuantityDerivation(out,{name:'flooringPatternLaborAdjustment',formula:'selected owner pattern labor adjustment',inputs:{factorPath:patternLabor.path},result:patternLabor.value,unit:'multiplier',usedBy:['Flooring labor']});
  const patternWaste=flooringLayoutValue(c,p,'waste');
  const patternWasteAdder = quantityFactor(patternWaste.value,patternWaste.path, { allowZero: true });
  const exactWaste = exactAdd(productWasteFactor, patternWasteAdder);
  const waste = exactToNumber(exactWaste);
  const cartonCoverage=c.newFlooringType==='carpet'?undefined:p.cartonCoverageSqft?.[c.newFlooringType];
  let carpetPurchase=null;
  if(c.newFlooringType==='carpet'&&c.carpetRooms!==undefined){
    try{carpetPurchase=carpetRollPurchase(c,p);}catch(error){throw new QuoteReviewError(error.message,error.flooringOwnerField?{missingOwnerFields:[error.flooringOwnerField]}:{invalidCustomerFields:[error.flooringField||'carpetRooms']});}
  }
  const flooringPurchase=carpetPurchase||purchasedQuantityVNext(sqft,exactWaste,cartonCoverage);
  const exactMaterialSqft = flooringPurchase.purchasedQuantity;
  const materialSqft = exactToNumber(exactMaterialSqft);
  recordQuantityDerivation(out, {
    name: 'averageRoomSqft', formula: 'floorAreaSqft / roomCount',
    inputs: { floorAreaSqft: sqft, roomCount },
    result: exactAverageRoom, unit: 'square feet',
    usedBy: ['average-room complexity rule']
  });
  recordQuantityDerivation(out, {
    name: 'flooringMaterialSqft', formula: carpetPurchase?'sum(pieces * rollWidthFt * cutLengthFt); cutLengthFt = along-room dimension + 0.5 ft trim + repeat; least common direction per connected area':cartonCoverage===undefined?'floorAreaSqft * (1 + productWasteFactor + patternWasteAdder)':'ceil(floorAreaSqft * (1 + productWasteFactor + patternWasteAdder) / cartonCoverageSqft) * cartonCoverageSqft',
    inputs: carpetPurchase?{floorAreaSqft:sqft,rollWidthFt:carpetPurchase.rollWidthFt,repeatFt:carpetPurchase.repeatFt,cuts:carpetPurchase.cuts,connectedAreaDirections:carpetPurchase.areaChoices}:{ floorAreaSqft: sqft, productWasteFactor, patternWasteAdder,...(cartonCoverage===undefined?{}:{cartonCoverageSqft:cartonCoverage}) },
    result: exactMaterialSqft, unit: 'square feet',
    usedBy: ['Flooring materials']
  });
  recordQuantityDerivation(out,{name:'flooringPatternWasteAddition',formula:'selected owner pattern waste addition',inputs:{factorPath:patternWaste.path},result:patternWasteAdder,unit:'decimal fraction',usedBy:['Flooring materials']});
  recordRuleApplication(out, {
    name: 'averageRoomComplexityBand',
    rule: 'averageRoomSqft <= smallMaxSqft => small; averageRoomSqft <= mediumMaxSqft => medium; otherwise large',
    inputs: { averageRoomSqft: averageRoom, smallMaxSqft: thresholds.smallMaxSqft, mediumMaxSqft: thresholds.mediumMaxSqft },
    result: roomBand,
    usedBy: ['Flooring labor']
  });
  recordQuantityDerivation(out,{name:'roomSizeAdjustedLaborArea',formula:'max(floor area * room factor, rooms * each passed limit * its smaller-room factor)',inputs:{floorAreaSqft:sqft,roomCount,roomFactorPath:`roomComplexityMultiplier.${laborFactorBand}`,smallLimit:thresholds.smallMaxSqft,mediumLimit:thresholds.mediumMaxSqft},result:laborEquivalentSqft,unit:'labor-equivalent square feet',usedBy:['Flooring labor']});
  add(out, makeLine({ name: 'Flooring labor', category: 'labor', quantity: sqft, unit: 'measured square feet', rateCents: valueAtPath(p, `laborPerSqft.${c.newFlooringType}`), ratePath: `laborPerSqft.${c.newFlooringType}`, multipliers: [{ name: 'average-room complexity with boundary labor floor', value: exactToNumber(exactRoomLaborFactor),exactValue:exactEvidence(exactRoomLaborFactor), path: `roomComplexityMultiplier.${laborFactorBand}` }], customerDriver: `${sqft} measured square feet` }));
  add(out, makeLine({ name: 'Flooring materials', category: 'material', quantity: exactMaterialSqft, unit: carpetPurchase?'purchased carpet square feet':'waste-adjusted square feet', rateCents: valueAtPath(p, `materialPerSqft.${c.newFlooringType}`), ratePath: `materialPerSqft.${c.newFlooringType}`, customerDriver: `Flooring type: ${c.newFlooringType.replaceAll('_', ' ')}` }));
  if(c.newFlooringType==='carpet')out.disclosures.push(CARPET_QUANTITY_NOTE);
  for(const addon of FLOORING_ADDONS){
    if(addon.rate==='floorLevelingPerSqft'&&serviceType!=='FLOORING_INSTALL')continue;
    let quantity=c[addon.input];
    if(addon.rate==='furnitureMovingPrice'&&p.furnitureMovingPriceUnit==='flat')quantity=c.furnitureMovingNeeded?1:0;
    if(addon.rate==='floorLevelingPerSqft'){
      if(!c.floorLevelingNeeded)continue;
      if(quantity==='unknown'){ctx.skipAddon(addon.label);out.disclosures.push(LEVELING_UNKNOWN_NOTE);continue;}
    }
    if(!(typeof quantity==='number'&&quantity>0))continue;
    if(!pricePresent(p[addon.rate])){ctx.skipAddon(addon.label);continue;}
    add(out,makeLine({name:addon.label,category:addon.category,quantity,unit:addon.rate==='furnitureMovingPrice'&&p.furnitureMovingPriceUnit==='flat'?'job':addon.unit,rateCents:p[addon.rate],ratePath:addon.rate,...(addon.installed?{priceBasis:'sell_price'}:{})}));
  }
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
  const exactInstalledYards=exactDivide(exactMultiply(dimensions.exactAreaSqft, thickness),324);
  const concretePurchase=purchasedQuantityVNext(exactInstalledYards,waste,p.readyMixOrderIncrementCubicYards);
  const exactYards = concretePurchase.purchasedQuantity;
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
    name: 'concreteVolumeCubicYards', formula: p.readyMixOrderIncrementCubicYards===undefined?'areaSqft * (thicknessInches / 12) / 27 * (1 + concreteWasteFactor)':'ceil((areaSqft * (thicknessInches / 12) / 27 * (1 + concreteWasteFactor)) / readyMixOrderIncrementCubicYards) * readyMixOrderIncrementCubicYards',
    inputs: { areaSqft: dimensions.areaSqft, thicknessInches: thickness, concreteWasteFactor: waste,...(p.readyMixOrderIncrementCubicYards===undefined?{}:{readyMixOrderIncrementCubicYards:p.readyMixOrderIncrementCubicYards}) },
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
  if((present(p.shortLoadPerYard)||present(p.shortLoadFlatFee))&&exactCompare(exactYards,p.shortLoadThresholdCubicYards)<0){
    const short=exactSubtract(p.shortLoadThresholdCubicYards,exactYards);
    recordQuantityDerivation(out,{name:'shortLoadMissingYards',formula:'shortLoadThresholdCubicYards - orderedConcreteYards',inputs:{shortLoadThresholdCubicYards:p.shortLoadThresholdCubicYards,orderedConcreteYards:yards},result:short,unit:'cubic yards',usedBy:['Supplier short-load charge']});
    add(out,present(p.shortLoadFlatFee)?fixedLine('Supplier short-load charge','material',p.shortLoadFlatFee,'shortLoadFlatFee'):makeLine({name:'Supplier short-load charge',category:'material',quantity:short,unit:'cubic yards short of supplier threshold',rateCents:p.shortLoadPerYard,ratePath:'shortLoadPerYard'}));
  }
  if(p.controlJointPricing==='excluded'){
    if(present(p.sawCutPerLF)){
      const joints=controlJointLength(c,dimensions.exactAreaSqft,p.controlJointSpacingFt);
      recordQuantityDerivation(out,{name:'controlJointLengthLF',formula:joints.rectangle?'(ceil(length / spacing) - 1) * width + (ceil(width / spacing) - 1) * length':'roundTo0.01((ceil(sqrt(areaSqft) / spacing) - 1) * sqrt(areaSqft) * 2)',inputs:{areaSqft:dimensions.areaSqft,length:joints.length,width:joints.width,spacing:p.controlJointSpacingFt},result:joints.quantity,unit:'linear feet',usedBy:['Saw-cut control joints']});
      if(exactCompare(joints.quantity,0)>0)add(out,makeLine({name:'Saw-cut control joints',category:'labor',quantity:joints.quantity,unit:'linear feet',rateCents:p.sawCutPerLF,ratePath:'sawCutPerLF',multipliers:[{name:'access',value:access,path:`accessMultiplier.${c.accessDifficulty}`}]}));
      if(!joints.rectangle)out.disclosures.push(`Control-joint length allowance: ${exactToNumber(joints.quantity).toFixed(2)} linear feet. ${JOINT_SITE_NOTE}`);
    }else out.disclosures.push(JOINT_EXTRA_NOTE);
  }
  const placement=placementFor(c,p);
  if(placement){
    if(present(p.placementFlat?.[placement]))add(out,fixedLine(`${PLACEMENT_LABELS[placement]} placement per pour`,'addon',p.placementFlat[placement],`placementFlat.${placement}`));
    if(present(p.placementPerCubicYard?.[placement]))add(out,makeLine({name:`${PLACEMENT_LABELS[placement]} placement by volume`,category:'addon',quantity:exactYards,unit:'cubic yards ordered',rateCents:p.placementPerCubicYard[placement],ratePath:`placementPerCubicYard.${placement}`}));
    if(c.chuteAccess==='unknown')out.disclosures.push(PLACEMENT_SITE_NOTE);
  }else if(c.chuteAccess==='unknown')out.disclosures.push(PLACEMENT_EXTRA_NOTE);
  const openEdges=exactSubtract(dimensions.exactPerimeterLF,c.adjoinsExistingConcrete?c.adjoiningEdgeLF:0);
  recordQuantityDerivation(out,{name:'formworkLF',formula:'measured perimeter minus edges adjoining foundation or existing concrete',inputs:{perimeterLF:dimensions.perimeterLF,adjoiningEdgeLF:c.adjoinsExistingConcrete?c.adjoiningEdgeLF:0},result:openEdges,unit:'linear feet',usedBy:['Formwork']});
  add(out, makeLine({ name: 'Formwork', category: 'material', quantity: openEdges, allowZeroQuantity:true, unit: 'measured linear feet', rateCents: p.formworkPerLF, ratePath: 'formworkPerLF', customerDriver: `${exactToNumber(openEdges)} measured linear feet of formwork` }));
  if (c.baseNeeded) {
    if(!separateBase(p))add(out, makeLine({ name: 'Base preparation', category: 'prep', quantity: dimensions.exactAreaSqft, unit: 'measured square feet', rateCents: p.basePrepPerSqft, ratePath: 'basePrepPerSqft' }));
    else {
      const included=[],excluded=[];
      for(const [field,component] of [['baseGravelPerCubicYard','base gravel material'],['baseExcavationGradingPerSqft','base excavation and grading labor']]){
        (present(p[field])?included:excluded).push(component);
      }
      if(included.length)out.disclosures.push(`Included base preparation: ${included.join(', ')}.`);
      if(excluded.length)out.disclosures.push(`Excluded base preparation: ${excluded.join(', ')}. Any required excluded work needs a separate on-site estimate.`);
      if(present(p.baseGravelPerCubicYard)){
        out.disclosures.push(`Base gravel material quantity assumes ${p.baseDepthInches} inches of compacted base depth.`);
        const gravel=exactMultiply(exactDivide(exactMultiply(dimensions.exactAreaSqft,p.baseDepthInches),324),exactAdd(1,p.baseCompactionAllowance));
        recordQuantityDerivation(out,{name:'baseGravelCubicYards',formula:'areaSqft * baseDepthInches / 324 * (1 + baseCompactionAllowance)',inputs:{areaSqft:dimensions.areaSqft,baseDepthInches:p.baseDepthInches,baseCompactionAllowance:p.baseCompactionAllowance},result:gravel,unit:'cubic yards',usedBy:['Base gravel']});
        add(out,makeLine({name:'Base gravel',category:'material',quantity:gravel,unit:'cubic yards',rateCents:p.baseGravelPerCubicYard,ratePath:'baseGravelPerCubicYard'}));
      }
      if(present(p.baseExcavationGradingPerSqft))add(out,makeLine({name:'Base excavation and grading',category:'labor',quantity:dimensions.exactAreaSqft,unit:'square feet',rateCents:p.baseExcavationGradingPerSqft,ratePath:'baseExcavationGradingPerSqft',multipliers:[{name:'access',value:access,path:`accessMultiplier.${c.accessDifficulty}`}]}));
    }
  }
  if (c.reinforcement === 'wire_mesh') add(out, makeLine({ name: 'Wire mesh reinforcement', category: 'material', quantity: dimensions.exactAreaSqft, unit: 'measured square feet', rateCents: p.wireReinforcementPerSqft, ratePath: 'wireReinforcementPerSqft' }));
  if (c.reinforcement === 'rebar') add(out, makeLine({ name: 'Rebar reinforcement', category: 'material', quantity: dimensions.exactAreaSqft, unit: 'measured square feet', rateCents: p.rebarReinforcementPerSqft, ratePath: 'rebarReinforcementPerSqft' }));
  if (c.finishType === 'stamped') add(out, makeLine({ name: 'Stamped finish materials', category: 'material', quantity: dimensions.exactAreaSqft, unit: 'measured square feet', rateCents: p.stampedMaterialPerSqft, ratePath: 'stampedMaterialPerSqft' }));
  out.feeScope.disposal = c.demolitionNeeded;
  if (c.demolitionNeeded && !p.scopeDetails?.[scopeKeysForRequest(serviceType,c,p).find(k=>scopeBaseKey(k)==='demolition')]?.disposalIncluded) addDisposalOverride(out, p, 'disposalPerSqft', c.demolitionAreaSqft, 'measured demolition square feet', 'Concrete disposal');
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
  const plan=cleanupDisposalPlan(c,p),minimum=money(debris.disposalFlat,`debrisPricing.${c.debrisLevel}.disposalFlat`);
  let disposal=fixedLine('Debris disposal','disposal',minimum,`debrisPricing.${c.debrisLevel}.disposalFlat`,undefined,{allowZero:true});
  if(plan.mode!=='flat'){
    let quantity=plan.quantity;
    if(plan.mode==='area'){
      const coverage=quantityFactor(debris.sqftPerLoad,plan.coveragePath),ratio=exactDecimal(exactDivide(area,coverage));
      quantity=Number((ratio.numerator+ratio.denominator-1n)/ratio.denominator);
      out.disclosures.push('The load count is estimated from yard size and will be confirmed on site.');
    }
    if(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<0||(plan.mode!=='loads'&&!Number.isSafeInteger(quantity)))throw new QuoteReviewError('Cleanup disposal quantity is unsafe.',plan.mode==='area'?{invalidOwnerFields:[plan.coveragePath]}:{invalidCustomerFields:[plan.mode==='bags'?'wasteBags':'wasteLoads']});
    const rate=money(p[plan.ratePath],plan.ratePath),amount=exactRound(exactMultiply(quantity,rate));
    if(amount>=minimum&&quantity>0)disposal=makeLine({name:'Debris disposal',category:'disposal',quantity,unit:plan.mode==='bags'?'bags':'pickup-truck loads',rateCents:rate,ratePath:plan.ratePath});
    recordQuantityDerivation(out,{name:'Cleanup disposal quantity',formula:plan.mode==='area'?'ceil(cleanup area / square feet per load)':'customer stated quantity',inputs:{mode:plan.mode,yardSqft:area,...(plan.coveragePath?{sqftPerLoad:debris.sqftPerLoad}:{}),minimumDisposalCents:minimum,ratePath:plan.ratePath},result:quantity,unit:plan.mode==='bags'?'bags':'pickup-truck loads',usedBy:['Debris disposal']});
  }
  add(out,disposal);
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
  const mulchIncrement=p.mulchOrderIncrementCubicYards?.[c.mulchType];
  const mulchPurchase=purchasedQuantityVNext(exactYards,exactSubtract(overage,1),mulchIncrement);
  const exactOrderYards = mulchPurchase.purchasedQuantity;
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
    name: 'mulchOrderYards', formula: mulchIncrement===undefined?'installedMulchYards * mulchOverageFactor':'ceil(installedMulchYards * mulchOverageFactor / orderIncrementCubicYards) * orderIncrementCubicYards',
    inputs: { installedMulchYards: yards, mulchOverageFactor: overage,...(mulchIncrement===undefined?{}:{orderIncrementCubicYards:mulchIncrement}) },
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
  const sodPurchase=purchasedQuantityVNext(sqft,waste,p.sodPalletSizeSqft);
  const exactSodOrderSqft = sodPurchase.purchasedQuantity;
  const sodOrderSqft = exactToNumber(exactSodOrderSqft);
  recordQuantityDerivation(out, {
    name: 'sodOrderSqft', formula: p.sodPalletSizeSqft===undefined?'sodAreaSqft * (1 + sodWasteFactor)':'ceil(sodAreaSqft * (1 + sodWasteFactor) / palletSizeSqft) * palletSizeSqft',
    inputs: { sodAreaSqft: sqft, sodWasteFactor: waste,...(p.sodPalletSizeSqft===undefined?{}:{palletSizeSqft:p.sodPalletSizeSqft}) },
    result: exactSodOrderSqft, unit: 'square feet',
    usedBy: ['Sod material']
  });
  add(out, makeLine({ name: 'Sod material', category: 'material', quantity: exactSodOrderSqft, unit: 'waste-adjusted square feet', rateCents: p.sodMaterialPerSqft, ratePath: 'sodMaterialPerSqft', customerDriver: `${sqft} measured square feet of sod` }));
  add(out, makeLine({ name: 'Sod installation labor', category: 'labor', quantity: sqft, unit: 'measured square feet', rateCents: p.sodInstallLaborPerSqft, ratePath: 'sodInstallLaborPerSqft', multipliers: [{ name: 'slope', value: slope, path: `slopeMultiplier.${c.slope}` }, { name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }] }));
  if (c.groundPrepNeeded) {
    if(!separateSodPrep(p))add(out, makeLine({ name: 'Ground preparation', category: 'prep', quantity: sqft, unit: 'measured square feet', rateCents: p.groundPrepPerSqft, ratePath: 'groundPrepPerSqft' }));
    else {
      const included=[],excluded=[],componentDisclosures=[];
      for(const [ratePath,name,customerName] of [['sodRemovalPerSqft','Old-lawn removal with disposal','old-lawn removal and disposal'],['sodGradingPerSqft','Sod grading','grading']]){
        if(present(p[ratePath])){
          add(out,makeLine({name,category:'labor',quantity:sqft,unit:'square feet',rateCents:p[ratePath],ratePath,multipliers:[{name:'slope',value:slope,path:`slopeMultiplier.${c.slope}`},{name:'access',value:access,path:`accessMultiplier.${c.accessDifficulty}`}]}));
          included.push(customerName);
        }else excluded.push(customerName);
      }
      if(present(p.topsoilPerCubicYard)){
        const soil=topsoilQuantity(c,p);
        recordQuantityDerivation(out,{name:'topsoilCubicYards',formula:soil.unknown?'sodSqft * topsoilTypicalImportDepthInches / 324':'sodSqft * max(0, topsoilTargetDepthInches - usableTopsoilDepthInches) / 324',inputs:{sodSqft:sqft,importDepthInches:exactToNumber(soil.depth),...(soil.unknown?{topsoilTypicalImportDepthInches:p.topsoilTypicalImportDepthInches}:{topsoilTargetDepthInches:p.topsoilTargetDepthInches,usableTopsoilDepthInches:c.usableTopsoilDepthInches})},result:soil.quantity,unit:'cubic yards',usedBy:['Imported topsoil']});
        if(exactCompare(soil.quantity,0)>0){
          add(out,makeLine({name:'Imported topsoil',category:'material',quantity:soil.quantity,unit:'cubic yards',rateCents:p.topsoilPerCubicYard,ratePath:'topsoilPerCubicYard'}));
          included.push('imported topsoil');
        }else if(soil.unknown)included.push('imported topsoil');
        else componentDisclosures.push('No imported topsoil is needed for the supplied depth.');
        componentDisclosures.push(`Topsoil import depth: ${exactToNumber(soil.depth)} inches.`);
        if(soil.unknown)componentDisclosures.push(TOPSOIL_SITE_NOTE);
      }else excluded.push('imported topsoil');
      if(included.length)out.disclosures.push(`Included ground preparation: ${included.join(', ')}.`);
      if(excluded.length)out.disclosures.push(`Excluded ground preparation: ${excluded.join(', ')}. Any required excluded work needs a separate on-site estimate.`);
      out.disclosures.push(...componentDisclosures);
    }
  }
  const separate = ctx.ownerPricing?.disposalScope === 'separate_project_debris';
  if(separate && typeof c.separateDisposalSelected!=='boolean')throw new QuoteReviewError('Confirm whether separate project-debris disposal is selected.',{missingCustomerFields:['separateDisposalSelected']});
  if(!separate && c.separateDisposalSelected!==undefined)throw new QuoteReviewError('Separate disposal requires an explicit owner scope declaration.',{invalidCustomerFields:['separateDisposalSelected']});
  out.feeScope.disposal = separate && c.separateDisposalSelected===true;
  if((c.groundPrepNeeded || separate) && !out.feeScope.disposal)out.replacedCommonFees.push('disposal');
  recordRuleApplication(out,{name:'sodDisposalOwnership',rule:(separateSodPrep(p)?'Separately priced old-lawn removal includes old-lawn haul-away.':'Ground preparation includes old-lawn haul-away.')+' With ground preparation or a declared separate disposal scope, common disposal covers only explicitly selected separate project debris. Without ground preparation or a separate disposal scope, the configured common fee rule applies.',inputs:{groundPrepNeeded:c.groundPrepNeeded,disposalScope:ctx.ownerPricing?.disposalScope??null,separateDisposalSelected:c.separateDisposalSelected??null},result:{oldLawnDisposalOwner:c.groundPrepNeeded?(separateSodPrep(p)?present(p.sodRemovalPerSqft)?'sodRemovalPerSqft':null:'groundPrepPerSqft'):null,commonDisposalScope:out.feeScope.disposal?'separate_project_debris':!c.groundPrepNeeded&&!separate?'common_fee_rule':null},usedBy:separateSodPrep(p)?['Old-lawn removal with disposal','Disposal']:['Ground preparation','Disposal']});
  recordMeasurement(out, 'sodAreaSqft', sqft, 'square feet');
  out.priceDrivers.push(`${sqft} measured square feet of sod`, c.groundPrepNeeded ? (separateSodPrep(p)?'Ground preparation requested':'Existing-ground preparation included') : `Slope: ${c.slope}`);
  return out;
}

function calculatePlanting(c, p) {
  const out = baseOutput('LANDSCAPING_PLANTING');
  let totalPlants = 0;
  for (const size of plantSizeKeys(p)) {
    const plantCount = c.plantsBySize[size]||0;
    totalPlants += plantCount;
    if (plantCount <= 0) continue;
    const label=plantSizeLabel(p,size),unit=customPlantSizes(p)?label:`${size} plants`;
    add(out, makeLine({ name: `${label} plant installation labor`, category: 'labor', quantity: plantCount, unit, rateCents: valueAtPath(p, `plantingLaborPerPlant.${size}`), ratePath: `plantingLaborPerPlant.${size}` }));
    add(out, makeLine({ name: `${label} plant material allowance`, category: 'material', quantity: plantCount, unit, rateCents: valueAtPath(p, `plantMaterialAllowance.${size}`), ratePath: `plantMaterialAllowance.${size}` }));
    if(customPlantSizes(p))out.disclosures.push(`${plantCount} × ${label}.`);
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
  const condition=c.serviceFrequency!=='one_time'&&ctx.mowingVisit!=='first'?'maintained':c.grassCondition;
  const overgrowth = quantityFactor(p.overgrowthMultipliers[condition], `overgrowthMultipliers.${condition}`);
  const labor = makeLine({ name: 'Mowing labor', category: 'labor', quantity: sqft, unit: 'measured mowable square feet', rateCents: p.mowingBaseRatePerSqft, ratePath: 'mowingBaseRatePerSqft', multipliers: [{ name: 'frequency', value: frequency, path: `frequencyMultipliers.${c.serviceFrequency}` }, { name: 'grass condition', value: overgrowth, path: `overgrowthMultipliers.${condition}` }], customerDriver: `${sqft} measured mowable square feet` });
  add(out, labor);
  if(optionalPricePresent(p.mowingVisitCharge)&&p.mowingVisitCharge>0)add(out,fixedLine('Mowing per-visit charge','labor',p.mowingVisitCharge,'mowingVisitCharge'));
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
    else add(out, makeLine({ name: 'Lawn edging', category: 'labor', quantity: c.edgingLengthLF, unit: 'measured linear feet', rateCents: rate, ratePath: 'edgingPerLinearFoot', customerDriver: `${c.edgingLengthLF} measured linear feet of edging`, allowZeroRate: true }));
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
  out.feeScope.disposal = c.oldSidingRemoval;
  if (c.oldSidingRemoval && !p.scopeDetails?.[scopeKeysForRequest('SIDING_REPLACEMENT',c,p).find(k=>scopeBaseKey(k)==='siding_removal')]?.disposalIncluded) addDisposalOverride(out, p, 'disposalPerSqft', c.sidingRemovalAreaSqft, 'removed square feet', 'Siding disposal');
  recordMeasurement(out, 'sidingAreaSqft', area, 'square feet');
  if (c.trimIncluded) recordMeasurement(out, 'trimLengthLF', c.trimLengthLF, 'linear feet');
  out.priceDrivers.push(`${area} measured square feet of siding wall area`, `Siding type: ${c.sidingType.replaceAll('_', ' ')}`);
  return out;
}

function calculateSidingRepair(c, p) {
  const out = baseOutput('SIDING_REPAIR');
  if(addUnitRepair(out,'SIDING_REPAIR',c,p))return out;
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
  const snapshot = validationSnapshotVNext(value, 'serviceRules');
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
  const pricingSnapshot = validationSnapshotVNext(pricing, 'pricing');
  const unsafePricingPath = pricingSnapshot.ok ? pricingSnapshot.nonPlainPaths[0] : pricingSnapshot.errorPath;
  if (unsafePricingPath) {
    const path = unsafePricingPath.startsWith('pricing.')
      ? unsafePricingPath.slice('pricing.'.length)
      : unsafePricingPath;
    const reason = pricingSnapshot.ok ? 'nested value is not plain data' : pricingSnapshot.reason;
    throw new QuoteReviewError(`Pricing could not be read safely: ${reason}.`, { invalidOwnerFields: [path] });
  }
  pricing = pricingSnapshot.value;
  if(fenceType(serviceType)&&fenceHasRows(pricing))try{pricing=resolvedFencePricing(pricing,customerInputs);}catch(error){throw new QuoteReviewError(error.message,{invalidCustomerFields:[error.fenceField||'fenceHeight']});}
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
  if(surfaceType(serviceType))customerInputs=surfaceCalculationInputs(serviceType,customerInputs,pricing);
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
    if(surfaceType(serviceType)){
      for(const item of requestedSurfaceExtras(serviceType,customerInputs,pricing)){
        if(item.rateCents===undefined){addonContext.skipAddon(item.label);result.disclosures.push(item.label+' is excluded and needs a separate on-site estimate.');}
        else add(result,makeLine({name:item.label,category:'addon',quantity:item.quantity,unit:item.unit,rateCents:item.rateCents,ratePath:item.ratePath,priceBasis:'sell_price'}));
      }
      if(['room_dimensions','building_dimensions'].includes(customerInputs.areaInputMethod)){
        const geometry=customerInputs._surfaceGeometry;
        recordQuantityDerivation(result,{name:'Wall area from supplied dimensions',formula:customerInputs.areaInputMethod==='room_dimensions'?'sum(2 * (room length + room width) * room height) minus openings 100 square feet or larger, or floor-to-ceiling openings wider than 5 feet':'perimeter * wall height + sum(gable width * gable height / 2), with the selected opening convention',inputs:{method:customerInputs.areaInputMethod},result:geometry.labor,unit:'square feet',usedBy:['Wall labor','Siding labor']});
      }
    }
    const extra=scopeLines(serviceType,customerInputs,pricing,serviceRules);
    for(const line of extra.lines)add(result,makeLine({...line,...(line.ratePath.startsWith('scopeRates.paint_')?{allowZeroQuantity:true}:{})}));
    result.disclosures.push(...extra.disclosures);
    for(const rule of extra.rules)recordRuleApplication(result,rule);
    result.replacedCommonFees=[...new Set([...result.replacedCommonFees,...extra.replacedCommonFees])];
    Object.assign(result.feeScope,extra.feeScope);
    result.lineItems=result.lineItems.map(line=>{
      const ratePath=line.calculation?.ratePath;
      if(Object.hasOwn(installedPriceDefinitions(serviceType,pricing),ratePath)) {
        const factorPath=line.surfaceHeightBand?'wallHeightLaborMultiplier.'+line.surfaceHeightBand:installedLaborFactorPath(serviceType,customerInputs,ratePath);
        const unitRepair=REPAIR_SERVICES.includes(serviceType)&&/^(repairUnitPrice|repairAreaMinimum)\./.test(ratePath);
        const repairFactorPaths=unitRepair?(serviceType==='ROOFING_REPAIR'?[`pitchMultiplier.${customerInputs.pitch}`,`storyMultiplier.${customerInputs.stories}`]:serviceType==='FLAT_ROOF_REPAIR'?[`accessMultiplier.${customerInputs.accessDifficulty}`]:[`storyMultiplier.${customerInputs.stories}`]):[];
        const exactRepairFactor=unitRepair?exactMultiply(...repairFactorPaths.map(path=>valueAtPath(pricing,path))):null;
        const factor=unitRepair?exactToNumber(exactRepairFactor):factorPath?valueAtPath(pricing,factorPath):1;
        const exactFactor=exactRepairFactor??exactDecimal(factor);
        const laborShare=pricing.installedLaborPercent?.[ratePath];
        const base=exactFromEvidence(line.calculation.exactUnroundedCents);
        if(factor!==1 && laborShare===undefined)throw new QuoteReviewError('Set the labor portion of this installed price before applying a labor adjustment.',{missingOwnerFields:['installedLaborPercent.'+ratePath]});
        const adjusted=factor===1?line:makeLine({...line,...line.calculation,multipliers:[...line.calculation.multipliers,{name:'Installed labor portion adjustment',path:factorPath||repairFactorPaths[0],value:exactAdd(1,exactMultiply(exactDivide(laborShare,100),exactSubtract(exactFactor,1))),laborSharePercent:laborShare,laborFactor:factor,...(unitRepair?{factorPaths:repairFactorPaths}: {})}]});
        // Shares split the amount actually billed (the rounded line), so a 100%
        // materials or 100% labor share equals the whole billed line and the
        // portions always add back to it exactly. Fractions are kept until the
        // tax or surcharge itself is rounded.
        const scale=factor===1?exactDecimal(1):exactAdd(1,exactMultiply(exactDivide(laborShare,100),exactSubtract(exactFactor,1)));
        const billedBase=exactDivide(adjusted.amountCents,scale);
        adjusted.installedBaseExactCents=exactEvidence(billedBase);
        if(laborShare!==undefined)adjusted.installedLaborExactCents=exactEvidence(exactMultiply(billedBase,exactDivide(laborShare,100),exactFactor));
        if(repairOrDeckInstalled(serviceType,ratePath,pricing))adjusted.installedMaterialExactCents=exactEvidence(exactMultiply(billedBase,exactDivide(installedMaterialsShare(serviceType,pricing,ratePath),100)));
        return adjusted;
      }
      const adjustment=tradeAdjustment(serviceType,customerInputs,pricing,line);
      if(!adjustment)return line;
      const rebuilt=makeLine({...line,...line.calculation,...adjustment});
      if(adjustment.wastePath)recordQuantityDerivation(result,{name:line.name+' material quantity',formula:'measured quantity * (1 + owner material waste)',inputs:{measuredQuantity:adjustment.originalQuantity,wasteFactor:adjustment.waste,wastePath:adjustment.wastePath},result:adjustment.quantity,unit:line.calculation.unit,usedBy:[line.name]});
      return rebuilt;
    });
    return recordNoChargeClassification(result,serviceRules,pricing);
  };
  if(configuredOffering(serviceType,pricing)) {
    const out=baseOutput(serviceType);
    for(const item of offeringLines(serviceType,customerInputs,pricing)) {
      if(scopesSuppressPrice(serviceType,customerInputs,pricing,serviceRules,item.ratePath))continue;
      const line=makeLine({name:item.label,category:item.category,quantity:item.quantity,allowZeroQuantity:item.category==='material',unit:item.unit,rateCents:item.rateCents,ratePath:item.ratePath,contributingRatePaths:item.contributingRatePaths,priceBasis:item.priceBasis,multipliers:item.multipliers||[]});
      if(item.surfaceHeightBand)line.surfaceHeightBand=item.surfaceHeightBand;
      add(out,line);
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
  if (serviceType === 'EXTERIOR_PAINTING') throw new QuoteReviewError('Configure an exterior painting offering before quoting.');
  if (serviceType === 'FLOORING_INSTALL' || serviceType === 'FLOORING_REPLACEMENT') return finalize(calculateFlooring(serviceType, customerInputs, pricing, ctx));
  if (serviceType === 'FENCING_INSTALL' || serviceType === 'FENCING_REPLACEMENT') return finalize(calculateFencing(serviceType, customerInputs, pricing));
  if (serviceType === 'CONCRETE_DRIVEWAY' || serviceType === 'CONCRETE_PATIO_SLAB') return finalize(calculateConcrete(serviceType, customerInputs, pricing));
  if (serviceType === 'LANDSCAPING_CLEANUP') return finalize(calculateCleanup(customerInputs, pricing));
  if (serviceType === 'LANDSCAPING_MULCH') return finalize(calculateMulch(customerInputs, pricing));
  if (serviceType === 'LANDSCAPING_SOD') return finalize(calculateSod(customerInputs, pricing, ctx));
  if (serviceType === 'LANDSCAPING_PLANTING') return finalize(calculatePlanting(customerInputs, pricing));
  if (serviceType === 'LANDSCAPING_MOWING') return finalize(calculateMowing(customerInputs, pricing, {...addonContext,mowingVisit:ownDataValue(ctx,'mowingVisit').value}));
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
function recordNoChargeClassification(result, rules, pricing) {
  const entries=[];
  for(const line of result.lineItems){
    const components=line.calculation.evidenceVariant==='composite'?line.calculation.components:null;
    if(components)for(const component of components)entries.push({holder:component,calculation:component,path:component.ratePath,category:line.category,basis:component.priceBasis||line.priceBasis||rules.priceBasisByCategory?.[line.category]});
    else for(const path of line.calculation.contributingRatePaths||[line.calculation.ratePath])entries.push({holder:line,calculation:line.calculation,path,category:line.category,basis:line.priceBasis||rules.priceBasisByCategory?.[line.category]});
  }
  for(const entry of entries){
    const {holder,calculation,path}=entry;
    if(holder.amountCents!==0)continue;
    const classified=rules.zeroPricePolicy?.includedPrices?.[qualifiedFenceRatePath(pricing,path)]??rules.zeroPricePolicy?.includedPrices?.[path];
    const includedIn=fenceType(rules.serviceType)?localFenceRatePath(pricing,classified):classified;
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
