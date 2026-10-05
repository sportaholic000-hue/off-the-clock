import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOwnerNumericInput} from '../server/priceBookMoney.js';
import {convertApplicationBook,applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {suggestStarterBook} from '../server/src/priceBookAI.js';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';

test('m1 explicit fixed precision remains available; measured siding rates allow fractional cents',()=>{
 assert.throws(()=>parseOwnerNumericInput('2.555',{kind:'unit_rate',wholeCents:true}),/whole.cent/i);
 assert.equal(parseOwnerNumericInput('2.55',{kind:'unit_rate',wholeCents:true}),2.55);
 assert.equal(parseOwnerNumericInput('0.005',{kind:'unit_rate'}),.005);
 assert.equal(applicationMetadata().services.find(s=>s.serviceType==='SIDING_REPLACEMENT').fields.find(f=>f.field==='laborPerSqft').wholeCents,undefined);
});
for(const location of ['root','nested','tier'])test('m1 '+location+' siding measured rate saves without rounding',()=>{
 const s={serviceType:'SIDING_REPLACEMENT'};
 if(location==='root')s.laborPerSqft={vinyl:2.555};
 if(location==='nested')s.pricing={laborPerSqft:{vinyl:2.555}};
 if(location==='tier')s.tiers=[{name:'Plus',overrides:{laborPerSqft:{vinyl:2.555}}}];
 const b={services:[s],defaults:{}},before=structuredClone(b);
 const stored=convertApplicationBook(b,'toCents').services[0];assert.equal((location==='root'?stored:location==='nested'?stored.pricing:stored.tiers[0].overrides).laborPerSqft.vinyl,255.5);
 assert.deepEqual(b,before);
});
test('m1 previously stored invalid rate remains visible for correction; fractional mowing/custom remain exact',()=>{
 const displayed=convertApplicationBook({services:[{serviceType:'SIDING_REPLACEMENT',pricing:{laborPerSqft:{vinyl:255.5}}}],defaults:{}},'toDollars');
 assert.equal(displayed.services[0].pricing.laborPerSqft.vinyl,2.555);
 displayed.services[0].pricing.laborPerSqft.vinyl=2.55;
 assert.equal(convertApplicationBook(displayed,'toCents').services[0].pricing.laborPerSqft.vinyl,255);
 const supported=convertApplicationBook({services:[{serviceType:'LANDSCAPING_MOWING',pricing:{mowingBaseRatePerSqft:.005}},{serviceType:'CUSTOM',pricing:{unit:'per_sqft',price:.005}}],defaults:{}},'toCents');
 assert.equal(supported.services[0].pricing.mowingBaseRatePerSqft,.5);assert.equal(supported.services[1].pricing.price,.5);
});
const env={GEMINI_API_KEY:'SYNTHETIC-TEST-KEY',PRICEBOOK_GEMINI_MODEL:'synthetic-text-model'};
for(const [country,currency,region] of [['CA','CAD','NS'],['US','USD','MA']])test('m2 starter explicitly uses '+currency+' and the saved regional context',async()=>{
 let sent;const values=[{service:'[SYNTHETIC] Mowing',serviceType:'LANDSCAPING_MOWING',fields:{mowingBaseRatePerSqft:.02}}];
 const result=await suggestStarterBook({industry:'[SYNTHETIC]',serviceTypes:['LANDSCAPING_MOWING'],country,region},{env,fetchImpl:async(_url,init)=>{sent=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(values)}]}}]})};}});
 const data=JSON.parse(sent.contents[0].parts[0].text);
 assert.deepEqual(data.market,{country,region,currency});assert.match(sent.systemInstruction.parts[0].text,/currency/i);
 assert.deepEqual(result,values);
});
test('m2 unknown currency does not trigger an assumed-currency generation',async()=>{
 let requests=0;
 await assert.rejects(suggestStarterBook({industry:'[SYNTHETIC]',serviceTypes:['LANDSCAPING_MOWING']},{env,fetchImpl:async()=>{requests++;throw Error('must not call provider');}}),e=>e.statusCode===422&&/country/i.test(e.message));
 assert.equal(requests,0);
});
for(const [id,key,total,amount,name] of [['siding-removal-itemized','siding_removal',12450,500,'Existing siding removal labor'],['demolition-itemized','demolition',4338.89,600,'Existing slab demolition labor']])test('m3/m4 '+id+' separates scope text and keeps the same price/category',()=>{
 const input=measuredScopeCases().find(c=>c.id===id).input;
 input.ownerPricing.pricing.scopeDetails[key].description='[SYNTHETIC] Explicit scope without terminal punctuation';
 const q=generateQuoteVNext(input);
 assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,total);
 assert.match(q.disclaimer,/without terminal punctuation\. No tax added\./);
 const line=q.lineItems.find(l=>l.name===name);assert.ok(line);assert.equal(line.category,'removal');assert.equal(line.amountCents,amount*100);
 input.ownerPricing.pricing.scopeDetails[key].description+='.';
 assert.doesNotMatch(generateQuoteVNext(input).disclaimer,/punctuation\.\./);
});
