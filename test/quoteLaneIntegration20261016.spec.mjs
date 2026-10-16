import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerMoneyEntries} from '../server/priceBookMoney.js';
import {applyPriceMetadata,aiPlaceholderPrices,staleOwnerPrices} from '../server/priceMetadata.js';
import {fenceFixture,fourTypes} from './fenceLaneB20261016Fixture.mjs';

test('integration: fence height-row prices retain dates and AI provenance independently',()=>{
  // Expected before execution: each explicitly stored 2,000-cent material
  // rate is dated July 8 and marked AI. Editing only the eight-foot rate to
  // 2,001 cents on October 16 clears only that placeholder and updates only
  // that date. The unchanged six-foot material is 100 days old and stale.
  const service=fenceFixture().ownerPricing;
  service.source='AI_SUGGESTED';
  const six='fenceOfferings.wood.heightRows.six.offeringRates.fenceMaterialPerLF';
  const eight='fenceOfferings.wood.heightRows.eight.offeringRates.fenceMaterialPerLF';
  let book=applyPriceMetadata({services:[service]},{services:[]},'2026-07-08T12:00:00.000Z');
  assert.equal(ownerMoneyEntries(book.services[0]).find(e=>e.path===six)?.value,2000);
  assert.equal(book.services[0].priceMetadata[six].changedAt,'2026-07-08T12:00:00.000Z');
  assert.equal(aiPlaceholderPrices(book.services[0]).some(e=>e.path===six),true);
  const draft=structuredClone(book);
  draft.services[0].pricing.fenceOfferings.wood.heightRows.eight.offeringRates.fenceMaterialPerLF=2001;
  book=applyPriceMetadata(draft,book,'2026-10-16T12:00:00.000Z');
  assert.equal(book.services[0].priceMetadata[six].changedAt,'2026-07-08T12:00:00.000Z');
  assert.equal(book.services[0].priceMetadata[eight].changedAt,'2026-10-16T12:00:00.000Z');
  assert.equal(book.services[0].priceMetadata[eight].aiPlaceholder,false);
  assert.equal(staleOwnerPrices(book.services[0],90,'2026-10-16T12:00:00.000Z').some(e=>e.path===six),true);
  assert.equal(staleOwnerPrices(book.services[0],90,'2026-10-16T12:00:00.000Z').some(e=>e.path===eight),false);
});

test('integration: fence tier dates follow their type and tier name when reordered',()=>{
  // Expected before execution: Aluminum Good is 4,000 cents, Better is
  // 4,100 cents. Moving Good from index 0 to index 1 keeps July 8 as its
  // price date, its Good source note, and its AI marker; no price was edited
  // by the reorder. Better's adoption action must never adopt Good. Renaming
  // Good to Premium also retains that source/date/AI marker. Only an explicit
  // adoption clears it, and changing its rate to 4,001 cents dates that edit.
  const service=fourTypes().ownerPricing;
  service.source='AI_SUGGESTED';
  let book=applyPriceMetadata({services:[service]},{services:[]},'2026-07-08T12:00:00.000Z');
  const before='fenceOfferings.aluminum.tiers.0.overrides.heightRows.six.offeringRates.installedFencePerLF';
  const path='fenceOfferings.aluminum.tiers.1.overrides.heightRows.six.offeringRates.installedFencePerLF';
  book.services[0].priceMetadata[before].sourceNote='[SYNTHETIC] Good source';
  book.services[0].priceMetadata[path].sourceNote='[SYNTHETIC] Better source';
  const draft=structuredClone(book),tiers=draft.services[0].pricing.fenceOfferings.aluminum.tiers;
  draft.services[0].priceMetadata[path].acceptedAsOwnerPrice=true;
  [tiers[0],tiers[1]]=[tiers[1],tiers[0]];
  book=applyPriceMetadata(draft,book,'2026-10-16T12:00:00.000Z');
  assert.equal(ownerMoneyEntries(book.services[0]).find(e=>e.path===path)?.value,4000);
  assert.equal(book.services[0].priceMetadata[path].changedAt,'2026-07-08T12:00:00.000Z');
  assert.equal(book.services[0].priceMetadata[path].sourceNote,'[SYNTHETIC] Good source');
  assert.equal(book.services[0].priceMetadata[path].aiPlaceholder,true);
  const renamed=structuredClone(book);
  renamed.services[0].pricing.fenceOfferings.aluminum.tiers[1].name='Premium';
  book=applyPriceMetadata(renamed,book,'2026-10-16T12:10:00.000Z');
  assert.equal(book.services[0].priceMetadata[path].changedAt,'2026-07-08T12:00:00.000Z');
  assert.equal(book.services[0].priceMetadata[path].sourceNote,'[SYNTHETIC] Good source');
  assert.equal(book.services[0].priceMetadata[path].aiPlaceholder,true);
  const adopted=structuredClone(book);
  adopted.services[0].priceMetadata[path].acceptedAsOwnerPrice=true;
  book=applyPriceMetadata(adopted,book,'2026-10-16T12:15:00.000Z');
  assert.equal(book.services[0].priceMetadata[path].aiPlaceholder,false);
  assert.equal(book.services[0].priceMetadata[path].changedAt,'2026-07-08T12:00:00.000Z');
  const edited=structuredClone(book);
  edited.services[0].pricing.fenceOfferings.aluminum.tiers[1].overrides.heightRows.six.offeringRates.installedFencePerLF=4001;
  book=applyPriceMetadata(edited,book,'2026-10-17T12:00:00.000Z');
  assert.equal(book.services[0].priceMetadata[path].changedAt,'2026-10-17T12:00:00.000Z');
  assert.equal(book.services[0].priceMetadata[path].aiPlaceholder,false);
});

test('integration: mowing edging uses the labor cost basis for stale-price reminders',()=>{
  // Expected before execution: the 5,000-cent edging price is labor. With
  // labor cost basis and no date, exactly one stale reminder names it.
  const service={serviceType:'LANDSCAPING_MOWING',pricing:{edgingPerLinearFoot:5000},priceBasisByCategory:{labor:'cost'}};
  assert.equal(ownerMoneyEntries(service)[0].category,'labor');
  assert.deepEqual(staleOwnerPrices(service,90,'2026-10-16T12:00:00.000Z').map(e=>e.path),['edgingPerLinearFoot']);
});
