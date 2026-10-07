import express from 'express';
import {transferDecision} from './voiceSettings.js';
import {isPhoneNumber} from './callerIdentity.js';
import {isFinalVoiceCall} from './voiceRecovery.js';
import {projectVoiceQuote} from './voiceQuotePresentation.js';
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const TRANSFER='/api/twilio/voice/transfer';

// Provider acknowledgements are kept separate from actual connection/delivery.
// Call/owner bindings come from the authenticated runtime, never model values.
export function createVoiceProviderAdapters({app,database,twilioClient,bookingService,validator,publicBaseUrl,clock,onTransferFailed}){
  const now=()=>new Date(clock()).toISOString();
  function callFor(ownerId,callSid){const call=database.prepare('SELECT * FROM calls WHERE ownerId=? AND callSid=?').get(ownerId,callSid);if(!call)throw Error('Call unavailable');return call;}
  const contextFor=call=>({ownerId:call.ownerId,callSid:call.callSid,accountSid:call.accountSid,from:call.callerNumber,to:call.destinationNumber});
  async function sendSms({ownerId,callSid,to,template,recordType,record,body:preparedBody,eventId,callbackToken}){
    const call=callFor(ownerId,callSid);if(!isPhoneNumber(to)||to!==call.callerNumber)throw Error('SMS contact unavailable');
    let body;
    if(typeof preparedBody==='string'&&eventId&&callbackToken)body=preparedBody;
    else if(template==='quote'&&recordType==='quote'){
      const saved=database.prepare('SELECT customerResponseJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(ownerId,record.requestId);
      if(!saved)throw Error('Quote unavailable');const quote=projectVoiceQuote(JSON.parse(saved.customerResponseJson),'x'.repeat(43));body=quote.voiceSummary+' '+(quote.writtenDisclosure||'');
    }else if(['booking','reminder'].includes(template)&&recordType==='appointment'){
      const row=database.prepare("SELECT * FROM appointments WHERE ownerId=? AND id=? AND status='CONFIRMED'").get(ownerId,record.appointmentId);
      if(!row||JSON.parse(row.customerJson||'{}').phone!==to)throw Error('Appointment unavailable');body='Your appointment is confirmed for '+row.startAtUtc+' ('+(row.timezone||'UTC')+').';
    }else if(template==='callback'&&['lead','quote_request'].includes(recordType)){
      const lead=database.prepare('SELECT id FROM leads WHERE ownerId=? AND id=? AND callId=?').get(ownerId,record.leadId,call.id);
      if(!lead)throw Error('Callback unavailable');body='Thank you for calling. The business will follow up about your request.';
    }else throw Error('SMS template does not match the saved record');
    if(!body||body.length>1600)throw Error('SMS exceeds provider limit; no partial quote sent');
    const statusCallback=eventId&&callbackToken?publicBaseUrl+'/api/voice/sms-status/'+encodeURIComponent(ownerId)+'/'+encodeURIComponent(eventId)+'/'+callbackToken:undefined;
    const sent=await twilioClient.messages.create({from:call.destinationNumber,to,body,...(statusCallback?{statusCallback}:{})});
    if(!/^SM[0-9a-f]{32}$/i.test(sent?.sid)||!['accepted','queued','sending','sent','delivered'].includes(sent.status))return {status:'FAILED'};
    // Queue acceptance is not sent/delivered evidence. The durable service
    // retains the provider receipt and reconciles its actual status.
    return {status:sent.status.toUpperCase(),id:sent.sid,messageSid:sent.sid};
  }
  async function transferCall({ownerId,callSid,destination,reason,notes,inquiryNumber,idempotencyKey}){
    const call=callFor(ownerId,callSid);if(isFinalVoiceCall(call.status)||!isPhoneNumber(destination)||destination===call.destinationNumber)throw Error('Transfer unavailable');
    const decision=transferDecision(database,ownerId,new Date(clock()));if(!decision.allowed||decision.destination!==destination)throw Error('Transfer unavailable outside owner windows.');
    const context=contextFor(call),at=now();
    database.transaction(()=>{
      const outbox=database.prepare("SELECT payloadJson FROM outboxEvents WHERE ownerId=? AND id=? AND eventType='voice.transfer_requested'").get(ownerId,idempotencyKey);
      if(!outbox)throw Error('Transfer receipt unavailable');
      database.prepare('UPDATE outboxEvents SET payloadJson=?,updatedAt=? WHERE ownerId=? AND id=?').run(JSON.stringify({...JSON.parse(outbox.payloadJson),destination,notes,inquiryNumber}),at,ownerId,idempotencyKey);
      database.prepare("UPDATE calls SET status='TRANSFERRING',updatedAt=? WHERE ownerId=? AND id=?").run(at,ownerId,call.id);
    }).immediate();
    const root=publicBaseUrl+TRANSFER+'/'+idempotencyKey;
    try{
      await twilioClient.calls(callSid).update({twiml:'<Response><Dial answerOnBridge="true" timeout="20" action="'+escape(root+'/result')+'" method="POST"><Number url="'+escape(root+'/accept')+'" method="POST">'+escape(destination)+'</Number></Dial></Response>'});
      return {status:'PENDING'};
    }catch(error){database.prepare("UPDATE calls SET status='CONNECTED',updatedAt=? WHERE ownerId=? AND id=? AND status='TRANSFERRING'").run(now(),ownerId,call.id);throw error;}
  }
  const parser=express.urlencoded({extended:false,limit:'16kb',parameterLimit:64});
  for(const stage of ['accept','result'])app.post(TRANSFER+'/:id/'+stage,parser,async(req,res)=>{
    let event,call,body;try{
      body={...req.body};const valid=await validator.validateHttp({signature:req.get('x-twilio-signature'),requestPath:req.originalUrl,params:body});
      // This is authenticated platform routing by a previously stored opaque
      // operation ID. All subsequent reads/writes remain tenant-scoped.
      event=database.prepare("SELECT * FROM outboxEvents WHERE id=? AND eventType='voice.transfer_requested'").get(req.params.id);
      if(!event)throw Error();const data=JSON.parse(event.payloadJson);call=callFor(event.ownerId,data.callSid);
      if(body.AccountSid!==valid.accountSid||body.AccountSid!==call.accountSid||
        (stage==='accept'?(body.ParentCallSid!==call.callSid||body.To!==data.destination):(body.CallSid!==call.callSid||body.To!==call.destinationNumber||body.From!==call.callerNumber)))throw Error();
    }catch{return res.sendStatus(403);}
    if(isFinalVoiceCall(call.status))return res.type('text/xml').send(stage==='accept'&&body.Digits==='1'&&event.status==='CONNECTED'?'<Response/>':'<Response><Hangup/></Response>');
    try{
      if(stage==='accept'){
        if(body.Digits==='1'){
          database.transaction(()=>{
            database.prepare("UPDATE outboxEvents SET status='CONNECTED',updatedAt=? WHERE ownerId=? AND id=?").run(now(),event.ownerId,event.id);
            database.prepare("UPDATE calls SET status='COMPLETED',outcome='TRANSFER_CONNECTED',completedAt=?,updatedAt=? WHERE ownerId=? AND id=?").run(now(),now(),call.ownerId,call.id);
          }).immediate();
          return res.type('text/xml').send('<Response/>');
        }
        if(body.Digits!==undefined)return res.type('text/xml').send('<Response><Hangup/></Response>');
        let transcript=[];try{transcript=JSON.parse(call.transcriptJson||'[]');}catch{}
        const summary=JSON.parse(event.payloadJson).notes||transcript.filter(t=>['user','caller'].includes(t.role)).map(t=>t.text).join(' ').slice(0,1000)||'A caller has requested to speak with you.';
        return res.type('text/xml').send('<Response><Gather input="dtmf" numDigits="1" timeout="8" action="'+escape(publicBaseUrl+req.path)+'" method="POST" actionOnEmptyResult="true"><Say>'+escape(summary)+' Press 1 to accept.</Say></Gather><Hangup/></Response>');
      }
      // A dial completion without the explicit accept receipt is unsuccessful,
      // even when voicemail answered or the provider reports "completed".
      database.prepare("UPDATE outboxEvents SET status='FAILED',updatedAt=? WHERE ownerId=? AND id=?").run(now(),event.ownerId,event.id);
      database.prepare("UPDATE calls SET status='CONNECTED',updatedAt=? WHERE ownerId=? AND id=? AND status='TRANSFERRING'").run(now(),call.ownerId,call.id);
      const data=JSON.parse(event.payloadJson);
      await onTransferFailed({context:contextFor(call),reason:data.reason,notes:data.notes,inquiryNumber:data.inquiryNumber});
      return res.type('text/xml').send('<Response><Redirect method="POST">'+escape(publicBaseUrl+'/api/twilio/voice/capture/again')+'</Redirect></Response>');
    }catch{return res.status(503).send('Transfer follow-up capture unavailable; retry.');}
  });
  return {sendSms,transferCall,modifyAppointment:input=>{
    if(typeof bookingService?.modifyAppointment!=='function')throw Error('Calendar changes unavailable');
    return bookingService.modifyAppointment(input);
  }};
}
