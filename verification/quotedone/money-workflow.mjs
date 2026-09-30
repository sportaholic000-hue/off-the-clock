import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {startApplication} from './application-harness.mjs';
const [root,evidence]=process.argv.slice(2).map(v=>path.resolve(v));const app=await startApplication(root,evidence,{port:4398});const outcomes=[];
try{
 const owner=await app.owner('money-boundaries');const call=async(method,url,body,status=200)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,status,JSON.stringify(r));return r.result;};
 const meta=await call('GET','/api/pricebook/meta'),map=v=>Object.fromEntries(meta.categories.map(k=>[k,v]));let book=await call('GET','/api/pricebook/'+owner.id);
 const baseDefaults={markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:map(true),peakMonths:[],peakSurchargePercent:0};
 const base={serviceType:'LANDSCAPING_MOWING',service:'Synthetic boundary mowing',source:'MANUAL',active:true,pricing:{mowingBaseRatePerSqft:.005,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},overgrowthMultipliers:{maintained:1,overgrown:1,severe:1}},priceBasisByCategory:map('cost'),taxabilityByCategory:map(false),feeRules:Object.fromEntries(meta.feeNames.map(k=>[k,'not_applicable']))};
 const inputs={yardSqft:10000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false};
 async function run(name,expected,change=()=>{},customerChange=()=>{},approval={},submissionChange=()=>{}){
  const service={...structuredClone(base),id:crypto.randomUUID()},defaults=structuredClone(baseDefaults),customer=structuredClone(inputs);change(service,defaults);customerChange(customer);
  book={...book,defaults,services:[service]};await call('POST','/api/pricebook/save',book);book=await call('GET','/api/pricebook/'+owner.id);
  const validation=await call('POST','/api/pricebook/validate',book);const receipt=await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:book.revision,confirmConfiguration:true,...(service.source!=='MANUAL'?{fields:validation.statuses[0].confirmationFields}:{}),...approval});book.revision=receipt.revision;
  const body={requestId:crypto.randomUUID(),contact:{email:'synthetic@example.invalid'},serviceId:service.id,customerInputs:customer};submissionChange(body);const response=await call('POST','/api/quote/calculate',body,201);const result={name,expected,response};outcomes.push(result);
  try{assert.equal(response.resultType,expected===null?'ESTIMATE_REQUIRES_REVIEW':'INSTANT_ESTIMATE_READY');if(expected!==null){const values=Array.isArray(expected)?expected:[expected,expected,expected];assert.deepEqual([response.lowEstimate,response.midEstimate,response.highEstimate],values);assert.deepEqual([response.options[0].lowEstimate,response.options[0].midEstimate,response.options[0].highEstimate],values);}else assert.deepEqual(Object.keys(response).sort(),['customerMessage','quoteId','resultType']);result.passed=true;}catch(e){result.passed=false;result.error=e.message;}
  const stored=await call('GET',expected===null?'/api/leads':'/api/quotes');const row=(stored.leads||stored.quotes).find(row=>(row.internal.customerResult.quoteId===response.quoteId));result.internal=row?.internal;
  return {service,body,response};
 }
 // $/sqft ×10,000, varying only rate around half-cent unit boundary.
 for(const [rate,total] of [[.0049,49],[.005,50],[.0051,51]])await run('rate '+rate,total,s=>s.pricing.mowingBaseRatePerSqft=rate);
 // One price-book minimum immediately below, at and above the $50 base.
 for(const minimum of [49.99,50,50.01,200.01])await run('minimum '+minimum,Math.max(50,minimum),s=>s.pricing.minimumServiceCharge=minimum);
 await run('1200 percent markup on $100 eligible cost',1300,(s,d)=>{s.pricing.mowingBaseRatePerSqft=.01;d.markupPercent=1200;});
 for(const [margin,total] of [[0,100],[90,1000],[99,10000],[99.9,100000],[100,null],[100.1,null]])await run('gross margin '+margin,total,(s,d)=>{s.pricing.mowingBaseRatePerSqft=.01;d.markupMode='margin';d.markupPercent=margin;});
 await run('cost basis receives owner markup',650,(s,d)=>{d.markupPercent=1200;});await run('selling-price basis avoids second markup',50,(s,d)=>{d.markupPercent=1200;s.priceBasisByCategory.labor='sell_price';});
 for(const [fee,field,amount] of [['travel','travelFee',10],['disposal','disposalFee',7],['permit','permitFee',3],['overhead','overheadFixed',5]]){
  await run(fee+' not applicable',50,(s,d)=>{d[field]=amount;});await run(fee+' explicitly applicable',50+amount,(s,d)=>{d[field]=amount;s.feeRules[fee]='always';});
 }
 for(const [fee,field,amount] of [['travel','travelFee',10],['disposal','disposalFee',7],['permit','permitFee',3],['overhead','overheadFixed',5]]){
  for(const selected of [undefined,false,true]){
   await run(fee+' owner selection '+String(selected),selected===undefined?null:selected?50+amount:50,(service,defaults)=>{defaults[field]=amount;service.feeRules[fee]='owner_selected';if(selected!==undefined)service.ownerFeeSelections={[fee]:selected};});
   await run(fee+' customer selection '+String(selected),selected===undefined?null:selected?50+amount:50,(service,defaults)=>{defaults[field]=amount;service.feeRules[fee]='customer_selected';},()=>{},{},body=>{if(selected!==undefined)body.customerFeeSelections={[fee]:selected};});
  }
 }
 await run('Customer cannot provide owner fee authorization',null,(s,d)=>{s.feeRules.travel='owner_selected';d.travelFee=10;},()=>{},{},body=>body.customerFeeSelections={travel:true});
 await run('Configured seasonal date policy remains review',null,(s,d)=>{d.peakMonths=[1];d.peakSurchargePercent=10;});
 await run('tax all selected taxable labor',55,(s,d)=>{s.taxabilityByCategory.labor=true;d.taxMode='TAX_ALL';d.taxPercent=10;});await run('selective tax includes explicitly taxable labor',55,(s,d)=>{s.taxabilityByCategory.labor=true;d.taxMode='TAX_MATERIALS';d.taxPercent=10;});
 await run('selective tax excludes explicitly nontaxable labor',50,(s,d)=>{d.taxMode='TAX_MATERIALS';d.taxPercent=10;});
 await run('range outward display $50.01 ten percent',[45,50,56],(s,d)=>{s.pricing.mowingBaseRatePerSqft=.005001;d.rangeBufferPercent=10;});await run('same exact amount no range',50.01,s=>s.pricing.mowingBaseRatePerSqft=.005001);
 await run('missing optional clipping price unselected',50);await run('missing optional clipping price selected',null,()=>{},c=>c.bagClippings=true);await run('explicit zero optional clipping percentage selected',50,s=>s.pricing.baggingSurchargePercent=0,c=>c.bagClippings=true);
 await run('unclassified zero core labor',null,s=>s.pricing.mowingBaseRatePerSqft=0);await run('explicitly free complete offering bypasses minimum',0,s=>{s.pricing.mowingBaseRatePerSqft=0;s.pricing.minimumServiceCharge=200.01;},()=>{},{zeroClassification:{freeCompleteService:true,freeTiers:[],includedPrices:{}}});
 await run('free designation with positive charge reviews without waiving price',null,()=>{},()=>{},{zeroClassification:{freeCompleteService:true,freeTiers:[],includedPrices:{}}});
 await run('disabled intent survives approval',null,s=>s.active=false);await run('AI owner field-by-field approval',50,s=>s.source='AI_INTERVIEW');
 // Tier names, prices and parent identity come from saved owner input; validity
 // of one tier must not relabel or omit the required scope in another option.
 await run('valid and invalid sibling tiers',50,s=>s.tiers=[{name:'Complete',overrides:{}},{name:'Unclassified free',overrides:{mowingBaseRatePerSqft:0}}]);
 const after=await call('GET','/api/pricebook/'+owner.id);const invalid=structuredClone(after);invalid.services[0].pricing.mowingBaseRatePerSqft='0.005oops';await call('POST','/api/pricebook/save',invalid,400);assert.deepEqual(await call('GET','/api/pricebook/'+owner.id),after);outcomes.push({name:'invalid rate text rejects save without retaining a false previous-value save',passed:true});
 fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(outcomes,null,2));console.log(JSON.stringify(outcomes.map(({name,expected,response,passed,error})=>({name,expected,actual:response&&[response.lowEstimate,response.midEstimate,response.highEstimate],passed,error})),null,2));assert.ok(outcomes.every(o=>o.passed),'Every independent monetary control must pass');
}finally{await app.stop();}
