import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,fakeProviders,A,START} from './overageMinute20261006Fixture.mjs';
import {fixture as leadFixture} from './leadCaptureRepair20261006Fixture.mjs';
import {monthlyAnniversary} from '../server/src/billingUsagePolicy.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {db,ownerQuery} from '../server/src/db.js';
import {migrateDatabase} from '../server/src/migrations.js';
import {saveKnowledgeBase,saveVoice,getBusinessProfile} from '../server/src/onboardingService.js';
import {createOwnerReportService} from '../server/src/ownerReportService.js';
import {transferDecision,normalizeTransferWindows} from '../server/src/voice/voiceSettings.js';
import {validateBusinessHours,businessHoursText} from '../server/src/businessHours.js';
import {speakGreeting} from '../server/src/voicePreviewRoutes.js';

// Fixes for the November 26, 2026 audit of everything outside the quote engine
// and price book. Synthetic owners; Stripe, email and the voice provider are
// fakes. Expected results written before running:
//  Overage charges
//   - A charge whose invoice request is older than 23 hours with no invoice at
//     Stripe: the first pass reads Stripe (invoice list, price, subscription),
//     then nothing is read for the next 59 minutes; the pass at 60 minutes
//     reads again. One create request in total. The owner's line reads
//     "Overage needs manual confirmation; no duplicate charge will be submitted."
//   - The same charge is settled, one invoice and one item, when a matching
//     invoice is later found at Stripe.
//   - A response lost in transit still retries one minute later (unchanged).
//   - An unpaid open invoice: nothing is read for 14 minutes, the pass at 15
//     minutes reads it (4 reads), Stripe's paid event settles it at once, and a
//     failed-payment event makes the next pass read it straight away.
//  Owner alert links
//   - Website quote request, no call: "Quote review requested" and "New lead"
//     both end with /leads?record=<the request id>.
//   - Receptionist setting alert with no call: /settings. Quoting paused with
//     no call: /pricebook.
//  Business hours
//   - 13:00–17:00 entered before 08:00–12:00 saves as 08:00–12:00, 13:00–17:00;
//     the hours text and the transfer windows are in that order.
//   - 12:00–17:00 entered before 08:00–13:00 is refused as an overlap.
//   - 00:00–23:59 every day ("open 24 hours"): a transfer is allowed at
//     23:58:30, 23:59:00, 23:59:30 and 00:00:00, and a call at 23:59:20 counts
//     as during hours in the report.
//   - 08:00–17:00: 16:59 is inside, 17:00 is outside (unchanged).
//  Greeting preview
//   - 5 bytes of audio in two messages (3 + 2) gives a clip with 4 audio bytes.
//   - 1 byte of audio is "No preview audio".
const END=monthlyAnniversary(START,1),MINUTE=60000;
const MANUAL='Overage needs manual confirmation; no duplicate charge will be submitted.';
function counted(fakes){
  const counts={};
  for(const [group,methods] of Object.entries(fakes.stripe))for(const [name,call] of Object.entries(methods))methods[name]=async(...args)=>{counts[group+'.'+name]=(counts[group+'.'+name]||0)+1;return call(...args);};
  return {counts,total:()=>Object.values(counts).reduce((sum,n)=>sum+n,0),reset:()=>{for(const key of Object.keys(counts))counts[key]=0;}};
}
const charge=h=>h.db.prepare('SELECT * FROM billingUsageCharges WHERE ownerId=?').get(A);
function stuck(t){
  const fakes=fakeProviders(),stripe=counted(fakes),h=fixture(t,{fakes});h.activate();h.call(301*60);
  const id=h.service.snapshot(A).periodId;h.setTime(END);fakes.fail('invoice');
  return {fakes,stripe,h,id};
}

test('overage: a charge that needs confirmation is re-read hourly, creates nothing, and tells the owner',async t=>{
  const {fakes,stripe,h,id}=stuck(t);await h.service.chargePeriod(A,id);
  const from=Date.parse(END)+2*86400000;h.setTime(from);stripe.reset();
  assert.equal(await h.service.chargePeriod(A,id),false);
  assert.deepEqual({list:stripe.counts['invoices.list'],price:stripe.counts['prices.retrieve'],subscription:stripe.counts['subscriptions.retrieve'],total:stripe.total()},{list:1,price:1,subscription:1,total:3});
  assert.equal(charge(h).status,'PENDING');assert.equal(charge(h).lastError,'BILLING_OVERAGE_CONFIRMATION_REQUIRED');
  assert.deepEqual(h.service.snapshot(A).pendingCharges.map(row=>row.message),[MANUAL]);
  stripe.reset();
  for(let minute=1;minute<60;minute++){h.setTime(from+minute*MINUTE);assert.equal(await h.service.chargePeriod(A,id),false);}
  assert.equal(stripe.total(),0,'no Stripe read in the 59 minutes after');
  h.setTime(from+60*MINUTE);await h.service.chargePeriod(A,id);assert.equal(stripe.total(),3,'read again at 60 minutes');
  assert.equal(fakes.writes.invoice.length,1);assert.equal(fakes.invoices.size,0);
});

