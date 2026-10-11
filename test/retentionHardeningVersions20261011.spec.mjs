import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {A,B,DEADLINE,KEY,retentionFixture,businessRows,assertErased} from './helpers/tenantRetentionFixture.mjs';
import {fakeS3} from './helpers/offsiteFakeS3.mjs';
import {createS3BackupStore} from '../server/src/offsiteStore.js';
import {createOffsiteBackupService} from '../server/src/offsiteBackups.js';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {createCalendarRetentionRevoker} from '../server/src/calendarRetentionRevocation.js';
import {eraseTenantPricebookFiles} from '../server/src/billingTenantErasure.js';
import {decryptBundle} from '../server/src/offsiteArchive.js';

async function setup(t,mode){
  const f=retentionFixture(t),fake=await fakeS3(t);fake.controls.versioning=mode==='Suspended'?'Enabled':mode;
  const config={enabled:true,endpoint:fake.endpoint,bucket:'synthetic-bucket',prefix:'synthetic-versioned',region:'auto',urlStyle:'path',key:Buffer.from('45'.repeat(32),'hex'),credentials:{accessKeyId:'SYNTHETIC_ACCESS',secretAccessKey:'SYNTHETIC_SECRET'}};
  const store=createS3BackupStore(config),offsite=createOffsiteBackupService(f.db,f.deployment,{config,store,now:()=>f.clock().getTime(),warn:()=>{}});t.after(()=>offsite.stop());
  await offsite.run();fake.controls.versioning=mode;
  const service=createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>true,releaseNumber:async()=>({released:true}),
    revokeCalendar:createCalendarRetentionRevoker({enabled:()=>true,key:KEY,fetchImpl:async()=>({status:200})}),
    erasePricebookFiles:ownerId=>eraseTenantPricebookFiles(ownerId,{directory:f.deployment.pricebookPath}),
    eraseBackupCopies:ownerId=>offsite.eraseOwner(ownerId),cleanupRetryCopies:()=>offsite.cleanupRetryCopies()});
  const row=()=>f.db.prepare('SELECT * FROM billingCancellations WHERE ownerId=?').get(A);
  f.setTime(DEADLINE);return {...f,fake,config,store,offsite,service,row};
}
for(const mode of ['Enabled','Suspended'])for(const kind of ['daily','continuous'])test('retention hardening: '+mode+' '+kind+' erasure removes every historic version and marker',async t=>{
  const f=await setup(t,mode),beforeB=businessRows(f.db,B),billing=f.db.prepare('SELECT * FROM billingAccounts WHERE ownerId=?').get(A);
  const key=[...f.fake.objects.keys()].find(k=>k.includes('/'+kind+'/')&&k.endsWith('.enc'));
  const oldVersion=f.fake.versions.get(key)[0].versionId;
  // A pruned object has no current key, yet every historical copy still needs
  // deletion. Its marker must not hide it from the erasure inventory.
  const pruned=key.replace(kind==='daily'?/\d{4}-\d{2}-\d{2}\.enc$/:/\d{13}-[a-f0-9-]{36}\.enc$/,kind==='daily'?'2026-10-01.enc':'1790000000000-11111111-1111-4111-8111-111111111111.enc');
  const source=path.join(f.root,'SYNTHETIC-source.enc');fs.writeFileSync(source,f.fake.objects.get(key).bytes);
  await f.store.putFile(pruned,source,f.fake.objects.get(key).sha256);await f.store.remove(pruned);
  const unrelated='another-prefix/SYNTHETIC-private-object';await f.store.putRecord(unrelated,{synthetic:'kept'});
  const unrelatedBytes=JSON.stringify(f.fake.versions.get(unrelated));
  await f.service.processOwner(A,{localOnly:true});
  assert.equal(f.row().dataErasureVersion,2);assert.equal(f.service.retentionStatus().ok,true);
  assert.equal(f.fake.versions.get(key).some(v=>v.versionId===oldVersion),false,'A historic version containing erased tenant data survived completion');
  assert.equal((f.fake.versions.get(pruned)||[]).length,0,'An object hidden by a delete marker retained data');
  for(const [objectKey,versions] of f.fake.versions)if(objectKey.startsWith(f.config.prefix+'/')){
    assert.ok(versions.length<=1,objectKey+' retains historical versions');assert.ok(versions.every(v=>!v.deleteMarker));
    if(!objectKey.endsWith('.enc')||!versions.length)continue;
    const file=path.join(f.root,'check-'+objectKey.split('/').slice(-2).join('-')+'-'+versions[0].versionId+'.enc'),bundle=file+'.bundle';fs.writeFileSync(file,versions[0].bytes);
    await decryptBundle(file,bundle,f.config.key);const copy=new Database(path.join(bundle,'off-the-clock.sqlite'),{readonly:true});
    try{assertErased(assert,copy);assert.deepEqual(businessRows(copy,B),beforeB);assert.deepEqual(copy.prepare('SELECT * FROM billingAccounts WHERE ownerId=?').get(A),billing);}finally{copy.close();}
  }
  assert.equal(JSON.stringify(f.fake.versions.get(unrelated)),unrelatedBytes);
  assert.equal(f.offsite.status().versioning.state,mode.toUpperCase());
  const requests=f.fake.requests.length;await f.service.processOwner(A,{localOnly:true});assert.equal(f.fake.requests.length,requests);
});
for(const mode of ['Unsupported','NeverEnabled'])test('retention hardening: '+mode+' versioning permits ordinary off-site erasure',async t=>{
  const f=await setup(t,mode);await f.service.processOwner(A,{localOnly:true});assert.equal(f.row().dataErasureVersion,2);
  assert.equal(f.offsite.status().versioning?.state,mode==='Unsupported'?'UNSUPPORTED':'NEVER_ENABLED');
  assert.ok(f.fake.requests.some(r=>r.query.includes('versioning')));
  assert.equal(f.fake.requests.some(r=>r.query.includes('versions')),false);
});
for(const failure of ['version delete rejected','version delete ignored','versioning access denied'])test('retention hardening: '+failure+' keeps erasure pending and admin unhealthy',async t=>{
  const f=await setup(t,'Enabled'),key=[...f.fake.objects.keys()].find(k=>k.includes('/daily/')&&k.endsWith('.enc'));
  if(failure==='version delete rejected')f.fake.controls.failVersionDeleteKey=key;
  else if(failure==='version delete ignored')f.fake.controls.ignoreVersionDeletes=true;
  else f.fake.controls.versioningError={status:403,code:'AccessDenied'};
  await assert.rejects(f.service.processOwner(A,{localOnly:true}),/OFFSITE_VERSION/);
  assert.equal(f.row().dataDeletedAt,null);assert.equal(f.service.retentionStatus().ok,false);assert.equal(f.offsite.status().ok,false);
  const state=JSON.parse(f.row().retentionStateJson);assert.equal(state.steps.local.status,'DONE');assert.equal(state.steps.backups.status,'PENDING');assert.match(state.steps.backups.outcome,/OFFSITE_VERSION/);
  f.fake.controls.failVersionDeleteKey=null;f.fake.controls.ignoreVersionDeletes=false;f.fake.controls.versioningError=null;
  await f.service.processOwner(A,{localOnly:true});assert.equal(f.row().dataErasureVersion,2);
});
