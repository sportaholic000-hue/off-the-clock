import {createHash} from 'node:crypto';
import {createBillingVoiceUsage} from './billingVoiceUsage.js';

const MIN_AGE=10*60_000,MAX_AGE=7*86400_000;
const sid=(value,prefix)=>new RegExp('^'+prefix+'[0-9a-f]{32}$','i').test(value||'');
const failure=code=>Object.assign(new Error(code),{code});

// Only GET is exposed. Recovery never redirects, terminates or creates a call.
export function createVoiceDurationRecovery({database,ownerQuery,env=process.env,fetchImpl=globalThis.fetch,clock=()=>new Date(),onUsage=()=>{},onError=()=>{}}){
  if(typeof ownerQuery!=='function')throw new TypeError('Duration recovery requires ownerQuery.');
  database.exec(`CREATE TABLE IF NOT EXISTS voiceDurationRecovery (
    callId TEXT PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
    ownerId TEXT NOT NULL REFERENCES users(id), attempts INTEGER NOT NULL DEFAULT 0,
    nextAttemptAt TEXT NOT NULL, lastError TEXT, gaveUpAt TEXT,
    recordDigest TEXT, fetchedStatus TEXT, confirmedAt TEXT
  ); CREATE INDEX IF NOT EXISTS voice_duration_recovery_due ON voiceDurationRecovery(ownerId,nextAttemptAt);`);
  const meter=createBillingVoiceUsage({database,ownerQuery,clock,onUsage});
  const accountSid=env.TWILIO_ACCOUNT_SID,username=env.TWILIO_API_KEY_SID||accountSid,password=env.TWILIO_API_KEY_SECRET||env.TWILIO_AUTH_TOKEN;
  const configured=sid(accountSid,'AC')&&Boolean(username&&password);
  const now=()=>new Date(clock()).getTime(),iso=t=>new Date(t).toISOString();
  async function readCall(call){
    if(call.accountSid!==accountSid||!sid(call.callSid,'CA'))throw failure('DURATION_BINDING_MISMATCH');
    const controller=new AbortController();let timer;
    try{return await Promise.race([
      (async()=>{
        const response=await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${call.callSid}.json`,{
          method:'GET',redirect:'error',signal:controller.signal,headers:{authorization:'Basic '+Buffer.from(username+':'+password).toString('base64')}
        });
        if(!response.ok)throw failure('DURATION_FETCH_FAILED');
        return await response.json();
      })(),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('DURATION_FETCH_TIMEOUT'));},10_000);})
    ]);}finally{clearTimeout(timer);controller.abort();}
  }
  async function processOwner(ownerId){
    if(!configured||stopped)return;
    // The AI leg can finish while fallback is live; only the call row ends the phone call.
    const rows=ownerQuery(`SELECT c.id,c.ownerId,c.accountSid,c.callSid,c.callerNumber,c.destinationNumber,
      c.completedAt endedAt
      FROM calls c LEFT JOIN billingVoiceUsage v ON v.ownerId=c.ownerId AND v.callId=c.id
      LEFT JOIN voiceDurationRecovery r ON r.ownerId=c.ownerId AND r.callId=c.id
      WHERE c.ownerId=? AND c.status IN ('COMPLETED','RECOVERED','FAILED','FALLBACK','AI_FALLBACK','HUMAN_ROUTING')
      AND c.completedAt<=? AND v.providerDigest IS NULL
      AND r.gaveUpAt IS NULL AND (r.nextAttemptAt IS NULL OR r.nextAttemptAt<=?)
      ORDER BY c.completedAt,c.id LIMIT 20`).all(ownerId,iso(now()-MIN_AGE),iso(now()));
    for(const call of rows){
      if(stopped)break;
      ownerQuery('INSERT OR IGNORE INTO voiceDurationRecovery(callId,ownerId,nextAttemptAt) VALUES(?,?,?)').run(call.id,ownerId,iso(now()));
      const state=ownerQuery('SELECT attempts,nextAttemptAt,gaveUpAt FROM voiceDurationRecovery WHERE ownerId=? AND callId=?').get(ownerId,call.id);
      if(now()>=Date.parse(call.endedAt)+MAX_AGE){
        ownerQuery("UPDATE voiceDurationRecovery SET gaveUpAt=?,lastError='DURATION_CONFIRMATION_EXPIRED' WHERE ownerId=? AND callId=? AND confirmedAt IS NULL").run(iso(now()),ownerId,call.id);continue;
      }
      const next=iso(now()+Math.min(86400_000,300_000*2**Math.min(state.attempts,9)));
      // Durable compare-and-set also prevents duplicate reads across workers.
      const claimed=ownerQuery(`UPDATE voiceDurationRecovery SET attempts=attempts+1,nextAttemptAt=?
        WHERE ownerId=? AND callId=? AND attempts=? AND nextAttemptAt<=? AND gaveUpAt IS NULL AND confirmedAt IS NULL`).run(next,ownerId,call.id,state.attempts,iso(now()));
      if(!claimed.changes)continue;
      try{
        const record=await readCall(call);
        if(record?.account_sid!==call.accountSid||record?.sid!==call.callSid||record?.from!==call.callerNumber||record?.to!==call.destinationNumber||record?.direction!=='inbound')throw failure('DURATION_BINDING_MISMATCH');
        if(record.status!=='completed'||typeof record.duration!=='string'||!/^\d+$/.test(record.duration)||!Number.isSafeInteger(Number(record.duration)))throw failure('DURATION_NOT_COMPLETED');
        if(now()>=Date.parse(call.endedAt)+MAX_AGE)throw failure('DURATION_CONFIRMATION_EXPIRED');
        const digest=createHash('sha256').update(JSON.stringify(record)).digest('hex');
        ownerQuery('UPDATE voiceDurationRecovery SET recordDigest=?,fetchedStatus=? WHERE ownerId=? AND callId=?').run(digest,record.status,ownerId,call.id);
        // Same canonical receipt and conflict checks as the signed callback.
        // The raw fetched-record digest is separate so a late callback matches.
        meter.providerComplete({AccountSid:record.account_sid,CallSid:record.sid,From:record.from,To:record.to,Direction:record.direction,CallStatus:record.status,CallDuration:record.duration},{ownerId});
        ownerQuery('UPDATE voiceDurationRecovery SET confirmedAt=?,lastError=NULL WHERE ownerId=? AND callId=?').run(iso(now()),ownerId,call.id);
      }catch(error){
        ownerQuery('UPDATE voiceDurationRecovery SET lastError=? WHERE ownerId=? AND callId=?').run(/^DURATION_[A-Z_]+$/.test(error.code||'')?error.code:'DURATION_CONFIRMATION_PENDING',ownerId,call.id);
        onError('DURATION_CONFIRMATION_PENDING');
      }
    }
  }
  let cursor='',running=null,stopped=false;
  async function tick(){
    if(stopped||!configured)return;if(running)return running;
    running=(async()=>{
      // Platform owner-ID inventory only; every call and retry record is owner-bound.
      let owners=ownerQuery("SELECT id ownerId FROM users WHERE role='owner' AND id>? ORDER BY id LIMIT 16").all(cursor);
      if(!owners.length){cursor='';owners=ownerQuery("SELECT id ownerId FROM users WHERE role='owner' AND id>? ORDER BY id LIMIT 16").all(cursor);}
      for(const {ownerId} of owners){if(stopped)break;try{await processOwner(ownerId);}catch{onError('DURATION_CONFIRMATION_PENDING');}finally{cursor=ownerId;}}
    })();try{await running;}finally{running=null;}
  }
  function start({setTimer=setInterval,clearTimer=clearInterval}={}){
    const run=()=>{if(!stopped)return tick().catch(()=>onError('DURATION_CONFIRMATION_PENDING'));};void run();const timer=setTimer(run,60_000);timer?.unref?.();
    return async()=>{stopped=true;clearTimer(timer);if(running)await running;};
  }
  return Object.freeze({configured,processOwner,tick,start});
}
