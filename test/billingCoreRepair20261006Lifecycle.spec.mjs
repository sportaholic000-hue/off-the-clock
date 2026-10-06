import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,T,day,iso} from './billingCoreRepair20261006.helpers.mjs';
import {startBillingLifecycleWorker} from '../server/src/billingLifecycleWorker.js';
import {billingMutationDecision} from '../server/src/billingMutationGuard.js';
import {accountAccessDecision} from '../server/src/planAccess.js';
import {canContinueSetup,billingRecoveryMessage} from '../client/src/billingTransport.js';
const owner='SYNTHETIC-A';
function failed(){const h=harness();h.service.applyVerifiedStripeEvent(h.sub('evt_active'));const event=h.inv('evt_fail',1,{status:'open',amount_paid:0});event.type='invoice.payment_failed';h.service.applyVerifiedStripeEvent(event);return h;}
// No charge occurs in these lifecycle tests: $0. Failure at T+1 starts precisely seven days.
test('F07: boundary, bounded batches and restart produce one persisted suspension with one event/outbox',()=>{
 const h=failed();try{
  const count=table=>h.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
  const events=count('events'),outbox=count('outboxEvents');
  h.setTime(T+1+7*day-0.001);assert.equal(h.service.suspendExpiredGracePeriods().suspendedCount,0);
  h.setTime(T+1+7*day);let tick,cleared=0;const timers={setTimer:fn=>(tick=fn,{unref(){}}),clearTimer:()=>cleared++};
  const stop=startBillingLifecycleWorker({service:h.service,...timers});
  assert.equal(h.get().planStatus,'suspended');assert.equal(count('events'),events+1);assert.equal(count('outboxEvents'),outbox+1);
  tick();stop();tick();assert.equal(cleared,1);
  const stop2=startBillingLifecycleWorker({service:h.service,...timers});stop2();assert.equal(count('events'),events+1);
  assert.throws(()=>h.service.suspendExpiredGracePeriods({limit:1001}));
 }finally{h.db.close();}
});
test('F07: failure rolls back suspension/event/outbox and next worker tick retries',()=>{
 const h=failed();try{h.setTime(T+8*day);h.db.exec("CREATE TRIGGER SYNTHETIC_rollback BEFORE INSERT ON outboxEvents BEGIN SELECT RAISE(ABORT,'SYNTHETIC');END;");
 let tick;const errors=[];const stop=startBillingLifecycleWorker({service:h.service,onError:e=>errors.push(e),setTimer:fn=>(tick=fn,1),clearTimer:()=>{}});
 assert.equal(h.get().planStatus,'payment_failed');assert.deepEqual(errors,['BILLING_GRACE_SWEEP_FAILED']);h.db.exec('DROP TRIGGER SYNTHETIC_rollback');tick();assert.equal(h.get().planStatus,'suspended');stop();
 }finally{h.db.close();}
});
for(const [label,offset,allowed] of [['before',-1,false],['start',0,true],['last',7*day*1000-1,true],['end',7*day*1000,false],['after',8*day*1000,false]])test('F08: UI agrees with backend at grace '+label,()=>{
 const state={plan:'QuoteDone',planStatus:'payment_failed',paymentFailedAt:iso(T)},now=T*1000+offset;
 assert.equal(accountAccessDecision(state,{now}).allowed,allowed);assert.equal(canContinueSetup(state,now),allowed);
 assert.match(billingRecoveryMessage(state,now),/Manage billing/);assert.doesNotMatch(billingRecoveryMessage(state,now),/trial/);
});
for(const bad of [null,'bad','2026-02-30T00:00:00.000Z','2026-10-06T00:00:00Z'])test('F08: malformed failure timestamp cannot unlock setup '+bad,()=>{
 const state={plan:'Operator',planStatus:'past_due',paymentFailedAt:bad};assert.equal(canContinueSetup(state,T*1000),false);assert.equal(accountAccessDecision(state,{now:T*1000}).allowed,false);
});
test('F08: rendered billing source wires recovery copy independently of Continue setup',()=>{
 const source=readFileSync(new URL('../client/src/billing.jsx',import.meta.url),'utf8');assert.match(source,/billingRecoveryMessage\(state\).*Notice/);assert.match(source,/billingRecoveryMessage\(state\)\?null:<p>Complete checkout/);
});
for(const status of ['payment_failed','past_due','suspended','canceled','unpaid','trialing'])test('F09: '+status+' denies product mutations but allows reads and billing/auth recovery',()=>{
 const h=harness();try{h.service.applyVerifiedStripeEvent(h.sub('evt_active'));h.db.prepare('UPDATE users SET planStatus=?,paymentFailedAt=?,trialEndsAt=? WHERE id=?').run(status,iso(T-8*day),iso(T-1),owner);
 for(const method of ['POST','PUT','PATCH','DELETE'])for(const path of ['/api/leads/synthetic','/api/onboarding/account','/api/onboarding/voice','/api/onboarding/calendar','/api/onboarding/business-types','/api/onboarding/knowledge-base','/api/pricebook/save','/api/booking/settings','/api/integrations/webhook'])assert.equal(billingMutationDecision(h.db,{tenantOwnerId:owner,method,path},{now:T*1000}).allowed,false,path);
 for(const method of ['GET','HEAD','OPTIONS'])assert.equal(billingMutationDecision(h.db,{tenantOwnerId:owner,method,path:'/api/leads'},{now:T*1000}).allowed,true);
 for(const path of ['/api/billing/checkout','/api/billing/portal','/api/auth/account/resend-verification','/api/pricebook/validate'])assert.equal(billingMutationDecision(h.db,{tenantOwnerId:owner,method:'POST',path},{now:T*1000}).allowed,true);
 assert.equal(billingMutationDecision(h.db,{tenantOwnerId:owner,method:'POST',path:'/api/billing/portal/evil'},{now:T*1000}).allowed,false);
 }finally{h.db.close();}
});
test('F09: valid grace allows writes; pending allows only initial account setup',()=>{
 const h=failed();try{const req={tenantOwnerId:owner,method:'PATCH',path:'/api/leads/synthetic'};assert.equal(billingMutationDecision(h.db,req,{now:(T+2)*1000}).allowed,true);
 h.db.prepare("UPDATE users SET planStatus='pending_payment',paymentFailedAt=NULL WHERE id=?").run(owner);
 assert.equal(billingMutationDecision(h.db,{...req,method:'POST',path:'/api/onboarding/account'},{now:T*1000}).allowed,true);
 assert.equal(billingMutationDecision(h.db,req,{now:T*1000}).allowed,false);
 }finally{h.db.close();}
});

