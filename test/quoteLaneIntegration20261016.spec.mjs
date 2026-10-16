import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerMoneyEntries} from '../server/priceBookMoney.js';
import {applyPriceMetadata,aiPlaceholderPrices,staleOwnerPrices} from '../server/priceMetadata.js';
import {fenceFixture,fourTypes} from './fenceLaneB20261016Fixture.mjs';
import {markEditedPriceMetadata} from '../client/src/pricebookPriceMetadata.js';

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

test('integration: actual editor preserves fence provenance across 18 named and numeric tier reorderings',()=>{
  // Expected before execution: 3 name sets x 6 permutations = 18 layouts.
  // Each aluminum tier's 4,000 / 4,100 / 4,200-cent price retains its own
  // synthetic source, July 8 date and AI marker through both the UI helper
  // and server save. A rename retains them too; adding one cent clears only
  // that edited leaf's AI marker and dates it October 17.
  const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  for(const names of [['Good','Better','Best'],['1','0','2'],['A.B','A','B']]){
    const service=fourTypes().ownerPricing;service.source='AI_SUGGESTED';
    service.pricing.fenceOfferings.aluminum.tiers.forEach((tier,i)=>tier.name=names[i]);
    const book=applyPriceMetadata({services:[service]},{services:[]},'2026-07-08T12:00:00.000Z');
    for(const [i,name] of names.entries()){
      const path=`fenceOfferings.aluminum.tiers.${i}.overrides.heightRows.six.offeringRates.installedFencePerLF`;
      book.services[0].priceMetadata[path].sourceNote='[SYNTHETIC] Source for '+name;
    }
    for(const order of orders){
      const before=book.services[0],draft=structuredClone(before);
      draft.pricing.fenceOfferings.aluminum.tiers=order.map(i=>structuredClone(before.pricing.fenceOfferings.aluminum.tiers[i]));
      let edited=markEditedPriceMetadata(before,draft);
      for(const [i,oldIndex] of order.entries()){
        const path=`fenceOfferings.aluminum.tiers.${i}.overrides.heightRows.six.offeringRates.installedFencePerLF`;
        assert.equal(edited.priceMetadata[path].sourceNote,'[SYNTHETIC] Source for '+names[oldIndex]);
        assert.equal(edited.priceMetadata[path].aiPlaceholder,true);
      }
      let saved=applyPriceMetadata({services:[edited]},book,'2026-10-16T12:00:00.000Z');
      const path='fenceOfferings.aluminum.tiers.1.overrides.heightRows.six.offeringRates.installedFencePerLF';
      const renamed=structuredClone(saved.services[0]);renamed.pricing.fenceOfferings.aluminum.tiers[1].name='[SYNTHETIC] Renamed';
      edited=markEditedPriceMetadata(saved.services[0],renamed);
      saved=applyPriceMetadata({services:[edited]},saved,'2026-10-16T12:10:00.000Z');
      assert.equal(saved.services[0].priceMetadata[path].sourceNote,'[SYNTHETIC] Source for '+names[order[1]]);
      assert.equal(saved.services[0].priceMetadata[path].changedAt,'2026-07-08T12:00:00.000Z');
      assert.equal(saved.services[0].priceMetadata[path].aiPlaceholder,true);
      const changed=structuredClone(saved.services[0]);changed.pricing.fenceOfferings.aluminum.tiers[1].overrides.heightRows.six.offeringRates.installedFencePerLF++;
      edited=markEditedPriceMetadata(saved.services[0],changed);
      const final=applyPriceMetadata({services:[edited]},saved,'2026-10-17T12:00:00.000Z');
      assert.equal(final.services[0].priceMetadata[path].aiPlaceholder,false);
      assert.equal(final.services[0].priceMetadata[path].changedAt,'2026-10-17T12:00:00.000Z');
    }
  }
});

test('integration: actual editor retains ordinary tier AI provenance through a rename',()=>{
  // Expected before execution: the 350-cent tile labor override remains
  // AI-marked and dated July 8 after renaming Good to Premium. No amount or
  // explicit owner adoption changed, so both UI and server retain the mark.
  const service={serviceType:'FLOORING_INSTALL',source:'AI_SUGGESTED',pricing:{laborPerSqft:{tile:300},materialPerSqft:{tile:500}},tiers:[{name:'Good',overrides:{laborPerSqft:{tile:350}}}]};
  const book=applyPriceMetadata({services:[service]},{services:[]},'2026-07-08T12:00:00.000Z');
  const renamed=structuredClone(book.services[0]);renamed.tiers[0].name='Premium';
  const edited=markEditedPriceMetadata(book.services[0],renamed);
  assert.equal(edited.tiers[0].priceMetadata['laborPerSqft.tile'].aiPlaceholder,true);
  const saved=applyPriceMetadata({services:[edited]},book,'2026-10-16T12:00:00.000Z');
  assert.equal(saved.services[0].tiers[0].priceMetadata['laborPerSqft.tile'].aiPlaceholder,true);
  assert.equal(saved.services[0].tiers[0].priceMetadata['laborPerSqft.tile'].changedAt,'2026-07-08T12:00:00.000Z');
});
