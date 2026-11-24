// Audit f1501ff #8 (November 24, 2026): an installed painting price defines
// its own coats, but the form asked wall, ceiling and trim coats and held any
// answer other than the painter's. Industry practice: the painter quotes the
// coats the price includes. Expected, written before the fix:
// - installed: coats, ceiling coats and trim coats are not asked; any coat
//   answer (or none) quotes the installed price (interior 380000, exterior
//   318000 cents, the fixtures' hand-checked totals) and reaches the
//   customer, whose quote states "2 wall finish coat(s)";
// - itemized painting still asks and prices by the customer's coats
//   (interior 2 coats 328700, 1 coat 240700; unchanged).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';
import {customerQuoteFields} from '../../server/customerQuoteFields.js';

const asked=f=>customerQuoteFields({...f.ownerPricing,serviceType:f.serviceType},f.ownerPricing.pricing).map(x=>x.name).filter(n=>/oats$/.test(n));
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;

for(const [type,total] of [['INTERIOR_PAINTING',380000],['EXTERIOR_PAINTING',318000]])
test('f1501ff #8: installed '+type+' does not ask coats and prices any answer at '+total,()=>{
  assert.deepEqual(asked(offeringFixture(type,'installed')),[]);
  for(const coats of [1,2,3,undefined]){
    const f=offeringFixture(type,'installed');if(coats===undefined)delete f.customerInputs.coats;else f.customerInputs.coats=coats;
    const q=generateQuoteVNext(f);
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',String(coats));
    assert.equal(cents(q),total);
    const customer=sanitizeForCustomerVNext(q);
    assert.equal(customer.resultType,'INSTANT_ESTIMATE_READY',String(coats));
    assert.match(JSON.stringify(customer),/2 wall finish coat\(s\)/);
  }
});
test('f1501ff #8: itemized painting still asks and prices the customer\'s coats',()=>{
  const f=offeringFixture('INTERIOR_PAINTING','itemized');
  assert.ok(asked(f).includes('coats'));
  assert.equal(cents(generateQuoteVNext(f)),328700);
  f.customerInputs.coats=1;assert.equal(cents(generateQuoteVNext(f)),240700);
});
