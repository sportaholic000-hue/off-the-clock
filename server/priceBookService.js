import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, openSync, fsyncSync, closeSync, existsSync } from 'node:fs';
import { convertPricebookMoney } from './priceBookMoney.js';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { types } from 'node:util';
import { getRequiredOwnerFields, SERVICE_TYPES } from './quoteTemplates.js';
import { getActivationOwnerFields, ALL_OWNER_FIELDS, CLASS2_DEFAULTS_BY_SERVICE, SERVICE_NAMES, ownerFieldLabel, getServiceMetadata, shapedFieldKeys } from './priceBookMetadata.js';
import { class2FieldCopy, displayPricingValue } from './priceBookCopy.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Read at use, never at module load. Production sets PRICEBOOK_PATH (on the
// persistent volume) during startup; a module that loads earlier must not
// freeze the default container folder as the storage location.
export function pricebookDirectory() {
  const configuredDir = process.env.PRICEBOOK_PATH;
  return configuredDir
    ? (isAbsolute(configuredDir) ? configuredDir : resolve(projectRoot, configuredDir))
    : resolve(projectRoot, 'data', 'pricebooks');
}
const zeroAllowedOwnerFields = new Set(['minimumJob', 'repairMinimum', 'minimumServiceCharge']);

// A saved book that cannot be read, or that is not this owner's book, stops
// quoting for that owner. It is never replaced by defaults, a temporary file or
// any earlier copy, because that would quote outdated prices without anyone
// noticing. The owner sees an error until the file is restored on purpose.
export function unreadablePricebook(ownerId, reason) {
  const error = new Error(`The saved price book for ${ownerId} cannot be used (${reason}). Quoting is paused until it is restored.`);
  error.code = 'PRICEBOOK_UNREADABLE';
  error.statusCode = 503;
  error.retryable = false;
  return error;
}

export function loadPricebook(ownerId) {
  let text;
  try { text = readFileSync(resolve(pricebookDirectory(), `${ownerId}.json`), 'utf8'); }
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
          rangeBufferPercent: 10,
          // Optional seasonal labor surcharge: off unless the owner turns it on.
          peakMonths: [],
          peakSurchargePercent: 0
        }
      };
    }
    throw err;
  }
  let book;
  try { book = JSON.parse(text); }
  catch { throw unreadablePricebook(ownerId, 'the file is not valid JSON'); }
  if (!book || typeof book !== 'object' || Array.isArray(book)) throw unreadablePricebook(ownerId, 'the file is not a price book');
  if (Object.hasOwn(book, 'ownerId') && book.ownerId !== ownerId) throw unreadablePricebook(ownerId, 'the file belongs to a different business');
  if (!Array.isArray(book.services)) throw unreadablePricebook(ownerId, 'the service list is missing');
  if (book.defaults !== undefined && (!book.defaults || typeof book.defaults !== 'object' || Array.isArray(book.defaults))) throw unreadablePricebook(ownerId, 'the business settings are malformed');
  return book;
}

// The replacement below is atomic (rename over the old file) but only durable
// once the directory entry itself is flushed. Without that flush a power loss
// can bring back the previous file after the owner was told the save
// succeeded. Windows cannot open a directory for flushing, so it is skipped
// there; deployment is Linux.
// Each operation calls the current node:fs binding, so tooling that replaces an
// fs function (and syncs ESM exports) is honoured.
const defaultFileOps = {
  writeFileSync: (...args) => writeFileSync(...args), renameSync: (...args) => renameSync(...args), unlinkSync: (...args) => unlinkSync(...args),
  openSync: (...args) => openSync(...args), fsyncSync: (...args) => fsyncSync(...args), closeSync: (...args) => closeSync(...args), platform: process.platform
};
export function flushDirectory(path, ops = defaultFileOps) {
  if (ops.platform === 'win32') return;
  const descriptor = ops.openSync(path, 'r');
  try { ops.fsyncSync(descriptor); }
  finally { ops.closeSync(descriptor); }
}

