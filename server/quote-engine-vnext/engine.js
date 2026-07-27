import crypto from 'node:crypto';
import {
  PRICE_BASIS_CATEGORIES,
  SERVICE_TYPES,
  allowedPricingFields,
  validateBusinessDefaults,
  validateCustomerInputs,
  validateOwnerPricing,
  validateServiceRules
} from './contracts.js';
import { QuoteReviewError, calculateServiceVNext } from './templates.js';

export const ENGINE_VERSION = 'quote-engine-vnext-audit-1';

const DEFAULT_DISCLAIMER = 'This preliminary estimate is based on the measured project details provided and covers the described scope only. Final pricing is confirmed after review and, when needed, in-person verification. Additional scope, unforeseen conditions, or changes to project details may affect the final price.';
const round = Math.round;

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

function review({
  quoteId = crypto.randomUUID(),
  reviewReason,
  missingCustomerFields = [],
  invalidCustomerFields = [],
  missingOwnerFields = [],
  invalidOwnerFields = [],
  validationMessages = [],
  inspectionFirst = false,
  appliedRules = []
}) {
  return {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    quoteId,
    reviewReason,
    missingCustomerFields,
    invalidCustomerFields,
    missingOwnerFields,
    invalidOwnerFields,
    validationMessages,
    inspectionFirst,
    appliedRules
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergePricingVNext(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return structuredClone(override);
  const out = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key])
      ? mergePricingVNext(out[key], value)
      : structuredClone(value);
  }
  return out;
}

function extractPricing(ownerPricing, serviceType) {
  if (isPlainObject(ownerPricing.pricing)) return structuredClone(ownerPricing.pricing);
  const allowed = new Set(allowedPricingFields(serviceType));
  return Object.fromEntries(Object.entries(ownerPricing).filter(([key]) => allowed.has(key)));
}

export function validateTierDefinitionsVNext(ownerPricing, serviceType) {
  if (ownerPricing.tiers === undefined) return [];
  const errors = [];
  if (!Array.isArray(ownerPricing.tiers) || ownerPricing.tiers.length > 3) return ['tiers must contain at most three options.'];
  const allowed = new Set(allowedPricingFields(serviceType));
  const names = new Set();
  ownerPricing.tiers.forEach((tier, index) => {
    if (!tier || typeof tier.name !== 'string' || !tier.name.trim()) errors.push(`Tier ${index + 1} requires a name.`);
    else {
      const normalizedName = tier.name.trim().toLowerCase();
      if (names.has(normalizedName)) errors.push(`Tier ${index + 1} duplicates another tier name.`);
      names.add(normalizedName);
    }
    if (!isPlainObject(tier?.overrides)) errors.push(`Tier ${index + 1} overrides must be an object.`);
    else {
      const unexpected = Object.keys(tier.overrides).filter(key => !allowed.has(key));
      if (unexpected.length) errors.push(`Tier ${index + 1} contains unsupported price fields: ${unexpected.join(', ')}.`);
    }
  });
  return errors;
}

function checkedCents(value, path, { allowZero = true } = {}) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new QuoteReviewError(`${path} must be stored as non-negative integer cents.`, {
      invalidOwnerFields: [path]
    });
  }
  return value;
}

function cloneLines(lines, variant) {
  return lines.map(line => {
    const next = structuredClone(line);
    if (line.rangeAmountCents && variant !== 'mid') next.amountCents = line.rangeAmountCents[variant];
    return next;
  });
}

