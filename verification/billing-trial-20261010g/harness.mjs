// Verification only. Real application routes/UI; fake providers and in-memory SQLite.
// Stripe fixture: test/overageMinute20261006Fixture.mjs; signature pattern:
// test/billingCoreRepair20261006.helpers.mjs. Voice shapes are copied (not imported,
// because that file registers tests) from test/voiceQuotePathCases20261005.mjs.
import './environment.mjs';
import express from 'express';
import Stripe from 'stripe';
import twilio from 'twilio';
import WebSocket from 'ws';
import {once} from 'node:events';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {fixture,A,B,prices} from '../../test/overageMinute20261006Fixture.mjs';
import {installBillingRoutes,installBillingWebhookRoute} from '../../server/src/billingRoutes.js';
import {createBillingCustomerLifecycle,installBillingCustomerLifecycleRoutes} from '../../server/src/billingCustomerLifecycle.js';
import {installProductionVoice} from '../../server/src/voice/productionVoiceRuntime.js';
import {installOwnerAssets} from '../../server/src/productionAssets.js';

export const folder=path.dirname(fileURLToPath(import.meta.url));
export const repo=path.resolve(folder,'../..');
export const START='2026-10-10T12:00:00.000Z',END='2026-10-24T12:00:00.000Z';
export const ACCOUNT='AC'+'a'.repeat(32),FROM='+19025550100',TO='+19025550101';
const ORIGIN='https://voice.example.test',TOKEN='synthetic-signature-secret',SECRET='whsec_SYNTHETIC_ONLY';
export {A,B};
const sec=value=>Date.parse(value)/1000;
export async function until(predicate,label='condition') {
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}
  throw Error('Timed out waiting for '+label);
}

export async function buildUi(){
  const dist=path.join(folder,'.runtime/client');mkdirSync(dist,{recursive:true});
  await build({absWorkingDir:repo,entryPoints:['client/src/main.jsx'],outdir:path.join(dist,'assets'),bundle:true,format:'iife',
    define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},loader:{'.woff2':'file','.png':'file','.svg':'file'}});
  const html=readFileSync(path.join(repo,'client/index.html'),'utf8')
    .replace('</head>','<link rel="stylesheet" href="/assets/main.css"></head>')
    .replace('<script type="module" src="/src/main.jsx"></script>','<script src="/assets/main.js"></script>');
  writeFileSync(path.join(dist,'index.html'),html);return dist;
}

