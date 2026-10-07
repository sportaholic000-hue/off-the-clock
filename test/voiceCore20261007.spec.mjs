import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {dirname} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fixture,address,at,secret} from './leadCaptureRepair20261006Fixture.mjs';
import {harness,FROM} from './voiceLifecycle20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {createBookingService} from '../server/src/bookingService.js';
import {db as sharedDb} from '../server/src/db.js';
import {migrateDatabase} from '../server/src/migrations.js';
import {createBookingAdminService} from '../server/src/bookingAdminService.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {normalizeTransferWindows,transferDecision,validateVoiceSettings} from '../server/src/voice/voiceSettings.js';
import {saveVoice} from '../server/src/onboardingService.js';
import {pricebookDirectory} from '../server/priceBookService.js';
const pricebookPathForOwner=owner=>pricebookDirectory()+'/'+owner+'.json';

const allDays=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day=>[day,[{start:'00:00',end:'23:59'}]]));
function runtime(h,c,options={}){const r=createVoiceToolRuntime({database:h.db,callContext:c,handleSecret:secret,clock:()=>new Date(at),...options});return createVoiceToolDispatcher({handlers:r.handlers,callContext:c,idempotencyStore:r.idempotencyStore}).dispatch;}
const invoke=(dispatch,name,args,key='synthetic-'+name)=>dispatch({name,args,toolCallId:key});
function configureBooking(h,c){
 h.db.prepare("UPDATE users SET plan='Operator' WHERE id=?").run(c.ownerId);
 h.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({serviceArea:{mode:'all',cities:[]}}),c.ownerId);
 h.db.prepare("INSERT INTO bookingSettings(ownerId,revision,timezone,provider,calendarId,weeklyAvailabilityJson,blackoutsJson,bookingHorizonDays,minimumNoticeMinutes,slotIncrementMinutes,bufferBeforeMinutes,bufferAfterMinutes,directBookingEnabled,updatedAt) VALUES(?,'v1','UTC','google','synthetic-calendar',?,'[]',30,0,30,0,0,1,?)").run(c.ownerId,JSON.stringify(allDays),at);
 h.db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt) VALUES(?,'voice-appointment','v1','site_visit_first',30,1,?)").run(c.ownerId,at);
}
test('voice-core 1 Operator books a fresh appointment without any calculated quote',async t=>{
 const h=fixture(t),c=h.context();configureBooking(h,c);let writes=0;
 const booking=createBookingService({db:h.db,clock:()=>new Date(at),slotTokenSecret:secret,calendar:{listBusy:async()=>[],createEvent:async input=>{writes++;return {status:'CONFIRMED',eventId:input.eventId,startAtUtc:input.startAtUtc,endAtUtc:input.endAtUtc};}}});
 const dispatch=runtime(h,c,{bookingService:booking}),lead=await invoke(dispatch,'captureLead',{name:'Synthetic Caller',address});
 const slots=await invoke(dispatch,'checkAvailability',{leadHandle:lead.leadHandle,preference:{fromDate:'2026-10-07',days:1}});
 assert.equal(slots.status,'available');const args={leadHandle:lead.leadHandle,slotHandle:slots.slotOptions[0].slotHandle,customerConfirmed:true};
 assert.equal((await invoke(dispatch,'bookAppointment',args)).status,'confirmed');assert.equal((await invoke(dispatch,'bookAppointment',args)).status,'confirmed');
 assert.equal(writes,1);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quotes WHERE ownerId=?').get(c.ownerId).n,0);
 assert.equal(h.service.detail({ownerId:c.ownerId,id:c.callSid}).bookings.length,1);
});
for(const [voiceId,voiceName] of [['male','Charon'],['female','Kore']])test('voice-core 2 saved '+voiceId+' voice and greeting reach the real live adapter',async t=>{
 const inputs=[],greeting='[SYNTHETIC] Welcome to the saved greeting.';
 const h=await harness(t,{beforeInstall:f=>f.db.prepare('UPDATE businessProfiles SET voiceId=?,greeting=? WHERE ownerId=?').run(voiceId,greeting,'synthetic-a'),onConnect:input=>inputs.push(input)});
 await h.connect();assert.equal(inputs[0].config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,voiceName);assert.ok(inputs[0].config.systemInstruction.includes(greeting));
});
test('voice-core 3 callback contact is saved, corrected and shown without changing trusted caller identity',async t=>{
 const h=fixture(t),c=h.context();c.from='anonymous';h.db.prepare('UPDATE calls SET callerNumber=? WHERE ownerId=? AND id=?').run(c.from,c.ownerId,c.callSid);const dispatch=runtime(h,c);
 const lead=await invoke(dispatch,'captureLead',{name:'Synthetic Caller',phone:'+19025550222',notes:'Call the number I gave you',callbackRequested:true});
 await invoke(dispatch,'captureLead',{leadHandle:lead.leadHandle,phone:'+19025550223'},'synthetic-correction');
 const row=h.lead(c)[0],details=JSON.parse(row.collectedInputsJson);assert.equal(details.contact.phone,'+19025550223');assert.equal(row.callerNumber,'anonymous');
 assert.equal(h.service.detail({ownerId:c.ownerId,id:c.callSid}).leads[0].callerNumber,'+19025550223');assert.equal(h.db.prepare('SELECT phoneE164 FROM customers WHERE ownerId=?').get(c.ownerId).phoneE164,'anonymous');
});
test('voice-core 4 unreadable quote storage keeps ordinary answering live and queues an owner alert',async t=>{
 const owner='synthetic-a',path=pricebookPathForOwner(owner);mkdirSync(dirname(path),{recursive:true});let original;try{original=readFileSync(path);}catch{}writeFileSync(path,'{SYNTHETIC BROKEN JSON');t.after(()=>original?writeFileSync(path,original):rmSync(path,{force:true}));
 const h=await harness(t,{beforeInstall:f=>f.db.prepare("UPDATE users SET plan='QuoteDone' WHERE id=?").run(owner)});await h.connect();assert.equal(h.callbacks.length,1);
 assert.equal(h.db.prepare("SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND eventType='voice.quoting_unavailable'").get(owner).n,1);
});
test('voice-core 5 voice settings reject values that cannot compile before persisting them',()=>{
 migrateDatabase(sharedDb);const owner='synthetic-voice-settings';sharedDb.prepare("INSERT OR IGNORE INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic','Operator','active','UTC','owner',?)").run(owner,owner+'@example.invalid',at);
 for(const value of ['x'.repeat(501),'Agent\u0000Name','$100 Agent'])assert.throws(()=>saveVoice(owner,{voiceId:'female',agentName:value,greeting:'Synthetic greeting'}),e=>e.statusCode===400);
 assert.throws(()=>saveVoice(owner,{voiceId:'female',agentName:{name:'Synthetic'},greeting:'Synthetic greeting'}),e=>e.statusCode===400);
});
test('voice-core 6 confirmed Operator OFF routes to the business with no capture, live session or AI billing',async t=>{
 const h=await harness(t,{beforeInstall:f=>f.db.prepare("UPDATE businessProfiles SET operatorEnabled=0,carrierSetupStatus='updated' WHERE ownerId=?").run('synthetic-a')});const response=await h.incoming();assert.doesNotMatch(response.xml,/<Gather|<Stream/);assert.match(response.xml,/<Dial[^>]*><Number>\+19025550199<\/Number><\/Dial>/);assert.equal(h.callbacks.length,0);
 assert.equal(h.db.prepare('SELECT COUNT(*) n FROM leads').get().n,0);assert.equal(h.db.prepare('SELECT minutesBilled FROM calls WHERE ownerId=?').get(h.owner).minutesBilled,0);
});
test('voice-core 7 transfers obey saved owner windows and save a callback outside them',async t=>{
 const h=fixture(t),c=h.context();h.db.prepare("UPDATE users SET timezone='America/Halifax' WHERE id=?").run(c.ownerId);
 h.db.prepare('UPDATE businessProfiles SET existingPhoneNumber=?,knowledgeBaseJson=? WHERE ownerId=?').run('+19025550199',JSON.stringify({transferWindows:{tue:[{start:'10:00',end:'17:00'}]}}),c.ownerId);
 let dials=0;const dispatch=runtime(h,c,{providers:{transferCall:async()=>{dials++;return {status:'CONNECTED'};}}});
 const result=await invoke(dispatch,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:'Call me when you are available'});assert.equal(dials,0);assert.equal(result.callbackSaved,true);assert.match(result.message,/outside|hours/i);
});
test('voice-core 8 Calls feed and details render in the saved owner time zone',async t=>{
 const h=fixture(t),c=h.context();h.db.prepare("UPDATE users SET timezone='America/Halifax' WHERE id=?").run(c.ownerId);
 const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});t.after(()=>vite.close());const {CallFeed,CallDetail}=await vite.ssrLoadModule('/src/calls.jsx');
 for(const [Component,props] of [[CallFeed,{calls:h.service.list({ownerId:c.ownerId}).calls}],[CallDetail,{call:h.service.detail({ownerId:c.ownerId,id:c.callSid})}]]){const html=renderToStaticMarkup(React.createElement(Component,props));assert.match(html,/09:00/);assert.match(html,/ADT|GMT-3/);assert.doesNotMatch(html,/2026-10-06T12:00:00/);}
});

