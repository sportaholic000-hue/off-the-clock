import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { installBillingRoutes } from '../server/src/billingRoutes.js';
import { migrateDatabase } from '../server/src/migrations.js';
import { trialEligible } from '../server/src/billingMutationGuard.js';

// Owner ruling 2026-11-12: one free trial per business account. Expected
// values written before execution:
// - an account that has ever had a trial (a subscription Stripe reported with a
//   trial end, a completed checkout, or a current trial end date) or has ever
//   paid gets Checkout with no trial_period_days and trialEligible:false;
// - a brand-new account still gets 14 days and trialEligible:true;
// - a paid account still gets no trial.
// Before this change, the canceled account with a past trial and no paid
// invoice got trial_period_days: 14 again and the status had no trialEligible.

const NOW = '2026-11-12T12:00:00.000Z';
const OWNER = 'owner-trial-a';
const CUSTOMER = 'cus_SYNTHETIC_trial_a';
const OLD_SUB = 'sub_SYNTHETIC_old_trial';

function routeApp() {
  const routes = [];
  return {
    routes,
    post(path, ...handlers) { routes.push({ method: 'post', path, handlers }); },
    get(path, ...handlers) { routes.push({ method: 'get', path, handlers }); }
  };
}

function prices() {
  return {
    Starter: { monthly: 'price_SYNTHETIC_starter_month', annual: 'price_SYNTHETIC_starter_year' },
    Operator: { monthly: 'price_SYNTHETIC_operator_month', annual: 'price_SYNTHETIC_operator_year' },
    QuoteDone: { monthly: 'price_SYNTHETIC_quotedone_month', annual: 'price_SYNTHETIC_quotedone_year' },
    Scale: { monthly: 'price_SYNTHETIC_scale_month', annual: 'price_SYNTHETIC_scale_year' }
  };
}

function harness() {
  const app = routeApp();
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrateDatabase(db);
  db.prepare(`INSERT INTO users (id, ownerId, email, passwordHash, firstName, businessName, plan,
      planStatus, trialEndsAt, paymentFailedAt, timezone, role, createdAt)
    VALUES (?, NULL, ?, 'hash', '[SYNTHETIC] Pat', '[SYNTHETIC] Cedar Co', 'Operator', 'pending_payment',
      NULL, NULL, 'UTC', 'owner', '2026-10-01T00:00:00.000Z')`).run(OWNER, 'trial-a@example.invalid');
  const calls = { customer: [], checkout: [] };
  let sessions = 0;
  const stripeClient = {
    customers: { create: async (...args) => (calls.customer.push(args), { id: CUSTOMER }) },
    subscriptions: { list: async () => ({ data: [], has_more: false }) },
    checkout: {
      sessions: {
        retrieve: async () => { throw new Error('not expected'); },
        create: async (...args) => {
          calls.checkout.push(args);
          const created = Math.floor(Date.parse(NOW) / 1000);
          return { id: `cs_SYNTHETIC_${++sessions}`, mode: 'subscription', status: 'open', customer: CUSTOMER,
            created, expires_at: created + 3600, url: 'https://checkout.stripe.com/c/pay/synthetic' };
        }
      }
    },
    billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.com/p/session/synthetic' }) } }
  };
  const billingStateService = {
    registerBillingCustomer({ ownerId, stripeCustomerId }) {
      db.prepare(`INSERT INTO billingAccounts (ownerId, stripeCustomerId, stripeSubscriptionId, cancelAtPeriodEnd, createdAt, updatedAt)
        VALUES (?, ?, NULL, 0, ?, ?)`).run(ownerId, stripeCustomerId, NOW, NOW);
    }
  };
  let uuid = 0;
  installBillingRoutes(app, {
    stripeClient, billingStateService, database: db,
    requireAuth: () => (_req, _res, next) => next(),
    requireProviderWrites: (_req, _res, next) => next(),
    asyncHandler: handler => handler,
    priceIds: prices(),
    successUrl: 'https://app.offtheclock.test/settings/billing/success?session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://app.offtheclock.test/settings/billing/canceled',
    portalReturnUrl: 'https://app.offtheclock.test/settings/billing',
    integrationIdentifier: 'off_the_clock_checkout_abcdefgh',
    checkoutReceiptEncryptionKey: '22'.repeat(32),
    clock: () => new Date(NOW),
    randomUUID: () => `checkout-request-${++uuid}`
  });
  return { app, db, calls };
}

async function invoke(app, path, body = {}, key = 'one-trial-request-key-0001') {
  const route = app.routes.find(candidate => candidate.path === path);
  const headers = { 'idempotency-key': key };
  const req = { body, headers, tenantOwnerId: OWNER, get: name => headers[name.toLowerCase()] };
  const res = { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return value; } };
  await route.handlers.at(-1)(req, res);
  return res;
}

