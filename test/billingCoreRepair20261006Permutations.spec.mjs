import test from 'node:test';
import assert from 'node:assert/strict';
import {T,day,iso,harness} from './billingCoreRepair20261006.helpers.mjs';
// Handwritten expectations before these permutations execute: each invoice is
// $119=11900 cents. Paying in_OTHER or a Checkout is not payment of in_CURRENT.
// With in_CURRENT unpaid, retain T+10 failure and T+10+7 days grace in every
// order. With in_CURRENT paid, active and null failure/grace in every order.
// Plan updates: Operator $119=11900; QuoteDone $279=27900. Historical prices
// never override current subscription items. No proration calculation is made.
const permutations=a=>a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>j!==i)).map(p=>[v,...p])):[[]];
for(const resolved of [false,true])for(const order of permutations([0,1,2,3,4]))test(`F02/F06 five-fact convergence resolved=${resolved} order=${order}`,()=>{
 const h=harness();try{
  const failure=h.inv('evt_fail',10,{id:'in_CURRENT',status:'open',amount_paid:0});failure.type='invoice.payment_failed';
  const events=[h.sub('evt_initial'),failure,h.sub('evt_card',20),h.inv('evt_historical',30,{id:'in_OTHER'}),resolved?h.inv('evt_recovery',40,{id:'in_CURRENT'}):h.checkout('evt_checkout',40,{payment_status:'paid'})];
  for(const i of order)h.service.applyVerifiedStripeEvent(events[i]);
  assert.equal(h.get().planStatus,resolved?'active':'payment_failed');assert.equal(h.get().paymentFailedAt,resolved?null:iso(T+10));assert.equal(h.billing().graceEndsAt,resolved?null:iso(T+10+7*day));
 }finally{h.db.close();}
});
for(const upgrade of [false,true])for(const order of permutations([0,1,2,3]))test(`F04/F05 current plan and cancellation convergence upgrade=${upgrade} order=${order}`,()=>{
 const h=harness();try{
  const old=upgrade?'price_op_month':'price_qd_month',current=upgrade?'price_qd_month':'price_op_month';
  const items=price=>({data:[{price:{id:price}}]});
  const events=[h.sub('evt_initial',0,{items:items(old)}),h.sub('evt_change',20,{items:items(current),cancel_at_period_end:true}),h.inv('evt_history',30,{amount_paid:upgrade?11900:27900,lines:items(old)}),h.checkout('evt_checkout',40,{line_items:items(old)})];
  for(const i of order)h.service.applyVerifiedStripeEvent(events[i]);
  assert.equal(h.get().plan,upgrade?'QuoteDone':'Operator');assert.equal(h.get().planStatus,'active');assert.equal(h.billing().cancelAtPeriodEnd,1);
 }finally{h.db.close();}
});