test('overage: a matching invoice found later settles a charge that needed confirmation',async t=>{
  const {fakes,h,id}=stuck(t);await h.service.chargePeriod(A,id);
  const from=Date.parse(END)+2*86400000;h.setTime(from);await h.service.chargePeriod(A,id);
  assert.equal(charge(h).lastError,'BILLING_OVERAGE_CONFIRMATION_REQUIRED');
  fakes.invoices.set('in_SYNTHETIC_found',{id:'in_SYNTHETIC_found',customer:'cus_'+A,status:'draft',subtotal:0,amount_remaining:0,currency:'cad',
    metadata:{otc_usage_period:id,otc_usage_digest:charge(h).usageDigest}});
  h.setTime(from+60*MINUTE);assert.equal(await h.service.chargePeriod(A,id),true);
  assert.equal(charge(h).status,'PAID');assert.equal(charge(h).providerInvoiceId,'in_SYNTHETIC_found');
  assert.equal(fakes.invoices.size,1);assert.equal(fakes.items.size,1);assert.equal([...fakes.items.values()][0].amount,35);
  assert.deepEqual(h.service.snapshot(A).pendingCharges,[]);
});

test('overage: a lost provider response still retries one minute later',async t=>{
  const fakes=fakeProviders(),h=fixture(t,{fakes});h.activate();h.call(301*60);const id=h.service.snapshot(A).periodId;
  h.setTime(END);fakes.fail('invoice','after');await h.service.chargePeriod(A,id);
  assert.equal(charge(h).lastError,'BILLING_PROVIDER_PENDING');
  assert.equal(Date.parse(charge(h).nextAttemptAt)-Date.parse(END),MINUTE);
  h.setTime(Date.parse(END)+MINUTE);assert.equal(await h.service.chargePeriod(A,id),true);assert.equal(charge(h).status,'PAID');
});

test('overage: an unpaid open invoice is re-read every 15 minutes and settled at once by Stripe\'s events',async t=>{
  const fakes=fakeProviders(),finalize=fakes.stripe.invoices.finalizeInvoice;
  fakes.stripe.invoices.finalizeInvoice=async(...args)=>{await finalize(...args);const row=fakes.invoices.get(args[0]);Object.assign(row,{status:'open',amount_remaining:row.subtotal,amount_paid:0,attempted:true});return structuredClone(row);};
  const stripe=counted(fakes),h=fixture(t,{fakes});h.activate();h.call(301*60);const id=h.service.snapshot(A).periodId;
  h.setTime(END);assert.equal(await h.service.chargePeriod(A,id),true);
  assert.equal(charge(h).status,'SUBMITTED');
  assert.deepEqual(h.service.snapshot(A).pendingCharges.map(row=>row.message),['Overage invoice is unpaid. Open Manage billing to resolve payment.']);
  stripe.reset();
  for(let minute=1;minute<15;minute++){h.setTime(Date.parse(END)+minute*MINUTE);assert.equal(await h.service.chargePeriod(A,id),false);}
  assert.equal(stripe.total(),0,'no Stripe read for 14 minutes');
  h.setTime(Date.parse(END)+15*MINUTE);assert.equal(await h.service.chargePeriod(A,id),true);
  assert.equal(stripe.total(),4);assert.equal(stripe.counts['invoices.retrieve'],2);assert.equal(charge(h).status,'SUBMITTED');
  // A failed-payment event asks for an immediate read.
  const invoice=structuredClone(fakes.invoices.get(charge(h).providerInvoiceId));
  h.setTime(Date.parse(END)+16*MINUTE);stripe.reset();
  assert.equal(h.service.applyInvoiceEvent({type:'invoice.payment_failed',created:Math.floor(h.clock().getTime()/1000),data:{object:invoice}}),true);
  assert.equal(await h.service.chargePeriod(A,id),true);assert.equal(stripe.total(),4);
  // The paid event settles it without waiting for a pass.
  assert.equal(h.service.applyInvoiceEvent({type:'invoice.paid',created:Math.floor(h.clock().getTime()/1000),data:{object:{...invoice,status:'paid',amount_remaining:0,amount_paid:invoice.subtotal}}}),true);
  assert.equal(charge(h).status,'PAID');assert.deepEqual(h.service.snapshot(A).pendingCharges,[]);
});

