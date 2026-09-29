import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCESS_REASON,
  PAYMENT_FAILURE_GRACE_MS,
  TRIAL_VOICE_MINUTE_CAP,
  accountAccessDecision,
  canStartVoiceSession,
  hasOperatorAccess,
  hasProviderWriteAccess,
  hasQuoteDoneAccess,
  isSuspendedOrCanceled,
  isTrialExpired,
  isWithinPaymentFailureGrace,
  trialVoiceCapDecision
} from '../server/src/planAccess.js';

const NOW = '2026-09-29T12:00:00.000Z';
const ACTIVE = { plan: 'Operator', planStatus: 'active', trialEndsAt: null };
const TRIAL = {
  plan: 'QuoteDone',
  planStatus: 'trialing',
  trialEndsAt: '2026-09-30T12:00:00.000Z'
};

test('active lifecycle grants Operator/provider writes while plan controls QuoteDone', () => {
  assert.equal(hasOperatorAccess(ACTIVE, { now: NOW }), true);
  assert.equal(hasProviderWriteAccess(ACTIVE, { now: NOW }), true);
  assert.equal(hasQuoteDoneAccess(ACTIVE, { now: NOW }), false);
  assert.equal(hasQuoteDoneAccess({ ...ACTIVE, plan: 'QuoteDone' }, { now: NOW }), true);
  assert.equal(hasQuoteDoneAccess({ ...ACTIVE, plan: 'Scale' }, { now: NOW }), true);
});

test('unknown or missing plan/status fails closed', () => {
  for (const account of [
    null,
    {},
    { plan: 'Enterprise', planStatus: 'active' },
    { plan: 'QuoteDone' },
    { plan: 'QuoteDone', planStatus: 'pending_payment' }
  ]) {
    assert.equal(hasOperatorAccess(account, { now: NOW }), false);
    assert.equal(hasQuoteDoneAccess(account, { now: NOW }), false);
    assert.equal(hasProviderWriteAccess(account, { now: NOW }), false);
  }
  assert.equal(accountAccessDecision(ACTIVE, { now: 'not-a-time' }).reason, ACCESS_REASON.INVALID_NOW);
});

test('trial expiry uses an exclusive exact UTC boundary', () => {
  const account = { ...TRIAL, trialEndsAt: '2026-09-29T12:00:00.000Z' };
  assert.equal(isTrialExpired(account, '2026-09-29T11:59:59.999Z'), false);
  assert.equal(hasQuoteDoneAccess(account, { now: '2026-09-29T11:59:59.999Z' }), true);
  assert.equal(isTrialExpired(account, '2026-09-29T12:00:00.000Z'), true);
  assert.equal(hasQuoteDoneAccess(account, { now: '2026-09-29T12:00:00.000Z' }), false);
  assert.equal(accountAccessDecision(account, { now: '2026-09-29T12:00:00.000Z' }).reason, ACCESS_REASON.TRIAL_EXPIRED);
});

test('missing, invalid, non-UTC, and impossible trial end timestamps fail closed', () => {
  for (const trialEndsAt of [
    undefined,
    null,
    '',
    '2026-09-30T12:00:00',
    '2026-09-30T12:00:00Z',
    '2026-02-30T12:00:00.000Z'
  ]) {
    const account = { ...TRIAL, trialEndsAt };
    assert.equal(isTrialExpired(account, NOW), true);
    assert.equal(accountAccessDecision(account, { now: NOW }).reason, ACCESS_REASON.TRIAL_END_REQUIRED);
  }
});

test('payment failure keeps full service until, but not at, the seven-day UTC boundary', () => {
  const account = {
    plan: 'Scale',
    planStatus: 'payment_failed',
    paymentFailedAt: '2026-09-22T12:00:00.000Z'
  };
  assert.equal(PAYMENT_FAILURE_GRACE_MS, 604800000);
  assert.equal(isWithinPaymentFailureGrace(account, '2026-09-29T11:59:59.999Z'), true);
  assert.equal(hasOperatorAccess(account, { now: '2026-09-29T11:59:59.999Z' }), true);
  assert.equal(hasQuoteDoneAccess(account, { now: '2026-09-29T11:59:59.999Z' }), true);
  assert.deepEqual(accountAccessDecision(account, { now: '2026-09-29T11:59:59.999Z' }), {
    allowed: true,
    reason: ACCESS_REASON.PAYMENT_FAILURE_GRACE,
    accessUntilUtc: '2026-09-29T12:00:00.000Z'
  });

  assert.equal(isWithinPaymentFailureGrace(account, NOW), false);
  assert.equal(hasProviderWriteAccess(account, { now: NOW }), false);
  assert.equal(accountAccessDecision(account, { now: NOW }).reason, ACCESS_REASON.PAYMENT_FAILURE_GRACE_EXPIRED);
});

