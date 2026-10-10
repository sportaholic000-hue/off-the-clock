import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,A,SIGNUP} from './overageMinute20261006Fixture.mjs';
import * as migrations from '../server/src/migrations.js';
import {createAuthSessionService} from '../server/src/authSessionService.js';
// Exact money expectations are in verification/starter-plan-20261009/EXPECTATIONS.md.
for(const [plan,included,monthly,annual] of [['Starter',150,6900,69000],['Operator',300,11900,119000],['QuoteDone',1200,27900,279000]])for(const interval of ['monthly','annual'])test(`Starter lineup: ${plan} ${interval} confirmed usage, warnings and 2520-cent installment`,async t=>{
 const f=fixture(t);f.activate(A,{plan,interval,amount:interval==='annual'?annual:monthly});
 assert.equal(f.db.prepare('SELECT plan FROM users WHERE id=?').get(A).plan,plan);
 f.call((included-60)*60);assert.deepEqual(f.service.snapshot(A).warnings.map(w=>w.threshold),[60]);
 f.call(30*60);assert.deepEqual(f.service.snapshot(A).warnings.map(w=>w.threshold),[60,30]);
 f.call(30*60);const pending=f.call(60,{provider:false});
 assert.equal(f.service.snapshot(A).overageCents,0);
 f.meter.providerComplete(pending.receipt);f.meter.providerComplete(pending.receipt);assert.equal(f.service.snapshot(A).overageCents,35);
 f.call(70*60);await f.service.processOwner(A);assert.equal(f.service.snapshot(A).overageCents,2485);assert.equal(f.fakes.invoices.size,0);
 f.call(60);await f.service.processOwner(A);await f.service.processOwner(A);
 assert.deepEqual([...f.fakes.items.values()].map(i=>i.amount),[2520]);assert.equal(f.service.snapshot(A).includedMinutes,included);
 assert.deepEqual(f.service.snapshot(A).warnings.map(w=>w.threshold),[60,30,0]);
 f.call(600,{fallback:true});f.call(600,{spam:true});assert.equal(f.service.snapshot(A).overageCents,2520);
});
for(const plan of ['Starter','Operator','QuoteDone'])test(`Starter lineup: ${plan} trial has 60 minutes, no overage, warnings once`,async t=>{
 const f=fixture(t);f.setTime(SIGNUP);f.subscription(A,{plan,status:'trialing',start:SIGNUP});f.call(30*60);f.call(30*60);await f.service.processOwner(A);await f.service.processOwner(A);
 const v=f.service.snapshot(A);assert.deepEqual([v.includedMinutes,v.minutesUsed,v.overageCents],[60,60,0]);assert.deepEqual(v.warnings.map(w=>w.threshold),[30,0]);assert.equal(f.fakes.invoices.size,0);assert.equal(f.fakes.mail.size,2);
});
for(const from of ['Starter','Operator','QuoteDone'])for(const to of ['Starter','Operator','QuoteDone'])if(from!==to)test(`Starter lineup: verified ${from} to ${to} subscription event`,t=>{
 const f=fixture(t);f.activate(A,{plan:from});f.subscription(A,{plan:to});assert.equal(f.db.prepare('SELECT plan FROM users WHERE id=?').get(A).plan,to);assert.equal(f.service.snapshot(A).includedMinutes,{Starter:150,Operator:300,QuoteDone:1200}[to]);
});
test('Starter lineup: legacy CHECK migration preserves periods, charges, indexes and foreign keys',async t=>{
 const f=fixture(t);f.activate();f.call(372*60);await f.service.processOwner(A);
 const tables=['billingUsagePeriods','billingUsageCharges'];const before=tables.map(table=>f.db.prepare(`SELECT * FROM ${table}`).all());
 // Reconstruct precisely the legacy constraint, leaving existing children in place.
 f.db.exec('PRAGMA foreign_keys=OFF');
 for(const table of ['billingCheckoutRequests','billingUsagePeriods']){
  const sql=f.db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(table).sql;
  const indexes=f.db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type='index' AND sql IS NOT NULL").all(table);
  f.db.exec(sql.replace(table,table+'_legacy').replace(/'Starter',\s*/,''));f.db.exec(`INSERT INTO ${table}_legacy SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_legacy RENAME TO ${table}`);for(const row of indexes)f.db.exec(row.sql);
 }
 f.db.exec('PRAGMA foreign_keys=ON');migrations.migrateStarterPlanConstraints(f.db);migrations.migrateStarterPlanConstraints(f.db);
 assert.deepEqual(tables.map(table=>f.db.prepare(`SELECT * FROM ${table}`).all()),before);
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 f.db.prepare("UPDATE billingUsagePeriods SET plan='Starter' WHERE ownerId=?").run(A);
 assert.match(f.db.prepare("SELECT sql FROM sqlite_master WHERE name='billingCheckoutRequests'").get().sql,/'Starter'/);
});
test('Starter lineup: downgrade suspends staff login but retains owner login and staff data',t=>{
 const f=fixture(t);f.activate();const at=f.clock().toISOString();
 f.db.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES('synthetic-staff',?,'staff@example.invalid','SYNTHETIC','Staff','Synthetic','Operator','active','UTC','staff',?)").run(A,at);
 const sessions=createAuthSessionService(f.db,{environment:{JWT_SECRET:'[SYNTHETIC]'.padEnd(64,'x')},clock:f.clock}),staff=f.db.prepare("SELECT * FROM users WHERE id='synthetic-staff'").get();
 const saved=sessions.create(staff);f.subscription(A,{plan:'Starter'});assert.throws(()=>sessions.create(staff),{code:'SESSION_INVALID'});assert.throws(()=>sessions.refresh(saved.refreshToken),{code:'SESSION_INVALID'});
 assert.ok(sessions.create(f.db.prepare('SELECT * FROM users WHERE id=?').get(A)).token);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM users WHERE id='synthetic-staff'").get().n,1);
 f.subscription(A,{plan:'Operator'});assert.ok(sessions.create(staff).token);
});
