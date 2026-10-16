import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fenceFixture,fourTypes} from './fenceLaneB20261016Fixture.mjs';
import {vNextServiceStatus,generateQuoteVNext,sanitizeForCustomerVNext,quoteFromVNextPricebook} from '../server/quote-engine-vnext/index.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../server/priceBookService.js';

const date={timeZone:'UTC',quoteInstant:'2026-10-16T12:00:00.000Z'};
function save(f,owner='synthetic-fence-'+randomUUID()){
  const service=structuredClone(f.ownerPricing);delete service.origin;
  const book=bridge.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  bridge.saveApplicationBook(owner,{...book,revision:bridge.readApplicationBook(owner).revision},date);
  return {owner,book:loadPricebook(owner)};
}
test('Oct16 save/reload/approve: four types with three tiers each stay live; aluminum remains 400000/410000/420000 cents',()=>{
  const f=fourTypes(),h=save(f),id=h.book.services[0].id;
  bridge.approveApplicationService(h.owner,id,{revision:bridge.readApplicationBook(h.owner).revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  const book=loadPricebook(h.owner);assert.equal(bridge.bookStatuses(book,date)[0].status,'QUOTING LIVE');
  const response=bridge.calculateApplicationQuote(book,book.services[0],{customerInputs:f.customerInputs,customerFeeSelections:{}},{...date,preparingIntake:true});
  assert.equal(response.customerResult.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(response));
  assert.deepEqual(response.customerResult.options.map(q=>q.midEstimate),[4000,4100,4200]);
});
test('Oct16 save rejects overlapping height rows, including an effective tier overlap, without changing the saved book',()=>{
  for(const tier of [false,true]){
    const f=fenceFixture('installed');
    if(tier)f.ownerPricing.pricing.fenceOfferings.wood.tiers=[{name:'[SYNTHETIC] Overlap',overrides:{heightRows:{eight:{minimumHeight:5}}}}];
    else f.ownerPricing.pricing.fenceOfferings.wood.heightRows.eight.minimumHeight=5;
    const owner='synthetic-overlap-'+randomUUID(),before=bridge.readApplicationBook(owner);
    assert.throws(()=>save(f,owner),/overlap|same height/i);
    assert.deepEqual(bridge.readApplicationBook(owner),before,'rejected overlap never changes durable storage');
  }
});
test('Oct16 money boundary: a 0.5-cent per-foot rate survives nested rows and tier overrides; fixed post/gate cents cannot become fractional',()=>{
  const f=fourTypes();f.ownerPricing.pricing.fenceOfferings.aluminum.heightRows.six.offeringRates.installedFencePerLF=0.5;
  f.ownerPricing.pricing.fenceOfferings.aluminum.tiers[0].overrides.heightRows.six.offeringRates.installedFencePerLF=0.125;
  const dollars=bridge.convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars');
  const roundTrip=bridge.convertApplicationBook(dollars,'toCents');assert.deepEqual(roundTrip.services[0].pricing,f.ownerPricing.pricing);
  f.ownerPricing.pricing.fenceOfferings.aluminum.heightRows.six.offeringRates.gate_walk=1.5;
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
  const invalid=bridge.convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars');
  assert.throws(()=>bridge.convertApplicationBook(invalid,'toCents'),/cent|whole|fixed|integer|decimal/i);
});
test('Oct16 customer sanitization reproduces section-derived measurements: 7 + gate + 9 at legacy itemized rates = 91200 cents',()=>{
  // Infill labor: 16 * $10 = $160; infill material: 16 * 1.10 * $20 = $352.
  // Posts: 5 * $20 = $100; footing labor: 5 * $4 = $20; footing material:
  // 5 * $6 = $30; gate: $250. Expected total = $912, not a height-scaled price.
  const f=fenceFixture();delete f.customerInputs.linearFeet;delete f.customerInputs.cornerCount;delete f.customerInputs.gates;
  f.ownerPricing.pricing.fenceOfferings.wood.offeringDetails.gates.walk.postsAndFootingsIncluded=false;
  f.customerInputs.fenceRuns=[{closed:false,sections:[{lengthLF:7,gateAfter:'walk'},{lengthLF:9}]}];
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,91200);
  assert.equal(sanitizeForCustomerVNext(q).midEstimate,912);
});
test('Oct16 catalog readiness: twelve nested tiers are valid; a fourth tier in one type is refused; an empty catalog is not live',()=>{
  const f=fourTypes();assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
  f.ownerPricing.pricing.fenceOfferings.aluminum.tiers.push({name:'Fourth',overrides:{}});
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
  f.ownerPricing.pricing.fenceOfferings={};assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
});
test('Oct16 second fencing service: a distinct vinyl offering does not make a wood request ambiguous',()=>{
  const f=fenceFixture('installed'),other=structuredClone(f.ownerPricing);other.id=randomUUID();
  other.origin.serviceId=other.id;other.pricing.fenceOfferings.vinyl=other.pricing.fenceOfferings.wood;delete other.pricing.fenceOfferings.wood;other.pricing.fenceOfferings.vinyl.offeringDetails.fenceType='vinyl';
  const q=quoteFromVNextPricebook({pricebook:{services:[f.ownerPricing,other],defaults:f.businessDefaults},serviceType:'FENCING_INSTALL',customerInputs:f.customerInputs,callerType:'owner'});
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.midEstimate,4000);
});
