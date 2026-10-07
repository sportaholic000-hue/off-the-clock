const VALID_PLANS = new Set(['Operator', 'QuoteDone', 'Scale']);
const QUOTEDONE_PLANS = new Set(['QuoteDone', 'Scale']);
const PAYMENT_FAILURE_STATUSES = new Set(['payment_failed', 'past_due']);
const TERMINAL_STATUSES = new Set([
  'suspended',
  'canceled',
  'cancelled',
  'canceling',
  'cancellation_pending',
  'wind_down',
  'unpaid'
]);

export const PAYMENT_FAILURE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const TRIAL_VOICE_MINUTE_CAP = 60;

export const ACCESS_REASON = Object.freeze({
  ACTIVE: 'ACTIVE',
  TRIAL_ACTIVE: 'TRIAL_ACTIVE',
  PAYMENT_FAILURE_GRACE: 'PAYMENT_FAILURE_GRACE',
  ACCOUNT_REQUIRED: 'ACCOUNT_REQUIRED',
  INVALID_PLAN: 'INVALID_PLAN',
  INVALID_STATUS: 'INVALID_STATUS',
  INVALID_NOW: 'INVALID_NOW',
  TRIAL_END_REQUIRED: 'TRIAL_END_REQUIRED',
  TRIAL_EXPIRED: 'TRIAL_EXPIRED',
  PAYMENT_FAILURE_TIME_REQUIRED: 'PAYMENT_FAILURE_TIME_REQUIRED',
  PAYMENT_FAILURE_GRACE_EXPIRED: 'PAYMENT_FAILURE_GRACE_EXPIRED',
  SUSPENDED_OR_CANCELED: 'SUSPENDED_OR_CANCELED',
  TRIAL_USAGE_REQUIRED: 'TRIAL_USAGE_REQUIRED',
  TRIAL_VOICE_CAP_REACHED: 'TRIAL_VOICE_CAP_REACHED'
});

// Stored account timestamps are generated with Date#toISOString. Requiring that
// exact UTC representation avoids host-timezone parsing and normalized invalid
// dates (for example, February 30) in entitlement decisions.
const UTC_ISO_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;

function utcEpoch(value) {
  if (typeof value !== 'string' || !UTC_ISO_PATTERN.test(value)) return null;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return null;
  return new Date(epoch).toISOString() === value ? epoch : null;
}

function nowEpoch(value) {
  if (value === undefined) return Date.now();
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return utcEpoch(value);
}

function statusOf(account) {
  return typeof account?.planStatus === 'string'
    ? account.planStatus.trim().toLowerCase()
    : '';
}

function denied(reason) {
  return { allowed: false, reason, accessUntilUtc: null };
}

function allowed(reason, accessUntilUtc = null) {
  return { allowed: true, reason, accessUntilUtc };
}

export function isTrialExpired(account, now = Date.now()) {
  if (statusOf(account) !== 'trialing') return false;
  const current = nowEpoch(now);
  const trialEnd = utcEpoch(account?.trialEndsAt);
  return current === null || trialEnd === null || current >= trialEnd;
}

export function isWithinPaymentFailureGrace(account, now = Date.now()) {
  if (!PAYMENT_FAILURE_STATUSES.has(statusOf(account))) return false;
  const current = nowEpoch(now);
  const failedAt = utcEpoch(account?.paymentFailedAt);
  if (current === null || failedAt === null) return false;
  return current >= failedAt && current < failedAt + PAYMENT_FAILURE_GRACE_MS;
}

export function isSuspendedOrCanceled(account) {
  return TERMINAL_STATUSES.has(statusOf(account));
}

/**
 * Decides whether an account lifecycle permits normal service. The caller must
 * supply the current database row; JWT claims are intentionally insufficient.
 * Unknown plans/statuses and missing time evidence deny access.
 */
