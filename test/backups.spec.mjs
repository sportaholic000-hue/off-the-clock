import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createSnapshot,verifyBackup,restoreBackup,listSnapshots,startBackupScheduler} from '../server/src/backups.js';

const AT=Date.parse('2026-10-01T12:00:00Z');
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'otc-backup-'));
  const config={root,backupPath:path.join(root,'backups'),pricebookPath:path.join(root,'pricebooks'),backupRetentionDays:30,backupIntervalMs:25};
  fs.mkdirSync(config.pricebookPath);
  const db=new Database(path.join(root,'off-the-clock.sqlite'));db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');
  db.exec('CREATE TABLE tenants(id TEXT PRIMARY KEY);CREATE TABLE records(id TEXT PRIMARY KEY,ownerId TEXT REFERENCES tenants(id),payload TEXT);');
  db.prepare('INSERT INTO tenants VALUES(?)').run('a');db.prepare('INSERT INTO tenants VALUES(?)').run('b');
  db.prepare('INSERT INTO records VALUES(?,?,?)').run('lead-a','a','persisted committed WAL row');
  db.prepare('INSERT INTO records VALUES(?,?,?)').run('booking-b','b','another tenant retained in platform backup');
  fs.writeFileSync(path.join(config.pricebookPath,'a.json'),JSON.stringify({ownerId:'a',price:119}));
  fs.writeFileSync(path.join(root,'.env'),'SYNTHETIC_SECRET_MUST_NOT_BE_IN_A_BACKUP');
  t.after(()=>{if(db.open)db.close();fs.rmSync(root,{recursive:true,force:true});});
  return {root,config,db};
}
const restoredTarget=root=>path.join(root,'restores','verified');
test('online backup includes committed WAL rows and price books; restore publishes a verified new directory',async t=>{
  const {root,config,db}=fixture(t),bundle=await createSnapshot(db,config,{now:()=>AT});
  const manifest=verifyBackup(bundle);assert.equal(manifest.version,1);
  assert.deepEqual(manifest.files.map(x=>x.name).sort(),['off-the-clock.sqlite','pricebooks/a.json']);
  assert.ok(!JSON.stringify(manifest).includes('SYNTHETIC_SECRET'));
  const result=restoreBackup(bundle,restoredTarget(root),{volume:root});
  const restored=new Database(path.join(result.destination,'off-the-clock.sqlite'),{readonly:true});
  assert.deepEqual(restored.prepare('SELECT * FROM records ORDER BY id').all(),db.prepare('SELECT * FROM records ORDER BY id').all());restored.close();
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.destination,'pricebooks/a.json'),'utf8')).price,119);
  assert.equal(fs.existsSync(path.join(result.destination,'.env')),false);
  assert.throws(()=>restoreBackup(bundle,result.destination,{volume:root}),/NEW_DIRECTORY/);
});
test('a transaction during an online backup never appears half committed',async t=>{
  const {config,db}=fixture(t);
  for(let i=0;i<200;i++)db.prepare('INSERT INTO records VALUES(?,?,?)').run('large-'+i,'a','x'.repeat(8192));
  const pending=createSnapshot(db,config,{now:()=>AT});
  db.transaction(()=>{
    db.prepare('INSERT INTO records VALUES(?,?,?)').run('paired-one','a','one');
    db.prepare('INSERT INTO records VALUES(?,?,?)').run('paired-two','a','two');
  })();
  const bundle=await pending;const copy=new Database(path.join(bundle,'off-the-clock.sqlite'),{readonly:true});
  const count=copy.prepare("SELECT count(*) n FROM records WHERE id LIKE 'paired-%'").get().n;
  assert.ok(count===0 || count===2);assert.equal(copy.pragma('integrity_check',{simple:true}),'ok');assert.equal(copy.pragma('foreign_key_check').length,0);copy.close();
});
test('corruption refuses restore before publishing and leaves the current database intact',async t=>{
  const {root,config,db}=fixture(t),bundle=await createSnapshot(db,config,{now:()=>AT});
  fs.appendFileSync(path.join(bundle,'off-the-clock.sqlite'),'corruption');
  assert.throws(()=>verifyBackup(bundle),/CHECKSUM/);
  assert.throws(()=>restoreBackup(bundle,restoredTarget(root),{volume:root}),/CHECKSUM/);
  assert.equal(fs.existsSync(restoredTarget(root)),false);
  assert.equal(db.prepare('SELECT count(*) n FROM records').get().n,2);
});
test('traversal, symlinks and targets outside the restore directory cannot write files',async t=>{
  const {root,config,db}=fixture(t),bundle=await createSnapshot(db,config,{now:()=>AT});
  for(const destination of [path.dirname(root),root,path.join(root,'backups','new'),path.join(root,'pricebooks','new')])
    assert.throws(()=>restoreBackup(bundle,destination,{volume:root}),/OUTSIDE_VOLUME/);
  const m=JSON.parse(fs.readFileSync(path.join(bundle,'manifest.json'),'utf8'));m.files.push({name:'../../secret',sha256:'0'.repeat(64),bytes:0});
  fs.writeFileSync(path.join(bundle,'manifest.json'),JSON.stringify(m));assert.throws(()=>verifyBackup(bundle),/MANIFEST_INVALID/);
  m.files.pop();fs.writeFileSync(path.join(bundle,'manifest.json'),JSON.stringify(m));
  const file=path.join(bundle,'pricebooks/a.json');fs.unlinkSync(file);fs.rmdirSync(path.dirname(file));fs.symlinkSync(config.pricebookPath,path.dirname(file),process.platform==='win32'?'junction':'dir');
  assert.throws(()=>verifyBackup(bundle),/UNSAFE_FILE|symlink/);
});
test('a failed snapshot leaves the last accepted backup and no partial bundle',async t=>{
  const {config,db}=fixture(t),bundle=await createSnapshot(db,config,{now:()=>AT});
  fs.writeFileSync(path.join(config.pricebookPath,'a.json'),'broken JSON');
  await assert.rejects(()=>createSnapshot(db,config,{now:()=>AT+1000}));
  assert.equal(listSnapshots(config.backupPath).length,1);assert.equal(verifyBackup(bundle).createdAtMs,AT);
  assert.equal(fs.readdirSync(config.backupPath).filter(x=>x.startsWith('.partial-')).length,0);
});
test('retention removes only expired completed snapshots and preserves other directories',async t=>{
  const {config,db}=fixture(t);
  const older=await createSnapshot(db,config,{now:()=>AT-31*86400000});
  const unrelated=path.join(config.backupPath,'keep-me');fs.mkdirSync(unrelated);fs.writeFileSync(path.join(unrelated,'marker'),'keep');
  const current=await createSnapshot(db,config,{now:()=>AT});
  assert.equal(fs.existsSync(older),false);assert.ok(fs.existsSync(current));assert.equal(fs.readFileSync(path.join(unrelated,'marker'),'utf8'),'keep');
});
test('scheduler retries failure, avoids overlapping jobs and waits for its active job when stopped',async t=>{
  const {config,db}=fixture(t);const hold=setInterval(()=>{},1000);t.after(()=>clearInterval(hold));let attempts=0,release,entered;const started=new Promise(resolve=>{entered=resolve;});
  const worker=startBackupScheduler(db,config,{onError:()=>{},takeSnapshot:async()=>{
    attempts++;if(attempts===1)throw new Error('synthetic storage outage');
    entered();await new Promise(resolve=>{release=resolve;});
  }});
  await started;let stopped=false;const stopping=worker.stop().then(()=>{stopped=true;});
  await new Promise(resolve=>setTimeout(resolve,60));assert.equal(stopped,false);assert.equal(attempts,2);
  release();await stopping;assert.equal(stopped,true);assert.ok(worker.lastSuccess()>0);
  await new Promise(resolve=>setTimeout(resolve,60));assert.equal(attempts,2);
});
