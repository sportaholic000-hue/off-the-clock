// Five rounds in ONE production voice runtime/process, with synthetic providers only.
// Adapted from bc6309701da3b7b68c866cc65a30ddb9f834e289's voice-load.mjs.
// That harness retains all sockets/callbacks in arrays. This driver keeps only
// active fake clients, so test bookkeeping does not masquerade as a runtime leak.
import '../../test/pricebookTestEnv.mjs';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {writeHeapSnapshot,getHeapStatistics} from 'node:v8';
import os from 'node:os';
import express from 'express';
import twilio from 'twilio';
import WebSocket,{WebSocketServer} from 'ws';
import {fixture} from '../../test/leadCaptureRepair20261006Fixture.mjs';
import {installTelephonyOperationsSchema} from '../../server/src/telephonyOperationsMigration.js';
import {installProductionVoice} from '../../server/src/voice/productionVoiceRuntime.js';

const output=process.argv[2],snapshotDirectory=process.argv[3];
if(!output||!snapshotDirectory||typeof global.gc!=='function')throw Error('Usage: node --expose-gc verification/load-20261009b/voice-load.mjs <output.json> <snapshot-directory>');
const count=50,rounds=5,durationMs=120_000,cooldownMs=120_000;
const ACCOUNT='AC'+'a'.repeat(32),TO='+19025550101',ORIGIN='https://synthetic-voice.example.invalid',TOKEN='synthetic-signing-key';
const owner='synthetic-a',cleanups=[],errors=[],clients=new Set(),modelSessions=new Map();
let modelSerial=0,serverSockets,unexpectedProviderWrites=0;
const f=fixture({after:fn=>cleanups.push(fn)}),{db,ownerQuery}=f;
ownerQuery("UPDATE users SET plan='Operator' WHERE id=@ownerId").run({ownerId:owner});
ownerQuery("UPDATE businessProfiles SET existingPhoneNumber='+19025550199',twilioNumber=?,twilioNumberSid=?,phoneProvisioningStatus='provisioned',operatorEnabled=1,agentName='Sam',knowledgeBaseJson=? WHERE ownerId=?")
  .run(TO,'PN'+'c'.repeat(32),JSON.stringify({about:'[SYNTHETIC] business',hours:'Monday to Friday'}),owner);
installTelephonyOperationsSchema(db);
const googleClient={live:{connect:async input=>{
  const id=++modelSerial;modelSessions.set(id,input.callbacks);
  return {sendRealtimeInput(){},sendClientContent(){},sendToolResponse(){throw Error('No synthetic tool request was sent');},close(){modelSessions.delete(id);}};
}}};
const forbiddenWrite=async()=>{unexpectedProviderWrites++;throw Error('Unexpected synthetic provider write');};
const twilioClient={messages:{create:forbiddenWrite},calls:()=>({update:forbiddenWrite})};
const app=express(),runtime=installProductionVoice({app,database:db,googleClient,twilioClient,
  WebSocketServerClass:class extends WebSocketServer{constructor(options){super(options);serverSockets=this.clients;}},
  runtimeConfig:{voiceRuntime:true,providerWrites:true},clock:()=>new Date(),onError:code=>errors.push(code),
  env:{TWILIO_ACCOUNT_SID:ACCOUNT,TWILIO_AUTH_TOKEN:TOKEN,TWILIO_API_KEY_SID:'SK'+'b'.repeat(32),TWILIO_API_KEY_SECRET:'synthetic-api-secret',PUBLIC_BASE_URL:ORIGIN,GEMINI_MODEL:'synthetic-live-model',GEMINI_API_KEY:'synthetic-never-live',JWT_SECRET:'synthetic-secret'.padEnd(64,'x'),VOICE_RUNTIME_ENABLED:'true',ALLOW_PROVIDER_WRITES:'true',VOICE_MAX_CONCURRENT:'100',VOICE_MAX_CONCURRENT_PER_OWNER:'100',VOICE_CALLER_DAILY_LIMIT:'1000'}});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const local='http://127.0.0.1:'+server.address().port;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let i=0;i<1000;i++){if(predicate())return;await sleep(10);}throw Error('Synthetic condition timed out: '+JSON.stringify(counts()));}
