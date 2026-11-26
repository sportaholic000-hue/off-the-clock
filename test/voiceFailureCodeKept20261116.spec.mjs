import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,env,until} from './voiceLifecycle20261006Fixture.mjs';
import {at} from './leadCaptureRepair20261006Fixture.mjs';
import {CAPTURE_PATH,BACKUP_MAX_ASKS} from '../server/src/voice/voiceFallbackRoutes.js';
import {createBillingVoiceUsage} from '../server/src/billingVoiceUsage.js';
import {createVoiceSessionStore} from '../server/src/voice/voicePersistence.js';
import {callFailureReason} from '../server/src/callFailureReasons.js';

// Owner ruling 2026-11-16: posting the backup route after a real failure keeps
// that first failure code (and the matching outcome), so the Calls page shows
// the real cause. A call with no earlier failure still records the backup
// reason. Expected values written before running.
const row=(h,c)=>({...h.db.prepare('SELECT status,failureCode,outcome FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid)});
for(const code of ['UNSUPPORTED_TWILIO_EVENT','GEMINI_AUDIO_RATE_LIMIT'])test('the backup route keeps '+code,async t=>{
  const h=await harness(t),c=await h.connect();
  // The bridge's own failure record (status FAILED with its code), as the media bridge writes it.
  h.db.prepare("UPDATE calls SET status='FAILED',failureCode=?,outcome='LEAD' WHERE ownerId=? AND callSid=?").run(code,h.owner,c.params.CallSid);
  const twiml=await (await h.post(c.fallback,c.params)).text();
  assert.match(twiml,/<Gather/);
  assert.deepEqual(row(h,c),{status:'FALLBACK',failureCode:code,outcome:code});
  // A later backup step does not replace it either.
  await h.post('/api/twilio/voice/capture/again',c.params);
  assert.equal(row(h,c).failureCode,code);
});
test('with no earlier failure the backup reason is recorded as before',async t=>{
  const h=await harness(t),c=await h.connect();
  await h.post(c.fallback,c.params);
  assert.deepEqual(row(h,c),{status:'FALLBACK',failureCode:'VOICE_SESSION_UNAVAILABLE',outcome:'VOICE_SESSION_UNAVAILABLE'});
});

// Owner ruling 2026-11-17 (Astra's audit of be4a62c3): the first real failure
// stays on the call through to its final state, so the Calls page shows the
// real cause. Billing does not change: these calls still bill 0 minutes.
// HANDWRITTEN EXPECTATIONS, before execution: after the backup route, the
// caller's words submitted to the capture route, or three silent captures,
// end the call COMPLETED with outcome AI_FALLBACK, the first failure code kept,
// 0 minutes billed even after Twilio reports a 180-second call, and the Calls
// page detail naming that failure. A later media close does not change it.
const final=(h,c)=>h.db.prepare('SELECT status,failureCode,outcome,minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid);
const callId=(h,c)=>h.db.prepare('SELECT id FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).id;
async function failedToBackup(h,code){
  const c=await h.connect();
  h.db.prepare("UPDATE calls SET status='FAILED',failureCode=?,outcome='LEAD' WHERE ownerId=? AND callSid=?").run(code,h.owner,c.params.CallSid);
  await h.post(c.fallback,c.params);return c;
}
async function billedAfterTwilioReport(h,c){
  const meter=createBillingVoiceUsage({database:h.db,clock:()=>new Date(at)});
  return meter.providerComplete({...c.params,CallStatus:'completed',CallDuration:'180'},{ownerId:h.owner});
}
for(const code of ['UNSUPPORTED_TWILIO_EVENT','GEMINI_AUDIO_RATE_LIMIT','GEMINI_SESSION_CLOSED','TWILIO_SOCKET_CLOSED'])for(const ending of ['words','silence'])
  test(`${code} stays on the call after the backup capture ends by ${ending}`,async t=>{
    const h=await harness(t),c=await failedToBackup(h,code);
    if(ending==='words'){
      const twiml=await (await h.post(CAPTURE_PATH,{...c.params,SpeechResult:'[SYNTHETIC] Please call me back about the deck.'})).text();
      assert.match(twiml,/<Hangup\/>/);
    }else{
      for(let i=1;i<=BACKUP_MAX_ASKS;i++){const twiml=await (await h.post(CAPTURE_PATH,{...c.params,SpeechResult:''})).text();assert.match(twiml,i<BACKUP_MAX_ASKS?/<Redirect/:/<Hangup\/>/);}
    }
    assert.deepEqual({...final(h,c)},{status:'COMPLETED',failureCode:code,outcome:'AI_FALLBACK',minutesBilled:0});
    assert.equal(await billedAfterTwilioReport(h,c),0);
    assert.deepEqual({...final(h,c)},{status:'COMPLETED',failureCode:code,outcome:'AI_FALLBACK',minutesBilled:0});
    const detail=h.service.detail({ownerId:h.owner,id:callId(h,c)});
    assert.equal(detail.failureCode,code);assert.notEqual(callFailureReason(code),callFailureReason('NOT_A_REAL_CODE'));
    // A late media close cannot replace it either.
    c.ws.close();await new Promise(r=>setTimeout(r,100));
    assert.equal(final(h,c).failureCode,code);
  });
test('a backup-line call with no earlier failure keeps the backup reason at the end',async t=>{
  const h=await harness(t),c=await h.connect();
  await h.post(c.fallback,c.params);
  await h.post(CAPTURE_PATH,{...c.params,SpeechResult:'[SYNTHETIC] Please call me back.'});
  assert.deepEqual({...final(h,c)},{status:'COMPLETED',failureCode:'VOICE_SESSION_UNAVAILABLE',outcome:'AI_FALLBACK',minutesBilled:0});
  assert.equal(await billedAfterTwilioReport(h,c),0);
});
test('an ordinary answered call still ends with no failure code',async t=>{
  const h=await harness(t),c=await h.connect();
  await until(()=>h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid)?.status==='CONNECTED');
  c.ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:c.streamSid,stop:{accountSid:env.TWILIO_ACCOUNT_SID,callSid:c.params.CallSid}}));
  await until(()=>final(h,c).status==='COMPLETED');
  assert.equal(final(h,c).failureCode,null);assert.notEqual(final(h,c).outcome,'AI_FALLBACK');
});
test('restart recovery keeps an earlier failure and records the restart only when there was none',async t=>{
  const h=await harness(t),failed=await failedToBackup(h,'UNSUPPORTED_TWILIO_EVENT'),live=await h.connect(2,'+19025550109');
  await until(()=>final(h,live).status==='CONNECTED');
  const store=createVoiceSessionStore({database:h.db,clock:()=>new Date(at)});
  store.recoverActiveCalls();
  assert.deepEqual({...final(h,failed)},{status:'RECOVERED',failureCode:'UNSUPPORTED_TWILIO_EVENT',outcome:'AI_FALLBACK',minutesBilled:0});
  assert.equal(final(h,live).status,'RECOVERED');assert.equal(final(h,live).failureCode,'VOICE_RESTART_RECOVERY');
});
