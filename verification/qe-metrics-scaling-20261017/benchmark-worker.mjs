import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {getHeapStatistics} from 'node:v8';

const metricsModule=process.env.OWNER_JOB_METRICS_MODULE
  ?pathToFileURL(process.env.OWNER_JOB_METRICS_MODULE).href
  :new URL('../../server/src/ownerJobMetrics.js',import.meta.url).href;
const {ownerJobMetrics}=await import(metricsModule);

const count=Number(process.argv[2]);
if(!Number.isSafeInteger(count)||count<1)throw new Error('Supply a positive safe record count.');
const memory=()=>{
  try{return process.memoryUsage();}
  catch{return {rss:null,heapUsed:getHeapStatistics().used_heap_size,maxRssKilobytes:process.resourceUsage().maxRSS};}
};

const started=performance.now();
const quotes=Array.from({length:count},(_,i)=>{
  const midpoint=10000+i;
  const customerResult={
    resultType:'INSTANT_ESTIMATE_READY',
    lowEstimate:Math.floor(midpoint*9/10),
    midEstimate:midpoint,
    highEstimate:Math.ceil(midpoint*11/10),
    currency:'CAD',
    priceUnit:'per job',
    taxTreatment:'TAX_NONE'
  };
  return {
    id:`synthetic-scaling-${i}`,
    serviceType:'CUSTOM',
    finalInvoiceAmount:(10001+i)*100,
    resultJson:JSON.stringify({customerResult})
  };
});
const constructed=performance.now();
const before=memory();
const groups=ownerJobMetrics(quotes);
const finished=performance.now();
const after=memory();
const group=groups[0];

process.stdout.write(JSON.stringify({
  node:process.version,
  count,
  constructionMs:Number((constructed-started).toFixed(3)),
  calculationMs:Number((finished-constructed).toFixed(3)),
  totalMs:Number((finished-started).toFixed(3)),
  rssBeforeBytes:before.rss,
  rssAfterBytes:after.rss,
  maxRssBeforeKilobytes:before.maxRssKilobytes??null,
  maxRssAfterKilobytes:after.maxRssKilobytes??null,
  heapUsedBeforeBytes:before.heapUsed,
  heapUsedAfterBytes:after.heapUsed,
  groups:groups.length,
  records:group?.records.length??null,
  insideRange:group?.insideRange??null,
  signedGap:group?.signedGap??null,
  signedGapPercent:group?.signedGapPercent??null,
  absoluteGap:group?.absoluteGap??null,
  absoluteGapPercent:group?.absoluteGapPercent??null
})+'\n');
