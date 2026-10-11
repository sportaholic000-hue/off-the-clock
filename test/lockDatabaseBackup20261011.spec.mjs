import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import Database from 'better-sqlite3';
import {A,B,DEADLINE,KEY,retentionFixture,businessRows,assertErased} from './helpers/tenantRetentionFixture.mjs';
import {fakeS3} from './helpers/offsiteFakeS3.mjs';
import {acquireProcessLock,retentionLockFile} from '../server/src/backupRetentionLock.js';
import {createSnapshot,listSnapshots,pruneSnapshots,verifyBackup,cleanupAbandonedSnapshots} from '../server/src/backups.js';
import {createS3BackupStore} from '../server/src/offsiteStore.js';
import {createOffsiteBackupService} from '../server/src/offsiteBackups.js';
import {decryptBundle} from '../server/src/offsiteArchive.js';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {createCalendarRetentionRevoker} from '../server/src/calendarRetentionRevocation.js';
import {eraseTenantPricebookFiles} from '../server/src/billingTenantErasure.js';

// Independent expected inventories are written in FOLLOWUP_EXPECTED.md before
// execution. Exercise the real backup/lifecycle functions, not replacements.
function locks(f){
  const files=[retentionLockFile(f.deployment),...['.offsite','.offsite-continuous']
    .map(name=>path.join(f.deployment.backupPath,name,'run.lock'))];
  for(const file of files)acquireProcessLock(file)();
  return files.map(file=>{
    const stat=fs.statSync(file+'.sqlite');
    assert.equal(stat.mode&0o777,0o600);
    return {file,ino:stat.ino,dev:stat.dev,uid:stat.uid,gid:stat.gid,bytes:fs.readFileSync(file+'.sqlite')};
  });
}
function preserved(records){
  for(const {file,ino,dev,uid,gid,bytes} of records){
    const stat=fs.statSync(file+'.sqlite');
    assert.deepEqual([stat.ino,stat.dev,stat.uid,stat.gid,stat.mode&0o777],[ino,dev,uid,gid,0o600]);
    assert.deepEqual(fs.readFileSync(file+'.sqlite'),bytes);
    const release=acquireProcessLock(file);
    try{assert.throws(()=>acquireProcessLock(file),/OFFSITE_BUSY/);}finally{release();}
  }
}
function bundleInventory(bundle,owners=[A,B]){
  const expected=['off-the-clock.sqlite',...owners.map(owner=>'pricebooks/'+owner+'.json')].sort();
  assert.deepEqual(verifyBackup(bundle).files.map(file=>file.name).sort(),expected);
  const actual=fs.readdirSync(bundle,{recursive:true}).filter(name=>fs.statSync(path.join(bundle,name)).isFile()).sort();
  assert.deepEqual(actual,['manifest.json',...expected].sort(),'Every file is accounted for; no mutex or sidecar is copied');
}
async function offsite(t,f){
  const fake=await fakeS3(t),config={enabled:true,endpoint:fake.endpoint,bucket:'synthetic-bucket',prefix:'synthetic-lock-database',region:'auto',urlStyle:'path',
    key:Buffer.from('45'.repeat(32),'hex'),credentials:{accessKeyId:'SYNTHETIC_ACCESS',secretAccessKey:'SYNTHETIC_SECRET'}};
  const store=createS3BackupStore(config),service=createOffsiteBackupService(f.db,f.deployment,{config,store,now:()=>f.clock().getTime(),warn:()=>{}});
  t.after(()=>service.stop());
  return {fake,config,service};
}
async function uploadedBundles(f,{fake,config},label,owners=[A,B]){
  assert.equal(fake.objects.size,4,'Exactly one daily and one continuous archive, with their receipts');
  const bundles=[];
  for(const kind of ['daily','continuous']){
    const entries=[...fake.objects].filter(([key])=>key.includes('/'+kind+'/')&&key.endsWith('.enc'));
    assert.equal(entries.length,1);
    const [key,object]=entries[0];
    assert.ok(fake.objects.has(key+'.json'));
    const file=path.join(f.root,label+'-'+kind+'.enc'),bundle=path.join(f.root,label+'-'+kind);
    fs.writeFileSync(file,object.bytes);await decryptBundle(file,bundle,config.key);
    bundleInventory(bundle,owners);bundles.push(bundle);
  }
  assert.ok(fake.requests.filter(request=>request.method==='PUT').every(request=>
    /^synthetic-lock-database\/(daily|continuous)\/[^/]+\.enc(?:\.json)?$/.test(request.key)),'No mutex is ever sent as an object');
  return bundles;
}

test('lock database backup: listing excludes retention, daily and continuous mutexes',async t=>{
  const f=retentionFixture(t),records=locks(f);
  assert.deepEqual(listSnapshots(f.deployment.backupPath),[]);
  const bundle=await createSnapshot(f.db,f.deployment);
  assert.deepEqual(listSnapshots(f.deployment.backupPath).map(snapshot=>snapshot.bundle),[bundle]);
  preserved(records);
});

