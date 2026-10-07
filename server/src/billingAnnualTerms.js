import {billingPrice,billingInvoiceSubscription,billingReference} from './billingEvidence.js';
import {MINUTE_PLANS,monthlyAnniversary,usageOwnerQuery} from './billingUsagePolicy.js';

// Only a verified, fully paid base-plan invoice grants the prepaid cancellation
// entitlement. Card attachment, a trial, or an overage invoice cannot grant it.
export function recordAnnualPaidTerm({database,ownerId,subscriptionId,facts,invoice}) {
  if(facts?.billingInterval!=='annual'||!MINUTE_PLANS[facts.plan]||invoice?.status!=='paid'||
    billingInvoiceSubscription(invoice)!==subscriptionId||!billingReference(invoice.customer)||
    !Number.isSafeInteger(invoice.amount_paid)||invoice.amount_paid<MINUTE_PLANS[facts.plan].annualCents||
    !Array.isArray(invoice.lines?.data)||invoice.lines.has_more===true)return;
  const line=invoice.lines.data.find(l=>billingPrice(l)===facts.priceId&&l.amount===MINUTE_PLANS[facts.plan].annualCents&&(!l.quantity||l.quantity===1));
  if(!line||!Number.isSafeInteger(line.period?.start)||!Number.isSafeInteger(line.period?.end))return;
  const start=new Date(line.period.start*1000).toISOString(),end=new Date(line.period.end*1000).toISOString();
  if(monthlyAnniversary(start,12)!==end||facts.trialEnd&&line.period.start<facts.trialEnd)return;
  const query=usageOwnerQuery(database);
  query(`INSERT INTO billingAnnualTerms(invoiceId,ownerId,stripeSubscriptionId,plan,startAt,endAt,amountPaidCents)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(invoiceId) DO NOTHING`).run(invoice.id,ownerId,subscriptionId,facts.plan,start,end,invoice.amount_paid);
}
