import {retainHistoricalStartingValues} from './historicalStartingValuesFixture.mjs';
import './pricebookTestEnv.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {quoteEmailFixture,environment} from './quoteEmailFixture.mjs';
import {fixture,at,secret} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {db,migrate,ownerQuery} from '../server/src/db.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';
import {createQuoteEmailService} from '../server/src/quoteEmailService.js';

process.env.JWT_SECRET='SYNTHETIC_QUOTE_DELIVERY_20261015_NEVER_LIVE';
export {bridge,loadPricebook,quoteEmailFixture,fixture,at,secret,db};
export const date={timeZone:'UTC',quoteInstant:at};
export const notice='Fewer options are available because one or more configured options need owner review.';
export function publish(owner,f,{roofRuleMode='legacy'}={}){
  const service=structuredClone(f.ownerPricing);delete service.origin;
  const draft=bridge.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  bridge.saveApplicationBook(owner,{...draft,revision:bridge.readApplicationBook(owner).revision},date);
  retainHistoricalStartingValues(owner,service);
  if(service.serviceType==='ROOFING_REPLACEMENT'&&roofRuleMode==='legacy'){
    const historical=loadPricebook(owner);historical.services[0].startingValueAdoptions={roofing_replacement_20261016:{mode:'legacy'}};savePricebook(owner,historical);
  }
  if(service.serviceType==='ROOFING_REPLACEMENT'&&roofRuleMode==='new'){
    const current=bridge.readApplicationBook(owner),saved=current.services[0];
    saved.startingValueActions={confirmPaths:Object.keys(saved.startingValueState||{})};
    bridge.saveApplicationBook(owner,{...current,services:[saved],revision:current.revision},date);
  }
  bridge.approveApplicationService(owner,service.id,{revision:bridge.readApplicationBook(owner).revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  const book=loadPricebook(owner);assert.equal(bridge.bookStatuses(book,date)[0].status,'QUOTING LIVE');
  return {book,service:book.services[0],definition:bridge.applicationServiceDefinition(book.services[0])};
}
export function gates(length=1512,count=3,character='G'){
  const f=offeringFixture('FENCING_INSTALL','installed'),p=f.ownerPricing.pricing;
  p.offeringDetails.gates={};p.offeringRates={installedFencePerLF:4000};
  p.installedLaborPercent={'offeringRates.installedFencePerLF':60};p.installedMaterialsPercent={'offeringRates.installedFencePerLF':40};
  f.customerInputs.gates={};
  for(let i=0;i<count;i++){
    const key='walk_'+(i+1),prefix='[SYNTHETIC] gate '+(i+1)+' ',tail=' END_GATE_'+(i+1);
    const fill=character.repeat(Math.ceil(length/character.length)).slice(0,length-prefix.length-tail.length);
    p.offeringDetails.gates[key]={widthLF:4+i,description:prefix+fill+tail,postsAndFootingsIncluded:true};
    p.offeringRates['gate_'+key]=25000;p.installedLaborPercent['offeringRates.gate_'+key]=60;p.installedMaterialsPercent['offeringRates.gate_'+key]=40;
    f.customerInputs.gates[key]=1;
  }
  return f;
}
export function runtime(h,quoteApplication={}){
  const r=createVoiceToolRuntime({database:h.db,callContext:h.c,handleSecret:secret,clock:()=>new Date(at),quoteApplication});
  const dispatch=createVoiceToolDispatcher({handlers:r.handlers,callContext:h.c,idempotencyStore:r.idempotencyStore}).dispatch;
  return {r,tool:(name,args,id=randomUUID())=>dispatch({name,args,toolCallId:id})};
}
export async function phone(h,f,{quoteApplication={},additionalWork=[],applicationOptions={}}={}){
  const a=publish(h.c.ownerId,f,applicationOptions),v=Object.keys(quoteApplication).length?runtime(h,quoteApplication):h;
  const match=await v.tool('matchService',{query:f.ownerPricing.service});assert.equal(match.status,'matched');
  const customerInputs=structuredClone(f.customerInputs);delete customerInputs.confirmedFacts;
  const args={serviceHandle:match.serviceHandle,customerInputs,customerConfirmed:true,additionalWork,
    productConfirmations:Object.fromEntries(Object.keys(f.customerInputs.confirmedFacts||{}).map(key=>[key,true]))};
  let result=await v.tool('getQuote',args);
  if(result.questionContract?.fields.some(field=>field.confirmationToken)){
    args.scopeConfirmations=Object.fromEntries(result.questionContract.fields.filter(field=>field.confirmationToken).map(field=>[field.field,field.confirmationToken]));
    result=await v.tool('getQuote',args);
  }
  return {...v,...a,match,args,result};
}
export function webQuote(f,additionalWork=[],quoteInstant=at,applicationOptions={}){
  migrate();const owner='synthetic-delivery-'+randomUUID();
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Delivery','QuoteDone','active','UTC','owner',?)")
    .run(owner,owner+'@example.invalid',at);
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)").run(owner,at);
  const a=publish(owner,f,applicationOptions);
  db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run(owner,a.service.id,at);
  const body={requestId:randomUUID(),serviceId:a.service.id,serviceRequest:a.service.service,
    customerInputs:structuredClone(f.customerInputs),customerFeeSelections:{},additionalWork,
    contact:{email:'caller@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
  const dateContext={timeZone:'UTC',quoteInstant};
  const prepared=bridge.prepareApplicationIntake(owner,body,dateContext);assert.equal(prepared.status,'ready',JSON.stringify(prepared));
  body.intakeConfirmation=prepared.confirmation;
  const saved=submitQuote(owner,body,{clock:()=>new Date(quoteInstant)});assert.equal(saved.status,201);
  const row=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,body.requestId);
  let sends=0;const messages=new Map(),provider={send:async message=>{const id='SYNTHETIC-'+(++sends);messages.set(id,message);return {accepted:true,id};},read:async id=>{const m=messages.get(id);return {id,to:[m.to],from:m.from,subject:m.subject,last_event:'delivered'};}};
  const email=createQuoteEmailService({database:db,ownerQuery,environment,provider});
  const rows=()=>db.prepare('SELECT * FROM quoteEmailDeliveries WHERE ownerId=?').all(owner);
  return {...a,owner,body,result:saved.response,row,email,rows,sends:()=>sends,submit:()=>submitQuote(owner,body)};
}
export function publicCopy(service,row){
  const message=JSON.parse(row.messageJson),url=new URL(message.text.split('View your saved quote: ')[1]);
  return {message,token:url.pathname.split('/').at(-1),copy:service.publicQuote(row.ownerId,url.pathname.split('/').at(-1))};
}
