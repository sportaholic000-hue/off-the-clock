import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mowingFixture,cleanupFixture} from './landscapeLaneB20261016Fixture.mjs';
import {fenceFixture} from './fenceLaneB20261016Fixture.mjs';
import {quoteEmailFixture,phone,webQuote,publicCopy,publish,bridge,date} from './quoteDeliveryBatch20261015Fixture.mjs';
import {voiceQuestionContract,bindVoiceQuoteInputs} from '../server/src/voice/voiceQuoteContract.js';
import {SERVICE_TYPES,MEASUREMENT_CONTRACTS} from '../server/quote-engine-vnext/index.js';
import {priceChoices,reviewRows} from '../client/src/pricebookReview.js';

export async function estimatedPhone(h,f){
 const a=publish(h.c.ownerId,f),match=await h.tool('matchService',{query:f.ownerPricing.service});assert.equal(match.status,'matched');
 const customerInputs=structuredClone(f.customerInputs);delete customerInputs.confirmedFacts;
 const args={serviceHandle:match.serviceHandle,customerInputs,customerConfirmed:true,callerMeasurementsEstimated:true,
  productConfirmations:Object.fromEntries(Object.keys(f.customerInputs.confirmedFacts||{}).map(key=>[key,true])),additionalWork:[]};
 let result=await h.tool('getQuote',args);
 if(result.questionContract?.fields.some(f=>f.confirmationToken)){args.scopeConfirmations=Object.fromEntries(result.questionContract.fields.filter(f=>f.confirmationToken).map(f=>[f.field,f.confirmationToken]));result=await h.tool('getQuote',args);}
 return {...a,args,result};
}
test('Oct16 A4 caller-confirmed numeric estimates bind identically across all20 trade contracts; assumption markers select numeric input without inventing amounts',()=>{
 // Expected BEFORE execution: all20 contracts retain caller numbers and no
 // follow-up is manufactured from the estimate flag. This tests binding only;
 // the production fence and mowing cases below assert actual price cents.
 assert.equal(SERVICE_TYPES.length,20);
 for(const type of SERVICE_TYPES){
  const fields=Object.entries(MEASUREMENT_CONTRACTS[type].fields).map(([name,field])=>({name,...field}));
  const numeric=Object.fromEntries(fields.filter(f=>f.type==='number').map(f=>[f.name,Math.max(1,f.min||1)]));
  for(const field of fields)if(field.type==='enum'&&(field.values.includes('exact')||field.name==='roofSizeMethod'&&field.values.includes('roof_measured')))numeric[field.name]=field.values.includes('exact')?'exact':'roof_measured';
  const service={...mowingFixture().ownerPricing,serviceType:type},definition={customerFields:fields};
  const plain=bindVoiceQuoteInputs(service,definition,{customerInputs:numeric,customerConfirmed:true});
  const approximate=structuredClone(numeric);for(const field of fields)if(typeof approximate[field.name]==='string'&&(approximate[field.name]==='exact'||approximate[field.name]==='roof_measured'))approximate[field.name]='assumption';
  const bound=bindVoiceQuoteInputs(service,definition,{customerInputs:approximate,customerConfirmed:true,callerMeasurementsEstimated:true});
  assert.deepEqual(bound,plain,type);
 }
});
test('Oct16 follow-up maintained recurring5000 / first7500 cents survive widget intake, phone, stored record, email and public copy',async t=>{
 // Expected BEFORE execution: recurring $50.00; first $75.00, not $75 every visit.
 const f=mowingFixture(),h=quoteEmailFixture(t),p=await phone(h,f),w=webQuote(f);
 for(const q of [p.result,w.result]){assert.equal(q.status||'quoted','quoted');assert.equal(q.midEstimate,50);assert.equal(q.firstVisit.midEstimate,75);assert.equal(q.options[0].firstVisit.midEstimate,75);}
 for(const row of [h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId),w.row]){
  const saved=JSON.parse(row.customerResponseJson);assert.equal(saved.midEstimate,50);assert.equal(saved.firstVisit.midEstimate,75);
  const original=JSON.parse(row.originalSubmissionJson);assert.equal(original.customerInputs.grassCondition,'overgrown');
 }
 assert.match(p.result.quoteNarration,/Recurring: \$50 CAD per visit/);assert.match(p.result.quoteNarration,/First visit: \$75 CAD/);
 w.email.enqueueSavedQuote({ownerId:w.owner,quoteId:w.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
 const {copy,message}=publicCopy(w.email,w.rows()[0]);for(const text of [copy.narration,message.text]){assert.match(text,/Recurring: \$50 CAD per visit/);assert.match(text,/First visit: \$75 CAD/);}
 const prepared=await h.tool('prepareQuoteEmail',{quoteHandle:p.result.quoteHandle,email:'caller@example.invalid'});
 await h.tool('sendQuoteEmail',{emailConfirmationHandle:prepared.emailConfirmationHandle,customerConfirmed:true});
 const delivered=publicCopy(h.emailService(),h.rows()[0]);assert.equal(delivered.copy.narration,p.result.quoteNarration);
});
test('Oct16 follow-up cleanup widget/voice questions are optional and identically permit Not sure; 5 derived loads /60000 disposal cents persist in copy',async t=>{
 // Expected: 10000/2000=5 loads*12000=60000 disposal, plus10000labor=70000.
 const f=cleanupFixture(),h=quoteEmailFixture(t),def=bridge.applicationServiceDefinition(f.ownerPricing),voice=voiceQuestionContract(f.ownerPricing,def).fields;
 for(const [name,label]of [['wasteBags','About how many bags of yard waste?'],['wasteLoads','About how many pickup-truck loads?']]){
  const field=def.customerFields.find(v=>v.name===name),spoken=voice.find(v=>v.field===name);assert.equal(field.label,label);assert.equal(field.required,false);assert.equal(spoken.label,label);assert.equal(spoken.unknownLabel,'Not sure');assert.equal(spoken.unknownAllowed,true);
 }
 Object.assign(f.customerInputs,{wasteBags:'unknown',wasteLoads:'unknown'});const p=await phone(h,f),w=webQuote(f);
 assert.equal(p.result.midEstimate,700);assert.equal(w.result.midEstimate,700);assert.match(p.result.quoteNarration,/load count.*confirmed on site/i);
 w.email.enqueueSavedQuote({ownerId:w.owner,quoteId:w.row.recordId,email:'caller@example.invalid',customerConfirmed:true});assert.match(publicCopy(w.email,w.rows()[0]).copy.narration,/load count.*confirmed on site/i);
});
test('Oct16 follow-up only a bag price configured remains live for stated bags; an unknown quantity requires owner load pricing rather than a false flat subtotal',async t=>{
 // Expected BEFORE execution:12*800=9600 raised to10000disposal minimum;
 // labor10000 gives20000 cents. Unknown amount has no released quote.
 const f=cleanupFixture(),h=quoteEmailFixture(t);delete f.ownerPricing.pricing.disposalPerLoad;for(const row of Object.values(f.ownerPricing.pricing.debrisPricing))delete row.sqftPerLoad;
 f.customerInputs.wasteBags=12;const p=await phone(h,f);assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.equal(p.result.midEstimate,200);
 const inputs=structuredClone(f.customerInputs);inputs.wasteBags='unknown';
 const outcome=bridge.calculateApplicationQuote(p.book,p.service,{customerInputs:inputs,customerFeeSelections:{},additionalWork:[],intakeFlow:'job-details-v1'},{ownerId:p.book.ownerId,preparingIntake:true,...date});
 assert.equal(outcome.customerResult.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(outcome.customerResult.midEstimate,undefined);assert.ok(outcome.internalResult.missingOwnerFields.includes('disposalPerLoad'));
});
test('Oct16 follow-up new optional landscape prices round-trip through owner dollars and review with coverage left in square feet',()=>{
 // Expected: 4000 visit cents ->$40; bag800->$8; load12000->$120;
 // load coverage2000 stays2000 sq ft, not $2000 or200000.
 const f=cleanupFixture(),service=bridge.convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars').services[0];
 assert.equal(service.pricing.disposalPerBag,8);assert.equal(service.pricing.disposalPerLoad,120);assert.equal(service.pricing.debrisPricing.heavy.sqftPerLoad,2000);
 const meta=bridge.applicationMetadata().services.find(s=>s.serviceType==='LANDSCAPING_CLEANUP');
 const rows=reviewRows(service,{},meta);assert.ok(rows.some(r=>/disposal charge/i.test(r.label)&&r.value==='$100'));assert.ok(rows.some(r=>/per load/i.test(r.label)&&r.value==='2000 sq ft per load'));
 assert.ok(!priceChoices(service,meta).some(r=>r.path.endsWith('sqftPerLoad')));
 const m=mowingFixture();m.ownerPricing.pricing.mowingVisitCharge=4000;const dollars=bridge.convertApplicationBook({services:[m.ownerPricing],defaults:m.businessDefaults},'toDollars');assert.equal(dollars.services[0].pricing.mowingVisitCharge,40);assert.equal(bridge.convertApplicationBook(dollars,'toCents').services[0].pricing.mowingVisitCharge,4000);
});
test('Oct16 A4 estimated phone fence sections10/26/33 at8ft quote280800 cents and recap plain runs with on-site confirmation in email/public copy',async t=>{
 // Expected BEFORE execution: 69LF; S4 =>3+7+9+1=20 posts (4 terminal16line).
 // labor69000 + infill151800 + posts40000 + footlabor8000 + footmat12000 =280800.
 const f=fenceFixture(),h=quoteEmailFixture(t);for(const key of ['linearFeet','lfMethod','cornerCount','gates'])delete f.customerInputs[key];
 Object.assign(f.customerInputs,{fenceHeight:8,fenceRunCount:1,fenceRuns:[{closed:false,sections:[{lengthLF:10},{lengthLF:26},{lengthLF:33}]}]});
 const p=await estimatedPhone(h,f);assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.equal(p.result.midEstimate,2808);
 const line='This price is based on the measurements you gave us. The business will confirm them on site.';
 assert.ok(p.result.quoteNarration.includes(line));assert.match(p.result.quoteNarration,/1 fence run/);assert.match(p.result.quoteNarration,/Run 1: sections of 10 ft, 26 ft and 33 ft; does not connect back/);
 assert.doesNotMatch(p.result.quoteNarration,/Fence measurement method: Exact|How many separate fence runs|Length of each straight section/);
 const prepared=await h.tool('prepareQuoteEmail',{quoteHandle:p.result.quoteHandle,email:'caller@example.invalid'});await h.tool('sendQuoteEmail',{emailConfirmationHandle:prepared.emailConfirmationHandle,customerConfirmed:true});
 const {message,copy}=publicCopy(h.emailService(),h.rows()[0]);for(const text of [message.text,copy.narration]){assert.ok(text.includes(line));assert.match(text,/Run 1: sections of 10 ft, 26 ft and 33 ft; does not connect back/);assert.doesNotMatch(text,/Fence measurement method: Exact/);}
});
test('Oct16 A4 confirmed approximate total69ft with legacy assumption marker uses numeric facts, not a size allowance; fallback283800 cents',async t=>{
 // Expected BEFORE execution: same69LF infill220800 plus21posts*3000=63000 =>283800.
 const f=fenceFixture(),h=quoteEmailFixture(t);Object.assign(f.customerInputs,{fenceHeight:8,linearFeet:69,cornerCount:2,lfMethod:'assumption'});
 const p=await estimatedPhone(h,f);assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.equal(p.result.midEstimate,2838);assert.doesNotMatch(p.result.quoteNarration,/Fence measurement method: Exact/);
});
test('Oct16 A4 the same estimate handling also quotes mowing: approximate10000sqft remains5000 recurring and7500 first cents',async t=>{
 // Expected BEFORE execution: confirmed numerical estimate10000*.5=5000; first*1.5=7500.
 const f=mowingFixture(),h=quoteEmailFixture(t);f.customerInputs.sqftMethod='assumption';const p=await estimatedPhone(h,f);
 assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.equal(p.result.midEstimate,50);assert.equal(p.result.firstVisit.midEstimate,75);assert.ok(p.result.quoteNarration.includes('This price is based on the measurements you gave us. The business will confirm them on site.'));
});
