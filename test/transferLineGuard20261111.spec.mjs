import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,secret,at} from './leadCaptureRepair20261006Fixture.mjs';
import {harness,TO} from './voiceLifecycle20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import * as voiceSettings from '../server/src/voice/voiceSettings.js';
const {transferDecision}=voiceSettings;
// The owner-facing reasons, written before execution.
const BUSINESS_LINE_REFUSAL='Enter a different number for transfers. Your business line forwards to your receptionist, so a transfer to it would ring the receptionist again.';
const RECEPTIONIST_REFUSAL='Enter a different number for transfers. This is your receptionist\'s number, so a transfer to it would ring the receptionist again.';
import {saveVoice} from '../server/src/onboardingService.js';
import {db as sharedDb} from '../server/src/db.js';
import {migrateDatabase} from '../server/src/migrations.js';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';

// Live transfer never dials the business line (it forwards to the receptionist)
// or the receptionist number. With no usable transfer number the caller's
// request is saved as a callback, as it is outside transfer hours.
// Expected values written before execution.
const BUSINESS='+19025550199',RECEPTIONIST='+19025550101',DIRECT='+19025550188';
const allDay=Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[{start:'00:00',end:'23:59'}]]));
const words='[SYNTHETIC] Please put me through to the owner about the gate.';
function profile(f,ownerId,{business=BUSINESS,receptionist=RECEPTIONIST,kb={}}={}){
  f.db.prepare('UPDATE businessProfiles SET existingPhoneNumber=?,twilioNumber=?,knowledgeBaseJson=? WHERE ownerId=?').run(business,receptionist,JSON.stringify({transferWindows:allDay,...kb}),ownerId);
}
function voice(f,c,providers){const r=createVoiceToolRuntime({database:f.db,callContext:c,handleSecret:secret,clock:()=>new Date(at),providers});return (args,id)=>createVoiceToolDispatcher({handlers:r.handlers,callContext:c,idempotencyStore:r.idempotencyStore}).dispatch({name:'transferCall',args,toolCallId:id});}

test('transfer decision: no saved transfer number never falls back to the business line',t=>{
  const f=fixture(t),c=f.context();profile(f,c.ownerId);
  assert.deepEqual(transferDecision(f.db,c.ownerId,new Date(at)),{allowed:false,reason:'TRANSFER_DESTINATION_UNAVAILABLE'});
});
for(const [label,kb] of [['blank transfer number',{transferNumber:''}],['transfer number equal to the business line',{transferNumber:BUSINESS}],['transfer number equal to the receptionist number',{transferNumber:RECEPTIONIST}]])
  test('transfer decision: '+label+' is not a destination',t=>{
    const f=fixture(t),c=f.context();profile(f,c.ownerId,{kb});
    assert.deepEqual(transferDecision(f.db,c.ownerId,new Date(at)),{allowed:false,reason:'TRANSFER_DESTINATION_UNAVAILABLE'});
  });
test('transfer decision: a direct number inside transfer hours is still dialed',t=>{
  const f=fixture(t),c=f.context();profile(f,c.ownerId,{kb:{transferNumber:DIRECT}});
  assert.deepEqual(transferDecision(f.db,c.ownerId,new Date(at)),{allowed:true,reason:'TRANSFER_OUTSIDE_HOURS',destination:DIRECT});
});
test('transfer decision: transfer hours still apply to a direct number',t=>{
  const f=fixture(t),c=f.context();profile(f,c.ownerId,{kb:{transferNumber:DIRECT,transferWindows:{tue:[{start:'13:00',end:'14:00'}]}}});
  // 2026-10-06T12:00Z is Tuesday 12:00 UTC, before the 13:00 window.
  assert.deepEqual(transferDecision(f.db,c.ownerId,new Date(at)),{allowed:false,reason:'TRANSFER_OUTSIDE_HOURS',destination:DIRECT});
});
test('transfer number conflict names which line it matches',()=>{
  const p={existingPhoneNumber:BUSINESS,twilioNumber:RECEPTIONIST};
  assert.equal(voiceSettings.transferNumberConflict(BUSINESS,p),'business');
  assert.equal(voiceSettings.transferNumberConflict('9025550199',p),'business');
  assert.equal(voiceSettings.transferNumberConflict(RECEPTIONIST,p),'receptionist');
  assert.equal(voiceSettings.transferNumberConflict(DIRECT,p),null);
  assert.equal(voiceSettings.transferNumberConflict(DIRECT,{}),null);
});

