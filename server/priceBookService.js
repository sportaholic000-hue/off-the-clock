import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { getRequiredOwnerFields, SERVICE_TYPES } from './quoteTemplates.js';
import { getActivationOwnerFields, MONEY_FIELD_NAMES, ALL_OWNER_FIELDS, CLASS2_DEFAULTS_BY_SERVICE, ownerFieldLabel, getServiceMetadata, shapedFieldKeys } from './priceBookMetadata.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configuredDir = process.env.PRICEBOOK_PATH;
const dir = configuredDir
  ? (isAbsolute(configuredDir) ? configuredDir : resolve(projectRoot, configuredDir))
  : resolve(projectRoot, 'data', 'pricebooks');
const zeroAllowedOwnerFields = new Set(['minimumJob', 'repairMinimum', 'minimumServiceCharge']);

export function loadPricebook(ownerId) {
  try { return JSON.parse(readFileSync(resolve(dir, `${ownerId}.json`), 'utf8')); }
  catch (err) {
    if (err.code === 'ENOENT') {
      return {
        ownerId,
        services: [],
        defaults: {
          markupPercent: 30,
          markupMode: 'markup',
          taxMode: 'TAX_NONE',
          taxPercent: 0,
          rangeBufferPercent: 10
        }
      };
    }
    throw err;
  }
}

export function savePricebook(ownerId, data) {
  mkdirSync(dir, { recursive: true });
  const next = {
    ...data,
    ownerId,
    updatedAt: new Date().toISOString(),
    services: (data.services || []).map(service => ({
      id: service.id || crypto.randomUUID(),
      ...service
    }))
  };
  writeFileSync(resolve(dir, `${ownerId}.json`), JSON.stringify(next, null, 2));
  return { success: true, pricebook: next };
}

export function hasPricing(ownerId) {
  return loadPricebook(ownerId).services.filter(service => service.active).length > 0;
}

function convertObject(value, direction, key = '', inheritedMoney = false) {
  const money = inheritedMoney || MONEY_FIELD_NAMES.has(key);
  if (Array.isArray(value)) return value.map(item => convertObject(item, direction, key, money));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        convertObject(childValue, direction, childKey, money)
      ])
    );
  }
  if (typeof value === 'number' && money) {
    return direction === 'toCents' ? Math.round(value * 100) : value / 100;
  }
  return value;
}

export const dollarsToCents = data => convertObject(data, 'toCents');
export const centsToDollars = data => convertObject(data, 'toDollars');

function pricingFor(service) {
  return service?.pricing && typeof service.pricing === 'object' ? service.pricing : service || {};
}

function numericLeaves(value) {
  if (typeof value === 'number') return [value];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.values(value).flatMap(numericLeaves);
}

function positiveOwnerPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function shapedPricingMissing(serviceType, field, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const domain = shapedFieldKeys(serviceType, field);
  if (!domain) {
    const leaves = numericLeaves(value);
    return leaves.length === 0 || leaves.some(number => !positiveOwnerPrice(number));
  }

  const presentKeys = Object.keys(value);
  const requiredKeys = Array.isArray(domain.keys)
    ? domain.keys
    : (domain.requiredKeys || presentKeys);
  if (!requiredKeys.length || requiredKeys.some(key => value[key] === undefined)) return true;

  const keysToValidate = [...new Set([...requiredKeys, ...presentKeys])];
  return keysToValidate.some(key => {
    const row = value[key];
    if (domain.nested) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return true;
      return domain.nested.some(nestedKey => !positiveOwnerPrice(row[nestedKey]));
    }
    return !positiveOwnerPrice(row);
  });
}

function isMissing(serviceType, pricing, field) {
  const value = pricing[field];
  if (field === 'postsIncludedInMaterial') return typeof value !== 'boolean';
  if (field === 'unit') return !['flat','per_sqft','per_hour','per_unit','per_LF','per_square'].includes(value);
  if (value === undefined || value === null || value === '') return true;
  if (value && typeof value === 'object') return shapedPricingMissing(serviceType, field, value);
  if (typeof value !== 'number' || !Number.isFinite(value)) return true;
  if (value < 0) return true;
  return !zeroAllowedOwnerFields.has(field) && value === 0;
}

export const AI_SOURCES = new Set(['AI_SUGGESTED', 'AI_INTERVIEW']);

