import crypto from 'node:crypto';
import {scopeRatePath} from './scopePricing.js';
import {offeringRatePath} from './configuredOfferings.js';
import {
  PRICE_BASIS_CATEGORIES,
  MEASUREMENT_CONTRACTS,
  SERVICE_TYPES,
  aiConfirmationFieldsVNext,
  hasCurrentApprovalVNext,
  identityDiagnosticsVNext,
  validServiceIdVNext,
  sameServiceIdVNext,
  canonicalServiceIdentityVNext,
  canonicalCustomerIdentityVNext,
  freeOfferingVNext,
  equalApprovalDataVNext,
  allowedPricingFields,
  inspectionOwnerDecisionsVNext,
  validateBusinessDefaults,
  validateCustomerInputs,
  validateOwnerPricing,
  validateServiceRules,
  validateServiceRulesDetailed
} from './contracts.js';
import {
  exactDecimal,
  exactAdd,
  exactCompare,
  exactDivide,
  exactEvidence,
  exactEvidenceMatches,
  exactFromEvidence,
  exactIsSafeInteger,
  exactMultiply,
  exactRound,
  exactSubtract,
  exactToNumber
} from './exactMath.js';
import { QuoteReviewError, calculateServiceVNext } from './templates.js';
import { denseArrayIssue, ownDataValue, snapshotPlainData } from './safeData.js';

export const ENGINE_VERSION = 'quote-engine-vnext-measured-scopes-20260930-v1';

const QUOTE_REQUEST_FIELDS = new Set([
  'serviceType', 'customerInputs', 'ownerPricing', 'businessDefaults',
  'callerType', 'feeSelections', 'currentMonth', 'allowInactiveOwnerPreview'
]);
const DEFAULT_DISCLAIMER = 'This preliminary estimate is based on the measured project details provided and covers the described scope only. Final pricing is confirmed after review and, when needed, in-person verification. Additional scope, unforeseen conditions, or changes to project details may affect the final price.';
const FEWER_OPTIONS_NOTICE = 'Fewer options are available because one or more configured options need owner review.';
const CUSTOMER_SKIPPED_ADDONS = new Set([
  'Ponding water surcharge',
  'Clipping bagging and disposal',
  'Lawn edging'
]);
const CUSTOMER_DRIVER_LINE_CATEGORIES = new Set([
  'labor', 'material', 'removal', 'prep', 'addon', 'equipment'
]);
const INTERNAL_CUSTOMER_DRIVER_COPY = /\b(?:rate|cost|markup|overhead|margin)\b/i;

const FEE_DEFAULT_FIELDS = {
  travel: 'travelFee',
  disposal: 'disposalFee',
  permit: 'permitFee',
  overhead: 'overheadFixed'
};

const FEE_LINE_NAMES = {
  travel: 'Travel',
  disposal: 'Disposal',
  permit: 'Permit',
  overhead: 'Overhead'
};

const SERVICE_MINIMUM_FIELDS = {
  ROOFING_REPLACEMENT: 'minimumJob',
  FLAT_ROOF_REPLACEMENT: 'minimumJob',
  ROOFING_REPAIR: 'repairMinimum',
  FLAT_ROOF_REPAIR: 'repairMinimum',
  INTERIOR_PAINTING: 'minimumJob',
  EXTERIOR_PAINTING: 'minimumJob',
  FLOORING_INSTALL: 'minimumJob',
  FLOORING_REPLACEMENT: 'minimumJob',
  FENCING_INSTALL: 'minimumJob',
  FENCING_REPLACEMENT: 'minimumJob',
  CONCRETE_DRIVEWAY: 'minimumJob',
  CONCRETE_PATIO_SLAB: 'minimumJob',
  LANDSCAPING_CLEANUP: 'minimumServiceCharge',
  LANDSCAPING_MULCH: 'minimumServiceCharge',
  LANDSCAPING_SOD: 'minimumServiceCharge',
  LANDSCAPING_PLANTING: 'minimumServiceCharge',
  LANDSCAPING_MOWING: 'minimumServiceCharge',
  SIDING_REPLACEMENT: 'minimumJob',
  SIDING_REPAIR: 'repairMinimum',
  CUSTOM: 'minimumJob'
};

function derivedUrgency(serviceType, customerInputs) {
  return ['ROOFING_REPAIR', 'FLAT_ROOF_REPAIR'].includes(serviceType) && customerInputs?.leakPresent === true ? ['Active leak reported'] : [];
}

function review({
  quoteId = crypto.randomUUID(),
  serviceId = null,
  serviceType,
  submittedCustomerInputs = {},
  normalizedScope = null,
  validatedMeasurements = [],
  unconfirmedOwnerFields = [],
  reviewReason,
  missingCustomerFields = [],
  invalidCustomerFields = [],
  missingOwnerFields = [],
  invalidOwnerFields = [],
  unsupportedOwnerFields = [],
  crossFieldOwnerFields = [],
  ownerDiagnostics = [],
  ownerDecisionRequired = [],
  failedTierDiagnostics = [],
  validationMessages = [],
  inspectionFirst = false,
  appliedRules = [],
  urgencyFlags = []
}) {
  return {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    engineVersion: ENGINE_VERSION,
    serviceId,
    quoteId,
    serviceType,
    submittedCustomerInputs,
    normalizedScope,
    validatedMeasurements,
    unconfirmedOwnerFields,
    reviewReason,
    missingCustomerFields,
    invalidCustomerFields,
    missingOwnerFields,
    invalidOwnerFields,
    unsupportedOwnerFields,
    crossFieldOwnerFields,
    ownerDiagnostics,
    ownerDecisionRequired,
    failedTierDiagnostics,
    validationMessages,
    inspectionFirst,
    appliedRules,
    urgencyFlags
  };
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function cloneForEvidence(value, fallback) {
  try {
    return structuredClone(value);
  } catch {
    return structuredClone(fallback);
  }
}

// Diagnostic evidence may include rejected tiers. Keep their paths and invalid
// value types without cloning executable/non-JSON primitives into a quote record.
// This representation is never used as calculation input.
function cloneConfigurationEvidence(value) {
  if (['function', 'symbol', 'bigint'].includes(typeof value)) {
    return { invalidValueType: typeof value };
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { invalidValueType: 'number', invalidValue: String(value) };
  }
  if (Array.isArray(value)) return value.map(cloneConfigurationEvidence);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneConfigurationEvidence(entry)]));
  }
  return value;
}

function pricingSnapshotOrThrow(value, path) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  const snapshot = snapshotPlainData(value, path);
  if (!snapshot.ok) {
    throw new TypeError(`${path} could not be read safely at ${snapshot.errorPath}: ${snapshot.reason}.`);
  }
  if (snapshot.nonPlainPaths.length) {
    throw new TypeError(`${path} must contain only plain data objects; ${snapshot.nonPlainPaths[0]} is not plain data.`);
  }
  return snapshot.value;
}

