import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,A,B,START,SIGNUP,fakeProviders} from './overageMinute20261006Fixture.mjs';
import {createVoiceSessionStore} from '../server/src/voice/voicePersistence.js';
import {createBillingMinuteService} from '../server/src/billingMinuteService.js';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {createOwnerWorkflowService} from '../server/src/ownerWorkflowService.js';

// Synthetic identities and deterministic Stripe test mocks only. Dollar oracles
// are written independently: 72 * 35 = 2520, 3 * 35 = 105 cents.
const END='2026-11-20T12:00:00.000Z';
const amounts=f=>[...f.fakes.items.values()].map(i=>i.amount);
const lifecycle=f=>createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>true,emailProvider:f.fakes.email});

for(const route of ['owner-forward','operator-off-message','fallback-forward','fallback-capture','restart-after-owner','receipt-before-owner','late-media-close','meter-only-close']){
  test(`billing repair 1: failed receptionist → ${route} bills zero including owner leg`,t=>{
    const f=fixture(t);f.activate();const call=f.call(600,{provider:false,localSeconds:1});
    f.db.prepare("UPDATE calls SET status='FAILED',outcome='GEMINI_SESSION_ERROR',failureCode='GEMINI_SESSION_ERROR',completedAt=NULL WHERE ownerId=? AND id=?").run(A,call.id);
    const store=createVoiceSessionStore({database:f.db,clock:f.clock});
    if(route==='receipt-before-owner')assert.equal(f.meter.providerComplete(call.receipt),0);
    if(route.startsWith('fallback')){
      store.recordFallback({context:call.context,reason:'VOICE_SESSION_UNAVAILABLE'});
      if(route==='fallback-capture')store.appendFallbackText({context:call.context,text:'[SYNTHETIC] Please call back.'});
      store.finishCall({context:call.context,status:'COMPLETED',reason:'FALLBACK_REQUEST_CAPTURED'});
    }else store.recordHumanRouting({context:call.context,forwarded:route!=='operator-off-message'});
    if(route==='restart-after-owner')store.recoverActiveCalls();
    if(route==='late-media-close'){
      store.finishCall({context:call.context,status:'FAILED',reason:'GEMINI_SESSION_CLOSED'});
      f.meter.finish(call.context,call.id,{status:'COMPLETED',outcome:'STOP',failureCode:null,streamSid:null});
    }
    if(route==='meter-only-close')f.meter.finish(call.context,call.id,{status:'COMPLETED',outcome:'STOP',failureCode:null,streamSid:null});
    assert.equal(f.meter.providerComplete(call.receipt),0);
    assert.equal(f.meter.providerComplete(call.receipt),0);
    assert.equal(f.service.snapshot(A).minutesUsed,0);
    assert.equal(f.db.prepare('SELECT minutesBilled FROM calls WHERE ownerId=? AND id=?').get(A,call.id).minutesBilled,0);
  });
}

test('billing repair 2: trial 30 and zero warnings reach email and dashboard once, never 60',async t=>{
  const f=fixture(t);f.setTime(SIGNUP);f.subscription(A,{status:'trialing',start:SIGNUP});
  assert.deepEqual(f.service.snapshot(A).warnings,[]);
  f.call(30*60);await f.service.processOwner(A);
  assert.deepEqual(f.service.snapshot(A).warnings.map(w=>w.threshold),[30]);
  f.call(30*60);await f.service.processOwner(A);await createBillingMinuteService(f.options).processOwner(A);
  assert.deepEqual(f.service.snapshot(A).warnings.map(w=>w.threshold),[30,0]);
  assert.equal(f.fakes.mail.size,2);assert.equal(f.fakes.invoices.size,0);
  assert.equal(f.service.snapshot(B).warnings.length,0);
  for(const {message} of f.fakes.mail.values()){assert.equal(message.to,A+'@example.invalid');assert.doesNotMatch(message.text,/overage.*applies|Extra minutes cost/);}
});
test('billing repair 2: provisional trial duration cannot send irreversible warning',async t=>{
  const f=fixture(t);f.setTime(SIGNUP);f.subscription(A,{status:'trialing',start:SIGNUP});
  const c=f.call(60,{localSeconds:1800,provider:false});await f.service.processOwner(A);assert.equal(f.fakes.mail.size,0);
  f.meter.providerComplete(c.receipt);await f.service.processOwner(A);assert.equal(f.fakes.mail.size,0);
});

