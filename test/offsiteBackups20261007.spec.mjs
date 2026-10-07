import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import Database from 'better-sqlite3';
import express from 'express';
import {requireAuth} from '../server/src/authMiddleware.js';
import {createAuthSessionService,installAuthSessionSchema} from '../server/src/authSessionService.js';
import {createSnapshot} from '../server/src/backups.js';
import {createOffsiteBackupService,restoreOffsiteBackup,pruneOffsiteBackups,installOffsiteBackupStatusRoute} from '../server/src/offsiteBackups.js';
import {createS3BackupStore,readOffsiteConfig} from '../server/src/offsiteStore.js';
import {encryptBundle,decryptBundle} from '../server/src/offsiteArchive.js';
import {fakeS3} from './helpers/offsiteFakeS3.mjs';
import {productionEnv} from './helpers/railwayEnv.mjs';

const AT=Date.parse('2026-10-07T04:00:00Z'),DAY='2026-10-07';
async function fixture(t) {
  const fake=await fakeS3(t),root=fs.mkdtempSync(path.join(os.tmpdir(),'otc-offsite-SYNTHETIC-'));
  const env={OFFSITE_BACKUP_ENDPOINT:fake.endpoint,OFFSITE_BACKUP_BUCKET:'synthetic-bucket',OFFSITE_BACKUP_ACCESS_KEY_ID:'SYNTHETIC_ACCESS',OFFSITE_BACKUP_SECRET_ACCESS_KEY:'SYNTHETIC_SECRET',OFFSITE_BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('hex'),OFFSITE_BACKUP_PREFIX:'synthetic-environment'};
  const config=readOffsiteConfig(env),store=createS3BackupStore(config);
  const deployment={production:true,volume:root,root,backupPath:path.join(root,'backups'),pricebookPath:path.join(root,'pricebooks'),backupRetentionDays:30};
  fs.mkdirSync(deployment.pricebookPath);fs.mkdirSync(deployment.backupPath);
  const db=new Database(path.join(root,'off-the-clock.sqlite'));db.pragma('journal_mode=WAL');
  db.exec('CREATE TABLE leads(id TEXT PRIMARY KEY, ownerId TEXT, note TEXT);CREATE TABLE priceBookCreationRecords(ownerId TEXT PRIMARY KEY, createdAt TEXT, updatedAt TEXT)');
  for(const owner of ['synthetic-a','synthetic-b']) {
    db.prepare('INSERT INTO leads VALUES(?,?,?)').run('lead-'+owner,owner,'[SYNTHETIC] caller words '+owner);
    db.prepare('INSERT INTO priceBookCreationRecords VALUES(?,?,?)').run(owner,DAY,DAY);
    fs.writeFileSync(path.join(deployment.pricebookPath,owner+'.json'),JSON.stringify({ownerId:owner,services:[],marker:'[SYNTHETIC] '+owner})+'\n');
  }
  fs.writeFileSync(path.join(root,'.env'),'SYNTHETIC_ENV_SECRET_DO_NOT_UPLOAD');
  t.after(()=>{store.close();if(db.open)db.close();fs.rmSync(root,{recursive:true,force:true});});
  const warnings=[];let clock=AT;
  const service=()=>createOffsiteBackupService(db,deployment,{config,store,now:()=>clock,warn:msg=>warnings.push(msg)});
  return {fake,root,env,config,store,deployment,db,warnings,service,setClock:value=>{clock=value;}};
}
const key=day=>'synthetic-environment/daily/'+day+'.enc';
const target=root=>path.join(root,'restores','synthetic-drill');
async function cli(args,env) {
  const clean={...process.env,...env,RAILWAY_ENVIRONMENT_ID:'',DATABASE_PATH:'',PRICEBOOK_PATH:'',NODE_TEST_CONTEXT:undefined};delete clean.NODE_TEST_CONTEXT;delete clean.DEMO_TRUSTED_PROXY_HOPS;
  const child=spawn(process.execPath,['server/scripts/restore-offsite.js',...args],{cwd:process.cwd(),env:clean,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});const [code]=await once(child,'exit');return {code,stdout,stderr};
}
test('full encrypted fake-S3 round trip through actual restore CLI after total synthetic volume loss',async t=>{
  const f=await fixture(t),s=f.service(),rows=f.db.prepare('SELECT * FROM leads ORDER BY id').all(),books={};
  for(const owner of ['synthetic-a','synthetic-b'])books[owner]=fs.readFileSync(path.join(f.deployment.pricebookPath,owner+'.json'));
  await s.run();assert.equal(s.status().ok,true);assert.equal(f.fake.objects.size,2);
  const ciphertext=f.fake.objects.get(key(DAY)).bytes;
  for(const forbidden of ['SQLite format','SYNTHETIC_ENV_SECRET','caller words','synthetic-a'])assert.equal(ciphertext.includes(Buffer.from(forbidden)),false);
  const record=JSON.parse(f.fake.objects.get(key(DAY)+'.json').bytes);assert.match(record.sha256,/^[a-f0-9]{64}$/);
  f.db.close();fs.rmSync(f.root,{recursive:true});assert.equal(fs.existsSync(f.root),false);fs.mkdirSync(f.root);
  const run=await cli(['--day',DAY,'--target',target(f.root)],productionEnv(f.root,f.env));assert.equal(run.code,0,run.stderr);
  const restored=new Database(path.join(target(f.root),'off-the-clock.sqlite'),{readonly:true});assert.deepEqual(restored.prepare('SELECT * FROM leads ORDER BY id').all(),rows);restored.close();
  for(const [owner,bytes] of Object.entries(books))assert.deepEqual(fs.readFileSync(path.join(target(f.root),'pricebooks',owner+'.json')),bytes);
  assert.equal(fs.existsSync(path.join(target(f.root),'.env')),false);
  const rerun=await cli(['--day',DAY,'--target',target(f.root)],productionEnv(f.root,f.env));assert.equal(rerun.code,1);assert.deepEqual(fs.readFileSync(path.join(target(f.root),'pricebooks/synthetic-a.json')),books['synthetic-a']);
});
test('wrong encryption key fails cleanly through CLI without publishing or overwriting data',async t=>{
  const f=await fixture(t);await f.service().run();
  const run=await cli(['--day',DAY,'--target',target(f.root)],productionEnv(f.root,{...f.env,OFFSITE_BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('hex')}));
  assert.equal(run.code,1);assert.match(run.stderr,/OFFSITE_DECRYPTION_FAILED/);assert.equal(fs.existsSync(target(f.root)),false);assert.equal(f.db.prepare('SELECT count(*) n FROM leads').get().n,2);
});
test('corrupted ciphertext is rejected by checksum before decryption and leaves no plaintext',async t=>{
  const f=await fixture(t);await f.service().run();f.fake.objects.get(key(DAY)).bytes[40]^=1;
  await assert.rejects(()=>restoreOffsiteBackup({store:f.store,config:f.config,day:DAY,target:target(f.root),volume:f.root}),/OFFSITE_CHECKSUM_MISMATCH/);
  assert.equal(fs.existsSync(target(f.root)),false);assert.deepEqual(fs.readdirSync(path.join(f.root,'restores')),[]);
});
test('authenticated encryption rejects corruption even if the stored external checksum is replaced',async t=>{
  const f=await fixture(t),bundle=await createSnapshot(f.db,f.deployment),file=path.join(f.root,'sealed');await encryptBundle(bundle,file,f.config.key);
  const bytes=fs.readFileSync(file);bytes[40]^=1;fs.writeFileSync(file,bytes);
  const out=path.join(f.root,'opened');await assert.rejects(()=>decryptBundle(file,out,f.config.key),/DECRYPTION_FAILED/);assert.equal(fs.existsSync(out),false);assert.equal(fs.existsSync(out+'.plain'),false);
});
test('one completed backup per UTC day; concurrent calls and same-day restart do not upload duplicates',async t=>{
  const f=await fixture(t),s=f.service();await Promise.all([s.run(),s.run(),s.run()]);await s.run();await f.service().run();
  assert.equal(f.fake.requests.filter(r=>r.method==='PUT').length,2);
  f.setClock(AT+86400000);await f.service().run();assert.equal(f.fake.objects.size,4);
});
test('provider failures are durable and operator-visible; retry and restart reuse identical ciphertext',async t=>{
  const f=await fixture(t);f.fake.controls.failDataPuts=10;const s=f.service();await assert.rejects(()=>s.run(),/OFFSITE_UPLOAD_FAILED/);
  assert.equal(s.status().ok,false);assert.equal(s.status().state,'FAILED');assert.ok(s.status().nextRetryAt);assert.equal(s.status().pendingDay,DAY);
  const statePath=path.join(f.deployment.backupPath,'.offsite','state.json'),before=JSON.parse(fs.readFileSync(statePath)),cipher=fs.readFileSync(path.join(f.deployment.backupPath,'.offsite','pending.enc'));
  const resumed=f.service();assert.equal(resumed.status().state,'FAILED');f.fake.controls.failDataPuts=0;await resumed.run();
  assert.deepEqual(f.fake.objects.get(key(DAY)).bytes,cipher);assert.equal(JSON.parse(f.fake.objects.get(key(DAY)+'.json').bytes).sha256,before.pending.sha256);assert.equal(resumed.status().ok,true);
  for(const secret of [f.env.OFFSITE_BACKUP_SECRET_ACCESS_KEY,f.env.OFFSITE_BACKUP_ENCRYPTION_KEY,'caller words'])assert.equal(JSON.stringify(resumed.status()).includes(secret)||f.warnings.join('').includes(secret),false);
});
test('lost upload response is retried without overwriting an accepted encrypted object',async t=>{
  const f=await fixture(t),s=f.service();f.fake.controls.loseResponse=true;await assert.rejects(()=>s.run());const accepted=Buffer.from(f.fake.objects.get(key(DAY)).bytes);
  await f.service().run();assert.deepEqual(f.fake.objects.get(key(DAY)).bytes,accepted);assert.equal(f.fake.objects.size,2);
});
test('restored volume with no local upload state recognizes the existing completed daily backup',async t=>{
  const f=await fixture(t);await f.service().run();fs.rmSync(path.join(f.deployment.backupPath,'.offsite'),{recursive:true});await f.service().run();assert.equal(f.fake.requests.filter(r=>r.method==='PUT').length,2);
});
test('retention keeps exactly thirty daily backups, paginates, and preserves unrelated objects',async t=>{
  const f=await fixture(t),s=f.service();
  f.fake.objects.set('unrelated/keep.enc',{bytes:Buffer.from('keep')});
  for(let i=0;i<33;i++){f.setClock(AT+i*86400000);await s.run();}
  assert.equal([...f.fake.objects.keys()].filter(k=>k.startsWith('synthetic-environment/')).length,60);
  assert.equal(f.fake.objects.has(key(DAY)),false);assert.equal(f.fake.objects.get('unrelated/keep.enc').bytes.toString(),'keep');
  assert.equal(f.fake.objects.has(key('2026-10-10')),true);
});
test('incomplete or missing encrypted copies never count toward the thirty retained backups',async t=>{
  const f=await fixture(t),s=f.service();for(let i=0;i<30;i++){f.setClock(AT+i*86400000);await s.run();}
  f.fake.objects.delete(key('2026-10-20'));await pruneOffsiteBackups(f.store,f.config);assert.equal(f.fake.objects.has(key(DAY)),true);
});
test('failed uploads cannot prune accepted backups',async t=>{
  const f=await fixture(t),s=f.service();await s.run();const prior=Buffer.from(f.fake.objects.get(key(DAY)).bytes);
  f.setClock(AT+35*86400000);f.fake.controls.failDataPuts=10;await assert.rejects(()=>s.run());assert.deepEqual(f.fake.objects.get(key(DAY)).bytes,prior);assert.equal(f.fake.requests.filter(r=>r.method==='DELETE').length,0);
});
test('missing and invalid production config warn clearly and never expose credentials',()=>{
  const warnings=[],none=createOffsiteBackupService(null,{production:true},{env:{},warn:msg=>warnings.push(msg)});assert.equal(none.status().ok,false);assert.match(warnings[0],/WARNING.*NOT configured/);assert.match(warnings[0],/OFFSITE_BACKUP_ENDPOINT/);
  assert.equal(readOffsiteConfig({OFFSITE_BACKUP_ENDPOINT:'http://unsafe.invalid'}).enabled,false);
});
test('strict configuration accepts canonical keys and rejects malformed key, insecure remote endpoint and unsafe prefix',async t=>{
  const f=await fixture(t);assert.equal(readOffsiteConfig({...f.env,OFFSITE_BACKUP_ENCRYPTION_KEY:f.config.key.toString('base64')}).enabled,true);
  for(const patch of [{OFFSITE_BACKUP_ENCRYPTION_KEY:'garbage'},{OFFSITE_BACKUP_ENDPOINT:'http://remote.invalid'},{OFFSITE_BACKUP_ENDPOINT:'https://user:secret@remote.invalid'},{OFFSITE_BACKUP_PREFIX:'../escape'},{OFFSITE_BACKUP_PREFIX:'other//environment'}])assert.equal(readOffsiteConfig({...f.env,...patch}).reason,'OFFSITE_CONFIG_INVALID');
});
test('scheduler stops without overlapping and waits for active upload',async t=>{
  const f=await fixture(t);let entered,release,count=0;const started=new Promise(r=>{entered=r;});
  const service=createOffsiteBackupService(f.db,f.deployment,{config:f.config,store:f.store,now:()=>AT,pollMs:10,takeSnapshot:async()=>{count++;entered();await new Promise(r=>{release=r;});return createSnapshot(f.db,f.deployment);},warn:()=>{}});
  const hold=setInterval(()=>{},1000);t.after(()=>clearInterval(hold));service.start();service.start();await started;let stopped=false;const stop=service.stop().then(()=>{stopped=true;});await new Promise(r=>setTimeout(r,25));assert.equal(stopped,false);assert.equal(count,1);release();await stop;await assert.rejects(()=>service.run(),/STOPPED/);assert.equal(count,1);
});
test('operator HTTP status requires actual database-backed admin authorization and exposes durable failure only',async t=>{
  const f=await fixture(t),warnings=[];process.env.JWT_SECRET=randomBytes(48).toString('hex');
  const environment={JWT_SECRET:process.env.JWT_SECRET,ADMIN_EMAIL:'synthetic-admin@example.invalid',ADMIN_PASSWORD_HASH:'synthetic-password-hash'};
  f.db.exec('CREATE TABLE users(id TEXT PRIMARY KEY, role TEXT, ownerId TEXT, email TEXT, passwordHash TEXT)');
  installAuthSessionSchema(f.db);
  for(const role of ['owner','staff'])f.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('synthetic-'+role,role,role==='staff'?'synthetic-owner':null,'synthetic-'+role+'@example.invalid','synthetic-password-hash');
  const sessions=createAuthSessionService(f.db,{environment});
  const service=f.service();f.fake.controls.failDataPuts=10;await assert.rejects(()=>service.run());
  const app=express();installOffsiteBackupStatusRoute(app,{service,requireAuth:roles=>requireAuth(roles,{database:f.db,sessionService:sessions})});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));const url='http://127.0.0.1:'+server.address().port+'/api/admin/backups/offsite';
  assert.equal((await fetch(url)).status,401);
  for(const role of ['owner','staff','admin']) {
    const user=role==='admin'?{id:'admin',role,email:environment.ADMIN_EMAIL,passwordHash:environment.ADMIN_PASSWORD_HASH}:f.db.prepare('SELECT * FROM users WHERE id=?').get('synthetic-'+role);
    const token=sessions.create(user).token,response=await fetch(url,{headers:{authorization:'Bearer '+token}});
    assert.equal(response.status,role==='admin'?503:403);if(role==='admin'){const status=await response.json();assert.equal(status.state,'FAILED');assert.equal(status.error,'OFFSITE_UPLOAD_FAILED');assert.equal(response.headers.get('cache-control'),'no-store');}
  }
});

