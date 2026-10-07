import express from 'express';
import {isVoiceCaller,isPhoneNumber} from './callerIdentity.js';
import {isFinalVoiceCall} from './voiceRecovery.js';
export const CAPTURE_PATH='/api/twilio/voice/capture';
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function captureChoice(base){return {mode:'capture',action:base+CAPTURE_PATH,partial:base+CAPTURE_PATH+'/partial',message:'Sorry, I could not finish helping you. Please tell me what you need, your name, and the best number to reach you. The business will follow up.'};}
export function installVoiceFallbackRoutes({app,validator,resolver,database,store,publicBaseUrl,clock=()=>new Date()}){
  const parser=express.urlencoded({extended:false,limit:'32kb',parameterLimit:64});
  const serviceEnded=context=>{
    const account=database.prepare("SELECT serviceEndsAt FROM users WHERE id=? AND role='owner'").get(context.ownerId);
    return account?.serviceEndsAt&&Date.parse(account.serviceEndsAt)<=new Date(clock()).getTime();
  };
  const unavailable=res=>res.type('text/xml').send('<Response><Say>This business is currently unavailable.</Say><Hangup/></Response>');
  async function contextFor(req){
    const body={...req.body};if(Object.values(body).some(v=>typeof v!=='string'))throw Error('Invalid form');
    const validation=await validator.validateHttp({signature:req.get('x-twilio-signature'),requestPath:req.originalUrl,params:body});
    if(body.AccountSid!==validation.accountSid||!/^CA[0-9a-f]{32}$/i.test(body.CallSid)||!isVoiceCaller(body.From)||!isPhoneNumber(body.To)||body.Direction!=='inbound')throw Error('Invalid binding');
    const tenant=await resolver.resolveByCalledNumber({To:body.To});
    const context={ownerId:tenant.ownerId,callSid:body.CallSid,accountSid:body.AccountSid,from:body.From,to:body.To};
    const call=database.prepare('SELECT * FROM calls WHERE ownerId=? AND callSid=?').get(context.ownerId,context.callSid);
    if(!call||call.accountSid!==context.accountSid||call.callerNumber!==context.from||call.destinationNumber!==context.to)throw Error('Call binding mismatch');
    return {context,call,body};
  }
  for(const partial of [false,true])app.post(CAPTURE_PATH+(partial?'/partial':''),parser,async(req,res)=>{
    let bound;try{bound=await contextFor(req);}catch{return res.sendStatus(403);}
    const {context,call,body}=bound;
    if(serviceEnded(context))return unavailable(res);
    if(isFinalVoiceCall(call.status))return res.type('text/xml').send('<Response><Hangup/></Response>');
    try{
      const text=partial?body.UnstableSpeechResult:body.SpeechResult;
      if(typeof text==='string'&&text.trim())store.appendFallbackText({context,text});
      if(partial)return res.sendStatus(204);
      if(!text?.trim())return res.type('text/xml').send('<Response><Redirect method="POST">'+xml(publicBaseUrl+CAPTURE_PATH+'/again')+'</Redirect></Response>');
      // A received request is committed before returning any Dial or Hangup.
      const number=database.prepare('SELECT existingPhoneNumber FROM businessProfiles WHERE ownerId=?').get(context.ownerId)?.existingPhoneNumber;
      store.finishCall({context,status:'COMPLETED',reason:'FALLBACK_REQUEST_CAPTURED'});
      const dial=call.failureCode!=='VOICE_CALLER_THROTTLED'&&isPhoneNumber(number)&&number!==context.to?'<Dial answerOnBridge="true" timeout="20"><Number>'+xml(number)+'</Number></Dial>':'';
      return res.type('text/xml').send('<Response><Say>Thank you. The business will follow up.</Say>'+dial+'<Hangup/></Response>');
    }catch{return res.status(503).send('Request capture unavailable; retry this callback.');}
  });
  app.post(CAPTURE_PATH+'/again',parser,async(req,res)=>{
    try{const {call,context}=await contextFor(req);if(serviceEnded(context))return unavailable(res);if(isFinalVoiceCall(call.status))return res.type('text/xml').send('<Response><Hangup/></Response>');
      const choice=captureChoice(publicBaseUrl);return res.type('text/xml').send('<Response><Gather input="speech" action="'+xml(choice.action)+'" method="POST" partialResultCallback="'+xml(choice.partial)+'" partialResultCallbackMethod="POST" actionOnEmptyResult="true" speechTimeout="auto"><Say>'+xml(choice.message)+'</Say></Gather></Response>');
    }catch{return res.sendStatus(403);}
  });
}
