import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {httpFixture} from './leadCaptureRepair20261006HttpFixture.mjs';
import {createOwnerReportService} from '../server/src/ownerReportService.js';
import {createMetricMean} from '../server/priceBookMetricArithmetic.js';

// Keep this import and the small arithmetic use explicit: the reporting
// regression belongs in the normal strict quote/price-book discovery gate.
assert.equal(createMetricMean().value().count,0);

const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all=value=>Object.fromEntries(categories.map(key=>[key,value]));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function primes(count){
  const limit=400_000,composite=new Uint8Array(limit+1),values=[];
  for(let candidate=2;candidate<=limit&&values.length<count;candidate++){
    if(composite[candidate])continue;
    if(candidate>5)values.push(candidate);
    if(candidate*candidate<=limit)for(let multiple=candidate*candidate;multiple<=limit;multiple+=candidate)composite[multiple]=1;
  }
  assert.equal(values.length,count);
  return values;
}

async function configureQuote(f){
  const current=await f.request('/api/pricebook/synthetic-a');
  assert.equal(current.status,200,JSON.stringify(current.body));
  const serviceId=randomUUID(),service='[SYNTHETIC] responsiveness quote';
  const saved=await f.request('/api/pricebook/save','synthetic-a',{method:'POST',body:{...current.body,
    defaults:{currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(false),peakMonths:[],peakSurchargePercent:0},
    services:[{id:serviceId,serviceType:'CUSTOM',service,source:'MANUAL',active:true,
      feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),
      pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price:100,minimumJob:0},tiers:[]}]}});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  const approved=await f.request(`/api/pricebook/services/${serviceId}/approve`,'synthetic-a',{method:'POST',body:{revision:saved.body.revision,confirmConfiguration:true}});
  assert.equal(approved.status,200,JSON.stringify(approved.body));
  return {serviceId,body:()=>({revision:approved.body.revision,serviceId,customerInputs:{service,serviceConfirmed:true,unit:'flat'}})};
}

function seedBoundaryQuotes(db){
  const insert=db.prepare("INSERT INTO quotes(id,ownerId,serviceType,resultJson,status,finalInvoiceAmount,createdAt) VALUES(?,'synthetic-a','CUSTOM',?,'INSTANT',?,'2026-10-17T12:00:00.000Z')");
  const values=primes(33_333),families=[p=>[20_000*p,p+2],p=>[60_000*p,3*p+2],p=>[60_000*p,3*p-8]];
  let index=0;
  db.transaction(()=>{
    for(const family of families)for(const p of values){
      const [midpoint,gap]=family(p),midpointDollars=midpoint/100;
      const resultJson=JSON.stringify({customerResult:{resultType:'INSTANT_ESTIMATE_READY',lowEstimate:midpointDollars*9/10,midEstimate:midpointDollars,highEstimate:midpointDollars*11/10,currency:'CAD',priceUnit:'per job',taxTreatment:'TAX_NONE'},request:{ownerPricing:{id:'boundary-service',service:'Boundary service'}}});
      insert.run(`boundary-http-${index++}`,resultJson,midpoint+gap);
    }
    insert.run(`boundary-http-${index}`,JSON.stringify({customerResult:{resultType:'INSTANT_ESTIMATE_READY',lowEstimate:180,midEstimate:200,highEstimate:220,currency:'CAD',priceUnit:'per job',taxTreatment:'TAX_NONE'},request:{ownerPricing:{id:'boundary-service',service:'Boundary service'}}}),20_001);
  })();
  assert.equal(index+1,100_000);
}

