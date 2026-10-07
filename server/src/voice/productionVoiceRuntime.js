import {createBillingVoiceUsage} from '../billingVoiceUsage.js';
import {createVoiceAdmission} from './voiceAdmission.js';
import {installBillingVoiceRoutes} from '../billingVoiceRoutes.js';
import {createVoiceProviderAdapters} from './voiceProviderAdapters.js';
import {createVoiceInboundReceipt} from './voiceInboundReceipt.js';
import {captureChoice,installVoiceFallbackRoutes} from './voiceFallbackRoutes.js';
import {voiceRouteReadiness} from './voiceReadiness.js';
import {completeVoiceCall} from '../callSummaryService.js';
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
import {readReviewContact} from '../reviewContact.js';
import {loadPricebook} from '../../priceBookService.js';
import {bookQuoteStatuses,applicationServiceName} from '../quoteDoneBridge.js';
import {quoteDateContext} from '../quoteDate.js';
import {hasOperatorAccess,hasQuoteDoneAccess,trialVoiceCapDecision} from '../planAccess.js';

import {VOICE_NAMES} from './voiceSettings.js';

const E164=/^\+[1-9]\d{7,14}$/;
const SID=/^AC[0-9a-f]{32}$/i;
const incomingPath='/api/twilio/voice/incoming',streamPath='/api/twilio/voice/stream',fallbackPath='/api/twilio/voice/fallback';
const iso=clock=>new Date(clock()).toISOString();

