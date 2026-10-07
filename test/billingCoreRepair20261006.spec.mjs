import test from 'node:test';
import assert from 'node:assert/strict';
import {T,day,iso,harness,httpHarness} from './billingCoreRepair20261006.helpers.mjs';
import {accountAccessDecision,hasQuoteDoneAccess} from '../server/src/planAccess.js';

// Expected cents/state BEFORE execution: verification/billing-core-repairs-20261006/EXPECTATIONS.md.
// $0 trial; Operator $119=11900, QuoteDone $279=27900. No provider writes.
const perms=a=>a.length?a.flatMap((v,i)=>perms(a.filter((_,j)=>j!==i)).map(p=>[v,...p])):[[]];
for (const price of ['price_op_month','price_qd_month']) for (const sameSecond of [false,true]) for (const order of perms([0,1,2,3])) {
  test(`F01 selected-plan trial ${price} sameSecond=${sameSecond} order=${order}`,()=>{
    const h=harness();try {
      const trial={status:'trialing',trial_start:T,trial_end:T+14*day,items:{data:[{price:{id:price}}]}};
      const created=h.sub('evt_created',0,{...trial,default_payment_method:null});created.type='customer.subscription.created';
      const events=[created,h.sub('evt_attached',sameSecond?0:1,trial),h.checkout('evt_checkout',sameSecond?0:2),h.inv('evt_zero',sameSecond?0:3,{amount_paid:0})];
      for (const i of order) h.service.applyVerifiedStripeEvent(events[i]);
      assert.equal(h.get().planStatus,'trialing');assert.equal(h.get().trialEndsAt,iso(T+14*day));
      assert.equal(hasQuoteDoneAccess(h.get(),{now:new Date(T*1000)}),price==='price_qd_month');
      assert.equal(accountAccessDecision(h.get(),{now:new Date((T+14*day)*1000)}).allowed,false);
      assert.equal(h.db.prepare('SELECT COUNT(*) n FROM billingEventReceipts').get().n,4);
    } finally {h.db.close();}
  });
}
function failure(h,id='in_CURRENT',offset=10) {const e=h.inv('evt_fail_'+id,offset,{id,status:'open',amount_paid:0});e.type='invoice.payment_failed';return e;}
for (const unrelated of ['card','historical','checkout']) test(`F02/F06 ${unrelated} retains unpaid $119 obligation and original grace`,()=>{
  const h=harness();try {
    h.service.applyVerifiedStripeEvent(h.sub('evt_active'));
    h.service.applyVerifiedStripeEvent(failure(h));
    const event=unrelated==='card'?h.sub('evt_card',20):unrelated==='historical'?h.inv('evt_old',20,{id:'in_HISTORICAL'}):h.checkout('evt_paid',20,{payment_status:'paid'});
    h.service.applyVerifiedStripeEvent(event);
    assert.equal(h.get().planStatus,'payment_failed');assert.equal(h.get().paymentFailedAt,iso(T+10));assert.equal(h.billing().graceEndsAt,iso(T+10+7*day));
    assert.equal(accountAccessDecision(h.get(),{now:new Date((T+8*day)*1000)}).allowed,false);
    h.service.applyVerifiedStripeEvent(h.inv('evt_recovery',30,{id:'in_CURRENT',amount_paid:11900}));
    assert.equal(h.get().planStatus,'active');assert.equal(h.get().paymentFailedAt,null);assert.equal(h.billing().graceEndsAt,null);
  }finally{h.db.close();}
});
for (const order of perms([0,1,2])) test(`F02 invoice identity all settlement orders ${order}`,()=>{
  const h=harness();try {
    h.service.applyVerifiedStripeEvent(h.sub('evt_active'));
    const events=[failure(h),h.inv('evt_paid',20,{id:'in_CURRENT',amount_paid:11900}),h.inv('evt_history',30,{id:'in_OTHER',amount_paid:11900})];
    for(const i of order)h.service.applyVerifiedStripeEvent(events[i]);
    assert.equal(h.get().planStatus,'active');assert.equal(h.get().paymentFailedAt,null);
    assert.equal(h.db.prepare("SELECT status FROM billingInvoiceEvidence WHERE stripeInvoiceId='in_CURRENT'").get().status,'PAID');
  }finally{h.db.close();}
});
test('F02 multiple unresolved invoices all require settlement ($119 each)',()=>{
 const h=harness();try {
  h.service.applyVerifiedStripeEvent(h.sub('evt_active'));h.service.applyVerifiedStripeEvent(failure(h,'in_A'));h.service.applyVerifiedStripeEvent(failure(h,'in_B',20));
  h.service.applyVerifiedStripeEvent(h.inv('evt_paidA',30,{id:'in_A'}));assert.equal(h.get().planStatus,'payment_failed');assert.equal(h.get().paymentFailedAt,iso(T+10));
  h.service.applyVerifiedStripeEvent(h.inv('evt_paidB',40,{id:'in_B'}));assert.equal(h.get().planStatus,'active');assert.equal(h.billing().graceEndsAt,null);
 }finally{h.db.close();}
});
test('F04 invoice and Checkout history cannot overwrite current QuoteDone or scheduled cancellation',()=>{
 const h=harness();try {
  h.service.applyVerifiedStripeEvent(h.sub('evt_current',10,{cancel_at_period_end:true,items:{data:[{price:{id:'price_qd_month'}}]}}));
  h.service.applyVerifiedStripeEvent(h.checkout('evt_old_checkout',20));h.service.applyVerifiedStripeEvent(h.inv('evt_old_paid',30));
  // Handwritten mixed fixture: -$59.50 + $139.50 = $80.00 = 8000 cents.
  h.service.applyVerifiedStripeEvent(h.inv('evt_mixed',40,{amount_paid:8000,lines:{data:[{price:{id:'price_op_month'},amount:-5950},{price:{id:'price_qd_month'},amount:13950}]}}));
  assert.equal(h.get().plan,'QuoteDone');assert.equal(h.billing().cancelAtPeriodEnd,1);
  h.service.applyVerifiedStripeEvent(h.sub('evt_downgrade',50));
  h.service.applyVerifiedStripeEvent(h.inv('evt_qd_history',60,{amount_paid:27900,lines:{data:[{price:{id:'price_qd_month'}}]}}));
  assert.equal(h.get().plan,'Operator');assert.equal(hasQuoteDoneAccess(h.get()),false);
 }finally{h.db.close();}
});
test('F11 configured base item modern periods persist and both affect receipt integrity',()=>{
 const h=harness();try {
  const event=h.sub('evt_modern',0,{items:{data:[{id:'si_BASE',price:{id:'price_op_month'},current_period_start:T,current_period_end:T+30*day}]}});delete event.data.object.current_period_end;
  h.service.applyVerifiedStripeEvent(event);assert.equal(h.billing().currentPeriodStartAt,iso(T));assert.equal(h.billing().currentPeriodEndAt,iso(T+30*day));
  for(const field of ['current_period_start','current_period_end']) {const changed=structuredClone(event);changed.data.object.items.data[0][field]++;assert.throws(()=>h.service.applyVerifiedStripeEvent(changed),{code:'EVENT_ID_CONFLICT'});}
  const before=h.db.prepare('SELECT COUNT(*) n FROM outboxEvents').get().n;h.service.applyVerifiedStripeEvent(event);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM outboxEvents').get().n,before);
 }finally{h.db.close();}
});
test('atomic rollback includes new subscription and invoice facts',()=>{
 const h=harness();try {
  h.db.exec("CREATE TRIGGER synthetic_fail BEFORE INSERT ON outboxEvents BEGIN SELECT RAISE(ABORT,'SYNTHETIC disk failure'); END");
  assert.throws(()=>h.service.applyVerifiedStripeEvent(h.sub('evt_atomic')),/SYNTHETIC/);
  for(const table of ['billingSubscriptionEvidence','billingInvoiceEvidence','billingSubscriptionHistory','billingEventReceipts','outboxEvents','events']) assert.equal(h.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0,table);
  h.db.exec('DROP TRIGGER synthetic_fail');h.service.applyVerifiedStripeEvent(h.sub('evt_atomic'));assert.equal(h.get().planStatus,'active');
 }finally{h.db.close();}
});
test('F03 completed provider Checkout binds before delayed webhook; only one $0 trial session',async()=>{
 const h=harness(),f=await httpHarness(h);try {
  const body={plan:'Operator',billingInterval:'monthly'};
  assert.equal((await f.request('/api/billing/checkout',{body,key:'synthetic-first'})).status,201);
  const session=f.sessions.get('cs_1');Object.assign(session,{status:'complete',subscription:'sub_A',payment_status:'no_payment_required'});
  h.setTime(T+3601);
  const retry=await f.request('/api/billing/checkout',{body,key:'synthetic-second'});
  assert.equal(retry.status,409);assert.equal(f.sessions.size,1);assert.equal(h.billing().stripeSubscriptionId,'sub_A');
  assert.equal(h.db.prepare('SELECT status FROM billingCheckoutRequests').get().status,'COMPLETED');
  f.subscriptions.set('sub_A',h.sub('evt_trial',0,{status:'trialing',trial_start:T,trial_end:T+14*day}).data.object);
  assert.equal((await f.send(h.checkout('evt_late',3500,{id:'cs_1'}))).status,200);assert.equal(h.get().planStatus,'trialing');
 }finally{await f.close();h.db.close();}
});
for(const state of ['open','expired','timeout','wrongCustomer','activeSubscription']) test(`F03 expiry reconciliation ${state}`,async()=>{
 const h=harness(),f=await httpHarness(h);try {
  const body={plan:'Operator',billingInterval:'monthly'};
  await f.request('/api/billing/checkout',{body,key:'synthetic-first'});h.setTime(T+3601);
  if(state==='expired'||state==='activeSubscription')f.sessions.get('cs_1').status='expired';
  if(state==='wrongCustomer')f.sessions.get('cs_1').customer='cus_B';
  if(state==='timeout')f.stub.checkout.sessions.retrieve=async()=>{throw Error('synthetic timeout');};
  if(state==='activeSubscription')f.subscriptions.set('sub_A',h.sub('evt_active').data.object);
  const results=await Promise.all([f.request('/api/billing/checkout',{body,key:'synthetic-second'}),f.request('/api/billing/checkout',{body,key:'synthetic-third'})]);
  assert.equal(f.sessions.size,state==='expired'?2:1);
  assert.equal(results.filter(r=>r.status===201).length,state==='expired'?1:0);
 }finally{await f.close();h.db.close();}
});
test('provider read resolves contradictory same-second subscription snapshots without event priority',async()=>{
 const h=harness(),f=await httpHarness(h);try {
  const current=h.sub('evt_qd',0,{items:{data:[{price:{id:'price_qd_month'}}]}});
  f.subscriptions.set('sub_A',current.data.object);
  const old=h.sub('evt_old',0);
  for(const event of [current,old])assert.equal((await f.send(event)).status,200);
  assert.equal(h.get().plan,'QuoteDone');assert.equal(h.get().planStatus,'active');
 }finally{await f.close();h.db.close();}
});
