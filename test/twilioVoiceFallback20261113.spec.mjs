import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createTelephonyOperations,provisionTwilioNumber,selectTwilioNumber,releaseTwilioNumber} from '../server/src/platformIntegrations.js';

// Owner ruling 2026-11-13: every number the app buys gets Twilio's voice
// fallback address, from TWILIO_VOICE_FALLBACK_URL. In production a purchase
// is refused before any Twilio request when the setting is missing or is not
// an absolute https URL. Everything else about buying and releasing a number
// is unchanged. No real purchase: fetch is a fake that records each request.
// Expected values written before running.
const SENTENCE='A new phone number cannot be bought until the backup call address is set. Email support@offtheclockai.com.';
const FALLBACK='https://fallback.synthetic.invalid/twiml/voice?x=1';
const NUMBER='+12025550100',DESTINATION='+12025550101',SID='PN'+'1'.repeat(32),OP_ID='11111111-1111-4111-8111-111111111111';
const KEYS=['NODE_ENV','TWILIO_ACCOUNT_SID','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','PUBLIC_BASE_URL','TWILIO_VOICE_FALLBACK_URL'];
// Today's purchase body, in order, as the code already sends it.
const TODAY=[['PhoneNumber',DESTINATION],['FriendlyName','otc-provision-'+OP_ID],['VoiceUrl','https://synthetic.invalid/api/twilio/voice/incoming'],
  ['VoiceMethod','POST'],['StatusCallback','https://synthetic.invalid/api/twilio/voice/status'],['StatusCallbackMethod','POST']];