// A replacement whose durability is not confirmed pauses quoting for that owner.
// The marker file is written and flushed BEFORE the saved book is replaced and
// removed only after the replacement is confirmed on disk, so a failed flush, a
// crash or a restart can never leave quoting running on an unconfirmed save. The
// owner can still open the book; the next fully confirmed save clears the marker.
const unconfirmedMarker = (directory, ownerId) => resolve(directory, `${ownerId}.unconfirmed`);
export function pricebookSaveUnconfirmed(ownerId) { return existsSync(unconfirmedMarker(pricebookDirectory(), ownerId)); }
const notDurable = cause => Object.assign(new Error('The price book change could not be confirmed on disk. Quoting is paused for this business until a save is confirmed. Save again.'), { code:'PRICEBOOK_NOT_DURABLE', statusCode:503, retryable:true, cause });

// Writes a complete sibling file and the unconfirmed marker (both flushed),
// renames the file over the saved book, flushes the directory, then removes the
// marker. Rules:
// - A marker left by an earlier unconfirmed save is never removed by a save that
//   fails before replacing the book: quoting stays paused on the unconfirmed book.
// - Once the replacement is confirmed on disk the save has succeeded. If removing
//   the marker fails, quoting stays paused and the save reports that truthfully;
//   if only the flush after removing it fails, the save is durable and quoting
//   resumes (after a crash the marker could reappear, which pauses quoting again:
//   the safe direction).
// Exported with replaceable file operations so each failure can be tested.
export function writePricebookFile(directory, ownerId, serialized, ops = defaultFileOps, beforeReplace = null) {
  const target = resolve(directory, `${ownerId}.json`);
  const temporary = resolve(directory, `${ownerId}.${crypto.randomUUID()}.tmp`);
  const marker = unconfirmedMarker(directory, ownerId);
  const markerExisted = (ops.existsSync || existsSync)(marker);
  const cleanup = (error, paths) => { for (const path of paths) { try { ops.unlinkSync(path); } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError.code; } } };
  const ownMarker = markerExisted ? [] : [marker];
  try { ops.writeFileSync(temporary, serialized, { flag: 'wx', flush: true }); }
  catch (error) { if (error.code !== 'EEXIST') cleanup(error, [temporary]); throw error; }
  try { ops.writeFileSync(marker, 'unconfirmed price-book replacement\n', { flush: true }); flushDirectory(directory, ops); }
  catch (error) { cleanup(error, [temporary, ...ownMarker]); throw error; }   // nothing replaced
  // Last check before replacing: the caller still holds its save lock.
  try { beforeReplace?.(); ops.renameSync(temporary, target); }
  catch (error) { cleanup(error, [temporary, ...ownMarker]); throw error; }    // nothing replaced
  try { flushDirectory(directory, ops); } catch (cause) { throw notDurable(cause); }   // marker stays: quoting paused
  try { ops.unlinkSync(marker); }
  catch (cause) { throw Object.assign(new Error('The price book was saved, but quoting could not be resumed. Quoting stays paused for this business until the next successful save.'), { code:'PRICEBOOK_PAUSE_NOT_CLEARED', statusCode:503, retryable:true, cause }); }
  try { flushDirectory(directory, ops); } catch { /* the replacement is durable; see the rules above */ }
}

