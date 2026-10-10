import './pricebookTestEnv.mjs';
import express from 'express';
import {installTelephonyOperationsSchema} from '../server/src/telephonyOperationsMigration.js';
import twilio from 'twilio';
import WebSocket from 'ws';
import {once} from 'node:events';
import {fixture,at} from './leadCaptureRepair20261006Fixture.mjs';
import {installProductionVoice} from '../server/src/voice/productionVoiceRuntime.js';
export const ACCOUNT='AC'+'a'.repeat(32),TO='+19025550101',FROM='+19025550100',ORIGIN='https://synthetic-voice.example.invalid',TOKEN='synthetic-signing-key';
export const env={TWILIO_ACCOUNT_SID:ACCOUNT,TWILIO_AUTH_TOKEN:TOKEN,TWILIO_API_KEY_SID:'SK'+'b'.repeat(32),TWILIO_API_KEY_SECRET:'synthetic-api-secret',PUBLIC_BASE_URL:ORIGIN,GEMINI_MODEL:'synthetic-live-model',GEMINI_API_KEY:'synthetic-never-live',JWT_SECRET:'synthetic-secret'.padEnd(64,'x'),VOICE_RUNTIME_ENABLED:'true',ALLOW_PROVIDER_WRITES:'true'};
export async function until(predicate){for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Synthetic condition timed out');}
export async function harness(t,options={}){
  let disposeDatabase;const f=fixture({after:fn=>{disposeDatabase=fn;}},options.filename),{db}=f,owner='synthetic-a',callbacks=[],responses=new Map(),errors=[],writes=[],sockets=[];
  db.prepare("UPDATE users SET plan='Operator' WHERE id=?").run(owner);
  db.prepare("UPDATE businessProfiles SET existingPhoneNumber='+19025550199',twilioNumber=?,twilioNumberSid=?,phoneProvisioningStatus='provisioned',operatorEnabled=1,agentName='Sam',knowledgeBaseJson=? WHERE ownerId=?").run(TO,'PN'+'c'.repeat(32),JSON.stringify({about:'Synthetic business',hours:'Monday to Friday',transferWindows:Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[{start:'00:00',end:'23:59'}]]))}),owner);
  const googleClient={live:{connect:async input=>{options.onConnect?.(input);callbacks.push(input.callbacks);if(options.fail)throw Error('Synthetic model failure');return {sendRealtimeInput(){},sendClientContent(){},sendToolResponse(input){for(const r of input.functionResponses)responses.set(r.id,r.response);},close(){if(options.closeText)input.callbacks.onmessage({serverContent:{inputTranscription:{text:options.closeText},outputTranscription:{text:'Final provider transcript'}}});}};}}};
  const twilioClient={messages:{create:async input=>{writes.push(['sms',input]);return {sid:'SM'+'d'.repeat(32),status:'queued'};}},calls:sid=>({update:async input=>{writes.push(['call',sid,input]);return {sid,status:'in-progress'};}})};
  installTelephonyOperationsSchema(db);options.beforeInstall?.(f);const app=express();
  const runtime=installProductionVoice({app,database:db,runtimeConfig:{voiceRuntime:true,providerWrites:true},env,googleClient,twilioClient,clock:()=>new Date(at),onError:code=>errors.push(code),...options.install});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const local='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{await runtime.close();for(const ws of sockets)ws.terminate();server.closeAllConnections();await new Promise(r=>server.close(r));disposeDatabase();});
  const params=(n=1,from=FROM)=>({AccountSid:ACCOUNT,CallSid:'CA'+n.toString(16).padStart(32,'0'),To:TO,From:from,Direction:'inbound'});
  async function post(path,body=params()){return fetch(local+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature(TOKEN,ORIGIN+path,body)},body:new URLSearchParams(body)});}
  async function incoming(n=1,from=FROM,forwardedFrom=null){const p={...params(n,from),...(forwardedFrom?{ForwardedFrom:forwardedFrom}:{})},response=await post('/api/twilio/voice/incoming',p);return {status:response.status,xml:await response.text(),params:p};}
  async function connect(n=1,from=FROM,forwardedFrom=null){const initial=callbacks.length;const result=await incoming(n,from,forwardedFrom),url=result.xml.match(/<Stream url="([^"]+)"/)?.[1];if(!url)throw Error(result.xml);const ws=new WebSocket(local.replace('http:','ws:')+new URL(url).pathname,{headers:{'x-twilio-signature':twilio.getExpectedTwilioSignature(TOKEN,url,{})}});sockets.push(ws);await once(ws,'open');const streamSid='MZ'+n.toString(16).padStart(32,'0');ws.send(JSON.stringify({event:'connected',protocol:'Call',version:'1.0.0'}));ws.send(JSON.stringify({event:'start',sequenceNumber:'1',streamSid,start:{accountSid:ACCOUNT,callSid:result.params.CallSid,streamSid,tracks:['inbound'],mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}}));await until(()=>callbacks.length>initial||options.fail&&ws.readyState===3);return {...result,ws,streamSid,callback:callbacks.at(-1),fallback:new URL(result.xml.match(/<Redirect method="POST">([^<]+)/)[1]).pathname};}
  async function tool(callback,name,args,id='synthetic-tool-'+responses.size){callback.onmessage({toolCall:{functionCalls:[{id,name,args}]}});await until(()=>responses.has(id));return responses.get(id);}
  return {...f,owner,callbacks,responses,errors,writes,runtime,post,params,incoming,connect,tool};
}
