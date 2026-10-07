import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fixture,secret,at} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {createOwnerAlertService,OWNER_ALERT_SAFE_REPLAY_MS} from '../server/src/ownerAlertService.js';
import {createOwnerAlertEmailSender} from '../server/src/ownerAlertEmail.js';
import {migrateDatabase} from '../server/src/migrations.js';
const words='[SYNTHETIC] Please call after five. The loose gate is by the back door.';
const env={EMAIL_FROM:'alerts@example.invalid',CLIENT_URL:'https://synthetic.example.invalid',ALLOW_PROVIDER_WRITES:'true',EMAIL_PROVIDER:'resend',EMAIL_DELIVERY_ENABLED:'true',RESEND_API_KEY:'SYNTHETIC_KEY'};
function voice(f,c,providers={}){const runtime=createVoiceToolRuntime({database:f.db,callContext:c,handleSecret:secret,clock:()=>new Date(at),providers});const dispatcher=createVoiceToolDispatcher({handlers:runtime.handlers,callContext:c,idempotencyStore:runtime.idempotencyStore});return {runtime,tool:(name,args,id='synthetic-tool-'+Math.random())=>dispatcher.dispatch({name,args,toolCallId:id})};}
function state(f,id){return f.db.prepare('SELECT * FROM ownerAlerts WHERE ownerId=? AND id=?').get('synthetic-a',id);}
function alerts(f){return f.db.prepare('SELECT * FROM ownerAlerts WHERE ownerId=? ORDER BY rowid').all('synthetic-a');}
function count(f,table){return f.db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE ownerId=?').get('synthetic-a').n;}
function sender(){const accepted=new Map(),attempts=[];return {attempts,accepted,send:async message=>{attempts.push(structuredClone(message));const old=accepted.get(message.idempotencyKey);if(old){assert.deepEqual(old.message,message);return old.result;}const result={accepted:true,id:'SYNTHETIC_EMAIL_'+accepted.size};accepted.set(message.idempotencyKey,{message:structuredClone(message),result});return result;}};}
function worker(f,options={}){return createOwnerAlertService({database:f.db,ownerQuery:f.ownerQuery,environment:env,ready:()=>true,...options});}
async function capture(f,c,args={}){return voice(f,c).tool('captureLead',{notes:words,...args});}

for(const failure of ['no_destination','no_provider','no_answer','throws'])test('callback: '+failure+' persists caller words once and owner/staff see them',async t=>{
  const f=fixture(t),c=f.context();let attempts=0;
  if(failure!=='no_destination')f.db.prepare('UPDATE businessProfiles SET existingPhoneNumber=? WHERE ownerId=?').run('+19025550199',c.ownerId);
  const providers=failure==='throws'?{transferCall:async()=>{attempts++;throw Error('SYNTHETIC');}}:failure==='no_answer'?{transferCall:async()=>{attempts++;return {status:'FAILED'};}}:{};
  const v=voice(f,c,providers),args={reason:'caller_requested',customerConfirmed:true,notes:words};
  for(let i=0;i<3;i++){const r=await v.tool('transferCall',args,'synthetic-transfer-'+i);assert.equal(r.callbackSaved,true);assert.match(r.message,/saved/);assert.match(r.message,/notification has not been confirmed/);}
  assert.equal(count(f,'callbackRequests'),1);assert.equal(f.lead(c).length,1);assert.equal(attempts,['throws','no_answer'].includes(failure)?1:0);
  for(const role of ['owner','staff']){const view=f.service.detail({ownerId:c.ownerId,id:c.callSid,role});assert.equal(view.callbackRequests[0].notes,words);assert.equal(view.leads[0].callbackRequests[0].notes,words);assert.equal(view.deliveryActions[0].status,'FAILED');if(role==='staff')assert.equal(view.leads[0].internal,undefined);}
});
test('callback: successful transfer does not invent a callback',async t=>{const f=fixture(t),c=f.context();f.db.prepare('UPDATE businessProfiles SET existingPhoneNumber=? WHERE ownerId=?').run('+19025550199',c.ownerId);const r=await voice(f,c,{transferCall:async()=>({status:'CONNECTED'})}).tool('transferCall',{reason:'caller_requested',customerConfirmed:true,notes:words});assert.equal(r.status,'transferred');assert.equal(count(f,'callbackRequests'),0);});
test('callback: explicit requests, corrections, omitted contact, dismissal and genuine separate requests',async t=>{
  const f=fixture(t),c=f.context(),v=voice(f,c);const args={callbackRequested:true,notes:words,email:'synthetic@example.invalid'};
  const first=await v.tool('captureLead',args,'synthetic-first');await voice(f,c).tool('captureLead',args,'synthetic-restart');
  const lead=f.lead(c)[0];f.db.prepare("UPDATE leads SET status='DISMISSED' WHERE ownerId=? AND id=?").run(c.ownerId,lead.id);
  await v.tool('captureLead',{callbackRequested:true,notes:'[SYNTHETIC] Correction: call after six.',leadHandle:first.leadHandle});
  await v.tool('captureLead',{callbackRequested:true,notes:'[SYNTHETIC] Separate request: garage door.',inquiryNumber:2});
  assert.equal(count(f,'callbackRequests'),2);assert.equal(f.lead(c).length,2);assert.equal(f.lead(c)[0].status,'DISMISSED');assert.equal(JSON.parse(f.lead(c)[0].collectedInputsJson).contact.email,args.email);
  const request=f.db.prepare('SELECT * FROM callbackRequests WHERE ownerId=? AND leadId=?').get(c.ownerId,lead.id);assert.equal(JSON.parse(request.historyJson).length,2);assert.equal(JSON.parse(request.historyJson)[0].notes,words);
  assert.equal(alerts(f).filter(a=>a.eventType==='callback.requested').length,2);assert.equal(alerts(f).filter(a=>a.eventType==='callback.updated').length,1);
});
test('callback: transcript fallback preserves the original retry request and separates numbered requests',async t=>{
  const f=fixture(t),c=f.context();f.db.prepare('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'caller',text:words}]),c.ownerId,c.callSid);
  await voice(f,c).tool('transferCall',{reason:'caller_requested',customerConfirmed:true});
  f.db.prepare('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'caller',text:'[SYNTHETIC] Thank you.'}]),c.ownerId,c.callSid);
  await voice(f,c).tool('transferCall',{reason:'caller_requested',customerConfirmed:true});assert.equal(f.service.detail({ownerId:c.ownerId,id:c.callSid}).callbackRequests[0].notes,words);
  await voice(f,c).tool('transferCall',{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] A separate followup',inquiryNumber:2});assert.equal(count(f,'callbackRequests'),2);
});
test('callback: missing notes reject explicit requests; foreign handles and caller bindings fail closed',async t=>{
  const f=fixture(t),c=f.context(),v=voice(f,c);await assert.rejects(v.tool('captureLead',{callbackRequested:true}));const first=await capture(f,c);
  const other=f.context('synthetic-b');await assert.rejects(voice(f,other).tool('transferCall',{reason:'caller_requested',customerConfirmed:true,notes:words,leadHandle:first.leadHandle}));assert.equal(count(f,'callbackRequests'),0);
});
test('callback: database failure rolls back callback/lead/alert and prevents saved acknowledgement',async t=>{
  const f=fixture(t),c=f.context();f.db.exec("CREATE TRIGGER synthetic_callback_failure BEFORE INSERT ON callbackRequests BEGIN SELECT RAISE(ABORT,'SYNTHETIC_DB_FAILURE'); END");
  await assert.rejects(capture(f,c,{callbackRequested:true}));assert.equal(f.lead(c).length,0);assert.equal(count(f,'ownerAlerts'),0);
  await assert.rejects(voice(f,c).tool('transferCall',{reason:'caller_requested',customerConfirmed:true,notes:words}));assert.equal(f.lead(c).length,0);assert.equal(count(f,'ownerAlerts'),0);
});
test('alerts: new lead, saved quote and callback enqueue atomically and each accepts once',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c,{callbackRequested:true});
  const receipt=JSON.stringify({customerResult:{resultType:'INSTANT_ESTIMATE_READY',lowEstimate:221.23,highEstimate:221.23,currency:'CAD'},privateCost:'SECRET_COST'});
  f.db.prepare("INSERT INTO quotes(id,ownerId,callId,serviceType,resultJson,status,createdAt) VALUES('synthetic-owner-alert-quote',?,?,'CUSTOM',?,'INSTANT',?)").run(c.ownerId,c.callSid,receipt,at);
  const fake=sender(),w=worker(f,{send:fake.send});await w.dispatchOnce();await w.dispatchOnce();assert.equal(fake.accepted.size,3);assert.ok(alerts(f).every(a=>a.status==='ACCEPTED'));assert.equal(count(f,'ownerAlertAttempts'),3);
  assert.ok(fake.attempts.some(a=>a.text.includes(words)));assert.ok(fake.attempts.every(a=>a.to==='synthetic-a@example.invalid'));assert.ok(fake.attempts.every(a=>!a.text.includes('SECRET_COST')));
  assert.equal(f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=?').get(c.ownerId).resultJson,receipt);
  for(const a of alerts(f)){assert.equal(w.retry(c.ownerId,a.id).status,'ACCEPTED');}await w.dispatchOnce();assert.equal(fake.attempts.length,3);
});
test('alerts: an alert insert failure rolls back capture instead of silently saving without its event',async t=>{const f=fixture(t),c=f.context();f.db.exec("CREATE TRIGGER synthetic_alert_failure BEFORE INSERT ON ownerAlerts BEGIN SELECT RAISE(ABORT,'SYNTHETIC_ALERT_FAILURE'); END");await assert.rejects(capture(f,c));assert.equal(f.lead(c).length,0);});
test('alerts: timeout after provider acceptance reuses identical key and message without a duplicate',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c);const fake=sender();let now=Date.parse(at),first=true;
  const w=worker(f,{clock:()=>now,send:async m=>{const r=await fake.send(m);if(first){first=false;throw Error('SYNTHETIC_RESPONSE_LOST');}return r;}});
  await w.dispatchOnce();const row=alerts(f)[0];assert.equal(row.status,'PENDING');assert.equal(row.lastErrorCode,'EMAIL_OUTCOME_UNKNOWN');
  await capture(f,c,{notes:'[SYNTHETIC] Later correction'});now+=1001;await w.dispatchOnce();assert.equal(fake.accepted.size,1);assert.equal(fake.attempts.length,2);assert.equal(state(f,row.id).status,'ACCEPTED');assert.deepEqual(fake.attempts[0],fake.attempts[1]);assert.equal(fake.attempts[1].text.includes('Later correction'),false);
});
test('alerts: missing configuration blocks without a provider call and recovers after configuration',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c);const fake=sender();let configured=false;const w=worker(f,{ready:()=>configured,send:fake.send});await w.dispatchOnce();assert.equal(alerts(f)[0].status,'BLOCKED');assert.equal(fake.attempts.length,0);assert.equal(alerts(f)[0].firstAttemptAt,null);configured=true;await w.dispatchOnce();assert.equal(fake.accepted.size,1);assert.equal(alerts(f)[0].status,'ACCEPTED');
});
test('alerts: definitive provider failures exhaust bounded retries and can be retried without duplicates',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c);let now=Date.parse(at);const fake=sender();let fail=true;
  const w=worker(f,{clock:()=>now,send:async m=>{if(fail)throw Object.assign(Error('SYNTHETIC_REJECTED'),{code:'EMAIL_PROVIDER_REJECTED',definitive:true});return fake.send(m);}});
  for(let n=0;n<8;n++){await w.dispatchOnce();now+=4000000;}const row=alerts(f)[0];assert.equal(row.status,'FAILED');assert.equal(row.attemptCount,8);assert.equal(count(f,'ownerAlertAttempts'),8);fail=false;w.retry(c.ownerId,row.id);await w.dispatchOnce();assert.equal(fake.accepted.size,1);assert.equal(state(f,row.id).status,'ACCEPTED');
});
test('alerts: two workers cannot claim the same live lease',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c);let finish,attempts=0;const one=worker(f,{send:()=>{attempts++;return new Promise(resolve=>finish=resolve);}}),two=worker(f,{send:async()=>{attempts++;return {accepted:true,id:'SYNTHETIC_DUPLICATE'};}});
  const pending=one.dispatchOnce();await two.dispatchOnce();assert.equal(attempts,1);finish({accepted:true,id:'SYNTHETIC_ONE'});await pending;assert.equal(alerts(f)[0].status,'ACCEPTED');
});
test('alerts: ambiguous expired lease replays once, and stale completion cannot overwrite the new result',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c);let now=Date.parse(at),finish;const fake=sender();
  const one=worker(f,{clock:()=>now,send:async m=>{await fake.send(m);return new Promise(resolve=>finish=resolve);}});const pending=one.dispatchOnce();await new Promise(resolve=>setImmediate(resolve));now+=31000;
  await worker(f,{clock:()=>now,send:fake.send}).dispatchOnce();assert.equal(fake.accepted.size,1);assert.equal(alerts(f)[0].status,'ACCEPTED');finish({accepted:true,id:'SYNTHETIC_STALE'});await pending;assert.notEqual(alerts(f)[0].providerId,'SYNTHETIC_STALE');
});
test('alerts: unknown outcomes beyond retention stay visible and do not resend',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c);let now=Date.parse(at),attempts=0;const w=worker(f,{clock:()=>now,send:async()=>{attempts++;throw Error('SYNTHETIC_UNKNOWN');}});await w.dispatchOnce();now+=OWNER_ALERT_SAFE_REPLAY_MS+1;await w.dispatchOnce();const row=alerts(f)[0];assert.equal(row.status,'UNKNOWN');assert.equal(row.lastErrorCode,'DEDUPE_WINDOW_EXPIRED');assert.throws(()=>w.retry(c.ownerId,row.id),e=>e.statusCode===409);assert.equal(attempts,1);
});
test('alerts: changed owner email cannot silently mutate a historical retry payload',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c);let now=Date.parse(at);const fake=sender();const w=worker(f,{clock:()=>now,send:async m=>{await fake.send(m);throw Error('SYNTHETIC_UNKNOWN');}});await w.dispatchOnce();f.db.prepare('UPDATE users SET email=? WHERE id=?').run('new-owner@example.invalid',c.ownerId);now+=1001;await w.dispatchOnce();assert.equal(alerts(f)[0].status,'BLOCKED');assert.equal(alerts(f)[0].lastErrorCode,'OWNER_EMAIL_CHANGED');assert.equal(fake.accepted.size,1);
});
test('alerts: finite timeout bounds stalled provider and does not claim sent',async t=>{const f=fixture(t),c=f.context();await capture(f,c);await worker(f,{providerTimeoutMs:10,send:()=>new Promise(()=>{})}).dispatchOnce();assert.equal(alerts(f)[0].status,'PENDING');assert.equal(alerts(f)[0].acceptedAt,null);assert.equal(alerts(f)[0].lastErrorCode,'EMAIL_OUTCOME_UNKNOWN');});
test('alerts: urgency, preferred times and completed calls have durable records; upgrade does not double preference alerts',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c);await voice(f,c).tool('flagUrgent',{reason:'flooding',summary:'[SYNTHETIC] Water entering.'});
  f.db.prepare('UPDATE calls SET status=?,outcome=?,completedAt=? WHERE ownerId=? AND id=?').run('COMPLETED','CALL_ENDED',at,c.ownerId,c.callSid);
  assert.ok(alerts(f).some(a=>a.eventType==='voice.urgent_flagged'));assert.ok(alerts(f).some(a=>a.eventType==='call.completed'));
  const before=count(f,'ownerAlerts');migrateDatabase(f.db);assert.equal(count(f,'ownerAlerts'),before);const fake=sender();await worker(f,{send:fake.send}).dispatchOnce();assert.ok(fake.attempts[0].subject.includes('Urgent'));assert.ok(fake.attempts.some(a=>a.text.includes('CALL_ENDED')));
});
test('alerts: tenant-bound list/retry/seen omit message bodies, addresses and private pricing',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c);const fake=sender(),w=worker(f,{send:fake.send});await w.dispatchOnce();const a=alerts(f)[0];assert.throws(()=>w.retry('synthetic-b',a.id),e=>e.statusCode===404);assert.throws(()=>w.seen('synthetic-b',a.id),e=>e.statusCode===404);assert.equal(w.list({ownerId:'synthetic-b'}).alerts.length,0);assert.equal(w.list({ownerId:c.ownerId}).alerts[0].messageJson,undefined);assert.equal(w.seen(c.ownerId,a.id).seen,true);assert.ok(state(f,a.id).seenAt);
});
test('alerts: on-disk callback and failed attempts survive a cold worker restart',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'SYNTHETIC-owner-alert-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'synthetic.sqlite'),f=fixture(t,file),c=f.context();await capture(f,c,{callbackRequested:true});
  let now=Date.parse(at);await worker(f,{clock:()=>now,send:async()=>{throw Error('SYNTHETIC_OUTAGE');}}).dispatchOnce();const keys=alerts(f).map(a=>JSON.parse(a.messageJson).idempotencyKey);f.db.close();const reopened=fixture(t,file);now+=1001;const fake=sender();await worker(reopened,{clock:()=>now,send:fake.send}).dispatchOnce();assert.equal(fake.accepted.size,2);assert.deepEqual(fake.attempts.map(a=>a.idempotencyKey).sort(),keys.sort());assert.equal(count(reopened,'callbackRequests'),1);
});
test('email adapter: fake fetch confirms exact payload/key and disabled config never makes a request',async()=>{
  const requests=[];const send=createOwnerAlertEmailSender({environment:env,fetchClient:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({id:'SYNTHETIC_RESEND'})};}}),message={from:env.EMAIL_FROM,to:'synthetic-a@example.invalid',subject:'[SYNTHETIC] Lead',text:words,idempotencyKey:'owner-alert/synthetic'};
  assert.equal((await send(message)).accepted,true);assert.equal(requests[0].options.headers['Idempotency-Key'],message.idempotencyKey);assert.deepEqual(JSON.parse(requests[0].options.body),{from:message.from,to:[message.to],subject:message.subject,text:message.text});
  await assert.rejects(createOwnerAlertEmailSender({environment:{...env,ALLOW_PROVIDER_WRITES:'false'},fetchClient:async()=>{throw Error('MUST_NOT_CALL');}})(message),e=>e.code==='EMAIL_NOT_CONFIGURED');
});