for(const interval of ['monthly','annual'])test(`billing repair 3: ${interval} crosses $25 repeatedly, then charges exact month-end remainder`,async t=>{
  const f=fixture(t);f.activate(A,{interval});f.call(371*60);await f.service.processOwner(A);assert.deepEqual(amounts(f),[]);
  f.call(60);await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520]);
  let view=f.service.snapshot(A);assert.equal(view.chargedCents,2520);assert.equal(view.unchargedCents,0);
  f.call(72*60);await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520,2520]);
  f.call(3*60);await f.service.processOwner(A);view=f.service.snapshot(A);assert.equal(view.chargedCents,5040);assert.equal(view.unchargedCents,105);
  f.setTime(END);await f.service.processOwner(A);await f.service.processOwner(A);
  assert.deepEqual(amounts(f),[2520,2520,105]);
  assert.equal(new Set(f.fakes.writes.invoice.map(w=>w.key)).size,3);
  await lifecycle(f).processOwner(A);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM billingLifecycleNotices WHERE ownerId=? AND kind='receipt'").get(A).n,3);
});
test('billing repair 3: unconfirmed overage waits for the signed duration, then charges $25.20',async t=>{
  const f=fixture(t);f.activate();f.call(300*60);const c=f.call(72*60,{provider:false});
  await f.service.processOwner(A);assert.deepEqual(amounts(f),[]);
  f.meter.providerComplete(c.receipt);await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520]);
});
test('billing repair 3: final cancelled month charges the remainder at service end',async t=>{
  const f=fixture(t);f.activate();f.call(303*60);
  f.db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run(END,A);f.setTime(END);f.subscription(A,{status:'canceled'});
  await f.service.processOwner(A);await f.service.processOwner(A);assert.deepEqual(amounts(f),[105]);
});
test('billing repair 3: declined invoice blocks another charge across periods and exposes unpaid final amount',async t=>{
  const f=fixture(t);f.activate();
  f.fakes.stripe.invoices.finalizeInvoice=async id=>{const row=f.fakes.invoices.get(id);Object.assign(row,{status:'open',auto_advance:true,amount_remaining:row.subtotal,amount_paid:0});return structuredClone(row);};
  f.call(372*60);await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520]);
  const invoice=[...f.fakes.invoices.values()][0];
  f.service.applyInvoiceEvent({type:'invoice.payment_failed',created:Math.floor(f.clock().getTime()/1000),data:{object:invoice}});
  await lifecycle(f).processOwner(A);
  assert.equal(f.db.prepare('SELECT planStatus FROM users WHERE id=?').get(A).planStatus,'payment_failed');
  const notice=f.db.prepare("SELECT * FROM billingLifecycleNotices WHERE ownerId=? AND kind='payment_failed'").get(A);
  assert.equal(Date.parse(notice.dueAt)-f.clock().getTime(),7*86400000);
  f.call(72*60);await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520]);
  f.db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run(END,A);f.setTime(END);await f.service.processOwner(A);
  const view=f.service.snapshot(A);assert.equal(view.pendingCharges.reduce((n,c)=>n+c.amountCents,0),5040);
  assert.doesNotMatch(view.pendingCharges.map(c=>c.message).join(' '),/will be retried|Service continues/);
  Object.assign(invoice,{status:'paid',amount_remaining:0,amount_paid:2520});
  f.service.applyInvoiceEvent({type:'invoice.paid',data:{object:invoice}});await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520,2520]);
});
test('billing repair 3: restart after Stripe accepted an installment never duplicates it or loses the remainder',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'synthetic-billing-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const filename=join(dir,'billing.sqlite'),fakes=fakeProviders(),f=fixture(null,{filename,fakes});
  f.activate();f.call(372*60);fakes.fail('item','after');await f.service.processOwner(A);assert.equal(fakes.invoices.size,1);f.close();
  const resumed=fixture(t,{filename,resume:true,fakes});resumed.setTime('2026-10-22T12:00:00.000Z');await resumed.service.processOwner(A);await resumed.service.processOwner(A);
  assert.deepEqual(amounts(resumed),[2520]);assert.equal(fakes.invoices.size,1);
  resumed.setTime(END);await resumed.service.processOwner(A);assert.deepEqual(amounts(resumed),[2520]);
});
test('billing repair 3: all three customer billing sentences state the threshold and remainder rule',()=>{
  const sentence='Extra minutes are $0.35/min, charged to your card each time they reach $25, with any remainder charged at the end of the billing month.';
  assert.equal(readFileSync(new URL('../client/src/billing.jsx',import.meta.url),'utf8').split(sentence).length-1,2);
  assert.equal(readFileSync(new URL('../client/src/minuteUsage.jsx',import.meta.url),'utf8').split(sentence).length-1,1);
});

