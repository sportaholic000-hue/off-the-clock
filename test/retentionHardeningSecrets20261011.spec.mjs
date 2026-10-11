import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {A,B,DEADLINE,KEY,retentionFixture,businessRows} from './helpers/tenantRetentionFixture.mjs';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {createCalendarRetentionRevoker} from '../server/src/calendarRetentionRevocation.js';
import {eraseTenantPricebookFiles} from '../server/src/billingTenantErasure.js';
import {createOffsiteBackupService} from '../server/src/offsiteBackups.js';
import {createSnapshot,startBackupScheduler} from '../server/src/backups.js';
import {withBackupRetentionLock,processLockOwner} from '../server/src/backupRetentionLock.js';

const SID='PN'+'d'.repeat(32);
async function setup(t){
  const f=retentionFixture(t);f.db.pragma('journal_mode=WAL');
  f.db.prepare('UPDATE businessProfiles SET twilioNumberSid=? WHERE ownerId=?').run(SID,A);
  const offsite=createOffsiteBackupService(f.db,f.deployment,{config:{enabled:false,reason:'OFFSITE_NOT_CONFIGURED'},warn:()=>{}});
  let failing=true,blocked=false;
  const service=createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>true,
    releaseNumber:async()=>{if(failing)throw Error('SYNTHETIC unavailable');return {released:true};},
    revokeCalendar:createCalendarRetentionRevoker({enabled:()=>true,key:KEY,fetchImpl:async()=>({status:failing?503:200})}),
    erasePricebookFiles:ownerId=>eraseTenantPricebookFiles(ownerId,{directory:f.deployment.pricebookPath}),
    eraseBackupCopies:ownerId=>offsite.eraseOwner(ownerId),
    cleanupRetryCopies:async()=>{if(blocked)throw Error('BACKUP_STAGING_BUSY');await offsite.cleanupRetryCopies?.();}});
  f.setTime(DEADLINE);await service.processOwner(A,{localOnly:true});
  const secrets=f.db.prepare('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(A);
  assert.ok(secrets.credentialsCiphertext);assert.equal(secrets.phoneNumberSid,SID);
  assert.equal(JSON.parse(f.db.prepare('SELECT retentionStateJson FROM billingCancellations WHERE ownerId=?').get(A).retentionStateJson).steps.backups.status,'DONE');
  // Exact crash boundary in the old snapshot path: online backup completed,
  // process stopped before checkSqlite removed the private retry table.
  const partial=path.join(f.deployment.backupPath,'.partial-snapshot-1795137600000-11111111-1111-4111-8111-111111111111');
  fs.mkdirSync(partial);await f.db.backup(path.join(partial,'off-the-clock.sqlite'));
  assert.ok(fs.readFileSync(path.join(partial,'off-the-clock.sqlite')).includes(Buffer.from(secrets.credentialsCiphertext)));
  return {...f,service,partial,secrets,setFailure:value=>{failing=value;},setBlocked:value=>{blocked=value;}};
}
for(const outcome of ['provider success','30-day permanent failure'])test('retention hardening: interrupted snapshot secrets disappear before '+outcome,async t=>{
  const f=await setup(t),beforeB=businessRows(f.db,B);
  if(outcome==='provider success')f.setFailure(false);else f.setTime(Date.parse(DEADLINE)+30*86400000);
  await f.service.processOwner(A,{localOnly:true});
  assert.equal(fs.existsSync(f.partial),false,'An abandoned snapshot still contains the finished provider step’s retry material');
  const row=f.db.prepare('SELECT * FROM billingCancellations WHERE ownerId=?').get(A),state=JSON.parse(row.retentionStateJson);
  for(const kind of ['phone','calendar'])assert.equal(state.steps[kind].status,outcome==='provider success'?'DONE':'PERMANENT_FAILURE');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM billingRetentionSecrets WHERE ownerId=?').get(A).n,0);
  for(const file of [f.db.name,f.db.name+'-wal'])if(fs.existsSync(file)){
    const bytes=fs.readFileSync(file);assert.ok(!bytes.includes(Buffer.from(SID)));assert.ok(!bytes.includes(Buffer.from(f.secrets.credentialsCiphertext)));
  }
  assert.equal(Boolean(row.dataDeletedAt),outcome==='provider success');assert.deepEqual(businessRows(f.db,B),beforeB);
});
test('retention hardening: provider steps cannot complete while abandoned snapshot removal fails',async t=>{
  const f=await setup(t);f.setFailure(false);f.setBlocked(true);await assert.rejects(f.service.processOwner(A,{localOnly:true}),/BACKUP_STAGING_BUSY/);
  let row=f.db.prepare('SELECT * FROM billingCancellations WHERE ownerId=?').get(A);
  assert.equal(row.dataDeletedAt,null);assert.equal(f.service.retentionStatus().ok,false);
  for(const kind of ['phone','calendar'])assert.equal(JSON.parse(row.retentionStateJson).steps[kind].status,'PENDING');
  f.setBlocked(false);await f.service.processOwner(A,{localOnly:true});
  row=f.db.prepare('SELECT * FROM billingCancellations WHERE ownerId=?').get(A);assert.equal(row.dataErasureVersion,2);assert.equal(fs.existsSync(f.partial),false);
});
test('retention hardening: startup removes abandoned snapshots even when the next backup is not due',async t=>{
  const f=await setup(t);
  await createSnapshot(f.db,f.deployment,{now:()=>f.clock().getTime()});
  const worker=startBackupScheduler(f.db,{...f.deployment,backupIntervalMs:3600000},{now:()=>f.clock().getTime(),onError:()=>{}});
  await worker.ready;await worker.stop();assert.equal(fs.existsSync(f.partial),false);
});
test('retention hardening: retry secrets never reach the first snapshot disk write',async t=>{
  const f=await setup(t),original=Database.prototype.backup;let observed=false;
  Database.prototype.backup=async function(file,...args){
    const result=await original.call(this,file,...args);
    if(file.includes('.partial-snapshot-')){
      observed=true;const bytes=fs.readFileSync(file);
      assert.ok(!bytes.includes(Buffer.from(SID)),'SID reached snapshot disk before normalization');
      assert.ok(!bytes.includes(Buffer.from(f.secrets.credentialsCiphertext)),'Refresh ciphertext reached snapshot disk before normalization');
    }
    return result;
  };
  try{await createSnapshot(f.db,f.deployment);}finally{Database.prototype.backup=original;}
  assert.equal(observed,true);assert.ok(f.db.prepare('SELECT credentialsCiphertext FROM billingRetentionSecrets WHERE ownerId=?').get(A).credentialsCiphertext);
});
test('retention hardening: staging cleanup never removes another live process snapshot',async t=>{
  const f=retentionFixture(t),offsite=createOffsiteBackupService(f.db,f.deployment,{config:{enabled:false},warn:()=>{}});
  const script=`import Database from 'better-sqlite3';import {createSnapshot} from './server/src/backups.js';
    const original=Database.prototype.backup;Database.prototype.backup=async function(file){await original.call(this,file);
      const hold=setInterval(()=>{},1000);await new Promise(resolve=>{process.once('message',resolve);process.send('WRITTEN');});clearInterval(hold);};
    const db=new Database(process.argv[1]);try{await createSnapshot(db,JSON.parse(process.argv[2]));}finally{db.close();process.disconnect();}`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,f.db.name,JSON.stringify(f.deployment)],{stdio:['ignore','ignore','pipe','ipc']});
  t.after(()=>child.kill());await once(child,'message');
  try{await assert.rejects(offsite.cleanupRetryCopies(),/OFFSITE_BUSY/);}
  finally{child.send('FINISH');await once(child,'close');}
  await offsite.cleanupRetryCopies();
});
test('retention hardening: startup retries partial cleanup after a live restore releases its lock',async t=>{
  const f=await setup(t);t.mock.timers.enable({apis:['setTimeout']});
  let release,entered;const enteredLock=new Promise(resolve=>{entered=resolve;});
  const held=withBackupRetentionLock(f.deployment,async()=>{entered();await new Promise(resolve=>{release=resolve;});});await enteredLock;
  let partialAtBackup,started;const startedBackup=new Promise(resolve=>{started=resolve;});
  const worker=startBackupScheduler(f.db,{...f.deployment,backupIntervalMs:3600000},{now:()=>f.clock().getTime(),onError:()=>{},takeSnapshot:async()=>{partialAtBackup=fs.existsSync(f.partial);started();}});
  await assert.rejects(worker.ready,/OFFSITE_BUSY/);release();await held;
  t.mock.timers.tick(60000);await startedBackup;await worker.stop();
  assert.equal(partialAtBackup,false,'Startup retry skipped abandoned snapshot cleanup');
});
test('retention hardening: a clean startup does not block scheduled snapshots on active off-site workers',async t=>{
  const f=retentionFixture(t);t.mock.timers.enable({apis:['setTimeout']});let snapshots=0;
  const worker=startBackupScheduler(f.db,{...f.deployment,backupIntervalMs:3600000},{now:()=>f.clock().getTime(),onError:()=>{},takeSnapshot:async()=>{snapshots++;}});
  await worker.ready;
  const directory=path.join(f.deployment.backupPath,'.offsite');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'run.lock'),JSON.stringify(processLockOwner()));
  t.mock.timers.tick(0);await new Promise(resolve=>setImmediate(resolve));await worker.stop();
  assert.equal(snapshots,1,'Ordinary backup acquired an unnecessary cleanup lock and collided with an active off-site worker');
});
