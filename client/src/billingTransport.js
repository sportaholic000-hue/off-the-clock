import {sessionIdentity} from './sessionIdentity.js';
const PLANS = ['Starter', 'Operator', 'QuoteDone'];
const ACCOUNT_PLANS = [...PLANS, 'Scale'];
const INTERVALS = ['monthly', 'annual'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function billingState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ['billingEnabled','providerAvailable','canCheckout','canManageBilling','cancelAtPeriodEnd'].some(key => typeof value[key] !== 'boolean')
      || !ACCOUNT_PLANS.includes(value.plan) || typeof value.planStatus !== 'string'
      || !['NONE','CREATING','OPEN','EXPIRED'].includes(value.checkoutState)
      || !(value.billingInterval === null || INTERVALS.includes(value.billingInterval))) {
    throw new Error('Billing status could not be confirmed. Please refresh it.');
  }
  return value;
}

export async function billingStorageKey(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionIdentity(token)));
  return 'otc-billing-v1:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
}

export function validBillingJob(value, kind) {
  if (!value || value.kind !== kind || !UUID.test(value.key || '') || !['pending','opened'].includes(value.state)
      || !value.body || typeof value.body !== 'object' || Array.isArray(value.body)) return false;
  const keys = Object.keys(value.body).sort();
  return kind === 'portal' ? keys.length === 0 : kind === 'checkout'
    && keys.join(',') === 'billingInterval,plan' && PLANS.includes(value.body.plan) && INTERVALS.includes(value.body.billingInterval);
}

export function readBillingJobs(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    if (value?.version !== 1) return {};
    return Object.fromEntries(['checkout','portal'].filter(kind => validBillingJob(value[kind],kind)).map(kind => [kind,value[kind]]));
  } catch { return {}; }
}

export function billingDestination(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function billingFailure(error, {pending=false}={}) {
  if (error.status === 401) return 'Please sign in again to manage billing.';
  if (error.status === 403) return 'Billing is unavailable for this account. Only the business owner can manage billing.';
  if (error.status === 404) return 'Billing is not configured yet.';
  if (error.code === 'SUBSCRIPTION_ALREADY_EXISTS') return 'Manage your existing subscription using Manage billing.';
  if (error.code === 'BILLING_CUSTOMER_REQUIRED') return 'Start checkout before opening Manage billing.';
  if (error.code === 'CHECKOUT_IN_PROGRESS') return 'Checkout is still being prepared. Retry the same request shortly.';
  return pending ? 'Billing could not be reached. Your existing request is saved; retry it to check the result.' : 'Billing could not be reached. Please try again.';
}

export function definiteBillingRejection(error) {
  return (error.status === 400 && ['INVALID_REQUEST','IDEMPOTENCY_KEY_REQUIRED','INVALID_IDEMPOTENCY_KEY'].includes(error.code))
    || ['SUBSCRIPTION_ALREADY_EXISTS','BILLING_CUSTOMER_REQUIRED'].includes(error.code);
}
function utcTime(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return null;
  const time=Date.parse(value);return Number.isFinite(time)&&new Date(time).toISOString()===value?time:null;
}
export function canContinueSetup(state, now = Date.now()) {
  const at=now instanceof Date?now.getTime():typeof now==='string'?utcTime(now):now;
  if(!Number.isFinite(at)||!state)return false;
  if(state.plan!==undefined&&!ACCOUNT_PLANS.includes(state.plan))return false;
  const status=typeof state.planStatus==='string'?state.planStatus.trim().toLowerCase():'';
  if(state.serviceEndsAt!=null&&(utcTime(state.serviceEndsAt)===null||at>=utcTime(state.serviceEndsAt)))return false;
  if(status==='canceled'&&utcTime(state.paidThroughAt)!==null&&utcTime(state.paidThroughAt)>at&&!state.paymentFailedAt)return true;
  if(status==='canceled'&&utcTime(state.annualPaidThroughAt)!==null&&utcTime(state.annualPaidThroughAt)>at)return true;
  if(status==='active')return true;
  if(status==='trialing'){const end=typeof state.trialEndsAt==='string'?Date.parse(state.trialEndsAt):NaN;return Number.isFinite(end)&&at<end;}
  if(['payment_failed','past_due'].includes(status)){
    const failed=utcTime(state.paymentFailedAt);
    return failed!==null&&at>=failed&&at<failed+7*24*60*60*1000;
  }
  return false;
}
export function billingRecoveryMessage(state, now=Date.now()) {
  if(!['payment_failed','past_due','suspended','unpaid'].includes(state?.planStatus))return null;
  return canContinueSetup(state,now)
    ? 'Your payment failed. Service remains available during the seven-day grace period. Use Manage billing to resolve the outstanding payment.'
    : 'Service is suspended until the outstanding payment is resolved. Use Manage billing to restore access.';
}
