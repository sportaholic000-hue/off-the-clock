import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const worker=fileURLToPath(new URL('./benchmark-worker.mjs',import.meta.url));
const counts=process.argv.slice(2).filter(arg=>!arg.startsWith('--')).map(Number);
const timeoutArg=process.argv.find(arg=>arg.startsWith('--timeout-ms='));
const outputArg=process.argv.find(arg=>arg.startsWith('--output='));
const timeoutMs=timeoutArg?Number(timeoutArg.split('=')[1]):60000;
if(!counts.length||counts.some(value=>!Number.isSafeInteger(value)||value<1))throw new Error('Supply one or more positive record counts.');
if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw new Error('Invalid watchdog timeout.');

const run=count=>new Promise(resolve=>{
  const startedAt=new Date().toISOString();
  const child=spawn(process.execPath,[worker,String(count)],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timedOut=false;
  child.stdout.on('data',chunk=>stdout+=chunk);
  child.stderr.on('data',chunk=>stderr+=chunk);
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
  child.on('error',error=>stderr+=`${error.name}: ${error.message}\n`);
  child.on('close',(exitCode,signal)=>{
    clearTimeout(timer);
    let measurement=null,parseError=null;
    try{measurement=stdout.trim()?JSON.parse(stdout.trim()):null;}catch(error){parseError=error.message;}
    resolve({count,startedAt,endedAt:new Date().toISOString(),timeoutMs,timedOut,exitCode,signal,measurement,parseError,stderr});
  });
});

const result={applicationCommit:process.env.APPLICATION_COMMIT||null,runnerNode:process.version,runs:[]};
for(const count of counts)result.runs.push(await run(count));
const serialized=JSON.stringify(result,null,2)+'\n';
if(outputArg)writeFileSync(outputArg.slice('--output='.length),serialized);
process.stdout.write(serialized);
if(result.runs.some(run=>run.timedOut||run.exitCode!==0||run.signal||!run.measurement))process.exitCode=1;
