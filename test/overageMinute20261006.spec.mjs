import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fixture,fakeProviders,A,B,START,SIGNUP,prices} from './overageMinute20261006Fixture.mjs';
import {usageAmounts,monthlyAnniversary,allowancePeriods} from '../server/src/billingUsagePolicy.js';
import {createBillingMinuteService} from '../server/src/billingMinuteService.js';
import {accountAccessDecision,hasQuoteDoneAccess} from '../server/src/planAccess.js';
import {billingMutationDecision} from '../server/src/billingMutationGuard.js';
import {loadVoiceAccountContext} from '../server/src/voice/voicePersistence.js';
import {canContinueSetup} from '../client/src/billingTransport.js';
import {harness,httpHarness,catalogue} from './billingCoreRepair20261006.helpers.mjs';

const END=monthlyAnniversary(START,1);
// Hand dollar expectations are committed in EXPECTED.md before execution.
for(const [plan,minutes,cents,savings] of [
  ['Operator',300,0,0],['Operator',301,35,0],['QuoteDone',1200,0,0],['QuoteDone',1201,35,0],
  ['Operator',757,15995,0],['Operator',758,16030,30],['Operator',1200,31500,15500],['Operator',1201,31535,15500]
])test(`${plan} ${minutes} metered minutes: ${cents} cents, upgrade saving ${savings} cents`,async t=>{
  const h=fixture(t);h.activate(A,{plan});h.call(minutes*60);
  const view=h.service.snapshot(A);assert.equal(view.overageCents,cents);assert.equal(view.savingsCents,savings);assert.equal(view.minutesLeft,Math.max(0,view.includedMinutes-minutes));
  assert.equal(Boolean(view.upgradeMessage),savings>0);if(savings===30)assert.equal(view.upgradeMessage,'Upgrading to QuoteDone would have saved you $0.30 this month');
  assert.equal(h.fakes.invoices.size,0,'metering persists usage; the payment worker submits invoices');
  h.setTime(END);await h.service.processOwner(A);await h.service.processOwner(A);
  assert.equal(h.fakes.invoices.size,cents?1:0);if(cents){assert.equal([...h.fakes.items.values()][0].amount,cents);assert.equal(h.db.prepare('SELECT status FROM billingUsageCharges WHERE ownerId=?').get(A).status,'PAID');}
});
test('F10 per-call rounding is retained: two 31-second calls over allowance cost $0.70',async t=>{
  const h=fixture(t);h.activate();h.call(300*60);h.call(31);h.call(31);assert.equal(h.service.snapshot(A).overageCents,70);
  h.setTime(END);await h.service.processOwner(A);assert.equal([...h.fakes.items.values()][0].amount,70);
});
test('unconfirmed duration cannot charge; provider 61 seconds replaces local 59 seconds: $0.70',async t=>{
  const h=fixture(t);h.activate();h.call(300*60);const last=h.call(61,{localSeconds:59,provider:false});
  assert.equal(h.service.snapshot(A).overageCents,35);h.setTime(END);await h.service.processOwner(A);assert.equal(h.fakes.invoices.size,0);
  assert.match(h.service.snapshot(A).pendingCharges[0].message,/durations.*confirmation/);
  h.meter.providerComplete(last.receipt);h.meter.providerComplete(last.receipt);await h.service.processOwner(A);
  assert.equal(h.fakes.invoices.size,1);assert.equal([...h.fakes.items.values()][0].amount,70);
});
for(const plan of ['Operator','QuoteDone'])test(plan+' warnings fire at 60, 30 and zero left exactly once under worker retries',async t=>{
  const h=fixture(t);h.activate(A,{plan});const included=plan==='Operator'?300:1200;
  h.call((included-61)*60);assert.equal(h.service.snapshot(A).warnings.length,0);
  const c=h.call(60);assert.deepEqual(h.service.snapshot(A).warnings.map(w=>w.threshold),[60]);
  for(let n=0;n<3;n++)h.meter.providerComplete(c.receipt);
  h.call(30*60);h.call(30*60);assert.deepEqual(h.service.snapshot(A).warnings.map(w=>w.threshold),[60,30,0]);
  await Promise.all([h.service.processOwner(A),createBillingMinuteService(h.options).processOwner(A),h.service.processOwner(A)]);
  await h.service.processOwner(A);assert.equal(h.fakes.mail.size,3);
  assert.ok(h.service.snapshot(A).warnings.every(w=>w.emailStatus==='DELIVERED'));
  assert.match(h.service.snapshot(A).warnings[2].message,/overage at \$0\.35\/min now applies/);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM outboxEvents WHERE ownerId=? AND eventType='billing.minute_warning'").get(A).n,3);
});
test('one call crossing all thresholds queues each warning once, no automatic upgrade or pack purchase',async t=>{
  const h=fixture(t);h.activate();h.call(758*60);await h.service.processOwner(A);
  assert.equal(h.fakes.mail.size,3);assert.equal(h.fakes.invoices.size,1);assert.equal([...h.fakes.items.values()][0].amount,16030);assert.equal(h.db.prepare('SELECT plan FROM users WHERE id=?').get(A).plan,'Operator');
});
test('monthly rollover resets allowance, nudge and warning identities while preserving previous usage',async t=>{
  const h=fixture(t);h.activate();h.call(758*60);const old=h.service.snapshot(A);
  h.setTime(END);h.activate(A,{start:END,end:monthlyAnniversary(START,2)});
  const current=h.service.snapshot(A);assert.equal(current.minutesUsed,0);assert.equal(current.minutesLeft,300);assert.equal(current.overageCents,0);assert.equal(current.upgradeMessage,null);assert.equal(current.warnings.length,0);assert.notEqual(current.periodId,old.periodId);
  h.call(240*60);assert.equal(h.service.snapshot(A).warnings.length,1);await h.service.processOwner(A);
  assert.equal(h.fakes.invoices.size,1);assert.equal([...h.fakes.items.values()][0].amount,16030);
});
for(const plan of ['Operator','QuoteDone'])test(plan+' annual upfront term receives monthly resets and monthly overage invoices',async t=>{
  const h=fixture(t);h.activate(A,{plan,interval:'annual'});h.call((plan==='Operator'?301:1201)*60);
  const old=h.service.snapshot(A);assert.equal(old.billingInterval,'annual');assert.equal(old.overageCents,35);
  h.setTime(END);assert.equal(h.meter.minutesUsed(A),0);const next=h.service.snapshot(A);assert.equal(next.minutesUsed,0);assert.equal(next.includedMinutes,plan==='Operator'?300:1200);
  assert.equal(next.periodStartAt,END);assert.equal(next.periodEndAt,monthlyAnniversary(START,2));assert.equal(next.warnings.length,0);
  await h.service.processOwner(A);assert.equal(h.fakes.invoices.size,1);assert.equal([...h.fakes.items.values()][0].amount,35);
  h.call((plan==='Operator'?301:1201)*60);h.setTime(monthlyAnniversary(START,2));await h.service.processOwner(A);
  assert.equal(h.fakes.invoices.size,2);assert.deepEqual([...h.fakes.items.values()].map(i=>i.amount),[35,35]);
});
test('monthly anniversary restores the original day after February and leap-year clamping',()=>{
  const start='2028-01-31T16:30:45.000Z',periods=allowancePeriods({start,end:'2029-01-31T16:30:45.000Z',interval:'annual'});
  assert.equal(periods.length,12);assert.equal(periods[0].end,'2028-02-29T16:30:45.000Z');assert.equal(periods[1].end,'2028-03-31T16:30:45.000Z');
  const leap=allowancePeriods({start:'2029-02-28T12:00:00.000Z',end:'2030-02-28T12:00:00.000Z',anchor:'2028-02-29T12:00:00.000Z',interval:'annual'});
  assert.equal(leap[0].end,'2029-03-29T12:00:00.000Z');
});
test('trial is free even with overrun; paid annual term and monthly resets start at trial end',async t=>{
  const h=fixture(t);h.setTime(SIGNUP);h.subscription(A,{status:'trialing',interval:'annual',start:SIGNUP,end:START});h.call(3601);
  const trial=h.service.snapshot(A);assert.equal(trial.status,'TRIAL');assert.equal(trial.minutesUsed,61);assert.equal(trial.overageCents,0);assert.deepEqual(trial.warnings.map(w=>w.threshold),[30,0]);await h.service.processOwner(A);assert.equal(h.fakes.invoices.size,0);
  h.setTime(START);h.activate(A,{interval:'annual'});const paid=h.service.snapshot(A);assert.equal(paid.minutesUsed,0);assert.equal(paid.periodStartAt,START);assert.equal(paid.periodEndAt,END);
  assert.equal(h.db.prepare('SELECT amountPaidCents,endAt FROM billingAnnualTerms WHERE ownerId=?').get(A).amountPaidCents,119000);
});
test('cancelled prepaid annual plans keep access until paid-year end, with no partial refund operation',t=>{
  const h=fixture(t),end=monthlyAnniversary(START,12);h.activate(A,{plan:'QuoteDone',interval:'annual'});
  h.setTime(END);h.subscription(A,{plan:'QuoteDone',interval:'annual',status:'canceled'});
  const owner=h.db.prepare('SELECT * FROM users WHERE id=?').get(A);assert.equal(owner.annualPaidThroughAt,end);assert.equal(owner.planStatus,'canceled');
  for(const now of [END,new Date(Date.parse(end)-1).toISOString()]){
    assert.equal(accountAccessDecision(owner,{now}).allowed,true);assert.equal(hasQuoteDoneAccess(loadVoiceAccountContext(h.db,A).account,{now}),true);
    assert.equal(billingMutationDecision(h.db,{tenantOwnerId:A,method:'POST',path:'/api/pricebook/save'},{now}).allowed,true);assert.equal(canContinueSetup(owner,now),true);
  }
  assert.equal(accountAccessDecision(owner,{now:end}).allowed,false);assert.equal(canContinueSetup(owner,end),false);assert.equal(h.service.snapshot(A).includedMinutes,1200);
  assert.equal(h.fakes.writes.invoice.length,0);
});
test('trial cancellation and unpaid or partially paid annual invoices never grant a prepaid year',t=>{
  const h=fixture(t);h.subscription(A,{interval:'annual'});h.paid(A,{interval:'annual',amount:11900});h.subscription(A,{interval:'annual',status:'canceled'});
  const owner=h.db.prepare('SELECT * FROM users WHERE id=?').get(A);assert.equal(owner.annualPaidThroughAt,null);assert.equal(accountAccessDecision(owner,{now:START}).allowed,false);
});
test('invoice-before-subscription ordering retains the same fully paid annual entitlement',t=>{
  const h=fixture(t);h.paid(A,{interval:'annual'});h.subscription(A,{interval:'annual'});assert.equal(h.db.prepare('SELECT annualPaidThroughAt FROM users WHERE id=?').get(A).annualPaidThroughAt,monthlyAnniversary(START,12));
});
for(const plan of ['Operator','QuoteDone'])for(const billingInterval of ['monthly','annual'])test(plan+' '+billingInterval+' checkout has card collection and a 14-day trial, no signup charge',async()=>{
  const h=harness(),http=await httpHarness(h);try{const result=await http.request('/api/billing/checkout',{body:{plan,billingInterval}});assert.equal(result.status,201);
    const p=http.calls.checkout[0].p;assert.equal(p.subscription_data.trial_period_days,14);assert.equal(p.payment_method_collection,'always');assert.deepEqual(p.line_items,[{price:catalogue[plan][billingInterval],quantity:1}]);
    assert.equal(h.get().planStatus,'pending_payment');
  }finally{await http.close();h.db.close();}
});
test('spam and AI fallback never create overage or minute warnings',async t=>{
  const h=fixture(t);h.activate();h.call(301*60,{spam:true});h.call(301*60,{fallback:true});assert.equal(h.service.snapshot(A).minutesUsed,0);h.setTime(END);await h.service.processOwner(A);assert.equal(h.fakes.mail.size,0);assert.equal(h.fakes.invoices.size,0);
});
test('two tenants have isolated usage, warning recipients and payment identities',async t=>{
  const h=fixture(t);h.activate(A);h.activate(B,{plan:'QuoteDone'});h.call(301*60);h.call(1201*60,{ownerId:B});
  const a=h.service.snapshot(A),b=h.service.snapshot(B);assert.equal(a.minutesUsed,301);assert.equal(b.minutesUsed,1201);assert.notEqual(a.periodId,b.periodId);assert.equal(b.upgradeMessage,null);
  h.setTime(END);assert.equal(await h.service.chargePeriod(B,a.periodId),false);await Promise.all([h.service.processOwner(A),h.service.processOwner(B)]);
  assert.deepEqual([...h.fakes.invoices.values()].map(i=>i.customer).sort(),['cus_'+A,'cus_'+B]);assert.equal(h.fakes.mail.size,6);
  for(const delivery of h.db.prepare('SELECT ownerId,messageJson FROM ownerEmailDeliveries').all())assert.equal(JSON.parse(delivery.messageJson).to,delivery.ownerId+'@example.invalid');
});
for(const kind of ['invoice','item','finalize'])for(const when of ['before','after'])test('payment '+kind+' '+when+' failure stays pending then reconciles exactly one $0.35 charge',async t=>{
  const h=fixture(t);h.activate();h.call(301*60);const id=h.service.snapshot(A).periodId;h.setTime(END);h.fakes.fail(kind,when);await h.service.chargePeriod(A,id);
  assert.equal(h.db.prepare('SELECT status FROM billingUsageCharges WHERE ownerId=?').get(A).status,'PENDING');assert.equal(h.service.snapshot(A).pendingCharges.length,1);
  h.setTime(Date.parse(END)+61000);await createBillingMinuteService(h.options).chargePeriod(A,id);
  assert.equal(h.fakes.invoices.size,1);assert.equal(h.fakes.items.size,1);assert.equal([...h.fakes.items.values()][0].amount,35);assert.equal(h.db.prepare('SELECT status FROM billingUsageCharges WHERE ownerId=?').get(A).status,'PAID');
});
test('old ambiguous provider operation is read-reconciled, never blindly recreated after idempotency expiry',async t=>{
  const h=fixture(t);h.activate();h.call(301*60);const id=h.service.snapshot(A).periodId;h.setTime(END);h.fakes.fail('invoice','after');await h.service.chargePeriod(A,id);
  h.setTime(Date.parse(END)+2*86400000);h.fakes.keys.clear();await h.service.chargePeriod(A,id);
  assert.equal(h.fakes.invoices.size,1);assert.equal(h.fakes.writes.invoice.length,1);assert.equal(h.fakes.items.size,1);
});
test('old uncertain operation with no provider receipt remains visible and does not risk a second charge',async t=>{
  const h=fixture(t);h.activate();h.call(301*60);const id=h.service.snapshot(A).periodId;h.setTime(END);h.fakes.fail('invoice');await h.service.chargePeriod(A,id);
  h.setTime(Date.parse(END)+2*86400000);await h.service.chargePeriod(A,id);assert.equal(h.fakes.writes.invoice.length,1);assert.equal(h.service.snapshot(A).pendingCharges.length,1);assert.equal(h.fakes.invoices.size,0);
});
test('concurrent payment workers hold one durable owner lease and create one invoice',async t=>{
  const h=fixture(t);h.activate();h.call(301*60);const id=h.service.snapshot(A).periodId;h.setTime(END);let release;h.fakes.blockInvoice(new Promise(r=>{release=r;}));
  const first=h.service.chargePeriod(A,id);await new Promise(r=>setImmediate(r));assert.equal(await createBillingMinuteService(h.options).chargePeriod(A,id),false);release();await first;assert.equal(h.fakes.invoices.size,1);
});
test('email acceptance response loss retries the same identity and payload without duplicate delivery',async t=>{
  const h=fixture(t);h.activate();h.call(240*60);h.fakes.fail('email','after');await h.service.emails.deliverOne(A);assert.equal(h.fakes.mail.size,1);
  h.setTime(h.clock().getTime()+61000);await h.service.processOwner(A);assert.equal(h.fakes.mail.size,1);assert.equal(h.service.snapshot(A).warnings[0].emailStatus,'DELIVERED');
  assert.equal(h.fakes.writes.email[0].idempotencyKey,h.fakes.writes.email[1].idempotencyKey);
});
test('email retry after idempotency expiry is visibly held instead of duplicating an uncertain send',async t=>{
  const h=fixture(t);h.activate();h.call(240*60);h.fakes.fail('email','after');await h.service.emails.deliverOne(A);h.setTime(h.clock().getTime()+2*86400000);await h.service.processOwner(A);
  assert.equal(h.fakes.mail.size,1);assert.equal(h.fakes.writes.email.length,1);assert.equal(h.service.snapshot(A).warnings[0].emailStatus,'REVIEW');
});
test('provider switch disables all payment and email writes while preserving visible usage and pending work',async t=>{
  const h=fixture(t);h.activate();h.call(301*60);h.disable();h.setTime(END);await h.service.processOwner(A);assert.equal(h.fakes.mail.size,0);assert.equal(h.fakes.invoices.size,0);assert.equal(h.service.snapshot(A).pendingCharges[0].amountCents,35);
});
test('billing amounts reject malformed and unsafe numeric inputs',()=>{
  for(const value of [-1,NaN,Infinity,0.5,'301',Number.MAX_SAFE_INTEGER])assert.throws(()=>usageAmounts('Operator',value));
  assert.throws(()=>usageAmounts('Scale',300));
});
test('independent processes racing warning creation retain one durable event per threshold',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'SYNTHETIC-minute-race-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const filename=join(dir,'usage.sqlite');
  const h=fixture(t,{filename,observe:false});h.activate();h.call(301*60);const at=h.clock().toISOString();h.close();
  const script=`import{DatabaseSync}from'node:sqlite';import{createBillingMinuteService}from'./server/src/billingMinuteService.js';const db=new DatabaseSync(process.env.SYNTHETIC_DB);db.exec('PRAGMA busy_timeout=5000');createBillingMinuteService({database:db,clock:()=>new Date(process.env.SYNTHETIC_AT)}).syncOwner('${A}');db.close();`;
  const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',script],{env:{...process.env,SYNTHETIC_DB:filename,SYNTHETIC_AT:at}});let error='';child.stderr.on('data',x=>{error+=x;});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(error)));});
  await Promise.all([run(),run(),run()]);const resumed=fixture(t,{filename,resume:true});assert.equal(resumed.db.prepare('SELECT COUNT(*) n FROM billingMinuteAlerts WHERE ownerId=?').get(A).n,3);
});
test('restart retains frozen charge, warnings and provider receipts',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'SYNTHETIC-minute-restart-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const filename=join(dir,'usage.sqlite'),fakes=fakeProviders();
  const h=fixture(t,{filename,fakes});h.activate();h.call(301*60);h.setTime(END);fakes.fail('item','after');await h.service.processOwner(A);h.close();
  const resumed=fixture(t,{filename,resume:true,fakes});resumed.setTime(Date.parse(END)+61000);await resumed.service.processOwner(A);await resumed.service.processOwner(A);
  assert.equal(fakes.invoices.size,1);assert.equal(fakes.items.size,1);assert.equal(fakes.mail.size,3);assert.equal(resumed.db.prepare('SELECT status FROM billingUsageCharges WHERE ownerId=?').get(A).status,'PAID');
});
