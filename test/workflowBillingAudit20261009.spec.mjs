import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownerCallFixture} from './helpers/ownerCallFixture.mjs';
import {createOwnerWorkflowService} from '../server/src/ownerWorkflowService.js';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';
import {bookRevision,approveApplicationService} from '../server/src/quoteDoneBridge.js';
import {concrete} from '../verification/engine-independent/fixtures.mjs';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';
import {accountAccessDecision,trialVoiceCapDecision} from '../server/src/planAccess.js';
import {fixture,A,B,SIGNUP} from './overageMinute20261006Fixture.mjs';

// Money expectations written FIRST in verification/workflow-billing-audit-20261009/EXPECTATIONS.md.
process.env.JWT_SECRET='[SYNTHETIC]-workflow-audit-signing-secret';
const now='2026-10-09T12:00:00.000Z';
async function phoneQuote(t){
  const f=ownerCallFixture();t.after(()=>f.db.close());const ownerId='synthetic-a';
  const ownerQuery=sql=>{assert.match(sql,/\bownerId\b/);return f.db.prepare(sql);};
  const context={ownerId,accountSid:'AC'+'a'.repeat(32),callSid:'CA'+'b'.repeat(32),from:'+19025550100',to:'+19025550101'};
  ownerQuery('UPDATE calls SET accountSid=?,callSid=?,callerNumber=?,destinationNumber=?,status=? WHERE ownerId=? AND id=?').run(context.accountSid,context.callSid,context.from,context.to,'CONNECTED',ownerId,ownerId+'-call');
  const input=concrete();input.ownerPricing.tiers=[];delete input.ownerPricing.origin;
  savePricebook(ownerId,{services:[input.ownerPricing],defaults:{currency:'CAD',...input.businessDefaults,quoteTimeZone:'UTC'}});
  const book=loadPricebook(ownerId);approveApplicationService(ownerId,book.services[0].id,{revision:bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:'UTC',quoteInstant:new Date(now)});
  const runtime=createVoiceToolRuntime({database:f.db,ownerQuery,callContext:context,clock:()=>new Date(now),handleSecret:'[SYNTHETIC]'.padEnd(64,'x')});
  const match=await runtime.handlers.matchService({context,args:{query:input.ownerPricing.service}});
  assert.equal(match.status,'matched',JSON.stringify(match));
  const result=await runtime.handlers.getQuote({context,args:{serviceHandle:match.serviceHandle,customerConfirmed:true,customerInputs:input.customerInputs}});
  assert.equal(result.status,'quoted',JSON.stringify(result));
  assert.deepEqual(result.options.map(o=>[o.lowEstimate,o.highEstimate]),[[3538.89,3538.89]]);
  const row=ownerQuery('SELECT * FROM quotes WHERE ownerId=? AND serviceType=?').get(ownerId,'CONCRETE_PATIO_SLAB');assert.ok(row);
  assert.deepEqual(JSON.parse(row.resultJson).applicationOutcome.customerResult.options.map(o=>o.tierName),[null]);
  const workflow=createOwnerWorkflowService({database:f.db,ownerQuery,clock:()=>new Date(now)});
  const act=(action,extra={})=>workflow.act({ownerId,actorId:ownerId,kind:'quotes',id:row.id,body:{action,version:workflow.view(ownerId,'quotes',row.id).workflow.version,idempotencyKey:randomUUID(),note:'[SYNTHETIC] Outside-app event',attested:true,...extra}});
  return {...f,ownerId,ownerQuery,row,workflow,act};
}
for(const [label,body] of [['omitted',{}],['null',{tierName:null}]])test(`audit 1: real untiered phone quote accepts ${label} tier and invoices 353889 cents`,async t=>{
  const f=await phoneQuote(t);assert.equal(f.act('SENT').status,'SENT');
  const accepted=f.act('ACCEPTED',body);assert.equal(accepted.status,'ACCEPTED');assert.equal(accepted.workflow.history.at(-1).details.tierName,null);
  assert.equal(f.act('INVOICED',{invoiceAmount:'3538.89'}).status,'INVOICED');
  const saved=f.ownerQuery('SELECT resultJson,tierChosen,finalInvoiceAmount FROM quotes WHERE ownerId=? AND id=?').get(f.ownerId,f.row.id);
  assert.equal(saved.tierChosen,null);assert.equal(saved.finalInvoiceAmount,353889);assert.equal(saved.resultJson,f.row.resultJson);
  assert.equal(f.ownerQuery('SELECT COUNT(*) n FROM voiceSmsDeliveries WHERE ownerId=?').get(f.ownerId).n,0);
});
for(const tierName of ['', 'Wrong', 0])test(`audit 1: sole null option rejects mismatching ${JSON.stringify(tierName)}`,async t=>{
  const f=await phoneQuote(t);f.act('SENT');assert.throws(()=>f.act('ACCEPTED',{tierName}),{message:'Select the exact accepted quote option.',statusCode:400});
  assert.equal(f.workflow.view(f.ownerId,'quotes',f.row.id).status,'SENT');
});
for(const names of [['Basic'],['Basic','Plus']])test(`audit 1: ${names.length} named options enforce exact selection and preserve tier`,async t=>{
  const f=await phoneQuote(t),saved=JSON.parse(f.row.resultJson),estimate=saved.applicationOutcome.customerResult;
  estimate.options=names.map(tierName=>({...estimate.options[0],tierName}));
  f.ownerQuery('UPDATE quotes SET resultJson=? WHERE ownerId=? AND id=?').run(JSON.stringify(saved),f.ownerId,f.row.id);f.act('SENT');
  for(const tierName of ['',null,'basic','Missing'])assert.throws(()=>f.act('ACCEPTED',{tierName}),{statusCode:400});
  if(names.length>1)assert.throws(()=>f.act('ACCEPTED'),{statusCode:400});
  const result=f.act('ACCEPTED',names.length===1?{}:{tierName:'Plus'});assert.equal(result.workflow.history.at(-1).details.tierName,names.at(-1));
});

