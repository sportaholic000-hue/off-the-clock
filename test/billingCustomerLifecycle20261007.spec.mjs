import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import express from 'express';
import {fixture,A,B,START,SIGNUP,prices,fakeProviders} from './overageMinute20261006Fixture.mjs';
import {createBillingCustomerLifecycle,installBillingCustomerLifecycleRoutes} from '../server/src/billingCustomerLifecycle.js';
import {installTelephonyOperationsSchema} from '../server/src/telephonyOperationsMigration.js';
import {accountAccessDecision,hasQuoteDoneAccess} from '../server/src/planAccess.js';
import {billingMutationDecision} from '../server/src/billingMutationGuard.js';
import {canContinueSetup} from '../client/src/billingTransport.js';

const END='2026-11-20T12:00:00.000Z',YEAR_END='2027-10-20T12:00:00.000Z';
const sec=at=>Date.parse(at)/1000;
function setup(t,options={}){
  const f=fixture(t,options),writes={cancel:[],update:[],coverage:[],release:[]};installTelephonyOperationsSchema(f.db);
  f.fakes.stripe.invoices.createPreview=async({customer,subscription})=>{const sub=f.fakes.subscriptions.get(subscription),price=await f.fakes.stripe.prices.retrieve(sub.items.data[0].price.id);return {customer,currency:price.currency,amount_due:price.unit_amount,lines:{has_more:false,data:[{price:{id:price.id},period:{start:sub.status==='trialing'?sub.trial_end:sub.current_period_end}}]}};};
  f.fakes.stripe.subscriptions.update=async(id,params)=>{
    writes.update.push({id,params});const sub=f.fakes.subscriptions.get(id);Object.assign(sub,params);return structuredClone(sub);
  };
  f.fakes.stripe.subscriptions.cancel=async(id,params)=>{
    writes.cancel.push({id,params});const sub=f.fakes.subscriptions.get(id);sub.status='canceled';return structuredClone(sub);
  };
  const telephony={async setCoverage(ownerId,enabled){writes.coverage.push({ownerId,enabled});f.db.prepare('UPDATE businessProfiles SET operatorEnabled=? WHERE ownerId=?').run(enabled?1:0,ownerId);return {confirmedEnabled:enabled,pending:false};}};
  const lifecycle=createBillingCustomerLifecycle({database:f.db,priceIds:prices,stripeClient:f.fakes.stripe,emailProvider:f.fakes.email,
    enabled:()=>true,clock:f.clock,dashboardUrl:'https://synthetic.example.invalid/settings',telephony,releaseNumber:async input=>{writes.release.push(input);return {released:true};}});
  const user=(id=A)=>f.db.prepare('SELECT * FROM users WHERE id=?').get(id);
  const profile=(id=A)=>f.db.prepare("INSERT INTO businessProfiles(ownerId,twilioNumber,twilioNumberSid,existingPhoneNumber,operatorEnabled,phoneProvisioningStatus,updatedAt) VALUES(?,?,'PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','+19025550100',1,'provisioned',?)").run(id,id===A?'+19025550101':'+19025550102',START);
  return {...f,lifecycle,writes,user,profile};
}
function payment(f,{id='in_SYNTHETIC_lifecycle',ownerId=A,plan='Operator',interval='monthly',amount=11900,start=START,end=END,type='invoice.paid',created=sec(START)}={}){
  const object={id,customer:'cus_'+ownerId,subscription:'sub_'+ownerId,currency:'cad',status:type==='invoice.paid'?'paid':'open',amount_paid:type==='invoice.paid'?amount:0,amount_remaining:type==='invoice.paid'?0:amount,
    period_start:sec(start),period_end:sec(end),lines:{has_more:false,data:[{price:{id:prices[plan][interval]},amount,quantity:1,period:{start:sec(start),end:sec(end)}}]}};
  const event={id:'evt_'+id+'_'+type,type,created,livemode:false,data:{object}};f.billing.applyVerifiedStripeEvent(event);return event;
}
for(const [plan,interval,amount,end] of [['Operator','monthly',11900,END],['QuoteDone','monthly',27900,END],['Operator','annual',119000,YEAR_END],['QuoteDone','annual',279000,YEAR_END]]){
  test(`${plan} ${interval}: trial reminder exactly October 17, once, amount ${amount}`,async t=>{
    const f=setup(t);f.setTime(SIGNUP);f.subscription(A,{plan,interval,status:'trialing',start:SIGNUP,end:START});
    f.setTime('2026-10-17T11:59:59.999Z');await f.lifecycle.processOwner(A);assert.equal(f.lifecycle.snapshot(A).notices.length,0);
    f.setTime('2026-10-17T12:00:00.000Z');await f.lifecycle.processOwner(A);await f.lifecycle.processOwner(A);
    const notices=f.lifecycle.snapshot(A).notices;assert.equal(notices.length,1);assert.equal(notices[0].amountCents,amount);assert.equal(notices[0].dueAt,START);
    assert.match(notices[0].message,/billingAction=cancel/);assert.match(notices[0].message,/billingAction=change/);assert.equal(f.fakes.mail.size,1);
    assert.equal(notices[0].emailStatus,'DELIVERED');assert.equal(f.lifecycle.snapshot(B).notices.length,0);
  });
  test(`${plan} ${interval}: no paid term before trial end; first charge ${amount}`,t=>{
    const f=setup(t);f.setTime(SIGNUP);f.subscription(A,{plan,interval,status:'trialing',start:SIGNUP,end:START});
    assert.equal(f.user().paidThroughAt,null);assert.equal(f.db.prepare('SELECT count(*) n FROM billingInvoiceEvidence').get().n,0);
    f.setTime(START);f.subscription(A,{plan,interval,start:START,end});payment(f,{plan,interval,amount,end});
    assert.equal(f.user().paidThroughAt,end);assert.equal(f.lifecycle.snapshot(A).notices[0].amountCents,amount);
  });
}
test('annual renewal reminder: September 20 2027, exactly $1,190 and October 20 date',async t=>{
  const f=setup(t);f.activate(A,{interval:'annual'});f.setTime('2027-09-20T11:59:59.999Z');await f.lifecycle.processOwner(A);
  assert.equal(f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='annual_renewal').length,0);
  f.setTime('2027-09-20T12:00:00.000Z');await f.lifecycle.processOwner(A);await f.lifecycle.processOwner(A);
  const n=f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='annual_renewal');assert.equal(n.length,1);assert.equal(n[0].amountCents,119000);assert.equal(n[0].dueAt,YEAR_END);
});
for(const [interval,end,cancelAt,releaseAt,deleteAt] of [['monthly',END,'2026-11-01T12:00:00.000Z','2026-12-20T12:00:00.000Z','2027-02-18T12:00:00.000Z'],['annual',YEAR_END,'2027-01-10T12:00:00.000Z','2027-11-19T12:00:00.000Z','2028-01-18T12:00:00.000Z']]){
  test(`${interval}: cancel mid-period, no refund, access ends at paid boundary`,async t=>{
    const f=setup(t);f.activate(A,{interval});f.profile();f.setTime(cancelAt);await f.lifecycle.cancel(A);await f.lifecycle.cancel(A);
    assert.equal(f.user().serviceEndsAt,end);assert.equal(f.writes.update.length,1);assert.deepEqual(f.writes.update[0].params,{cancel_at_period_end:true,proration_behavior:'none'});assert.equal(f.writes.cancel.length,0);
    f.setTime(Date.parse(end)-1);assert.equal(accountAccessDecision(f.user(),{now:f.clock()}).allowed,true);assert.equal(canContinueSetup(f.user(),f.clock()),true);
    f.setTime(end);assert.equal(accountAccessDecision(f.user(),{now:f.clock()}).allowed,false);assert.equal(canContinueSetup(f.user(),f.clock()),false);
    assert.equal(billingMutationDecision(f.db,{method:'POST',path:'/api/leads',tenantOwnerId:A},{now:f.clock()}).allowed,false);
    await f.lifecycle.processOwner(A);assert.deepEqual(f.writes.coverage,[{ownerId:A,enabled:false}]);await f.lifecycle.processOwner(A);assert.equal(f.writes.coverage.length,1);
    const state=f.lifecycle.snapshot(A);assert.equal(state.cancellation.phoneReleaseAt,releaseAt);assert.equal(state.cancellation.exportUntilAt,deleteAt);
  });
  test(`${interval}: exact 30-day phone and 90-day export/deletion boundaries, tenant isolation`,async t=>{
    const f=setup(t);f.activate(A,{interval});f.activate(B);f.profile();f.setTime(cancelAt);await f.lifecycle.cancel(A);
    for(const id of [A,B]){
      f.db.prepare("INSERT INTO calls(id,ownerId,transcriptJson,createdAt) VALUES(?,?,?,?)").run('call_'+id,id,'["SYNTHETIC private transcript"]',START);
      f.db.prepare('INSERT INTO leads(id,ownerId,callId,customerName,createdAt) VALUES(?,?,?,?,?)').run('lead_'+id,id,'call_'+id,'=SYNTHETIC formula',START);
      f.db.prepare('INSERT INTO quotes(id,ownerId,callId,resultJson,createdAt) VALUES(?,?,?,?,?)').run('quote_'+id,id,'call_'+id,'{"SYNTHETIC":true}',START);
    }
    f.setTime(Date.parse(releaseAt)-1);await f.lifecycle.processOwner(A);assert.equal(f.writes.release.length,0);
    f.setTime(releaseAt);await f.lifecycle.processOwner(A);await f.lifecycle.processOwner(A);assert.equal(f.writes.release.length,1);
    assert.equal(f.db.prepare('SELECT twilioNumber FROM businessProfiles WHERE ownerId=?').get(A).twilioNumber,null);
    f.setTime(Date.parse(deleteAt)-1);const csv=f.lifecycle.exportCsv(A,'leads');assert.match(csv,/'=SYNTHETIC/);assert.ok(!csv.includes('lead_'+B));
    assert.match(f.lifecycle.exportCsv(A,'calls'),/private transcript/);assert.match(f.lifecycle.exportCsv(A,'quotes'),/SYNTHETIC/);
    f.setTime(deleteAt);assert.throws(()=>f.lifecycle.exportCsv(A,'leads'),{code:'BILLING_EXPORT_EXPIRED'});
    await f.lifecycle.processOwner(A);await f.lifecycle.processOwner(A);
    for(const table of ['calls','leads','quotes']){assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table} WHERE ownerId=?`).get(A).n,0);assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table} WHERE ownerId=?`).get(B).n,1);}
  });
}
test('trial cancel is immediate with no invoice and no refund',async t=>{
  const f=setup(t);f.setTime('2026-10-17T12:00:00.000Z');f.subscription(A,{status:'trialing',start:SIGNUP,end:START});await f.lifecycle.cancel(A);await f.lifecycle.cancel(A);
  assert.equal(f.user().serviceEndsAt,'2026-10-17T12:00:00.000Z');assert.equal(f.writes.cancel.length,1);assert.deepEqual(f.writes.cancel[0].params,{prorate:false,invoice_now:false});
  assert.equal(accountAccessDecision(f.user(),{now:f.clock()}).allowed,false);assert.equal(f.db.prepare('SELECT count(*) n FROM billingInvoiceEvidence').get().n,0);
});
test('reactivation before period end reverses scheduled cancel once, keeps records',async t=>{
  const f=setup(t);f.activate();f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);await f.lifecycle.reactivate(A);await f.lifecycle.reactivate(A);
  assert.equal(f.user().serviceEndsAt,null);assert.equal(f.writes.update.length,2);assert.deepEqual(f.writes.update[1].params,{cancel_at_period_end:false,proration_behavior:'none'});
  f.setTime('2027-02-18T12:00:00.000Z');await f.lifecycle.processOwner(A);assert.equal(f.lifecycle.snapshot(A).cancellation.dataDeletedAt,null);assert.equal(f.writes.release.length,0);
});
test('after termination reactivation requires a new verified subscription; unpaid redirect cannot restore',async t=>{
  const f=setup(t);f.activate();f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);f.setTime(END);await f.lifecycle.processOwner(A);
  await assert.rejects(f.lifecycle.reactivate(A),{code:'BILLING_NEW_SUBSCRIPTION_REQUIRED'});assert.equal(accountAccessDecision(f.user(),{now:f.clock()}).allowed,false);
});
test('paid receipt and failed-payment notice each once; exact seven-day grace and settlement recovery',async t=>{
  const f=setup(t);f.activate();const fail=payment(f,{id:'in_SYNTHETIC_debt',type:'invoice.payment_failed',created:sec(START)});
  f.billing.applyVerifiedStripeEvent(fail);await f.lifecycle.processOwner(A);await f.lifecycle.processOwner(A);
  assert.equal(f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='payment_failed').length,1);assert.equal(f.user().paymentFailedAt,START);
  f.setTime('2026-10-27T12:00:00.000Z');assert.equal(accountAccessDecision(f.user(),{now:f.clock()}).allowed,false);f.billing.suspendExpiredGracePeriods();await f.lifecycle.processOwner(A);
  assert.equal(f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='suspended').length,1);
  payment(f,{id:'in_SYNTHETIC_debt',created:sec('2026-10-27T12:00:00.000Z')});f.billing.applyVerifiedStripeEvent(fail);await f.lifecycle.processOwner(A);
  assert.equal(f.user().planStatus,'active');assert.equal(f.user().paymentFailedAt,null);assert.equal(f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='payment_failed').length,1);
  assert.equal(f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='receipt'&&n.referenceId==='in_SYNTHETIC_debt').length,1);
});
test('subscription receipt preserves actual charge currency and handwritten amount',async t=>{
  const f=setup(t);f.subscription();const event=payment(f);f.billing.applyVerifiedStripeEvent(event);await f.lifecycle.processOwner(A);
  const n=f.lifecycle.snapshot(A).notices.find(n=>n.referenceId==='in_SYNTHETIC_lifecycle');assert.equal(n.amountCents,11900);assert.equal(n.currency,'cad');assert.match(n.message,/\$119.00 CAD/);assert.equal(f.fakes.mail.size,1);
});

