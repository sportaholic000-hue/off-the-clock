import './pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {bridge,date,fixture,quoteEmailFixture,db} from './quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook} from '../server/priceBookService.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';
const cleanup=[],base=fixture({after:fn=>cleanup.push(fn)},process.env.DATABASE_PATH);
after(()=>{for(const fn of cleanup.reverse())fn();});
const publicOnly=q=>assert.doesNotMatch(JSON.stringify(q),/"(?:lineItems|pricing|rateCents|installedLaborPercent|installedMaterialsPercent|priceMetadata)"/);
function publishNew(f){
 const service=structuredClone(f.ownerPricing);delete service.origin;
 const draft=bridge.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
 bridge.saveApplicationBook('synthetic-a',{...draft,revision:bridge.readApplicationBook('synthetic-a').revision},date);
 let saved=bridge.readApplicationBook('synthetic-a');saved.services[0].startingValueActions={confirmPaths:Object.keys(saved.services[0].startingValueState||{})};bridge.saveApplicationBook('synthetic-a',saved,date);
 saved=bridge.readApplicationBook('synthetic-a');assert.equal(bridge.bookStatuses(loadPricebook('synthetic-a'),date)[0].approvalCurrent,false);
 bridge.approveApplicationService('synthetic-a',service.id,{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  db.prepare("INSERT OR IGNORE INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run('synthetic-a',service.id,date.quoteInstant);
 const book=loadPricebook('synthetic-a');assert.equal(bridge.bookStatuses(book,date)[0].status,'QUOTING LIVE');return book;
}
const variants=[['walls',false,false,300000],['walls-ceilings',true,false,360000],['walls-trim',false,true,320000],['full-original',true,true,380000],['explicit-matching-trim',true,true,380000]];
for(const [name,ceiling,trim,cents] of variants)test('PI00 newly saved widget and actual voice '+name,async t=>{
 const f=offeringFixture('INTERIOR_PAINTING','installed');if(name==='explicit-matching-trim')Object.assign(f.ownerPricing.pricing.offeringDetails,{trimFinishCoats:2,trimSurfaceCondition:'fair'});
 const book=publishNew(f),service=book.services[0],h=quoteEmailFixture(t,{base});
 const c={...f.customerInputs,ceilingsIncluded:ceiling,trimIncluded:trim,ceilingCoats:2,ceilingSurfaceCondition:'fair',trimCoats:name==='explicit-matching-trim'?2:1,trimSurfaceCondition:name==='explicit-matching-trim'?'fair':'good'};
 if(!ceiling)for(const k of ['ceilingAreaSqft','ceilingCoats','ceilingSurfaceCondition'])delete c[k];
 if(!trim)for(const k of ['trimLengthLF','trimCoats','trimSurfaceCondition'])delete c[k];
 const body={requestId:randomUUID(),serviceId:service.id,serviceRequest:service.service,customerInputs:c,customerFeeSelections:{},additionalWork:[],contact:{email:'caller@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
 const prepared=bridge.prepareApplicationIntake('synthetic-a',body,date);assert.equal(prepared.status,'ready',JSON.stringify(prepared));body.intakeConfirmation=prepared.confirmation;
 const w=submitQuote('synthetic-a',body,{clock:()=>new Date(date.quoteInstant)});assert.equal(w.status,201,JSON.stringify(w));assert.equal(w.response.resultType,'INSTANT_ESTIMATE_READY');assert.equal(w.response.midEstimate,cents/100);publicOnly(w.response);
 const match=await h.tool('matchService',{query:service.service});assert.equal(match.status,'matched',JSON.stringify(match));
 const args={serviceHandle:match.serviceHandle,customerInputs:c,customerConfirmed:true,additionalWork:[]};let v=await h.tool('getQuote',args);
 if(v.questionContract?.fields.some(f=>f.confirmationToken)){args.scopeConfirmations=Object.fromEntries(v.questionContract.fields.filter(f=>f.confirmationToken).map(f=>[f.field,f.confirmationToken]));v=await h.tool('getQuote',args);}
 assert.equal(v.status,'quoted',JSON.stringify(v));assert.equal(v.midEstimate,cents/100);publicOnly(v);assert.equal(h.sends(),0);
 const saved=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get('synthetic-a',body.requestId);assert.deepEqual(JSON.parse(saved.originalSubmissionJson).customerInputs,c);
 assert.deepEqual(loadPricebook('synthetic-a'),book,'quoting preserves approval and every owner setting');
 const repeat=submitQuote('synthetic-a',body);assert.equal(repeat.status,200);assert.deepEqual(repeat.response,w.response);assert.deepEqual(db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get('synthetic-a',body.requestId),saved);
 console.log(JSON.stringify({case:name,widgetCents:cents,voiceCents:cents,originalScopeRetained:true,bookAndApprovalUnchanged:true,providerCalls:0}));
});
for(const kind of ['trim-coats-contradiction','trim-condition-contradiction','missing-trim-price','missing-ceiling-price'])test('PI00 saved widget and actual voice reject '+kind,async t=>{
 const f=offeringFixture('INTERIOR_PAINTING','installed');
 Object.assign(f.ownerPricing.pricing.offeringDetails,{trimFinishCoats:2,trimSurfaceCondition:'fair'});
 if(kind.startsWith('missing-')){
  const rate=kind==='missing-trim-price'?'installedTrimPerLF':'installedCeilingPerSqft';
  delete f.ownerPricing.pricing.offeringRates[rate];delete f.ownerPricing.pricing.installedLaborPercent['offeringRates.'+rate];delete f.ownerPricing.pricing.installedMaterialsPercent['offeringRates.'+rate];
 }
 const book=publishNew(f),service=book.services[0],h=quoteEmailFixture(t,{base});
 const c={...f.customerInputs,ceilingCoats:2,ceilingSurfaceCondition:'fair',trimCoats:kind==='trim-coats-contradiction'?1:2,trimSurfaceCondition:kind==='trim-condition-contradiction'?'poor':'fair'};
 const body={requestId:randomUUID(),serviceId:service.id,serviceRequest:service.service,customerInputs:c,customerFeeSelections:{},additionalWork:[],contact:{email:'caller@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
 const prepared=bridge.prepareApplicationIntake('synthetic-a',body,date);assert.equal(prepared.status,'needs_details');
 const w=submitQuote('synthetic-a',{...body,reviewRequested:true},{clock:()=>new Date(date.quoteInstant)});assert.equal(w.status,201);assert.equal(w.response.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(w.response.midEstimate,undefined);publicOnly(w.response);
 const match=await h.tool('matchService',{query:service.service});assert.equal(match.status,'matched');
 const args={serviceHandle:match.serviceHandle,customerInputs:c,customerConfirmed:true,additionalWork:[]};let v=await h.tool('getQuote',args);
 if(v.questionContract?.fields.some(f=>f.confirmationToken)){args.scopeConfirmations=Object.fromEntries(v.questionContract.fields.filter(f=>f.confirmationToken).map(f=>[f.field,f.confirmationToken]));v=await h.tool('getQuote',args);}
 assert.equal(v.resultType,'ESTIMATE_REQUIRES_REVIEW',JSON.stringify(v));assert.equal(v.midEstimate,undefined);publicOnly(v);
 const saved=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get('synthetic-a',body.requestId);assert.deepEqual(JSON.parse(saved.originalSubmissionJson).customerInputs,c);
 assert.deepEqual(loadPricebook('synthetic-a'),book);assert.equal(h.sends(),0);
});