function twilio(t,env){
  const previous=Object.fromEntries(KEYS.map(key=>[key,process.env[key]]));
  for(const key of KEYS)delete process.env[key];
  Object.assign(process.env,{NODE_ENV:'test',TWILIO_ACCOUNT_SID:'AC_SYNTHETIC_NOT_A_REAL_ACCOUNT',TWILIO_API_KEY_SID:'SK_SYNTHETIC',
    TWILIO_API_KEY_SECRET:'SYNTHETIC_NOT_A_CREDENTIAL',PUBLIC_BASE_URL:'https://synthetic.invalid'},env);
  const requests=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    requests.push({url:String(url),method:options.method,body:options.body?[...options.body.entries()]:null});
    if(options.method==='DELETE')return {status:204,ok:true,json:async()=>({})};
    if(options.method==='GET')return {ok:true,json:async()=>({available_phone_numbers:[{phone_number:DESTINATION}]})};
    return {ok:true,json:async()=>({phone_number:DESTINATION,sid:SID})};
  });
  t.after(()=>{for(const key of KEYS){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
  return requests;
}
const buy=()=>provisionTwilioNumber({existingNumber:NUMBER,candidateNumber:DESTINATION,operationId:OP_ID});

test('a purchase sends VoiceFallbackUrl and VoiceFallbackMethod with the setting, after today\'s parameters',async t=>{
  for(const NODE_ENV of ['production','test']){
    const requests=twilio(t,{NODE_ENV,TWILIO_VOICE_FALLBACK_URL:FALLBACK});
    assert.deepEqual(await buy(),{existingNumber:NUMBER,twilioNumber:DESTINATION,twilioNumberSid:SID});
    assert.equal(requests.length,1);
    assert.equal(requests[0].url,'https://api.twilio.com/2010-04-01/Accounts/AC_SYNTHETIC_NOT_A_REAL_ACCOUNT/IncomingPhoneNumbers.json');
    assert.equal(requests[0].method,'POST');
    assert.deepEqual(requests[0].body,[...TODAY,['VoiceFallbackUrl',FALLBACK],['VoiceFallbackMethod','POST']]);
  }
});

test('outside production with no setting, the purchase body is exactly today\'s',async t=>{
  const requests=twilio(t,{});
  await buy();
  assert.deepEqual(requests[0].body,TODAY);
});

const INVALID=['','http://fallback.synthetic.invalid/twiml','/twiml/voice','fallback.synthetic.invalid/twiml','https://user:pass@fallback.synthetic.invalid/twiml',
  'https://fallback.synthetic.invalid/twiml#part',' https://fallback.synthetic.invalid/twiml','https://fallback.synthetic.invalid/tw iml','javascript:alert(1)'];
test('production: a missing or invalid setting refuses the purchase before any Twilio request',async t=>{
  for(const value of [undefined,...INVALID]){
    const requests=twilio(t,{NODE_ENV:'production',...(value===undefined?{}:{TWILIO_VOICE_FALLBACK_URL:value})});
    await assert.rejects(buy(),error=>error.message===SENTENCE&&error.code==='PHONE_FALLBACK_NOT_CONFIGURED'&&error.statusCode===503,String(value));
    assert.equal(requests.length,0,String(value));
  }
});

test('outside production, a setting that is present but invalid is refused too',async t=>{
  const requests=twilio(t,{TWILIO_VOICE_FALLBACK_URL:'http://fallback.synthetic.invalid/twiml'});
  await assert.rejects(buy(),{message:SENTENCE});
  assert.equal(requests.length,0);
});

test('selecting and releasing a number send exactly today\'s requests, with or without the setting',async t=>{
  for(const env of [{},{NODE_ENV:'production'},{NODE_ENV:'production',TWILIO_VOICE_FALLBACK_URL:FALLBACK}]){
    const requests=twilio(t,env);
    assert.equal(await selectTwilioNumber({country:'US',existingNumber:NUMBER}),DESTINATION);
    assert.deepEqual(await releaseTwilioNumber({sid:SID}),{released:true});
    assert.deepEqual(requests,[
      {url:'https://api.twilio.com/2010-04-01/Accounts/AC_SYNTHETIC_NOT_A_REAL_ACCOUNT/AvailablePhoneNumbers/US/Local.json?AreaCode=202&VoiceEnabled=true&PageSize=1',method:'GET',body:null},
      {url:'https://api.twilio.com/2010-04-01/Accounts/AC_SYNTHETIC_NOT_A_REAL_ACCOUNT/IncomingPhoneNumbers/'+SID+'.json',method:'DELETE',body:null}
    ],JSON.stringify(env));
  }
});

function service(t,environment){
  const database=new DatabaseSync(':memory:');t.after(()=>database.close());
  database.exec(`CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE businessProfiles (ownerId TEXT PRIMARY KEY REFERENCES users(id), country TEXT, existingPhoneNumber TEXT, twilioNumber TEXT,
      twilioNumberSid TEXT, phoneProvisioningStatus TEXT, carrierSetupStatus TEXT, operatorEnabled INTEGER NOT NULL, onboardingStep INTEGER NOT NULL, knowledgeBaseJson TEXT NOT NULL);
    INSERT INTO users VALUES ('synthetic-owner');
    INSERT INTO businessProfiles VALUES ('synthetic-owner','US',NULL,NULL,NULL,'not_started','connected',0,5,'{}');`);
  const ownerQuery=sql=>{assert.match(sql,/\bownerId\b/);return database.prepare(sql);};
  const getBusinessProfile=ownerId=>({...ownerQuery('SELECT * FROM businessProfiles WHERE ownerId = ?').get(ownerId)});
  const updateBusinessProfile=(ownerId,patch)=>{const entries=Object.entries(patch);ownerQuery(`UPDATE businessProfiles SET ${entries.map(([key])=>key+' = ?').join(', ')} WHERE ownerId = ?`).run(...entries.map(([,v])=>v),ownerId);return getBusinessProfile(ownerId);};
  const savePhoneProvisioning=(ownerId,input)=>updateBusinessProfile(ownerId,{existingPhoneNumber:input.existingNumber,twilioNumber:input.twilioNumber,twilioNumberSid:input.twilioNumberSid,phoneProvisioningStatus:'provisioned',carrierSetupStatus:input.carrierSetupStatus||'queued'});
  const calls={select:0,purchase:0,find:0};
  const provider={selectNumber:async()=>{calls.select++;return DESTINATION;},purchaseNumber:async input=>{calls.purchase++;return {existingNumber:input.existingNumber,twilioNumber:input.candidateNumber,twilioNumberSid:SID};},findPurchasedNumber:async()=>{calls.find++;return null;}};
  const operations=createTelephonyOperations({database,ownerQuery,getBusinessProfile,savePhoneProvisioning,updateBusinessProfile,provider,environment,now:()=>10_000,leaseMs:100});
  return {operations,calls,phone:()=>ownerQuery('SELECT purchaseState,workerToken,twilioNumberSid FROM phoneProvisioningOperations WHERE ownerId = ?').get('synthetic-owner')};
}

test('onboarding purchase in production without the setting: refused with the sentence, no provider call, ready to retry',async t=>{
  const s=service(t,{NODE_ENV:'production'});
  const errors=[];t.mock.method(console,'error',(...args)=>errors.push(args.join(' ')));
  const result=await s.operations.provision('synthetic-owner',NUMBER);
  assert.equal(result.statusCode,503);assert.equal(result.error,SENTENCE);assert.equal(result.code,'PHONE_FALLBACK_NOT_CONFIGURED');
  assert.deepEqual(s.calls,{select:0,purchase:0,find:0});
  assert.deepEqual({...s.phone()},{purchaseState:'ready',workerToken:null,twilioNumberSid:null});
  assert.ok(errors.some(line=>line.includes('TWILIO_VOICE_FALLBACK_URL')),'the server log names the setting');
});

test('onboarding purchase in production with the setting: bought as before',async t=>{
  const s=service(t,{NODE_ENV:'production',TWILIO_VOICE_FALLBACK_URL:FALLBACK});
  const result=await s.operations.provision('synthetic-owner',NUMBER);
  assert.equal(result.error,undefined);
  assert.deepEqual(s.calls,{select:1,purchase:1,find:0});
  assert.equal(s.phone().twilioNumberSid,SID);
});
