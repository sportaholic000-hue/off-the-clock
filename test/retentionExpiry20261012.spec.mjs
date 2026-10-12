import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {A,B,END,DEADLINE,KEY,retentionFixture,businessRows} from './helpers/tenantRetentionFixture.mjs';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {createCalendarRetentionRevoker} from '../server/src/calendarRetentionRevocation.js';
import {eraseTenantPricebookFiles} from '../server/src/billingTenantErasure.js';
import {createOffsiteBackupService} from '../server/src/offsiteBackups.js';
import {acquireProcessLock,retentionLockFile} from '../server/src/backupRetentionLock.js';

const DAY=86400000,SID='PN'+'e'.repeat(32);
// Independent oracle, written before the repair: writable live storage must
// discard at the original firstAttemptAt +30 days, even if copy cleanup cannot
// acquire its lock. Physical-copy and WAL work must remain durable and unhealthy;
// terminal provider status must never prevent that work resuming after restart.
async function setup(t,{firstAttempt=DEADLINE}={}){
  const f=retentionFixture(t);let db=f.db,service,blocked=false,enabled=true,cleanupCalls=0;
  const calls={calendar:0,phone:0};
  db.pragma('journal_mode=WAL');db.pragma('busy_timeout=0');
  db.prepare('UPDATE businessProfiles SET twilioNumberSid=? WHERE ownerId=?').run(SID,A);
  const beforeB=businessRows(db,B),billing=db.prepare('SELECT * FROM billingAccounts WHERE ownerId=?').get(A);
  const receipt=db.prepare('SELECT * FROM outboxEvents WHERE id=? AND ownerId=?').get('financial-'+A,A);
  function openService(){
    const offsite=createOffsiteBackupService(db,f.deployment,{config:{enabled:false,reason:'OFFSITE_NOT_CONFIGURED'},warn:()=>{}});
    service=createBillingCustomerLifecycle({database:db,clock:f.clock,enabled:()=>enabled,
      releaseNumber:async()=>{calls.phone++;throw Error('[SYNTHETIC] unavailable');},
      revokeCalendar:createCalendarRetentionRevoker({enabled:()=>enabled,key:KEY,fetchImpl:async()=>{calls.calendar++;return {status:503};}}),
      erasePricebookFiles:ownerId=>eraseTenantPricebookFiles(ownerId,{directory:f.deployment.pricebookPath}),
      eraseBackupCopies:ownerId=>offsite.eraseOwner(ownerId),
      cleanupRetryCopies:async()=>{cleanupCalls++;if(blocked)throw Error('BACKUP_STAGING_BUSY');await offsite.cleanupRetryCopies();}});
  }
  openService();f.setTime(firstAttempt);await service.processOwner(A,{localOnly:true});
  const material=db.prepare('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(A);
  assert.equal(material.phoneNumberSid===SID,true);
  const partial=path.join(f.deployment.backupPath,'.partial-snapshot-1795137600000-22222222-2222-4222-8222-222222222222');
  fs.mkdirSync(partial);await db.backup(path.join(partial,'off-the-clock.sqlite'));
  assert.equal(fs.readFileSync(path.join(partial,'off-the-clock.sqlite')).includes(Buffer.from(SID)),true);
  t.after(()=>{if(db.open)db.close();});
  const row=()=>db.prepare('SELECT * FROM billingCancellations WHERE ownerId=?').get(A);
  const state=()=>JSON.parse(row().retentionStateJson);
  const count=()=>db.prepare('SELECT COUNT(*) n FROM billingRetentionSecrets WHERE ownerId=?').get(A).n;
  function preserved(){
    assert.deepEqual(businessRows(db,B),beforeB,'Business B changed');
    assert.deepEqual(db.prepare('SELECT * FROM billingAccounts WHERE ownerId=?').get(A),billing);
    assert.deepEqual(db.prepare('SELECT * FROM outboxEvents WHERE id=? AND ownerId=?').get('financial-'+A,A),receipt);
  }
  function bytesGone(){
    for(const suffix of ['','-wal'])if(fs.existsSync(db.name+suffix)){
      const bytes=fs.readFileSync(db.name+suffix);
      assert.equal(bytes.includes(Buffer.from(SID)),false,'Retry SID remains in live database history '+suffix);
      if(material.credentialsCiphertext)assert.equal(bytes.includes(Buffer.from(material.credentialsCiphertext)),false,'Retry ciphertext remains in live database history '+suffix);
    }
  }
  return {...f,get db(){return db;},get service(){return service;},get cleanupCalls(){return cleanupCalls;},
    calls,partial,material,row,state,count,preserved,bytesGone,
    setBlocked:value=>{blocked=value;},setEnabled:value=>{enabled=value;},
    restart:()=>{const name=db.name;db.close();db=new Database(name,{timeout:0});db.pragma('foreign_keys=ON');openService();}};
}
function safeObservation(f,day){
  const state=f.state(),status=f.service.retentionStatus();
  return {day,liveRetryRows:f.count(),calendar:state.steps.calendar?.status,phone:state.steps.phone.status,
    retryCopies:state.retryCopies?.status||null,flushPending:!!state.flushPending,
    erasureComplete:!!f.row().dataDeletedAt,healthy:status.ok,providerCalls:{...f.calls},partialExists:fs.existsSync(f.partial)};
}
for(const blocker of ['injected staging failure','held SQLite retention lock'])test('retention expiry: deadline and restart remove live secrets despite '+blocker,async t=>{
  const f=await setup(t),origin=f.state().steps.calendar.firstAttemptAt;
  assert.equal(f.state().steps.phone.firstAttemptAt,origin);
  let release=()=>{};
  if(blocker==='injected staging failure')f.setBlocked(true);
  else release=acquireProcessLock(retentionLockFile(f.deployment)); // Outside the reentrant lock context.
  t.after(()=>release());
  const error=blocker==='injected staging failure'?/BACKUP_STAGING_BUSY/:/OFFSITE_BUSY/;
  f.setTime(Date.parse(origin)+30*DAY-1);await f.service.processOwner(A,{localOnly:true});
  assert.equal(f.count(),1);assert.deepEqual(f.calls,{calendar:2,phone:2});
  const observations=[];
  for(const day of [30,31]){
    f.setTime(Date.parse(origin)+day*DAY);
    if(day===31)f.restart();
    await assert.rejects(f.service.processOwner(A,{localOnly:true}),error);
    observations.push(safeObservation(f,day));
    if(blocker==='held SQLite retention lock')assert.throws(()=>acquireProcessLock(retentionLockFile(f.deployment)),/OFFSITE_BUSY/,'Cleanup released another live holder');
  }
  t.diagnostic(JSON.stringify(observations));
  assert.deepEqual(observations.map(value=>value.liveRetryRows),[0,0],'Expired live retry material survived a writable cleanup run');
  for(const observation of observations){
    assert.equal(observation.calendar,'PERMANENT_FAILURE');assert.equal(observation.phone,'PERMANENT_FAILURE');
    assert.equal(observation.retryCopies,'PENDING');assert.equal(observation.erasureComplete,false);
    assert.equal(observation.healthy,false);assert.equal(observation.partialExists,true);
    assert.deepEqual(observation.providerCalls,{calendar:2,phone:2});assert.equal(observation.flushPending,false);
  }
  f.bytesGone();f.preserved();
  const status=f.service.retentionStatus();
  assert.ok(status.pending.some(entry=>entry.ownerId===A&&entry.step==='retryCopies'));
  assert.equal(status.permanentFailures.length,2);
  assert.equal(f.row().phoneReleasedAt,null);assert.equal(f.row().calendarRevokeStatus,'PERMANENT_FAILURE');
  const metadata=JSON.stringify({state:f.state(),status});
  for(const secret of [SID,f.material.credentialsCiphertext,f.material.credentialsIv,f.material.credentialsTag])assert.equal(metadata.includes(secret),false,'Cleanup evidence leaked retry material');
  const attempts=f.cleanupCalls;release();f.setBlocked(false);f.restart();
  await f.service.processOwner(A,{localOnly:true});
  assert.ok(f.cleanupCalls>attempts,'Terminal provider steps skipped durable copy cleanup');
  assert.equal(fs.existsSync(f.partial),false);assert.equal(f.state().retryCopies.status,'DONE');
  assert.equal(f.service.retentionStatus().pending.some(entry=>entry.step==='retryCopies'),false);
  assert.equal(f.service.retentionStatus().ok,false,'Permanent provider failure became successful erasure');
  assert.equal(f.row().dataDeletedAt,null);assert.equal(f.row().dataErasureVersion,0);
  assert.equal(f.count(),0);f.bytesGone();f.preserved();
  const stable=f.state();await f.service.processOwner(A,{localOnly:true});
  assert.deepEqual(f.state(),stable);assert.deepEqual(f.calls,{calendar:2,phone:2});f.preserved();
});

test('retention expiry: disabled providers do not extend either retry deadline',async t=>{
  const f=await setup(t);f.setBlocked(true);f.setEnabled(false);
  f.setTime(Date.parse(DEADLINE)+30*DAY);await assert.rejects(f.service.processOwner(A,{localOnly:true}),/BACKUP_STAGING_BUSY/);
  assert.equal(f.count(),0);assert.deepEqual(f.calls,{calendar:1,phone:1});
  for(const kind of ['calendar','phone'])assert.equal(f.state().steps[kind].firstAttemptAt,DEADLINE);
  f.bytesGone();f.preserved();
});

test('retention expiry: phone day-30 origin expires at day 60 without advancing calendar or data erasure',async t=>{
  const origin=new Date(Date.parse(END)+30*DAY).toISOString(),f=await setup(t,{firstAttempt:origin});
  assert.equal(f.state().steps.phone.firstAttemptAt,origin);assert.equal(f.state().steps.calendar,undefined);
  f.setBlocked(true);f.setTime(Date.parse(END)+60*DAY-1);await f.service.processOwner(A,{localOnly:true});
  assert.equal(f.count(),1);assert.deepEqual(f.calls,{calendar:0,phone:2});
  f.setTime(Date.parse(END)+60*DAY);await assert.rejects(f.service.processOwner(A,{localOnly:true}),/BACKUP_STAGING_BUSY/);
  assert.equal(f.count(),0);assert.equal(f.state().steps.phone.status,'PERMANENT_FAILURE');
  assert.equal(f.state().steps.calendar,undefined);assert.equal(f.state().steps.local,undefined);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM calendarConnections WHERE ownerId=?').get(A).n,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM businessProfiles WHERE ownerId=?').get(A).n,1);
  assert.equal(f.db.prepare('SELECT twilioNumberSid FROM businessProfiles WHERE ownerId=?').get(A).twilioNumberSid,null);
  assert.equal(f.row().phoneReleasedAt,null);f.bytesGone();f.preserved();
});

