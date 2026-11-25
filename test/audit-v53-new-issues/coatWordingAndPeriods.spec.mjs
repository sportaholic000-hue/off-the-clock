// New-issues audit of v53: painting and fence quote text printed "coat(s)" and
// ran the owner's unpunctuated wording into the next sentence ("...interior
// latex 2 wall finish coat(s); 1 wall primer coat(s). Preparation: ...").
// Expected, written before the change:
// - counts read "1 wall finish coat", "2 wall finish coats", "0 wall primer
//   coats" (ceiling the same), and the bridge summary reads "2 finish coats;
//   1 primer coat.";
// - every sentence of the quote text ends with ., ! or ? before the next one,
//   so owner text typed without a period is followed by one.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';
import {offeringDisclosures} from '../../server/quote-engine-vnext/configuredOfferings.js';

const text=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return sanitizeForCustomerVNext(q).options?.[0]?.disclaimer??sanitizeForCustomerVNext(q).disclaimer;};
test('coat counts use the singular or plural noun',()=>{
  const f=offeringFixture('INTERIOR_PAINTING','installed'),p=f.ownerPricing.pricing;
  for(const [finish,primer,expected] of [[1,1,'1 wall finish coat; 1 wall primer coat.'],[2,0,'2 wall finish coats; 0 wall primer coats.'],[3,2,'3 wall finish coats; 2 wall primer coats.']]){
    const lines=offeringDisclosures('INTERIOR_PAINTING',{...p,offeringDetails:{...p.offeringDetails,finishCoats:finish,primerCoats:primer,ceilingCoats:1,ceilingPrimerCoats:2}},{...f.customerInputs,ceilingsIncluded:true});
    assert.ok(lines.includes(expected),JSON.stringify(lines));
    assert.ok(lines.includes('1 ceiling finish coat; 2 ceiling primer coats.'),JSON.stringify(lines));
    assert.ok(!lines.join(' ').includes('(s)'));
  }
});
test('owner text without an ending period is followed by one',()=>{
  const f=offeringFixture('INTERIOR_PAINTING','installed'),d=f.ownerPricing.pricing.offeringDetails;
  Object.assign(d,{description:'Interior wall painting',coating:'Duration interior latex',preparation:'Patch nail holes and caulk'});
  const t=text(f);
  assert.match(t,/Interior wall painting\. /,t);
  assert.match(t,/Duration interior latex\. /,t);
  assert.match(t,/Patch nail holes and caulk\. /,t);
  assert.ok(!t.includes('(s)'),t);
  const g=offeringFixture('FENCING_INSTALL','itemized');g.ownerPricing.pricing.offeringDetails.description='Six-foot cedar privacy fence';
  assert.match(text(g),/Six-foot cedar privacy fence\. /);
});
