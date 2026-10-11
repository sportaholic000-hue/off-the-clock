import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {retentionFixture} from './helpers/tenantRetentionFixture.mjs';
import {assertBackupRetentionIdle,retentionLockFile,withBackupRetentionLock} from '../server/src/backupRetentionLock.js';
import {createSnapshot} from '../server/src/backups.js';

function writeLock(deployment,holder){
  const file=retentionLockFile(deployment);fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(holder));return file;
}
async function deadChild(){
  const child=spawn(process.execPath,['-e','process.exit(0)']);await once(child,'close');return child.pid;
}
test('retention hardening: ordinary snapshot recovers a dead child retention lock',async t=>{
  const f=retentionFixture(t),pid=await deadChild();writeLock(f.deployment,{pid,token:'SYNTHETIC-dead-child'});
  const snapshot=await createSnapshot(f.db,f.deployment);
  assert.ok(fs.existsSync(path.join(snapshot,'manifest.json')));assert.equal(fs.existsSync(retentionLockFile(f.deployment)),false);
});
test('retention hardening: acquire recovers a dead child retention lock',async t=>{
  const f=retentionFixture(t),pid=await deadChild();writeLock(f.deployment,{pid,token:'SYNTHETIC-dead-child'});
  let ran=false;await withBackupRetentionLock(f.deployment,async()=>{ran=true;});assert.equal(ran,true);
});
for(const action of ['worker','acquire'])test('retention hardening: '+action+' recovers PID 1 from a previous process instance',t=>{
  const f=retentionFixture(t);
  // Simulate the two successive container processes without requiring a real
  // container, provider or PID namespace. The old PID is alive again, but its
  // process identity is different. The production lock must inspect both.
  writeLock(f.deployment,{pid:1,token:'SYNTHETIC-old-container',processIdentity:'SYNTHETIC-previous-process'});
  const script=`import {assertBackupRetentionIdle,withBackupRetentionLock} from './server/src/backupRetentionLock.js';
    Object.defineProperty(process,'pid',{value:1});process.kill=pid=>{if(pid!==1)throw Error('Unexpected PID');return true;};
    const deployment=JSON.parse(process.argv[1]);
    ${action==='worker'?'assertBackupRetentionIdle(deployment);':'await withBackupRetentionLock(deployment,async()=>{});'}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script,JSON.stringify(f.deployment)],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(fs.existsSync(retentionLockFile(f.deployment)),false);
});
test('retention hardening: a live holder excludes workers and a competing erasure',async t=>{
  const f=retentionFixture(t);
  const script=`import {withBackupRetentionLock} from './server/src/backupRetentionLock.js';
    await withBackupRetentionLock(JSON.parse(process.argv[1]),async()=>{const timer=setInterval(()=>{},1000);await new Promise(resolve=>{process.on('SIGTERM',resolve);console.log('HELD');});clearInterval(timer);});`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,JSON.stringify(f.deployment)],{stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill();});await once(child.stdout,'data');
  assert.throws(()=>assertBackupRetentionIdle(f.deployment),/OFFSITE_BUSY/);
  await assert.rejects(withBackupRetentionLock(f.deployment,async()=>{}),/OFFSITE_BUSY/);
  child.kill();await once(child,'close');assertBackupRetentionIdle(f.deployment);
});
test('retention hardening: legacy PID 1 lock predating this process is recoverable',t=>{
  const f=retentionFixture(t),file=writeLock(f.deployment,{pid:1,token:'SYNTHETIC-legacy-container'});
  // A fast restart must recover too; do not rely on an old lock being seconds old.
  const justBeforeStartup=new Date(Date.now()-20);fs.utimesSync(file,justBeforeStartup,justBeforeStartup);
  const script=`import {assertBackupRetentionIdle} from './server/src/backupRetentionLock.js';
    Object.defineProperty(process,'pid',{value:1});process.kill=()=>true;
    assertBackupRetentionIdle(JSON.parse(process.argv[1]));`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script,JSON.stringify(f.deployment)],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
