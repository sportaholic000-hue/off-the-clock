import './pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import {CREATE_TABLE_STATEMENTS,CREATE_INDEX_STATEMENTS} from '../server/src/schema.js';
import {installKnowledgeDraftRoutes} from '../server/src/knowledgeDraftRoutes.js';
import {draftKnowledgeBase} from '../server/src/platformIntegrations.js';
import {createWebsitePriceImporter} from '../server/src/websitePriceImport.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';

const directory=mkdtempSync(path.join(tmpdir(),'synthetic-website-draft-'));
process.env.DATABASE_PATH=path.join(directory,'synthetic.sqlite');
const {db}=await import('../server/src/db.js');
for(const sql of [...CREATE_TABLE_STATEMENTS,...CREATE_INDEX_STATEMENTS])db.exec(sql);
const {getBusinessProfile,saveKnowledgeBase}=await import('../server/src/onboardingService.js');
after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
const guideText=readFileSync('specs/voice_quote_flows.md','utf8');
let sequence=0;
function seed(){
  const id='synthetic-website-owner-'+(++sequence);
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'synthetic','Synthetic','Synthetic Website Co','QuoteDone','active','UTC','owner','2026-10-06T00:00:00Z')").run(id,id+'@example.invalid');
  saveKnowledgeBase(id,{about:'[SYNTHETIC] Business',hours:'Weekdays',prices:'[SYNTHETIC] Existing: $8',websiteUrl:'https://business.example/',draft:false});
  return id;
}
const row=id=>db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(id).knowledgeBaseJson;
function voice(id){return compileVoiceSystemInstruction({guideText,business:{businessName:'Synthetic Website Co',agentName:'Nova'},services:[],knowledge:getBusinessProfile(id).knowledgeBase});}
async function appFor(t,{page='<p>[SYNTHETIC] Cover charge: $20 Friday and Saturday.</p>'}={}){
  const site=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(page);});await new Promise(r=>site.listen(0,'127.0.0.1',r));
  let fetches=0,providerChecks=0;
  const importPrices=createWebsitePriceImporter({lookup:async()=>[{address:'8.8.8.8',family:4}],request:(url,options,cb)=>{fetches++;return http.request(new URL(url.pathname,'http://127.0.0.1:'+site.address().port),{...options,lookup:undefined},cb);}});
  const app=express();app.use(express.json());
  installKnowledgeDraftRoutes(app,{
    requireAuth:roles=>{assert.deepEqual(roles,['owner']);return(req,res,next)=>{if(!req.headers['x-synthetic-owner'])return res.status(401).json({error:'Sign in'});if(req.headers['x-synthetic-role']==='staff')return res.status(403).json({error:'Owner only'});req.tenantOwnerId=req.headers['x-synthetic-owner'];next();};},
    requireProviderWrites:(_req,_res,next)=>{providerChecks++;next();},
    asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),
    onboardingState:id=>({account:{businessName:'[SYNTHETIC] Business'},profile:getBusinessProfile(id)}),
    draftKnowledgeBase:input=>draftKnowledgeBase(input,{importPrices}),saveKnowledgeBase
  });
  app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({error:error.message,code:error.code}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{for(const s of [server,site]){s.closeAllConnections();await new Promise(r=>s.close(r));}});
  async function post(endpoint,body,owner,role){const response=await fetch('http://127.0.0.1:'+server.address().port+endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(owner?{'x-synthetic-owner':owner}:{}),...(role?{'x-synthetic-role':role}:{})},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
  return {post,fetches:()=>fetches,providerChecks:()=>providerChecks};
}
const draftPath='/api/onboarding/knowledge-base/draft',savePath='/api/onboarding/knowledge-base';
// Handwritten before execution: old saved $8 remains until save; then literal
// $20 is available. No quote arithmetic. See WEBSITE_PRICE_IMPORT_20261006.md.
test('website draft uses saved URL, never writes knowledge, and becomes voice facts only on explicit owner save',async t=>{
  const owner=seed(),other=seed(),before=row(owner),otherBefore=row(other),app=await appFor(t);
  assert.match(voice(owner),/\$8/);assert.doesNotMatch(voice(owner),/\$20/);
  const result=await app.post(draftPath,{ownerId:other},owner);
  assert.equal(result.status,200);assert.equal(result.body.status,'DRAFT');assert.equal(result.body.knowledgeBase.draft,true);
  assert.equal(result.body.knowledgeBase.prices,'[SYNTHETIC] Cover charge: $20 Friday and Saturday.');
  assert.equal(row(owner),before);assert.equal(row(other),otherBefore);assert.match(voice(owner),/\$8/);assert.doesNotMatch(voice(owner),/\$20/);
  assert.equal(app.fetches(),1);assert.equal(app.providerChecks(),1);
  // Compiling repeated call prompts reads saved facts, never the website.
  voice(owner);voice(owner);assert.equal(app.fetches(),1);
  const saved=await app.post(savePath,{...getBusinessProfile(owner).knowledgeBase,prices:result.body.knowledgeBase.prices,draft:true,ownerId:other},owner);
  assert.equal(saved.status,200);assert.equal(saved.body.profile.knowledgeBase.draft,false);assert.match(voice(owner),/\$20/);assert.doesNotMatch(voice(owner),/\$8/);
  assert.equal(row(other),otherBefore);assert.equal(app.fetches(),1);
});
test('website empty and rejected drafts leave all saved knowledge unchanged',async t=>{
  const owner=seed(),before=row(owner),app=await appFor(t,{page:'<p>[SYNTHETIC] Please call for a price.</p>'});
  const empty=await app.post(draftPath,{},owner);assert.equal(empty.status,200);assert.equal(empty.body.knowledgeBase.prices,'');assert.match(empty.body.knowledgeBase.websiteImport.message,/No literal prices/);assert.equal(row(owner),before);
  const rejected=await app.post(draftPath,{websiteUrl:'http://127.0.0.1'},owner);assert.equal(rejected.status,400);assert.equal(row(owner),before);assert.equal(app.fetches(),1);
});
test('website drafting and saving require the owner role and do not honor body owner IDs',async t=>{
  const owner=seed(),before=row(owner),app=await appFor(t);
  for(const endpoint of [draftPath,savePath]){
    assert.equal((await app.post(endpoint,{ownerId:owner})).status,401);
    assert.equal((await app.post(endpoint,{},owner,'staff')).status,403);
  }
  assert.equal(app.fetches(),0);assert.equal(row(owner),before);
});
test('website legacy persisted drafts are withheld from compiled voice facts',()=>{
  const owner=seed();saveKnowledgeBase(owner,{...getBusinessProfile(owner).knowledgeBase,prices:'[SYNTHETIC] Cover charge: $20 Friday and Saturday.',draft:true});
  assert.doesNotMatch(voice(owner),/\$20|OWNER_FACTS_JSON[^]*"knowledge"/);
  assert.match(readFileSync('server/src/voice/productionVoiceRuntime.js','utf8'),/kb\.draft!==true/);
});
