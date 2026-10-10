import express from 'express';
import {usageOwnerQuery} from '../billingUsagePolicy.js';
import {isVoiceCaller,isPhoneNumber} from './callerIdentity.js';
import {isFinalVoiceCall} from './voiceRecovery.js';
import {TWILIO_BACKUP_VOICES} from './voiceSettings.js';
export const CAPTURE_PATH='/api/twilio/voice/capture';
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export const BACKUP_CAPTURE_MESSAGE="Sorry, we got cut off. Please tell me what you need, your name and the best number to reach you, and we'll get back to you.";
export const BACKUP_THANK_YOU="Thanks, we'll get back to you.";
const THROTTLED_RETRY_MESSAGE='Sorry, I could not finish helping you. Please tell me what you need, your name, and the best number to reach you. The business will follow up.';
export function captureChoice(base,voiceId){return {mode:'capture',action:base+CAPTURE_PATH,partial:base+CAPTURE_PATH+'/partial',message:BACKUP_CAPTURE_MESSAGE,...(Object.hasOwn(TWILIO_BACKUP_VOICES,voiceId)?{voice:TWILIO_BACKUP_VOICES[voiceId]}:{})};}
export function installVoiceFallbackRoutes({app,validator,resolver,database,ownerQuery,store,publicBaseUrl,clock=()=>new Date()}){
  const query=usageOwnerQuery(database,ownerQuery);
  const markFallback=(context,call)=>{
    if(!['FALLBACK','AI_FALLBACK'].includes(call.status))store.recordFallback({context,reason:call.failureCode||'VOICE_FALLBACK'});
  };
  const parser=express.urlencoded({extended:false,limit:'32kb',parameterLimit:64});
  const serviceEnded=context=>{
    const account=query("SELECT serviceEndsAt FROM users WHERE id=@ownerId AND role='owner'").get({ownerId:context.ownerId});
    return account?.serviceEndsAt&&Date.parse(account.serviceEndsAt)<=new Date(clock()).getTime();
  };
  const unavailable=res=>res.type('text/xml').send('<Response><Say>This business is currently unavailable.</Say><Hangup/></Response>');
  async function contextFor(req){
    const body={...req.body};if(Object.values(body).some(v=>typeof v!=='string'))throw Error('Invalid form');
    const validation=await validator.validateHttp({signature:req.get('x-twilio-signature'),requestPath:req.originalUrl,params:body});
    if(body.AccountSid!==validation.accountSid||!/^CA[0-9a-f]{32}$/i.test(body.CallSid)||!isVoiceCaller(body.From)||!isPhoneNumber(body.To)||body.Direction!=='inbound')throw Error('Invalid binding');
    const tenant=await resolver.resolveByCalledNumber({To:body.To});
    const context={ownerId:tenant.ownerId,callSid:body.CallSid,accountSid:body.AccountSid,from:body.From,to:body.To};
    const call=query('SELECT * FROM calls WHERE ownerId=? AND callSid=?').get(context.ownerId,context.callSid);
    if(!call||call.accountSid!==context.accountSid||call.callerNumber!==context.from||call.destinationNumber!==context.to)throw Error('Call binding mismatch');
    return {context,call,body};
  }
  for(const partial of [false,true])app.post(CAPTURE_PATH+(partial?'/partial':''),parser,async(req,res)=>{
    let bound;try{bound=await contextFor(req);}catch{return res.sendStatus(403);}
    const {context,call,body}=bound;
    if(serviceEnded(context))return unavailable(res);
    if(isFinalVoiceCall(call.status))return res.type('text/xml').send('<Response><Hangup/></Response>');
    try{
      markFallback(context,call);
      const text=partial?body.UnstableSpeechResult:body.SpeechResult;
      if(typeof text==='string'&&text.trim())store.appendFallbackText({context,text});
      if(partial)return res.sendStatus(204);
      if(!text?.trim())return res.type('text/xml').send('<Response><Redirect method="POST">'+xml(publicBaseUrl+CAPTURE_PATH+'/again')+'</Redirect></Response>');
      // A received request is committed before returning Hangup. The owner's
      // number may forward right back here, so the backup cannot dial it.
      store.finishCall({context,status:'COMPLETED',reason:'FALLBACK_REQUEST_CAPTURED'});
      const savedVoice=query('SELECT voiceId FROM businessProfiles WHERE ownerId=?').get(context.ownerId)?.voiceId;
      const voice=call.failureCode==='VOICE_CALLER_THROTTLED'||!Object.hasOwn(TWILIO_BACKUP_VOICES,savedVoice)?null:TWILIO_BACKUP_VOICES[savedVoice];
      const words=call.failureCode==='VOICE_CALLER_THROTTLED'?'Thank you. The business will follow up.':BACKUP_THANK_YOU;
      return res.type('text/xml').send('<Response><Say'+(voice?' voice="'+xml(voice)+'"':'')+'>'+xml(words)+'</Say><Hangup/></Response>');
    }catch{return res.status(503).send('Request capture unavailable; retry this callback.');}
  });
  app.post(CAPTURE_PATH+'/again',parser,async(req,res)=>{
    try{const {call,context}=await contextFor(req);if(serviceEnded(context))return unavailable(res);if(isFinalVoiceCall(call.status))return res.type('text/xml').send('<Response><Hangup/></Response>');
      markFallback(context,call);
      const voiceId=query('SELECT voiceId FROM businessProfiles WHERE ownerId=?').get(context.ownerId)?.voiceId;
      const choice=captureChoice(publicBaseUrl,call.failureCode==='VOICE_CALLER_THROTTLED'?null:voiceId);
      if(call.failureCode==='VOICE_CALLER_THROTTLED')choice.message=THROTTLED_RETRY_MESSAGE;
      return res.type('text/xml').send('<Response><Gather input="speech" action="'+xml(choice.action)+'" method="POST" partialResultCallback="'+xml(choice.partial)+'" partialResultCallbackMethod="POST" actionOnEmptyResult="true" speechTimeout="auto"><Say'+(choice.voice?' voice="'+xml(choice.voice)+'"':'')+'>'+xml(choice.message)+'</Say></Gather></Response>');
    }catch{return res.sendStatus(403);}
  });
}
