import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {ownerJobMetrics} from '../server/src/ownerJobMetrics.js';

// Independent expectations are recorded in
// verification/qe-metrics-scaling-20261017/EXPECTED.md.
const execFileAsync=promisify(execFile);
const abs=value=>value<0n?-value:value;
const gcd=(a,b)=>{while(b){const next=a%b;a=b;b=next;}return a;};
const normalized=(n,d=1n)=>{const divisor=gcd(abs(n),d)||1n;return {n:n/divisor,d:d/divisor};};
const addExact=(left,right)=>{
  const shared=gcd(left.d,right.d),leftScale=right.d/shared,rightScale=left.d/shared;
  const numerator=left.n*leftScale+right.n*rightScale;
  const reduction=gcd(abs(numerator),shared)||1n;
  return {n:numerator/reduction,d:(left.d/reduction)*leftScale};
};
const exactSum=values=>{
  let level=values.map(value=>normalized(value.n,value.d));
  if(!level.length)return normalized(0n);
  while(level.length>1){const next=[];for(let i=0;i<level.length;i+=2)next.push(i+1<level.length?addExact(level[i],level[i+1]):level[i]);level=next;}
  return level[0];
};
const formatRounded=(n,d)=>{
  const negative=n<0n,q=(abs(n)*2n+d)/(2n*d);
  return `${q===0n?'':negative?'-':''}${q/100n}.${(q%100n).toString().padStart(2,'0')}`;
};
const exactPercentageMean=(cases,useAbsolute=false)=>{
  const total=exactSum(cases.map(({gapCents,midCents})=>({n:(useAbsolute?abs(gapCents):gapCents)*10000n,d:midCents})));
  return formatRounded(total.n,total.d*BigInt(cases.length));
};
const dollars=cents=>Number(cents)/100;
function quote({id,midCents,gapCents=0n,currency='CAD',priceUnit='per job',taxTreatment='TAX_NONE',customerResult=null,internalResult=null,tierChosen=null}){
  const result=customerResult||{resultType:'INSTANT_ESTIMATE_READY',lowEstimate:0,midEstimate:dollars(midCents),highEstimate:Math.ceil(dollars(midCents))+100,currency,priceUnit,taxTreatment};
  return {id,serviceType:'CUSTOM',tierChosen,finalInvoiceAmount:Number(midCents+gapCents),resultJson:JSON.stringify({customerResult:result,internalResult,request:{ownerPricing:{id:'synthetic-service',service:'Synthetic custom'}}})};
}
const costRow=(quoteId,value)=>({quoteId,dataJson:typeof value==='string'?value:JSON.stringify(value)});

test('percentage half-ties and neighboring denominators round exactly away from zero',()=>{
  const cases=[
    {midCents:20000n,gapCents:1n,expected:'0.01'},
    {midCents:20000n,gapCents:-1n,expected:'-0.01'},
    {midCents:19999n,gapCents:1n,expected:'0.01'},
    {midCents:20001n,gapCents:1n,expected:'0.00'},
    {midCents:19999n,gapCents:-1n,expected:'-0.01'},
    {midCents:20001n,gapCents:-1n,expected:'0.00'}
  ];
  for(const [index,row] of cases.entries()){
    const metrics=ownerJobMetrics([quote({id:`boundary-${index}`,...row})])[0];
    assert.equal(metrics.signedGapPercent.value,row.expected);
    assert.equal(metrics.signedGapPercent.value,exactPercentageMean([row]));
  }
  const mixedHalf=[30000n,60000n,20000n,10000n].map((midCents,index)=>({midCents,gapCents:1n,id:`mixed-positive-${index}`}));
  const mixedNegative=mixedHalf.map((row,index)=>({...row,gapCents:-1n,id:`mixed-negative-${index}`}));
  assert.equal(ownerJobMetrics(mixedHalf.map(row=>quote(row)))[0].signedGapPercent.value,'0.01');
  assert.equal(ownerJobMetrics(mixedNegative.map(row=>quote(row)))[0].signedGapPercent.value,'-0.01');
});

