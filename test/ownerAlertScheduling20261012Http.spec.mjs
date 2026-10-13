import test from 'node:test';
import assert from 'node:assert/strict';
import {httpFixture} from './leadCaptureRepair20261006HttpFixture.mjs';
test('owner alert scheduling: opt-in paused worker preserves PENDING until explicit real-worker dispatch',async t=>{
  const f=await httpFixture(t,{controlledOwnerAlertWorker:true}),c=f.context();
  await f.voice(c).tool('captureLead',{callbackRequested:true,notes:'[SYNTHETIC] Controlled callback'});
  f.db.prepare("UPDATE ownerAlerts SET status='FAILED' WHERE ownerId=?").run(c.ownerId);
  const {id}=f.db.prepare("SELECT id FROM ownerAlerts WHERE ownerId=? AND eventType='callback.requested'").get(c.ownerId);
  assert.deepEqual(await f.request('/api/owner-alerts/'+id+'/retry',c.ownerId,{method:'POST',body:{}}),{status:200,body:{status:'PENDING'}});
  const read=async()=> (await f.request('/api/calls/'+c.callSid)).body.notifications.find(a=>a.id===id);
  assert.equal((await read()).status,'PENDING');
  assert.deepEqual(await f.dispatchOwnerAlerts(),{processed:0});
  const actual=await read();assert.equal(actual.status,'BLOCKED');assert.equal(actual.lastErrorCode,'EMAIL_NOT_CONFIGURED');assert.equal(actual.attemptCount,0);
});