function clonePricingForDiagnostics(value) {
  if (value === null || typeof value !== 'object') return value;
  const out = Array.isArray(value)
    ? new Array(value.length)
    : Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype);
  for (const key of Object.keys(value)) {
    Object.defineProperty(out, key, {
      value: clonePricingForDiagnostics(value[key]),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return out;
}

function mergePricingSnapshots(base, override) {
  const out = clonePricingForDiagnostics(base);
  for (const [key, value] of Object.entries(override)) {
    const mergedValue = isPlainObject(value) && isPlainObject(out[key])
      ? mergePricingSnapshots(out[key], value)
      : clonePricingForDiagnostics(value);
    Object.defineProperty(out, key, {
      value: mergedValue,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return out;
}

export function mergePricingForValidationVNext(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    throw new TypeError('Base pricing and tier overrides must both be objects.');
  }
  return mergePricingSnapshots(
    pricingSnapshotOrThrow(base, 'basePricing'),
    pricingSnapshotOrThrow(override, 'tierOverrides')
  );
}

export function mergePricingVNext(base, override) {
  const merged = mergePricingForValidationVNext(base, override);
  try {
    return structuredClone(merged);
  } catch {
    throw new TypeError('Merged pricing contains values that cannot be returned as plain quote data.');
  }
}

function extractPricing(ownerPricing) {
  return isPlainObject(ownerPricing.pricing)
    ? clonePricingForDiagnostics(ownerPricing.pricing)
    : {};
}

export function validateTierDefinitionsDetailedVNext(ownerPricing, serviceType) {
  const snapshot = snapshotPlainData(ownerPricing, 'ownerPricing');
  if (!snapshot.ok) {
    const path = snapshot.errorPath.startsWith('ownerPricing.')
      ? snapshot.errorPath.slice('ownerPricing.'.length)
      : snapshot.errorPath;
    return [{ type: 'invalid', kind: 'tier_definition', path, message: `Owner pricing could not be read safely: ${snapshot.reason}.` }];
  }
  if (snapshot.nonPlainPaths.length) {
    const unsafePath = snapshot.nonPlainPaths[0];
    const path = unsafePath.startsWith('ownerPricing.')
      ? unsafePath.slice('ownerPricing.'.length)
      : unsafePath;
    return [{ type: 'invalid', kind: 'tier_definition', path, message: `${path} must be a plain data value.` }];
  }
  ownerPricing = snapshot.value;
  if (!isPlainObject(ownerPricing)) {
    return [{ type: 'invalid', kind: 'tier_definition', path: 'ownerPricing', message: 'Owner pricing must be an object before tiers can be validated.' }];
  }
  if (!SERVICE_TYPES.includes(serviceType)) {
    return [{ type: 'invalid', kind: 'tier_definition', path: 'serviceType', message: 'Service type is unsupported.' }];
  }
  if (ownerPricing.tiers === undefined) return [];
  const diagnostics = [];
  if (!Array.isArray(ownerPricing.tiers)) return [{ type: 'invalid', kind: 'tier_definition', path: 'tiers', message: 'tiers must be an array containing at most three options.' }];
  const arrayIssue = denseArrayIssue(ownerPricing.tiers);
  if (arrayIssue) {
    const path = arrayIssue.path ? `tiers.${arrayIssue.path}` : 'tiers';
    diagnostics.push({ type: 'invalid', kind: 'tier_definition', path, message: `${path} is invalid: ${arrayIssue.reason}.` });
  }
  if (ownerPricing.tiers.length > 3) diagnostics.push({ type: 'invalid', kind: 'tier_definition', path: 'tiers', message: 'tiers must contain at most three options.' });
  const allowed = new Set(allowedPricingFields(serviceType));
  const names = new Map();
  for (let index = 0; index < ownerPricing.tiers.length; index += 1) {
    const tierPath = `tiers.${index}`;
    if (!Object.hasOwn(ownerPricing.tiers, index)) continue;
    const tier = ownerPricing.tiers[index];
    if (!isPlainObject(tier)) {
      diagnostics.push({ type: 'invalid', kind: 'tier_definition', path: tierPath, message: `${tierPath} must be an object.` });
      continue;
    }
    for (const key of Object.keys(tier)) {
      if (!['name', 'overrides'].includes(key)) diagnostics.push({ type: 'unsupported', kind: 'tier_definition', path: `${tierPath}.${key}`, message: `${tierPath}.${key} is not supported.` });
    }
    if (typeof tier.name !== 'string' || !tier.name.trim()) diagnostics.push({ type: 'missing', kind: 'tier_definition', path: `${tierPath}.name`, message: `${tierPath}.name is required.` });
    else {
      if (tier.name !== tier.name.trim()) diagnostics.push({ type: 'invalid', kind: 'tier_definition', path: `${tierPath}.name`, message: `${tierPath}.name cannot have leading or trailing whitespace.` });
      const normalizedName = tier.name.trim().toLowerCase();
      if (names.has(normalizedName)) {
        diagnostics.push({ type: 'cross_field', kind: 'duplicate_tier_name', path: `${tierPath}.name`, message: `${tierPath}.name duplicates tiers.${names.get(normalizedName)}.name.` });
      } else names.set(normalizedName, index);
    }
    if (!isPlainObject(tier.overrides)) diagnostics.push({ type: 'invalid', kind: 'tier_definition', path: `${tierPath}.overrides`, message: `${tierPath}.overrides must be an object.` });
    else for (const key of Object.keys(tier.overrides)) if (!allowed.has(key)) diagnostics.push({ type: 'unsupported', kind: 'tier_definition', path: `${tierPath}.overrides.${key}`, message: `${tierPath}.overrides.${key} is not supported for ${serviceType}.` });
  }
  return diagnostics;
}

export function validateTierDefinitionsVNext(ownerPricing, serviceType) {
  return [...new Set(validateTierDefinitionsDetailedVNext(ownerPricing, serviceType).map(item => item.message))];
}

function checkedCents(value, path, { allowZero = true } = {}) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new QuoteReviewError(`${path} must be stored as non-negative integer cents.`, {
      invalidOwnerFields: [path]
    });
  }
  return value;
}
function exactPercentOf(basis, percent) {
  return exactDivide(exactMultiply(basis, percent), 100);
}

function exactMoneyResult(exactValue, path, message) {
  try {
    const amountCents = exactRound(exactValue);
    const unroundedCents = exactToNumber(exactValue);
    if (!Number.isSafeInteger(amountCents) || amountCents < 0 || !Number.isFinite(unroundedCents) || unroundedCents < 0) {
      throw new RangeError('Unsafe exact money result.');
    }
    return { amountCents, unroundedCents, exactUnroundedCents: exactEvidence(exactValue) };
  } catch {
    throw new QuoteReviewError(message, {
      invalidOwnerFields: Array.isArray(path) ? path : [path]
    });
  }
}

function validateRangedEvidence(line) {
  const calculation = line?.calculation;
  const range = line?.rangeAmountCents;
  const fallbackPath = typeof calculation?.ratePath === 'string' && calculation.ratePath ? calculation.ratePath : 'rangePricing';
  if (!isPlainObject(line) || !isPlainObject(calculation) || calculation.evidenceVariant !== 'ranged' || !isPlainObject(range) || !Array.isArray(calculation.multipliers)) {
    throw new QuoteReviewError('Intrinsic range evidence is malformed.', { invalidOwnerFields: [fallbackPath] });
  }
  if (typeof calculation.quantity !== 'number' || !Number.isFinite(calculation.quantity) || calculation.quantity <= 0) {
    throw new QuoteReviewError('Intrinsic range quantity is invalid.', { invalidOwnerFields: [fallbackPath] });
  }
  let exactQuantity;
  const exactMultipliers = [];
  try {
    exactQuantity = exactFromEvidence(calculation.exactQuantity);
    if (!Object.is(exactToNumber(exactQuantity), calculation.quantity)) throw new TypeError('Quantity evidence does not match.');
    for (const multiplier of calculation.multipliers) {
      if (!isPlainObject(multiplier) || typeof multiplier.value !== 'number' || !Number.isFinite(multiplier.value) || multiplier.value < 0) {
        throw new TypeError('Multiplier value is invalid.');
      }
      const exactMultiplier = exactFromEvidence(multiplier.exactValue);
      if (!Object.is(exactToNumber(exactMultiplier), multiplier.value)) throw new TypeError('Multiplier evidence does not match.');
      exactMultipliers.push(exactMultiplier);
    }
  } catch {
    if (calculation.multipliers.some(multiplier =>
      !isPlainObject(multiplier) || typeof multiplier.value !== 'number' || !Number.isFinite(multiplier.value) || multiplier.value < 0
    )) {
      throw new QuoteReviewError('Intrinsic range multiplier evidence is invalid.', { invalidOwnerFields: [fallbackPath] });
    }
    throw new QuoteReviewError('Intrinsic range exact evidence is malformed or inconsistent.', { invalidOwnerFields: [fallbackPath] });
  }
  const variants = [
    { name: 'low', rate: calculation.lowRateCents, amount: range.low, path: 'low' },
    { name: 'mid', rate: calculation.midRateCents, amount: calculation.midAmountCents, path: fallbackPath },
    { name: 'high', rate: calculation.highRateCents, amount: range.high, path: 'high' }
  ];
  const invalid = [];
  const computed = new Map();
  for (const entry of variants) {
    const supportedRate = Number.isSafeInteger(entry.rate) || fallbackPath === 'price' && typeof entry.rate === 'number' && Number.isFinite(entry.rate) && entry.rate <= Number.MAX_SAFE_INTEGER;
    if (!supportedRate || entry.rate < 0 || !Number.isSafeInteger(entry.amount) || entry.amount < 0) {
      invalid.push(entry.path);
      continue;
    }
    try {
      const exactUnrounded = exactMultiply(exactQuantity, entry.rate, ...exactMultipliers);
      const expected = exactRound(exactUnrounded);
      if (expected !== entry.amount) invalid.push(entry.path);
      computed.set(entry.name, exactUnrounded);
    } catch {
      invalid.push(entry.path);
    }
  }
  const selectedVariant = calculation.selectedVariant ?? 'mid';
  const selected = variants.find(entry => entry.name === selectedVariant);
  const selectedExact = computed.get(selectedVariant);
  if (!selected || !selectedExact ||
      calculation.rateCents !== selected.rate ||
      line.amountCents !== selected.amount ||
      calculation.roundedAmountCents !== selected.amount ||
      !Number.isFinite(calculation.unroundedCents) ||
      !Object.is(calculation.unroundedCents, exactToNumber(selectedExact)) ||
      !exactEvidenceMatches(selectedExact, calculation.exactUnroundedCents)) {
    invalid.push(fallbackPath);
  }
  if (calculation.lowRateCents > calculation.midRateCents || calculation.midRateCents > calculation.highRateCents ||
      range.low > calculation.midAmountCents || calculation.midAmountCents > range.high) invalid.push(fallbackPath);
  if (invalid.length) throw new QuoteReviewError('Intrinsic range evidence is unsafe or internally inconsistent.', { invalidOwnerFields: [...new Set(invalid)] });
  return { exactQuantity, exactMultipliers };
}


function validateFeeSelectionRequest(ownerPricing, feeSelections, replacedFees = [], requirePresence = false) {
  const invalidOwnerFields = [];
  const invalidCustomerFields = [];
  const feeNames = Object.keys(FEE_DEFAULT_FIELDS);
  if (!isPlainObject(feeSelections)) {
    return { invalidOwnerFields, invalidCustomerFields: ['feeSelections'] };
  }
  for (const key of Object.keys(feeSelections)) {
    if (!['owner', 'customer'].includes(key)) invalidCustomerFields.push(`feeSelections.${key}`);
  }
  for (const side of ['owner', 'customer']) {
    if (!Object.hasOwn(feeSelections, side)) continue;
    const target = side === 'owner' ? invalidOwnerFields : invalidCustomerFields;
    const selections = feeSelections[side];
    if (!isPlainObject(selections)) {
      target.push(`feeSelections.${side}`);
      continue;
    }
    for (const [fee, value] of Object.entries(selections)) {
      const path = `feeSelections.${side}.${fee}`;
      const expectedMode = side === 'owner' ? 'owner_selected' : 'customer_selected';
      if (!feeNames.includes(fee) || typeof value !== 'boolean' || ownerPricing.feeRules[fee] !== expectedMode) target.push(path);
    }
  }
  for (const fee of feeNames) {
    if(!requirePresence || replacedFees.includes(fee))continue;
    const mode = ownerPricing.feeRules[fee];
    if (mode === 'owner_selected') {
      if (!isPlainObject(feeSelections.owner) || !Object.hasOwn(feeSelections.owner, fee) || typeof feeSelections.owner[fee] !== 'boolean') {
        invalidOwnerFields.push(`feeSelections.owner.${fee}`);
      }
    }
    if (mode === 'customer_selected') {
      if (!isPlainObject(feeSelections.customer) || !Object.hasOwn(feeSelections.customer, fee) || typeof feeSelections.customer[fee] !== 'boolean') {
        invalidCustomerFields.push(`feeSelections.customer.${fee}`);
      }
    }
  }
  return {
    invalidOwnerFields: unique(invalidOwnerFields),
    invalidCustomerFields: unique(invalidCustomerFields)
  };
}

export function materializeScenarioLinesVNext(lines, variant) {
  if (!Array.isArray(lines) || !['low', 'mid', 'high'].includes(variant)) throw new TypeError('Scenario lines and a low, mid, or high variant are required.');
  const snapshot = snapshotPlainData({ lines }, 'scenario');
  if (!snapshot.ok) {
    throw new TypeError(`Scenario lines could not be read safely at ${snapshot.errorPath}: ${snapshot.reason}.`);
  }
  if (snapshot.nonPlainPaths.length) {
    throw new TypeError(`Scenario lines must contain only plain data objects; ${snapshot.nonPlainPaths[0]} is not plain data.`);
  }
  lines = snapshot.value.lines;
  const arrayIssue = denseArrayIssue(lines);
  if (arrayIssue) {
    const path = arrayIssue.path ? `scenario.lines.${arrayIssue.path}` : 'scenario.lines';
    throw new TypeError(`Scenario lines are invalid at ${path}: ${arrayIssue.reason}.`);
  }
  // Preserve exact ranged owner diagnostics before the general evidence guard.
  // The general guard still checks regular lines and all no-charge tags.
  for (const line of lines) {
    if (line?.calculation?.evidenceVariant === 'ranged' || Object.hasOwn(line || {}, 'rangeAmountCents')) {
      validateRangedEvidence(line);
    }
  }
  if (lines.length === 0 || lines.some(line => !validLineCalculationEvidence(line))) {
    throw new TypeError('Scenario lines must contain complete reproducible calculation evidence.');
  }
  return lines.map(line => {
    const next = structuredClone(line);
    if (line?.calculation?.evidenceVariant === 'ranged' || Object.hasOwn(line || {}, 'rangeAmountCents')) {
      const selectedRateCents = variant === 'low'
        ? line.calculation.lowRateCents
        : variant === 'high'
          ? line.calculation.highRateCents
          : line.calculation.midRateCents;
      const selectedAmountCents = variant === 'mid' ? line.calculation.midAmountCents : line.rangeAmountCents[variant];
      const evidence = validateRangedEvidence(line);
      const exactUnroundedCents = exactMultiply(evidence.exactQuantity, selectedRateCents, ...evidence.exactMultipliers);
      next.amountCents = selectedAmountCents;
      next.calculation.selectedVariant = variant;
      next.calculation.rateCents = selectedRateCents;
      next.calculation.unroundedCents = exactToNumber(exactUnroundedCents);
      next.calculation.exactUnroundedCents = exactEvidence(exactUnroundedCents);
      next.calculation.roundedAmountCents = selectedAmountCents;
      if (selectedAmountCents === 0) {
        next.noCharge = true;
        next.noChargeReason = selectedRateCents === 0 ? 'explicitly_free' : 'rounded_fractional_cent';
      } else {
        delete next.noCharge;
        delete next.noChargeReason;
      }
    }
    return next;
  });
}

function feeSelection(mode, fee, feeSelections) {
  if (mode === 'owner_selected') {
    const value = isPlainObject(feeSelections?.owner) && Object.hasOwn(feeSelections.owner, fee)
      ? feeSelections.owner[fee]
      : undefined;
    if (typeof value !== 'boolean') throw new QuoteReviewError(`Owner selection for the ${fee} fee is required.`, { invalidOwnerFields: [`feeSelections.owner.${fee}`] });
    return value;
  }
  if (mode === 'customer_selected') {
    const value = isPlainObject(feeSelections?.customer) && Object.hasOwn(feeSelections.customer, fee)
      ? feeSelections.customer[fee]
      : undefined;
    if (typeof value !== 'boolean') throw new QuoteReviewError(`Customer selection for the ${fee} fee is required.`, { invalidCustomerFields: [`feeSelections.customer.${fee}`] });
    return value;
  }
  return null;
}

function applyCommonFees(lines, template, ownerPricing, defaults, feeSelections, record) {
  const replaced = new Set(template.replacedCommonFees || []);
  for (const fee of Object.keys(FEE_DEFAULT_FIELDS)) {
    const mode = ownerPricing.feeRules[fee];
    const amountCents = checkedCents(defaults[FEE_DEFAULT_FIELDS[fee]], FEE_DEFAULT_FIELDS[fee]);
    let applies = false;
    let reason = mode;
    if (replaced.has(fee)) {
      reason = 'replaced_by_service_quantity_charge';
    } else if (mode === 'always') {
      applies = true;
    } else if (mode === 'when_scope_selected') {
      applies = template.feeScope[fee] === true;
    } else if (mode === 'owner_selected' || mode === 'customer_selected') {
      applies = feeSelection(mode, fee, feeSelections);
    }
    if (applies) {
      lines.push({
        name: FEE_LINE_NAMES[fee],
        category: fee,
        amountCents,
        ownerVisible: true,
        ...(amountCents === 0 ? { noCharge: true, noChargeReason: 'explicitly_free' } : {}),
        customerVisible: false,
        calculation: {
          evidenceVariant: 'fixed_amount',
          amountCents,
          quantity: 1,
          unit: 'configured fixed charge',
          rateCents: amountCents,
          ratePath: `businessDefaults.${FEE_DEFAULT_FIELDS[fee]}`,
          multipliers: [],
          unroundedCents: amountCents,
          roundedAmountCents: amountCents
        }
      });
    }
    record.push({ fee, mode, physicalScopeSelected: template.feeScope[fee] === true, replaced: replaced.has(fee), applied: applies, charged: applies && amountCents > 0, noCharge: applies && amountCents === 0, amountCents: applies ? amountCents : 0, reason });
  }
}

function seasonalConfiguration(ownerPricing, defaults) {
  return {
    months: ownerPricing.peakMonths !== undefined ? ownerPricing.peakMonths : defaults.peakMonths,
    percent: ownerPricing.peakSurchargePercent !== undefined ? ownerPricing.peakSurchargePercent : defaults.peakSurchargePercent
  };
}

function applySeasonalSurcharge(lines, ownerPricing, defaults, month, record) {
  const seasonal = seasonalConfiguration(ownerPricing, defaults);
  const active = seasonal.months.includes(month) && seasonal.percent > 0;
  const laborSubtotalCents = lines.filter(line => line.category === 'labor').reduce((sum, line) => sum + line.amountCents, 0);
  const seasonalMoney = exactMoneyResult(active ? exactPercentOf(laborSubtotalCents, seasonal.percent) : exactDecimal(0), 'peakSurchargePercent', 'Peak-season configuration did not produce a valid charge.');
  const amountCents = seasonalMoney.amountCents;
  if (amountCents > 0) {
    lines.push({
      name: 'Peak season adjustment',
      category: 'surcharge',
      amountCents,
      ownerVisible: true,
      customerVisible: false,
      calculation: {
        evidenceVariant: 'percentage_derived',
        basisCategory: 'labor',
        basisAmountCents: laborSubtotalCents,
        percent: seasonal.percent,
        unroundedCents: seasonalMoney.unroundedCents,
        exactUnroundedCents: seasonalMoney.exactUnroundedCents,
        roundedAmountCents: amountCents
      }
    });
  }
  record.month = month;
  record.configuredMonths = structuredClone(seasonal.months);
  record.percent = seasonal.percent;
  record.laborSubtotalCents = laborSubtotalCents;
  record.seasonActive = active;
  record.applied = amountCents > 0;
  record.amountCents = amountCents;
}

function exactMarkupValue(baseCents, defaults) {
  if (baseCents <= 0 || defaults.markupPercent === 0) return exactDecimal(0);
  const fraction = exactDivide(defaults.markupPercent, 100);
  return defaults.markupMode === 'margin'
    ? exactSubtract(exactDivide(baseCents, exactSubtract(1, fraction)), baseCents)
    : exactMultiply(baseCents, fraction);
}

function markupMoneyResult(baseCents, defaults) {
  return exactMoneyResult(exactMarkupValue(baseCents, defaults), 'markupPercent', 'Markup configuration produced an invalid amount.');
}

function markupAmount(baseCents, defaults) {
  return markupMoneyResult(baseCents, defaults).amountCents;
}

function applyTaxability(lines, ownerPricing, taxMode) {
  for (const line of lines) {
    line.taxable = taxMode === 'TAX_ALL'
      ? true
      : taxMode === 'TAX_MATERIALS' && ownerPricing.taxabilityByCategory[line.category] === true;
  }
}

function effectiveLinePriceBasis(line, ownerPricing) {
  return line.priceBasis || ownerPricing.priceBasisByCategory[line.category];
}

function applyMarkup(lines, ownerPricing, defaults, record) {
  const treatment = lines
    .filter(line => PRICE_BASIS_CATEGORIES.includes(line.category))
    .map(line => {
      const effectivePriceBasis = effectiveLinePriceBasis(line, ownerPricing);
      const markupEligible = effectivePriceBasis === 'cost' && defaults.markupApplies[line.category] === true;
      line.calculation.effectivePriceBasis = effectivePriceBasis;
      line.calculation.markupEligible = markupEligible;
      return { line, effectivePriceBasis, markupEligible };
    });
  const eligibleLines = treatment.filter(item => item.markupEligible).map(item => item.line);
  const baseCents = eligibleLines.reduce((sum, line) => sum + line.amountCents, 0);
  const markupMoney = markupMoneyResult(baseCents, defaults);
  const amountCents = markupMoney.amountCents;
  if (amountCents > 0) {
    lines.push({
      name: 'Markup',
      category: 'markup',
      amountCents,
      taxable: false,
      ownerVisible: true,
      customerVisible: false,
      calculation: {
        evidenceVariant: 'percentage_derived',
        basisAmountCents: baseCents,
        mode: defaults.markupMode,
        percent: defaults.markupPercent,
        includedLineIndexes: eligibleLines.map(line => lines.indexOf(line)),
        unroundedCents: markupMoney.unroundedCents,
        exactUnroundedCents: markupMoney.exactUnroundedCents,
        roundedAmountCents: amountCents
      }
    });
  }
  record.mode = defaults.markupMode;
  record.lineTreatment = treatment.map(item => ({
    name: item.line.name,
    category: item.line.category,
    amountCents: item.line.amountCents,
    effectivePriceBasis: item.effectivePriceBasis,
    markupConfiguredForCategory: defaults.markupApplies[item.line.category],
    markupEligible: item.markupEligible
  }));
  record.percent = defaults.markupPercent;
  record.baseCents = baseCents;
  record.amountCents = amountCents;
  record.eligibleLines = eligibleLines.map(line => ({ name: line.name, category: line.category, amountCents: line.amountCents, basis: 'cost' }));
  record.sellPriceLinesExcluded = lines
    .filter(line => PRICE_BASIS_CATEGORIES.includes(line.category) && effectiveLinePriceBasis(line, ownerPricing) === 'sell_price')
    .map(line => line.name);
  return { eligibleLines, amountCents };
}

function effectiveMinimum(serviceType, pricing, defaults) {
  const serviceField = SERVICE_MINIMUM_FIELDS[serviceType];
  const serviceMinimum = serviceField ? checkedCents(pricing[serviceField], serviceField) : 0;
  const businessMinimum = checkedCents(defaults.minimumJobPrice, 'minimumJobPrice');
  return { amountCents: Math.max(serviceMinimum, businessMinimum), serviceField, serviceMinimum, businessMinimum };
}

function applyMinimum(lines, serviceType, pricing, defaults, record, basis, freeOffering) {
  const minimum = effectiveMinimum(serviceType, pricing, defaults);
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const effectiveMinimumCents = freeOffering ? 0 : minimum.amountCents;
  const adjustmentCents = Math.max(0, effectiveMinimumCents - subtotalCents);
  if (adjustmentCents > 0) {
    lines.push({
      name: 'Minimum price adjustment',
      category: 'minimum_adjustment',
      amountCents: adjustmentCents,
      taxable: false,
      ownerVisible: true,
      customerVisible: false,
      calculation: {
        evidenceVariant: 'fixed_amount',
        amountCents: adjustmentCents,
        subtotalBeforeMinimumCents: subtotalCents,
        effectiveMinimumCents: minimum.amountCents,
        roundedAmountCents: adjustmentCents
      }
    });
  }
  record.basis = basis;
  record.subtotalBeforeMinimumCents = subtotalCents;
  record.businessMinimumCents = minimum.businessMinimum;
  record.serviceMinimumField = minimum.serviceField;
  record.serviceMinimumCents = minimum.serviceMinimum;
  record.effectiveMinimumCents = effectiveMinimumCents;
  if (freeOffering) {
    record.bypassed = true;
    record.bypassReason = 'explicit_free_offering';
    record.configuredMinimumCents = minimum.amountCents;
  }
  record.adjustmentCents = adjustmentCents;
  record.applied = adjustmentCents > 0;
  return effectiveMinimumCents;
}

function applyTax(lines, ownerPricing, defaults, markupRecord, record) {
  const preTaxSubtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const nonMarkupLines = lines.filter(line => line.category !== 'markup');
  let taxableSubtotalCents = 0;
  let taxableMarkupCents = 0;

  if (defaults.taxMode === 'TAX_ALL') {
    taxableSubtotalCents = preTaxSubtotalCents;
    taxableMarkupCents = markupRecord.amountCents;
  } else if (defaults.taxMode === 'TAX_MATERIALS') {
    taxableSubtotalCents = nonMarkupLines.filter(line => line.taxable).reduce((sum, line) => sum + line.amountCents, 0);
    const taxableMarkupBaseCents = markupRecord.eligibleLines.filter(line => line.taxable).reduce((sum, line) => sum + line.amountCents, 0);
    taxableMarkupCents = markupAmount(taxableMarkupBaseCents, defaults);
    taxableSubtotalCents += taxableMarkupCents;
  }

  const taxMoney = exactMoneyResult(defaults.taxMode === 'TAX_NONE' ? exactDecimal(0) : exactPercentOf(taxableSubtotalCents, defaults.taxPercent), 'taxPercent', 'Tax configuration produced an invalid amount.');
  const taxCents = taxMoney.amountCents;
  if (taxCents > 0) {
    lines.push({
      name: 'Tax',
      category: 'tax',
      amountCents: taxCents,
      taxable: false,
      ownerVisible: true,
      customerVisible: false,
      calculation: {
        evidenceVariant: 'percentage_derived',
        taxMode: defaults.taxMode,
        percent: defaults.taxPercent,
        taxPercent: defaults.taxPercent,
        basisAmountCents: taxableSubtotalCents,
        taxableSubtotalCents,
        unroundedCents: taxMoney.unroundedCents,
        exactUnroundedCents: taxMoney.exactUnroundedCents,
        roundedAmountCents: taxCents
      }
    });
  }
  record.mode = defaults.taxMode;
  record.percent = defaults.taxPercent;
  record.preTaxSubtotalCents = preTaxSubtotalCents;
  record.taxableMarkupCents = taxableMarkupCents;
  record.taxableSubtotalCents = taxableSubtotalCents;
  record.nonTaxableSubtotalCents = preTaxSubtotalCents - taxableSubtotalCents;
  record.taxCents = taxCents;
  record.finalTotalCents = preTaxSubtotalCents + taxCents;
  record.lineTaxability = nonMarkupLines.map(line => ({ name: line.name, category: line.category, taxable: line.taxable, amountCents: line.amountCents }));
  return record.finalTotalCents;
}

function exactOperandFromEvidence(value, evidence, { positive = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (positive && value === 0)) return null;
  try {
    const exact = exactFromEvidence(evidence);
    if (!Object.is(exactToNumber(exact), value) || exactCompare(exact, 0) < (positive ? 1 : 0)) return null;
    return exact;
  } catch {
    return null;
  }
}

function validQuantityRateEvidence(calculation, expectedAmountCents, allowZeroQuantity = false) {
  if (!isPlainObject(calculation) || !(Number.isSafeInteger(calculation.rateCents) || ((calculation.ratePath==='price'||calculation.ratePath==='mowingBaseRatePerSqft'||offeringRatePath(calculation.ratePath)||scopeRatePath(calculation.ratePath)) && typeof calculation.rateCents==='number' && Number.isFinite(calculation.rateCents) && calculation.rateCents<=Number.MAX_SAFE_INTEGER)) || calculation.rateCents < 0 ||
      !Array.isArray(calculation.multipliers)) return false;
  const quantity = exactOperandFromEvidence(calculation.quantity, calculation.exactQuantity, { positive: !allowZeroQuantity });
  if (!quantity || denseArrayIssue(calculation.multipliers)) return false;
  const multipliers = [];
  for (const multiplier of calculation.multipliers) {
    if (!isPlainObject(multiplier)) return false;
    const exact = exactOperandFromEvidence(multiplier.value, multiplier.exactValue);
    if (!exact) return false;
    multipliers.push(exact);
  }
  try {
    const exactUnrounded = exactMultiply(quantity, calculation.rateCents, ...multipliers);
    return Number.isFinite(calculation.unroundedCents) &&
      Object.is(calculation.unroundedCents, exactToNumber(exactUnrounded)) &&
      exactEvidenceMatches(exactUnrounded, calculation.exactUnroundedCents) &&
      exactRound(exactUnrounded) === expectedAmountCents &&
      calculation.roundedAmountCents === expectedAmountCents;
  } catch {
    return false;
  }
}

function validFixedEvidence(calculation, expectedAmountCents) {
  if (calculation.roundedAmountCents !== expectedAmountCents) return false;
  if (Object.hasOwn(calculation, 'subtotalBeforeMinimumCents')) {
    return Number.isSafeInteger(calculation.subtotalBeforeMinimumCents) && calculation.subtotalBeforeMinimumCents >= 0 &&
      Number.isSafeInteger(calculation.effectiveMinimumCents) && calculation.effectiveMinimumCents >= 0 &&
      Math.max(0, calculation.effectiveMinimumCents - calculation.subtotalBeforeMinimumCents) === expectedAmountCents;
  }
  return Number.isSafeInteger(calculation.amountCents) && calculation.amountCents === expectedAmountCents;
}

function validPercentageEvidence(calculation, expectedAmountCents) {
  // Ordinary owner markup has no commercial cap. Other percentage contracts retain their bounds.
  if (!Number.isSafeInteger(calculation.basisAmountCents) || calculation.basisAmountCents < 0 ||
      typeof calculation.percent !== 'number' || !Number.isFinite(calculation.percent) ||
      calculation.percent < 0 || (calculation.mode !== 'markup' && calculation.percent > 500) ||
      (calculation.mode !== undefined && !['markup', 'margin'].includes(calculation.mode)) ||
      (calculation.mode === 'margin' && calculation.percent >= 100)) return false;
  try {
    const exactUnrounded = calculation.mode === 'margin'
      ? exactSubtract(
          exactDivide(calculation.basisAmountCents, exactSubtract(1, exactDivide(calculation.percent, 100))),
          calculation.basisAmountCents
        )
      : exactPercentOf(calculation.basisAmountCents, calculation.percent);
    return Number.isFinite(calculation.unroundedCents) &&
      Object.is(calculation.unroundedCents, exactToNumber(exactUnrounded)) &&
      exactEvidenceMatches(exactUnrounded, calculation.exactUnroundedCents) &&
      exactRound(exactUnrounded) === expectedAmountCents &&
      calculation.roundedAmountCents === expectedAmountCents;
  } catch {
    return false;
  }
}

function validCompositeEvidence(calculation, expectedAmountCents) {
  if (!Array.isArray(calculation.components) || calculation.components.length === 0 || denseArrayIssue(calculation.components)) return false;
  let total = 0;
  for (const component of calculation.components) {
    if (!isPlainObject(component) || !Number.isSafeInteger(component.amountCents) || component.amountCents < 0 ||
        !validQuantityRateEvidence(component, component.amountCents)) return false;
    total += component.amountCents;
    if (!Number.isSafeInteger(total)) return false;
  }
  return total === expectedAmountCents && calculation.roundedAmountCents === expectedAmountCents;
}

function validLineCalculationEvidence(line) {
  if (!isPlainObject(line) || !Number.isSafeInteger(line.amountCents) || line.amountCents < 0 || !isPlainObject(line.calculation)) return false;
  const validNoChargeReasons = new Set(['explicitly_free', 'included_in_another_price', 'zero_physical_scope', 'configured_zero_percentage', 'zero_basis', 'rounded_fractional_cent']);
  if (line.amountCents === 0) {
    if (line.noCharge !== true || !validNoChargeReasons.has(line.noChargeReason)) return false;
  } else if (Object.hasOwn(line, 'noCharge') || Object.hasOwn(line, 'noChargeReason')) {
    return false;
  }
  if (line.calculation.evidenceVariant === 'quantity_rate') {
    return validQuantityRateEvidence(line.calculation, line.amountCents, line.amountCents === 0 && line.noChargeReason === 'zero_physical_scope');
  }
  if (line.calculation.evidenceVariant === 'ranged') {
    try {
      validateRangedEvidence(line);
      return true;
    } catch {
      return false;
    }
  }
  if (line.calculation.evidenceVariant === 'fixed_amount') {
    return validFixedEvidence(line.calculation, line.amountCents);
  }
  if (line.calculation.evidenceVariant === 'percentage_derived') {
    return validPercentageEvidence(line.calculation, line.amountCents);
  }
  if (line.calculation.evidenceVariant === 'composite') {
    return validCompositeEvidence(line.calculation, line.amountCents);
  }
  return false;
}
function assertMoneyIntegrity(lines, finalTotalCents) {
  for (const line of lines) {
    if (!validLineCalculationEvidence(line)) {
      throw new QuoteReviewError(`${line.name || 'A line item'} contains invalid or irreproducible calculation evidence.`, {
        invalidOwnerFields: [line.calculation?.ratePath || 'pricingCalculation']
      });
    }
  }
  const roundedFractionalLines = lines.filter(line => line.amountCents === 0 && line.noChargeReason === 'rounded_fractional_cent');
  if (finalTotalCents === 0 && roundedFractionalLines.length) {
    const responsiblePaths = unique(roundedFractionalLines.flatMap(line => [
      line.calculation?.ratePath,
      ...(line.calculation?.components || []).map(component => component.ratePath)
    ]));
    throw new QuoteReviewError('Positive configured pricing rounded the entire quote below one cent.', {
      invalidOwnerFields: responsiblePaths.length ? responsiblePaths : ['pricingCalculation']
    });
  }
  const explicitNoChargeTotal = finalTotalCents === 0 && lines.length > 0 && lines.every(line =>
    line.amountCents === 0 && line.noCharge === true && line.noChargeReason !== 'rounded_fractional_cent'
  );
  if (!Number.isSafeInteger(finalTotalCents) || finalTotalCents < 0 || (finalTotalCents === 0 && !explicitNoChargeTotal)) {
    throw new QuoteReviewError('The final quote total is invalid.', { invalidOwnerFields: ['pricingCalculation'] });
  }
}

function runScenario({ variant, template, serviceType, pricing, ownerPricing, defaults, feeSelections, month, freeOffering }) {
  const lines = materializeScenarioLinesVNext(template.lineItems, variant);
  const record = {
    variant,
    order: [],
    fees: [],
    seasonal: {},
    markup: {},
    minimum: {},
    tax: {}
  };
  applyCommonFees(lines, template, ownerPricing, defaults, feeSelections, record.fees);
  record.order.push('fees');
  applySeasonalSurcharge(lines, ownerPricing, defaults, month, record.seasonal);
  record.order.push('seasonal');
  applyTaxability(lines, ownerPricing, defaults.taxMode);
  record.order.push('taxability');
  const markup = applyMarkup(lines, ownerPricing, defaults, record.markup);
  record.order.push('markup');

  let minimumCents;
  let finalTotalCents;
  if (defaults.taxMode === 'TAX_MATERIALS') {
    applyTax(lines, ownerPricing, defaults, markup, record.tax);
    record.order.push('tax');
    minimumCents = applyMinimum(lines, serviceType, pricing, defaults, record.minimum, 'post_tax', freeOffering);
    record.order.push('minimum');
    finalTotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
    record.tax.finalTotalCents = finalTotalCents;
  } else {
    const basis = defaults.taxMode === 'TAX_ALL' ? 'pre_tax' : 'post_markup';
    minimumCents = applyMinimum(lines, serviceType, pricing, defaults, record.minimum, basis, freeOffering);
    record.order.push('minimum');
    finalTotalCents = applyTax(lines, ownerPricing, defaults, markup, record.tax);
    if (defaults.taxMode === 'TAX_ALL') record.order.push('tax');
  }

  assertMoneyIntegrity(lines, finalTotalCents);
  record.lineItems = structuredClone(lines);
  record.finalTotalCents = finalTotalCents;
  return { lines, finalTotalCents, minimumCents, record };
}

function customerAmountRepresentationError(field, intendedCents, serializedDollars) {
  const message = 'The customer amount cannot be represented accurately within the numeric JSON monetary contract.';
  return new QuoteReviewError(message, {
    ownerDiagnostics: [{
      type: 'invalid', kind: 'customer_amount_representation',
      path: 'customerProjection.' + field, message,
      intendedCents: String(intendedCents), serializedDollars
    }]
  });
}

function toDollars(cents, field) {
  const dollars = cents / 100;
  // exactMultiply parses the Number's shortest decimal string, the same value
  // JSON.stringify emits for a finite nonnegative Number. Compare that decimal
  // with the intended cents using fractions, never a floating-point round trip.
  if (!Number.isSafeInteger(cents) || cents < 0 ||
      exactCompare(exactMultiply(dollars, 100), cents) !== 0) {
    throw customerAmountRepresentationError(field, cents, JSON.stringify(dollars));
  }
  return dollars;
}

function minimumCustomerFloor(minimumCents, defaults) {
  if (defaults.taxMode !== 'TAX_ALL') return minimumCents;
  return exactMoneyResult(
    exactAdd(minimumCents, exactPercentOf(minimumCents, defaults.taxPercent)),
    'taxPercent',
    'The taxed minimum cannot be represented safely in integer cents.'
  ).amountCents;
}

function roundedCustomerCents(valueCents, incrementCents) {
  try {
    if (exactCompare(valueCents, 0) <= 0) return 0;
    const roundedUnits = exactRound(exactDivide(valueCents, incrementCents));
    const roundedCents = exactMultiply(roundedUnits, incrementCents);
    if (!exactIsSafeInteger(roundedCents)) throw new RangeError('Rounded customer value is unsafe.');
    return exactToNumber(roundedCents);
  } catch {
    throw new QuoteReviewError('The displayed estimate range cannot be represented safely in integer cents.', { invalidOwnerFields: ['rangeBufferPercent'] });
  }
}

function rangeForStandardQuote(totalCents, minimumCents, defaults) {
  const buffer = defaults.rangeBufferPercent;
  const minimumFloorCents = minimumCustomerFloor(minimumCents, defaults);
  if (totalCents === 0) {
    return { lowCents: 0, midCents: 0, highCents: 0, minimumFloorCents, buffer };
  }
  const roundingIncrementCents = 1;
  let midCents = roundedCustomerCents(totalCents, roundingIncrementCents);
  let lowCents = roundedCustomerCents(exactMultiply(midCents, exactSubtract(1, exactDivide(buffer, 100))), roundingIncrementCents);
  let highCents = roundedCustomerCents(exactMultiply(midCents, exactAdd(1, exactDivide(buffer, 100))), roundingIncrementCents);
  lowCents = Math.max(lowCents, minimumFloorCents, 1);
  lowCents = Math.min(lowCents, totalCents);
  highCents = Math.max(highCents, totalCents, lowCents, 1);
  midCents = Math.max(midCents, lowCents, 1);
  midCents = Math.min(midCents, highCents);
  return { lowCents, midCents, highCents, minimumFloorCents, buffer };
}

function rangeForIntrinsicQuote(low, mid, high, defaults) {
  const lowCents = Math.min(low.finalTotalCents, mid.finalTotalCents, high.finalTotalCents);
  const highCents = Math.max(low.finalTotalCents, mid.finalTotalCents, high.finalTotalCents);
  const midCents = Math.min(Math.max(mid.finalTotalCents, lowCents), highCents);
  return { lowCents, midCents, highCents, minimumFloorCents: minimumCustomerFloor(low.minimumCents, defaults), buffer: null };
}

function assertRangeIntegrity(range) {
  const values = [range.lowCents, range.midCents, range.highCents, range.minimumFloorCents];
  if (values.some(value => !Number.isSafeInteger(value) || value < 0) ||
      range.lowCents > range.midCents || range.midCents > range.highCents ||
      range.lowCents < range.minimumFloorCents) {
    throw new QuoteReviewError('The displayed estimate range cannot be represented safely in integer cents.', {
      invalidOwnerFields: ['rangeBufferPercent']
    });
  }
  return range;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function customerSafeDriverCopy(value) {
  return typeof value === 'string' && value.trim().length > 0 && !INTERNAL_CUSTOMER_DRIVER_COPY.test(value);
}

function validatedMeasurementsFor(serviceType, normalized = {}) {
  const fields = MEASUREMENT_CONTRACTS[serviceType]?.fields || {};
  return Object.entries(normalized)
    .filter(([name]) => fields[name]?.unit)
    .map(([name, value]) => ({
      name,
      value: structuredClone(value),
      unit: fields[name].unit
    }));
}

function disclaimer(base, disclosures, skippedAddons) {
  const parts = [base, ...unique(disclosures)];
  if (skippedAddons.length) parts.push(`This estimate does not include: ${unique(skippedAddons).join(', ')}.`);
  return parts.join(' ');
}

function exclusionsMatch(options) {
  if (options.length <= 1) return true;
  const first = JSON.stringify(options[0].skippedAddons);
  return options.every(option => JSON.stringify(option.skippedAddons) === first);
}

function optionRun({ serviceType, customerInputs, ownerPricing, pricing, defaults, tierName, feeSelections, month, inherited }) {
  const customerValidation = validateCustomerInputs(serviceType, customerInputs, pricing, ownerPricing);
  if (!customerValidation.ok) {
    const normalizedScope = customerValidation.normalized ? structuredClone(customerValidation.normalized) : null;
    const validatedMeasurements = normalizedScope
      ? validatedMeasurementsFor(serviceType, normalizedScope)
      : [];
    throw new QuoteReviewError(customerValidation.reviewReason, {
      ...customerValidation,
      ownerDecisionRequired: inspectionOwnerDecisionsVNext(serviceType, customerInputs, pricing),
      normalizedScope,
      validatedMeasurements
    });
  }
  customerInputs = customerValidation.normalized;
  const ownerValidation = validateOwnerPricing(serviceType, customerInputs, pricing, ownerPricing, tierName);
  if (!ownerValidation.ok) throw new QuoteReviewError('Pricing not fully configured for the measured scope.', {
    ...ownerValidation,
    normalizedScope: structuredClone(customerValidation.normalized),
    validatedMeasurements: validatedMeasurementsFor(serviceType, customerValidation.normalized)
  });

  const skippedAddons = [];
  const ctx = {
    ownerPricing,
    tierName,
    priceBasisByCategory: ownerPricing.priceBasisByCategory,
    skipAddon(name) {
      if (!skippedAddons.includes(name)) skippedAddons.push(name);
      const prefix = tierName ? `${tierName} tier: ` : '';
      inherited.appliedRules.push(`${prefix}${name} skipped: price not configured`);
    }
  };
  const template = calculateServiceVNext(serviceType, customerInputs, pricing, ctx);
  template.feeScope.permit = customerInputs.permitRequired === true;
  if(ownerPricing.feeRules.permit==='when_scope_selected' && typeof customerInputs.permitRequired!=='boolean')throw new QuoteReviewError('Confirm whether this project requires the permit charge.',{missingCustomerFields:['permitRequired']});
  const feeValidation=validateFeeSelectionRequest(ownerPricing,feeSelections,template.replacedCommonFees,true);
  if(feeValidation.invalidOwnerFields.length||feeValidation.invalidCustomerFields.length)throw new QuoteReviewError('Common fee selection is missing or invalid.',feeValidation);
  const freeOffering = freeOfferingVNext(ownerPricing, tierName);
  const mid = runScenario({ variant: 'mid', template, serviceType, pricing, ownerPricing, defaults, feeSelections, month, freeOffering });
  const hasIntrinsicRange = template.lineItems.some(line => line.rangeAmountCents);
  let range;
  let scenarioRecords = { mid: mid.record };
  if (hasIntrinsicRange) {
    const low = runScenario({ variant: 'low', template, serviceType, pricing, ownerPricing, defaults, feeSelections, month, freeOffering });
    const high = runScenario({ variant: 'high', template, serviceType, pricing, ownerPricing, defaults, feeSelections, month, freeOffering });
    range = rangeForIntrinsicQuote(low, mid, high, defaults);
    scenarioRecords = { low: low.record, mid: mid.record, high: high.record };
  } else {
    range = rangeForStandardQuote(mid.finalTotalCents, mid.minimumCents, defaults);
  }

  assertRangeIntegrity(range);
  if ((!freeOffering && range.highCents === 0) || (freeOffering && range.highCents !== 0)) throw new QuoteReviewError('A zero total requires an explicit free complete offering; a free offering cannot contain a positive charge.', { invalidOwnerFields: ['zeroPricePolicy'] });
  const baseDisclaimer = ownerPricing.disclaimer || DEFAULT_DISCLAIMER;
  const optionDisclaimer = disclaimer(baseDisclaimer, template.disclosures, skippedAddons);
  const rankedFinancialDrivers = unique(
    mid.lines
      .filter(line => line.amountCents > 0 && CUSTOMER_DRIVER_LINE_CATEGORIES.has(line.category) && customerSafeDriverCopy(line.customerDriver))
      .sort((left, right) => right.amountCents - left.amountCents)
      .map(line => line.customerDriver.trim())
  ).slice(0, 4);
  const mandatoryDrivers = unique(template.priceDrivers.filter(customerSafeDriverCopy).map(value => value.trim()));
  const priceDrivers = unique([...rankedFinancialDrivers, ...mandatoryDrivers]);
  const calculationRecord = {
    engineVersion: ENGINE_VERSION,
    serviceId: ownerPricing.id ?? null,
    freeOffering,
    serviceType,
    tierName,
    normalizedCustomerInputs: structuredClone(customerInputs),
    measurements: structuredClone(template.measurements),
    quantityDerivations: structuredClone(template.quantityDerivations),
    ruleApplications: structuredClone(template.ruleApplications),
    assumptions: structuredClone(template.assumptions),
    disclosures: structuredClone(template.disclosures),
    lineItems: structuredClone(mid.lines),
    scenarios: scenarioRecords,
    range: {
      source: hasIntrinsicRange ? 'owner_configured_custom_range' : 'business_range_buffer',
      bufferPercent: range.buffer,
      effectiveRangeBufferPercent: range.buffer,
      rangeBufferUsed: range.buffer,
      minimumCustomerFloorCents: range.minimumFloorCents,
      lowCents: range.lowCents,
      midCents: range.midCents,
      highCents: range.highCents,
      exactMidScenarioTotalCents: mid.finalTotalCents
    }
  };
  const customerProjection = {
    tierName,
    ...displayedEstimates(calculationRecord.range),
    priceDrivers: structuredClone(priceDrivers),
    skippedAddons: structuredClone(skippedAddons),
    disclaimer: optionDisclaimer,
    rangeBufferUsed: range.buffer
  };
  calculationRecord.customerProjection = structuredClone(customerProjection);
  return {
    ...customerProjection,
    effectiveRangeBufferPercent: range.buffer,
    lineItems: structuredClone(mid.lines),
    calculationRecord
  };
}

export function generateQuoteVNext(input = {}) {
  const requestSnapshot = snapshotPlainData(input, 'quoteRequest');
  const requestIsPlainObject = requestSnapshot.ok;
  const callerDescriptor = ownDataValue(input, 'callerType');
  const fallbackRequest = { callerType: callerDescriptor.ok && callerDescriptor.value === 'owner' ? 'owner' : 'customer' };
  let {
    serviceType,
    customerInputs = {},
    ownerPricing = {},
    businessDefaults = {},
    callerType = 'customer',
    feeSelections = {},
    currentMonth = new Date().getMonth() + 1,
    allowInactiveOwnerPreview = false
  } = requestIsPlainObject ? requestSnapshot.value : fallbackRequest;
  const quoteId = crypto.randomUUID();
  const customerSafeOutput = callerType !== 'owner';
  const appliedRules = [];
  let unconfirmedOwnerFields = [];
  const urgencyFlags = derivedUrgency(serviceType, customerInputs);
  const finishReview = details => {
    const result = review({
      quoteId,
      serviceId: validServiceIdVNext(ownerPricing?.id) ? ownerPricing.id.toLowerCase() : typeof ownerPricing?.id === 'string' ? ownerPricing.id : null,
      serviceType,
      submittedCustomerInputs: cloneForEvidence(customerInputs, {}),
      unconfirmedOwnerFields,
      appliedRules,
      urgencyFlags,
      ...details
    });
    return customerSafeOutput ? sanitizeForCustomerVNext(result) : result;
  };
  const unsupportedRequestField = requestIsPlainObject
    ? Object.keys(requestSnapshot.value).find(field => !QUOTE_REQUEST_FIELDS.has(field))
    : null;
  if (unsupportedRequestField) return finishReview({ reviewReason: 'Quote request contains an unsupported field.', invalidCustomerFields: [`quoteRequest.${unsupportedRequestField}`] });

  if (!requestIsPlainObject) {
    const relativePath = requestSnapshot.errorPath.startsWith('quoteRequest.')
      ? requestSnapshot.errorPath.slice('quoteRequest.'.length)
      : requestSnapshot.errorPath;
    const ownerPath = /^(ownerPricing|businessDefaults|feeSelections\.owner)(?:\.|$)/.test(relativePath);
    return finishReview({
      reviewReason: `Quote request could not be read safely: ${requestSnapshot.reason}.`,
      ...(ownerPath ? { invalidOwnerFields: [relativePath] } : { invalidCustomerFields: [requestSnapshot.errorPath] })
    });
  }
  const nestedNonPlainPath = requestSnapshot.nonPlainPaths?.[0];
  if (nestedNonPlainPath) {
    let relativePath = nestedNonPlainPath;
    if (relativePath.startsWith('quoteRequest.')) {
      relativePath = relativePath.slice('quoteRequest.'.length);
    }
    const ownerPath = /^(ownerPricing|businessDefaults|feeSelections\.owner)(?:\.|$)/.test(relativePath);
    if (ownerPath) {
      let ownerFieldPath = relativePath;
      if (ownerFieldPath.startsWith('ownerPricing.pricing.')) {
        ownerFieldPath = ownerFieldPath.slice('ownerPricing.pricing.'.length);
      } else if (ownerFieldPath.startsWith('ownerPricing.')) {
        ownerFieldPath = ownerFieldPath.slice('ownerPricing.'.length);
      }
      return finishReview({
        reviewReason: 'Quote request must contain only plain data objects.',
        invalidOwnerFields: [ownerFieldPath]
      });
    }
    return finishReview({
      reviewReason: 'Quote request must contain only plain data objects.',
      invalidCustomerFields: [relativePath]
    });
  }
  const nonPlainPaths = new Set(requestSnapshot.nonPlainPaths || []);
  if (nonPlainPaths.has('quoteRequest.customerInputs')) return finishReview({ reviewReason: 'Customer inputs must be an object.', invalidCustomerFields: ['customerInputs'] });
  if (nonPlainPaths.has('quoteRequest.ownerPricing')) return finishReview({ reviewReason: 'Owner pricing must be an object.', invalidOwnerFields: ['ownerPricing'] });
  if (nonPlainPaths.has('quoteRequest.businessDefaults')) return finishReview({ reviewReason: 'Business defaults must be an object.', invalidOwnerFields: ['businessDefaults'] });
  if (!['owner', 'customer'].includes(callerType)) return finishReview({ reviewReason: 'Caller type is invalid.', invalidCustomerFields: ['callerType'] });
  if (!SERVICE_TYPES.includes(serviceType)) return finishReview({ reviewReason: 'Unsupported service type.', invalidCustomerFields: ['serviceType'] });
  if (!isPlainObject(customerInputs)) return finishReview({ reviewReason: 'Customer inputs must be an object.', invalidCustomerFields: ['customerInputs'] });
  if (!isPlainObject(ownerPricing)) return finishReview({ reviewReason: 'Owner pricing must be an object.', invalidOwnerFields: ['ownerPricing'] });
  if (!isPlainObject(businessDefaults)) return finishReview({ reviewReason: 'Business defaults must be an object.', invalidOwnerFields: ['businessDefaults'] });
  ownerPricing = canonicalServiceIdentityVNext(ownerPricing);
  const identityDiagnostics = identityDiagnosticsVNext(ownerPricing, serviceType);
  if (identityDiagnostics.length) return finishReview({reviewReason:'Service identity and type do not agree.',ownerDiagnostics:identityDiagnostics,missingOwnerFields:identityDiagnostics.filter(d=>d.type==='missing').map(d=>d.path),invalidOwnerFields:identityDiagnostics.filter(d=>d.type!=='missing').map(d=>d.path)});
  const ownerPreview = callerType === 'owner' && allowInactiveOwnerPreview === true;
  if (ownerPricing.active !== true && !ownerPreview) return finishReview({ reviewReason: 'This service is not active for customer quoting.', invalidOwnerFields: ['active'] });
  let basePricing;
  try {
    basePricing = extractPricing(ownerPricing, serviceType);
  } catch {
    return finishReview({ reviewReason: 'Pricing contains values that cannot be validated.', invalidOwnerFields: ['pricing'] });
  }

  if (['AI_SUGGESTED', 'AI_INTERVIEW'].includes(ownerPricing.source)) {
    const confirmed = isPlainObject(ownerPricing.confirmedFields) ? ownerPricing.confirmedFields : {};
    const unconfirmed = aiConfirmationFieldsVNext(ownerPricing, basePricing)
      .filter(field => !hasCurrentApprovalVNext(ownerPricing, basePricing, field));
    unconfirmedOwnerFields = unique(unconfirmed);
    if (unconfirmedOwnerFields.length && !ownerPreview) {
      return finishReview({
        reviewReason: 'AI-suggested pricing must be confirmed by the owner before customer quoting.',
        missingOwnerFields: unconfirmedOwnerFields
      });
    }
    if (unconfirmedOwnerFields.length) appliedRules.push(`Owner preview uses unconfirmed AI draft fields: ${unconfirmedOwnerFields.join(', ')}`);
  }

  if (serviceType === 'CUSTOM') {
    const configuredName = typeof ownerPricing.service === 'string' ? ownerPricing.service.trim() : '';
    const requestedName = typeof customerInputs.service === 'string' ? customerInputs.service.trim() : '';
    if (!configuredName || configuredName === 'CUSTOM') return finishReview({ reviewReason: 'The custom service name is not configured.', invalidOwnerFields: ['service'] });
    if (!requestedName || requestedName.toLowerCase() !== configuredName.toLowerCase()) {
      return finishReview({
        reviewReason: 'The requested custom service does not exactly match the configured offering.',
        invalidCustomerFields: ['service'],
        inspectionFirst: true
      });
    }
  }

  const defaultValidation = validateBusinessDefaults(businessDefaults);
  if (!defaultValidation.ok) {
    const ownerDiagnostics = defaultValidation.diagnostics.map(item => ({ ...item, path: `businessDefaults.${item.path}` }));
    return finishReview({
      reviewReason: 'Business-wide pricing settings are incomplete or invalid.',
      missingOwnerFields: ownerDiagnostics.filter(item => item.type === 'missing').map(item => item.path),
      invalidOwnerFields: ownerDiagnostics.filter(item => ['invalid', 'unsupported'].includes(item.type)).map(item => item.path),
      unsupportedOwnerFields: ownerDiagnostics.filter(item => item.type === 'unsupported').map(item => item.path),
      ownerDiagnostics,
      validationMessages: defaultValidation.errors
    });
  }
  const ruleDiagnostics = validateServiceRulesDetailed(ownerPricing, serviceType);
  const tierDiagnostics = validateTierDefinitionsDetailedVNext(ownerPricing, serviceType);
  const configurationDiagnostics = [...ruleDiagnostics, ...tierDiagnostics];
  if (configurationDiagnostics.length) {
    const perTier = new Map();
    for (const item of tierDiagnostics) {
      const index = Number(item.path.match(/^tiers\.(\d+)/)?.[1]);
      const key = Number.isInteger(index) ? index : -1;
      if (!perTier.has(key)) perTier.set(key, []);
      perTier.get(key).push(item);
    }
    const failedTierDiagnostics = [...perTier.entries()].map(([index, diagnostics]) => ({
      tierName: index >= 0 ? ownerPricing.tiers?.[index]?.name || null : null,
      reviewReason: 'Tier definition is incomplete or invalid.',
      missingOwnerFields: diagnostics.filter(item => item.type === 'missing').map(item => item.path),
      invalidOwnerFields: diagnostics.filter(item => ['invalid', 'unsupported', 'cross_field'].includes(item.type)).map(item => item.path),
      unsupportedOwnerFields: diagnostics.filter(item => item.type === 'unsupported').map(item => item.path),
      crossFieldOwnerFields: diagnostics.filter(item => item.type === 'cross_field').map(item => item.path),
      ownerDiagnostics: diagnostics,
      validationMessages: diagnostics.map(item => item.message)
    }));
    return finishReview({
      reviewReason: 'Service pricing rules are incomplete or invalid.',
      missingOwnerFields: configurationDiagnostics.filter(item => item.type === 'missing').map(item => item.path),
      invalidOwnerFields: configurationDiagnostics.filter(item => ['invalid', 'unsupported', 'cross_field'].includes(item.type)).map(item => item.path),
      unsupportedOwnerFields: configurationDiagnostics.filter(item => item.type === 'unsupported').map(item => item.path),
      crossFieldOwnerFields: configurationDiagnostics.filter(item => item.type === 'cross_field').map(item => item.path),
      ownerDiagnostics: configurationDiagnostics,
      failedTierDiagnostics,
      validationMessages: configurationDiagnostics.map(item => item.message)
    });
  }
  const feeSelectionValidation = validateFeeSelectionRequest(ownerPricing, feeSelections);
  if (feeSelectionValidation.invalidOwnerFields.length || feeSelectionValidation.invalidCustomerFields.length) {
    return finishReview({
      reviewReason: 'Fee selections are incomplete or invalid.',
      ...feeSelectionValidation
    });
  }
  if (!Number.isInteger(currentMonth) || currentMonth < 1 || currentMonth > 12) return finishReview({ reviewReason: 'Quote month is invalid.', invalidCustomerFields: ['currentMonth'] });

  const tiers = Array.isArray(ownerPricing.tiers) && ownerPricing.tiers.length
    ? ownerPricing.tiers
    : [{ name: null, overrides: {} }];
  const options = [];
  const failed = [];
  for (const [tierIndex, tier] of tiers.entries()) {
    let pricing = basePricing;
    try {
      pricing = mergePricingForValidationVNext(basePricing, tier.overrides || {});
      options.push(optionRun({
        serviceType,
        customerInputs,
        ownerPricing,
        pricing,
        defaults: businessDefaults,
        tierName: tier.name,
        feeSelections,
        month: currentMonth,
        inherited: { appliedRules, urgencyFlags }
      }));
    } catch (error) {
      if (!(error instanceof QuoteReviewError)) {
        const tierPath = Array.isArray(ownerPricing.tiers) && ownerPricing.tiers.length
          ? `tiers.${tierIndex}.overrides`
          : 'pricing';
        error = new QuoteReviewError('Tier pricing contains values that cannot be validated safely.', { invalidOwnerFields: [tierPath] });
      }
      if (!error.normalizedScope) {
        const customerValidation = validateCustomerInputs(serviceType, customerInputs, pricing, ownerPricing);
        if (customerValidation.ok) {
          error.normalizedScope = structuredClone(customerValidation.normalized);
          error.validatedMeasurements = validatedMeasurementsFor(serviceType, customerValidation.normalized);
        }
      }
      failed.push({ tierName: tier.name, error });
      if (tier.name) appliedRules.push(`${tier.name} tier skipped: ${error.reviewReason}`);
    }
  }
  const failedTierDiagnostics = failed.map(({ tierName, error }) => ({
    tierName,
    reviewReason: error.reviewReason,
    missingCustomerFields: unique(error.missingCustomerFields || []),
    invalidCustomerFields: unique(error.invalidCustomerFields || []),
    missingOwnerFields: unique(error.missingOwnerFields || []),
    invalidOwnerFields: unique([...(error.invalidOwnerFields || []), ...(error.unsupportedOwnerFields || []), ...(error.unexpectedOwnerFields || [])]),
    unsupportedOwnerFields: unique([...(error.unsupportedOwnerFields || []), ...(error.unexpectedOwnerFields || [])]),
    crossFieldOwnerFields: unique(error.crossFieldOwnerFields || []),
    ownerDiagnostics: error.ownerDiagnostics || [],
    ownerDecisionRequired: error.ownerDecisionRequired || [],
    validationMessages: error.validationMessages || [],
    normalizedScope: error.normalizedScope || null,
    validatedMeasurements: error.validatedMeasurements || [],
    inspectionFirst: error.inspectionFirst === true
  }));

  if (!options.length) {
    const firstFailure = failed[0]?.error || new QuoteReviewError('No pricing option could produce a complete quote.');
    const collect = field => unique(failed.flatMap(item => item.error?.[field] || []));
    return finishReview({
      reviewReason: firstFailure.reviewReason,
      missingCustomerFields: collect('missingCustomerFields'),
      invalidCustomerFields: collect('invalidCustomerFields'),
      missingOwnerFields: collect('missingOwnerFields'),
      invalidOwnerFields: unique([...collect('invalidOwnerFields'), ...collect('unsupportedOwnerFields'), ...collect('unexpectedOwnerFields')]),
      unsupportedOwnerFields: unique([...collect('unsupportedOwnerFields'), ...collect('unexpectedOwnerFields')]),
      crossFieldOwnerFields: collect('crossFieldOwnerFields'),
      ownerDiagnostics: failed.flatMap(item => item.error.ownerDiagnostics || []),
      ownerDecisionRequired: failed.flatMap(item => item.error.ownerDecisionRequired || []),
      failedTierDiagnostics,
      validationMessages: collect('validationMessages'),
      normalizedScope: firstFailure.normalizedScope || null,
      validatedMeasurements: firstFailure.validatedMeasurements || [],
      inspectionFirst: failed.some(item => item.error.inspectionFirst === true)
    });
  }

  const first = options[0];
  const baseDisclaimer = ownerPricing.disclaimer || DEFAULT_DISCLAIMER;
  const topDisclaimer = exclusionsMatch(options) ? first.disclaimer : disclaimer(baseDisclaimer, [], []);
  const result = {
    resultType: 'INSTANT_ESTIMATE_READY',
    engineVersion: ENGINE_VERSION,
    serviceId: ownerPricing.id ?? null,
    quoteId,
    serviceType,
    submittedCustomerInputs: structuredClone(customerInputs),
    unconfirmedOwnerFields,
    lowEstimate: first.lowEstimate,
    midEstimate: first.midEstimate,
    highEstimate: first.highEstimate,
    options,
    priceDrivers: first.priceDrivers,
    rangeBufferUsed: first.rangeBufferUsed,
    effectiveRangeBufferPercent: first.effectiveRangeBufferPercent,
    lineItems: first.lineItems,
    disclaimer: topDisclaimer,
    appliedRules,
    urgencyFlags,
    failedTierDiagnostics,
    ...(failedTierDiagnostics.length ? { optionAvailabilityNotice: FEWER_OPTIONS_NOTICE } : {}),
    customerEligible: ownerPricing.active === true && unconfirmedOwnerFields.length === 0,
    calculationRecord: {
      engineVersion: ENGINE_VERSION,
      serviceId: ownerPricing.id ?? null,
      quoteId,
      serviceType,
      options: structuredClone(options.map(option => option.calculationRecord)),
      ownerConfiguration: cloneConfigurationEvidence({ ...ownerPricing, pricing: basePricing }),
      financialInputs: structuredClone({ businessDefaults, feeSelections, currentMonth }),
      customerEligible: ownerPricing.active === true && unconfirmedOwnerFields.length === 0,
    }
  };
  result.options = structuredClone(options);
  result.priceDrivers = structuredClone(first.priceDrivers);
  result.lineItems = structuredClone(first.lineItems);
  return customerSafeOutput ? sanitizeForCustomerVNext(result) : result;
}
const CUSTOMER_OPTION_FIELDS = [
  'tierName', 'lowEstimate', 'midEstimate', 'highEstimate',
  'priceDrivers', 'skippedAddons', 'disclaimer', 'rangeBufferUsed'
];

function hasOwnValue(source, key) {
  return isPlainObject(source) && Object.hasOwn(source, key) && source[key] !== undefined;
}

function denseArray(value, predicate, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return false;
  if (denseArrayIssue(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!predicate(value[index])) return false;
  }
  return true;
}

function validCustomerDollars(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return false;
  try {
    const cents = exactMultiply(value, 100);
    return exactCompare(cents, 0) >= 0 && exactIsSafeInteger(cents);
  } catch {
    return false;
  }
}

function validEstimateShape(source) {
  if (!isPlainObject(source)) return false;
  const fields = ['lowEstimate', 'midEstimate', 'highEstimate'];
  if (fields.some(field => !hasOwnValue(source, field) || !validCustomerDollars(source[field]))) return false;
  return source.lowEstimate <= source.midEstimate && source.midEstimate <= source.highEstimate;
}

function validCustomerDriverList(value) {
  return denseArray(value, item => customerSafeDriverCopy(item), { allowEmpty: false });
}

function validSkippedAddonList(value) {
  return denseArray(value, item => typeof item === 'string' && CUSTOMER_SKIPPED_ADDONS.has(item));
}

function validRangeBuffer(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 25);
}

function plainDataEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || denseArrayIssue(left) || denseArrayIssue(right)) return false;
    return left.every((value, index) => plainDataEqual(value, right[index]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every(key => plainDataEqual(left[key], right[key]));
}

function validScenarioRecord(scenario, variant) {
  if (!isPlainObject(scenario) || scenario.variant !== variant) return false;
  if (!Number.isSafeInteger(scenario.finalTotalCents) || scenario.finalTotalCents < 0) return false;
  if (!denseArray(scenario.lineItems, validLineCalculationEvidence, { allowEmpty: false })) return false;
  let lineTotalCents = 0;
  for (const line of scenario.lineItems) {
    lineTotalCents += line.amountCents;
    if (!Number.isSafeInteger(lineTotalCents)) return false;
  }
  return lineTotalCents === scenario.finalTotalCents;
}

function standardRangeFromEvidence(totalCents, minimumFloorCents, buffer) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 ||
      !Number.isSafeInteger(minimumFloorCents) || minimumFloorCents < 0 ||
      typeof buffer !== 'number' || !Number.isFinite(buffer) || buffer < 0 || buffer > 25) return null;
  if (totalCents === 0) {
    return minimumFloorCents === 0
      ? { lowCents: 0, midCents: 0, highCents: 0 }
      : null;
  }
  try {
    const roundingIncrementCents = 1;
    let midCents = roundedCustomerCents(totalCents, roundingIncrementCents);
    let lowCents = roundedCustomerCents(exactMultiply(midCents, exactSubtract(1, exactDivide(buffer, 100))), roundingIncrementCents);
    let highCents = roundedCustomerCents(exactMultiply(midCents, exactAdd(1, exactDivide(buffer, 100))), roundingIncrementCents);
    lowCents = Math.min(Math.max(lowCents, minimumFloorCents, 1), totalCents);
    highCents = Math.max(highCents, totalCents, lowCents, 1);
    midCents = Math.min(Math.max(midCents, lowCents, 1), highCents);
    const values = [lowCents, midCents, highCents];
    return values.every(Number.isSafeInteger) ? { lowCents, midCents, highCents } : null;
  } catch {
    return null;
  }
}

