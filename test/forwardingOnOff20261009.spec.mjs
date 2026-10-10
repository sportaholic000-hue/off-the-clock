import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,TO,FROM,until} from './voiceLifecycle20261006Fixture.mjs';
import {latestForwardingArrival} from '../server/src/voice/voiceForwardingCheck.js';
import {startTenantIsolation} from './helpers/tenantIsolationProcess.mjs';
import twilio from 'twilio';
import {fixture} from './leadCaptureRepair20261006Fixture.mjs';
import {createTelephonyOperations} from '../server/src/platformIntegrations.js';

function seedTrialEvidence(h,trialEnd){
  const subscription='sub_synthetic_forwarding_trial';
  const customer=h.db.prepare('SELECT stripeCustomerId FROM billingAccounts WHERE ownerId=?').get(h.owner).stripeCustomerId;
  h.db.prepare('UPDATE billingAccounts SET stripeSubscriptionId=? WHERE ownerId=?').run(subscription,h.owner);
  h.db.prepare('INSERT INTO billingSubscriptionEvidence(stripeSubscriptionId,ownerId,stripeCustomerId,eventCreatedAt,stateJson) VALUES(?,?,?,?,?)').run(subscription,h.owner,customer,Date.parse('2026-10-05T12:00:00.000Z')/1000,JSON.stringify({trialStart:Date.parse('2026-10-05T12:00:00.000Z')/1000,trialEnd:Date.parse(trialEnd)/1000}));
}

test('forwarding: signed call is answered when the provisioned owner disabled the old dashboard switch',async t=>{
  const h=await harness(t,{beforeInstall:f=>f.db.prepare("UPDATE businessProfiles SET operatorEnabled=0,carrierSetupStatus='not_started' WHERE ownerId='synthetic-a'").run()});
  const result=await h.incoming();
  assert.equal(result.status,200);
  assert.match(result.xml,/<Stream url=/);
  assert.doesNotMatch(result.xml,/<Dial|call the business directly/i);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,result.params.CallSid).n,1);
});

test('forwarding: active trial and payment grace also answer without the old switch',async t=>{
  for(const [status,field,value] of [['trialing','trialEndsAt','2026-10-07T12:00:00.000Z'],['payment_failed','paymentFailedAt','2026-10-05T12:00:00.000Z']]){
    const h=await harness(t,{beforeInstall:f=>f.db.prepare("UPDATE businessProfiles SET operatorEnabled=0 WHERE ownerId='synthetic-a'").run()});
    h.db.prepare(`UPDATE users SET planStatus=?,${field}=? WHERE id=?`).run(status,value,h.owner);
    if(status==='trialing')seedTrialEvidence(h,value);
    const result=await h.incoming(status==='trialing'?108:109);
    assert.equal(result.status,200);assert.match(result.xml,/<Stream url=/,status+' '+JSON.stringify(h.db.prepare('SELECT status,failureCode FROM calls WHERE callSid=?').get(result.params.CallSid)));
    assert.doesNotMatch(result.xml,/<Dial|call the business directly/i);
  }
});

test('forwarding: signed unknown destination is refused with no tenant call',async t=>{
  const h=await harness(t),body={...h.params(),To:'+19025550999'},response=await h.post('/api/twilio/voice/incoming',body);
  assert.equal(response.status,404);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM calls WHERE callSid=?').get(body.CallSid).n,0);
});

