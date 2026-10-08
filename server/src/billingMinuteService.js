import {withBillingLease,billingProviderRead,billingProviderError} from './billingProvider.js';
import {recordOwnerUsagePeriods} from './billingUsagePeriods.js';
import {billingUsageId,MINUTE_PLANS,MINUTE_THRESHOLDS,usageAmounts,usageOwnerQuery,usageTransaction} from './billingUsagePolicy.js';
import {voiceUsagePeriod} from './billingVoiceUsage.js';
import {createOwnerEmailDelivery} from './ownerEmailDelivery.js';
import {recordUsageInvoicePayment} from './billingCustomerLifecycle.js';

const SAFE_RETRY_MS=23*60*60*1000,CHARGE_THRESHOLD_CENTS=2500;
export function createBillingMinuteService({database,ownerQuery,priceIds={},paymentProvider,emailProvider,enabled=()=>false,clock=()=>new Date(),onError=()=>{}}={}) {
  const query=usageOwnerQuery(database,ownerQuery),now=()=>clock().toISOString();
  const emails=createOwnerEmailDelivery({database,ownerQuery,provider:emailProvider,enabled,clock});
  const charges=period=>query('SELECT * FROM billingUsageCharges WHERE ownerId=? AND periodId=? ORDER BY sequence').all(period.ownerId,period.id);
  function endAt(period){
    const row=query("SELECT serviceEndsAt FROM users WHERE id=@ownerId AND role='owner'").get({ownerId:period.ownerId});
    return row?.serviceEndsAt&&row.serviceEndsAt<period.endAt?row.serviceEndsAt:period.endAt;
  }
  function trialPeriod(ownerId){
    const period=voiceUsagePeriod(database,ownerId,{at:now(),ownerQuery});
    return period?.kind==='trial'?{ownerId,kind:'trial',id:billingUsageId('trial-minutes-v1',ownerId,period.start),startAt:period.start,endAt:period.end}:null;
  }
  function usage(period){
    const rows=query(`SELECT c.id,c.status,c.minutesBilled,v.usageKind,v.providerDigest,v.providerDurationSeconds,v.completedAt
      FROM calls c LEFT JOIN billingVoiceUsage v ON v.ownerId=c.ownerId AND v.callId=c.id
      WHERE c.ownerId=? AND COALESCE(v.connectedAt,c.createdAt)>=? AND COALESCE(v.connectedAt,c.createdAt)<?
      AND COALESCE(c.spamFiltered,0)=0 AND COALESCE(c.status,'') NOT IN ('FAILED','HUMAN_ROUTING','FALLBACK','AI_FALLBACK')
      AND COALESCE(c.outcome,'') NOT IN ('AI_FALLBACK','OPERATOR_OFF')
      AND ${period.kind==='trial'?"v.usageKind='trial'":"COALESCE(v.usageKind,'unknown')!='trial'"} ORDER BY c.id`)
      .all(period.ownerId,period.startAt,endAt(period));
    let minutes=0,confirmedMinutes=0,pending=0;const proof=[];
    for(const row of rows){
      if(!Number.isSafeInteger(row.minutesBilled)||row.minutesBilled<0)throw Error('Invalid stored minute count.');
      minutes+=row.minutesBilled;
      const verified=['COMPLETED','RECOVERED'].includes(row.status)&&row.completedAt&&typeof row.providerDigest==='string'&&/^[0-9a-f]{64}$/.test(row.providerDigest)&&
        Number.isSafeInteger(row.providerDurationSeconds)&&row.providerDurationSeconds>=0&&Math.ceil(row.providerDurationSeconds/60)===row.minutesBilled;
      if(!verified)pending++;
      else {confirmedMinutes+=row.minutesBilled;proof.push([row.id,row.providerDigest,row.providerDurationSeconds,row.minutesBilled]);}
    }
    const totals=period.kind==='trial'?{minutesUsed:minutes,includedMinutes:60,minutesLeft:Math.max(0,60-minutes),overageMinutes:0,overageCents:0,upgradeMessage:null}:usageAmounts(period.plan,minutes);
    return {...totals,confirmedMinutesUsed:confirmedMinutes,unconfirmedCalls:pending,proof,digest:billingUsageId('duration-proof-v1',proof)};
  }
  function warnings(period,totals){
    if(period.startAt>now()||endAt(period)<=now())return;
    const trial=period.kind==='trial',included=trial?60:MINUTE_PLANS[period.plan].included,used=totals.confirmedMinutesUsed;
    const owner=query("SELECT email FROM users WHERE id=@ownerId AND role='owner'").get({ownerId:period.ownerId});
    if(!owner)throw Error('Owner unavailable.');
    for(const threshold of trial?[30,0]:MINUTE_THRESHOLDS){
      if(used<included-threshold)continue;
      const id=billingUsageId('minute-warning-v1',period.ownerId,period.id,threshold);
      const message=trial?(threshold===0?'Your included trial minutes have run out. Trial minutes are not billed as overage.':`You have reached the ${threshold}-minutes-left warning for your trial.`)
        :threshold===0?'Included minutes have run out; overage at $0.35/min now applies.':`You have reached the ${threshold}-minutes-left warning for this billing month.`;
      const inserted=query(`INSERT OR IGNORE INTO ${trial?'billingTrialMinuteAlerts':'billingMinuteAlerts'}(id,ownerId,periodId,threshold,message,createdAt) VALUES(?,?,?,?,?,?)`)
        .run(id,period.ownerId,period.id,threshold,message,now());
      if(!Number(inserted.changes))continue;
      const subject=threshold===0?'Your included voice minutes have run out':`${threshold} voice minutes left: usage warning`;
      const text=`${message}\n${trial?'Trial':'Billing month'}: ${period.startAt.slice(0,10)} to ${period.endAt.slice(0,10)}.\nMinutes used when this warning was created: ${used}. Minutes left: ${Math.max(0,included-used)}.\n${trial?'Trial minutes are not billed as overage.':'Extra minutes cost $0.35 per minute.'} View current usage and billing status in your dashboard.`;
      query(`INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt)
        VALUES(?,?,'billing.minute_warning',?,?,'PENDING',?,?)`).run(id,period.ownerId,period.id,JSON.stringify({id,periodId:period.id,threshold,message}),now(),now());
      emails.queue({id,ownerId:period.ownerId,message:{to:owner.email,subject,text}});
    }
  }
  function syncOwner(ownerId){
    return usageTransaction(database,()=>{
      const current=recordOwnerUsagePeriods({database,ownerQuery,ownerId,priceIds,at:now()}),warningPeriod=current||trialPeriod(ownerId);
      if(warningPeriod)warnings(warningPeriod,usage(warningPeriod));return current;
    });
  }
  function snapshot(ownerId){
    const current=syncOwner(ownerId);
    const owner=query("SELECT plan,planStatus,annualPaidThroughAt FROM users WHERE id=@ownerId AND role='owner'").get({ownerId});
    if(!owner)throw Error('Owner unavailable.');
    const period=current||(owner.planStatus==='trialing'?trialPeriod(ownerId):null);
    let data=period?{status:period.kind==='trial'?'TRIAL':'PAID',plan:owner.plan,periodId:period.id,periodStartAt:period.startAt,periodEndAt:endAt(period),billingInterval:period.billingInterval,...usage(period)}:null;
    if(data){
      const paid=charges(period).filter(c=>c.status==='PAID').reduce((n,c)=>n+c.amountCents,0);
      data.chargedCents=paid;data.unchargedCents=Math.max(0,data.overageCents-paid);delete data.digest;delete data.proof;
      if(data.unconfirmedCalls){data.savingsCents=0;data.upgradeMessage=null;}
    }
    data??={status:'UNAVAILABLE',plan:owner.plan,minutesUsed:null,minutesLeft:null,includedMinutes:MINUTE_PLANS[owner.plan]?.included??null,overageCents:null,upgradeMessage:null,message:'Minute usage is waiting for verified billing-period information.'};
    data.annualPaidThroughAt=owner.annualPaidThroughAt||null;
    data.warnings=period?query(`SELECT a.id,a.threshold,a.message,a.createdAt,e.status emailStatus FROM ${period.kind==='trial'?'billingTrialMinuteAlerts':'billingMinuteAlerts'} a
      LEFT JOIN ownerEmailDeliveries e ON e.ownerId=a.ownerId AND e.id=a.id WHERE a.ownerId=? AND a.periodId=? ORDER BY a.threshold DESC`).all(ownerId,period.id):[];
    data.pendingCharges=[];
    for(const p of query('SELECT * FROM billingUsagePeriods WHERE ownerId=? AND startAt<=? ORDER BY startAt DESC').all(ownerId,now())){
      const totals=usage(p),rows=charges(p),remaining=Math.max(0,totals.overageCents-rows.reduce((n,c)=>n+c.amountCents,0));
      for(const charge of rows.filter(c=>c.status!=='PAID'))data.pendingCharges.push({id:charge.id,periodId:p.id,startAt:p.startAt,endAt:endAt(p),amountCents:charge.amountCents,status:charge.status,
        message:charge.status==='REVIEW'?'Overage needs manual confirmation; no duplicate charge will be submitted.':charge.providerInvoiceId?'Overage invoice is unpaid. Open Manage billing to resolve payment.':charge.operationsJson==='{}'?'Remaining overage has not yet been submitted.':'Overage charge is awaiting provider confirmation.'});
      if(endAt(p)<=now()&&(remaining||totals.unconfirmedCalls))data.pendingCharges.push({id:p.id+'-remainder',periodId:p.id,startAt:p.startAt,endAt:endAt(p),amountCents:remaining,status:'PENDING',
        message:totals.unconfirmedCalls?'Overage pending: call durations are awaiting confirmation.':'Remaining overage has not yet been charged.'});
    }
    return data;
  }
  function proofMatches(charge,totals){
    if(!charge.usageProofJson)return charge.usageDigest===totals.digest; // Legacy frozen monthly receipt.
    const actual=new Map(totals.proof.map(row=>[row[0],JSON.stringify(row)]));
    return JSON.parse(charge.usageProofJson).every(row=>actual.get(row[0])===JSON.stringify(row));
  }
  async function chargePeriod(ownerId,periodId){
    if(!enabled()||!paymentProvider)return false;
    try{return await withBillingLease(database,ownerId,async assertLease=>{
      const period=query('SELECT * FROM billingUsagePeriods WHERE ownerId=? AND id=?').get(ownerId,periodId);
      if(!period||period.startAt>now())return false;
      const totals=usage(period),rows=charges(period);
      const erased=query('SELECT dataDeletedAt FROM billingCancellations WHERE ownerId=? AND stripeSubscriptionId=? AND dataDeletedAt<=?').get(ownerId,period.stripeSubscriptionId,now());
      // Retention deliberately removes calls, never their frozen financial
      // evidence. Missing calls after that recorded erasure are not revisions.
      for(const row of rows)if(!erased&&!proofMatches(row,totals)){
        query("UPDATE billingUsageCharges SET status='REVIEW',lastError='USAGE_CHANGED_AFTER_SUBMISSION',updatedAt=? WHERE ownerId=? AND id=?").run(now(),ownerId,row.id);return false;
      }
      // An unresolved invoice or uncertain provider mutation reserves its cents
      // and blocks new invoices for this owner, even in another allowance month.
      const firstUnpaid=()=>query(`SELECT c.* FROM billingUsageCharges c JOIN billingUsagePeriods p ON p.ownerId=c.ownerId AND p.id=c.periodId
        WHERE c.ownerId=? AND c.status!='PAID' ORDER BY p.startAt,c.sequence LIMIT 1`).get(ownerId);
      let charge=firstUnpaid();const closed=endAt(period)<=now();
      const amountCents=usageAmounts(period.plan,totals.confirmedMinutesUsed).overageCents-rows.reduce((n,c)=>n+c.amountCents,0);
      // At close, retain a confirmed remainder even while another invoice
      // blocks collection. This is a local reservation, not a Stripe charge.
      if(!erased&&(!charge||closed)&&amountCents>0&&(closed||amountCents>=CHARGE_THRESHOLD_CENTS)){
        const sequence=(rows.at(-1)?.sequence||0)+1,id=sequence===1?periodId:billingUsageId('minute-installment-v1',periodId,sequence);
        usageTransaction(database,()=>{
          assertLease();query(`INSERT INTO billingUsageCharges(id,periodId,ownerId,sequence,amountCents,minutesUsed,usageDigest,usageProofJson,nextAttemptAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
            .run(id,periodId,ownerId,sequence,amountCents,totals.confirmedMinutesUsed,totals.digest,JSON.stringify(totals.proof),now(),now(),now());
        });
        charge=firstUnpaid();
      }
      if(!charge||charge.periodId!==periodId||charge.status==='REVIEW'||charge.nextAttemptAt>now())return false;
      const journal={
        save(patch){assertLease();const fields=Object.keys(patch);if(fields.some(f=>!['providerInvoiceId','providerItemId','currency'].includes(f)))throw Error('Invalid receipt.');
          query(`UPDATE billingUsageCharges SET ${fields.map(f=>f+'=?').join(',')},updatedAt=? WHERE ownerId=? AND id=?`).run(...fields.map(f=>patch[f]),now(),ownerId,charge.id);},
        async mutate(name,call,{resourceUpdate=false}={}){
          const row=query('SELECT operationsJson FROM billingUsageCharges WHERE ownerId=? AND id=?').get(ownerId,charge.id),operations=JSON.parse(row.operationsJson);
          assertLease();if(!resourceUpdate&&operations[name]&&clock().getTime()-Date.parse(operations[name])>=SAFE_RETRY_MS)throw billingProviderError('BILLING_OVERAGE_CONFIRMATION_REQUIRED');
          if(!operations[name]){operations[name]=now();query('UPDATE billingUsageCharges SET operationsJson=?,updatedAt=? WHERE ownerId=? AND id=?').run(JSON.stringify(operations),now(),ownerId,charge.id);}
          const result=await billingProviderRead(call);assertLease();return result;
        }
      };
      try{
        const result=await paymentProvider.submit(period,charge,journal);assertLease();
        if(!['SUBMITTED','PAID'].includes(result?.status)||!result.providerInvoiceId)throw Error('Unconfirmed overage invoice.');
        query('UPDATE billingUsageCharges SET status=?,providerInvoiceId=?,lastError=NULL,nextAttemptAt=?,updatedAt=? WHERE ownerId=? AND id=?')
          .run(result.status,result.providerInvoiceId,new Date(clock().getTime()+60000).toISOString(),now(),ownerId,charge.id);
        if(result.invoice&&(result.status==='PAID'||result.invoice.attempted))recordUsageInvoicePayment(database,{ownerQuery,ownerId,period,charge,invoice:result.invoice,at:now()});
        return true;
      }catch(error){assertLease();query("UPDATE billingUsageCharges SET status='PENDING',lastError=?,nextAttemptAt=?,updatedAt=? WHERE ownerId=? AND id=?")
          .run(error.code==='BILLING_OVERAGE_CONFIRMATION_REQUIRED'?'BILLING_OVERAGE_CONFIRMATION_REQUIRED':'BILLING_PROVIDER_PENDING',new Date(clock().getTime()+60000).toISOString(),now(),ownerId,charge.id);return false;}
    },{clock});}catch(error){if(error.code==='BILLING_OPERATION_IN_PROGRESS'||error.code==='BILLING_LEASE_LOST')return false;throw error;}
  }
  async function processOwner(ownerId){
    syncOwner(ownerId);
    for(const period of query('SELECT id FROM billingUsagePeriods WHERE ownerId=? AND startAt<=? ORDER BY startAt').all(ownerId,now()))await chargePeriod(ownerId,period.id);
    for(let i=0;i<6;i++)if(!await emails.deliverOne(ownerId))break;
  }
  let lastOwnerId='',running=null,stopped=false,timer;
  async function tick(){
    if(running)return running;
    running=(async()=>{
      // Platform inventory contains only IDs; all records below are owner-bound.
      let owners=database.prepare("SELECT id ownerId FROM users WHERE role='owner' AND id>? ORDER BY id LIMIT 16").all(lastOwnerId);
      if(!owners.length){lastOwnerId='';owners=database.prepare("SELECT id ownerId FROM users WHERE role='owner' ORDER BY id LIMIT 16").all();}
      for(const {ownerId} of owners){try{await processOwner(ownerId);}catch{onError('MINUTE_BILLING_PENDING');}finally{lastOwnerId=ownerId;}}
    })();try{await running;}finally{running=null;}
  }
  function start({intervalMs=60000,setTimer=setInterval,clearTimer=clearInterval,onError=()=>{}}={}){
    const run=()=>{if(!stopped)void tick().catch(()=>onError('MINUTE_BILLING_PENDING'));};run();timer=setTimer(run,intervalMs);timer?.unref?.();
    return async()=>{stopped=true;clearTimer(timer);if(running)await running;};
  }
  function applyInvoiceEvent(event){
    const invoice=event?.data?.object,id=invoice?.metadata?.otc_usage_period;
    if(!['invoice.paid','invoice.payment_failed'].includes(event?.type)||typeof id!=='string')return false;
    const binding=database.prepare('SELECT ownerId FROM billingUsagePeriods WHERE id=?').get(id);
    if(!binding)return false;
    const period=query('SELECT * FROM billingUsagePeriods WHERE ownerId=? AND id=?').get(binding.ownerId,id);
    const charge=query('SELECT * FROM billingUsageCharges WHERE ownerId=? AND periodId=? AND id=?').get(binding.ownerId,id,invoice.metadata.otc_usage_charge||id);
    if(!charge||invoice.customer!==period.stripeCustomerId||invoice.metadata.otc_usage_digest!==charge.usageDigest)throw Error('Usage invoice binding mismatch.');
    if(!charge.providerInvoiceId)return true;
    if(invoice.id!==charge.providerInvoiceId||invoice.subtotal!==charge.amountCents||invoice.currency!==charge.currency)throw Error('Usage invoice receipt mismatch.');
    if(event.type==='invoice.paid'&&invoice.status==='paid'&&invoice.amount_remaining===0){
      query("UPDATE billingUsageCharges SET status='PAID',lastError=NULL,updatedAt=? WHERE ownerId=? AND id=? AND status!='REVIEW'").run(now(),binding.ownerId,charge.id);
    }else if(event.type==='invoice.payment_failed'&&charge.status!=='PAID'){
      query("UPDATE billingUsageCharges SET lastError='PAYMENT_PENDING',nextAttemptAt=?,updatedAt=? WHERE ownerId=? AND id=?").run(now(),now(),binding.ownerId,charge.id);
    }
    if(event.type==='invoice.paid'||charge.status!=='PAID')recordUsageInvoicePayment(database,{ownerQuery,ownerId:binding.ownerId,period,charge,invoice,at:Number.isInteger(event.created)?new Date(event.created*1000).toISOString():now()});
    return true;
  }
  return {syncOwner,snapshot,usage,chargePeriod,processOwner,tick,start,emails,applyInvoiceEvent};
}
