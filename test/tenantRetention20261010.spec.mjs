import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {A,B,END,DEADLINE,START,KEY,hash,retentionFixture,businessRows,assertErased} from './helpers/tenantRetentionFixture.mjs';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {eraseTenantPricebookFiles} from '../server/src/billingTenantErasure.js';
import {createCalendarRetentionRevoker} from '../server/src/calendarRetentionRevocation.js';
import {createSnapshot,verifyBackup} from '../server/src/backups.js';
import {createOffsiteBackupService,restoreOffsiteBackup,restoreContinuousBackup} from '../server/src/offsiteBackups.js';
import {createS3BackupStore} from '../server/src/offsiteStore.js';
import {fakeS3} from './helpers/offsiteFakeS3.mjs';

// Handwritten oracle before execution: END + 90*24 hours = February 18, 2027,
// 12:00 UTC. One millisecond earlier, BOTH businesses retain their data, files,
// logins and Google tokens. At the boundary A has zero nonbilling rows, zero
// staff users/auth secrets/pricebook files; B's rows and bytes are identical.
// Google is attempted while its encrypted token still exists; HTTP 200, HTTP
// 400, rejection and timeout all permit local deletion. Only the outcome/time
// survive. Repeating cleanup changes no B data and never sends a second revoke.
// No invoice arithmetic or prices change. Saved shared backups must restore B
// unchanged and A as a disabled billing tombstone; failed replacement retries
// retain a durable CLEAN recovery copy, then converge without data loss.
function lifecycle(f,options={}){
  return createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>false,
    erasePricebookFiles:ownerId=>eraseTenantPricebookFiles(ownerId,{directory:f.deployment.pricebookPath}),...options});
}
for(const outcome of ['success','http-error','network-error','timeout'])test('day-90 complete tenant inventory, Google '+outcome,async t=>{
  const f=retentionFixture(t),beforeB=businessRows(f.db,B),bookB=fs.readFileSync(path.join(f.deployment.pricebookPath,B+'.json'));
  const ownedTmp=path.join(f.deployment.pricebookPath,A+'.11111111-1111-4111-8111-111111111111.tmp');fs.writeFileSync(ownedTmp,A);
  fs.writeFileSync(path.join(f.deployment.pricebookPath,A+'.unconfirmed'),A);
  const locks=f.deployment.pricebookPath+'.saves';fs.mkdirSync(locks);
  const mutex=new Database(path.join(locks,hash(A)+'.sqlite'));mutex.close();
  fs.writeFileSync(path.join(locks,hash(B)+'.sqlite'),'[SYNTHETIC] untouched B mutex');
  let attempts=0;
  const revoker=createCalendarRetentionRevoker({enabled:()=>true,key:KEY,timeoutMs:20,fetchImpl:async(url,options)=>{
    attempts++;assert.equal(url,'https://oauth2.googleapis.com/revoke');assert.equal(options.method,'POST');
    assert.equal(new URLSearchParams(options.body).get('token'),'[SYNTHETIC] refresh '+A);
    assert.ok(f.db.prepare('SELECT credentialsCiphertext FROM calendarConnections WHERE ownerId=?').get(A));
    const cancellation=f.db.prepare('SELECT * FROM billingCancellations WHERE ownerId=?').get(A);
    assert.equal(cancellation.calendarRevokeStatus,'ATTEMPTING');assert.equal(cancellation.calendarRevokeAttemptedAt,DEADLINE);
    if(outcome==='network-error')throw Error('[SYNTHETIC] rejected');
    if(outcome==='timeout')return new Promise(()=>{});
    return {status:outcome==='success'?200:400};
  }});
  const service=lifecycle(f,{revokeCalendar:revoker});
  await service.processOwner(A,{localOnly:true});assert.equal(attempts,0);
  assert.ok(f.db.prepare('SELECT * FROM businessProfiles WHERE ownerId=?').get(A));assert.ok(fs.existsSync(ownedTmp));
  // Sessions are created immediately before the deadline, so rejection below
  // proves erasure, not their normal eight-hour expiration.
  f.setTime(DEADLINE);await service.processOwner(A,{localOnly:true});await service.processOwner(A,{localOnly:true});
  assertErased(assert,f.db);assert.deepEqual(businessRows(f.db,B),beforeB);assert.equal(attempts,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM authTokens WHERE userId LIKE ?').get(A+'%').n,0);
  const sid='CA'+hash(A).slice(0,32);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM voiceToolIdempotencyReceipts WHERE scopeHash=?').get(hash(A+'\0'+sid)).n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM voiceModelFailures WHERE callKey=?').get(hash(sid)).n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM authRefreshTokens').get().n,2);
  const cancellation=f.db.prepare('SELECT * FROM billingCancellations WHERE ownerId=?').get(A);
  assert.equal(cancellation.dataDeletedAt,DEADLINE);assert.equal(cancellation.calendarRevokeStatus,outcome==='success'?'REVOKED':outcome==='timeout'?'TIMEOUT':'FAILED');
  for(const name of fs.readdirSync(f.deployment.pricebookPath))assert.ok(!name.startsWith(A+'.'));
  assert.deepEqual(fs.readFileSync(path.join(f.deployment.pricebookPath,B+'.json')),bookB);
  assert.deepEqual(fs.readdirSync(locks),[hash(B)+'.sqlite']);
  for(const id of [A,A+'-staff-active']){
    assert.throws(()=>f.sessions.refresh(f.credentials[id].refreshToken),{code:'SESSION_INVALID'});
    assert.throws(()=>f.sessions.create({id,role:id===A?'owner':'staff',email:id+'@example.invalid',passwordHash:'SYNTHETIC-HASH'}),{code:'SESSION_INVALID'});
  }
  assert.ok(f.sessions.refresh(f.credentials[B].refreshToken).token);
  await assert.rejects(service.reactivate(A),{code:'BILLING_NEW_ACCOUNT_REQUIRED'});
  assert.throws(()=>f.db.prepare('INSERT INTO widgetSettings(ownerId,updatedAt) VALUES(?,?)').run(A,START),/ACCOUNT_ERASED/);
  assert.throws(()=>f.db.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,role,createdAt) VALUES('late',?,'late@example.invalid','hash','','','staff',?)").run(A,START),/ACCOUNT_ERASED/);
  f.db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,role,createdAt) VALUES('SYNTHETIC-fresh',?,'new-hash','New','New','owner',?)").run(A+'@example.invalid',DEADLINE);
  assert.equal(f.db.prepare('SELECT id FROM users WHERE email=?').get(A+'@example.invalid').id,'SYNTHETIC-fresh');
  assert.match(f.db.prepare("SELECT message FROM billingLifecycleNotices WHERE ownerId=? AND kind='service_ended'").get(A).message,/Turn off any forwarding/);
});
test('filesystem failure disables sign-in immediately and retries completion after restart',async t=>{
  const f=retentionFixture(t);f.setTime(DEADLINE);let calls=0;
  const service=lifecycle(f,{erasePricebookFiles:()=>{calls++;throw Error('[SYNTHETIC] disk unavailable');}});
  await assert.rejects(service.processOwner(A,{localOnly:true}),/disk unavailable/);
  assert.equal(calls,1);assertErased(assert,f.db);
  assert.equal(f.db.prepare('SELECT dataDeletedAt FROM billingCancellations WHERE ownerId=?').get(A).dataDeletedAt,null);
  await lifecycle(f).processOwner(A,{localOnly:true});
  assert.equal(f.db.prepare('SELECT dataDeletedAt FROM billingCancellations WHERE ownerId=?').get(A).dataDeletedAt,DEADLINE);
  assert.ok(!fs.existsSync(path.join(f.deployment.pricebookPath,A+'.json')));
});
test('local, daily and continuous backups erase A while preserving B; failed remote replacement retries',async t=>{
  const f=retentionFixture(t),fake=await fakeS3(t),config={enabled:true,endpoint:fake.endpoint,bucket:'synthetic-bucket',prefix:'synthetic-retention',region:'auto',urlStyle:'path',key:Buffer.from('45'.repeat(32),'hex'),credentials:{accessKeyId:'SYNTHETIC_ACCESS',secretAccessKey:'SYNTHETIC_SECRET'}};
  const beforeB=businessRows(f.db,B),bookB=fs.readFileSync(path.join(f.deployment.pricebookPath,B+'.json'));
  const store=createS3BackupStore(config),offsite=createOffsiteBackupService(f.db,f.deployment,{config,store,now:()=>f.clock().getTime(),warn:()=>{}});
  t.after(()=>offsite.stop());
  await offsite.run();const local=await createSnapshot(f.db,f.deployment,{now:()=>f.clock().getTime()});
  const dailyKey=[...fake.objects.keys()].find(key=>key.includes('/daily/')&&key.endsWith('.enc'));
  const checkpoint=[...fake.objects.keys()].find(key=>key.includes('/continuous/')&&key.endsWith('.enc')).split('/').at(-1).slice(0,-4);
  // Handwritten expectation: even an uploaded archive whose publication marker
  // was lost must be redacted and remain recoverable for the second business.
  await store.remove(config.prefix+'/continuous/'+checkpoint+'.enc.json');
  fake.controls.failDeleteKey=dailyKey;f.setTime(DEADLINE);
  const service=lifecycle(f,{eraseBackupCopies:ownerId=>offsite.eraseOwner(ownerId)});
  await assert.rejects(service.processOwner(A,{localOnly:true}));assertErased(assert,f.db);
  assert.equal(f.db.prepare('SELECT dataDeletedAt FROM billingCancellations WHERE ownerId=?').get(A).dataDeletedAt,null);
  assert.ok(fs.existsSync(path.join(f.deployment.backupPath,'.retention',hash(A))));
  fake.controls.failDeleteKey=null;
  await service.processOwner(A,{localOnly:true});verifyBackup(local);
  assert.equal(f.db.prepare('SELECT dataDeletedAt FROM billingCancellations WHERE ownerId=?').get(A).dataDeletedAt,DEADLINE);
  const day=new Date(Date.parse(DEADLINE)-1).toISOString().slice(0,10);
  const daily=path.join(f.root,'restores','daily'),continuous=path.join(f.root,'restores','continuous');
  await restoreOffsiteBackup({store,config,day,target:daily,volume:f.root});
  await restoreContinuousBackup({store,config,checkpoint,target:continuous,volume:f.root});
  for(const folder of [local,daily,continuous]){
    const copy=new Database(path.join(folder,'off-the-clock.sqlite'),{readonly:true});
    try{assertErased(assert,copy);assert.deepEqual(businessRows(copy,B),beforeB);}finally{copy.close();}
    assert.ok(!fs.existsSync(path.join(folder,'pricebooks',A+'.json')));
    assert.deepEqual(fs.readFileSync(path.join(folder,'pricebooks',B+'.json')),bookB);
  }
  assert.deepEqual(businessRows(f.db,B),beforeB);
});
test('unpublished encrypted retries are redacted before backup workers resume',async t=>{
  // Expected before execution: both initial uploads fail; local pending copies
  // exist. Erasure removes A from those copies and updates their checksum, then
  // the same worker instances publish restorable copies preserving all B rows.
  const f=retentionFixture(t),fake=await fakeS3(t),config={enabled:true,endpoint:fake.endpoint,bucket:'synthetic-bucket',prefix:'synthetic-pending',region:'auto',key:Buffer.from('45'.repeat(32),'hex'),credentials:{accessKeyId:'SYNTHETIC_ACCESS',secretAccessKey:'SYNTHETIC_SECRET'}};
  const beforeB=businessRows(f.db,B),store=createS3BackupStore(config);
  const offsite=createOffsiteBackupService(f.db,f.deployment,{config,store,now:()=>f.clock().getTime(),warn:()=>{}});t.after(()=>offsite.stop());
  fake.controls.failDataPuts=100;await assert.rejects(offsite.run());
  for(const directory of ['.offsite','.offsite-continuous'])assert.ok(fs.existsSync(path.join(f.deployment.backupPath,directory,'pending.enc')));
  f.setTime(DEADLINE);await lifecycle(f,{eraseBackupCopies:ownerId=>offsite.eraseOwner(ownerId)}).processOwner(A,{localOnly:true});
  fake.controls.failDataPuts=0;await offsite.run();
  const day=new Date(Date.parse(DEADLINE)-1).toISOString().slice(0,10),target=path.join(f.root,'restores','pending');
  await restoreOffsiteBackup({store,config,day,target,volume:f.root});
  const restored=new Database(path.join(target,'off-the-clock.sqlite'),{readonly:true});
  try{assertErased(assert,restored);assert.deepEqual(businessRows(restored,B),beforeB);}finally{restored.close();}
});