const counts=()=>({voiceSessions:runtime.boundary.activeSessionCount,serverWebSockets:serverSockets.size,clientWebSockets:clients.size,fakeGoogleSessions:modelSessions.size});
function sample(){let memory,measurementSource='process.memoryUsage',rssUnavailable=null;try{memory=process.memoryUsage();}catch(error){if(error.code!=='ENOENT'||error.syscall!=='uv_resident_set_memory')throw error;const heap=getHeapStatistics();memory={rss:null,heapUsed:heap.used_heap_size,heapTotal:heap.total_heap_size,external:heap.external_memory,arrayBuffers:null};measurementSource='v8.getHeapStatistics';rssUnavailable='Sandbox does not expose /proc; uv_resident_set_memory returns ENOENT.';}return {measurementSource,rssUnavailable,wall:new Date().toISOString(),elapsedMs:Math.round(performance.now()),rss:memory.rss,heapUsed:memory.heapUsed,heapTotal:memory.heapTotal,external:memory.external,arrayBuffers:memory.arrayBuffers,counts:counts()};}
async function collect(){global.gc();global.gc();await new Promise(resolve=>setImmediate(resolve));return sample();}
async function connect(number){
  const params={AccountSid:ACCOUNT,CallSid:'CA'+number.toString(16).padStart(32,'0'),To:TO,From:'+1902555'+String(2000+number).padStart(4,'0'),Direction:'inbound'},path='/api/twilio/voice/incoming';
  const initial=modelSerial,response=await fetch(local+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature(TOKEN,ORIGIN+path,params)},body:new URLSearchParams(params)}),xml=await response.text();
  assert.equal(response.status,200,xml);const url=xml.match(/<Stream url="([^"]+)"/)?.[1];assert.ok(url,xml);
  const ws=new WebSocket(local.replace('http:','ws:')+new URL(url).pathname,{headers:{'x-twilio-signature':twilio.getExpectedTwilioSignature(TOKEN,url,{})}});
  clients.add(ws);ws.once('close',()=>clients.delete(ws));ws.on('error',error=>errors.push(String(error)));await once(ws,'open');
  const streamSid='MZ'+number.toString(16).padStart(32,'0');
  ws.send(JSON.stringify({event:'connected',protocol:'Call',version:'1.0.0'}));
  ws.send(JSON.stringify({event:'start',sequenceNumber:'1',streamSid,start:{accountSid:ACCOUNT,callSid:params.CallSid,streamSid,tracks:['inbound'],mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}}));
  await until(()=>modelSerial>initial);
  return {ws,params,streamSid,callback:modelSessions.get(modelSerial),seq:1,chunk:0};
}
const pcm20ms=Buffer.alloc(480*2).toString('base64'),mu20ms=Buffer.alloc(160,0xff).toString('base64');
async function runCalls(round){
  const calls=[];let framesIn=0,framesOut=0,marks=0,maxTickDelayMs=0;
  try{
    for(let i=0;i<count;i++){
      const c=await connect((round-1)*count+i+1);
      c.ws.on('message',raw=>{try{const value=JSON.parse(raw);if(value.event==='mark'){c.ws.send(JSON.stringify({event:'mark',sequenceNumber:String(++c.seq),streamSid:c.streamSid,mark:{name:value.mark.name}}));marks++;}}catch(error){errors.push(String(error));}});
      calls.push(c);
    }
    assert.deepEqual(counts(),{voiceSessions:50,serverWebSockets:50,clientWebSockets:50,fakeGoogleSessions:50});
    const connected=sample(),started=performance.now(),end=started+durationMs;let next=started;
    await new Promise(resolve=>{
      const tick=()=>{
        const at=performance.now();maxTickDelayMs=Math.max(maxTickDelayMs,at-next);
        if(at>=end){resolve();return;}
        for(const c of calls){
          c.ws.send(JSON.stringify({event:'media',sequenceNumber:String(++c.seq),streamSid:c.streamSid,media:{track:'inbound',chunk:String(++c.chunk),timestamp:String((c.chunk-1)*20),payload:mu20ms}}));framesIn++;
          c.callback.onmessage({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:pcm20ms}}]}}});framesOut++;
        }
        next+=20;setTimeout(tick,Math.max(0,next-performance.now()));
      };tick();
    });
    const actualPacedMs=performance.now()-started,paced=sample();
    for(const c of calls)c.ws.send(JSON.stringify({event:'stop',sequenceNumber:String(++c.seq),streamSid:c.streamSid,stop:{accountSid:ACCOUNT,callSid:c.params.CallSid}}));
    await until(()=>modelSessions.size===0);
    const afterStopBeforePeerClose=sample();
    // The synthetic Twilio peer closes its WebSocket after sending stop. The
    // original driver left it open, retaining an active transport during cooldown.
    for(const c of calls)c.ws.close(1000,'Synthetic phone call ended');
    await until(()=>runtime.boundary.activeSessionCount===0&&clients.size===0&&modelSessions.size===0&&serverSockets.size===0);await runtime.boundary.whenIdle();
    assert.ok(framesIn>=Math.floor(durationMs/20)*count*.95);assert.equal(framesIn,framesOut);
    return {connected,paced,afterStopBeforePeerClose,actualPacedMs,framesIn,framesOut,markAcks:marks,maxTickDelayMs};
  }finally{
    // Drop per-call driver references before cooldown/GC, without restarting runtime.
    for(const c of calls){c.ws.removeAllListeners('message');if(c.ws.readyState!==WebSocket.CLOSED)c.ws.terminate();}
    calls.length=0;
  }
}
mkdirSync(resolve(snapshotDirectory),{recursive:true});
const result={scenario:'five-round-signed-twilio-websocket-fake-google',sourceBase:'94c0d63f7eace16eac4c97f5a95712eb443118d6',referenceLoadCommit:'bc6309701da3b7b68c866cc65a30ddb9f834e289',pid:process.pid,config:{rounds,callsPerRound:count,durationMs,cooldownMs,gcCallsPerCooldown:2},machine:{node:process.version,cpuModel:os.cpus()[0]?.model,cpuCount:os.cpus().length},units:'bytes',baselineBeforeGc:sample(),baselineAfterGc:await collect(),rounds:[],heapSnapshots:[],errors};
const save=()=>writeFileSync(output,JSON.stringify(result,null,2)+'\n');
save();console.log(JSON.stringify({stage:'baseline',sample:result.baselineAfterGc}));
try{
  for(let round=1;round<=rounds;round++){
    console.log(JSON.stringify({stage:'calls',round}));const traffic=await runCalls(round),ended=sample();
    console.log(JSON.stringify({stage:'cooldown',round,counts:counts()}));
    for(let waited=0;waited<cooldownMs;waited+=30_000)await sleep(Math.min(30_000,cooldownMs-waited));
    const beforeGc=sample(),afterGc=await collect();
    assert.deepEqual(afterGc.counts,{voiceSessions:0,serverWebSockets:0,clientWebSockets:0,fakeGoogleSessions:0});
    const statuses=ownerQuery('SELECT status,failureCode,COUNT(*) n FROM calls WHERE ownerId=? GROUP BY status,failureCode').all(owner);
    assert.equal(statuses.reduce((n,row)=>n+row.n,0),round*count);assert.ok(statuses.every(row=>row.status==='COMPLETED'&&!row.failureCode));
    result.rounds.push({round,...traffic,ended,actualCooldownMs:beforeGc.elapsedMs-ended.elapsedMs,beforeGc,afterGc,statuses,sqlitePages:db.pragma('page_count',{simple:true})});
    save();console.log(JSON.stringify({stage:'measured',round,beforeGc,afterGc}));
    // Capture round 1 now; if round 5 is higher, it cannot be reconstructed later.
    if(round===1||round===5&&afterGc.heapUsed>result.rounds[0].afterGc.heapUsed){
      const file=resolve(snapshotDirectory,`round-${round}.heapsnapshot`);writeHeapSnapshot(file);result.heapSnapshots.push({round,file});save();
    }
  }
  result.unexpectedProviderWrites=unexpectedProviderWrites;result.heapUsedAfterGcDeltas=result.rounds.map((r,i)=>r.afterGc.heapUsed-(i?result.rounds[i-1].afterGc.heapUsed:result.baselineAfterGc.heapUsed));
  assert.equal(unexpectedProviderWrites,0);assert.deepEqual(errors,[]);result.completed=true;save();
}finally{
  await runtime.close();for(const ws of clients)ws.terminate();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));for(const cleanup of cleanups.reverse())await cleanup();
}
