import { createHash, randomUUID } from 'node:crypto';
import { accountAccessDecision, trialVoiceCapDecision } from './planAccess.js';
import { billedCallMinutes, utcMilliseconds, VOICE_USAGE_POLICY } from './usagePolicy.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reference = value => typeof value === 'string' ? value : value?.id;
const textId = (value, name) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{1,180}$/.test(value)) throw new TypeError(name + ' is invalid.');
  return value;
};
function usageError(code) { const error = new Error(code); error.code = code; return error; }
function epochSeconds(value) {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(value * 1000) || !Number.isFinite(new Date(value * 1000).getTime())) throw usageError('USAGE_PERIOD_INVALID');
  return value * 1000;
}

// This service never calls a provider. All mutation boundaries are synchronous
// SQLite transactions; a voice completion cannot wait on Stripe.
export function createCallUsageService({ database, ownerQuery, usageConfig = null, clock = () => Date.now() }) {
  if (!database?.prepare || typeof ownerQuery !== 'function') throw new TypeError('Usage requires database and ownerQuery.');
  const query = sql => ownerQuery(sql);
  const now = () => utcMilliseconds(clock(), 'Usage clock');
  const immediate = work => database.transaction(work).immediate();
  const account = ownerId => query(`SELECT users.id AS ownerId, users.plan, users.planStatus, users.trialEndsAt,
    users.paymentFailedAt, billing.stripeCustomerId, billing.stripeSubscriptionId, billing.stripePriceId,
    billing.paymentMethodVerifiedAt
    FROM users LEFT JOIN billingAccounts AS billing ON billing.ownerId = users.id
    WHERE users.id = ? AND users.role = 'owner'`).get(ownerId);
  const findPeriod = (ownerId, at) => query(`SELECT * FROM voiceUsagePeriods
    WHERE ownerId = ? AND startMs <= ? AND endMs > ? ORDER BY startMs DESC LIMIT 1`).get(ownerId, at, at);
  function effectiveAllowance(period) {
    return Math.max(period.includedMinutes,query('SELECT COALESCE(MAX(includedMinutes),0) AS included FROM voiceUsageAllowanceRevisions WHERE ownerId = ? AND periodId = ?')
      .get(period.ownerId,period.id).included);
  }
  function periodTotals(period) {
    const row = query(`SELECT COALESCE(SUM(minutesBilled),0) AS used, COUNT(*) AS calls,
      COALESCE(SUM(CASE WHEN exclusion = 'SPAM' THEN 1 ELSE 0 END),0) AS spamCalls
      FROM callUsageRecords WHERE ownerId = ? AND answeredStartMs >= ? AND answeredStartMs < ?`)
      .get(period.ownerId, period.startMs, period.endMs);
    if (!Number.isSafeInteger(row.used) || row.used < 0 || !Number.isSafeInteger(row.used * VOICE_USAGE_POLICY.overageUnitCents)) throw usageError('USAGE_TOTAL_INVALID');
    return row;
  }
  function publicPeriod(period) {
    if (!period) return null;
    return { id: period.id, kind: period.kind, plan: period.plan,
      startAt: new Date(period.startMs).toISOString(), endAt: new Date(period.endMs).toISOString(),
      includedMinutes: effectiveAllowance(period), currency: period.currency };
  }
  function snapshot(ownerId, at = now()) {
    textId(ownerId, 'Tenant');
    const row = account(ownerId);
    if (!row) throw usageError('USAGE_OWNER_NOT_FOUND');
    const period = findPeriod(ownerId, utcMilliseconds(at));
    if (!period || period.stripeSubscriptionId !== row.stripeSubscriptionId) {
      return { available: false, reason: 'VERIFIED_USAGE_PERIOD_REQUIRED', period: null,
        minutesUsed: null, minutesRemaining: null, includedMinutes: null, overageMinutes: null, overageCents: null };
    }
    const totals = periodTotals(period);
    const includedMinutes = effectiveAllowance(period);
    const overageMinutes = period.kind === 'PAID' ? Math.max(0, totals.used - includedMinutes) : 0;
    return { available: true, plan: row.plan, period: publicPeriod(period), minutesUsed: totals.used,
      minutesRemaining: Math.max(0, includedMinutes - totals.used),
      includedMinutes, overageMinutes,
      overageCents: overageMinutes * VOICE_USAGE_POLICY.overageUnitCents,
      recordedCalls: totals.calls, spamFilteredCalls: totals.spamCalls };
  }
  function getCallAllowanceDecision(ownerId, { callInProgress = false, at = now() } = {}) {
    const row = account(textId(ownerId, 'Tenant'));
    const access = accountAccessDecision(row, { now: at });
    const usage = row ? snapshot(ownerId, at) : null;
    if (!access.allowed || !usage?.available) return {
      canStartNewCall: false, canContinueCurrentCall: Boolean(callInProgress),
      fallbackRequiredForNextCall: true, reason: access.allowed ? 'VERIFIED_USAGE_PERIOD_REQUIRED' : access.reason,
      usage
    };
    if (row.planStatus === 'trialing') return {
      ...trialVoiceCapDecision(row, { now: at, minutesUsed: usage.minutesUsed, callInProgress }), usage
    };
    if (usage.period.kind !== 'PAID') return {
      canStartNewCall: false, canContinueCurrentCall: Boolean(callInProgress),
      fallbackRequiredForNextCall: true, reason: 'VERIFIED_PAID_PERIOD_REQUIRED', usage
    };
    return { canStartNewCall: true, canContinueCurrentCall: true,
      fallbackRequiredForNextCall: false, reason: usage.minutesRemaining ? 'INCLUDED_MINUTES' : 'PAID_OVERAGE', usage };
  }
  function recordCompletedCall(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some(key => !['tenantOwnerId','callId','answeredStartAt','answeredEndAt','spamFiltered'].includes(key))) {
      throw new TypeError('Completed call fields are invalid.');
    }
    const ownerId = textId(input.tenantOwnerId, 'Tenant'), callId = textId(input.callId, 'Call ID');
    if (typeof input.spamFiltered !== 'boolean') throw new TypeError('spamFiltered must be a boolean.');
    const math = billedCallMinutes(input.answeredStartAt, input.answeredEndAt);
    if (math.end > now()) throw usageError('CALL_NOT_COMPLETED');
    const reportDigest = digest([ownerId,callId,math.start,math.end,input.spamFiltered]);
    return immediate(() => {
      if (!account(ownerId)) throw usageError('USAGE_OWNER_NOT_FOUND');
      const old = query('SELECT * FROM callUsageRecords WHERE ownerId = ? AND callId = ?').get(ownerId, callId);
      if (old) {
        if (old.reportDigest !== reportDigest) throw usageError('CALL_USAGE_CONFLICT');
        return { status: 'DUPLICATE', callId, minutesBilled: old.minutesBilled, exclusion: old.exclusion,
          period: publicPeriod(findPeriod(ownerId, old.answeredStartMs)) };
      }
      const call = query('SELECT id,status,outcome,failureCode FROM calls WHERE ownerId = ? AND callSid = ?').get(ownerId, callId);
      const fallback = call?.status === 'FALLBACK' || call?.outcome === 'AI_FALLBACK' || call?.failureCode === 'AI_FALLBACK';
      const exclusion = input.spamFiltered ? 'SPAM' : fallback ? 'AI_FALLBACK' : null;
      const minutesBilled = exclusion ? 0 : math.minutes;
      const timestamp = new Date(now()).toISOString();
      try {
        query(`INSERT INTO callUsageRecords(callId,ownerId,answeredStartMs,answeredEndMs,durationMs,
          spamFiltered,exclusion,minutesBilled,reportDigest,recordedAt) VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(callId,ownerId,math.start,math.end,math.durationMs,input.spamFiltered ? 1 : 0,exclusion,minutesBilled,reportDigest,timestamp);
        if (call) {
          query(`UPDATE calls SET duration = ?, spamFiltered = ?, minutesBilled = ?,
            completedAt = ?, updatedAt = ? WHERE ownerId = ? AND id = ?`)
            .run(Math.ceil(math.durationMs / 1000),input.spamFiltered ? 1 : 0,minutesBilled,
              new Date(math.end).toISOString(),timestamp,ownerId,call.id);
        } else {
          query(`INSERT INTO calls(id,ownerId,callSid,duration,status,spamFiltered,minutesBilled,completedAt,createdAt,updatedAt)
            VALUES (?,?,?,?,'COMPLETED',?,?,?,?,?)`)
            .run(randomUUID(),ownerId,callId,Math.ceil(math.durationMs / 1000),input.spamFiltered ? 1 : 0,
              minutesBilled,new Date(math.end).toISOString(),new Date(math.start).toISOString(),timestamp);
        }
      } catch (error) {
        if (String(error.code).startsWith('SQLITE_CONSTRAINT')) throw usageError('CALL_USAGE_CONFLICT');
        throw error;
      }
      const period = findPeriod(ownerId, math.start);
      return { status: period || exclusion ? 'RECORDED' : 'PERIOD_PENDING', callId, minutesBilled, exclusion,
        period: publicPeriod(period) };
    });
  }
  function storePeriod(record) {
    const id = digest([record.ownerId,record.stripeSubscriptionId,record.kind,record.startMs]);
    const old = query('SELECT * FROM voiceUsagePeriods WHERE ownerId = ? AND id = ?').get(record.ownerId,id);
    if (old) {
      if (old.endMs !== record.endMs || old.stripeCustomerId !== record.stripeCustomerId ||
          old.stripeUsageItemId !== record.stripeUsageItemId || old.currency !== record.currency) {
        throw usageError('VERIFIED_USAGE_PERIOD_CONFLICT');
      }
      // Owner ruling: upgrades raise this window's allowance, downgrades keep
      // it through renewal. Previously used minutes are never reset.
      if (record.kind === 'PAID' && record.includedMinutes > effectiveAllowance(old)) {
        const queued = query('SELECT COUNT(*) AS count FROM voiceUsageSubmissions WHERE ownerId = ? AND periodId = ?').get(old.ownerId,old.id).count;
        if (queued) throw usageError('LATE_ALLOWANCE_CHANGE_REQUIRES_REVIEW');
        query('INSERT OR IGNORE INTO voiceUsageAllowanceRevisions(id,ownerId,periodId,includedMinutes,sourceEventId,createdAt) VALUES (?,?,?,?,?,?)')
          .run(digest([old.id,record.sourceEventId]),old.ownerId,old.id,record.includedMinutes,record.sourceEventId,new Date(now()).toISOString());
      }
      return old;
    }
    const overlap = query('SELECT id FROM voiceUsagePeriods WHERE ownerId = ? AND startMs < ? AND endMs > ?')
      .get(record.ownerId, record.endMs, record.startMs);
    if (overlap) throw usageError('VERIFIED_USAGE_PERIOD_OVERLAP');
    query(`INSERT INTO voiceUsagePeriods(id,ownerId,stripeSubscriptionId,stripeCustomerId,kind,plan,includedMinutes,
      startMs,endMs,stripeUsageItemId,currency,sourceEventId,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,record.ownerId,record.stripeSubscriptionId,record.stripeCustomerId,record.kind,record.plan,
        record.includedMinutes,record.startMs,record.endMs,record.stripeUsageItemId,record.currency,
        record.sourceEventId,new Date(now()).toISOString());
    return { ...record, id };
  }
  // Accept only objects from a signature-verified event accepted by billingState,
  // or Stripe's authenticated subscriptions.retrieve response with the same DB binding.
  function captureVerifiedSubscription({ ownerId, subscription, sourceEventId }) {
    if (!usageConfig) return { status: 'DISABLED' };
    if (subscription?.livemode !== usageConfig.livemode) throw usageError('USAGE_STRIPE_MODE_MISMATCH');
    const evidenceDigest = digest([subscription?.id,reference(subscription?.customer),subscription?.status,
      subscription?.trial_start,subscription?.trial_end,subscription?.billing_mode?.type,subscription?.items?.data]);
    const receipt = query('SELECT reportDigest FROM voiceUsageEvidenceReceipts WHERE ownerId = ? AND sourceEventId = ?').get(ownerId,sourceEventId);
    if (receipt) {
      if (receipt.reportDigest !== evidenceDigest) throw usageError('USAGE_EVIDENCE_CONFLICT');
      return { status: 'DUPLICATE' };
    }
    const row = account(textId(ownerId, 'Tenant'));
    if (!row?.paymentMethodVerifiedAt || reference(subscription?.customer) !== row.stripeCustomerId ||
        subscription?.id !== row.stripeSubscriptionId) throw usageError('USAGE_SUBSCRIPTION_BINDING_INVALID');
    const base = usageConfig.basePrices[row.stripePriceId];
    const items = subscription.items?.data;
    if (!base || !VOICE_USAGE_POLICY.includedMinutes[base.plan] || !Array.isArray(items) ||
        subscription.items.has_more === true) throw usageError('USAGE_SUBSCRIPTION_ITEMS_INVALID');
    const bases = items.filter(item => reference(item.price) === row.stripePriceId);
    const meters = items.filter(item => reference(item.price) === usageConfig.priceId);
    // Checkout cannot create mixed intervals. The worker attaches the monthly
    // usage item after the annual Checkout payment method has been verified.
    if (base.interval === 'annual' && bases.length === 1 && meters.length === 0 &&
        subscription.billing_mode?.type === 'flexible') return { status: 'METER_SETUP_PENDING' };
    if (bases.length !== 1 || meters.length !== 1 || !meters[0].id ||
        (base.interval === 'annual' && subscription.billing_mode?.type !== 'flexible')) {
      throw usageError('USAGE_MONTHLY_ITEM_REQUIRED');
    }
    const metadata = { ownerId, stripeSubscriptionId: row.stripeSubscriptionId, stripeCustomerId: row.stripeCustomerId,
      plan: base.plan, stripeUsageItemId: meters[0].id, currency: bases[0].price?.currency || usageConfig.currency || null,
      sourceEventId: textId(sourceEventId, 'Verified source') };
    return immediate(() => {
      query('INSERT INTO voiceUsageEvidenceReceipts(ownerId,sourceEventId,reportDigest,createdAt) VALUES (?,?,?,?)')
        .run(ownerId,sourceEventId,evidenceDigest,new Date(now()).toISOString());
      if (subscription.trial_start != null && subscription.trial_end != null) {
        const startMs = epochSeconds(subscription.trial_start), endMs = epochSeconds(subscription.trial_end);
        if (endMs <= startMs || endMs - startMs > 14 * 86400000) throw usageError('USAGE_TRIAL_PERIOD_INVALID');
        storePeriod({ ...metadata, kind: 'TRIAL', startMs, endMs, includedMinutes: VOICE_USAGE_POLICY.trialMinutes });
      }
      if (subscription.status === 'trialing' || ['incomplete','incomplete_expired','paused','canceled'].includes(subscription.status)) {
        return { status: 'TRIAL_OR_INACTIVE' };
      }
      const startMs = epochSeconds(meters[0].current_period_start), endMs = epochSeconds(meters[0].current_period_end);
      if (endMs <= startMs || endMs - startMs > 32 * 86400000 ||
          (subscription.trial_end != null && startMs < epochSeconds(subscription.trial_end))) throw usageError('USAGE_PAID_PERIOD_INVALID');
      const period = storePeriod({ ...metadata, kind: 'PAID', startMs, endMs, includedMinutes: VOICE_USAGE_POLICY.includedMinutes[base.plan] });
      return { status: 'VERIFIED', period: publicPeriod(period) };
    });
  }
  function captureVerifiedStripeEvent(event, transition) {
    if (!['customer.subscription.created','customer.subscription.updated'].includes(event.type)) return;
    return captureVerifiedSubscription({ ownerId: transition.ownerId, subscription: event.data.object, sourceEventId: event.id });
  }
  function queueClosedPeriod(ownerId, periodId, { at = now(), eventName = usageConfig?.eventName } = {}) {
    return immediate(() => {
      const period = query('SELECT * FROM voiceUsagePeriods WHERE ownerId = ? AND id = ?').get(ownerId,periodId);
      if (!period || period.kind !== 'PAID' || period.endMs > at) return null;
      if (!eventName || !period.stripeUsageItemId) throw usageError('USAGE_PROVIDER_CONFIG_REQUIRED');
      const overage = Math.max(0,periodTotals(period).used - effectiveAllowance(period));
      const queued = query('SELECT COALESCE(SUM(units),0) AS units FROM voiceUsageSubmissions WHERE ownerId = ? AND periodId = ?')
        .get(ownerId,periodId).units;
      if (overage <= queued) return null;
      const units = overage - queued, id = 'otc_' + digest([ownerId,periodId,queued,overage]);
      const timestamp = new Date(at).toISOString();
      query(`INSERT INTO voiceUsageSubmissions(id,ownerId,periodId,stripeCustomerId,stripeSubscriptionId,stripeUsageItemId,
        units,overageUnitCents,eventTimestamp,eventName,status,nextAttemptMs,createdAt,updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,'PENDING',?,?,?)`)
        .run(id,ownerId,periodId,period.stripeCustomerId,period.stripeSubscriptionId,period.stripeUsageItemId,
          units,VOICE_USAGE_POLICY.overageUnitCents,Math.floor((period.endMs - 1)/1000),eventName,at,timestamp,timestamp);
      return id;
    });
  }
  function getUsageHistory(ownerId) {
    textId(ownerId,'Tenant');
    return query('SELECT * FROM callUsageRecords WHERE ownerId = ? ORDER BY answeredStartMs,callId').all(ownerId)
      .map(row => ({ callId: row.callId, answeredStartAt: new Date(row.answeredStartMs).toISOString(),
        answeredEndAt: new Date(row.answeredEndMs).toISOString(), durationMs: row.durationMs,
        spamFiltered: row.spamFiltered === 1, exclusion: row.exclusion, minutesBilled: row.minutesBilled,
        period: publicPeriod(findPeriod(ownerId,row.answeredStartMs)) }));
  }
  return Object.freeze({ recordCompletedCall, getUsageSnapshot: snapshot, getCallAllowanceDecision,
    captureVerifiedStripeEvent, captureVerifiedSubscription, queueClosedPeriod, getUsageHistory });
}
