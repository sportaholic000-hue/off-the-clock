import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,A,B,prices,START} from './overageMinute20261006Fixture.mjs';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {installTelephonyOperationsSchema} from '../server/src/telephonyOperationsMigration.js';

const END='2026-11-20T12:00:00.000Z', RELEASE='2026-12-20T12:00:00.000Z', DELETE='2027-02-18T12:00:00.000Z';
// Before execution: 310 reconciled minutes - 300 included = 10 × 35 cents
// = $3.50 CAD pending evidence. Cleanup must neither charge nor refund it.
async function setup(t){
  const f=fixture(t),writes={release:[],coverage:[]};installTelephonyOperationsSchema(f.db);
  f.activate(A);f.activate(B);f.call(310*60);f.setTime(END);
  f.fakes.stripe.invoices.finalizeInvoice=async id=>{const invoice=f.fakes.invoices.get(id);invoice.status='open';return structuredClone(invoice);};
  await f.service.processOwner(A);
  const charge=f.db.prepare('SELECT * FROM billingUsageCharges WHERE ownerId=?').get(A);
  assert.equal(charge.amountCents,350);assert.ok(charge.providerInvoiceId);
  for(const id of [A,B]){
    f.db.prepare("INSERT INTO businessProfiles(ownerId,twilioNumber,twilioNumberSid,operatorEnabled,phoneProvisioningStatus,updatedAt) VALUES(?,?,?,1,'provisioned',?)").run(id,id===A?'+19025550101':'+19025550102','PN'+(id===A?'a':'b').repeat(32),START);
    f.db.prepare('INSERT INTO leads(id,ownerId,customerName,createdAt) VALUES(?,?,?,?)').run('SYNTHETIC-lead-'+id,id,'[SYNTHETIC] retained',START);
  }
  const lifecycle=createBillingCustomerLifecycle({database:f.db,priceIds:prices,stripeClient:f.fakes.stripe,emailProvider:f.fakes.email,enabled:()=>true,clock:f.clock,
    telephony:{async setCoverage(ownerId,enabled){writes.coverage.push({ownerId,enabled});return {confirmedEnabled:enabled,pending:false};}},
    releaseNumber:async input=>{writes.release.push(input);return {released:true};}});
  f.db.prepare(`INSERT INTO billingCancellations(ownerId,stripeSubscriptionId,operationId,state,endAt,requestedAt,confirmedAt,operatorWasEnabled,updatedAt)
    VALUES(?,?,'SYNTHETIC-cancellation','CONFIRMED',?,?,?,1,?)`).run(A,'sub_'+A,END,START,START,START);
  f.db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run(END,A);
  return {...f,lifecycle,writes,charge};
}
test('day 90 erasure and day 30 number release survive an unavailable billing provider',async t=>{
  const f=await setup(t);f.setTime(DELETE);
  f.fakes.stripe.invoices.retrieve=async()=>{throw Error('[SYNTHETIC] Stripe outage');};
  await f.lifecycle.tick();
  assert.equal(f.db.prepare('SELECT count(*) n FROM leads WHERE ownerId=?').get(A).n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM calls WHERE ownerId=?').get(A).n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM leads WHERE ownerId=?').get(B).n,1);
  assert.equal(f.writes.release.length,1);
  const row=f.lifecycle.snapshot(A).cancellation;assert.equal(row.dataDeletedAt,DELETE);assert.equal(row.phoneReleasedAt,DELETE);
  const charge=f.db.prepare('SELECT * FROM billingUsageCharges WHERE ownerId=?').get(A);
  assert.equal(charge.amountCents,350);assert.equal(charge.collectionStoppedAt,null);
  assert.equal(charge.lastError,'BILLING_COLLECTION_CONFIRMATION_PENDING');
  assert.throws(()=>f.lifecycle.exportCsv(A,'leads'),{code:'BILLING_EXPORT_EXPIRED'});
  assert.equal(f.fakes.writes.invoice.length,1);
});
test('local cleanup completes before a delayed billing read settles',async t=>{
  const f=await setup(t);f.setTime(DELETE);
  let enter,finish;const entered=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{finish=resolve;});
  f.fakes.stripe.invoices.retrieve=async()=>{enter();await held;throw Error('[SYNTHETIC] delayed outage');};
  const processing=f.lifecycle.processOwner(A);
  try{
    await entered;
    assert.equal(f.db.prepare('SELECT count(*) n FROM leads WHERE ownerId=?').get(A).n,0);
    assert.equal(f.writes.release.length,1);
  }finally{finish();await processing.catch(()=>{});}
});
test('failed collection reconciliation retries without re-erasing or releasing, preserving financial evidence',async t=>{
  const f=await setup(t);f.setTime(DELETE);
  f.fakes.stripe.invoices.retrieve=async()=>{throw Error('[SYNTHETIC] outage');};await f.lifecycle.tick();
  const releaseCount=f.writes.release.length;
  f.fakes.stripe.invoices.retrieve=async id=>structuredClone(f.fakes.invoices.get(id));
  f.fakes.stripe.invoices.update=async(id,params)=>{Object.assign(f.fakes.invoices.get(id),params);return structuredClone(f.fakes.invoices.get(id));};
  await f.lifecycle.processOwner(A);await f.lifecycle.processOwner(A);
  assert.equal(f.writes.release.length,releaseCount);assert.equal(releaseCount,1);
  const charge=f.db.prepare('SELECT * FROM billingUsageCharges WHERE ownerId=?').get(A);
  assert.equal(charge.collectionStoppedAt,null);assert.equal(charge.lastError,null);assert.equal(charge.amountCents,350);
});
test('a collection outage cannot release or erase before their independent exact deadlines',async t=>{
  const f=await setup(t);f.fakes.stripe.invoices.retrieve=async()=>{throw Error('[SYNTHETIC] outage');};
  f.setTime(Date.parse(RELEASE)-1);await f.lifecycle.tick();assert.equal(f.writes.release.length,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM leads WHERE ownerId=?').get(A).n,1);
  f.setTime(RELEASE);await f.lifecycle.tick();assert.equal(f.writes.release.length,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM leads WHERE ownerId=?').get(A).n,1);
  f.setTime(Date.parse(DELETE)-1);await f.lifecycle.tick();assert.equal(f.lifecycle.snapshot(A).cancellation.dataDeletedAt,null);
});
test('all due owners beyond a 32-owner batch are cleaned before delayed billing reconciliation',async t=>{
  const f=await setup(t);f.setTime(DELETE);
  // A is first, followed by 32 inert synthetic accounts, then B. Retention
  // must cover B before A's provider request settles, despite the page limit.
  for(let i=0;i<32;i++){
    const id=A+'-'+String(i).padStart(2,'0');
    f.db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic inert account','Operator','pending_payment','UTC','owner',?)").run(id,id+'@example.invalid',START);
    f.db.prepare("INSERT INTO billingCancellations(ownerId,stripeSubscriptionId,operationId,state,endAt,requestedAt,endedAt,phoneReleasedAt,dataDeletedAt,updatedAt) VALUES(?,?,'SYNTHETIC-inert','ENDED',?,?,?,?,?,?)").run(id,'sub_'+id,END,START,END,DELETE,DELETE,DELETE);
  }
  f.db.prepare(`INSERT INTO billingCancellations(ownerId,stripeSubscriptionId,operationId,state,endAt,requestedAt,confirmedAt,operatorWasEnabled,updatedAt)
    VALUES(?,?,'SYNTHETIC-cancellation-b','CONFIRMED',?,?,?,1,?)`).run(B,'sub_'+B,END,START,START,START);
  f.db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run(END,B);
  let enter,finish;const entered=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{finish=resolve;});
  f.fakes.stripe.invoices.retrieve=async()=>{enter();await held;throw Error('[SYNTHETIC] delayed outage');};
  const processing=f.lifecycle.tick();
  try{await entered;assert.equal(f.db.prepare('SELECT count(*) n FROM leads').get().n,0);assert.equal(f.writes.release.length,2);}
  finally{finish();await processing;}
});
test('a new retention deadline is processed while an earlier financial sweep is still waiting',async t=>{
  const f=await setup(t);f.setTime(Date.parse(DELETE)-1000);
  let enter,finish;const entered=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{finish=resolve;});
  f.fakes.stripe.invoices.retrieve=async()=>{enter();await held;throw Error('[SYNTHETIC] held at retention deadline');};
  const first=f.lifecycle.tick();let second;
  try{
    await entered;assert.equal(f.db.prepare('SELECT count(*) n FROM leads WHERE ownerId=?').get(A).n,1);
    f.setTime(DELETE);second=f.lifecycle.tick();await new Promise(setImmediate);
    assert.equal(f.db.prepare('SELECT count(*) n FROM leads WHERE ownerId=?').get(A).n,0);
  }finally{finish();await first;if(second)await second;}
});
test('a number-release deadline is processed while that owner’s billing lease awaits Stripe',async t=>{
  const f=await setup(t);f.setTime(Date.parse(RELEASE)-1000);
  let enter,finish;const entered=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{finish=resolve;});
  f.fakes.stripe.invoices.retrieve=async()=>{enter();await held;throw Error('[SYNTHETIC] held at number deadline');};
  const first=f.lifecycle.tick();let second;
  try{
    await entered;assert.equal(f.writes.release.length,0);
    f.setTime(RELEASE);second=f.lifecycle.tick();await new Promise(setImmediate);
    assert.equal(f.writes.release.length,1);assert.equal(f.db.prepare('SELECT count(*) n FROM leads WHERE ownerId=?').get(A).n,1);
  }finally{finish();await first;if(second)await second;}
});

test('integrated day-90 cleanup erases owner workflow evidence without touching another tenant',async t=>{
  const f=await setup(t);
  for(const id of [A,B]){
    f.db.prepare("INSERT INTO ownerRecordWorkflows(ownerId,kind,recordId,note,updatedAt) VALUES(?,'leads',?,'[SYNTHETIC] Private callback detail',?)").run(id,'SYNTHETIC-lead-'+id,START);
    f.db.prepare("INSERT INTO ownerRecordEvents(id,ownerId,kind,recordId,idempotencyKey,requestJson,action,actorId,payloadJson,responseJson,createdAt) VALUES(?,?,'leads',?,'SYNTHETIC','{}','CALL_BACK',?,'{}','{}',?)").run('SYNTHETIC-event-'+id,id,'SYNTHETIC-lead-'+id,id,START);
  }
  f.setTime(DELETE);f.fakes.stripe.invoices.retrieve=async()=>{throw Error('[SYNTHETIC] outage');};await f.lifecycle.tick();
  for(const table of ['ownerRecordWorkflows','ownerRecordEvents']){
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE ownerId=?').get(A).n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE ownerId=?').get(B).n,1);
  }
});