test('voice-core Operator can configure appointments through the existing owner calendar service without a price book',t=>{
 const h=fixture(t),c=h.context();h.db.prepare("UPDATE users SET plan='Operator' WHERE id=?").run(c.ownerId);
 const service=createBookingAdminService({db:h.db,clock:()=>new Date(at)}),configuration=service.getConfiguration({ownerId:c.ownerId});
 assert.deepEqual(configuration.services.map(row=>row.serviceId),['voice-appointment']);
 const saved=service.updatePolicy({ownerId:c.ownerId,serviceId:'voice-appointment',body:{bookingMode:'site_visit_first',durationMinutes:30,enabled:true}});
 assert.equal(saved.services[0].policy.enabled,true);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM bookingPolicies WHERE ownerId=?').get('synthetic-b').n,0);
});
for(const missing of ['policy','address','area','calendar'])test('voice-core quote-free booking remains unavailable without '+missing,async t=>{
 const h=fixture(t),c=h.context();configureBooking(h,c);let writes=0;
 if(missing==='policy')h.db.prepare("UPDATE bookingPolicies SET enabled=0 WHERE ownerId=?").run(c.ownerId);
 if(missing==='area')h.db.prepare("UPDATE businessProfiles SET knowledgeBaseJson='{}' WHERE ownerId=?").run(c.ownerId);
 if(missing==='calendar')h.db.prepare('UPDATE bookingSettings SET directBookingEnabled=0 WHERE ownerId=?').run(c.ownerId);
 const booking=createBookingService({db:h.db,clock:()=>new Date(at),slotTokenSecret:secret,calendar:{listBusy:async()=>[],createEvent:async()=>{writes++;throw Error('Should not write');}}});
 const dispatch=runtime(h,c,{bookingService:booking}),lead=await invoke(dispatch,'captureLead',{name:'Synthetic Caller',...(missing==='address'?{}:{address})});
 const result=await invoke(dispatch,'checkAvailability',{leadHandle:lead.leadHandle,preference:{fromDate:'2026-10-07',days:1}});assert.notEqual(result.status,'available');assert.equal(writes,0);
});
test('voice-core general appointment intent cannot reference a foreign lead or service',t=>{
 const h=fixture(t),a=h.context(),b=h.context('synthetic-b');h.voice(b).runtime.handlers.captureLead({context:b,args:{name:'Synthetic B'}});
 const id=h.lead(b)[0].id,booking=createBookingService({db:h.db,clock:()=>new Date(at),slotTokenSecret:secret,calendar:{listBusy:async()=>[],createEvent:async()=>({status:'CONFIRMED'})}});
 for(const [ownerId,serviceId] of [[a.ownerId,'voice-appointment'],[b.ownerId,'unowned-service']])assert.throws(()=>booking.createIntent({ownerId,sourceType:'lead',sourceId:id,serviceId,resultType:'APPOINTMENT_REQUEST',expiresAtUtc:'2026-10-07T12:00:00.000Z'}));
});
test('voice-core callback contact does not unlock another caller history or a foreign lead handle',async t=>{
 const h=fixture(t),a=h.context(),b=h.context('synthetic-b'),dispatch=runtime(h,a),other=runtime(h,b);
 const lead=await invoke(other,'captureLead',{name:'Synthetic B',notes:'PRIVATE TENANT B'});
 await invoke(dispatch,'captureLead',{phone:'+19025550222',notes:'Callback here'});
 const result=await invoke(dispatch,'getCustomerContext',{});assert.doesNotMatch(JSON.stringify(result),/PRIVATE TENANT B|19025550222/);
 await assert.rejects(invoke(dispatch,'captureLead',{leadHandle:lead.leadHandle,phone:'+19025550222'},'synthetic-foreign'));assert.equal(h.lead(b).length,1);
 for(const phone of ['555-0123','anonymous','+0','+19025550100 extension 2'])await assert.rejects(invoke(dispatch,'captureLead',{phone},'invalid-'+phone));
});
test('voice-core callback owner emails contain the usable corrected contact',async t=>{
 const h=fixture(t),c=h.context(),dispatch=runtime(h,c);const lead=await invoke(dispatch,'captureLead',{name:'Synthetic Caller',phone:'+19025550222',notes:'Call about synthetic gate',callbackRequested:true});
 await invoke(dispatch,'captureLead',{leadHandle:lead.leadHandle,phone:'+19025550223'},'synthetic-edit');const messages=[];
 const alerts=createOwnerAlertService({database:h.db,ownerQuery:h.ownerQuery,clock:()=>Date.parse(at),ready:()=>true,environment:{PUBLIC_BASE_URL:'https://synthetic.example.invalid'},send:async message=>{messages.push(message);return {id:'SYNTHETIC_EMAIL',status:'ACCEPTED'};}});
 await alerts.dispatchOnce();assert.match(JSON.stringify(messages),/19025550223/);assert.doesNotMatch(JSON.stringify(messages),/19025550222/);
});
for(const status of ['pending','failed'])test('voice-core Operator OFF with '+status+' carrier routing cannot enter AI capture or create a forwarding loop',async t=>{
 const h=await harness(t,{beforeInstall:f=>f.db.prepare('UPDATE businessProfiles SET operatorEnabled=0,carrierSetupStatus=? WHERE ownerId=?').run(status,'synthetic-a')});const result=await h.incoming();assert.equal(result.status,200);assert.doesNotMatch(result.xml,/<Gather|<Stream|<Dial/);assert.match(result.xml,/operator is off/i);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM leads').get().n,0);
});
test('voice-core OFF signed completion remains zero AI minutes and records a completed owner call',async t=>{
 const h=await harness(t,{beforeInstall:f=>f.db.prepare("UPDATE businessProfiles SET operatorEnabled=0,carrierSetupStatus='updated' WHERE ownerId=?").run('synthetic-a')});const result=await h.incoming();assert.equal((await h.incoming()).xml,result.xml);
 const response=await h.post('/api/twilio/voice/status',{...result.params,CallStatus:'completed',CallDuration:'125'});assert.equal(response.status,204);
 const row=h.db.prepare('SELECT * FROM calls WHERE ownerId=?').get(h.owner);assert.equal(row.minutesBilled,0);assert.equal(row.status,'COMPLETED');assert.equal(row.outcome,'OPERATOR_OFF');assert.equal(h.db.prepare('SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=?').get(h.owner).n,1);
});
for(const [now,allowed] of [['2026-10-06T12:59:59.000Z',false],['2026-10-06T13:00:00.000Z',true],['2026-10-06T19:59:59.000Z',true],['2026-10-06T20:00:00.000Z',false],['2026-11-03T14:00:00.000Z',true],['2026-11-03T13:59:59.000Z',false]])test('voice-core owner-local transfer boundary '+now,t=>{
 const h=fixture(t);h.db.prepare("UPDATE users SET timezone='America/Halifax' WHERE id='synthetic-a'").run();h.db.prepare('UPDATE businessProfiles SET existingPhoneNumber=?,knowledgeBaseJson=? WHERE ownerId=?').run('+19025550199',JSON.stringify({transferWindows:{tue:[{start:'10:00',end:'17:00'}]}}),'synthetic-a');assert.equal(transferDecision(h.db,'synthetic-a',new Date(now)).allowed,allowed);assert.equal(transferDecision(h.db,'synthetic-b',new Date(now)).allowed,false);
});
test('voice-core malformed transfer settings are rejected before storage',()=>{
 for(const value of [{bad:[]},{mon:[{start:'17:00',end:'10:00'}]},{mon:[{start:'9:00',end:'17:00'}]},{mon:[{start:'09:00',end:'12:00'},{start:'11:00',end:'13:00'}]},{mon:[{start:'09:00',end:'12:00',ownerId:'synthetic-b'}]}])assert.throws(()=>normalizeTransferWindows(value),e=>e.statusCode===400);
 for(const greeting of ['',{},'x'.repeat(1001),'Synthetic\u0000greeting'])assert.throws(()=>validateVoiceSettings({voiceId:'female',agentName:'Synthetic',greeting}),e=>e.statusCode===400);
 assert.deepEqual(validateVoiceSettings({voiceId:'male',agentName:' Sam ',greeting:' Synthetic greeting '}),{voiceId:'male',agentName:'Sam',greeting:'Synthetic greeting'});
});

