import '../../test/pricebookTestEnv.mjs';
import {fixture,secret,at} from '../../test/leadCaptureRepair20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../../server/src/voice/voiceToolRuntime.js';
import {validateVoiceToolCall} from '../../server/src/voice/toolSchemas.js';
const cleanup=[];const f=fixture({after:fn=>cleanup.push(fn)}),c=f.context();
f.db.prepare('UPDATE businessProfiles SET existingPhoneNumber=? WHERE ownerId=?').run('+19025550199',c.ownerId);
f.db.prepare('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'caller',text:'[SYNTHETIC] Please have the owner call after five about the loose gate.'}]),c.ownerId,c.callSid);
let transferAttempts=0;const runtime=createVoiceToolRuntime({database:f.db,callContext:c,handleSecret:secret,clock:()=>new Date(at),providers:{transferCall:async()=>{transferAttempts++;throw Error('SYNTHETIC_NO_ANSWER');}}});
let schema;try{validateVoiceToolCall('transferCall',{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] Call after five.'});schema='accepted';}catch(error){schema=error.code;}
const transfer=await runtime.handlers.transferCall({context:c,args:{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] Call after five.'}});
const callbacksBefore=f.db.prepare('SELECT COUNT(*) AS n FROM leads WHERE ownerId=? AND callId=?').get(c.ownerId,c.callSid).n;
await runtime.handlers.captureLead({context:c,args:{notes:'[SYNTHETIC] Ordinary inquiry.'}});
f.db.prepare("INSERT INTO quotes(id,ownerId,callId,serviceType,resultJson,status,createdAt) VALUES('synthetic-alert-quote',?,?,'CUSTOM','{}','INSTANT',?)").run(c.ownerId,c.callSid,at);
let deliveries=0;const webhook=f.webhook({enabled:()=>true,deliver:async()=>{deliveries++;return 204;}});await webhook.dispatchOnce();
const alertTable=f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ownerAlerts'").get();
console.log(JSON.stringify({startingSha:'53d6833867dcff42a6ba652e74d26364f4fa1ff1',schema,transfer,transferAttempts,callbackLeads:callbacksBefore,ownerCallLeadCount:f.service.detail({ownerId:c.ownerId,id:c.callSid}).leads.length,ownerAlertTable:!!alertTable,fakeOwnerAlertDeliveries:deliveries,outbox:f.db.prepare('SELECT eventType,status FROM outboxEvents WHERE ownerId=?').all(c.ownerId)},null,2));
for(const fn of cleanup.reverse())fn();