test('relatively-prime denominators and cancellation match an independent exact oracle',()=>{
  const cases=[[1,19999],[-1,20011],[7,65537],[-5,32749],[3,10007],[-2,99991]].map(([gap,mid])=>({gapCents:BigInt(gap),midCents:BigInt(mid)}));
  const metrics=ownerJobMetrics(cases.map((row,index)=>quote({id:`prime-${index}`,...row})))[0];
  assert.equal(metrics.signedGap.value,'0.01');
  assert.equal(metrics.absoluteGap.value,'0.03');
  assert.equal(metrics.signedGapPercent.value,'0.00');
  assert.equal(metrics.absoluteGapPercent.value,'0.01');
  assert.equal(metrics.signedGapPercent.value,exactPercentageMean(cases));
  assert.equal(metrics.absoluteGapPercent.value,exactPercentageMean(cases,true));
  const negativeHalf=ownerJobMetrics([
    quote({id:'negative-half-zero',midCents:20000n,gapCents:0n}),
    quote({id:'negative-half-one',midCents:20000n,gapCents:-1n})
  ])[0];
  assert.equal(negativeHalf.signedGap.value,'-0.01');
});

test('large accepted safe-integer amounts retain the one-cent gap without overflow',()=>{
  const midCents=9007199254740990n;
  const metrics=ownerJobMetrics([quote({id:'large-safe',midCents,gapCents:1n})])[0];
  assert.deepEqual(metrics.signedGap,{count:1,value:'0.01'});
  assert.deepEqual(metrics.signedGapPercent,{count:1,value:'0.00'});
  assert.equal(metrics.records[0].originalScopeInvoice,'90071992547409.91');
});

test('realized margin uses the same exact negative and positive half-tie rule',()=>{
  for(const [id,labor,expected] of [['negative-margin',20001,'-0.01'],['positive-margin',19999,'0.01']]){
    const row=quote({id,midCents:20000n});
    const metrics=ownerJobMetrics([row],[costRow(id,{actualLaborCostCents:labor,actualMaterialCostCents:0,approvedChanges:[]})])[0];
    assert.deepEqual(metrics.realizedMargin,{count:1,value:expected});
  }
});

test('existing three-job accuracy example retains its complete output',()=>{
  const receipt=mid=>({customerResult:{resultType:'INSTANT_ESTIMATE_READY',lowEstimate:mid*90/100,midEstimate:mid,highEstimate:mid*110/100,currency:'CAD'},internalResult:{resultType:'INSTANT_ESTIMATE_READY',lineItems:[{category:'labor',amountCents:30000,calculation:{effectivePriceBasis:'cost'}},{category:'material',amountCents:20000,calculation:{effectivePriceBasis:'cost'}}]}});
  const quotes=[1000,2000,1500,900].map((mid,index)=>({id:`existing-${index}`,serviceType:'CUSTOM',resultJson:JSON.stringify(receipt(mid)),finalInvoiceAmount:[105000,230000,140000,null][index]}));
  const costs=[costRow('existing-0',{actualLaborHours:8.5,actualLaborCostCents:40000,actualMaterialCostCents:30000,approvedChanges:[]}),costRow('existing-1',{approvedChanges:[{amountCents:20000,description:'[SYNTHETIC] Approved scope'}]})];
  assert.deepEqual(ownerJobMetrics(quotes,costs),[{
    serviceId:null,service:'CUSTOM',currency:'CAD',priceUnit:'per job',taxTreatment:'Tax treatment not recorded',jobs:4,
    insideRange:{count:3,inside:3,percent:'100.00'},
    signedGap:{count:3,value:'16.67'},signedGapPercent:{count:3,value:'1.11'},
    absoluteGap:{count:3,value:'83.33'},absoluteGapPercent:{count:3,value:'5.56'},
    realizedMargin:{count:1,value:'33.33'},
    labor:{count:1,estimated:'300.00',actual:'400.00',gap:'100.00'},
    material:{count:1,estimated:'200.00',actual:'300.00',gap:'100.00'},
    actualLaborHours:{count:1,value:'8.50'},
    records:[
      {id:'existing-0',originalScopeInvoice:'1050.00',approvedChanges:'0.00',inRange:true},
      {id:'existing-1',originalScopeInvoice:'2100.00',approvedChanges:'200.00',inRange:true},
      {id:'existing-2',originalScopeInvoice:'1400.00',approvedChanges:'0.00',inRange:true},
      {id:'existing-3',originalScopeInvoice:null,approvedChanges:'0.00',inRange:null}
    ]
  }]);
});

