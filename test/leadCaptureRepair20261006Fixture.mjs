import Database from 'better-sqlite3';
import {migrateDatabase} from '../server/src/migrations.js';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {createOwnerCallService} from '../server/src/ownerCallService.js';
import {createOutboundWebhookService} from '../server/src/outboundWebhookService.js';

export const at='2026-10-06T12:00:00.000Z',secret='SYNTHETIC_CAPTURE_REPAIR_KEY_NEVER_LIVE'.padEnd(64,'x');
export const address={line1:'[SYNTHETIC] 10 Test Street',city:'Synthetic City',region:'NS',postalCode:'B3H 1A1',country:'CA'};
export function fixture(t,filename=':memory:'){
  const db=new Database(filename);db.pragma('foreign_keys=ON');migrateDatabase(db);t.after(()=>{if(db.open)db.close();});
  for(const id of ['synthetic-a','synthetic-b']){
    db.prepare("INSERT OR IGNORE INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'[SYNTHETIC]','Synthetic','Synthetic Repairs','QuoteDone','active','UTC','owner',?)").run(id,id+'@example.invalid',at);
    db.prepare('INSERT OR IGNORE INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(id,'cus_SYNTHETIC_'+id,at,at,at);
    db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(id);
    db.prepare("INSERT OR IGNORE INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)").run(id,at);
  }
  db.prepare("INSERT OR IGNORE INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES('synthetic-staff','synthetic-a','staff@example.invalid','[SYNTHETIC]','Synthetic','Synthetic','Operator','active','UTC','staff',?)").run(at);
  let serial=1,now=Date.parse(at);const ownerQuery=sql=>{if(!/\bownerId\b/.test(sql))throw Error('Unscoped tenant query');return db.prepare(sql);};
  function context(ownerId='synthetic-a'){
    const c={ownerId,callSid:'CA'+(serial++).toString(16).padStart(32,'0'),accountSid:'AC'+'a'.repeat(32),from:'+19025550100',to:'+19025550101'};
    db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,transcriptJson,createdAt) VALUES(?,?,?,?,?,?,'CONNECTED','[]',?)").run(c.callSid,c.ownerId,c.callSid,c.accountSid,c.from,c.to,at);return c;
  }
  function voice(c){const runtime=createVoiceToolRuntime({database:db,callContext:c,handleSecret:secret,clock:()=>new Date(now)});
    const dispatch=createVoiceToolDispatcher({handlers:runtime.handlers,callContext:c,idempotencyStore:runtime.idempotencyStore}).dispatch;
    return {runtime,tool:(name,args,key='synthetic-event-'+serial++)=>dispatch({name,args,toolCallId:key})};}
  function lead(c){return db.prepare('SELECT * FROM leads WHERE ownerId=? AND callId=? ORDER BY rowid').all(c.ownerId,c.callSid);}
  function webhook(){return createOutboundWebhookService({database:db,ownerQuery,encryptionOptions:{key:'37'.repeat(32)},
    resolveDestination:async url=>({url:new URL(url)}),deliver:async()=>204,enabled:()=>false});}
  return {db,ownerQuery,context,voice,lead,webhook,service:createOwnerCallService({ownerQuery}),advance:ms=>{now+=ms;}};
}
