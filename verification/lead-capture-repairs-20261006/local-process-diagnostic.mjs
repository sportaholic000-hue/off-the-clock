// Scratch-environment diagnosis only. No application code or test gate changes.
// Record exit/error metadata, never arguments, customer data or credentials.
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {appendFileSync} from 'node:fs';
const log=entry=>{try{appendFileSync(process.env.LEAD_CAPTURE_PROCESS_DIAGNOSTIC_LOG,JSON.stringify({pid:process.pid,...entry})+'\n');}catch{}};
const spawn=childProcess.spawn,spawnSync=childProcess.spawnSync;
childProcess.spawn=function(...args){const child=Reflect.apply(spawn,this,args);child.on('error',error=>log({event:'spawn-error',childPid:child.pid,code:error.code}));child.on('exit',(code,signal)=>log({event:'child-exit',childPid:child.pid,code,signal}));return child;};
childProcess.spawnSync=function(...args){const result=Reflect.apply(spawnSync,this,args);log({event:'spawnSync-return',status:result.status,signal:result.signal,errorCode:result.error?.code});return result;};
syncBuiltinESMExports();process.on('exit',code=>log({event:'process-exit',code}));