export function pricebookServiceStatus(service) {
  const customerInputs = service.validationInputs || {};
  const requiredFields = [...new Set([
    ...getActivationOwnerFields(service.serviceType, pricingFor(service)),
    ...getRequiredOwnerFields(service.serviceType, customerInputs)
  ])];
  let missingOwnerFields = requiredFields.filter(field => isMissing(service.serviceType, pricingFor(service), field));
  if (AI_SOURCES.has(service.source)) {
    const confirmed = service.confirmedFields && typeof service.confirmedFields === 'object' ? service.confirmedFields : {};
    // EVERY field the AI populated must be individually confirmed (or
    // removed), optional fields included: unconfirmed optional charges
    // must never reach a live quote.
    const gated = [...new Set([
      ...requiredFields,
      ...(ALL_OWNER_FIELDS[service.serviceType] || []).filter(field => pricingFor(service)[field] !== undefined)
    ])];
    const unconfirmed = gated.filter(field => confirmed[field] !== true);
    missingOwnerFields = [...new Set([...missingOwnerFields, ...unconfirmed])];
  }
  const active = missingOwnerFields.length === 0;
  return {
    serviceType: service.serviceType,
    service: service.service || service.serviceType,
    status: active ? 'QUOTING LIVE' : 'NEEDS PRICING',
    missingOwnerFields,
    // Exact human-facing labels from the engine spec for display.
    // Fields without a specced label fall back to the engine name
    // until owner-approved labels are ruled at the phase gate.
    missingOwnerLabels: missingOwnerFields.map(field => ownerFieldLabel(service.serviceType, field))
  };
}

export function pricebookStatuses(pricebook) {
  return (pricebook.services || []).map(pricebookServiceStatus);
}

export function pricebookDraftValidation(pricebook) {
  if (!pricebook || typeof pricebook !== 'object' || Array.isArray(pricebook)) {
    return { statuses:[], validationErrors:['Price book must be an object'] };
  }
  if (!Array.isArray(pricebook.services)) {
    return { statuses:[], validationErrors:['Price book services must be an array'] };
  }

  const validationErrors = [];
  const defaultValidationErrors = [];
  try {
    validatePricebookDefaults(pricebook.defaults || {});
  } catch (error) {
    validationErrors.push(error.message);
    defaultValidationErrors.push(error.message);
  }

  const statuses = pricebook.services.map((service, index) => {
    let status;
    try {
      status = pricebookServiceStatus(service);
      validateServiceShape(service, index);
    } catch (error) {
      const message = error.message;
      validationErrors.push(message);
      return {
        serviceType:service?.serviceType,
        service:service?.service || service?.serviceType,
        status:'NEEDS PRICING',
        missingOwnerFields:[],
        missingOwnerLabels:[message],
        validationErrors:[message]
      };
    }
    if (!defaultValidationErrors.length) return status;
    return {
      ...status,
      status:'NEEDS PRICING',
      validationErrors:[...defaultValidationErrors],
      missingOwnerLabels:[...new Set([...(status.missingOwnerLabels || []), ...defaultValidationErrors])]
    };
  });

  return { statuses, validationErrors:[...new Set(validationErrors)] };
}

export function pricebookDraftStatuses(pricebook) {
  return pricebookDraftValidation(pricebook).statuses;
}

let fieldDefCache = null;
function fieldDef(serviceType, field) {
  if (!fieldDefCache) {
    fieldDefCache = new Map();
    for (const service of getServiceMetadata()) {
      fieldDefCache.set(service.serviceType, new Map(service.fields.map(def => [def.field, def])));
    }
  }
  return fieldDefCache.get(serviceType)?.get(field);
}

// Numeric maps (shaped Class 1 fields, Class 2 factor tables) may contain
// ONLY finite, non-negative numbers at their leaves. Strings, booleans, and
// null leaves are rejected: a string leaf becomes NaN in the engine and
// silently deletes the quote line it feeds.
function assertNumericLeaves(value, path) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
    if (value < 0) throw new Error(`${path} cannot be negative`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, itemIndex) => assertNumericLeaves(item, `${path}[${itemIndex}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) assertNumericLeaves(childValue, `${path}.${childKey}`);
    return;
  }
  throw new Error(`${path} must be a number`);
}

function assertExactClass2Shape(value, expected, path) {
  if (typeof expected === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
    if (value < 0) throw new Error(`${path} cannot be negative`);
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object with exactly: ${Object.keys(expected).join(', ')}`);
  }
  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(value);
  const missingKeys = expectedKeys.filter(key => !actualKeys.includes(key));
  const extraKeys = actualKeys.filter(key => !expectedKeys.includes(key));
  if (missingKeys.length) throw new Error(`${path} is missing required keys: ${missingKeys.join(', ')}`);
  if (extraKeys.length) throw new Error(`${path} has unsupported keys: ${extraKeys.join(', ')}`);
  for (const key of expectedKeys) assertExactClass2Shape(value[key], expected[key], `${path}.${key}`);
}

