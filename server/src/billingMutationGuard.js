import {usageOwnerQuery} from './billingUsagePolicy.js';
import {accountAccessDecision} from './planAccess.js';
const READ_METHODS=new Set(['GET','HEAD','OPTIONS']);
// Only billing and account authentication recovery bypass lifecycle restrictions.
// This POST validates a supplied draft without saving, approving or quoting it.
const READ_ONLY_POSTS=new Set(['/api/pricebook/validate']);
const RECOVERY_PATHS=new Set(['/api/billing/checkout','/api/billing/portal','/api/billing/cancel','/api/billing/reactivate','/api/auth/account/resend-verification']);
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
  return decision;
}
