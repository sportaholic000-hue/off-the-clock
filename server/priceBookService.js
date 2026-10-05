import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, openSync, fsyncSync, closeSync, existsSync } from 'node:fs';
import { convertPricebookMoney } from './priceBookMoney.js';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { types } from 'node:util';
import { ALL_OWNER_FIELDS, CLASS2_DEFAULTS_BY_SERVICE, SERVICE_NAMES, ownerFieldLabel } from './priceBookMetadata.js';
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

