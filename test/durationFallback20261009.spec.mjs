import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,A} from './overageMinute20261006Fixture.mjs';
import {createVoiceDurationRecovery} from '../server/src/voiceDurationRecovery.js';

// Written before execution: verification/duration-fallback-20261009/EXPECTED.md.
const minute=60_000,day=86_400_000,accountSid='AC'+'a'.repeat(32);
function setup(t,{status='AI_FALLBACK',ordinary=false}={}){
  const f=fixture(t);f.activate();
  if(ordinary)f.call(18_000,{provider:true}); // 300 included minutes.
  const call=f.call(600,{provider:false,fallback:!ordinary}),aiEnd=f.clock().getTime();
  const ownerQuery=sql=>{assert.match(sql,/\bownerId\b/);return f.db.prepare(sql);};
  if(!ordinary)ownerQuery('UPDATE calls SET status=?,completedAt=NULL WHERE ownerId=? AND id=?').run(status,A,call.id);
  const reads=[];let outage=false,duration='600';
  const worker=createVoiceDurationRecovery({database:f.db,ownerQuery,clock:f.clock,
    env:{TWILIO_ACCOUNT_SID:accountSid,TWILIO_API_KEY_SID:'SK'+'b'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC-only'},
    fetchImpl:async(url,init)=>{reads.push({url,method:init.method});assert.equal(init.method,'GET');if(outage)throw Error('SYNTHETIC outage');return {ok:true,json:async()=>({account_sid:accountSid,sid:call.context.callSid,from:call.context.from,to:call.context.to,direction:'inbound',status:'completed',duration})};},
    onUsage:ownerId=>f.service.syncOwner(ownerId)});
  return {...f,call,aiEnd,reads,worker,ownerQuery,
    state:()=>ownerQuery('SELECT * FROM voiceDurationRecovery WHERE ownerId=? AND callId=?').get(A,call.id),
    usage:()=>ownerQuery('SELECT * FROM billingVoiceUsage WHERE ownerId=? AND callId=?').get(A,call.id),
    phoneEnd(at){ownerQuery('UPDATE calls SET completedAt=? WHERE ownerId=? AND id=?').run(new Date(at).toISOString(),A,call.id);duration=String((at-aiEnd)/1000+600);},
    outage(value){outage=value;}};
}
for(const status of ['FALLBACK','AI_FALLBACK']){
  for(const [label,elapsed] of [['10 minutes',10*minute],['1 hour',60*minute],['8 days',8*day]]){
    test(`duration fallback: live ${status} at ${label} consumes no read or recovery row`,async t=>{
      const f=setup(t,{status});assert.ok(f.usage().completedAt);f.setTime(f.aiEnd+elapsed);await f.worker.processOwner(A);
      assert.equal(f.reads.length,0);assert.equal(f.state(),undefined);assert.equal(f.usage().providerDigest,null);
    });
  }
  test(`duration fallback: ended ${status} waits ten minutes from phone end and still bills zero`,async t=>{
    const f=setup(t,{status}),T=f.aiEnd+60*minute;f.phoneEnd(T);
    f.setTime(T+599_999);await f.worker.processOwner(A);assert.equal(f.reads.length,0);assert.equal(f.state(),undefined);
    f.setTime(T+600_000);await f.worker.processOwner(A);assert.equal(f.reads.length,1);assert.equal(f.state().attempts,1);assert.ok(f.state().confirmedAt);assert.equal(f.state().gaveUpAt,null);
    assert.equal(f.usage().providerDurationSeconds,4200);
    assert.equal(f.ownerQuery('SELECT minutesBilled FROM calls WHERE ownerId=? AND id=?').get(A,f.call.id).minutesBilled,0);
    assert.deepEqual([f.meter.minutesUsed(A),f.service.snapshot(A).overageCents],[0,0]);
  });
  test(`duration fallback: ${status} seven-day give-up starts at phone end, eight days after AI end`,async t=>{
    const f=setup(t,{status}),T=f.aiEnd+8*day;f.phoneEnd(T);f.outage(true);
    f.setTime(T+600_000);await f.worker.processOwner(A);assert.equal(f.reads.length,1);assert.equal(f.state().gaveUpAt,null);
    f.setTime(T+6*day);await f.worker.processOwner(A);assert.equal(f.reads.length,2);assert.equal(f.state().gaveUpAt,null);
    f.setTime(T+7*day);await f.worker.processOwner(A);assert.equal(f.reads.length,2);assert.equal(f.state().gaveUpAt,new Date(T+7*day).toISOString());
    f.setTime(T+8*day);await f.worker.processOwner(A);assert.equal(f.reads.length,2);assert.equal(f.state().attempts,2);assert.equal(f.usage().providerDigest,null);
    assert.equal(f.ownerQuery('SELECT minutesBilled FROM calls WHERE ownerId=? AND id=?').get(A,f.call.id).minutesBilled,0);assert.equal(f.service.snapshot(A).overageCents,0);
  });
}
test('duration fallback: ordinary completed call still recovers 10 minutes and exactly 350 cents',async t=>{
  const f=setup(t,{ordinary:true});
  f.setTime(f.aiEnd+599_999);await f.worker.processOwner(A);assert.equal(f.reads.length,0);
  f.setTime(f.aiEnd+600_000);await f.worker.processOwner(A);assert.equal(f.reads.length,1);
  const usage=f.service.snapshot(A);assert.deepEqual([usage.minutesUsed,usage.overageCents,usage.unchargedCents],[310,350,350]);assert.equal(f.fakes.invoices.size,0);
});