function calculationEvidenceMatchesOption(option, record, range) {
  if (record.engineVersion !== ENGINE_VERSION || !SERVICE_TYPES.includes(record.serviceType) || !Object.is(record.tierName, option.tierName)) return false;
  if (!plainDataEqual(option.lineItems, record.lineItems)) return false;
  if (!Number.isSafeInteger(range.minimumCustomerFloorCents) || range.minimumCustomerFloorCents < 0) return false;
  if (!Object.is(range.bufferPercent, option.rangeBufferUsed) ||
      !Object.is(range.effectiveRangeBufferPercent, option.rangeBufferUsed) ||
      !Object.is(range.rangeBufferUsed, option.rangeBufferUsed)) return false;
  const scenarioKeys = isPlainObject(record.scenarios) ? Object.keys(record.scenarios).sort() : [];
  let expectedRange;
  if (range.source === 'business_range_buffer') {
    if (!plainDataEqual(scenarioKeys, ['mid']) || option.rangeBufferUsed === null || !validScenarioRecord(record.scenarios.mid, 'mid')) return false;
    expectedRange = standardRangeFromEvidence(
      record.scenarios.mid.finalTotalCents,
      range.minimumCustomerFloorCents,
      option.rangeBufferUsed
    );
  } else if (range.source === 'owner_configured_custom_range') {
    if (!plainDataEqual(scenarioKeys, ['high', 'low', 'mid']) || option.rangeBufferUsed !== null) return false;
    if (!validScenarioRecord(record.scenarios.low, 'low') ||
        !validScenarioRecord(record.scenarios.mid, 'mid') ||
        !validScenarioRecord(record.scenarios.high, 'high')) return false;
    const totals = [
      record.scenarios.low.finalTotalCents,
      record.scenarios.mid.finalTotalCents,
      record.scenarios.high.finalTotalCents
    ];
    expectedRange = {
      lowCents: Math.min(...totals),
      midCents: Math.min(Math.max(totals[1], Math.min(...totals)), Math.max(...totals)),
      highCents: Math.max(...totals)
    };
  } else {
    return false;
  }
  if (!expectedRange || !plainDataEqual(record.lineItems, record.scenarios.mid.lineItems)) return false;
  if (!Number.isSafeInteger(range.exactMidScenarioTotalCents) ||
      range.exactMidScenarioTotalCents !== record.scenarios.mid.finalTotalCents ||
      range.minimumCustomerFloorCents > expectedRange.lowCents) return false;
  return ['lowCents', 'midCents', 'highCents'].every(field => range[field] === expectedRange[field]);
}

