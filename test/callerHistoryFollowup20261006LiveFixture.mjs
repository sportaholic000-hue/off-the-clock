import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import express from 'express';
import WebSocket from 'ws';
import twilio from 'twilio';
import {once} from 'node:events';
import {CREATE_TABLE_STATEMENTS,CREATE_INDEX_STATEMENTS} from '../server/src/schema.js';
import {createBookingService} from '../server/src/bookingService.js';
import {installProductionVoice} from '../server/src/voice/productionVoiceRuntime.js';
import {validateVoiceToolCall,getVoiceToolDeclarations} from '../server/src/voice/toolSchemas.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';
import {projectVoiceQuote} from '../server/src/voice/voiceQuotePresentation.js';
import {saveApplicationBook,readApplicationBook,approveApplicationService,applicationStatus,bookQuoteStatuses,applicationStatusCacheCounts} from '../server/src/quoteDoneBridge.js';
import {PRICE_BASIS_CATEGORIES} from '../server/quote-engine-vnext/index.js';

const ACCOUNT='AC'+'a'.repeat(32),FROM='+19025550100',TO='+19025550101',FALLBACK='+19025550199';
const ORIGIN='https://voice.example.test',NOW='2026-10-05T12:00:00.000Z';
const TOKEN='synthetic-signature-secret',HANDLE='x'.repeat(43),clock=()=>new Date(NOW);
// Use the engine's own category list so synthetic services cannot drift from the current contract.
const categories=[...PRICE_BASIS_CATEGORIES];
const map=value=>Object.fromEntries(categories.map(key=>[key,value]));
async function until(predicate,label='condition'){
  const deadline=Date.now()+10000;while(Date.now()<deadline){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Timed out waiting for '+label);
}
function provider({fail=false}={}){
  let callbacks;const responses=new Map(),connects=[],sent=[];
  const session={sendRealtimeInput:value=>sent.push(value),sendClientContent:value=>sent.push(value),sendToolResponse:async value=>{for(const item of value.functionResponses)responses.set(item.id,item.response);},close:async()=>{}};
  return {connects,sent,client:{live:{connect:async value=>{connects.push(value);if(fail)throw Error('synthetic session-start failure');callbacks=value.callbacks;return session;}}},
    async speak(text){callbacks.onmessage({serverContent:{inputTranscription:{text}}});await new Promise(resolve=>setImmediate(resolve));},
    async tool(name,args,id=crypto.randomUUID()){responses.delete(id);callbacks.onmessage({toolCall:{functionCalls:[{id,name,args}]}});await until(()=>responses.has(id),'tool '+name);return responses.get(id);}
  };
}
function seedDb(db,owner){
  db.pragma('foreign_keys = ON');for(const sql of CREATE_TABLE_STATEMENTS)db.exec(sql);for(const sql of CREATE_INDEX_STATEMENTS)db.exec(sql);
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'synthetic','Synthetic','Synthetic Voice Co','QuoteDone','active','UTC','owner',?)").run(owner,owner+'@example.invalid',NOW);
  db.prepare("INSERT INTO businessProfiles(ownerId,existingPhoneNumber,twilioNumber,twilioNumberSid,phoneProvisioningStatus,operatorEnabled,agentName,knowledgeBaseJson,updatedAt) VALUES(?,?,?,'PN_SYNTHETIC','provisioned',1,'Synthetic Assistant',?,?)").run(owner,FALLBACK,TO,JSON.stringify({serviceArea:{mode:'all',cities:[]}}),NOW);
}
function seedBook(owner){
  const loaded=readApplicationBook(owner);
  const defaults={currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:10,disposalFee:0,permitFee:0,taxMode:'TAX_ALL',taxPercent:15,rangeBufferPercent:0,markupApplies:map(true),peakMonths:[],peakSurchargePercent:0};
  const common={source:'MANUAL',active:true,feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:map('sell_price'),taxabilityByCategory:map(false)};
  const custom={...common,id:crypto.randomUUID(),serviceType:'CUSTOM',service:'Synthetic fixed visit',pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price:100,minimumJob:0},feeRules:{...common.feeRules,travel:'customer_selected'},tiers:[{name:'Basic',overrides:{}},{name:'Premium',overrides:{price:150}}]};
  const mulch={...common,id:crypto.randomUUID(),serviceType:'LANDSCAPING_MULCH',service:'Synthetic cedar mulch',knownOfferings:{mulchType:{cedar_mulch:crypto.randomUUID()}},pricing:{mulchMaterialPerYard:{cedar_mulch:40},mulchInstallLaborPerYard:50,minimumServiceCharge:0},tiers:[]};
  saveApplicationBook(owner,{...loaded,defaults,services:[custom,mulch]});
  for(const service of [custom,mulch])approveApplicationService(owner,service.id,{revision:readApplicationBook(owner).revision,confirmConfiguration:true,confirmLegacySettings:true});
  return {custom,mulch};
}
function seedBooking(db,owner,serviceId){
  const weekly=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[{start:'09:00',end:'17:00'}]]));
  db.prepare(`INSERT INTO bookingSettings(ownerId,revision,timezone,provider,calendarId,weeklyAvailabilityJson,blackoutsJson,bookingHorizonDays,minimumNoticeMinutes,slotIncrementMinutes,bufferBeforeMinutes,bufferAfterMinutes,directBookingEnabled,updatedAt) VALUES(?,'synthetic-settings','UTC','google','synthetic-calendar',?,'[]',30,0,30,0,0,1,?)`).run(owner,JSON.stringify(weekly),NOW);
  db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt) VALUES(?,?,'synthetic-policy','site_visit_first',30,1,?)").run(owner,serviceId,NOW);
}
export async function harness({fail=false}={}){
  const temporary=mkdtempSync(path.join(tmpdir(),'voice-path-')),db=new Database(path.join(temporary,'synthetic.sqlite')),owner=crypto.randomUUID();
  seedDb(db,owner);const {custom,mulch}=seedBook(owner);seedBooking(db,owner,custom.id);let calendarCreates=0;
  const calendar={listBusy:async()=>[],createEvent:async input=>{calendarCreates++;assert.equal(input.ownerId,owner);return {status:'CONFIRMED',eventId:input.eventId,startAtUtc:input.startAtUtc,endAtUtc:input.endAtUtc};}};
  const booking=createBookingService({db,calendar,clock,slotTokenSecret:'synthetic-booking-secret'.padEnd(64,'x')});
  const fake=provider({fail}),errors=[],app=express();
  const voice=installProductionVoice({app,database:db,bookingService:booking,runtimeConfig:{voiceRuntime:true,providerWrites:true},env:{TWILIO_ACCOUNT_SID:ACCOUNT,TWILIO_AUTH_TOKEN:TOKEN,PUBLIC_BASE_URL:ORIGIN,GEMINI_MODEL:'synthetic-live-model',JWT_SECRET:'synthetic-jwt-secret'.padEnd(64,'x')},googleClient:fake.client,clock,onError:code=>errors.push(code)});
  const httpServer=app.listen(0,'127.0.0.1');await once(httpServer,'listening');
  const local='http://127.0.0.1:'+httpServer.address().port,callSid='CA'+crypto.randomBytes(16).toString('hex');
  const parameters={AccountSid:ACCOUNT,CallSid:callSid,From:FROM,To:TO,Direction:'inbound'};let ws;
  async function post(url,params=parameters,signature=twilio.getExpectedTwilioSignature(TOKEN,ORIGIN+url,params)){
    return fetch(local+url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':signature},body:new URLSearchParams(params)});
  }
  async function connect(){
    const response=await post('/api/twilio/voice/incoming');assert.equal(response.status,200);const xml=await response.text();
    const stream=xml.match(/<Stream url="([^"]+)"/),fallback=xml.match(/<Redirect method="POST">([^<]+)<\/Redirect>/);assert.ok(stream,xml);assert.ok(fallback,xml);const route=new URL(stream[1]).pathname;
    ws=new WebSocket(local.replace(/^http:/,'ws:')+route,{headers:{'x-twilio-signature':twilio.getExpectedTwilioSignature(TOKEN,stream[1],{})}});await once(ws,'open');const streamSid='MZ'+'c'.repeat(32);
    ws.send(JSON.stringify({event:'connected',protocol:'Call',version:'1.0.0'}));
    ws.send(JSON.stringify({event:'start',sequenceNumber:'1',streamSid,start:{accountSid:ACCOUNT,callSid,streamSid,tracks:['inbound'],mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}}));
    await until(()=>fake.connects.length>0,'provider startup; '+errors.join(','));return {xml,fallbackPath:new URL(fallback[1]).pathname,ws};
  }
  async function close(){ws?.terminate();await voice.close();httpServer.closeAllConnections?.();await new Promise(resolve=>httpServer.close(resolve));db.close();rmSync(temporary,{recursive:true,force:true});}
  return {db,owner,custom,mulch,fake,voice,errors,callSid,post,connect,close,get calendarCreates(){return calendarCreates;}};
}