test('async report service preserves complete output and fails closed on worker error',async t=>{
  const f=await httpFixture(t),clock=()=>new Date('2026-10-17T12:00:00.000Z'),synchronous=createOwnerReportService({ownerQuery:f.ownerQuery,clock});
  const expected=synchronous.report({ownerId:'synthetic-a',query:{period:'all'},role:'owner'});
  let received;
  const asynchronous=createOwnerReportService({ownerQuery:f.ownerQuery,clock,reportRunner:async(input,options)=>{received={input,options};return {...expected,generatedAt:undefined};}});
  const signal=new AbortController().signal,actual=await asynchronous.reportAsync({ownerId:'synthetic-a',query:{period:'all'},role:'owner',signal});
  assert.deepEqual(actual,expected);
  assert.equal(received.options.signal,signal);
  assert.ok(received.input.allQuotes.every(row=>row.ownerId==='synthetic-a'));
  const failed=createOwnerReportService({ownerQuery:f.ownerQuery,clock,reportRunner:async()=>{throw Object.assign(Error('SYNTHETIC private worker detail'),{code:'OWNER_REPORT_TIMEOUT'});}});
  await assert.rejects(failed.reportAsync({ownerId:'synthetic-a',query:{period:'all'},role:'owner'}),error=>error.statusCode===503&&error.code==='OWNER_REPORT_TIMEOUT'&&error.message==='Report calculation did not complete. Try again.');
});

test('100,000-record owner report leaves the real quote route responsive and tenant-private',{timeout:45_000},async t=>{
  const f=await httpFixture(t),quote=await configureQuote(f);
  const controlStarted=performance.now(),control=await f.request('/api/pricebook/preview','synthetic-a',{method:'POST',body:quote.body()}),controlMs=performance.now()-controlStarted;
  assert.equal(control.status,200,JSON.stringify(control.body));
  assert.equal(control.body.resultType,'INSTANT_ESTIMATE_READY');
  seedBoundaryQuotes(f.db);

  assert.equal((await f.request('/api/reports?period=all','synthetic-staff')).status,403);
  const foreign=await f.request('/api/reports?period=all','synthetic-b');
  assert.equal(foreign.status,200);assert.deepEqual(foreign.body.jobMetrics,[]);

  const reportStarted=performance.now();
  const reportPromise=f.request('/api/reports?period=all','synthetic-a').then(response=>({response,ended:performance.now()}));
  await sleep(25);
  const loadedStarted=performance.now(),loaded=await f.request('/api/pricebook/preview','synthetic-a',{method:'POST',body:quote.body()}),loadedEnded=performance.now();
  const completed=await reportPromise,reportMs=completed.ended-reportStarted,loadedMs=loadedEnded-loadedStarted;
  assert.equal(loaded.status,200,JSON.stringify(loaded.body));
  assert.equal(loaded.body.resultType,'INSTANT_ESTIMATE_READY');
  assert.ok(loadedEnded<completed.ended,`quote (${loadedMs.toFixed(1)} ms) did not finish before report (${reportMs.toFixed(1)} ms)`);
  assert.ok(loadedMs<=Math.max(1_000,controlMs*20),`loaded quote ${loadedMs.toFixed(1)} ms versus control ${controlMs.toFixed(1)} ms`);
  assert.equal(completed.response.status,200,JSON.stringify(completed.response.body));
  const metric=completed.response.body.jobMetrics.find(group=>group.serviceId==='boundary-service');
  assert.deepEqual({jobs:metric.jobs,insideRange:metric.insideRange,signedGap:metric.signedGap,absoluteGap:metric.absoluteGap,signedGapPercent:metric.signedGapPercent,absoluteGapPercent:metric.absoluteGapPercent},{
    jobs:100_000,insideRange:{count:100_000,inside:100_000,percent:'100.00'},
    signedGap:{count:100_000,value:'4375.73'},absoluteGap:{count:100_000,value:'4375.73'},
    signedGapPercent:{count:100_000,value:'0.01'},absoluteGapPercent:{count:100_000,value:'0.01'}
  });
  console.log(`QE metrics HTTP responsiveness ${JSON.stringify({controlQuoteMs:Number(controlMs.toFixed(3)),loadedQuoteMs:Number(loadedMs.toFixed(3)),reportMs:Number(reportMs.toFixed(3)),records:metric.jobs})}`);
});
