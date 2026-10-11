import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
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
  // reuse (including PID 1 after a container replacement). Never use mtime or
  // an expiring lease: a slow but live restore must retain exclusive access.
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
export function removeStaleProcessLock(file){
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
    else if(!prior.processIdentity&&prior.pid===process.pid&&fs.statSync(file).mtimeMs<processStartedAt-1000)gone=true;
  }
  if(!gone)throw Error('OFFSITE_BUSY');
  // Recheck ownership before removing a stale holder; never unlink a lock
  // already replaced by another worker.
  if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===bytes)fs.unlinkSync(file);
  if(fs.existsSync(file))throw Error('OFFSITE_BUSY');
}
export function assertBackupRetentionIdle(deployment){
  assertRealContainment(lockRoot(deployment),retentionLockFile(deployment));
  removeStaleProcessLock(retentionLockFile(deployment));
}
function acquire(deployment){
  const file=retentionLockFile(deployment),token=randomUUID();
  assertRealContainment(lockRoot(deployment),file);
  const held=heldLocks.getStore();
  if(held?.file===file&&fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).token===held.token)return {held,release:()=>{}};
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  removeStaleProcessLock(file);
  fs.writeFileSync(file,JSON.stringify({...processLockOwner(),token}),{flag:'wx',mode:0o600,flush:true});
  return {held:{file,token},release:()=>{
    if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).token===token)fs.unlinkSync(file);
  }};
}
export async function withBackupRetentionLock(deployment,work){
  const lock=acquire(deployment);
  try{return await heldLocks.run(lock.held,work);}finally{lock.release();}
}
export function withBackupRetentionLockSync(deployment,work){
  const lock=acquire(deployment);
  try{return heldLocks.run(lock.held,work);}finally{lock.release();}
}
