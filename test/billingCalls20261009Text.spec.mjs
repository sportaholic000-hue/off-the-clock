import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {draftKnowledgeBase} from '../server/src/platformIntegrations.js';
import {suggestStarterBook,interpretInterviewAnswer} from '../server/src/priceBookAI.js';
import {validateRuntimeConfig} from '../server/src/runtimeConfig.js';

const message='AI drafting is unavailable because its text model is not configured. You can enter your business information and prices manually. Contact support@offtheclockai.com for help.';
const env={GEMINI_API_KEY:'SYNTHETIC-key',GEMINI_MODEL:'synthetic-live-model',GEMINI_TEXT_MODEL:'synthetic-text-model'};
const response=value=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]})});
const draftRequest={businessName:'[SYNTHETIC] Business',businessTypes:['[SYNTHETIC] Service']};
const bookRequest={industry:'[SYNTHETIC]',serviceTypes:['LANDSCAPING_MOWING'],country:'CA',region:'NS'};
async function knowledge(t,settings,fetchImpl){
  for(const key of ['GEMINI_API_KEY','GEMINI_MODEL','GEMINI_TEXT_MODEL']){const old=process.env[key];t.after(()=>old===undefined?delete process.env[key]:process.env[key]=old);if(settings[key]===undefined)delete process.env[key];else process.env[key]=settings[key];}
  const old=globalThis.fetch;globalThis.fetch=fetchImpl;t.after(()=>{globalThis.fetch=old;});
  return draftKnowledgeBase(draftRequest);
}
test('calls audit 3: knowledge draft sends only the explicit text model to generateContent',async t=>{
  const calls=[];const draft=await knowledge(t,env,async(url,init)=>{calls.push({url,init});return response({about:'[SYNTHETIC] Business'});});
  assert.equal(draft.draft,true);assert.equal(calls.length,1);assert.match(calls[0].url,/synthetic-text-model:generateContent$/);
  assert.equal(calls[0].init.headers['x-goog-api-key'],env.GEMINI_API_KEY);assert.ok(!calls[0].url.includes(env.GEMINI_API_KEY));
});
for(const model of [undefined,'','synthetic-live-model','synthetic-audio-model','bad/model?key=secret'])test(`calls audit 3: knowledge refuses text model ${JSON.stringify(model)} without a Google request`,async t=>{
  let calls=0;await assert.rejects(knowledge(t,{...env,GEMINI_TEXT_MODEL:model},async()=>{calls++;return response({});}),e=>e.code==='TEXT_AI_UNAVAILABLE'&&e.message===message);assert.equal(calls,0);
});
for(const feature of ['starter','interview'])test(`calls audit 3: ${feature} uses GEMINI_TEXT_MODEL and refuses missing configuration`,async()=>{
  let calls=[];const run=settings=>feature==='starter'?suggestStarterBook(bookRequest,{env:settings,fetchImpl:fake}):interpretInterviewAnswer({serviceType:'LANDSCAPING_MOWING',field:'minimumServiceCharge',answer:'[SYNTHETIC] 25 dollars'},{env:settings,fetchImpl:fake});
  async function fake(url){calls.push(url);return response(feature==='starter'?[{service:'[SYNTHETIC] Mowing',serviceType:'LANDSCAPING_MOWING',fields:{minimumServiceCharge:25}}]:{value:25});}
  await run({...env,PRICEBOOK_GEMINI_MODEL:'synthetic-obsolete-model'});assert.equal(calls.length,1);assert.match(calls[0],/synthetic-text-model:generateContent$/);
  calls=[];await assert.rejects(run({...env,GEMINI_TEXT_MODEL:undefined}),e=>e.code==='TEXT_AI_UNAVAILABLE'&&e.message===message);assert.deepEqual(calls,[]);
});
test('calls audit 3: startup lists missing text configuration and validates a supplied model independently',()=>{
  const base={JWT_SECRET:'[SYNTHETIC]'.repeat(4)};
  assert.deepEqual(validateRuntimeConfig(base).textAI,{enabled:false,missing:['GEMINI_API_KEY','GEMINI_TEXT_MODEL']});
  assert.deepEqual(validateRuntimeConfig({...base,...env}).textAI,{enabled:true,missing:[]});
  assert.throws(()=>validateRuntimeConfig({...base,...env,GEMINI_TEXT_MODEL:env.GEMINI_MODEL}),e=>e.details.some(s=>s.includes('GEMINI_TEXT_MODEL')));
});
test('calls audit 3: literal website import needs no text model or Google request',async()=>{
  const result=await draftKnowledgeBase({...draftRequest,websiteUrl:'https://synthetic.invalid/'},{importPrices:async url=>({draft:true,sourceUrl:url,prices:'[SYNTHETIC] Service $25 each'})});
  assert.equal(result.prices,'[SYNTHETIC] Service $25 each');
});
