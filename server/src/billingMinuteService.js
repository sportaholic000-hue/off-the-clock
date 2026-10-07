import {withBillingLease,billingProviderRead,billingProviderError} from './billingProvider.js';
import {recordOwnerUsagePeriods} from './billingUsagePeriods.js';
import {billingUsageId,MINUTE_PLANS,MINUTE_THRESHOLDS,usageAmounts,usageOwnerQuery,usageTransaction} from './billingUsagePolicy.js';
import {createBillingVoiceUsage,voiceUsagePeriod} from './billingVoiceUsage.js';
import {createOwnerEmailDelivery} from './ownerEmailDelivery.js';

const SAFE_RETRY_MS=23*60*60*1000;
export function createBillingMinuteService({database,ownerQuery,priceIds={},paymentProvider,emailProvider,enabled=()=>false,clock=()=>new Date(),onError=()=>{}}={}) {
  const query=usageOwnerQuery(database,ownerQuery),now=()=>clock().toISOString();
  const emails=createOwnerEmailDelivery({database,ownerQuery,provider:emailProvider,enabled,clock});
  function usage(period){
    const rows=query(`SELECT c.id,c.status,c.minutesBilled,v.usageKind,v.providerDigest,v.providerDurationSeconds,v.completedAt
      FROM calls c LEFT JOIN billingVoiceUsage v ON v.ownerId=c.ownerId AND v.callId=c.id
      WHERE c.ownerId=? AND COALESCE(v.connectedAt,c.createdAt)>=? AND COALESCE(v.connectedAt,c.createdAt)<?
      AND COALESCE(c.spamFiltered,0)=0 AND COALESCE(c.status,'') NOT IN ('FALLBACK','AI_FALLBACK')
      AND COALESCE(c.outcome,'')!='AI_FALLBACK' AND COALESCE(v.usageKind,'unknown')!='trial' ORDER BY c.id`)
      .all(period.ownerId,period.startAt,period.endAt);
    let minutes=0,confirmedMinutes=0,pending=0;
    const proof=[];
    for(const row of rows){
      if(!Number.isSafeInteger(row.minutesBilled)||row.minutesBilled<0)throw Error('Invalid stored minute count.');
      minutes+=row.minutesBilled;
      const verified=row.usageKind==='paid'&&row.completedAt&&typeof row.providerDigest==='string'&&/^[0-9a-f]{64}$/.test(row.providerDigest)&&
        Number.isSafeInteger(row.providerDurationSeconds)&&row.providerDurationSeconds>=0&&Math.ceil(row.providerDurationSeconds/60)===row.minutesBilled;
      if(!verified)pending++;else confirmedMinutes+=row.minutesBilled;
      proof.push([row.id,row.providerDigest,row.providerDurationSeconds,row.minutesBilled]);
    }
    return {...usageAmounts(period.plan,minutes),confirmedMinutesUsed:confirmedMinutes,unconfirmedCalls:pending,digest:billingUsageId('duration-proof-v1',proof)};
  }
  function warnings(period,totals){
    if(period.startAt>now()||period.endAt<=now())return;
    // Local durations are provisional under F10. An irreversible warning must
    // not be triggered by a duration the signed provider receipt may reduce.
    totals=usageAmounts(period.plan,totals.confirmedMinutesUsed);
    const owner=query("SELECT email FROM users WHERE id=@ownerId AND role='owner'").get({ownerId:period.ownerId});
    if(!owner)throw Error('Owner unavailable.');
    for(const threshold of MINUTE_THRESHOLDS){
      if(totals.minutesUsed<MINUTE_PLANS[period.plan].included-threshold)continue;
      const id=billingUsageId('minute-warning-v1',period.ownerId,period.id,threshold);
      const message=threshold===0?'Included minutes have run out; overage at $0.35/min now applies.'
        :`You have reached the ${threshold}-minutes-left warning for this billing month.`;
      const inserted=query('INSERT OR IGNORE INTO billingMinuteAlerts(id,ownerId,periodId,threshold,message,createdAt) VALUES(?,?,?,?,?,?)')
        .run(id,period.ownerId,period.id,threshold,message,now());
      if(!Number(inserted.changes))continue;
      const subject=threshold===0?'Your included voice minutes have run out':`${threshold} voice minutes left: usage warning`;
      const text=`${message}\nBilling month: ${period.startAt.slice(0,10)} to ${period.endAt.slice(0,10)}.\nMinutes used when this warning was created: ${totals.minutesUsed}. Minutes left: ${totals.minutesLeft}.\nExtra minutes cost $0.35 per minute. View current usage and billing status in your dashboard.`;
      query(`INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt)
        VALUES(?,?,'billing.minute_warning',?,?,'PENDING',?,?)`).run(id,period.ownerId,period.id,JSON.stringify({id,periodId:period.id,threshold,message}),now(),now());
      emails.queue({id,ownerId:period.ownerId,message:{to:owner.email,subject,text}});
    }
  }
  function syncOwner(ownerId){
    return usageTransaction(database,()=>{
      const current=recordOwnerUsagePeriods({database,ownerQuery,ownerId,priceIds,at:now()});
      if(current)warnings(current,usage(current));
      return current;
    });
  }
  function snapshot(ownerId){
    const current=syncOwner(ownerId);
    const owner=query("SELECT plan,planStatus,annualPaidThroughAt FROM users WHERE id=@ownerId AND role='owner'").get({ownerId});
    if(!owner)throw Error('Owner unavailable.');
    let data;
    if(current){
      data={status:'PAID',plan:current.plan,periodId:current.id,periodStartAt:current.startAt,periodEndAt:current.endAt,billingInterval:current.billingInterval,...usage(current)};
      delete data.digest;
      if(data.unconfirmedCalls){data.savingsCents=0;data.upgradeMessage=null;}
    }else if(owner.planStatus==='trialing'){
      const period=voiceUsagePeriod(database,ownerId,{at:now()}),used=createBillingVoiceUsage({database,clock}).minutesUsed(ownerId);
      data=period&&Number.isSafeInteger(used)?{status:'TRIAL',plan:owner.plan,minutesUsed:used,includedMinutes:60,minutesLeft:Math.max(0,60-used),overageMinutes:0,overageCents:0,upgradeMessage:null,periodStartAt:period.start,periodEndAt:period.end}:null;
    }
    data??={status:'UNAVAILABLE',plan:owner.plan,minutesUsed:null,minutesLeft:null,includedMinutes:MINUTE_PLANS[owner.plan]?.included??null,overageCents:null,upgradeMessage:null,message:'Minute usage is waiting for verified billing-period information.'};
    data.annualPaidThroughAt=owner.annualPaidThroughAt||null;
    data.warnings=current?query(`SELECT a.id,a.threshold,a.message,a.createdAt,e.status emailStatus FROM billingMinuteAlerts a
      LEFT JOIN ownerEmailDeliveries e ON e.ownerId=a.ownerId AND e.id=a.id WHERE a.ownerId=? AND a.periodId=? ORDER BY a.threshold DESC`).all(ownerId,current.id):[];
    data.pendingCharges=[];
    const closed=query(`SELECT p.*,c.status chargeStatus,c.lastError,c.amountCents frozenCents FROM billingUsagePeriods p
      LEFT JOIN billingUsageCharges c ON c.ownerId=p.ownerId AND c.periodId=p.id WHERE p.ownerId=? AND p.endAt<=? AND COALESCE(c.status,'')!='PAID' ORDER BY p.startAt DESC`).all(ownerId,now());
    for(const period of closed){const totals=usage(period);if(totals.overageCents||period.frozenCents||totals.unconfirmedCalls){data.pendingCharges.push({periodId:period.id,startAt:period.startAt,endAt:period.endAt,amountCents:period.frozenCents??totals.overageCents,
      status:period.chargeStatus||'PENDING',message:totals.unconfirmedCalls?'Overage pending: call durations are awaiting confirmation.':period.chargeStatus==='REVIEW'?'Overage pending confirmation; no duplicate charge will be submitted.':period.chargeStatus==='SUBMITTED'?'Overage invoice submitted; payment is pending.':'Overage charge pending. Your usage is saved and will be retried safely.'});}}
    return data;
  }
  async function chargePeriod(ownerId,periodId){
    if(!enabled()||!paymentProvider)return false;
    try{return await withBillingLease(database,ownerId,async assertLease=>{
      const period=query('SELECT * FROM billingUsagePeriods WHERE ownerId=? AND id=?').get(ownerId,periodId);
      if(!period||period.endAt>now())return false;
      const totals=usage(period);
      let charge=query('SELECT * FROM billingUsageCharges WHERE ownerId=? AND periodId=?').get(ownerId,periodId);
      if(charge&&(charge.amountCents!==totals.overageCents||charge.usageDigest!==totals.digest||totals.unconfirmedCalls)){
        query("UPDATE billingUsageCharges SET status='REVIEW',lastError='USAGE_CHANGED_AFTER_SUBMISSION',updatedAt=? WHERE ownerId=? AND periodId=?").run(now(),ownerId,periodId);return false;
      }
      if(charge?.status==='PAID')return false;
      if(totals.unconfirmedCalls||!totals.overageCents)return false;
      usageTransaction(database,()=>{
        assertLease();query(`INSERT OR IGNORE INTO billingUsageCharges(periodId,ownerId,amountCents,minutesUsed,usageDigest,nextAttemptAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)`)
          .run(periodId,ownerId,totals.overageCents,totals.minutesUsed,totals.digest,now(),now(),now());
      });
      charge=query('SELECT * FROM billingUsageCharges WHERE ownerId=? AND periodId=?').get(ownerId,periodId);
      if(charge.nextAttemptAt>now()||charge.status==='REVIEW')return false;
      const journal={
        save(patch){assertLease();const fields=Object.keys(patch);if(fields.some(f=>!['providerInvoiceId','providerItemId','currency'].includes(f)))throw Error('Invalid receipt.');
          query(`UPDATE billingUsageCharges SET ${fields.map(f=>f+'=?').join(',')},updatedAt=? WHERE ownerId=? AND periodId=?`).run(...fields.map(f=>patch[f]),now(),ownerId,periodId);},
        async mutate(name,call,{resourceUpdate=false}={}){
          const row=query('SELECT operationsJson FROM billingUsageCharges WHERE ownerId=? AND periodId=?').get(ownerId,periodId),operations=JSON.parse(row.operationsJson);
          assertLease();if(!resourceUpdate&&operations[name]&&clock().getTime()-Date.parse(operations[name])>=SAFE_RETRY_MS)throw billingProviderError('BILLING_OVERAGE_CONFIRMATION_REQUIRED');
          if(!operations[name]){operations[name]=now();query('UPDATE billingUsageCharges SET operationsJson=?,updatedAt=? WHERE ownerId=? AND periodId=?').run(JSON.stringify(operations),now(),ownerId,periodId);}
          const result=await billingProviderRead(call);assertLease();return result;
        }
      };
      try{
        const result=await paymentProvider.submit(period,charge,journal);assertLease();
        if(!['SUBMITTED','PAID'].includes(result?.status)||!result.providerInvoiceId)throw Error('Unconfirmed overage invoice.');
        query('UPDATE billingUsageCharges SET status=?,providerInvoiceId=?,lastError=NULL,nextAttemptAt=?,updatedAt=? WHERE ownerId=? AND periodId=?')
          .run(result.status,result.providerInvoiceId,new Date(clock().getTime()+60000).toISOString(),now(),ownerId,periodId);
        return true;
      }catch(error){assertLease();query("UPDATE billingUsageCharges SET status='PENDING',lastError=?,nextAttemptAt=?,updatedAt=? WHERE ownerId=? AND periodId=?")
          .run(error.code==='BILLING_OVERAGE_CONFIRMATION_REQUIRED'?'BILLING_OVERAGE_CONFIRMATION_REQUIRED':'BILLING_PROVIDER_PENDING',new Date(clock().getTime()+60000).toISOString(),now(),ownerId,periodId);return false;}
    },{clock});}catch(error){if(error.code==='BILLING_OPERATION_IN_PROGRESS'||error.code==='BILLING_LEASE_LOST')return false;throw error;}
  }
  async function processOwner(ownerId){
    syncOwner(ownerId);
    const periods=query(`SELECT p.id FROM billingUsagePeriods p LEFT JOIN billingUsageCharges c ON c.ownerId=p.ownerId AND c.periodId=p.id
      WHERE p.ownerId=? AND p.endAt<=? AND COALESCE(c.status,'')!='REVIEW' AND (c.nextAttemptAt IS NULL OR c.nextAttemptAt<=?) ORDER BY p.startAt`).all(ownerId,now(),now());
    for(const period of periods)await chargePeriod(ownerId,period.id);
    for(let i=0;i<6;i++)if(!await emails.deliverOne(ownerId))break;
  }
  let lastOwnerId='',running=null,stopped=false,timer;
  async function tick(){
    if(running)return running;
    running=(async()=>{
      // Platform worker inventory: IDs only. All subsequent records and writes
      // use the tenant-bound query interface, including retries after restart.
      let owners=database.prepare("SELECT id ownerId FROM users WHERE role='owner' AND id>? ORDER BY id LIMIT 16").all(lastOwnerId);
      if(!owners.length){lastOwnerId='';owners=database.prepare("SELECT id ownerId FROM users WHERE role='owner' ORDER BY id LIMIT 16").all();}
      for(const {ownerId} of owners){
        try{await processOwner(ownerId);}catch{onError('MINUTE_BILLING_PENDING');}
        finally{lastOwnerId=ownerId;}
      }
    })();try{await running;}finally{running=null;}
  }
  function start({intervalMs=60000,setTimer=setInterval,clearTimer=clearInterval,onError=()=>{}}={}){
    const run=()=>{if(!stopped)void tick().catch(()=>onError('MINUTE_BILLING_PENDING'));};run();timer=setTimer(run,intervalMs);timer?.unref?.();
    return async()=>{stopped=true;clearTimer(timer);if(running)await running;};
  }
  function applyInvoiceEvent(event){
    const invoice=event?.data?.object,id=invoice?.metadata?.otc_usage_period;
    if(!['invoice.paid','invoice.payment_failed'].includes(event?.type)||typeof id!=='string')return false;
    // Signed provider callback routing is a platform identity lookup. The
    // receipt and every mutation below are then bound to the resolved owner.
    const binding=database.prepare('SELECT ownerId FROM billingUsagePeriods WHERE id=?').get(id);
    if(!binding)return false;
    const period=query('SELECT * FROM billingUsagePeriods WHERE ownerId=? AND id=?').get(binding.ownerId,id);
    const charge=query('SELECT * FROM billingUsageCharges WHERE ownerId=? AND periodId=?').get(binding.ownerId,id);
    if(!charge||invoice.customer!==period.stripeCustomerId||invoice.metadata.otc_usage_digest!==charge.usageDigest)throw Error('Usage invoice binding mismatch.');
    if(!charge.providerInvoiceId)return true; // Response loss is reconciled by the worker's provider read.
    if(invoice.id!==charge.providerInvoiceId||invoice.subtotal!==charge.amountCents||invoice.currency!==charge.currency)throw Error('Usage invoice receipt mismatch.');
    if(event.type==='invoice.paid'&&invoice.status==='paid'&&invoice.amount_remaining===0){
      query("UPDATE billingUsageCharges SET status='PAID',lastError=NULL,updatedAt=? WHERE ownerId=? AND periodId=? AND status!='REVIEW'").run(now(),binding.ownerId,id);
    }else if(event.type==='invoice.payment_failed'&&charge.status!=='PAID'){
      query("UPDATE billingUsageCharges SET lastError='PAYMENT_PENDING',nextAttemptAt=?,updatedAt=? WHERE ownerId=? AND periodId=?").run(now(),now(),binding.ownerId,id);
    }
    return true;
  }
  return {syncOwner,snapshot,usage,chargePeriod,processOwner,tick,start,emails,applyInvoiceEvent};
}
