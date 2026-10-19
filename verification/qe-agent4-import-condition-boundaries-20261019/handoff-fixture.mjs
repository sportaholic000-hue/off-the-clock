import '../../test/pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import express from 'express';
import WebSocket from 'ws';
import twilio from 'twilio';
import {createWebsitePriceImporter} from '../../server/src/websitePriceImport.js';
import {extractWebsitePrices} from '../../server/src/websitePriceExtraction.js';
import {WEBSITE_LIMITS} from '../../server/src/websitePriceTransport.js';
import {draftKnowledgeBase} from '../../server/src/platformIntegrations.js';
import {installKnowledgeDraftRoutes} from '../../server/src/knowledgeDraftRoutes.js';
import {migrateDatabase} from '../../server/src/migrations.js';
import {calculateSavedListedPrice} from '../../server/src/voice/listedPriceCalculation.js';
import {createVoiceToolRuntime} from '../../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../../server/src/voice/toolDispatcher.js';
import {compileVoiceSystemInstruction} from '../../server/src/voice/voicePromptCompiler.js';
import {installProductionVoice} from '../../server/src/voice/productionVoiceRuntime.js';

// Independent outcomes and hand arithmetic precede execution in EXPECTED.md.
// Synthetic loopback websites, tenants, signed voice calls and provider only.
const NOTE='Site-wide: all prices require membership';
const MEMBER='Available to members';
const PRICE='Widget $10 each';
const html=body=>'<html><body>'+body+'</body></html>';
const p=text=>'<p>'+text+'</p>';
const link=(path,label='Next')=>`<a href="${path}">${label}</a>`;
const page=(body,plain=false)=>({body,type:plain?'text/plain':'text/html'});
const args=listedItem=>({listedItem,quantity:'3',customerConfirmed:true});
const direct=(prices,listedItem=prices)=>calculateSavedListedPrice({prices},args(listedItem));
function review(result){assert.equal(result.status,'needs_review');assert.equal(Object.hasOwn(result,'extendedAmount'),false);}
function money(result,amount='30.00'){assert.equal(result.status,'calculated');assert.equal(result.extendedAmount,amount);}
function protectedPrices(out,notes=[NOTE],count=1){
  assert.equal(out.websiteImport.entries.length,count);
  for(const entry of out.websiteImport.entries){for(const note of notes)assert.ok(entry.excerpt.includes(note),JSON.stringify(entry));review(direct(out.prices,entry.excerpt));}
  assert.equal(out.websiteImport.conditionsUnverified,false);
}
function withheld(out){assert.equal(out.prices,'');assert.deepEqual(out.websiteImport.entries,[]);assert.equal(out.websiteImport.conditionsUnverified,true);assert.equal(out.websiteImport.limited,true);}
async function website(t,pages,limits={}){
  const seen=[];
  const server=http.createServer((req,res)=>{
    const value=pages[req.url];if(!value){res.writeHead(404);res.end();return;}
    if(value.redirect){res.writeHead(302,{Location:value.redirect});res.end();return;}
    res.setHeader('Content-Type',value.type||'text/html');res.end(value.body);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const importer=createWebsitePriceImporter({limits,lookup:async()=>[{address:'8.8.8.8',family:4}],request:(url,options,callback)=>{
    seen.push(url.pathname);assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);
    return http.request(new URL(url.pathname+url.search,'http://127.0.0.1:'+server.address().port),{...options,lookup:undefined},callback);
  }});
  return {seen,importer};
}
async function imported(t,pages,limits={}){const s=await website(t,pages,limits);const out=await s.importer('https://synthetic.example/');t.diagnostic(JSON.stringify({pages,limits,seen:s.seen,out,calculations:out.websiteImport.entries.map(e=>direct(out.prices,e.excerpt))}));return out;}

const {db}=await import('../../server/src/db.js');migrateDatabase(db);
const {getBusinessProfile,saveKnowledgeBase}=await import('../../server/src/onboardingService.js');
const guideText=readFileSync(new URL('../../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
after(()=>db.close());let serial=0;
const ACCOUNT='AC'+'a'.repeat(32),FROM='+19025550100',ORIGIN='https://voice.example.test',TOKEN='synthetic-agent4-boundary-signature',NOW='2026-10-19T12:00:00Z';
const readFacts=instruction=>JSON.parse(instruction.match(/<OWNER_FACTS_JSON>\n([\s\S]*?)\n<\/OWNER_FACTS_JSON>/)[1]);
async function until(predicate){for(let i=0;i<500;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Synthetic provider timeout');}
async function fixture(t,pages,limits={},live=false){
  const s=await website(t,pages,limits),owner='synthetic-agent4-boundary-'+(++serial),other=owner+'-other',to='+1902'+String(5500000+serial),callSid='CA'+serial.toString(16).padStart(32,'0');
  for(const id of [owner,other]){
    db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'synthetic','Synthetic','Synthetic Boundary Shop','Operator','active','UTC','owner',?)").run(id,id+'@example.invalid',NOW);
    db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(id,'cus_synthetic_'+id,NOW,NOW,NOW);
    db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(id);
    saveKnowledgeBase(id,{about:'Synthetic boundary business',hours:'Weekdays',prices:id===owner?'Existing widget $8 each':'FOREIGN_SENTINEL $999 each',website:'https://synthetic.example/',draft:false});
  }
  db.prepare("UPDATE businessProfiles SET twilioNumber=?,twilioNumberSid=?,phoneProvisioningStatus='provisioned',operatorEnabled=1,agentName='Synthetic Assistant' WHERE ownerId=?").run(to,'PN'+serial.toString(16).padStart(32,'0'),owner);
  const otherBefore=JSON.stringify(getBusinessProfile(other).knowledgeBase);
  const app=express();app.use(express.json());
  installKnowledgeDraftRoutes(app,{requireAuth:roles=>{assert.deepEqual(roles,['owner']);return(req,res,next)=>{if(req.headers['x-synthetic-role']!=='owner')return res.status(403).json({error:'owner only'});req.tenantOwnerId=owner;next();};},requireProviderWrites:(_req,_res,next)=>next(),asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),onboardingState:id=>({account:{businessName:'Synthetic Boundary Shop'},profile:getBusinessProfile(id)}),draftKnowledgeBase:input=>draftKnowledgeBase(input,{importPrices:s.importer}),saveKnowledgeBase});
  const connections=[],responses=new Map(),sent=[];let callbacks,ws,voice;
  if(live)voice=installProductionVoice({app,database:db,runtimeConfig:{voiceRuntime:true,providerWrites:true},env:{TWILIO_ACCOUNT_SID:ACCOUNT,TWILIO_AUTH_TOKEN:TOKEN,PUBLIC_BASE_URL:ORIGIN,GEMINI_MODEL:'synthetic-live-model',JWT_SECRET:'synthetic-agent4-boundary-secret'.padEnd(64,'x')},googleClient:{live:{connect:async value=>{connections.push(value);callbacks=value.callbacks;return {sendRealtimeInput:v=>sent.push(v),sendClientContent:v=>sent.push(v),sendToolResponse:async value=>{for(const item of value.functionResponses)responses.set(item.id,item.response);},close:async()=>{}};}}},clock:()=>new Date(NOW),onError:code=>t.diagnostic('voice error '+code)});
  app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({error:error.message,code:error.code}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const local='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{ws?.terminate();await voice?.close();server.closeAllConnections();await new Promise(r=>server.close(r));assert.equal(JSON.stringify(getBusinessProfile(other).knowledgeBase),otherBefore);});
  const post=async(path,body={})=>{const res=await fetch(local+path,{method:'POST',headers:{'Content-Type':'application/json','x-synthetic-role':'owner'},body:JSON.stringify({...body,ownerId:other})});const out=await res.json();assert.equal(res.status,200,JSON.stringify(out));return out;};
  const current=()=>getBusinessProfile(owner).knowledgeBase;
  const facts=()=>readFacts(compileVoiceSystemInstruction({guideText,business:{businessName:'Synthetic Boundary Shop',agentName:'Synthetic Assistant'},services:[],knowledge:current()}));
  let dispatch;
  if(!live){const context={ownerId:owner,callSid,accountSid:ACCOUNT,from:FROM,to};db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,transcriptJson,createdAt) VALUES(?,?,?,?,?,?,'CONNECTED','[]',?)").run(callSid,owner,callSid,ACCOUNT,FROM,to,NOW);const runtime=createVoiceToolRuntime({database:db,callContext:context,handleSecret:'synthetic-agent4-boundary-secret'.padEnd(64,'x')});dispatch=createVoiceToolDispatcher({handlers:runtime.handlers,callContext:context,idempotencyStore:runtime.idempotencyStore}).dispatch;}
  async function connect(){
    const params={AccountSid:ACCOUNT,CallSid:callSid,From:FROM,To:to,Direction:'inbound'},path='/api/twilio/voice/incoming';
    const response=await fetch(local+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature(TOKEN,ORIGIN+path,params)},body:new URLSearchParams(params)});
    const xml=await response.text();if(!xml.includes('<Stream'))t.diagnostic(JSON.stringify({kind:'voice-gate',account:db.prepare('SELECT plan,planStatus FROM users WHERE id=?').get(owner),billing:db.prepare('SELECT paymentMethodVerifiedAt FROM billingAccounts WHERE ownerId=?').get(owner),profile:current(),calls:db.prepare('SELECT status,outcome FROM calls WHERE ownerId=?').all(owner)}));assert.equal(response.status,200,xml);const target=xml.match(/<Stream url="([^"]+)"/);assert.ok(target,xml);
    ws=new WebSocket(local.replace('http:','ws:')+new URL(target[1]).pathname,{headers:{'x-twilio-signature':twilio.getExpectedTwilioSignature(TOKEN,target[1],{})}});await once(ws,'open');const streamSid='MZ'+'c'.repeat(32);
    ws.send(JSON.stringify({event:'connected',protocol:'Call',version:'1.0.0'}));ws.send(JSON.stringify({event:'start',sequenceNumber:'1',streamSid,start:{accountSid:ACCOUNT,callSid,streamSid,tracks:['inbound'],mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}}));await until(()=>connections.length>0);
  }
  async function calculate(listedItem,id='synthetic-event'){
    if(!live)return dispatch({name:'calculateListedPrice',args:args(listedItem),toolCallId:id});
    responses.delete(id);callbacks.onmessage({toolCall:{functionCalls:[{id,name:'calculateListedPrice',args:args(listedItem)}]}});await until(()=>responses.has(id));return responses.get(id);
  }
  return {post,current,facts,calculate,connect,connections,sent,owner,seen:s.seen};
}
const DRAFT='/api/onboarding/knowledge-base/draft',SAVE='/api/onboarding/knowledge-base';

export {fixture,imported,html,p,link,page,NOTE,PRICE,MEMBER,DRAFT,SAVE,readFacts,review,money};
