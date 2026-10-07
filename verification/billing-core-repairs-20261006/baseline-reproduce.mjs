// Independent synthetic audit. No Stripe network methods are ever used.
// Run with Node >=22: node verification/billing-reliability-20261006/reproduce.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import Stripe from 'stripe';
import {migrateDatabase} from '../../server/src/migrations.js';
import {createBillingStateService} from '../../server/src/billingStateService.js';
import {installBillingRoutes,installBillingWebhookRoute} from '../../server/src/billingRoutes.js';
import {accountAccessDecision,hasQuoteDoneAccess} from '../../server/src/planAccess.js';
import {canContinueSetup} from '../../client/src/billingTransport.js';

const T=1791288000, day=86400;
const iso=t=>new Date(t*1000).toISOString();
const catalogue={Operator:{monthly:'price_op_month',annual:'price_op_year'},QuoteDone:{monthly:'price_qd_month',annual:'price_qd_year'}};
const amounts={price_op_month:11900,price_op_year:119000,price_qd_month:27900,price_qd_year:279000};
const rows=[];
function harness(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');migrateDatabase(db);
 for(const id of ['SYNTHETIC-A','SYNTHETIC-B'])db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Billing','Operator','pending_payment','UTC','owner',?)").run(id,id+'@example.invalid',iso(T));
 let at=T;
 const service=createBillingStateService({db,pricePlanMap:Object.fromEntries(Object.entries(catalogue).flatMap(([plan,intervals])=>Object.values(intervals).map(price=>[price,plan]))),clock:()=>new Date(at*1000)});
 service.registerBillingCustomer({ownerId:'SYNTHETIC-A',stripeCustomerId:'cus_A'});
 const get=()=>({...db.prepare('SELECT * FROM users WHERE id=?').get('SYNTHETIC-A')});
 const billing=()=>({...db.prepare('SELECT * FROM billingAccounts WHERE ownerId=?').get('SYNTHETIC-A')});
 const sub=(id,offset=0,extra={})=>({id,type:'customer.subscription.updated',created:T+offset,livemode:false,data:{object:{id:'sub_A',customer:'cus_A',status:'active',default_payment_method:'pm_SYNTHETIC',items:{data:[{price:{id:'price_op_month'}}]},current_period_end:T+30*day,cancel_at_period_end:false,...extra}}});
 const inv=(id,offset=0,extra={})=>({id,type:'invoice.paid',created:T+offset,livemode:false,data:{object:{id:'in_'+id,customer:'cus_A',subscription:'sub_A',status:'paid',amount_paid:11900,lines:{data:[{price:{id:'price_op_month'}}]},...extra}}});
 const checkout=(id,offset=0,extra={})=>({id,type:'checkout.session.completed',created:T+offset,livemode:false,data:{object:{id:'cs_A',mode:'subscription',customer:'cus_A',subscription:'sub_A',status:'complete',payment_status:'no_payment_required',line_items:{data:[{price:{id:'price_op_month'}}]},...extra}}});
 return {db,service,get,billing,sub,inv,checkout,setTime:t=>{at=t;},now:()=>at};
}
async function experiment(id,expected,run){
 if(!['E01','E02','E03','E04','E05','E06','E07','E08','E09','E15','E18','E21'].includes(id.slice(0,3)))return;
 const h=harness();
 try{const actual=await run(h);rows.push({id,expected,actual});console.log(id,JSON.stringify(actual));}
 finally{h.db.close();}
}
await experiment('E01-default-method-does-not-settle-renewal','failure time retained; denied after seven days',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_active'));
 const fail=h.inv('evt_fail',10,{status:'open',amount_paid:0});fail.type='invoice.payment_failed';h.service.applyVerifiedStripeEvent(fail);
 h.service.applyVerifiedStripeEvent(h.sub('evt_card_edit',20));
 const a=h.get();assert.equal(a.planStatus,'active');assert.equal(a.paymentFailedAt,null);
 return {status:a.planStatus,failedAt:a.paymentFailedAt,accessAfterGrace:accountAccessDecision(a,{now:new Date((T+8*day)*1000)})};
});
await experiment('E02-zero-invoice-before-trial','trial must activate regardless of delivery order',h=>{
 const zero=h.inv('evt_trial_zero',2,{amount_paid:0});h.service.applyVerifiedStripeEvent(zero);
 const trial=h.sub('evt_trial_created',0,{status:'trialing',trial_start:T,trial_end:T+14*day});trial.type='customer.subscription.created';
 const r=h.service.applyVerifiedStripeEvent(trial);h.service.applyVerifiedStripeEvent(h.checkout('evt_checkout',1));
 assert.equal(h.get().planStatus,'pending_payment');
 return {trialOutcome:r.outcome,status:h.get().planStatus,verifiedMethodAt:h.billing().paymentMethodVerifiedAt};
});
await experiment('E03-same-second-zero-invoice-blocks-conversion','invoice paid and subscription trial snapshots converge; trial remains bounded',h=>{
 const active=h.sub('evt_trial_same_second',0,{status:'trialing',trial_start:T,trial_end:T+14*day});active.type='customer.subscription.created';
 h.service.applyVerifiedStripeEvent(h.inv('evt_zero_first',0,{amount_paid:0}));
 const r=h.service.applyVerifiedStripeEvent(active);assert.equal(r.outcome,'IGNORED_STALE');
 return {outcome:r.outcome,status:h.get().planStatus};
});
await experiment('E04-delayed-unpaid-checkout-overwrites-upgrade','current QuoteDone plan survives delayed Operator completion',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_current_upgrade',10,{items:{data:[{price:{id:'price_qd_month'}}]}}));
 h.service.applyVerifiedStripeEvent(h.checkout('evt_late_checkout',20));assert.equal(h.get().plan,'Operator');
 return {plan:h.get().plan,quoteAccess:hasQuoteDoneAccess(h.get(),{now:new Date((T+21)*1000)})};
});
await experiment('E05-old-plan-invoice-overwrites-current-plan','current QuoteDone subscription plan survives payment of old Operator invoice',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_current_upgrade',10,{items:{data:[{price:{id:'price_qd_month'}}]}}));
 h.service.applyVerifiedStripeEvent(h.inv('evt_old_invoice_paid',20));assert.equal(h.get().plan,'Operator');
 return {plan:h.get().plan,quoteAccess:hasQuoteDoneAccess(h.get(),{now:new Date((T+21)*1000)})};
});
await experiment('E06-mixed-proration-lines-rejected','invoice reconciliation supports old/new base-price lines without treating them as two subscriptions',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_before_upgrade'));
 h.service.applyVerifiedStripeEvent(h.sub('evt_upgrade',10,{items:{data:[{price:{id:'price_qd_month'}}]}}));
 const event=h.inv('evt_proration_paid',20,{amount_paid:8000,lines:{data:[{price:{id:'price_op_month'},amount:-5950},{price:{id:'price_qd_month'},amount:13950}]}});
 let error;try{h.service.applyVerifiedStripeEvent(event);}catch(e){error=e.code;}
 assert.equal(error,'AMBIGUOUS_PRICE');return {error,receipted:h.db.prepare('SELECT COUNT(*) n FROM billingEventReceipts WHERE stripeEventId=?').get(event.id).n};
});
await experiment('E07-invoice-clears-cancel-schedule','scheduled cancellation flag remains true after renewal invoice',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_cancel_schedule',0,{cancel_at_period_end:true}));
 h.service.applyVerifiedStripeEvent(h.inv('evt_invoice_while_scheduled',1));assert.equal(h.billing().cancelAtPeriodEnd,0);
 return {cancelAtPeriodEnd:h.billing().cancelAtPeriodEnd};
});
await experiment('E08-paid-checkout-recovery-inconsistent','paid completion restores active state with a consistent failure timestamp',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_active'));
 const e=h.inv('evt_failure',1,{status:'open',amount_paid:0});e.type='invoice.payment_failed';h.service.applyVerifiedStripeEvent(e);
 h.service.applyVerifiedStripeEvent(h.checkout('evt_checkout_paid',2,{payment_status:'paid'}));
 assert.equal(h.get().planStatus,'payment_failed');assert.equal(h.get().paymentFailedAt,null);
 return {status:h.get().planStatus,failedAt:h.get().paymentFailedAt,access:accountAccessDecision(h.get(),{now:new Date((T+3)*1000)})};
});
await experiment('E09-old-debt-payment-restores-current-unpaid-service','a settled historical invoice cannot clear a newer failed invoice',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_active'));
 const fail=h.inv('evt_current_failure',10,{id:'in_CURRENT',status:'open',amount_paid:0});fail.type='invoice.payment_failed';h.service.applyVerifiedStripeEvent(fail);
 h.service.applyVerifiedStripeEvent(h.inv('evt_historical_paid',20,{id:'in_HISTORICAL',amount_paid:11900}));
 assert.equal(h.get().planStatus,'active');return {status:h.get().planStatus,failedAt:h.get().paymentFailedAt};
});
await experiment('E10-partial-write-and-retry','outbox failure rolls back all state and retry commits once',h=>{
 h.db.exec("CREATE TRIGGER synthetic_reject_outbox BEFORE INSERT ON outboxEvents BEGIN SELECT RAISE(ABORT,'SYNTHETIC disk failure'); END");
 const e=h.sub('evt_atomic');assert.throws(()=>h.service.applyVerifiedStripeEvent(e),/SYNTHETIC disk failure/);
 assert.equal(h.get().planStatus,'pending_payment');assert.equal(h.billing().stripeSubscriptionId,null);
 for(const table of ['events','outboxEvents','billingSubscriptionHistory','billingEventReceipts'])assert.equal(h.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
 h.db.exec('DROP TRIGGER synthetic_reject_outbox');h.service.applyVerifiedStripeEvent(e);h.service.applyVerifiedStripeEvent(e);
 return {status:h.get().planStatus,receipts:h.db.prepare('SELECT COUNT(*) n FROM billingEventReceipts').get().n,outbox:h.db.prepare('SELECT COUNT(*) n FROM outboxEvents').get().n};
});
await experiment('E11-owner-customer-mismatch','reject cross-account IDs and preserve both accounts',h=>{
 h.service.registerBillingCustomer({ownerId:'SYNTHETIC-B',stripeCustomerId:'cus_B'});
 h.service.applyVerifiedStripeEvent(h.sub('evt_a'));
 const b=h.sub('evt_b',1,{id:'sub_B',customer:'cus_B'});h.service.applyVerifiedStripeEvent(b);
 const bad=h.inv('evt_cross',2,{customer:'cus_A',subscription:'sub_B'});
 assert.throws(()=>h.service.applyVerifiedStripeEvent(bad),e=>e.code==='CROSS_ACCOUNT_IDS');
 return {receipts:h.db.prepare('SELECT COUNT(*) n FROM billingEventReceipts').get().n,currentSubscription:h.billing().stripeSubscriptionId};
});
await experiment('E12-repeat-failures-do-not-extend-grace','original T+10 failure timestamp retained',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_a'));
 for(const offset of [10,20,7*day+11]){const e=h.inv('evt_fail_'+offset,offset,{status:'open',amount_paid:0});e.type='invoice.payment_failed';h.service.applyVerifiedStripeEvent(e);}
 assert.equal(h.get().paymentFailedAt,iso(T+10));assert.equal(h.get().planStatus,'suspended');return {status:h.get().planStatus,failedAt:h.get().paymentFailedAt};
});
await experiment('E13-terminal-deletion-prevents-revival','old subscription is terminal even with newer active events',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_a'));
 const deleted=h.sub('evt_deleted',1,{status:'canceled'});deleted.type='customer.subscription.deleted';h.service.applyVerifiedStripeEvent(deleted);
 const r=h.service.applyVerifiedStripeEvent(h.sub('evt_zombie',2));assert.equal(r.outcome,'IGNORED_TERMINAL_SUBSCRIPTION');
 return {outcome:r.outcome,status:h.get().planStatus};
});
await experiment('E14-grace-ui-backend-agreement','seven-day full service includes continuing setup',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_a'));const e=h.inv('evt_failed',10,{status:'open',amount_paid:0});e.type='invoice.payment_failed';h.service.applyVerifiedStripeEvent(e);
 const at=(T+11)*1000,a=h.get();assert.equal(accountAccessDecision(a,{now:new Date(at)}).allowed,true);assert.equal(canContinueSetup(a,at),false);
 return {backend:accountAccessDecision(a,{now:new Date(at)}),continueSetup:canContinueSetup(a,at)};
});
await experiment('E15-trial-delivery-permutations','all 24 delivery orders converge on bounded trialing',h=>{
 const perms=a=>a.length? a.flatMap((v,i)=>perms(a.filter((_,j)=>i!==j)).map(p=>[v,...p])):[[]];
 const results=[];
 for(const order of perms([0,1,2,3])){
  const f=harness();try{
   // Realistic no-payment-required Checkout has no setup_intent in subscription mode.
   const created=f.sub('evt_created',0,{status:'trialing',default_payment_method:null,trial_start:T,trial_end:T+14*day});created.type='customer.subscription.created';
   const updated=f.sub('evt_method_attached',1,{status:'trialing',trial_start:T,trial_end:T+14*day});
   const events=[created,updated,f.checkout('evt_complete',2),f.inv('evt_zero',3,{amount_paid:0})];
   for(const i of order)f.service.applyVerifiedStripeEvent(events[i]);
   results.push({order,status:f.get().planStatus,trialEndsAt:f.get().trialEndsAt});
  }finally{f.db.close();}
 }
 const counts=Object.fromEntries(['trialing','pending_payment','active'].map(s=>[s,results.filter(r=>r.status===s).length]));
 assert.equal(counts.pending_payment>0,true);return {counts,results};
});

