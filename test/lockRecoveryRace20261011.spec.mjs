import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {retentionLockFile} from '../server/src/backupRetentionLock.js';
import {rememberBackupErasure} from '../server/src/offsiteHistory.js';
const at='2026-10-11T00:00:00.000Z';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-lock-race-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const deployment={root,volume:root,backupPath:path.join(root,'backups')};fs.mkdirSync(deployment.backupPath);return {root,deployment};}
async function until(f,description){const end=Date.now()+10000;while(!f()){if(Date.now()>end)assert.fail('Timed out: '+description);await delay(10);}}
async function race(t,ledger){
  const f=fixture(t),exists=name=>fs.existsSync(path.join(f.root,name)),mark=name=>fs.writeFileSync(path.join(f.root,name),'yes');
  fs.writeFileSync(retentionLockFile(f.deployment),JSON.stringify({pid:2147483647,token:'SYNTHETIC-dead'}));
  const launch=role=>{const child=spawn(process.execPath,['test/helpers/lockRaceWorker20261011.mjs',f.root,role,ledger?'ledger':'lock'],{stdio:['ignore','pipe','pipe']});let error='';child.stderr.on('data',b=>{error+=b;});t.after(()=>child.kill('SIGKILL'));return {child,closed:new Promise(resolve=>child.on('close',code=>resolve({code,error})))};};
  const b=launch('B');await until(()=>exists('B-read')||exists('B-result'),'recoverer final ownership read');
  assert.equal(exists('B-read'),true,'The controlled read-before-unlink boundary must actually run');
  const a=launch('A');await until(()=>exists('A-result')||exists(ledger?'A-ledger':'A-ready'),'replacement holder or busy rejection');
  const aHeld=exists('A-entered');mark('B-resume');await until(()=>exists('B-ready')||exists('B-result'),'recoverer result');
  const overlap=aHeld&&exists('B-entered');
  if(ledger&&aHeld){mark('A-publish');await until(()=>exists('A-ready'),'replacement ledger publication');}
  mark('A-exit');mark('B-exit');const outcomes=await Promise.all([a.closed,b.closed]);for(const outcome of outcomes)assert.equal(outcome.code,0,outcome.error);
  const results=Object.fromEntries(['A','B'].map(role=>[role,fs.readFileSync(path.join(f.root,role+'-result'),'utf8')]));
  if(ledger)for(const role of ['A','B'])if(results[role]==='OFFSITE_BUSY')rememberBackupErasure(f.deployment,'SYNTHETIC-'+role,at);
  return {...f,overlap,results};
}
test('lock race: two child recoverers never enter protected callbacks together',async t=>{
  const f=await race(t,false);assert.equal(f.overlap,false,'stale recovery deleted a live replacement lock; both callbacks entered');
  assert.equal(Object.values(f.results).filter(value=>value==='OFFSITE_BUSY').length,1);
});
test('lock race: stale recovery cannot lose a replacement holder erasure ledger entry',async t=>{
  const f=await race(t,true);const owners=rememberBackupErasure(f.deployment,'SYNTHETIC-A',at).map(row=>row.ownerId).sort();
  assert.deepEqual(owners,['SYNTHETIC-A','SYNTHETIC-B'],'the older replacement-holder ledger overwrote the other committed erasure');
});
test('lock race: overlapping ledger publications preserve both owners without a retention lock',t=>{
  const f=fixture(t),rename=fs.renameSync,link=fs.linkSync;let interleaved=false;
  const insertB=()=>{if(!interleaved){interleaved=true;rememberBackupErasure(f.deployment,'SYNTHETIC-B',at);}};
  fs.renameSync=function(from,to){if(String(to).endsWith('/owners.json'))insertB();return rename.call(this,from,to);};
  fs.linkSync=function(from,to){if(String(to).includes('/erased-owners/'))insertB();return link.call(this,from,to);};
  try{rememberBackupErasure(f.deployment,'SYNTHETIC-A',at);}finally{fs.renameSync=rename;fs.linkSync=link;}
  assert.equal(interleaved,true);assert.deepEqual(rememberBackupErasure(f.deployment,'SYNTHETIC-A',at).map(row=>row.ownerId).sort(),['SYNTHETIC-A','SYNTHETIC-B']);
});

