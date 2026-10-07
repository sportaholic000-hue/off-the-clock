import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createQuoteEmailProvider} from './quoteEmailProvider.js';
const EMAIL=/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const SAFE_REPLAY_MS=23*60*60*1000,LINK_MS=30*24*60*60*1000;
const fail=(code,statusCode=409)=>{throw Object.assign(Error('The quote email could not be completed safely.'),{code,statusCode});};
const hash=s=>createHash('sha256').update(s).digest('hex');
export function quoteEmailOrigin(env){
  let u;try{u=new URL(env.PUBLIC_BASE_URL);}catch{fail('QUOTE_EMAIL_LINK_UNAVAILABLE');}
  if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.protocol!=='https:')fail('QUOTE_EMAIL_LINK_UNAVAILABLE');
  return u.origin;
}
export function createQuoteEmailService({database,ownerQuery=sql=>database.prepare(sql),environment=process.env,
  provider=createQuoteEmailProvider({environment}),clock=Date.now,providerTimeoutMs=6000}={}){
  if(!Number.isSafeInteger(providerTimeoutMs)||providerTimeoutMs<1||providerTimeoutMs>25000)throw new TypeError('Invalid email provider timeout');
  const q=sql=>{if(!/\bownerId\b/.test(sql))throw Error('Quote email tenant required');return ownerQuery(sql);};
  const iso=()=>new Date(clock()).toISOString(),row=(ownerId,requestId)=>q('SELECT * FROM quoteEmailDeliveries WHERE ownerId=? AND requestId=?').get(ownerId,requestId);
  const state=r=>({status:r.status,deliveryStatus:r.status,id:r.id,recipient:r.recipient,attemptCount:r.attemptCount,lastErrorCode:r.lastErrorCode});
  function prepare({ownerId,requestId,callSid,email}){
    if(typeof email!=='string'||email.length>254||!EMAIL.test(email.trim())||/[\r\n]/.test(email))fail('INVALID_QUOTE_EMAIL',400);
    email=email.trim().toLowerCase();
    return database.transaction(()=>{
      if(!q('SELECT 1 FROM voiceQuoteNarrations WHERE ownerId=? AND requestId=? AND callSid=?').get(ownerId,requestId,callSid))fail('QUOTE_NOT_PRESENTED');
      const sent=row(ownerId,requestId);if(sent&&sent.recipient!==email)fail('QUOTE_EMAIL_ALREADY_QUEUED');
      const prior=q('SELECT * FROM quoteEmailRecipients WHERE ownerId=? AND requestId=?').get(ownerId,requestId);
      if(prior?.email===email&&prior.callSid===callSid)return prior;
      const version=randomUUID();
      q(`INSERT INTO quoteEmailRecipients(ownerId,requestId,callSid,email,version,updatedAt) VALUES(?,?,?,?,?,?)
        ON CONFLICT(ownerId,requestId) DO UPDATE SET callSid=excluded.callSid,email=excluded.email,version=excluded.version,updatedAt=excluded.updatedAt`).run(ownerId,requestId,callSid,email,version,iso());
      return {ownerId,requestId,callSid,email,version};
    }).immediate();
  }
  function enqueue({ownerId,requestId,recordId,callSid,email,version,customerConfirmed}){
    if(customerConfirmed!==true)fail('EMAIL_CONFIRMATION_REQUIRED');
    return database.transaction(()=>{
      const candidate=q('SELECT * FROM quoteEmailRecipients WHERE ownerId=? AND requestId=? AND callSid=? AND version=? AND email=?').get(ownerId,requestId,callSid,version,email);
      if(!candidate)fail('EMAIL_READBACK_CHANGED');
      const prior=row(ownerId,requestId);if(prior)return state(prior);
      const saved=q('SELECT narration FROM voiceQuoteNarrations WHERE ownerId=? AND requestId=? AND callSid=?').get(ownerId,requestId,callSid);
      const quote=q('SELECT recordId,resultType FROM quoteSubmissions WHERE ownerId=? AND requestId=? AND recordId=?').get(ownerId,requestId,recordId);
      if(!saved||!quote||!['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(quote.resultType))fail('QUOTE_EMAIL_UNAVAILABLE');
      const owner=q("SELECT businessName,email FROM users WHERE id=? AND role='owner' AND ownerId IS NULL").get(ownerId);
      if(!owner||!EMAIL.test(owner.email)||!owner.businessName?.trim()||/[\r\n]/.test(owner.businessName)||owner.businessName.length>500)fail('QUOTE_EMAIL_BUSINESS_UNAVAILABLE');
      if(!EMAIL.test(environment.EMAIL_FROM||''))fail('EMAIL_NOT_CONFIGURED');
      const id=randomUUID(),token=randomBytes(32).toString('base64url'),at=iso();
      const url=quoteEmailOrigin(environment)+'/quote-copy/'+encodeURIComponent(ownerId)+'/'+token;
      const businessName=owner.businessName.trim();
      const message={from:JSON.stringify(businessName)+' <'+environment.EMAIL_FROM+'>',to:email,replyTo:owner.email,
        subject:'Your quote from '+businessName,text:saved.narration+'\n\nView your saved quote: '+url,idempotencyKey:'quote-email/'+id};
      q("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES(?,?,'quote.email_requested',?,?,'PENDING',?,?)").run(id,ownerId,recordId,JSON.stringify({callSid,requestId,recordId}),at,at);
      q(`INSERT INTO quoteEmailDeliveries(id,ownerId,requestId,recordId,callSid,recipient,businessName,narration,messageJson,tokenHash,expiresAt,createdAt,updatedAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,ownerId,requestId,recordId,callSid,email,businessName,saved.narration,JSON.stringify(message),hash(token),clock()+LINK_MS,at,at);
      return state(row(ownerId,requestId));
    }).immediate();
  }
  function publicQuote(ownerId,token){
    if(typeof ownerId!=='string'||ownerId.length>200||typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))fail('QUOTE_COPY_NOT_FOUND',404);
    const r=q('SELECT businessName,narration,expiresAt FROM quoteEmailDeliveries WHERE ownerId=? AND tokenHash=?').get(ownerId,hash(token));
    if(!r||r.expiresAt<=clock())fail('QUOTE_COPY_NOT_FOUND',404);
    return {businessName:r.businessName,narration:r.narration};
  }
  function claim(ownerId){return database.transaction(()=>{
    const r=q(`SELECT * FROM quoteEmailDeliveries WHERE ownerId=? AND nextAttemptAt<=? AND
      (status IN ('PENDING','BLOCKED','ACCEPTED') OR status='SENDING' AND leaseExpiresAt<=?) ORDER BY createdAt,id LIMIT 1`).get(ownerId,clock(),clock());
    if(!r)return null;
    const finish=(status,error)=>q('UPDATE quoteEmailDeliveries SET status=?,lastErrorCode=?,leaseId=NULL,leaseExpiresAt=NULL,updatedAt=? WHERE ownerId=? AND id=?').run(status,error,iso(),ownerId,r.id);
    if(!r.providerId&&r.firstAttemptAt!==null&&clock()-r.firstAttemptAt>=SAFE_REPLAY_MS){finish('REVIEW','EMAIL_DEDUPE_WINDOW_EXPIRED');return null;}
    if(typeof provider.send!=='function'||provider.ready&&provider.ready()!==true){finish('BLOCKED','EMAIL_NOT_CONFIGURED');q('UPDATE quoteEmailDeliveries SET nextAttemptAt=? WHERE ownerId=? AND id=?').run(clock()+5000,ownerId,r.id);return null;}
    if(r.providerId&&r.receiptChecks>=8){finish('REVIEW','EMAIL_DELIVERY_UNCONFIRMED');return null;}
    if(!r.providerId&&r.attemptCount>=8){finish('REVIEW','EMAIL_OUTCOME_UNKNOWN');return null;}
    const message=JSON.parse(r.messageJson),owner=q("SELECT email FROM users WHERE id=? AND ownerId IS NULL AND role='owner'").get(ownerId);
    if(!r.providerId&&owner?.email!==message.replyTo){finish('REVIEW','OWNER_EMAIL_CHANGED');return null;}
    const leaseId=randomUUID();
    q(`UPDATE quoteEmailDeliveries SET status='SENDING',attemptCount=attemptCount+?,receiptChecks=receiptChecks+?,
      firstAttemptAt=COALESCE(firstAttemptAt,?),leaseId=?,leaseExpiresAt=?,updatedAt=? WHERE ownerId=? AND id=?`)
      .run(r.providerId?0:1,r.providerId?1:0,clock(),leaseId,clock()+30000,iso(),ownerId,r.id);
    return {...r,message,leaseId};
  }).immediate();}
  async function processOne(ownerId){
    const r=claim(ownerId);if(!r)return false;
    let status=r.providerId?'ACCEPTED':'PENDING',providerId=r.providerId,error='EMAIL_CONFIRMATION_PENDING',timer;
    const controller=new AbortController();
    try{
      const result=await Promise.race([r.providerId?provider.read(r.providerId,{signal:controller.signal}):provider.send(r.message,{signal:controller.signal}),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Provider timeout'));},providerTimeoutMs);})]);
      if(r.providerId){
        if(result?.id!==r.providerId||JSON.stringify(result.to)!==JSON.stringify([r.recipient])||result.subject!==r.message.subject||result.from!==r.message.from)throw Error('Receipt binding mismatch');
        if(['delivered','opened','clicked'].includes(result.last_event)){status='DELIVERED';error=null;}
        else if(['bounced','complained','failed','suppressed'].includes(result.last_event)){status='FAILED';error='EMAIL_DELIVERY_FAILED';}
        else error=null;
      }else if(result?.accepted===true&&result.simulated!==true&&typeof result.id==='string'&&result.id&&result.id.length<=200){status='ACCEPTED';providerId=result.id;error=null;}
    }catch(e){if(!r.providerId&&e.definitive===true){status='FAILED';error='EMAIL_REJECTED';}}
    finally{clearTimeout(timer);}
    q(`UPDATE quoteEmailDeliveries SET status=?,providerId=?,lastErrorCode=?,nextAttemptAt=?,leaseId=NULL,leaseExpiresAt=NULL,updatedAt=?
      WHERE ownerId=? AND id=? AND leaseId=?`).run(status,providerId,error,clock()+(status==='ACCEPTED'&&!r.providerId?0:60000),iso(),ownerId,r.id,r.leaseId);
    return true;
  }
  let cursor='',stopped=false;
  async function dispatchOnce(){
    let owners=database.prepare("SELECT id AS ownerId FROM users WHERE role='owner' AND ownerId IS NULL AND id>? ORDER BY id LIMIT 100").all(cursor);
    if(!owners.length){cursor='';owners=database.prepare("SELECT id AS ownerId FROM users WHERE role='owner' AND ownerId IS NULL ORDER BY id LIMIT 100").all();}
    for(const {ownerId}of owners){if(stopped)break;cursor=ownerId;for(let i=0;i<10&&!stopped;i++)if(!await processOne(ownerId))break;}
  }
  function start({intervalMs=1000,onError=()=>{}}={}){let timer,running;stopped=false;
    const tick=()=>{if(stopped)return;running=dispatchOnce().catch(()=>onError('QUOTE_EMAIL_WORKER_FAILED')).finally(()=>{if(!stopped){timer=setTimeout(tick,intervalMs);timer.unref?.();}});};tick();
    return async()=>{stopped=true;clearTimeout(timer);await running;};
  }
  return {prepare,enqueue,publicQuote,processOne,dispatchOnce,start,state:(ownerId,requestId)=>{const r=row(ownerId,requestId);if(!r)fail('QUOTE_EMAIL_NOT_FOUND',404);return state(r);}};
}
