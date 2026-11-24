// Audit f1501ff #1 (November 24, 2026): one unfinished fence height row took
// the whole business offline. Expected outcomes were written before the fix:
// - saving an unfinished row never throws an internal error;
// - the fence service shows NEEDS PRICING with a row message;
// - every other service keeps its status (mowing stays QUOTING LIVE);
// - overlapping rows are refused and nothing is written;
// - a service whose readiness throws is isolated to that service.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fenceFixture} from '../fenceLaneB20261016Fixture.mjs';
import {mowingFixture} from '../landscapeLaneB20261016Fixture.mjs';
import * as bridge from '../../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../../server/priceBookService.js';
import {fenceCatalogVariants} from '../../server/quote-engine-vnext/fencePricing.js';

const date={timeZone:'UTC',quoteInstant:'2026-10-16T12:00:00.000Z'};
function liveFenceAndMowing(){
  const owner='synthetic-f1501ff-1-'+randomUUID(),f=fenceFixture('installed'),m=mowingFixture();
  const services=[f.ownerPricing,m.ownerPricing].map(s=>{s=structuredClone(s);delete s.origin;return s;});
  const book=bridge.convertApplicationBook({services,defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  bridge.saveApplicationBook(owner,{...book,revision:bridge.readApplicationBook(owner).revision},date);
  for(const s of loadPricebook(owner).services)bridge.approveApplicationService(owner,s.id,{revision:bridge.readApplicationBook(owner).revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  assert.deepEqual(bridge.bookQuoteStatuses(loadPricebook(owner),date).map(s=>s.status),['QUOTING LIVE','QUOTING LIVE']);
  return owner;
}

test('f1501ff #1: the editor\'s new empty height row saves, blocks only the fence, and mowing stays live',()=>{
  const owner=liveFenceAndMowing(),draft=bridge.readApplicationBook(owner);
  draft.services[0].pricing.fenceOfferings.wood.heightRows.height_1={minimumHeight:0,offeringRates:{}};
  assert.doesNotThrow(()=>bridge.validateApplicationDraft(owner,structuredClone(draft),date));
  assert.doesNotThrow(()=>bridge.saveApplicationBook(owner,draft,date));
  const book=loadPricebook(owner),quick=bridge.bookQuoteStatuses(book,date),full=bridge.bookStatuses(book,date);
  assert.deepEqual(quick.map(s=>s.status),['NEEDS PRICING','QUOTING LIVE']);
  assert.deepEqual(full.map(s=>s.status),['NEEDS PRICING','QUOTING LIVE']);
  assert.ok(full[0].validationErrors.some(e=>/maximum height|height in feet/i.test(e)),JSON.stringify(full[0].validationErrors));
});

test('f1501ff #1: overlapping rows are refused and nothing is written',()=>{
  const owner=liveFenceAndMowing(),before=bridge.readApplicationBook(owner),draft=structuredClone(before);
  draft.services[0].pricing.fenceOfferings.wood.heightRows.eight.minimumHeight=5;
  assert.throws(()=>bridge.saveApplicationBook(owner,draft,date),/overlap|same height/i);
  assert.deepEqual(bridge.readApplicationBook(owner),before);
  assert.deepEqual(bridge.bookQuoteStatuses(loadPricebook(owner),date).map(s=>s.status),['QUOTING LIVE','QUOTING LIVE']);
});

test('f1501ff #1: fence variant expansion skips unfinished and overlapping rows instead of throwing',()=>{
  const f=fenceFixture('installed'),p=f.ownerPricing.pricing;
  p.fenceOfferings.wood.heightRows.height_1={minimumHeight:0,offeringRates:{}};
  assert.deepEqual(fenceCatalogVariants(p).map(v=>v.rowKey).sort(),['eight','six']);
  p.fenceOfferings.wood.heightRows.eight.minimumHeight=5;
  assert.doesNotThrow(()=>fenceCatalogVariants(p));
});

test('f1501ff #1: a service whose readiness throws is isolated; the others keep their status',()=>{
  const owner=liveFenceAndMowing(),book=loadPricebook(owner);
  // A stored service the engine cannot read: its pricing getter throws only
  // after the book revision is computed, as an engine defect would.
  let reads=0;const fence=book.services[0],pricing=fence.pricing;
  const revisionReads=(()=>{let n=0;const probe={...book,services:[{...fence,get pricing(){n++;return pricing;}},book.services[1]]};bridge.bookRevision(probe);return n;})();
  Object.defineProperty(fence,'pricing',{enumerable:true,get(){if(++reads>revisionReads)throw new TypeError('synthetic engine defect');return pricing;}});
  const statuses=bridge.bookQuoteStatuses(book,date);
  assert.equal(statuses[0].status,'NEEDS PRICING');
  assert.equal(statuses[0].unreadable,true);
  assert.equal(statuses[1].status,'QUOTING LIVE');
});
