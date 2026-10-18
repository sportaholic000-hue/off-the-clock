// Local synthetic verification capture. Does not deploy or contact providers.
import {spawn} from 'node:child_process';
import {writeFileSync,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
const [prefix,command,...args]=process.argv.slice(2);
if(!prefix||!command)throw Error('Usage: capture.mjs evidence-prefix command [args...]');
const meta={command,args,cwd:process.cwd(),node:process.version,startedAt:new Date().toISOString(),environment:{PRICEBOOK_PATH:'created per worker by test/pricebookTestEnv.mjs',providers:'synthetic injected Google/Twilio clients',TMPDIR:process.env.TMPDIR}};
writeFileSync(prefix+'.command.json',JSON.stringify(meta,null,2)+'\n');
const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});
let error;child.on('error',e=>{error={code:e.code,message:e.message};});
const streams=Promise.allSettled([pipeline(child.stdout,createWriteStream(prefix+'.stdout.log')),pipeline(child.stderr,createWriteStream(prefix+'.stderr.log'))]);
const result=await new Promise(resolve=>child.on('close',(exitCode,signal)=>resolve({exitCode,signal})));
const outputs=await streams;
const finished={...meta,...result,finishedAt:new Date().toISOString(),...(error?{error}:{}),outputErrors:outputs.filter(r=>r.status==='rejected').map(r=>String(r.reason))};
writeFileSync(prefix+'.result.json',JSON.stringify(finished,null,2)+'\n');
console.log(JSON.stringify(finished));process.exitCode=result.exitCode??1;