test('lock database backup: pruning removes an expired snapshot but preserves every mutex',async t=>{
  const f=retentionFixture(t),records=locks(f),now=Date.parse('2027-02-18T12:00:00.000Z');
  for(const {file} of records)fs.utimesSync(file+'.sqlite',new Date(0),new Date(0));
  const config={...f.deployment,backupRetentionDays:365};
  const expired=await createSnapshot(f.db,config,{now:()=>now-40*86400000});
  const latest=await createSnapshot(f.db,config,{now:()=>now});
  assert.equal(listSnapshots(config.backupPath).length,2);
  pruneSnapshots(config.backupPath,{retentionDays:30,now});
  assert.equal(fs.existsSync(expired),false);assert.ok(fs.existsSync(latest));
  assert.deepEqual(listSnapshots(config.backupPath).map(snapshot=>snapshot.bundle),[latest]);
  preserved(records);
});

test('lock database backup: snapshot inventory excludes all mutexes and sidecars',async t=>{
  const f=retentionFixture(t),records=locks(f);
  bundleInventory(await createSnapshot(f.db,f.deployment));preserved(records);
});

test('lock database backup: live staging cleanup cannot add a mutex to a published snapshot',async t=>{
  const f=retentionFixture(t);
  const script=`import Database from 'better-sqlite3';import {createSnapshot} from './server/src/backups.js';
    const original=Database.prototype.backup;Database.prototype.backup=async function(file){await original.call(this,file);
      await new Promise(resolve=>{process.once('message',resolve);process.send('WRITTEN');});};
    const db=new Database(process.argv[1]);try{const bundle=await createSnapshot(db,JSON.parse(process.argv[2]));process.send({bundle});}finally{db.close();process.disconnect();}`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,f.db.name,JSON.stringify(f.deployment)],{stdio:['ignore','ignore','pipe','ipc']});
  t.after(()=>child.kill());let error='';child.stderr.on('data',bytes=>{error+=bytes;});
  assert.equal((await once(child,'message'))[0],'WRITTEN');
  await assert.rejects(cleanupAbandonedSnapshots(f.deployment),/OFFSITE_BUSY/);
  const published=once(child,'message'),closed=once(child,'close');child.send('FINISH');
  const [{bundle}]=await published;const [code]=await closed;assert.equal(code,0,error);
  bundleInventory(bundle);
});

test('lock database backup: fake daily and continuous uploads contain no mutex database',async t=>{
  const f=retentionFixture(t),records=locks(f),remote=await offsite(t,f);
  const status=await remote.service.run();assert.equal(status.ok,true);
  await uploadedBundles(f,remote,'uploaded');preserved(records);
});

test('lock database backup: day-90 erasure preserves usable mutexes and the second business',async t=>{
  const f=retentionFixture(t),records=locks(f),beforeB=businessRows(f.db,B),remote=await offsite(t,f);
  await remote.service.run();
  // A successful continuous upload removes its temporary local snapshot.
  // Also seed a retained continuous bundle to exercise that erasure inventory.
  await createSnapshot(f.db,{...f.deployment,backupPath:path.join(f.deployment.backupPath,'.offsite-continuous','snapshots')});
  f.setTime(DEADLINE);
  const lifecycle=createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>true,
    releaseNumber:async()=>({released:true}),revokeCalendar:createCalendarRetentionRevoker({enabled:()=>true,key:KEY,fetchImpl:async()=>({status:200})}),
    erasePricebookFiles:owner=>eraseTenantPricebookFiles(owner,{directory:f.deployment.pricebookPath}),eraseBackupCopies:owner=>remote.service.eraseOwner(owner)});
  await lifecycle.processOwner(A,{localOnly:true});
  assertErased(assert,f.db);assert.deepEqual(businessRows(f.db,B),beforeB);
  assert.ok(f.db.prepare('SELECT dataDeletedAt FROM billingCancellations WHERE ownerId=?').get(A).dataDeletedAt);
  assert.equal(fs.existsSync(path.join(f.deployment.pricebookPath,A+'.json')),false);
  const local=[...listSnapshots(f.deployment.backupPath),...listSnapshots(path.join(f.deployment.backupPath,'.offsite-continuous','snapshots'))];
  assert.ok(local.length>=2);
  const copies=[...local.map(snapshot=>snapshot.bundle),...await uploadedBundles(f,remote,'erased',[B])];
  for(const bundle of copies){
    bundleInventory(bundle,[B]);
    const db=new Database(path.join(bundle,'off-the-clock.sqlite'),{readonly:true});
    try{assertErased(assert,db);assert.deepEqual(businessRows(db,B),beforeB);}finally{db.close();}
  }
  preserved(records);
});
