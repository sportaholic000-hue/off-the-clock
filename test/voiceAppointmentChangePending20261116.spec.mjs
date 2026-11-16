import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';

// Owner ruling 2026-11-16: a reschedule or cancellation that the booking
// service reports as PENDING_CONFIRMATION is handled like a pending booking:
// the caller is told it is not confirmed yet, no callback lead is created and
// the change is not marked failed; the background reconciler finishes it. A
// real failure still behaves as before. Expected values written before running.
const PENDING='The appointment change is not confirmed yet. Calendar confirmation is still pending.';
async function setup(t,answers){
  const calls=[];let next=0;
  const h=await harness(t,{install:{bookingService:{modifyAppointment:async input=>{calls.push(input);const value=answers[Math.min(next++,answers.length-1)];return {appointmentId:'synthetic-appointment',action:'cancel',...value};}}}});
  const c=await h.connect();
  h.db.prepare("INSERT INTO appointments(id,ownerId,status,customerJson,createdAt) VALUES('synthetic-appointment',?,'CONFIRMED',?,'2026-10-06T12:00:00.000Z')").run(h.owner,JSON.stringify({phone:c.params.From,name:'Sally Synthetic'}));
  const first=await h.tool(c.callback,'getCustomerContext',{});
  c.callback.onmessage({serverContent:{outputTranscription:{text:first.message},turnComplete:true}});
  c.callback.onmessage({serverContent:{inputTranscription:{text:'Yes, speaking.'}}});
  await until(()=>JSON.parse(h.db.prepare('SELECT transcriptJson FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).transcriptJson).some(turn=>turn.text==='Yes, speaking.'));
  const found=await h.tool(c.callback,'getCustomerContext',{callerConfirmedIdentity:true});
  assert.equal(found.status,'found');
  const handle=found.recentAppointments[0].split(' — ')[0];
  const outbox=()=>h.db.prepare("SELECT id,status FROM outboxEvents WHERE ownerId=? AND eventType='voice.appointment_change_requested'").all(h.owner).map(r=>({...r}));
  const callbacks=()=>h.db.prepare("SELECT COUNT(*) n FROM leads WHERE ownerId=? AND type='CALLBACK'").get(h.owner).n;
  const change=()=>h.tool(c.callback,'modifyAppointment',{appointmentHandle:handle,action:'cancel',customerConfirmed:true});
  return {h,c,calls,outbox,callbacks,change};
}

test('PENDING_CONFIRMATION: told it is not confirmed yet, no callback lead, outbox not failed; a retry and the reconciler finish it',async t=>{
  const s=await setup(t,[{status:'PENDING_CONFIRMATION'}]);
  const result=await s.change();
  assert.equal(result.status,'pending_confirmation');assert.equal(result.message,PENDING);assert.equal(typeof result.appointmentHandle,'string');
  assert.deepEqual(s.outbox().map(r=>r.status),['PENDING']);
  assert.equal(s.callbacks(),0);
  assert.equal(s.calls[0].idempotencyKey,s.outbox()[0].id);
  // The model asks again while still pending: the same request is checked again, not reported as failed.
  const retry=await s.change();
  assert.equal(retry.status,'pending_confirmation');assert.equal(retry.message,PENDING);
  assert.equal(s.calls.length,2);assert.equal(s.calls[1].idempotencyKey,s.calls[0].idempotencyKey);
  assert.equal(s.callbacks(),0);assert.deepEqual(s.outbox().map(r=>r.status),['PENDING']);
  // bookingService.finishChange's own statement when its reconciler confirms the change.
  s.h.db.prepare("UPDATE outboxEvents SET status=?,updatedAt=? WHERE ownerId=? AND id=? AND eventType='voice.appointment_change_requested'").run('CONFIRMED','2026-10-06T12:01:00.000Z',s.h.owner,s.calls[0].idempotencyKey);
  const later=await s.change();
  assert.equal(later.status,'cancelled');assert.equal(later.message,'The appointment change was confirmed.');
  assert.equal(s.callbacks(),0);
});

test('a real failure still fails as before: outbox FAILED, callback lead, "could not be confirmed"',async t=>{
  const s=await setup(t,[{status:'REJECTED',reason:'CALENDAR_REQUEST_REJECTED'}]);
  const result=await s.change();
  assert.deepEqual(result,{status:'unavailable',message:'The appointment change could not be confirmed.'});
  assert.deepEqual(s.outbox().map(r=>r.status),['FAILED']);
  assert.equal(s.callbacks(),1);
});

test('a pending change the reconciler later rejects is reported as failed on the next ask',async t=>{
  const s=await setup(t,[{status:'PENDING_CONFIRMATION'}]);
  await s.change();
  s.h.db.prepare("UPDATE outboxEvents SET status='FAILED' WHERE ownerId=? AND id=?").run(s.h.owner,s.calls[0].idempotencyKey);
  const result=await s.change();
  assert.deepEqual(result,{status:'unavailable',message:'The appointment change could not be confirmed.'});
  assert.equal(s.callbacks(),1);
});
