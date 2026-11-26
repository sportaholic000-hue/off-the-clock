// Verdicts on two audits (item 1, High): with the blank "Removal in older
// buildings" setting, flooring removal in a building built in 1990 or earlier
// went to review whatever the existing floor is, carpet and laminate included.
// Trade facts: OSHA 29 CFR 1926.1101 presumes asphalt and vinyl flooring
// installed in 1980 or earlier contains asbestos; the US CPSC names vinyl floor
// tiles, sheet-vinyl backing and the adhesives. Carpet, laminate, floating
// floors and wood flooring itself are not on those lists. Tile stays held
// (old grout, bedding and mastic can contain asbestos), and so does wood glued
// or laid on concrete (adhesive) or on an unknown support.
// Expected, written before the change (blank setting):
// - carpet, laminate, floating, wood on joists: quote at every age, with the
//   removal note "Removal does not include testing ... Older flooring can
//   contain them; if found, that work is priced separately.";
// - vinyl (unclassified), vinyl plank, tile, wood on concrete or not sure, an
//   unknown floor name: review for before 1978, 1978-1990 and not sure, quote
//   for 1991 or later;
// - the "exclude" setting is unchanged (every material quotes, with the note).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {flooring} from '../../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from '../quoteEngineVNextFixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

const NOTE='Removal does not include testing for or removing asbestos or lead paint. Older flooring can contain them; if found, that work is priced separately.';
const OLD=['before_1978','1978_to_1990','not_sure'];
function job(existing,age,{policy,extra={},substrate}={}){
  const f=flooring('tile',200),p=f.ownerPricing.pricing;p.removalPerSqft={[existing]:100};
  if(substrate)p.existingFloorSubstrate={[existing]:substrate};
  if(policy)p.olderMaterialRemoval=policy;else delete p.olderMaterialRemoval;
  const {confirmedFacts,...rest}=f.customerInputs;
  f.customerInputs=confirmedFixtureInputs({...rest,existingFloorType:existing,removalNeeded:true,removalAreaSqft:250,buildingAge:age,...extra});
  return f;
}
const result=f=>{const q=generateQuoteVNext(f);return {ready:q.resultType==='INSTANT_ESTIMATE_READY',note:(q.disclaimer||'').includes(NOTE),q};};
test('materials that cannot contain asbestos quote at every age with the removal note',()=>{
  for(const [existing,opts] of [['carpet',{}],['laminate',{}],['vinyl',{substrate:'cushioned_or_floating'}]])for(const age of [...OLD,'1991_or_later']){
    const r=result(job(existing,age,opts));
    assert.equal(r.ready,true,existing+' '+age+': '+r.q.reviewReason);assert.equal(r.note,true,existing+' '+age);
  }
});
test('materials that can contain asbestos keep the review in older buildings',()=>{
  for(const [existing,opts] of [['vinyl',{}],['vinyl_plank',{}],['tile',{}],['vinyl',{substrate:'resilient_sheet'}]]){
    for(const age of OLD){const r=result(job(existing,age,opts));assert.equal(r.ready,false,existing+' '+age);assert.match(r.q.reviewReason,/can contain asbestos/);}
    const r=result(job(existing,'1991_or_later',opts));assert.equal(r.ready,true,existing+' 1991: '+r.q.reviewReason);assert.equal(r.note,true);
  }
});
test('the exclusion setting is unchanged',()=>{
  for(const existing of ['carpet','vinyl','tile'])for(const age of [...OLD,'1991_or_later']){
    const r=result(job(existing,age,{policy:'exclude'}));assert.equal(r.ready,true,existing+' '+age);assert.equal(r.note,true);
  }
});
test('wood flooring: on joists the age hold clears; on concrete, unknown or not answered it stays',async()=>{
  const {buildingAgeReview}=await import('../../server/quote-engine-vnext/buildingAgeRules.js');
  const c=extra=>({existingFloorType:'hardwood',removalNeeded:true,buildingAge:'before_1978',...extra});
  assert.equal(buildingAgeReview('FLOORING_REPLACEMENT',c({woodFloorAssembly:'joists'}),{}),null);
  for(const woodFloorAssembly of ['glued_to_concrete','direct_on_concrete','not_sure',undefined])
    assert.match(buildingAgeReview('FLOORING_REPLACEMENT',c(woodFloorAssembly?{woodFloorAssembly}:{}),{})||'',/can contain asbestos/,String(woodFloorAssembly));
  assert.equal(buildingAgeReview('FLOORING_REPLACEMENT',c({woodFloorAssembly:'joists',buildingAge:'1991_or_later'}),{}),null);
});
