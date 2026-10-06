import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import twilio from 'twilio';
import {smsFixture} from './ownerAlertsDelivery20261006Fixture.mjs';
import {createVoiceSmsProvider,installVoiceSmsStatusRoute} from '../server/src/voiceSmsProvider.js';
const env={ALLOW_PROVIDER_WRITES:'true',SMS_DELIVERY_ENABLED:'true',TWILIO_SMS_REGISTRATION_APPROVED:'true',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'SYNTHETIC_STATUS_TOKEN',PUBLIC_BASE_URL:'https://synthetic.example.invalid'};
const sid='SM'+'a'.repeat(32);
test('SMS adapter uses frozen caller content, tenant sender, receipt callbacks and no unproven POST idempotency',async t=>{
  const f=smsFixture(t),calls=[];f.db.prepare("UPDATE businessProfiles SET twilioNumber=?,phoneProvisioningStatus='provisioned' WHERE ownerId=?").run(f.c.to,f.c.ownerId);
  const provider=createVoiceSmsProvider({database:f.db,environment:env,fetchImplementation:async(url,options)=>{calls.push({url,...options});return {ok:true,json:async()=>({sid,status:'queued',account_sid:env.TWILIO_ACCOUNT_SID,to:f.c.from,from:f.c.to})};}});
  const request={ownerId:f.c.ownerId,accountSid:f.c.accountSid,to:f.c.from,from:f.c.to,body:'[SYNTHETIC] Saved request. Reply STOP to opt out.',eventId:'synthetic-event',callbackToken:'c'.repeat(48)};
  assert.equal(provider.ready(request,f.c.ownerId),true);assert.equal(provider.ready(request,'synthetic-b'),false);
  assert.deepEqual(await provider.send(request),{id:sid,status:'queued'});assert.equal(calls[0].body.get('Body'),request.body);assert.equal(calls[0].body.get('To'),f.c.from);assert.equal(calls[0].body.get('StatusCallback'),env.PUBLIC_BASE_URL+'/api/voice/sms-status/synthetic-a/synthetic-event/'+request.callbackToken);assert.equal(calls[0].headers['Idempotency-Key'],undefined);
  assert.deepEqual(await provider.lookup({...request,id:sid}),{id:sid,status:'queued'});assert.equal(calls[1].method,'GET');assert.match(calls[1].url,/Messages\/SM.*\.json$/);
  for(const setting of ['ALLOW_PROVIDER_WRITES','SMS_DELIVERY_ENABLED','TWILIO_SMS_REGISTRATION_APPROVED'])assert.equal(createVoiceSmsProvider({database:f.db,environment:{...env,[setting]:'false'},fetchImplementation:()=>{throw Error('Unexpected network');}}).ready(request,f.c.ownerId),false);
});
for(const scenario of ['429','500','21610','wrong-recipient','missing-id'])test('SMS adapter classifies '+scenario+' safely',async t=>{
  const f=smsFixture(t);f.db.prepare("UPDATE businessProfiles SET twilioNumber=?,phoneProvisioningStatus='provisioned' WHERE ownerId=?").run(f.c.to,f.c.ownerId);
  const provider=createVoiceSmsProvider({database:f.db,environment:env,fetchImplementation:async()=>({ok:!['429','500','21610'].includes(scenario),status:scenario==='21610'?400:Number(scenario)||200,json:async()=>({sid:scenario==='missing-id'?null:sid,status:'queued',code:scenario==='21610'?21610:0,account_sid:f.c.accountSid,to:scenario==='wrong-recipient'?'+19025550999':f.c.from,from:f.c.to})})});
  await assert.rejects(provider.send({ownerId:f.c.ownerId,accountSid:f.c.accountSid,to:f.c.from,from:f.c.to,body:'[SYNTHETIC]',eventId:'event',callbackToken:'c'.repeat(48)}),error=>{assert.equal(error.definitive===true,['429','21610'].includes(scenario));if(scenario==='21610')assert.equal(error.code,'SMS_RECIPIENT_OPTED_OUT');return true;});
});
test('D02/D19: actual signed SMS status route rejects wrong signatures/tenants and reconciles once',async t=>{
  const f=smsFixture(t,{provider:{send:async()=>({status:'QUEUED',id:sid})}}),lead=await f.tool('captureLead',{description:'[SYNTHETIC] Status route'});await f.tool('sendSms',{template:'callback',recordHandle:lead.leadHandle});const r=f.rows()[0];
  const app=express();installVoiceSmsStatusRoute(app,{service:f.smsService(),environment:env,asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next)});app.use((error,req,res,next)=>res.status(error.statusCode||500).json({code:error.code||'UNKNOWN'}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const route='/api/voice/sms-status/'+f.c.ownerId+'/'+r.id+'/'+r.callbackToken;
  const params={AccountSid:f.c.accountSid,MessageSid:sid,MessageStatus:'delivered',To:f.c.from,From:f.c.to};
  async function post(path=route,p=params,sig){return fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':sig??twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN,env.PUBLIC_BASE_URL+path,p)},body:new URLSearchParams(p)});}
  assert.equal((await post(route,params,'invalid')).status,403);assert.equal((await post(route.replace(f.c.ownerId,'synthetic-b'))).status,403);assert.equal((await post(route,{...params,To:'+19025550999'})).status,403);assert.equal(f.rows()[0].status,'QUEUED');
  assert.equal((await post()).status,204);assert.equal((await post()).status,204);assert.equal(f.rows()[0].status,'DELIVERED');assert.equal(f.rows()[0].attemptCount,1);assert.equal((await post(route,{...params,MessageStatus:'queued'})).status,204);assert.equal(f.rows()[0].status,'DELIVERED');
});
test('D02: missing status callback is reconciled by bounded provider GETs, never another SMS POST',async t=>{
  let sends=0,reads=0;const f=smsFixture(t,{provider:{send:async()=>{sends++;return {status:'QUEUED',id:sid};},lookup:async()=>{reads++;return {status:reads===2?'DELIVERED':'QUEUED',id:sid};}}}),lead=await f.tool('captureLead',{description:'[SYNTHETIC] Reconcile'});await f.tool('sendSms',{template:'callback',recordHandle:lead.leadHandle});f.advance(5000);await f.smsService().dispatchOnce();assert.equal(reads,1);assert.equal(f.rows()[0].status,'QUEUED');f.advance(60000);f.restart();await f.smsService().dispatchOnce();assert.equal(reads,2);assert.equal(f.rows()[0].status,'DELIVERED');assert.equal(sends,1);
});
test('D02: exhausted receipt lookups become discoverable UNKNOWN without resending',async t=>{
  let sends=0,reads=0;const f=smsFixture(t,{provider:{send:async()=>{sends++;return {status:'QUEUED',id:sid};},lookup:async()=>{reads++;throw Error('SYNTHETIC timeout');}}}),lead=await f.tool('captureLead',{});await f.tool('sendSms',{template:'callback',recordHandle:lead.leadHandle});for(let n=0;n<6;n++){f.advance(60000);await f.smsService().dispatchOnce();}assert.equal(reads,5);assert.equal(sends,1);assert.equal(f.rows()[0].status,'UNKNOWN');assert.equal(f.rows()[0].lastErrorCode,'SMS_RECEIPT_UNCONFIRMED');
});