function displayedEstimates(range) {
  const exactSingle = range.source === 'business_range_buffer' && range.bufferPercent === 0 &&
    range.lowCents === range.midCents && range.midCents === range.highCents;
  if (exactSingle) return { lowEstimate: toDollars(range.lowCents, 'lowEstimate'), midEstimate: toDollars(range.midCents, 'midEstimate'), highEstimate: toDollars(range.highCents, 'highEstimate') };
  const low = BigInt(range.lowCents) / 100n;
  const high = (BigInt(range.highCents) + 99n) / 100n;
  const mid = (BigInt(range.midCents) + 50n) / 100n;
  // Preserve cents when whole dollars would imply free scope or undercut the
  // tax-mode customer minimum. Raising the low instead would narrow the range.
  const belowMinimum = low * 100n < BigInt(range.minimumCustomerFloorCents);
  if (belowMinimum || (range.lowCents > 0 && low === 0n) || (range.midCents > 0 && mid === 0n) || (range.highCents > 0 && high === 0n)) {
    return { lowEstimate: toDollars(range.lowCents, 'lowEstimate'), midEstimate: toDollars(range.midCents, 'midEstimate'), highEstimate: toDollars(range.highCents, 'highEstimate') };
  }
  if (high * 100n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw customerAmountRepresentationError('highEstimate', high * 100n, JSON.stringify(Number(high)));
  }
  return {
    lowEstimate: toDollars(Number(low * 100n), 'lowEstimate'),
    midEstimate: toDollars(Number(mid * 100n), 'midEstimate'),
    highEstimate: toDollars(Number(high * 100n), 'highEstimate')
  };
}

