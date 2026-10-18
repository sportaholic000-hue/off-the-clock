import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import * as bridge from '../../server/src/quoteDoneBridge.js';
import {savePricebook,loadPricebook} from '../../server/priceBookService.js';
import {db,migrate} from '../../server/src/db.js';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/engine.js';
import {activationScenarios,vNextServiceStatus} from '../../server/quote-engine-vnext/priceBook.js';
const dir=new URL('./',import.meta.url),base=JSON.parse(readFileSync(new URL('fixture.json',dir))),rows=[];
const date={timeZone:'UTC',quoteInstant:'2026-10-18T06:00:00.000Z'};
const clone=structuredClone;
migrate();
function record(row){rows.push(row);writeFileSync(new URL('application-results.json',dir),JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify({id:row.id,status:row.status?.status,approvalCurrent:row.status?.approvalCurrent,direct:row.direct?.resultType,application:row.application?.internalResult?.resultType,customer:row.application?.customerResult?.resultType}));}
function create(f){
  const owner='synthetic-roof-factor-'+randomUUID(),service=clone(f.ownerPricing);
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Roof Factors','QuoteDone','active','UTC','owner',?)").run(owner,owner+'@example.invalid',date.quoteInstant);
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)").run(owner,date.quoteInstant);
  for(const key of ['origin','approvedValues','confirmedFields','quoteDoneApproval','zeroPricePolicy','startingValueState','startingValueAdoptions','dependentLineState'])delete service[key];
  service.service='[SYNTHETIC] Roof factor bounds';service.pricing.unknownPitchBand='up_to_six';
  const draft=bridge.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  const save=bridge.saveApplicationBook(owner,{...draft,revision:bridge.readApplicationBook(owner).revision},date);
  const before=loadPricebook(owner),approval=bridge.approveApplicationService(owner,service.id,{revision:bridge.bookRevision(before),confirmConfiguration:true,confirmLegacySettings:true},date);
  const book=loadPricebook(owner),raw=book.services[0];
  return {owner,save,approval,book,raw};
}
const definitions=[
 ['control',()=>{},'QUOTING LIVE','INSTANT_ESTIMATE_READY'],
 ['story-one-half',f=>{f.ownerPricing.pricing.storyMultiplier[1]=.5;},'QUOTING LIVE','ESTIMATE_REQUIRES_REVIEW'],
 ['shape-simple-half',f=>{f.ownerPricing.pricing.complexityLaborMultiplier.simple=.5;},'QUOTING LIVE','ESTIMATE_REQUIRES_REVIEW'],
 ['both-half',f=>{f.ownerPricing.pricing.storyMultiplier[1]=.5;f.ownerPricing.pricing.complexityLaborMultiplier.simple=.5;},'QUOTING LIVE','ESTIMATE_REQUIRES_REVIEW'],
 ['story-two-half',f=>{f.ownerPricing.pricing.storyMultiplier[2]=.5;f.customerInputs.stories=2;},'QUOTING LIVE','ESTIMATE_REQUIRES_REVIEW'],
 ['shape-moderate-half',f=>{f.ownerPricing.pricing.complexityLaborMultiplier.moderate=.5;f.customerInputs.roofComplexity='moderate';},'QUOTING LIVE','ESTIMATE_REQUIRES_REVIEW'],
 ['all-stories-half',f=>{f.ownerPricing.pricing.storyMultiplier={1:.5,2:.5,3:.5};},'NEEDS PRICING','ESTIMATE_REQUIRES_REVIEW'],
 ['all-shapes-half',f=>{f.ownerPricing.pricing.complexityLaborMultiplier={simple:.5,moderate:.5,complex:.5};},'NEEDS PRICING','ESTIMATE_REQUIRES_REVIEW'],
 ['complex-shape-half-simple-request',f=>{f.ownerPricing.pricing.complexityLaborMultiplier.complex=.5;},'NEEDS PRICING','ESTIMATE_REQUIRES_REVIEW']
];
for(const [id,change,statusExpected,resultExpected] of definitions)test('saved application observation: '+id,()=>{
  const f=clone(base);change(f);const h=create(f);
  const status=bridge.applicationStatus(h.raw,h.book,date);
  const submission={requestId:randomUUID(),serviceId:h.raw.id,serviceRequest:h.raw.service,customerInputs:clone(f.customerInputs),customerFeeSelections:{},additionalWork:[],intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible',contact:{email:'caller@example.invalid'}};
  const application=bridge.calculateApplicationQuote(h.book,h.raw,submission,{ownerId:h.owner,preparingIntake:true,...date});
  const intake=bridge.prepareApplicationIntake(h.owner,submission,date);
  const preview=bridge.previewApplicationQuote(h.owner,{serviceId:h.raw.id,customerInputs:clone(f.customerInputs),customerFeeSelections:{},revision:bridge.bookRevision(h.book)},date);
  // Reuse the real bridge projection; a raw saved row contains application-only
  // receipt/metadata fields that the engine correctly refuses. This comparison
  // explicitly bypasses only service-wide readiness, never a live request.
  const direct=generateQuoteVNext({...application.request,ownerPricing:{...application.request.ownerPricing,active:true}});
  const probes=activationScenarios(h.raw,h.raw,null,null,true,h.book.defaults);
  record({id,save:h.save,approval:h.approval,savedBook:h.book,status,probes,submission,direct,application,intake,preview});
  assert.equal(h.save.success,true);assert.equal(h.approval.success,true);assert.equal(status.approvalCurrent,true);
  assert.equal(status.status,statusExpected);assert.equal(application.internalResult.resultType,resultExpected);
  assert.equal(application.customerResult.resultType,resultExpected);
  assert.equal(preview.resultType,id==='complex-shape-half-simple-request'?'INSTANT_ESTIMATE_READY':resultExpected);
  if(id==='control')assert.equal(direct.lineItems.reduce((s,l)=>s+l.amountCents,0),391000);
  if(id==='complex-shape-half-simple-request')assert.equal(direct.resultType,'INSTANT_ESTIMATE_READY');
  if(id!=='control')assert.equal(intake.status,'needs_details');
});

test('saved receipt content/version checks and explicit reapproval preserve the mathematical defect',()=>{
  const h=create(clone(base)),before=clone(h.raw.quoteDoneApproval),draft=bridge.readApplicationBook(h.owner);
  draft.services[0].pricing.storyMultiplier[1]=.5;
  bridge.saveApplicationBook(h.owner,draft,date);
  let book=loadPricebook(h.owner),raw=book.services[0];
  const afterEdit=bridge.applicationStatus(raw,book,date);
  assert.deepEqual(raw.quoteDoneApproval,before);assert.equal(afterEdit.approvalCurrent,false);
  assert.ok(afterEdit.ownerDiagnostics.some(d=>d.receiptCheck==='contentDigest'));
  bridge.approveApplicationService(h.owner,raw.id,{revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},date);
  book=loadPricebook(h.owner);raw=book.services[0];const reapproved=bridge.applicationStatus(raw,book,date);
  assert.equal(reapproved.approvalCurrent,true);assert.equal(reapproved.status,'QUOTING LIVE');
  const projected=bridge.calculateApplicationQuote(book,raw,{serviceId:raw.id,customerInputs:clone(base.customerInputs),customerFeeSelections:{},additionalWork:[]},{ownerId:h.owner,preparingIntake:true,...date});
  const direct=generateQuoteVNext({...projected.request,ownerPricing:{...projected.request.ownerPricing,active:true}});
  assert.equal(direct.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(direct.invalidOwnerFields,['storyMultiplier.1']);
  const mismatched=clone(book);mismatched.services[0].quoteDoneApproval.engineVersion='SYNTHETIC_DIFFERENT_ENGINE_VERSION';
  const afterVersion=bridge.applicationStatus(mismatched.services[0],mismatched,date);
  assert.equal(afterVersion.approvalCurrent,false);assert.ok(afterVersion.ownerDiagnostics.some(d=>d.receiptCheck==='engineVersion'));
  const control=generateQuoteVNext(clone(base)),oldVersion=clone(control);oldVersion.engineVersion='SYNTHETIC_DIFFERENT_ENGINE_VERSION';
  const oldProjection=sanitizeForCustomerVNext(oldVersion);
  assert.equal(sanitizeForCustomerVNext(control).resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(oldProjection.resultType,'ESTIMATE_REQUIRES_REVIEW');
  record({id:'receipt-content-and-version',before,afterEdit,reapproved,afterVersion,direct,oldVersionProjection:oldProjection,simulationNotice:'Version mismatch is synthetic, not an authentic historical v7 receipt.'});
});
