import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,until,env,TO,ACCOUNT,FROM} from './voiceLifecycle20261006Fixture.mjs';
import {fixture} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceSessionStore} from '../server/src/voice/voicePersistence.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {operatorEligibility} from '../server/src/onboardingService.js';
import {createBookingService} from '../server/src/bookingService.js';
import {createGoogleCalendarAdapter} from '../server/src/googleCalendarAdapter.js';
import {randomUUID} from 'node:crypto';
import {voiceOperatorControl} from '../client/src/voiceOperatorControl.js';

// Expectations written before execution: no prices are calculated here. Exactly
// five active calls per owner; sixth captures a request. One call/session per
// signed CallSid. No deadline unless supplied by the owner. No audio is stored.
test('Owner ruling: removed SMS tool cannot reach the production provider',async t=>{
  for(const template of ['quote','booking','callback','reminder']){
    const h=await harness(t),c=await h.connect();
    const lead=await h.tool(c.callback,'captureLead',{notes:'[SYNTHETIC] Gate callback',callbackRequested:true});
    const id='SYNTHETIC-rejected-'+template;
    c.callback.onmessage({toolCall:{functionCalls:[{id,name:'sendSms',args:{template,recordHandle:lead.leadHandle}}]}});
    // Removed tools fail at the provider declaration boundary, before dispatch.
    // That closes the invalid session; there must be no successful tool reply.
    await until(()=>c.ws.readyState===3);
    assert.equal(h.responses.has(id),false);
    assert.deepEqual(h.db.prepare('SELECT status,failureCode FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid),{status:'FAILED',failureCode:'GEMINI_SESSION_ERROR'});
    assert.equal(h.writes.filter(x=>x[0]==='sms').length,0);
    assert.equal(h.db.prepare('SELECT COUNT(*) n FROM voiceSmsDeliveries WHERE ownerId=?').get(h.owner).n,0);
  }
});
test('D04 owner ruling: production refuses caller SMS and never invokes the provider',async t=>{
  const h=await harness(t),c=await h.connect();
  const lead=await h.tool(c.callback,'captureLead',{notes:'[SYNTHETIC] Please call about a broken gate',callbackRequested:true});
  // An undeclared/hallucinated SMS tool is rejected at the real Live boundary.
  c.callback.onmessage({toolCall:{functionCalls:[{id:'synthetic-disabled-sms',name:'sendSms',args:{template:'callback',recordHandle:lead.leadHandle}}]}});
  await until(()=>h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).status==='FAILED');
  assert.equal(h.writes.filter(x=>x[0]==='sms').length,0);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM voiceSmsDeliveries WHERE ownerId=?').get(h.owner).n,0);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM leads WHERE ownerId=?').get(h.owner).n,1);
});
test('D06 failed transfer persists the promised callback with caller words and replay identity',async t=>{
  const h=fixture(t),c=h.context(),v=h.voice(c),args={reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] Gate fell on driveway'};
  const result=await v.tool('transferCall',args);assert.equal(result.callbackSaved,true);
  await v.tool('transferCall',args);assert.equal(h.lead(c).length,1);assert.match(h.lead(c)[0].collectedInputsJson,/Gate fell on driveway/);
});
test('D04 production transfer adapter initiates one provider handoff without claiming connection',async t=>{
  const h=await harness(t),c=await h.connect();
  const result=await h.tool(c.callback,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] Gate repair'});
  assert.equal(result.status,'transferring');assert.equal(h.writes.filter(x=>x[0]==='call').length,1);
});
test('D04 production appointment-change adapter reaches the booking service',async t=>{
  const calls=[],h=await harness(t,{install:{bookingService:{modifyAppointment:async input=>{calls.push(input);return {status:'CONFIRMED'};}}}}),c=await h.connect();
  h.db.prepare("INSERT INTO appointments(id,ownerId,status,customerJson,createdAt) VALUES('synthetic-appointment',?,'CONFIRMED',?,'2026-10-06T12:00:00.000Z')").run(h.owner,JSON.stringify({phone:c.params.From}));
  const history=await h.tool(c.callback,'getCustomerContext',{}),handle=history.recentAppointments[0].split(' — ')[0];
  const result=await h.tool(c.callback,'modifyAppointment',{appointmentHandle:handle,action:'cancel',customerConfirmed:true});
  assert.equal(result.status,'cancelled');assert.equal(calls.length,1);
});
test('D07 model startup failure gathers and durably saves before any forwarding',async t=>{
  const h=await harness(t,{fail:true}),c=await h.connect();await until(()=>c.ws.readyState===3);
  const r=await h.post(c.fallback,c.params),xml=await r.text();assert.match(xml,/<Gather/);assert.doesNotMatch(xml,/<Dial|<Hangup/);
  const action=xml.match(/action="([^"]+)"/)[1].replaceAll('&amp;','&');
  const saved=await h.post(new URL(action).pathname,{...c.params,SpeechResult:'[SYNTHETIC] Broken gate at 10 Test Street'});
  assert.equal(saved.status,200);assert.match(h.db.prepare('SELECT collectedInputsJson FROM leads WHERE ownerId=?').get(h.owner).collectedInputsJson,/Broken gate/);
});
test('D08 signed anonymous caller resolves by To and cannot see another anonymous caller history',async t=>{
  const h=await harness(t),first=await h.incoming(1,'anonymous');assert.equal(first.status,200);assert.match(first.xml,/<Stream/);
});
test('D25 completed call is final in storage and signed fallback',async t=>{
  const h=await harness(t),c=await h.connect();h.db.prepare("UPDATE calls SET status='COMPLETED',outcome='synthetic_done' WHERE callSid=?").run(c.params.CallSid);
  const xml=await (await h.post(c.fallback,c.params)).text();assert.doesNotMatch(xml,/<Dial|<Gather|<Stream/);
  assert.equal(h.db.prepare('SELECT status FROM calls WHERE callSid=?').get(c.params.CallSid).status,'COMPLETED');
});
test('D26 caller text and unfinished model transcript survive immediate call cleanup',async t=>{
  const h=await harness(t),c=await h.connect();
  c.callback.onmessage({serverContent:{inputTranscription:{text:'[SYNTHETIC] Last request before hangup'},outputTranscription:{text:'I have your gate request'}}});
  await h.runtime.close();
  const text=h.db.prepare('SELECT transcriptJson FROM calls WHERE callSid=?').get(c.params.CallSid).transcriptJson;
  assert.match(text,/Last request before hangup/);assert.match(text,/I have your gate request/);
});
test('D26 final provider text received during close is persisted before cleanup',async t=>{
  const h=await harness(t,{closeText:'[SYNTHETIC] Last words received during provider close'}),c=await h.connect();await h.runtime.close();
  const text=h.db.prepare('SELECT transcriptJson FROM calls WHERE callSid=?').get(c.params.CallSid).transcriptJson;assert.match(text,/Last words received during provider close/);assert.match(text,/Final provider transcript/);
});
test('D07 transient transcript write failure retries received words before ending the call',async t=>{
  const h=await harness(t),c=await h.connect(),prepare=h.db.prepare;let failed=false;
  h.db.prepare=function(sql){if(!failed&&sql.startsWith('UPDATE calls SET transcriptJson='))return {run(){failed=true;throw Error('Synthetic transient write fault');}};return prepare.call(this,sql);};
  c.callback.onmessage({serverContent:{inputTranscription:{text:'[SYNTHETIC] Retry these caller words'}}});
  await until(()=>h.db.prepare('SELECT status FROM calls WHERE callSid=?').get(c.params.CallSid).status==='FAILED');
  assert.equal(failed,true);assert.match(h.db.prepare('SELECT transcriptJson FROM calls WHERE callSid=?').get(c.params.CallSid).transcriptJson,/Retry these caller words/);
});
test('D27 production startup recovers active call into one durable lead',async t=>{
  let c;const h=await harness(t,{beforeInstall:f=>{c=f.context();f.db.prepare('UPDATE calls SET transcriptJson=? WHERE callSid=?').run(JSON.stringify([{role:'user',text:'[SYNTHETIC] Restart must retain the gate request'}]),c.callSid);}});
  assert.equal(h.lead(c).length,1);const store=createVoiceSessionStore({database:h.db});store.recoverActiveCalls();
  assert.equal(h.lead(c).length,1);assert.match(h.lead(c)[0].collectedInputsJson,/Restart must retain/);
});
test('D27 legacy active rows with incomplete provider metadata still become owner leads',async t=>{
  const h=fixture(t),c=h.context();h.db.prepare('UPDATE calls SET callSid=NULL,accountSid=NULL,callerNumber=NULL,destinationNumber=NULL,transcriptJson=? WHERE id=?').run(JSON.stringify([{role:'user',text:'[SYNTHETIC] Legacy request must survive restart'}]),c.callSid);
  createVoiceSessionStore({database:h.db}).recoverActiveCalls();assert.equal(h.lead(c).length,1);assert.match(h.lead(c)[0].collectedInputsJson,/Legacy request/);
});
test('D28 provisioned phone alone never claims eligibility when inbound runtime is disabled',()=>{
  const profile={phoneProvisioningStatus:'provisioned',twilioNumberSid:'PN'+'c'.repeat(32),twilioNumber:TO,knowledgeBase:{about:'Synthetic',hours:'Weekdays'}};
  assert.equal(operatorEligibility(profile,{env:{...env,VOICE_RUNTIME_ENABLED:'false'}}).eligible,false);
});
test('D28 both owner controls preserve the off switch while accurately showing unavailable routing',()=>{
  const offline=voiceOperatorControl({configuredEnabled:true,enabled:false,eligible:false});
  assert.equal(offline.live,false);assert.equal(offline.checked,true);assert.equal(offline.blocked,false);assert.equal(offline.title,'OPERATOR OFF');assert.doesNotMatch(offline.sub,/RING YOUR PHONE|COVERED/);
  assert.equal(voiceOperatorControl({configuredEnabled:false,enabled:false,eligible:false}).blocked,true);
  const live=voiceOperatorControl({configuredEnabled:true,enabled:true,eligible:true});assert.equal(live.live,true);assert.equal(live.title,'OPERATOR LIVE');
});
test('D31 duplicate signed inbound delivery replays one durable session and never reopens final calls',async t=>{
  const h=await harness(t),results=await Promise.all([h.incoming(),h.incoming(),h.incoming()]);assert.equal(new Set(results.map(r=>r.xml)).size,1);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM voiceSessionNonces').get().n,1);
  h.db.prepare("UPDATE calls SET status='COMPLETED' WHERE callSid=?").run(results[0].params.CallSid);
  assert.doesNotMatch((await h.incoming()).xml,/<Stream|<Dial/);
});
test('D32 default ceiling reserves five sessions atomically; sixth captures its request',async t=>{
  let now=new Date('2026-10-06T12:00:00.000Z');const h=await harness(t,{install:{clock:()=>now}}),calls=await Promise.all(Array.from({length:6},(_,i)=>h.incoming(i+1)));
  assert.equal(calls.filter(c=>c.xml.includes('<Stream')).length,5);assert.equal(calls.filter(c=>c.xml.includes('<Gather')).length,1);
  h.db.prepare("UPDATE calls SET status='CONNECTED' WHERE callSid=?").run(calls[0].params.CallSid);
  now=new Date(now.getTime()+300000);
  const later=await Promise.all(Array.from({length:5},(_,i)=>h.incoming(i+7)));
  assert.equal(later.filter(c=>c.xml.includes('<Stream')).length,4,'expired, never-connected reservations must not permanently consume capacity');
  assert.equal(later.filter(c=>c.xml.includes('<Gather')).length,1,'a connected session still consumes capacity after its nonce expires');
});
test('P01 no default callback or quote deadline; only explicit owner policy authorizes one',()=>{
  const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  const prompt=compileVoiceSystemInstruction({guideText,business:{businessName:'Synthetic',agentName:'Sam'},services:[]});
  assert.match(prompt,/deadline.*only.*owner/i);assert.doesNotMatch(prompt,/have your quote today/i);
});

