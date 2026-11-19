import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,env,until} from './voiceLifecycle20261006Fixture.mjs';
import {at} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceAdmission,voiceAdmissionStatus} from '../server/src/voice/voiceAdmission.js';
import {ERASED_TENANT_TABLES} from '../server/src/billingTenantErasure.js';

// Owner ruling 2026-11-19: one business's failing calls never pause another
// business. Three Gemini failures within a minute pause only that business for
// 30 seconds (its callers get the backup line); every other business keeps
// answering. Real signed HTTP and WebSocket calls; Twilio and Google are fakes.
// HANDWRITTEN EXPECTATIONS, before execution:
// A. Business A has three calls fail to open Gemini. A's next call goes to the
//    backup line (failure VOICE_CIRCUIT_OPEN); business B's next call is answered.
// B. Failures spread across businesses (two for A, two for B) pause neither.
// C. After A's 30 s pause one probe call is let through for A; when it connects,
//    A's pause and failures clear; B was never paused and has no alert.
// D. The new per-business tables are erased with the business.
const limits={...env,VOICE_MAX_CONCURRENT:'100',VOICE_CALLER_DAILY_LIMIT:'50',VOICE_BREAKER_FAILURE_THRESHOLD:'3',VOICE_BREAKER_WINDOW_SECONDS:'60',VOICE_BREAKER_COOLDOWN_SECONDS:'30'};
const sid=n=>'CA'+n.toString(16).padStart(32,'0');
const B_TO='+19025550102';
function secondOwner(f){f.db.prepare("UPDATE businessProfiles SET twilioNumber=?,twilioNumberSid='PNbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',phoneProvisioningStatus='provisioned',operatorEnabled=1,knowledgeBaseJson=? WHERE ownerId='synthetic-b'").run(B_TO,JSON.stringify({about:'Synthetic other business',hours:'Weekdays'}));}
const stream=xml=>/<Stream /.test(xml);

test('A: three failures at one business pause that business only; another business keeps answering',async t=>{
  const h=await harness(t,{fail:true,install:{env:limits},beforeInstall:secondOwner});
  for(let n=1;n<=3;n++){const c=await h.connect(n,'+1902555010'+n);await until(()=>c.ws.readyState===3);}
  const a=await h.incoming(4,'+19025550104');assert.ok(!stream(a.xml));
  assert.equal(h.db.prepare('SELECT failureCode FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,sid(4)).failureCode,'VOICE_CIRCUIT_OPEN');
  const b=await h.post('/api/twilio/voice/incoming',{...h.params(5,'+19025550105'),To:B_TO});assert.ok(stream(await b.text()));
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM voiceOwnerCircuits WHERE ownerId='synthetic-b'").get().n,0);
});
test('B: failures spread across businesses pause neither',async t=>{
  const h=await harness(t,{install:{env:limits}});let now=Date.parse(at);
  const a=createVoiceAdmission({database:h.db,env:limits,clock:()=>new Date(now)});
  const ctx=(owner,n)=>({ownerId:owner,callSid:sid(n),from:'+19025550100',to:'+19025550101',accountSid:env.TWILIO_ACCOUNT_SID});
  a.failed(ctx(h.owner,1));a.failed(ctx('synthetic-b',2));a.failed(ctx(h.owner,3));a.failed(ctx('synthetic-b',4));
  assert.equal(h.db.transaction(()=>a.reserve(ctx(h.owner,5))).immediate(),null);
  assert.equal(h.db.transaction(()=>a.reserve(ctx('synthetic-b',6))).immediate(),null);
  assert.equal(voiceAdmissionStatus(h.db).circuit.openUntil,0);
});
test('C: after the pause one probe goes through for that business; a connected probe clears it; the other business never had an alert',async t=>{
  const h=await harness(t,{install:{env:limits}});let now=Date.parse(at);
  const a=createVoiceAdmission({database:h.db,env:limits,clock:()=>new Date(now)});
  const ctx=(owner,n)=>({ownerId:owner,callSid:sid(n),from:'+19025550100',to:'+19025550101',accountSid:env.TWILIO_ACCOUNT_SID});
  for(let n=1;n<=3;n++)a.failed(ctx(h.owner,n));
  assert.equal(h.db.transaction(()=>a.reserve(ctx(h.owner,4))).immediate(),'VOICE_CIRCUIT_OPEN');
  assert.equal(h.db.transaction(()=>a.reserve(ctx('synthetic-b',5))).immediate(),null);
  assert.ok(voiceAdmissionStatus(h.db).circuit.openUntil>now);
  now+=30001;
  assert.equal(h.db.transaction(()=>a.reserve(ctx(h.owner,6))).immediate(),null,'the probe call');
  assert.equal(h.db.transaction(()=>a.reserve(ctx(h.owner,7))).immediate(),'VOICE_CIRCUIT_OPEN','only one probe at a time');
  a.connected(ctx(h.owner,6));
  assert.equal(h.db.transaction(()=>a.reserve(ctx(h.owner,8))).immediate(),null);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM voiceOwnerModelFailures WHERE ownerId=?').get(h.owner).n,0);
  const alerts=voiceAdmissionStatus(h.db).alerts.filter(alert=>alert.code==='VOICE_CIRCUIT_OPEN');
  assert.equal(alerts.length,1);assert.equal(alerts[0].details.ownerId,h.owner);assert.ok(alerts[0].resolvedAt);
});
test('D: the per-business pause tables are erased with the business',()=>{
  for(const table of ['voiceOwnerCircuits','voiceOwnerModelFailures'])assert.ok(ERASED_TENANT_TABLES.includes(table),table);
});