test('lock race: legacy ledger migration is complete, repeatable and immutable',t=>{
  const f=fixture(t),root=path.join(f.deployment.backupPath,'.retention');fs.mkdirSync(root);
  const rows=[{ownerId:'SYNTHETIC-old-A',at},{ownerId:'SYNTHETIC-old-B',at}];
  const bytes=JSON.stringify({version:1,owners:rows}),file=path.join(root,'owners.json');fs.writeFileSync(file,bytes);
  const first=rememberBackupErasure(f.deployment,'SYNTHETIC-new',at);
  assert.deepEqual(first.map(row=>row.ownerId).sort(),['SYNTHETIC-new','SYNTHETIC-old-A','SYNTHETIC-old-B']);
  assert.deepEqual(rememberBackupErasure(f.deployment,'SYNTHETIC-old-A','2026-10-12T00:00:00.000Z'),first);
  assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(fs.readdirSync(path.join(root,'erased-owners')).length,3);
});
test('lock race: interrupted migration resumes without losing any legacy entry',t=>{
  const f=fixture(t),root=path.join(f.deployment.backupPath,'.retention');fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'owners.json'),JSON.stringify({version:1,owners:[{ownerId:'SYNTHETIC-A',at},{ownerId:'SYNTHETIC-B',at}]}));
  const link=fs.linkSync;let count=0;fs.linkSync=function(...args){if(++count===2)throw Error('SYNTHETIC interrupted publication');return link.apply(this,args);};
  try{assert.throws(()=>rememberBackupErasure(f.deployment,'SYNTHETIC-C',at),/interrupted publication/);}finally{fs.linkSync=link;}
  assert.deepEqual(rememberBackupErasure(f.deployment,'SYNTHETIC-C',at).map(row=>row.ownerId).sort(),['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);
});
test('lock race: malformed legacy ledger fails closed without deleting the evidence',t=>{
  const f=fixture(t),root=path.join(f.deployment.backupPath,'.retention');fs.mkdirSync(root);const file=path.join(root,'owners.json');
  fs.writeFileSync(file,JSON.stringify({version:1,owners:[{ownerId:'../invalid',at}]}));const before=fs.readFileSync(file);
  assert.throws(()=>rememberBackupErasure(f.deployment,'SYNTHETIC-A',at),/LEDGER_INVALID/);assert.deepEqual(fs.readFileSync(file),before);
});
test('lock race: SQLite releases a SIGKILL holder without deleting its lock database',async t=>{
  const f=fixture(t),script=`import {withBackupRetentionLock} from './server/src/backupRetentionLock.js';await withBackupRetentionLock(JSON.parse(process.argv[1]),async()=>{console.log('HELD');await new Promise(()=>{setInterval(()=>{},1000);});});`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,JSON.stringify(f.deployment)],{stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGKILL'));let held=false;child.stdout.on('data',()=>{held=true;});const closed=new Promise(resolve=>child.on('close',resolve));await until(()=>held,'SQLite holder');
  const {withBackupRetentionLock,assertBackupRetentionIdle}=await import('../server/src/backupRetentionLock.js');
  const database=retentionLockFile(f.deployment)+'.sqlite',inode=fs.statSync(database).ino;
  const start=Date.now();assert.throws(()=>assertBackupRetentionIdle(f.deployment),/OFFSITE_BUSY/);await assert.rejects(withBackupRetentionLock(f.deployment,async()=>assert.fail('contender entered')),/OFFSITE_BUSY/);assert.ok(Date.now()-start<1000,'contenders must fail promptly');
  child.kill('SIGKILL');await closed;await withBackupRetentionLock(f.deployment,async()=>{});assert.equal(fs.statSync(database).ino,inode);
});
test('lock race: nested sync and async acquisitions release after an exception',async t=>{
  const f=fixture(t),{withBackupRetentionLock,withBackupRetentionLockSync,assertBackupRetentionIdle}=await import('../server/src/backupRetentionLock.js');
  await assert.rejects(withBackupRetentionLock(f.deployment,async()=>{await withBackupRetentionLock(f.deployment,async()=>{assert.equal(withBackupRetentionLockSync(f.deployment,()=>42),42);});throw Error('SYNTHETIC failure');}),/SYNTHETIC failure/);
  assertBackupRetentionIdle(f.deployment);await withBackupRetentionLock(f.deployment,async()=>{});
});
test('lock race: independent processes migrate and append every owner without a retention lock',async t=>{
  const f=fixture(t),root=path.join(f.deployment.backupPath,'.retention');fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'owners.json'),JSON.stringify({version:1,owners:[{ownerId:'SYNTHETIC-legacy',at}]}));
  const script=`import {rememberBackupErasure} from './server/src/offsiteHistory.js';rememberBackupErasure(JSON.parse(process.argv[1]),process.argv[2],process.argv[3]);`;
  const owners=Array.from({length:8},(_,i)=>'SYNTHETIC-concurrent-'+i);
  const completed=await Promise.all(owners.map(owner=>new Promise(resolve=>{
    const child=spawn(process.execPath,['--input-type=module','-e',script,JSON.stringify(f.deployment),owner,at],{stdio:['ignore','pipe','pipe']});
    t.after(()=>child.kill('SIGKILL'));let error='';child.stderr.on('data',data=>{error+=data;});child.on('close',code=>resolve({code,error}));
  })));
  for(const result of completed)assert.equal(result.code,0,result.error);
  assert.deepEqual(rememberBackupErasure(f.deployment,'SYNTHETIC-legacy',at).map(row=>row.ownerId).sort(),[...owners,'SYNTHETIC-legacy'].sort());
});
