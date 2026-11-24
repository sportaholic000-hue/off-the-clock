// Audit f1501ff #5c (November 24, 2026): a floating floor with an overlay
// scope was NEEDS PRICING because the activation sample never answered "is
// the existing floor sound?", while real quotes were ready. Expected, written
// before the fix: floating vinyl plank over existing tile with an installed
// overlay price is QUOTING LIVE; the job quotes 174000 (base, hand-checked in
// verification/engine-independent/fixtures.mjs) + 200 sq ft x 200 cents =
// 214000 cents.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {floatingOverlay} from './fixtures.mjs';
import {vNextServiceStatus,generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

test('f1501ff #5c: floating vinyl plank with an overlay scope is live and quotes 214000 cents',()=>{
  const f=floatingOverlay(),status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status.missingOwnerFields));
  const q=generateQuoteVNext(f);
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,214000);
});
