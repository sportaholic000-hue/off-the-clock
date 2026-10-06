// Independent delivery experiments. Production modules are imported unmodified.
// All DBs/books live in mkdtemp; provider transports are local in-memory stubs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {spawnSync,spawn} from 'node:child_process';
import WebSocket from 'ws';
import twilio from 'twilio';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer as createVite} from 'vite';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-lead-audit-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:path.join(temporary,'synthetic.sqlite'),PRICEBOOK_PATH:path.join(temporary,'books'),APP_DATA_DIR:temporary,ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',JWT_SECRET:'SYNTHETIC_AUDIT_SECRET_NEVER_LIVE'.padEnd(64,'x')});
const {db,ownerQuery,migrate}=await import('../../server/src/db.js');migrate();
const {createVoiceToolRuntime}=await import('../../server/src/voice/voiceToolRuntime.js');
const {createVoiceToolDispatcher}=await import('../../server/src/voice/toolDispatcher.js');
const {createOwnerCallService}=await import('../../server/src/ownerCallService.js');
const {installOwnerCallRoutes}=await import('../../server/src/ownerCallRoutes.js');
const {createVoiceSessionStore}=await import('../../server/src/voice/voicePersistence.js');
const {createOutboundWebhookService}=await import('../../server/src/outboundWebhookService.js');
const {csvRows}=await import('../../server/src/integrationData.js');
const {submitQuote,installQuoteDoneRoutes}=await import('../../server/src/quoteDoneRoutes.js');
const {createAuthSessionService}=await import('../../server/src/authSessionService.js');
const {installProductionVoice}=await import('../../server/src/voice/productionVoiceRuntime.js');
const {operatorEligibility}=await import('../../server/src/onboardingService.js');
const AT='2026-10-06T12:00:00.000Z',ACCOUNT='AC'+'a'.repeat(32),SECRET='SYNTHETIC_HANDLE_SECRET_NEVER_LIVE'.padEnd(64,'x');
let clockMs=Date.parse(AT),serial=1;const clock=()=>new Date(clockMs);
const owners=['synthetic-owner-a','synthetic-owner-b'];
for(const owner of owners){
 db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'[SYNTHETIC]','Synthetic','[SYNTHETIC] business','QuoteDone','active','UTC','owner',?)").run(owner,owner+'@example.invalid',AT);
 db.prepare("INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)").run(owner,'cus_SYNTHETIC_'+owner,AT,AT,AT);
 db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(owner);
 db.prepare("INSERT INTO businessProfiles(ownerId,existingPhoneNumber,twilioNumber,twilioNumberSid,phoneProvisioningStatus,operatorEnabled,agentName,knowledgeBaseJson,updatedAt) VALUES(?,?,?,?,'provisioned',1,'Synthetic assistant',?,?)").run(owner,'+19025550199',owner===owners[0]?'+19025550101':'+19025550102','PN_SYNTHETIC_'+owner,JSON.stringify({about:'[SYNTHETIC] repairs',hours:'[SYNTHETIC] all hours',serviceArea:{mode:'all',cities:[]}}),AT);
}
db.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES('synthetic-staff',?,'staff@example.invalid','[SYNTHETIC]','Synthetic','[SYNTHETIC]','Operator','active','UTC','staff',?)").run(owners[0],AT);
function context(owner=owners[0],from='+19025550100'){
 const value={ownerId:owner,from,to:owner===owners[0]?'+19025550101':'+19025550102',accountSid:ACCOUNT,callSid:'CA'+(serial++).toString(16).padStart(32,'0')};
 db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,transcriptJson,createdAt,updatedAt) VALUES(?,?,?,?,?,?,'CONNECTED','[]',?,?)").run(value.callSid,value.ownerId,value.callSid,value.accountSid,value.from,value.to,AT,AT);return value;
}
function voice(c,providers={},database=db){const runtime=createVoiceToolRuntime({database,callContext:c,handleSecret:SECRET,clock,providers,bookingCapabilityResolver:()=> 'NONE'});return {runtime,dispatch:createVoiceToolDispatcher({handlers:runtime.handlers,callContext:c,idempotencyStore:runtime.idempotencyStore}).dispatch};}
function tool(v,name,args,id=crypto.randomUUID()){return v.dispatch({name,args,toolCallId:id});}
const address={line1:'[SYNTHETIC] 10 Test Street',city:'Synthetic City',region:'NS',postalCode:'B3H 1A1',country:'CA'};
const results=[];
async function experiment(id,expected,fn){try{const {meetsExpectation,actual}=await fn();results.push({id,expected,meetsExpectation,actual});console.log(id,meetsExpectation?'PASS':'EXPECTATION MISMATCH');}catch(error){results.push({id,expected,experimentError:{code:error.code,message:error.message,stack:error.stack}});console.log(id,'EXPERIMENT ERROR',error.message);}}
const deliveryCalls=[];let deliveryStatus=204,dispatchEnabled=true;
const webhookOptions={database:db,ownerQuery,encryptionOptions:{key:'37'.repeat(32)},now:()=>clockMs,enabled:()=>dispatchEnabled,resolveDestination:async url=>({url:new URL(url)}),deliver:async(destination,request)=>{deliveryCalls.push({destination:destination.url.href,...request});return deliveryStatus;}};
const webhooks=createOutboundWebhookService(webhookOptions);
const callService=createOwnerCallService({ownerQuery});
const app=express();app.use(express.json());
const sessions=createAuthSessionService(db),tokens={};for(const id of [...owners,'synthetic-staff'])tokens[id]=sessions.create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
const {requireAuth}=await import('../../server/src/auth.js');
const asyncHandler=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res,next)).catch(next);
installQuoteDoneRoutes(app,{asyncHandler,requireQuoteDonePlan:(_req,_res,next)=>next()});
installOwnerCallRoutes(app,{service:callService,requireAuth,asyncHandler});
app.use((err,_req,res,_next)=>res.status(err.statusCode||500).json({error:err.message}));
const http=app.listen(0,'127.0.0.1');await once(http,'listening');const base='http://127.0.0.1:'+http.address().port;
async function request(route,{owner=owners[0],method='GET',body,headers={}}={}){const response=await fetch(base+route,{method,headers:{...(owner?{authorization:'Bearer '+tokens[owner]}:{}),...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
const webBody=contact=>({requestId:crypto.randomUUID(),serviceId:'11111111-1111-4111-8111-111111111111',serviceRequest:'[SYNTHETIC] repair loose gate',customerInputs:{},contact:{phone:contact.phone,email:contact.email},reviewRequested:true,context:'[SYNTHETIC] call after 5pm'});
try{
 await experiment('E01','Voice notes persist and appear to staff in the saved lead.',async()=>{
  const c=context(),v=voice(c),r=await tool(v,'captureLead',{name:'[SYNTHETIC] Alex',email:'alex@example.invalid',address,notes:'[SYNTHETIC] Gate fell down; call after 5pm.'});
  const row=db.prepare('SELECT * FROM leads WHERE callId=?').get(c.callSid),detail=callService.detail({ownerId:c.ownerId,id:c.callSid,role:'staff'});
  return {meetsExpectation:row.collectedInputsJson.includes('Gate fell down'),actual:{response:r,stored:JSON.parse(row.collectedInputsJson),staffLead:detail.leads[0]}};
 });
 await experiment('E02','Exact duplicates replay once; failure after lead commit yields no success, and retry recovers one lead.',async()=>{
  const c=context(),v=voice(c),args={name:'[SYNTHETIC] Retry',address},id='capture-retry';
  db.exec("CREATE TRIGGER audit_handle_failure BEFORE INSERT ON voiceOpaqueHandles WHEN NEW.callSid='"+c.callSid+"' BEGIN SELECT RAISE(ABORT,'[SYNTHETIC] post-persistence fault'); END");
  let error;try{await tool(v,'captureLead',args,id);}catch(e){error=e.code;}db.exec('DROP TRIGGER audit_handle_failure');
  const savedAfterFailure=db.prepare('SELECT COUNT(*) n FROM leads WHERE callId=?').get(c.callSid).n;
  const r=await tool(v,'captureLead',args,id),replay=await tool(voice(c),'captureLead',args,id);
  const count=db.prepare('SELECT COUNT(*) n FROM leads WHERE callId=?').get(c.callSid).n;
  return {meetsExpectation:!!error&&savedAfterFailure===1&&count===1&&JSON.stringify(r)===JSON.stringify(replay),actual:{error,savedAfterFailure,count,r,replay}};
 });
 await experiment('E03','Capture updates do not erase a returning customer email or reopen a dismissed lead.',async()=>{
  const c=context(),v=voice(c),args={name:'[SYNTHETIC] Returning',email:'returning@example.invalid',address};
  await tool(v,'captureLead',args,'first');const row=db.prepare('SELECT id FROM leads WHERE callId=?').get(c.callSid);await request('/api/leads/'+row.id,{method:'PATCH',body:{status:'DISMISSED'}});
  await tool(voice(c),'captureLead',args,'new-provider-event');const disposition=db.prepare('SELECT status FROM leads WHERE id=?').get(row.id).status;
  const next=context();await tool(voice(next),'captureLead',{name:'[SYNTHETIC] Returning'},'next-call');
  const customer=db.prepare('SELECT notesJson FROM customers WHERE ownerId=? AND phoneE164=?').get(c.ownerId,c.from);
  return {meetsExpectation:disposition==='DISMISSED'&&JSON.parse(customer.notesJson).email==='returning@example.invalid',actual:{disposition,customerNotes:JSON.parse(customer.notesJson)}};
 });
 await experiment('E04','Corrected name/contact on one call preserves a single actionable lead.',async()=>{
  const c=context(),v=voice(c);await tool(v,'captureLead',{name:'[SYNTHETIC] Alxe'},'misspelled');await tool(v,'captureLead',{name:'[SYNTHETIC] Alex',email:'correct@example.invalid'},'corrected');
  const leads=db.prepare('SELECT customerName,collectedInputsJson,status FROM leads WHERE callId=?').all(c.callSid);
  return {meetsExpectation:leads.length===1,actual:{leadCount:leads.length,leads}};
 });
 await experiment('E05','Saved ordinary/urgent voice requests notify owner, expose urgent state, and pending notifications resume after restart.',async()=>{
  const c=context(),v=voice(c);await tool(v,'captureLead',{name:'[SYNTHETIC] Flood caller'},'ordinary');const r=await tool(v,'flagUrgent',{reason:'flooding',summary:'[SYNTHETIC] Water through kitchen ceiling.'},'urgent');
  const before=deliveryCalls.length;await webhooks.dispatchOnce();await createOutboundWebhookService(webhookOptions).dispatchOnce();
  const detail=callService.detail({ownerId:c.ownerId,id:c.callSid}),outbox=db.prepare('SELECT eventType,status FROM outboxEvents WHERE ownerId=? AND aggregateId IN (SELECT id FROM events WHERE ownerId=?)').all(c.ownerId,c.ownerId);
  return {meetsExpectation:deliveryCalls.length>before&&detail.urgency&&detail.leads[0]?.urgency,actual:{response:r,callUrgency:detail.urgency,leadUrgency:detail.leads[0]?.urgency,attempts:deliveryCalls.length-before,outbox,callFailure:detail.failureCode,callKeys:Object.keys(detail)}};
 });
 await experiment('E06','Schema-optional urgency summary still flags/notifies urgency.',async()=>{
  const c=context();let error,r;try{r=await tool(voice(c),'flagUrgent',{reason:'safety'},'urgent-without-summary');}catch(e){error=e.code;}
  return {meetsExpectation:!error&&!!r,actual:{error,response:r,eventCount:db.prepare('SELECT COUNT(*) n FROM events WHERE ownerId=? AND payloadJson LIKE ?').get(c.ownerId,'%'+c.callSid+'%').n}};
 });
 await experiment('E07','A logged standalone quote request creates/references an actionable lead with caller contact.',async()=>{
  const c=context(),r=await tool(voice(c),'logQuoteRequest',{description:'[SYNTHETIC] Replace sagging gate; callback after 5.'},'request');
  const detail=callService.detail({ownerId:c.ownerId,id:c.callSid}),csv=[...csvRows(ownerQuery,c.ownerId,'quote-requests')].join('');
  return {meetsExpectation:detail.leads.length===1&&csv.includes(c.from),actual:{response:r,leads:detail.leads,quoteRequests:detail.quoteRequests,csvRow:csv.split('\r\n').find(line=>line.includes('callback after 5'))}};
 });
 await experiment('E08','Wrong-owner/call/expired handles and missing persisted lead fail closed.',async()=>{
  const c=context(),v=voice(c),r=await tool(v,'captureLead',{name:'[SYNTHETIC] Isolation'},'lead');const errors=[];
  for(const other of [context(owners[1]),context(c.ownerId,'+19025550155')]){try{await tool(voice(other),'logQuoteRequest',{description:'[SYNTHETIC] forbidden',leadHandle:r.leadHandle});}catch(e){errors.push(e.code);}}
  clockMs+=2*60*60*1000+1;try{await tool(voice(c),'logQuoteRequest',{description:'[SYNTHETIC] stale',leadHandle:r.leadHandle});}catch(e){errors.push(e.code);}clockMs=Date.parse(AT);
  db.prepare('DELETE FROM leads WHERE callId=?').run(c.callSid);try{await tool(v,'logQuoteRequest',{description:'[SYNTHETIC] deleted',leadHandle:r.leadHandle});}catch(e){errors.push(e.code);}
  return {meetsExpectation:errors.length===4,actual:{errors}};
 });
 await experiment('E09','Completed call context cannot create new follow-up writes.',async()=>{
  const c=context(),v=voice(c);db.prepare("UPDATE calls SET status='COMPLETED',completedAt=? WHERE id=?").run(AT,c.callSid);
  let error;try{await tool(v,'captureLead',{name:'[SYNTHETIC] stale call'},'after-end');}catch(e){error=e.code;}
  return {meetsExpectation:!!error,actual:{error,leadCount:db.prepare('SELECT COUNT(*) n FROM leads WHERE callId=?').get(c.callSid).n}};
 });
 await experiment('E10','SMS provider failures are truthful and retry successfully after restart/provider recovery.',async()=>{
  const c=context();let attempts=0,fail=true;const providers={sendSms:async()=>{attempts++;if(fail)throw Object.assign(Error('[SYNTHETIC] timeout'),{code:'ETIMEDOUT'});return {status:'SENT'};}};
  const v=voice(c,providers),lead=await tool(v,'captureLead',{name:'[SYNTHETIC] SMS'},'lead'),args={template:'callback',recordHandle:lead.leadHandle};
  const first=await tool(v,'sendSms',args,'sms-one');fail=false;const retry=await tool(voice(c,providers),'sendSms',args,'sms-two');
  return {meetsExpectation:first.status==='unavailable'&&retry.status==='sent'&&attempts===2,actual:{first,retry,attempts,outbox:db.prepare("SELECT status FROM outboxEvents WHERE ownerId=? AND eventType='voice.sms_requested' ORDER BY createdAt").all(c.ownerId)}};
 });
 await experiment('E11','Failed transfer captures callback lead and does not report successful transfer.',async()=>{
  const c=context(),r=await tool(voice(c,{transferCall:async()=>{throw Error('[SYNTHETIC] no answer');}}),'transferCall',{reason:'caller_requested',customerConfirmed:true},'transfer');
  const detail=callService.detail({ownerId:c.ownerId,id:c.callSid});return {meetsExpectation:r.status==='unavailable'&&detail.leads.length>0,actual:{response:r,leadCount:detail.leads.length,callerNumber:detail.callerNumber}};
 });
 await webhooks.save(owners[0],{url:'https://synthetic-receiver.example.invalid/hooks',events:['lead.created','quote.requested','appointment.booked']});
 await experiment('E12','Voice webhook/CSV preserve the stored email; inquiry webhook carries follow-up contact.',async()=>{
  const c=context(),v=voice(c),r=await tool(v,'captureLead',{name:'[SYNTHETIC] Email only followup',email:'voice-followup@example.invalid',address},'lead');await tool(v,'logQuoteRequest',{description:'[SYNTHETIC] repair',leadHandle:r.leadHandle},'quote-request');
  const rows=db.prepare('SELECT eventType,payloadJson FROM webhookDeliveries WHERE ownerId=? AND aggregateId IN (SELECT id FROM leads WHERE callId=? UNION SELECT id FROM quoteRequests WHERE callId=?)').all(c.ownerId,c.callSid,c.callSid);
  const csv=[...csvRows(ownerQuery,c.ownerId,'leads')].join('');
  return {meetsExpectation:rows.every(row=>row.payloadJson.includes('voice-followup@example.invalid'))&&csv.includes('voice-followup@example.invalid'),actual:{payloads:rows.map(row=>({type:row.eventType,data:JSON.parse(row.payloadJson)})),csvRow:csv.split('\r\n').find(line=>line.includes('Email only followup'))}};
 });
 await experiment('E13','Web email-only request is committed, visible, tenant isolated and retry-stable.',async()=>{
  const body=webBody({name:'[SYNTHETIC] Web',email:'web@example.invalid'}),key='synthetic-public-key';db.prepare('INSERT INTO quoteAccessKeys(ownerId,publicKey,allowedOriginsJson,createdAt) VALUES(?,?,?,?)').run(owners[0],key,JSON.stringify(['https://synthetic-site.example.invalid']),AT);
  const route='/api/public/quote/'+key;const headers={Origin:'https://synthetic-site.example.invalid'};
  const [a,b]=await Promise.all([request(route,{owner:null,method:'POST',body,headers}),request(route,{owner:null,method:'POST',body,headers})]);const replay=submitQuote(owners[0],body);
  const saved=db.prepare('SELECT recordId FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owners[0],body.requestId),lead=await request('/api/leads/'+saved.recordId),foreign=await request('/api/leads/'+saved.recordId,{owner:owners[1]});
  const changed=await request(route,{owner:null,method:'POST',body:{...body,context:'[SYNTHETIC] changed'},headers});
  return {meetsExpectation:[a.status,b.status].sort().join()==='200,201'&&replay.status===200&&lead.body.contact.email==='web@example.invalid'&&foreign.status===404&&changed.status===409,actual:{statuses:[a.status,b.status],replay:replay.status,lead:lead.body,foreign:foreign.status,changed:changed.status,savedCount:db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE requestId=?').get(body.requestId).n}};
 });
 await experiment('E14','Invalid/absent callback contact and wrong-origin requests fail before persistence; owner injection never redirects.',async()=>{
  const rejected=[];for(const contact of [{},{email:'bad'},{phone:'123'},{email:'ok@example.invalid',phone:'abc'}]){const body=webBody(contact);try{submitQuote(owners[0],body);rejected.push(false);}catch(e){rejected.push(e.statusCode===422&& !db.prepare('SELECT 1 FROM quoteSubmissions WHERE requestId=?').get(body.requestId));}}
  const bad=await request('/api/public/quote/synthetic-public-key',{owner:null,method:'POST',body:webBody({email:'origin@example.invalid'}),headers:{Origin:'https://wrong.example.invalid'}});
  const body={...webBody({email:'injection@example.invalid'}),ownerId:owners[1]};const r=await request('/api/public/quote/synthetic-public-key',{owner:null,method:'POST',body,headers:{Origin:'https://synthetic-site.example.invalid'}});
  const persisted=db.prepare('SELECT ownerId FROM quoteSubmissions WHERE requestId=?').get(body.requestId);
  return {meetsExpectation:rejected.every(Boolean)&&bad.status===403&&(r.status>=400||persisted?.ownerId===owners[0]),actual:{rejected,wrongOrigin:bad.status,injectionStatus:r.status,persisted}};
 });
 await experiment('E15','Web and voice share a per-owner normalized customer identity.',async()=>{
  const phone='+19025550144',body=webBody({name:'[SYNTHETIC] Shared customer',phone,email:'shared@example.invalid'});submitQuote(owners[0],body);
  const afterWeb=db.prepare('SELECT id FROM customers WHERE ownerId=? AND phoneE164=?').all(owners[0],phone);const c=context(owners[0],phone);await tool(voice(c),'captureLead',{name:'[SYNTHETIC] Shared customer'},'voice');
  return {meetsExpectation:afterWeb.length===1,actual:{customersAfterWeb:afterWeb,customersAfterVoice:db.prepare('SELECT * FROM customers WHERE ownerId=? AND phoneE164=?').all(owners[0],phone),webSubmission:body.requestId}};
 });
 await experiment('E16','Webhook failure exhausts/retries durably; successful receiver response means delivered and tenant retry cannot steal event.',async()=>{
  // Isolate one new delivery by pausing all unrelated prior events.
  db.prepare("UPDATE webhookDeliveries SET status='CANCELED' WHERE ownerId=?").run(owners[0]);deliveryStatus=503;
  const c=context();await tool(voice(c),'captureLead',{name:'[SYNTHETIC] receiver failure'},'lead');const id=db.prepare("SELECT id FROM webhookDeliveries WHERE ownerId=? AND status='PENDING'").get(c.ownerId).id;
  for(let i=0;i<8;i++){await createOutboundWebhookService(webhookOptions).dispatchOnce();const row=db.prepare('SELECT nextAttemptAt FROM webhookDeliveries WHERE id=?').get(id);clockMs=Math.max(clockMs,row.nextAttemptAt);}
  const failed=db.prepare('SELECT status,attemptCount,lastHttpStatus FROM webhookDeliveries WHERE id=?').get(id);let foreignRejected=false;try{webhooks.retry(owners[1],id);}catch(e){foreignRejected=e.statusCode===404;}
  deliveryStatus=204;webhooks.retry(owners[0],id);await webhooks.dispatchOnce();const recovered=db.prepare('SELECT status,attemptCount FROM webhookDeliveries WHERE id=?').get(id);
  clockMs=Date.parse(AT);return {meetsExpectation:failed.status==='FAILED'&&failed.attemptCount===8&&foreignRejected&&recovered.status==='DELIVERED',actual:{failed,foreignRejected,recovered}};
 });
 await experiment('E17','Older terminal failed deliveries remain discoverable and retryable in owner UI.',async()=>{
  const old=db.prepare('SELECT id FROM webhookDeliveries WHERE ownerId=? LIMIT 1').get(owners[0]);db.prepare("UPDATE webhookDeliveries SET status='FAILED',createdAt='2026-09-01T00:00:00.000Z' WHERE id=?").run(old.id);
  for(let i=0;i<21;i++){const body=webBody({email:'recent-'+i+'@example.invalid'});submitQuote(owners[0],body);}
  const view=webhooks.getConfiguration(owners[0]);return {meetsExpectation:view.deliveries.some(row=>row.id===old.id),actual:{oldFailedId:old.id,returnedCount:view.deliveries.length,oldFailureVisible:view.deliveries.some(row=>row.id===old.id),responseKeys:Object.keys(view)}};
 });
 await experiment('E18','Webhook concurrency and expired lease restart produce one local attempt with stable ID; endpoint change cancels obsolete work.',async()=>{
  db.prepare("UPDATE webhookDeliveries SET status='CANCELED' WHERE ownerId=?").run(owners[0]);const c=context();await tool(voice(c),'captureLead',{name:'[SYNTHETIC] concurrent'},'lead');const row=db.prepare("SELECT id FROM webhookDeliveries WHERE status='PENDING'").get();
  const before=deliveryCalls.length;await Promise.all([webhooks.dispatchOnce(),createOutboundWebhookService(webhookOptions).dispatchOnce()]);const attempts=deliveryCalls.length-before;
  db.prepare("UPDATE webhookDeliveries SET status='DELIVERING',leaseId='synthetic-dead-process',leaseExpiresAt=? WHERE id=?").run(clockMs-1,row.id);await createOutboundWebhookService(webhookOptions).dispatchOnce();
  const ids=deliveryCalls.slice(before).map(call=>call.headers['X-OTC-Event-ID']);await tool(voice(context()),'captureLead',{name:'[SYNTHETIC] pending-change'},'lead');await webhooks.save(owners[0],{url:'https://synthetic-new.example.invalid/hooks',events:['lead.created']});
  return {meetsExpectation:attempts===1&&ids.every(id=>id===row.id)&&!db.prepare("SELECT 1 FROM webhookDeliveries WHERE ownerId=? AND status='PENDING'").get(owners[0]),actual:{concurrentAttempts:attempts,restartEventIds:ids,changedEndpointPending:db.prepare("SELECT COUNT(*) n FROM webhookDeliveries WHERE ownerId=? AND status='PENDING'").get(owners[0]).n}};
 });
 await experiment('E19','Operator readiness reflects missing backend voice configuration.',async()=>{
  const viewSource=fs.readFileSync(new URL('../../client/src/dashboard.jsx',import.meta.url),'utf8');const viewFunction=viewSource.slice(viewSource.indexOf('function operatorView('),viewSource.indexOf('export default function Dashboard'));const operatorView=Function(viewFunction+'; return operatorView;')();
  const eligibility=operatorEligibility({phoneProvisioningStatus:'provisioned',twilioNumberSid:'PN_SYNTHETIC',knowledgeBase:{about:'[SYNTHETIC] repairs',hours:'[SYNTHETIC] weekdays'}});
  const a=express(),installed=installProductionVoice({app:a,database:db,runtimeConfig:{voiceRuntime:false,providerWrites:false},env:{}}),s=a.listen(0,'127.0.0.1');await once(s,'listening');
  try{const r=await fetch('http://127.0.0.1:'+s.address().port+'/api/twilio/voice/incoming',{method:'POST'});return {meetsExpectation:!eligibility.eligible,actual:{eligibility,displayedOperator:operatorView({enabled:true,...eligibility}),voiceConfigured:installed.configured,inboundStatus:r.status,body:await r.text()}};}finally{s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}
 });

 await experiment('E28','Preference requests preserve latest callback information, notify owner and remain in an actionable inbox after preferred dates pass.',async()=>{
  const {createBookingPreferenceService}=await import('../../server/src/bookingPreferenceService.js');const {createOwnerCalendarService}=await import('../../server/src/ownerCalendarService.js');
  const c=context(),v=voice(c);await tool(v,'captureLead',{name:'[SYNTHETIC] original',email:'old@example.invalid'},'lead');const lead=db.prepare('SELECT id FROM leads WHERE callId=?').get(c.callSid),intent=crypto.randomUUID();
  db.prepare("INSERT INTO bookingIntents(id,ownerId,tokenHash,sourceType,sourceId,serviceId,resultType,status,expiresAtUtc,createdAt) VALUES(?,?,?,'lead',?,'synthetic-service','ESTIMATE_REQUIRES_REVIEW','ACTIVE','2026-11-01T00:00:00.000Z',?)").run(intent,c.ownerId,crypto.randomUUID(),lead.id,AT);
  db.prepare("UPDATE webhookDeliveries SET status='CANCELED' WHERE ownerId=? AND status='PENDING'").run(c.ownerId);
  const preferences=createBookingPreferenceService({db,clock}),result=preferences.request({ownerId:c.ownerId,intentId:intent,idempotencyKey:crypto.randomUUID(),body:{preferredWindows:[{date:'2026-10-07',timeOfDay:'morning'}],customer:{name:'[SYNTHETIC] corrected preference',email:'latest-preference@example.invalid'},location:{addressLine1:'[SYNTHETIC] corrected site',city:'Synthetic City',region:'NS',postalCode:'B3H 1A1',country:'CA'},note:'[SYNTHETIC] Use this email instead.'}});
  const detail=callService.detail({ownerId:c.ownerId,id:c.callSid}),calendar=createOwnerCalendarService({ownerQuery,clock});const before=calendar.schedule({ownerId:c.ownerId});const attemptsBefore=deliveryCalls.length;await webhooks.dispatchOnce();const afterDelivery=deliveryCalls.length-attemptsBefore;
  clockMs+=10*86400000;const after=calendar.schedule({ownerId:c.ownerId});clockMs=Date.parse(AT);const outbox=db.prepare("SELECT eventType,status FROM outboxEvents WHERE aggregateId=?").get(result.body.preferenceRequestId);
  return {meetsExpectation:JSON.stringify(detail.bookingRequests).includes('latest-preference@example.invalid')&&after.requests.some(r=>r.id===result.body.preferenceRequestId)&&afterDelivery>0,actual:{response:result,callRequest:detail.bookingRequests,callLeadContact:detail.leads[0]?.contact,calendarBefore:before.requests.find(r=>r.id===result.body.preferenceRequestId),calendarAfter:after.requests.find(r=>r.id===result.body.preferenceRequestId)||null,outbox,notificationAttempts:afterDelivery,latestContactInLeads:(await request('/api/leads/'+lead.id)).body.contact}};
 });
 await webhooks.save(owners[0],{url:'https://synthetic-new.example.invalid/hooks',events:['lead.created','quote.requested']});
 await experiment('E29','Stored instant web inquiry exposes follow-up contact to staff and the quote-request webhook.',async()=>{
  const recordId=crypto.randomUUID(),requestId=crypto.randomUUID(),body=webBody({email:'instant-followup@example.invalid'}),result={resultType:'INSTANT_ESTIMATE_READY',quoteId:crypto.randomUUID(),customerMessage:'[SYNTHETIC] estimate receipt'};
  // Persist a synthetic released outcome as a delivery fixture; no arithmetic or price-book repair is audited.
  db.prepare("INSERT INTO quotes(id,ownerId,quoteId,serviceType,resultJson,status,callerType,createdAt) VALUES(?,?,?,'SYNTHETIC_SERVICE',?,'INSTANT','customer',?)").run(recordId,owners[0],result.quoteId,JSON.stringify({originalSubmission:body,customerResult:result}),AT);
  db.prepare('INSERT INTO quoteRequests(id,ownerId,describedService,createdAt) VALUES(?,?,?,?)').run(recordId,owners[0],'[SYNTHETIC] Instant inquiry',AT);
  db.prepare("INSERT INTO quoteSubmissions(ownerId,requestId,contentDigest,recordId,resultType,bookRevision,originalSubmissionJson,internalOutcomeJson,customerResponseJson,createdAt) VALUES(?,?,?,?,?,'synthetic-delivery-fixture',?,'{}',?,?)").run(owners[0],requestId,'synthetic',recordId,result.resultType,JSON.stringify(body),JSON.stringify(result),AT);
  const owner=(await request('/api/quotes')).body.quotes.find(r=>r.id===recordId),staff=(await request('/api/quotes',{owner:'synthetic-staff'})).body.quotes.find(r=>r.id===recordId),payload=db.prepare("SELECT payloadJson FROM webhookDeliveries WHERE aggregateId=? AND eventType='quote.requested'").get(recordId);
  const leads=(await request('/api/leads',{owner:'synthetic-staff'})).body.leads;
  return {meetsExpectation:JSON.stringify(staff).includes('instant-followup@example.invalid')&&payload?.payloadJson.includes('instant-followup@example.invalid'),actual:{ownerCanFindEmail:JSON.stringify(owner).includes('instant-followup@example.invalid'),staff,leadExists:leads.some(r=>r.id===recordId),webhook:payload?JSON.parse(payload.payloadJson):null}};
 });
 await experiment('E30','Web write failure cannot return saved acknowledgement or leave partial records.',async()=>{
  const body=webBody({email:'rollback@example.invalid'});db.exec("CREATE TRIGGER audit_web_failure BEFORE INSERT ON quoteSubmissions WHEN NEW.requestId='"+body.requestId+"' BEGIN SELECT RAISE(ABORT,'[SYNTHETIC] commit fault'); END");let error;const before=db.prepare('SELECT COUNT(*) n FROM leads').get().n;
  try{submitQuote(owners[0],body);}catch(e){error=e.code;}db.exec('DROP TRIGGER audit_web_failure');const after=db.prepare('SELECT COUNT(*) n FROM leads').get().n;
  return {meetsExpectation:!!error&&before===after&&!db.prepare('SELECT 1 FROM quoteSubmissions WHERE requestId=?').get(body.requestId),actual:{error,before,after}};
 });
 await experiment('E31','Cold process replays persisted web submission unchanged once.',async()=>{
  const body=webBody({email:'restart@example.invalid'}),first=submitQuote(owners[0],body);const filename=path.join(temporary,'restart-request.json');fs.writeFileSync(filename,JSON.stringify(body));
  const child=spawnSync(process.execPath,['--input-type=module','-e',"import fs from 'node:fs';import {submitQuote} from './server/src/quoteDoneRoutes.js';import {db} from './server/src/db.js';const body=JSON.parse(fs.readFileSync(process.env.SYNTHETIC_REQUEST_FILE));console.log(JSON.stringify(submitQuote(process.env.SYNTHETIC_OWNER,body)));db.close();"],{cwd:new URL('../..',import.meta.url).pathname,env:{...process.env,SYNTHETIC_REQUEST_FILE:filename,SYNTHETIC_OWNER:owners[0]},encoding:'utf8'});assert.equal(child.status,0,child.stderr);const replay=JSON.parse(child.stdout);
  return {meetsExpectation:replay.status===200&&JSON.stringify(replay.response)===JSON.stringify(first.response),actual:{firstStatus:first.status,replayStatus:replay.status,equal:JSON.stringify(replay.response)===JSON.stringify(first.response),count:db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE requestId=?').get(body.requestId).n}};
 });
 await experiment('E32','Owner can distinguish SMS failure from sent on the linked call while errors remain privacy-safe.',async()=>{
  const c=context(),v=voice(c,{sendSms:async()=>{throw Error('[SYNTHETIC] PRIVATE customer@example.invalid provider detail');}}),lead=await tool(v,'captureLead',{name:'[SYNTHETIC] Delivery state'},'lead'),r=await tool(v,'sendSms',{template:'callback',recordHandle:lead.leadHandle},'sms');const detail=await request('/api/calls/'+c.callSid);
  return {meetsExpectation:JSON.stringify(detail.body).includes('voice.sms_requested')&& !JSON.stringify(r).includes('PRIVATE'),actual:{response:r,privateErrorExposed:JSON.stringify(r).includes('PRIVATE'),failureCode:detail.body.failureCode,callDeliveryFields:Object.keys(detail.body).filter(k=>/notif|delivery|sms|outbox/i.test(k)),leadDeliveryFields:Object.keys(detail.body.leads[0]).filter(k=>/notif|delivery|sms|outbox/i.test(k))}};
 });
 await experiment('E33','Disconnected local HTTP client after durable POST can recover exactly one immutable web receipt.',async()=>{
  const {connect}=await import('node:net');const body=webBody({email:'lost-response@example.invalid'}),encoded=JSON.stringify(body);const socket=connect(http.address().port,'127.0.0.1');await once(socket,'connect');socket.pause();socket.write('POST /api/public/quote/synthetic-public-key HTTP/1.1\r\nHost: localhost\r\nOrigin: https://synthetic-site.example.invalid\r\nContent-Type: application/json\r\nContent-Length: '+Buffer.byteLength(encoded)+'\r\nConnection: close\r\n\r\n'+encoded);
  const deadline=Date.now()+2000;while(!db.prepare('SELECT 1 FROM quoteSubmissions WHERE requestId=?').get(body.requestId)){if(Date.now()>deadline)throw Error('Local POST did not persist');await new Promise(resolve=>setTimeout(resolve,5));}socket.destroy();const recovered=submitQuote(owners[0],body);
  return {meetsExpectation:recovered.status===200&&db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE requestId=?').get(body.requestId).n===1,actual:{recoveredStatus:recovered.status,count:db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE requestId=?').get(body.requestId).n}};
 });
 await experiment('E36','Known callback phone permits capture even when caller declines to supply a name.',async()=>{const c=context();let error,response;try{response=await tool(voice(c),'captureLead',{notes:'[SYNTHETIC] Please quote repair; prefers no name.'},'unnamed');}catch(e){error=e.code;}return {meetsExpectation:!error,actual:{error,response,callbackPhone:c.from,leadCount:db.prepare('SELECT COUNT(*) n FROM leads WHERE callId=?').get(c.callSid).n}};});

 await experiment('E37','Caller-owned cancellation reaches configured provider or durable actionable follow-up.',async()=>{
  const c=context(),v=voice(c);await tool(v,'captureLead',{name:'[SYNTHETIC] Cancellation'},'lead');const id=crypto.randomUUID();db.prepare("INSERT INTO appointments(id,ownerId,customerJson,status,startAtUtc,endAtUtc,createdAt) VALUES(?,?,?,'CONFIRMED','2026-10-07T12:00:00.000Z','2026-10-07T13:00:00.000Z',?)").run(id,c.ownerId,JSON.stringify({name:'[SYNTHETIC] Cancellation',phone:c.from}),AT);
  const history=await tool(v,'getCustomerContext',{}),appointmentHandle=history.recentAppointments.find(text=>text.includes('2026-10-07T12:00')).split(' — ')[0];const response=await tool(v,'modifyAppointment',{appointmentHandle,action:'cancel',customerConfirmed:true},'cancel');
  return {meetsExpectation:response.status==='cancelled',actual:{response,appointmentStatus:db.prepare('SELECT status FROM appointments WHERE id=?').get(id).status,outbox:db.prepare("SELECT eventType,status FROM outboxEvents WHERE ownerId=? AND eventType='voice.appointment_change_requested'").all(c.ownerId)}};
 });
 await experiment('E38','Per-caller appointment lookup survives 25 newer appointments for other callers.',async()=>{
  const c=context(owners[0],'+19025550188'),v=voice(c),id=crypto.randomUUID();db.prepare("INSERT INTO appointments(id,ownerId,customerJson,status,startAtUtc,endAtUtc,createdAt) VALUES(?,?,?,'CONFIRMED','2026-10-07T12:00:00.000Z','2026-10-07T13:00:00.000Z',?)").run(id,c.ownerId,JSON.stringify({name:'[SYNTHETIC] older appointment',phone:c.from}),AT);
  for(let i=0;i<25;i++)db.prepare("INSERT INTO appointments(id,ownerId,customerJson,status,startAtUtc,endAtUtc,createdAt) VALUES(?,?,?,'CONFIRMED',?,?,?)").run(crypto.randomUUID(),c.ownerId,JSON.stringify({name:'[SYNTHETIC] other caller',phone:'+19025550177'}),'2026-10-08T12:'+String(i).padStart(2,'0')+':00.000Z','2026-10-08T13:'+String(i).padStart(2,'0')+':00.000Z',AT);
  const result=await tool(v,'getCustomerContext',{});return {meetsExpectation:result.status==='found'&&result.recentAppointments?.length>0,actual:{callerHasStoredAppointment:!!db.prepare('SELECT id FROM appointments WHERE id=?').get(id),result}};
 });
 await experiment('E39','Returning-caller context preserves name/address and open saved requests.',async()=>{
  const c=context(owners[1],'+19025550133'),v=voice(c);await tool(v,'captureLead',{name:'[SYNTHETIC] Remember me',email:'remember@example.invalid',address},'capture');await tool(v,'logQuoteRequest',{description:'[SYNTHETIC] waiting for callback'},'request');const quoteId=crypto.randomUUID();db.prepare("INSERT INTO quotes(id,ownerId,callId,resultJson,status,createdAt) VALUES(?,?,?,?,'INSTANT',?)").run(quoteId,c.ownerId,c.callSid,JSON.stringify({originalSubmission:{contact:{phone:c.from}},customerResult:{resultType:'INSTANT_ESTIMATE_READY',quoteId:'synthetic-history-receipt'}}),AT);const result=await tool(v,'getCustomerContext',{}),internal=await v.runtime.handlers.getCustomerContext({context:c,args:{}});
  return {meetsExpectation:result.greetingName==='[SYNTHETIC] Remember me'&&!!result.address&&Array.isArray(result.openLeads),actual:{toolResult:result,handlerFields:Object.keys(internal),handlerName:internal.name,handlerAddress:internal.address,savedQuoteCount:db.prepare('SELECT COUNT(*) n FROM quotes WHERE ownerId=? AND callId=?').get(c.ownerId,c.callSid).n,openLeadCount:db.prepare('SELECT COUNT(*) n FROM leads WHERE ownerId=? AND callId=?').get(c.ownerId,c.callSid).n}};
 });
 await experiment('E40','Production owner serving supports Calls deep links and refresh.',async()=>{
  const {installOwnerAssets}=await import('../../server/src/productionAssets.js');const a=express();installOwnerAssets(a,new URL('../../client/dist',import.meta.url).pathname);const s=a.listen(0,'127.0.0.1');await once(s,'listening');try{const statuses={};for(const route of ['/dashboard','/calls','/calls?record=SYNTHETIC-CALL'])statuses[route]=(await fetch('http://127.0.0.1:'+s.address().port+route)).status;return {meetsExpectation:Object.values(statuses).every(status=>status===200),actual:{statuses}};}finally{s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}
 });

 await experiment('E44','Two independent web-submit processes serialize one committed request and one exact replay.',async()=>{
  const body=webBody({email:'two-process@example.invalid'}),filename=path.join(temporary,'two-process-request.json');fs.writeFileSync(filename,JSON.stringify(body));
  const code="import fs from 'node:fs';import {submitQuote} from './server/src/quoteDoneRoutes.js';import {db} from './server/src/db.js';const body=JSON.parse(fs.readFileSync(process.env.SYNTHETIC_REQUEST_FILE));console.log(JSON.stringify(submitQuote(process.env.SYNTHETIC_OWNER,body)));db.close();";
  const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code],{cwd:new URL('../..',import.meta.url).pathname,env:{...process.env,SYNTHETIC_REQUEST_FILE:filename,SYNTHETIC_OWNER:owners[0]},stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('exit',status=>status===0?resolve(JSON.parse(output)):reject(Error('Synthetic subprocess failed: '+error)));});
  const receipts=await Promise.all([run(),run()]),count=db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE requestId=?').get(body.requestId).n;
  return {meetsExpectation:count===1&&receipts.map(r=>r.status).sort().join()==='200,201'&&JSON.stringify(receipts[0].response)===JSON.stringify(receipts[1].response),actual:{statuses:receipts.map(r=>r.status),persistedCount:count,equal:JSON.stringify(receipts[0].response)===JSON.stringify(receipts[1].response)}};
 });
 await experiment('E45','Normalized voice customer identity survives synthetic handle-secret rotation.',async()=>{const phone='+19025550137',first=context(owners[1],phone);await tool(voice(first),'captureLead',{name:'[SYNTHETIC] identity before rotation'},'before');const next=context(owners[1],phone),runtime=createVoiceToolRuntime({database:db,callContext:next,handleSecret:'SYNTHETIC_ROTATED_HANDLE_KEY'.padEnd(64,'y'),clock,bookingCapabilityResolver:()=> 'NONE'}),dispatch=createVoiceToolDispatcher({handlers:runtime.handlers,callContext:next,idempotencyStore:runtime.idempotencyStore}).dispatch;await dispatch({name:'captureLead',toolCallId:'after',args:{name:'[SYNTHETIC] identity after rotation'}});const customers=db.prepare('SELECT id,phoneE164 FROM customers WHERE ownerId=? AND phoneE164=?').all(next.ownerId,phone);return {meetsExpectation:customers.length===1,actual:{customers}};});
 // All routes/rendering here use genuinely persisted records produced above.
 await experiment('E20','Owner/staff route and rendered lead preserve supplied notes, urgent status, delivery failure; tenants remain isolated.',async()=>{
  const c=db.prepare("SELECT callSid FROM calls WHERE callerNumber='+19025550100' ORDER BY rowid LIMIT 1").get();const detail=await request('/api/calls/'+c.callSid,{owner:'synthetic-staff'}),foreign=await request('/api/calls/'+c.callSid,{owner:owners[1]});
  const vite=await createVite({root:new URL('../../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});try{const {CallDetail}=await vite.ssrLoadModule('/src/calls.jsx');const html=renderToStaticMarkup(React.createElement(CallDetail,{call:detail.body}));fs.writeFileSync(new URL('./rendered-call.html',import.meta.url),html);
   return {meetsExpectation:html.includes('Gate fell down')&&foreign.status===404,actual:{staffStatus:detail.status,foreignStatus:foreign.status,notesRendered:html.includes('Gate fell down'),emailRendered:html.includes('alex@example.invalid'),internalEvidenceVisible:detail.body.leads.some(lead=>!!lead.internal)}};
  }finally{await vite.close();}
 });
}finally{
 http.closeAllConnections();await new Promise(resolve=>http.close(resolve));db.close();fs.rmSync(temporary,{recursive:true,force:true});
 fs.writeFileSync(new URL('./results.json',import.meta.url),JSON.stringify({auditedSha:'73c00622d6f2df31f57773b32e41355a7421f1a3',syntheticOnly:true,experiments:results},null,2)+'\n');
}
if(results.some(result=>result.experimentError))process.exitCode=1;
