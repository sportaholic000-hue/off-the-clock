import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';

const mode=process.argv[2];
if(!['arithmetic','metrics','report'].includes(mode))throw new Error('Mode must be arithmetic, metrics or report.');

const root=new URL('../../',import.meta.url);
const arithmeticModule=process.env.PRICEBOOK_METRIC_ARITHMETIC_MODULE
  ?pathToFileURL(process.env.PRICEBOOK_METRIC_ARITHMETIC_MODULE).href
  :new URL('server/priceBookMetricArithmetic.js',root).href;
const metricsModule=process.env.OWNER_JOB_METRICS_MODULE
  ?pathToFileURL(process.env.OWNER_JOB_METRICS_MODULE).href
  :new URL('server/src/ownerJobMetrics.js',root).href;

function firstPrimes(count){
  const limit=400_000;
  const composite=new Uint8Array(limit+1);
  const values=[];
  for(let candidate=2;candidate<=limit&&values.length<count;candidate++){
    if(composite[candidate])continue;
    if(candidate>5)values.push(candidate);
    if(candidate*candidate<=limit)for(let multiple=candidate*candidate;multiple<=limit;multiple+=candidate)composite[multiple]=1;
  }
  if(values.length!==count)throw new Error(`Expected ${count} primes, found ${values.length}.`);
  return values;
}

const memory=()=>{
  try{
    const usage=process.memoryUsage();
    return {rssBytes:usage.rss,heapUsedBytes:usage.heapUsed,maxRssKilobytes:process.resourceUsage().maxRSS};
  }catch{
    return {rssBytes:null,heapUsedBytes:null,maxRssKilobytes:process.resourceUsage().maxRSS};
  }
};
const started=performance.now();
const primes=firstPrimes(33_333);
const generated=performance.now();
const families=[
  p=>({midpoint:20_000*p,gap:p+2}),
  p=>({midpoint:60_000*p,gap:3*p+2}),
  p=>({midpoint:60_000*p,gap:3*p-8})
];

let result;
if(mode==='arithmetic'){
  const {createMetricMean,metricFraction}=await import(arithmeticModule);
  const mean=createMetricMean();
  for(const family of families)for(const p of primes){
    const {midpoint,gap}=family(p);
    mean.add(metricFraction(BigInt(gap)*10_000n,BigInt(midpoint)));
  }
  mean.add(metricFraction(10_000n,20_000n));
  const constructed=performance.now();
  result=mean.value();
  const finished=performance.now();
  process.stdout.write(JSON.stringify({
    mode,node:process.version,records:100_000,firstPrime:primes[0],lastPrime:primes.at(-1),
    primeSum:primes.reduce((sum,value)=>sum+BigInt(value),0n).toString(),
    primeGenerationMs:Number((generated-started).toFixed(3)),
    constructionMs:Number((constructed-generated).toFixed(3)),
    calculationMs:Number((finished-constructed).toFixed(3)),
    totalMs:Number((finished-started).toFixed(3)),memory:memory(),result
  })+'\n');
}else{
  const quotes=[];
  let index=0;
  for(const family of families)for(const p of primes){
    const {midpoint,gap}=family(p),midpointDollars=midpoint/100;
    quotes.push({
      id:`boundary-${index++}`,
      serviceType:'CUSTOM',
      finalInvoiceAmount:midpoint+gap,
      resultJson:JSON.stringify({customerResult:{
        resultType:'INSTANT_ESTIMATE_READY',
        lowEstimate:midpointDollars*9/10,
        midEstimate:midpointDollars,
        highEstimate:midpointDollars*11/10,
        currency:'CAD',priceUnit:'per job',taxTreatment:'TAX_NONE'
      },request:{ownerPricing:{id:'boundary-service',service:'Boundary service'}}})
    });
  }
  quotes.push({
    id:`boundary-${index}`,
    serviceType:'CUSTOM',
    finalInvoiceAmount:20_001,
    resultJson:JSON.stringify({customerResult:{
      resultType:'INSTANT_ESTIMATE_READY',lowEstimate:180,midEstimate:200,
      highEstimate:220,currency:'CAD',priceUnit:'per job',taxTreatment:'TAX_NONE'
    },request:{ownerPricing:{id:'boundary-service',service:'Boundary service'}}})
  });
  const constructed=performance.now();
  const groups=mode==='metrics'
    ?(await import(metricsModule)).ownerJobMetrics(quotes)
    :(await import(new URL('server/src/ownerReportCalculation.js',root).href)).calculateOwnerReport({role:'owner',range:{period:'all',timezone:'UTC',fromDate:null,toDate:null,startAtUtc:null,endAtUtc:null},hours:{weeklyHours:null,revision:0,updatedAt:null},calls:[],allQuotes:quotes,leads:[],appointments:[],intents:[],events:[],workflows:[],costRows:[],nowMs:Date.parse('2026-10-17T12:00:00.000Z')}).jobMetrics;
  const finished=performance.now();
  const group=groups[0];
  result={
    groups:groups.length,records:group?.records.length??null,jobs:group?.jobs??null,
    insideRange:group?.insideRange??null,signedGap:group?.signedGap??null,
    absoluteGap:group?.absoluteGap??null,signedGapPercent:group?.signedGapPercent??null,
    absoluteGapPercent:group?.absoluteGapPercent??null
  };
  process.stdout.write(JSON.stringify({
    mode,node:process.version,records:quotes.length,firstPrime:primes[0],lastPrime:primes.at(-1),
    primeSum:primes.reduce((sum,value)=>sum+BigInt(value),0n).toString(),
    primeGenerationMs:Number((generated-started).toFixed(3)),
    constructionMs:Number((constructed-generated).toFixed(3)),
    calculationMs:Number((finished-constructed).toFixed(3)),
    totalMs:Number((finished-started).toFixed(3)),memory:memory(),result
  })+'\n');
}