test('retention expiry: WAL reader leaves durable flush work after live deletion and terminal provider failure',async t=>{
  const f=await setup(t);f.db.pragma('wal_checkpoint(TRUNCATE)');
  const reader=new Database(f.db.name,{readonly:true,timeout:0});
  reader.exec('BEGIN');reader.prepare('SELECT COUNT(*) n FROM billingRetentionSecrets WHERE ownerId=?').get(A);
  t.after(()=>{if(reader.open)reader.close();});
  f.setTime(Date.parse(DEADLINE)+30*DAY);
  await assert.rejects(f.service.processOwner(A,{localOnly:true}),/RETENTION_DATABASE_BUSY/);
  assert.equal(f.count(),0);assert.equal(f.state().flushPending,true);assert.equal(fs.existsSync(f.partial),false);
  assert.equal(f.service.retentionStatus().ok,false);assert.ok(f.service.retentionStatus().pending.some(entry=>entry.step==='storage'));
  assert.equal(f.row().dataDeletedAt,null);assert.deepEqual(f.calls,{calendar:1,phone:1});
  assert.equal(fs.readFileSync(f.db.name).includes(Buffer.from(f.material.credentialsCiphertext)),true,'Reader did not pin the old main pages');
  reader.exec('ROLLBACK');reader.close();f.restart();await f.service.processOwner(A,{localOnly:true});
  assert.equal(f.state().flushPending,false);assert.equal(f.service.retentionStatus().pending.some(entry=>entry.step==='storage'),false);
  assert.equal(f.service.retentionStatus().ok,false);assert.equal(f.row().dataDeletedAt,null);
  f.bytesGone();f.preserved();assert.deepEqual(f.calls,{calendar:1,phone:1});
});

