import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {A,B,DEADLINE,KEY,hash,retentionFixture,businessRows,assertErased} from './helpers/tenantRetentionFixture.mjs';
import {fakeS3} from './helpers/offsiteFakeS3.mjs';
import {createS3BackupStore} from '../server/src/offsiteStore.js';
import {createOffsiteBackupService,restoreOffsiteBackup,restoreContinuousBackup} from '../server/src/offsiteBackups.js';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {createCalendarRetentionRevoker} from '../server/src/calendarRetentionRevocation.js';
import {eraseTenantPricebookFiles} from '../server/src/billingTenantErasure.js';
import {offsiteUploadHistory} from '../server/src/offsiteHistory.js';

async function setup(t){
  const f=retentionFixture(t),fake=await fakeS3(t);
  const config={enabled:true,endpoint:fake.endpoint,bucket:'synthetic-bucket',prefix:'synthetic-day90',region:'auto',urlStyle:'path',
    key:Buffer.from('45'.repeat(32),'hex'),credentials:{accessKeyId:'SYNTHETIC_ACCESS',secretAccessKey:'SYNTHETIC_SECRET'}};
  const store=createS3BackupStore(config),options={config,store,now:()=>f.clock().getTime(),warn:()=>{}};
  const offsite=createOffsiteBackupService(f.db,f.deployment,options);t.after(()=>offsite.stop());
  await offsite.run();
  const keys=Object.fromEntries(['daily','continuous'].map(kind=>[kind,[...fake.objects.keys()].find(key=>key.includes('/'+kind+'/')&&key.endsWith('.enc'))]));
  async function restore(kind,label){
    const id=keys[kind].split('/').at(-1).slice(0,-4),target=path.join(f.root,'restores',label);
    await (kind==='daily'?restoreOffsiteBackup({store,config,day:id,target,volume:f.root}):restoreContinuousBackup({store,config,checkpoint:id,target,volume:f.root}));
    return target;
  }
  function lifecycle(backups){return createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>true,
    releaseNumber:async()=>({released:true}),revokeCalendar:createCalendarRetentionRevoker({enabled:()=>true,key:KEY,fetchImpl:async()=>({status:200})}),
    erasePricebookFiles:ownerId=>eraseTenantPricebookFiles(ownerId,{directory:f.deployment.pricebookPath}),eraseBackupCopies:ownerId=>backups.eraseOwner(ownerId)});}
  return {...f,fake,config,store,offsite,options,keys,restore,lifecycle};
}

// Pre-execution oracle: previously uploaded objects outlive environment settings.
// Local deletion proceeds at day 90, but completion stays unset until a later
// configured run actually redacts BOTH remote inventories. B is never changed.
for(const reason of ['OFFSITE_NOT_CONFIGURED','OFFSITE_CONFIG_INVALID'])test('day90 missing settings: prior uploads stay pending — '+reason,async t=>{
  const f=await setup(t),beforeB=businessRows(f.db,B);
  for(const directory of ['.offsite','.offsite-continuous'])assert.ok(!fs.existsSync(path.join(f.deployment.backupPath,directory,'pending.enc')));
  assert.ok(!fs.existsSync(path.join(f.deployment.backupPath,'.retention',hash(A))));
  const history=offsiteUploadHistory(f.deployment);assert.equal(history.length,1);assert.equal(history[0].firstSuccessfulUploadAt,new Date(Date.parse(DEADLINE)-1).toISOString());
  // The nonrotating upload receipt alone must suffice, even when the rotating
  // daily/continuous worker state and all pending/journal files are absent.
  for(const directory of ['.offsite','.offsite-continuous'])fs.rmSync(path.join(f.deployment.backupPath,directory,'state.json'));
  assert.deepEqual(offsiteUploadHistory(f.deployment),history);
  const unavailable=createOffsiteBackupService(f.db,f.deployment,{config:{enabled:false,reason,missing:[]},warn:()=>{},now:()=>f.clock().getTime()});
  f.setTime(DEADLINE);await f.lifecycle(unavailable).processOwner(A,{localOnly:true}).catch(()=>{});
  assertErased(assert,f.db);assert.ok(!fs.existsSync(path.join(f.deployment.pricebookPath,A+'.json')));
  assert.deepEqual(businessRows(f.db,B),beforeB);
  const pending=f.db.prepare('SELECT dataDeletedAt,dataErasureVersion FROM billingCancellations WHERE ownerId=?').get(A);
  assert.equal(pending.dataDeletedAt,null,'Remote inventory was skipped: deletion must remain pending');
  assert.equal(pending.dataErasureVersion,0);
  assert.equal(unavailable.status().ok,false);
  assert.equal(unavailable.status().retention.pendingOwners,1);
  // The error and history must survive worker reconstruction, without a pending
  // archive or replacement journal being needed as evidence of prior uploads.
  const restarted=createOffsiteBackupService(f.db,f.deployment,{config:{enabled:false,reason,missing:[]},warn:()=>{}});
  assert.equal(restarted.status().retention.pendingOwners,1);
  await f.lifecycle(f.offsite).processOwner(A,{localOnly:true});
  assert.ok(f.db.prepare('SELECT dataDeletedAt FROM billingCancellations WHERE ownerId=?').get(A).dataDeletedAt);
  for(const kind of ['daily','continuous']){
    const folder=await f.restore(kind,'configured-'+kind),db=new Database(path.join(folder,'off-the-clock.sqlite'),{readonly:true});
    try{assertErased(assert,db);assert.deepEqual(businessRows(db,B),beforeB);}finally{db.close();}
  }
});

// Exact reported order, using the unmodified production publish routine and
// the repository's S3 fixture: A prepares, A's delete fails, B completes, A
// retries. The final shared archive must have BOTH private businesses erased.
for(const kind of ['daily','continuous'])test('day90 stale replacement: A fails, B completes, A retries — '+kind,async t=>{
  const f=await setup(t);f.setTime(DEADLINE);
  f.fake.controls.failDeleteKey=f.keys[kind];
  await assert.rejects(f.offsite.eraseOwner(A));
  assert.ok(fs.existsSync(path.join(f.deployment.backupPath,'.retention',hash(A),hash(f.keys[kind]),'replacement.json')));
  f.fake.controls.failDeleteKey=null;
  await f.offsite.eraseOwner(B);
  await f.offsite.eraseOwner(A);
  const folder=await f.restore(kind,'after-ABA-'+kind),db=new Database(path.join(folder,'off-the-clock.sqlite'),{readonly:true});
  try{
    for(const ownerId of [A,B]){
      assert.equal(db.prepare('SELECT COUNT(*) n FROM businessProfiles WHERE ownerId=?').get(ownerId).n,0,ownerId+' private profile must stay erased');
      assert.equal(db.prepare('SELECT COUNT(*) n FROM calendarConnections WHERE ownerId=?').get(ownerId).n,0,ownerId+' calendar token must stay erased');
      assert.equal(db.prepare('SELECT passwordHash FROM users WHERE id=?').get(ownerId).passwordHash,'!');
      assert.ok(!fs.existsSync(path.join(folder,'pricebooks',ownerId+'.json')));
      assert.ok(db.prepare('SELECT ownerId FROM billingAccounts WHERE ownerId=?').get(ownerId));
    }
    assert.deepEqual(db.pragma('foreign_key_check'),[]);
  }finally{db.close();}
});
