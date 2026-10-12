import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {A,B,DEADLINE,KEY,retentionFixture,businessRows,assertErased} from './helpers/tenantRetentionFixture.mjs';
import {fakeS3} from './helpers/offsiteFakeS3.mjs';
import {createS3BackupStore} from '../server/src/offsiteStore.js';
import {createDailyOffsiteBackupService} from '../server/src/offsiteBackups.js';
import {createContinuousOffsiteService} from '../server/src/continuousOffsite.js';
import {acquireProcessLock,assertBackupRetentionIdle,retentionLockFile} from '../server/src/backupRetentionLock.js';
import {createSnapshot,cleanupAbandonedSnapshots} from '../server/src/backups.js';
import {eraseTenantBackupCopies} from '../server/src/tenantBackupErasure.js';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {createCalendarRetentionRevoker} from '../server/src/calendarRetentionRevocation.js';
import {eraseTenantPricebookFiles} from '../server/src/billingTenantErasure.js';

const signal=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function setup(t,kind){
  const f=retentionFixture(t),fake=await fakeS3(t);
  const config={enabled:true,endpoint:fake.endpoint,bucket:'synthetic-bucket',prefix:'synthetic-coordination-'+kind,
    region:'auto',urlStyle:'path',key:Buffer.from('45'.repeat(32),'hex'),
    credentials:{accessKeyId:'SYNTHETIC_ACCESS',secretAccessKey:'SYNTHETIC_SECRET'}};
  const store=createS3BackupStore(config);t.after(()=>store.close());
  const directory=path.join(f.deployment.backupPath,kind==='daily'?'.offsite':'.offsite-continuous');
  const factory=kind==='daily'?createDailyOffsiteBackupService:createContinuousOffsiteService;
  const create=extra=>factory(f.db,f.deployment,{config,store,now:()=>f.clock().getTime(),warn:()=>{},closeStore:false,...extra});
  return {...f,fake,config,store,create,directory,workerLock:path.join(directory,'run.lock')};
}
function assertBusy(file){
  let release;
  try{release=acquireProcessLock(file);}catch(error){assert.match(error.message,/^OFFSITE_BUSY$/);return;}
  finally{release?.();}
  assert.fail('A competing acquisition entered the protected operation');
}

