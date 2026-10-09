import {usageOwnerQuery} from '../billingUsagePolicy.js';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {createVoiceToolIdempotencyStore} from './voicePersistence.js';
import {isFinalVoiceCall} from './voiceRecovery.js';

// Reuse the durable receipt interface, encrypting TwiML so a replayable media
// nonce is never stored as plaintext. Nonce authentication still remains one-use.
export function createVoiceInboundReceipt({database,secret,clock}){
  const key=createHash('sha256').update('voice-inbound-v1\0').update(secret).digest();
  const store=createVoiceToolIdempotencyStore({database,clock});
  return async({context,build})=>{
    const binding=JSON.stringify(context),scope=createHash('sha256').update('inbound\0'+context.ownerId+'\0'+context.callSid).digest('hex');
    const existing=usageOwnerQuery(database)('SELECT * FROM calls WHERE ownerId=? AND callSid=?').get(context.ownerId,context.callSid);
    if(existing&&(existing.accountSid!==context.accountSid||existing.callerNumber!==context.from||existing.destinationNumber!==context.to))throw Error('Call binding mismatch');
    if(isFinalVoiceCall(existing?.status))return '<Response><Hangup/></Response>';
    const result=await store.run({ownerId:context.ownerId,scope,key:'inbound',digest:createHash('sha256').update(binding).digest('hex'),execute:async()=>{
      const xml=await build(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(binding));
      return {iv:iv.toString('base64'),body:Buffer.concat([cipher.update(xml,'utf8'),cipher.final()]).toString('base64'),tag:cipher.getAuthTag().toString('base64')};
    }});
    if(!result.value)throw Error('Call receipt unavailable');
    const {iv,body,tag}=result.value,decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64'));decipher.setAAD(Buffer.from(binding));decipher.setAuthTag(Buffer.from(tag,'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body,'base64')),decipher.final()]).toString('utf8');
  };
}
