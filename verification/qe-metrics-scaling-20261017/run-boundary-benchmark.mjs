import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const worker=fileURLToPath(new URL('./boundary-worker.mjs',import.meta.url));
const timeoutArg=process.argv.find(arg=>arg.startsWith('--timeout-ms='));
const outputArg=process.argv.find(arg=>arg.startsWith('--output='));
const timeoutMs=timeoutArg?Number(timeoutArg.split('=')[1]):15_000;
if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw new Error('Invalid watchdog timeout.');

const run=mode=>new Promise(resolve=>{
  const startedAt=new Date().toISOString();
  const started=performance.now();
  const child=spawn(process.execPath,[worker,mode],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timedOut=false;
  child.stdout.on('data',chunk=>stdout+=chunk);
  child.stderr.on('data',chunk=>stderr+=chunk);
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
  child.on('error',error=>stderr+=`${error.name}: ${error.message}\n`);
  child.on('close',(exitCode,signal)=>{
    clearTimeout(timer);
    let measurement=null,parseError=null;
    try{measurement=stdout.trim()?JSON.parse(stdout.trim()):null;}catch(error){parseError=error.message;}
    resolve({mode,startedAt,endedAt:new Date().toISOString(),elapsedMs:Number((performance.now()-started).toFixed(3)),timeoutMs,timedOut,exitCode,signal,measurement,parseError,stderr});
  });
});

const output={applicationCommit:process.env.APPLICATION_COMMIT||null,runnerNode:process.version,runs:[]};
for(const mode of ['arithmetic','metrics'])output.runs.push(await run(mode));
const serialized=JSON.stringify(output,null,2)+'\n';
if(outputArg)writeFileSync(outputArg.slice('--output='.length),serialized);
process.stdout.write(serialized);
if(output.runs.some(run=>run.timedOut||run.exitCode!==0||run.signal||!run.measurement))process.exitCode=1;
