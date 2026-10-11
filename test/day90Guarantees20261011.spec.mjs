import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import express from 'express';
import jwt from 'jsonwebtoken';
import {A,B,DEADLINE,KEY,retentionFixture,businessRows,tableRows,assertErased} from './helpers/tenantRetentionFixture.mjs';
import {fakeS3} from './helpers/offsiteFakeS3.mjs';
import {createS3BackupStore} from '../server/src/offsiteStore.js';
import {createSnapshot,verifyBackup,restoreBackup} from '../server/src/backups.js';
import {withBackupRetentionLock} from '../server/src/backupRetentionLock.js';
import {createOffsiteBackupService,restoreOffsiteBackup,restoreContinuousBackup,installOffsiteBackupStatusRoute} from '../server/src/offsiteBackups.js';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {createCalendarRetentionRevoker} from '../server/src/calendarRetentionRevocation.js';
import {eraseTenantPricebookFiles} from '../server/src/billingTenantErasure.js';
import {createAuthSessionService} from '../server/src/authSessionService.js';
import {requireAuth} from '../server/src/authMiddleware.js';

const SID='PN'+'a'.repeat(32);
async function setup(t){
  const f=retentionFixture(t),fake=await fakeS3(t);
  f.db.prepare('UPDATE businessProfiles SET twilioNumberSid=? WHERE ownerId=?').run(SID,A);
  const config={enabled:true,endpoint:fake.endpoint,bucket:'synthetic-bucket',prefix:'synthetic-guarantees',region:'auto',urlStyle:'path',
    key:Buffer.from('45'.repeat(32),'hex'),credentials:{accessKeyId:'SYNTHETIC_ACCESS',secretAccessKey:'SYNTHETIC_SECRET'}};
  const store=createS3BackupStore(config),offsite=createOffsiteBackupService(f.db,f.deployment,{config,store,now:()=>f.clock().getTime(),warn:()=>{}});
  t.after(()=>offsite.stop());let failing=false;const calls={google:0,phone:0,backups:0};
  const service=createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>true,
    releaseNumber:async()=>{calls.phone++;if(failing)throw Error('[SYNTHETIC] carrier unavailable');return {released:true};},
    revokeCalendar:createCalendarRetentionRevoker({enabled:()=>true,key:KEY,fetchImpl:async()=>{calls.google++;return {status:failing?503:200};}}),
    erasePricebookFiles:ownerId=>eraseTenantPricebookFiles(ownerId,{directory:f.deployment.pricebookPath}),
    eraseBackupCopies:async ownerId=>{calls.backups++;await offsite.eraseOwner(ownerId);}});
  return {...f,fake,config,store,offsite,service,calls,setFailure:value=>{failing=value;}};
}
function bytesUnder(root){
  if(!fs.existsSync(root))return {};
  const result={};
  function visit(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name);if(entry.isDirectory())visit(file);else result[path.relative(root,file)]=fs.readFileSync(file);
  }}visit(root);return result;
}
function remoteBytes(fake){return Object.fromEntries([...fake.objects].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,Buffer.from(value.bytes)]));}

test('day90 a deployment that never uploaded off-site can complete local-only backup erasure',async t=>{
  const f=retentionFixture(t),offsite=createOffsiteBackupService(f.db,f.deployment,{config:{enabled:false,reason:'OFFSITE_NOT_CONFIGURED'},warn:()=>{}});
  const service=createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>true,releaseNumber:async()=>({released:true}),
    revokeCalendar:createCalendarRetentionRevoker({enabled:()=>true,key:KEY,fetchImpl:async()=>({status:200})}),
    erasePricebookFiles:ownerId=>eraseTenantPricebookFiles(ownerId,{directory:f.deployment.pricebookPath}),eraseBackupCopies:ownerId=>offsite.eraseOwner(ownerId)});
  f.setTime(DEADLINE);await service.processOwner(A,{localOnly:true});assertErased(assert,f.db);
  assert.equal(f.db.prepare('SELECT dataErasureVersion FROM billingCancellations WHERE ownerId=?').get(A).dataErasureVersion,2);
  assert.equal(offsite.status().retention.pendingOwners,0);
});

