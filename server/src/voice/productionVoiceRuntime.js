import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import twilio from 'twilio';
import {GoogleGenAI} from '@google/genai';
import {WebSocketServer} from 'ws';
import {installVoiceRuntimeRoutes,createVoiceWebSocketSessionCoordinator} from '../voiceRuntimeRoutes.js';
import {createTwilioRequestValidator} from './twilioValidation.js';
import {createVoiceTenantResolver} from './tenantResolver.js';
import {createVoiceSessionNonceService} from './sessionNonceService.js';
import {createVoiceNonceRepository,createVoiceSessionStore,findVoiceTenantsByNumber,loadVoiceAccountContext} from './voicePersistence.js';
import {createVoiceToolRuntime} from './voiceToolRuntime.js';
import {createVoiceToolDispatcher} from './toolDispatcher.js';
import {getVoiceToolDeclarations} from './toolSchemas.js';
import {createVoiceWebSocketServer} from './voiceWebSocketServer.js';
import {createGeminiMediaBridge} from './geminiMediaBridge.js';
import {createGoogleGenAiLiveSessionOpener} from './googleGenAiLiveAdapter.js';
import {compileVoiceSystemInstruction} from './voicePromptCompiler.js';
import {loadPricebook} from '../../priceBookService.js';
import {bookQuoteStatuses,applicationServiceName} from '../quoteDoneBridge.js';
import {hasOperatorAccess,hasQuoteDoneAccess,trialVoiceCapDecision} from '../planAccess.js';

const E164=/^\+[1-9]\d{7,14}$/;
const SID=/^AC[0-9a-f]{32}$/i;
const incomingPath='/api/twilio/voice/incoming',streamPath='/api/twilio/voice/stream',fallbackPath='/api/twilio/voice/fallback';
const iso=clock=>new Date(clock()).toISOString();