const prefix=i=>'/api/public/bookings/'+i.bookingToken;
const publicPost=(s,i,path,body)=>s.request(prefix(i)+path,{method:'POST',body,publicRequest:true,idempotencyKey:randomUUID()});
function endService(s){s.db.prepare("UPDATE users SET planStatus='canceled',serviceEndsAt=? WHERE id=?").run('2026-10-30T12:00:00.000Z','synthetic-a');assert.equal(accountAccessDecision(s.db.prepare('SELECT * FROM users WHERE id=?').get('synthetic-a'),{now:s.clock()}).allowed,false);}
function records(s){return Object.fromEntries(['bookingHolds','bookingIdempotency','appointments','bookingPreferences','outboxEvents'].map(table=>[table,s.db.prepare(`SELECT * FROM ${table} WHERE ownerId=? ORDER BY rowid`).all('synthetic-a')]));}
async function held(s,i){const slots=await publicPost(s,i,'/availability',s.filters);assert.equal(slots.status,200);const result=await publicPost(s,i,'/holds',{slotId:slots.body.slots[0].slotId});assert.equal(result.status,201);return result.body;}
const confirmation=(s,h)=>({holdId:h.holdId,confirmedSlotId:h.slot.slotId,explicitConfirmation:true,addressConfirmation:true,customer:s.filters.customer,location:s.filters.location});
for(const operation of ['availability','holds','confirm','preference'])test(`audit 2: ended account rejects ${operation} without rows or calendar calls`,{timeout:40000},async t=>{
  const s=await application(t),i=s.intent();let body=s.filters;
  if(operation==='holds'){const r=await publicPost(s,i,'/availability',s.filters);assert.equal(r.status,200);body={slotId:r.body.slots[0].slotId};}
  if(operation==='confirm')body=confirmation(s,await held(s,i));
  if(operation==='preference')body={scopeConfirmation:'UNCHANGED',preferredWindows:[{date:s.date,timeOfDay:'morning'}],customer:s.filters.customer,location:s.filters.location,note:'[SYNTHETIC] Morning'};
  endService(s);s.changeProvider({calls:[]});const before=records(s),response=await publicPost(s,i,'/'+operation,body);
  assert.deepEqual({response,records:records(s),provider:s.provider().calls},{response:{status:403,body:{error:'This business is currently unavailable.',code:'BOOKING_UNAVAILABLE'}},records:before,provider:[]});
});
test('audit 2: active account books; ended account can release a hold',{timeout:40000},async t=>{
  const s=await application(t),i=s.intent(),h=await held(s,i),confirmed=await publicPost(s,i,'/confirm',confirmation(s,h));
  assert.equal(confirmed.status,201,JSON.stringify(confirmed));assert.equal(confirmed.body.status,'CONFIRMED');
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM appointments WHERE ownerId=?').get('synthetic-a').n,1);
  const second=s.intent(),pending=await held(s,second);endService(s);s.changeProvider({calls:[]});
  const release=await s.request(prefix(second)+'/holds/'+pending.holdId,{method:'DELETE',body:{},publicRequest:true,idempotencyKey:randomUUID()});assert.equal(release.status,200);assert.equal(release.body.status,'RELEASED');assert.deepEqual(s.provider().calls,[]);
});
test('audit 2: existing confirmation status remains readable after service ends',{timeout:40000},async t=>{
  const s=await application(t),i=s.intent(),h=await held(s,i);s.changeProvider({mode:'lost-response'});
  const pending=await publicPost(s,i,'/confirm',confirmation(s,h));assert.equal(pending.status,202);
  s.changeProvider({mode:'normal'});const path=prefix(i)+'/confirmations/'+encodeURIComponent(pending.body.confirmationId);
  assert.equal((await s.request(path,{publicRequest:true})).body.status,'CONFIRMED');endService(s);s.changeProvider({calls:[]});
  const status=await s.request(path,{publicRequest:true});assert.equal(status.status,200);assert.equal(status.body.status,'CONFIRMED');assert.deepEqual(s.provider().calls,[]);
});

