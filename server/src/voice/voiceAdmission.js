import {createHash,randomUUID} from 'node:crypto';
import {customerPhone,customerQuery} from '../customerIdentityService.js';

const integer=(env,key,fallback,max)=>{
  const n=env[key]===undefined||env[key]===''?fallback:Number(env[key]);
  if(!Number.isSafeInteger(n)||n<1||n>max)throw new TypeError(`${key} must be an integer from 1 to ${max}.`);
  return n;
};
export function voiceAdmissionConfig(env={}){
  return Object.freeze({
    maxConcurrent:integer(env,'VOICE_MAX_CONCURRENT',100,100000),
    maxOwnerConcurrent:integer(env,'VOICE_MAX_CONCURRENT_PER_OWNER',5,1000),
    callerDailyLimit:integer(env,'VOICE_CALLER_DAILY_LIMIT',6,1000),
    failureThreshold:integer(env,'VOICE_BREAKER_FAILURE_THRESHOLD',3,1000),
    failureWindowMs:integer(env,'VOICE_BREAKER_WINDOW_SECONDS',60,3600)*1000,
    cooldownMs:integer(env,'VOICE_BREAKER_COOLDOWN_SECONDS',30,3600)*1000,
  });
}
function atomic(db,work){
  db.exec('BEGIN IMMEDIATE');
  try{const result=work();db.exec('COMMIT');return result;}
  catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
// Platform metrics: these count reservations across the single shared SQLite
// database. Tenant identity/contact queries below always use ownerQuery.
export const activeVoicePredicate=`(c.status IN ('CONNECTED','TRANSFERRING') OR
  (c.status='CONNECTING' AND EXISTS(SELECT 1 FROM voiceSessionNonces n
    WHERE n.ownerId=c.ownerId AND n.callSid=c.callSid AND n.expiresAtUtc>?)))`;
export function createVoiceAdmission({database:db,env={},clock=()=>new Date()}){
  const config=voiceAdmissionConfig(env),query=customerQuery(db);
  const time=()=>new Date(clock()).getTime(),iso=t=>new Date(t).toISOString();
  const state=()=>db.prepare('SELECT * FROM voiceCircuitState WHERE id=1').get();
  db.prepare('INSERT OR IGNORE INTO voiceCircuitState(id,openUntil,probeUntil) VALUES(1,0,0)').run();
  function alert(key,code,details,t){
    db.prepare(`INSERT INTO voicePlatformAlerts(eventKey,code,detailsJson,createdAt,updatedAt)
      VALUES(?,?,?,?,?) ON CONFLICT(eventKey) DO UPDATE SET detailsJson=excluded.detailsJson,
      updatedAt=excluded.updatedAt,resolvedAt=NULL`).run(key,code,JSON.stringify(details),iso(t),iso(t));
  }
  function blocked(context){const phone=customerPhone(context.from);return !!phone&&!!query('SELECT 1 FROM callerBlocklist WHERE ownerId=? AND phoneNumber=?').get(context.ownerId,phone);}
  function checkCaller({context}){return {allowed:!blocked(context),reason:'VOICE_SPAM_BLOCKED'};}
  function circuitReason(context,t,{reserve=false}={}){
    const s=state();if(!s.openUntil)return null;
    if(s.openUntil>t)return 'VOICE_CIRCUIT_OPEN';
    if(s.probeCallSid===context.callSid&&s.probeUntil>t)return null;
    if(!reserve||s.probeUntil>t)return 'VOICE_CIRCUIT_OPEN';
    // One half-open probe across processes; an unused nonce/probe expires.
    db.prepare('UPDATE voiceCircuitState SET probeCallSid=?,probeUntil=? WHERE id=1').run(context.callSid,t+60000);
    return null;
  }
  // Invoked inside createSession's BEGIN IMMEDIATE, before its call insert.
  function reserve(context){
    const t=time(),at=iso(t),phone=customerPhone(context.from);
    if(blocked(context))return 'VOICE_SPAM_BLOCKED';
    if(phone){
      const recent=query(`SELECT COUNT(*) n FROM calls c WHERE c.ownerId=? AND customer_phone(c.callerNumber)=?
        AND c.spamFiltered=0 AND (c.voiceAnsweredAt>? OR (c.voiceAnsweredAt IS NULL AND c.duration>0 AND c.createdAt>?
          AND COALESCE(c.outcome,'')<>'AI_FALLBACK' AND COALESCE(c.status,'') NOT IN ('FALLBACK','AI_FALLBACK'))
          OR (c.status='CONNECTING' AND c.createdAt>? AND EXISTS(SELECT 1 FROM voiceSessionNonces n
            WHERE n.ownerId=c.ownerId AND n.callSid=c.callSid AND n.expiresAtUtc>?)))`).get(context.ownerId,phone,iso(t-86400000),iso(t-86400000),iso(t-86400000),at).n;
      if(recent>=config.callerDailyLimit)return 'VOICE_CALLER_THROTTLED';
    }
    const active=db.prepare('SELECT COUNT(*) n FROM calls c WHERE '+activeVoicePredicate).get(at).n;
    if(active>=config.maxConcurrent){alert('capacity','VOICE_PLATFORM_CAPACITY',{active,limit:config.maxConcurrent},t);return 'VOICE_PLATFORM_CAPACITY';}
    const reason=circuitReason(context,t,{reserve:true});if(reason)return reason;
    if(active+1>=Math.ceil(config.maxConcurrent*0.8))alert('capacity','VOICE_PLATFORM_CAPACITY',{active:active+1,limit:config.maxConcurrent},t);
    else db.prepare("UPDATE voicePlatformAlerts SET resolvedAt=? WHERE eventKey='capacity' AND resolvedAt IS NULL").run(at);
    return null;
  }
  function beforeOpen(context){return atomic(db,()=>blocked(context)?'VOICE_SPAM_BLOCKED':circuitReason(context,time()));}
  function connected(context){atomic(db,()=>{
    const t=time();query('UPDATE calls SET voiceAnsweredAt=COALESCE(voiceAnsweredAt,?) WHERE ownerId=? AND callSid=?').run(iso(t),context.ownerId,context.callSid);
    if(state().probeCallSid===context.callSid){
      db.prepare('UPDATE voiceCircuitState SET openUntil=0,probeCallSid=NULL,probeUntil=0 WHERE id=1').run();
      db.prepare('DELETE FROM voiceModelFailures').run();
      db.prepare("UPDATE voicePlatformAlerts SET resolvedAt=?,updatedAt=? WHERE eventKey='circuit'").run(iso(t),iso(t));
    }
  });}
  function failed(context){atomic(db,()=>{
    const t=time(),key=createHash('sha256').update(context.callSid).digest('hex');
    db.prepare('DELETE FROM voiceModelFailures WHERE failedAt<=?').run(t-config.failureWindowMs);
    if(!db.prepare('INSERT OR IGNORE INTO voiceModelFailures(callKey,failedAt) VALUES(?,?)').run(key,t).changes)return;
    const s=state(),failures=db.prepare('SELECT COUNT(*) n FROM voiceModelFailures').get().n;
    if(s.openUntil>t&&s.probeCallSid!==context.callSid)return;
    if(failures>=config.failureThreshold||s.probeCallSid===context.callSid){
      db.prepare('UPDATE voiceCircuitState SET openUntil=?,probeCallSid=NULL,probeUntil=0 WHERE id=1').run(t+config.cooldownMs);
      alert('circuit','VOICE_CIRCUIT_OPEN',{failures,retryAt:iso(t+config.cooldownMs)},t);
    }
  });}
  // Called in the same transaction as the fallback record. The ordinary email
  // outbox delivers the owner notice; no text provider is involved.
  function fallback(context,callId,reason){
    if(reason!=='VOICE_CALLER_THROTTLED')return;
    const t=time(),key='voice.caller_throttled:'+createHash('sha256').update(context.ownerId+'\0'+context.from).digest('hex')+':'+Math.floor(t/86400000);
    query(`INSERT OR IGNORE INTO ownerAlerts(id,ownerId,eventKey,eventType,aggregateId,callId,createdAt,updatedAt)
      VALUES(?,?,?,'voice.caller_throttled',?,?,?,?)`).run(randomUUID(),context.ownerId,key,callId,callId,iso(t),iso(t));
    alert(key,'VOICE_CALLER_THROTTLED',{ownerId:context.ownerId,callId},t);
  }
  return {config,checkCaller,reserve,beforeOpen,connected,failed,fallback};
}

export function voiceAdmissionStatus(database){
  return {circuit:database.prepare('SELECT openUntil,probeUntil FROM voiceCircuitState WHERE id=1').get()||null,
    alerts:database.prepare('SELECT code,detailsJson,createdAt,updatedAt,resolvedAt FROM voicePlatformAlerts ORDER BY updatedAt DESC,eventKey LIMIT 50').all().map(({detailsJson,...row})=>({...row,details:JSON.parse(detailsJson)}))};
}
