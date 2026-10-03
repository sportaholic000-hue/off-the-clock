import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Price-book saves: a complete flushed sibling file is renamed over the saved book
// and the directory is flushed before success is reported. Any failed step leaves
// the previous book in place and no temporary file. A book that cannot be read, or
// that belongs to another business, stops quoting instead of falling back to
// defaults, a temporary file or an earlier copy.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'otc-pricebook-durability-'));
process.env.PRICEBOOK_PATH = root;
const store = await import('../server/priceBookService.js');
const bridge = await import('../server/src/quoteDoneBridge.js');

const real = { writeFileSync:fs.writeFileSync, renameSync:fs.renameSync, unlinkSync:fs.unlinkSync, openSync:fs.openSync, fsyncSync:fs.fsyncSync, closeSync:fs.closeSync, platform:'linux' };
function scratch() {
  const dir = fs.mkdtempSync(path.join(root, 'case-')), ownerId = 'owner-' + crypto.randomUUID();
  fs.writeFileSync(path.join(dir, ownerId + '.json'), JSON.stringify({ ownerId, services:[], version:'previous' }));
  return { dir, ownerId, target:path.join(dir, ownerId + '.json'), files:() => fs.readdirSync(dir).sort() };
}
const errorWith = code => Object.assign(new Error(code), { code });

test('a save writes and flushes a sibling file, renames it, then flushes the directory before reporting success', () => {
  const { dir, ownerId, target, files } = scratch(), calls = [];
  const ops = { ...real,
    writeFileSync:(file, data, options) => { calls.push(['write', path.basename(file).endsWith('.tmp'), options.flush, options.flag]); return real.writeFileSync(file, data, options); },
    renameSync:(from, to) => { calls.push(['rename', to === target]); return real.renameSync(from, to); },
    openSync:(file, flags) => { calls.push(['open', file === dir, flags]); return real.openSync(file, flags); },
    fsyncSync:fd => { calls.push(['fsync']); return real.fsyncSync(fd); },
    closeSync:fd => { calls.push(['close']); return real.closeSync(fd); } };
  store.writePricebookFile(dir, ownerId, JSON.stringify({ ownerId, services:[], version:'next' }), ops);
  assert.deepEqual(calls, [['write', true, true, 'wx'], ['rename', true], ['open', true, 'r'], ['fsync'], ['close']]);
  assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).version, 'next');
  assert.deepEqual(files(), [ownerId + '.json']);
});

test('a failed or partial write keeps the previous book and removes the partial file', () => {
  const { dir, ownerId, target, files } = scratch();
  const ops = { ...real, writeFileSync:(file, data, options) => { real.writeFileSync(file, data.slice(0, 7), options); throw errorWith('ENOSPC'); } };
  assert.throws(() => store.writePricebookFile(dir, ownerId, JSON.stringify({ ownerId, services:[], version:'next' }), ops), { code:'ENOSPC' });
  assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).version, 'previous');
  assert.deepEqual(files(), [ownerId + '.json']);
});

test('a failed rename keeps the previous book and removes the temporary file', () => {
  const { dir, ownerId, target, files } = scratch();
  const ops = { ...real, renameSync:() => { throw errorWith('EIO'); } };
  assert.throws(() => store.writePricebookFile(dir, ownerId, JSON.stringify({ ownerId, services:[], version:'next' }), ops), { code:'EIO' });
  assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).version, 'previous');
  assert.deepEqual(files(), [ownerId + '.json']);
});

test('a real rename failure (saved book path is a directory) leaves no temporary file', () => {
  const dir = fs.mkdtempSync(path.join(root, 'case-')), ownerId = 'owner-' + crypto.randomUUID();
  fs.mkdirSync(path.join(dir, ownerId + '.json', 'occupied'), { recursive:true });
  assert.throws(() => store.writePricebookFile(dir, ownerId, '{}'));
  assert.deepEqual(fs.readdirSync(dir), [ownerId + '.json']);
});

test('an unconfirmed directory flush is reported as a failed save, and the directory handle is closed', () => {
  const { dir, ownerId } = scratch();
  let closed = 0;
  const ops = { ...real, fsyncSync:() => { throw errorWith('EIO'); }, closeSync:fd => { closed++; return real.closeSync(fd); } };
  assert.throws(() => store.writePricebookFile(dir, ownerId, JSON.stringify({ ownerId, services:[] }), ops), error => error.code === 'PRICEBOOK_NOT_DURABLE' && error.statusCode === 503 && error.cause?.code === 'EIO');
  assert.equal(closed, 1);
  assert.deepEqual(store.flushDirectory(dir, { ...real, platform:'win32', openSync:() => { throw new Error('must not open on Windows'); } }), undefined);
});