// Ordinary coordination contracts, using the existing synthetic store. This
// file does not implement the separate delayed-publication audit harness.
for(const kind of ['daily','continuous']){
  test('backup coordination: '+kind+' rejects late admission without changing its pending retry',async t=>{
    const f=await setup(t,kind),seed=f.create();
    const failure=t.mock.method(f.store,'putFile',async()=>{throw Error('SYNTHETIC_UPLOAD_FAILURE');});
    await assert.rejects(seed.run(),/OFFSITE_UPLOAD_FAILED/);await seed.stop();failure.mock.restore();
    const stateFile=path.join(f.directory,'state.json'),pendingFile=path.join(f.directory,'pending.enc');
    const beforeState=fs.readFileSync(stateFile),beforePending=fs.readFileSync(pendingFile);
    const record=JSON.parse(beforeState).pending,worker=f.create(),requests=f.fake.requests.length;
    const inode=fs.statSync(f.workerLock+'.sqlite').ino;
    let releaseRetention,admissionInterrupted=false;
    const chmod=fs.chmodSync;
    const hook=t.mock.method(fs,'chmodSync',(file,mode)=>{
      const result=chmod(file,mode);
      if(file===f.workerLock+'.sqlite'&&!admissionInterrupted){
        admissionInterrupted=true;
        // Retention becomes busy after run()'s initial idle probe, while the
        // worker is acquiring its own mutex. No provider operation is delayed.
        releaseRetention=acquireProcessLock(retentionLockFile(f.deployment));
      }
      return result;
    });
    try{
      await assert.rejects(worker.run(),/^Error: OFFSITE_BUSY$/);
      assert.equal(admissionInterrupted,true);
      assert.equal(f.fake.requests.length,requests,'Busy admission must not contact the store');
      assert.deepEqual(fs.readFileSync(stateFile),beforeState);
      assert.deepEqual(fs.readFileSync(pendingFile),beforePending);
      assert.equal(fs.statSync(f.workerLock+'.sqlite').ino,inode);
      // Rejected admission releases the worker mutex even while retention is held.
      const releaseWorker=acquireProcessLock(f.workerLock);releaseWorker();
    }finally{hook.mock.restore();releaseRetention?.();await worker.stop();}
    const retry=f.create();try{await retry.run();}finally{await retry.stop();}
    assert.deepEqual(f.fake.objects.get(record.key).bytes,beforePending);
    assert.equal(fs.existsSync(pendingFile),false);
    assert.equal(fs.statSync(f.workerLock+'.sqlite').ino,inode);
  });

  test('backup coordination: '+kind+' holds worker exclusion through verification and publication',async t=>{
    const f=await setup(t,kind),seen=new Set();let checkedErasure=false;
    for(const method of ['versioning','record','putFile','download','putRecord','head','list','remove']){
      const original=f.store[method];
      t.mock.method(f.store,method,async(...args)=>{
        seen.add(method);assertBusy(f.workerLock);
        if(method==='putRecord'&&!checkedErasure){
          checkedErasure=true;
          await assert.rejects(eraseTenantBackupCopies(A,f.deployment,{config:f.config,store:f.store}),/OFFSITE_BUSY/);
        }
        return original(...args);
      });
    }
    const worker=f.create();try{await worker.run();}finally{await worker.stop();}
    for(const method of ['putFile','download','putRecord','list'])assert.ok(seen.has(method),method);
    assert.equal(checkedErasure,true);
    const release=acquireProcessLock(f.workerLock);release();assertBackupRetentionIdle(f.deployment);
  });

  test('backup coordination: '+kind+' snapshot contention drains and shuts down without deadlock',
    {timeout:15000},async t=>{
      const entered=signal(),resume=signal(),draining=signal();t.after(()=>resume.resolve());
      const f=await setup(t,kind),beforeB=businessRows(f.db,B);
      f.db.prepare('UPDATE businessProfiles SET twilioNumberSid=? WHERE ownerId=?').run('PN'+'a'.repeat(32),A);
      const snapshot=async()=>{
        entered.resolve();await resume.promise;
        return createSnapshot(f.db,f.deployment,{now:()=>f.clock().getTime()});
      };
      const worker=f.create(kind==='daily'?{takeSnapshot:snapshot}:{takeReplicaSnapshot:snapshot});
      const rejected=assert.rejects(worker.run(),/OFFSITE_BUSY/);await entered.promise;
      const lifecycle=createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>true,
        releaseNumber:async()=>({released:true}),
        revokeCalendar:createCalendarRetentionRevoker({enabled:()=>true,key:KEY,fetchImpl:async()=>({status:200})}),
        erasePricebookFiles:ownerId=>eraseTenantPricebookFiles(ownerId,{directory:f.deployment.pricebookPath}),
        eraseBackupCopies:ownerId=>eraseTenantBackupCopies(ownerId,f.deployment,{config:f.config,store:f.store,at:DEADLINE,
          drain:()=>{draining.resolve();return worker.drain();}}),
        cleanupRetryCopies:()=>cleanupAbandonedSnapshots(f.deployment)});
      f.setTime(DEADLINE);const erasing=lifecycle.processOwner(A,{localOnly:true});await draining.promise;
      assertBusy(retentionLockFile(f.deployment));
      const stopped=worker.stop();resume.resolve();await Promise.all([rejected,erasing,stopped]);
      assertErased(assert,f.db);assert.deepEqual(businessRows(f.db,B),beforeB);
      assert.ok(f.db.prepare('SELECT dataDeletedAt FROM billingCancellations WHERE ownerId=?').get(A).dataDeletedAt);
      assert.equal(lifecycle.retentionStatus().ok,true);
      await lifecycle.processOwner(A,{localOnly:true});assert.deepEqual(businessRows(f.db,B),beforeB);
      const release=acquireProcessLock(f.workerLock);release();assertBackupRetentionIdle(f.deployment);
    });
}