// A per-owner SQLite transaction locks the whole read-check-write sequence.
// SQLite releases its OS lock on close or process death; no stale lock record is
// recovered or unlinked. Different owners use different files and do not wait
// for each other's saves. The files live beside the price-book directory.
// The transaction writes no SQLite data: the JSON replacement is the durable
// save, so there is no auxiliary COMMIT after the book has already been saved.
// Lock files from older implementations are ignored. All writer processes must
// run this protocol on a local filesystem, as used by the deployment.
const SAVE_WAIT_MS = 2000;
const heldSaves = new Set();
function runSaveWork(work) {
  if (types.isAsyncFunction(work)) throw new Error('Price-book saves must run synchronously inside the save lock.');
  const result = work();
  if (result && typeof result.then === 'function') throw new Error('Price-book saves must run synchronously inside the save lock.');
  return result;
}
function closeSaveMutex(db) {
  try { db.close(); }
  catch {
    // Cleanup cannot undo a confirmed JSON replacement or change its result.
    // Retry a still-open handle, and surface an operational warning if needed.
    try { if (db.open) db.close(); } catch {}
    if (db.open) process.emitWarning('The price-book save lock could not be closed; restart this worker before retrying saves.', { code:'PRICEBOOK_LOCK_RELEASE_FAILED' });
  }
}
const busySave = cause => Object.assign(new Error('Another save for this price book is in progress. Reload and try again; nothing was changed.'), { code:'PRICEBOOK_BUSY', statusCode:409, cause });
export function withPricebookLock(ownerId, work) {
  const ownerKey = String(ownerId);
  if (heldSaves.has(ownerKey)) return runSaveWork(work);
  const directory = resolve(pricebookDirectory()) + '.saves';
  mkdirSync(directory, { recursive: true });
  const filename = crypto.createHash('sha256').update(ownerKey).digest('hex') + '.sqlite';
  const db = new Database(resolve(directory, filename), { timeout: SAVE_WAIT_MS });
  try {
    try { db.exec('BEGIN IMMEDIATE'); }
    catch (error) { if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') throw busySave(error); throw error; }
    heldSaves.add(ownerKey);
    return runSaveWork(work);
  } finally { heldSaves.delete(ownerKey); closeSaveMutex(db); }
}

export function savePricebook(ownerId, data) {
  // Every write is serialized, even from a caller that did not take the lock itself.
  if (!heldSaves.has(String(ownerId))) return withPricebookLock(ownerId, () => savePricebook(ownerId, data));
  const dir = pricebookDirectory();
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
  // A failed write, rename or directory flush must never truncate the last
  // accepted owner data or report an unconfirmed save as successful.
  writePricebookFile(dir, ownerId, JSON.stringify(next, null, 2));
  return { success: true, pricebook: next };
}

export function hasPricing(ownerId) {
  return loadPricebook(ownerId).services.filter(service => service.active).length > 0;
}

// Unit-aware conversion occurs only at the application's dollar/cent boundary.
export const dollarsToCents = data => convertPricebookMoney(data, 'toCents');
export const centsToDollars = data => convertPricebookMoney(data, 'toDollars');

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
  // Owner-selectable product domains (flooring, siding types) may be offered as
  // a supported subset: at least one type must be enabled and fully priced.
  // Every type the owner DID enable is still validated in full below, so a
  // partially-priced offering still blocks activation. Absent keys mean the
  // business does not offer that product.
  const requiredKeys = domain.ownerSelectable
    ? presentKeys
    : Array.isArray(domain.keys)
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

// Owner-selectable product offerings must be consistent ACROSS the required
// product-specific pricing fields, not merely valid within each field
// independently. A product type counts as ENABLED as soon as it appears in any
// required product-specific field; once enabled it must carry a positive price
// in EVERY such field. This blocks disjoint maps — e.g. siding labor priced
// only for vinyl while siding material is priced only for wood — where each
// field is individually well-formed but no single product is actually sellable.
// Returns the product keys that are enabled but incompletely priced.
export function inconsistentOfferings(serviceType, pricing, requiredFields) {
  const selectableFields = requiredFields.filter(field => {
    const domain = shapedFieldKeys(serviceType, field);
    return domain?.ownerSelectable === true;
  });
  if (selectableFields.length < 1) return [];

  const enabled = new Set();
  for (const field of selectableFields) {
    const value = pricing[field];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const key of Object.keys(value)) enabled.add(key);
  }
  if (!enabled.size) return [];

  // A product is fully priced only if every selectable field carries a
  // positive price for it. Absent means NOT OFFERED, never free.
  const incomplete = [...enabled].filter(key =>
    selectableFields.some(field => !positiveOwnerPrice(pricing[field]?.[key]))
  );
  return incomplete.sort();
}

// True when no single product type is completely priced across all required
// product-specific fields.
function noCompleteOffering(serviceType, pricing, requiredFields) {
  const selectableFields = requiredFields.filter(field => {
    const domain = shapedFieldKeys(serviceType, field);
    return domain?.ownerSelectable === true;
  });
  if (selectableFields.length < 1) return false;

  const enabled = new Set();
  for (const field of selectableFields) {
    const value = pricing[field];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const key of Object.keys(value)) enabled.add(key);
  }
  return ![...enabled].some(key =>
    selectableFields.every(field => positiveOwnerPrice(pricing[field]?.[key]))
  );
}

export const AI_SOURCES = new Set(['AI_SUGGESTED', 'AI_INTERVIEW']);