function validCustomerOption(option, expectedServiceType) {
  const validTierName = option?.tierName === null ||
    (typeof option?.tierName === 'string' && option.tierName.length > 0 && option.tierName === option.tierName.trim());
  if (!validEstimateShape(option) || !hasOwnValue(option, 'tierName') || !validTierName) return false;
  if (!hasOwnValue(option, 'priceDrivers') || !validCustomerDriverList(option.priceDrivers)) return false;
  if (!hasOwnValue(option, 'skippedAddons') || !validSkippedAddonList(option.skippedAddons)) return false;
  if (!hasOwnValue(option, 'disclaimer') || typeof option.disclaimer !== 'string' || !option.disclaimer.trim()) return false;
  if (!hasOwnValue(option, 'rangeBufferUsed') || !validRangeBuffer(option.rangeBufferUsed)) return false;
  const record = option.calculationRecord;
  const range = record?.range;
  const projection = record?.customerProjection;
  if (!isPlainObject(record) || record.serviceType !== expectedServiceType || !isPlainObject(range) || !isPlainObject(projection)) return false;
  if (!calculationEvidenceMatchesOption(option, record, range)) return false;
  const displayed = displayedEstimates(range);
  for (const [estimateField, centsField] of [
    ['lowEstimate', 'lowCents'],
    ['midEstimate', 'midCents'],
    ['highEstimate', 'highCents']
  ]) {
    if (!Number.isSafeInteger(range[centsField]) || range[centsField] < 0 || !Object.is(option[estimateField], displayed[estimateField])) return false;
    if (!Object.is(projection[estimateField], option[estimateField])) return false;
  }
  if (!Object.is(projection.rangeBufferUsed, option.rangeBufferUsed)) return false;
  if (!Object.is(projection.tierName, option.tierName)) return false;
  if (projection.disclaimer !== option.disclaimer) return false;
  if (!plainDataEqual(projection.priceDrivers, option.priceDrivers)) return false;
  if (!plainDataEqual(projection.skippedAddons, option.skippedAddons)) return false;
  return true;
}

