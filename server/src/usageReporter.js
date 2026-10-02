import { utcMilliseconds } from './usagePolicy.js';
import {createUsageItemProvisioner} from './usageItemProvisioner.js';

// These discovery queries are platform worker queries. Every subsequent read,
// claim and update is tenant-filtered through ownerQuery.
export function createUsageReporter({ database, ownerQuery, service, stripeClient, usageConfig,
  providerEnabled = () => false, clock = () => Date.now(), log = code => console.error('[usage]', code) }) {
  const now = () => utcMilliseconds(clock());
  const query = sql => ownerQuery(sql);
  const provisioner = createUsageItemProvisioner({database,ownerQuery,stripeClient,usageConfig,clock,log});
  let active = null, timer = null, stopping = false;
  const mark = (row,status,error,at) => query(`UPDATE voiceUsageSubmissions SET status = ?, lastErrorCode = ?,
    nextAttemptMs = ?, leaseUntilMs = NULL, updatedAt = ? WHERE ownerId = ? AND id = ? AND attempts = ? AND status = 'SENDING'`)
    .run(status,error,at,new Date(now()).toISOString(),row.ownerId,row.id,row.attempts);
  async function refreshPeriods() {
    const tenants = database.prepare(`SELECT ownerId FROM billingAccounts WHERE stripeSubscriptionId IS NOT NULL
      AND paymentMethodVerifiedAt IS NOT NULL ORDER BY ownerId`).all();
    for (const { ownerId } of tenants) {
      if (stopping) break;
      const usage = service.getUsageSnapshot(ownerId,now());
      if (usage.available) continue;
      const account = query(`SELECT ownerId,stripeCustomerId,stripeSubscriptionId FROM billingAccounts WHERE ownerId = ?`).get(ownerId);
      try {
        const retrieved = await stripeClient.subscriptions.retrieve(account.stripeSubscriptionId, { expand: ['items.data.price'] });
        const subscription = await provisioner.ensureMonthlyItem(ownerId,retrieved);
        service.captureVerifiedSubscription({ ownerId, subscription, sourceEventId: 'api:' + Math.floor(now()/1000) });
      } catch { log('USAGE_PERIOD_REFRESH_FAILED'); }
    }
  }
  function queuePeriods() {
    const periods = database.prepare(`SELECT p.ownerId,p.id FROM voiceUsagePeriods AS p
      JOIN callUsageRecords AS c ON c.ownerId = p.ownerId AND c.answeredStartMs >= p.startMs AND c.answeredStartMs < p.endMs
      WHERE p.kind = 'PAID' AND p.endMs <= ? GROUP BY p.ownerId,p.id
      HAVING SUM(c.minutesBilled) > MAX(p.includedMinutes,COALESCE((SELECT MAX(a.includedMinutes) FROM voiceUsageAllowanceRevisions AS a WHERE a.ownerId = p.ownerId AND a.periodId = p.id),0)) + COALESCE(
        (SELECT SUM(s.units) FROM voiceUsageSubmissions AS s WHERE s.ownerId = p.ownerId AND s.periodId = p.id),0)
      ORDER BY p.endMs LIMIT 100`).all(now());
    for (const period of periods) service.queueClosedPeriod(period.ownerId,period.id,{ at: now() });
  }
  function claim() {
    return database.transaction(() => {
      const found = database.prepare(`SELECT ownerId,id FROM voiceUsageSubmissions
        WHERE (status IN ('PENDING','RETRY') AND nextAttemptMs <= ?) OR (status = 'SENDING' AND leaseUntilMs <= ?)
        ORDER BY nextAttemptMs,id LIMIT 1`).get(now(),now());
      if (!found) return null;
      const row = query('SELECT * FROM voiceUsageSubmissions WHERE ownerId = ? AND id = ?').get(found.ownerId,found.id);
      const at = now();
      // Stripe only guarantees deduplication for at least 24 hours. Never
      // blindly replay an ambiguous request after that window.
      const stale = row.firstAttemptMs !== null && at - row.firstAttemptMs >= 23 * 3600000;
      const tooOld = at/1000 - row.eventTimestamp > 35 * 86400;
      if (stale || tooOld) {
        query(`UPDATE voiceUsageSubmissions SET status = 'REVIEW',lastErrorCode = ?,leaseUntilMs = NULL,updatedAt = ?
          WHERE ownerId = ? AND id = ?`).run(stale ? 'IDEMPOTENCY_WINDOW_EXPIRED' : 'STRIPE_TIMESTAMP_EXPIRED',
            new Date(at).toISOString(),row.ownerId,row.id);
        log(stale ? 'IDEMPOTENCY_WINDOW_EXPIRED' : 'STRIPE_TIMESTAMP_EXPIRED');
        return { review: true };
      }
      query(`UPDATE voiceUsageSubmissions SET status = 'SENDING',attempts = attempts + 1,
        firstAttemptMs = COALESCE(firstAttemptMs,?),leaseUntilMs = ?,updatedAt = ?
        WHERE ownerId = ? AND id = ?`).run(at,at+120000,new Date(at).toISOString(),row.ownerId,row.id);
      return { ...row, attempts: row.attempts+1 };
    }).immediate();
  }
  async function deliver(row) {
    const parameters = { event_name: row.eventName, identifier: row.id, timestamp: row.eventTimestamp,
      payload: { stripe_customer_id: row.stripeCustomerId, value: String(row.units) } };
    try {
      const result = await stripeClient.billing.meterEvents.create(parameters,{ idempotencyKey: row.id });
      if (result.identifier !== row.id || result.event_name !== row.eventName ||
          result.timestamp !== row.eventTimestamp || result.payload?.stripe_customer_id !== row.stripeCustomerId ||
          String(result.payload?.value) !== String(row.units) || result.livemode !== usageConfig.livemode) {
        mark(row,'REVIEW','STRIPE_USAGE_RECEIPT_MISMATCH',now());log('STRIPE_USAGE_RECEIPT_MISMATCH');return;
      }
      query(`UPDATE voiceUsageSubmissions SET status = 'ACCEPTED',acceptedAt = ?,leaseUntilMs = NULL,
        lastErrorCode = NULL,updatedAt = ? WHERE ownerId = ? AND id = ? AND attempts = ? AND status = 'SENDING'`)
        .run(new Date(now()).toISOString(),new Date(now()).toISOString(),row.ownerId,row.id,row.attempts);
    } catch {
      const delay = Math.min(3600000,30000 * 2 ** Math.min(row.attempts-1,7));
      mark(row,'RETRY','STRIPE_USAGE_DELIVERY_FAILED',now()+delay);log('STRIPE_USAGE_DELIVERY_FAILED');
    }
  }
  function runOnce({ refresh = true } = {}) {
    if (active) return active;
    if (stopping || !usageConfig || !providerEnabled()) return Promise.resolve({ enabled: false });
    active = (async () => {
      if (refresh) await refreshPeriods();
      queuePeriods();
      let delivered = 0;
      for (let i=0;i<100 && !stopping;i++) {
        const row = claim();if (!row) break;if (row.review) continue;
        await deliver(row);delivered++;
      }
      return { enabled: true, delivered };
    })().finally(() => { active = null; });
    return active;
  }
  function start() {
    if (timer || !usageConfig) return;
    stopping = false;
    timer = setInterval(() => { void runOnce().catch(() => log('USAGE_WORKER_FAILED')); },30000);
    timer.unref?.();
    void runOnce().catch(() => log('USAGE_WORKER_FAILED'));
  }
  async function stop() { stopping = true;clearInterval(timer);timer = null;if (active) await active; }
  return Object.freeze({ runOnce,start,stop });
}
