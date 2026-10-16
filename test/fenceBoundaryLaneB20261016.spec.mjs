import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fenceFixture,fourTypes} from './fenceLaneB20261016Fixture.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {fenceRowsDiagnostics,fencePostQuantities} from '../server/quote-engine-vnext/fencePricing.js';
const total=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
function layout(){const f=fenceFixture();for(const k of ['linearFeet','lfMethod','cornerCount','gates'])delete f.customerInputs[k];f.customerInputs.fenceRuns=[{closed:false,sections:[{lengthLF:7,gateAfter:'walk'},{lengthLF:9}]}];return f;}
function policy(f,includedPrices={},freeTiers=[]){return {serviceId:f.ownerPricing.id,ownerId:f.ownerPricing.origin.ownerId,operationId:'SYNTHETIC-policy',approvedAt:'2026-10-16T12:00:00.000Z',freeCompleteService:false,freeTiers,includedPrices};}
for(const [name,change]of [
 ['missing closure',c=>delete c.fenceRuns[0].closed],['zero section',c=>c.fenceRuns[0].sections[0].lengthLF=0],
 ['negative section',c=>c.fenceRuns[0].sections[0].lengthLF=-1],['unknown gate',c=>c.fenceRuns[0].sections[0].gateAfter='unknown'],
 ['gate at open end',c=>c.fenceRuns[0].sections[1].gateAfter='walk'],['empty runs',c=>c.fenceRuns=[]],
 ['fractional run count',c=>c.fenceRunCount=1.5],['contradictory run count',c=>c.fenceRunCount=2],
 ['contradictory total',c=>c.linearFeet=17],['contradictory corners',c=>c.cornerCount=1],
 ['contradictory gates',c=>c.gates={}],['extra section input',c=>c.fenceRuns[0].sections[0].postCount=2],
 ])test('Oct16 layout refuses '+name+' with no released price',()=>{
  const f=layout();change(f.customerInputs);const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(sanitizeForCustomerVNext(q).midEstimate,undefined);
 });
for(const [height,expected]of [[4,null],[6,400000],[6.01,600000],[7,600000],[8,600000],[9,null]])test('Oct16 exclusive/inclusive row boundary '+height+' ft: '+(expected??'review'),()=>{
  const f=fenceFixture('installed');f.customerInputs.fenceHeight=height;const q=generateQuoteVNext(f);
  if(expected===null){assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(q.reviewReason,/No price is set/);}
  else{assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(total(q),expected);}
 });
for(const bad of [null,[],42,'bad'])test('Oct16 malformed catalog '+JSON.stringify(bad)+' remains review-only without throwing',()=>{
  const f=fenceFixture();f.ownerPricing.pricing.fenceOfferings=bad;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');assert.notEqual(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
 });
test('Oct16 row validation rejects exact/range overlaps and unsupported inch precision; adjacent rows do not overlap',()=>{
 const p=fenceFixture().ownerPricing.pricing;assert.deepEqual(fenceRowsDiagnostics(p),[]);
 p.fenceOfferings.wood.heightRows.exact={exactHeight:6,postSpacingLF:8,offeringRates:{}};
 assert.ok(fenceRowsDiagnostics(p).some(d=>d.kind==='fence_height_overlap'));
 delete p.fenceOfferings.wood.heightRows.exact;p.fenceOfferings.wood.heightRows.six.minimumHeight=4+0.001/12;
 assert.ok(fenceRowsDiagnostics(p).some(d=>/2 decimal/.test(d.message)));
});
test('Oct16 installed gates cannot exclude their own posts, even when the base row would not need extra posts',()=>{
 const f=fenceFixture('installed');f.ownerPricing.pricing.fenceOfferings.wood.offeringDetails.gates.walk.postsAndFootingsIncluded=false;
 assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('Oct16 explicit zero classification is local to its height row: 16 LF straight totals 56200 cents and records included terminal materials',()=>{
 // $160 infill labor + $352 infill materials + $20 line post + $12 footing labor + $18 footing materials.
 const f=fenceFixture(),prefix='fenceOfferings.wood.heightRows.six.offeringRates.';
 Object.assign(f.customerInputs,{linearFeet:16,cornerCount:0,gates:{}});
 f.ownerPricing.pricing.fenceOfferings.wood.heightRows.six.offeringRates.terminalPostMaterialEach=0;
 f.ownerPricing.zeroPricePolicy=policy(f,{[prefix+'terminalPostMaterialEach']:prefix+'fenceMaterialPerLF'});
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(total(q),56200);
 const zero=q.options[0].lineItems.find(l=>l.calculation.ratePath==='offeringRates.terminalPostMaterialEach');assert.equal(zero.noChargeReason,'included_in_another_price');
 const wrong=structuredClone(f);wrong.ownerPricing.zeroPricePolicy.includedPrices[prefix+'terminalPostMaterialEach']='fenceOfferings.wood.heightRows.eight.offeringRates.fenceMaterialPerLF';
 assert.equal(generateQuoteVNext(wrong).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('Oct16 free tiers are scoped to a fence type: aluminum Good can be zero; wood Good remains its positive 100000-cent offering',()=>{
 const f=fourTypes();f.ownerPricing.pricing.fenceOfferings.aluminum.tiers[0].overrides.heightRows.six.offeringRates.installedFencePerLF=0;
 f.ownerPricing.zeroPricePolicy=policy(f,{},['aluminum/Good']);
 let q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.deepEqual(q.options.map(o=>o.midEstimate),[0,4100,4200]);
 f.customerInputs.fenceType='wood';f.customerInputs.confirmedFacts.fenceType={status:'identified',field:'fenceType',value:'wood',offeringId:f.ownerPricing.knownOfferings.fenceType.wood};
 q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(total(q),100000);
});
test('Oct16 exact spans do not add a post on binary decimal boundaries: 0.3 ft / 0.1 ft has 4 posts, not 5',()=>{
 const p={postSpacingLF:0.1,offeringDetails:{gates:{}}};
 assert.deepEqual(Object.fromEntries(Object.entries(fencePostQuantities({fenceRuns:[{closed:false,sections:[{lengthLF:0.3}]}]},p)).filter(([k])=>['total','terminal','line'].includes(k))),{total:4,terminal:2,line:2});
});