test('owner alerts: a website quote request and no-call receptionist alerts link to the page that holds them',async t=>{
  const f=leadFixture(t),c=f.context(),ownerId=c.ownerId,now=new Date().toISOString(),database=f.db;
  // The statements the website quote route runs for a request that needs review.
  database.prepare('INSERT INTO leads (id,ownerId,customerName,callerNumber,describedService,collectedInputsJson,type,status,createdAt) VALUES (?,?,?,?,?,?,?,?,?)').run('SYNTHETIC-WEB-1',ownerId,'Synthetic Person','+19025550123','Fence repair',JSON.stringify({ownerId}),'quote_review','NEEDS REVIEW',now);
  database.prepare('INSERT INTO quoteRequests (id,ownerId,describedService,estimatedValue,createdAt) VALUES (?,?,?,?,?)').run('SYNTHETIC-WEB-1',ownerId,'Fence repair',null,now);
  for(const [type,id] of [['voice.settings_invalid','synthetic-setting'],['voice.quoting_unavailable','synthetic-quoting']])
    database.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES(?,?,?,?,?,'PENDING',?,?)").run(id,ownerId,type,ownerId,JSON.stringify({message:'[SYNTHETIC] message'}),now,now);
  const sent=[];const worker=createOwnerAlertService({database,ownerQuery:f.ownerQuery,environment:{EMAIL_FROM:'alerts@example.invalid'},ready:()=>true,send:async message=>{sent.push(message);return {accepted:true,id:'SYNTHETIC-'+sent.length};}});
  for(let n=0;n<12;n++)await worker.dispatchOnce();
  const link=subject=>new URL(sent.find(message=>message.subject==='Off The Clock: '+subject).text.split('\n').at(-1).replace('Open saved record: ','')),path=subject=>link(subject).pathname+link(subject).search;
  assert.equal(sent.length,4);
  assert.equal(path('Quote review requested'),'/leads?record=SYNTHETIC-WEB-1');
  assert.equal(path('New lead'),'/leads?record=SYNTHETIC-WEB-1');
  assert.equal(path('Receptionist setting needs correction'),'/settings');
  assert.equal(path('Quoting is paused. Answering remains available.'),'/pricebook');
});

let owners=0;
function hoursOwner(){
  migrateDatabase(db);const id='synthetic-audit-hours-'+(++owners)+'-'+Date.now(),created=new Date().toISOString();
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Fence','Operator','active','UTC','owner',?)").run(id,id+'@example.invalid',created);
  const line=String(2000000+owners*89+Date.now()%900000).slice(-7);
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,existingPhoneNumber,twilioNumber,updatedAt) VALUES(?,'{}',?,?,?)").run(id,'+1902'+line,'+1782'+line,created);
  return id;
}
const knowledge=weeklyHours=>({about:'[SYNTHETIC] Fence installer',services:'',policies:'',faqs:'',prices:'',neverSay:[],reviewContact:{name:'Pat',role:'owner'},fromSettings:true,weeklyHours,hours:''});
const follow={voiceId:'female',agentName:'Synthetic',greeting:'[SYNTHETIC] Thanks for calling.',fromSettings:true,transferNumber:'+19025550188',transferUsesBusinessHours:true};
const week=day=>Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(name=>[name,day]));

test('business hours: rows entered out of order are saved in time order; a real overlap is refused in any order',()=>{
  const afternoonFirst=[{start:'13:00',end:'17:00'},{start:'08:00',end:'12:00'}],ordered=[{start:'08:00',end:'12:00'},{start:'13:00',end:'17:00'}];
  assert.deepEqual(validateBusinessHours({mon:afternoonFirst}).mon,ordered);
  assert.deepEqual(validateBusinessHours({mon:[{start:'12:00',end:'17:00'},{start:'08:00',end:'12:00'}]}).mon,[{start:'08:00',end:'12:00'},{start:'12:00',end:'17:00'}]);
  for(const mon of [[{start:'12:00',end:'17:00'},{start:'08:00',end:'13:00'}],[{start:'08:00',end:'13:00'},{start:'12:00',end:'17:00'}],[{start:'09:00',end:'10:00'},{start:'09:00',end:'10:00'}]])
    assert.throws(()=>validateBusinessHours({mon}),error=>error.statusCode===400&&error.message==='Monday hours must not overlap.');
  const id=hoursOwner();saveKnowledgeBase(id,knowledge({...week([]),mon:afternoonFirst}));saveVoice(id,follow);
  const saved=getBusinessProfile(id).knowledgeBase;
  assert.deepEqual(saved.weeklyHours.mon,ordered);
  assert.equal(saved.hours,'Monday: 8:00 AM to 12:00 PM and 1:00 PM to 5:00 PM. Tuesday to Sunday: closed.');
  assert.deepEqual(normalizeTransferWindows(saved.transferWindows).mon,ordered);
  assert.equal(transferDecision(db,id,new Date('2026-10-05T12:30:00Z')).allowed,false,'Monday lunch');
  assert.equal(transferDecision(db,id,new Date('2026-10-05T13:30:00Z')).allowed,true);
});