const CATEGORIES = ['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all = value => Object.fromEntries(CATEGORIES.map(key => [key, value]));
const defaults = { markupPercent:0, markupMode:'markup', overheadFixed:0, minimumJobPrice:0, travelFee:0, disposalFee:0, permitFee:0,
  taxMode:'TAX_NONE', taxPercent:0, rangeBufferPercent:0, markupApplies:all(true), peakMonths:[], peakSurchargePercent:0 };
const patio = rate => ({ serviceType:'CONCRETE_PATIO_SLAB', service:'Patio', source:'MANUAL', active:true, tiers:[],
  feeRules:{ travel:'not_applicable', disposal:'not_applicable', permit:'not_applicable', overhead:'not_applicable' },
  priceBasisByCategory:all('cost'), taxabilityByCategory:all(false), pricing:{ laborPerSqft:rate, concreteCostPerCubicYard:172, formworkPerLF:2.85, minimumJob:0 } });
const inputs = { dimensionMethod:'measured_area_perimeter', areaSqft:300, perimeterLF:74, thickness:4, finishType:'broom', demolitionNeeded:false, reinforcement:'none', accessDifficulty:'easy', baseNeeded:false };
function liveOwner(rate) {
  const ownerId = 'durable-' + crypto.randomUUID();
  bridge.saveApplicationBook(ownerId, { revision:bridge.readApplicationBook(ownerId).revision, services:[patio(rate)], defaults });
  let book = store.loadPricebook(ownerId);
  const status = bridge.applicationStatus(book.services[0], book);
  bridge.approveApplicationService(ownerId, book.services[0].id, { revision:bridge.bookRevision(book), confirmConfiguration:true, confirmLegacySettings:true, fields:status.confirmationFields });
  return ownerId;
}
const quoteTotal = ownerId => { const book = store.loadPricebook(ownerId), raw = book.services[0];
  return bridge.calculateApplicationQuote(book, raw, { serviceId:raw.id, customerInputs:inputs }, { ownerId }).internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents; };

test('a corrupted saved book stops quoting; it never falls back to defaults, a temporary file or earlier prices', () => {
  const ownerId = liveOwner(5.1), target = path.join(root, ownerId + '.json');
  assert.equal(quoteTotal(ownerId), 244164);
  const earlier = fs.readFileSync(target, 'utf8');
  fs.writeFileSync(path.join(root, ownerId + '.' + crypto.randomUUID() + '.tmp'), earlier); // a stale complete copy beside it
  for (const corrupt of [earlier.slice(0, Math.floor(earlier.length / 2)), '', 'null', '[]', '"text"', JSON.stringify({ ownerId, defaults:{} }), JSON.stringify({ ownerId, services:[], defaults:[] })]) {
    fs.writeFileSync(target, corrupt);
    assert.throws(() => store.loadPricebook(ownerId), error => error.code === 'PRICEBOOK_UNREADABLE' && error.statusCode === 503, JSON.stringify(corrupt.slice(0, 40)));
    assert.throws(() => quoteTotal(ownerId), { code:'PRICEBOOK_UNREADABLE' });
    assert.throws(() => bridge.readApplicationBook(ownerId), { code:'PRICEBOOK_UNREADABLE' });
  }
});

test("another business's book in this owner's file stops quoting", () => {
  const ownerId = liveOwner(5.1), other = liveOwner(9.9);
  fs.copyFileSync(path.join(root, other + '.json'), path.join(root, ownerId + '.json'));
  assert.throws(() => store.loadPricebook(ownerId), error => error.code === 'PRICEBOOK_UNREADABLE' && /different business/.test(error.message));
  assert.throws(() => quoteTotal(ownerId), { code:'PRICEBOOK_UNREADABLE' });
});

test('a missing book is a new, empty book with nothing to quote; a valid save after it is read back exactly', () => {
  const ownerId = 'fresh-' + crypto.randomUUID(), book = store.loadPricebook(ownerId);
  assert.deepEqual(book.services, []);
  const ownerLive = liveOwner(6.25);
  assert.equal(store.loadPricebook(ownerLive).services[0].pricing.laborPerSqft, 625);
  assert.deepEqual(fs.readdirSync(root).filter(name => name.startsWith(ownerLive) && name.endsWith('.tmp')), []);
});