test('retention expiry: local preparation discards expired values before external cleanup and resumes after restart',async t=>{
  const f=await setup(t);f.setBlocked(true);f.setTime(Date.parse(DEADLINE)+30*DAY);
  await assert.rejects(f.service.processOwner(A,{localOnly:true,prepareOnly:true}),/RETENTION_STAGING_PENDING/);
  assert.equal(f.count(),0);assert.equal(f.state().retryCopies.status,'PENDING');
  assert.equal(fs.existsSync(f.partial),true);f.bytesGone();f.preserved();
  f.restart();await assert.rejects(f.service.processOwner(A,{localOnly:true}),/BACKUP_STAGING_BUSY/);
  f.setBlocked(false);await f.service.processOwner(A,{localOnly:true});
  assert.equal(fs.existsSync(f.partial),false);assert.equal(f.state().retryCopies.status,'DONE');
  assert.deepEqual(f.calls,{calendar:1,phone:1});
});

test('retention expiry: unusable calendar material is discarded without expiring the still-valid phone retry',async t=>{
  const f=await setup(t);f.setBlocked(true);
  f.db.prepare("UPDATE billingRetentionSecrets SET credentialsCiphertext='[SYNTHETIC] unreadable' WHERE ownerId=?").run(A);
  await assert.rejects(f.service.processOwner(A,{localOnly:true}),/BACKUP_STAGING_BUSY/);
  const kept=f.db.prepare('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(A);
  assert.equal(kept.credentialsCiphertext,null);assert.equal(kept.credentialsIv,null);assert.equal(kept.credentialsTag,null);
  assert.equal(kept.phoneNumberSid===SID,true);assert.equal(f.state().steps.calendar.status,'PERMANENT_FAILURE');
  assert.equal(f.state().steps.phone.status,'PENDING');assert.deepEqual(f.calls,{calendar:1,phone:2});f.preserved();
});

test('retention expiry: preparation cannot reactivate away unfinished physical cleanup',async t=>{
  const f=await setup(t,{firstAttempt:new Date(Date.parse(END)+30*DAY).toISOString()});
  f.setTime(Date.parse(END)+60*DAY);f.setBlocked(true);
  // A replacement paid account can reactivate retained data before day 90.
  // The local preparation pass must not erase its outstanding cleanup ledger.
  f.db.prepare("UPDATE billingAccounts SET stripeSubscriptionId='sub_SYNTHETIC_replacement',paymentMethodVerifiedAt=? WHERE ownerId=?").run(END,A);
  f.db.prepare("UPDATE users SET planStatus='active',paidThroughAt=? WHERE id=?").run(new Date(Date.parse(END)+80*DAY).toISOString(),A);
  t.diagnostic(JSON.stringify({before:f.db.prepare('SELECT planStatus,paidThroughAt,dataDeletedAt FROM users WHERE id=?').get(A),state:f.row().state,endAt:f.row().endAt,time:f.clock().toISOString()}));
  let failure;try{await f.service.processOwner(A,{localOnly:true,prepareOnly:true});}catch(error){failure=error;}
  assert.equal(f.row().state,'ENDED','Reactivation discarded unfinished physical cleanup');
  assert.match(failure?.message||'',/RETENTION_STAGING_PENDING/);
  assert.equal(f.count(),0);assert.equal(f.state().retryCopies.status,'PENDING');assert.equal(fs.existsSync(f.partial),true);
  f.restart();await assert.rejects(f.service.processOwner(A,{localOnly:true}),/BACKUP_STAGING_BUSY/);
  f.setBlocked(false);await f.service.processOwner(A,{localOnly:true});
  assert.equal(fs.existsSync(f.partial),false);assert.equal(f.row().state,'RESTORED');
  assert.deepEqual(f.calls,{calendar:0,phone:1});
});
