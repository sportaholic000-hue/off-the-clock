import {validatePricebookReceptionistSettings} from './src/voice/receptionistSettings.js';
import Database from 'better-sqlite3';
import {mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,openSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {convertPricebookMoney} from './priceBookMoney.js';
import {dirname,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import { types } from 'node:util';
import { ALL_OWNER_FIELDS, CLASS2_DEFAULTS_BY_SERVICE, SERVICE_NAMES, ownerFieldLabel } from './priceBookMetadata.js';
import { class2FieldCopy, displayPricingValue } from './priceBookCopy.js';
import { pricebookStructureIssue, validPricebookServiceId, missingPricebookServiceId } from './priceBookStructure.js';
import {db as applicationDb} from './src/db.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function pricebookDirectory() {
  const configuredDir = process.env.PRICEBOOK_PATH;
  return configuredDir
    ? (isAbsolute(configuredDir) ? configuredDir : resolve(projectRoot, configuredDir))
    : resolve(projectRoot, 'data', 'pricebooks');
}

export function unreadablePricebook(ownerId, reason, {ownerRecovery=false}={}) {
  const recovery = ownerRecovery
    ? ' Restore the saved price-book file from backup or contact support; do not create a replacement book.'
    : '';
  const error = new Error(`The saved price book for ${ownerId} cannot be used (${reason}). Quoting is paused until it is restored.${recovery}`);
  error.code = 'PRICEBOOK_UNREADABLE';
  // Recovery conflicts must be visible to the authenticated owner. Other
  // unreadable storage failures remain service-unavailable responses.
  error.statusCode = ownerRecovery ? 409 : 503;
  error.retryable = false;
  return error;
}

let creationRecordsReady = false;
function ensureCreationRecords() {
  if (creationRecordsReady) return;
  applicationDb.exec(`CREATE TABLE IF NOT EXISTS priceBookCreationRecords (
    ownerId TEXT PRIMARY KEY,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);
  creationRecordsReady = true;
}
export function pricebookCreationRecorded(ownerId) {
  ensureCreationRecords();
  return Boolean(applicationDb.prepare('SELECT 1 FROM priceBookCreationRecords WHERE ownerId = ?').get(String(ownerId)));
}
function recordPricebookCreation(ownerId, timestamp = new Date().toISOString()) {
  ensureCreationRecords();
  applicationDb.prepare(`INSERT INTO priceBookCreationRecords(ownerId,createdAt,updatedAt)
    VALUES(?,?,?) ON CONFLICT(ownerId) DO UPDATE SET updatedAt=excluded.updatedAt`).run(String(ownerId),timestamp,timestamp);
}
function missingCreatedPricebook(ownerId) {
  return unreadablePricebook(ownerId, 'a durable creation record exists but the saved file is missing', {ownerRecovery:true});
}
function blankPricebook(ownerId) {
  return {
    ownerId,
    services: [],
    defaults: {
      markupPercent: 30,
      markupMode: 'markup',
      taxMode: 'TAX_NONE',
      taxPercent: 0,
      rangeBufferPercent: 10,
      peakMonths: [],
      peakSurchargePercent: 0
    }
  };
}

export function loadPricebook(ownerId) {
  const target = resolve(pricebookDirectory(), `${ownerId}.json`);
  let text;
  try { text = readFileSync(target, 'utf8'); }
  catch (err) {
    if (err.code === 'ENOENT') {
      if (pricebookCreationRecorded(ownerId)) throw missingCreatedPricebook(ownerId);
      return blankPricebook(ownerId);
    }
    throw err;
  }
  let book;
  try { book = JSON.parse(text); }
  catch { throw unreadablePricebook(ownerId, 'the file is not valid JSON'); }
  if (!book || typeof book !== 'object' || Array.isArray(book)) throw unreadablePricebook(ownerId, 'the file is not a price book');
  if (Object.hasOwn(book, 'ownerId') && book.ownerId !== ownerId) throw unreadablePricebook(ownerId, 'the file belongs to a different business');
  const issue = pricebookStructureIssue(book);
  if (issue) throw unreadablePricebook(ownerId, issue);
  // Backfill the durable record for books created before this guard existed.
  recordPricebookCreation(ownerId, typeof book.updatedAt === 'string' ? book.updatedAt : undefined);
  return book;
}

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

const unconfirmedMarker = (directory, ownerId) => resolve(directory, `${ownerId}.unconfirmed`);
export function pricebookSaveUnconfirmed(ownerId) { return existsSync(unconfirmedMarker(pricebookDirectory(), ownerId)); }
const notDurable = cause => Object.assign(new Error('The price book change could not be confirmed on disk. Quoting is paused for this business until a save is confirmed. Save again.'), { code:'PRICEBOOK_NOT_DURABLE', statusCode:503, retryable:true, cause });

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
  catch (error) { cleanup(error, [temporary, ...ownMarker]); throw error; }
  try { beforeReplace?.(); ops.renameSync(temporary, target); }
  catch (error) { cleanup(error, [temporary, ...ownMarker]); throw error; }
  try { flushDirectory(directory, ops); } catch (cause) { throw notDurable(cause); }
  try { ops.unlinkSync(marker); }
  catch (cause) { throw Object.assign(new Error('The price book was saved, but quoting could not be resumed. Quoting stays paused for this business until the next successful save.'), { code:'PRICEBOOK_PAUSE_NOT_CLEARED', statusCode:503, retryable:true, cause }); }
  try { flushDirectory(directory, ops); } catch { /* durable replacement; a reappearing marker fails closed */ }
}

const SAVE_WAIT_MS = 2000;
const heldSaves = new Set();
function runSaveWork(work) {
  if (types.isAsyncFunction(work)) throw new Error('Price-book saves must run synchronously inside the save lock.');
  const result = work();
  if (result && typeof result.then === 'function') throw new Error('Price-book saves must run synchronously inside the save lock.');
  return result;
}
function closeSaveMutex(database) {
  try { database.close(); }
  catch {
    try { if (database.open) database.close(); } catch {}
    if (database.open) process.emitWarning('The price-book save lock could not be closed; restart this worker before retrying saves.', { code:'PRICEBOOK_LOCK_RELEASE_FAILED' });
  }
}
const busySave = cause => Object.assign(new Error('Another save for this price book is in progress. Reload and try again; nothing was changed.'), { code:'PRICEBOOK_BUSY', statusCode:409, cause });
export function withPricebookLock(ownerId, work) {
  const ownerKey = String(ownerId);
  if (heldSaves.has(ownerKey)) return runSaveWork(work);
  const directory = resolve(pricebookDirectory()) + '.saves';
  mkdirSync(directory, { recursive: true });
  const filename = crypto.createHash('sha256').update(ownerKey).digest('hex') + '.sqlite';
  const mutex = new Database(resolve(directory, filename), { timeout: SAVE_WAIT_MS });
  try {
    try { mutex.exec('BEGIN IMMEDIATE'); }
    catch (error) { if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') throw busySave(error); throw error; }
    heldSaves.add(ownerKey);
    return runSaveWork(work);
  } finally { heldSaves.delete(ownerKey); closeSaveMutex(mutex); }
}

export function savePricebook(ownerId, data) {
  if (!heldSaves.has(String(ownerId))) return withPricebookLock(ownerId, () => savePricebook(ownerId, data));
  const invalid = reason => Object.assign(new Error(`The price book was not saved: ${reason}.`), { code:'PRICEBOOK_INVALID', statusCode:400 });
  const issue = pricebookStructureIssue(data);
  if (issue) throw invalid(issue);
  validatePricebookReceptionistSettings(data);
  const ids = new Set();
  const services = data.services.map(service => {
    const missing = missingPricebookServiceId(service.id);
    if (missing && (service.origin || service.quoteDoneApproval)) throw invalid('an existing approval or origin requires its original service UUID');
    const id = missing ? crypto.randomUUID() : service.id;
    if (!validPricebookServiceId(id) || ids.has(id.toLowerCase())) throw invalid('every service must have its own valid UUID');
    ids.add(id.toLowerCase());
    return { ...service, id };
  });
  const dir = pricebookDirectory();
  const target = resolve(dir, `${ownerId}.json`);
  if (pricebookCreationRecorded(ownerId) && !existsSync(target)) throw missingCreatedPricebook(ownerId);
  mkdirSync(dir, { recursive: true });
  const next = {
    ...data,
    ownerId,
    updatedAt: new Date().toISOString(),
    services
  };
  writePricebookFile(dir, ownerId, JSON.stringify(next, null, 2));
  recordPricebookCreation(ownerId, next.updatedAt);
  return { success: true, pricebook: next };
}

export function hasPricing(ownerId) {
  return loadPricebook(ownerId).services.filter(service => service.active).length > 0;
}

export const dollarsToCents = data => convertPricebookMoney(data, 'toCents');
export const centsToDollars = data => convertPricebookMoney(data, 'toDollars');

export const AI_SOURCES = new Set(['AI_SUGGESTED', 'AI_INTERVIEW']);

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
  for (const [field, label] of Object.entries(DEFAULT_DISPLAY_NAMES)) message = message.replace(new RegExp(`\\b${field}\\b`, 'g'), label);
  for (const [serviceType, label] of Object.entries(SERVICE_NAMES)) message = message.replace(new RegExp(`\\b${serviceType}\\b`, 'g'), label);
  message = message.replace(/\b(?:per_[A-Za-z0-9_]+|[a-z]+_[a-z0-9_]+)\b/g, value => displayPricingValue(value));

  const rawIdentifier = /\b[a-z][a-z0-9]*(?:[A-Z][A-Za-z0-9]*)+\b|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b[a-z]+(?:_[A-Za-z0-9]+)+\b/;
  if (rawIdentifier.test(message)) return 'Review the highlighted pricing values and try again.';
  return message;
}
