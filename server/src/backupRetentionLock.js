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
export function assertBackupRetentionIdle(deployment){
  if(fs.existsSync(retentionLockFile(deployment)))throw Error('OFFSITE_BUSY');
}
function acquire(deployment){
  const file=retentionLockFile(deployment),token=randomUUID();
  assertRealContainment(lockRoot(deployment),file);
  const held=heldLocks.getStore();
  if(held?.file===file&&fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).token===held.token)return {held,release:()=>{}};
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if(fs.existsSync(file)){
    const prior=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!Number.isInteger(prior.pid)||prior.pid<1)throw Error('OFFSITE_LOCK_INVALID');
    try{process.kill(prior.pid,0);throw Error('OFFSITE_BUSY');}catch(error){if(error.code!=='ESRCH')throw error;}
    fs.unlinkSync(file);
  }
  fs.writeFileSync(file,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600,flush:true});
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