test('alerts: database failure after provider acceptance replays the frozen message after lease recovery',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c);let now=Date.parse(at),fake=sender();
  f.db.exec("CREATE TRIGGER synthetic_acceptance_save_failure BEFORE UPDATE ON ownerAlerts WHEN NEW.status='ACCEPTED' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_DB_FAILURE'); END");
  await assert.rejects(worker(f,{clock:()=>now,send:fake.send}).dispatchOnce());assert.equal(fake.accepted.size,1);assert.equal(alerts(f)[0].status,'DELIVERING');
  f.db.exec('DROP TRIGGER synthetic_acceptance_save_failure');now+=31000;await worker(f,{clock:()=>now,send:fake.send}).dispatchOnce();assert.equal(fake.accepted.size,1);assert.equal(fake.attempts.length,2);assert.equal(alerts(f)[0].status,'ACCEPTED');
});
test('alerts: preferences survive reinstall with one event and call binding; an explicit callback handle keeps its original inquiry',async t=>{
  const f=fixture(t),c=f.context(),v=voice(f,c);const leadHandle=(await capture(f,c,{callbackRequested:true,inquiryNumber:2})).leadHandle;
  await v.tool('captureLead',{leadHandle,callbackRequested:true,notes:'[SYNTHETIC] Corrected second inquiry.'});assert.equal(count(f,'callbackRequests'),1);const lead=f.lead(c)[0];
  f.db.prepare("INSERT INTO bookingIntents(id,ownerId,tokenHash,sourceType,sourceId,serviceId,resultType,status,expiresAtUtc,createdAt) VALUES('synthetic-alert-pref-intent',?,'SYNTHETIC_PREF','lead',?,'synthetic-service','ESTIMATE_REQUIRES_REVIEW','OPEN','2026-10-10',?)").run(c.ownerId,lead.id,at);
  f.db.prepare("INSERT INTO bookingPreferences(id,ownerId,intentId,preferredWindowsJson,customerJson,locationJson,note,status,createdAt,updatedAt) VALUES('synthetic-alert-preference',?,'synthetic-alert-pref-intent','[]','{}','{}','[SYNTHETIC] After six','REQUESTED',?,?)").run(c.ownerId,at,at);
  f.db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES('synthetic-alert-pref-event',?,'booking.preference_requested','synthetic-alert-preference','{}','PENDING',?,?)").run(c.ownerId,at,at);
  assert.equal(alerts(f).filter(a=>a.eventType==='booking.preference_requested').length,1);migrateDatabase(f.db);const preference=alerts(f).filter(a=>a.eventType==='booking.preference_requested');assert.equal(preference.length,1);assert.equal(preference[0].callId,c.callSid);
});
test('alerts: two independent cold processes use one durable queue and one fake provider acceptance per event',async t=>{
  const {createServer}=await import('node:http'),{spawn}=await import('node:child_process'),{once}=await import('node:events');
  const dir=mkdtempSync(path.join(tmpdir(),'SYNTHETIC-cold-owner-alert-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const filename=path.join(dir,'synthetic.sqlite'),f=fixture(t,filename),c=f.context();await capture(f,c,{callbackRequested:true});
  const accepted=new Map(),requests=[];const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const message=JSON.parse(body);requests.push(message);const old=accepted.get(message.idempotencyKey);if(old)assert.deepEqual(old.message,message);else accepted.set(message.idempotencyKey,{message,result:{accepted:true,id:'SYNTHETIC_'+accepted.size}});await new Promise(resolve=>setTimeout(resolve,40));res.setHeader('content-type','application/json');res.end(JSON.stringify(accepted.get(message.idempotencyKey).result));});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const endpoint='http://127.0.0.1:'+server.address().port;
  async function child(){const p=spawn(process.execPath,['test/ownerAlertRepair20261006Worker.mjs',filename,endpoint,String(Date.parse(at))],{stdio:['ignore','pipe','pipe']});let text='',error='';p.stdout.on('data',c=>text+=c);p.stderr.on('data',c=>error+=c);const [code]=await once(p,'exit');assert.equal(code,0,error);return JSON.parse(text);}
  await Promise.all([child(),child()]);await child();assert.equal(accepted.size,2);assert.equal(requests.length,2);assert.equal(count(f,'callbackRequests'),1);assert.ok(alerts(f).every(a=>a.status==='ACCEPTED'));
});

