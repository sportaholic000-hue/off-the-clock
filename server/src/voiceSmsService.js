import {randomUUID,randomBytes} from 'node:crypto';
import {storedObject} from './ownerRecordViews.js';
export const SMS_RETRY_MS=Object.freeze([1000,5000,30000,60000]);
const problem=(code,statusCode=400)=>Object.assign(Error('Text delivery cannot be completed safely.'),{code,statusCode});
const parse=v=>storedObject(v);

// No native Messages-create idempotency is assumed. An expired send lease or a
// possibly accepted timeout is UNKNOWN, never an automatic second POST.
export function createVoiceSmsService({database,ownerQuery=sql=>database.prepare(sql),provider={},clock=Date.now,providerTimeoutMs=5000}={}){
  if(!Number.isSafeInteger(providerTimeoutMs)||providerTimeoutMs<1||providerTimeoutMs>10000)throw TypeError('Invalid SMS timeout');
  const q=sql=>{if(!/\bownerId\b/.test(sql))throw Error('SMS tenant binding required');return ownerQuery(sql);};
  const iso=()=>new Date(clock()).toISOString();
  const row=(ownerId,id)=>q('SELECT * FROM voiceSmsDeliveries WHERE ownerId=? AND id=?').get(ownerId,id);
  function enqueue({ownerId,id,callSid,recordType,recordId,request}){
    return database.transaction(()=>{
      const existing=row(ownerId,id);if(existing)return existing;
      const call=q('SELECT accountSid,callerNumber,destinationNumber FROM calls WHERE ownerId=? AND callSid=?').get(ownerId,callSid);
      if(!call||request.to!==call.callerNumber||request.from!==call.destinationNumber||request.accountSid!==call.accountSid)throw problem('SMS_CALL_BINDING',409);
      const time=iso();
      q("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES(?,?,'voice.sms_requested',?,?,'PENDING',?,?)").run(id,ownerId,recordId,JSON.stringify({callSid,recordType,recordId,template:request.template}),time,time);
      q('INSERT INTO voiceSmsDeliveries(id,ownerId,callSid,recordType,recordId,requestJson,callbackToken,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?)').run(id,ownerId,callSid,recordType,recordId,JSON.stringify(request),randomBytes(24).toString('hex'),time,time);
      return row(ownerId,id);
    }).immediate();
  }
  function state(ownerId,id){const r=row(ownerId,id);if(!r)throw problem('SMS_NOT_FOUND',404);return {id:r.id,status:r.status,attemptCount:r.attemptCount,lastErrorCode:r.lastErrorCode,nextAttemptAt:r.nextAttemptAt,createdAt:r.createdAt,updatedAt:r.updatedAt};}
  function set(r,status,errorCode=null,providerId=r.providerId){
    q('UPDATE voiceSmsDeliveries SET status=?,lastErrorCode=?,providerId=?,leaseId=NULL,leaseExpiresAt=NULL,updatedAt=? WHERE ownerId=? AND id=?').run(status,errorCode,providerId,iso(),r.ownerId,r.id);
  }
  function claim(ownerId,id){return database.transaction(()=>{
    const r=id?row(ownerId,id):q("SELECT * FROM voiceSmsDeliveries WHERE ownerId=? AND ((status='PENDING' AND nextAttemptAt<=?) OR (status='DELIVERING' AND leaseExpiresAt<=?) OR (status='BLOCKED' AND nextAttemptAt<=?)) ORDER BY createdAt,id LIMIT 1").get(ownerId,clock(),clock(),clock());
    if(!r)return null;
    if(r.status==='DELIVERING'&&r.leaseExpiresAt<=clock()){
      q("UPDATE voiceSmsAttempts SET status='UNKNOWN',errorCode='SMS_WORKER_INTERRUPTED',completedAt=? WHERE ownerId=? AND deliveryId=? AND status='STARTED'").run(iso(),ownerId,r.id);
      set(r,'UNKNOWN','SMS_WORKER_INTERRUPTED');return null;
    }
    if(!['PENDING','BLOCKED'].includes(r.status)||r.nextAttemptAt>clock())return null;
    const request=parse(r.requestJson);
    if(!r.requestJson){set(r,'UNKNOWN','LEGACY_SMS_NOT_REPLAYABLE');return null;}
    if(q('SELECT 1 FROM voiceSmsOptOuts WHERE ownerId=? AND recipient=?').get(ownerId,request.to)){set(r,'OPTED_OUT','SMS_RECIPIENT_OPTED_OUT');return null;}
    const available=typeof provider.send==='function'&&(typeof provider.ready!=='function'||provider.ready(request,ownerId)===true);
    if(!available){set(r,'BLOCKED','SMS_NOT_CONFIGURED');q('UPDATE voiceSmsDeliveries SET nextAttemptAt=? WHERE ownerId=? AND id=?').run(clock()+5000,ownerId,r.id);return null;}
    if(r.attemptCount>=5){set(r,'FAILED','SMS_RETRIES_EXHAUSTED');return null;}
    const leaseId=randomUUID(),attempt=r.attemptCount+1;
    q("UPDATE voiceSmsDeliveries SET status='DELIVERING',attemptCount=?,leaseId=?,leaseExpiresAt=?,updatedAt=? WHERE ownerId=? AND id=?").run(attempt,leaseId,clock()+30000,iso(),ownerId,r.id);
    q("INSERT INTO voiceSmsAttempts(id,ownerId,deliveryId,attemptNumber,status,startedAt) VALUES(?,?,?,?,'STARTED',?)").run(leaseId,ownerId,r.id,attempt,iso());
    return {...r,status:'DELIVERING',leaseId,attemptCount:attempt,request};
  }).immediate();}
  async function processOne(ownerId,id){
    if(await reconcileOne(ownerId,id))return true;
    const r=claim(ownerId,id);if(!r)return false;
    let status='UNKNOWN',code='SMS_OUTCOME_UNKNOWN',providerId=null,timer;const controller=new AbortController();
    try{
      const result=await Promise.race([provider.send({...r.request,ownerId,callSid:r.callSid,idempotencyKey:r.id,callbackToken:r.callbackToken,eventId:r.id},{signal:controller.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(problem('SMS_OUTCOME_UNKNOWN'));},providerTimeoutMs);})]);
      const outcome=String(result?.status||'').toUpperCase();
      if(result?.simulated!==true&&typeof result.id==='string'&&result.id&&['SENT','DELIVERED','QUEUED','ACCEPTED'].includes(outcome)){
        // Production adapter requires a real provider receipt for acceptance.
        status=outcome;code=null;providerId=typeof result.id==='string'?result.id:null;
      }else if(result?.simulated!==true&&typeof result.id==='string'&&result.id&&['FAILED','UNDELIVERED'].includes(outcome)){
        status=outcome;code='SMS_DELIVERY_FAILED';providerId=result.id;
      }else if(result?.definitive===true){status='FAILED';code='SMS_REJECTED';}
    }catch(error){if(error?.definitive===true){status=error.code==='SMS_RECIPIENT_OPTED_OUT'?'OPTED_OUT':'FAILED';code=status==='OPTED_OUT'?error.code:'SMS_REJECTED';}}
    finally{clearTimeout(timer);}
    database.transaction(()=>{
      const current=row(ownerId,r.id);
      // A verified callback can arrive before the POST response. Never demote it.
      if(current?.leaseId!==r.leaseId||current.status!=='DELIVERING')return;
      q('UPDATE voiceSmsAttempts SET status=?,providerId=?,errorCode=?,completedAt=? WHERE ownerId=? AND id=?').run(status,providerId,code,iso(),ownerId,r.leaseId);
      const retry=status==='FAILED'&&!providerId&&r.attemptCount<5;
      set(r,retry?'PENDING':status,code,providerId);
      q('UPDATE voiceSmsDeliveries SET nextAttemptAt=? WHERE ownerId=? AND id=?').run(retry?clock()+SMS_RETRY_MS[r.attemptCount-1]:['QUEUED','ACCEPTED'].includes(status)?clock()+5000:0,ownerId,r.id);
      if(status==='OPTED_OUT')q('INSERT OR IGNORE INTO voiceSmsOptOuts(ownerId,recipient,createdAt) VALUES(?,?,?)').run(ownerId,r.request.to,iso());
    }).immediate();return true;
  }
  async function reconcileOne(ownerId,id){
    if(typeof provider.lookup!=='function')return false;
    const claimed=database.transaction(()=>{
      const r=id?row(ownerId,id):q("SELECT * FROM voiceSmsDeliveries WHERE ownerId=? AND status IN ('QUEUED','ACCEPTED') AND nextAttemptAt<=? ORDER BY nextAttemptAt,id LIMIT 1").get(ownerId,clock());
      if(!r||!['QUEUED','ACCEPTED'].includes(r.status)||r.nextAttemptAt>clock()||!r.providerId)return null;
      // Reserve the reconciliation before GET. Reads are safe to repeat after a
      // crash; this reservation prevents concurrent workers hammering a provider.
      q('UPDATE voiceSmsDeliveries SET receiptChecks=receiptChecks+1,nextAttemptAt=? WHERE ownerId=? AND id=?').run(clock()+60000,ownerId,r.id);
      return {...r,receiptChecks:r.receiptChecks+1};
    }).immediate();
    if(!claimed)return false;
    let timer;const controller=new AbortController();let result;
    try{result=await Promise.race([provider.lookup({...parse(claimed.requestJson),ownerId,id:claimed.providerId},{signal:controller.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(problem('SMS_RECEIPT_UNKNOWN'));},providerTimeoutMs);})]);}
    catch{}finally{clearTimeout(timer);}
    database.transaction(()=>{
      const current=row(ownerId,claimed.id);if(!current||!['QUEUED','ACCEPTED'].includes(current.status))return;
      const next=String(result?.status||'').toUpperCase();
      if(result?.id===current.providerId&&['SENT','DELIVERED','FAILED','UNDELIVERED'].includes(next))set(current,next,['FAILED','UNDELIVERED'].includes(next)?'SMS_DELIVERY_FAILED':null);
      else if(claimed.receiptChecks>=5)set(current,'UNKNOWN','SMS_RECEIPT_UNCONFIRMED');
    }).immediate();return true;
  }
  function receiveStatus({ownerId,id,token,accountSid,to,from,providerId,status,errorCode}){
    return database.transaction(()=>{
      const r=row(ownerId,id),request=parse(r?.requestJson),next=String(status||'').toUpperCase();
      if(!r||token!==r.callbackToken||accountSid!==request.accountSid||to!==request.to||from!==request.from||!/^SM[0-9a-f]{32}$/i.test(providerId||'')||r.providerId&&r.providerId!==providerId||r.attemptCount<1||!['QUEUED','SENT','DELIVERED','FAILED','UNDELIVERED'].includes(next))throw problem('SMS_RECEIPT_BINDING',403);
      if(r.status==='DELIVERED'||['FAILED','UNDELIVERED','OPTED_OUT'].includes(r.status)||r.status==='SENT'&&next==='QUEUED')return state(ownerId,id);
      const failure=['FAILED','UNDELIVERED'].includes(next),opted=failure&&String(errorCode)==='21610';
      set(r,opted?'OPTED_OUT':next,failure?opted?'SMS_RECIPIENT_OPTED_OUT':'SMS_DELIVERY_FAILED':null,providerId);
      q("UPDATE voiceSmsAttempts SET status=?,providerId=?,errorCode=?,completedAt=? WHERE ownerId=? AND deliveryId=? AND attemptNumber=?").run(opted?'OPTED_OUT':next,providerId,failure?'SMS_DELIVERY_FAILED':null,iso(),ownerId,id,r.attemptCount);
      if(opted)q('INSERT OR IGNORE INTO voiceSmsOptOuts(ownerId,recipient,createdAt) VALUES(?,?,?)').run(ownerId,to,iso());
      return state(ownerId,id);
    }).immediate();
  }
  let stopWorker=null,cursor='',stopping=false;
  async function dispatchOnce(){
    // Identity-registry enumeration only. Customer reads/writes below bind owner.
    let owners=database.prepare("SELECT id FROM users WHERE role='owner' AND ownerId IS NULL AND id>? ORDER BY id LIMIT 100").all(cursor);
    if(!owners.length){cursor='';owners=database.prepare("SELECT id FROM users WHERE role='owner' AND ownerId IS NULL ORDER BY id LIMIT 100").all();}
    let processed=0;
    for(const owner of owners){if(stopping||processed>=20)break;cursor=owner.id;for(let n=0;n<10&&processed<20&&!stopping;n++){if(!await processOne(owner.id))break;processed++;}}
    return {processed};
  }
  function start({intervalMs=1000,onError=()=>{}}={}){
    if(!Number.isSafeInteger(intervalMs)||intervalMs<100||intervalMs>60000)throw TypeError('Invalid SMS worker interval');
    if(stopWorker)return stopWorker;stopping=false;let stopped=false,timer,running;
    const tick=()=>{if(stopped)return;running=dispatchOnce().catch(()=>onError('SMS_WORKER_FAILED')).finally(()=>{running=null;if(!stopped){timer=setTimeout(tick,intervalMs);timer.unref?.();}});};tick();
    stopWorker=async()=>{stopped=true;stopping=true;clearTimeout(timer);await running;stopWorker=null;};return stopWorker;
  }
  return {enqueue,state,processOne,dispatchOnce,receiveStatus,start};
}
