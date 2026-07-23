import crypto from 'node:crypto';
import { calculateService, getRequiredFields, getRequiredOwnerFields } from './quoteTemplates.js';

const DEFAULT_DISCLAIMER = 'This preliminary estimate is based on the project details provided and covers the described scope only. Final pricing is confirmed after review and, when needed, in-person verification. Additional scope, unforeseen conditions, or changes to project details may affect the final price.';
const MARKUP_APPLIES_DEFAULT = { labor:true, material:true, removal:true, prep:true, addon:true, equipment:true, travel:true, disposal:true, permit:false, overhead:true };
import { ALL_OWNER_FIELDS, shapedFieldKeys } from './priceBookMetadata.js';

const ZERO_ALLOWED_OWNER_FIELDS = new Set(['minimumJob', 'repairMinimum', 'minimumServiceCharge']);
const ADDON_DISCLOSURES = [
  { serviceType: 'FLAT_ROOF_REPAIR', field: 'pondingWaterSurcharge', name: 'Ponding water surcharge', selected: c => Boolean(c.pondingWater) },
  { serviceType: 'LANDSCAPING_MOWING', field: 'baggingSurchargePercent', name: 'Clipping bagging & disposal', selected: c => Boolean(c.bagClippings) },
  { serviceType: 'LANDSCAPING_MOWING', field: 'edgingPerLinearFoot', name: 'Perimeter edging', selected: c => Boolean(c.edgingIncluded) }
];
const missing = (obj, field) => obj?.[field] === undefined || obj?.[field] === null || obj?.[field] === 'unsure' || obj?.[field] === '';
const invalidNumber = value => typeof value === 'number' && (!Number.isFinite(value) || value < 0);
const missingOwner = (obj, field) => missing(obj, field) || invalidNumber(obj?.[field]) || (!ZERO_ALLOWED_OWNER_FIELDS.has(field) && obj[field] === 0);
const missingAddonPrice = (obj, field) => missing(obj, field) || invalidNumber(obj?.[field]) || obj[field] === 0;
const round = Math.round;