export async function startHarness({stripeEnabled=true,dist}={}){
  const f=fixture(null);f.setTime(START);
  f.db.prepare("UPDATE users SET firstName='[PLACEHOLDER]',businessName='[PLACEHOLDER] Billing rehearsal',createdAt=?").run(START);
  // B represents an owner who has not yet visited Checkout; no Stripe customer exists.
  f.db.prepare('DELETE FROM billingAccounts WHERE ownerId=?').run(B);
  f.db.prepare("INSERT INTO businessProfiles(ownerId,existingPhoneNumber,twilioNumber,twilioNumberSid,phoneProvisioningStatus,operatorEnabled,agentName,knowledgeBaseJson,updatedAt) VALUES(?,?,?,'PN_SYNTHETIC','provisioned',1,'[PLACEHOLDER] Receptionist',?,?)")
    .run(A,'+19025550199',TO,JSON.stringify({about:'[PLACEHOLDER] Synthetic billing business',hours:'Weekdays',serviceArea:{mode:'all',cities:[]}}),START);
  const tokens=Object.fromEntries([A,B].map(id=>[id,'synthetic.'+Buffer.from(JSON.stringify({sub:id,role:'owner',sid:'s'.repeat(43)})).toString('base64url')+'.synthetic']));
  const requests=[],errors=[],providerWrites=[],connects=[],sent=[];let callbacks,sequence=0;
  const stripe=f.fakes.stripe;
  const forbid=kind=>async()=>{providerWrites.push(kind);throw Error('Unexpected synthetic provider operation: '+kind);};
  stripe.customers={create:forbid('stripe.customers.create')};
  stripe.checkout={sessions:{create:forbid('stripe.checkout.create'),retrieve:forbid('stripe.checkout.retrieve')}};
  stripe.billingPortal={sessions:{create:forbid('stripe.portal.create')}};
  // This SDK instance is used exclusively for local HMAC verification; it has no real key.
  const verifier=new Stripe('sk_test_SYNTHETIC_NEVER_NETWORK');
  const app=express();
  app.use((req,res,next)=>{const row={method:req.method,path:req.path,at:f.clock().toISOString()};requests.push(row);res.on('finish',()=>{row.status=res.statusCode;});next();});
  if(stripeEnabled)installBillingWebhookRoute(app,{rawBodyMiddleware:express.raw({type:'application/json'}),
    constructEvent:(...args)=>verifier.webhooks.constructEvent(...args),webhookSecret:SECRET,billingStateService:f.billing,stripeClient:stripe,minuteBilling:f.service});
  app.use(express.json());
  const requireAuth=()=> (req,res,next)=>{
    const owner=Object.keys(tokens).find(id=>req.get('authorization')==='Bearer '+tokens[id]);
    if(!owner)return res.status(401).json({error:'Synthetic session required'});
    req.tenantOwnerId=owner;req.role='owner';next();
  };
  const asyncHandler=handler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);
  const requireProviderWrites=(_req,_res,next)=>next();
  if(stripeEnabled)installBillingRoutes(app,{stripeClient:stripe,billingStateService:f.billing,database:f.db,requireAuth,requireProviderWrites,asyncHandler,
    providerOperationsEnabled:true,priceIds:prices,successUrl:'https://app.example.invalid/settings/billing?checkout=success',
    cancelUrl:'https://app.example.invalid/settings/billing?checkout=cancel',portalReturnUrl:'https://app.example.invalid/settings/billing',
    integrationIdentifier:'synthetic_abcdefgh',checkoutReceiptEncryptionKey:'33'.repeat(32),clock:f.clock});
  const lifecycle=createBillingCustomerLifecycle({database:f.db,priceIds:prices,stripeClient:stripe,emailProvider:f.fakes.email,enabled:()=>false,clock:f.clock});
  installBillingCustomerLifecycleRoutes(app,{service:lifecycle,requireAuth,requireProviderWrites,asyncHandler});
  const session={sendRealtimeInput:value=>sent.push(value),sendClientContent:value=>sent.push(value),
    sendToolResponse:async value=>sent.push(value),close:async()=>{}};
  const googleClient={live:{connect:async value=>{connects.push(value);callbacks=value.callbacks;return session;}}};
  const twilioClient={messages:{create:forbid('twilio.sms')},calls:()=>({update:forbid('twilio.calls.update')})};
  const voice=installProductionVoice({app,database:f.db,runtimeConfig:{voiceRuntime:true,providerWrites:true},
    env:{TWILIO_ACCOUNT_SID:ACCOUNT,TWILIO_AUTH_TOKEN:TOKEN,PUBLIC_BASE_URL:ORIGIN,GEMINI_MODEL:'synthetic-live-model',JWT_SECRET:'synthetic-jwt-secret'.padEnd(64,'x')},
    googleClient,twilioClient,clock:f.clock,onUsage:id=>f.service.syncOwner(id),onError:code=>errors.push(code)});
  if(dist)installOwnerAssets(app,dist);
  app.use((err,_req,res,_next)=>{errors.push(err.message);res.status(err.statusCode||500).json({error:err.message,code:err.code});});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;let ws;
  async function api(route,owner=A){const response=await fetch(origin+route,{headers:{authorization:'Bearer '+tokens[owner]}});const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=text;}return {status:response.status,body};}
  async function setTrial(plan='Operator'){
    const object={id:'sub_'+A,customer:'cus_'+A,status:'trialing',default_payment_method:'pm_SYNTHETIC',trial_start:sec(START),trial_end:sec(END),
      billing_cycle_anchor:sec(END),current_period_start:sec(START),current_period_end:sec(END),cancel_at_period_end:false,
      items:{data:[{price:{id:prices[plan].monthly,currency:'cad',recurring:{interval:'month',interval_count:1}}}]}};
    f.fakes.subscriptions.set(object.id,structuredClone(object));
    const event={id:'evt_SYNTHETIC_trial_'+(++sequence),type:'customer.subscription.updated',created:sec(f.clock().toISOString())+sequence,livemode:false,data:{object}};
    const payload=JSON.stringify(event),signature=verifier.webhooks.generateTestHeaderString({payload,secret:SECRET});
    const response=await fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body:payload});
    return {status:response.status,body:await response.json(),event};
  }
  const params={AccountSid:ACCOUNT,CallSid:'CA'+'b'.repeat(32),From:FROM,To:TO,Direction:'inbound'};
  async function signedPost(route,body=params){
    const response=await fetch(origin+route,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',
      'x-twilio-signature':twilio.getExpectedTwilioSignature(TOKEN,ORIGIN+route,body)},body:new URLSearchParams(body)});
    return {status:response.status,body:await response.text()};
  }
  async function connect(){
    const incoming=await signedPost('/api/twilio/voice/incoming');
    const url=incoming.body.match(/<Stream url="([^"]+)"/)?.[1];if(!url)throw Error(JSON.stringify(incoming));
    ws=new WebSocket(origin.replace(/^http:/,'ws:')+new URL(url).pathname,{headers:{'x-twilio-signature':twilio.getExpectedTwilioSignature(TOKEN,url,{})}});
    await once(ws,'open');const streamSid='MZ'+'c'.repeat(32);
    ws.send(JSON.stringify({event:'connected',protocol:'Call',version:'1.0.0'}));
    ws.send(JSON.stringify({event:'start',sequenceNumber:'1',streamSid,start:{accountSid:ACCOUNT,callSid:params.CallSid,streamSid,tracks:['inbound'],mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}}));
    await until(()=>connects.length===1&&f.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(A,params.CallSid)?.status==='CONNECTED','connected synthetic call');
    callbacks.onmessage({serverContent:{inputTranscription:{text:'[PLACEHOLDER] This is a synthetic billing check.'}}});
    return {incoming,streamSid};
  }
  async function finishMedia(){
    f.setTime('2026-10-10T12:02:05.000Z');
    ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:'MZ'+'c'.repeat(32),stop:{accountSid:ACCOUNT,callSid:params.CallSid}}));
    await until(()=>f.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(A,params.CallSid)?.status==='COMPLETED','media completion');
  }
  async function complete(){return signedPost('/api/twilio/voice/status',{...params,CallStatus:'completed',CallDuration:'125'});}
  function usage(){return {snapshot:f.service.snapshot(A),calls:f.db.prepare('SELECT id,status,duration,minutesBilled,completedAt FROM calls WHERE ownerId=?').all(A),
    meter:f.db.prepare('SELECT callId,usageKind,localDurationSeconds,providerDurationSeconds,providerDigest FROM billingVoiceUsage WHERE ownerId=?').all(A)};}
  async function close(){ws?.terminate();await voice.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));f.close();}
  return {f,app,origin,tokens,requests,errors,providerWrites,connects,sent,api,setTrial,connect,finishMedia,complete,usage,close};
}
