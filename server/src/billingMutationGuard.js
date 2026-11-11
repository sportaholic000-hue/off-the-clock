import {usageOwnerQuery} from './billingUsagePolicy.js';
import {accountAccessDecision} from './planAccess.js';
const READ_METHODS=new Set(['GET','HEAD','OPTIONS']);
// Only billing and account authentication recovery bypass lifecycle restrictions.
// This POST validates a supplied draft without saving, approving or quoting it.
const READ_ONLY_POSTS=new Set(['/api/pricebook/validate']);
const RECOVERY_PATHS=new Set(['/api/billing/checkout','/api/billing/portal','/api/billing/cancel','/api/billing/reactivate','/api/auth/account/resend-verification']);
const NEVER_STARTED_STATUSES=new Set(['pending_payment','pending_subscription']);
// An owner who has never had service: still waiting for a first checkout, with
// no confirmed payment method, no trial or paid period, no payment failure, no
// cancellation and no ended subscription. Any of those means the account had
// service (or a subscription) before, and the read-only wording stays.
export function trialNeverStarted(database,ownerId) {
  if(typeof ownerId!=='string'||!ownerId)return false;
  try {
    const row=usageOwnerQuery(database)(`SELECT users.planStatus,users.trialEndsAt,users.paymentFailedAt,users.annualPaidThroughAt,users.paidThroughAt,users.serviceEndsAt,
      billing.paymentMethodVerifiedAt,billing.canceledAt,
      (SELECT COUNT(*) FROM billingSubscriptionHistory AS history WHERE history.ownerId=users.id AND history.status='TERMINAL') AS endedSubscriptions
      FROM users LEFT JOIN billingAccounts AS billing ON billing.ownerId=users.id
      WHERE users.id=? AND users.role='owner' AND users.ownerId IS NULL`).get(ownerId);
    if(!row||!NEVER_STARTED_STATUSES.has(row.planStatus))return false;
    return [row.trialEndsAt,row.paymentFailedAt,row.annualPaidThroughAt,row.paidThroughAt,row.serviceEndsAt,row.paymentMethodVerifiedAt,row.canceledAt].every(value=>value==null)
      && Number(row.endedSubscriptions)===0;
  } catch {
    // Without the evidence the existing read-only response is kept.
    return false;
  }
}

export function billingMutationDecision(database,req,{now=Date.now()}={}) {
  if(READ_METHODS.has(req.method)||!req.method)return {allowed:true};
  const path=req.route?.path || req.path;
  // Owners can administer or remove a staff seat after a plan change even
  // when that new plan has no product write entitlement.
  if(typeof path==='string'&&path.startsWith('/api/team/staff'))return {allowed:true};
  if(req.method==='POST'&&(RECOVERY_PATHS.has(path)||READ_ONLY_POSTS.has(path)))return {allowed:true};
  const owner=usageOwnerQuery(database)("SELECT plan,planStatus,trialEndsAt,paymentFailedAt,annualPaidThroughAt,paidThroughAt,serviceEndsAt FROM users WHERE id=? AND role='owner' AND ownerId IS NULL").get(req.tenantOwnerId);
  // Existing cancellation cleanup contract: docs/operator-integrations.md:23.
  // This removes delivery authority; it cannot configure or send a webhook.
  if(req.method==='DELETE'&&path==='/api/integrations/webhook'&&['canceled','cancelled'].includes(owner?.planStatus))return {allowed:true};
  const decision=accountAccessDecision(owner,{now});
  if(decision.allowed)return decision;
  // Platform section4 creates the account before Checkout. Permit only that
  // initial account step; pending accounts receive no other product mutations.
  if(req.method==='POST'&&path==='/api/onboarding/account'&&owner?.planStatus==='pending_payment'&&!owner.paymentFailedAt)return {allowed:true};
  if(trialNeverStarted(database,req.tenantOwnerId))return {...decision,trialNotStarted:true};
  return decision;
}
