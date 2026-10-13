import cp from 'node:child_process';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const mode="checker-spawn-error",spawn=cp.spawn,spawnSync=cp.spawnSync,createWriteStream=fs.createWriteStream;
cp.spawn=(command,args,options)=>{
  fs.writeFileSync('selected-command.json',JSON.stringify({command,args}));
  if(mode==='spawn-throw')throw Error('SYNTHETIC_SYNCHRONOUS_SPAWN_FAILURE');
  if(mode==='spawn-error')return spawn('./SYNTHETIC_MISSING_EXECUTABLE',args,options);
  return spawn(process.execPath,['synthetic-child.mjs'],options);
};
cp.spawnSync=(command,args,options)=>{
  if(mode==='checker-spawn-error')return spawnSync('./SYNTHETIC_MISSING_CHECKER',args,options);
  if(mode==='checker-signal')return spawnSync(process.execPath,['-e',"process.kill(process.pid,'SIGTERM')"],options);
  if(mode==='checker-exit')return spawnSync(process.execPath,['-e','process.exit(9)'],options);
  return spawnSync(command,args,options);
};
if(mode==='output-write-error'||mode==='output-close-error')fs.createWriteStream=(filename)=>createWriteStream(filename,{fs:{
  open:fs.open,
  write(fd,buffer,offset,length,position,callback){
    if(mode==='output-write-error')callback(Object.assign(Error('SYNTHETIC_DISK_FULL'),{code:'ENOSPC'}));
    else fs.write(fd,buffer,offset,length,position,callback);
  },
  close(fd,callback){fs.close(fd,error=>callback(error||(mode==='output-close-error'?Object.assign(Error('SYNTHETIC_CLOSE_FAILURE'),{code:'EIO'}):null)));}
}});
syncBuiltinESMExports();