// Crash leftovers are also copies. Their original verified snapshots/remote
// objects remain available, so abandoned staging bytes can be removed entirely.
test('day90 removes abandoned download, decrypt and restore staging copies',async t=>{
  const f=await setup(t),beforeB=businessRows(f.db,B);await f.offsite.run();
  const local=await createSnapshot(f.db,f.deployment,{now:()=>f.clock().getTime()}),residuals=[];
  for(const stream of ['.offsite','.offsite-continuous']){
    const file=path.join(f.deployment.backupPath,stream,'verify-11111111-1111-4111-8111-111111111111');
    fs.writeFileSync(file,[...f.fake.objects.values()].find(value=>value.bytes.subarray(0,8).toString()==='OTCBK001').bytes);residuals.push(file);
  }
  for(const name of ['.offsite-ABC123','.continuous-ABC123']){
    const stage=path.join(f.root,'restores',name);fs.mkdirSync(stage,{recursive:true});
    fs.cpSync(local,path.join(stage,'bundle'),{recursive:true});fs.writeFileSync(path.join(stage,'bundle.plain'),Buffer.from('[SYNTHETIC] private decrypted '+A));residuals.push(stage);
  }
  const partial=path.join(f.deployment.backupPath,'.partial-snapshot-1795137600000-11111111-1111-4111-8111-111111111111');fs.cpSync(local,partial,{recursive:true});residuals.push(partial);
  f.setTime(DEADLINE);await f.service.processOwner(A,{localOnly:true});
  for(const file of residuals)assert.equal(fs.existsSync(file),false,'Abandoned private copy remains: '+file);
  verifyBackup(local);assert.deepEqual(businessRows(f.db,B),beforeB);
  for(const kind of ['daily','continuous']){
    const key=[...f.fake.objects.keys()].find(key=>key.includes('/'+kind+'/')&&key.endsWith('.enc')),id=key.split('/').at(-1).slice(0,-4),target=path.join(f.root,'restores','intact-'+kind);
    await (kind==='daily'?restoreOffsiteBackup({store:f.store,config:f.config,day:id,target,volume:f.root}):restoreContinuousBackup({store:f.store,config:f.config,checkpoint:id,target,volume:f.root}));
    const copy=new Database(path.join(target,'off-the-clock.sqlite'),{readonly:true});try{assertErased(assert,copy);assert.deepEqual(businessRows(copy,B),beforeB);}finally{copy.close();}
  }
});

for(const kind of ['daily','continuous'])test('day90 serializes erasure with an in-flight '+kind+' restore',async t=>{
  const f=await setup(t);await f.offsite.run();
  const key=[...f.fake.objects.keys()].find(key=>key.includes('/'+kind+'/')&&key.endsWith('.enc')),id=key.split('/').at(-1).slice(0,-4),target=path.join(f.root,'restores','held-'+kind);
  let enter,release;const entered=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{release=resolve;});
  const store={...f.store,record:async key=>{enter();await held;return f.store.record(key);}};
  const restoring=kind==='daily'?restoreOffsiteBackup({store,config:f.config,day:id,target,volume:f.root}):restoreContinuousBackup({store,config:f.config,checkpoint:id,target,volume:f.root});
  await entered;
  try{await assert.rejects(f.offsite.eraseOwner(A),/OFFSITE_BUSY/);}finally{release();await restoring;}
  await f.offsite.eraseOwner(A);
  const copy=new Database(path.join(target,'off-the-clock.sqlite'),{readonly:true});try{assertErased(assert,copy);}finally{copy.close();}
});

for(const storage of ['volume','nested'])test('day90 local restore cannot race a held erasure lock — '+storage,async t=>{
  const f=await setup(t),local=await createSnapshot(f.db,f.deployment);
  const deployment=storage==='volume'?f.deployment:{...f.deployment,root:path.join(f.root,'nested'),backupPath:path.join(f.root,'nested','backups')};
  fs.mkdirSync(deployment.root,{recursive:true});
  await withBackupRetentionLock(deployment,async()=>{
    // A different async context/process must not copy an unredacted snapshot.
    const child=await import('node:child_process');
    const script="import {restoreBackup} from './server/src/backups.js';try{restoreBackup(process.argv[1],process.argv[2],{volume:process.argv[3]});process.exitCode=2;}catch(e){console.log(e.message);process.exitCode=e.message==='OFFSITE_BUSY'?0:3;}";
    const result=child.spawnSync(process.execPath,['--input-type=module','-e',script,local,path.join(f.root,'restores','racing-local'),f.root],{encoding:'utf8',env:process.env});
    assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/OFFSITE_BUSY/);
  });
});

