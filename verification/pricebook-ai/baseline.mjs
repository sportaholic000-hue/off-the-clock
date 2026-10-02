import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {mowingFixture} from '../quotedone/repair-fixture.mjs';

const root=process.cwd(),out=process.argv[2];fs.mkdirSync(out,{recursive:true});
const pub=path.join(out,'public');fs.mkdirSync(pub);
process.env.AI_FIXTURE_CONTROL=path.join(out,'control.json');
process.env.AI_FIXTURE_WIRE=path.join(pub,'provider.ndjson');
const mode=value=>fs.writeFileSync(process.env.AI_FIXTURE_CONTROL,JSON.stringify(value));mode({mode:'live'});
process.env.NODE_OPTIONS='--import='+pathToFileURL(path.join(root,'verification/pricebook-ai/provider-fixture.mjs')).href;
await import('./provider-fixture.mjs');
const {suggestStarterBook}=await import('../../server/src/platformIntegrations.js');
const results=[];
const save=(name,value)=>fs.writeFileSync(path.join(pub,name),JSON.stringify(value,null,2));
async function observe(name,fn){try{results.push({name,...await fn()});}catch(e){results.push({name,error:e.message.split(process.env.GEMINI_API_KEY).join('[KEY OMITTED]')});}}
let app;
try {
 await observe('live model list',async()=>{
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY}});
  const data=await r.json();save('models.json',data);assert.equal(r.status,200);
  const model=data.models.find(m=>m.name==='models/gemini-2.5-flash');assert.ok(model?.supportedGenerationMethods.includes('generateContent'));
  return {model,verified:true};
 });
 await observe('voice model misroutes starter generation',async()=>{
  process.env.GEMINI_MODEL='gemini-3.8-live';mode({mode:'live'});
  try {return {unexpectedSuccess:await suggestStarterBook({industry:'[SYNTHETIC] lawn care',serviceTypes:['LANDSCAPING_MOWING']})};}
  catch(e){return {reproduced:true,error:e.message};}
 });
 await observe('real starter positive control',async()=>{
  process.env.GEMINI_MODEL='gemini-3.8-flash';
  const suggestions=await suggestStarterBook({industry:'[SYNTHETIC] lawn care',serviceTypes:['LANDSCAPING_MOWING']});
  save('starter-real.json',suggestions);return {verified:true,suggestions};
 });
 for(const [label,fields,extra] of [
  ['unknown field',{mowingBaseRatePerSqft:0.01,secretRate:99},{}],
  ['negative field',{mowingBaseRatePerSqft:0.01,minimumServiceCharge:-5},{}],
  ['absurd value',{mowingBaseRatePerSqft:1e100},{}],
  ['extra approval fields',{mowingBaseRatePerSqft:0.01},{active:true,confirmedFields:{mowingBaseRatePerSqft:true}}]
 ]) await observe('invalid AI output: '+label,async()=>{
  const raw=[{serviceType:'LANDSCAPING_MOWING',service:'[SYNTHETIC] Mowing',fields,...extra}];mode({mode:'output',text:JSON.stringify(raw)});
  try{return {reproduced:true,raw,accepted:await suggestStarterBook({industry:'synthetic',serviceTypes:['LANDSCAPING_MOWING']})};}
  catch(e){return {reproduced:false,error:e.message};}
 });
 mode({mode:'live'});Object.assign(process.env,{TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC-NOT-A-REAL-CREDENTIAL'});process.env.ALLOW_PROVIDER_WRITES='true';process.env.VOICE_RUNTIME_ENABLED='false';
 app=await startApplication(root,path.join(out,'private'),{port:4892,browserOrigins:['http://127.0.0.1:4892']});
 const f=await mowingFixture(app,'ai-baseline',['http://127.0.0.1:4892']);
 await observe('interview currently has no Gemini assistance',async()=>{
  const before=fs.readFileSync(process.env.AI_FIXTURE_WIRE,'utf8').split('\n').length;
  const draft=await f.call('POST','/api/pricebook/interview',{mode:'browser',serviceTypes:['LANDSCAPING_MOWING']},201);
  const captured=await f.call('PUT','/api/pricebook/interview/'+draft.draft.id,{fields:{LANDSCAPING_MOWING:{mowingBaseRatePerSqft:0.01}},confirmedFields:{LANDSCAPING_MOWING:['mowingBaseRatePerSqft']}});
  const review=await f.call('GET','/api/pricebook/interview/'+draft.draft.id+'/review');
  const missing=await app.request('POST','/api/pricebook/interview/'+draft.draft.id+'/assist',{serviceType:'LANDSCAPING_MOWING',field:'mowingBaseRatePerSqft',answer:'I charge one cent per square foot.'},f.owner.token);
  const after=fs.readFileSync(process.env.AI_FIXTURE_WIRE,'utf8').split('\n').length;
  return {reproduced:after===before&&missing.status===404,providerCalls:after-before,draft,captured,review,assist:missing,editorWouldImport:review.services[0].pricing||review.services[0].fields||{}};
 });
 await observe('widget summary exposes internal enum values',async()=>{
  const r=await f.call('POST',f.url+'/prepare',f.submission(),200,undefined,f.headers);
  return {reproduced:r.summary.facts.some(f=>['exact','maintained'].includes(f.value)),response:r};
 });
} finally {
 if(app){await app.stop();save('http.json',app.requests);}
 save('baseline.json',{source:process.env.GITHUB_SHA,results});
 console.log('AI_BASELINE '+JSON.stringify(results));
 for(const name of fs.readdirSync(pub)){
  const b=gzipSync(fs.readFileSync(path.join(pub,name))).toString('base64');
  for(let offset=0;offset<b.length;offset+=24000)console.log('AI_FILE '+JSON.stringify({name:name+'.gz',offset,total:b.length,base64:b.slice(offset,offset+24000)}));
 }
}
