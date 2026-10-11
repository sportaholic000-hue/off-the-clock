import fs from 'node:fs';
import path from 'node:path';
import {withBackupRetentionLock,retentionLockFile} from '../../server/src/backupRetentionLock.js';
import {rememberBackupErasure} from '../../server/src/offsiteHistory.js';
const [root,role,ledger]=process.argv.slice(2),deployment={root,volume:root,backupPath:path.join(root,'backups')};
const mark=(name,value='yes')=>fs.writeFileSync(path.join(root,name),value);
function wait(name){const until=Date.now()+15000;while(!fs.existsSync(path.join(root,name))){if(Date.now()>until)throw Error('barrier timeout '+name);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}
const originalRead=fs.readFileSync,originalRename=fs.renameSync;let reads=0;
if(role==='B')fs.readFileSync=function(file,...args){
  const value=originalRead.call(this,file,...args);
  if(String(file)===retentionLockFile(deployment)&&++reads===2){mark('B-read');wait('B-resume');}
  return value;
};
if(role==='A'&&ledger==='ledger')fs.renameSync=function(from,to){
  if(String(to)===path.join(deployment.backupPath,'.retention','owners.json')){mark('A-ledger');wait('A-publish');}
  return originalRename.call(this,from,to);
};
try{
  await withBackupRetentionLock(deployment,async()=>{
    mark(role+'-entered');
    if(ledger==='ledger')rememberBackupErasure(deployment,'SYNTHETIC-'+role,'2026-10-11T00:00:00.000Z');
    mark(role+'-ready');wait(role+'-exit');
  });mark(role+'-result','OK');
}catch(error){mark(role+'-result',error.message);if(error.message!=='OFFSITE_BUSY')process.exitCode=1;}
