// Synthetic, signed Twilio WebSocket load. No provider network calls are made.
import {writeFileSync} from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {harness,ACCOUNT,FROM} from '../../test/voiceLifecycle20261006Fixture.mjs';

const count=Number(process.argv[2]);
const durationMs=Number(process.argv[3]||120_000);
const cooldownMs=Number(process.argv[4]||120_000);
const output=process.argv[5];
if(![1,10,25,50].includes(count)||!Number.isSafeInteger(durationMs)||durationMs<=0||!Number.isSafeInteger(cooldownMs)||cooldownMs<0||!output)throw Error('Usage: voice-load.mjs <1|10|25|50> [duration-ms] [cooldown-ms] <output.json>');

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cpu=()=>{const x=process.cpuUsage();return {userMs:x.user/1000,systemMs:x.system/1000,totalMs:(x.user+x.system)/1000};};
const snapshot=()=>({wall:new Date().toISOString(),rssBytes:process.memoryUsage().rss,cpu:cpu()});
const pcm20ms=Buffer.alloc(480*2).toString('base64');
const mu20ms=Buffer.alloc(160,0xff).toString('base64');
const cleanups=[];
const f=await harness({after:fn=>cleanups.push(fn)},{install:{
  clock:()=>new Date(),
  env:{TWILIO_ACCOUNT_SID:ACCOUNT,TWILIO_AUTH_TOKEN:'synthetic-signing-key',TWILIO_API_KEY_SID:'SK'+'b'.repeat(32),TWILIO_API_KEY_SECRET:'synthetic-api-secret',PUBLIC_BASE_URL:'https://synthetic-voice.example.invalid',GEMINI_MODEL:'synthetic-live-model',GEMINI_API_KEY:'synthetic-never-live',JWT_SECRET:'synthetic-secret'.padEnd(64,'x'),VOICE_RUNTIME_ENABLED:'true',ALLOW_PROVIDER_WRITES:'true',VOICE_MAX_CONCURRENT:'100',VOICE_MAX_CONCURRENT_PER_OWNER:'100',VOICE_CALLER_DAILY_LIMIT:'1000'}
}});
const baseline=snapshot(),calls=[],errors=[];
let peak=baseline,active=true,framesOut=0,framesIn=0,marks=0,maxTickDelayMs=0;
const sampleTimer=setInterval(()=>{const x=snapshot();if(active&&x.rssBytes>peak.rssBytes)peak=x;},1000);
try{
  for(let i=0;i<count;i++){
    const c=await f.connect(i+1,'+1902555'+String(2000+i).padStart(4,'0'));
    c.seq=1;c.chunk=0;c.ws.on('message',raw=>{
      try{const value=JSON.parse(raw);if(value.event==='mark'){
        c.ws.send(JSON.stringify({event:'mark',sequenceNumber:String(++c.seq),streamSid:c.streamSid,mark:{name:value.mark.name}}));marks++;
      }}catch(error){errors.push(String(error));}
    });
    c.ws.on('error',error=>errors.push(String(error)));
    calls.push(c);
  }
  const connected=snapshot();
  const started=performance.now(),end=started+durationMs;
  let next=started,interval=0;
  await new Promise(resolve=>{
    const tick=()=>{
      const now=performance.now();maxTickDelayMs=Math.max(maxTickDelayMs,now-next);
      if(now>=end){clearTimeout(interval);resolve();return;}
      for(const c of calls){
        c.ws.send(JSON.stringify({event:'media',sequenceNumber:String(++c.seq),streamSid:c.streamSid,media:{track:'inbound',chunk:String(++c.chunk),timestamp:String((c.chunk-1)*20),payload:mu20ms}}));framesIn++;
        c.callback.onmessage({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:pcm20ms}}]}}});framesOut++;
      }
      next+=20;interval=setTimeout(tick,Math.max(0,next-performance.now()));
    };tick();
  });
  const paced=snapshot();
  if(paced.rssBytes>peak.rssBytes)peak=paced;
  active=false;
  for(const c of calls)c.ws.send(JSON.stringify({event:'stop',sequenceNumber:String(++c.seq),streamSid:c.streamSid,stop:{accountSid:ACCOUNT,callSid:c.params.CallSid}}));
  await sleep(2000);
  const ended=snapshot();
  const statuses=f.db.prepare('SELECT status,failureCode,COUNT(*) n FROM calls WHERE ownerId=? GROUP BY status,failureCode').all(f.owner);
  await sleep(cooldownMs);
  const afterCooldown=snapshot();
  const result={scenario:'signed-twilio-websocket-fake-google',calls:count,requestedDurationMs:durationMs,actualPacedMs:Math.round(performance.now()-started-cooldownMs-2000),cooldownMs,machine:{cpuModel:os.cpus()[0]?.model,cpuCount:os.cpus().length,node:process.version},baseline,connected,peak,paced,ended,afterCooldown,perAddedCall:{peakRssBytes:(peak.rssBytes-baseline.rssBytes)/count,peakCpuMs:(peak.cpu.totalMs-baseline.cpu.totalMs)/count,pacedCpuMs:(paced.cpu.totalMs-connected.cpu.totalMs)/count},framesIn,framesOut,markAcks:marks,maxTickDelayMs,statuses,errors:errors.concat(f.errors)};
  writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({calls:count,framesIn,framesOut,statuses,peakRssMB:peak.rssBytes/1048576,cpuMs:paced.cpu.totalMs-baseline.cpu.totalMs,errors:result.errors}));
  if(result.errors.length||statuses.some(s=>s.status==='FAILED'||s.status==='FALLBACK')||framesIn<Math.floor(durationMs/20)*count*.95)process.exitCode=1;
}finally{
  clearInterval(sampleTimer);
  for(const fn of cleanups.reverse())await fn();
}
