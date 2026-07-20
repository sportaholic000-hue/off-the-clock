import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { getRequiredOwnerFields, SERVICE_TYPES } from './quoteTemplates.js';
import { getActivationOwnerFields, MONEY_FIELD_NAMES } from './priceBookMetadata.js';

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

function isMissing(pricing, field) {
  const value = pricing[field];
  if (field === 'postsIncludedInMaterial') return typeof value !== 'boolean';
  if (field === 'unit') return !['flat','per_sqft','per_hour','per_unit','per_LF','per_square'].includes(value);
  if (value === undefined || value === null || value === '') return true;
  if (value && typeof value === 'object') {
    const leaves = numericLeaves(value);
    return leaves.length === 0 || leaves.some(number => !Number.isFinite(number) || number <= 0);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return true;
  return !zeroAllowedOwnerFields.has(field) && value === 0;
}

export function pricebookServiceStatus(service) {
  const customerInputs = service.validationInputs || {};
  const requiredFields = [...new Set([
    ...getActivationOwnerFields(service.serviceType, pricingFor(service)),
    ...getRequiredOwnerFields(service.serviceType, customerInputs)
  ])];
  let missingOwnerFields = requiredFields.filter(field => isMissing(pricingFor(service), field));
  if (service.source === 'AI_SUGGESTED' && service.ownerConfirmed !== true) {
    missingOwnerFields = [...requiredFields];
  }
  const active = missingOwnerFields.length === 0;
  return {
    serviceType: service.serviceType,
    service: service.service || service.serviceType,
    status: active ? 'QUOTING LIVE' : 'NEEDS PRICING',
    missingOwnerFields
  };
}

export function pricebookStatuses(pricebook) {
  return (pricebook.services || []).map(pricebookServiceStatus);
}

function validateServiceShape(service, index) {
  if (!service || typeof service !== 'object') throw new Error(`services[${index}] must be an object`);
  if (!SERVICE_TYPES.includes(service.serviceType)) throw new Error(`services[${index}].serviceType is invalid`);
  if (service.service && String(service.service).length > 40) throw new Error(`services[${index}].service must be at most 40 characters`);
  if (service.serviceType === 'CUSTOM' && service.low !== undefined && service.high !== undefined && Number(service.high) <= Number(service.low)) {
    throw new Error(`services[${index}].high must be greater than low`);
  }
  if (service.tiers !== undefined) {
    if (!Array.isArray(service.tiers) || service.tiers.length > 3) throw new Error(`services[${index}].tiers must contain at most three tiers`);
    service.tiers.forEach((tier, tierIndex) => {
      if (!tier || typeof tier.name !== 'string' || !tier.name.trim()) {
        throw new Error(`services[${index}].tiers[${tierIndex}].name is required`);
      }
      if (!tier.overrides || typeof tier.overrides !== 'object' || Array.isArray(tier.overrides)) {
        throw new Error(`services[${index}].tiers[${tierIndex}].overrides must be an object`);
      }
    });
  }
}

export function validatePricebookShape(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Price book must be an object');
  if (!Array.isArray(data.services)) throw new Error('Price book services must be an array');
  data.services.forEach(validateServiceShape);
  const defaults = data.defaults || {};
  if (!['markup','margin'].includes(defaults.markupMode || 'markup')) throw new Error('markupMode must be markup or margin');
  if (!['TAX_NONE','TAX_MATERIALS','TAX_ALL'].includes(defaults.taxMode || 'TAX_NONE')) throw new Error('taxMode is invalid');
  const markupPercent = Number(defaults.markupPercent || 0);
  const taxPercent = Number(defaults.taxPercent || 0);
  if (!Number.isFinite(markupPercent) || markupPercent < 0 || (defaults.markupMode === 'margin' && markupPercent >= 100)) {
    throw new Error('markupPercent is invalid');
  }
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) throw new Error('taxPercent is invalid');
  return true;
}

export function saveValidatedPricebook(ownerId, dollarPricebook) {
  validatePricebookShape(dollarPricebook);
  const cents = dollarsToCents(dollarPricebook);
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