export function pricebookServiceStatus(service) {
  const customerInputs = service.validationInputs || {};
  const requiredFields = [...new Set([
    ...getActivationOwnerFields(service.serviceType, pricingFor(service)),
    ...getRequiredOwnerFields(service.serviceType, customerInputs)
  ])];
  let missingOwnerFields = requiredFields.filter(field => isMissing(service.serviceType, pricingFor(service), field));

  // Cross-field offering consistency. Each product-specific pricing field may
  // individually pass while no single product type is completely priced across
  // all of them (disjoint labor/material maps). Those fields must be reported
  // as blockers so the service cannot activate.
  const offeringGaps = inconsistentOfferings(service.serviceType, pricingFor(service), requiredFields);
  const noOffering = noCompleteOffering(service.serviceType, pricingFor(service), requiredFields);
  if (offeringGaps.length || noOffering) {
    const selectableFields = requiredFields.filter(field =>
      shapedFieldKeys(service.serviceType, field)?.ownerSelectable === true);
    missingOwnerFields = [...new Set([...missingOwnerFields, ...selectableFields])];
  }

  if (AI_SOURCES.has(service.source)) {
    const confirmed = service.confirmedFields && typeof service.confirmedFields === 'object' ? service.confirmedFields : {};
    // EVERY field the AI populated must be individually confirmed (or
    // removed), optional fields included: unconfirmed optional charges
    // must never reach a live quote.
    const gated = [...new Set([
      ...requiredFields,
      ...(ALL_OWNER_FIELDS[service.serviceType] || []).filter(field => pricingFor(service)[field] !== undefined),
      ...(service.tiers || []).flatMap(tier => Object.keys(tier.overrides || {}))
        .filter(field => (ALL_OWNER_FIELDS[service.serviceType] || []).includes(field))
    ])];
    const unconfirmed = gated.filter(field => confirmed[field] !== true);
    missingOwnerFields = [...new Set([...missingOwnerFields, ...unconfirmed])];
  }
  const active = missingOwnerFields.length === 0;
  return {
    serviceType: service.serviceType,
    service: service.service || SERVICE_NAMES[service.serviceType] || 'Service',
    status: !active ? 'NEEDS PRICING' : service.active === false ? 'DISABLED' : 'QUOTING LIVE',
    missingOwnerFields,
    missingOwnerLabels: missingOwnerFields.map(field => ownerFieldLabel(service.serviceType, field)),
    // Product types the owner enabled but did not price across every required
    // product-specific field. Empty when offerings are consistent.
    incompleteOfferings: offeringGaps
  };
}


const DEFAULT_DISPLAY_NAMES = {
  markupPercent:'Markup or margin percentage',
  markupMode:'Markup calculation method',
  overheadFixed:'Fixed overhead charge',
  minimumJobPrice:'Business-wide minimum job price',
  travelFee:'Travel charge',
  disposalFee:'Business-wide disposal charge',
  permitFee:'Permit charge',
  taxMode:'Tax mode',
  taxPercent:'Tax rate',
  rangeBufferPercent:'Estimate range buffer percentage',
  laborHourlyRate:'Business-wide labor rate per hour',
  peakMonths:'Peak-season months',
  peakSurchargePercent:'Peak-season surcharge percentage',
  markupApplies:'Markup categories'
};

const SERVICE_SETTING_NAMES = {
  serviceType:'Service type',
  service:'Service name',
  tiers:'Pricing tiers',
  name:'Tier name',
  overrides:'Tier price overrides',
  peakMonths:'Peak-season months',
  peakSurchargePercent:'Peak-season surcharge percentage',
  disclaimer:'Customer estimate note'
};

function serviceSettingName(pricebook, index, field) {
  const service = pricebook?.services?.[Number(index)];
  const serviceType = service?.serviceType;
  if ((ALL_OWNER_FIELDS[serviceType] || []).includes(field)) return ownerFieldLabel(serviceType, field);
  if (Object.hasOwn(CLASS2_DEFAULTS_BY_SERVICE[serviceType] || {}, field)) return class2FieldCopy(serviceType, field).label;
  return SERVICE_SETTING_NAMES[field] || 'Submitted pricing value';
}