// A canceled account whose only subscription was a trial that Stripe ended
// before any payment: verified deletion, terminal history, no paid invoice.
function canceledAfterTrial(db, { evidence = true, completedCheckout = true } = {}) {
  db.prepare(`INSERT INTO billingAccounts (ownerId, stripeCustomerId, stripeSubscriptionId, paymentMethodVerifiedAt,
      cancelAtPeriodEnd, canceledAt, createdAt, updatedAt)
    VALUES (?, ?, ?, '2026-10-01T00:05:00.000Z', 0, '2026-10-10T00:00:00.000Z', '2026-10-01T00:00:00.000Z', ?)`)
    .run(OWNER, CUSTOMER, OLD_SUB, NOW);
  db.prepare("UPDATE users SET planStatus='canceled' WHERE id=?").run(OWNER);
  db.prepare(`INSERT INTO billingEventReceipts (stripeEventId, ownerId, eventType, objectId, eventCreatedAt,
      eventDigest, outcome, sanitizedReceiptJson, resultJson, processedAt)
    VALUES ('evt_SYNTHETIC_deleted', ?, 'customer.subscription.deleted', ?, 1791590400, 'digest', 'APPLIED', '{}', '{}', '2026-10-10T00:00:00.000Z')`)
    .run(OWNER, OLD_SUB);
  db.prepare(`INSERT INTO billingSubscriptionHistory (stripeSubscriptionId, ownerId, stripeCustomerId, status, firstEventId,
      firstEventCreatedAt, terminalEventId, terminalEventCreatedAt, createdAt, updatedAt)
    VALUES (?, ?, ?, 'TERMINAL', 'evt_SYNTHETIC_created', 1790812800, 'evt_SYNTHETIC_deleted', 1791590400, ?, ?)`)
    .run(OLD_SUB, OWNER, CUSTOMER, NOW, NOW);
  if (evidence) {
    db.prepare(`INSERT INTO billingSubscriptionEvidence (stripeSubscriptionId, ownerId, stripeCustomerId, eventCreatedAt, stateJson)
      VALUES (?, ?, ?, 1791590400, ?)`).run(OLD_SUB, OWNER, CUSTOMER, JSON.stringify({
      plan: 'Operator', status: 'canceled', trialStart: 1790812800, trialEnd: 1792022400, canceledAt: 1791590400, endedAt: 1791590400
    }));
  }
  if (completedCheckout) {
    db.prepare(`INSERT INTO billingCheckoutRequests (id, ownerId, idempotencyKeyHash, requestDigest, plan, billingInterval,
        stripePriceId, stripeCustomerId, providerIdempotencyKey, successUrl, cancelUrl, integrationIdentifier,
        stripeSessionId, stripeSubscriptionId, status, attemptCount, leaseExpiresAt, expiresAt, providerCreatedAt,
        consumedAt, createdAt, updatedAt)
      VALUES ('checkout-old-trial', ?, ?, ?, 'Operator', 'monthly', 'price_SYNTHETIC_operator_month', ?, 'otc:old',
        'https://app.offtheclock.test/settings/billing/success', 'https://app.offtheclock.test/settings/billing/canceled',
        'off_the_clock_checkout_abcdefgh', 'cs_SYNTHETIC_old', ?, 'COMPLETED', 1,
        '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z', '2026-10-01T00:00:00.000Z',
        '2026-10-01T00:05:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-01T00:05:00.000Z')`)
      .run(OWNER, 'a'.repeat(64), 'b'.repeat(64), CUSTOMER, OLD_SUB);
  }
}

const TRIAL = { trial_period_days: 14, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } };

test('brand-new account: Checkout still carries the 14-day trial and trialEligible is true', async () => {
  const { app, db, calls } = harness();
  try {
    const status = await invoke(app, '/api/billing/status');
    assert.equal(status.body.trialEligible, true);
    assert.equal(status.body.trialNotStarted, true);
    const checkout = await invoke(app, '/api/billing/checkout', { plan: 'Operator', billingInterval: 'monthly' });
    assert.equal(checkout.statusCode, 201);
    assert.deepEqual(calls.checkout[0][0].subscription_data, TRIAL);
  } finally { db.close(); }
});

for (const [label, options] of [
  ['trial evidence and completed trial checkout', {}],
  ['only the subscription trial end', { completedCheckout: false }],
  ['only the completed trial checkout', { evidence: false }]
]) test(`canceled account with a past trial and no paid invoice (${label}): Checkout has no trial and trialEligible is false`, async () => {
  const { app, db, calls } = harness();
  try {
    canceledAfterTrial(db, options);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM billingInvoiceEvidence WHERE ownerId=? AND status='PAID'").get(OWNER).n, 0);
    assert.equal(db.prepare('SELECT trialEndsAt FROM users WHERE id=?').get(OWNER).trialEndsAt, null, 'cancellation cleared the current trial date');
    const status = await invoke(app, '/api/billing/status');
    assert.equal(status.body.canCheckout, true);
    assert.equal(status.body.trialEligible, false);
    const checkout = await invoke(app, '/api/billing/checkout', { plan: 'Operator', billingInterval: 'monthly' });
    assert.equal(checkout.statusCode, 201);
    assert.equal(calls.checkout.length, 1);
    const params = calls.checkout[0][0];
    assert.deepEqual(params.subscription_data, {});
    assert.equal(Object.hasOwn(params.subscription_data, 'trial_period_days'), false);
    assert.equal(params.payment_method_collection, 'always');
  } finally { db.close(); }
});

