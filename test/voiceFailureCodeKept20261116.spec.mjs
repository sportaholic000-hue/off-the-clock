import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './voiceLifecycle20261006Fixture.mjs';

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