// Independent item-5 oracle: A's private rows/files disappear, its financial
// record survives, and B's rows and exact book bytes survive every restore.
// A second cleanup at a later time must not republish or mutate either tenant.
test('day90 complete cleanup is idempotent across live, local, daily and continuous copies',async t=>{
  const f=await setup(t),beforeB=businessRows(f.db,B),bookB=fs.readFileSync(path.join(f.deployment.pricebookPath,B+'.json'));
  const billingA=f.db.prepare('SELECT * FROM billingAccounts WHERE ownerId=?').get(A);
  await f.offsite.run();const local=await createSnapshot(f.db,f.deployment,{now:()=>f.clock().getTime()});
  f.setTime(DEADLINE);await f.service.processOwner(A,{localOnly:true});
  assertErased(assert,f.db);assert.deepEqual(businessRows(f.db,B),beforeB);
  assert.deepEqual(f.db.prepare('SELECT * FROM billingAccounts WHERE ownerId=?').get(A),billingA);
  const folders=[local];
  for(const kind of ['daily','continuous']){
    const key=[...f.fake.objects.keys()].find(key=>key.includes('/'+kind+'/')&&key.endsWith('.enc'));
    const id=key.split('/').at(-1).slice(0,-4),target=path.join(f.root,'restores',kind);
    await (kind==='daily'?restoreOffsiteBackup({store:f.store,config:f.config,day:id,target,volume:f.root}):restoreContinuousBackup({store:f.store,config:f.config,checkpoint:id,target,volume:f.root}));
    folders.push(target);
  }
  for(const folder of folders){
    if(folder===local)verifyBackup(folder);
    const copy=new Database(path.join(folder,'off-the-clock.sqlite'),{readonly:true});
    try{assertErased(assert,copy);assert.deepEqual(businessRows(copy,B),beforeB);assert.deepEqual(copy.prepare('SELECT * FROM billingAccounts WHERE ownerId=?').get(A),billingA);}finally{copy.close();}
    assert.deepEqual(fs.readFileSync(path.join(folder,'pricebooks',B+'.json')),bookB);
    assert.equal(fs.existsSync(path.join(folder,'pricebooks',A+'.json')),false);
  }
  const rows=tableRows(f.db),localBytes=bytesUnder(f.deployment.backupPath),remote=remoteBytes(f.fake),calls={...f.calls};
  f.setTime(Date.parse(DEADLINE)+86400000);await f.service.processOwner(A,{localOnly:true});
  assert.deepEqual(tableRows(f.db),rows);assert.deepEqual(bytesUnder(f.deployment.backupPath),localBytes);assert.deepEqual(remoteBytes(f.fake),remote);assert.deepEqual(f.calls,calls);
  assert.deepEqual(fs.readFileSync(path.join(f.deployment.pricebookPath,B+'.json')),bookB);
});

