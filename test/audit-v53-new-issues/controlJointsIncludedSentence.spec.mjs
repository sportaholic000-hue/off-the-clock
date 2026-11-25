// New-issues audit of v53, control joints: the sentence "Control joints are
// included in the slab price." appeared only when the setting was blank, not
// when the owner chose Included, although both quote the same included work.
// Expected, written before the change: blank and Included both carry the
// sentence at the same price; Excluded never carries it.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {concrete} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';

const NOTE=/Control joints are included in the slab price\./;
const job=(setting,extra={})=>{const f=concrete();if(setting===undefined)delete f.ownerPricing.pricing.controlJointPricing;else f.ownerPricing.pricing.controlJointPricing=setting;Object.assign(f.ownerPricing.pricing,extra);return f;};
const total=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
test('included control joints are stated whether the setting is blank or Included',()=>{
  const blank=generateQuoteVNext(job(undefined)),included=generateQuoteVNext(job('included'));
  for(const q of [blank,included]){assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);assert.match(JSON.stringify(sanitizeForCustomerVNext(q)),NOTE);}
  assert.equal(total(blank),total(included));
  const excluded=generateQuoteVNext(job('excluded'));
  assert.doesNotMatch(JSON.stringify(sanitizeForCustomerVNext(excluded)),NOTE);
});
