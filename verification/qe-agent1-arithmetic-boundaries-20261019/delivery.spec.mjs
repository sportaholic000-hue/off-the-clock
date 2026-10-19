import '../../test/pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {randomUUID,createHash} from 'node:crypto';
import {build} from './fixtures.mjs';
import {publish,bridge,date,fixture,quoteEmailFixture,db} from '../../test/quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook} from '../../server/priceBookService.js';
import {submitQuote} from '../../server/src/quoteDoneRoutes.js';
const root=new URL('./',import.meta.url),rows=JSON.parse(fs.readFileSync(new URL('expected-cases-final.json',root)));
const observations=JSON.parse(gunzipSync(fs.readFileSync(new URL('direct-final.json.gz',root)))).results;
const selected=rows.filter(r=>observations.some(x=>x.id===r.id&&!x.passed)||['concrete-square-joint-0046','concrete-square-joint-0048','roof-package-0279','roof-package-0281','roof-footprint-0153','roof-footprint-0155'].includes(r.id));
const cleanup=[],base=fixture({after:fn=>cleanup.push(fn)},process.env.DATABASE_PATH),evidence=[],snapshots=[];
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const privateFree=result=>assert.doesNotMatch(JSON.stringify(result),/"(?:lineItems|pricing|rateCents|priceMetadata|installedLaborPercent|installedMaterialsPercent)"/);
after(()=>{
 for(const snapshot of snapshots){const row=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get('synthetic-a',snapshot.requestId);assert.equal(digest(row),snapshot.hash,'saved receipt must survive later books/quotes');}
 fs.writeFileSync(new URL('delivery-results.json.gz',root),gzipSync(JSON.stringify({source:'abc2becff9cd252a63ff30258e9950a07af2c020',cases:evidence.length,discrepancies:evidence.filter(e=>e.discrepancy).length,bookAndReceiptPreservation:true,rows:evidence},null,2)+'\n'));
 for(const fn of cleanup.reverse())fn();
});
for(const row of selected)test('audit delivery '+row.id,async t=>{
 const f=build(row);delete f.ownerPricing.startingValueAdoptions;const {service}=publish('synthetic-a',f,{roofRuleMode:'new'}),bookBefore=loadPricebook('synthetic-a'),h=quoteEmailFixture(t,{base});
 db.prepare("INSERT OR IGNORE INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run('synthetic-a',service.id,date.quoteInstant);
 const body={requestId:randomUUID(),serviceId:service.id,serviceRequest:service.service,customerInputs:structuredClone(f.customerInputs),customerFeeSelections:{},additionalWork:[],contact:{email:'caller@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
 const prepared=bridge.prepareApplicationIntake('synthetic-a',body,date);assert.equal(prepared.status,'ready',JSON.stringify(prepared));body.intakeConfirmation=prepared.confirmation;
 const response=submitQuote('synthetic-a',body,{clock:()=>new Date(date.quoteInstant)});assert.equal(response.status,201,JSON.stringify(response));assert.equal(response.response.resultType,'INSTANT_ESTIMATE_READY');privateFree(response.response);
 const actual=observations.find(x=>x.id===row.id).actualCents;assert.equal(response.response.midEstimate,actual/100,'saved widget must reproduce direct engine observation');
 const match=await h.tool('matchService',{query:service.service});assert.equal(match.status,'matched',JSON.stringify(match));
 const inputs=structuredClone(f.customerInputs);delete inputs.confirmedFacts;
 const args={serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true,additionalWork:[],productConfirmations:Object.fromEntries(Object.keys(f.customerInputs.confirmedFacts||{}).map(k=>[k,true]))};
 let voice=await h.tool('getQuote',args);
 if(voice.questionContract?.fields.some(field=>field.confirmationToken)){args.scopeConfirmations=Object.fromEntries(voice.questionContract.fields.filter(field=>field.confirmationToken).map(field=>[field.field,field.confirmationToken]));voice=await h.tool('getQuote',args);}
 assert.equal(voice.status,'quoted',JSON.stringify(voice));assert.equal(voice.midEstimate,actual/100,'actual voice tool must reproduce direct engine observation');privateFree(voice);assert.equal(h.sends(),0);
 const saved=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get('synthetic-a',body.requestId);assert.deepEqual(JSON.parse(saved.originalSubmissionJson).customerInputs,f.customerInputs);
 assert.deepEqual(loadPricebook('synthetic-a'),bookBefore,'quote paths must preserve durable owner book and approval');
 const replay=submitQuote('synthetic-a',body,{clock:()=>new Date(date.quoteInstant)});assert.equal(replay.status,200);assert.deepEqual(replay.response,response.response);
 snapshots.push({requestId:body.requestId,hash:digest(saved)});
 evidence.push({id:row.id,params:row.params,expectedCents:row.expected.totalCents,directCents:actual,widgetCents:response.response.midEstimate*100,voiceCents:voice.midEstimate*100,discrepancy:actual!==row.expected.totalCents,bookSha256:digest(bookBefore),receiptSha256:digest(saved),originalCustomerInputs:JSON.parse(saved.originalSubmissionJson).customerInputs,publicWidget:response.response,publicVoice:voice});
});
