// Audit f1501ff #5d (November 24, 2026): in a fence catalog, a $0 price the
// owner classified as included in another price validated and quoted, but
// readiness looked the classification up without the fence type's prefix and
// withheld that height row. Expected, written before the fix:
// - the 6 ft row with terminal post materials included in the per-foot
//   material is live and not withheld;
// - a classification that points at another row's price still withholds it;
// - the 100 ft job totals 358000 cents: labor 100 x 1000 = 100000; material
//   100 x 1.10 x 2000 = 220000; 12 line posts (ceil(100/8)-1) x 2000 = 24000;
//   2 terminal posts x 0 = 0; 14 footings x (400 + 600) = 14000.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fenceFixture} from '../fenceLaneB20261016Fixture.mjs';
import {vNextServiceStatus,generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

const prefix='fenceOfferings.wood.heightRows.six.offeringRates.';
function includedTerminalPosts(coveringPath=prefix+'fenceMaterialPerLF'){
  const f=fenceFixture();
  f.ownerPricing.pricing.fenceOfferings.wood.heightRows.six.offeringRates.terminalPostMaterialEach=0;
  f.ownerPricing.zeroPricePolicy={serviceId:f.ownerPricing.id,ownerId:f.ownerPricing.origin.ownerId,operationId:'SYNTHETIC-policy',approvedAt:'2026-10-16T12:00:00.000Z',freeCompleteService:false,freeTiers:[],includedPrices:{[prefix+'terminalPostMaterialEach']:coveringPath}};
  return f;
}
test('f1501ff #5d: an included $0 in a catalog row is live, not withheld, and quotes 358000 cents',()=>{
  const f=includedTerminalPosts(),status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(status.status,'QUOTING LIVE');
  assert.deepEqual(status.failedTierDiagnostics,[]);
  const q=generateQuoteVNext(f);
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,358000);
});
test('f1501ff #5d: a classification pointing at another row still withholds the row',()=>{
  const f=includedTerminalPosts('fenceOfferings.wood.heightRows.eight.offeringRates.fenceMaterialPerLF');
  const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.deepEqual(status.failedTierDiagnostics.map(d=>d.variantLabel),['wood · over 4 ft up to 6 ft']);
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
