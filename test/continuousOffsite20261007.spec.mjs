import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn,fork} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import * as backups from '../server/src/offsiteBackups.js';
import {readOffsiteConfig,createS3BackupStore} from '../server/src/offsiteStore.js';
import {fakeS3} from './helpers/offsiteFakeS3.mjs';
import {productionEnv} from './helpers/railwayEnv.mjs';

const AT=Date.parse('2026-10-07T04:00:00Z'),DAY='2026-10-07';
async function fixture(t,options={}){
  const fake=await fakeS3(t),root=fs.mkdtempSync(path.join(os.tmpdir(),'otc-continuous-SYNTHETIC-'));
  const env={OFFSITE_BACKUP_ENDPOINT:fake.endpoint,OFFSITE_BACKUP_BUCKET:'synthetic-bucket',OFFSITE_BACKUP_ACCESS_KEY_ID:'SYNTHETIC_ACCESS',OFFSITE_BACKUP_SECRET_ACCESS_KEY:'SYNTHETIC_SECRET',OFFSITE_BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('hex'),OFFSITE_BACKUP_PREFIX:'synthetic-environment'};
  const config=readOffsiteConfig(env),store=createS3BackupStore(config),deployment={production:true,volume:root,root,backupPath:path.join(root,'backups'),pricebookPath:path.join(root,'pricebooks'),backupRetentionDays:30};
  fs.mkdirSync(deployment.pricebookPath);fs.mkdirSync(deployment.backupPath);
  const filename=path.join(root,'off-the-clock.sqlite'),db=new Database(filename);db.pragma('journal_mode=WAL');
  db.exec('CREATE TABLE leads(id TEXT PRIMARY KEY, ownerId TEXT, note TEXT); CREATE TABLE priceBookCreationRecords(ownerId TEXT PRIMARY KEY)');
  for(const owner of ['synthetic-a','synthetic-b']){
    db.prepare('INSERT INTO leads VALUES(?,?,?)').run(owner,owner,'[SYNTHETIC] before');
    db.prepare('INSERT INTO priceBookCreationRecords VALUES(?)').run(owner);
    fs.writeFileSync(path.join(deployment.pricebookPath,owner+'.json'),JSON.stringify({ownerId:owner,marker:'[SYNTHETIC] before'}));
  }
  let clock=AT;const services=[];
  const service=()=>{const s=backups.createOffsiteBackupService(db,deployment,{config,store,now:()=>clock,warn:()=>{},continuousPollMs:10,retryMs:10,...options});services.push(s);return s;};
  t.after(async()=>{for(const s of services)await s.stop();store.close();if(db.open)db.close();fs.rmSync(root,{recursive:true,force:true});});
  return {fake,root,env,config,store,deployment,db,filename,service,setClock:value=>{clock=value;}};
}
async function restoreLatest(f,s,label){
  const target=path.join(f.root,'restores',label),checkpoint=s.status().continuous?.lastCheckpointId;
  if(checkpoint)return backups.restoreContinuousBackup({store:f.store,config:f.config,checkpoint,target,volume:f.root});
  return backups.restoreOffsiteBackup({store:f.store,config:f.config,day:DAY,target,volume:f.root});
}
async function replicate(s){return s.replicate?s.replicate():s.run();}
// Prewritten recovery expectations: both owners survive; the same-day latest
// committed note and exact saved book bytes survive. No charge/price calculation.
test('same-day database and book changes recover without waiting for the next nightly backup',async t=>{
  const f=await fixture(t),s=f.service();await s.run();
  f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] after','synthetic-a');
  const bytes=Buffer.from(JSON.stringify({ownerId:'synthetic-a',marker:'[SYNTHETIC] after'}));
  fs.writeFileSync(path.join(f.deployment.pricebookPath,'synthetic-a.json'),bytes);f.setClock(AT+1000);await replicate(s);
  const restored=await restoreLatest(f,s,'same-day'),db=new Database(path.join(restored.destination,'off-the-clock.sqlite'),{readonly:true});
  try{assert.equal(db.prepare('SELECT note FROM leads WHERE ownerId=?').get('synthetic-a').note,'[SYNTHETIC] after');assert.equal(db.prepare('SELECT count(*) n FROM leads').get().n,2);}finally{db.close();}
  assert.deepEqual(fs.readFileSync(path.join(restored.destination,'pricebooks/synthetic-a.json')),bytes);
});
test('same-day restart captures another SQLite connection’s WAL commit, not yesterday’s snapshot',async t=>{
  const f=await fixture(t),first=f.service();await first.run();
  const writer=new Database(f.filename);try{writer.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] external WAL','synthetic-b');}finally{writer.close();}
  f.setClock(AT+2000);const resumed=f.service();await replicate(resumed);
  const restored=await restoreLatest(f,resumed,'restart-wal'),db=new Database(path.join(restored.destination,'off-the-clock.sqlite'),{readonly:true});
  try{assert.equal(db.prepare('SELECT note FROM leads WHERE ownerId=?').get('synthetic-b').note,'[SYNTHETIC] external WAL');}finally{db.close();}
});
async function waitFor(check){
  const until=Date.now()+5000;
  while(!check()){if(Date.now()>until)throw Error('[SYNTHETIC] replication did not catch up');await new Promise(resolve=>setTimeout(resolve,10));}
}
const checkpointKeys=f=>[...f.fake.objects.keys()].filter(key=>key.includes('/continuous/')&&key.endsWith('.enc'));
test('production scheduler automatically replicates commits and book-only replacements within the same day',async t=>{
  const f=await fixture(t),s=f.service();s.start();await waitFor(()=>s.status().ok);
  const first=s.status().continuous.lastCheckpointId;
  f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] scheduled commit','synthetic-a');
  await waitFor(()=>s.status().ok&&s.status().continuous.lastCheckpointId!==first);
  const second=s.status().continuous.lastCheckpointId;
  fs.writeFileSync(path.join(f.deployment.pricebookPath,'synthetic-b.json'),JSON.stringify({ownerId:'synthetic-b',marker:'[SYNTHETIC] scheduled book'}));
  await waitFor(()=>s.status().ok&&s.status().continuous.lastCheckpointId!==second);
  const restored=await restoreLatest(f,s,'automatic');
  assert.match(fs.readFileSync(path.join(restored.destination,'pricebooks/synthetic-b.json'),'utf8'),/scheduled book/);
  const db=new Database(path.join(restored.destination,'off-the-clock.sqlite'),{readonly:true});
  try{assert.equal(db.prepare('SELECT note FROM leads WHERE ownerId=?').get('synthetic-a').note,'[SYNTHETIC] scheduled commit');}finally{db.close();}
  await s.stop();
});
test('unchanged state does not create duplicate checkpoints and uploaded archives contain no plaintext',async t=>{
  const f=await fixture(t),s=f.service();await s.run();const count=checkpointKeys(f).length;
  await replicate(s);await replicate(s);assert.equal(checkpointKeys(f).length,count);
  assert.equal(f.fake.objects.size,4); // one nightly + one continuous, each with a completion record
  for(const key of checkpointKeys(f))for(const forbidden of ['SQLite format','synthetic-a','[SYNTHETIC] before',f.env.OFFSITE_BACKUP_SECRET_ACCESS_KEY])assert.equal(f.fake.objects.get(key).bytes.includes(Buffer.from(forbidden)),false);
});
test('failed publication is visible, retains immutable retry bytes, and catches up after restart',async t=>{
  const f=await fixture(t),s=f.service();await s.run();
  f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] pending version','synthetic-a');f.fake.controls.failDataPuts=10;
  await assert.rejects(()=>replicate(s),/OFFSITE_UPLOAD_FAILED/);assert.equal(s.status().ok,false);assert.equal(s.status().continuous.state,'FAILED');
  const local=path.join(f.deployment.backupPath,'.offsite-continuous'),state=JSON.parse(fs.readFileSync(path.join(local,'state.json'))),cipher=fs.readFileSync(path.join(local,'pending.enc'));
  f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] newest version','synthetic-a');f.fake.controls.failDataPuts=0;
  const resumed=f.service();await replicate(resumed);
  assert.deepEqual(f.fake.objects.get(state.pending.key).bytes,cipher);assert.equal(resumed.status().continuous.pendingChanges,true);
  await replicate(resumed);assert.equal(resumed.status().ok,true);
  const restored=await restoreLatest(f,resumed,'retry-latest'),db=new Database(path.join(restored.destination,'off-the-clock.sqlite'),{readonly:true});
  try{assert.equal(db.prepare('SELECT note FROM leads WHERE ownerId=?').get('synthetic-a').note,'[SYNTHETIC] newest version');}finally{db.close();}
});
test('lost continuous upload response does not overwrite accepted data on restart',async t=>{
  const f=await fixture(t),s=f.service();await s.run();f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] response lost','synthetic-a');
  f.fake.controls.loseResponse=true;await assert.rejects(()=>replicate(s));
  const pending=JSON.parse(fs.readFileSync(path.join(f.deployment.backupPath,'.offsite-continuous/state.json'))).pending,cipher=Buffer.from(f.fake.objects.get(pending.key).bytes);
  await replicate(f.service());assert.deepEqual(f.fake.objects.get(pending.key).bytes,cipher);assert.ok(f.fake.objects.has(pending.key+'.json'));
});
test('changes committed during an upload trigger a subsequent automatic checkpoint',async t=>{
  const f=await fixture(t),s=f.service();await s.run();s.start();
  let enter,finish;const entered=new Promise(resolve=>{enter=resolve;}),held=new Promise(resolve=>{finish=resolve;});
  const original=f.store.putFile;let blocked=false;
  f.store.putFile=async(...args)=>{if(args[0].includes('/continuous/')&&!blocked){blocked=true;enter();await held;}return original(...args);};
  f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] first in flight','synthetic-a');
  await entered;f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] second in flight','synthetic-a');finish();
  await waitFor(()=>s.status().ok&&checkpointKeys(f).length>=3);
  const restored=await restoreLatest(f,s,'in-flight'),db=new Database(path.join(restored.destination,'off-the-clock.sqlite'),{readonly:true});
  try{assert.equal(db.prepare('SELECT note FROM leads WHERE ownerId=?').get('synthetic-a').note,'[SYNTHETIC] second in flight');}finally{db.close();}
  await s.stop();
});
test('continuous restore rejects checksum corruption and the wrong key without publishing plaintext',async t=>{
  const f=await fixture(t),s=f.service();await s.run();const checkpoint=s.status().continuous.lastCheckpointId,key=checkpointKeys(f)[0],bytes=Buffer.from(f.fake.objects.get(key).bytes);
  f.fake.objects.get(key).bytes[40]^=1;
  await assert.rejects(()=>restoreLatest(f,s,'corrupt'),/OFFSITE_CHECKSUM_MISMATCH/);assert.equal(fs.existsSync(path.join(f.root,'restores/corrupt')),false);
  f.fake.objects.get(key).bytes=bytes;
  await assert.rejects(()=>backups.restoreContinuousBackup({store:f.store,config:{...f.config,key:randomBytes(32)},checkpoint,target:path.join(f.root,'restores/wrong-key'),volume:f.root}),/OFFSITE_DECRYPTION_FAILED/);
  assert.deepEqual(fs.readdirSync(path.join(f.root,'restores')),[]);
});
test('continuous checkpoint restore CLI preserves committed data after a total synthetic volume wipe',async t=>{
  const f=await fixture(t),s=f.service();await s.run();f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] protected after nightly','synthetic-a');await replicate(s);
  const checkpoint=s.status().continuous.lastCheckpointId,env=productionEnv(f.root,f.env);await s.stop();f.db.close();fs.rmSync(f.root,{recursive:true});fs.mkdirSync(f.root);
  const clean={...process.env,...env,RAILWAY_ENVIRONMENT_ID:'',DATABASE_PATH:'',PRICEBOOK_PATH:''};delete clean.NODE_TEST_CONTEXT;delete clean.DEMO_TRUSTED_PROXY_HOPS;
  const target=path.join(f.root,'restores/continuous-cli'),child=spawn(process.execPath,['server/scripts/restore-offsite.js','--checkpoint',checkpoint,'--target',target],{env:clean,stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',bytes=>{stderr+=bytes;});const [code]=await once(child,'exit');assert.equal(code,0,stderr);
  const db=new Database(path.join(target,'off-the-clock.sqlite'),{readonly:true});try{assert.equal(db.prepare('SELECT note FROM leads WHERE ownerId=?').get('synthetic-a').note,'[SYNTHETIC] protected after nightly');}finally{db.close();}
});
test('thirty-day continuous retention preserves its exact boundary and unrelated objects',async t=>{
  const f=await fixture(t),s=f.service();await s.run();const first=checkpointKeys(f)[0];f.fake.objects.set('unrelated/keep.enc',{bytes:Buffer.from('[SYNTHETIC] keep')});
  f.setClock(AT+30*86400000);f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] day 30','synthetic-a');await replicate(s);assert.equal(f.fake.objects.has(first),true);
  f.setClock(AT+31*86400000);f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] day 31','synthetic-a');await replicate(s);
  assert.equal(f.fake.objects.has(first),false);assert.equal(f.fake.objects.has(first+'.json'),false);assert.equal(checkpointKeys(f).length,2);assert.equal(f.fake.objects.has('unrelated/keep.enc'),true);
});
test('failed uploads cannot prune the last recoverable checkpoint',async t=>{
  const f=await fixture(t),s=f.service();await s.run();const first=checkpointKeys(f)[0];
  f.setClock(AT+31*86400000);f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] outage after 31 days','synthetic-a');f.fake.controls.failDataPuts=10;
  await assert.rejects(()=>replicate(s));assert.equal(f.fake.objects.has(first),true);assert.equal(f.fake.objects.has(first+'.json'),true);
});
test('pending destination changes and invalid state fail closed without replacing evidence',async t=>{
  const f=await fixture(t),s=f.service();await s.run();f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] pending','synthetic-a');f.fake.controls.failDataPuts=10;await assert.rejects(()=>replicate(s));
  const file=path.join(f.deployment.backupPath,'.offsite-continuous/state.json'),saved=fs.readFileSync(file);
  const changed=backups.createOffsiteBackupService(f.db,f.deployment,{config:{...f.config,prefix:'different-environment'},store:f.store,warn:()=>{}});
  await assert.rejects(()=>changed.replicate(),/OFFSITE_LOCAL_STATE_INVALID/);assert.deepEqual(fs.readFileSync(file),saved);
  fs.writeFileSync(file,'[SYNTHETIC] corrupt');await assert.rejects(()=>replicate(f.service()),/OFFSITE_LOCAL_STATE_INVALID/);assert.equal(fs.readFileSync(file,'utf8'),'[SYNTHETIC] corrupt');
});
test('a live or malformed continuous lock preserves durable state; a dead holder is recoverable',async t=>{
  const f=await fixture(t),s=f.service();await s.run();f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] locked change','synthetic-a');
  const directory=path.join(f.deployment.backupPath,'.offsite-continuous'),state=fs.readFileSync(path.join(directory,'state.json')),lock=path.join(directory,'run.lock');
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,token:'SYNTHETIC-holder'}));await assert.rejects(()=>replicate(s),/OFFSITE_BUSY/);assert.deepEqual(fs.readFileSync(path.join(directory,'state.json')),state);
  fs.writeFileSync(lock,'[SYNTHETIC] malformed');await assert.rejects(()=>replicate(s),/OFFSITE_LOCK_INVALID/);assert.deepEqual(fs.readFileSync(path.join(directory,'state.json')),state);
  fs.writeFileSync(lock,JSON.stringify({pid:2147483647,token:'SYNTHETIC-dead'}));await replicate(s);assert.equal(s.status().continuous.ok,true);assert.equal(fs.existsSync(lock),false);
});
test('interrupted continuous retention retries without losing its newest complete copy',async t=>{
  const f=await fixture(t),s=f.service();await s.run();const old=checkpointKeys(f)[0];
  f.setClock(AT+31*86400000);f.db.prepare('UPDATE leads SET note=? WHERE ownerId=?').run('[SYNTHETIC] retained newest','synthetic-a');
  f.fake.controls.failDeleteKey=old+'.json';await assert.rejects(()=>replicate(s));assert.equal(f.fake.objects.has(old),false);assert.equal(f.fake.objects.has(old+'.json'),true);
  const pending=JSON.parse(fs.readFileSync(path.join(f.deployment.backupPath,'.offsite-continuous/state.json'))).pending;assert.ok(f.fake.objects.has(pending.key+'.json'));
  f.fake.controls.failDeleteKey=null;await replicate(f.service());assert.equal(f.fake.objects.has(old+'.json'),false);assert.equal(f.fake.objects.has(pending.key),true);
});
test('large retained history requires only one marker and HEAD read for the newest complete copy',async()=>{
  const config={prefix:'SYNTHETIC'},rows=new Map();
  for(let i=0;i<100;i++){
    const checkpointId=String(AT-i).padStart(13,'0')+'-'+randomUUID(),key=config.prefix+'/continuous/'+checkpointId+'.enc';
    rows.set(key+'.json',{version:1,checkpointId,capturedAtMs:AT-i,key,sha256:'a'.repeat(64),keyId:'b'.repeat(64),sourceToken:'c'.repeat(64),bytes:40});
  }
  // Hand expectation: 100 retained checkpoints, zero expired, one newest
  // complete checkpoint to verify = one marker read, one HEAD, zero deletions.
  let reads=0,heads=0;const store={list:async()=>[...rows.keys()],record:async key=>{reads++;return rows.get(key);},head:async()=>{heads++;return {ContentLength:40,Metadata:{sha256:'a'.repeat(64)}};},remove:async()=>{throw Error('Unexpected synthetic deletion');}};
  await backups.pruneContinuousBackups(store,config,{now:AT});assert.equal(reads,1);assert.equal(heads,1);
});
test('actual production server starts continuous replication and gates health through the admin route', {timeout:30000},async t=>{
  const fake=await fakeS3(t),volume=fs.mkdtempSync(path.join(os.tmpdir(),'otc-production-SYNTHETIC-'));
  const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const env={...process.env,...productionEnv(volume,{PORT:String(port),OFFSITE_BACKUP_ENDPOINT:fake.endpoint,OFFSITE_BACKUP_BUCKET:'synthetic-bucket',OFFSITE_BACKUP_ACCESS_KEY_ID:'SYNTHETIC_ACCESS',OFFSITE_BACKUP_SECRET_ACCESS_KEY:'SYNTHETIC_SECRET',OFFSITE_BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('hex'),OFFSITE_BACKUP_PREFIX:'synthetic-production'}),DATABASE_PATH:'',PRICEBOOK_PATH:'',RAILWAY_ENVIRONMENT_ID:'',ADMIN_EMAIL:'SYNTHETIC-admin@example.invalid',ADMIN_PASSWORD_HASH:bcrypt.hashSync('[PLACEHOLDER] temporary admin password',12)};
  delete env.NODE_TEST_CONTEXT;delete env.DEMO_TRUSTED_PROXY_HOPS;
  const child=fork('test/helpers/continuousOffsiteProduction.mjs',[],{env,execArgv:[],stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout.on('data',bytes=>{output+=bytes;});child.stderr.on('data',bytes=>{output+=bytes;});
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill('SIGKILL');await ended;}fs.rmSync(volume,{recursive:true,force:true});});
  const message=type=>new Promise((resolve,reject)=>{const onMessage=value=>{if(value.type===type){child.off('message',onMessage);resolve(value);}};child.on('message',onMessage);child.once('exit',()=>reject(Error(output)));});
  const ready=await message('ready'),base='http://127.0.0.1:'+ready.port,headers=role=>({authorization:'Bearer '+ready.tokens[role]});
  const status=async()=>{const response=await fetch(base+'/api/admin/backups/offsite',{headers:headers('admin')});return {code:response.status,body:await response.json()};};
  assert.equal((await fetch(base+'/api/admin/backups/offsite')).status,401);assert.equal((await fetch(base+'/api/admin/backups/offsite',{headers:headers('owner')})).status,403);
  let current;const until=Date.now()+10000;do{current=await status();if(current.code===200)break;assert.ok(Date.now()<until,output);await new Promise(resolve=>setTimeout(resolve,20));}while(true);
  const first=current.body.continuous.lastCheckpointId;assert.ok(first);
  const committed=message('committed');child.send({type:'commit'});await committed;
  do{current=await status();if(current.code===200&&current.body.continuous.lastCheckpointId!==first)break;assert.ok(Date.now()<until,output);await new Promise(resolve=>setTimeout(resolve,20));}while(true);
  const config=readOffsiteConfig(env),store=createS3BackupStore(config),target=path.join(volume,'restores/production-drill');
  try{await backups.restoreContinuousBackup({store,config,checkpoint:current.body.continuous.lastCheckpointId,target,volume});}finally{store.close();}
  const db=new Database(path.join(target,'off-the-clock.sqlite'),{readonly:true});try{assert.equal(db.prepare('SELECT customerName FROM leads WHERE ownerId=?').get('SYNTHETIC-backup-owner').customerName,'[PLACEHOLDER] after nightly');}finally{db.close();}
  assert.equal((await fetch(base+'/api/health')).status,200);
  const ended=once(child,'exit');child.kill('SIGTERM');const [code]=await ended;assert.equal(code,0,output);
});
