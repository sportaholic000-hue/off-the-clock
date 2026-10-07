import './pricebookTestEnv.mjs';
import {randomUUID} from 'node:crypto';
import {fixture,secret,at} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {createVoiceHandleStore} from '../server/src/voice/voicePersistence.js';
import {projectVoiceQuote} from '../server/src/voice/voiceQuotePresentation.js';
import {createQuoteEmailService} from '../server/src/quoteEmailService.js';
export const environment={PUBLIC_BASE_URL:'https://synthetic.example.invalid',EMAIL_FROM:'quotes@example.invalid'};
export const fixedReceipt=()=>({resultType:'INSTANT_ESTIMATE_READY',currency:'CAD',taxTreatment:'No tax added.',priceUnit:'per visit',options:[{tierName:'Base',lowEstimate:100,midEstimate:100,highEstimate:100,skippedAddons:['Clipping bagging and disposal'],disclaimer:'[SYNTHETIC] Measured mowing only. Access must be clear.'}]});
export function quoteEmailFixture(t,options={}){
  const f=options.base||fixture(t,options.filename);let now=Date.parse(at),sends=0;const messages=new Map();
  const provider=options.provider||{send:async message=>{const id='SYNTHETIC-'+(++sends);messages.set(id,message);return {accepted:true,id};},read:async id=>{const m=messages.get(id);return {id,to:[m.to],from:m.from,subject:m.subject,last_event:'delivered'};}};
  const makeService=()=>createQuoteEmailService({database:f.db,ownerQuery:f.ownerQuery,environment,provider,clock:()=>now,providerTimeoutMs:options.timeout||100});
  let service=makeService();const c=options.context||f.context();
  function voice(context=c){const runtime=createVoiceToolRuntime({database:f.db,callContext:context,handleSecret:secret,clock:()=>new Date(now),providers:{quoteEmailDelivery:service}});return createVoiceToolDispatcher({handlers:runtime.handlers,callContext:context,idempotencyStore:runtime.idempotencyStore}).dispatch;}
  const tool=(name,args,id='synthetic-tool-'+randomUUID())=>voice()({name,args,toolCallId:id});
  const rows=()=>f.db.prepare('SELECT * FROM quoteEmailDeliveries WHERE ownerId=? ORDER BY rowid').all(c.ownerId);
  function savedQuote(receipt=fixedReceipt()){
    const recordId='SYNTHETIC-quote-'+randomUUID(),requestId='SYNTHETIC-request-'+randomUUID();
    f.db.prepare("INSERT INTO quotes(id,ownerId,callId,serviceType,resultJson,status,createdAt) VALUES(?,?,?,'CUSTOM',?,'INSTANT',?)").run(recordId,c.ownerId,c.callSid,JSON.stringify({customerResult:receipt,privateRate:'PRIVATE_RATE_MUST_NOT_LEAK'}),at);
    f.db.prepare("INSERT INTO quoteSubmissions(ownerId,requestId,contentDigest,recordId,resultType,bookRevision,originalSubmissionJson,internalOutcomeJson,customerResponseJson,createdAt) VALUES(?,?,'SYNTHETIC',?,?,'SYNTHETIC','{}','{}',?,?)").run(c.ownerId,requestId,recordId,receipt.resultType,JSON.stringify(receipt),at);
    const quoteHandle=createVoiceHandleStore({database:f.db,secret,clock:()=>new Date(now)}).issue({context:c,type:'quote',resourceKey:recordId,reference:{recordId,requestId,resultType:receipt.resultType},expiresAt:new Date(now+3600000)});
    const narration=projectVoiceQuote(receipt,quoteHandle).quoteNarration;
    f.db.prepare('INSERT INTO voiceQuoteNarrations(ownerId,requestId,callSid,narration,createdAt) VALUES(?,?,?,?,?)').run(c.ownerId,requestId,c.callSid,narration,at);
    return {quoteHandle,recordId,requestId,narration};
  }
  async function queue(saved=savedQuote(),email='caller@example.invalid'){
    const confirmation=await tool('prepareQuoteEmail',{quoteHandle:saved.quoteHandle,email});
    const result=await tool('sendQuoteEmail',{emailConfirmationHandle:confirmation.emailConfirmationHandle,customerConfirmed:true});
    return {...saved,confirmation,result};
  }
  return {...f,c,tool,voice,rows,provider,savedQuote,queue,emailService:()=>service,advance:ms=>{now+=ms;},restart:()=>{service=makeService();},sends:()=>sends};
}
