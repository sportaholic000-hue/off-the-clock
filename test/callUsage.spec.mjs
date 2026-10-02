import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {Worker} from 'node:worker_threads';
import {billedCallMinutes} from '../server/src/usagePolicy.js';
import {createBillingStateService} from '../server/src/billingStateService.js';
import {fixture,START,END,usageConfig} from './helpers/usageFixture.mjs';

function close(t,f){t.after(()=>f.database.close());return f;}
test('minute math uses exact milliseconds and ceiling per call, including zero and whole-minute edges',()=>{
  for(const [duration,minutes] of [[0,0],[1,1],[59999,1],[60000,1],[60001,2],[119999,2],[120000,2],[120001,3]]) {
    assert.equal(billedCallMinutes(START,START+duration).minutes,minutes);
  }
  assert.throws(()=>billedCallMinutes(START,START-1));
  assert.throws(()=>billedCallMinutes('2026-02-30T00:00:00.000Z',START));
  assert.throws(()=>billedCallMinutes(START+0.5,START+60000));
});
test('dashboard snapshot matches the exact immutable recorded calls, with no aggregate rounding',t=>{
  const f=close(t,fixture());f.owner();f.capture();
  for(const [id,duration] of [['a',30000],['b',30000],['c',60001]])f.report(id,duration);
  const result=f.service.getUsageSnapshot('A');
  assert.equal(result.minutesUsed,4);assert.equal(result.minutesRemaining,296);
  assert.equal(result.includedMinutes,300);assert.equal(result.overageCents,0);
  assert.deepEqual(f.service.getUsageHistory('A').map(r=>r.minutesBilled),[1,1,2]);
  assert.equal(f.database.prepare("SELECT SUM(minutesBilled) AS used FROM calls WHERE ownerId='A'").get().used,4);
  assert.throws(()=>f.database.prepare("UPDATE callUsageRecords SET minutesBilled=99 WHERE ownerId='A'").run(),/immutable/);
});
test('repeated reports are idempotent and changed reports conflict without replacing the original',t=>{
  const f=close(t,fixture());f.owner();f.capture();assert.equal(f.report('repeat',60001).status,'RECORDED');
  assert.equal(f.report('repeat',60001).status,'DUPLICATE');
  assert.throws(()=>f.report('repeat',60000),e=>e.code==='CALL_USAGE_CONFLICT');
  assert.throws(()=>f.report('repeat',60001,{spamFiltered:true}),e=>e.code==='CALL_USAGE_CONFLICT');
  assert.equal(f.service.getUsageSnapshot('A').minutesUsed,2);
});
test('eight independent connections concurrently reporting one call write one ledger row and one call',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'otc-usage-')),filename=join(dir,'usage.sqlite');let again;
  t.after(()=>{again?.database.close();assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.ok(dir.includes('otc-usage-'));rmSync(dir,{recursive:true,force:true});});
  const f=fixture({filename});f.owner();f.capture();f.database.close();
  const report={tenantOwnerId:'A',callId:'concurrent',answeredStartAt:new Date(START+1000).toISOString(),
    answeredEndAt:new Date(START+61001).toISOString(),spamFiltered:false};
  const results=await Promise.all(Array.from({length:8},()=>new Promise((res,rej)=>{
    const w=new Worker(new URL('./helpers/usageReportWorker.mjs',import.meta.url),{workerData:{filename,now:START+86400000,report}});
    let result;w.once('message',value=>{result=value;});w.once('error',rej);w.once('exit',code=>code===0?res(result):rej(Error('Worker exit '+code)));
  })));
  assert.equal(results.filter(x=>x.status==='RECORDED').length,1);assert.equal(results.filter(x=>x.status==='DUPLICATE').length,7);
  again=fixture({filename});assert.equal(again.service.getUsageHistory('A').length,1);
  assert.equal(again.database.prepare('SELECT COUNT(*) AS n FROM calls').get().n,1);
  assert.equal(again.service.getUsageSnapshot('A').minutesUsed,2);
});
test('tenant isolation includes global call-ID conflicts, snapshots and historical records',t=>{
  const f=close(t,fixture());f.owner('A');f.owner('B','QuoteDone');f.capture('A');f.capture('B',{plan:'QuoteDone'});
  f.report('A-call',60001);f.report('B-call',180000,{ownerId:'B'});
  assert.throws(()=>f.report('A-call',60001,{ownerId:'B'}),e=>e.code==='CALL_USAGE_CONFLICT');
  assert.equal(f.service.getUsageSnapshot('A').minutesUsed,2);assert.equal(f.service.getUsageSnapshot('B').minutesUsed,3);
  assert.equal(f.service.getUsageSnapshot('B').includedMinutes,1200);
  assert.deepEqual(f.service.getUsageHistory('B').map(x=>x.callId),['B-call']);
  assert.throws(()=>f.service.getUsageSnapshot('missing'),e=>e.code==='USAGE_OWNER_NOT_FOUND');
});
test('spam and a persisted AI fallback are excluded from allowances and billing',t=>{
  const f=close(t,fixture());f.owner();f.capture();
  f.report('spam',600000,{spamFiltered:true});
  f.database.prepare("INSERT INTO calls(id,ownerId,callSid,status,createdAt) VALUES ('fallback','A','fallback-call','FALLBACK',?)").run(new Date(START).toISOString());
  assert.equal(f.report('fallback-call',600000).exclusion,'AI_FALLBACK');
  assert.equal(f.service.getUsageSnapshot('A').minutesUsed,0);
  assert.deepEqual(f.service.getUsageHistory('A').map(x=>x.exclusion),['AI_FALLBACK','SPAM']);
  f.setTime(END);assert.equal(f.service.queueClosedPeriod('A',f.service.getUsageHistory('A')[0].period.id),null);
});
test('both offered plans use the same records for allowance, remaining and 35-cent overage',t=>{
  for(const [plan,cap] of [['Operator',300],['QuoteDone',1200]]) {
    const f=close(t,fixture());f.owner('A',plan);f.capture('A',{plan});
    f.report('included',cap*60000);assert.equal(f.service.getUsageSnapshot('A').minutesRemaining,0);
    assert.equal(f.service.getUsageSnapshot('A').overageCents,0);
    f.report('overage',1);const usage=f.service.getUsageSnapshot('A');
    assert.equal(usage.minutesUsed,cap+1);assert.equal(usage.overageMinutes,1);assert.equal(usage.overageCents,35);
    assert.equal(f.service.getCallAllowanceDecision('A').reason,'PAID_OVERAGE');
  }
});
test('trial 59/60 boundary blocks the next call and absorbs the current call overrun',t=>{
  const f=close(t,fixture());f.owner('A','Operator','monthly','trialing');f.capture('A',{status:'trialing',trial:true,end:START+14*86400000});
  f.report('59',59*60000);assert.equal(f.service.getCallAllowanceDecision('A').canStartNewCall,true);
  f.report('60',60000);assert.equal(f.service.getCallAllowanceDecision('A').canStartNewCall,false);
  assert.equal(f.service.getCallAllowanceDecision('A',{callInProgress:true}).canContinueCurrentCall,true);
  f.report('finishing-call',120000);const u=f.service.getUsageSnapshot('A');
  assert.equal(u.minutesUsed,62);assert.equal(u.minutesRemaining,0);assert.equal(u.overageMinutes,0);assert.equal(u.overageCents,0);
});
test('a whole rounded call belongs to answered start, including an exact reset and late completion',t=>{
  const f=close(t,fixture({now:END+86400000}));f.owner();f.capture();
  const march=Date.UTC(2026,2,31,15);f.capture('A',{start:END,end:march});
  f.report('crossing',90000,{start:END-30000});
  f.report('at-reset',60000,{start:END});
  assert.equal(f.service.getUsageSnapshot('A').minutesUsed,1);
  assert.equal(f.service.getUsageSnapshot('A',END-1).minutesUsed,2);
  assert.equal(f.service.getUsageHistory('A')[0].period.endAt,new Date(END).toISOString());
});
test('a call begun during the trial remains free even when completed after paid activation',t=>{
  const trialEnd=START+14*86400000,f=close(t,fixture({now:trialEnd+86400000}));
  f.owner('A','QuoteDone','annual','trialing');
  f.capture('A',{plan:'QuoteDone',interval:'annual',trial:true,status:'trialing',end:trialEnd});
  f.database.prepare("UPDATE users SET planStatus='active',trialEndsAt=NULL WHERE id='A'").run();
  f.capture('A',{plan:'QuoteDone',interval:'annual',trial:true,start:trialEnd,end:Date.UTC(2026,2,14,15)});
  f.report('trial-crossing',90000,{start:trialEnd-30000});
  assert.equal(f.service.getUsageSnapshot('A').minutesUsed,0);
  const record=f.service.getUsageHistory('A')[0];assert.equal(record.minutesBilled,2);assert.equal(record.period.kind,'TRIAL');
  assert.equal(f.service.queueClosedPeriod('A',record.period.id),null);
});
test('annual base prices preserve monthly allowances and verified short-month windows for both tiers',t=>{
  for(const plan of ['Operator','QuoteDone']) {
    const f=close(t,fixture());f.owner('A',plan,'annual');f.capture('A',{plan,interval:'annual'});
    const u=f.service.getUsageSnapshot('A');assert.equal(u.includedMinutes,plan==='Operator'?300:1200);assert.equal(u.period.endAt,new Date(END).toISOString());
    f.report('old',60000);f.setTime(END+86400000);f.capture('A',{plan,interval:'annual',start:END,end:Date.UTC(2026,2,31,15)});
    assert.equal(f.service.getUsageSnapshot('A').minutesUsed,0);
  }
});
test('upgrade increases the allowance without resetting usage; downgrade keeps it until renewal',t=>{
  const f=close(t,fixture());f.owner();f.capture();f.report('used',400*60000);
  f.database.prepare("UPDATE billingAccounts SET stripePriceId='price_quote' WHERE ownerId='A'").run();
  f.database.prepare("UPDATE users SET plan='QuoteDone' WHERE id='A'").run();
  f.capture('A',{plan:'QuoteDone'});let u=f.service.getUsageSnapshot('A');assert.equal(u.minutesUsed,400);assert.equal(u.includedMinutes,1200);assert.equal(u.overageCents,0);
  f.database.prepare("UPDATE billingAccounts SET stripePriceId='price_operator' WHERE ownerId='A'").run();
  f.database.prepare("UPDATE users SET plan='Operator' WHERE id='A'").run();
  f.capture();assert.equal(f.service.getUsageSnapshot('A').includedMinutes,1200);
  f.setTime(END+86400000);f.capture('A',{start:END,end:Date.UTC(2026,2,31,15)});u=f.service.getUsageSnapshot('A');
  assert.equal(u.includedMinutes,300);assert.equal(u.minutesUsed,0);
});
test('reports arriving before verified period evidence remain durable and are assigned when evidence arrives',t=>{
  const f=close(t,fixture());f.owner();assert.equal(f.report('pending',60001).status,'PERIOD_PENDING');
  assert.equal(f.service.getUsageSnapshot('A').available,false);
  assert.equal(f.service.getCallAllowanceDecision('A').canStartNewCall,false);
  f.capture();assert.equal(f.service.getUsageSnapshot('A').minutesUsed,2);assert.equal(f.report('pending',60001).status,'DUPLICATE');
});
test('invalid fields, future completion, cross-tenant source and overlapping periods fail closed',t=>{
  const f=close(t,fixture());f.owner('A');f.owner('B');f.capture('A');
  assert.throws(()=>f.service.recordCompletedCall({tenantOwnerId:'A',callId:'bad',answeredStartAt:START,answeredEndAt:START+1,spamFiltered:false,credentials:'bad'}));
  assert.throws(()=>f.report('future',1,{start:f.clock()+1000}),e=>e.code==='CALL_NOT_COMPLETED');
  assert.throws(()=>f.service.captureVerifiedSubscription({ownerId:'B',subscription:f.subscription('A'),sourceEventId:'evt_cross'}),e=>e.code==='USAGE_SUBSCRIPTION_BINDING_INVALID');
  assert.throws(()=>f.capture('A',{start:START+1000}),e=>e.code==='VERIFIED_USAGE_PERIOD_OVERLAP');
  assert.equal(f.service.getUsageHistory('A').length,0);
});
test('verified event receipts prevent altered period replay and survive subscription replacement',t=>{
  const f=close(t,fixture());f.owner();const sub=f.subscription();
  const input={ownerId:'A',subscription:sub,sourceEventId:'evt_same'};f.service.captureVerifiedSubscription(input);
  assert.equal(f.service.captureVerifiedSubscription(input).status,'DUPLICATE');
  const changed=structuredClone(sub);changed.items.data[1].current_period_end++;
  assert.throws(()=>f.service.captureVerifiedSubscription({...input,subscription:changed}),e=>e.code==='USAGE_EVIDENCE_CONFLICT');
  f.database.prepare("UPDATE billingAccounts SET stripeSubscriptionId='sub_new' WHERE ownerId='A'").run();
  assert.equal(f.service.captureVerifiedSubscription(input).status,'DUPLICATE');
});
test('billing-state and usage evidence commit atomically and retain the verified payment-method guard',t=>{
  const f=close(t,fixture());f.owner();const state=createBillingStateService({db:f.database,pricePlanMap:{price_operator:'Operator',price_quote:'QuoteDone'},
    supplementalPriceIds:['price_usage'],clock:()=>new Date(f.clock()),onVerifiedTransition:(event,result)=>f.service.captureVerifiedStripeEvent(event,result)});
  const event={id:'evt_atomic',type:'customer.subscription.updated',created:Math.floor(f.clock()/1000),livemode:false,data:{object:f.subscription()}};
  const result=state.applyVerifiedStripeEvent(event);assert.equal(result.outcome,'APPLIED');
  assert.equal(f.service.getUsageSnapshot('A').available,true);assert.equal(state.applyVerifiedStripeEvent(event).outcome,'APPLIED');
  const invalid=structuredClone(event);invalid.id='evt_invalid';invalid.created++;invalid.data.object.items.data[1].current_period_end=0;
  assert.throws(()=>state.applyVerifiedStripeEvent(invalid));
  assert.equal(f.database.prepare("SELECT COUNT(*) AS n FROM billingEventReceipts WHERE stripeEventId='evt_invalid'").get().n,0);
  assert.equal(f.database.prepare("SELECT planStatus FROM users WHERE id='A'").get().planStatus,'active');
  f.database.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,role,createdAt) VALUES ('no-card','nocard@fixture.invalid','x','f','f','Operator','active','owner',?)").run(new Date(START).toISOString());
  assert.equal(f.database.prepare("SELECT planStatus FROM users WHERE id='no-card'").get().planStatus,'pending_payment');
});