test('forwarding: expired trial and payment failure beyond grace use backup capture',async t=>{
  for(const [status,field,value] of [['trialing','trialEndsAt','2026-10-05T12:00:00.000Z'],['payment_failed','paymentFailedAt','2026-09-20T12:00:00.000Z']]){
    const h=await harness(t);
    h.db.prepare(`UPDATE users SET planStatus=?,${field}=? WHERE id=?`).run(status,value,h.owner);
    const response=await h.incoming(status==='trialing'?101:102);
    assert.equal(response.status,200);
    assert.match(response.xml,/<Gather/);
    assert.doesNotMatch(response.xml,/<Dial|<Stream/);
    assert.equal(h.db.prepare('SELECT minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,response.params.CallSid).minutesBilled,0);
  }
});

test('forwarding: an active trial after 60 used minutes captures a message without AI billing',async t=>{
  const h=await harness(t);
  h.db.prepare("UPDATE users SET planStatus='trialing',trialEndsAt='2026-10-07T12:00:00.000Z' WHERE id=?").run(h.owner);
  seedTrialEvidence(h,'2026-10-07T12:00:00.000Z');
  h.db.prepare("INSERT INTO calls(id,ownerId,status,minutesBilled,completedAt,createdAt) VALUES('synthetic-prior-usage',?,'COMPLETED',60,'2026-10-05T13:00:00.000Z','2026-10-05T12:00:00.000Z')").run(h.owner);
  h.db.prepare("INSERT INTO billingVoiceUsage(callId,ownerId,accountSid,callSid,connectedAt,completedAt,providerDurationSeconds,providerDigest,usageKind) VALUES('synthetic-prior-usage',?,'AC_synthetic','CA_synthetic','2026-10-05T12:00:00.000Z','2026-10-05T13:00:00.000Z',3600,?,'trial')").run(h.owner,'a'.repeat(64));
  const response=await h.incoming(107);
  assert.equal(response.status,200);assert.match(response.xml,/<Gather/);assert.doesNotMatch(response.xml,/<Dial|<Stream/);
  assert.deepEqual(h.db.prepare('SELECT minutesBilled,failureCode FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,response.params.CallSid),{minutesBilled:0,failureCode:'TRIAL_VOICE_CAP_REACHED'});
});

test('forwarding: service ended uses unavailable message; blocked caller is rejected',async t=>{
  const h=await harness(t);
  h.db.prepare("UPDATE users SET serviceEndsAt='2026-10-05T12:00:00.000Z' WHERE id=?").run(h.owner);
  const ended=await h.incoming(103);
  assert.equal(ended.status,200);assert.match(ended.xml,/This business is currently unavailable/);assert.match(ended.xml,/<Hangup/);assert.doesNotMatch(ended.xml,/<Dial|<Stream/);
  h.db.prepare('UPDATE users SET serviceEndsAt=NULL WHERE id=?').run(h.owner);
  h.db.prepare('INSERT INTO callerBlocklist(ownerId,phoneNumber,createdAt) VALUES(?,?,?)').run(h.owner,FROM,'2026-10-06T12:00:00.000Z');
  const spam=await h.incoming(104);
  assert.equal(spam.status,200);assert.match(spam.xml,/<Reject reason="rejected"/);
  const row=h.db.prepare('SELECT spamFiltered,minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,spam.params.CallSid);
  assert.deepEqual(row,{spamFiltered:1,minutesBilled:0});
});

test('forwarding: completed answered call retains existing minutes, replay does not double bill',async t=>{
  const h=await harness(t,{beforeInstall:f=>f.db.prepare("UPDATE businessProfiles SET operatorEnabled=0,carrierSetupStatus='not_started' WHERE ownerId='synthetic-a'").run()}),c=await h.connect(105,FROM,'+19025550333');
  c.ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:c.streamSid,stop:{accountSid:c.params.AccountSid,callSid:c.params.CallSid}}));
  await until(()=>h.db.prepare('SELECT completedAt FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid)?.completedAt);
  const callback={...c.params,CallStatus:'completed',CallDuration:'125'};
  assert.equal((await h.post('/api/twilio/voice/status',callback)).status,204);
  assert.equal((await h.post('/api/twilio/voice/status',callback)).status,204);
  assert.equal(h.db.prepare('SELECT minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).minutesBilled,3);
  assert.equal(latestForwardingArrival(h.db,h.owner,TO).forwardedFromPresent,true);
});

test('forwarding: signed ForwardedFrom and arrival time are saved once for the correct owner',async t=>{
  const h=await harness(t),body={...h.params(106),ForwardedFrom:'+19025550333'},response=await h.post('/api/twilio/voice/incoming',body);
  assert.equal(response.status,200);
  assert.deepEqual(latestForwardingArrival(h.db,h.owner,TO),{callSid:body.CallSid,callerNumber:FROM,forwardedFromPresent:true,forwardedFrom:'+19025550333',reachedAt:'2026-10-06T12:00:00.000Z'});
  assert.equal(latestForwardingArrival(h.db,'synthetic-b',TO),null);
  assert.equal((await h.post('/api/twilio/voice/incoming',body)).status,200);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM voiceForwardingArrivals WHERE ownerId=? AND callSid=?').get(h.owner,body.CallSid).n,1);
});

test('forwarding: signed empty ForwardedFrom is present while omitted field is absent',async t=>{
  const h=await harness(t);
  const empty={...h.params(110),ForwardedFrom:''};
  assert.equal((await h.post('/api/twilio/voice/incoming',empty)).status,200);
  assert.deepEqual({present:latestForwardingArrival(h.db,h.owner,TO).forwardedFromPresent,value:latestForwardingArrival(h.db,h.owner,TO).forwardedFrom},{present:true,value:null});
  const absent=h.params(111);
  assert.equal((await h.post('/api/twilio/voice/incoming',absent)).status,200);
  assert.deepEqual({present:latestForwardingArrival(h.db,h.owner,TO).forwardedFromPresent,value:latestForwardingArrival(h.db,h.owner,TO).forwardedFrom},{present:false,value:null});
});

test('forwarding: owner check is tenant scoped; signed destination cannot be rebound across businesses', {timeout:120000},async t=>{
  const f=await startTenantIsolation(t,{production:true}),A=f.tenants.A,B=f.tenants.B;
  const body={AccountSid:f.env.TWILIO_ACCOUNT_SID,CallSid:'CA'+'d'.repeat(32),To:A.phone,From:'+19025550333',Direction:'inbound',ForwardedFrom:'+19025550444'};
  const path='/api/twilio/voice/incoming';
  const signed=values=>twilio.getExpectedTwilioSignature(f.env.TWILIO_AUTH_TOKEN,f.origin+path,values);
  const send=values=>f.request(path,{method:'POST',body:new URLSearchParams(values).toString(),headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':signed(values)}});
  assert.equal((await send(body)).status,200);
  const endpoint='/api/onboarding/phone/forwarding-check';
  const own=await f.request(endpoint,{token:A.auth.owner.token});
  assert.equal(own.status,200);
  assert.deepEqual(JSON.parse(own.text).arrival,{callSid:body.CallSid,callerNumber:body.From,forwardedFromPresent:true,forwardedFrom:body.ForwardedFrom,reachedAt:JSON.parse(own.text).arrival.reachedAt});
  assert.ok(!Number.isNaN(Date.parse(JSON.parse(own.text).arrival.reachedAt)));
  assert.deepEqual(JSON.parse((await f.request(endpoint,{token:B.auth.owner.token})).text),{arrival:null});
  assert.equal((await f.request(endpoint,{token:A.auth.staff.token})).status,403);
  assert.equal((await send({...body,To:B.phone})).status,403);
  assert.deepEqual(JSON.parse((await f.request(endpoint,{token:B.auth.owner.token})).text),{arrival:null});
});

test('forwarding: Twilio provisioning completes with no carrier bridge URL or token',async t=>{
  const f=fixture(t),owner='synthetic-a',saved={};
  for(const [key,value] of Object.entries({TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_API_KEY_SID:'SK'+'b'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC-ONLY',PUBLIC_BASE_URL:'https://synthetic.example.invalid',CARRIER_CONNECTION_URL:undefined,CARRIER_CONNECTION_TOKEN:undefined})){
    saved[key]=process.env[key];if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  t.after(()=>{for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;});
  const requests=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    requests.push({url:String(url),method:options?.method||'GET'});
    assert.equal(new URL(url).hostname,'api.twilio.com');
    if(String(url).includes('/AvailablePhoneNumbers/'))return {ok:true,json:async()=>({available_phone_numbers:[{phone_number:'+19025550555'}]})};
    if(String(url).endsWith('/IncomingPhoneNumbers.json'))return {ok:true,json:async()=>({phone_number:'+19025550555',sid:'PN'+'d'.repeat(32)})};
    throw Error('Unexpected synthetic provider URL');
  });
  const getBusinessProfile=id=>f.ownerQuery('SELECT * FROM businessProfiles WHERE ownerId=?').get(id);
  const updateBusinessProfile=(id,values)=>{for(const [key,value] of Object.entries(values))f.ownerQuery(`UPDATE businessProfiles SET ${key}=? WHERE ownerId=?`).run(value,id);return getBusinessProfile(id);};
  const service=createTelephonyOperations({database:f.db,ownerQuery:f.ownerQuery,getBusinessProfile,updateBusinessProfile,
    savePhoneProvisioning:(id,values)=>updateBusinessProfile(id,{existingPhoneNumber:values.existingNumber,twilioNumber:values.twilioNumber,twilioNumberSid:values.twilioNumberSid,phoneProvisioningStatus:'provisioned',carrierSetupStatus:values.carrierSetupStatus})});
  const result=await service.provision(owner,'+19025550199');
  assert.equal(result.statusCode,201);assert.equal(result.pending,false);assert.equal(result.carrierStatus,'not_required');
  assert.equal(getBusinessProfile(owner).phoneProvisioningStatus,'provisioned');
  assert.deepEqual(requests.map(row=>row.method),['GET','POST']);
});