test('upload retry delays are bounded and persisted without exposing provider errors',async t=>{
  const f=await fixture(t),s=f.service();f.fake.controls.failDataPuts=100;
  for(let attempt=1;attempt<=6;attempt++){
    await assert.rejects(()=>s.run(),/OFFSITE_UPLOAD_FAILED/);
    assert.equal(Date.parse(s.status().nextRetryAt)-AT,Math.min(1800000,60000*2**(attempt-1)));
    assert.equal(s.status().consecutiveFailures,attempt);
  }
  assert.ok(f.fake.requests.filter(r=>r.method==='PUT').length<=18);
});
test('interrupted pruning is discoverable and finishes safely on restart',async t=>{
  const f=await fixture(t),s=f.service();for(let i=0;i<30;i++){f.setClock(AT+i*86400000);await s.run();}
  f.fake.controls.failDeleteKey=key(DAY)+'.json';f.setClock(AT+30*86400000);await assert.rejects(()=>s.run());
  assert.equal(s.status().state,'FAILED');assert.equal(f.fake.objects.has(key(DAY)),false);assert.equal(f.fake.objects.has(key(DAY)+'.json'),true);
  f.fake.controls.failDeleteKey=null;await f.service().run();assert.equal(f.fake.objects.has(key(DAY)+'.json'),false);assert.equal(f.fake.objects.size,60);
});
test('bad local state and destination/key changes fail closed while preserving pending recovery evidence',async t=>{
  const f=await fixture(t),s=f.service();f.fake.controls.failDataPuts=10;await assert.rejects(()=>s.run());
  const file=path.join(f.deployment.backupPath,'.offsite','state.json'),before=fs.readFileSync(file);
  const changed=createOffsiteBackupService(f.db,f.deployment,{config:{...f.config,prefix:'different-environment'},store:f.store,warn:()=>{}});
  await assert.rejects(()=>changed.run(),/OFFSITE_LOCAL_STATE_INVALID/);assert.deepEqual(fs.readFileSync(file),before);
  fs.writeFileSync(file,'{broken');const bad=f.service();assert.equal(bad.status().ok,false);await assert.rejects(()=>bad.run(),/LOCAL_STATE_INVALID/);assert.equal(fs.readFileSync(file,'utf8'),'{broken');
});
test('stale process lock is recovered; a live process lock never allows another upload',async t=>{
  const f=await fixture(t),s=f.service(),lock=path.join(f.deployment.backupPath,'.offsite','run.lock');
  fs.writeFileSync(lock,String(process.pid));await assert.rejects(()=>s.run(),/OFFSITE_BUSY/);assert.equal(f.fake.requests.length,0);assert.equal(fs.readFileSync(lock,'utf8'),String(process.pid));
  fs.writeFileSync(lock,'2147483647');await f.service().run();assert.equal(f.fake.objects.size,2);assert.equal(fs.existsSync(lock),false);
});
test('corrupted daily remote object remains a failure after local state loss and is never silently replaced',async t=>{
  const f=await fixture(t);await f.service().run();f.fake.objects.get(key(DAY)).bytes[30]^=1;fs.rmSync(path.join(f.deployment.backupPath,'.offsite'),{recursive:true});const s=f.service();
  await assert.rejects(()=>s.run(),/CHECKSUM_MISMATCH/);assert.equal(s.status().ok,false);assert.equal(f.fake.requests.filter(r=>r.method==='PUT').length,2);
});