function feeSelection(mode, fee, feeSelections) {
  if (mode === 'owner_selected') {
    const value = feeSelections?.owner?.[fee];
    if (typeof value !== 'boolean') throw new QuoteReviewError(`Owner selection for the ${fee} fee is required.`, { invalidOwnerFields: [`feeSelections.owner.${fee}`] });
    return value;
  }
  if (mode === 'customer_selected') {
    const value = feeSelections?.customer?.[fee];
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
    if (applies && amountCents > 0) {
      lines.push({
        name: FEE_LINE_NAMES[fee],
        category: fee,
        amountCents,
        ownerVisible: true,
        customerVisible: false,
        calculation: {
          quantity: 1,
          unit: 'configured fixed charge',
          rateCents: amountCents,
          ratePath: `businessDefaults.${FEE_DEFAULT_FIELDS[fee]}`,
          multipliers: []
        }
      });
    }
    record.push({ fee, mode, physicalScopeSelected: template.feeScope[fee] === true, replaced: replaced.has(fee), applied: applies && amountCents > 0, amountCents: applies ? amountCents : 0, reason });
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
  const amountCents = active ? round(laborSubtotalCents * seasonal.percent / 100) : 0;
  if (active && amountCents <= 0) throw new QuoteReviewError('Peak-season configuration did not produce a valid charge.', { invalidOwnerFields: ['peakSurchargePercent'] });
  if (amountCents > 0) {
    lines.push({
      name: 'Peak season adjustment',
      category: 'surcharge',
      amountCents,
      ownerVisible: true,
      customerVisible: false,
      calculation: { basisCategory: 'labor', basisAmountCents: laborSubtotalCents, percent: seasonal.percent }
    });
  }
  record.month = month;
  record.configuredMonths = structuredClone(seasonal.months);
  record.percent = seasonal.percent;
  record.laborSubtotalCents = laborSubtotalCents;
  record.applied = amountCents > 0;
  record.amountCents = amountCents;
}

function markupAmount(baseCents, defaults) {
  if (baseCents <= 0 || defaults.markupPercent === 0) return 0;
  const fraction = defaults.markupPercent / 100;
  return defaults.markupMode === 'margin'
    ? round(baseCents / (1 - fraction)) - baseCents
    : round(baseCents * fraction);
}

function applyTaxability(lines, ownerPricing, taxMode) {
  for (const line of lines) {
    line.taxable = taxMode !== 'TAX_NONE' && ownerPricing.taxabilityByCategory[line.category] === true;
  }
}

function applyMarkup(lines, ownerPricing, defaults, record) {
  const eligibleLines = lines.filter(line =>
    ownerPricing.priceBasisByCategory[line.category] === 'cost' &&
    defaults.markupApplies[line.category] === true
  );
  const baseCents = eligibleLines.reduce((sum, line) => sum + line.amountCents, 0);
  const amountCents = markupAmount(baseCents, defaults);
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new QuoteReviewError('Markup configuration produced an invalid amount.', { invalidOwnerFields: ['markupPercent'] });
  if (amountCents > 0) {
    lines.push({
      name: 'Markup',
      category: 'markup',
      amountCents,
      taxable: false,
      ownerVisible: true,
      customerVisible: false,
      calculation: {
        basisAmountCents: baseCents,
        mode: defaults.markupMode,
        percent: defaults.markupPercent,
        includedLineIndexes: eligibleLines.map(line => lines.indexOf(line))
      }
    });
  }
  record.mode = defaults.markupMode;
  record.percent = defaults.markupPercent;
  record.baseCents = baseCents;
  record.amountCents = amountCents;
  record.eligibleLines = eligibleLines.map(line => ({ name: line.name, category: line.category, amountCents: line.amountCents, basis: 'cost' }));
  record.sellPriceLinesExcluded = lines.filter(line => PRICE_BASIS_CATEGORIES.includes(line.category) && ownerPricing.priceBasisByCategory[line.category] === 'sell_price').map(line => line.name);
  return { eligibleLines, amountCents };
}

function effectiveMinimum(serviceType, pricing, defaults) {
  const serviceField = SERVICE_MINIMUM_FIELDS[serviceType];
  const serviceMinimum = serviceField ? checkedCents(pricing[serviceField], serviceField) : 0;
  const businessMinimum = checkedCents(defaults.minimumJobPrice, 'minimumJobPrice');
  return { amountCents: Math.max(serviceMinimum, businessMinimum), serviceField, serviceMinimum, businessMinimum };
}

function applyMinimum(lines, serviceType, pricing, defaults, ownerPricing, record) {
  const minimum = effectiveMinimum(serviceType, pricing, defaults);
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const adjustmentCents = Math.max(0, minimum.amountCents - subtotalCents);
  if (adjustmentCents > 0) {
    lines.push({
      name: 'Minimum price adjustment',
      category: 'minimum_adjustment',
      amountCents: adjustmentCents,
      taxable: ownerPricing.taxabilityByCategory.minimum_adjustment,
      ownerVisible: true,
      customerVisible: false,
      calculation: { subtotalBeforeMinimumCents: subtotalCents, effectiveMinimumCents: minimum.amountCents }
    });
  }
  record.basis = 'pre_tax';
  record.subtotalBeforeMinimumCents = subtotalCents;
  record.businessMinimumCents = minimum.businessMinimum;
  record.serviceMinimumField = minimum.serviceField;
  record.serviceMinimumCents = minimum.serviceMinimum;
  record.effectiveMinimumCents = minimum.amountCents;
  record.adjustmentCents = adjustmentCents;
  record.applied = adjustmentCents > 0;
  return minimum.amountCents;
}

function applyTax(lines, ownerPricing, defaults, markupRecord, record) {
  const preTaxSubtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const nonMarkupLines = lines.filter(line => line.category !== 'markup');
  let taxableSubtotalCents = 0;
  let taxableMarkupCents = 0;
  if (defaults.taxMode !== 'TAX_NONE') {
    taxableSubtotalCents = nonMarkupLines.filter(line => line.taxable).reduce((sum, line) => sum + line.amountCents, 0);
    const taxableMarkupBaseCents = markupRecord.eligibleLines.filter(line => line.taxable).reduce((sum, line) => sum + line.amountCents, 0);
    taxableMarkupCents = markupAmount(taxableMarkupBaseCents, defaults);
    taxableSubtotalCents += taxableMarkupCents;
  }
  const taxCents = defaults.taxMode === 'TAX_NONE' ? 0 : round(taxableSubtotalCents * defaults.taxPercent / 100);
  if (!Number.isSafeInteger(taxCents) || taxCents < 0) throw new QuoteReviewError('Tax configuration produced an invalid amount.', { invalidOwnerFields: ['taxPercent'] });
  if (taxCents > 0) {
    lines.push({
      name: 'Tax',
      category: 'tax',
      amountCents: taxCents,
      taxable: false,
      ownerVisible: true,
      customerVisible: false,
      calculation: { taxMode: defaults.taxMode, taxPercent: defaults.taxPercent, taxableSubtotalCents }
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

function assertMoneyIntegrity(lines, finalTotalCents) {
  for (const line of lines) {
    if (!Number.isSafeInteger(line.amountCents) || line.amountCents <= 0) {
      throw new QuoteReviewError(`${line.name || 'A line item'} contains an invalid money value.`);
    }
  }
  if (!Number.isSafeInteger(finalTotalCents) || finalTotalCents <= 0) {
    throw new QuoteReviewError('The final quote total is invalid.');
  }
}

function runScenario({ variant, template, serviceType, pricing, ownerPricing, defaults, feeSelections, month }) {
  const lines = cloneLines(template.lineItems, variant);
  const record = {
    variant,
    fees: [],
    seasonal: {},
    markup: {},
    minimum: {},
    tax: {}
  };
  applyCommonFees(lines, template, ownerPricing, defaults, feeSelections, record.fees);
  applySeasonalSurcharge(lines, ownerPricing, defaults, month, record.seasonal);
  applyTaxability(lines, ownerPricing, defaults.taxMode);
  const markup = applyMarkup(lines, ownerPricing, defaults, record.markup);
  const minimumCents = applyMinimum(lines, serviceType, pricing, defaults, ownerPricing, record.minimum);
  const finalTotalCents = applyTax(lines, ownerPricing, defaults, markup, record.tax);
  assertMoneyIntegrity(lines, finalTotalCents);
  return { lines, finalTotalCents, minimumCents, record };
}

function toDollars(cents) {
  return cents / 100;
}

function rangeForStandardQuote(totalCents, minimumCents, defaults, taxRecord) {
  const buffer = defaults.rangeBufferPercent;
  const minimumFloorCents = minimumCents + taxRecord.taxCents;
  let midCents = round(totalCents / 1000) * 1000;
  let lowCents = round(midCents * (1 - buffer / 100) / 1000) * 1000;
  let highCents = round(midCents * (1 + buffer / 100) / 1000) * 1000;
  lowCents = Math.max(lowCents, minimumFloorCents);
  lowCents = Math.min(lowCents, totalCents);
  highCents = Math.max(highCents, totalCents, lowCents);
  midCents = Math.max(midCents, lowCents);
  midCents = Math.min(midCents, highCents);
  return { lowCents, midCents, highCents, minimumFloorCents, buffer };
}

function rangeForIntrinsicQuote(low, mid, high) {
  const lowCents = Math.min(low.finalTotalCents, mid.finalTotalCents, high.finalTotalCents);
  const highCents = Math.max(low.finalTotalCents, mid.finalTotalCents, high.finalTotalCents);
  const midCents = Math.min(Math.max(mid.finalTotalCents, lowCents), highCents);
  return { lowCents, midCents, highCents, minimumFloorCents: low.minimumCents + low.record.tax.taxCents, buffer: null };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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
  const customerValidation = validateCustomerInputs(serviceType, customerInputs, pricing);
  if (!customerValidation.ok) throw new QuoteReviewError(customerValidation.reviewReason, customerValidation);
  const ownerValidation = validateOwnerPricing(serviceType, customerInputs, pricing);
  if (!ownerValidation.ok) throw new QuoteReviewError('Pricing not fully configured for the measured scope.', ownerValidation);

  const skippedAddons = [];
  const ctx = {
    urgencyFlags: inherited.urgencyFlags,
    skipAddon(name) {
      if (!skippedAddons.includes(name)) skippedAddons.push(name);
      const prefix = tierName ? `${tierName} tier: ` : '';
      inherited.appliedRules.push(`${prefix}${name} skipped: price not configured`);
    }
  };
  const template = calculateServiceVNext(serviceType, customerInputs, pricing, ctx);
  const mid = runScenario({ variant: 'mid', template, serviceType, pricing, ownerPricing, defaults, feeSelections, month });
  const hasIntrinsicRange = template.lineItems.some(line => line.rangeAmountCents);
  let range;
  let scenarioRecords = { mid: mid.record };
  if (hasIntrinsicRange) {
    const low = runScenario({ variant: 'low', template, serviceType, pricing, ownerPricing, defaults, feeSelections, month });
    const high = runScenario({ variant: 'high', template, serviceType, pricing, ownerPricing, defaults, feeSelections, month });
    range = rangeForIntrinsicQuote(low, mid, high);
    scenarioRecords = { low: low.record, mid: mid.record, high: high.record };
  } else {
    range = rangeForStandardQuote(mid.finalTotalCents, mid.minimumCents, defaults, mid.record.tax);
  }

  const baseDisclaimer = ownerPricing.disclaimer || DEFAULT_DISCLAIMER;
  const optionDisclaimer = disclaimer(baseDisclaimer, template.disclosures, skippedAddons);
  const priceDrivers = unique([
    ...template.priceDrivers,
    ...mid.lines.map(line => line.customerDriver)
  ]).slice(0, 4);
  const calculationRecord = {
    engineVersion: ENGINE_VERSION,
    serviceType,
    tierName,
    normalizedCustomerInputs: structuredClone(customerInputs),
    measurements: structuredClone(template.measurements),
    assumptions: structuredClone(template.assumptions),
    disclosures: structuredClone(template.disclosures),
    lineItems: structuredClone(mid.lines),
    scenarios: scenarioRecords,
    range: {
      source: hasIntrinsicRange ? 'owner_configured_custom_range' : 'business_range_buffer',
      bufferPercent: range.buffer,
      minimumCustomerFloorCents: range.minimumFloorCents,
      lowCents: range.lowCents,
      midCents: range.midCents,
      highCents: range.highCents,
      exactMidScenarioTotalCents: mid.finalTotalCents
    }
  };
  return {
    tierName,
    lowEstimate: toDollars(range.lowCents),
    midEstimate: toDollars(range.midCents),
    highEstimate: toDollars(range.highCents),
    priceDrivers,
    lineItems: mid.lines,
    skippedAddons,
    disclaimer: optionDisclaimer,
    calculationRecord
  };
}

export function generateQuoteVNext({
  serviceType,
  customerInputs = {},
  ownerPricing = {},
  businessDefaults = {},
  callerType = 'owner',
  feeSelections = {},
  currentMonth = new Date().getMonth() + 1
}) {
  const quoteId = crypto.randomUUID();
  const appliedRules = [];
  const urgencyFlags = [];
  const finishReview = details => {
    const result = review({ quoteId, ...details });
    return callerType === 'customer' ? sanitizeForCustomerVNext(result) : result;
  };
  if (!SERVICE_TYPES.includes(serviceType)) return finishReview({ reviewReason: 'Unsupported service type.' });
  if (ownerPricing.active !== true) return finishReview({ reviewReason: 'This service is not active for customer quoting.' });
  const basePricing = extractPricing(ownerPricing, serviceType);

  if (['AI_SUGGESTED', 'AI_INTERVIEW'].includes(ownerPricing.source)) {
    const confirmed = isPlainObject(ownerPricing.confirmedFields) ? ownerPricing.confirmedFields : {};
    const unconfirmed = Object.keys(basePricing).filter(field => confirmed[field] !== true);
    if (Array.isArray(ownerPricing.tiers) && ownerPricing.tiers.length && confirmed.tiers !== true) unconfirmed.push('tiers');
    if (unconfirmed.length) {
      return finishReview({
        reviewReason: 'AI-suggested pricing must be confirmed by the owner before quoting.',
        missingOwnerFields: unique(unconfirmed)
      });
    }
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
    return finishReview({
      reviewReason: 'Business-wide pricing settings are incomplete or invalid.',
      missingOwnerFields: defaultValidation.missingFields.map(field => `businessDefaults.${field}`),
      validationMessages: defaultValidation.errors
    });
  }
  const ruleErrors = validateServiceRules(ownerPricing);
  const tierErrors = validateTierDefinitionsVNext(ownerPricing, serviceType);
  if (ruleErrors.length || tierErrors.length) {
    return finishReview({ reviewReason: 'Service pricing rules are incomplete or invalid.', validationMessages: [...ruleErrors, ...tierErrors] });
  }
  if (!Number.isInteger(currentMonth) || currentMonth < 1 || currentMonth > 12) {
    return finishReview({ reviewReason: 'Quote month is invalid.', invalidCustomerFields: ['currentMonth'] });
  }

  const tiers = Array.isArray(ownerPricing.tiers) && ownerPricing.tiers.length
    ? ownerPricing.tiers
    : [{ name: null, overrides: {} }];
  const options = [];
  const failed = [];
  for (const tier of tiers) {
    const pricing = mergePricingVNext(basePricing, tier.overrides || {});
    try {
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
      if (!(error instanceof QuoteReviewError)) throw error;
      failed.push(error);
      if (tier.name) appliedRules.push(`${tier.name} tier skipped: ${error.reviewReason}`);
    }
  }
  if (!options.length) {
    const error = failed[0] || new QuoteReviewError('No pricing option could produce a complete quote.');
    const result = review({
      quoteId,
      reviewReason: error.reviewReason,
      missingCustomerFields: error.missingCustomerFields,
      invalidCustomerFields: error.invalidCustomerFields,
      missingOwnerFields: error.missingOwnerFields,
      invalidOwnerFields: unique([...(error.invalidOwnerFields || []), ...(error.unexpectedOwnerFields || [])]),
      validationMessages: error.validationMessages,
      inspectionFirst: error.inspectionFirst,
      appliedRules
    });
    return callerType === 'customer' ? sanitizeForCustomerVNext(result) : result;
  }

  const first = options[0];
  const baseDisclaimer = ownerPricing.disclaimer || DEFAULT_DISCLAIMER;
  const topDisclaimer = exclusionsMatch(options) ? first.disclaimer : disclaimer(baseDisclaimer, [], []);
  const result = {
    resultType: 'INSTANT_ESTIMATE_READY',
    quoteId,
    lowEstimate: first.lowEstimate,
    midEstimate: first.midEstimate,
    highEstimate: first.highEstimate,
    options,
    priceDrivers: first.priceDrivers,
    lineItems: first.lineItems,
    disclaimer: topDisclaimer,
    appliedRules,
    urgencyFlags,
    calculationRecord: {
      engineVersion: ENGINE_VERSION,
      quoteId,
      serviceType,
      options: options.map(option => option.calculationRecord)
    }
  };
  return callerType === 'customer' ? sanitizeForCustomerVNext(result) : result;
}

const CUSTOMER_OPTION_FIELDS = [
  'tierName', 'lowEstimate', 'midEstimate', 'highEstimate',
  'priceDrivers', 'skippedAddons', 'disclaimer'
];

function pick(source, keys) {
  return Object.fromEntries(keys.filter(key => source?.[key] !== undefined).map(key => [key, source[key]]));
}

export function sanitizeForCustomerVNext(result) {
  if (result?.resultType !== 'INSTANT_ESTIMATE_READY') {
    return {
      resultType: 'ESTIMATE_REQUIRES_REVIEW',
      customerMessage: 'We have the project details and a person will follow up with the estimate.',
      ...(result?.quoteId ? { quoteId: result.quoteId } : {})
    };
  }
  return {
    ...pick(result, ['resultType', 'lowEstimate', 'midEstimate', 'highEstimate', 'priceDrivers', 'disclaimer', 'quoteId']),
    options: (result.options || []).map(option => pick(option, CUSTOMER_OPTION_FIELDS))
  };
}

export function previewQuoteVNext(input) {
  return generateQuoteVNext({ ...input, callerType: 'owner' });
}

export function liveQuoteVNext(input) {
  return generateQuoteVNext(input);
}
