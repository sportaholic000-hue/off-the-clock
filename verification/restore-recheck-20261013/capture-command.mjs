// Evidence capture only. Does not alter the command or its result.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const [label,command,...args]=process.argv.slice(2);
if(!label||!/^[a-z0-9-]+$/.test(label)||!command)throw Error('label and command required');
const stdout=path.join(here,label+'.stdout.log'),stderr=path.join(here,label+'.stderr.log');
for(const name of [stdout,stderr,path.join(here,label+'.execution.json')])if(fs.existsSync(name))throw Error('Evidence already exists: '+name);
const startedAt=new Date().toISOString();
const out=fs.openSync(stdout,'wx'),err=fs.openSync(stderr,'wx');
let execution;
try {execution=spawnSync(command,args,{cwd:root,env:process.env,stdio:['ignore',out,err]});}
finally {fs.closeSync(out);fs.closeSync(err);}
const result={label,command:[command,...args],cwd:root,startedAt,finishedAt:new Date().toISOString(),
  recorderPid:process.pid,childPid:execution.pid,node:process.version,nodeExecutable:process.execPath,
  platform:process.platform,arch:process.arch,environmentOverrides:{TMPDIR:process.env.TMPDIR,
    nodePathPrefix:path.dirname(process.execPath)},exitStatus:execution.status,signal:execution.signal,
  error:execution.error?{code:execution.error.code,message:execution.error.message}:null,stdout:path.basename(stdout),stderr:path.basename(stderr)};
fs.writeFileSync(path.join(here,label+'.execution.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
process.exitCode=execution.status??1;
