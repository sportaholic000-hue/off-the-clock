import {usageOwnerQuery} from '../billingUsagePolicy.js';
import {createHash} from 'node:crypto';
import {saveVoiceInquiry} from '../leadCaptureRepair20261006.js';
import {callerIdentity} from './callerIdentity.js';

export const isFinalVoiceCall=status=>['COMPLETED','RECOVERED'].includes(status);
const digest=value=>createHash('sha256').update(value).digest('hex');
// Called inside the session store's transaction. Retain ALL received words;
// callbackRequests' short note limit must not truncate the durable inquiry.
export function preserveVoiceRequest({database,context,call,reason,at,requestWords}){
  let transcript=[];try{transcript=JSON.parse(call.transcriptJson||'[]');}catch{}
  const turns=usageOwnerQuery(database)('SELECT role,text FROM transcriptTurns WHERE ownerId=? AND callId=? ORDER BY sequence,id').all(context.ownerId,call.id);
  let words=[...turns,...(Array.isArray(transcript)?transcript:[])].filter(t=>['user','caller'].includes(t?.role)&&typeof t.text==='string').map(t=>t.text).join('\n');
  for(const row of usageOwnerQuery(database)("SELECT payloadJson FROM outboxEvents WHERE ownerId=? AND eventType='voice.transfer_requested' AND json_extract(payloadJson,'$.callSid')=? ORDER BY createdAt,id").all(context.ownerId,context.callSid)){
    const note=JSON.parse(row.payloadJson).notes;if(note&&!words.includes(note))words+=(words?'\n':'')+note;
  }
  if(requestWords)words+=(words?'\n':'')+requestWords;
  const key='lifecycle-recovery';
  // A later transport callback with no text must not erase words captured by
  // a tool before the transport failed.
  let prior=usageOwnerQuery(database)("SELECT id,collectedInputsJson FROM leads WHERE ownerId=? AND callId=? AND json_valid(collectedInputsJson) AND json_extract(collectedInputsJson,'$.inquiryKey')=?").get(context.ownerId,call.id,key);
  if(!prior){const candidates=usageOwnerQuery(database)("SELECT id,collectedInputsJson FROM leads WHERE ownerId=? AND callId=? AND json_valid(collectedInputsJson) AND json_extract(collectedInputsJson,'$.voiceVersion')=1").all(context.ownerId,call.id);if(candidates.length===1)prior=candidates[0];}
  let priorWords;try{priorWords=JSON.parse(prior?.collectedInputsJson||'{}').notes;}catch{}
  if(priorWords&&!words.includes(priorWords))words=priorWords+(words?'\n'+words:'');
  const saved=saveVoiceInquiry({database,context,callId:call.id,key,leadId:prior?.id,
    customerId:'voice-'+digest(context.ownerId+'\0'+callerIdentity(context)),
    updates:{description:words||'Call interrupted before a request was received',notes:words||null},
    createdAt:at,type:'AI_FALLBACK',status:'CAPTURED'});
  usageOwnerQuery(database)(`INSERT OR IGNORE INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt)
    VALUES(?,?,'voice.recovery_requested',?,?,'PENDING',?,?)`).run('voice-recovery-'+digest(context.ownerId+'\0'+context.callSid),context.ownerId,saved.row.id,JSON.stringify({callSid:context.callSid,leadId:saved.row.id,reason}),at,at);
  return saved.row.id;
}
