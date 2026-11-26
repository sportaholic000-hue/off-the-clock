// Verdicts on two audits (item 2, High): siding removal in a building built in
// 1990 or earlier went to review whatever the existing siding is. The US CPSC
// lists asbestos-cement roofing, shingles and siding; vinyl and metal siding
// are not on that list. Fix (auditor's proposal): an optional owner choice on
// each siding removal offering, "Existing siding material". Vinyl and metal
// quote with the removal note; wood, fiber or asbestos cement, not sure, and
// offerings with no material set (every saved offering today) keep the review.
// Expected, written before the change (blank "Removal in older buildings"):
// - material vinyl or metal: quotes for before 1978, 1978-1990, not sure and
//   1991 or later, each with the siding removal note;
// - wood, fiber_or_asbestos_cement, not_sure, unset: review for the three older
//   answers, quote for 1991 or later (unchanged);
// - an invalid material is refused (the service needs pricing).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredScopeCases} from '../measuredScopeFixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

const NOTE='Removal does not include testing for or removing asbestos or lead paint. Older siding can contain them; if found, that work is priced separately.';
const OLD=['before_1978','1978_to_1990','not_sure'];
function job(material,age){
  const f=structuredClone(measuredScopeCases().find(c=>c.id==='siding-removal-itemized').input),p=f.ownerPricing.pricing;
  delete p.olderMaterialRemoval;if(material!==undefined)p.scopeDetails.siding_removal.existingSidingMaterial=material;
  f.customerInputs.buildingAge=age;return f;
}
const result=f=>{const q=generateQuoteVNext(f);return {ready:q.resultType==='INSTANT_ESTIMATE_READY',note:(q.disclaimer||'').includes(NOTE),q};};
test('vinyl and metal siding removal quotes at every age with the removal note',()=>{
  for(const material of ['vinyl','metal'])for(const age of [...OLD,'1991_or_later']){
    const r=result(job(material,age));assert.equal(r.ready,true,material+' '+age+': '+r.q.reviewReason);assert.equal(r.note,true,material+' '+age);
  }
});
test('other or unset siding materials keep the review in older buildings',()=>{
  for(const material of ['wood','fiber_or_asbestos_cement','not_sure',undefined]){
    for(const age of OLD){const r=result(job(material,age));assert.equal(r.ready,false,material+' '+age);assert.match(r.q.reviewReason,/can contain asbestos/);}
    const r=result(job(material,'1991_or_later'));assert.equal(r.ready,true,material+' 1991: '+r.q.reviewReason);
  }
});
test('an invalid siding material is refused',()=>{
  const f=job('plastic','1991_or_later');
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
});
