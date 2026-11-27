// Neon audit of d712c688 (November 26, 2026), finding 1.
//
// A caller whose number is withheld gives a callback number. The phone quote
// path saved that number on the quote request only. The lead it writes for the
// owner to follow up (a quote that needs review, or a quote with extra
// unpriced work) carried only the caller ID word "anonymous". The owner's
// "New lead" email, the lead.created webhook and the Leads export read the
// lead, so all three said "anonymous" and the callback number was lost to
// them. The Leads export also printed the caller ID for a captured lead whose
// caller had given a different number.
//
// Expected, written before the fix:
//  1. Partial estimate (extra unpriced work), withheld caller, callback
//     +14165550199. The lead keeps callerNumber "anonymous" (it ties the lead
//     to the call) and saves the contact phone +14165550199. The owner email
//     says "Phone: +14165550199", the webhook's phone is +14165550199 and the
//     Leads export's phone is +14165550199. None says "anonymous".
//  2. Quote that needs review (wall surface condition "poor"), withheld
//     caller, callback +14165550177: the same four.
//  3. captureLead from a withheld caller with phone +14165550188: the Leads
//     export says +14165550188 (the email and the webhook already did).
//  4. A caller with a number (+19025550100), partial estimate: all four say
//     +19025550100, as before.
//  5. A website request typed "(506) 555-0123" for a Canadian business keeps
//     +15065550123 in the webhook and in the Leads export, as before.
//  6. A lead written before this fix (no contact on the lead): the owner email
//     and the Leads export read the callback number from the saved quote
//     request.
//  7. A withheld caller who gives no number: the export and the webhook say
//     "anonymous", as before.
//  8. Asking again with the same answers returns the same saved quote and
//     writes no second lead.
//  9. When the same call then logs a quote request for that service, the lead
//     is reused: it keeps the callback number (it used to be overwritten with
//     "anonymous") and no "Callback contact updated" email is raised.
import './pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {bridge,fixture,quoteEmailFixture,publish,at,db} from './quoteDeliveryBatch20261015Fixture.mjs';
import {migrate} from '../server/src/db.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {installOwnerAlertSchema} from '../server/src/ownerAlertSchema.js';
import {csvRows} from '../server/src/integrationData.js';
import {storedLeadView} from '../server/src/ownerRecordViews.js';

const cleanup=[],base=fixture({after:fn=>cleanup.push(fn)},process.env.DATABASE_PATH);
after(()=>{for(const fn of cleanup.reverse())fn();});
const HOOK={url:'https://synthetic.example.invalid/hook',events:['lead.created']};