test('business hours: a day that closes at 23:59 is open until midnight for transfers and the report',()=>{
  const id=hoursOwner();saveKnowledgeBase(id,knowledge(week([{start:'00:00',end:'23:59'}])));saveVoice(id,follow);
  assert.equal(businessHoursText(getBusinessProfile(id).knowledgeBase.weeklyHours),'Monday to Sunday: open 24 hours.');
  for(const at of ['2026-10-06T23:58:30Z','2026-10-06T23:59:00Z','2026-10-06T23:59:30Z','2026-10-07T00:00:00Z'])assert.equal(transferDecision(db,id,new Date(at)).allowed,true,at);
  for(const [index,at] of ['2026-10-06T12:00:00.000Z','2026-10-06T23:59:20.000Z'].entries())
    db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,minutesBilled,spamFiltered,createdAt) VALUES(?,?,?,?,?,?,'COMPLETED',1,0,?)").run(id+'-call-'+index,id,'CA'+(Date.now().toString(16)+index).padStart(32,'0'),'AC'+'a'.repeat(32),'+19025550100','+17825550141',at);
  const report=createOwnerReportService({ownerQuery,clock:()=>new Date('2026-10-08T00:00:00Z')}).report({ownerId:id,query:{period:'custom',fromDate:'2026-10-01',toDate:'2026-10-07'},role:'owner'});
  assert.deepEqual({count:report.afterHours.count,duringHours:report.afterHours.duringHours,unknown:report.afterHours.unknown},{count:0,duringHours:2,unknown:0});
});

test('business hours: any other closing time still ends on the minute',()=>{
  const id=hoursOwner();saveKnowledgeBase(id,knowledge(week([{start:'08:00',end:'17:00'}])));saveVoice(id,follow);
  assert.equal(transferDecision(db,id,new Date('2026-10-06T16:59:30Z')).allowed,true);
  assert.equal(transferDecision(db,id,new Date('2026-10-06T17:00:00Z')).allowed,false);
  assert.equal(transferDecision(db,id,new Date('2026-10-06T23:59:30Z')).allowed,false);
  for(const [index,at] of ['2026-10-06T16:59:30.000Z','2026-10-06T17:00:00.000Z'].entries())
    db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,minutesBilled,spamFiltered,createdAt) VALUES(?,?,?,?,?,?,'COMPLETED',1,0,?)").run(id+'-call-'+index,id,'CA'+(Date.now().toString(16)+'f'+index).padStart(32,'0'),'AC'+'a'.repeat(32),'+19025550100','+17825550141',at);
  const report=createOwnerReportService({ownerQuery,clock:()=>new Date('2026-10-08T00:00:00Z')}).report({ownerId:id,query:{period:'custom',fromDate:'2026-10-01',toDate:'2026-10-07'},role:'owner'});
  assert.deepEqual({count:report.afterHours.count,duringHours:report.afterHours.duringHours},{count:1,duringHours:1});
});

function previewClient(sizes){
  return {live:{connect:async({callbacks})=>({close(){},sendClientContent(){
    queueMicrotask(()=>sizes.forEach((size,index)=>callbacks.onmessage({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:Buffer.alloc(size,index+1).toString('base64')}}]},...(index===sizes.length-1?{turnComplete:true}:{})}})));
  }})}};
}
test('greeting preview: a clip holds whole samples only',async()=>{
  const options={model:'synthetic-live',voiceName:'Kore',greeting:'[SYNTHETIC] Thanks for calling.',timeoutMs:2000};
  const odd=await speakGreeting({...options,client:previewClient([3,2])});
  assert.equal(odd.readUInt32LE(40),4);assert.equal(odd.length,48);assert.equal(odd.readUInt32LE(4),40);
  assert.deepEqual([...odd.subarray(44)],[1,1,1,2],'a sample split across two messages is kept whole');
  const even=await speakGreeting({...options,client:previewClient([4,2])});
  assert.equal(even.readUInt32LE(40),6);
  await assert.rejects(speakGreeting({...options,client:previewClient([1])}),/No preview audio/);
});
