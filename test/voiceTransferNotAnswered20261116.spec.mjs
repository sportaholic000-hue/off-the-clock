import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';
import {createBillingVoiceUsage} from '../server/src/billingVoiceUsage.js';
import {plainCallResult} from '../server/src/ownerMessageFormat.js';
import {callOutcomeWords,callResultWords} from '../client/src/recordWords.js';

// Owner ruling 2026-11-16: a live transfer the owner does not answer is labelled
// for what happened (never AI_FALLBACK), the caller hears that the business will
// follow up, the callback request is still saved, the call never stays live,
// and it still bills 0 minutes. Real signed HTTP and media routes from the
// voice lifecycle fixture; Twilio and Google are fakes. Expected values written
// before running.
const SENTENCE="Sorry, they couldn't pick up right now. Please tell me what you need and the best number to reach you, and the business will follow up.";
const SPOKEN=SENTENCE.replaceAll("'",'&apos;');
const OWNER_WORDS='Live transfer didn’t connect';
const row=(h,c)=>({...h.db.prepare('SELECT status,outcome,failureCode,minutesBilled,completedAt IS NOT NULL AS completed FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid)});
const active=h=>h.db.prepare("SELECT COUNT(*) n FROM calls c WHERE c.ownerId=? AND c.status IN ('CONNECTED','TRANSFERRING')").get(h.owner).n;
const period=h=>h.db.prepare("UPDATE billingAccounts SET currentPeriodStartAt='2026-10-01T00:00:00.000Z',currentPeriodEndAt='2026-11-01T00:00:00.000Z' WHERE ownerId=?").run(h.owner);
const used=h=>createBillingVoiceUsage({database:h.db,clock:()=>new Date('2026-10-06T12:00:00.000Z')}).minutesUsed(h.owner);
async function stop(c){c.ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:c.streamSid,stop:{accountSid:c.params.AccountSid,callSid:c.params.CallSid}}));await new Promise(r=>setTimeout(r,100));c.ws.close();await until(()=>c.ws.readyState===3);await new Promise(r=>setTimeout(r,100));}
async function transfer(h,c){
  c.callback.onmessage({serverContent:{inputTranscription:{text:'Can I talk to the owner about my gate?'}}});
  const result=await h.tool(c.callback,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] gate'});
  assert.equal(result.status,'transferring');
  await stop(c);
  const twiml=h.writes.find(w=>w[0]==='call')[2].twiml;
  return new URL(twiml.match(/ action="([^"]+)"/)[1]).pathname;
}

test('no answer: missed-transfer outcome, slot freed, the follow-up sentence, callback saved, 0 minutes',async t=>{
  const h=await harness(t),c=await h.connect(2);period(h);
  const result=await transfer(h,c);
  const r1=await h.post(result,{...c.params,DialCallStatus:'no-answer'});
  assert.equal(r1.status,200);assert.match(await r1.text(),/<Redirect method="POST">[^<]*\/api\/twilio\/voice\/capture\/again<\/Redirect>/);
  assert.deepEqual(row(h,c),{status:'FALLBACK',outcome:'TRANSFER_NOT_CONNECTED',failureCode:null,minutesBilled:0,completed:0});
  assert.equal(active(h),0,'the owner\'s active-call slot is free');
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM callbackRequests WHERE ownerId=?').get(h.owner).n,1);
  const again=await (await h.post('/api/twilio/voice/capture/again',c.params)).text();
  assert.ok(again.includes('>'+SPOKEN+'</Say>'),again);assert.match(again,/<Gather input="speech"/);assert.doesNotMatch(again,/got cut off/);
  assert.equal(row(h,c).outcome,'TRANSFER_NOT_CONNECTED');
  const done=await (await h.post('/api/twilio/voice/capture',{...c.params,SpeechResult:'[SYNTHETIC] Please call me back about the gate.'})).text();
  assert.match(done,/Thanks, we&apos;ll get back to you\.<\/Say><Hangup\/>/);
  assert.deepEqual(row(h,c),{status:'COMPLETED',outcome:'TRANSFER_NOT_CONNECTED',failureCode:null,minutesBilled:0,completed:1});
  await h.post('/api/twilio/voice/status',{...c.params,CallStatus:'completed',CallDuration:'300'});
  assert.equal(row(h,c).minutesBilled,0);assert.equal(row(h,c).outcome,'TRANSFER_NOT_CONNECTED');
  assert.equal(used(h),0);
  assert.equal(callOutcomeWords('TRANSFER_NOT_CONNECTED'),OWNER_WORDS);
  assert.equal(callResultWords(row(h,c)),OWNER_WORDS);
  assert.equal(plainCallResult(row(h,c)),OWNER_WORDS);
});

test('no answer, then silence: the sentence is asked again and nothing says the receptionist failed',async t=>{
  const h=await harness(t),c=await h.connect(3);
  const result=await transfer(h,c);
  await h.post(result,{...c.params,DialCallStatus:'busy'});
  await h.post('/api/twilio/voice/capture/again',c.params);
  assert.match(await (await h.post('/api/twilio/voice/capture',{...c.params,SpeechResult:''})).text(),/capture\/again/);
  assert.ok((await (await h.post('/api/twilio/voice/capture/again',c.params)).text()).includes(SPOKEN));
  for(let n=0;n<2;n++)await h.post('/api/twilio/voice/capture',{...c.params,SpeechResult:''});
  assert.deepEqual(row(h,c),{status:'COMPLETED',outcome:'TRANSFER_NOT_CONNECTED',failureCode:null,minutesBilled:0,completed:1});
});

test('the follow-up save throws: no 503, the call is never left live, the caller reaches the capture, 0 minutes',async t=>{
  const h=await harness(t),c=await h.connect(4);period(h);
  const result=await transfer(h,c);
  h.db.exec('PRAGMA foreign_keys=OFF; DROP TABLE callbackRequests;');
  const r=await h.post(result,{...c.params,DialCallStatus:'no-answer'});
  assert.equal(r.status,200);assert.match(await r.text(),/capture\/again/);
  assert.deepEqual(row(h,c),{status:'FALLBACK',outcome:'TRANSFER_NOT_CONNECTED',failureCode:null,minutesBilled:0,completed:0});
  assert.equal(active(h),0);
  assert.equal(h.db.prepare("SELECT status FROM outboxEvents WHERE ownerId=? AND eventType='voice.transfer_requested'").get(h.owner).status,'FAILED');
  const again=await (await h.post('/api/twilio/voice/capture/again',c.params)).text();
  assert.ok(again.includes(SPOKEN),again);
  await h.post('/api/twilio/voice/status',{...c.params,CallStatus:'completed',CallDuration:'240'});
  // The caller hung up on the backup line: the call ends final with its outcome.
  assert.deepEqual(row(h,c),{status:'COMPLETED',outcome:'TRANSFER_NOT_CONNECTED',failureCode:null,minutesBilled:0,completed:1});
  assert.equal(used(h),0);
});

test('every write fails: the caller hears a clear goodbye, never an application error',async t=>{
  const h=await harness(t),c=await h.connect(5);
  const result=await transfer(h,c);
  h.db.exec("CREATE TRIGGER synthetic_block BEFORE UPDATE ON calls BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;");
  const r=await h.post(result,{...c.params,DialCallStatus:'no-answer'});
  assert.equal(r.status,200);
  assert.equal(await r.text(),"<Response><Say>Sorry, they couldn&apos;t pick up right now. The business will follow up.</Say><Hangup/></Response>");
});
