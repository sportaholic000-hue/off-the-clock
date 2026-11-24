// Audit f1501ff #13 (November 24, 2026): a painting optional-item quantity
// sent without that item selected was dropped without a word.
//
// Design note: the first expected outcome written here was "send it to
// review". That contradicted the deliberate October 17 rule (an explicit
// selection overrides a stale quantity; test/surfacePricingLaneCFixes
// 20261016.spec.mjs) and spec STEP 2b ("Never silently underbid scope. Never
// kill a quote over an addon."). The expected outcome is therefore: price as
// before, and disclose the unselected item as not included.
//
// Exterior painting fixture 318000 cents; windows 5000, doors 8000 cents each.
// - windows selected, 4 windows: 318000 + 4 x 5000 = 338000 (unchanged);
// - doors selected (1 door), 4 windows not selected: 318000 + 8000 = 326000
//   (unchanged) and "Windows" is listed as not included (was silent);
// - empty selection, 4 windows: 318000 (unchanged), "Windows" not included;
// - no selection list (older inputs): the quantity is the request, 338000;
// - the widget clears a quantity whose item is unticked.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';
import {withoutDeselectedDependents} from '../../server/scopeConfiguration.js';
import {customerQuoteFields} from '../../server/customerQuoteFields.js';

const painting=answers=>{const f=offeringFixture('EXTERIOR_PAINTING','installed');f.ownerPricing.pricing.surfaceExtraRates={windows:5000,doors:8000};Object.assign(f.customerInputs,answers);return f;};
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;

test('f1501ff #13: a selected or unlisted quantity is charged; nothing extra is disclosed',()=>{
  for(const [answers,total] of [[{surfaceOptionalItems:['windows'],paintWindows:4},338000],[{paintWindows:4},338000],[{},318000]]){
    const q=generateQuoteVNext(painting(answers));
    assert.equal(cents(q),total);
    assert.deepEqual(q.options[0].skippedAddons,[]);
  }
});
test('f1501ff #13: a quantity for an unselected item is not charged and the customer is told',()=>{
  for(const [selected,total] of [[['doors'],326000],[[],318000]]){
    const q=generateQuoteVNext(painting({surfaceOptionalItems:selected,...(selected.length?{paintDoors:1}:{}),paintWindows:4}));
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
    assert.equal(cents(q),total);
    assert.deepEqual(q.options[0].skippedAddons,['Windows']);
    const customer=sanitizeForCustomerVNext(q);
    assert.equal(customer.resultType,'INSTANT_ESTIMATE_READY');
    assert.match(JSON.stringify(customer),/does not include[^"]*Windows/);
  }
});
test('f1501ff #13: the widget clears the quantity of an unticked item',()=>{
  const f=painting({}),fields=customerQuoteFields({...f.ownerPricing,serviceType:f.serviceType},f.ownerPricing.pricing);
  assert.deepEqual(withoutDeselectedDependents(fields,{surfaceOptionalItems:['doors'],paintDoors:1,paintWindows:4}),{surfaceOptionalItems:['doors'],paintDoors:1});
  assert.deepEqual(withoutDeselectedDependents(fields,{surfaceOptionalItems:['windows'],paintWindows:4}),{surfaceOptionalItems:['windows'],paintWindows:4});
});