test('voice-core production Operator completes quote-free booking through signed HTTP and live WS tools',async t=>{
 const options={install:{},beforeInstall:f=>{configureBooking(f,{ownerId:'synthetic-a'});options.install.bookingService=createBookingService({db:f.db,clock:()=>new Date(at),slotTokenSecret:secret,calendar:{listBusy:async()=>[],createEvent:async input=>({status:'CONFIRMED',eventId:input.eventId,startAtUtc:input.startAtUtc,endAtUtc:input.endAtUtc})}});}};
 const h=await harness(t,options),c=await h.connect();assert.equal((await h.tool(c.callback,'matchService',{query:'Synthetic appointment'})).status,'needs_details');
 const lead=await h.tool(c.callback,'captureLead',{name:'Synthetic Caller',address});const slots=await h.tool(c.callback,'checkAvailability',{leadHandle:lead.leadHandle,preference:{fromDate:'2026-10-07',days:1}});assert.equal(slots.status,'available');
 const booked=await h.tool(c.callback,'bookAppointment',{leadHandle:lead.leadHandle,slotHandle:slots.slotOptions[0].slotHandle,customerConfirmed:true});assert.equal(booked.status,'confirmed');assert.equal(h.db.prepare('SELECT COUNT(*) n FROM appointments WHERE ownerId=?').get(h.owner).n,1);
});
