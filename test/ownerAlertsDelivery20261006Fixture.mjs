import {fixture,secret,at} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {createVoiceSmsService} from '../server/src/voiceSmsService.js';
export function smsFixture(t,options={}){
  const f=fixture(t,options.filename);let now=Date.parse(at),sends=0;
  const provider=options.provider||{send:async()=>({status:'SENT',id:'SM'+(++sends).toString(16).padStart(32,'0')})};
  const makeService=()=>createVoiceSmsService({database:f.db,ownerQuery:f.ownerQuery,provider,clock:()=>now,providerTimeoutMs:options.timeout||100});
  let service=makeService();const c=f.context();
  function voice(context=c){const runtime=createVoiceToolRuntime({database:f.db,callContext:context,handleSecret:secret,clock:()=>new Date(now),providers:{smsDelivery:service}});return createVoiceToolDispatcher({handlers:runtime.handlers,callContext:context,idempotencyStore:runtime.idempotencyStore}).dispatch;}
  const tool=(name,args,id='synthetic-tool-'+Math.random())=>voice()({name,args,toolCallId:id});
  const rows=()=>f.db.prepare('SELECT * FROM voiceSmsDeliveries WHERE ownerId=? ORDER BY rowid').all(c.ownerId);
  return {...f,c,tool,voice,rows,provider,smsService:()=>service,advance:ms=>{now+=ms;},restart:()=>{service=makeService();},sends:()=>sends};
}
