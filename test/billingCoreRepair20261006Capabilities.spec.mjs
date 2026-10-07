import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness} from './billingCoreRepair20261006.helpers.mjs';
import {provisionTwilioNumber} from '../server/src/platformIntegrations.js';
// No refunds or overage charges are implemented here. Expected provider debit $0.
test('billing capability boundary: refund event is unsupported, unchanged account; cancellation logs but no offboarding or notification delivery',()=>{
 const h=harness();try{h.service.applyVerifiedStripeEvent(h.sub('evt_active'));
 const before=h.get();assert.throws(()=>h.service.applyVerifiedStripeEvent({id:'evt_refund',type:'charge.refunded',created:1791288000,data:{object:{id:'ch_SYNTHETIC',customer:'cus_A',amount_refunded:11900}}}));assert.deepEqual(h.get(),before);
 const canceled=h.sub('evt_cancel',1,{status:'canceled'});canceled.type='customer.subscription.deleted';h.service.applyVerifiedStripeEvent(canceled);assert.equal(h.get().planStatus,'canceled');
 const outbox=h.db.prepare("SELECT status FROM outboxEvents WHERE ownerId=? AND eventType='billing.state_changed'").all('SYNTHETIC-A');assert.ok(outbox.length);assert.ok(outbox.every(row=>row.status==='PENDING'));
 }finally{h.db.close();}
});
test('F10: existing number purchase request attaches signed duration callback; fake HTTP only',async()=>{
 const names=['TWILIO_ACCOUNT_SID','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','PUBLIC_BASE_URL'];const old=Object.fromEntries(names.map(k=>[k,process.env[k]]));const fetchOriginal=globalThis.fetch;
 Object.assign(process.env,{TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_API_KEY_SID:'SK_SYNTHETIC',TWILIO_API_KEY_SECRET:'SYNTHETIC',PUBLIC_BASE_URL:'https://voice.example.invalid'});let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.match(String(url),/IncomingPhoneNumbers.json$/);const params=new URLSearchParams(options.body);assert.equal(params.get('StatusCallback'),'https://voice.example.invalid/api/twilio/voice/status');assert.equal(params.get('StatusCallbackMethod'),'POST');assert.equal(params.get('VoiceUrl'),'https://voice.example.invalid/api/twilio/voice/incoming');return {ok:true,json:async()=>({sid:'PN_SYNTHETIC',phone_number:'+19025550101'})};};
 try{await provisionTwilioNumber({existingNumber:'+19025550100',candidateNumber:'+19025550101',operationId:'00000000-0000-4000-8000-000000000010'});assert.equal(calls,1);}finally{globalThis.fetch=fetchOriginal;for(const k of names)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
});
