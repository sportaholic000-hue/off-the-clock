import './pricebookTestEnv.mjs';
import {after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import twilio from 'twilio';
import WebSocket,{WebSocketServer} from 'ws';
import {migrateDatabase} from '../server/src/migrations.js';
import {installKnowledgeDraftRoutes} from '../server/src/knowledgeDraftRoutes.js';
import {installProductionVoice} from '../server/src/voice/productionVoiceRuntime.js';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {until} from './voiceAgent2FactsRefresh20261019Fixture.mjs';

const {db}=await import('../server/src/db.js');migrateDatabase(db);
const {getBusinessProfile,saveKnowledgeBase}=await import('../server/src/onboardingService.js');
after(()=>{if(db.open)db.close();});
const ACCOUNT='AC'+'a'.repeat(32),ORIGIN='https://synthetic-h2.example.invalid',TOKEN='synthetic-h2-twilio-signature';
const SECRET='[SYNTHETIC H2 HANDLE SECRET]'.padEnd(64,'x'),NOW='2026-10-19T12:00:00.000Z';
const clone=value=>JSON.parse(JSON.stringify(value));
export const facts=instruction=>JSON.parse(instruction.match(/<OWNER_FACTS_JSON>\n([\s\S]*?)\n<\/OWNER_FACTS_JSON>/)[1]);
let serial=0;

export async function production(t,options={}){
  const fixtureId=++serial,owners=['a','b'].map((label,index)=>({id:`synthetic-h2-http-${fixtureId}-${label}`,name:`Synthetic H2 Business ${fixtureId} ${label}`,number:'+1902'+String(5600000+fixtureId*2+index)}));
  for(const [index,owner] of owners.entries()){
    db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'synthetic','Synthetic',?,'Operator','active','UTC','owner',?)").run(owner.id,owner.id+'@example.invalid',owner.name,NOW);
    db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(owner.id,'cus_'+owner.id,NOW,NOW,NOW);
    db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(owner.id);
    saveKnowledgeBase(owner.id,{about:index?'[SYNTHETIC] FOREIGN_SENTINEL business facts':'[SYNTHETIC] Current saved business facts',hours:'Weekdays',prices:index?'Gadget $99 each':options.prices??'Widget $10 each',draft:false});
    db.prepare("UPDATE businessProfiles SET twilioNumber=?,twilioNumberSid=?,phoneProvisioningStatus='provisioned',operatorEnabled=1,agentName='Synthetic Sam' WHERE ownerId=?").run(owner.number,'PN'+(fixtureId*2+index).toString(16).padStart(32,'0'),owner.id);
  }
  const app=express();app.use(express.json());
  installKnowledgeDraftRoutes(app,{
    requireAuth:roles=>{assert.deepEqual(roles,['owner']);return(req,res,next)=>{const owner=owners.find(item=>item.id===req.headers['x-synthetic-owner']);if(!owner)return res.status(403).json({error:'Synthetic owner authentication required'});req.tenantOwnerId=owner.id;next();};},
    requireProviderWrites:(_req,_res,next)=>next(),asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),
    onboardingState:ownerId=>({account:{businessName:owners.find(item=>item.id===ownerId).name},profile:getBusinessProfile(ownerId)}),
    draftKnowledgeBase:()=>{throw Error('H2 does not invoke import or draft generation');},saveKnowledgeBase
  });
  const connections=[],calls=[],pendingStarts=[],retired=[],handles=new Map(),responses=new Map(),errors=[],wire=[],release=[];
  let failConnect=false;
  const googleClient={live:{connect:async input=>{
    const owner=owners.find(item=>item.name===facts(input.config.systemInstruction).business.businessName);assert.ok(owner);
    const handle=input.config.sessionResumption?.handle;
    const resumed=handle?handles.get(handle):null;
    const start=pendingStarts.findIndex(item=>item.owner.id===owner.id);
    const old=retired.findIndex(item=>item.owner.id===owner.id);
    const call=resumed?.call??(start>=0?pendingStarts.splice(start,1)[0]:old>=0?retired.splice(old,1)[0]:null);
    assert.ok(call,'Every provider connection belongs to a real signed call');assert.equal(call.owner.id,owner.id,'No cross-owner resume handle');
    const state=resumed?.state??{pending:new Set()},row={call,state,config:clone(input.config),callbacks:input.callbacks,closed:0,content:[],realtime:[],responses:[],established:false};
    connections.push(row);call.rows.push(row);wire.push(['connect',call.callSid,facts(row.config.systemInstruction).knowledge?.prices]);
    if(failConnect)throw Error('[SYNTHETIC PRIVATE H2 CONNECT FAILURE]');
    await options.onConnect?.(row);row.established=true;
    return {
      sendRealtimeInput:async value=>{assert.equal(row.closed,0);row.realtime.push(clone(value));},
      sendClientContent:async value=>{assert.equal(row.closed,0);row.content.push(clone(value));await options.onContent?.(row,value);},
      sendToolResponse:async value=>{
        assert.equal(row.closed,0);
        for(const item of value.functionResponses){assert.ok(state.pending.has(item.id),'No orphan function response');state.pending.delete(item.id);responses.set(call.callSid+'/'+item.id,clone(item.response));}
        row.responses.push(clone(value));wire.push(['response',call.callSid,clone(value)]);await options.onResponse?.(row,value);
      },
      close:async()=>{row.closed++;retired.push(call);wire.push(['close',call.callSid]);}
    };
  }}};
  class SyntheticWebSocketServer extends WebSocketServer{
    handleUpgrade(request,socket,head,accepted){super.handleUpgrade(request,socket,head,ws=>{
      const original=ws.send.bind(ws);
      ws.send=(value,callback)=>{Promise.resolve().then(()=>options.onServerSend(JSON.parse(value))).then(()=>original(value,callback),error=>callback(error));};
      accepted(ws);
    });}
  }
  const voice=installProductionVoice({app,database:db,runtimeConfig:{voiceRuntime:true,providerWrites:true},env:{TWILIO_ACCOUNT_SID:ACCOUNT,TWILIO_AUTH_TOKEN:TOKEN,PUBLIC_BASE_URL:ORIGIN,GEMINI_MODEL:'synthetic-live-model',JWT_SECRET:SECRET},googleClient,...(options.onServerSend?{WebSocketServerClass:SyntheticWebSocketServer}:{}),clock:()=>new Date(NOW),onError:code=>errors.push(code)});
  app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({error:error.message,code:error.code}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const local='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{for(const resume of release)resume();await voice.close();for(const call of calls)call.ws?.terminate();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const current=owner=>getBusinessProfile(owner.id).knowledgeBase;
  async function save(prices,owner=owners[0],extra={}){
    const priorTimestamp=db.prepare('SELECT updatedAt FROM businessProfiles WHERE ownerId=?').get(owner.id).updatedAt;
    const response=await fetch(local+'/api/onboarding/knowledge-base',{method:'POST',headers:{'Content-Type':'application/json','x-synthetic-owner':owner.id},body:JSON.stringify({...current(owner),prices,...extra,ownerId:owners.find(item=>item.id!==owner.id).id})});
    const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
    // Explicit timestamp-collision fixture: the route saves all real content;
    // only its audit timestamp is held equal to the prior value for this control.
    if(options.sharedTimestamp)db.prepare('UPDATE businessProfiles SET updatedAt=? WHERE ownerId=?').run(priorTimestamp,owner.id);
    return body;
  }
  async function signed(path,params){return fetch(local+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature(TOKEN,ORIGIN+path,params)},body:new URLSearchParams(params)});}
  async function connect(owner=owners[0],from='+19025550100'){
    const n=fixtureId*100+calls.length+1,callSid='CA'+n.toString(16).padStart(32,'0'),streamSid='MZ'+n.toString(16).padStart(32,'0');
    const params={AccountSid:ACCOUNT,CallSid:callSid,From:from,To:owner.number,Direction:'inbound'};
    const response=await signed('/api/twilio/voice/incoming',params),xml=await response.text();assert.equal(response.status,200,xml);
    const target=xml.match(/<Stream url="([^"]+)"/);
    if(!target)t.diagnostic(JSON.stringify({syntheticInboundFailure:{ownerId:owner.id,callSid,errors,calls:db.prepare('SELECT status,failureCode,outcome FROM calls WHERE ownerId=? AND callSid=?').all(owner.id,callSid),profile:getBusinessProfile(owner.id)}}));
    assert.ok(target,xml);
    const call={owner,callSid,streamSid,params,rows:[],socketMessages:[],sequence:2,chunk:1,fallback:new URL(xml.match(/<Redirect method="POST">([^<]+)/)[1]).pathname};calls.push(call);pendingStarts.push(call);
    const ws=new WebSocket(local.replace('http:','ws:')+new URL(target[1]).pathname,{headers:{'x-twilio-signature':twilio.getExpectedTwilioSignature(TOKEN,target[1],{})}});call.ws=ws;ws.on('message',value=>call.socketMessages.push(JSON.parse(value)));
    await once(ws,'open');ws.send(JSON.stringify({event:'connected',protocol:'Call',version:'1.0.0'}));
    ws.send(JSON.stringify({event:'start',sequenceNumber:'1',streamSid,start:{accountSid:ACCOUNT,callSid,streamSid,tracks:['inbound'],mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}}));
    await until(()=>call.rows.length>0&&call.rows.at(-1).established);return call;
  }
  function emit(call,value,row=call.rows.at(-1)){for(const item of value.toolCall?.functionCalls??[])row.state.pending.add(item.id);row.callbacks.onmessage(value);}
  async function tool(call,listedItem,id='synthetic-h2-tool',quantity='3'){
    const key=call.callSid+'/'+id;responses.delete(key);emit(call,{toolCall:{functionCalls:[{id,name:'calculateListedPrice',args:{listedItem,quantity,customerConfirmed:true}}]}});
    await until(()=>responses.has(key));return responses.get(key);
  }
  function media(call){const chunk=call.chunk++;call.ws.send(JSON.stringify({event:'media',sequenceNumber:String(call.sequence++),streamSid:call.streamSid,media:{track:'inbound',chunk:String(chunk),timestamp:String((chunk-1)*20),payload:Buffer.alloc(160,255).toString('base64')}}));}
  function resume(call){const row=call.rows.at(-1),handle='synthetic-h2-resume-'+call.callSid+'-'+call.rows.length;handles.set(handle,{call,state:row.state});emit(call,{sessionResumptionUpdate:{newHandle:handle,resumable:true}});return handle;}
  function dispatcher(call){const runtime=createVoiceToolRuntime({database:db,callContext:{ownerId:call.owner.id,callSid:call.callSid,accountSid:ACCOUNT,from:call.params.From,to:call.params.To},handleSecret:SECRET,clock:()=>new Date(NOW)});return createVoiceToolDispatcher({handlers:runtime.handlers,callContext:runtime.context??{ownerId:call.owner.id,callSid:call.callSid,accountSid:ACCOUNT,from:call.params.From,to:call.params.To},idempotencyStore:runtime.idempotencyStore});}
  return {db,owners,calls,connections,errors,wire,responses,voice,current,save,connect,emit,tool,media,resume,dispatcher,signed,release,
    failRefresh:()=>{failConnect=true;},delivered:call=>call.rows.map(row=>facts(row.config.systemInstruction).knowledge?.prices??'')};
}
