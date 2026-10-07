import express from 'express';
import {once} from 'node:events';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import twilio from 'twilio';
import {db,seed} from './namedReviewContact20261006.fixture.mjs';
import {installProductionVoice} from '../server/src/voice/productionVoiceRuntime.js';

const accountSid='AC'+'a'.repeat(32),from='+19025550100',origin='https://synthetic-voice.example.test';
const token='SYNTHETIC-twilio-signature-secret';
let sequence=0;
export async function until(predicate){
  const deadline=Date.now()+5000;while(Date.now()<deadline){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Synthetic voice session timed out');
}
export async function voiceHarness(t){
  const owner=seed(),to='+1902555'+String(++sequence).padStart(4,'0');
  db.prepare("INSERT INTO billingAccounts(ownerId,stripeCustomerId,stripeSubscriptionId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,'2026-10-06T12:00:00.000Z','2026-10-06T12:00:00.000Z','2026-10-06T12:00:00.000Z')").run(owner.id,'cus_SYNTHETIC_'+sequence,'sub_SYNTHETIC_'+sequence);
  db.prepare("UPDATE users SET planStatus='active' WHERE id=? AND role='owner'").run(owner.id);
  db.prepare("UPDATE businessProfiles SET twilioNumber=?,twilioNumberSid=?,existingPhoneNumber='+19025550199',phoneProvisioningStatus='provisioned',operatorEnabled=1,agentName='Synthetic Ava' WHERE ownerId=?").run(to,'PN_SYNTHETIC_'+sequence,owner.id);
  const connections=[],responses=new Map(),sockets=[];let callbacks;
  const client={live:{connect:async value=>{connections.push(value);callbacks=value.callbacks;return {sendRealtimeInput(){},sendClientContent(){},sendToolResponse(value){for(const result of value.functionResponses)responses.set(result.id,result.response);},async close(){}};}}};
  const app=express(),errors=[];
  const voice=installProductionVoice({app,database:db,bookingService:{},runtimeConfig:{voiceRuntime:true,providerWrites:true},env:{TWILIO_ACCOUNT_SID:accountSid,TWILIO_AUTH_TOKEN:token,PUBLIC_BASE_URL:origin,GEMINI_MODEL:'synthetic-model',JWT_SECRET:'SYNTHETIC-voice-secret-'.repeat(3)},googleClient:client,onError:code=>errors.push(code)});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const local='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{for(const ws of sockets)ws.terminate();await voice.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  async function connect(){
    const callSid='CA'+crypto.randomBytes(16).toString('hex'),params={AccountSid:accountSid,CallSid:callSid,From:from,To:to,Direction:'inbound'},route='/api/twilio/voice/incoming';
    const response=await fetch(local+route,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature(token,origin+route,params)},body:new URLSearchParams(params)});
    const xml=await response.text(),match=xml.match(/<Stream url="([^"]+)"/);if(response.status!==200||!match)throw Error('Synthetic signed call rejected: '+xml+' '+JSON.stringify(db.prepare('SELECT failureCode FROM calls WHERE callSid=? AND ownerId=?').get(callSid,owner.id)));
    const ws=new WebSocket(local.replace(/^http:/,'ws:')+new URL(match[1]).pathname,{headers:{'x-twilio-signature':twilio.getExpectedTwilioSignature(token,match[1],{})}});sockets.push(ws);await once(ws,'open');
    const streamSid='MZ'+crypto.randomBytes(16).toString('hex'),before=connections.length;
    ws.send(JSON.stringify({event:'connected',protocol:'Call',version:'1.0.0'}));
    ws.send(JSON.stringify({event:'start',sequenceNumber:'1',streamSid,start:{accountSid,callSid,streamSid,tracks:['inbound'],mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}}));
    await until(()=>connections.length>before);return {prompt:connections.at(-1).config.systemInstruction,callSid};
  }
  async function tool(name,args){
    const id=crypto.randomUUID();callbacks.onmessage({toolCall:{functionCalls:[{id,name,args}]}});await until(()=>responses.has(id));return responses.get(id);
  }
  return {owner,connect,tool,errors};
}