test('payment failure without a trustworthy failure timestamp fails closed', () => {
  for (const paymentFailedAt of [undefined, null, '', '2026-09-22T12:00:00Z', '2026-10-01T12:00:00.000Z']) {
    const account = { plan: 'QuoteDone', planStatus: 'past_due', paymentFailedAt };
    assert.equal(isWithinPaymentFailureGrace(account, NOW), false);
    assert.equal(hasQuoteDoneAccess(account, { now: NOW }), false);
    assert.equal(accountAccessDecision(account, { now: NOW }).reason, ACCESS_REASON.PAYMENT_FAILURE_TIME_REQUIRED);
  }
});

test('suspended and cancellation lifecycle states deny all normal/provider access', () => {
  for (const planStatus of ['suspended', 'SUSPENDED', 'canceled', 'cancelled', 'canceling', 'wind_down', 'unpaid']) {
    const account = { plan: 'Scale', planStatus };
    assert.equal(isSuspendedOrCanceled(account), true);
    assert.equal(hasOperatorAccess(account, { now: NOW }), false);
    assert.equal(hasQuoteDoneAccess(account, { now: NOW }), false);
    assert.equal(hasProviderWriteAccess(account, { now: NOW }), false);
    assert.equal(accountAccessDecision(account, { now: NOW }).reason, ACCESS_REASON.SUSPENDED_OR_CANCELED);
  }
});

test('trial voice cap allows minute 59 and sends the next call to fallback at minute 60', () => {
  assert.equal(TRIAL_VOICE_MINUTE_CAP, 60);
  assert.deepEqual(trialVoiceCapDecision(TRIAL, { now: NOW, minutesUsed: 59 }), {
    canStartNewCall: true,
    canContinueCurrentCall: true,
    fallbackRequiredForNextCall: false,
    reason: ACCESS_REASON.TRIAL_ACTIVE,
    capMinutes: 60,
    minutesUsed: 59,
    remainingMinutes: 1
  });
  assert.deepEqual(trialVoiceCapDecision(TRIAL, { now: NOW, minutesUsed: 60 }), {
    canStartNewCall: false,
    canContinueCurrentCall: false,
    fallbackRequiredForNextCall: true,
    reason: ACCESS_REASON.TRIAL_VOICE_CAP_REACHED,
    capMinutes: 60,
    minutesUsed: 60,
    remainingMinutes: 0
  });
  assert.equal(canStartVoiceSession(TRIAL, { now: NOW, minutesUsed: 60 }), false);
});

test('a trial call already in progress finishes after the cap, but the next call cannot start', () => {
  const decision = trialVoiceCapDecision(TRIAL, {
    now: NOW,
    minutesUsed: 61,
    callInProgress: true
  });
  assert.equal(decision.canStartNewCall, false);
  assert.equal(decision.canContinueCurrentCall, true);
  assert.equal(decision.fallbackRequiredForNextCall, true);
  assert.equal(decision.reason, ACCESS_REASON.TRIAL_VOICE_CAP_REACHED);
});

test('unavailable or malformed trial usage blocks new calls but never cuts off an existing call', () => {
  for (const minutesUsed of [undefined, null, -1, 1.5, Number.NaN]) {
    const nextCall = trialVoiceCapDecision(TRIAL, { now: NOW, minutesUsed });
    assert.equal(nextCall.canStartNewCall, false);
    assert.equal(nextCall.canContinueCurrentCall, false);
    assert.equal(nextCall.reason, ACCESS_REASON.TRIAL_USAGE_REQUIRED);

    const currentCall = trialVoiceCapDecision(TRIAL, { now: NOW, minutesUsed, callInProgress: true });
    assert.equal(currentCall.canStartNewCall, false);
    assert.equal(currentCall.canContinueCurrentCall, true);
    assert.equal(currentCall.fallbackRequiredForNextCall, true);
  }
});

test('the trial cap does not limit active paid accounts, while denied lifecycle still blocks voice', () => {
  assert.deepEqual(trialVoiceCapDecision(ACTIVE, { now: NOW, minutesUsed: 999 }), {
    canStartNewCall: true,
    canContinueCurrentCall: true,
    fallbackRequiredForNextCall: false,
    reason: ACCESS_REASON.ACTIVE,
    capMinutes: null,
    minutesUsed: null,
    remainingMinutes: null
  });
  const suspended = trialVoiceCapDecision({ ...ACTIVE, planStatus: 'suspended' }, {
    now: NOW,
    minutesUsed: 0,
    callInProgress: true
  });
  assert.equal(suspended.canStartNewCall, false);
  assert.equal(suspended.canContinueCurrentCall, false);
  assert.equal(suspended.reason, ACCESS_REASON.SUSPENDED_OR_CANCELED);
});
