// Synthetic-only process running the application's actual server entry point.
import {mock} from 'node:test';
import {once} from 'node:events';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import Stripe from 'stripe';
import bcrypt from 'bcrypt';
import express from 'express';

const namedUses=new Set(),mounts=new WeakMap(),originalUse=express.application.use,routerUse=express.Router.use;
express.application.use=function(...args){if(typeof args[0]==='string')namedUses.add(args[0]);return originalUse.apply(this,args);};
express.Router.use=function(...args) {
  const count=this.stack.length,result=routerUse.apply(this,args);
  const prefix=typeof args[0]==='string'?args[0]:Array.isArray(args[0])||args[0] instanceof RegExp?null:'';
  for(const layer of this.stack.slice(count))mounts.set(layer,prefix);
  return result;
};
process.env.ADMIN_EMAIL='synthetic-admin@example.invalid';
process.env.ADMIN_PASSWORD_HASH=await bcrypt.hash('SYNTHETIC-admin-password',12);

let blockedNetwork=0,providerCalls=[];
for(const transport of [http,https]) {
  const original=transport.request;
  transport.request=function(input,...args) {
    const host=typeof input==='string'?new URL(input).hostname:input instanceof URL?input.hostname:input?.hostname||input?.host;
    if(!['localhost','127.0.0.1','::1'].includes(host)) {blockedNetwork++;throw Error('SYNTHETIC fixture blocked external network');}
    return original.call(this,input,...args);
  };
}
syncBuiltinESMExports();
globalThis.fetch=async()=>{blockedNetwork++;throw Error('SYNTHETIC fixture blocked external fetch');};
class SyntheticStripe extends Stripe {
  constructor(...args) {
    super(...args);
    this.customers.create=async input=>{providerCalls.push({kind:'customer',input});return {id:'cus_synthetic_created'};};
    this.checkout.sessions.create=async input=>{providerCalls.push({kind:'checkout',input});return {id:'cs_synthetic',customer:input.customer,mode:'subscription',status:'open',url:'https://checkout.example.invalid/synthetic',expires_at:Math.floor(Date.now()/1000)+3600};};
    this.checkout.sessions.retrieve=async()=>{throw Error('Synthetic Checkout hydration unavailable');};
    this.billingPortal.sessions.create=async input=>{providerCalls.push({kind:'portal',input});return {url:'https://billing.example.invalid/synthetic'};};
  }
}
mock.module('stripe',{defaultExport:SyntheticStripe});
// Provider data is synthetic, but the production route and number check are real.
const integrations=await import('../../server/src/platformIntegrations.js');
mock.module('../../server/src/platformIntegrations.js',{namedExports:{...integrations,getTwilioCallStatus:async sid=>{
  if(sid==='CA'+'2'.repeat(32))return {to:'+19025550299',from:'+19025550201',status:'completed'};
  if(sid==='CA'+'1'.repeat(32))return {to:'+19025550199',from:'+19025550101',status:'completed'};
  throw Object.assign(Error('SYNTHETIC provider missing call'),{statusCode:404});
}}});
const {default:app,httpServer,lifecycle,voiceRuntime}=await import('../../server/src/server.js');
const {db,ownerQuery}=await import('../../server/src/db.js');
const {savePricebook,loadPricebook}=await import('../../server/priceBookService.js');
const bridge=await import('../../server/src/quoteDoneBridge.js');
const {mowing}=await import('../../verification/engine-independent/fixtures.mjs');
const {createAuthSessionService}=await import('../../server/src/authSessionService.js');
const {createBookingService}=await import('../../server/src/bookingService.js');
const {sealSlotToken}=await import('../../server/src/bookingTokens.js');
const {createOutboundWebhookService}=await import('../../server/src/outboundWebhookService.js');
const {createVoiceSessionNonceService}=await import('../../server/src/voice/sessionNonceService.js');
const {createVoiceNonceRepository,createVoiceSessionStore}=await import('../../server/src/voice/voicePersistence.js');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const at=new Date().toISOString(),expiry=new Date(Date.now()+86400000).toISOString();
const sessions=createAuthSessionService(db),tenants={};
for(const [label,n] of [['A',1],['B',2]]) {
  const owner=uuid(n),staff=uuid(n+2),password='SYNTHETIC-password-'+label;
  const passwordHash=await bcrypt.hash(password,12);
  for(const [id,role,parent] of [[owner,'owner',null],[staff,'staff',owner]]) {
    db.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt,emailVerifiedAt) VALUES(?,?,?,?,?,?,'Scale','active','UTC',?,?,?)").run(id,parent,`synthetic-${label.toLowerCase()}-${role}@example.invalid`,passwordHash,'[SYNTHETIC] '+label,'[SYNTHETIC] PRIVATE_'+label+'_BUSINESS',role,at,at);
  }
  const phone=`+19025550${n}01`,fallback=`+19025550${n}99`,service=uuid(n+100),call=uuid(n+200),lead=uuid(n+300),quote=uuid(n+400),draft=uuid(n+500),booking=uuid(n+600);
  db.prepare("INSERT INTO billingAccounts(ownerId,stripeCustomerId,stripeSubscriptionId,stripePriceId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)").run(owner,'cus_synthetic_'+label,'sub_synthetic_'+label,'price_synthetic_Q_month',at,at,at);
  db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(owner);
  db.prepare("INSERT INTO businessProfiles(ownerId,businessTypesJson,twilioNumber,existingPhoneNumber,knowledgeBaseJson,phoneProvisioningStatus,operatorEnabled,updatedAt) VALUES(?,?,?,?,?,'provisioned',1,?)").run(owner,'["LANDSCAPING_MOWING"]',phone,fallback,JSON.stringify({about:'PRIVATE_'+label+'_KNOWLEDGE',hours:'Synthetic hours',services:'Mowing',prices:'PRIVATE_'+label+'_RATES',draft:false}),at);
  const fixture=mowing(),raw=structuredClone(fixture.ownerPricing);delete raw.origin;
  raw.id=service;raw.service='PRIVATE_'+label+'_SERVICE';
  savePricebook(owner,{services:[raw],defaults:{...fixture.businessDefaults,currency:'CAD',peakMonths:[],peakSurchargePercent:0}});
  let book=loadPricebook(owner);bridge.approveApplicationService(owner,service,{revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:'UTC'});book=loadPricebook(owner);
  db.prepare('INSERT INTO quoteAccessKeys(ownerId,publicKey,allowedOriginsJson,createdAt) VALUES(?,?,?,?)').run(owner,'synthetic-widget-'+label,JSON.stringify(['https://synthetic-'+label.toLowerCase()+'.example.invalid']),at);
  const callSid='CA'+String(n).repeat(32),context={ownerId:owner,callSid,accountSid:process.env.TWILIO_ACCOUNT_SID,from:'+19025550000',to:phone};
  db.prepare('INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,summaryText,transcriptJson,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(call,owner,callSid,context.accountSid,context.from,phone,'COMPLETED','PRIVATE_'+label+'_CALL',JSON.stringify([{role:'caller',text:'PRIVATE_'+label+'_TRANSCRIPT'}]),at);
  db.prepare('INSERT INTO quotes(id,ownerId,callId,serviceType,status,resultJson,createdAt) VALUES(?,?,?,?,?,?,?)').run(quote,owner,call,'LANDSCAPING_MOWING','INSTANT',JSON.stringify({customerResult:{resultType:'INSTANT_ESTIMATE_READY',lowEstimate:100,midEstimate:100,highEstimate:100,currency:'CAD',priceUnit:'per visit',taxTreatment:'No tax added.'},internalResult:{private:'PRIVATE_'+label+'_QUOTE'}}),at);
  db.prepare('INSERT INTO leads(id,ownerId,callId,customerName,collectedInputsJson,type,status,createdAt) VALUES(?,?,?,?,?,?,?,?)').run(lead,owner,call,'PRIVATE_'+label+'_LEAD',JSON.stringify({contact:{email:'private_'+label+'@example.invalid'},internalResult:{private:'PRIVATE_'+label+'_LEAD_INTERNAL'}}),'voice_lead','NEEDS REVIEW',at);
  db.prepare('INSERT INTO quoteRequests(id,ownerId,callId,describedService,createdAt) VALUES(?,?,?,?,?)').run(uuid(n+700),owner,call,'PRIVATE_'+label+'_REQUEST',at);
  db.prepare('INSERT INTO priceBookDrafts(id,ownerId,mode,serviceTypesJson,fieldsJson,confirmedFieldsJson,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)').run(draft,owner,'browser','["LANDSCAPING_MOWING"]','{}','{}',at,at);
  const bookingService=createBookingService({db,calendar:{listBusy:async()=>[],createEvent:async()=>({}),getEvent:async()=>({})},slotTokenSecret:process.env.BOOKING_SLOT_TOKEN_SECRET});
  const intent=bookingService.createIntent({ownerId:owner,sourceType:'quote',sourceId:quote,serviceId:service,resultType:'INSTANT_ESTIMATE_READY',expiresAtUtc:expiry});
  const hold=uuid(n+1000),delivery=uuid(n+1100),endAt=new Date(Date.now()+90000000).toISOString();
  db.prepare(`INSERT INTO bookingHolds(id,ownerId,intentId,calendarId,slotIdDigest,startAtUtc,endAtUtc,lockStartAtUtc,lockEndAtUtc,policyRevision,status,expiresAtUtc,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,'CONFIRMED',?,?,?)`).run(hold,owner,intent.intentId,'synthetic-calendar-'+label,'synthetic-slot-digest-'+label,expiry,endAt,expiry,endAt,'synthetic-policy-'+label,expiry,at,at);
  db.prepare('INSERT INTO appointments(id,ownerId,quoteId,bookingIntentId,holdId,status,startAtUtc,endAtUtc,createdAt,customerJson,timezone) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(booking,owner,quote,intent.intentId,hold,'CONFIRMED',expiry,endAt,at,JSON.stringify({name:'PRIVATE_'+label+'_BOOKING'}),'UTC');
  const confirmationId=sealSlotToken({kind:'booking-confirmation',ownerId:owner,intentId:intent.intentId,appointmentId:booking,expiresAtUtc:expiry},process.env.BOOKING_SLOT_TOKEN_SECRET);
  const webhooks=createOutboundWebhookService({database:db,ownerQuery,resolveDestination:async url=>({url:new URL(url)})});
  await webhooks.save(owner,{url:'https://synthetic-'+label.toLowerCase()+'.example.invalid/hooks',events:['lead.created']});
  const endpoint=db.prepare('SELECT version FROM webhookEndpoints WHERE ownerId=?').get(owner);
  db.prepare(`INSERT INTO webhookDeliveries(id,ownerId,endpointVersion,eventType,aggregateId,payloadJson,status,nextAttemptAt,createdAt,updatedAt) VALUES(?,?,?,'lead.created',?,?,'FAILED',0,?,?)`).run(delivery,owner,endpoint.version,lead,JSON.stringify({id:lead,customerName:'PRIVATE_'+label+'_WEBHOOK'}),at,at);
  db.prepare('INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt) VALUES(?,?,?,\'book_job\',60,1,?)').run(owner,service,'synthetic-policy-'+label,at);
  db.prepare('INSERT INTO bookingSettings(ownerId,revision,timezone,directBookingEnabled,updatedAt) VALUES(?,?,\'UTC\',0,?)').run(owner,'synthetic-settings-'+label,at);
  const transfer=uuid(n+1200),sms=uuid(n+1300),smsToken=String(n).repeat(48),smsProvider='SM'+String(n).repeat(32);
  db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES(?,?,'voice.transfer_requested',?,?,'PENDING',?,?)").run(transfer,owner,callSid,JSON.stringify({callSid,destination:fallback,notes:'PRIVATE_'+label+'_TRANSFER'}),at,at);
  db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES(?,?,'voice.sms_requested',?,?,'SENT',?,?)").run(sms,owner,callSid,JSON.stringify({callSid,private:'PRIVATE_'+label+'_SMS'}),at,at);
  db.prepare("INSERT INTO voiceSmsDeliveries(id,ownerId,callSid,recordType,recordId,requestJson,callbackToken,status,attemptCount,providerId,createdAt,updatedAt) VALUES(?,?,?,'lead',?,?,?,'SENT',1,?,?,?)").run(sms,owner,callSid,lead,JSON.stringify({accountSid:context.accountSid,to:context.from,from:phone,body:'PRIVATE_'+label+'_SMS'}),smsToken,smsProvider,at,at);
  const alert=db.prepare("SELECT id FROM ownerAlerts WHERE ownerId=? AND eventType='lead.created' AND aggregateId=?").get(owner,lead).id;
  db.prepare("UPDATE ownerAlerts SET status='FAILED' WHERE ownerId=? AND id=?").run(owner,alert);
  const nonce=await createVoiceSessionNonceService({repository:createVoiceNonceRepository({database:db})}).issue(context);
  const voiceStore=createVoiceSessionStore({database:db});voiceStore.createSession({sessionKey:crypto.createHash('sha256').update(nonce.nonce).digest('hex'),context,expiresAt:nonce.expiresAt});
  const auth={};for(const [role,id] of [['owner',owner],['staff',staff]]) {
    const receipt=sessions.create(db.prepare('SELECT * FROM users WHERE id=?').get(id));
    auth[role]={token:receipt.token,cookie:(process.env.NODE_ENV==='production'?'__Host-':'')+'otc_refresh_'+receipt.sessionId+'='+receipt.refreshToken};
  }
  tenants[label]={label,owner,staff,transfer,sms,smsToken,smsProvider,alert,password,passwordHash,bookRevision:bridge.bookRevision(book),email:`synthetic-${label.toLowerCase()}-owner@example.invalid`,auth,phone,fallback,service,call,callSid,lead,quote,draft,booking,hold,delivery,confirmationId,bookingIntentId:intent.intentId,bookingToken:intent.bookingToken,publicKey:'synthetic-widget-'+label,origin:'https://synthetic-'+label.toLowerCase()+'.example.invalid',nonce:nonce.nonce,quoteBody:{requestId:uuid(n+900),serviceId:service,customerInputs:fixture.customerInputs,contact:{email:'synthetic@example.invalid'}}};
  // Unequal counters catch aggregate leaks that contain no identifying strings.
  if(label==='B')for(let index=0;index<3;index++)db.prepare('INSERT INTO calls(id,ownerId,status,summaryText,createdAt) VALUES(?,?,?,?,?)').run(uuid(800+index),owner,'COMPLETED','PRIVATE_B_EXTRA_CALL',at);
}
// Keep seeded notification work outside this authorization-only observation window.
db.prepare('UPDATE ownerAlerts SET nextAttemptAt=? WHERE ownerId IN (?,?)').run(Date.now()+86400000,tenants.A.owner,tenants.B.owner);
function snapshot(owner) {
  const rows={};
  for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
    const columns=db.prepare('PRAGMA table_info('+name+')').all();
    const field=columns.some(c=>c.name==='ownerId')?'ownerId':name==='users'?'id':columns.some(c=>c.name==='userId')?'userId':null;
    if(name==='users')rows[name]=db.prepare('SELECT * FROM users WHERE id=? OR ownerId=?').all(owner,owner);
    else if(field)rows[name]=field==='userId'?db.prepare('SELECT * FROM '+name+' WHERE userId IN (SELECT id FROM users WHERE id=? OR ownerId=?)').all(owner,owner):db.prepare('SELECT * FROM '+name+' WHERE '+field+'=?').all(owner);
    if(rows[name])rows[name].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return {rows,book:loadPricebook(owner)};
}
if(!httpServer.listening)await once(httpServer,'listening');
function registeredRoutes(stack,prefix='') {
  return stack.flatMap(layer=>{
    if(layer.route) {
      if(typeof layer.route.path!=='string')throw Error('A nonliteral route requires explicit matrix coverage');
      return Object.keys(layer.route.methods).map(method=>method.toUpperCase()+' '+prefix+layer.route.path);
    }
    if(layer.handle?.stack) {
      const mount=mounts.get(layer);
      if(mount===undefined||mount===null)throw Error('A nonliteral router mount requires explicit matrix coverage');
      return registeredRoutes(layer.handle.stack,prefix+mount.replace(/\/$/,''));
    }
    return [];
  });
}
const routes=registeredRoutes(app._router.stack);
const middleware=app._router.stack.filter(layer=>!layer.route&&!layer.handle?.stack).map(layer=>({
  name:layer.name,mount:mounts.get(layer),hash:crypto.createHash('sha256').update(String(layer.handle)).digest('hex')
}));
for(const name of namedUses)routes.push('USE '+(name==='/assets'?name+'/*':name));
if(voiceRuntime.paths?.streamPath)routes.push('WS '+voiceRuntime.paths.streamPath+'/:nonce');
process.on('message',message=>{
  try {
    let result;
    if(message.command==='snapshot')result=snapshot(message.owner);
    else if(message.command==='network')result={blockedNetwork,providerCalls};
    else if(message.command==='register-probe-route') {app.get('/api/synthetic-unreviewed-route',(_req,res)=>res.json({ok:true}));result=registeredRoutes(app._router.stack).sort();}
    else if(message.command==='register-probe-router') {const nested=express.Router();nested.post('/new',(_req,res)=>res.json({ok:true}));app.use(nested);result=registeredRoutes(app._router.stack).sort();}
    else if(message.command==='add-b-call') {db.prepare('INSERT INTO calls(id,ownerId,status,createdAt) VALUES(?,?,?,?)').run(crypto.randomUUID(),tenants.B.owner,'COMPLETED',at);result=true;}
    else throw Error('Unknown synthetic command');
    process.send({id:message.id,result});
  }catch(error){process.send({id:message.id,error:error.message});}
});
process.send({ready:true,port:httpServer.address().port,routes:routes.sort(),middleware,tenants,engineVersion:bridge.ENGINE_VERSION});