async function emails(ownerId){
  const sent=[];
  const worker=createOwnerAlertService({database:base.db,ownerQuery:base.ownerQuery,clock:()=>Date.parse(at),ready:()=>true,
    environment:{EMAIL_FROM:'synthetic@example.invalid'},send:async message=>{sent.push(message);return {accepted:true,id:'SYNTHETIC-'+randomUUID()};}});
  for(let pass=0;pass<20;pass++)if(!(await worker.dispatchOnce()).processed)break;
  return leadId=>{
    const row=base.db.prepare("SELECT messageJson FROM ownerAlerts WHERE ownerId=? AND eventType='lead.created' AND aggregateId=?").get(ownerId,leadId);
    return row?.messageJson?JSON.parse(row.messageJson).text:null;
  };
}
const hook=(ownerId,leadId)=>JSON.parse(base.db.prepare("SELECT payloadJson FROM webhookDeliveries WHERE ownerId=? AND eventType='lead.created' AND aggregateId=?").get(ownerId,leadId).payloadJson);
// The export writes an apostrophe before a cell that starts with "+", so a
// spreadsheet does not read the number as a formula. It is removed here.
function exported(ownerId,leadId){
  const line=[...csvRows(base.ownerQuery,ownerId,'leads')].join('').split('\r\n').find(row=>row.startsWith('"'+leadId+'"'));
  assert.ok(line,'the lead is in the Leads export');
  const [id,createdAt,customerName,cell,email,service,type,status]=line.slice(1,-1).split('","');
  if(cell.startsWith('+'))assert.fail('a number starting with + must be written with the leading apostrophe');
  return {id,createdAt,customerName,phone:cell.startsWith("'+")?cell.slice(1):cell,email,service,type,status};
}
const leadOf=context=>base.db.prepare('SELECT * FROM leads WHERE ownerId=? AND callId=? ORDER BY rowid').all(context.ownerId,context.callSid);
let hooked=false;
async function phoneQuote(t,{from,callbackPhone,additionalWork=[],inputs={}}){
  const f=offeringFixture('EXTERIOR_PAINTING','installed');Object.assign(f.customerInputs,inputs);
  const {service}=publish('synthetic-a',f);
  if(!hooked){await base.webhook().save('synthetic-a',HOOK);hooked=true;}
  const context={...base.context(),...(from?{from}:{})};
  base.db.prepare('UPDATE calls SET callerNumber=? WHERE ownerId=? AND id=?').run(context.from,context.ownerId,context.callSid);
  const h=quoteEmailFixture(t,{base,context});
  const match=await h.tool('matchService',{query:service.service});assert.equal(match.status,'matched');
  const args={serviceHandle:match.serviceHandle,customerInputs:f.customerInputs,customerConfirmed:true,additionalWork,...(callbackPhone?{callbackPhone}:{})};
  let result=await h.tool('getQuote',args);
  if(result.questionContract?.fields.some(field=>field.confirmationToken)&&result.status!=='needs_details'){
    args.scopeConfirmations=Object.fromEntries(result.questionContract.fields.filter(field=>field.confirmationToken).map(field=>[field.field,field.confirmationToken]));
    result=await h.tool('getQuote',args);
  }
  return {result,context,h,args};
}
const EXTRA=['[SYNTHETIC] Replace two rotted fence boards'];

test('1: partial estimate from a withheld caller: the callback number reaches the owner email, the webhook and the Leads export',async t=>{
  const {result,context}=await phoneQuote(t,{from:'anonymous',callbackPhone:'+14165550199',additionalWork:EXTRA});
  assert.equal(result.resultType,'PARTIAL_ESTIMATE_READY',JSON.stringify(result).slice(0,300));
  const [lead,...others]=leadOf(context);assert.equal(others.length,0);
  assert.equal(lead.type,'additional_work');assert.equal(lead.callerNumber,'anonymous');
  assert.deepEqual(JSON.parse(lead.collectedInputsJson).contact,{phone:'+14165550199'});
  const text=(await emails(context.ownerId))(lead.id);
  assert.match(text,/^New lead\nPhone: \+14165550199\n/);assert.doesNotMatch(text,/anonymous/);
  const payload=hook(context.ownerId,lead.id);
  assert.equal(payload.phone,'+14165550199');assert.equal(payload.type,'additional_work');assert.equal(payload.status,'NEEDS REVIEW');
  const row=exported(context.ownerId,lead.id);
  assert.equal(row.phone,'+14165550199');assert.equal(row.type,'additional_work');
  // The owner's Leads page already showed it; it still does.
  const submission=base.db.prepare('SELECT originalSubmissionJson FROM quoteSubmissions WHERE ownerId=? AND recordId=?').get(context.ownerId,lead.id);
  const view=storedLeadView(lead,'owner',JSON.parse(submission.originalSubmissionJson));
  assert.equal(view.callerNumber,'+14165550199');assert.equal(view.transportCallerNumber,'anonymous');
  // The saved quote keeps the same contact, so the cancellation export of quotes carries it too.
  const quote=base.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(context.ownerId,lead.id);
  assert.deepEqual(JSON.parse(quote.resultJson).contact,{phone:'+14165550199'});
  // No "Callback contact updated" email is raised for a number that did not change.
  assert.equal(base.db.prepare("SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND eventType='lead.contact_updated' AND aggregateId=?").get(context.ownerId,lead.id).n,0);
});