function rootCalculationRecordMatches(result) {
  const configuration=result.calculationRecord?.ownerConfiguration;
  if(!isPlainObject(configuration)||configuration.active!==true||identityDiagnosticsVNext(configuration, result.serviceType).length)return false;
  for (const option of result.options) {
    const inputs=option.calculationRecord.normalizedCustomerInputs;
    if (!plainDataEqual(inputs,canonicalCustomerIdentityVNext(result.submittedCustomerInputs))) return false;
    const tier=option.tierName===null?null:configuration.tiers?.find(t=>t.name===option.tierName);
    if (option.tierName!==null && !tier) return false;
    const pricing=tier?mergePricingVNext(configuration.pricing,tier.overrides):configuration.pricing;
    if (!validateCustomerInputs(result.serviceType,inputs,pricing,configuration).ok ||
        !validateOwnerPricing(result.serviceType,inputs,pricing,configuration,option.tierName).ok) return false;
    const free = freeOfferingVNext(configuration, option.tierName);
    if (option.calculationRecord.freeOffering !== free || (option.calculationRecord.range.highCents === 0) !== free) return false;
  }
  if(['AI_SUGGESTED','AI_INTERVIEW'].includes(configuration.source)){
    if(configuration.serviceType!==result.serviceType||!isPlainObject(configuration.pricing))return false;
    if(aiConfirmationFieldsVNext(configuration,configuration.pricing).some(field=>!hasCurrentApprovalVNext(configuration,configuration.pricing,field)))return false;
  }
  const record = result.calculationRecord;
  if (!isPlainObject(record) ||
      result.engineVersion !== ENGINE_VERSION || record.engineVersion !== ENGINE_VERSION ||
      record.serviceId !== result.serviceId || result.serviceId !== (configuration.id ?? null) ||
      record.quoteId !== result.quoteId ||
      record.serviceType !== result.serviceType ||
      !denseArray(record.options, item => isPlainObject(item), { allowEmpty: false }) ||
      record.customerEligible !== result.customerEligible ||
      record.options.length !== result.options.length) return false;
  return record.options.every((optionRecord, index) =>
    optionRecord.serviceId === result.serviceId && plainDataEqual(optionRecord, result.options[index].calculationRecord)
  );
}

