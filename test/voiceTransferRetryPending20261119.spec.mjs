import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './voiceLifecycle20261006Fixture.mjs';

// Neon audit (Nov 19), confirmed: a transferCall retry while the first transfer
// is still connecting was reported as failed, and saved a callback request,
// while the transfer went ahead. A retry now reports it as still connecting.
// A transfer that actually failed or connected answers as before.
// Real signed HTTP and WebSocket calls; Twilio and Google are fakes.
// HANDWRITTEN EXPECTATIONS, before execution:
// - first try and retry both return status transferring with the same message;
//   no callback request is saved; the transfer is requested from Twilio once;
//   the transfer record stays PENDING.
// - once the transfer record is FAILED, a retry returns unavailable with a
//   callback saved (as before); once CONNECTED, a retry returns transferred.
// - after a retry, a missed transfer still ends on the backup line with one
//   callback request.
const TRANSFERRING={status:'transferring',message:'Trying to connect your call. The connection has not yet been confirmed.'};
async function start(t){
  const h=await harness(t),c=await h.connect(2);
  c.callback.onmessage({serverContent:{inputTranscription:{text:'Can I talk to the owner about my gate?'}}});
  const ask=id=>h.tool(c.callback,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] gate'},id);
  const outbox=()=>h.db.prepare("SELECT status FROM outboxEvents WHERE ownerId=? AND eventType='voice.transfer_requested'").all(h.owner).map(r=>r.status);
  const callbacks=()=>h.db.prepare('SELECT COUNT(*) n FROM callbackRequests WHERE ownerId=?').get(h.owner).n;
  const dials=()=>h.writes.filter(w=>w[0]==='call').length;
  return {h,c,ask,outbox,callbacks,dials};
}
test('a retry while the transfer is still connecting reports it as connecting, saves no callback and does not dial again',async t=>{
  const s=await start(t);
  assert.deepEqual(await s.ask('synthetic-transfer-1'),TRANSFERRING);
  for(const id of ['synthetic-transfer-2','synthetic-transfer-3'])assert.deepEqual(await s.ask(id),TRANSFERRING);
  assert.equal(s.callbacks(),0);assert.deepEqual(s.outbox(),['PENDING']);assert.equal(s.dials(),1);
});
test('a retry after the transfer failed still saves a callback; after it connected it says connected',async t=>{
  const failed=await start(t);
  await failed.ask('synthetic-transfer-1');
  failed.h.db.prepare("UPDATE outboxEvents SET status='FAILED' WHERE ownerId=? AND eventType='voice.transfer_requested'").run(failed.h.owner);
  const retry=await failed.ask('synthetic-transfer-2');
  assert.equal(retry.status,'unavailable');assert.equal(retry.callbackSaved,true);assert.equal(failed.callbacks(),1);
  const connected=await start(t);
  await connected.ask('synthetic-transfer-1');
  connected.h.db.prepare("UPDATE outboxEvents SET status='CONNECTED' WHERE ownerId=? AND eventType='voice.transfer_requested'").run(connected.h.owner);
  assert.deepEqual(await connected.ask('synthetic-transfer-2'),{status:'transferred',message:'The call was connected.'});
  assert.equal(connected.callbacks(),0);
});
test('after a retry, a missed transfer still ends on the backup line with one callback request',async t=>{
  const s=await start(t);
  await s.ask('synthetic-transfer-1');await s.ask('synthetic-transfer-2');
  s.c.ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:s.c.streamSid,stop:{accountSid:s.c.params.AccountSid,callSid:s.c.params.CallSid}}));
  await new Promise(r=>setTimeout(r,100));s.c.ws.close();
  const twiml=s.h.writes.find(w=>w[0]==='call')[2].twiml,result=new URL(twiml.match(/ action="([^"]+)"/)[1]).pathname;
  const r=await s.h.post(result,{...s.c.params,DialCallStatus:'no-answer'});
  assert.equal(r.status,200);assert.match(await r.text(),/\/api\/twilio\/voice\/capture\/again/);
  assert.equal(s.callbacks(),1);
  const row=s.h.db.prepare('SELECT status,outcome,minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(s.h.owner,s.c.params.CallSid);
  assert.deepEqual({...row},{status:'FALLBACK',outcome:'TRANSFER_NOT_CONNECTED',minutesBilled:0});
});