test('paid account: Checkout still has no trial and trialEligible is false', async () => {
  const { app, db, calls } = harness();
  try {
    canceledAfterTrial(db, { evidence: false, completedCheckout: false });
    db.prepare(`INSERT INTO billingInvoiceEvidence (stripeInvoiceId, ownerId, stripeCustomerId, stripeSubscriptionId, status, paidAt, amountPaid)
      VALUES ('in_SYNTHETIC_paid', ?, ?, ?, 'PAID', 1791000000, 12900)`).run(OWNER, CUSTOMER, OLD_SUB);
    const status = await invoke(app, '/api/billing/status');
    assert.equal(status.body.trialEligible, false);
    const checkout = await invoke(app, '/api/billing/checkout', { plan: 'Operator', billingInterval: 'monthly' });
    assert.equal(checkout.statusCode, 201);
    assert.deepEqual(calls.checkout[0][0].subscription_data, {});
  } finally { db.close(); }
});

test('trialEligible: each stored trial or payment record ends eligibility; a zero-amount invoice alone does not', () => {
  const { db } = harness();
  try {
    assert.equal(trialEligible(db, OWNER), true);
    db.prepare("UPDATE users SET trialEndsAt='2026-11-20T00:00:00.000Z' WHERE id=?").run(OWNER);
    assert.equal(db.prepare('SELECT trialEndsAt FROM users WHERE id=?').get(OWNER).trialEndsAt, '2026-11-20T00:00:00.000Z');
    assert.equal(trialEligible(db, OWNER), false);
    db.prepare('UPDATE users SET trialEndsAt=NULL WHERE id=?').run(OWNER);
    db.prepare("UPDATE users SET paidThroughAt='2026-12-01T00:00:00.000Z' WHERE id=?").run(OWNER);
    assert.equal(trialEligible(db, OWNER), false);
    db.prepare('UPDATE users SET paidThroughAt=NULL WHERE id=?').run(OWNER);
    db.prepare(`INSERT INTO billingAccounts (ownerId, stripeCustomerId, cancelAtPeriodEnd, createdAt, updatedAt) VALUES (?, ?, 0, ?, ?)`).run(OWNER, CUSTOMER, NOW, NOW);
    db.prepare(`INSERT INTO billingInvoiceEvidence (stripeInvoiceId, ownerId, stripeCustomerId, stripeSubscriptionId, status, paidAt, amountPaid)
      VALUES ('in_SYNTHETIC_zero', ?, ?, ?, 'PAID', 1791000000, 0)`).run(OWNER, CUSTOMER, OLD_SUB);
    assert.equal(trialEligible(db, OWNER), true, 'a $0 invoice is not a payment');
    db.prepare(`INSERT INTO billingSubscriptionEvidence (stripeSubscriptionId, ownerId, stripeCustomerId, eventCreatedAt, stateJson)
      VALUES (?, ?, ?, 1, ?)`).run(OLD_SUB, OWNER, CUSTOMER, JSON.stringify({ status: 'incomplete_expired', trialEnd: null }));
    assert.equal(trialEligible(db, OWNER), true, 'a subscription without a trial end is not trial evidence');
    db.prepare('UPDATE billingSubscriptionEvidence SET stateJson=? WHERE stripeSubscriptionId=?').run('not json', OLD_SUB);
    assert.equal(trialEligible(db, OWNER), false, 'unreadable evidence never grants a trial');
    assert.equal(trialEligible(db, 'missing-owner'), false);
    assert.equal(trialEligible(db, ''), false);
    assert.throws(() => trialEligible({ prepare() { throw new Error('no such table'); } }, OWNER), /no such table/, 'checkout fails rather than adding a trial it cannot justify');
  } finally { db.close(); }
});

test('terms page and demo say the free trial is available once per business', async () => {
  const terms = readFileSync(new URL('../site/www/terms/index.html', import.meta.url), 'utf8');
  assert.equal(terms.split('The free trial is available once per business.').length, 2);
  assert.doesNotMatch(terms, /have not paid for Off The Clock before/);
  const { demoInstructions } = await import('../server/src/demo/demoInstructions.js');
  const demo = demoInstructions('Miles');
  assert.equal(demo.split('The free trial is available once per business.').length, 2);
  assert.doesNotMatch(demo, /have not paid for Off The Clock before/);
});