test("a competing local worker cannot erase another worker's pending upload state",async t=>{
  const f=await fixture(t);let entered,release;const waiting=new Promise(r=>{entered=r;});
  const first=createOffsiteBackupService(f.db,f.deployment,{config:f.config,store:{...f.store,putFile:async(...args)=>{entered();await new Promise(r=>{release=r;});return f.store.putFile(...args);}},now:()=>AT,warn:()=>{}});
  const second=f.service(),pending=first.run();await waiting;
  const file=path.join(f.deployment.backupPath,'.offsite','state.json'),before=fs.readFileSync(file);await assert.rejects(()=>second.run(),/OFFSITE_BUSY/);assert.deepEqual(fs.readFileSync(file),before);
  release();await pending;assert.equal(first.status().ok,true);
});

test('worker constructed before a failed response reuses the first worker artifact after acquiring its lock',async t=>{
  const f=await fixture(t);let entered,release;const waiting=new Promise(r=>{entered=r;});
  const first=createOffsiteBackupService(f.db,f.deployment,{config:f.config,store:{...f.store,putFile:async(...args)=>{entered();await new Promise(r=>{release=r;});await f.store.putFile(...args);throw Error('synthetic accepted response lost');}},now:()=>AT,warn:()=>{}});
  const second=f.service(),pending=first.run();await waiting;await assert.rejects(()=>second.run(),/OFFSITE_BUSY/);release();await assert.rejects(()=>pending);
  const accepted=Buffer.from(f.fake.objects.get(key(DAY)).bytes);await second.run();assert.deepEqual(f.fake.objects.get(key(DAY)).bytes,accepted);assert.equal(second.status().ok,true);
});
