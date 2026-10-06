import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {T,day,iso,harness,httpHarness} from './billingCoreRepair20261006.helpers.mjs';
import {migrateDatabase} from '../server/src/migrations.js';
import {migrateBillingCheckoutRecovery} from '../server/src/billingCoreMigration.js';
import {CREATE_TABLE_STATEMENTS} from '../server/src/schema.js';
import {withBillingLease} from '../server/src/billingProvider.js';
import legacySql from './billingCoreRepair20261006.legacy.mjs';

// Prewritten EXPECTATIONS.md: $119=11900 per invoice, $0 first trial charge.
// Expected: unresolved debt retains original T+10 failure and seven-day grace;
// exact settlement of that debt restores active. No provider operation is live.
function tempStore(){const dir=mkdtempSync(path.join(os.tmpdir(),'synthetic-billing-core-'));return {dir,filename:path.join(dir,'db.sqlite')};}
function legacyStore(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const sql of legacySql)db.exec(sql);
 db.exec(`CREATE TABLE syntheticUnrelated(id TEXT PRIMARY KEY,value TEXT); INSERT INTO syntheticUnrelated VALUES('untouched','SYNTHETIC');`);
 db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt,paymentFailedAt) VALUES('SYNTHETIC-A','a@example.invalid','SYNTHETIC','Synthetic','Synthetic','Operator','payment_failed','UTC','owner',?,?)").run(iso(T),iso(T+10));
 db.prepare("INSERT INTO billingAccounts(ownerId,stripeCustomerId,stripeSubscriptionId,stripePriceId,paymentMethodVerifiedAt,paymentFailedAt,graceEndsAt,createdAt,updatedAt) VALUES('SYNTHETIC-A','cus_A','sub_A','price_op_month',?,?,?,?,?)").run(iso(T),iso(T+10),iso(T+10+7*day),iso(T),iso(T+10));return db;
}
test('fresh/migrated stores preserve unrelated schema and legacy debt; migration is repeatable',()=>{
 const db=legacyStore();try{
  migrateDatabase(db);migrateDatabase(db);
  assert.equal(db.prepare('SELECT value FROM syntheticUnrelated').get().value,'SYNTHETIC');
  assert.equal(db.prepare('SELECT reason FROM billingRecoveryHolds').get().reason,'LEGACY_DEBT_REQUIRES_RECONCILIATION');
  assert.equal(db.prepare('SELECT paymentFailedAt FROM billingAccounts').get().paymentFailedAt,iso(T+10));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const sql=db.prepare("SELECT sql FROM sqlite_master WHERE name='billingCheckoutRequests'").get().sql;
  assert.equal(sql.includes("status IN ('OPEN', 'EXPIRED')"),false);
 }finally{db.close();}
});
test('billing-only table rebuild rolls back copy/drop failure',()=>{
 const db=new DatabaseSync(':memory:');try {
  for(const sql of legacySql)db.exec(sql);
  const old=db.prepare("SELECT sql FROM sqlite_master WHERE name='billingCheckoutRequests'").get().sql;
  const proxy={prepare:db.prepare.bind(db),exec(sql){if(sql==='DROP TABLE billingCheckoutRequests')throw Error('SYNTHETIC migration interruption');return db.exec(sql);}};
  assert.throws(()=>migrateBillingCheckoutRecovery(proxy,CREATE_TABLE_STATEMENTS.find(sql=>sql.startsWith('CREATE TABLE IF NOT EXISTS billingCheckoutRequests'))),/SYNTHETIC/);
  assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE name='billingCheckoutRequests'").get().sql,old);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='billingCheckoutRequests_recovery'").get().n,0);
 }finally{db.close();}
});
test('actual process restart retains invoice obligation, receipt conflicts and idempotency',()=>{
 const tmp=tempStore();let h=harness({filename:tmp.filename});try{
  h.service.applyVerifiedStripeEvent(h.sub('evt_active'));
  const failure=h.inv('evt_failed',10,{id:'in_CURRENT',status:'open',amount_paid:0});failure.type='invoice.payment_failed';
  h.service.applyVerifiedStripeEvent(failure);h.db.close();h=null;
  const script=`import assert from 'node:assert/strict';import {harness,T,iso} from './test/billingCoreRepair20261006.helpers.mjs';const h=harness({filename:process.env.SYNTHETIC_DB,resume:true});try {h.service.applyVerifiedStripeEvent(h.sub('evt_card',20));assert.equal(h.get().planStatus,'payment_failed');assert.equal(h.get().paymentFailedAt,iso(T+10));h.service.applyVerifiedStripeEvent(h.inv('evt_settle',30,{id:'in_CURRENT'}));assert.equal(h.get().planStatus,'active');assert.equal(h.get().paymentFailedAt,null);h.service.applyVerifiedStripeEvent(h.inv('evt_settle',30,{id:'in_CURRENT'}));assert.throws(()=>h.service.applyVerifiedStripeEvent(h.inv('evt_settle',30,{id:'in_CURRENT',amount_paid:11899})),{code:'EVENT_ID_CONFLICT'});}finally{h.db.close();}`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:{...process.env,SYNTHETIC_DB:tmp.filename},encoding:'utf8'});assert.equal(child.status,0,child.stderr);
  h=harness({filename:tmp.filename,resume:true});assert.equal(h.get().planStatus,'active');assert.equal(h.db.prepare("SELECT COUNT(*) n FROM billingEventReceipts WHERE stripeEventId='evt_settle'").get().n,1);
 }finally{h?.db.close();rmSync(tmp.dir,{recursive:true,force:true});}
});
test('response lost after provider completion, restart recovers the same key without another subscription',async()=>{
 const tmp=tempStore();let h=harness({filename:tmp.filename}),f=await httpHarness(h);try{
  const create=f.stub.checkout.sessions.create;
  f.stub.checkout.sessions.create=async(p,o)=>{const session=await create(p,o);Object.assign(session,{status:'complete',subscription:'sub_A',url:null,payment_status:'no_payment_required'});throw Error('SYNTHETIC response loss');};
  const body={plan:'Operator',billingInterval:'monthly'},key='synthetic-lost-response';
  assert.equal((await f.request('/api/billing/checkout',{body,key})).status,502);
  const saved=[...f.sessions.values()][0],providerKey=f.calls.checkout[0].o.idempotencyKey;
  await f.close();h.db.close();h=harness({filename:tmp.filename,resume:true});f=await httpHarness(h);
  let retried=0;f.stub.checkout.sessions.create=async(p,o)=>{retried++;assert.equal(o.idempotencyKey,providerKey);return saved;};
  const recovery=await f.request('/api/billing/checkout',{body,key});assert.equal(recovery.status,409);assert.equal(retried,1);
  assert.equal(h.billing().stripeSubscriptionId,'sub_A');assert.equal(h.db.prepare('SELECT status FROM billingCheckoutRequests').get().status,'COMPLETED');
  assert.equal((await f.request('/api/billing/checkout',{body,key:'synthetic-new-key'})).status,409);assert.equal(retried,1);
 }finally{await f.close();h.db.close();rmSync(tmp.dir,{recursive:true,force:true});}
});
test('provider response received but local receipt failed: rollback and exact-key retry',async()=>{
 const h=harness(),f=await httpHarness(h);try{
  h.db.exec("CREATE TRIGGER synthetic_receipt_loss BEFORE UPDATE OF stripeSessionId ON billingCheckoutRequests WHEN NEW.stripeSessionId IS NOT NULL BEGIN SELECT RAISE(ABORT,'SYNTHETIC receipt loss'); END");
  const body={plan:'QuoteDone',billingInterval:'annual'}; // $2790=279000 recurring; initial charge $0.
  assert.equal((await f.request('/api/billing/checkout',{body})).status,502);
  h.db.exec('DROP TRIGGER synthetic_receipt_loss');assert.equal((await f.request('/api/billing/checkout',{body})).status,201);
  assert.equal(f.sessions.size,1);assert.equal(f.calls.checkout[0].o.idempotencyKey,f.calls.checkout[1].o.idempotencyKey);
 }finally{await f.close();h.db.close();}
});
test('durable owner lease rejects concurrent workers and fences a late response after takeover',async()=>{
 const h=harness();try{
  let at=new Date(T*1000),release;const blocked=new Promise(r=>{release=r;});
  const first=withBillingLease(h.db,'SYNTHETIC-A',async check=>{await blocked;check();},{clock:()=>at,leaseMs:1000});
  await assert.rejects(withBillingLease(h.db,'SYNTHETIC-A',async()=>{}, {clock:()=>at}),{code:'BILLING_OPERATION_IN_PROGRESS'});
  at=new Date((T+2)*1000);await withBillingLease(h.db,'SYNTHETIC-A',async check=>check(),{clock:()=>at});
  release();await assert.rejects(first,{code:'BILLING_LEASE_LOST'});
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM billingOperationLeases').get().n,0);
 }finally{h.db.close();}
});
test('same-second conflicting signed states fail closed until provider resolution',async()=>{
 const h=harness(),f=await httpHarness(h);try{
  h.service.applyVerifiedStripeEvent(h.sub('evt_one'));
  const conflict=h.sub('evt_two',0,{items:{data:[{price:{id:'price_qd_month'}}]}});
  h.service.applyVerifiedStripeEvent(conflict);assert.equal(h.get().planStatus,'pending_payment');
  f.subscriptions.set('sub_A',conflict.data.object);
  const e=h.sub('evt_reconcile',0);assert.equal((await f.send(e)).status,200);assert.equal(h.get().plan,'QuoteDone');assert.equal(h.get().planStatus,'active');
 }finally{await f.close();h.db.close();}
});
test('F02 migrated failure is retained on card edit, resolved only by tenant-bound invoice retrieval',async()=>{
 const db=legacyStore();migrateDatabase(db);
 const {createBillingStateService}=await import('../server/src/billingStateService.js');
 const service=createBillingStateService({db,pricePlanMap:{price_op_month:'Operator'},clock:()=>new Date(T*1000)});
 const h=harness(),base=h.sub('evt_after_migration',20);
 try{
  service.applyVerifiedStripeEvent(base);assert.equal(db.prepare('SELECT planStatus FROM users').get().planStatus,'payment_failed');
  // Historical sanitized receipt can supply ID, never substitute for retrieved ownership.
  db.prepare(`INSERT INTO billingEventReceipts(stripeEventId,ownerId,eventType,objectId,eventCreatedAt,eventDigest,outcome,sanitizedReceiptJson,resultJson,processedAt) VALUES('evt_legacy','SYNTHETIC-A','invoice.payment_failed','in_CURRENT',?,'legacy','APPLIED','{}','{}',?)`).run(T+10,iso(T+10));
  const paid=h.inv('evt_recover',30,{id:'in_CURRENT'});
  const provider={subscriptions:{retrieve:async()=>base.data.object},invoices:{retrieve:async()=>paid.data.object}};
  await service.reconcileVerifiedStripeEvent(paid,provider);
  assert.equal(db.prepare('SELECT planStatus FROM users').get().planStatus,'active');assert.equal(db.prepare('SELECT COUNT(*) n FROM billingRecoveryHolds').get().n,0);
 }finally{db.close();h.db.close();}
});
test('wrong-tenant provider hydration and write failure leave no receipt or evidence',async()=>{
 const h=harness(),f=await httpHarness(h);try{
  const invoice=h.inv('evt_first_invoice');
  f.subscriptions.set('sub_A',h.sub('evt_wrong',0,{customer:'cus_B'}).data.object);
  assert.equal((await f.send(invoice)).status,500);assert.equal(h.get().planStatus,'pending_payment');assert.equal(h.db.prepare('SELECT COUNT(*) n FROM billingEventReceipts').get().n,0);
  f.subscriptions.set('sub_A',h.sub('evt_current').data.object);
  h.db.exec("CREATE TRIGGER synthetic_outbox BEFORE INSERT ON outboxEvents BEGIN SELECT RAISE(ABORT,'SYNTHETIC fail'); END");
  assert.equal((await f.send(invoice)).status,500);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM billingSubscriptionEvidence').get().n,0);
  h.db.exec('DROP TRIGGER synthetic_outbox');assert.equal((await f.send(invoice)).status,200);assert.equal(h.get().planStatus,'active');
 }finally{await f.close();h.db.close();}
});