for(const [label,kb] of [['no transfer number',{}],['transfer number equal to the business line',{transferNumber:BUSINESS}],['transfer number equal to the receptionist number',{transferNumber:RECEPTIONIST}]])
  test('runtime: '+label+' never dials and saves the caller request as a callback',async t=>{
    const f=fixture(t),c=f.context();profile(f,c.ownerId,{kb});const dialed=[];
    const result=await voice(f,c,{transferCall:async input=>{dialed.push(input.destination);return {status:'CONNECTED'};}})({reason:'caller_requested',customerConfirmed:true,notes:words},'synthetic-transfer-1');
    assert.deepEqual(dialed,[]);
    assert.equal(result.status,'unavailable');assert.equal(result.callbackSaved,true);
    const outbox=f.db.prepare("SELECT status,payloadJson FROM outboxEvents WHERE ownerId=? AND eventType='voice.transfer_requested'").all(c.ownerId);
    assert.deepEqual(outbox.map(row=>({status:row.status,policyReason:JSON.parse(row.payloadJson).policyReason})),[{status:'FAILED',policyReason:'TRANSFER_DESTINATION_UNAVAILABLE'}]);
    const saved=f.db.prepare('SELECT source,notes FROM callbackRequests WHERE ownerId=?').all(c.ownerId);
    assert.deepEqual(saved,[{source:'transfer_failed',notes:words}]);
  });
test('runtime: the callback is saved the same way as outside transfer hours',async t=>{
  const run=async kb=>{const f=fixture(t),c=f.context();profile(f,c.ownerId,{kb});
    const r=await voice(f,c,{transferCall:async()=>({status:'CONNECTED'})})({reason:'caller_requested',customerConfirmed:true,notes:words},'synthetic-transfer-2');
    return {status:r.status,callbackSaved:r.callbackSaved,message:r.message,rows:f.db.prepare('SELECT source,reason,notes FROM callbackRequests WHERE ownerId=?').all(c.ownerId),leads:f.db.prepare('SELECT COUNT(*) n FROM leads WHERE ownerId=?').get(c.ownerId).n};};
  const noNumber=await run({}),outside=await run({transferNumber:DIRECT,transferWindows:{tue:[{start:'13:00',end:'14:00'}]}});
  assert.deepEqual(noNumber,outside);
});
test('runtime: a direct number is dialed',async t=>{
  const f=fixture(t),c=f.context();profile(f,c.ownerId,{kb:{transferNumber:DIRECT}});const dialed=[];
  const result=await voice(f,c,{transferCall:async input=>{dialed.push(input.destination);return {status:'CONNECTED'};}})({reason:'caller_requested',customerConfirmed:true,notes:words},'synthetic-transfer-3');
  assert.deepEqual(dialed,[DIRECT]);assert.equal(result.status,'transferred');
});

test('Twilio: with only the business line on file, no transfer leg is placed and a callback is saved',async t=>{
  const h=await harness(t,{beforeInstall:f=>f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({about:'Synthetic business',hours:'Monday to Friday',transferWindows:allDay}),'synthetic-a')});
  const c=await h.connect(),result=await h.tool(c.callback,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:words});
  assert.deepEqual(h.writes.filter(w=>w[0]==='call'),[]);
  assert.equal(result.callbackSaved,true);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM callbackRequests WHERE ownerId=?').get(h.owner).n,1);
});
test('Twilio: a direct number gets the transfer leg with the press 1 to accept step',async t=>{
  const h=await harness(t,{beforeInstall:f=>f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({about:'Synthetic business',hours:'Monday to Friday',transferWindows:allDay,transferNumber:DIRECT}),'synthetic-a')});
  const c=await h.connect();await h.tool(c.callback,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:words});
  const twiml=h.writes.find(w=>w[0]==='call')[2].twiml;
  assert.match(twiml,new RegExp('>\\'+DIRECT+'</Number>'));assert.doesNotMatch(twiml,new RegExp('\\'+BUSINESS+'|\\'+TO));
  const accept=new URL(twiml.match(/<Number url="([^"]+)"/)[1]).pathname;
  const child={AccountSid:c.params.AccountSid,ParentCallSid:c.params.CallSid,CallSid:'CA'+'d'.repeat(32),From:TO,To:DIRECT,Direction:'outbound-dial'};
  assert.match(await (await h.post(accept,child)).text(),/Press 1 to accept/);
});