export function contractorValidationMessage(input, pricebook = {}) {
  let message = String(input || 'Review the highlighted pricing values and try again.');
  if (/not a supported pricing field/.test(message)) {
    const serviceMatch = message.match(/for ([A-Z][A-Z0-9_]+)/);
    const serviceName = SERVICE_NAMES[serviceMatch?.[1]] || 'This service';
    return `${serviceName} contains a pricing value that is not supported. Remove it before saving.`;
  }

  message = message.replace(
    /services\[(\d+)\]\.tiers\[(\d+)\](?:\.overrides)?\.([A-Za-z][A-Za-z0-9]*)(\.[A-Za-z0-9_]+)*/g,
    (matched, serviceIndex, tierIndex, field) => `Tier ${Number(tierIndex) + 1}: ${serviceSettingName(pricebook, serviceIndex, field)}`
  );
  message = message.replace(
    /services\[(\d+)\]\.([A-Za-z][A-Za-z0-9]*)(\.[A-Za-z0-9_]+)*/g,
    (matched, serviceIndex, field) => serviceSettingName(pricebook, serviceIndex, field)
  );
  message = message.replace(
    /defaults\.([A-Za-z][A-Za-z0-9]*)(?:\.([A-Za-z0-9_]+))?/g,
    (matched, field, category) => `${DEFAULT_DISPLAY_NAMES[field] || 'Business-wide pricing setting'}${category ? `: ${displayPricingValue(category)}` : ''}`
  );
  for (const [field, label] of Object.entries(DEFAULT_DISPLAY_NAMES)) {
    message = message.replace(new RegExp(`\\b${field}\\b`, 'g'), label);
  }
  for (const [serviceType, label] of Object.entries(SERVICE_NAMES)) {
    message = message.replace(new RegExp(`\\b${serviceType}\\b`, 'g'), label);
  }
  message = message.replace(/\b(?:per_[A-Za-z0-9_]+|[a-z]+_[a-z0-9_]+)\b/g, value => displayPricingValue(value));

  const rawIdentifier = /\b[a-z][a-z0-9]*(?:[A-Z][A-Za-z0-9]*)+\b|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b[a-z]+(?:_[A-Za-z0-9]+)+\b/;
  if (rawIdentifier.test(message)) return 'Review the highlighted pricing values and try again.';
  return message;
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
    dollarsToCents({ defaults:pricebook.defaults || {} });
  } catch (error) {
    const message = contractorValidationMessage(error.message, pricebook);
    validationErrors.push(message);
    defaultValidationErrors.push(message);
  }

  const statuses = pricebook.services.map((service, index) => {
    let status;
    try {
      status = pricebookServiceStatus(service);
      validateServiceShape(service, index);
      dollarsToCents({ service });
    } catch (error) {
      const message = contractorValidationMessage(error.message, pricebook);
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
  if (service.active !== undefined && typeof service.active !== 'boolean') throw new Error(`services[${index}].active must be true or false`);
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
  'quoteTimeZone','currency','laborHourlyRate','peakMonths','peakSurchargePercent','markupApplies'
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
  if(defaults.currency!==undefined&&!['CAD','USD'].includes(defaults.currency))throw Object.assign(new Error('defaults.currency must be CAD or USD'),{statusCode:400});
  if(defaults.quoteTimeZone!==undefined){try{if(typeof defaults.quoteTimeZone!=='string'||!defaults.quoteTimeZone.trim())throw Error();new Intl.DateTimeFormat('en-US',{timeZone:defaults.quoteTimeZone});}catch{throw Error('defaults.quoteTimeZone must be a valid business time zone');}}
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
    const nested = service.pricing && typeof service.pricing === 'object' && !Array.isArray(service.pricing);
    if (nested) withDefaults.pricing = { ...service.pricing };
    const target = nested ? withDefaults.pricing : withDefaults;
    for (const [field, value] of Object.entries(defaults)) {
      // Keep defaults in the existing pricing container. Preserve legacy
      // service-root factors without copying or reinterpreting their values.
      if (target[field] === undefined && (!nested || withDefaults[field] === undefined)) {
        target[field] = structuredClone(value);
      }
    }
    return withDefaults;
  });
  cents.services = cents.services.map(service => ({
    ...service,
    // Validate each record independently. Completeness cannot override a
    // disabled choice or borrow readiness from another service of the same type.
    active: service.active !== false && pricebookServiceStatus(service).status === 'QUOTING LIVE'
  }));
  savePricebook(ownerId, cents);
  const saved = loadPricebook(ownerId);
  return { pricebook: saved, statuses: pricebookStatuses(saved) };
}
