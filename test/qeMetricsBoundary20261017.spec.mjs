import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {OwnerReportWorkerPool} from '../server/src/ownerReportWorkerPool.js';
import {createMetricMean,metricFraction} from '../server/priceBookMetricArithmetic.js';

// Independent expectations and the derivation of the exact 0.005% tie were
// recorded before production changes in
// verification/qe-metrics-scaling-20261017/BOUNDARY_EXPECTED.md.
const execFileAsync=promisify(execFile);
const boundaryWorker=fileURLToPath(new URL('../verification/qe-metrics-scaling-20261017/boundary-worker.mjs',import.meta.url));
const controlledWorker=new URL('../verification/qe-metrics-scaling-20261017/controlled-worker.mjs',import.meta.url);

test('exact fallback retains half-away rounding on the negative side',()=>{
  const mean=createMetricMean();
  mean.add(metricFraction(-1n,2n));
  assert.deepEqual(mean.value(),{count:1,value:'-0.01'});
});

test('100,000 adversarial observations resolve the exact positive half-tie in bounded time',{timeout:32_000},async()=>{
  for(const mode of ['arithmetic','metrics']){
    const {stdout}=await execFileAsync(process.execPath,[boundaryWorker,mode],{timeout:15_000,killSignal:'SIGKILL',maxBuffer:1024*1024});
    const measurement=JSON.parse(stdout);
    assert.equal(measurement.records,100_000);
    assert.equal(measurement.firstPrime,7);
    assert.equal(measurement.lastPrime,393_241);
    assert.equal(measurement.primeSum,'6251065493');
    if(mode==='arithmetic')assert.deepEqual(measurement.result,{count:100_000,value:'0.01'});
    else assert.deepEqual(measurement.result,{
      groups:1,records:100_000,jobs:100_000,
      insideRange:{count:100_000,inside:100_000,percent:'100.00'},
      signedGap:{count:100_000,value:'4375.73'},
      absoluteGap:{count:100_000,value:'4375.73'},
      signedGapPercent:{count:100_000,value:'0.01'},
      absoluteGapPercent:{count:100_000,value:'0.01'}
    });
  }
});

test('worker pool bounds active and queued reports without dropping accepted work',async t=>{
  const pool=new OwnerReportWorkerPool({size:2,maxQueue:1,timeoutMs:5_000,workerUrl:controlledWorker});
  t.after(()=>pool.close());
  const first=pool.run({delayMs:150,value:'first'}),second=pool.run({delayMs:150,value:'second'}),third=pool.run({value:'third'});
  assert.deepEqual(pool.stats(),{size:2,maxQueue:1,active:2,queued:1,closed:false});
  await assert.rejects(pool.run({value:'not-accepted'}),{code:'OWNER_REPORT_OVERLOADED'});
  assert.deepEqual(await Promise.all([first,second,third]),['first','second','third']);
  assert.deepEqual(pool.stats(),{size:2,maxQueue:1,active:0,queued:0,closed:false});
});

test('worker timeout stops CPU work and releases capacity for the next report',async t=>{
  const pool=new OwnerReportWorkerPool({size:1,maxQueue:1,timeoutMs:150,workerUrl:controlledWorker});
  t.after(()=>pool.close());
  const started=performance.now();
  await assert.rejects(pool.run({behavior:'spin',delayMs:5_000}),{code:'OWNER_REPORT_TIMEOUT'});
  assert.ok(performance.now()-started<2_000,'timeout did not terminate worker computation');
  assert.equal(await pool.run({value:'recovered'}),'recovered');
});

test('worker cancellation and failure terminate the task and preserve later reports',async t=>{
  const pool=new OwnerReportWorkerPool({size:1,maxQueue:1,timeoutMs:5_000,workerUrl:controlledWorker});
  t.after(()=>pool.close());
  const controller=new AbortController(),cancelled=pool.run({behavior:'spin',delayMs:5_000},{signal:controller.signal});
  setTimeout(()=>controller.abort(),75);
  await assert.rejects(cancelled,{code:'OWNER_REPORT_ABORTED'});
  await assert.rejects(pool.run({behavior:'throw'}),{code:'OWNER_REPORT_WORKER_FAILED'});
  assert.equal(await pool.run({value:'still-usable'}),'still-usable');
});

test('production report worker returns complete exact output and closes cleanly',async t=>{
  const pool=new OwnerReportWorkerPool({size:1,maxQueue:0,timeoutMs:5_000});
  t.after(()=>pool.close());
  const customerResult={resultType:'INSTANT_ESTIMATE_READY',lowEstimate:180,midEstimate:200,highEstimate:220,currency:'CAD',priceUnit:'per job',taxTreatment:'TAX_NONE'};
  const quotes=[{id:'synthetic-worker-quote',serviceType:'CUSTOM',finalInvoiceAmount:20_001,resultJson:JSON.stringify({customerResult})}];
  const result=await pool.run({role:'owner',range:{period:'all',timezone:'UTC',fromDate:null,toDate:null,startAtUtc:null,endAtUtc:null},hours:{weeklyHours:null,revision:0,updatedAt:null},calls:[],allQuotes:quotes,leads:[],appointments:[],intents:[],events:[],workflows:[],costRows:[],nowMs:Date.parse('2026-10-17T12:00:00.000Z')});
  assert.equal(result.jobMetrics.length,1);
  assert.deepEqual(result.jobMetrics[0].signedGapPercent,{count:1,value:'0.01'});
  assert.deepEqual(result.jobMetrics[0].absoluteGapPercent,{count:1,value:'0.01'});
  assert.deepEqual(result.jobMetrics[0].records,[{id:'synthetic-worker-quote',originalScopeInvoice:'200.01',approvedChanges:'0.00',inRange:true}]);
});