for(const action of ['CALL_BACK','BOOK'])for(const dueAt of ['2027-02-30T12:00:00.000Z','2027-02-29T12:00:00Z','2027-04-31T12:00:00.000Z'])test(`billing repair 4: ${action} rejects impossible ${dueAt} without saving`,t=>{
  const f=fixture(t),ownerQuery=sql=>{assert.match(sql,/\bownerId\b/);return f.db.prepare(sql);};
  const db={prepare:sql=>f.db.prepare(sql),transaction:work=>Object.assign((...args)=>work(...args),{immediate:(...args)=>work(...args)})};
  f.db.prepare("INSERT INTO leads(id,ownerId,type,status,collectedInputsJson,createdAt) VALUES('SYNTHETIC-date',?,'voice_lead','CAPTURED','{}',?)").run(A,START);
  const service=createOwnerWorkflowService({database:db,ownerQuery,clock:f.clock});
  assert.throws(()=>service.act({ownerId:A,actorId:A,kind:'leads',id:'SYNTHETIC-date',body:{action,dueAt,version:0,idempotencyKey:'SYNTHETIC-date',note:'[SYNTHETIC] Follow up'}}),{message:'Choose a future follow-up time.',statusCode:400});
  assert.equal(service.view(A,'leads','SYNTHETIC-date').workflow.version,0);
});

test('billing repair 3: an unpaid first month blocks a threshold invoice in the next annual allowance month',async t=>{
  const f=fixture(t);f.activate(A,{interval:'annual'});
  f.fakes.stripe.invoices.finalizeInvoice=async id=>{const row=f.fakes.invoices.get(id);Object.assign(row,{status:'open',amount_remaining:row.subtotal});return structuredClone(row);};
  f.call(372*60);await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520]);
  f.setTime(END);f.call(372*60);await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520]);
  const invoice=[...f.fakes.invoices.values()][0];Object.assign(invoice,{status:'paid',amount_remaining:0,amount_paid:2520});
  f.service.applyInvoiceEvent({type:'invoice.paid',data:{object:invoice}});await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520,2520]);
});
test('billing repair 3: a final declined card creates a truthful unpaid notice after cancellation',async t=>{
  const f=fixture(t);f.activate();f.call(303*60);f.db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run(END,A);
  f.setTime(END);f.subscription(A,{status:'canceled'});
  f.fakes.stripe.invoices.finalizeInvoice=async id=>{const row=f.fakes.invoices.get(id);Object.assign(row,{status:'open',attempted:true,amount_remaining:105,amount_paid:0});return structuredClone(row);};
  await f.service.processOwner(A);await lifecycle(f).processOwner(A);
  assert.deepEqual(amounts(f),[105]);assert.equal(f.service.snapshot(A).pendingCharges[0].amountCents,105);
  const notice=f.db.prepare("SELECT message,dueAt FROM billingLifecycleNotices WHERE ownerId=? AND kind='payment_failed'").get(A);
  assert.match(notice.message,/Service has ended; this invoice remains unpaid/);assert.doesNotMatch(notice.message,/Service continues|will be retried/);
  assert.equal(Date.parse(notice.dueAt)-Date.parse(END),7*86400000);
  await f.service.processOwner(A);assert.deepEqual(amounts(f),[105]);
});
for(const kind of ['invoice','item','finalize'])test(`billing repair 3: lost ${kind} receipt on second installment reconciles despite subsequent usage`,async t=>{
  const f=fixture(t);f.activate();f.call(372*60);await f.service.processOwner(A);f.call(72*60);f.fakes.fail(kind,'after');await f.service.processOwner(A);
  f.call(3*60);f.setTime(f.clock().getTime()+61000);await createBillingMinuteService(f.options).processOwner(A);
  f.setTime(END);await f.service.processOwner(A);await f.service.processOwner(A);
  assert.deepEqual(amounts(f),[2520,2520,105]);assert.equal(f.fakes.invoices.size,3);
  const invoices=[...f.fakes.invoices.values()];assert.notEqual(invoices[1].metadata.otc_usage_charge,invoices[2].metadata.otc_usage_charge);
  for(const invoice of invoices)assert.equal(f.service.applyInvoiceEvent({type:'invoice.paid',data:{object:invoice}}),true);
});
test('billing repair 3: an active call receipt cannot trigger charging before its AI lifecycle finishes',async t=>{
  const f=fixture(t);f.activate();const c=f.call(372*60,{provider:false});
  f.db.prepare("UPDATE calls SET status='CONNECTED',completedAt=NULL WHERE ownerId=? AND id=?").run(A,c.id);
  f.meter.providerComplete(c.receipt);await f.service.processOwner(A);assert.deepEqual(amounts(f),[]);
  const store=createVoiceSessionStore({database:f.db,clock:f.clock});store.finishCall({context:c.context,status:'FAILED',reason:'GEMINI_SESSION_ERROR'});
  store.recordHumanRouting({context:c.context,forwarded:true});f.meter.finish(c.context,c.id);await f.service.processOwner(A);assert.deepEqual(amounts(f),[]);
});

