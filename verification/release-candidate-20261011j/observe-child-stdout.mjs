// Diagnostic only: preserve spawn behavior and record the SIGKILL test's readiness bytes.
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const spawn=childProcess.spawn;
childProcess.spawn=function(...args){
  const child=spawn.apply(this,args);
  if(args[1]?.some(value=>String(value).includes("console.log('HELD')")))child.stdout.on('data',data=>console.error('SIGKILL child stdout:',JSON.stringify(String(data))));
  return child;
};
syncBuiltinESMExports();