test('F07: two expired owners drain in bounded batches and owner-specific reads stay tenant-bound',()=>{
 const h=failed();try{
  h.service.registerBillingCustomer({ownerId:'SYNTHETIC-B',stripeCustomerId:'cus_B'});
  for(const raw of [h.sub('evt_B'),h.inv('evt_B_failure',1,{status:'open',amount_paid:0})]){raw.data.object.customer='cus_B';if(raw.type.startsWith('customer.'))raw.data.object.id='sub_B';else{raw.type='invoice.payment_failed';raw.data.object.subscription='sub_B';}h.service.applyVerifiedStripeEvent(raw);}
  h.setTime(T+8*day);assert.equal(h.service.suspendExpiredGracePeriods({limit:1,ownerId:'SYNTHETIC-B'}).suspendedCount,1);assert.equal(h.get().planStatus,'payment_failed');assert.equal(h.service.suspendExpiredGracePeriods({limit:1}).suspendedCount,1);assert.equal(h.service.suspendExpiredGracePeriods().suspendedCount,0);
 }finally{h.db.close();}
});

test('F09: actual authenticated staff mutation uses current owner state, not token claims',async()=>{
 const {requireAuth}=await import('../server/src/authMiddleware.js');const h=failed();try{
  let output,continued=0;const sessionService={validateAccess:()=>({id:'SYNTHETIC-staff',ownerId:owner,email:'staff@example.invalid',role:'staff'})};
  const middleware=requireAuth(['staff'],{database:h.db,verifyToken:()=>({sid:'synthetic',plan:'QuoteDone',planStatus:'active'}),sessionService});
  const req={headers:{authorization:'Bearer synthetic'},method:'PATCH',route:{path:'/api/leads/:id'}};
  const res={status(code){this.code=code;return this;},json(body){output=body;return this;}};
  // The fixed event instant is already beyond grace relative to this test's injected status.
  h.db.prepare("UPDATE users SET planStatus='suspended' WHERE id=?").run(owner);middleware(req,res,()=>continued++);
  assert.equal(req.tenantOwnerId,owner);assert.equal(res.code,403);assert.equal(output.code,'ACCOUNT_READ_ONLY');assert.equal(continued,0);
  req.method='GET';middleware(req,res,()=>continued++);assert.equal(continued,1);
 }finally{h.db.close();}
});
