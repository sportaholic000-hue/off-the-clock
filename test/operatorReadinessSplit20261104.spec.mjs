import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

// Before this change operatorEligibility appended the platform voice-route
// readiness items (Voice runtime, Provider operations, Signed inbound
// authentication, Inbound public URL, Live voice provider, Voice session
// security) to the owner's list, which onboarding step 6 and the dashboard show,
// and carried both "phone" and "Inbound phone number".
const PLATFORM_ITEMS=['Voice runtime','Provider operations','Signed inbound authentication',
  'Inbound public URL','Live voice provider','Voice session security'];
const ON_OUR_SIDE='Phone service connection on our side';
const readyEnv={VOICE_RUNTIME_ENABLED:'true',ALLOW_PROVIDER_WRITES:'true',
  TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'SYNTHETIC_TOKEN',
  PUBLIC_BASE_URL:'https://voice.example.invalid',GEMINI_API_KEY:'SYNTHETIC_KEY',
  GEMINI_MODEL:'synthetic-live-model',VOICE_HANDLE_SECRET:'S'.repeat(32)};
const completeProfile={phoneProvisioningStatus:'provisioned',twilioNumberSid:'PN'+'c'.repeat(32),
  twilioNumber:'+15065550100',knowledgeBase:{about:'[SYNTHETIC] About',hours:'[SYNTHETIC] Weekdays'}};

// The database path is fixed when db.js first loads, so the environment is set
// before either test imports a server module.
const directory=mkdtempSync(join(tmpdir(),'otc-readiness-split-'));
const originalEnvironment={...process.env};
Object.assign(process.env,{
  NODE_ENV:'test',PORT:'0',DATABASE_PATH:join(directory,'test.sqlite'),
  PRICEBOOK_PATH:join(directory,'books'),JWT_SECRET:'SYNTHETIC_READINESS_SPLIT_SECRET_20261104',
  ADMIN_EMAIL:'admin@example.invalid',ADMIN_PASSWORD_HASH:'$2b$12$'+'S'.repeat(53),
  VOICE_RUNTIME_ENABLED:'false',ALLOW_PROVIDER_WRITES:'false',
  TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),
  TWILIO_API_KEY_SECRET:'SYNTHETIC_TEST_ONLY'
});

test('owner list carries one platform line; platform items go to platformMissing',async()=>{
  const {operatorEligibility}=await import('../server/src/onboardingService.js');

  let result=operatorEligibility(completeProfile,{env:readyEnv});
  assert.deepEqual(result,{eligible:true,missing:[],platformMissing:[]});

  result=operatorEligibility(completeProfile,{env:{...readyEnv,VOICE_RUNTIME_ENABLED:'false'}});
  assert.equal(result.eligible,false);
  assert.deepEqual(result.missing,[ON_OUR_SIDE]);
  assert.deepEqual(result.platformMissing,['Voice runtime']);

  result=operatorEligibility(completeProfile,{env:{}});
  assert.equal(result.eligible,false);
  assert.deepEqual(result.missing,[ON_OUR_SIDE]);
  assert.deepEqual(result.platformMissing,PLATFORM_ITEMS);

  // One phone item, whichever phone field is missing.
  for(const patch of [{phoneProvisioningStatus:'pending'},{twilioNumberSid:null},{twilioNumber:''},{twilioNumber:'5065550100'},
    {phoneProvisioningStatus:'pending',twilioNumberSid:null,twilioNumber:null}]) {
    result=operatorEligibility({...completeProfile,...patch},{env:readyEnv});
    assert.equal(result.eligible,false,JSON.stringify(patch));
    assert.deepEqual(result.missing,['Phone number'],JSON.stringify(patch));
    assert.deepEqual(result.platformMissing,[]);
  }

  result=operatorEligibility({knowledgeBase:{}},{env:{}});
  assert.deepEqual(result.missing,['Phone number','About & area','Hours',ON_OUR_SIDE]);
  for(const item of [...PLATFORM_ITEMS,'phone','Inbound phone number'])assert.ok(!result.missing.includes(item),item);
});

test('owner onboarding state hides platform items; /api/admin shows them',async()=>{
  let lifecycle;
  try {
    const server=await import('../server/src/server.js');
    lifecycle=server.lifecycle;
    if(!server.httpServer.listening)await once(server.httpServer,'listening');
    const {db}=await import('../server/src/db.js');
    const {createAuthSessionService}=await import('../server/src/authSessionService.js');
    const {voiceRouteReadiness}=await import('../server/src/voice/voiceReadiness.js');
    const base='http://127.0.0.1:'+server.httpServer.address().port;
    const now='2026-11-04T12:00:00.000Z';
    const sessions=createAuthSessionService(db);
    const expectedPlatform=voiceRouteReadiness().missing;
    assert.ok(expectedPlatform.includes('Voice runtime'));

    const id='[SYNTHETIC]-readiness-owner';
    db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','Operator','active',now,'UTC','owner',now);
    db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)')
      .run(id,'cus_SYNTHETIC_readiness',now,now,now);
    const ownerToken=sessions.create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
    const get=async(route,token)=>{
      const response=await fetch(base+route,{headers:{authorization:'Bearer '+token}});
      return {status:response.status,body:await response.json()};
    };

    // The synthetic billing row has no Stripe events; keep the owner entitled
    // if a background reconciliation pass observes it (same as other route specs).
    db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(id);
    const state=await get('/api/onboarding/state',ownerToken);
    assert.equal(state.status,200,JSON.stringify(state.body));
    assert.equal(state.body.operator.eligible,false);
    assert.equal(state.body.operator.enabled,false);
    assert.equal(Object.hasOwn(state.body.operator,'platformMissing'),false);
    assert.deepEqual(state.body.operator.missing,['Phone number','About & area','Hours',ON_OUR_SIDE]);
    for(const item of [...PLATFORM_ITEMS,'phone','Inbound phone number'])assert.ok(!state.body.operator.missing.includes(item),item);

    const adminToken=sessions.create({id:'admin',role:'admin',email:process.env.ADMIN_EMAIL,passwordHash:process.env.ADMIN_PASSWORD_HASH}).token;
    const admin=await get('/api/admin',adminToken);
    assert.ok([200,503].includes(admin.status),JSON.stringify(admin.body));
    assert.equal(admin.body.shell,'admin');
    assert.deepEqual(admin.body.platformMissing,expectedPlatform);
    assert.equal((await get('/api/admin',ownerToken)).status,403);
  } finally {
    if(lifecycle)await lifecycle.shutdown({timeoutMs:5000,exit:code=>assert.equal(code,0)});
    for(const key of Object.keys(process.env))if(!(key in originalEnvironment))delete process.env[key];
    Object.assign(process.env,originalEnvironment);
    rmSync(directory,{recursive:true,force:true});
  }
});