// Resolve the exact shaped Class 1 value this quote consumes. The guard
// follows both the customer-selected first-level key and, where applicable,
// the derived repair-size leaf. Missing or invalid values always force review.
function positivePricingValue(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function selectedSizeCategory(value, [smallBoundary, mediumBoundary], allowed) {
  if (typeof value === 'string' && allowed.includes(value)) return value;
  const area = Number(value);
  if (!Number.isFinite(area)) return null;
  return area < smallBoundary ? 'small' : area <= mediumBoundary ? 'medium' : 'large';
}

function shapedKeyMissing(serviceType, field, pricing, customerInputs) {
  const domain = shapedFieldKeys(serviceType, field);
  if (!domain || !domain.customerField) return false;
  const map = pricing?.[field];
  if (!map || typeof map !== 'object' || Array.isArray(map)) return false;
  let key = customerInputs?.[domain.customerField];
  if (domain.unknownKey && (key === 'unknown' || key === undefined || key === null || key === '')) key = domain.unknownKey;
  if (key === undefined || key === null || key === '') return false;
  const selected = map[key];
  if (!domain.nested) return !positivePricingValue(selected);
  if (!selected || typeof selected !== 'object' || Array.isArray(selected)) return true;
  if (domain.sizeBreakpoints) {
    const nestedKey = selectedSizeCategory(customerInputs?.affectedArea, domain.sizeBreakpoints, domain.nested);
    return !nestedKey || !positivePricingValue(selected[nestedKey]);
  }
  if (domain.consumeAllNested) return domain.nested.some(nestedKey => !positivePricingValue(selected[nestedKey]));
  return domain.nested.some(nestedKey => !positivePricingValue(selected[nestedKey]));
}

function review({ missingCustomerFields = [], missingOwnerFields = [], reviewReason }) {
  return { resultType: 'ESTIMATE_REQUIRES_REVIEW', missingCustomerFields, missingOwnerFields, reviewReason, quoteId: crypto.randomUUID() };
}

function defaultsOf(businessDefaults = {}) {
  return {
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
    markupApplies: MARKUP_APPLIES_DEFAULT,
    ...businessDefaults,
    markupApplies: { ...MARKUP_APPLIES_DEFAULT, ...(businessDefaults.markupApplies || {}) }
  };
}

function centsToDollars(cents) { return round(cents) / 100; }
function markupFor(base, defaults) {
  const pct = Number(defaults.markupPercent || 0) / 100;
  if (!pct) return 0;
  return defaults.markupMode === 'margin' ? round(base / (1 - pct)) - base : round(base * pct);
}
function applyMinimum(serviceType, lineItems, subtotalCents, p, defaults, appliedRules) {
  const approvedFields = new Set(ALL_OWNER_FIELDS[serviceType] || []);
  const serviceMinimums = ['minimumJob','repairMinimum','minimumServiceCharge']
    .filter(field => approvedFields.has(field))
    .map(field => Number(p[field] || 0));
  const min = Math.max(Number(defaults.minimumJobPrice || 0), ...serviceMinimums);
  if (subtotalCents < min) {
    const amount = min - subtotalCents;
    lineItems.push({ name:'Minimum Price Adjustment', category:'minimum_adjustment', amountCents:amount, taxable:false, ownerVisible:true, customerVisible:false });
    appliedRules.push('Minimum job price applied');
    return min;
  }
  return subtotalCents;
}
function pushSkippedAddon(ctx, name, tierName) {
  const baseMessage = `${name} skipped: price not configured`;
  const message = tierName ? `${tierName} tier: ${baseMessage}` : baseMessage;
  if (!ctx.appliedRules.includes(message)) ctx.appliedRules.push(message);
  if (!ctx.skippedAddons.includes(name)) ctx.skippedAddons.push(name);
}
function collectSkippedAddons(serviceType, customerInputs, pricing, ctx, tierName) {
  for (const addon of ADDON_DISCLOSURES) {
    if (addon.serviceType === serviceType && addon.selected(customerInputs) && missingAddonPrice(pricing, addon.field)) {
      pushSkippedAddon(ctx, addon.name, tierName);
    }
  }
}
function disclaimerWithSkippedAddons(base, skippedAddons = []) {
  const names = [...new Set(skippedAddons)].filter(Boolean);
  if (!names.length) return base;
  return `${base} This estimate does not include: ${names.join(', ')}.`;
}
function optionExclusionsMatch(options) {
  if (options.length <= 1) return true;
  const first = JSON.stringify(options[0].skippedAddons);
  return options.every(option => JSON.stringify(option.skippedAddons) === first);
}

function finalizeRun({ serviceType, customerInputs, ownerPricing, effectivePricing, businessDefaults, tierName, inherited }) {
  const defaults = defaultsOf(businessDefaults);
  const ctx = { appliedRules: inherited.appliedRules, urgencyFlags: inherited.urgencyFlags, priceDrivers: [], estimationUsed: false, skippedAddons: [] };
  const pricing = { ...ownerPricing, ...effectivePricing };
  collectSkippedAddons(serviceType, customerInputs, pricing, ctx, tierName);
  const calculated = calculateService(serviceType, customerInputs, pricing, defaults, ctx);
  const lineItems = calculated.lineItems;

  const month = new Date().getMonth() + 1;
  const peakMonths = ownerPricing.peakMonths?.length ? ownerPricing.peakMonths : defaults.peakMonths || [];
  const peakPct = ownerPricing.peakSurchargePercent || defaults.peakSurchargePercent || 0;
  if (peakMonths.includes(month) && peakPct) {
    const labor = lineItems.filter(i => i.category === 'labor').reduce((s,i)=>s+i.amountCents,0);
    lineItems.push({ name:'Peak season adjustment', category:'surcharge', amountCents:round(labor*peakPct/100), taxable:false, ownerVisible:true, customerVisible:false });
  }

  const markupBase = lineItems.filter(i => defaults.markupApplies[i.category]).reduce((s,i)=>s+i.amountCents,0);
  const markupCents = markupFor(markupBase, defaults);
  if (markupCents) lineItems.push({ name:'Markup', category:'markup', amountCents:markupCents, taxable:false, ownerVisible:true, customerVisible:false });
  let subtotalCents = lineItems.reduce((s,i)=>s+i.amountCents,0);

  if (defaults.taxMode === 'TAX_ALL') {
    subtotalCents = applyMinimum(serviceType, lineItems, subtotalCents, pricing, defaults, inherited.appliedRules);
    const taxCents = round(subtotalCents * Number(defaults.taxPercent || 0) / 100);
    if (taxCents) lineItems.push({ name:'Tax', category:'tax', amountCents:taxCents, taxable:false, ownerVisible:true, customerVisible:false });
    subtotalCents += taxCents;
  } else if (defaults.taxMode === 'TAX_MATERIALS') {
    const taxableBase = lineItems.filter(i => i.taxable).reduce((s,i)=>s+i.amountCents,0);
    const taxableMarkupBase = lineItems.filter(i => i.taxable && defaults.markupApplies[i.category]).reduce((s,i)=>s+i.amountCents,0);
    const taxCents = round((taxableBase + markupFor(taxableMarkupBase, defaults)) * Number(defaults.taxPercent || 0) / 100);
    if (taxCents) lineItems.push({ name:'Tax', category:'tax', amountCents:taxCents, taxable:false, ownerVisible:true, customerVisible:false });
    subtotalCents += taxCents;
    subtotalCents = applyMinimum(serviceType, lineItems, subtotalCents, pricing, defaults, inherited.appliedRules);
  } else {
    subtotalCents = applyMinimum(serviceType, lineItems, subtotalCents, pricing, defaults, inherited.appliedRules);
  }

  let buffer = Number(defaults.rangeBufferPercent ?? 10);
  if (ctx.estimationUsed) buffer += 5;
  buffer = Math.min(buffer, 25);
  const midCents = round(subtotalCents / 1000) * 1000;
  const lowCents = round((midCents * (1 - buffer / 100)) / 1000) * 1000;
  const highCents = round((midCents * (1 + buffer / 100)) / 1000) * 1000;

  const topDrivers = lineItems.filter(i => ['labor','material'].includes(i.category)).sort((a,b)=>b.amountCents-a.amountCents).slice(0,4).map(i => i.name);
  const priceDrivers = [...new Set([...topDrivers, ...ctx.priceDrivers])];
  const disclaimer = disclaimerWithSkippedAddons(ownerPricing.disclaimer || DEFAULT_DISCLAIMER, ctx.skippedAddons);
  return { lineItems, priceDrivers, lowEstimate:centsToDollars(lowCents), highEstimate:centsToDollars(highCents), midEstimate:centsToDollars(midCents), rangeBufferUsed: buffer, estimationUsed: ctx.estimationUsed, skippedAddons: ctx.skippedAddons, disclaimer };
}

export function generateQuote({ serviceType, customerInputs = {}, ownerPricing = {}, businessDefaults = {}, callerType = 'owner' }) {
  const quoteId = crypto.randomUUID();
  const pricing = ownerPricing.pricing || ownerPricing;
  const appliedRules = [];
  const urgencyFlags = [];

  if ((ALL_OWNER_FIELDS[serviceType] || []).includes('disposalPerSqft') &&
      !missing(pricing, 'disposalPerSqft') &&
      (typeof pricing.disposalPerSqft !== 'number' || !Number.isFinite(pricing.disposalPerSqft) || pricing.disposalPerSqft < 0)) {
    return review({
      missingOwnerFields:['disposalPerSqft'],
      reviewReason:'Pricing not fully configured for this service. Owner follow-up required.'
    });
  }

  if (['ROOFING_REPAIR','FLAT_ROOF_REPAIR'].includes(serviceType) && ['unknown','unknown_leak'].includes(customerInputs.repairType)) {
    return review({ reviewReason: serviceType === 'ROOFING_REPAIR' ? 'Leak source is unknown. An in-person inspection is needed before we can estimate this repair accurately.' : 'Flat roof leak source requires inspection before we can estimate accurately.' });
  }

  const missingCustomerFields = getRequiredFields(serviceType, customerInputs).filter(f => missing(customerInputs, f));
  if (missingCustomerFields.length) return review({ missingCustomerFields, missingOwnerFields: [], reviewReason:'Required project details were not provided.' });

  const ownerFields = getRequiredOwnerFields(serviceType, {
    ...customerInputs,
    accessoryPricingMode: pricing.accessoryPricingMode
  });
  const missingOwnerFields = ownerFields.filter(f => f === 'postsIncludedInMaterial'
    ? missing(pricing, f)
    : (missingOwner(pricing, f) || shapedKeyMissing(serviceType, f, pricing, customerInputs)));
  if (missingOwnerFields.length) return review({ missingOwnerFields, missingCustomerFields: [], reviewReason:'Pricing not fully configured for this service. Owner follow-up required.' });

  const tiers = Array.isArray(ownerPricing.tiers) && ownerPricing.tiers.length ? ownerPricing.tiers.slice(0,3) : [{ name:null, overrides:{} }];
  const options = [];
  for (const tier of tiers) {
    const effectivePricing = { ...pricing, ...(tier.overrides || {}) };
    const tierMissing = ownerFields.filter(f => f === 'postsIncludedInMaterial'
      ? missing(effectivePricing, f)
      : (missingOwner(effectivePricing, f) || shapedKeyMissing(serviceType, f, effectivePricing, customerInputs)));
    if (tierMissing.length) { if (tier.name) appliedRules.push(`${tier.name} tier skipped: incomplete pricing`); continue; }
    try {
      const run = finalizeRun({ serviceType, customerInputs, ownerPricing, effectivePricing, businessDefaults, tierName:tier.name, inherited:{ appliedRules, urgencyFlags } });
      options.push({ tierName:tier.name, ...run });
    } catch (err) {
      if (err.reviewReason) return review({ reviewReason: err.reviewReason });
      throw err;
    }
  }
  if (!options.length) return review({ missingOwnerFields: ownerFields, reviewReason:'Pricing not fully configured for this service. Owner follow-up required.' });

  const first = options[0];
  const baseDisclaimer = ownerPricing.disclaimer || DEFAULT_DISCLAIMER;
  const disclaimer = optionExclusionsMatch(options) ? first.disclaimer : baseDisclaimer;
  const result = { resultType:'INSTANT_ESTIMATE_READY', lowEstimate:first.lowEstimate, highEstimate:first.highEstimate, midEstimate:first.midEstimate, options: options.map(o => ({ tierName:o.tierName, lowEstimate:o.lowEstimate, highEstimate:o.highEstimate, midEstimate:o.midEstimate, priceDrivers:o.priceDrivers, lineItems:o.lineItems, skippedAddons:o.skippedAddons, disclaimer:o.disclaimer })), priceDrivers:first.priceDrivers, lineItems:first.lineItems, appliedRules, urgencyFlags, rangeBufferUsed:first.rangeBufferUsed, disclaimer, quoteId };
  return callerType === 'customer' ? sanitizeForCustomer(result) : result;
}

// Customer payloads are built from a strict ALLOWLIST, never by removing known
// internal keys. A denylist ({ lineItems, ...safe }) leaks every property added
// to an engine result later; an allowlist cannot. Review results were
// previously returned untouched, which exposed missingOwnerFields -- internal
// owner pricing-field identifiers -- straight to the caller.
const CUSTOMER_OPTION_FIELDS = [
  'tierName', 'lowEstimate', 'highEstimate', 'midEstimate',
  'priceDrivers', 'skippedAddons', 'disclaimer'
];

function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source?.[key] !== undefined) out[key] = source[key];
  }
  return out;
}

export function sanitizeForCustomer(result) {
  if (result?.resultType === 'INSTANT_ESTIMATE_READY') {
    const safe = pick(result, [
      'resultType', 'lowEstimate', 'highEstimate', 'midEstimate',
      'disclaimer', 'quoteId'
    ]);
    safe.options = (result.options || []).map(option => pick(option, CUSTOMER_OPTION_FIELDS));
    return safe;
  }

  // Any non-ready outcome (review, defer, unsupported) tells the customer only
  // that a person will follow up. It never names owner fields, missing
  // configuration, validation internals or which service failed and why.
  return {
    resultType: result?.resultType || 'ESTIMATE_REQUIRES_REVIEW',
    customerMessage: 'We have everything we need to price this. Someone will follow up with your estimate shortly.',
    ...(result?.quoteId ? { quoteId: result.quoteId } : {})
  };
}