for(const phase of ['pending','receipts'])test(`audit 3: trial six unconfirmed ten-minute calls ${phase}`,async t=>{
  const f=fixture(t);f.setTime(SIGNUP);f.subscription(A,{status:'trialing',start:SIGNUP});
  const calls=Array.from({length:6},()=>f.call(600,{provider:false}));
  if(phase==='receipts')for(const c of calls){f.meter.providerComplete(c.receipt);f.meter.providerComplete(c.receipt);}
  const count=phase==='receipts'?60:0,view=f.service.snapshot(A),cap=trialVoiceCapDecision(f.db.prepare('SELECT * FROM users WHERE id=?').get(A),{now:f.clock(),minutesUsed:f.meter.minutesUsed(A)});
  assert.deepEqual([view.minutesUsed,view.minutesLeft,view.confirmedMinutesUsed,view.unconfirmedCalls,view.overageCents,view.unchargedCents],[count,60-count,count,phase==='receipts'?0:6,0,0]);
  assert.equal(cap.canStartNewCall,phase==='pending');assert.equal(cap.remainingMinutes,60-count);
  await f.service.processOwner(A);await f.service.processOwner(A);assert.equal(f.fakes.mail.size,phase==='receipts'?2:0);assert.equal(f.fakes.invoices.size,0);assert.deepEqual(view.warnings.map(w=>w.threshold),phase==='receipts'?[30,0]:[]);
});
for(const phase of ['pending','receipts'])test(`audit 3: Operator 300 confirmed plus ten unconfirmed minutes ${phase}`,async t=>{
  const f=fixture(t);f.activate();f.activate(B);for(let n=0;n<30;n++)f.call(600);
  const call=f.call(600,{provider:false});if(phase==='receipts'){f.meter.providerComplete(call.receipt);f.meter.providerComplete(call.receipt);}
  await f.service.processOwner(A);const view=f.service.snapshot(A);
  assert.deepEqual([view.minutesUsed,view.minutesLeft,view.overageCents,view.unchargedCents,view.chargedCents,view.unconfirmedCalls],phase==='receipts'?[310,0,350,350,0,0]:[300,0,0,0,0,1]);
  assert.equal(f.meter.minutesUsed(A),view.minutesUsed);assert.equal(f.service.snapshot(B).minutesUsed,0);assert.equal(f.fakes.invoices.size,0);
  f.setTime('2026-11-20T12:00:00.000Z');await f.service.processOwner(A);await f.service.processOwner(A);
  assert.deepEqual([...f.fakes.items.values()].map(i=>i.amount),phase==='receipts'?[350]:[]);
  if(phase==='pending')assert.deepEqual(f.service.snapshot(A).pendingCharges,[],'unconfirmed calls are not a money debt');
});
test('audit 3: failed receptionist stays zero before and after a signed receipt',async t=>{
  const f=fixture(t);f.activate();const c=f.call(600,{provider:false,fallback:true});
  for(const receipt of [false,true]){if(receipt)f.meter.providerComplete(c.receipt);const v=f.service.snapshot(A);assert.deepEqual([f.meter.minutesUsed(A),v.minutesUsed,v.overageCents,v.unconfirmedCalls],[0,0,0,0]);}
});
test('audit 3: admission meter permits another trial call until durations are confirmed',t=>{
  const f=fixture(t);f.setTime(SIGNUP);f.subscription(A,{status:'trialing',start:SIGNUP});
  const calls=Array.from({length:6},()=>f.call(600,{provider:false}));
  const access=()=>trialVoiceCapDecision(f.db.prepare('SELECT * FROM users WHERE id=?').get(A),{now:f.clock(),minutesUsed:f.meter.minutesUsed(A)});
  assert.equal(access().canStartNewCall,true);assert.equal(access().remainingMinutes,60);
  for(const c of calls)f.meter.providerComplete(c.receipt);
  assert.equal(access().canStartNewCall,false);assert.equal(access().reason,'TRIAL_VOICE_CAP_REACHED');
});
test('audit 3: closed month with only unconfirmed extra calls has no monetary pending charge',async t=>{
  const f=fixture(t);f.activate();f.call(300*60);f.call(600,{provider:false});f.setTime('2026-11-20T12:00:00.000Z');await f.service.processOwner(A);
  assert.deepEqual(f.service.snapshot(A).pendingCharges,[]);assert.equal(f.fakes.invoices.size,0);
});