function validateOwnerFieldValue(serviceType, field, value, path) {
  if (value === undefined) return;
  const def = fieldDef(serviceType, field);
  const type = def?.type || 'number';
  if (type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${path} must be true or false`);
    return;
  }
  if (type === 'select') {
    if (typeof value !== 'string') throw new Error(`${path} must be a string`);
    if (def?.options?.length && !def.options.includes(value)) {
      throw new Error(`${path} must be one of: ${def.options.join(', ')}`);
    }
    return;
  }
  if (type === 'json') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object of numeric rates`);
    const domain = shapedFieldKeys(serviceType, field);
    if (domain) {
      for (const [key, child] of Object.entries(value)) {
        if (Array.isArray(domain.keys) && !domain.keys.includes(key)) {
          throw new Error(`${path}.${key} is not a valid key; expected one of: ${domain.keys.join(', ')}`);
        }
        if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error(`${path}.${key} is not a valid key name`);
        if (domain.nested) {
          if (!child || typeof child !== 'object' || Array.isArray(child)) {
            throw new Error(`${path}.${key} must be an object with: ${domain.nested.join(', ')}`);
          }
          for (const nestedKey of Object.keys(child)) {
            if (!domain.nested.includes(nestedKey)) {
              throw new Error(`${path}.${key}.${nestedKey} is not a valid key; expected one of: ${domain.nested.join(', ')}`);
            }
          }
        }
      }
    }
    assertNumericLeaves(value, path);
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
  if (value < 0) throw new Error(`${path} cannot be negative`);
}

const SERVICE_METADATA_FIELDS = new Set([
  'id','service','serviceType','pricing','tiers','active','taxable',
  'source','confirmedFields','validationInputs','starterSuggestion'
]);
const SERVICE_QUOTE_FIELDS = new Set(['peakMonths','peakSurchargePercent','disclaimer']);

function validateServiceShape(service, index) {
  if (!service || typeof service !== 'object') throw new Error(`services[${index}] must be an object`);
  if (!SERVICE_TYPES.includes(service.serviceType)) throw new Error(`services[${index}].serviceType is invalid`);
  if (service.service && String(service.service).length > 40) throw new Error(`services[${index}].service must be at most 40 characters`);
  if (service.serviceType === 'CUSTOM' && service.low !== undefined && service.high !== undefined && Number(service.high) <= Number(service.low)) {
    throw new Error(`services[${index}].high must be greater than low`);
  }
  const ownerFields = ALL_OWNER_FIELDS[service.serviceType] || [];
  const class2Defaults = CLASS2_DEFAULTS_BY_SERVICE[service.serviceType] || {};
  const class2Fields = Object.keys(class2Defaults);
  const pricing = pricingFor(service);
  const allowedFields = new Set([...ownerFields, ...class2Fields, ...SERVICE_METADATA_FIELDS, ...SERVICE_QUOTE_FIELDS]);
  for (const field of Object.keys(pricing)) {
    if (!allowedFields.has(field)) {
      throw new Error(`services[${index}].${field} is not a supported pricing field for ${service.serviceType}`);
    }
  }
  for (const field of ownerFields) {
    validateOwnerFieldValue(service.serviceType, field, pricing[field], `services[${index}].${field}`);
  }
  for (const field of class2Fields) {
    if (pricing[field] !== undefined) assertExactClass2Shape(pricing[field], class2Defaults[field], `services[${index}].${field}`);
  }
  if (pricing.peakMonths !== undefined) {
    if (!Array.isArray(pricing.peakMonths) || pricing.peakMonths.some(month => !Number.isInteger(month) || month < 1 || month > 12)) {
      throw new Error(`services[${index}].peakMonths must contain only month numbers 1 through 12`);
    }
  }
  if (pricing.peakSurchargePercent !== undefined &&
      (typeof pricing.peakSurchargePercent !== 'number' || !Number.isFinite(pricing.peakSurchargePercent) || pricing.peakSurchargePercent < 0)) {
    throw new Error(`services[${index}].peakSurchargePercent must be a finite non-negative number`);
  }
  if (pricing.disclaimer !== undefined && pricing.disclaimer !== null && typeof pricing.disclaimer !== 'string') {
    throw new Error(`services[${index}].disclaimer must be a string or null`);
  }
  if (service.tiers !== undefined) {
    if (!Array.isArray(service.tiers) || service.tiers.length > 3) throw new Error(`services[${index}].tiers must contain at most three tiers`);
    const overridableFields = new Set([...ownerFields, ...class2Fields]);
    service.tiers.forEach((tier, tierIndex) => {
      if (!tier || typeof tier.name !== 'string' || !tier.name.trim()) {
        throw new Error(`services[${index}].tiers[${tierIndex}].name is required`);
      }
      if (!tier.overrides || typeof tier.overrides !== 'object' || Array.isArray(tier.overrides)) {
        throw new Error(`services[${index}].tiers[${tierIndex}].overrides must be an object`);
      }
      for (const [field, value] of Object.entries(tier.overrides)) {
        if (!overridableFields.has(field)) {
          throw new Error(`services[${index}].tiers[${tierIndex}].overrides.${field} is not a pricing field for ${service.serviceType}`);
        }
        if (value === undefined) continue;
        const overridePath = `services[${index}].tiers[${tierIndex}].overrides.${field}`;
        if (ownerFields.includes(field)) validateOwnerFieldValue(service.serviceType, field, value, overridePath);
        else assertExactClass2Shape(value, class2Defaults[field], overridePath);
      }
    });
  }
}