test('2: a quote that needs review from a withheld caller: the same three channels carry the callback number',async t=>{
  const {result,context}=await phoneQuote(t,{from:'anonymous',callbackPhone:'+14165550177',inputs:{surfaceCondition:'poor'}});
  assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW',JSON.stringify(result).slice(0,300));
  const [lead,...others]=leadOf(context);assert.equal(others.length,0);
  assert.equal(lead.type,'quote_review');assert.equal(lead.callerNumber,'anonymous');
  assert.deepEqual(JSON.parse(lead.collectedInputsJson).contact,{phone:'+14165550177'});
  const text=(await emails(context.ownerId))(lead.id);
  assert.match(text,/^New lead\nPhone: \+14165550177\n/);assert.doesNotMatch(text,/anonymous/);
  assert.equal(hook(context.ownerId,lead.id).phone,'+14165550177');
  assert.equal(exported(context.ownerId,lead.id).phone,'+14165550177');
});

test('3: a captured lead from a withheld caller: the Leads export prints the number the caller gave',async t=>{
  await base.webhook().save('synthetic-a',HOOK);hooked=true;
  const context={...base.context(),from:'anonymous'};
  base.db.prepare('UPDATE calls SET callerNumber=? WHERE ownerId=? AND id=?').run(context.from,context.ownerId,context.callSid);
  const captured=await base.voice(context).tool('captureLead',{name:'[SYNTHETIC] Pat Example',phone:'+14165550188',notes:'[SYNTHETIC] Please call back about a fence'});
  assert.equal(captured.status,'captured_address_required');
  const [lead]=leadOf(context);
  assert.equal(lead.type,'voice_lead');assert.equal(lead.callerNumber,'anonymous');
  assert.equal(exported(context.ownerId,lead.id).phone,'+14165550188');
  assert.equal(hook(context.ownerId,lead.id).phone,'+14165550188');
  assert.match((await emails(context.ownerId))(lead.id),/\nPhone: \+14165550188\n/);
});

test('4: a caller with a number: every channel still shows the caller\'s number',async t=>{
  const {result,context}=await phoneQuote(t,{additionalWork:EXTRA});
  assert.equal(context.from,'+19025550100');assert.equal(result.resultType,'PARTIAL_ESTIMATE_READY');
  const [lead]=leadOf(context);
  assert.equal(lead.callerNumber,'+19025550100');
  assert.deepEqual(JSON.parse(lead.collectedInputsJson).contact,{phone:'+19025550100'});
  assert.match((await emails(context.ownerId))(lead.id),/^New lead\nPhone: \+19025550100\n/);
  assert.equal(hook(context.ownerId,lead.id).phone,'+19025550100');
  assert.equal(exported(context.ownerId,lead.id).phone,'+19025550100');
});

