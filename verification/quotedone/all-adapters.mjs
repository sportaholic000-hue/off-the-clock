import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {startApplication} from './application-harness.mjs';import {adapterCases} from './adapter-cases.mjs';
const [root,evidence]=process.argv.slice(2).map(v=>path.resolve(v));
const app=await startApplication(root,evidence,{port:4393});const outcomes=[];
try{
 const owner=await app.owner('all-adapters');
 const call=async(method,url,body,status=200,auth=true,headers={})=>{const r=await app.request(method,url,body,auth?owner.token:null,headers);assert.equal(r.status,status,JSON.stringify(r));return r.result;};
 const meta=await call('GET','/api/pricebook/meta');assert.deepEqual(adapterCases.map(c=>c.serviceType).sort(),meta.services.map(s=>s.serviceType).sort());
 const map=value=>Object.fromEntries(meta.categories.map(k=>[k,value]));
 let book=await call('GET','/api/pricebook/'+owner.id);
 book.defaults={markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:map(true),peakMonths:[],peakSurchargePercent:0};
 book.services=adapterCases.map(entry=>{
   const rules=meta.services.find(s=>s.serviceType===entry.serviceType);entry.customerInputs=structuredClone(entry.customerInputs);const knownOfferings={};
   for(const field of rules.customerFields.filter(f=>f.type==='slug'))if(entry.customerInputs[field.name]!==undefined&&entry.customerInputs[field.name]!=='none'){
    const value=entry.customerInputs[field.name],offeringId=crypto.randomUUID();knownOfferings[field.name]={[value]:offeringId};entry.customerInputs.confirmedFacts={...(entry.customerInputs.confirmedFacts||{}),[field.name]:{field:field.name,value,status:'identified',offeringId}};
   }
   const service={id:crypto.randomUUID(),source:'MANUAL',serviceType:entry.serviceType,service:'Synthetic '+entry.serviceType,active:true,pricing:entry.pricing,knownOfferings,priceBasisByCategory:map('cost'),taxabilityByCategory:map(false),feeRules:Object.fromEntries(meta.feeNames.map(k=>[k,'not_applicable']))};
   if(['ROOFING_REPLACEMENT','INTERIOR_PAINTING','EXTERIOR_PAINTING'].includes(entry.serviceType))service.priceBasisByCategory.material='sell_price';entry.serviceId=service.id;return service;
 });
 fs.writeFileSync(path.join(evidence,'independent-expectations.json'),JSON.stringify(adapterCases,null,2));
 await call('POST','/api/pricebook/save',book);book=await call('GET','/api/pricebook/'+owner.id);
 for(const service of book.services){const response=await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:book.revision,confirmConfiguration:true});book.revision=response.revision;}
 const access=await call('POST','/api/quotedone/access',{allowedOrigins:['http://127.0.0.1:5173']});const url='/api/public/quote/'+access.publicKey,headers={Origin:'http://127.0.0.1:5173'};
 const catalog=await call('GET',url,undefined,200,false,headers);for(const service of book.services){const exposed=catalog.services.find(s=>s.id===service.id);assert.ok(exposed);assert.deepEqual(exposed.knownOfferings,service.knownOfferings);}
 const safeKeys=['resultType','lowEstimate','midEstimate','highEstimate','priceDrivers','disclaimer','quoteId','rangeBufferUsed','options','customerMessage'];
 for(const entry of adapterCases){
  const body={requestId:crypto.randomUUID(),serviceId:entry.serviceId,customerInputs:entry.customerInputs,contact:{name:'Synthetic '+entry.serviceType,email:'customer@example.invalid'},location:'Synthetic project location',serviceRequest:'Synthetic '+entry.serviceType,context:'',explicitUnknowns:[],urgency:'Synthetic normal'};
  const response=await call('POST',url,body,201,false,headers);
  const outcome={serviceType:entry.serviceType,expectedCents:entry.expectedCents,response,passed:false};outcomes.push(outcome);
  try{assert.ok(Object.keys(response).every(k=>safeKeys.includes(k)));assert.equal(response.resultType,entry.expectedCents===null?'ESTIMATE_REQUIRES_REVIEW':'INSTANT_ESTIMATE_READY');if(entry.expectedCents!==null){for(const field of ['lowEstimate','midEstimate','highEstimate'])assert.equal(response[field],entry.expectedCents/100);assert.equal(response.options.length,1);assert.deepEqual(Object.keys(response.options[0]).sort(),['tierName','lowEstimate','midEstimate','highEstimate','priceDrivers','skippedAddons','disclaimer','rangeBufferUsed'].sort());for(const field of ['lowEstimate','midEstimate','highEstimate'])assert.equal(response.options[0][field],entry.expectedCents/100);}else assert.deepEqual(Object.keys(response).sort(),['customerMessage','quoteId','resultType']);
   const negative=structuredClone(body);negative.requestId=crypto.randomUUID();delete negative.customerInputs[entry.requiredMeasurement];const control=await call('POST',url,negative,201,false,headers);assert.equal(control.resultType,'ESTIMATE_REQUIRES_REVIEW');outcome.negative=control;outcome.passed=true;
  }catch(error){outcome.error=error.message;}
 }
 const quotes=await call('GET','/api/quotes'),leads=await call('GET','/api/leads');fs.writeFileSync(path.join(evidence,'quotes.json'),JSON.stringify(quotes,null,2));fs.writeFileSync(path.join(evidence,'leads.json'),JSON.stringify(leads,null,2));
 for(const outcome of outcomes)if(!outcome.passed){const row=leads.leads.find(l=>l.internal.customerResult.quoteId===outcome.response.quoteId);outcome.internalFailure=row?.internal;}
 fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(outcomes,null,2));console.log(JSON.stringify(outcomes.map(({serviceType,expectedCents,response,passed,error})=>({serviceType,expectedCents,resultType:response.resultType,amount:response.midEstimate,passed,error})),null,2));assert.ok(outcomes.every(o=>o.passed),'Every adapter must meet its independent expectation and negative control');
}finally{await app.stop();}