const SUPPORTED_DEFAULT_FIELDS = new Set([
  'markupPercent','markupMode','overheadFixed','minimumJobPrice','travelFee',
  'disposalFee','permitFee','taxMode','taxPercent','rangeBufferPercent',
  'laborHourlyRate','peakMonths','peakSurchargePercent','markupApplies'
]);
const MARKUP_CATEGORIES = new Set([
  'labor','material','removal','prep','addon','equipment','travel',
  'disposal','permit','overhead'
]);

function validatePricebookDefaults(defaults = {}) {
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) throw new Error('Price book defaults must be an object');
  for (const field of Object.keys(defaults)) {
    if (!SUPPORTED_DEFAULT_FIELDS.has(field)) throw new Error(`defaults.${field} is not supported`);
  }
  if (!['markup','margin'].includes(defaults.markupMode || 'markup')) throw new Error('markupMode must be markup or margin');
  if (!['TAX_NONE','TAX_MATERIALS','TAX_ALL'].includes(defaults.taxMode || 'TAX_NONE')) throw new Error('taxMode is invalid');
  if (defaults.markupPercent !== undefined && typeof defaults.markupPercent !== 'number') throw new Error('markupPercent must be a number');
  if (defaults.taxPercent !== undefined && typeof defaults.taxPercent !== 'number') throw new Error('taxPercent must be a number');
  const markupPercent = Number(defaults.markupPercent || 0);
  const taxPercent = Number(defaults.taxPercent || 0);
  if (!Number.isFinite(markupPercent) || markupPercent < 0 || (defaults.markupMode === 'margin' && markupPercent >= 100)) {
    throw new Error('markupPercent is invalid');
  }
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) throw new Error('taxPercent is invalid');

  for (const field of ['travelFee','disposalFee','permitFee','overheadFixed','minimumJobPrice','rangeBufferPercent','peakSurchargePercent','laborHourlyRate']) {
    const value = defaults[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`defaults.${field} must be a finite non-negative number`);
    }
  }
  if (defaults.peakMonths !== undefined &&
      (!Array.isArray(defaults.peakMonths) || defaults.peakMonths.some(month => !Number.isInteger(month) || month < 1 || month > 12))) {
    throw new Error('defaults.peakMonths must contain only month numbers 1 through 12');
  }
  if (defaults.markupApplies !== undefined) {
    if (!defaults.markupApplies || typeof defaults.markupApplies !== 'object' || Array.isArray(defaults.markupApplies)) {
      throw new Error('defaults.markupApplies must be an object');
    }
    for (const [category, enabled] of Object.entries(defaults.markupApplies)) {
      if (!MARKUP_CATEGORIES.has(category)) throw new Error(`defaults.markupApplies.${category} is not supported`);
      if (typeof enabled !== 'boolean') throw new Error(`defaults.markupApplies.${category} must be true or false`);
    }
  }
  return true;
}

export function validatePricebookShape(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Price book must be an object');
  if (!Array.isArray(data.services)) throw new Error('Price book services must be an array');
  data.services.forEach(validateServiceShape);
  validatePricebookDefaults(data.defaults || {});
  return true;
}

export function saveValidatedPricebook(ownerId, dollarPricebook) {
  validatePricebookShape(dollarPricebook);
  const cents = dollarsToCents(dollarPricebook);
  // Class 2 defaults must be STORED per service, not merely displayed
  // (quote_engine_v2.md "store them per service in pricing"). Class 2
  // values are quantity factors, never money, so merging after the
  // cents conversion is safe.
  cents.services = (cents.services || []).map(service => {
    const defaults = CLASS2_DEFAULTS_BY_SERVICE[service.serviceType] || {};
    const withDefaults = { ...service };
    for (const [field, value] of Object.entries(defaults)) {
      if (withDefaults[field] === undefined) withDefaults[field] = structuredClone(value);
    }
    return withDefaults;
  });
  const statuses = pricebookStatuses(cents);
  const statusByType = new Map(statuses.map(status => [status.serviceType, status]));
  cents.services = cents.services.map(service => ({
    ...service,
    active: statusByType.get(service.serviceType)?.status === 'QUOTING LIVE'
  }));
  savePricebook(ownerId, cents);
  const saved = loadPricebook(ownerId);
  return { pricebook: saved, statuses: pricebookStatuses(saved) };
}
