import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';

// Backup line (request capture) with a silent caller. Fakes only: the voice
// fixture runs a failing synthetic receptionist; no Twilio or Gemini is called.
// Expected before the change: every empty result redirects to /capture/again,
// so a third silence still redirects instead of ending the call.
const CAPTURE='/api/twilio/voice/capture';
const THANKS="<Response><Say>Thanks, we&apos;ll get back to you.</Say><Hangup/></Response>";
const AGAIN=/^<Response><Redirect method="POST">[^<]*\/api\/twilio\/voice\/capture\/again<\/Redirect><\/Response>$/;

async function onBackupLine(h,n){
  const c=await h.connect(n);await until(()=>c.ws.readyState===3);
  await h.post(c.fallback,c.params);
  return c;
}
const silence=async(h,c)=>(await h.post(CAPTURE,c.params)).text();
const call=(h,c)=>h.db.prepare('SELECT * FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid);

test('empty, empty, empty: the third silence ends the call with the thank-you line',async t=>{
  const h=await harness(t,{fail:true}),c=await onBackupLine(h,1);
  assert.match(await silence(h,c),AGAIN);
  assert.match(await (await h.post(CAPTURE+'/again',c.params)).text(),/<Gather input="speech"[^>]*actionOnEmptyResult="true"/);
  assert.match(await silence(h,c),AGAIN);
  const third=await silence(h,c);
  assert.equal(third,THANKS);
  assert.doesNotMatch(third,/<Dial|<Redirect|<Gather/);
  const row=call(h,c);
  assert.equal(row.status,'COMPLETED');
  assert.ok(row.completedAt);
  assert.equal(row.fallbackEmptyCount,3);
  // The owner still has the call and its saved request record.
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM leads WHERE ownerId=? AND callId=?').get(h.owner,row.id).n,1);
  // A late callback after the hang-up does not ask again.
  assert.equal(await silence(h,c),'<Response><Hangup/></Response>');
});

test('words heard before the last silence stay saved when the call ends',async t=>{
  const h=await harness(t,{fail:true}),c=await onBackupLine(h,1);
  assert.equal((await h.post(CAPTURE+'/partial',{...c.params,UnstableSpeechResult:'[SYNTHETIC] my gate is broken'})).status,204);
  for(let n=0;n<2;n++)assert.match(await silence(h,c),AGAIN);
  assert.equal(await silence(h,c),THANKS);
  const row=call(h,c);
  assert.match(row.transcriptJson,/my gate is broken/);
  assert.match(h.db.prepare('SELECT collectedInputsJson FROM leads WHERE ownerId=? AND callId=?').get(h.owner,row.id).collectedInputsJson,/my gate is broken/);
});

test('speech on the second try is captured as today',async t=>{
  const h=await harness(t,{fail:true}),c=await onBackupLine(h,1);
  assert.match(await silence(h,c),AGAIN);
  const spoken=await (await h.post(CAPTURE,{...c.params,SpeechResult:'[SYNTHETIC] Please fix my fence'})).text();
  assert.equal(spoken,THANKS);
  const row=call(h,c);
  assert.equal(row.status,'COMPLETED');
  assert.equal(row.fallbackEmptyCount,1);
  assert.match(row.transcriptJson,/Please fix my fence/);
});

test('the silence count is kept per call',async t=>{
  const h=await harness(t,{fail:true}),first=await onBackupLine(h,1),second=await onBackupLine(h,2);
  assert.match(await silence(h,first),AGAIN);
  assert.match(await silence(h,first),AGAIN);
  assert.match(await silence(h,second),AGAIN);
  assert.equal(await silence(h,first),THANKS);
  assert.equal(call(h,second).fallbackEmptyCount,1);
  assert.notEqual(call(h,second).status,'COMPLETED');
  assert.match(await silence(h,second),AGAIN);
  assert.equal(await silence(h,second),THANKS);
});