test('billing repair 3: legacy monthly charge migration retains its Stripe identity without another charge',async t=>{
  const {migrateDatabase}=await import('../server/src/migrations.js');
  const f=fixture(t);f.activate();f.call(303*60);f.setTime(END);await f.service.processOwner(A);
  const prior=f.db.prepare('SELECT * FROM billingUsageCharges WHERE ownerId=?').get(A);
  // Recreate the exact pre-installment layout, as on a persisted base database.
  f.db.exec(`ALTER TABLE billingUsageCharges RENAME TO synthetic_new_charges;
    CREATE TABLE billingUsageCharges (
      periodId TEXT PRIMARY KEY REFERENCES billingUsagePeriods(id),ownerId TEXT NOT NULL REFERENCES users(id),amountCents INTEGER NOT NULL,
      minutesUsed INTEGER NOT NULL,usageDigest TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',providerInvoiceId TEXT,providerItemId TEXT,currency TEXT,
      operationsJson TEXT NOT NULL DEFAULT '{}',collectionStoppedAt TEXT,lastError TEXT,nextAttemptAt TEXT NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
    INSERT INTO billingUsageCharges SELECT periodId,ownerId,amountCents,minutesUsed,usageDigest,status,providerInvoiceId,providerItemId,currency,operationsJson,collectionStoppedAt,lastError,nextAttemptAt,createdAt,updatedAt FROM synthetic_new_charges;
    DROP TABLE synthetic_new_charges;`);
  migrateDatabase(f.db);migrateDatabase(f.db);await createBillingMinuteService(f.options).processOwner(A);
  const saved=f.db.prepare('SELECT * FROM billingUsageCharges WHERE ownerId=?').get(A);
  assert.equal(saved.id,prior.periodId);assert.equal(saved.sequence,1);assert.equal(saved.providerInvoiceId,prior.providerInvoiceId);assert.equal(saved.amountCents,105);assert.equal(saved.status,'PAID');
  assert.deepEqual(amounts(f),[105]);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('billing repair 3: dashboard renders charged and uncharged cents separately with the exact policy',async t=>{
  const {createServer}=await import('vite'),React=(await import('react')).default,{renderToStaticMarkup}=await import('react-dom/server');
  const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});t.after(()=>vite.close());
  const MinuteUsage=(await vite.ssrLoadModule('/src/minuteUsage.jsx')).default;
  const html=renderToStaticMarkup(React.createElement(MinuteUsage,{usage:{status:'PAID',periodStartAt:START,periodEndAt:END,includedMinutes:300,minutesUsed:447,minutesLeft:0,overageCents:5145,chargedCents:5040,unchargedCents:105}}));
  assert.match(html,/<dt>Charged so far<\/dt><dd>\$50\.40<\/dd>/);assert.match(html,/<dt>Not yet charged<\/dt><dd>\$1\.05<\/dd>/);
  assert.match(html,/charged to your card each time they reach \$25/);
});
for(const dueAt of ['2028-02-29T12:00:00.000Z','2027-03-02T12:00:00Z'])test(`billing repair 4: valid future ${dueAt} is preserved`,t=>{
  const f=fixture(t),db={prepare:sql=>f.db.prepare(sql),transaction:work=>Object.assign((...args)=>work(...args),{immediate:(...args)=>work(...args)})};
  f.db.prepare("INSERT INTO leads(id,ownerId,type,status,collectedInputsJson,createdAt) VALUES('SYNTHETIC-date',?,'voice_lead','CAPTURED','{}',?)").run(A,START);
  const service=createOwnerWorkflowService({database:db,clock:f.clock});
  const saved=service.act({ownerId:A,actorId:A,kind:'leads',id:'SYNTHETIC-date',body:{action:'CALL_BACK',dueAt,version:0,idempotencyKey:'SYNTHETIC-date',note:'[SYNTHETIC] Follow up'}});
  assert.equal(saved.workflow.dueAt,dueAt);
});
test('billing repair 2: extending the same trial does not reset warning identities',async t=>{
  const f=fixture(t);f.setTime(SIGNUP);f.subscription(A,{status:'trialing',start:SIGNUP,trial_end:Date.parse('2026-10-13T12:00:00.000Z')/1000});f.call(60*60);await f.service.processOwner(A);
  const ids=f.service.snapshot(A).warnings.map(w=>w.id);assert.equal(ids.length,2);
  f.subscription(A,{status:'trialing',start:SIGNUP,trial_end:Date.parse(START)/1000});await f.service.processOwner(A);
  assert.deepEqual(f.service.snapshot(A).warnings.map(w=>w.id),ids);assert.equal(f.fakes.mail.size,2);assert.equal(f.fakes.invoices.size,0);
});
test('billing repair 3: blocked final remainder survives retention and reconciles once after the unpaid invoice settles',async t=>{
  const f=fixture(t);f.activate();const finalize=f.fakes.stripe.invoices.finalizeInvoice;
  f.fakes.stripe.invoices.finalizeInvoice=async id=>{const row=f.fakes.invoices.get(id);Object.assign(row,{status:'open',amount_remaining:row.subtotal});return structuredClone(row);};
  f.call(372*60);await f.service.processOwner(A);f.call(3*60);
  f.db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run(END,A);f.setTime(END);await f.service.processOwner(A);
  assert.deepEqual(amounts(f),[2520]);
  assert.deepEqual(f.db.prepare('SELECT amountCents FROM billingUsageCharges WHERE ownerId=? ORDER BY sequence').all(A).map(c=>c.amountCents),[2520,105]);
  const deleted='2027-02-18T12:00:00.000Z';f.setTime(deleted);
  f.db.prepare("INSERT INTO billingCancellations(ownerId,stripeSubscriptionId,operationId,state,endAt,requestedAt,confirmedAt,endedAt,dataDeletedAt,updatedAt) VALUES(?,?,'SYNTHETIC-retention','ENDED',?,?,?,?,?,?)").run(A,'sub_'+A,END,END,END,END,deleted,deleted);
  f.db.prepare('DELETE FROM billingVoiceUsage WHERE ownerId=?').run(A);f.db.prepare('DELETE FROM calls WHERE ownerId=?').run(A);
  const first=[...f.fakes.invoices.values()][0];Object.assign(first,{status:'paid',amount_remaining:0,amount_paid:2520});f.service.applyInvoiceEvent({type:'invoice.paid',data:{object:first}});
  f.fakes.stripe.invoices.finalizeInvoice=finalize;const resumed=createBillingMinuteService(f.options);
  await resumed.processOwner(A);await resumed.processOwner(A);
  assert.deepEqual(amounts(f),[2520,105]);assert.equal(f.fakes.invoices.size,2);
  assert.deepEqual(f.db.prepare('SELECT status FROM billingUsageCharges WHERE ownerId=? ORDER BY sequence').all(A).map(c=>c.status),['PAID','PAID']);
});
test('billing repair 3: confirmed threshold charges immediately while an unrelated duration remains provisional',async t=>{
  const f=fixture(t);f.activate();f.call(372*60);const pending=f.call(60,{provider:false,localSeconds:120*60});
  await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520]);
  f.meter.providerComplete(pending.receipt);await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520]);
  f.setTime(END);await f.service.processOwner(A);assert.deepEqual(amounts(f),[2520,35]);
  assert.deepEqual(f.db.prepare('SELECT status FROM billingUsageCharges WHERE ownerId=? ORDER BY sequence').all(A).map(c=>c.status),['PAID','PAID']);
});
