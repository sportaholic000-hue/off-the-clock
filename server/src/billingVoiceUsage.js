import {createHash} from 'node:crypto';
import {allowancePeriods} from './billingUsagePolicy.js';
const terminal=new Set(['completed','busy','failed','no-answer','canceled']);
const excluded=row=>row.spamFiltered===1||['FALLBACK','AI_FALLBACK'].includes(row.status)||row.outcome==='AI_FALLBACK';
function transaction(db,work){db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
function iso(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Invalid metering instant.');return date.toISOString();}
export function voiceUsagePeriod(db,ownerId,{at=new Date().toISOString()}={}){
  const row=db.prepare(`SELECT u.planStatus,u.trialEndsAt,b.stripeSubscriptionId,b.currentPeriodStartAt,b.currentPeriodEndAt,e.stateJson,e.ambiguous
    FROM users u LEFT JOIN billingAccounts b ON b.ownerId=u.id LEFT JOIN billingSubscriptionEvidence e ON e.ownerId=u.id AND e.stripeSubscriptionId=b.stripeSubscriptionId WHERE u.id=? AND u.role='owner'`).get(ownerId);
  if(!row)return null;
  if(row.planStatus==='trialing'){
    let facts;try{facts=JSON.parse(row.stateJson);}catch{}
    if(row.ambiguous||!Number.isSafeInteger(facts?.trialStart)||!Number.isSafeInteger(facts?.trialEnd)||facts.trialEnd<=facts.trialStart)return null;
    return {kind:'trial',start:iso(facts.trialStart*1000),end:iso(facts.trialEnd*1000)};
  }
  if(row.currentPeriodStartAt&&row.currentPeriodEndAt&&row.currentPeriodEndAt>row.currentPeriodStartAt){
    let facts;try{facts=JSON.parse(row.stateJson);}catch{}
    if(facts?.billingInterval==='annual'){
      const start=row.currentPeriodStartAt,end=row.currentPeriodEndAt;
      const anchor=facts.billingAnchor ? iso(facts.billingAnchor*1000):start;
      const period=allowancePeriods({start,end,interval:'annual',anchor:anchor<=start?anchor:start}).find(p=>p.start<=at&&p.end>at);
      return period?{kind:'paid',...period}:null;
    }
    return {kind:'paid',start:row.currentPeriodStartAt,end:row.currentPeriodEndAt};
  }
  return null;
}
export function createBillingVoiceUsage({database:db,clock=()=>new Date(),onUsage=()=>{}}={}){
  const get=(ownerId,callId)=>db.prepare('SELECT * FROM calls WHERE ownerId=? AND id=?').get(ownerId,callId);
  function begin(row,at){
    const prior=db.prepare('SELECT * FROM billingVoiceUsage WHERE ownerId=? AND callId=?').get(row.ownerId,row.id);
    if(prior)return prior;
    const period=voiceUsagePeriod(db,row.ownerId,{at});
    db.prepare(`INSERT INTO billingVoiceUsage(callId,ownerId,accountSid,callSid,connectedAt,usageKind,periodStartAt,periodEndAt) VALUES(?,?,?,?,?,?,?,?)`)
      .run(row.id,row.ownerId,row.accountSid,row.callSid,at,period?.kind||'unknown',period?.start||null,period?.end||null);
    return db.prepare('SELECT * FROM billingVoiceUsage WHERE ownerId=? AND callId=?').get(row.ownerId,row.id);
  }
  function bound(context,callId){
    const row=get(context.ownerId,callId);
    if(!row||row.callSid!==context.callSid||row.accountSid!==context.accountSid||row.callerNumber!==context.from||row.destinationNumber!==context.to)throw Error('Metering call binding mismatch.');return row;
  }
  function writeMinutes(row,seconds){
    const minutes=excluded(row)?0:Math.ceil(seconds/60);
    db.prepare('UPDATE calls SET duration=?,minutesBilled=? WHERE ownerId=? AND id=?').run(seconds,minutes,row.ownerId,row.id);
    return minutes;
  }
  return Object.freeze({
    start(context,callId){const result=transaction(db,()=>begin(bound(context,callId),iso(clock())));onUsage(context.ownerId);return result;},
    finish(context,callId,completion=null){const result=transaction(db,()=>{
      const row=bound(context,callId),usage=db.prepare('SELECT * FROM billingVoiceUsage WHERE ownerId=? AND callId=?').get(row.ownerId,row.id);
      // A late asynchronous media close cannot turn a recorded fallback into
      // a billable call or overwrite an already completed lifecycle outcome.
      if(completion&&!['COMPLETED','FAILED','FALLBACK','AI_FALLBACK'].includes(row.status)&&row.outcome!=='AI_FALLBACK'){
        db.prepare('UPDATE calls SET status=?,outcome=?,failureCode=?,streamSid=?,completedAt=?,updatedAt=? WHERE ownerId=? AND id=?').run(completion.status,completion.outcome,completion.failureCode,completion.streamSid,iso(clock()),iso(clock()),row.ownerId,row.id);
      }
      if(!usage)return 0;
      const end=usage.completedAt||iso(clock());
      const seconds=usage.localDurationSeconds??Math.max(0,Math.ceil((Date.parse(end)-Date.parse(usage.connectedAt))/1000));
      db.prepare('UPDATE billingVoiceUsage SET completedAt=?,localDurationSeconds=? WHERE ownerId=? AND callId=?').run(end,seconds,row.ownerId,row.id);
      return writeMinutes(get(row.ownerId,row.id),usage.providerDurationSeconds??seconds);
    });onUsage(context.ownerId);return result;},
    // Called only after official SDK signature/account validation. A current
    // phone-number lookup cannot reassign historic calls to another tenant.
    providerComplete(params){let ownerId;const result=transaction(db,()=>{
      if(!terminal.has(params.CallStatus)||!/^CA[0-9a-f]{32}$/i.test(params.CallSid||'')||!/^\d+$/.test(params.CallDuration||''))throw Error('Invalid completed-call receipt.');
      const seconds=Number(params.CallDuration);if(!Number.isSafeInteger(seconds))throw Error('Invalid call duration.');
      const row=db.prepare('SELECT * FROM calls WHERE accountSid=? AND callSid=?').get(params.AccountSid,params.CallSid);
      if(!row||row.callerNumber!==params.From||row.destinationNumber!==params.To||params.Direction&&params.Direction!=='inbound')throw Error('Completed call binding mismatch.');
      ownerId=row.ownerId;
      const usage=begin(row,row.createdAt);
      const digest=createHash('sha256').update(JSON.stringify([params.AccountSid,params.CallSid,params.From,params.To,params.CallStatus,seconds])).digest('hex');
      if(usage.providerDigest&&usage.providerDigest!==digest)throw Error('Conflicting completed-call receipt.');
      db.prepare('UPDATE billingVoiceUsage SET providerDurationSeconds=?,providerDigest=?,completedAt=COALESCE(completedAt,?) WHERE ownerId=? AND callId=?').run(seconds,digest,iso(clock()),row.ownerId,row.id);
      return writeMinutes(row,seconds);
    });onUsage(ownerId);return result;},
    minutesUsed(ownerId){
      const period=voiceUsagePeriod(db,ownerId,{at:iso(clock())});if(!period)return null;
      // Attribution is by call connection time. An in-progress call finishes
      // across the boundary and belongs to the period in which it connected.
      const row=db.prepare(`SELECT COALESCE(SUM(c.minutesBilled),0) n FROM calls c
        WHERE c.ownerId=? AND COALESCE(c.spamFiltered,0)=0
        AND COALESCE(c.status,'') NOT IN ('FALLBACK','AI_FALLBACK') AND COALESCE(c.outcome,'')!='AI_FALLBACK'
        AND COALESCE((SELECT v.connectedAt FROM billingVoiceUsage v WHERE v.ownerId=c.ownerId AND v.callId=c.id),c.createdAt)>=?
        AND COALESCE((SELECT v.connectedAt FROM billingVoiceUsage v WHERE v.ownerId=c.ownerId AND v.callId=c.id),c.createdAt)<?`).get(ownerId,period.start,period.end);
      return row.n;
    }
  });
}
