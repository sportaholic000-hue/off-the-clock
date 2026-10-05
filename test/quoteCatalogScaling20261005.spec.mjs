import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {flatRoof} from '../verification/engine-independent/fixtures.mjs';
import {bookQuoteStatuses} from '../server/src/quoteDoneBridge.js';
import {vNextServiceStatus,generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {freeFixture,includedFixture} from './quoteEngineVNextFixtures.mjs';

function catalog(n,reason){
 const f=flatRoof(),p=f.ownerPricing.pricing;
 for(const name of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'])p[name]=Object.fromEntries(Array.from({length:n},(_,i)=>['product_'+i,name==='membraneCostPerSqft'?0:name==='tearOffPerSqft'?100:500]));
 f.ownerPricing.knownOfferings=Object.fromEntries(['membraneType','replacementMembraneType'].map(field=>[field,Object.fromEntries(Array.from({length:n},(_,i)=>['product_'+i,randomUUID()]))]));
 if(reason==='last_live'){p.membraneCostPerSqft['product_'+(n-1)]=500;for(let i=0;i<n-1;i++)delete f.ownerPricing.knownOfferings.membraneType['product_'+i];}
 if(reason==='all_free'){for(const rates of [p.laborPerSqft,p.membraneCostPerSqft,p.tearOffPerSqft])for(const k in rates)rates[k]=0;f.ownerPricing=freeFixture(f.ownerPricing);}
 return f;
}
for(const reason of ['incomplete','last_live','all_free'])for(const quick of [true,false])test('QP-03 320-product '+reason+'; quick='+quick,async()=>{
 const f=catalog(320,reason),start=performance.now(),timer=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),20));
 const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:quick}),elapsed=performance.now()-start,delay=await timer;
 assert.equal(status.status,reason==='incomplete'?'NEEDS PRICING':'QUOTING LIVE');
 assert.ok((status.productCoverage||[]).length<=640,'Large catalogs must not materialize the Cartesian failure grid');
 assert.ok(elapsed<1500&&delay<1500,'Status/timer blocked for '+Math.round(elapsed)+'/'+Math.round(delay)+' ms');
 console.log(JSON.stringify({case:reason,quick,productsPerAxis:320,elapsedMs:elapsed,timerDelayMs:delay,coverageRows:status.productCoverage?.length||0}));
});
test('QP-03 public catalog cold and warm paths stay compact for a 55 KB incomplete draft',async()=>{
 const f=catalog(320,'incomplete'),book={ownerId:'synthetic-scaling-'+randomUUID(),services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'USD'}},start=performance.now();
 const timer=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),20)),status=bookQuoteStatuses(book),cold=performance.now()-start,delay=await timer;
 const warmStart=performance.now();assert.deepEqual(bookQuoteStatuses(book),status);const warm=performance.now()-warmStart;
 assert.equal(status[0].status,'NEEDS PRICING');assert.ok((status[0].productCoverage||[]).length<=640);assert.ok(cold<1500&&delay<1500&&warm<150);
 console.log(JSON.stringify({path:'bookQuoteStatuses',bytes:Buffer.byteLength(JSON.stringify(book)),coldMs:cold,timerDelayMs:delay,warmMs:warm,rows:status[0].productCoverage?.length||0}));
});
test('QP-03 cross-axis included prices preserve allocation review',()=>{
 const f=catalog(12,'incomplete'),p=f.ownerPricing.pricing;
 f.ownerPricing=includedFixture(f.ownerPricing,Object.fromEntries(Object.keys(p.membraneCostPerSqft).map(key=>['membraneCostPerSqft.'+key,'tearOffPerSqft.product_11'])));
 for(const quick of [true,false]){const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:quick});assert.equal(status.status,'NEEDS PRICING');assert.ok(status.ownerDecisionRequired.some(d=>d.kind==='included_price_allocation'));}
 const inputs={...f.customerInputs,replacementMembraneType:'product_0',membraneType:'product_11'};inputs.confirmedFacts=Object.fromEntries(['membraneType','replacementMembraneType'].map(field=>[field,{status:'identified',field,value:inputs[field],offeringId:f.ownerPricing.knownOfferings[field][inputs[field]]}]));
 const quote=generateQuoteVNext({...f,customerInputs:inputs});assert.equal(quote.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(quote.ownerDecisionRequired.some(d=>d.kind==='included_price_allocation'));
});