test('settled invoices suppress stale failure notices in either event order and at dispatch',async t=>{
  // Handwritten receipt oracle: the synthetic monthly payment is $119.00 CAD.
  for(const order of ['paid-then-older-failed','failed-then-paid-before-sync','failed-queued-then-paid-before-dispatch','failed-queued-then-paid-minute-worker-dispatch','paid-only'])await t.test(order,async t=>{
    const f=setup(t);f.subscription();
    const id='in_SYNTHETIC_settled',fail=()=>payment(f,{id,type:'invoice.payment_failed',created:sec(START)+1});
    const settle=()=>payment(f,{id,created:sec(START)+2});
    if(order==='paid-then-older-failed'){settle();fail();}
    else if(order==='paid-only')settle();
    else{
      fail();
      if(order.startsWith('failed-queued'))f.lifecycle.syncNotices(A);
      settle();
      // Deliberately bypass syncNotices to exercise the final send guard.
      if(order==='failed-queued-then-paid-before-dispatch')await f.lifecycle.emails.deliverOne(A);
      if(order==='failed-queued-then-paid-minute-worker-dispatch')await f.service.emails.deliverOne(A);
    }
    await f.lifecycle.processOwner(A);await f.lifecycle.processOwner(A);
    const invoice=f.db.prepare('SELECT * FROM billingInvoiceEvidence WHERE ownerId=? AND stripeInvoiceId=?').get(A,id);
    assert.equal(invoice.status,'PAID');if(order!=='paid-only')assert.ok(invoice.failedAt!==null,'Retain failure history');
    assert.deepEqual(f.fakes.writes.email.map(mail=>mail.subject),['Your payment receipt']);
    assert.match(f.fakes.writes.email[0].text,/\$119.00 CAD/);
    const notices=f.lifecycle.snapshot(A).notices,failed=notices.filter(n=>n.kind==='payment_failed');
    if(order.startsWith('failed-queued')){assert.equal(failed.length,1);assert.equal(failed[0].emailStatus,'SUPPRESSED');assert.equal(failed[0].deliveryError,null);}
    else assert.equal(failed.length,0);
    assert.equal(notices.filter(n=>n.kind==='receipt').length,1);assert.equal(f.lifecycle.snapshot(B).notices.length,0);
  });
});
test('overage receipt: ten extra minutes × 35 cents = $3.50, once',async t=>{
  const f=setup(t);f.activate();f.call(310*60);f.setTime(END);await f.service.processOwner(A);await f.lifecycle.processOwner(A);await f.lifecycle.processOwner(A);
  const n=f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='receipt'&&n.message.startsWith('Overage'));assert.equal(n.length,1);assert.equal(n[0].amountCents,350);
});
test('final overage remainder is charged at the service-end boundary',async t=>{
  const f=setup(t);f.activate();f.call(310*60);f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);f.setTime(END);await f.service.processOwner(A);assert.equal(f.fakes.writes.invoice.length,1);assert.equal([...f.fakes.items.values()][0].amount,350);
});
test('lost email response and restart retain one accepted notice',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'billing-lifecycle-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const filename=join(dir,'db.sqlite'),providers=fakeProviders();
  const f=setup(t,{filename,fakes:providers});f.subscription();payment(f);providers.fail('email','after');await f.lifecycle.processOwner(A);assert.equal(providers.mail.size,1);f.close();
  const g=setup(t,{filename,resume:true,fakes:providers});g.setTime('2026-10-20T12:01:00.000Z');await g.lifecycle.processOwner(A);await g.lifecycle.processOwner(A);
  assert.equal(providers.mail.size,1);assert.equal(g.lifecycle.snapshot(A).notices[0].emailStatus,'DELIVERED');assert.equal(g.lifecycle.snapshot(A).notices.length,1);
});
test('email ambiguity after retry window does not duplicate delivery',async t=>{
  const f=setup(t);f.subscription();payment(f);f.fakes.fail('email','after');await f.lifecycle.processOwner(A);f.setTime('2026-10-22T12:00:00.000Z');await f.lifecycle.processOwner(A);
  assert.equal(f.fakes.mail.size,1);assert.equal(f.lifecycle.snapshot(A).notices[0].emailStatus,'REVIEW');
});
test('cancellation lost response recovers by subscription read without repeating mutation',async t=>{
  const f=setup(t);f.activate();f.setTime('2026-11-01T12:00:00.000Z');const update=f.fakes.stripe.subscriptions.update;
  f.fakes.stripe.invoices.createPreview=async({customer,subscription})=>{const sub=f.fakes.subscriptions.get(subscription),price=await f.fakes.stripe.prices.retrieve(sub.items.data[0].price.id);return {customer,currency:price.currency,amount_due:price.unit_amount,lines:{has_more:false,data:[{price:{id:price.id},period:{start:sub.status==='trialing'?sub.trial_end:sub.current_period_end}}]}};};
  f.fakes.stripe.subscriptions.update=async(...args)=>{await update(...args);throw Error('SYNTHETIC response lost');};await assert.rejects(f.lifecycle.cancel(A));
  await f.lifecycle.cancel(A);assert.equal(f.writes.update.length,1);assert.equal(f.user().serviceEndsAt,END);
});
test('wrong provider customer cannot cancel or receive access and does not affect tenant B',async t=>{
  const f=setup(t);f.activate();f.activate(B);f.setTime('2026-11-01T12:00:00.000Z');f.fakes.subscriptions.get('sub_'+A).customer='cus_'+B;
  await assert.rejects(f.lifecycle.cancel(A),{code:'BILLING_PROVIDER_MISMATCH'});assert.equal(f.writes.update.length,0);assert.equal(f.user(B).serviceEndsAt,null);
});
test('invalid price cannot create a false trial reminder',async t=>{
  const f=setup(t);f.subscription(A,{status:'trialing',start:SIGNUP,end:START});f.setTime('2026-10-17T12:00:00.000Z');f.fakes.stripe.prices.retrieve=async id=>({id,unit_amount:1,currency:'cad',recurring:{interval:'month'}});
  await assert.rejects(f.lifecycle.reminders(A),{code:'BILLING_PRICE_CONFIRMATION_REQUIRED'});assert.equal(f.lifecycle.snapshot(A).notices.length,0);
});
test('HTTP owner actions and CSV exports reject owner spoofing, cross-tenant bodies and staff',async t=>{
  const f=setup(t);f.activate();f.activate(B);const app=express();app.use(express.json());
  const requireAuth=()=> (req,res,next)=>{if(req.get('X-Synthetic-Role')==='staff')return res.sendStatus(403);req.tenantOwnerId=req.get('X-Synthetic-Owner');next();};
  installBillingCustomerLifecycleRoutes(app,{service:f.lifecycle,requireAuth,requireProviderWrites:(req,res,next)=>next(),asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next)});
  app.use((err,req,res,next)=>res.status(err.statusCode||500).json({code:err.code}));const server=app.listen(0);t.after(()=>new Promise(resolve=>server.close(resolve)));const url='http://127.0.0.1:'+server.address().port;
  const send=(path,body={},ownerId=A,role='owner')=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json','X-Synthetic-Owner':ownerId,'X-Synthetic-Role':role},body:JSON.stringify(body)});
  assert.equal((await send('/api/billing/cancel',{ownerId:B})).status,400);assert.equal((await send('/api/billing/cancel',{},A,'staff')).status,403);
  f.setTime('2026-11-01T12:00:00.000Z');assert.equal((await send('/api/billing/cancel')).status,200);assert.equal(f.user(B).serviceEndsAt,null);
  const csv=await fetch(url+'/api/billing/export/leads?ownerId='+B,{headers:{'X-Synthetic-Owner':A}});assert.equal(csv.status,200);assert.match(csv.headers.get('content-type'),/text\/csv/);
});
function replacement(f,start,end,{paid=true}={}){
  const created=sec(start)+60,newSub='sub_SYNTHETIC_reactivation',session='cs_SYNTHETIC_reactivation';
  f.db.prepare(`INSERT INTO billingCheckoutRequests(id,ownerId,idempotencyKeyHash,requestDigest,plan,billingInterval,stripePriceId,stripeCustomerId,providerIdempotencyKey,successUrl,cancelUrl,integrationIdentifier,stripeSessionId,sessionUrlCiphertext,sessionUrlIv,sessionUrlTag,sessionUrlKeyVersion,status,leaseExpiresAt,expiresAt,providerCreatedAt,createdAt,updatedAt)
    VALUES('SYNTHETIC-reactivation',?,'SYNTHETIC-key','SYNTHETIC-digest','Operator','monthly',?,?,'SYNTHETIC-provider-key','https://synthetic.example.invalid/success','https://synthetic.example.invalid/cancel','off_the_clock_abcdefgh',?,'SYNTHETIC-cipher','SYNTHETIC-iv','SYNTHETIC-tag','v1','OPEN',?,?,?,?,?)`)
    .run(A,prices.Operator.monthly,'cus_'+A,session,new Date(created*1000+3600000).toISOString(),new Date(created*1000+3600000).toISOString(),new Date(created*1000).toISOString(),start,start);
  const send=(type,object,offset)=>f.billing.applyVerifiedStripeEvent({id:'evt_SYNTHETIC_reactivation_'+type,type,created:created+offset,livemode:false,data:{object}});
  send('checkout.session.completed',{id:session,customer:'cus_'+A,subscription:newSub,mode:'subscription',status:'complete',payment_status:'paid',line_items:{data:[{price:{id:prices.Operator.monthly}}]}},1);
  send('customer.subscription.created',{id:newSub,customer:'cus_'+A,status:'active',default_payment_method:'pm_SYNTHETIC_new',current_period_start:sec(start),current_period_end:sec(end),billing_cycle_anchor:sec(start),cancel_at_period_end:false,items:{data:[{price:{id:prices.Operator.monthly,currency:'cad',recurring:{interval:'month'}}}]}},2);
  if(paid)send('invoice.paid',{id:'in_SYNTHETIC_reactivation',customer:'cus_'+A,subscription:newSub,status:'paid',amount_paid:11900,currency:'cad',period_start:sec(start),period_end:sec(end),lines:{has_more:false,data:[{price:{id:prices.Operator.monthly},quantity:1,amount:11900,period:{start:sec(start),end:sec(end)}}]}},3);
}
for(const [start,end,released,deleted] of [['2026-12-01T12:00:00.000Z','2027-01-01T12:00:00.000Z',false,false],['2026-12-21T12:00:00.000Z','2027-01-21T12:00:00.000Z',true,false],['2027-02-19T12:00:00.000Z','2027-03-19T12:00:00.000Z',true,true]]){
  test(`verified reactivation ${start}: phone released=${released}, records deleted=${deleted}`,async t=>{
    const f=setup(t);f.activate();f.profile();f.db.prepare("INSERT INTO leads(id,ownerId,customerName,createdAt) VALUES('SYNTHETIC-retained',?,'SYNTHETIC',?)").run(A,START);
    f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);f.setTime(END);f.subscription(A,{status:'canceled'});await f.lifecycle.processOwner(A);
    f.setTime(start);await f.lifecycle.processOwner(A);replacement(f,start,end);assert.equal(accountAccessDecision(f.user(),{now:f.clock()}).allowed,false);
    await f.lifecycle.processOwner(A);assert.equal(accountAccessDecision(f.user(),{now:f.clock()}).allowed,true);assert.equal(f.user().serviceEndsAt,null);
    assert.equal(f.db.prepare('SELECT count(*) n FROM leads WHERE ownerId=?').get(A).n,deleted?0:1);
    assert.equal(f.db.prepare('SELECT twilioNumber FROM businessProfiles WHERE ownerId=?').get(A).twilioNumber,released?null:'+19025550101');
    assert.equal(f.lifecycle.snapshot(A).cancellation.state,'RESTORED');
  });
}
test('new active/card-only subscription without its paid invoice cannot restore retained service',async t=>{
  const f=setup(t);f.activate();f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);f.setTime(END);f.subscription(A,{status:'canceled'});
  f.setTime('2026-12-01T12:00:00.000Z');replacement(f,'2026-12-01T12:00:00.000Z','2027-01-01T12:00:00.000Z',{paid:false});await f.lifecycle.processOwner(A);
  assert.equal(accountAccessDecision(f.user(),{now:f.clock()}).allowed,false);assert.equal(f.user().serviceEndsAt,END);
});
test('overage failure uses the existing grace and suspension path; paid callback recovers without duplicates',async t=>{
  const f=setup(t);f.activate();f.call(310*60);f.setTime(END);f.fakes.stripe.invoices.finalizeInvoice=async id=>{const invoice=f.fakes.invoices.get(id);invoice.status='open';invoice.amount_remaining=350;return structuredClone(invoice);};
  await f.service.processOwner(A);const invoice=[...f.fakes.invoices.values()][0],fail={id:'evt_SYNTHETIC_usage_failed',created:sec(END),type:'invoice.payment_failed',data:{object:invoice}};
  assert.equal(f.service.applyInvoiceEvent(fail),true);assert.equal(f.service.applyInvoiceEvent(fail),true);await f.lifecycle.processOwner(A);assert.equal(f.user().paymentFailedAt,END);
  assert.equal(f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='payment_failed').length,1);f.setTime('2026-11-27T12:00:00.000Z');f.billing.suspendExpiredGracePeriods();assert.equal(f.user().planStatus,'suspended');
  const paid={...invoice,status:'paid',amount_remaining:0,amount_paid:350};f.service.applyInvoiceEvent({id:'evt_SYNTHETIC_usage_paid',created:sec('2026-11-27T12:00:00.000Z'),type:'invoice.paid',data:{object:paid}});await f.lifecycle.processOwner(A);
  assert.equal(f.user().planStatus,'active');assert.equal(f.user().paymentFailedAt,null);assert.equal(f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='receipt'&&n.referenceId===invoice.id).length,1);
});
test('reminder uses invoice preview total with tax, not an invented base amount',async t=>{
  const f=setup(t);f.subscription(A,{status:'trialing',start:SIGNUP,end:START});f.setTime('2026-10-17T12:00:00.000Z');const preview=f.fakes.stripe.invoices.createPreview;
  f.fakes.stripe.invoices.createPreview=async(...args)=>({...await preview(...args),amount_due:13685}); // 11900 + 15% (1785) = 13685
  await f.lifecycle.reminders(A);assert.equal(f.lifecycle.snapshot(A).notices[0].amountCents,13685);assert.match(f.lifecycle.snapshot(A).notices[0].message,/\$136.85 CAD/);
});
test('cancelled renewal suppresses the reminder; incorrect preview tenant fails closed',async t=>{
  const f=setup(t);f.activate(A,{interval:'annual'});f.setTime('2027-09-20T12:00:00.000Z');const preview=f.fakes.stripe.invoices.createPreview;
  f.fakes.stripe.invoices.createPreview=async(...args)=>({...await preview(...args),customer:'cus_'+B});await assert.rejects(f.lifecycle.reminders(A),{code:'BILLING_AMOUNT_CONFIRMATION_REQUIRED'});
  await f.lifecycle.cancel(A);await f.lifecycle.processOwner(A);assert.equal(f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='annual_renewal').length,0);
});
test('90-day erasure removes transcripts, quote response copies, booking rows and hashed tool receipts',async t=>{
  const f=setup(t);f.activate();f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);
  const sid='CA'+'a'.repeat(32);f.db.prepare("INSERT INTO calls(id,ownerId,callSid,transcriptJson,createdAt) VALUES('SYNTHETIC-purge-call',?,?,?,?)").run(A,sid,'SYNTHETIC_TRANSCRIPT',START);
  f.db.prepare("INSERT INTO transcriptTurns(id,ownerId,callId,sequence,role,text,createdAt) VALUES('SYNTHETIC-turn',?,'SYNTHETIC-purge-call',1,'caller','SYNTHETIC_PRIVATE',?)").run(A,START);
  const {createHash}=await import('node:crypto'),scope=createHash('sha256').update(A+'\0'+sid).digest('hex');
  f.db.prepare("INSERT INTO voiceToolIdempotencyReceipts(scopeHash,idempotencyKey,requestDigest,status,responseJson,leaseExpiresAtUtc,createdAt,updatedAt) VALUES(?,'SYNTHETIC-key',?,'COMPLETED','SYNTHETIC_PRIVATE',?,?,?)").run(scope,'a'.repeat(64),START,START,START);
  f.setTime('2027-02-18T12:00:00.000Z');await f.lifecycle.processOwner(A);
  assert.equal(f.db.prepare('SELECT count(*) n FROM transcriptTurns WHERE ownerId=?').get(A).n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM voiceToolIdempotencyReceipts WHERE scopeHash=?').get(scope).n,0);
});
test('merged 90-day erasure removes callback, alert, SMS and inbound receipt copies only for the ended tenant',async t=>{
  const f=setup(t);f.activate(A);f.activate(B);f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);
  const {createHash}=await import('node:crypto');
  const scopes={};
  for(const [owner,n] of [[A,'a'],[B,'b']]){
    const call='SYNTHETIC-call-'+n,lead='SYNTHETIC-lead-'+n,sms='SYNTHETIC-sms-'+n,sid='CA'+n.repeat(32);
    f.db.prepare('INSERT INTO calls(id,ownerId,callSid,createdAt) VALUES(?,?,?,?)').run(call,owner,sid,START);
    f.db.prepare('INSERT INTO leads(id,ownerId,callId,createdAt) VALUES(?,?,?,?)').run(lead,owner,call,START);
    f.db.prepare("INSERT INTO callbackRequests(id,ownerId,callId,leadId,requestKey,source,notes,createdAt,updatedAt) VALUES(?,?,?,?,?,'voice','SYNTHETIC_PRIVATE',?,?)").run('SYNTHETIC-callback-'+n,owner,call,lead,'SYNTHETIC-key',START,START);
    const alert=f.db.prepare('SELECT id FROM ownerAlerts WHERE ownerId=? AND aggregateId=?').get(owner,lead).id;
    f.db.prepare("UPDATE ownerAlerts SET messageJson='SYNTHETIC_PRIVATE' WHERE ownerId=? AND id=?").run(owner,alert);
    f.db.prepare("INSERT INTO ownerAlertAttempts(id,ownerId,alertId,attemptNumber,status,startedAt) VALUES(?,?,?,1,'FAILED',?)").run('SYNTHETIC-alert-attempt-'+n,owner,alert,START);
    f.db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES(?,?,'voice.sms_requested',?,'{}','SENT',?,?)").run(sms,owner,sid,START,START);
    f.db.prepare("INSERT INTO voiceSmsDeliveries(id,ownerId,callSid,recordType,recordId,requestJson,callbackToken,status,createdAt,updatedAt) VALUES(?,?,?,'lead',?,'SYNTHETIC_PRIVATE',?,'SENT',?,?)").run(sms,owner,sid,lead,n.repeat(48),START,START);
    f.db.prepare("INSERT INTO voiceSmsAttempts(id,ownerId,deliveryId,attemptNumber,status,startedAt) VALUES(?,?,?,1,'SENT',?)").run('SYNTHETIC-sms-attempt-'+n,owner,sms,START);
    const email='SYNTHETIC-email-'+n;
    f.db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES(?,?,'quote.email_requested',?,'{}','DELIVERED',?,?)").run(email,owner,lead,START,START);
    f.db.prepare('INSERT INTO voiceQuoteNarrations(ownerId,requestId,callSid,narration,createdAt) VALUES(?,?,?,?,?)').run(owner,email,sid,'SYNTHETIC_PRIVATE',START);
    f.db.prepare('INSERT INTO quoteEmailRecipients(ownerId,requestId,callSid,email,version,updatedAt) VALUES(?,?,?,?,?,?)').run(owner,email,sid,'caller@example.invalid','SYNTHETIC',START);
    f.db.prepare("INSERT INTO quoteEmailDeliveries(id,ownerId,requestId,recordId,callSid,recipient,businessName,narration,messageJson,tokenHash,expiresAt,status,createdAt,updatedAt) VALUES(?,?,?,?,?,'caller@example.invalid','SYNTHETIC','SYNTHETIC_PRIVATE','{}',?,0,'DELIVERED',?,?)").run(email,owner,email,lead,sid,n.repeat(64),START,START);
    scopes[owner]=createHash('sha256').update('inbound\0'+owner+'\0'+sid).digest('hex');
    f.db.prepare("INSERT INTO voiceToolIdempotencyReceipts(scopeHash,idempotencyKey,requestDigest,status,responseJson,leaseExpiresAtUtc,createdAt,updatedAt) VALUES(?,'inbound',?,'COMPLETED','SYNTHETIC_PRIVATE',?,?,?)").run(scopes[owner],'a'.repeat(64),START,START,START);
  }
  const tables=['quoteEmailDeliveries','quoteEmailRecipients','voiceQuoteNarrations','callbackRequests','ownerAlertAttempts','ownerAlerts','voiceSmsAttempts','voiceSmsDeliveries','calls','leads'];
  const before=Object.fromEntries(tables.map(table=>[table,f.db.prepare('SELECT * FROM '+table+' WHERE ownerId=? ORDER BY rowid').all(B)]));
  const financial=f.db.prepare('SELECT id FROM billingLifecycleNotices WHERE ownerId=?').all(A);
  f.setTime('2027-02-18T11:59:59.999Z');await f.lifecycle.processOwner(A);
  assert.equal(f.db.prepare('SELECT count(*) n FROM callbackRequests WHERE ownerId=?').get(A).n,1);
  f.setTime('2027-02-18T12:00:00.000Z');await f.lifecycle.processOwner(A);
  for(const table of tables){assert.equal(f.db.prepare('SELECT count(*) n FROM '+table+' WHERE ownerId=?').get(A).n,0,table);assert.deepEqual(f.db.prepare('SELECT * FROM '+table+' WHERE ownerId=? ORDER BY rowid').all(B),before[table],table+' B');}
  assert.equal(f.db.prepare('SELECT count(*) n FROM voiceToolIdempotencyReceipts WHERE scopeHash=?').get(scopes[A]).n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM voiceToolIdempotencyReceipts WHERE scopeHash=?').get(scopes[B]).n,1);
  for(const {id} of financial)assert.ok(f.db.prepare('SELECT id FROM billingLifecycleNotices WHERE ownerId=? AND id=?').get(A,id));
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('durable notice transaction rolls back both dashboard and email on partial storage failure',async t=>{
  const f=setup(t);f.subscription();payment(f);f.db.exec("CREATE TRIGGER SYNTHETIC_notice_storage_loss BEFORE INSERT ON ownerEmailDeliveries BEGIN SELECT RAISE(ABORT,'SYNTHETIC storage failure'); END");
  assert.throws(()=>f.lifecycle.syncNotices(A),/SYNTHETIC storage/);assert.equal(f.db.prepare('SELECT count(*) n FROM billingLifecycleNotices WHERE ownerId=?').get(A).n,0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM outboxEvents WHERE ownerId=? AND eventType='billing.lifecycle_notice'").get(A).n,0);
  f.db.exec('DROP TRIGGER SYNTHETIC_notice_storage_loss');await f.lifecycle.processOwner(A);assert.equal(f.lifecycle.snapshot(A).notices.length,1);assert.equal(f.fakes.mail.size,1);
});
test('concurrent tenant cancellation requests cause a single provider mutation',async t=>{
  const f=setup(t);f.activate();f.setTime('2026-11-01T12:00:00.000Z');const results=await Promise.allSettled([f.lifecycle.cancel(A),f.lifecycle.cancel(A)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'BILLING_OPERATION_IN_PROGRESS');assert.equal(f.writes.update.length,1);
  await f.lifecycle.cancel(A);assert.equal(f.writes.update.length,1);
});
test('cancellation intent survives DB restart and no pending intent is advertised as confirmed',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'billing-cancel-restart-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const filename=join(dir,'db.sqlite'),fakes=fakeProviders();
  const f=setup(t,{filename,fakes});f.activate();f.setTime('2026-11-01T12:00:00.000Z');f.fakes.stripe.subscriptions.update=async()=>{throw Error('SYNTHETIC offline');};await assert.rejects(f.lifecycle.cancel(A));
  assert.equal(f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='cancellation').length,0);f.close();
  const g=setup(t,{filename,resume:true,fakes});g.setTime('2026-11-01T12:01:00.000Z');await g.lifecycle.processOwner(A);await g.lifecycle.processOwner(A);
  assert.equal(g.user().serviceEndsAt,END);assert.equal(g.lifecycle.snapshot(A).notices.filter(n=>n.kind==='cancellation').length,1);assert.equal(g.writes.update.length,1);
});
test('failed carrier shutdown stays pending and is retried without false confirmation',async t=>{
  const f=setup(t);f.activate();f.profile();f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);
  const service=createBillingCustomerLifecycle({database:f.db,stripeClient:f.fakes.stripe,clock:f.clock,enabled:()=>true,telephony:{setCoverage:async()=>({confirmedEnabled:true,pending:true})}});
  f.setTime(END);await service.processOwner(A);assert.equal(service.snapshot(A).cancellation.forwardingOffAt,null);assert.equal(service.snapshot(A).cancellation.lastError,'FORWARDING_SHUTDOWN_PENDING');
  await f.lifecycle.processOwner(A);assert.equal(f.lifecycle.snapshot(A).cancellation.forwardingOffAt,END);
});
test('phone release failure retains its saved SID and retries only that tenant',async t=>{
  const f=setup(t);f.activate();f.profile();f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);f.setTime('2026-12-20T12:00:00.000Z');
  const service=createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>true,releaseNumber:async()=>{throw Error('SYNTHETIC timeout');}});
  await assert.rejects(service.processOwner(A));assert.equal(f.lifecycle.snapshot(A).cancellation.phoneReleasedAt,null);assert.ok(f.db.prepare('SELECT twilioNumberSid FROM businessProfiles WHERE ownerId=?').get(A).twilioNumberSid);
  await f.lifecycle.processOwner(A);assert.equal(f.writes.release.length,1);assert.equal(f.writes.release[0].ownerId,A);
});
test('a delayed cleanup worker does not release a phone reactivated within its 30-day window',async t=>{
  const f=setup(t);f.activate();f.profile();f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);f.setTime(END);f.subscription(A,{status:'canceled'});
  f.setTime('2026-12-19T12:00:00.000Z');replacement(f,'2026-12-19T12:00:00.000Z','2027-01-19T12:00:00.000Z');
  f.setTime('2026-12-21T12:00:00.000Z');await f.lifecycle.processOwner(A);assert.equal(f.writes.release.length,0);assert.equal(f.user().serviceEndsAt,null);assert.ok(f.db.prepare('SELECT twilioNumber FROM businessProfiles WHERE ownerId=?').get(A).twilioNumber);
});
test('legacy missing currency is recovered from a bound provider receipt, never guessed',async t=>{
  const f=setup(t);f.activate();assert.equal(f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='receipt').length,0);
  const row=f.db.prepare('SELECT * FROM billingInvoiceEvidence WHERE ownerId=?').get(A);f.fakes.invoices.set(row.stripeInvoiceId,{id:row.stripeInvoiceId,customer:'cus_'+A,status:'paid',amount_paid:11900,currency:'cad'});
  await f.lifecycle.processOwner(A);assert.equal(f.lifecycle.snapshot(A).notices[0].currency,'cad');assert.equal(f.lifecycle.snapshot(A).notices[0].amountCents,11900);
});
test('service end preserves automatic collection on a previously submitted unpaid overage invoice',async t=>{
  const f=setup(t);f.activate();f.call(310*60);f.setTime(END);
  f.fakes.stripe.invoices.finalizeInvoice=async id=>{const row=f.fakes.invoices.get(id);row.status='open';row.auto_advance=true;row.amount_remaining=350;return structuredClone(row);};
  await f.service.processOwner(A);const invoice=[...f.fakes.invoices.values()][0];let stops=0;
  f.fakes.stripe.invoices.update=async(id,params)=>{stops++;assert.deepEqual(params,{auto_advance:false});Object.assign(f.fakes.invoices.get(id),params);return structuredClone(f.fakes.invoices.get(id));};
  f.setTime(END);await f.lifecycle.cancel(A);await f.lifecycle.processOwner(A);await f.lifecycle.processOwner(A);
  assert.equal(stops,0);assert.equal(f.fakes.invoices.get(invoice.id).auto_advance,true);assert.equal(f.db.prepare('SELECT collectionStoppedAt FROM billingUsageCharges WHERE ownerId=?').get(A).collectionStoppedAt,null);
});
test('crossing service end while reading an overage period still finalizes accrued overage',async t=>{
  const f=setup(t);f.activate();f.call(310*60);f.setTime(END);
  f.db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run('2026-11-20T12:00:01.000Z',A);
  const read=f.fakes.stripe.prices.retrieve;f.fakes.stripe.prices.retrieve=async id=>{f.setTime('2026-11-20T12:00:01.000Z');return read(id);};
  await f.service.processOwner(A);assert.equal(f.fakes.writes.invoice.length,1);assert.equal(f.fakes.writes.finalize.length,1);assert.equal([...f.fakes.items.values()][0].amount,350);
});
test('lease loss during phone release cannot clear the saved phone receipt',async t=>{
  const f=setup(t);f.activate();f.profile();f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);f.setTime('2026-12-20T12:00:00.000Z');
  const service=createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>true,releaseNumber:async()=>{
    f.db.prepare("UPDATE billingRetentionLeases SET token='SYNTHETIC-reclaimed' WHERE ownerId=?").run(A);return {released:true};
  }});
  await assert.rejects(service.processOwner(A),{code:'BILLING_LEASE_LOST'});assert.equal(f.lifecycle.snapshot(A).cancellation.phoneReleasedAt,null);assert.ok(f.db.prepare('SELECT twilioNumberSid FROM businessProfiles WHERE ownerId=?').get(A).twilioNumberSid);
});
test('a slow invoice preview crossing the first-charge time cannot send a stale trial reminder',async t=>{
  const f=setup(t);f.subscription(A,{status:'trialing',start:SIGNUP,end:START});f.setTime('2026-10-20T11:59:59.000Z');const preview=f.fakes.stripe.invoices.createPreview;
  f.fakes.stripe.invoices.createPreview=async(...args)=>{const row=await preview(...args);f.setTime(START);return row;};await f.lifecycle.reminders(A);
  assert.equal(f.lifecycle.snapshot(A).notices.filter(n=>n.kind==='trial_ending').length,0);
});
