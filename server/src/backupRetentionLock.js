import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const retentionLockFile=deployment=>path.join(deployment.backupPath,'.tenant-erasure.lock');
export function assertBackupRetentionIdle(deployment){
  if(fs.existsSync(retentionLockFile(deployment)))throw Error('OFFSITE_BUSY');
}
export async function withBackupRetentionLock(deployment,work){
  const file=retentionLockFile(deployment),token=randomUUID();
  fs.mkdirSync(deployment.backupPath,{recursive:true,mode:0o700});
  if(fs.existsSync(file)){
    const prior=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!Number.isInteger(prior.pid)||prior.pid<1)throw Error('OFFSITE_LOCK_INVALID');
    try{process.kill(prior.pid,0);throw Error('OFFSITE_BUSY');}catch(error){if(error.code!=='ESRCH')throw error;}
    fs.unlinkSync(file);
  }
  fs.writeFileSync(file,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600,flush:true});
  try{return await work();}finally{
    if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).token===token)fs.unlinkSync(file);
  }
}
