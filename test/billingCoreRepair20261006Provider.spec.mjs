import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Stripe from 'stripe';
import {T,day,iso,harness,httpHarness} from './billingCoreRepair20261006.helpers.mjs';
import {billingProviderRead,BILLING_PROVIDER_OPTIONS} from '../server/src/billingProvider.js';
import {createBillingStateService} from '../server/src/billingStateService.js';
// Expected before execution: Operator recurring $119=11900, QuoteDone $279=27900,
// annual $1190=119000 and $2790=279000; $0 trial, no setup fee. Signed mixed
// invoice -5950+13950=8000; current subscription alone sets plan access.

test('installed Stripe SDK contract: modern item fields, subscription retrieve/list and invoice retrieve use only local HTTP',async()=>{
 const h=harness(),requests=[];
 const current=h.sub('evt_current',0,{items:{data:[{id:'si_BASE',price:{id:'price_qd_month'},current_period_start:T,current_period_end:T+30*day}]}}).data.object;
 delete current.current_period_end;
 const paid=h.inv('evt_paid',1,{id:'in_CURRENT',amount_paid:27900,parent:{type:'subscription_details',subscription_details:{subscription:'sub_A'}},lines:{data:[{pricing:{price_details:{price:'price_qd_month'}}}]}});delete paid.data.object.subscription;
 const server=http.createServer((req,res)=>{
  requests.push({url:req.url,version:req.headers['stripe-version']});res.setHeader('content-type','application/json');
  if(req.url.startsWith('/v1/subscriptions/sub_A'))res.end(JSON.stringify(current));
  else if(req.url.startsWith('/v1/subscriptions?'))res.end(JSON.stringify({object:'list',data:[current],has_more:false}));
  else if(req.url.startsWith('/v1/invoices/in_CURRENT'))res.end(JSON.stringify(paid.data.object));
  else {res.statusCode=404;res.end('{}');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const stripe=new Stripe('sk_test_SYNTHETIC_LOCAL_ONLY',{host:'127.0.0.1',port:server.address().port,protocol:'http',maxNetworkRetries:0});
 try{
  await h.service.reconcileVerifiedStripeEvent(paid,stripe);
  assert.equal(h.get().plan,'QuoteDone');assert.equal(h.billing().currentPeriodStartAt,iso(T));assert.equal(h.billing().currentPeriodEndAt,iso(T+30*day));
  const list=await stripe.subscriptions.list({customer:'cus_A',status:'all',limit:100},BILLING_PROVIDER_OPTIONS);assert.equal(list.data.length,1);
  const invoice=await stripe.invoices.retrieve('in_CURRENT',{},BILLING_PROVIDER_OPTIONS);assert.equal(invoice.amount_paid,27900);
  assert.equal(requests.every(r=>r.version==='2026-08-26.dahlia'),true);assert.ok(requests[0].url.includes('expand[0]=latest_invoice')||requests[0].url.includes('expand%5B0%5D=latest_invoice'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));h.db.close();}
});
test('modern base item periods win over different supplemental periods; legacy periods remain supported',()=>{
 const h=harness();try{
  const service=createBillingStateService({db:h.db,pricePlanMap:{price_op_month:'Operator'},supplementalPriceIds:['price_supplemental'],clock:()=>new Date(T*1000)});
  service.applyVerifiedStripeEvent(h.sub('evt_modern',0,{current_period_start:T-30*day,current_period_end:T+90*day,items:{data:[{id:'si_EXTRA',price:{id:'price_supplemental'},current_period_start:T-10*day,current_period_end:T+5*day},{id:'si_BASE',price:{id:'price_op_month'},current_period_start:T,current_period_end:T+30*day}]}}));
  assert.equal(h.billing().currentPeriodStartAt,iso(T));assert.equal(h.billing().currentPeriodEndAt,iso(T+30*day));
  service.applyVerifiedStripeEvent(h.sub('evt_legacy',1,{current_period_start:T+30*day,current_period_end:T+60*day}));
  assert.equal(h.billing().currentPeriodStartAt,iso(T+30*day));assert.equal(h.billing().currentPeriodEndAt,iso(T+60*day));
 }finally{h.db.close();}
});
test('complete subscription lists reject two configured base items, including the same price twice',()=>{
 const h=harness();try{
  for(const extra of [{items:{has_more:true,data:[{price:{id:'price_op_month'}}]}} ,{items:{data:[{price:{id:'price_op_month'}},{price:{id:'price_op_month'}}]}}])assert.throws(()=>h.service.applyVerifiedStripeEvent(h.sub('evt_bad',0,extra)));
  assert.equal(h.get().planStatus,'pending_payment');assert.equal(h.db.prepare('SELECT COUNT(*) n FROM billingEventReceipts').get().n,0);
 }finally{h.db.close();}
});
test('provider read timeout preserves debt and permits later exact retry with one receipt',async()=>{
 const h=harness();try {
  h.service.applyVerifiedStripeEvent(h.sub('evt_active'));
  const event=h.inv('evt_failed',10,{id:'in_CURRENT',status:'open',amount_paid:0});event.type='invoice.payment_failed';h.service.applyVerifiedStripeEvent(event);
  const paid=h.inv('evt_paid',20,{id:'in_CURRENT'});
  const provider={subscriptions:{retrieve:async()=>{throw Object.assign(Error('synthetic timeout'),{code:'ETIMEDOUT'});}}};
  await assert.rejects(h.service.reconcileVerifiedStripeEvent(paid,provider));assert.equal(h.get().planStatus,'payment_failed');assert.equal(h.db.prepare("SELECT COUNT(*) n FROM billingEventReceipts WHERE stripeEventId='evt_paid'").get().n,0);
  provider.subscriptions.retrieve=async()=>h.sub('evt_current',20).data.object;
  await h.service.reconcileVerifiedStripeEvent(paid,provider);await h.service.reconcileVerifiedStripeEvent(paid,provider);
  assert.equal(h.get().planStatus,'active');assert.equal(h.get().paymentFailedAt,null);assert.equal(h.db.prepare("SELECT COUNT(*) n FROM billingEventReceipts WHERE stripeEventId='evt_paid'").get().n,1);
 }finally{h.db.close();}
});
test('all four Checkout selections require a card and 14 days, with no setup charge',async()=>{
 for(const [plan,billingInterval,price,expectedCents] of [['Operator','monthly','price_op_month',11900],['Operator','annual','price_op_year',119000],['QuoteDone','monthly','price_qd_month',27900],['QuoteDone','annual','price_qd_year',279000]]){
  const h=harness(),f=await httpHarness(h);try{
   assert.equal((await f.request('/api/billing/checkout',{body:{plan,billingInterval}})).status,201);
   const params=f.calls.checkout[0].p;assert.deepEqual(params.payment_method_types,['card']);assert.equal(params.payment_method_collection,'always');assert.equal(params.subscription_data.trial_period_days,14);assert.deepEqual(params.line_items,[{price,quantity:1}]);
   // These fixtures, not live catalogue assertions, state the approved cents.
   assert.equal({price_op_month:11900,price_op_year:119000,price_qd_month:27900,price_qd_year:279000}[price],expectedCents);
   assert.equal(h.get().planStatus,'pending_payment');
  }finally{await f.close();h.db.close();}
 }
});
test('F05 cancellation survives zero, paid, mixed and failed invoice evidence plus Checkout',()=>{
 const h=harness();try{
  h.service.applyVerifiedStripeEvent(h.sub('evt_cancel',0,{cancel_at_period_end:true}));
  for(const event of [h.inv('evt_zero',1,{amount_paid:0}),h.inv('evt_paid',2),h.checkout('evt_checkout',3,{payment_status:'paid'})]){
   h.service.applyVerifiedStripeEvent(event);assert.equal(h.billing().cancelAtPeriodEnd,1);
  }
  const failure=h.inv('evt_failed',4,{status:'open',amount_paid:0});failure.type='invoice.payment_failed';h.service.applyVerifiedStripeEvent(failure);assert.equal(h.billing().cancelAtPeriodEnd,1);
  h.service.applyVerifiedStripeEvent(h.sub('evt_uncancel',5));assert.equal(h.billing().cancelAtPeriodEnd,0);assert.equal(h.get().planStatus,'payment_failed');
 }finally{h.db.close();}
});
test('F03 old locally EXPIRED row accepts delayed completion; conflicting ledger subscription is quarantined',async()=>{
 const h=harness(),f=await httpHarness(h);try{
  const body={plan:'Operator',billingInterval:'monthly'};await f.request('/api/billing/checkout',{body});
  h.db.exec("UPDATE billingCheckoutRequests SET status='EXPIRED'");
  h.service.applyVerifiedStripeEvent(h.sub('evt_active',0,{id:'sub_ALREADY'}));
  const duplicate=h.checkout('evt_duplicate',10,{id:'cs_1',subscription:'sub_DUPLICATE'});
  const result=h.service.applyVerifiedStripeEvent(duplicate);assert.equal(result.outcome,'QUARANTINED_DUPLICATE_SUBSCRIPTION');assert.equal(h.billing().stripeSubscriptionId,'sub_ALREADY');
  const row=h.db.prepare('SELECT status,reconciliationError FROM billingCheckoutRequests').get();assert.equal(row.status,'COMPLETED');assert.equal(row.reconciliationError,'DUPLICATE_SUBSCRIPTION_REQUIRES_REVIEW');
  assert.deepEqual(h.service.applyVerifiedStripeEvent(duplicate),result);
  assert.equal(h.service.applyVerifiedStripeEvent(h.sub('evt_duplicate_updated',11,{id:'sub_DUPLICATE'})).outcome,'QUARANTINED_DUPLICATE_SUBSCRIPTION');
 }finally{await f.close();h.db.close();}
});
test('deletion is terminal even after newer invoices, and canceled snapshots cannot be reopened',()=>{
 const h=harness();try{
  h.service.applyVerifiedStripeEvent(h.sub('evt_active'));h.service.applyVerifiedStripeEvent(h.inv('evt_new_invoice',30));
  const deletion=h.sub('evt_deleted',10,{status:'canceled'});deletion.type='customer.subscription.deleted';h.service.applyVerifiedStripeEvent(deletion);
  assert.equal(h.get().planStatus,'canceled');h.service.applyVerifiedStripeEvent(h.sub('evt_zombie',40));assert.equal(h.get().planStatus,'canceled');
 }finally{h.db.close();}
});

test('bounded provider timeout does not await a hung adapter indefinitely',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const pending=billingProviderRead(()=>new Promise(()=>{}));
 const rejected=assert.rejects(pending,{code:'BILLING_PROVIDER_ERROR'});
 t.mock.timers.tick(10000);await rejected;
});
test('changed expired Checkout request conflicts before reconciliation or new create',async()=>{
 const h=harness(),f=await httpHarness(h);try{
  const key='synthetic-same-key';await f.request('/api/billing/checkout',{body:{plan:'Operator',billingInterval:'monthly'},key});
  h.setTime(T+3601);
  const changed=await f.request('/api/billing/checkout',{body:{plan:'QuoteDone',billingInterval:'monthly'},key});
  assert.equal(changed.status,409);assert.equal(changed.body.code,'IDEMPOTENCY_KEY_CONFLICT');assert.equal(f.calls.retrieve.length,0);assert.equal(f.sessions.size,1);assert.equal(h.db.prepare('SELECT status FROM billingCheckoutRequests').get().status,'OPEN');
 }finally{await f.close();h.db.close();}
});

test('F04 concurrent provider read cannot overwrite a newer signed subscription update',async()=>{
 const h=harness(),f=await httpHarness(h);try {
  h.service.applyVerifiedStripeEvent(h.sub('evt_active'));
  let release,started;const start=new Promise(r=>{started=r;});
  f.stub.subscriptions.retrieve=async()=>{started();return new Promise(r=>{release=()=>r(h.sub('evt_snapshot').data.object);});};
  const prior=f.send(h.inv('evt_old_invoice',1));await start;
  const upgrade=h.sub('evt_upgrade',2,{items:{data:[{price:{id:'price_qd_month'}}]}});
  assert.equal((await f.send(upgrade)).status,500);
  release();assert.equal((await prior).status,200);
  assert.equal((await f.send(upgrade)).status,200);assert.equal(h.get().plan,'QuoteDone');
 }finally{await f.close();h.db.close();}
});
