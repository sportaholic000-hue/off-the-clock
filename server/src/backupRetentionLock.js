import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import Database from 'better-sqlite3';
import {assertRealContainment} from './deploymentConfig.js';

// Restores always publish under volume/restores. Use that same volume-wide
// lock even when APP_DATA_DIR or a continuous snapshot directory is nested.
const lockRoot=deployment=>deployment.volume||deployment.root||path.dirname(deployment.backupPath);
export const retentionLockFile=deployment=>path.join(lockRoot(deployment),'backups','.tenant-erasure.lock');
const heldLocks=new AsyncLocalStorage();
const instanceIdentity='instance:'+randomUUID();
const processStartedAt=Date.now()-process.uptime()*1000;
function processIdentity(pid){
  // Linux's boot ID + process birth tick survives neither a reboot nor PID
  // reuse (including PID 1 after a container replacement). New locks need no
  // age timeout: a slow but live restore must retain exclusive access.
  try{
    const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8');
    const start=stat.slice(stat.lastIndexOf(')')+2).split(' ')[19];
    const boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
    if(/^\d+$/.test(start)&&boot)return 'linux:'+boot+':'+start;
  }catch{}
  // Non-Linux/sandbox fallback can still positively identify this process.
  // For another live PID whose birth identity is unavailable, fail closed.
  return pid===process.pid?instanceIdentity:null;
}
export const processLockOwner=()=>({pid:process.pid,processIdentity:processIdentity(process.pid)});
function removeLegacyLockWhileFenced(file){
  if(!fs.existsSync(file))return;
  const bytes=fs.readFileSync(file,'utf8');let parsed;
  try{parsed=JSON.parse(bytes);}catch{throw Error('OFFSITE_LOCK_INVALID');}
  const prior=typeof parsed==='number'?{pid:parsed}:parsed;
  if(!Number.isInteger(prior?.pid)||prior.pid<1)throw Error('OFFSITE_LOCK_INVALID');
  let gone=false;
  try{process.kill(prior.pid,0);}catch(error){if(error.code==='ESRCH')gone=true;else throw error;}
  if(!gone){
    const current=processIdentity(prior.pid);
    if(prior.processIdentity&&current&&prior.processIdentity!==current)gone=true;
    // Upgrade recovery for an old PID-only lock: this process cannot have
    // written it before it was born. Fresh legacy locks remain excluded.
    // The margin tolerates clock precision; this is not a lock-age timeout.
    else if(!prior.processIdentity&&prior.pid===process.pid&&fs.statSync(file).mtimeMs<processStartedAt-2)gone=true;
  }
  if(!gone)throw Error('OFFSITE_BUSY');
  // Recheck ownership before removing a stale holder; never unlink a lock
  // already replaced by another worker.
  if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===bytes)fs.unlinkSync(file);
  if(fs.existsSync(file))throw Error('OFFSITE_BUSY');
}
// The SQLite inode is permanent: never unlink, rename or replace it. SQLite's
// BEGIN EXCLUSIVE atomically arbitrates contenders; the OS releases its locks
// on close or process death, including a restart that reuses PID 1. No PID or
// age inference is used for any new holder. timeout:0 preserves OFFSITE_BUSY.
// Old PID records are upgrade evidence only. Their inspection/removal is fenced
// by this same transaction, so another upgraded worker cannot acquire between
// the final legacy read and unlink. A live legacy holder remains fail-closed.
export function acquireProcessLock(file){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  assertRealContainment(path.dirname(file),file);
  const databaseFile=file+'.sqlite';
  for(const suffix of ['', '-journal', '-wal', '-shm'])assertRealContainment(path.dirname(file),databaseFile+suffix);
  let database;
  try{
    database=new Database(databaseFile,{timeout:0});
    fs.chmodSync(databaseFile,0o600);
    database.exec('BEGIN EXCLUSIVE');
    removeLegacyLockWhileFenced(file);
    let released=false;
    return ()=>{
      if(released)return;released=true;
      try{database.exec('ROLLBACK');}finally{database.close();}
    };
  }catch(error){
    if(database?.open)database.close();
    if(error.code==='SQLITE_BUSY'||error.code==='SQLITE_LOCKED')throw Error('OFFSITE_BUSY');
    throw error;
  }
}
export function removeStaleProcessLock(file){
  const release=acquireProcessLock(file);release();
}
export function assertBackupRetentionIdle(deployment){
  assertRealContainment(lockRoot(deployment),retentionLockFile(deployment));
  removeStaleProcessLock(retentionLockFile(deployment));
}
function acquire(deployment){
  const file=path.resolve(retentionLockFile(deployment));
  assertRealContainment(lockRoot(deployment),file);
  const previous=heldLocks.getStore(),held=previous?.get(file);
  if(held?.active)return {held:previous,release:()=>{}};
  const unlock=acquireProcessLock(file),entry={active:true};
  const next=new Map(previous);next.set(file,entry);
  return {held:next,release:()=>{entry.active=false;unlock();}};
}
export async function withBackupRetentionLock(deployment,work){
  const lock=acquire(deployment);
  try{return await heldLocks.run(lock.held,work);}finally{lock.release();}
}
export function withBackupRetentionLockSync(deployment,work){
  const lock=acquire(deployment);
  try{return heldLocks.run(lock.held,work);}finally{lock.release();}
}
