// Synthetic/local evidence recorder; does not alter command success or rerun.
import {spawn} from 'node:child_process';
import {openSync,closeSync,writeFileSync,existsSync} from 'node:fs';
const [label,command,...args]=process.argv.slice(2),base=new URL('./'+label,import.meta.url);
if(!label||!command||existsSync(new URL(base+'.execution.json')))throw Error('Unique label and command required');
const stdout=openSync(new URL(base+'.stdout.log'),'wx'),stderr=openSync(new URL(base+'.stderr.log'),'wx');
const startedAt=new Date().toISOString();
const child=spawn(command,args,{stdio:['ignore',stdout,stderr],env:process.env});
let error;child.on('error',e=>{error={code:e.code,message:e.message};});
child.on('close',(code,signal)=>{closeSync(stdout);closeSync(stderr);const result={command:[command,...args],cwd:process.cwd(),node:process.version,startedAt,endedAt:new Date().toISOString(),code,signal,error};writeFileSync(new URL(base+'.execution.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=code??1;});