// Recompute from the retained configuration and complete financial request.
// An internally consistent different price is not evidence for this price book.
function configuredCalculationMatches(result) {
  const inputs=result.calculationRecord.financialInputs;
  if(!isPlainObject(inputs)||Object.keys(inputs).length!==3||!['businessDefaults','feeSelections','currentMonth'].every(k=>Object.hasOwn(inputs,k)))return false;
  const reproduced=generateQuoteVNext({serviceType:result.serviceType,customerInputs:result.submittedCustomerInputs,ownerPricing:result.calculationRecord.ownerConfiguration,...inputs,callerType:'owner'});
  if(reproduced.resultType!=='INSTANT_ESTIMATE_READY'||reproduced.customerEligible!==true)return false;
  return plainDataEqual(reproduced.options,result.options) &&
    ['lowEstimate','midEstimate','highEstimate','rangeBufferUsed','effectiveRangeBufferPercent','priceDrivers','lineItems','disclaimer','optionAvailabilityNotice'].every(k=>plainDataEqual(reproduced[k],result[k]));
}

function customerProjectionMatchesFirstOption(result) {
  const first = result.options[0];
  for (const field of ['lowEstimate', 'midEstimate', 'highEstimate', 'rangeBufferUsed']) {
    if (!Object.is(result[field], first[field])) return false;
  }
  if (!plainDataEqual(result.priceDrivers, first.priceDrivers)) return false;
  if (!plainDataEqual(result.lineItems, first.lineItems)) return false;
  if (exclusionsMatch(result.options) && result.disclaimer !== first.disclaimer) return false;
  const tierNames = result.options.map(option => option.tierName);
  if (result.options.length > 1 && tierNames.some(name => name === null)) return false;
  const namedTiers = tierNames.filter(name => name !== null);
  if (new Set(namedTiers).size !== namedTiers.length) return false;
  return true;
}