async function httpHarness(h){
 const app=express(),verifier=new Stripe('sk_test_SYNTHETIC_NEVER_NETWORK'),secret='whsec_SYNTHETIC_ONLY';
 const calls={customer:[],checkout:[],portal:[],retrieve:[]},sessions=new Map();
 const stub={customers:{create:async(p,o)=>{calls.customer.push({p,o});return {id:'cus_A'};}},checkout:{sessions:{
  create:async(p,o)=>{
   calls.checkout.push({p,o});const prior=[...sessions.values()].find(s=>s.key===o.idempotencyKey);if(prior)return prior;
   const s={id:'cs_'+calls.checkout.length,customer:p.customer,mode:'subscription',status:'open',created:h.now(),expires_at:h.now()+3600,url:'https://checkout.example.invalid/'+calls.checkout.length,key:o.idempotencyKey,line_items:{data:p.line_items.map(l=>({price:{id:l.price},quantity:l.quantity}))}};sessions.set(s.id,s);return s;
  },retrieve:async id=>{calls.retrieve.push(id);return sessions.get(id);}
 }},billingPortal:{sessions:{create:async(p,o)=>{calls.portal.push({p,o});return {url:'https://billing.example.invalid/session'};}}}};
 installBillingWebhookRoute(app,{rawBodyMiddleware:express.raw({type:'application/json'}),constructEvent:(...a)=>verifier.webhooks.constructEvent(...a),webhookSecret:secret,billingStateService:h.service,stripeClient:stub});app.use(express.json());
 const requireAuth=roles=>(req,res,next)=>{if(!roles.includes(req.get('X-Synthetic-Role')||'owner'))return res.status(403).json({error:'SYNTHETIC role denied'});req.tenantOwnerId=req.get('X-Synthetic-Owner')||'SYNTHETIC-A';next();};
 installBillingRoutes(app,{stripeClient:stub,billingStateService:h.service,database:h.db,requireAuth,requireProviderWrites:(_q,_r,n)=>n(),asyncHandler:f=>(q,r,n)=>Promise.resolve(f(q,r,n)).catch(n),priceIds:catalogue,successUrl:'https://app.example.invalid/billing?checkout=success',cancelUrl:'https://app.example.invalid/billing?checkout=cancel',portalReturnUrl:'https://app.example.invalid/billing',integrationIdentifier:'synthetic_audit_abcdefgh',checkoutReceiptEncryptionKey:'33'.repeat(32),clock:()=>new Date(h.now()*1000)});
 app.use((e,q,r,n)=>r.status(e.statusCode||500).json({code:e.code||'ERROR'}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 async function request(path,{body,key='synthetic-key-1234',headers={},raw,signature}={}){
  const res=await fetch(base+path,{method:body===undefined&&raw===undefined?'GET':'POST',headers:{'content-type':'application/json','idempotency-key':key,...headers,...(signature?{'stripe-signature':signature}:{})},body:raw??(body===undefined?undefined:JSON.stringify(body))});return {status:res.status,body:await res.json()};
 }
 async function send(event,options={}){const raw=JSON.stringify(event);const signature=verifier.webhooks.generateTestHeaderString({payload:raw,secret:options.bad?'whsec_WRONG':secret,...(options.timestamp?{timestamp:options.timestamp}:{})});return request('/api/stripe/webhook',{raw:options.tamper?raw+' ':raw,signature});}
 return {request,send,calls,sessions,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
await experiment('E16-signed-http-authentication','invalid, tampered and expired signatures rejected without activation',async h=>{
 const f=await httpHarness(h);try{
  const statuses=[];for(const opt of [{bad:true},{tamper:true},{timestamp:Math.floor(Date.now()/1000)-1000}])statuses.push((await f.send(h.sub('evt_signed'),opt)).status);
  assert.deepEqual(statuses,[400,400,400]);assert.equal(h.get().planStatus,'pending_payment');
  statuses.push((await f.send(h.sub('evt_signed'))).status);assert.equal(statuses.at(-1),200);return {statuses,status:h.get().planStatus};
 }finally{await f.close();}
});
await experiment('E17-checkout-selections-money-and-repeats','each selection uses exact configured synthetic recurring amount; retries do not create a second session; no entitlement from redirect',async h=>{
 const results=[];
 for(const [plan,intervals] of Object.entries(catalogue))for(const [billingInterval,price]of Object.entries(intervals)){
  const f0=harness(),f=await httpHarness(f0);try{
   const body={plan,billingInterval},a=await f.request('/api/billing/checkout',{body}),b=await f.request('/api/billing/checkout',{body});
   assert.deepEqual(a,b);assert.equal(a.status,201);assert.equal(f.calls.checkout.length,1);assert.equal(f0.get().planStatus,'pending_payment');assert.equal(f.calls.checkout[0].p.payment_method_collection,'always');assert.equal(f.calls.checkout[0].p.subscription_data.trial_period_days,14);
   const changed=await f.request('/api/billing/checkout',{body:{plan:plan==='Operator'?'QuoteDone':'Operator',billingInterval}});assert.equal(changed.status,409);
   results.push({plan,billingInterval,price,recurringCents:amounts[price],initialChargeCents:0,providerCreateCount:f.calls.checkout.length,status:f0.get().planStatus,changedKeyResult:changed.body.code});
  }finally{await f.close();f0.db.close();}
 }return results;
});
await experiment('E18-expiry-delayed-webhook-duplicate-subscriptions','reconcile completed old session before issuing another checkout',async h=>{
 const f=await httpHarness(h);try{
  const first=await f.request('/api/billing/checkout',{body:{plan:'Operator',billingInterval:'monthly'},key:'synthetic-first-key'});assert.equal(first.status,201);
  const old=f.sessions.get('cs_1');old.status='complete';old.subscription='sub_A';old.payment_status='no_payment_required';
  h.setTime(T+3601);
  const second=await f.request('/api/billing/checkout',{body:{plan:'Operator',billingInterval:'monthly'},key:'synthetic-second-key'});assert.equal(second.status,201);assert.equal(f.calls.retrieve.length,0);
  const newer=f.sessions.get('cs_2');newer.status='complete';newer.subscription='sub_B';
  const e1=h.checkout('evt_first_complete',3500,{id:'cs_1'});const e2=h.checkout('evt_second_complete',3602,{id:'cs_2',subscription:'sub_B'});
  const a=await f.send(e1),b=await f.send(e2);assert.equal(a.status,200);assert.equal(b.status,500);
  return {sessionsCreated:f.calls.checkout.length,retrievalsBeforeReplacement:f.calls.retrieve.length,syntheticProviderSubscriptions:['sub_A','sub_B'],completionResponses:[a.status,b.status],ledger:h.db.prepare('SELECT stripeSessionId,status FROM billingCheckoutRequests ORDER BY stripeSessionId').all()};
 }finally{await f.close();}
});
await experiment('E19-receipt-write-failure-same-provider-key-recovery','lost local receipt causes exact-key provider retry, one remote session',async h=>{
 const f=await httpHarness(h);try{
  h.db.exec("CREATE TRIGGER synthetic_reject_receipt BEFORE UPDATE OF stripeSessionId ON billingCheckoutRequests WHEN NEW.stripeSessionId IS NOT NULL BEGIN SELECT RAISE(ABORT,'SYNTHETIC receipt loss'); END");
  const body={plan:'QuoteDone',billingInterval:'annual'},first=await f.request('/api/billing/checkout',{body});assert.equal(first.status,502);
  h.db.exec('DROP TRIGGER synthetic_reject_receipt');const retry=await f.request('/api/billing/checkout',{body});assert.equal(retry.status,201);
  assert.equal(f.calls.checkout[0].o.idempotencyKey,f.calls.checkout[1].o.idempotencyKey);assert.equal(f.sessions.size,1);
  return {responses:[first.status,retry.status],providerAttempts:f.calls.checkout.length,distinctProviderSessions:f.sessions.size,ledgerStatus:h.db.prepare('SELECT status FROM billingCheckoutRequests').get().status};
 }finally{await f.close();}
});
await experiment('E20-stale-billing-status-and-grace-ui','clock passage persists suspension; displayed state agrees with denied access',async h=>{
 const f=await httpHarness(h);try{
  h.service.applyVerifiedStripeEvent(h.sub('evt_active'));const e=h.inv('evt_fail',10,{status:'open',amount_paid:0});e.type='invoice.payment_failed';h.service.applyVerifiedStripeEvent(e);
  h.setTime(T+8*day);const r=await f.request('/api/billing/status');assert.equal(r.body.planStatus,'payment_failed');assert.equal(accountAccessDecision(h.get(),{now:new Date(h.now()*1000)}).allowed,false);
  return {status:r.body.planStatus,graceEndsAt:r.body.graceEndsAt,access:accountAccessDecision(h.get(),{now:new Date(h.now()*1000)}),manualSweep:h.service.suspendExpiredGracePeriods(),afterManualSweep:h.get().planStatus};
 }finally{await f.close();}
});
await experiment('E21-current-sdk-period-shape','subscription item period end is persisted',async h=>{
 const f=await httpHarness(h);try{
  const e=h.sub('evt_modern_shape',0,{items:{data:[{id:'si_SYNTHETIC',price:{id:'price_op_month'},current_period_start:T,current_period_end:T+30*day}]}});
  delete e.data.object.current_period_end;
  assert.equal((await f.send(e)).status,200);
  const r=await f.request('/api/billing/status');assert.equal(r.body.currentPeriodEndAt,null);
  return {expected:iso(T+30*day),stored:h.billing().currentPeriodEndAt,returned:r.body.currentPeriodEndAt};
 }finally{await f.close();}
});
await experiment('E22-unsupported-refund-capability','refund events are unsupported; no refund-access policy inferred',async h=>{
 const f=await httpHarness(h);try{
  h.service.applyVerifiedStripeEvent(h.sub('evt_active'));
  const e={id:'evt_refund',type:'charge.refunded',created:T+1,data:{object:{id:'ch_SYNTHETIC',customer:'cus_A',amount:11900,amount_refunded:11900,refunded:true}}};
  const r=await f.send(e);assert.equal(r.status,200);assert.equal(r.body.status,'IGNORED');assert.equal(h.get().planStatus,'active');
  return {response:r,status:h.get().planStatus,conclusion:'unsupported capability; cancellation after refund is an unspecified policy, not a confirmed refund-state defect'};
 }finally{await f.close();}
});
await experiment('E23-new-invoice-shape-supported','parent.subscription_details + pricing.price_details reconcile a current paid invoice',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_active',0,{items:{data:[{price:{id:'price_qd_month'}}]}}));
 const e=h.inv('evt_modern_invoice',1,{parent:{subscription_details:{subscription:'sub_A'}},amount_paid:27900,lines:{data:[{pricing:{price_details:{price:'price_qd_month'}}}]}});delete e.data.object.subscription;
 const r=h.service.applyVerifiedStripeEvent(e);assert.equal(r.plan,'QuoteDone');assert.equal(r.planStatus,'active');return {plan:r.plan,status:r.planStatus};
});
await experiment('E24-older-failure-cannot-regress-newer-recovery','late delivery of an older failure does not undo current paid recovery',h=>{
 h.service.applyVerifiedStripeEvent(h.sub('evt_active'));
 h.service.applyVerifiedStripeEvent(h.inv('evt_current_paid',100));
 const e=h.inv('evt_old_failure',50,{amount_paid:0,status:'open'});e.type='invoice.payment_failed';
 const r=h.service.applyVerifiedStripeEvent(e);assert.equal(r.outcome,'IGNORED_STALE');assert.equal(h.get().planStatus,'active');return {outcome:r.outcome,status:h.get().planStatus};
});
await experiment('E25-concurrent-checkout-requests','one provider session across overlapping same/different request keys',async h=>{
 const f=await httpHarness(h);try{
  const body={plan:'Operator',billingInterval:'monthly'};
  const results=await Promise.all([f.request('/api/billing/checkout',{body,key:'SYNTHETIC-key-A'}),f.request('/api/billing/checkout',{body,key:'SYNTHETIC-key-A'}),f.request('/api/billing/checkout',{body,key:'SYNTHETIC-key-B'})]);
  assert.equal(f.sessions.size,1);assert.equal(f.calls.checkout.length,1);assert.equal(results.every(r=>[201,409].includes(r.status)),true);
  return {responses:results.map(r=>r.status),providerSessions:f.sessions.size};
 }finally{await f.close();}
});
await experiment('E26-concurrent-duplicate-webhooks','duplicate verified HTTP deliveries commit one receipt/state event/outbox row',async h=>{
 const f=await httpHarness(h);try{
  const e=h.sub('evt_duplicate');const results=await Promise.all([f.send(e),f.send(e)]);assert.deepEqual(results.map(r=>r.status),[200,200]);
  const counts=Object.fromEntries(['billingEventReceipts','events','outboxEvents'].map(table=>[table,h.db.prepare('SELECT COUNT(*) n FROM '+table).get().n]));assert.deepEqual(Object.values(counts),[1,1,1]);return counts;
 }finally{await f.close();}
});
await experiment('E27-hydration-wrong-customer','signed session cannot borrow retrieved line items from another customer',async h=>{
 const f=await httpHarness(h);try{
  f.sessions.set('cs_A',{id:'cs_A',customer:'cus_B',subscription:'sub_A',line_items:{data:[{price:{id:'price_op_month'}}]}});
  const e=h.checkout('evt_wrong_hydration');delete e.data.object.line_items;
  const r=await f.send(e);assert.equal(r.status,500);assert.equal(h.get().planStatus,'pending_payment');return {status:r.status,accountStatus:h.get().planStatus};
 }finally{await f.close();}
});
writeFileSync(new URL('baseline-results.json',import.meta.url),JSON.stringify({auditedSha:'b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3',syntheticOnly:true,experimentCount:rows.length,rows},null,2)+'\n');
