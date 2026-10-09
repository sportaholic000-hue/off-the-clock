import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture,A,B,SIGNUP} from './overageMinute20261006Fixture.mjs';
import {readFileSync} from 'node:fs';
const recovery=await import('../server/src/voiceDurationRecovery.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const accountSid='AC'+'a'.repeat(32),env={TWILIO_ACCOUNT_SID:accountSid,TWILIO_API_KEY_SID:'SK'+'b'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC-secret'};
function setup(t){
 const f=fixture(t),reads=[],records=new Map(),sql=[];let fault=false;
 const ownerQuery=statement=>{assert.match(statement,/\bownerId\b/);sql.push(statement);return f.db.prepare(statement);};
 const fetchImpl=async(url,init)=>{reads.push({url,method:init.method});assert.equal(init.method,'GET');if(fault)throw Error('SYNTHETIC outage');return {ok:true,json:async()=>structuredClone(records.get(url.match(/(CA[0-9a-f]{32})\.json$/)[1]))};};
 function worker(){assert.equal(typeof recovery.createVoiceDurationRecovery,'function','Missing duration recovery job is absent on the base');return recovery.createVoiceDurationRecovery({database:f.db,ownerQuery,clock:f.clock,env,fetchImpl,onUsage:id=>f.service.syncOwner(id)});}
 function call(seconds,options={}){const c=f.call(seconds,{provider:false,...options});const record={account_sid:c.context.accountSid,sid:c.context.callSid,from:c.context.from,to:c.context.to,direction:'inbound',status:'completed',duration:String(seconds),end_time:f.clock().toUTCString()};records.set(c.context.callSid,record);return {...c,record,ended:f.clock().getTime()};}
 const due=c=>f.setTime(c.ended+600000);
 const usage=c=>ownerQuery('SELECT * FROM billingVoiceUsage WHERE ownerId=? AND callId=?').get(c.context.ownerId,c.id);
 return {...f,reads,records,sql,worker,call,due,usage,outage:value=>{fault=value;}};
}
test('calls audit 1: missing callback recovered by GET adds exactly 350 cents, late callback and restart count once',async t=>{
 const f=setup(t);f.activate();f.call(300*60,{provider:true});const c=f.call(600);assert.equal(f.service.snapshot(A).overageCents,0);f.due(c);
 const w=f.worker();await w.processOwner(A);assert.deepEqual(f.reads,[{url:`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${c.context.callSid}.json`,method:'GET'}]);
 const v=f.service.snapshot(A);assert.deepEqual([v.minutesUsed,v.overageCents,v.unchargedCents,v.unconfirmedCalls],[310,350,350,0]);
 assert.equal(f.usage(c).providerDurationSeconds,600);assert.match(f.usage(c).providerDigest,/^[a-f0-9]{64}$/);
 const evidence=f.db.prepare('SELECT * FROM voiceDurationRecovery WHERE ownerId=? AND callId=?').get(A,c.id);
 assert.equal(evidence.recordDigest,createHash('sha256').update(JSON.stringify(c.record)).digest('hex'));assert.equal(evidence.fetchedStatus,'completed');assert.ok(evidence.confirmedAt);
 f.meter.providerComplete(c.receipt);await f.worker().processOwner(A);assert.equal(f.reads.length,1);assert.equal(f.service.snapshot(A).overageCents,350);
 assert.throws(()=>f.meter.providerComplete({...c.receipt,CallDuration:'660'}),/Conflicting/);assert.equal(f.service.snapshot(A).overageCents,350);
});
test('calls audit 1: trial recovered 61 seconds uses two minutes and zero cents',async t=>{
 const f=setup(t);f.setTime(SIGNUP);f.subscription(A,{status:'trialing',start:SIGNUP});const c=f.call(61);f.due(c);await f.worker().processOwner(A);
 const v=f.service.snapshot(A);assert.deepEqual([f.meter.minutesUsed(A),v.minutesLeft,v.overageCents],[2,58,0]);
});
test('calls audit 1: an ended call without a metering row is recovered through the callback path',async t=>{
 const f=setup(t);f.activate();const c=f.call(61);f.db.prepare('DELETE FROM billingVoiceUsage WHERE ownerId=? AND callId=?').run(A,c.id);f.due(c);await f.worker().processOwner(A);
 assert.equal(f.reads.length,1);assert.equal(f.usage(c).providerDurationSeconds,61);assert.equal(f.meter.minutesUsed(A),2);
});
for(const [field,value] of [['account_sid','AC'+'f'.repeat(32)],['sid','CA'+'f'.repeat(32)],['from','+19025550999'],['to','+19025550999'],['direction','outbound-api'],['status','in-progress'],['duration','1.5'],['duration',null],['duration','-1']])test(`calls audit 1: fetched ${field}=${value} is refused`,async t=>{
 const f=setup(t);f.activate();const c=f.call(600);c.record[field]=value;f.due(c);await f.worker().processOwner(A);
 assert.equal(f.reads.length,1);assert.equal(f.usage(c).providerDigest,null);assert.equal(f.service.snapshot(A).minutesUsed,0);
});
for(const kind of ['failed','spam'])test('calls audit 1: recovered '+kind+' call remains zero',async t=>{
 const f=setup(t);f.activate();const c=f.call(600,{spam:kind==='spam',fallback:kind==='failed'});f.due(c);await f.worker().processOwner(A);
 assert.equal(f.reads.length,1);assert.equal(f.usage(c).providerDurationSeconds,600);assert.equal(f.db.prepare('SELECT minutesBilled FROM calls WHERE ownerId=? AND id=?').get(A,c.id).minutesBilled,0);assert.equal(f.service.snapshot(A).overageCents,0);assert.equal(f.meter.minutesUsed(A),0);
});
test('calls audit 1: ten-minute boundary, active calls and tenant isolation',async t=>{
 const f=setup(t);f.activate();f.activate(B);const c=f.call(600),other=f.call(600,{ownerId:B});const w=f.worker();f.setTime(c.ended+599999);await w.processOwner(A);assert.equal(f.reads.length,0);
 f.due(c);await w.processOwner(A);assert.equal(f.reads.length,1);assert.equal(f.usage(other).providerDigest,null);
 const active=f.call(60);f.db.prepare('UPDATE calls SET status=?,completedAt=NULL WHERE ownerId=? AND id=?').run('CONNECTED',A,active.id);f.db.prepare('UPDATE billingVoiceUsage SET completedAt=NULL WHERE ownerId=? AND callId=?').run(A,active.id);f.due(active);await w.processOwner(A);assert.equal(f.reads.length,1);
});
test('calls audit 1: retry backoff survives restart and stops at seven days',async t=>{
 const f=setup(t);f.activate();const c=f.call(600);f.due(c);f.outage(true);await f.worker().processOwner(A);assert.equal(f.reads.length,1);
 f.setTime(c.ended+600000+299999);await f.worker().processOwner(A);assert.equal(f.reads.length,1);
 f.setTime(c.ended+900000);await f.worker().processOwner(A);assert.equal(f.reads.length,2);
 f.setTime(c.ended+900000+599999);await f.worker().processOwner(A);assert.equal(f.reads.length,2);
 f.setTime(c.ended+7*86400000);f.outage(false);await f.worker().processOwner(A);assert.equal(f.reads.length,2);assert.equal(f.usage(c).providerDigest,null);assert.equal(f.service.snapshot(A).unconfirmedCalls,1);
 assert.ok(f.db.prepare('SELECT gaveUpAt FROM voiceDurationRecovery WHERE ownerId=? AND callId=?').get(A,c.id).gaveUpAt);
 f.setTime(c.ended+8*86400000);await f.worker().processOwner(A);assert.equal(f.reads.length,2);
});
test('calls audit 1: retry can recover later and simultaneous workers reserve only one read',async t=>{
 const f=setup(t);f.activate();const c=f.call(600);f.due(c);f.outage(true);await f.worker().processOwner(A);f.outage(false);f.setTime(c.ended+900000);
 await Promise.all([f.worker().processOwner(A),f.worker().processOwner(A)]);assert.equal(f.reads.length,2);assert.equal(f.service.snapshot(A).minutesUsed,10);
});
test('calls audit 1: scheduled worker ticks and stops without provider writes',async t=>{
 const f=setup(t);f.activate();const c=f.call(600);f.due(c);const w=f.worker();let run,cleared=false;const stop=w.start({setTimer:fn=>{run=fn;return {unref(){}};},clearTimer:()=>{cleared=true;}});
 await w.tick();assert.equal(f.reads.length,1);await stop();await run();assert.equal(cleared,true);assert.equal(f.reads.length,1);
});
test('calls audit 1: production starts and stops the recovery worker',()=>{
 const source=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');assert.ok(source.includes('createVoiceDurationRecovery('),'production recovery startup is missing');assert.ok(source.includes('stopDurationRecovery'),'production recovery shutdown is missing');
});
test('calls audit 1: expired recovery remains a pending count after the allowance month ends',async t=>{
 const f=setup(t);f.activate();const c=f.call(600);f.setTime('2026-11-21T12:00:00.000Z');
 if(recovery.createVoiceDurationRecovery)await f.worker().processOwner(A);
 const v=f.service.snapshot(A);assert.equal(v.unconfirmedCalls,1);assert.deepEqual(v.pendingCharges,[]);assert.equal(f.fakes.invoices.size,0);assert.equal(f.usage(c).providerDigest,null);
});