function customerReviewPayload(result) {
  const payload = {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    customerMessage: 'We received your request. Someone will follow up to complete or verify the estimate.'
  };
  const quoteId = ownDataValue(result, 'quoteId');
  if (quoteId.ok && quoteId.present && typeof quoteId.value === 'string' && quoteId.value.trim()) payload.quoteId = quoteId.value;
  return payload;
}

function pickOwn(source, keys) {
  return Object.fromEntries(keys.filter(key => hasOwnValue(source, key)).map(key => [key, source[key]]));
}

export function sanitizeForCustomerVNext(result) {
  const snapshot = snapshotPlainData(result, 'internalResult');
  if (!snapshot.ok || snapshot.nonPlainPaths.length) return customerReviewPayload(result);
  result = snapshot.value;
  try {
    const validReady = isPlainObject(result) &&
      hasOwnValue(result, 'resultType') && result.resultType === 'INSTANT_ESTIMATE_READY' &&
      hasOwnValue(result, 'quoteId') && typeof result.quoteId === 'string' && result.quoteId.trim() &&
      hasOwnValue(result, 'serviceType') && SERVICE_TYPES.includes(result.serviceType) &&
      validEstimateShape(result) &&
      hasOwnValue(result, 'customerEligible') && result.customerEligible === true &&
      hasOwnValue(result, 'unconfirmedOwnerFields') && denseArray(result.unconfirmedOwnerFields, item => typeof item === 'string') && result.unconfirmedOwnerFields.length === 0 &&
      hasOwnValue(result, 'priceDrivers') && validCustomerDriverList(result.priceDrivers) &&
      hasOwnValue(result, 'disclaimer') && typeof result.disclaimer === 'string' && result.disclaimer.trim() &&
      hasOwnValue(result, 'rangeBufferUsed') && validRangeBuffer(result.rangeBufferUsed) &&
      hasOwnValue(result, 'options') && denseArray(result.options, option => validCustomerOption(option, result.serviceType), { allowEmpty: false }) &&
      rootCalculationRecordMatches(result) &&
      configuredCalculationMatches(result) &&
      customerProjectionMatchesFirstOption(result) &&
      (!Object.hasOwn(result, 'optionAvailabilityNotice') || result.optionAvailabilityNotice === FEWER_OPTIONS_NOTICE);
    if (!validReady) return customerReviewPayload(result);
    return structuredClone({
      ...pickOwn(result, ['resultType', 'lowEstimate', 'midEstimate', 'highEstimate', 'priceDrivers', 'disclaimer', 'quoteId', 'optionAvailabilityNotice', 'rangeBufferUsed']),
      options: result.options.map(option => pickOwn(option, CUSTOMER_OPTION_FIELDS))
    });
  } catch {
    return customerReviewPayload(result);
  }
}

function leadServiceIdentityMatches(request,result) {
  const explicit=Object.hasOwn(request,'serviceId'),configured=isPlainObject(request.ownerPricing);
  if(validServiceIdVNext(result.serviceId))return (explicit||configured) &&
    (!explicit||sameServiceIdVNext(request.serviceId,result.serviceId)) && (!configured||sameServiceIdVNext(request.ownerPricing.id,result.serviceId));
  const resolution=result.serviceResolution;
  return result.serviceId===null && explicit && request.serviceId===null && !configured &&
    isPlainObject(resolution) && Object.keys(resolution).length===2 && resolution.serviceId===null && ['missing','ambiguous'].includes(resolution.status) &&
    result.ownerDiagnostics?.some(d=>d.kind===(resolution.status==='missing'?'missing_service':'duplicate_service') || (resolution.status==='ambiguous'&&d.kind==='duplicate_service_id'));
}

export function buildInternalLeadVNext(input = {}) {
  const snapshot = snapshotPlainData(input, 'leadInput');
  if (!snapshot.ok || snapshot.nonPlainPaths.length) {
    throw new TypeError('An unsanitized internal review result is required before building a lead.');
  }
  input = snapshot.value;
  const { request = {}, internalResult } = input;
  if (isPlainObject(internalResult) && validServiceIdVNext(internalResult.serviceId)) internalResult.serviceId = internalResult.serviceId.toLowerCase();
  const requiredOwnFields = [
    'resultType', 'quoteId', 'serviceType', 'reviewReason', 'submittedCustomerInputs',
    'normalizedScope', 'validatedMeasurements', 'urgencyFlags', 'engineVersion', 'serviceId'
  ];
  if (
    !isPlainObject(request) ||
    !isPlainObject(internalResult) ||
    requiredOwnFields.some(field => !Object.hasOwn(internalResult, field)) ||
    internalResult.resultType !== 'ESTIMATE_REQUIRES_REVIEW' ||
    internalResult.engineVersion !== ENGINE_VERSION ||
    !plainDataEqual(internalResult.urgencyFlags, derivedUrgency(request.serviceType, request.customerInputs)) ||
    !leadServiceIdentityMatches(request, internalResult) ||
    typeof internalResult.reviewReason!=='string' || !internalResult.reviewReason.trim() ||
    !(internalResult.inspectionFirst===true || ['missingCustomerFields','invalidCustomerFields','missingOwnerFields','invalidOwnerFields','unsupportedOwnerFields','crossFieldOwnerFields','unconfirmedOwnerFields'].some(key=>denseArray(internalResult[key],v=>typeof v==='string'&&v.trim())&&internalResult[key].length) || ['ownerDiagnostics','ownerDecisionRequired'].some(key=>denseArray(internalResult[key],v=>isPlainObject(v)&&typeof v.message==='string'&&v.message.trim())&&internalResult[key].length)) ||
    request.serviceType!==internalResult.serviceType || !isPlainObject(request.customerInputs) || !equalApprovalDataVNext(request.customerInputs,internalResult.submittedCustomerInputs) ||
    typeof internalResult.quoteId !== 'string' || !internalResult.quoteId.trim() ||
    !SERVICE_TYPES.includes(internalResult.serviceType) ||
    !isPlainObject(internalResult.submittedCustomerInputs) ||
    !(internalResult.normalizedScope === null || isPlainObject(internalResult.normalizedScope)) ||
    !denseArray(internalResult.validatedMeasurements, item => isPlainObject(item)) ||
    !denseArray(internalResult.urgencyFlags, item => typeof item === 'string' && item.trim().length > 0)
  ) {
    throw new TypeError('An unsanitized internal review result is required before building a lead.');
  }
  try {
    return {
      quoteId: internalResult.quoteId,
      serviceId: internalResult.serviceId,
      engineVersion: internalResult.engineVersion,
      serviceType: internalResult.serviceType,
      originalRequest: structuredClone(request),
      submittedCustomerInputs: structuredClone(internalResult.submittedCustomerInputs),
      internalReviewResult: structuredClone(internalResult),
      urgencyFlags: structuredClone(internalResult.urgencyFlags)
    };
  } catch {
    throw new TypeError('The internal lead evidence must be safely cloneable.');
  }
}

function previewRequestFromSnapshot(input, snapshot) {
  if (!snapshot.nonPlainPaths.length) return snapshot.value;
  const request = {};
  for (const key of Object.keys(snapshot.value)) {
    const descriptor = ownDataValue(input, key);
    if (!descriptor.ok || !descriptor.present) return null;
    Object.defineProperty(request, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return request;
}

export function previewQuoteVNext(input) {
  const snapshot = snapshotPlainData(input, 'quoteRequest');
  if (!snapshot.ok) return generateQuoteVNext(input);
  const request = previewRequestFromSnapshot(input, snapshot);
  if (!request) return generateQuoteVNext(input);
  return generateQuoteVNext({ ...request, callerType: 'owner', allowInactiveOwnerPreview: true });
}

export function liveQuoteVNext(input) {
  return generateQuoteVNext(input);
}
