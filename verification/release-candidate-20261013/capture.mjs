import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../..');
const [label,command,...args]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(label)||!command)throw Error('label and command required');
const out=fs.openSync(path.join(directory,label+'.stdout.log'),'wx');
const err=fs.openSync(path.join(directory,label+'.stderr.log'),'wx');
const startedAt=new Date().toISOString();
let result;
try {result=spawnSync(command,args,{cwd:root,env:process.env,stdio:['ignore',out,err]});}
finally {fs.closeSync(out);fs.closeSync(err);}
const evidence={command:[command,...args],cwd:root,startedAt,finishedAt:new Date().toISOString(),node:process.version,
  nodeExecutable:process.execPath,pathPrefix:process.env.PATH.split(path.delimiter)[0],tmpdir:process.env.TMPDIR,
  fixtureEvidenceDirectory:process.env.CI_RUNNER_EVIDENCE_DIR||null,pid:result.pid,status:result.status,signal:result.signal,
  error:result.error?{code:result.error.code,message:result.error.message}:null};
fs.writeFileSync(path.join(directory,label+'.execution.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(evidence));process.exitCode=result.status??1;
