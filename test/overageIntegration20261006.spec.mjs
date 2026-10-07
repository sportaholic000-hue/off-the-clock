import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,A,B,START} from './overageMinute20261006Fixture.mjs';
import {monthlyAnniversary} from '../server/src/billingUsagePolicy.js';
import {createBillingMinuteService} from '../server/src/billingMinuteService.js';
import {createOwnerEmailProvider} from '../server/src/ownerEmailDelivery.js';
import {harness,httpHarness} from './billingCoreRepair20261006.helpers.mjs';

const END=monthlyAnniversary(START,1);
test('a delayed verified paid period reconciles an already signed 301-minute call to $0.35',async t=>{
  const h=fixture(t);h.subscription(A,{current_period_start:null,current_period_end:null});h.paid();h.call(301*60);
  assert.equal(h.db.prepare('SELECT usageKind FROM billingVoiceUsage WHERE ownerId=?').get(A).usageKind,'unknown');
  h.subscription();assert.equal(h.service.snapshot(A).unconfirmedCalls,0);h.setTime(END);await h.service.processOwner(A);assert.equal([...h.fakes.items.values()][0].amount,35);
});
test('provisional duration cannot send a false threshold warning or savings claim',t=>{
  const h=fixture(t);h.activate();h.call(239*60);const uncertain=h.call(0,{localSeconds:61,provider:false});
  assert.equal(h.service.snapshot(A).warnings.length,0);h.meter.providerComplete(uncertain.receipt);assert.equal(h.service.snapshot(A).minutesUsed,239);assert.equal(h.service.snapshot(A).minutesLeft,61);
  h.call(518*60);const nudge=h.call(0,{localSeconds:1,provider:false});assert.equal(h.service.snapshot(A).upgradeMessage,null);h.meter.providerComplete(nudge.receipt);assert.equal(h.service.snapshot(A).overageCents,15995);assert.equal(h.service.snapshot(A).upgradeMessage,null);
});
test('a call crossing the anniversary belongs to its connected month; confirmed $0.35 is charged once',async t=>{
  const h=fixture(t);h.activate(A,{interval:'annual'});h.call(300*60);h.call(60,{at:new Date(Date.parse(END)-30000).toISOString()});
  assert.equal(h.service.snapshot(A).minutesUsed,0);await h.service.processOwner(A);assert.equal([...h.fakes.items.values()][0].amount,35);
});
test('late usage changes flag an already paid receipt for review without another charge',async t=>{
  const h=fixture(t);h.activate();const call=h.call(301*60);h.setTime(END);await h.service.processOwner(A);
  h.db.prepare('UPDATE calls SET spamFiltered=1 WHERE ownerId=? AND id=?').run(A,call.id);h.setTime(Date.parse(END)+61000);await h.service.processOwner(A);
  assert.equal(h.fakes.invoices.size,1);assert.equal(h.service.snapshot(A).pendingCharges[0].status,'REVIEW');assert.equal(h.service.snapshot(A).pendingCharges[0].amountCents,35);
});
test('loss of the local receipt after provider acceptance is reconciled on restart, one $0.35 invoice',async t=>{
  const h=fixture(t);h.activate();h.call(301*60);h.setTime(END);
  h.db.exec("CREATE TRIGGER synthetic_receipt_loss BEFORE UPDATE OF providerInvoiceId ON billingUsageCharges BEGIN SELECT RAISE(ABORT,'SYNTHETIC storage loss'); END");
  await h.service.processOwner(A);assert.equal(h.fakes.invoices.size,1);h.db.exec('DROP TRIGGER synthetic_receipt_loss');h.setTime(Date.parse(END)+61000);
  await createBillingMinuteService(h.options).processOwner(A);assert.equal(h.fakes.invoices.size,1);assert.equal([...h.fakes.items.values()][0].amount,35);
});
test('a broken owner does not starve another tenant in the startup worker',async t=>{
  const h=fixture(t);h.activate();h.activate(B);h.call(301*60);h.call(301*60,{ownerId:B});h.db.prepare('UPDATE calls SET minutesBilled=-1 WHERE ownerId=?').run(A);h.setTime(END);
  const errors=[];await createBillingMinuteService({...h.options,onError:e=>errors.push(e)}).tick();assert.deepEqual(errors,['MINUTE_BILLING_PENDING']);
  assert.equal(h.fakes.invoices.size,1);assert.equal([...h.fakes.invoices.values()][0].customer,'cus_'+B);
});
for(const problem of ['customer','digest','amount','currency','duplicate-item','incomplete-list'])test('mismatched '+problem+' provider evidence cannot authorize another charge',async t=>{
  const h=fixture(t);h.activate();h.call(301*60);h.setTime(END);h.fakes.fail('finalize','before');await h.service.processOwner(A);
  const invoice=[...h.fakes.invoices.values()][0],item=[...h.fakes.items.values()][0];
  if(problem==='customer')invoice.customer='cus_'+B;
  if(problem==='digest')invoice.metadata.otc_usage_digest='WRONG';
  if(problem==='amount')item.amount=70;
  if(problem==='currency')invoice.currency='usd';
  if(problem==='duplicate-item')h.fakes.items.set('duplicate',{...item,id:'duplicate'});
  if(problem==='incomplete-list')h.fakes.stripe.invoiceItems.list=async()=>({data:[],has_more:true});
  h.setTime(Date.parse(END)+61000);await h.service.processOwner(A);assert.equal(h.fakes.writes.finalize.length,1);assert.equal(h.fakes.invoices.size,1);assert.equal(h.service.snapshot(A).pendingCharges[0].status,'PENDING');
});
test('invoice payment callbacks are tenant-bound and never alter base-plan access',async t=>{
  const h=fixture(t);h.activate();h.call(301*60);h.setTime(END);await h.service.processOwner(A);const invoice=[...h.fakes.invoices.values()][0];
  const event={type:'invoice.paid',data:{object:invoice}};assert.equal(h.service.applyInvoiceEvent(event),true);assert.equal(h.service.applyInvoiceEvent(event),true);
  assert.throws(()=>h.service.applyInvoiceEvent({...event,data:{object:{...invoice,customer:'cus_'+B}}}),/binding mismatch/);
  assert.equal(h.db.prepare('SELECT planStatus FROM users WHERE id=?').get(A).planStatus,'active');
});
test('accepted email is not declared delivered until its bound provider receipt confirms delivery',async t=>{
  const h=fixture(t);h.activate();h.call(240*60);await h.service.emails.deliverOne(A);
  assert.equal(h.service.snapshot(A).warnings[0].emailStatus,'ACCEPTED');
  const read=h.fakes.email.read;h.fakes.email.read=async id=>({...await read(id),to:[B+'@example.invalid']});await h.service.emails.deliverOne(A);
  assert.equal(h.service.snapshot(A).warnings[0].emailStatus,'ACCEPTED');assert.equal(h.db.prepare("SELECT status FROM outboxEvents WHERE ownerId=? AND eventType='billing.minute_warning'").get(A).status,'PENDING');
  h.fakes.email.read=read;h.setTime(h.clock().getTime()+61000);await h.service.processOwner(A);assert.equal(h.db.prepare("SELECT status FROM outboxEvents WHERE ownerId=? AND eventType='billing.minute_warning'").get(A).status,'DELIVERED');assert.equal(h.fakes.mail.size,1);
});
test('changing owner email preserves the warning and requires review, never sends to a different recipient',async t=>{
  const h=fixture(t);h.activate();h.call(240*60);h.db.prepare('UPDATE users SET email=? WHERE id=?').run('changed@example.invalid',A);await h.service.processOwner(A);
  assert.equal(h.fakes.mail.size,0);assert.equal(h.service.snapshot(A).warnings[0].emailStatus,'REVIEW');
});
test('Resend adapter uses the existing sender, stable idempotency header, and authenticated delivery read with fake fetch',async()=>{
  const calls=[],provider=createOwnerEmailProvider({environment:{NODE_ENV:'production',EMAIL_PROVIDER:'resend',EMAIL_DELIVERY_ENABLED:'true',RESEND_API_KEY:'SYNTHETIC',EMAIL_FROM:'synthetic@example.invalid'},fetchClient:async(url,init)=>{
    calls.push({url,init});return new Response(JSON.stringify(init.method==='POST'?{id:'SYNTHETIC-email'}:{id:'SYNTHETIC-email',to:['owner@example.invalid'],subject:'Synthetic 60 minutes left',last_event:'delivered'}),{status:200});
  }});
  assert.equal((await provider.send({to:'owner@example.invalid',subject:'Synthetic 60 minutes left',text:'SYNTHETIC ONLY',idempotencyKey:'minute-alert/synthetic'})).accepted,true);
  assert.equal((await provider.read('SYNTHETIC-email')).last_event,'delivered');assert.equal(calls[0].init.headers['Idempotency-Key'],'minute-alert/synthetic');assert.equal(calls[1].init.method,'GET');assert.equal(calls[1].init.headers.Authorization,'Bearer SYNTHETIC');
});
test('cancelled prepaid year blocks another checkout until paid-through, including billing status',async()=>{
  const h=harness();h.db.prepare("UPDATE users SET planStatus='canceled',annualPaidThroughAt='2027-10-20T12:00:00.000Z' WHERE id='SYNTHETIC-A'").run();const http=await httpHarness(h);
  try{const status=await http.request('/api/billing/status');assert.equal(status.body.canCheckout,false);assert.equal(status.body.annualPaidThroughAt,'2027-10-20T12:00:00.000Z');
    const result=await http.request('/api/billing/checkout',{body:{plan:'Operator',billingInterval:'annual'}});assert.equal(result.status,409);assert.equal(http.calls.checkout.length,0);
  }finally{await http.close();h.db.close();}
});
test('an Operator annual payment cannot grant a cancelled QuoteDone paid year',t=>{
  const h=fixture(t);h.activate(A,{interval:'annual'});h.subscription(A,{plan:'QuoteDone',interval:'annual',status:'canceled'});assert.equal(h.db.prepare('SELECT annualPaidThroughAt FROM users WHERE id=?').get(A).annualPaidThroughAt,null);
});
test('an annual cancellation recovers the full paid invoice for accounts created before the new receipt schema',async t=>{
  const h=fixture(t);const sub=h.activate(A,{interval:'annual'}),invoice=h.paid(A,{interval:'annual'});
  h.db.prepare('DELETE FROM billingAnnualTerms WHERE ownerId=?').run(A);h.db.prepare('UPDATE billingInvoiceEvidence SET invoiceJson=NULL WHERE ownerId=?').run(A);h.db.prepare('UPDATE users SET annualPaidThroughAt=NULL WHERE id=?').run(A);
  h.setTime(END);const cancelled={...sub,status:'canceled',latest_invoice:invoice};h.fakes.subscriptions.set(sub.id,cancelled);
  await h.billing.reconcileVerifiedStripeEvent({id:'evt_SYNTHETIC_legacy_cancel',type:'customer.subscription.deleted',created:Math.floor(h.clock().getTime()/1000),data:{object:{...cancelled,latest_invoice:invoice.id}}},h.fakes.stripe);
  assert.equal(h.db.prepare('SELECT annualPaidThroughAt FROM users WHERE id=?').get(A).annualPaidThroughAt,monthlyAnniversary(START,12));
});