test('5: a website request keeps its stored number in the webhook and the Leads export',async()=>{
  migrate();const owner='synthetic-web-'+randomUUID();
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Web','QuoteDone','active','UTC','owner',?)").run(owner,owner+'@example.invalid',at);
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)").run(owner,at);
  const f=offeringFixture('EXTERIOR_PAINTING','installed'),{service}=publish(owner,f);
  assert.equal(db.prepare('SELECT country FROM businessProfiles WHERE ownerId=?').get(owner).country,'CA');
  db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run(owner,service.id,at);
  await base.webhook().save(owner,HOOK);
  const body={requestId:randomUUID(),serviceId:service.id,serviceRequest:service.service,customerInputs:structuredClone(f.customerInputs),customerFeeSelections:{},additionalWork:EXTRA,
    contact:{phone:'(506) 555-0123'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
  const prepared=bridge.prepareApplicationIntake(owner,body,{timeZone:'UTC',quoteInstant:at});assert.equal(prepared.status,'ready',JSON.stringify(prepared));
  body.intakeConfirmation=prepared.confirmation;
  const saved=submitQuote(owner,body,{clock:()=>new Date(at)});assert.equal(saved.status,201);
  const lead=base.db.prepare('SELECT * FROM leads WHERE ownerId=?').get(owner);
  assert.equal(lead.callId,null);assert.equal(lead.callerNumber,'+15065550123');
  assert.equal(hook(owner,lead.id).phone,'+15065550123');
  assert.equal(exported(owner,lead.id).phone,'+15065550123');
});

test('6: a lead written before this fix: the owner email and the Leads export read the callback number from the saved quote request',async t=>{
  const {context}=await phoneQuote(t,{from:'anonymous',callbackPhone:'+14165550166',inputs:{surfaceCondition:'poor'}});
  const [lead]=leadOf(context);
  // The earlier shape: no contact on the lead. (The contact-correction trigger
  // is set aside for this one hand edit; it is restored at once.)
  base.db.exec('DROP TRIGGER owner_alert_callback_contact_correction');
  base.db.prepare("UPDATE leads SET collectedInputsJson=json_remove(collectedInputsJson,'$.contact') WHERE ownerId=? AND id=?").run(context.ownerId,lead.id);
  installOwnerAlertSchema(base.db);
  assert.equal(JSON.parse(leadOf(context)[0].collectedInputsJson).contact,undefined);
  const text=(await emails(context.ownerId))(lead.id);
  assert.match(text,/^New lead\nPhone: \+14165550166\n/);assert.doesNotMatch(text,/anonymous/);
  assert.equal(exported(context.ownerId,lead.id).phone,'+14165550166');
});

test('7: a withheld caller who gives no number is still shown as given',async t=>{
  await base.webhook().save('synthetic-a',HOOK);hooked=true;
  const context={...base.context(),from:'anonymous'};
  base.db.prepare('UPDATE calls SET callerNumber=? WHERE ownerId=? AND id=?').run(context.from,context.ownerId,context.callSid);
  await base.voice(context).tool('captureLead',{name:'[SYNTHETIC] No Number',notes:'[SYNTHETIC] Will call again'});
  const [lead]=leadOf(context);
  assert.equal(exported(context.ownerId,lead.id).phone,'anonymous');
  assert.equal(hook(context.ownerId,lead.id).phone,'anonymous');
});

test('8: the same request asked again returns the same saved quote and writes no second lead',async t=>{
  const {result,context,h,args}=await phoneQuote(t,{from:'anonymous',callbackPhone:'+14165550155',additionalWork:EXTRA});
  const again=await h.tool('getQuote',args);
  assert.equal(again.resultType,result.resultType);assert.equal(again.quoteNarration,result.quoteNarration);
  assert.equal(leadOf(context).length,1);
  assert.equal(base.db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE ownerId=? AND recordId=?').get(context.ownerId,leadOf(context)[0].id).n,1);
});

test('9: a quote request logged on the same call reuses the lead and keeps the callback number',async t=>{
  const {context,h}=await phoneQuote(t,{from:'anonymous',callbackPhone:'+14165550144',inputs:{surfaceCondition:'poor'}});
  const [lead]=leadOf(context);
  const logged=await h.tool('logQuoteRequest',{description:lead.describedService});
  assert.equal(logged.status,'logged');
  const after=leadOf(context);
  assert.equal(after.length,1);assert.equal(after[0].id,lead.id);
  assert.equal(JSON.parse(after[0].collectedInputsJson).contact.phone,'+14165550144');
  assert.equal(base.db.prepare("SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND eventType='lead.contact_updated' AND aggregateId=?").get(context.ownerId,lead.id).n,0);
  assert.equal(exported(context.ownerId,lead.id).phone,'+14165550144');
});
