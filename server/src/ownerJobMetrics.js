import {storedObject} from './ownerRecordViews.js';
import {createMetricMean,metricFraction as fraction,roundedMetricValue as rounded} from '../priceBookMetricArithmetic.js';
// Monetary inputs are cents. Percentage and margin means preserve each job's
// exact ratio and round only the final displayed mean, including negative ties.
const absolute=n=>n<0n?-n:n;
const dollarCents=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||!/^\d+(?:\.\d{1,2})?$/.test(String(value)))return null;const [a,b='']=String(value).split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));};
const cents=value=>Number.isSafeInteger(value)&&value>=0?BigInt(value):null;
const mean=createMetricMean;
function pair(){let count=0,estimated=0n,actual=0n;return {add(e,a){estimated+=e;actual+=a;count++;},value(){return {count,estimated:count?rounded(estimated):null,actual:count?rounded(actual):null,gap:count?rounded(actual-estimated):null};}};}
function select(result,tier){
  if(!result||!['INSTANT_ESTIMATE_READY','INSTANT_QUOTE'].includes(result.resultType))return null;
  if(!Array.isArray(result.options))return tier?null:result;
  const options=result.options.filter(option=>tier?option.tierName===tier:true);
  return options.length===1?{...result,...options[0]}:null;
}
function estimatedCost(option,category){
  if(!Array.isArray(option?.lineItems))return null;
  const lines=option.lineItems.filter(line=>line.category===category);
  // A selling price or installed selling allocation is not a cost budget.
  if(!lines.length||lines.some(line=>line.calculation?.effectivePriceBasis!=='cost'||cents(line.amountCents)===null))return null;
  return lines.reduce((sum,line)=>sum+BigInt(line.amountCents),0n);
}
export function ownerJobMetrics(quotes,costRows=[]) {
  const costs=new Map(costRows.map(row=>[row.quoteId,storedObject(row.dataJson)])),groups=new Map();
  for(const quote of quotes){
    const saved=storedObject(quote.resultJson),receipt=saved.applicationOutcome||saved,result=receipt.customerResult;
    const option=select(result,quote.tierChosen),internal=select(receipt.internalResult,quote.tierChosen);
    const serviceId=receipt.request?.ownerPricing?.id||receipt.internalResult?.serviceId||null;
    const service=receipt.request?.ownerPricing?.service||result?.pricedScope?.service||quote.serviceType||'Unclassified';
    const currency=option?.currency??result?.currency??null,priceUnit=option?.priceUnit??result?.priceUnit??'per job',taxTreatment=option?.taxTreatment??result?.taxTreatment??'Tax treatment not recorded';
    const key=JSON.stringify([serviceId||quote.serviceType||service,currency,priceUnit,taxTreatment]);
    if(!groups.has(key))groups.set(key,{serviceId,service,currency,priceUnit,taxTreatment,jobs:0,inside:0,rangeCount:0,signed:mean(),signedPercent:mean(),absolute:mean(),absolutePercent:mean(),margin:mean(),labor:pair(),material:pair(),hours:mean(),records:[]});
    const group=groups.get(key);group.jobs++;
    const cost=costs.get(quote.id)||{},invoice=cents(quote.finalInvoiceAmount);
    const changes=costs.has(quote.id)?cost.approvedChanges:[];
    const validChanges=Array.isArray(changes)&&changes.every(change=>Number.isSafeInteger(change.amountCents)&&typeof change.description==='string'&&change.description.trim());
    const changeTotal=validChanges?changes.reduce((sum,change)=>sum+BigInt(change.amountCents),0n):null;
    const original=invoice!==null&&changeTotal!==null&&invoice>=changeTotal?invoice-changeTotal:null;
    const qualified=['CAD','USD'].includes(currency)&&['per job','per visit','for the first visit'].includes(priceUnit);
    // Use the saved customer quote, never today's prices or an unselected tier envelope.
    const low=option?dollarCents(option.lowEstimate):null,mid=option?dollarCents(option.midEstimate):null,high=option?dollarCents(option.highEstimate):null;
    const rangeValid=qualified&&low!==null&&high!==null&&high>=low;
    let inRange=null;
    if(rangeValid&&original!==null){inRange=original>=low&&original<=high;group.rangeCount++;if(inRange)group.inside++;}
    if(rangeValid&&original!==null&&mid!==null&&mid>=low&&mid<=high){
      const gap=original-mid;group.signed.add(gap);group.absolute.add(absolute(gap));
      if(mid>0n){group.signedPercent.add(fraction(gap*10000n,mid));group.absolutePercent.add(fraction(absolute(gap)*10000n,mid));}
    }
    const labor=cents(cost.actualLaborCostCents),material=cents(cost.actualMaterialCostCents);
    if(qualified&&invoice!==null&&invoice>0n&&labor!==null&&material!==null)group.margin.add(fraction((invoice-labor-material)*10000n,invoice));
    if(qualified)for(const [category,actual] of [['labor',labor],['material',material]]){const budget=estimatedCost(internal,category);if(actual!==null&&budget!==null)group[category].add(budget,actual);}
    if(typeof cost.actualLaborHours==='number'&&Number.isFinite(cost.actualLaborHours)&&cost.actualLaborHours>=0){const [a,b='']=String(cost.actualLaborHours).split('.');if(/^\d+$/.test(a)&&b.length<=4)group.hours.add(fraction(BigInt(a+b.padEnd(4,'0')),100n));}
    group.records.push({id:quote.id,originalScopeInvoice:original===null?null:rounded(original),approvedChanges:changeTotal===null?null:rounded(changeTotal),inRange});
  }
  return [...groups.values()].sort((a,b)=>a.service.localeCompare(b.service)||String(a.currency).localeCompare(String(b.currency))).map(g=>({serviceId:g.serviceId,service:g.service,currency:g.currency,priceUnit:g.priceUnit,taxTreatment:g.taxTreatment,jobs:g.jobs,
    insideRange:{count:g.rangeCount,inside:g.inside,percent:g.rangeCount?rounded(BigInt(g.inside)*10000n,BigInt(g.rangeCount)):null},
    signedGap:g.signed.value(),signedGapPercent:g.signedPercent.value(),absoluteGap:g.absolute.value(),absoluteGapPercent:g.absolutePercent.value(),realizedMargin:g.margin.value(),
    labor:g.labor.value(),material:g.material.value(),actualLaborHours:g.hours.value(),records:g.records}));
}
