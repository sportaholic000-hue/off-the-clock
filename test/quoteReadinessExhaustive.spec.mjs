import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {cases,flatRoof} from '../verification/engine-independent/fixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {freeFixture} from './quoteEngineVNextFixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {createActivationValidationVNext,validateCustomerInputs,validateOwnerPricing} from '../server/quote-engine-vnext/contracts.js';

function catalog(reason,n=80){
 const f=flatRoof(),p=f.ownerPricing.pricing;
 for(const key of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'])p[key]=Object.fromEntries(Array.from({length:n},(_,i)=>['product_'+i,reason==='unconfigured-zero-prices'&&key==='membraneCostPerSqft'?0:500]));
 f.ownerPricing.knownOfferings=Object.fromEntries(['membraneType','replacementMembraneType'].map(field=>[field,Object.fromEntries(Array.from({length:n},(_,i)=>['product_'+i,randomUUID()]))]));
 if(reason==='missing-all-registration')f.ownerPricing.knownOfferings={};
 if(reason==='only-final-pair-live')for(let i=0;i<n-1;i++){delete p.membraneCostPerSqft['product_'+i];delete f.ownerPricing.knownOfferings.membraneType['product_'+i];}
 return f;
}
function request(f,key){
 const inputs={...f.customerInputs,membraneType:key,replacementMembraneType:key};
 inputs.confirmedFacts=Object.fromEntries(['membraneType','replacementMembraneType'].map(field=>[field,{status:'identified',field,value:key,offeringId:f.ownerPricing.knownOfferings[field]?.[key]}]));
 return {...f,customerInputs:inputs};
}
for(const reason of ['unconfigured-zero-prices','missing-all-registration','only-final-pair-live'])for(const firstLiveProduct of [false,true])test('Exhaustive readiness: '+reason+'; quick='+firstLiveProduct,async()=>{
 const f=catalog(reason),before=JSON.stringify(f),start=performance.now();
 const timer=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),20));
 const result=vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct}),elapsed=performance.now()-start,delay=await timer;
 assert.equal(result.status,reason==='only-final-pair-live'?'QUOTING LIVE':'NEEDS PRICING');
 assert.ok(elapsed<1500&&delay<1500,'Cold call '+Math.round(elapsed)+' ms; timer '+Math.round(delay)+' ms');
 assert.equal(JSON.stringify(f),before);
 if(reason!=='only-final-pair-live')assert.equal(result.productCoverage.length,6400,'Every failed pair remains represented');
 else {
  assert.equal(generateQuoteVNext(request(f,'product_0')).resultType,'ESTIMATE_REQUIRES_REVIEW');
  const q=generateQuoteVNext(request(f,'product_79'));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  // 500,000 labor + 550,000 membrane with 10% waste + 500,000 tear-off cents.
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,1550000);
 }
 console.log(JSON.stringify({case:reason,firstLiveProduct,productsPerAxis:80,elapsedMs:elapsed,timerDelayMs:delay}));
});
test('Exhaustive readiness: three unconfigured tiers stay bounded without hiding diagnostics',()=>{
 const f=catalog('unconfigured-zero-prices');f.ownerPricing.tiers=['Good','Better','Best'].map(name=>({name,overrides:{}}));
 const start=performance.now(),s=vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:true});
 assert.equal(s.status,'NEEDS PRICING');assert.equal(s.failedTierDiagnostics.length,3);
 assert.equal(s.productCoverage.length,19200);assert.ok(performance.now()-start<2000);
});
test('Exhaustive readiness: explicitly free catalog prices still become live',()=>{
 const f=catalog('unconfigured-zero-prices');
 for(const map of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'])for(const key of Object.keys(f.ownerPricing.pricing[map]))f.ownerPricing.pricing[map][key]=0;
 f.ownerPricing=freeFixture(f.ownerPricing);
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:true}).status,'QUOTING LIVE');
 const q=generateQuoteVNext(request(f,'product_79'));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,0);
});
for(const {id,input:f} of [...cases(),...measuredScopeCases()])test('Prepared activation validation equals public contracts: '+id,()=>{
 const prepared=createActivationValidationVNext(f.serviceType,f.ownerPricing.pricing,f.ownerPricing);
 for(const customer of [f.customerInputs,{}, {...f.customerInputs,unexpectedSyntheticAnswer:1}]){
  assert.deepEqual(prepared.customer(customer),validateCustomerInputs(f.serviceType,customer,f.ownerPricing.pricing,f.ownerPricing));
  assert.deepEqual(prepared.owner(customer),validateOwnerPricing(f.serviceType,customer,f.ownerPricing.pricing,f.ownerPricing));
 }
});
test('Prepared validation snapshots do not alias editable caller prices or customer answers',()=>{
 const f=flatRoof(),prepared=createActivationValidationVNext(f.serviceType,f.ownerPricing.pricing,f.ownerPricing);
 assert.equal(prepared.owner(f.customerInputs).ok,true);
 f.ownerPricing.pricing.minimumJob=-1;
 assert.equal(prepared.owner(f.customerInputs).ok,true,'The private context retains its immutable snapshot');
 assert.equal(createActivationValidationVNext(f.serviceType,f.ownerPricing.pricing,f.ownerPricing).owner(f.customerInputs).ok,false,'A new revision is validated afresh');
 const answered=prepared.customer(f.customerInputs);answered.normalized.roofSqft=-1;
 assert.equal(prepared.customer(f.customerInputs).normalized.roofSqft,1000);
 f.customerInputs.roofSqft=-1;assert.equal(prepared.customer(f.customerInputs).ok,false,'Customer answers are never trusted from a cache');
});
for(const kind of ['accessor','cycle','nonplain','function'])test('Prepared validation never bypasses the data boundary: '+kind,()=>{
 const f=flatRoof();let reads=0;
 if(kind==='accessor')Object.defineProperty(f.ownerPricing.pricing,'minimumJob',{enumerable:true,get(){reads++;return 0;}});
 if(kind==='cycle')f.ownerPricing.pricing.cycle=f.ownerPricing.pricing;
 if(kind==='nonplain')f.ownerPricing.pricing.minimumJob=new Date(0);
 if(kind==='function')f.ownerPricing.pricing.minimumJob=()=>0;
 const prepared=createActivationValidationVNext(f.serviceType,f.ownerPricing.pricing,f.ownerPricing);
 assert.deepEqual(prepared.customer(f.customerInputs),validateCustomerInputs(f.serviceType,f.customerInputs,f.ownerPricing.pricing,f.ownerPricing));
 assert.equal(prepared.owner(f.customerInputs).ok,false);assert.equal(reads,0);
});
