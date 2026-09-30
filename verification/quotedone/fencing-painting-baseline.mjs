import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {adapterCases} from './adapter-cases.mjs';

// Characterize the preserved source with complete existing inputs and prices.
// The independent positive control is 500*2*($1+$0.30)+200*($1.25+$0.50)=$1650.
// This file asserts current behavior only; review responses are product gaps.
const root=path.resolve(process.argv[2]), evidence=path.resolve(process.argv[3]);
const app=await startApplication(root,evidence,{port:4614});
const results=[];
try {
  const owner=await app.owner('fencing-painting-baseline');
  async function call(method,url,body,status=200,token=owner.token,headers={}) {
    const response=await app.request(method,url,body,token,headers);
    assert.equal(response.status,status,JSON.stringify(response));return response.result;
  }
  const meta=await call('GET','/api/pricebook/meta');
  const map=value=>Object.fromEntries(meta.categories.map(key=>[key,value]));
  let book=await call('GET','/api/pricebook/'+owner.id);
  book.defaults={markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:map(true),peakMonths:[],peakSurchargePercent:0};
  const types=['INTERIOR_PAINTING','EXTERIOR_PAINTING','FENCING_INSTALL','FENCING_REPLACEMENT'];
  const fixtures=types.map(type=>structuredClone(adapterCases.find(entry=>entry.serviceType===type)));
  book.services=fixtures.map(fixture=>{
    fixture.id=crypto.randomUUID();
    const knownOfferings=fixture.serviceType.startsWith('FENCING_')?{fenceType:{wood:crypto.randomUUID()}}:{};
    const basis=map('cost');if(fixture.serviceType.includes('PAINTING'))basis.material='sell_price';
    return {id:fixture.id,serviceType:fixture.serviceType,service:'[SYNTHETIC] '+fixture.serviceType,source:'MANUAL',active:true,pricing:fixture.pricing,knownOfferings,priceBasisByCategory:basis,taxabilityByCategory:map(false),feeRules:Object.fromEntries(meta.feeNames.map(key=>[key,'not_applicable']))};
  });
  await call('POST','/api/pricebook/save',book);book=await call('GET','/api/pricebook/'+owner.id);
  for(const service of book.services) {
    const receipt=await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:book.revision,confirmConfiguration:true});
    book.revision=receipt.revision;
  }
  book=await call('GET','/api/pricebook/'+owner.id);
  const origin='http://127.0.0.1:4615';
  const access=await call('POST','/api/quotedone/access',{allowedOrigins:[origin]});
  const variants=fixtures.flatMap(fixture=>{
    if(fixture.serviceType.includes('PAINTING'))return ['good','fair','poor'].map(surfaceCondition=>({fixture,name:fixture.serviceType+' '+surfaceCondition,inputs:{...fixture.customerInputs,surfaceCondition},expected:fixture.serviceType==='INTERIOR_PAINTING'&&surfaceCondition==='good'?'INSTANT_ESTIMATE_READY':'ESTIMATE_REQUIRES_REVIEW'}));
    return [0,1].map(gateCount=>({fixture,name:fixture.serviceType+' '+gateCount+' gate',inputs:{...fixture.customerInputs,gateCount,...(gateCount?{gateWidthTotalLF:4}:{})},expected:'ESTIMATE_REQUIRES_REVIEW'}));
  });
  for(const {fixture,name,inputs,expected} of variants) {
    const raw=book.services.find(service=>service.id===fixture.id);
    if(raw.knownOfferings?.fenceType) inputs.confirmedFacts={fenceType:{status:'identified',field:'fenceType',value:'wood',offeringId:raw.knownOfferings.fenceType.wood}};
    const base={serviceId:fixture.id,serviceRequest:raw.service,customerInputs:inputs,contact:{email:'synthetic@example.invalid'}};
    const preview=await call('POST','/api/pricebook/preview',{...base,revision:book.revision});
    const authenticated=await call('POST','/api/quote/calculate',{...base,requestId:crypto.randomUUID()},201);
    const publicResult=await call('POST','/api/public/quote/'+access.publicKey,{...base,requestId:crypto.randomUUID()},201,null,{Origin:origin});
    const result={name,inputs,expected,preview,authenticated,publicResult};results.push(result);
    assert.equal(preview.resultType,expected,name+' owner preview');
    assert.equal(authenticated.resultType,expected,name+' authenticated');
    assert.equal(publicResult.resultType,expected,name+' public');
    if(expected==='INSTANT_ESTIMATE_READY') {
      assert.equal(preview.midEstimate,1650);assert.equal(authenticated.midEstimate,1650);assert.equal(publicResult.midEstimate,1650);
    } else {
      assert.equal(preview.midEstimate,undefined);assert.equal(authenticated.midEstimate,undefined);assert.equal(publicResult.midEstimate,undefined);
    }
  }
  const quotes=await call('GET','/api/quotes'),leads=await call('GET','/api/leads');
  fs.writeFileSync(path.join(evidence,'stored-quotes.json'),JSON.stringify(quotes,null,2));
  fs.writeFileSync(path.join(evidence,'stored-leads.json'),JSON.stringify(leads,null,2));
  fs.writeFileSync(path.join(evidence,'saved-book.json'),JSON.stringify(book,null,2));
  assert.equal(quotes.quotes.length,2);assert.equal(leads.leads.length,18);
  console.log(JSON.stringify({characterized:true,quoteCount:quotes.quotes.length,reviewCount:leads.leads.length,results:results.map(({name,expected})=>({name,result:expected}))}));
} finally {
  fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(results,null,2));
  await app.stop();
}