test('day90 snapshots and both remote backup streams exclude bounded provider retry secrets',async t=>{
  const f=await setup(t),beforeB=businessRows(f.db,B);f.setFailure(true);f.setTime(DEADLINE);
  await f.service.processOwner(A,{localOnly:true});
  const secrets=f.db.prepare('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(A);assert.ok(secrets.credentialsCiphertext);assert.equal(secrets.phoneNumberSid,SID);
  const local=await createSnapshot(f.db,f.deployment,{now:()=>f.clock().getTime()});await f.offsite.run();const folders=[local];
  for(const kind of ['daily','continuous']){
    const key=[...f.fake.objects.keys()].find(key=>key.includes('/'+kind+'/')&&key.endsWith('.enc'));
    const id=key.split('/').at(-1).slice(0,-4),target=path.join(f.root,'restores','retry-'+kind);
    await (kind==='daily'?restoreOffsiteBackup({store:f.store,config:f.config,day:id,target,volume:f.root}):restoreContinuousBackup({store:f.store,config:f.config,checkpoint:id,target,volume:f.root}));folders.push(target);
  }
  for(const folder of folders){
    const file=path.join(folder,'off-the-clock.sqlite'),copy=new Database(file,{readonly:true});
    try{assertErased(assert,copy);assert.deepEqual(businessRows(copy,B),beforeB);assert.equal(copy.prepare('SELECT COUNT(*) n FROM billingRetentionSecrets').get().n,0);}finally{copy.close();}
    const bytes=fs.readFileSync(file);assert.ok(!bytes.includes(Buffer.from(secrets.credentialsCiphertext)));assert.ok(!bytes.includes(Buffer.from(SID)));
  }
  assert.deepEqual(f.db.prepare('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(A),secrets,'Snapshot sanitization must not discard the live retry material');
});

for(const outcome of ['recovered','permanent'])test('day90 admin health is authenticated and secret-free — '+outcome,async t=>{
  const f=await setup(t);f.setFailure(true);f.setTime(DEADLINE);await f.service.processOwner(A,{localOnly:true});
  const environment={JWT_SECRET:'[SYNTHETIC] retention secret',ADMIN_EMAIL:'SYNTHETIC-admin@example.invalid',ADMIN_PASSWORD_HASH:'SYNTHETIC-admin-hash'};
  const sessions=createAuthSessionService(f.db,{environment,clock:f.clock});
  const adminCredentials=()=>sessions.create({id:'admin',role:'admin',email:environment.ADMIN_EMAIL,passwordHash:environment.ADMIN_PASSWORD_HASH});
  let admin=adminCredentials();
  const app=express();installOffsiteBackupStatusRoute(app,{service:{status:()=>({ok:true,configured:true})},retentionStatus:f.service.retentionStatus,
    requireAuth:roles=>requireAuth(roles,{database:f.db,sessionService:sessions,verifyToken:token=>jwt.verify(token,environment.JWT_SECRET,{algorithms:['HS256'],clockTimestamp:f.clock().getTime()/1000})})});
  const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  t.after(()=>new Promise(resolve=>server.close(resolve)));const url='http://127.0.0.1:'+server.address().port+'/api/admin/backups/offsite';
  const get=token=>fetch(url,{headers:token?{authorization:'Bearer '+token}:{}});
  assert.equal((await get()).status,401);
  for(const id of [B,B+'-staff-active'])assert.equal((await get(f.credentials[id].token)).status,403);
  assert.equal((await get(f.credentials[A].token)).status,401);
  let response=await get(admin.token);assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
  let body=await response.json();assert.equal(body.erasure.pendingOwners,1);assert.equal(body.erasure.permanentFailures.length,0);
  const serialized=JSON.stringify(body);for(const forbidden of [SID,'credentialsCiphertext','refreshToken','accessToken',A+'@example.invalid'])assert.ok(!serialized.includes(forbidden));
  let alert=f.db.prepare("SELECT * FROM voicePlatformAlerts WHERE eventKey='retention'").get();assert.equal(alert.code,'TENANT_ERASURE_ACTION_REQUIRED');assert.equal(alert.resolvedAt,null);assert.ok(!alert.detailsJson.includes(A));
  if(outcome==='recovered'){
    f.setFailure(false);await f.service.processOwner(A,{localOnly:true});
    response=await get(admin.token);assert.equal(response.status,200);body=await response.json();assert.equal(body.erasure.ok,true);
    alert=f.db.prepare("SELECT * FROM voicePlatformAlerts WHERE eventKey='retention'").get();assert.equal(alert.resolvedAt,DEADLINE);
  }else{
    f.setTime(Date.parse(DEADLINE)+30*86400000);await f.service.processOwner(A,{localOnly:true});admin=adminCredentials();
    response=await get(admin.token);assert.equal(response.status,503);body=await response.json();assert.equal(body.erasure.permanentFailures.length,2);
    for(const failure of body.erasure.permanentFailures)assert.equal(failure.failedAt,f.clock().toISOString());
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM billingRetentionSecrets WHERE ownerId=?').get(A).n,0);
    alert=f.db.prepare("SELECT * FROM voicePlatformAlerts WHERE eventKey='retention'").get();assert.equal(alert.resolvedAt,null);assert.equal(JSON.parse(alert.detailsJson).permanentFailures,2);
  }
});
