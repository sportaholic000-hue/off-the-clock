import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {startApplication} from './application-harness.mjs';

// Independent contract: 10,000 measured sqft × $0.005/sqft = $50;
// neutral frequency/condition, no fees/markup/tax/range/minimum. Removing only
// yardSqft must produce a saved review lead without a price.
const root=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]);
const app=await startApplication(root,evidence);
try {
 const owner=await app.owner('first-workflow');
 const call=async(method,url,body,status=200,token=owner.token,headers={})=>{const r=await app.request(method,url,body,token,headers);assert.equal(r.status,status,JSON.stringify(r));return r.result;};
 const meta=await call('GET','/api/pricebook/meta');
 let book=await call('GET','/api/pricebook/'+owner.id);
 const categories=meta.categories, serviceId=crypto.randomUUID();
 const map=v=>Object.fromEntries(categories.map(k=>[k,v]));
 book.defaults={markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:map(true),peakMonths:[],peakSurchargePercent:0};
 book.services=[{id:serviceId,serviceType:'LANDSCAPING_MOWING',service:'Synthetic measured mowing',source:'MANUAL',active:true,pricing:{mowingBaseRatePerSqft:0.005,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},overgrowthMultipliers:{maintained:1,overgrown:1,severe:1}},feeRules:Object.fromEntries(meta.feeNames.map(k=>[k,'not_applicable'])),priceBasisByCategory:map('cost'),taxabilityByCategory:map(false)}];
 await call('POST','/api/pricebook/save',book);
 book=await call('GET','/api/pricebook/'+owner.id);
 const access=await call('POST','/api/quotedone/access',{allowedOrigins:['http://127.0.0.1:5173']});
 const quotePath='/api/public/quote/'+access.publicKey, headers={Origin:'http://127.0.0.1:5173'};
 const inputs={yardSqft:10000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false};
 const submission=()=>({requestId:crypto.randomUUID(),serviceId,contact:{email:'customer@example.invalid'},location:'',serviceRequest:'Synthetic measured mowing',explicitUnknowns:[],context:'',customerInputs:inputs});
 const before=await call('POST',quotePath,submission(),201,null,headers);assert.equal(before.resultType,'ESTIMATE_REQUIRES_REVIEW');
 await call('POST','/api/pricebook/services/'+serviceId+'/approve',{revision:book.revision,confirmConfiguration:true});
 book=await call('GET','/api/pricebook/'+owner.id);
 const positive=await call('POST',quotePath,submission(),201,null,headers);
 fs.writeFileSync(path.join(evidence,'positive.json'),JSON.stringify(positive,null,2));
 assert.equal(positive.resultType,'INSTANT_ESTIMATE_READY');
 const quotes=await call('GET','/api/quotes');fs.writeFileSync(path.join(evidence,'quotes.json'),JSON.stringify(quotes,null,2));
 const missing=submission();delete missing.customerInputs.yardSqft;
 const negative=await call('POST',quotePath,missing,201,null,headers);assert.equal(negative.resultType,'ESTIMATE_REQUIRES_REVIEW');
 const leads=await call('GET','/api/leads');assert.equal(leads.leads.length,2);assert.deepEqual(leads.leads.find(l=>l.internal.originalSubmission.requestId===missing.requestId).internal.originalSubmission,missing);
 await app.restart();
 const login=await call('POST','/api/auth/login',{email:owner.email,password:owner.password},200,null);owner.token=login.token;
 assert.deepEqual(await call('GET','/api/pricebook/'+owner.id),book);
 assert.deepEqual(await call('GET','/api/leads'),leads);
 assert.deepEqual(await call('POST',quotePath,missing,200,null,headers),negative);
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({status:'passed',positive,negative,restart:true},null,2));
 console.log(JSON.stringify({status:'passed',positive,negative}));
} finally {await app.stop();}
