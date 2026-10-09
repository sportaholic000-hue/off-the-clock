import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';

// Actual server, auth middleware, interview routes and SQLite. Only the AI
// provider boundary is synthetic; no credentials or live provider calls.
test('ambiguous AI answer returns clarification over HTTP without changing the saved draft',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'otc-pricebook-clarification-'));
  const originalFetch=globalThis.fetch, originalEnvironment={...process.env};
  Object.assign(process.env,{NODE_ENV:'test',PORT:'0',DATABASE_PATH:join(directory,'test.sqlite'),PRICEBOOK_PATH:join(directory,'books'),
    JWT_SECRET:'SYNTHETIC_PRICEBOOK_CLARIFICATION_TEST_SECRET',ALLOW_PROVIDER_WRITES:'true',VOICE_RUNTIME_ENABLED:'false',
    TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC_TEST_ONLY',GEMINI_TEXT_MODEL:'synthetic-text-model',GEMINI_API_KEY:'SYNTHETIC_TEST_ONLY'});
  let providerValue=null,providerCalls=0,lifecycle;
  globalThis.fetch=async(url,options)=>{
    const parsed=new URL(url);
    if(parsed.hostname==='generativelanguage.googleapis.com'){
      providerCalls++;
      return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({value:providerValue})}]}}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(parsed.hostname!=='127.0.0.1')throw Error('Live provider access is forbidden in this test');
    return originalFetch(url,options);
  };
  try{
    const server=await import('../server/src/server.js');lifecycle=server.lifecycle;
    if(!server.httpServer.listening)await once(server.httpServer,'listening');
    const {db}=await import('../server/src/db.js');
    const owner='[SYNTHETIC]-pricebook-owner',now=new Date().toISOString();
    db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(owner,'synthetic-pricebook@example.invalid','[SYNTHETIC]-password','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active',now,'America/Halifax','owner',now);
    // Entitled synthetic owner; production access guards remain in force.
    db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)')
      .run(owner,'cus_SYNTHETIC_PRICEBOOK_TEST',now,now,now);
    db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(owner);
    const {createAuthSessionService}=await import('../server/src/authSessionService.js');
    const token=createAuthSessionService(db).create(db.prepare('SELECT * FROM users WHERE id=?').get(owner)).token;
    const base='http://127.0.0.1:'+server.httpServer.address().port;
    async function request(path,method='GET',body){
      const response=await originalFetch(base+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:response.status,body:await response.json()};
    }
    assert.ok(applicationMetadata().services.some(s=>s.serviceType==='CUSTOM'));
    const created=await request('/api/pricebook/interview','POST',{mode:'browser',serviceTypes:['CUSTOM']});assert.equal(created.status,201,JSON.stringify(created.body));
    const route='/api/pricebook/interview/'+created.body.draft.id;
    const seeded=await request(route,'PUT',{revision:created.body.draft.revision,fields:{CUSTOM:{unit:'flat',customPricingMode:'fixed'}},confirmedFields:{CUSTOM:['unit','customPricingMode']},currentField:'CUSTOM.price'});assert.equal(seeded.status,200);
    const before=(await request(route)).body.draft;
    const ambiguous=await request(route+'/assist','POST',{serviceType:'CUSTOM',field:'price',answer:'[SYNTHETIC] I am unsure of the price'});
    assert.equal(ambiguous.status,422);assert.equal(ambiguous.body.code,'PRICEBOOK_AI_CLARIFICATION_REQUIRED');assert.equal(ambiguous.body.retryable,false);
    assert.match(ambiguous.body.error,/No prices were changed/);assert.doesNotMatch(JSON.stringify(ambiguous.body),/SYNTHETIC_TEST_ONLY|AIza|unavailable|503/);
    assert.equal(providerCalls,1);assert.deepEqual((await request(route)).body.draft,before);
    providerValue=25.5;
    const valid=await request(route+'/assist','POST',{serviceType:'CUSTOM',field:'price',answer:'[SYNTHETIC] charge 25.50'});
    assert.equal(valid.status,200);assert.equal(providerCalls,2);assert.equal(valid.body.value,25.5);
    assert.equal(valid.body.draft.fields.CUSTOM.price,25.5);assert.ok(!valid.body.draft.confirmedFields.CUSTOM.includes('price'));
    const confirmed=await request(route,'PUT',{revision:valid.body.draft.revision,fields:{CUSTOM:{price:25.5}},confirmedFields:{CUSTOM:['unit','customPricingMode','price']},currentField:'CUSTOM.minimumJob'});
    assert.equal(confirmed.status,200);assert.equal(confirmed.body.draft.fields.CUSTOM.price,25.5);assert.ok(confirmed.body.draft.confirmedFields.CUSTOM.includes('price'));
    for(const revision of [undefined,seeded.body.draft.revision]){
      const stale=await request(route,'PUT',{...(revision?{revision}:{}),fields:{CUSTOM:{price:99}},confirmedFields:{CUSTOM:['price']}});
      assert.equal(stale.status,409);assert.deepEqual((await request(route)).body.draft,confirmed.body.draft);
    }
  }finally{
    if(lifecycle)await lifecycle.shutdown({timeoutMs:5000,exit:code=>assert.equal(code,0)});
    globalThis.fetch=originalFetch;
    for(const key of Object.keys(process.env))if(!(key in originalEnvironment))delete process.env[key];
    Object.assign(process.env,originalEnvironment);rmSync(directory,{recursive:true,force:true});
  }
});
