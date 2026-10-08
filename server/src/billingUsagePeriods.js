import {allowancePeriods,billingUsageId,MINUTE_PLANS,usageOwnerQuery} from './billingUsagePolicy.js';

export function recordOwnerUsagePeriods({database,ownerQuery,ownerId,priceIds={},at=new Date().toISOString()}) {
  const query=usageOwnerQuery(database,ownerQuery);
  const row=query(`SELECT b.*,u.plan,u.planStatus,u.annualPaidThroughAt,u.paidThroughAt,u.serviceEndsAt,e.stateJson,e.ambiguous
    FROM billingAccounts b JOIN users u ON u.id=b.ownerId LEFT JOIN billingSubscriptionEvidence e
    ON e.ownerId=b.ownerId AND e.stripeSubscriptionId=b.stripeSubscriptionId WHERE b.ownerId=?`).get(ownerId);
  if(!row||!MINUTE_PLANS[row.plan]||row.ambiguous||!row.stripeSubscriptionId||!row.currentPeriodStartAt||!row.currentPeriodEndAt||
    !['active','payment_failed','past_due','suspended','canceled'].includes(row.planStatus))return null;
  let facts;try{facts=JSON.parse(row.stateJson);}catch{return null;}
  const configured=Object.entries(priceIds[row.plan]||{}).find(([,id])=>id===row.stripePriceId)?.[0];
  const interval=configured||facts.billingInterval;
  if(!['monthly','annual'].includes(interval)||facts.status==='trialing')return null;
  const start=row.currentPeriodStartAt,end=row.currentPeriodEndAt;
  if(facts.trialEnd&&Date.parse(start)<facts.trialEnd*1000)return null;
  if(row.planStatus==='canceled'&&!(row.paidThroughAt>=end||interval==='annual'&&row.annualPaidThroughAt>=end))return null;
  const anchor=facts.billingAnchor ? new Date(facts.billingAnchor*1000).toISOString():start;
  const periods=allowancePeriods({start,end,interval,anchor:anchor<=start?anchor:start});
  for(const period of periods){
    const id=billingUsageId('minute-period-v1',ownerId,row.stripeSubscriptionId,period.start);
    // A plan change never resets the period identity. Closed/frozen receipts
    // retain their original terms; an open, unsubmitted month adopts the plan.
    query(`INSERT INTO billingUsagePeriods(id,ownerId,stripeCustomerId,stripeSubscriptionId,stripePriceId,plan,billingInterval,startAt,endAt,termStartAt,termEndAt,createdAt,updatedAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(ownerId,stripeSubscriptionId,startAt) DO UPDATE SET
      stripePriceId=excluded.stripePriceId,plan=excluded.plan,billingInterval=excluded.billingInterval,updatedAt=excluded.updatedAt
      WHERE billingUsagePeriods.endAt>? AND NOT EXISTS(SELECT 1 FROM billingUsageCharges c WHERE c.ownerId=billingUsagePeriods.ownerId AND c.periodId=billingUsagePeriods.id)`)
      .run(id,ownerId,row.stripeCustomerId,row.stripeSubscriptionId,row.stripePriceId,row.plan,interval,period.start,period.end,start,end,at,at,at);
  }
  return query('SELECT * FROM billingUsagePeriods WHERE ownerId=? AND stripeSubscriptionId=? AND startAt<=? AND endAt>? ORDER BY startAt DESC LIMIT 1')
    .get(ownerId,row.stripeSubscriptionId,at,at)||null;
}
