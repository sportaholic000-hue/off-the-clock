// Third audit of v51 (November 26, 2026), finding 1: with the control-joint
// setting blank, a concrete quote neither charged for joints nor said
// anything about them. Industry practice: control joints are part of standard
// slab work and per-square-foot flatwork labor normally includes them (NRMCA
// CIP 6). Owner ruling: quote as many jobs as possible. Expected, written
// before the change:
// - blank: the quote quotes, at the same price as 'included', and tells the
//   customer "Control joints are included in the slab price.";
// - 'included' and 'excluded' unchanged; the owner notice asking to state it
//   stays.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {concrete} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

const NOTE='Control joints are included in the slab price.';
const job=setting=>{const f=concrete();if(setting===undefined)delete f.ownerPricing.pricing.controlJointPricing;else f.ownerPricing.pricing.controlJointPricing=setting;return f;};
test('blank control-joint setting: included, and the quote says so',()=>{
  const blank=generateQuoteVNext(job(undefined)),included=generateQuoteVNext(job('included'));
  assert.equal(blank.resultType,'INSTANT_ESTIMATE_READY',blank.reviewReason);
  assert.equal(blank.options[0].calculationRecord.scenarios.mid.finalTotalCents,included.options[0].calculationRecord.scenarios.mid.finalTotalCents);
  assert.match(JSON.stringify(sanitizeForCustomerVNext(blank)),new RegExp(NOTE.replace('.','\\.')));
  // Since the new-issues audit of v53 an explicit 'included' says so too.
  assert.match(JSON.stringify(sanitizeForCustomerVNext(included)),new RegExp(NOTE.replace('.','\\.')));
  const f=job(undefined);assert.ok(vNextServiceStatus(f.ownerPricing,f.businessDefaults).statusNotices.some(n=>/control joints/i.test(n)));
});