export function accountAccessDecision(account, { now = Date.now() } = {}) {
  if (!account || typeof account !== 'object') return denied(ACCESS_REASON.ACCOUNT_REQUIRED);
  if (!VALID_PLANS.has(account.plan)) return denied(ACCESS_REASON.INVALID_PLAN);

  const current = nowEpoch(now);
  if (current === null) return denied(ACCESS_REASON.INVALID_NOW);

  const status = statusOf(account);
  if(account.serviceEndsAt!=null){
    const end=utcEpoch(account.serviceEndsAt);
    if(end===null||current>=end)return denied(ACCESS_REASON.SUSPENDED_OR_CANCELED);
  }
  if(status==='canceled'&&utcEpoch(account.paidThroughAt)>current&&!account.paymentFailedAt){
    return allowed(ACCESS_REASON.ACTIVE,account.paidThroughAt);
  }
  if(status==='canceled'&&utcEpoch(account.annualPaidThroughAt)>current&&!account.paymentFailedAt){
    return allowed(ACCESS_REASON.ACTIVE,account.annualPaidThroughAt);
  }
  if (isSuspendedOrCanceled(account)) return denied(ACCESS_REASON.SUSPENDED_OR_CANCELED);
  if (status === 'active') return allowed(ACCESS_REASON.ACTIVE);

  if (status === 'trialing') {
    const trialEnd = utcEpoch(account.trialEndsAt);
    if (trialEnd === null) return denied(ACCESS_REASON.TRIAL_END_REQUIRED);
    if (current >= trialEnd) return denied(ACCESS_REASON.TRIAL_EXPIRED);
    return allowed(ACCESS_REASON.TRIAL_ACTIVE, new Date(trialEnd).toISOString());
  }

  if (PAYMENT_FAILURE_STATUSES.has(status)) {
    const failedAt = utcEpoch(account.paymentFailedAt);
    if (failedAt === null || current < failedAt) {
      return denied(ACCESS_REASON.PAYMENT_FAILURE_TIME_REQUIRED);
    }
    const graceEnd = failedAt + PAYMENT_FAILURE_GRACE_MS;
    if (current >= graceEnd) return denied(ACCESS_REASON.PAYMENT_FAILURE_GRACE_EXPIRED);
    return allowed(ACCESS_REASON.PAYMENT_FAILURE_GRACE, new Date(graceEnd).toISOString());
  }

  return denied(ACCESS_REASON.INVALID_STATUS);
}

export function hasOperatorAccess(account, options) {
  return accountAccessDecision(account, options).allowed;
}

// Provider configuration/cost switches remain separate runtime guards. This
// helper answers only whether the current database account is entitled to make
// an Operator-tier provider write.
export function hasProviderWriteAccess(account, options) {
  return hasOperatorAccess(account, options);
}

export function hasQuoteDoneAccess(account, options) {
  return QUOTEDONE_PLANS.has(account?.plan) && accountAccessDecision(account, options).allowed;
}

/**
 * The 60-minute cap blocks the next trial call. A call already in progress is
 * allowed to finish even when the meter reaches the cap (or becomes unavailable),
 * as required by the no-mid-call-termination rule.
 */
export function trialVoiceCapDecision(account, {
  now = Date.now(),
  minutesUsed,
  callInProgress = false
} = {}) {
  const access = accountAccessDecision(account, { now });
  if (!access.allowed) {
    return {
      canStartNewCall: false,
      canContinueCurrentCall: false,
      fallbackRequiredForNextCall: true,
      reason: access.reason,
      capMinutes: statusOf(account) === 'trialing' ? TRIAL_VOICE_MINUTE_CAP : null,
      minutesUsed: null,
      remainingMinutes: null
    };
  }

  if (statusOf(account) !== 'trialing') {
    return {
      canStartNewCall: true,
      canContinueCurrentCall: true,
      fallbackRequiredForNextCall: false,
      reason: access.reason,
      capMinutes: null,
      minutesUsed: null,
      remainingMinutes: null
    };
  }

  if (!Number.isSafeInteger(minutesUsed) || minutesUsed < 0) {
    return {
      canStartNewCall: false,
      canContinueCurrentCall: Boolean(callInProgress),
      fallbackRequiredForNextCall: true,
      reason: ACCESS_REASON.TRIAL_USAGE_REQUIRED,
      capMinutes: TRIAL_VOICE_MINUTE_CAP,
      minutesUsed: null,
      remainingMinutes: null
    };
  }

  const remainingMinutes = Math.max(0, TRIAL_VOICE_MINUTE_CAP - minutesUsed);
  if (minutesUsed >= TRIAL_VOICE_MINUTE_CAP) {
    return {
      canStartNewCall: false,
      canContinueCurrentCall: Boolean(callInProgress),
      fallbackRequiredForNextCall: true,
      reason: ACCESS_REASON.TRIAL_VOICE_CAP_REACHED,
      capMinutes: TRIAL_VOICE_MINUTE_CAP,
      minutesUsed,
      remainingMinutes
    };
  }

  return {
    canStartNewCall: true,
    canContinueCurrentCall: true,
    fallbackRequiredForNextCall: false,
    reason: ACCESS_REASON.TRIAL_ACTIVE,
    capMinutes: TRIAL_VOICE_MINUTE_CAP,
    minutesUsed,
    remainingMinutes
  };
}

export function canStartVoiceSession(account, options) {
  return trialVoiceCapDecision(account, options).canStartNewCall;
}
