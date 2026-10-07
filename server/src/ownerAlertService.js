import {randomUUID} from 'node:crypto';
import {createOwnerAlertEmailSender,ownerAlertEmailReady} from './ownerAlertEmail.js';
import {storedObject} from './ownerRecordViews.js';
import {accountEmailOrigin} from './authLinks.js';

export const OWNER_ALERT_RETRY_MS=Object.freeze([1000,5000,30000,60000,300000,900000,3600000]);
// Resend retains the same-key/same-payload dedupe for 24 hours. Keep a safety
// margin; after an ambiguous first attempt this worker refuses an unsafe resend.
export const OWNER_ALERT_SAFE_REPLAY_MS=23*60*60*1000;
const LEASE_MS=30000;
const fields='id,eventType,aggregateId,callId,status,attemptCount,nextAttemptAt,lastErrorCode,acceptedAt,seenAt,createdAt,updatedAt';
const problem=(message,statusCode=400)=>Object.assign(Error(message),{statusCode});
const email=v=>typeof v==='string'&&v.length<=320&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v);
const parseArray=v=>{try{const a=JSON.parse(v);return Array.isArray(a)?a:[];}catch{return [];}};

export function createOwnerAlertService({database,ownerQuery=sql=>database.prepare(sql),environment=process.env,
  clock=Date.now,ready=()=>ownerAlertEmailReady(environment),send=createOwnerAlertEmailSender({environment}),providerTimeoutMs=5000}={}){
  if(!Number.isSafeInteger(providerTimeoutMs)||providerTimeoutMs<1||providerTimeoutMs>10000)throw TypeError('Invalid owner alert provider timeout.');
  const query=sql=>{if(!/\bownerId\b/.test(sql))throw Error('Owner alert query must bind tenant');return ownerQuery(sql);};
  const iso=()=>new Date(clock()).toISOString();
  function source(row){
    const id=row.aggregateId,owner=row.ownerId;
    if(row.eventType==='lead.created'){
      const lead=query('SELECT * FROM leads WHERE ownerId=? AND id=?').get(owner,id);if(!lead)throw Error('ALERT_SOURCE_MISSING');
      const d=storedObject(lead.collectedInputsJson),submission=d.originalSubmission||{};
      return ['New lead',lead.customerName||d.contact?.name||submission.contact?.name,d.contact?.phone||submission.contact?.phone||lead.callerNumber,d.contact?.email||submission.contact?.email,lead.describedService,d.notes,submission.context];
    }
    if(['callback.requested','callback.updated'].includes(row.eventType)){
      const callback=query('SELECT * FROM callbackRequests WHERE ownerId=? AND id=?').get(owner,id);if(!callback)throw Error('ALERT_SOURCE_MISSING');
      const lead=query('SELECT callerNumber,customerName,collectedInputsJson FROM leads WHERE ownerId=? AND id=? AND callId=?').get(owner,callback.leadId,callback.callId);if(!lead)throw Error('ALERT_SOURCE_MISSING');
      const history=parseArray(callback.historyJson),revision=row.eventType==='callback.updated'?Number(row.eventKey.split(':').at(-1))-1:0,entry=history[revision];
      return [row.eventType==='callback.updated'?'Callback notes corrected':'Callback requested',lead.customerName,storedObject(lead.collectedInputsJson).contact?.phone||lead.callerNumber,entry?.notes??callback.notes??'No caller notes recorded',callback.reason];
    }
    if(row.eventType==='quote.created'){
      const quote=query('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(owner,id);if(!quote)throw Error('ALERT_SOURCE_MISSING');
      const submission=query('SELECT originalSubmissionJson FROM quoteSubmissions WHERE ownerId=? AND recordId=? ORDER BY createdAt DESC LIMIT 1').get(owner,id);
      const receipt=storedObject(quote.resultJson),d=submission?storedObject(submission.originalSubmissionJson):receipt.originalSubmission||{},r=(receipt.applicationOutcome||receipt).customerResult;
      // The receipt is historical: use only its already sanitized customer view.
      const estimate=r?.pricedEstimate||r;
      return ['New quote',quote.serviceType,quote.status,d.contact?.name,d.contact?.phone,d.contact?.email,...(estimate?.options||[estimate]).filter(Boolean).map(o=>[o.tierName,o.lowEstimate,o.highEstimate,o.currency,o.priceUnit,o.taxTreatment].filter(v=>v!==undefined&&v!==null).join(' | '))];
    }
    if(row.eventType==='quote.requested'){
      const request=query('SELECT describedService FROM quoteRequests WHERE ownerId=? AND id=?').get(owner,id);if(!request)throw Error('ALERT_SOURCE_MISSING');
      return ['Quote review requested',request.describedService];
    }
    if(row.eventType==='booking.preference_requested'){
      const request=query('SELECT * FROM bookingPreferences WHERE ownerId=? AND id=?').get(owner,id);if(!request)throw Error('ALERT_SOURCE_MISSING');
      const c=storedObject(request.customerJson);return ['Preferred-time request (not booked)',c.name,c.phone,c.email,request.note,...parseArray(request.preferredWindowsJson).map(w=>JSON.stringify(w))];
    }
    if(row.eventType==='voice.quoting_unavailable'){
      const outbox=query('SELECT payloadJson FROM outboxEvents WHERE ownerId=? AND id=?').get(owner,id);if(!outbox)throw Error('ALERT_SOURCE_MISSING');
      return ['Quoting is paused. Answering remains available.',storedObject(outbox.payloadJson).message];
    }
    if(row.eventType==='voice.urgent_flagged'){
      const outbox=query('SELECT payloadJson FROM outboxEvents WHERE ownerId=? AND id=?').get(owner,id);if(!outbox)throw Error('ALERT_SOURCE_MISSING');
      const d=storedObject(outbox.payloadJson);return ['Urgent caller request',d.reason,d.summary,d.callerNumber];
    }
    if(row.eventType==='call.completed'){
      const call=query('SELECT callerNumber,status,outcome,failureCode,summaryText FROM calls WHERE ownerId=? AND id=?').get(owner,id);if(!call)throw Error('ALERT_SOURCE_MISSING');
      return ['Call ended',call.callerNumber,call.status,call.outcome,call.failureCode,call.summaryText||'No summary recorded'];
    }
    throw Error('ALERT_TYPE_UNSUPPORTED');
  }
  function list({ownerId,status,offset='0',limit=50}){
    if(typeof offset!=='string'||!/^\d{1,8}$/.test(offset)||!['all','unresolved',undefined].includes(status))throw problem('Unsupported owner alert page.');
    const where=status==='unresolved'?" AND status NOT IN ('ACCEPTED')":'';
    return {configured:ready(),channel:'email',deliveryMeaning:'ACCEPTED means the email provider accepted the message; inbox delivery and owner reading are not confirmed.',
      alerts:query('SELECT '+fields+' FROM ownerAlerts WHERE ownerId=?'+where+' ORDER BY createdAt DESC,id DESC LIMIT ? OFFSET ?').all(ownerId,limit,Number(offset)),
      total:query('SELECT COUNT(*) AS n FROM ownerAlerts WHERE ownerId=?'+where).get(ownerId).n};
  }
  function retry(ownerId,id){const result=database.transaction(()=>{
    const row=query('SELECT * FROM ownerAlerts WHERE ownerId=? AND id=?').get(ownerId,id);
    if(!row)throw problem('Owner alert not found.',404);
    if(row.status==='ACCEPTED')return {status:'ACCEPTED'};
    if(row.status==='DELIVERING'||row.status==='PENDING')return {status:row.status};
    if(row.firstAttemptAt!==null&&clock()-row.firstAttemptAt>=OWNER_ALERT_SAFE_REPLAY_MS){
      query("UPDATE ownerAlerts SET status='UNKNOWN',lastErrorCode='DEDUPE_WINDOW_EXPIRED',updatedAt=? WHERE ownerId=? AND id=?").run(iso(),ownerId,id);
      return {expired:true};
    }
    query("UPDATE ownerAlerts SET status='PENDING',nextAttemptAt=0,leaseId=NULL,leaseExpiresAt=NULL,updatedAt=? WHERE ownerId=? AND id=?").run(iso(),ownerId,id);
    return {status:'PENDING'};
  }).immediate();if(result.expired)throw problem('The provider outcome cannot be safely retried after its deduplication window. Open the saved request and contact the customer; no duplicate email was sent.',409);return result;}
  function seen(ownerId,id){const result=query('UPDATE ownerAlerts SET seenAt=COALESCE(seenAt,?),updatedAt=? WHERE ownerId=? AND id=?').run(iso(),iso(),ownerId,id);if(!result.changes)throw problem('Owner alert not found.',404);return {seen:true};}
  function claim(ownerId){return database.transaction(()=>{
    const row=query(`SELECT * FROM ownerAlerts WHERE ownerId=? AND ((status='PENDING' AND nextAttemptAt<=?) OR (status='DELIVERING' AND leaseExpiresAt<=?)) ORDER BY CASE WHEN eventType='voice.urgent_flagged' THEN 0 ELSE 1 END,createdAt,id LIMIT 1`).get(ownerId,clock(),clock());
    if(!row)return null;
    if(row.firstAttemptAt!==null&&clock()-row.firstAttemptAt>=OWNER_ALERT_SAFE_REPLAY_MS){query("UPDATE ownerAlerts SET status='UNKNOWN',lastErrorCode='DEDUPE_WINDOW_EXPIRED',leaseId=NULL,leaseExpiresAt=NULL,updatedAt=? WHERE ownerId=? AND id=?").run(iso(),ownerId,row.id);return null;}
    if(!ready()){query("UPDATE ownerAlerts SET status='BLOCKED',lastErrorCode='EMAIL_NOT_CONFIGURED',updatedAt=? WHERE ownerId=? AND id=?").run(iso(),ownerId,row.id);return null;}
    const owner=query("SELECT email FROM users WHERE id=? AND role='owner' AND ownerId IS NULL").get(ownerId);
    if(!email(owner?.email)){query("UPDATE ownerAlerts SET status='BLOCKED',lastErrorCode='OWNER_EMAIL_MISSING',updatedAt=? WHERE ownerId=? AND id=?").run(iso(),ownerId,row.id);return null;}
    let message=row.messageJson?storedObject(row.messageJson):null;
    if(message&&message.to!==owner.email){query("UPDATE ownerAlerts SET status='BLOCKED',lastErrorCode='OWNER_EMAIL_CHANGED',updatedAt=? WHERE ownerId=? AND id=?").run(iso(),ownerId,row.id);return null;}
    if(!message){let values;try{values=source(row).filter(v=>v!==undefined&&v!==null&&v!=='');}catch{query("UPDATE ownerAlerts SET status='FAILED',lastErrorCode='ALERT_SOURCE_MISSING',updatedAt=? WHERE ownerId=? AND id=?").run(iso(),ownerId,row.id);return null;}const route=row.callId?'/calls?record='+encodeURIComponent(row.callId):row.eventType==='quote.created'?'/quotes?record='+encodeURIComponent(row.aggregateId):row.eventType==='lead.created'||row.eventType==='callback.requested'?'/leads?record='+encodeURIComponent(row.aggregateId):'/calendar';
      let origin='';try{origin=accountEmailOrigin(environment);}catch{/* Relative path remains actionable on the owner dashboard. */}
      message={from:environment.EMAIL_FROM,to:owner.email,subject:'Off The Clock: '+values[0],text:values.map(String).join('\n')+'\nOpen saved record: '+origin+route,idempotencyKey:'owner-alert/'+row.id};
    }
    const leaseId=randomUUID(),attempt=row.attemptCount+1;
    if(row.leaseId)query("UPDATE ownerAlertAttempts SET status='UNKNOWN',errorCode='WORKER_LEASE_EXPIRED',completedAt=? WHERE ownerId=? AND alertId=? AND status='STARTED'").run(iso(),ownerId,row.id);
    query("UPDATE ownerAlerts SET status='DELIVERING',attemptCount=?,firstAttemptAt=COALESCE(firstAttemptAt,?),leaseId=?,leaseExpiresAt=?,messageJson=?,updatedAt=? WHERE ownerId=? AND id=?").run(attempt,clock(),leaseId,clock()+LEASE_MS,JSON.stringify(message),iso(),ownerId,row.id);
    query("INSERT INTO ownerAlertAttempts(id,ownerId,alertId,attemptNumber,status,startedAt) VALUES(?,?,?,?, 'STARTED',?)").run(leaseId,ownerId,row.id,attempt,iso());
    return {...row,attemptCount:attempt,leaseId,message};
  }).immediate();}
  async function processOne(ownerId){
    const row=claim(ownerId);if(!row)return false;
    let accepted=false,result,errorCode=null,definitive=false;
    let timer;const controller=new AbortController();
    try{result=await Promise.race([send(row.message,{signal:controller.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('Owner provider timeout'),{code:'EMAIL_OUTCOME_UNKNOWN'}));},providerTimeoutMs);})]);accepted=result?.accepted===true&&result.simulated!==true&&typeof result.id==='string'&&Boolean(result.id);if(!accepted)errorCode='EMAIL_ACCEPTANCE_UNKNOWN';}
    catch(error){errorCode=typeof error.code==='string'&&/^[A-Z_]{3,64}$/.test(error.code)?error.code:'EMAIL_OUTCOME_UNKNOWN';definitive=error.definitive===true;}finally{clearTimeout(timer);}
    // Provider accepted may precede a database error. The frozen message/key and
    // expired lease recovery make that ambiguity replayable within the window.
    database.transaction(()=>{
      const current=query('SELECT leaseId,status FROM ownerAlerts WHERE ownerId=? AND id=?').get(ownerId,row.id);if(current?.leaseId!==row.leaseId||current.status!=='DELIVERING')return;
      const retryable=!accepted&&row.attemptCount<8;
      query('UPDATE ownerAlertAttempts SET status=?,errorCode=?,completedAt=?,providerId=? WHERE ownerId=? AND id=?').run(accepted?'ACCEPTED':definitive?'FAILED':'UNKNOWN',errorCode,iso(),accepted?result.id:null,ownerId,row.leaseId);
      query('UPDATE ownerAlerts SET status=?,nextAttemptAt=?,leaseId=NULL,leaseExpiresAt=NULL,providerId=?,lastErrorCode=?,acceptedAt=?,updatedAt=? WHERE ownerId=? AND id=?').run(accepted?'ACCEPTED':retryable?'PENDING':definitive?'FAILED':'UNKNOWN',retryable?clock()+OWNER_ALERT_RETRY_MS[row.attemptCount-1]:0,accepted?result.id:null,errorCode,accepted?iso():null,iso(),ownerId,row.id);
    }).immediate();
    return true;
  }
  let ownerCursor='',workerStopping=false,stopWorker=null;
  async function dispatchOnce(){
    // Owner identity enumeration is the same identity-registry read used by
    // authentication/routing. Alert/customer queries never scan across tenants.
    let owners=database.prepare("SELECT id AS ownerId FROM users WHERE role='owner' AND ownerId IS NULL AND id>? ORDER BY id LIMIT 100").all(ownerCursor);
    if(!owners.length){ownerCursor='';owners=database.prepare("SELECT id AS ownerId FROM users WHERE role='owner' AND ownerId IS NULL ORDER BY id LIMIT 100").all();}
    let processed=0;
    for(const {ownerId}of owners){
      if(workerStopping||processed>=20)break;ownerCursor=ownerId;
      // A valid provider alone does not resolve a missing recipient. Requeue
      // only after both are usable, so one blocked event cannot starve the rest.
      const owner=query("SELECT email FROM users WHERE id=? AND role='owner' AND ownerId IS NULL").get(ownerId);
      if(ready()&&email(owner?.email))query("UPDATE ownerAlerts SET status='PENDING',lastErrorCode=NULL WHERE ownerId=? AND status='BLOCKED' AND lastErrorCode IN ('EMAIL_NOT_CONFIGURED','OWNER_EMAIL_MISSING')").run(ownerId);
      for(let n=0;n<10&&!workerStopping&&processed<20;n++){if(!await processOne(ownerId))break;processed++;}
    }
    return {processed};
  }
  function start({intervalMs=1000,onError=()=>{}}={}){
    if(!Number.isSafeInteger(intervalMs)||intervalMs<100||intervalMs>60000)throw TypeError('Invalid owner alert worker interval.');
    if(stopWorker)return stopWorker;workerStopping=false;
    let stopped=false,timer,running;
    const tick=()=>{if(stopped)return;running=dispatchOnce().catch(()=>onError('OWNER_ALERT_WORKER_FAILED')).finally(()=>{running=null;if(!stopped){timer=setTimeout(tick,intervalMs);timer.unref?.();}});};tick();
    stopWorker=async()=>{stopped=true;workerStopping=true;clearTimeout(timer);await running;stopWorker=null;};return stopWorker;
  }
  return {list,retry,seen,dispatchOnce,start,processOne};
}
