import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fixture,secret,at} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {createVoiceSmsService} from '../server/src/voiceSmsService.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {migrateDatabase} from '../server/src/migrations.js';
import {leadFollowUpView} from '../server/src/leadCaptureRepair20261006FollowUp.js';
import {createVoiceHandleStore} from '../server/src/voice/voicePersistence.js';
import {smsFixture} from './ownerAlertsDelivery20261006Fixture.mjs';

async function sms(f,args={}){const lead=await f.tool('captureLead',{notes:'[SYNTHETIC] callback',...args});return {lead,send:()=>f.tool('sendSms',{template:'callback',recordHandle:lead.leadHandle})};}
test('D02: durable SMS accepts once, survives worker restart, and preserves exact message',async t=>{
  const f=smsFixture(t),s=await sms(f),result=await s.send();assert.equal(result.status,'sent');const before=f.rows()[0];assert.equal(before.status,'SENT');assert.match(JSON.parse(before.requestJson).body,/Reply STOP/);
  f.restart();await s.send();await f.smsService().dispatchOnce();assert.equal(f.sends(),1);assert.equal(f.rows().length,1);assert.equal(f.rows()[0].requestJson,before.requestJson);
  assert.equal(f.db.prepare('SELECT status FROM outboxEvents WHERE ownerId=? AND id=?').get(f.c.ownerId,before.id).status,'SENT');
});
test('D05: definite rejection can retry after backoff with same event and no repeated accepted send',async t=>{
  let calls=0,requests=[];const f=smsFixture(t,{provider:{send:async r=>{requests.push(r);if(++calls===1)throw Object.assign(Error('[SYNTHETIC] rejected before acceptance'),{definitive:true});return {status:'SENT',id:'SM'+'b'.repeat(32)};}}}),s=await sms(f);
  assert.equal((await s.send()).status,'pending');assert.equal(f.rows()[0].status,'PENDING');assert.equal((await s.send()).status,'pending');assert.equal(calls,1);
  f.advance(1000);f.restart();assert.equal((await s.send()).status,'sent');await s.send();await f.smsService().dispatchOnce();assert.equal(calls,2);assert.equal(requests[0].idempotencyKey,requests[1].idempotencyKey);assert.equal(requests[0].body,requests[1].body);
  assert.deepEqual(f.db.prepare('SELECT status FROM voiceSmsAttempts WHERE ownerId=? ORDER BY attemptNumber').all(f.c.ownerId).map(r=>r.status),['FAILED','SENT']);
});
test('D05: permanent definitive errors stop at five attempts',async t=>{
  let calls=0;const f=smsFixture(t,{provider:{send:async()=>{calls++;throw Object.assign(Error('SYNTHETIC'),{definitive:true});}}}),s=await sms(f);await s.send();for(const delay of [1000,5000,30000,60000]){f.advance(delay);await f.smsService().dispatchOnce();}assert.equal(calls,5);assert.equal(f.rows()[0].status,'FAILED');await s.send();f.advance(1e7);await f.smsService().dispatchOnce();assert.equal(calls,5);
});
test('D05: uncertain timeout is visible UNKNOWN without duplicate; verified callback reconciles',async t=>{
  let calls=0;const f=smsFixture(t,{timeout:10,provider:{send:async()=>{calls++;return new Promise(()=>{});}}}),s=await sms(f);assert.equal((await s.send()).status,'unavailable');const r=f.rows()[0];assert.equal(r.status,'UNKNOWN');f.advance(1e6);f.restart();await s.send();await f.smsService().dispatchOnce();assert.equal(calls,1);
  const receipt={ownerId:f.c.ownerId,id:r.id,token:r.callbackToken,accountSid:f.c.accountSid,to:f.c.from,from:f.c.to,providerId:'SM'+'c'.repeat(32),status:'DELIVERED'};
  f.smsService().receiveStatus(receipt);f.smsService().receiveStatus(receipt);assert.equal(f.rows()[0].status,'DELIVERED');assert.equal((await s.send()).status,'sent');assert.equal(calls,1);
});
test('D05: expired worker lease is UNKNOWN; process restart never re-POSTs possibly accepted SMS',async t=>{
  const f=smsFixture(t),s=await sms(f);await s.send();const r=f.rows()[0];f.db.prepare("UPDATE voiceSmsDeliveries SET status='DELIVERING',leaseId='synthetic-lease',leaseExpiresAt=0 WHERE ownerId=? AND id=?").run(f.c.ownerId,r.id);f.restart();await f.smsService().dispatchOnce();assert.equal(f.rows()[0].status,'UNKNOWN');await s.send();assert.equal(f.sends(),1);
});
test('D02/D05: concurrent workers claim one SMS and callbacks cannot downgrade final receipts',async t=>{
  let release,calls=0;const f=smsFixture(t,{provider:{send:async()=>{calls++;await new Promise(resolve=>release=resolve);return {status:'QUEUED',id:'SM'+'d'.repeat(32)};}}}),s=await sms(f),pending=s.send();
  while(!release)await new Promise(resolve=>setImmediate(resolve));await f.smsService().dispatchOnce();await s.send();assert.equal(calls,1);release();assert.equal((await pending).status,'pending');
  const r=f.rows()[0],receipt={ownerId:f.c.ownerId,id:r.id,token:r.callbackToken,accountSid:f.c.accountSid,to:f.c.from,from:f.c.to,providerId:'SM'+'d'.repeat(32),status:'DELIVERED'};
  f.smsService().receiveStatus(receipt);for(const status of ['QUEUED','SENT','FAILED','DELIVERED'])f.smsService().receiveStatus({...receipt,status});assert.equal(f.rows()[0].status,'DELIVERED');await s.send();assert.equal(calls,1);
});
test('D02: not configured is BLOCKED with zero attempts and recovers when configured',async t=>{
  let ready=false,calls=0;const f=smsFixture(t,{provider:{ready:()=>ready,send:async()=>({status:'QUEUED',id:'SM'+(++calls).toString(16).padStart(32,'0')})}}),s=await sms(f);assert.equal((await s.send()).status,'unavailable');assert.equal(f.rows()[0].status,'BLOCKED');assert.equal(f.rows()[0].attemptCount,0);ready=true;f.advance(5000);f.restart();await f.smsService().dispatchOnce();assert.equal(f.rows()[0].status,'QUEUED');assert.equal(calls,1);await s.send();assert.equal(calls,1);
});
test('D02: carrier opt-out stays final per message and carrier resubscription permits a new inquiry',async t=>{
  let calls=0,optedOut=true;const f=smsFixture(t,{provider:{send:async()=>{calls++;if(optedOut)throw Object.assign(Error('SYNTHETIC opt out'),{definitive:true,code:'SMS_RECIPIENT_OPTED_OUT'});return {status:'SENT',id:'SM'+'6'.repeat(32)};}}}),first=await sms(f);
  await first.send();assert.equal(f.rows()[0].status,'OPTED_OUT');await first.send();assert.equal(calls,1);
  const second=await sms(f,{inquiryNumber:2});await second.send();assert.equal(f.rows()[1].status,'OPTED_OUT');
  // Only the authoritative provider knows that the caller sent START. A local
  // sticky block must not silently veto that consent on a genuine new inquiry.
  optedOut=false;const third=await sms(f,{inquiryNumber:3});await third.send();assert.equal(f.rows()[2].status,'SENT');assert.equal(calls,3);
  await first.send();assert.equal(f.rows()[0].status,'OPTED_OUT');assert.equal(calls,3);
});