test('signed changes, missing and explicit zero values retain coverage semantics',()=>{
  const internalResult={resultType:'INSTANT_ESTIMATE_READY',lineItems:[{category:'labor',amountCents:3000,calculation:{effectivePriceBasis:'cost'}},{category:'material',amountCents:2000,calculation:{effectivePriceBasis:'cost'}}]};
  const quotes=[
    quote({id:'positive-change',midCents:10000n,gapCents:2000n,internalResult}),
    quote({id:'negative-change',midCents:10000n,gapCents:-2000n,internalResult}),
    quote({id:'explicit-zero',midCents:10000n,internalResult}),
    quote({id:'missing-values',midCents:10000n,internalResult}),
    quote({id:'corrupt-cost',midCents:10000n,internalResult})
  ];
  const costs=[
    costRow('positive-change',{approvedChanges:[{amountCents:2000,description:'[SYNTHETIC] Addition'}]}),
    costRow('negative-change',{approvedChanges:[{amountCents:-2000,description:'[SYNTHETIC] Credit'}]}),
    costRow('explicit-zero',{actualLaborHours:0,actualLaborCostCents:0,actualMaterialCostCents:0,approvedChanges:[]}),
    costRow('corrupt-cost','broken')
  ];
  const metrics=ownerJobMetrics(quotes,costs)[0];
  assert.deepEqual(metrics.records.map(row=>row.originalScopeInvoice),['100.00','100.00','100.00','100.00',null]);
  assert.equal(metrics.insideRange.count,4);
  assert.deepEqual(metrics.realizedMargin,{count:1,value:'100.00'});
  assert.deepEqual(metrics.actualLaborHours,{count:1,value:'0.00'});
  assert.deepEqual(metrics.labor,{count:1,estimated:'30.00',actual:'0.00',gap:'-30.00'});
  assert.deepEqual(metrics.material,{count:1,estimated:'20.00',actual:'0.00',gap:'-20.00'});
});

test('selected options qualify while ambiguous options and grouping boundaries remain intact',()=>{
  const option=(tierName,mid,currency='CAD',taxTreatment='TAX_NONE')=>({tierName,resultType:'INSTANT_ESTIMATE_READY',lowEstimate:mid-10,midEstimate:mid,highEstimate:mid+10,currency,priceUnit:'per job',taxTreatment});
  const multi={resultType:'INSTANT_ESTIMATE_READY',currency:'CAD',priceUnit:'per job',taxTreatment:'TAX_NONE',options:[option('One',100),option('Two',200)]};
  const selected=quote({id:'selected',midCents:20000n,customerResult:multi,tierChosen:'Two'});
  const ambiguous=quote({id:'ambiguous',midCents:20000n,customerResult:multi});
  const usd=quote({id:'usd',midCents:10000n,currency:'USD',taxTreatment:'TAX_ALL'});
  const taxBase=quote({id:'tax-base',midCents:10000n,currency:'CAD',taxTreatment:'TAX_MATERIALS'});
  const groups=ownerJobMetrics([selected,ambiguous,usd,taxBase]);
  assert.equal(groups.length,3);
  const cadNone=groups.find(group=>group.currency==='CAD'&&group.taxTreatment==='TAX_NONE');
  assert.equal(cadNone.jobs,2);
  assert.equal(cadNone.insideRange.count,1);
  assert.equal(cadNone.records.find(row=>row.id==='ambiguous').inRange,null);
  assert.ok(groups.some(group=>group.currency==='USD'&&group.taxTreatment==='TAX_ALL'));
  assert.ok(groups.some(group=>group.currency==='CAD'&&group.taxTreatment==='TAX_MATERIALS'));
});

const benchmarkWorker=fileURLToPath(new URL('../verification/qe-metrics-scaling-20261017/benchmark-worker.mjs',import.meta.url));
for(const [count,percentage,watchdog] of [[2000,'0.01',3000],[10000,'0.01',6000],[100000,'0.00',15000]])test(`${count.toLocaleString('en-US')}-record scaling regression completes in an isolated process under its watchdog`,{timeout:watchdog+2000},async()=>{
  const {stdout}=await execFileAsync(process.execPath,[benchmarkWorker,String(count)],{timeout:watchdog,killSignal:'SIGKILL',maxBuffer:1024*1024});
  const result=JSON.parse(stdout);
  console.log(`QE metrics isolated benchmark ${JSON.stringify(result)}`);
  assert.equal(result.records,count);
  assert.deepEqual(result.insideRange,{count,inside:count,percent:'100.00'});
  assert.deepEqual(result.signedGap,{count,value:'1.00'});
  assert.deepEqual(result.absoluteGap,{count,value:'1.00'});
  assert.deepEqual(result.signedGapPercent,{count,value:percentage});
  assert.deepEqual(result.absoluteGapPercent,{count,value:percentage});
});
