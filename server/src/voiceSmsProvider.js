import twilio from 'twilio';
import express from 'express';
import {createTwilioRequestValidator} from './voice/twilioValidation.js';
const E164=/^\+[1-9]\d{7,14}$/;
const origin=environment=>{try{const u=new URL(environment.PUBLIC_BASE_URL);return u.protocol==='https:'&&u.pathname==='/'&&!u.username&&!u.password&&!u.search&&!u.hash?u.origin:null;}catch{return null;}};
export function createVoiceSmsProvider({database,ownerQuery=sql=>database.prepare(sql),environment=process.env,fetchImplementation=fetch}={}){
  const configured=()=>environment.ALLOW_PROVIDER_WRITES==='true'&&environment.SMS_DELIVERY_ENABLED==='true'&&environment.TWILIO_SMS_REGISTRATION_APPROVED==='true'&&/^AC[0-9a-f]{32}$/i.test(environment.TWILIO_ACCOUNT_SID||'')&&Boolean(environment.TWILIO_AUTH_TOKEN)&&Boolean(origin(environment));
  return {
    ready(request,ownerId){
      if(!configured()||request.accountSid!==environment.TWILIO_ACCOUNT_SID||!E164.test(request.to)||!E164.test(request.from))return false;
      const profile=ownerQuery('SELECT twilioNumber,phoneProvisioningStatus FROM businessProfiles WHERE ownerId=?').get(ownerId);
      return profile?.phoneProvisioningStatus==='provisioned'&&profile.twilioNumber===request.from;
    },
    async send(request,{signal}={}){
      // Reject before network if configuration or the owner's sender changed.
      if(!this.ready(request,request.ownerId))throw Object.assign(Error('SMS unavailable'),{definitive:true});
      const statusCallback=origin(environment)+'/api/voice/sms-status/'+encodeURIComponent(request.ownerId)+'/'+encodeURIComponent(request.eventId)+'/'+request.callbackToken;
      const response=await fetchImplementation('https://api.twilio.com/2010-04-01/Accounts/'+environment.TWILIO_ACCOUNT_SID+'/Messages.json',{
        method:'POST',redirect:'error',signal,headers:{authorization:'Basic '+Buffer.from(environment.TWILIO_ACCOUNT_SID+':'+environment.TWILIO_AUTH_TOKEN).toString('base64'),'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({To:request.to,From:request.from,Body:request.body,StatusCallback:statusCallback})});
      let result;try{result=await response.json();}catch{throw Error('SMS outcome unknown');}
      if(!response.ok){const opted=result?.code===21610;throw Object.assign(Error('SMS provider rejected request'),{definitive:response.status>=400&&response.status<500&&response.status!==408,code:opted?'SMS_RECIPIENT_OPTED_OUT':'SMS_REJECTED'});}
      if(!/^SM[0-9a-f]{32}$/i.test(result?.sid||'')||result.to!==request.to||result.from!==request.from||result.account_sid!==request.accountSid)throw Error('SMS receipt unknown');
      return {id:result.sid,status:result.status};
    },
    async lookup(request,{signal}={}){
      if(!configured()||request.accountSid!==environment.TWILIO_ACCOUNT_SID||!/^SM[0-9a-f]{32}$/i.test(request.id||''))throw Error('SMS lookup unavailable');
      const response=await fetchImplementation('https://api.twilio.com/2010-04-01/Accounts/'+request.accountSid+'/Messages/'+request.id+'.json',{
        method:'GET',redirect:'error',signal,headers:{authorization:'Basic '+Buffer.from(environment.TWILIO_ACCOUNT_SID+':'+environment.TWILIO_AUTH_TOKEN).toString('base64')}});
      const result=await response.json();
      if(!response.ok||result.sid!==request.id||result.account_sid!==request.accountSid||result.to!==request.to||result.from!==request.from)throw Error('SMS lookup binding failed');
      return {id:result.sid,status:result.status};
    }
  };
}
export function installVoiceSmsStatusRoute(app,{service,environment=process.env,asyncHandler}){
  let validator;try{validator=createTwilioRequestValidator({validateRequest:twilio.validateRequest,authToken:environment.TWILIO_AUTH_TOKEN,publicBaseUrl:environment.PUBLIC_BASE_URL,allowedAccountSids:[environment.TWILIO_ACCOUNT_SID]});}catch{}
  app.post('/api/voice/sms-status/:ownerId/:id/:token',express.urlencoded({extended:false,limit:'16kb'}),asyncHandler(async(req,res)=>{
    if(!validator)return res.status(503).json({error:'SMS status unavailable'});
    // Express's simple form parser creates a null-prototype object. Validate all
    // fields, then normalize for the existing official-SDK signature boundary.
    if(!req.is('application/x-www-form-urlencoded')||!req.body||Array.isArray(req.body)||Object.keys(req.body).some(key=>['__proto__','prototype','constructor'].includes(key)||typeof req.body[key]!=='string'))return res.status(400).json({error:'Invalid SMS receipt form'});
    const params=Object.fromEntries(Object.entries(req.body));
    await validator.validateHttp({signature:req.get('x-twilio-signature'),requestPath:req.originalUrl,params});
    service.receiveStatus({ownerId:req.params.ownerId,id:req.params.id,token:req.params.token,accountSid:params.AccountSid,to:params.To,from:params.From,providerId:params.MessageSid,status:params.MessageStatus,errorCode:params.ErrorCode});
    res.status(204).end();
  }));
}