test('D02: SMS insert failure rolls back outbox and prevents a sent acknowledgement',async t=>{
  const f=smsFixture(t),s=await sms(f);f.db.exec("CREATE TRIGGER synthetic_sms_failure BEFORE INSERT ON voiceSmsDeliveries BEGIN SELECT RAISE(ABORT,'SYNTHETIC_DB_FAILURE'); END");await assert.rejects(s.send());assert.equal(f.sends(),0);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM outboxEvents WHERE ownerId=? AND eventType='voice.sms_requested'").get(f.c.ownerId).n,0);
});
test('D02: definitive retry is recoverable after real SQLite close/reopen without a voice handle',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'SYNTHETIC-sms-restart-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let calls=0;
  const f=smsFixture(t,{filename:path.join(dir,'synthetic.sqlite'),provider:{send:async()=>{if(++calls===1)throw Object.assign(Error('SYNTHETIC'),{definitive:true});return {status:'SENT',id:'SM'+'e'.repeat(32)};}}}),s=await sms(f);await s.send();const request=f.rows()[0].requestJson;f.db.close();
  const again=fixture(t,path.join(dir,'synthetic.sqlite')),worker=createVoiceSmsService({database:again.db,ownerQuery:again.ownerQuery,provider:f.provider,clock:()=>Date.parse(at)+1000});await worker.dispatchOnce();assert.equal(calls,2);assert.equal(again.db.prepare('SELECT requestJson FROM voiceSmsDeliveries WHERE ownerId=?').get(f.c.ownerId).requestJson,request);
});
test('D19: saved request and call expose actual state and safe error, for owner/staff only',async t=>{
  const f=smsFixture(t,{provider:{send:async()=>{throw Error('SECRET_PROVIDER_ERROR');}}}),s=await sms(f);await s.send();const lead=f.lead(f.c)[0];
  for(const role of ['owner','staff']){const call=f.service.detail({ownerId:f.c.ownerId,id:f.c.callSid,role}),request=leadFollowUpView(f.ownerQuery,lead,role);assert.equal(call.deliveryActions[0].status,'UNKNOWN');assert.equal(request.deliveryActions[0].status,'UNKNOWN');assert.equal(request.deliveryActions[0].attemptCount,1);assert.doesNotMatch(JSON.stringify(request.deliveryActions),/SECRET|requestJson|callbackToken|handle|body|to/);}
  assert.throws(()=>f.service.detail({ownerId:'synthetic-b',id:f.c.callSid,role:'owner'}));const r=f.rows()[0];assert.throws(()=>f.smsService().state('synthetic-b',r.id));
  const receipt={ownerId:f.c.ownerId,id:r.id,token:r.callbackToken,accountSid:f.c.accountSid,to:f.c.from,from:f.c.to,providerId:'SM'+'f'.repeat(32),status:'SENT'};for(const wrong of [{ownerId:'synthetic-b'},{token:'wrong'},{to:'+19025550999'},{accountSid:'AC'+'b'.repeat(32)},{from:'+19025550999'}])assert.throws(()=>f.smsService().receiveStatus({...receipt,...wrong}));assert.equal(f.rows()[0].status,'UNKNOWN');
});
test('D02: notification outbox mirrors email acceptance/failure without a duplicate historical resend',async t=>{
  const f=fixture(t),c=f.context();await f.voice(c).tool('flagUrgent',{reason:'complaint',summary:'[SYNTHETIC] callback'});
  let sends=0;const worker=createOwnerAlertService({database:f.db,ownerQuery:f.ownerQuery,clock:()=>Date.parse(at),ready:()=>true,environment:{EMAIL_FROM:'synthetic@example.invalid'},send:async()=>({accepted:true,id:'SYNTHETIC-'+(++sends)})});await worker.dispatchOnce();const alert=f.db.prepare("SELECT * FROM ownerAlerts WHERE ownerId=? AND eventType='voice.urgent_flagged'").get(c.ownerId);
  assert.equal(f.db.prepare('SELECT status FROM outboxEvents WHERE ownerId=? AND id=?').get(c.ownerId,alert.aggregateId).status,'ACCEPTED');assert.equal(alert.status,'ACCEPTED');f.db.prepare("UPDATE outboxEvents SET status='PENDING' WHERE ownerId=? AND id=?").run(c.ownerId,alert.aggregateId);migrateDatabase(f.db);await worker.dispatchOnce();assert.equal(sends,2);assert.equal(f.db.prepare('SELECT status FROM outboxEvents WHERE ownerId=? AND id=?').get(c.ownerId,alert.aggregateId).status,'ACCEPTED');
});
test('D02: quote-review, quote, booking and reminder messages use bound historical customer records',async t=>{
  const f=smsFixture(t),review=await f.tool('logQuoteRequest',{description:'[SYNTHETIC] Review needed'});
  await f.tool('sendSms',{template:'callback',recordHandle:review.requestHandle});
  const receipt={resultType:'INSTANT_ESTIMATE_READY',lowEstimate:221.23,highEstimate:221.23,currency:'CAD',priceUnit:'per visit'};
  f.db.prepare("INSERT INTO quotes(id,ownerId,callId,serviceType,resultJson,status,createdAt) VALUES('SYNTHETIC-sms-quote',?,?,'CUSTOM',?,'INSTANT',?)").run(f.c.ownerId,f.c.callSid,JSON.stringify({customerResult:receipt,privateRate:'SECRET_RATE'}),at);
  f.db.prepare("INSERT INTO quoteSubmissions(ownerId,requestId,contentDigest,recordId,resultType,bookRevision,originalSubmissionJson,internalOutcomeJson,customerResponseJson,createdAt) VALUES(?,'SYNTHETIC-sms-submission','SYNTHETIC','SYNTHETIC-sms-quote','INSTANT_ESTIMATE_READY','SYNTHETIC','{}','{}',?,?)").run(f.c.ownerId,JSON.stringify(receipt),at);
  const handles=createVoiceHandleStore({database:f.db,secret,clock:()=>new Date(at)});
  const quote=handles.issue({context:f.c,type:'quote',resourceKey:'SYNTHETIC-sms-quote',reference:{recordId:'SYNTHETIC-sms-quote',requestId:'SYNTHETIC-sms-submission',resultType:'INSTANT_ESTIMATE_READY'},expiresAt:new Date(Date.parse(at)+3600000)});
  await f.tool('sendSms',{template:'quote',recordHandle:quote});
  const customerId=JSON.parse(f.lead(f.c)[0].collectedInputsJson).customerId;
  f.db.prepare("INSERT INTO appointments(id,ownerId,customerId,status,startAtUtc,timezone,customerJson,createdAt) VALUES('SYNTHETIC-sms-appointment',?,?,'CONFIRMED','2026-10-07T13:00:00Z','UTC',?,?)").run(f.c.ownerId,customerId,JSON.stringify({phone:f.c.from}),at);
  const appointment=handles.issue({context:f.c,type:'appointment',resourceKey:'SYNTHETIC-sms-appointment',reference:{appointmentId:'SYNTHETIC-sms-appointment',customerId},expiresAt:new Date(Date.parse(at)+3600000)});
  for(const template of ['booking','reminder'])await f.tool('sendSms',{template,recordHandle:appointment});assert.equal(f.sends(),4);
  const bodies=f.rows().map(r=>JSON.parse(r.requestJson).body);assert.ok(bodies.some(b=>b.includes('221.23')));assert.ok(bodies.some(b=>b.includes('2026-10-07T13:00:00Z')));assert.ok(bodies.every(b=>!b.includes('SECRET_RATE')));
  await assert.rejects(f.tool('sendSms',{template:'booking',recordHandle:quote}));assert.equal(f.sends(),4);assert.equal(JSON.parse(f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=?').get(f.c.ownerId).resultJson).privateRate,'SECRET_RATE');
});
test('D02: quote-review and preference outboxes preserve failure and acceptance state by tenant',async t=>{
  const f=fixture(t),c=f.context();const review=await f.voice(c).tool('logQuoteRequest',{description:'[SYNTHETIC] Quote review'});
  const request=f.db.prepare('SELECT id FROM quoteRequests WHERE ownerId=?').get(c.ownerId);
  f.db.prepare("UPDATE ownerAlerts SET status='FAILED' WHERE ownerId=? AND aggregateId=? AND eventType='quote.requested'").run(c.ownerId,request.id);
  assert.equal(f.db.prepare("SELECT status FROM outboxEvents WHERE ownerId=? AND eventType='voice.quote_request_logged'").get(c.ownerId).status,'FAILED');
  const lead=f.lead(c)[0];f.db.prepare("INSERT INTO bookingIntents(id,ownerId,tokenHash,sourceType,sourceId,serviceId,resultType,status,expiresAtUtc,createdAt) VALUES('SYNTHETIC-preference-intent',?,'SYNTHETIC','lead',?,'SYNTHETIC','ESTIMATE_REQUIRES_REVIEW','OPEN','2026-10-10T00:00:00Z',?)").run(c.ownerId,lead.id,at);
  f.db.prepare("INSERT INTO bookingPreferences(id,ownerId,intentId,preferredWindowsJson,customerJson,locationJson,status,createdAt,updatedAt) VALUES('SYNTHETIC-preference',?,'SYNTHETIC-preference-intent','[]','{}','{}','REQUESTED',?,?)").run(c.ownerId,at,at);
  f.db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,createdAt,updatedAt) VALUES('SYNTHETIC-preference-outbox',?,'booking.preference_requested','SYNTHETIC-preference','{}',?,?)").run(c.ownerId,at,at);
  f.db.prepare("UPDATE ownerAlerts SET status='ACCEPTED' WHERE ownerId=? AND eventType='booking.preference_requested'").run('synthetic-b');assert.equal(f.db.prepare('SELECT status FROM outboxEvents WHERE ownerId=? AND id=?').get(c.ownerId,'SYNTHETIC-preference-outbox').status,'PENDING');
  f.db.prepare("UPDATE ownerAlerts SET status='ACCEPTED' WHERE ownerId=? AND eventType='booking.preference_requested'").run(c.ownerId);assert.equal(f.db.prepare('SELECT status FROM outboxEvents WHERE ownerId=? AND id=?').get(c.ownerId,'SYNTHETIC-preference-outbox').status,'ACCEPTED');
});
test('D20: older unresolved webhooks remain discoverable, paginated, safe and tenant-bound',async t=>{
  const f=fixture(t),w=f.webhook();await w.save('synthetic-a',{url:'https://synthetic.example.invalid/hook',events:['lead.created']});const version=f.db.prepare('SELECT version FROM webhookEndpoints WHERE ownerId=?').get('synthetic-a').version;
  for(let n=0;n<105;n++)f.db.prepare("INSERT INTO webhookDeliveries(id,ownerId,eventType,aggregateId,endpointVersion,payloadJson,status,nextAttemptAt,createdAt,updatedAt) VALUES(?,?,'lead.created',?,?,'{}',?,0,?,?)").run('SYNTHETIC-'+String(n).padStart(3,'0'),'synthetic-a','SYNTHETIC-lead-'+n,version,n===0?'FAILED':'PENDING',new Date(Date.parse(at)+n*1000).toISOString(),at);
  assert.equal(w.getConfiguration('synthetic-a').deliveries.length,20);const first=w.listDeliveries('synthetic-a'),last=w.listDeliveries('synthetic-a',{offset:'100'});assert.equal(first.total,105);assert.equal(first.deliveries.length,50);assert.equal(first.nextOffset,50);assert.equal(last.deliveries.length,5);assert.equal(last.nextOffset,null);assert.ok(last.deliveries.some(d=>d.id==='SYNTHETIC-000'&&d.status==='FAILED'));assert.equal(w.listDeliveries('synthetic-b').total,0);assert.doesNotMatch(JSON.stringify(first),/payloadJson|credentials|secret/);
  for(const query of [{status:'bad'},{offset:'-1'},{offset:['0']},{offset:'1e1'}])assert.throws(()=>w.listDeliveries('synthetic-a',query));
});
