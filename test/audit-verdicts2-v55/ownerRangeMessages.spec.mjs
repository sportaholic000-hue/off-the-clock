// Verdicts on the deployment and v54 audits, item 1.4 (V54-4): the owner
// summary forwarded the engine's plain range sentence for three kinds only, so
// "Largest lawn this flat price covers: enter a number of square feet from 1 to
// 10,000,000." never reached the owner; a lawn cap of 0.5 passed although its
// own rule says 1 to 10,000,000, and then showed only an internal field name;
// and some engine sentences named internal keys ("baggingSurchargePercent must
// be from 0 to 500."). Expected, written before the change:
// - 20,000,000 and 0.5 in the lawn cap: NEEDS PRICING and the owner summary
//   states "from 1 to 10,000,000";
// - bagging 600%: the owner summary states "Clipping bagging and disposal
//   surcharge: enter a percentage from 0 to 500." and no internal key;
// - cap values 1 and 10,000,000 are accepted.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mowing} from '../../verification/engine-independent/fixtures.mjs';
import {vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';
import {ownerValidationMessages} from '../../client/src/pricebookDiagnostics.js';

const flat=cap=>{const f=mowing();Object.assign(f.ownerPricing.pricing,{mowingBaseRatePerSqft:0,mowingVisitCharge:5000,mowingFlatVisitMaxSqft:cap});return f;};
const summary=f=>{const s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);return {status:s.status,text:ownerValidationMessages({statuses:[s]},{services:[{...f.ownerPricing,service:'Lawn Mowing'}]},[]).join(' ')};};
test('the lawn cap range reaches the owner, and below 1 is refused',()=>{
  for(const cap of [20_000_000,0.5]){const r=summary(flat(cap));assert.equal(r.status,'NEEDS PRICING',String(cap));assert.match(r.text,/from 1 to 10,000,000/,r.text);assert.doesNotMatch(r.text,/Yard square foot/,r.text);}
  for(const cap of [1,10_000_000])assert.equal(summary(flat(cap)).status,'QUOTING LIVE',String(cap));
});
test('range sentences name the field, not an internal key',()=>{
  const f=mowing();f.ownerPricing.pricing.baggingSurchargePercent=600;
  const r=summary(f);assert.equal(r.status,'NEEDS PRICING');
  assert.match(r.text,/Clipping bagging and disposal surcharge: enter a percentage from 0 to 500\./,r.text);
  assert.doesNotMatch(r.text,/baggingSurchargePercent/);
});