test('F06 legacy missing failure time stays suspended; provider recovery uses original invoice time',async()=>{
 const db=legacyStore();db.exec("UPDATE billingAccounts SET paymentFailedAt=NULL,graceEndsAt=NULL; UPDATE users SET paymentFailedAt=NULL;");migrateDatabase(db);
 const {createBillingStateService}=await import('../server/src/billingStateService.js');
 const service=createBillingStateService({db,pricePlanMap:{price_op_month:'Operator'},clock:()=>new Date((T+8*day)*1000)});
 const h=harness();try{
  assert.equal(db.prepare('SELECT planStatus FROM users').get().planStatus,'suspended');
  service.applyVerifiedStripeEvent(h.sub('evt_card',20));assert.equal(db.prepare('SELECT planStatus FROM users').get().planStatus,'suspended');assert.equal(db.prepare('SELECT paymentFailedAt FROM users').get().paymentFailedAt,null);
  db.prepare(`INSERT INTO billingEventReceipts(stripeEventId,ownerId,eventType,objectId,eventCreatedAt,eventDigest,outcome,sanitizedReceiptJson,resultJson,processedAt) VALUES('evt_legacy','SYNTHETIC-A','invoice.payment_failed','in_CURRENT',?,'legacy','APPLIED','{}','{}',?)`).run(T+10,iso(T+10));
  const unpaid=h.inv('evt_current',8*day,{id:'in_CURRENT',status:'open',amount_paid:0});unpaid.type='invoice.payment_failed';
  const provider={subscriptions:{retrieve:async()=>h.sub('evt_latest',8*day).data.object},invoices:{retrieve:async()=>unpaid.data.object}};
  await service.reconcileVerifiedStripeEvent(unpaid,provider);
  assert.equal(db.prepare('SELECT planStatus FROM users').get().planStatus,'suspended');assert.equal(db.prepare('SELECT paymentFailedAt FROM users').get().paymentFailedAt,iso(T+10));
  await service.reconcileVerifiedStripeEvent(h.inv('evt_settled',8*day+1,{id:'in_CURRENT',amount_paid:11900}),provider);
  assert.equal(db.prepare('SELECT planStatus FROM users').get().planStatus,'active');assert.equal(db.prepare('SELECT paymentFailedAt FROM users').get().paymentFailedAt,null);
 }finally{h.db.close();db.close();}
});
