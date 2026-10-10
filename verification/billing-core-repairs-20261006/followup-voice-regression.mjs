// Real signed local HTTP + WebSocket, real production voice callbacks,
// synthetic Google live-session adapter; no provider network traffic.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {once} from 'node:events';
import {writeFileSync} from 'node:fs';
import express from 'express';
import WebSocket from 'ws';
import twilio from 'twilio';
import {migrateDatabase} from '../../server/src/migrations.js';
import {createBillingStateService} from '../../server/src/billingStateService.js';
import {installProductionVoice} from '../../server/src/voice/productionVoiceRuntime.js';
import {loadVoiceAccountContext} from '../../server/src/voice/voicePersistence.js';
const T=1791288000,owner='SYNTHETIC-voice-meter',ACCOUNT='AC'+'a'.repeat(32),FROM='+19025550100',TO='+19025550101',FALLBACK='+19025550199';
const origin='https://voice.example.invalid',secret='SYNTHETIC-signature-secret';let at=T*1000,connects=0;
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');migrateDatabase(db);
db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Meter Co','Operator','pending_payment','UTC','owner',?)").run(owner,owner+'@example.invalid',new Date(at).toISOString());
const billing=createBillingStateService({db,pricePlanMap:{price_op:'Operator'},clock:()=>new Date(at)});billing.registerBillingCustomer({ownerId:owner,stripeCustomerId:'cus_meter'});
billing.applyVerifiedStripeEvent({id:'evt_SYNTHETIC_trial',type:'customer.subscription.created',created:T,data:{object:{id:'sub_meter',customer:'cus_meter',status:'trialing',default_payment_method:'pm_SYNTHETIC',trial_start:T,trial_end:T+14*86400,items:{data:[{price:{id:'price_op'}}]}}}});
db.prepare("INSERT INTO businessProfiles(ownerId,existingPhoneNumber,twilioNumber,twilioNumberSid,phoneProvisioningStatus,operatorEnabled,agentName,knowledgeBaseJson,updatedAt) VALUES(?,?,?,'PN_SYNTHETIC','provisioned',1,'Synthetic Assistant',?,?)").run(owner,FALLBACK,TO,JSON.stringify({about:'Synthetic Meter Co',hours:'Weekdays'}),new Date(at).toISOString());
const fake={live:{connect:async()=>{connects++;return {sendRealtimeInput:()=>{},sendClientContent:()=>{},sendToolResponse:async()=>{},close:async()=>{}};}}};
const app=express(),errors=[],voice=installProductionVoice({app,database:db,runtimeConfig:{voiceRuntime:true,providerWrites:true},env:{TWILIO_ACCOUNT_SID:ACCOUNT,TWILIO_AUTH_TOKEN:secret,PUBLIC_BASE_URL:origin,GEMINI_MODEL:'SYNTHETIC-live',JWT_SECRET:'SYNTHETIC-handle'.padEnd(64,'x')},googleClient:fake,clock:()=>new Date(at),onError:code=>errors.push(code)});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;let ws;
async function until(fn){const deadline=Date.now()+10000;while(!fn()){assert.ok(Date.now()<deadline,'SYNTHETIC voice timeout '+JSON.stringify(errors));await new Promise(r=>setTimeout(r,10));}}
async function incoming(callSid){
 const route='/api/twilio/voice/incoming',params={AccountSid:ACCOUNT,CallSid:callSid,From:FROM,To:TO,Direction:'inbound'};
 const response=await fetch(base+route,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature(secret,origin+route,params)},body:new URLSearchParams(params)});assert.equal(response.status,200);return response.text();
}
try{
 const call='CA'+crypto.randomBytes(16).toString('hex'),xml=await incoming(call),stream=xml.match(/<Stream url="([^"]+)"/);assert.ok(stream,xml);
 ws=new WebSocket(base.replace(/^http:/,'ws:')+new URL(stream[1]).pathname,{headers:{'x-twilio-signature':twilio.getExpectedTwilioSignature(secret,stream[1],{})}});await once(ws,'open');const streamSid='MZ'+'c'.repeat(32);
 ws.send(JSON.stringify({event:'connected',protocol:'Call',version:'1.0.0'}));
 ws.send(JSON.stringify({event:'start',sequenceNumber:'1',streamSid,start:{accountSid:ACCOUNT,callSid:call,streamSid,tracks:['inbound'],mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}}));
 await until(()=>connects===1&&db.prepare('SELECT status FROM calls WHERE callSid=?').get(call).status==='CONNECTED');
 // Handwritten expected: local 3,601 seconds is pending (0 counted). The
 // signed receipt then confirms ceil(3,601/60)=61; trial overrun is absorbed.
 at+=3601*1000;
 ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid,stop:{accountSid:ACCOUNT,callSid:call}}));
 await until(()=>db.prepare('SELECT status FROM calls WHERE callSid=?').get(call).status==='COMPLETED');
 const stored=db.prepare('SELECT duration,minutesBilled,status FROM calls WHERE callSid=?').get(call);assert.equal(stored.duration,3601);assert.equal(stored.minutesBilled,61);
 const context=loadVoiceAccountContext(db,owner);assert.equal(context.minutesUsed,61);
 const beforeReceipt=await incoming('CA'+crypto.randomBytes(16).toString('hex'));assert.match(beforeReceipt,/<Stream /);
 const route='/api/twilio/voice/status',params={AccountSid:ACCOUNT,CallSid:call,From:FROM,To:TO,Direction:'inbound',CallStatus:'completed',CallDuration:'3601'};
 for(let n=0;n<2;n++){const response=await fetch(base+route,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature(secret,origin+route,params)},body:new URLSearchParams(params)});assert.equal(response.status,204);}
 const next=await incoming('CA'+crypto.randomBytes(16).toString('hex'));assert.doesNotMatch(next,/<Stream /);assert.match(next,/<Gather/);assert.doesNotMatch(next,/<Dial/);
 const result={syntheticOnly:true,experimentCount:1,rows:[{id:'V01-trial-cap-does-not-meter-real-call',expected:{durationSeconds:3601,minutesUsed:61,nextCall:'fallback'},actual:{stored,minutesUsed:context.minutesUsed,nextCallStartsAI:next.includes('<Stream '),errors}}]};
 console.log(JSON.stringify(result,null,2));
}finally{ws?.terminate();await voice.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}