// Dependencies are supplied only by server construction, never request data or
// an environment-selected test module. Tests use real HTTP/WS/SQLite and fake providers.
export function installProductionVoice({app,database,bookingService,runtimeConfig={},env=process.env,googleClient,twilioClient,WebSocketServerClass=WebSocketServer,clock=()=>new Date(),providers={},onUsage=()=>{},onError=code=>console.error('[voice]',code)}={}){
  if(!app||typeof app.post!=='function'||typeof app.listen!=='function'||!database?.prepare)throw new TypeError('Voice application dependencies are required.');
  const admission=createVoiceAdmission({database,clock,env});
  const store=createVoiceSessionStore({database,clock,admission,maxConcurrentCalls:admission.config.maxOwnerConcurrent});store.recoverActiveCalls();
  const accountSid=String(env.TWILIO_ACCOUNT_SID||''),authToken=String(env.TWILIO_AUTH_TOKEN||''),publicBaseUrl=String(env.PUBLIC_BASE_URL||'');
  let base;try{base=new URL(publicBaseUrl);}catch{}
  const configured=SID.test(accountSid)&&authToken.length>0&&base?.protocol==='https:'&&base.origin===publicBaseUrl.replace(/\/$/,'')&&!base.username&&!base.password&&base.pathname==='/'&&!base.search&&!base.hash;
  if(!configured){
    // No authenticated tenant can be selected without provider verification.
    if(runtimeConfig.voiceRuntime===true)throw new TypeError('Signed voice configuration is required.');
    app.post(incomingPath,(_req,res)=>res.status(503).type('text/plain').send('Voice unavailable'));
    return Object.freeze({configured:false,close:async()=>{}});
  }
  const enabled=voiceRouteReadiness({env:{...env,...(googleClient?{GEMINI_API_KEY:'injected-provider'}:{})},runtimeConfig}).ready;
  const validator=createTwilioRequestValidator({validateRequest:twilio.validateRequest,authToken,publicBaseUrl,allowedAccountSids:[accountSid]});
  const tenantResolver=createVoiceTenantResolver({findByTwilioNumber:number=>findVoiceTenantsByNumber(database,number)});
  const nonceService=createVoiceSessionNonceService({repository:createVoiceNonceRepository({database}),now:()=>new Date(clock()).getTime()});
  const meter=createBillingVoiceUsage({database,clock,onUsage});
  installBillingVoiceRoutes(app,{validator,meter});
  const account=ownerId=>({...loadVoiceAccountContext(database,ownerId),minutesUsed:meter.minutesUsed(ownerId)});
  function offRouting(context){
    const state=account(context.ownerId);
    if(state.profile?.operatorEnabled!==0)return null;
    const coverage=database.prepare('SELECT confirmedEnabled,phase FROM operatorCoverageOperations WHERE ownerId=?').get(context.ownerId);
    const number=state.profile.existingPhoneNumber;
    const confirmed=state.profile.carrierSetupStatus==='updated'&&(!coverage||coverage.confirmedEnabled===0&&coverage.phase==='idle');
    return {mode:confirmed&&E164.test(number||'')&&number!==context.to?'forward':'message',number,message:'The operator is off. Please call the business directly.'};
  }
  const fallback=({context,reason})=>{
    if(reason==='VOICE_SPAM_BLOCKED')return {mode:'reject'};
    const state=account(context.ownerId),off=offRouting(context);
    if(off)return off;
    if(state.account?.serviceEndsAt&&Date.parse(state.account.serviceEndsAt)<=new Date(clock()).getTime())return {mode:'message',message:'This business is currently unavailable.'};
    const choice=captureChoice(publicBaseUrl);
    if(reason==='VOICE_CALLER_THROTTLED')choice.message="You've reached us several times today. Please leave your name and what you need. The business will review your calls and follow up.";
    return choice;
  };
  const configuredSecret=env.VOICE_HANDLE_SECRET||env.BOOKING_SLOT_TOKEN_SECRET||env.JWT_SECRET;
  const handleSecret=typeof configuredSecret==='string'&&Buffer.byteLength(configuredSecret)>=32?createHash('sha256').update('voice-handles-v1\0'+configuredSecret).digest():null;
  const routeIncoming=handleSecret?createVoiceInboundReceipt({database,secret:handleSecret,clock}):undefined;
  installVoiceFallbackRoutes({app,validator,resolver:tenantResolver,database,store,publicBaseUrl,clock});
  const providerClient=enabled?(twilioClient||twilio(env.TWILIO_API_KEY_SID||accountSid,env.TWILIO_API_KEY_SECRET||authToken,{accountSid,autoRetry:false,timeout:10000})):null;
  const productionProviders=createVoiceProviderAdapters({app,database,twilioClient:providerClient,bookingService,validator,publicBaseUrl,clock,
    onTransferFailed:({context,reason,notes,inquiryNumber})=>createVoiceToolRuntime({database,callContext:context,handleSecret,bookingService,clock}).handlers.transferCall({context,args:{reason,notes,inquiryNumber,customerConfirmed:true}})});
  providers={...productionProviders,...providers};
  const paths=installVoiceRuntimeRoutes(app,{
    twilioValidator:validator,tenantResolver,nonceService,allowedAccountSids:[accountSid],publicBaseUrl,runtimeEnabled:enabled,
    checkOperatorEligibility:({context})=>{const state=account(context.ownerId);return hasOperatorAccess(state.account,{now:new Date(clock())})&&state.profile?.operatorEnabled===1&&state.profile.phoneProvisioningStatus==='provisioned'&&state.profile.twilioNumber===context.to;},
    checkVoiceCap:({context})=>{const state=account(context.ownerId);return trialVoiceCapDecision(state.account,{now:new Date(clock()),minutesUsed:state.minutesUsed});},
    validateCallBinding:store.validateCallBinding,
    validateIncomingCall:store.validateIncomingCall,
    checkCaller:admission.checkCaller,createSession:store.createSession,routeIncoming,resolveFallback:fallback,recordFallback:input=>{const choice=input.reason==='VOICE_SPAM_BLOCKED'?null:offRouting(input.context);return choice?store.recordHumanRouting({context:input.context,forwarded:choice.mode==='forward'}):store.recordFallback(input);},incomingPath,streamPath,resumeFallback:true,fallbackPath,loadSessionByNonceHash:store.loadSessionByNonceHash
  });
  const guide=enabled?readFileSync(new URL('../../../specs/voice_quote_flows.md',import.meta.url),'utf8'):null;
  const client=enabled?(googleClient||new GoogleGenAI({apiKey:String(env.GEMINI_API_KEY||'')})):null;
  let boundary=null;
  function publicPrompt(context){
    const owner=database.prepare('SELECT businessName FROM users WHERE id = ? AND role = ?').get(context.ownerId,'owner');
    const profile=database.prepare('SELECT agentName, greeting, voiceId, knowledgeBaseJson FROM businessProfiles WHERE ownerId = ?').get(context.ownerId);
    // The receptionist answers from the owner's saved knowledge section, including listed prices.
    let knowledge=null;try{const kb=JSON.parse(profile?.knowledgeBaseJson||'null');if(kb&&typeof kb==='object'&&!Array.isArray(kb)&&kb.draft!==true)knowledge={about:kb.about,hours:kb.hours,services:kb.services,policies:kb.policies,faqs:kb.faqs,prices:kb.prices,neverSay:Array.isArray(kb.neverSay)?kb.neverSay:[],reviewContact:readReviewContact(kb.reviewContact,context.ownerId)};}catch{knowledge=null;}
    const canQuote=hasQuoteDoneAccess(account(context.ownerId).account,{now:new Date(clock())});
    let book={services:[]};
    if(canQuote)try{book=loadPricebook(context.ownerId);}catch{
      const at=iso(clock),message='The saved price book cannot be read. Calculated quoting is paused; ordinary answering, listed prices, leads and scheduling remain available. Restore the saved price book from backup or contact support.';
      database.prepare("INSERT OR IGNORE INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES(?,?,'voice.quoting_unavailable',?,?,'PENDING',?,?)").run('voice-quoting-unavailable:'+context.ownerId+':'+context.callSid,context.ownerId,context.callSid,JSON.stringify({callSid:context.callSid,message}),at,at);
      onError('VOICE_QUOTING_UNAVAILABLE');
    }
    const statuses=canQuote?new Map(bookQuoteStatuses(book,quoteDateContext(database,context.ownerId,new Date(clock()))).map(status=>[status.serviceId,status])):new Map();
    const services=book.services.filter(service=>statuses.get(service.id)?.status==='QUOTING LIVE').map(service=>({serviceType:service.serviceType,serviceLabel:applicationServiceName(service),active:true,status:'QUOTING LIVE',offerings:Object.entries(service.knownOfferings||{}).flatMap(([field,products])=>Object.keys(products).map(value=>({field,value,label:value.replaceAll('_',' ')})))}));
    return compileVoiceSystemInstruction({guideText:guide,business:{businessName:owner?.businessName,agentName:profile?.agentName||'Assistant'},services,knowledge,greeting:profile?.greeting||undefined});
  }
  async function startMediaSession(input){
    if(!enabled||!handleSecret)throw Error('Voice session is unavailable.');
    const {context,session}=input;
    const runtime=createVoiceToolRuntime({database,callContext:context,handleSecret,bookingService,providers,clock});
    const handlers={...runtime.handlers};
    for(const name of ['matchService','getQuote']){const original=handlers[name];handlers[name]=invocation=>{if(!hasQuoteDoneAccess(account(context.ownerId).account,{now:new Date(clock())}))return {status:'needs_details',customerMessage:'The business will review this pricing request.'};return original(invocation);};}
    const dispatcher=createVoiceToolDispatcher({handlers,callContext:context,idempotencyStore:runtime.idempotencyStore});
    const voiceProfile=database.prepare('SELECT voiceId FROM businessProfiles WHERE ownerId=?').get(context.ownerId);
    const opener=createGoogleGenAiLiveSessionOpener({voiceName:VOICE_NAMES[voiceProfile?.voiceId]||VOICE_NAMES.female,client,model:env.GEMINI_MODEL,systemInstruction:()=>publicPrompt(context),toolDeclarations:getVoiceToolDeclarations(),greetOnConnect:true});
    let started=null;
    const pendingTranscripts=[];
    function flushTranscripts(){
      if(!pendingTranscripts.length)return;
      const row=database.prepare('SELECT transcriptJson FROM calls WHERE id=? AND ownerId=? AND callSid=?').get(session.callRecordId,context.ownerId,context.callSid);
      if(!row)throw Error('Call binding lost.');
      const prior=JSON.parse(row.transcriptJson||'[]');prior.push(...pendingTranscripts.map(item=>item.transcript));
      database.prepare('UPDATE calls SET transcriptJson=?,streamSid=?,updatedAt=? WHERE id=? AND ownerId=? AND callSid=?').run(JSON.stringify(prior),pendingTranscripts.at(-1).streamSid,iso(clock),session.callRecordId,context.ownerId,context.callSid);
      pendingTranscripts.length=0;
    }
    const bridge=createGeminiMediaBridge({
      openGeminiSession:async options=>{
        const denied=admission.beforeOpen(context);
        if(denied){store.recordFallback({context,reason:denied});throw Error('Voice admission closed.');}
        meter.start(context,session.callRecordId);
        let opened;try{opened=await opener(options);}catch(error){if(error.code==='GEMINI_CONNECT_FAILED')admission.failed(context);throw error;}
        try{admission.connected(context);started=new Date(clock()).getTime();database.prepare("UPDATE calls SET status='CONNECTED', updatedAt=? WHERE id=? AND ownerId=? AND callSid=? AND status='CONNECTING'").run(iso(clock),session.callRecordId,context.ownerId,context.callSid);}catch(error){await opened.close({reason:'CALL_PERSISTENCE_FAILED'});throw error;}return opened;
      },
      onTranscript:({transcript,streamSid})=>{
        pendingTranscripts.push({transcript,streamSid});flushTranscripts();
      },
      onToolCall:async({toolCall})=>{
        try{return await dispatcher.dispatch(toolCall);}catch{
          onError('VOICE_TOOL_REJECTED');
          return {status:'needs_details',customerMessage:'That action could not be completed. Check the requested details and caller confirmation; no successful price or booking is being reported.'};
        }
      },
      onSessionEnd:({outcome,streamSid})=>{
        if(['GEMINI_SESSION_ERROR','GEMINI_SESSION_CLOSED'].includes(outcome.reason))admission.failed(context);
        const duration=started===null?0:Math.max(0,Math.ceil((new Date(clock()).getTime()-started)/1000));
        try{
          flushTranscripts();
          const call=database.prepare('SELECT status FROM calls WHERE id=? AND ownerId=? AND callSid=?').get(session.callRecordId,context.ownerId,context.callSid);
          // The signed capture callback owns finalizing a fallback. Media close
          // must neither cut it off nor turn excluded fallback into paid usage.
          const finalizeMetadata=()=>completeVoiceCall({database,ownerId:context.ownerId,callId:session.callRecordId,callSid:context.callSid,outcome,streamSid,duration,at:iso(clock),preserveLifecycle:true});
          if(!['FALLBACK','AI_FALLBACK'].includes(call?.status))store.finishCall({context,status:outcome.status==='failed'||outcome.reason==='GEMINI_SESSION_CLOSED'?'FAILED':'COMPLETED',reason:outcome.reason,streamSid,duration,finalizeMetadata});
          else finalizeMetadata();
          meter.finish(context,session.callRecordId);
        }catch(error){onError('VOICE_FINAL_CAPTURE_FAILED');throw error;}
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