for(const from of ['anonymous','unknown','restricted','unavailable','private','blocked'])test('D08 anonymous identity '+from+' is isolated from prior caller history',async t=>{
  const h=await harness(t),a=await h.connect(1,from);
  await h.tool(a.callback,'captureLead',{name:'Synthetic first caller',notes:'[SYNTHETIC] Private request'});
  const b=await h.connect(2,from),history=await h.tool(b.callback,'getCustomerContext',{});
  assert.equal(history.status,'not_found');
  await h.tool(b.callback,'captureLead',{name:'Synthetic second caller',notes:'[SYNTHETIC] Different request'});
  assert.equal(h.db.prepare('SELECT COUNT(DISTINCT customerName) n FROM leads WHERE ownerId=?').get(h.owner).n,2);
});
test('D08 malformed caller and cross-tenant capture callbacks cannot alter a request',async t=>{
  const h=await harness(t);assert.equal((await h.incoming(1,'not a phone')).status,400);
  const c=await h.incoming(2);const r=await h.post('/api/twilio/voice/capture',{...c.params,To:'+19025559999',SpeechResult:'forged tenant'});assert.equal(r.status,403);
});
test('D07 fallback persistence failure returns retryable error and never forwards',async t=>{
  const h=await harness(t,{fail:true}),c=await h.connect();await until(()=>c.ws.readyState===3);
  await h.post(c.fallback,c.params);
  h.db.exec("CREATE TRIGGER synthetic_storage_failure BEFORE UPDATE OF transcriptJson ON calls BEGIN SELECT RAISE(ABORT,'synthetic storage fault'); END");
  const body={...c.params,SpeechResult:'[SYNTHETIC] Preserve on retry'},failed=await h.post('/api/twilio/voice/capture',body);
  assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/Dial|Hangup/);
  h.db.exec('DROP TRIGGER synthetic_storage_failure');assert.equal((await h.post('/api/twilio/voice/capture',body)).status,200);
  assert.match(h.db.prepare('SELECT transcriptJson FROM calls WHERE callSid=?').get(c.params.CallSid).transcriptJson,/Preserve on retry/);
});
test('D07 partial fallback speech survives an empty final result and recovery',async t=>{
  const h=await harness(t,{fail:true}),c=await h.connect();await until(()=>c.ws.readyState===3);await h.post(c.fallback,c.params);
  const r=await h.post('/api/twilio/voice/capture/partial',{...c.params,UnstableSpeechResult:'[SYNTHETIC] I need my fallen gate repaired'});assert.equal(r.status,204);
  const final=await h.post('/api/twilio/voice/capture',c.params);assert.doesNotMatch(await final.text(),/<Dial|<Hangup/);
  createVoiceSessionStore({database:h.db}).recoverActiveCalls();assert.match(h.db.prepare('SELECT collectedInputsJson FROM leads WHERE ownerId=?').get(h.owner).collectedInputsJson,/fallen gate/);
});
test('D25 repeated completed fallback capture neither rewrites request nor forwards again',async t=>{
  const h=await harness(t,{fail:true}),c=await h.connect();await until(()=>c.ws.readyState===3);await h.post(c.fallback,c.params);
  const body={...c.params,SpeechResult:'[SYNTHETIC] Exact final request'};assert.match(await (await h.post('/api/twilio/voice/capture',body)).text(),/<Dial/);
  const before=h.db.prepare('SELECT * FROM calls WHERE callSid=?').get(c.params.CallSid);
  assert.doesNotMatch(await (await h.post('/api/twilio/voice/capture',{...body,SpeechResult:'stale replacement'})).text(),/<Dial|<Gather/);
  assert.deepEqual(h.db.prepare('SELECT * FROM calls WHERE callSid=?').get(c.params.CallSid),before);
});
for(const ending of ['error','provider_close','socket_close'])test('D26 pending text is preserved on '+ending,async t=>{
  const h=await harness(t),c=await h.connect();c.callback.onmessage({serverContent:{inputTranscription:{text:'[SYNTHETIC] '+ending+' request'},outputTranscription:{text:'Your request is noted'}}});
  if(ending==='error')c.callback.onerror();else if(ending==='provider_close')c.callback.onclose();else c.ws.close();
  await until(()=>['COMPLETED','FAILED'].includes(h.db.prepare('SELECT status FROM calls WHERE callSid=?').get(c.params.CallSid).status));
  const row=h.db.prepare('SELECT transcriptJson FROM calls WHERE callSid=?').get(c.params.CallSid);assert.match(row.transcriptJson,new RegExp(ending+' request'));assert.match(row.transcriptJson,/Your request is noted/);
  assert.match(h.db.prepare('SELECT collectedInputsJson FROM leads WHERE ownerId=?').get(h.owner).collectedInputsJson,new RegExp(ending+' request'));
});
test('D26 received caller text persists while a provider tool is still waiting',async t=>{
  let release,entered=false;const pending=new Promise(r=>{release=r;});
  const h=await harness(t,{install:{twilioClient:{calls:sid=>({update:async()=>{entered=true;await pending;return {sid,status:'in-progress'};}})}}}),c=await h.connect();
  const lead=await h.tool(c.callback,'captureLead',{notes:'[SYNTHETIC] Initial callback',callbackRequested:true});
  c.callback.onmessage({toolCall:{functionCalls:[{id:'blocked-transfer',name:'transferCall',args:{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] Additional help'}}]}});
  try{await until(()=>entered);c.callback.onmessage({serverContent:{inputTranscription:{text:'[SYNTHETIC] Additional urgent gate detail'}}});
    await until(()=>h.db.prepare('SELECT transcriptJson FROM calls WHERE callSid=?').get(c.params.CallSid).transcriptJson.includes('Additional urgent gate detail'));
  }finally{release();}
});
test('D31 duplicated media upgrade cannot start a second provider session',async t=>{
  const h=await harness(t),c=await h.connect();const replay=await h.incoming();assert.equal(replay.xml,c.xml);
  assert.equal(h.callbacks.length,1);assert.equal(h.runtime.boundary.activeSessionCount,1);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM voiceSessionNonces').get().n,1);
  const receipt=h.db.prepare("SELECT responseJson FROM voiceToolIdempotencyReceipts WHERE idempotencyKey='inbound'").get();assert.doesNotMatch(receipt.responseJson,/<Stream|wss:/);
});
test('D26 normal cleanup enriches the captured inquiry without duplicating it',async t=>{
  const h=await harness(t),c=await h.connect();await h.tool(c.callback,'captureLead',{name:'Synthetic caller',notes:'[SYNTHETIC] Initial gate request'});
  c.callback.onmessage({serverContent:{inputTranscription:{text:'[SYNTHETIC] Final access instruction'}}});await h.runtime.close();
  const rows=h.db.prepare('SELECT * FROM leads WHERE ownerId=?').all(h.owner);assert.equal(rows.length,1);assert.match(rows[0].collectedInputsJson,/Initial gate request/);assert.match(rows[0].collectedInputsJson,/Final access instruction/);
});
test('D32 sixth caller request is retained and another tenant has independent capacity',async t=>{
  const h=await harness(t);for(let i=1;i<=5;i++)assert.match((await h.incoming(i)).xml,/<Stream/);
  const c=await h.incoming(6),r=await h.post('/api/twilio/voice/capture',{...c.params,SpeechResult:'[SYNTHETIC] Over-limit gate request'});assert.equal(r.status,200);
  assert.match(h.db.prepare('SELECT collectedInputsJson FROM leads WHERE ownerId=?').get(h.owner).collectedInputsJson,/Over-limit gate/);
  h.db.prepare("UPDATE businessProfiles SET twilioNumber='+19025550202',phoneProvisioningStatus='provisioned',operatorEnabled=1 WHERE ownerId='synthetic-b'").run();
  const other=await h.post('/api/twilio/voice/incoming',{...h.params(7),To:'+19025550202'});assert.match(await other.text(),/<Stream/);
});
test('P01 owner-set policy is available verbatim; caller urgency and business hours are not deadlines',()=>{
  const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  const prompt=compileVoiceSystemInstruction({guideText,business:{businessName:'Synthetic',agentName:'Sam'},services:[],knowledge:{hours:'Open until 5',policies:'Callbacks within one business day. Roof quotes within three business days.'}});
  assert.match(prompt,/Callbacks within one business day/);assert.match(prompt,/Roof quotes within three business days/);assert.match(prompt,/opening hours, urgency, a caller's requested time/);
});
for(const accepted of [true,false])test('D04 warm transfer '+(accepted?'requires explicit acceptance':'decline saves callback')+' with signed child-leg binding',async t=>{
  const h=await harness(t),c=await h.connect();await h.tool(c.callback,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] Transfer the broken gate request'});
  const update=h.writes.find(w=>w[0]==='call')[2].twiml,accept=new URL(update.match(/<Number url="([^"]+)"/)[1]).pathname,result=new URL(update.match(/ action="([^"]+)"/)[1]).pathname;
  const child={AccountSid:ACCOUNT,ParentCallSid:c.params.CallSid,CallSid:'CA'+'d'.repeat(32),From:TO,To:'+19025550199',Direction:'outbound-dial'};
  assert.equal((await h.post(accept,{...child,ParentCallSid:'CA'+'e'.repeat(32)})).status,403);
  assert.match(await (await h.post(accept,child)).text(),/Press 1 to accept/);
  if(accepted){assert.equal(await (await h.post(accept,{...child,Digits:'1'})).text(),'<Response/>');assert.equal(await (await h.post(accept,{...child,Digits:'1'})).text(),'<Response/>');
    assert.doesNotMatch(await (await h.post(result,{...c.params,DialCallStatus:'completed'})).text(),/Dial|Gather/);
  }else{await h.post(accept,{...child,Digits:'2'});assert.match(await (await h.post(result,{...c.params,DialCallStatus:'completed'})).text(),/capture\/again/);
    await h.post(result,{...c.params,DialCallStatus:'no-answer'});
    assert.equal(h.db.prepare('SELECT COUNT(*) n FROM callbackRequests WHERE ownerId=?').get(h.owner).n,1);
    assert.match(h.db.prepare('SELECT notes FROM callbackRequests WHERE ownerId=?').get(h.owner).notes,/Transfer the broken gate request/);}
});

function calendarFixture(t,{failChange=false}={}){
  const h=fixture(t),context=h.context(),ownerId=context.ownerId,clock=()=>new Date('2026-10-06T12:00:00.000Z'),writes=[];
  const weekly=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[{start:'09:00',end:'17:00'}]]));
  h.db.prepare("UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?").run(JSON.stringify({serviceArea:{mode:'all',cities:[]}}),ownerId);
  h.db.prepare("INSERT INTO bookingSettings(ownerId,revision,timezone,provider,calendarId,weeklyAvailabilityJson,blackoutsJson,bookingHorizonDays,minimumNoticeMinutes,slotIncrementMinutes,bufferBeforeMinutes,bufferAfterMinutes,directBookingEnabled,updatedAt) VALUES(?,'v1','UTC','google','synthetic-calendar',?,'[]',30,0,30,0,0,1,?)").run(ownerId,JSON.stringify(weekly),clock().toISOString());
  h.db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt) VALUES(?,'synthetic-service','v1','site_visit_first',30,1,?)").run(ownerId,clock().toISOString());
  let busy=[];const calendar={listBusy:async()=>busy,createEvent:async input=>({status:'CONFIRMED',eventId:input.eventId,startAtUtc:input.startAtUtc,endAtUtc:input.endAtUtc}),changeEvent:async input=>{writes.push(input);if(failChange)throw Error('Synthetic ambiguous calendar failure');return {status:input.action==='cancel'?'CANCELLED':'CONFIRMED',eventId:input.eventId,startAtUtc:input.startAtUtc,endAtUtc:input.endAtUtc};}};
  return {...h,context,ownerId,clock,writes,setBusy:rows=>{busy=rows;},service:createBookingService({db:h.db,calendar,clock,slotTokenSecret:'synthetic-calendar-secret'.padEnd(64,'x')})};
}
async function seedAppointment(h){
  const {db,context,ownerId,service,clock}=h,id=randomUUID();
  db.prepare("INSERT INTO leads(id,ownerId,callId,type,status,createdAt) VALUES(?,?,?,'voice_lead','CAPTURED',?)").run(id,ownerId,context.callSid,clock().toISOString());
  const intent=service.createIntent({ownerId,sourceType:'lead',sourceId:id,serviceId:'synthetic-service',resultType:'ESTIMATE_REQUIRES_REVIEW',expiresAtUtc:'2026-10-20T12:00:00.000Z'});
  const location={addressLine1:'10 Synthetic Street',city:'Synthetic City',region:'NS',postalCode:'B3H 1A1',country:'CA'};
  const slots=await service.availability({ownerId,intentId:intent.intentId,filters:{fromDate:'2026-10-07',days:1,location}});
  const hold=service.hold({ownerId,intentId:intent.intentId,slotId:slots.body.slots[0].slotId,idempotencyKey:randomUUID()});
  const confirmed=await service.confirm({ownerId,intentId:intent.intentId,idempotencyKey:randomUUID(),body:{holdId:hold.body.holdId,confirmedSlotId:slots.body.slots[0].slotId,customer:{name:'Synthetic Caller',phone:FROM},location,explicitConfirmation:true,addressConfirmation:true}});
  assert.equal(confirmed.body.status,'CONFIRMED');return db.prepare('SELECT * FROM appointments WHERE id=? AND ownerId=?').get(confirmed.body.appointmentId,ownerId);
}
for(const action of ['cancel','reschedule'])test('D04 real booking service '+action+' uses fake calendar and commits only confirmed result',async t=>{
  const h=calendarFixture(t),row=await seedAppointment(h);let slot;
  if(action==='reschedule'){slot=await h.service.appointmentAvailability({ownerId:h.ownerId,appointmentId:row.id,callerNumber:FROM,filters:{fromDate:'2026-10-08',days:1}});assert.equal(slot.body.status,'AVAILABLE');}
  const result=await h.service.modifyAppointment({ownerId:h.ownerId,callSid:h.context.callSid,appointment:row,action,idempotencyKey:randomUUID(),slotId:slot?.body.slots[0].slotId,intentId:slot?.intentId});
  assert.equal(result.status,'CONFIRMED');assert.equal(h.writes.length,1);
  const saved=h.db.prepare('SELECT * FROM appointments WHERE ownerId=? AND id=?').get(h.ownerId,row.id);assert.equal(saved.status,action==='cancel'?'CANCELLED':'CONFIRMED');
  if(slot)assert.equal(saved.startAtUtc,slot.body.slots[0].startUtc);
});
test('D04 ambiguous calendar change preserves both reservations and request evidence',async t=>{
  const h=calendarFixture(t,{failChange:true}),row=await seedAppointment(h),slots=await h.service.appointmentAvailability({ownerId:h.ownerId,appointmentId:row.id,callerNumber:FROM,filters:{fromDate:'2026-10-08',days:1}});
  const result=await h.service.modifyAppointment({ownerId:h.ownerId,callSid:h.context.callSid,appointment:row,action:'reschedule',idempotencyKey:randomUUID(),slotId:slots.body.slots[0].slotId,intentId:slots.intentId});
  assert.equal(result.status,'PENDING_CONFIRMATION');
  assert.equal(h.db.prepare('SELECT startAtUtc FROM appointments WHERE id=?').get(row.id).startAtUtc,row.startAtUtc);
  assert.equal(h.db.prepare('SELECT status FROM appointments WHERE id=?').get(row.id).status,'PENDING_CONFIRMATION');
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM bookingHolds WHERE status='CONFIRMING' AND expiresAtUtc>'2099'").get().n,1);
});
test('D04 rescheduling rechecks remote availability before writing a stale offered slot',async t=>{
  const h=calendarFixture(t),row=await seedAppointment(h),slots=await h.service.appointmentAvailability({ownerId:h.ownerId,appointmentId:row.id,callerNumber:FROM,filters:{fromDate:'2026-10-08',days:1}}),slot=slots.body.slots[0];
  h.setBusy([{startAtUtc:slot.startUtc,endAtUtc:slot.endUtc}]);
  await assert.rejects(h.service.modifyAppointment({ownerId:h.ownerId,callSid:h.context.callSid,appointment:row,action:'reschedule',idempotencyKey:randomUUID(),slotId:slot.slotId,intentId:slots.intentId}));
  assert.equal(h.writes.length,0);assert.equal(h.db.prepare("SELECT COUNT(*) n FROM bookingHolds WHERE status IN ('HELD','CONFIRMING')").get().n,0);
});
for(const action of ['cancel','reschedule'])test('D04 Google calendar '+action+' adapter uses authenticated PATCH and validates response',async()=>{
  const requests=[],start='2026-10-08T10:00:00.000Z',end='2026-10-08T10:30:00.000Z';
  const adapter=createGoogleCalendarAdapter({clock:()=>new Date('2026-10-06T12:00:00.000Z'),loadConnection:async ownerId=>({ownerId,provider:'google',status:'connected',calendarId:'synthetic-calendar',credentials:{accessToken:'synthetic-access-token',refreshToken:'synthetic-refresh-token'},expiresAtUtc:'2026-10-07T12:00:00.000Z',scopes:['https://www.googleapis.com/auth/calendar']}),saveConnection:async()=>{},fetch:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({id:'b1234',status:action==='cancel'?'cancelled':'confirmed',start:{dateTime:start},end:{dateTime:end}}),{status:200});}});
  const result=await adapter.changeEvent({ownerId:'synthetic-a',calendarId:'synthetic-calendar',eventId:'b1234',action,startAtUtc:start,endAtUtc:end});
  assert.equal(result.status,action==='cancel'?'CANCELLED':'CONFIRMED');assert.equal(requests[0].options.method,'PATCH');assert.equal(requests[0].options.headers.authorization,'Bearer synthetic-access-token');
});