test('alerts: queued callback corrections preserve each revision words rather than substituting the latest notes',async t=>{
  const f=fixture(t),c=f.context(),v=voice(f,c);const first=await capture(f,c,{callbackRequested:true});await v.tool('captureLead',{leadHandle:first.leadHandle,callbackRequested:true,notes:'[SYNTHETIC] Call after seven instead.'});await v.tool('captureLead',{leadHandle:first.leadHandle,callbackRequested:true,notes:'[SYNTHETIC] Make that eight.'});
  const fake=sender();await worker(f,{send:fake.send}).dispatchOnce();const callback=fake.attempts.filter(a=>a.subject.includes('Callback'));assert.equal(callback.length,3);assert.ok(callback.some(a=>a.text.includes(words)));assert.ok(callback.some(a=>a.text.includes('Call after seven instead.')));assert.ok(callback.some(a=>a.text.includes('Make that eight.')));
});

test('alerts: lifecycle starts one timer and shutdown stops further sends without logging customer details',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c,{callbackRequested:true});let calls=0,release;const log=[];
  const w=worker(f,{send:()=>{calls++;return new Promise(resolve=>release=resolve);}}),stop=w.start({intervalMs:100,onError:code=>log.push(code)});assert.equal(w.start(),stop);await new Promise(resolve=>setImmediate(resolve));const stopped=stop();release({accepted:true,id:'SYNTHETIC_STOPPED'});await stopped;await new Promise(resolve=>setTimeout(resolve,130));assert.equal(calls,1);assert.deepEqual(log,[]);assert.equal(alerts(f).filter(a=>a.status==='ACCEPTED').length,1);assert.equal(alerts(f).filter(a=>a.status==='PENDING').length,1);
});

test('alerts: missing owner email blocks every event without starving later records and recovers each once',async t=>{
  const f=fixture(t),c=f.context();await capture(f,c,{callbackRequested:true});f.db.prepare('UPDATE users SET email=? WHERE id=?').run('SYNTHETIC_INVALID_EMAIL',c.ownerId);
  const fake=sender(),w=worker(f,{send:fake.send});for(let n=0;n<3;n++)await w.dispatchOnce();assert.equal(fake.attempts.length,0);assert.deepEqual(alerts(f).map(a=>a.status),['BLOCKED','BLOCKED']);assert.ok(alerts(f).every(a=>a.lastErrorCode==='OWNER_EMAIL_MISSING'));
  f.db.prepare('UPDATE users SET email=? WHERE id=?').run('synthetic-a@example.invalid',c.ownerId);await w.dispatchOnce();assert.equal(fake.accepted.size,2);assert.ok(alerts(f).every(a=>a.status==='ACCEPTED'));
});
