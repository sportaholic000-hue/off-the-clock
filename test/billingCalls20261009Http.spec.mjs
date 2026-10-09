import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

test('calls audit 3 HTTP: missing text model gives the owner a readable refusal and does not save a draft',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'synthetic-text-ai-')),originalEnv={...process.env},originalFetch=globalThis.fetch;let lifecycle,providerCalls=0;
 Object.assign(process.env,{NODE_ENV:'test',PORT:'0',DATABASE_PATH:join(dir,'test.sqlite'),PRICEBOOK_PATH:join(dir,'books'),JWT_SECRET:'SYNTHETIC-text-ai-secret-'.repeat(3),ALLOW_PROVIDER_WRITES:'true',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC-key',TWILIO_AUTH_TOKEN:'',GEMINI_API_KEY:'SYNTHETIC-key',GEMINI_MODEL:'synthetic-live-model'});delete process.env.GEMINI_TEXT_MODEL;
 globalThis.fetch=async(url,init)=>{const u=new URL(url);if(u.hostname==='generativelanguage.googleapis.com'){providerCalls++;return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"about":"[SYNTHETIC] Draft","value":25}'}]}}]}),{status:200});}if(u.hostname!=='127.0.0.1')throw Error('Only fake providers are allowed');return originalFetch(url,init);};
 try{
  const server=await import('../server/src/server.js');lifecycle=server.lifecycle;if(!server.httpServer.listening)await once(server.httpServer,'listening');
  const {db,ownerQuery}=await import('../server/src/db.js'),ownerId='SYNTHETIC-text-owner',now=new Date().toISOString();
  ownerQuery("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt) VALUES(?,?,?,'SYNTHETIC','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active',?,'UTC','owner',?)").run(ownerId,null,ownerId+'@example.invalid',now,now);
  const {saveKnowledgeBase}=await import('../server/src/onboardingService.js');saveKnowledgeBase(ownerId,{about:'[SYNTHETIC] Saved',websiteUrl:'',draft:false});
  ownerQuery('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(ownerId,'cus_SYNTHETIC_TEXT',now,now,now);
  ownerQuery("UPDATE users SET planStatus='active' WHERE id=@ownerId").run({ownerId});
  const before=ownerQuery('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(ownerId).knowledgeBaseJson;
  const {createAuthSessionService}=await import('../server/src/authSessionService.js');const token=createAuthSessionService(db).create(ownerQuery('SELECT * FROM users WHERE id=@ownerId').get({ownerId})).token;
  const post=async(path,body)=>{const r=await originalFetch('http://127.0.0.1:'+server.httpServer.address().port+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const response=await post('/api/onboarding/knowledge-base/draft',{websiteUrl:''});
  assert.equal(response.status,503,JSON.stringify(response.body));assert.equal(response.body.code,'TEXT_AI_UNAVAILABLE');assert.equal(response.body.retryable,false);assert.match(response.body.error,/text model is not configured/);assert.doesNotMatch(response.body.error,/Internal server error|SYNTHETIC-key/);assert.equal(providerCalls,0);
  assert.equal(ownerQuery('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(ownerId).knowledgeBaseJson,before);
  const created=await post('/api/pricebook/interview',{mode:'browser',serviceTypes:['CUSTOM']});assert.equal(created.status,201,JSON.stringify(created));
  const rejected=await post('/api/pricebook/interview/'+created.body.draft.id+'/assist',{serviceType:'CUSTOM',field:'price',answer:'[SYNTHETIC] 25 dollars'});
  assert.equal(rejected.status,503);assert.equal(rejected.body.code,'TEXT_AI_UNAVAILABLE');assert.equal(rejected.body.error,response.body.error);assert.equal(providerCalls,0);
 }finally{if(lifecycle)await lifecycle.shutdown({timeoutMs:5000,exit:code=>assert.equal(code,0)});globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);rmSync(dir,{recursive:true,force:true});}
});
