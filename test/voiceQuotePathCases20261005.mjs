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
async function harness({fail=false}={}){
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

// Written before execution: $100/$150, travel $10 for Yes only, 15% tax.
// Yes => $126.50/$184.00; No => $115.00/$172.50. No markup or range buffer.
test('signed provisioned callback -> real dispatcher -> two-tier quote -> availability -> one hold and persisted booking',async()=>{
  const h=await harness();try{
    const forged=await h.post('/api/twilio/voice/incoming',undefined,'forged');assert.equal(forged.status,403);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM calls').get().n,0);
    await h.connect();await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(h.fake.connects[0].config.tools[0].functionDeclarations.map(v=>v.name),getVoiceToolDeclarations().map(v=>v.name));
    const matched=await h.fake.tool('matchService',{query:h.custom.service});assert.equal(matched.status,'matched');assert.ok(matched.questionContract.fields.some(field=>field.field==='unit'));assert.deepEqual(matched.questionContract.customerFees.map(fee=>fee.field),['travel']);
    const inputs={service:h.custom.service,serviceConfirmed:true,unit:'flat'};
    const denied=await h.fake.tool('getQuote',{serviceHandle:matched.serviceHandle,customerInputs:inputs});assert.equal(denied.status,'needs_details');assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quotes').get().n,0);
    const unanswered=await h.fake.tool('getQuote',{serviceHandle:matched.serviceHandle,customerInputs:inputs,customerConfirmed:true});assert.match(unanswered.followUps.join(' '),/travel/);
    await h.fake.speak('Yes, the fixed visit and the travel charge are correct.');
    const args={serviceHandle:matched.serviceHandle,customerInputs:inputs,customerConfirmed:true,customerFeeSelections:{travel:true}};
    const quoted=await h.fake.tool('getQuote',args,'confirmed-yes');assert.equal(quoted.status,'quoted',JSON.stringify(quoted));
    assert.deepEqual(quoted.options.map(o=>[o.tierName,o.lowEstimate,o.highEstimate,o.currency]),[['Basic',126.5,126.5,'CAD'],['Premium',184,184,'CAD']]);assert.ok(quoted.options.every(o=>o.taxTreatment==='Includes applicable tax.'));
    assert.deepEqual(await h.fake.tool('getQuote',args,'confirmed-yes'),quoted);
    const noFee=await h.fake.tool('getQuote',{...args,customerFeeSelections:{travel:false}},'confirmed-no');assert.deepEqual(noFee.options.map(o=>o.lowEstimate),[115,172.5]);
    assert.equal((await h.fake.tool('getQuote',{...args,customerFeeSelections:{travel:false}},'confirmed-yes')).status,'needs_details');assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quoteSubmissions').get().n,2);
    const lead=await h.fake.tool('captureLead',{name:'Synthetic Caller',email:'caller@example.invalid',address:{line1:'10 Test Street',city:'Halifax',region:'NS',postalCode:'B3H 1A1',country:'CA'}});
    const slots=await h.fake.tool('checkAvailability',{quoteHandle:quoted.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-10-06',days:1,timeOfDay:['morning']}});assert.equal(slots.status,'available',JSON.stringify(slots));assert.ok(slots.slotOptions.length>0);assert.deepEqual(Object.keys(slots.slotOptions[0]).sort(),['label','slotHandle']);
    const bookingArgs={slotHandle:slots.slotOptions[0].slotHandle,leadHandle:lead.leadHandle,customerConfirmed:true};
    assert.equal((await h.fake.tool('bookAppointment',{...bookingArgs,customerConfirmed:false})).status,'needs_details');assert.equal(h.db.prepare('SELECT COUNT(*) n FROM bookingHolds').get().n,0);
    await h.fake.speak('Yes, that appointment and the address are correct.');
    const booked=await h.fake.tool('bookAppointment',bookingArgs,'book-confirmed');assert.equal(booked.status,'confirmed',JSON.stringify(booked));assert.deepEqual(await h.fake.tool('bookAppointment',bookingArgs,'book-confirmed'),booked);
    assert.equal(h.calendarCreates,1);assert.equal(h.db.prepare("SELECT COUNT(*) n FROM bookingHolds WHERE status='CONFIRMED'").get().n,1);assert.equal(h.db.prepare("SELECT COUNT(*) n FROM appointments WHERE status='CONFIRMED' AND ownerId=?").get(h.owner).n,1);
    assert.match(h.db.prepare('SELECT transcriptJson FROM calls WHERE callSid=?').get(h.callSid).transcriptJson,/travel charge are correct/);
    const publicValues=JSON.stringify([matched,quoted,noFee,lead,slots,booked]);for(const secret of [h.owner,h.custom.id,ACCOUNT,h.callSid,'calculationRecord','lineItems','approvedValues','markupPercent','priceBasisByCategory'])assert.equal(publicValues.includes(secret),false,secret);
  }finally{await h.close();}
});
test('session-start failure captures before signed forwarding; mismatched caller fails closed',async()=>{
  const h=await harness({fail:true});try{
    const started=await h.connect();await until(()=>started.ws.readyState===WebSocket.CLOSED,'failed session close');
    const response=await h.post(started.fallbackPath);assert.equal(response.status,200);const captureXml=await response.text();assert.match(captureXml,/<Gather/);assert.doesNotMatch(captureXml,/<Dial|<Hangup/);assert.equal(h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,h.callSid).status,'FALLBACK');
    assert.equal((await h.post(started.fallbackPath,{AccountSid:ACCOUNT,CallSid:h.callSid,From:'+19025550177',To:TO,Direction:'inbound'})).status,403);
  }finally{await h.close();}
});
test('ordinary confirmed products bind privately; unknown or unconfirmed products release no quote',async()=>{
  const h=await harness();try{
    await h.connect();const m=await h.fake.tool('matchService',{query:h.mulch.service});assert.equal(m.status,'matched');assert.ok(m.questionContract.fields.find(f=>f.field==='mulchType').choices.some(c=>c.value==='cedar_mulch'));assert.equal(JSON.stringify(m).includes(h.mulch.knownOfferings.mulchType.cedar_mulch),false);
    const args={serviceHandle:m.serviceHandle,customerInputs:{inputMethod:'yards',mulchArea:2,mulchType:'Cedar mulch',bedCondition:'clean',edgingNeeded:false,accessDifficulty:'easy'},customerConfirmed:true};
    assert.equal((await h.fake.tool('getQuote',args)).status,'needs_details');assert.equal((await h.fake.tool('getQuote',{...args,customerInputs:{...args.customerInputs,mulchType:'Unknown mulch'},productConfirmations:{mulchType:true}})).status,'needs_details');
    const q=await h.fake.tool('getQuote',{...args,productConfirmations:{mulchType:true}});assert.equal(q.status,'quoted',JSON.stringify(q));assert.equal(q.lowEstimate,207);
    const saved=JSON.parse(h.db.prepare('SELECT originalSubmissionJson FROM quoteSubmissions WHERE ownerId=?').get(h.owner).originalSubmissionJson);assert.equal(saved.customerInputs.confirmedFacts.mulchType.offeringId,h.mulch.knownOfferings.mulchType.cedar_mulch);
  }finally{await h.close();}
});
test('phone readiness uses cached quick statuses with the same live answer',async()=>{
  const h=await harness();try{
    const {loadPricebook}=await import('../server/priceBookService.js');const book=loadPricebook(h.owner),quick=bookQuoteStatuses(book);for(const raw of book.services)assert.equal(quick.find(s=>s.serviceId===raw.id).status,applicationStatus(raw,book).status);
    await h.connect();const before=applicationStatusCacheCounts();await h.fake.tool('matchService',{query:h.custom.service});await h.fake.tool('matchService',{query:h.custom.service});const after=applicationStatusCacheCounts();assert.ok(after.hits>=before.hits+4);assert.equal(after.misses,before.misses);
  }finally{await h.close();}
});
for(const key of ['__proto__','constructor','prototype','__PrOtO__'])for(const value of [0,null,'x',{sentinel:true}])test('forbidden quote key '+key+' value '+JSON.stringify(value),()=>{
  const inputs=JSON.parse('{'+JSON.stringify(key)+':'+JSON.stringify(value)+'}');assert.throws(()=>validateVoiceToolCall('getQuote',{serviceHandle:HANDLE,customerInputs:inputs,customerConfirmed:true}),{code:'FORBIDDEN_TOOL_FIELD'});assert.equal({}.sentinel,undefined);
});
for(const forbidden of [{ownerId:'x'},{price:1},{offeringId:'x'},{confirmedFacts:{}}])test('caller identity or money rejected '+Object.keys(forbidden)[0],()=>{assert.throws(()=>validateVoiceToolCall('getQuote',{serviceHandle:HANDLE,customerInputs:forbidden,customerConfirmed:true}));});
test('full written disclosure survives both projections while short summary preserves both ranges and exclusions',()=>{
  const written='Full written qualification. '.repeat(200)+' Complete retained final sentence. ';
  const source={resultType:'INSTANT_ESTIMATE_READY',lowEstimate:10.01,highEstimate:20.02,currency:'CAD',taxTreatment:'Includes applicable tax.',disclaimer:written,options:[{tierName:'Basic',lowEstimate:10.01,highEstimate:20.02,currency:'CAD',taxTreatment:'Includes applicable tax.',skippedAddons:['Lawn edging'],disclaimer:written},{tierName:'Complete',lowEstimate:30.03,highEstimate:40.04,currency:'CAD',taxTreatment:'Includes applicable tax.',skippedAddons:['Clipping bagging and disposal'],disclaimer:written}]};
  const q=projectVoiceToolResult('getQuote',projectVoiceQuote(source,HANDLE));assert.equal(q.writtenDisclosure,written);assert.equal(q.options[1].writtenDisclosure,written);assert.ok(q.voiceSummary.length<2000);
  for(const text of ['10.01','20.02','30.03','40.04','Lawn edging','Clipping bagging and disposal','CAD','tax'])assert.ok(q.voiceSummary.includes(text),text);
  for(const field of ['rate','rawRate','cost','margin','calculationRecord','lineItems']){const bad=structuredClone(q);bad.options[0][field]=field==='lineItems'?[]:1;assert.throws(()=>projectVoiceToolResult('getQuote',bad));}
});
test('booking already owns hold then confirm; caller hold/finalize injection stays rejected',()=>{
  const valid={slotHandle:HANDLE,leadHandle:HANDLE,customerConfirmed:true};assert.deepEqual(validateVoiceToolCall('bookAppointment',valid),valid);for(const extra of [{holdId:'x'},{holdHandle:HANDLE},{action:'hold'},{finalize:true}])assert.throws(()=>validateVoiceToolCall('bookAppointment',{...valid,...extra}));
});
test('actual start entry point installs the signed runtime instead of the placeholder',()=>{
  const source=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');assert.match(source,/installProductionVoice\(\{app,database:db,bookingService,runtimeConfig\}\)/);assert.doesNotMatch(source,/Your Off The Clock operator connection is ready/);assert.equal(JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).scripts.start,'node server/src/server.js');
});