// Dependencies are supplied only by server construction, never request data or
// an environment-selected test module. Tests use real HTTP/WS/SQLite and fake providers.
export function installProductionVoice({app,database,bookingService,runtimeConfig={},env=process.env,googleClient,WebSocketServerClass=WebSocketServer,clock=()=>new Date(),providers={},onError=code=>console.error('[voice]',code)}={}){
  if(!app||typeof app.post!=='function'||typeof app.listen!=='function'||!database?.prepare)throw new TypeError('Voice application dependencies are required.');
  const accountSid=String(env.TWILIO_ACCOUNT_SID||''),authToken=String(env.TWILIO_AUTH_TOKEN||''),publicBaseUrl=String(env.PUBLIC_BASE_URL||'');
  let base;try{base=new URL(publicBaseUrl);}catch{}
  const configured=SID.test(accountSid)&&authToken.length>0&&base?.protocol==='https:'&&base.origin===publicBaseUrl.replace(/\/$/,'')&&!base.username&&!base.password&&base.pathname==='/'&&!base.search&&!base.hash;
  if(!configured){
    // No authenticated tenant can be selected without provider verification.
    if(runtimeConfig.voiceRuntime===true)throw new TypeError('Signed voice configuration is required.');
    app.post(incomingPath,(_req,res)=>res.status(503).type('text/plain').send('Voice unavailable'));
    return Object.freeze({configured:false,close:async()=>{}});
  }
  const enabled=runtimeConfig.voiceRuntime===true&&runtimeConfig.providerWrites===true;
  const validator=createTwilioRequestValidator({validateRequest:twilio.validateRequest,authToken,publicBaseUrl,allowedAccountSids:[accountSid]});
  const tenantResolver=createVoiceTenantResolver({findByTwilioNumber:number=>findVoiceTenantsByNumber(database,number)});
  const nonceService=createVoiceSessionNonceService({repository:createVoiceNonceRepository({database}),now:()=>new Date(clock()).getTime()});
  const store=createVoiceSessionStore({database,clock}),account=ownerId=>loadVoiceAccountContext(database,ownerId);
  const fallback=({context})=>{
    const number=account(context.ownerId).profile?.existingPhoneNumber;
    if(!E164.test(String(number||''))||number===context.to)throw Error('A distinct business fallback number is required.');
    return {mode:'forward',number,message:'The business could not answer. Please try the business again shortly.'};
  };
  const paths=installVoiceRuntimeRoutes(app,{
    twilioValidator:validator,tenantResolver,nonceService,allowedAccountSids:[accountSid],publicBaseUrl,runtimeEnabled:enabled,
    checkOperatorEligibility:({context})=>{const state=account(context.ownerId);return hasOperatorAccess(state.account,{now:new Date(clock())})&&state.profile?.operatorEnabled===1&&state.profile.phoneProvisioningStatus==='provisioned'&&state.profile.twilioNumber===context.to;},
    checkVoiceCap:({context})=>{const state=account(context.ownerId);return trialVoiceCapDecision(state.account,{now:new Date(clock()),minutesUsed:state.minutesUsed});},
    createSession:store.createSession,resolveFallback:fallback,recordFallback:store.recordFallback,incomingPath,streamPath,resumeFallback:true,fallbackPath,loadSessionByNonceHash:store.loadSessionByNonceHash
  });
  const guide=enabled?readFileSync(new URL('../../../specs/voice_quote_flows.md',import.meta.url),'utf8'):null;
  const client=enabled?(googleClient||new GoogleGenAI({apiKey:String(env.GEMINI_API_KEY||'')})):null;
  const configuredSecret=env.VOICE_HANDLE_SECRET||env.BOOKING_SLOT_TOKEN_SECRET||env.JWT_SECRET;
  const handleSecret=typeof configuredSecret==='string'&&Buffer.byteLength(configuredSecret)>=32?createHash('sha256').update('voice-handles-v1\0'+configuredSecret).digest():null;
  let boundary=null;
  function publicPrompt(context){
    const owner=database.prepare('SELECT businessName FROM users WHERE id = ? AND role = ?').get(context.ownerId,'owner');
    const profile=database.prepare('SELECT agentName, knowledgeBaseJson FROM businessProfiles WHERE ownerId = ?').get(context.ownerId);
    // The receptionist answers from the owner's saved knowledge section, including listed prices.
    let knowledge=null;try{const kb=JSON.parse(profile?.knowledgeBaseJson||'null');if(kb&&typeof kb==='object'&&!Array.isArray(kb))knowledge={about:kb.about,hours:kb.hours,services:kb.services,policies:kb.policies,faqs:kb.faqs,prices:kb.prices,neverSay:Array.isArray(kb.neverSay)?kb.neverSay:[]};}catch{knowledge=null;}
    const canQuote=hasQuoteDoneAccess(account(context.ownerId).account,{now:new Date(clock())});
    const book=canQuote?loadPricebook(context.ownerId):{services:[]};
    const statuses=canQuote?new Map(bookQuoteStatuses(book).map(status=>[status.serviceId,status])):new Map();
    const services=book.services.filter(service=>statuses.get(service.id)?.status==='QUOTING LIVE').map(service=>({serviceType:service.serviceType,serviceLabel:applicationServiceName(service),active:true,status:'QUOTING LIVE',offerings:Object.entries(service.knownOfferings||{}).flatMap(([field,products])=>Object.keys(products).map(value=>({field,value,label:value.replaceAll('_',' ')})))}));
    return compileVoiceSystemInstruction({guideText:guide,business:{businessName:owner?.businessName,agentName:profile?.agentName||'Assistant'},services,knowledge});
  }
  async function startMediaSession(input){
    if(!enabled||!handleSecret)throw Error('Voice session is unavailable.');
    const {context,session}=input;
    const runtime=createVoiceToolRuntime({database,callContext:context,handleSecret,bookingService,providers,clock});
    const handlers={...runtime.handlers};
    for(const name of ['matchService','getQuote']){const original=handlers[name];handlers[name]=invocation=>{if(!hasQuoteDoneAccess(account(context.ownerId).account,{now:new Date(clock())}))return {status:'needs_details',customerMessage:'The business will review this pricing request.'};return original(invocation);};}
    const dispatcher=createVoiceToolDispatcher({handlers,callContext:context,idempotencyStore:runtime.idempotencyStore});
    const opener=createGoogleGenAiLiveSessionOpener({client,model:env.GEMINI_MODEL,systemInstruction:publicPrompt(context),toolDeclarations:getVoiceToolDeclarations(),greetOnConnect:true});
    let started=null;
    const bridge=createGeminiMediaBridge({
      openGeminiSession:async options=>{
        const opened=await opener(options);started=new Date(clock()).getTime();
        try{database.prepare("UPDATE calls SET status='CONNECTED', updatedAt=? WHERE id=? AND ownerId=? AND callSid=?").run(iso(clock),session.callRecordId,context.ownerId,context.callSid);}catch(error){await opened.close({reason:'CALL_PERSISTENCE_FAILED'});throw error;}return opened;
      },
      onTranscript:({transcript,streamSid})=>{
        const row=database.prepare('SELECT transcriptJson FROM calls WHERE id=? AND ownerId=? AND callSid=?').get(session.callRecordId,context.ownerId,context.callSid);
        if(!row)throw Error('Call binding lost.');const prior=JSON.parse(row.transcriptJson||'[]');prior.push(transcript);
        if(Buffer.byteLength(JSON.stringify(prior))>1048576)throw Error('Transcript storage bound reached.');
        database.prepare('UPDATE calls SET transcriptJson=?,streamSid=?,updatedAt=? WHERE id=? AND ownerId=? AND callSid=?').run(JSON.stringify(prior),streamSid,iso(clock),session.callRecordId,context.ownerId,context.callSid);
      },
      onToolCall:async({toolCall})=>{
        try{return await dispatcher.dispatch(toolCall);}catch{
          onError('VOICE_TOOL_REJECTED');
          return {status:'needs_details',customerMessage:'That action could not be completed. Check the requested details and caller confirmation; no successful price or booking is being reported.'};
        }
      },
      onSessionEnd:({outcome,streamSid})=>{
        const at=iso(clock),duration=started===null?0:Math.max(0,Math.ceil((new Date(clock()).getTime()-started)/1000));
        database.prepare('UPDATE calls SET status=?,outcome=?,failureCode=?,streamSid=?,duration=?,completedAt=?,updatedAt=? WHERE id=? AND ownerId=? AND callSid=?').run(outcome.status==='failed'?'FAILED':'COMPLETED',outcome.reason,outcome.status==='failed'?outcome.reason:null,streamSid,duration,at,at,session.callRecordId,context.ownerId,context.callSid);
      }
    });return bridge.startMediaSession(input);
  }
  const coordinator=createVoiceWebSocketSessionCoordinator({twilioValidator:validator,nonceService,loadSessionByNonceHash:store.loadSessionByNonceHash,startMediaSession,streamPath});
  // Attach to the server returned by the entry point's existing app.listen.
  // No second port and no changes to other server.js routes or lifecycle setup.
  const listen=app.listen;
  app.listen=function(...args){
    app.listen=listen;const server=listen.apply(this,args);
    boundary=createVoiceWebSocketServer({httpServer:server,WebSocketServer:WebSocketServerClass,coordinator,streamPath,onError});
    const close=server.close;server.close=function(callback){void boundary.close().then(()=>close.call(server,callback));return server;};return server;
  };
  return Object.freeze({configured:true,paths,get boundary(){return boundary;},close:()=>boundary?.close()||Promise.resolve()});
}