test('settings save: transfer number equal to the business line or the receptionist number is refused with the reason',()=>{
  const created=new Date().toISOString();migrateDatabase(sharedDb);
  const owner='synthetic-transfer-line-guard';
  sharedDb.prepare("INSERT OR IGNORE INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic','Operator','active','UTC','owner',?)").run(owner,owner+'@example.invalid',created);
  sharedDb.prepare("INSERT OR IGNORE INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)").run(owner,created);
  sharedDb.prepare('UPDATE businessProfiles SET existingPhoneNumber=?,twilioNumber=? WHERE ownerId=?').run(BUSINESS,RECEPTIONIST,owner);
  const base={voiceId:'female',agentName:'Sam',greeting:'[SYNTHETIC] Hello',fromSettings:true};
  assert.throws(()=>saveVoice(owner,{...base,transferNumber:BUSINESS}),e=>e.statusCode===400&&e.message===BUSINESS_LINE_REFUSAL);
  assert.throws(()=>saveVoice(owner,{...base,transferNumber:RECEPTIONIST}),e=>e.statusCode===400&&e.message===RECEPTIONIST_REFUSAL);
  assert.equal(JSON.parse(sharedDb.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(owner).knowledgeBaseJson).transferNumber,undefined,'nothing saved');
  assert.equal(saveVoice(owner,{...base,transferNumber:DIRECT}).knowledgeBase.transferNumber,DIRECT);
  assert.equal(saveVoice(owner,{...base,transferNumber:''}).knowledgeBase.transferNumber,'');
  assert.equal(voiceSettings.TRANSFER_NUMBER_IS_BUSINESS_LINE_MESSAGE,BUSINESS_LINE_REFUSAL);
  assert.equal(voiceSettings.TRANSFER_NUMBER_IS_RECEPTIONIST_MESSAGE,RECEPTIONIST_REFUSAL);
});
test('settings route: POST /api/onboarding/voice refuses the business line and the receptionist number',async t=>{
  const s=await application(t);
  s.db.prepare("UPDATE users SET plan='Operator' WHERE id='synthetic-a'").run();
  s.db.prepare('UPDATE businessProfiles SET existingPhoneNumber=?,twilioNumber=? WHERE ownerId=?').run(BUSINESS,RECEPTIONIST,'synthetic-a');
  const body={voiceId:'female',agentName:'Sam',greeting:'[SYNTHETIC] Hello',fromSettings:true};
  const business=await s.request('/api/onboarding/voice',{method:'POST',body:{...body,transferNumber:BUSINESS}});
  assert.equal(business.status,400);assert.equal(business.body.error,BUSINESS_LINE_REFUSAL);
  const receptionist=await s.request('/api/onboarding/voice',{method:'POST',body:{...body,transferNumber:RECEPTIONIST}});
  assert.equal(receptionist.status,400);assert.equal(receptionist.body.error,RECEPTIONIST_REFUSAL);
  const direct=await s.request('/api/onboarding/voice',{method:'POST',body:{...body,transferNumber:DIRECT}});
  assert.equal(direct.status,200);assert.equal(direct.body.profile.knowledgeBase.transferNumber,DIRECT);
  s.db.prepare("UPDATE users SET plan='Starter' WHERE id='synthetic-a'").run();
  assert.equal((await s.request('/api/onboarding/voice',{method:'POST',body:{...body,transferNumber:DIRECT}})).status,403,'Starter still has no transfer');
});
