import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createBillingStateService, BillingStateError } from '../server/src/billingStateService.js';
import { migrateDatabase } from '../server/src/migrations.js';

const OWNER_A = 'owner-billing-a';
const OWNER_B = 'owner-billing-b';
const BASE_TIME = 1790683200; // 2026-09-29T12:00:00.000Z

function insertOwner(db, id, email) {
  db.prepare(`INSERT INTO users (
    id, ownerId, email, passwordHash, firstName, businessName,
    plan, planStatus, trialEndsAt, paymentFailedAt, timezone, role, createdAt
  ) VALUES (?, NULL, ?, 'hash', 'Owner', 'Business', 'Operator',
    'pending_payment', NULL, NULL, 'UTC', 'owner', '2026-09-29T00:00:00.000Z')`
  ).run(id, email);
}

function harness() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrateDatabase(db);
  insertOwner(db, OWNER_A, 'a@example.invalid');
  insertOwner(db, OWNER_B, 'b@example.invalid');
  let uuid = 0;
  const service = createBillingStateService({
    db,
    pricePlanMap: {
      price_operator_monthly: 'Operator',
      price_quote_monthly: 'QuoteDone',
      price_scale_monthly: 'Scale'
    },
    supplementalPriceIds: ['price_voice_overage'],
    clock: () => new Date('2026-09-29T12:00:00.000Z'),
    randomUUID: () => `billing-test-${++uuid}`
  });
  service.registerBillingCustomer({ ownerId: OWNER_A, stripeCustomerId: 'cus_a' });
  return { db, service };
}

function subscriptionEvent({
  eventId,
  created,
  customer = 'cus_a',
  subscription = 'sub_a',
  status = 'active',
  price = 'price_operator_monthly',
  paymentMethod = 'pm_verified',
  type = 'customer.subscription.updated',
  trialStart = created,
  trialEnd = created + 14 * 24 * 60 * 60
}) {
  return {
    id: eventId,
    type,
    created,
    livemode: false,
    data: {
      object: {
        id: subscription,
        object: 'subscription',
        customer,
        status,
        default_payment_method: paymentMethod,
        created: trialStart,
        trial_start: status === 'trialing' ? trialStart : null,
        trial_end: status === 'trialing' ? trialEnd : null,
        current_period_end: created + 30 * 24 * 60 * 60,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: price } }] },
        metadata: { doNotPersist: 'secret-owner-note' }
      }
    }
  };
}

function invoiceEvent({
  eventId,
  created,
  type,
  customer = 'cus_a',
  subscription = 'sub_a',
  price = 'price_operator_monthly',
  amountPaid = type === 'invoice.paid' ? 11900 : 0
}) {
  return {
    id: eventId,
    type,
    created,
    livemode: false,
    data: {
      object: {
        id: `in_${eventId}`,
        object: 'invoice',
        customer,
        subscription,
        status: type === 'invoice.paid' ? 'paid' : 'open',
        amount_paid: amountPaid,
        lines: {
          data: [
            { pricing: { price_details: { price } } },
            { pricing: { price_details: { price: 'price_voice_overage' } } }
          ]
        },
        customer_email: 'must-not-be-stored@example.invalid'
      }
    }
  };
}

function checkoutEvent({
  eventId,
  created,
  customer = 'cus_a',
  subscription = 'sub_a',
  price = 'price_quote_monthly',
  paymentStatus = 'unpaid',
  setupIntent = null
}) {
  return {
    id: eventId,
    type: 'checkout.session.completed',
    created,
    livemode: false,
    data: {
      object: {
        id: `cs_${eventId}`,
        object: 'checkout.session',
        mode: 'subscription',
        customer,
        subscription,
        status: 'complete',
        payment_status: paymentStatus,
        setup_intent: setupIntent,
        line_items: { data: [{ price: { id: price } }] },
        customer_details: { email: 'must-not-be-stored@example.invalid' }
      }
    }
  };
}

function insertOpenCheckout(db, {
  eventId,
  price = 'price_quote_monthly',
  plan = 'QuoteDone',
  interval = 'monthly',
  customer = 'cus_a',
  providerCreatedOffset = 115
}) {
  const sessionId = `cs_${eventId}`;
  db.prepare(`INSERT INTO billingCheckoutRequests (
    id, ownerId, idempotencyKeyHash, requestDigest, plan, billingInterval,
    stripePriceId, stripeCustomerId, providerIdempotencyKey,
    successUrl, cancelUrl, integrationIdentifier,
    stripeSessionId, sessionUrlCiphertext, sessionUrlIv, sessionUrlTag,
    sessionUrlKeyVersion, status, attemptCount, leaseExpiresAt, expiresAt,
    providerCreatedAt, createdAt, updatedAt
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?,
    'https://app.example/success', 'https://app.example/cancel', 'off_the_clock_checkout_abcdefgh',
    ?, 'ciphertext', 'iv', 'tag', 'v1',
    'OPEN', 1, ?, ?, ?, ?, ?
  )`).run(
    `request-${eventId}`,
    OWNER_A,
    `key-${eventId}`,
    `digest-${eventId}`,
    plan,
    interval,
    price,
    customer,
    `provider-key-${eventId}`,
    sessionId,
    new Date((BASE_TIME + 3600) * 1000).toISOString(),
    new Date((BASE_TIME + 3600) * 1000).toISOString(),
    new Date((BASE_TIME + providerCreatedOffset) * 1000).toISOString(),
    new Date((BASE_TIME + providerCreatedOffset) * 1000).toISOString(),
    new Date((BASE_TIME + providerCreatedOffset) * 1000).toISOString()
  );
  return sessionId;
}

function hasCode(code) {
  return error => error instanceof BillingStateError && error.code === code;
}

test('billing schema stores first-class evidence and sanitized idempotent event receipts', () => {
  const { db } = harness();
  try {
    const accountColumns = new Set(db.prepare('PRAGMA table_info(billingAccounts)').all().map(row => row.name));
    for (const column of [
      'stripeCustomerId', 'stripeSubscriptionId', 'stripePriceId',
      'paymentMethodVerifiedAt', 'paymentFailedAt', 'graceEndsAt',
      'lastStripeEventCreatedAt', 'lastStripeEventRank', 'lastStripeEventId'
    ]) assert.equal(accountColumns.has(column), true, column);
    const receiptColumns = new Set(db.prepare('PRAGMA table_info(billingEventReceipts)').all().map(row => row.name));
    for (const column of ['stripeEventId', 'eventDigest', 'outcome', 'sanitizedReceiptJson', 'resultJson']) {
      assert.equal(receiptColumns.has(column), true, column);
    }
  } finally {
    db.close();
  }
});

test('fresh, direct-write, and legacy unevidenced trials fail closed to pending_payment', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrateDatabase(db);
    const defaultSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get().sql;
    assert.match(defaultSql, /planStatus TEXT NOT NULL DEFAULT 'pending_payment'/);
    db.prepare(`INSERT INTO users (
      id, ownerId, email, passwordHash, firstName, businessName,
      plan, planStatus, trialEndsAt, timezone, role, createdAt
    ) VALUES (?, NULL, ?, 'hash', 'Owner', 'Business', 'QuoteDone',
      'trialing', '2026-10-13T00:00:00.000Z', 'UTC', 'owner', '2026-09-29T00:00:00.000Z')`
    ).run(OWNER_B, 'insert-trigger@example.invalid');
    assert.deepEqual({ ...db.prepare('SELECT planStatus, trialEndsAt FROM users WHERE id=?').get(OWNER_B) }, {
      planStatus: 'pending_payment',
      trialEndsAt: null
    });
    insertOwner(db, OWNER_A, 'legacy@example.invalid');
    db.prepare("UPDATE users SET planStatus='trialing', trialEndsAt='2026-10-13T00:00:00.000Z' WHERE id=?").run(OWNER_A);
    assert.equal(db.prepare('SELECT planStatus FROM users WHERE id=?').get(OWNER_A).planStatus, 'pending_payment');
    db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(OWNER_A);
    assert.equal(db.prepare('SELECT planStatus FROM users WHERE id=?').get(OWNER_A).planStatus, 'pending_payment');
    migrateDatabase(db);
    assert.deepEqual({ ...db.prepare('SELECT planStatus, trialEndsAt FROM users WHERE id=?').get(OWNER_A) }, {
      planStatus: 'pending_payment',
      trialEndsAt: null
    });
  } finally {
    db.close();
  }
});

test('verified event application is idempotent and never stores raw customer metadata', () => {
  const { db, service } = harness();
  try {
    const event = subscriptionEvent({
      eventId: 'evt_trial', created: BASE_TIME, status: 'trialing', price: 'price_quote_monthly'
    });
    const first = service.applyVerifiedStripeEvent(event);
    const duplicate = service.applyVerifiedStripeEvent(structuredClone(event));
    assert.deepEqual(duplicate, first);
    assert.deepEqual(first, {
      outcome: 'APPLIED',
      ownerId: OWNER_A,
      plan: 'QuoteDone',
      planStatus: 'trialing',
      trialEndsAt: new Date((BASE_TIME + 14 * 24 * 60 * 60) * 1000).toISOString(),
      graceEndsAt: null,
      changed: true
    });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM billingEventReceipts').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM events').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 1);
    const receipt = db.prepare('SELECT sanitizedReceiptJson FROM billingEventReceipts').get().sanitizedReceiptJson;
    assert.equal(receipt.includes('secret-owner-note'), false);
    assert.equal(receipt.includes('must-not-be-stored'), false);
  } finally {
    db.close();
  }
});

test('same event ID with changed authoritative fields is rejected', () => {
  const { db, service } = harness();
  try {
    service.applyVerifiedStripeEvent(subscriptionEvent({ eventId: 'evt_conflict', created: BASE_TIME }));
    assert.throws(() => service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_conflict', created: BASE_TIME, price: 'price_scale_monthly'
    })), hasCode('EVENT_ID_CONFLICT'));
    assert.equal(db.prepare('SELECT plan FROM users WHERE id=?').get(OWNER_A).plan, 'Operator');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM billingEventReceipts').get().count, 1);
  } finally {
    db.close();
  }
});

test('customer and subscription IDs mapped to different owners are rejected atomically', () => {
  const { db, service } = harness();
  try {
    service.registerBillingCustomer({ ownerId: OWNER_B, stripeCustomerId: 'cus_b' });
    db.prepare("UPDATE billingAccounts SET stripeSubscriptionId='sub_a' WHERE ownerId=?").run(OWNER_A);
    db.prepare("UPDATE billingAccounts SET stripeSubscriptionId='sub_b' WHERE ownerId=?").run(OWNER_B);
    assert.throws(() => service.applyVerifiedStripeEvent(invoiceEvent({
      eventId: 'evt_cross', created: BASE_TIME, type: 'invoice.payment_failed',
      customer: 'cus_a', subscription: 'sub_b'
    })), hasCode('CROSS_ACCOUNT_IDS'));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM billingEventReceipts').get().count, 0);
  } finally {
    db.close();
  }
});

test('unrecognized prices and ambiguous base plans are rejected without changing access', () => {
  const { db, service } = harness();
  try {
    assert.throws(() => service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_unknown_price', created: BASE_TIME, price: 'price_not_configured'
    })), hasCode('UNRECOGNIZED_PRICE'));
    const ambiguous = subscriptionEvent({ eventId: 'evt_ambiguous', created: BASE_TIME });
    ambiguous.data.object.items.data.push({ price: { id: 'price_quote_monthly' } });
    assert.throws(() => service.applyVerifiedStripeEvent(ambiguous), hasCode('AMBIGUOUS_PRICE'));
    assert.deepEqual({ ...db.prepare('SELECT plan, planStatus FROM users WHERE id=?').get(OWNER_A) }, {
      plan: 'Operator', planStatus: 'pending_payment'
    });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM billingEventReceipts').get().count, 0);
  } finally {
    db.close();
  }
});

test('an older out-of-order failure is receipted but cannot regress newer active state', () => {
  const { db, service } = harness();
  try {
    service.applyVerifiedStripeEvent(subscriptionEvent({ eventId: 'evt_active_new', created: BASE_TIME + 200 }));
    const stale = service.applyVerifiedStripeEvent(invoiceEvent({
      eventId: 'evt_failed_old', created: BASE_TIME + 100, type: 'invoice.payment_failed'
    }));
    assert.equal(stale.outcome, 'IGNORED_STALE');
    assert.equal(stale.planStatus, 'active');
    assert.deepEqual({ ...db.prepare('SELECT planStatus FROM users WHERE id=?').get(OWNER_A) }, { planStatus: 'active' });
    assert.deepEqual({ ...db.prepare('SELECT paymentFailedAt, graceEndsAt FROM billingAccounts WHERE ownerId=?').get(OWNER_A) }, {
      paymentFailedAt: null,
      graceEndsAt: null
    });
    assert.equal(db.prepare("SELECT outcome FROM billingEventReceipts WHERE stripeEventId='evt_failed_old'").get().outcome, 'IGNORED_STALE');
  } finally {
    db.close();
  }
});

test('payment failure preserves seven days of service and paid recovery restores immediately', () => {
  const { db, service } = harness();
  try {
    service.applyVerifiedStripeEvent(subscriptionEvent({ eventId: 'evt_active', created: BASE_TIME }));
    const failed = service.applyVerifiedStripeEvent(invoiceEvent({
      eventId: 'evt_failed', created: BASE_TIME + 100, type: 'invoice.payment_failed'
    }));
    const failedAt = new Date((BASE_TIME + 100) * 1000).toISOString();
    const graceEndsAt = new Date((BASE_TIME + 100) * 1000 + 7 * 24 * 60 * 60 * 1000).toISOString();
    assert.deepEqual(failed, {
      outcome: 'APPLIED', ownerId: OWNER_A, plan: 'Operator', planStatus: 'payment_failed',
      trialEndsAt: null, graceEndsAt, changed: true
    });
    assert.deepEqual({ ...db.prepare('SELECT paymentFailedAt, graceEndsAt FROM billingAccounts WHERE ownerId=?').get(OWNER_A) }, {
      paymentFailedAt: failedAt,
      graceEndsAt
    });
    assert.equal(db.prepare('SELECT paymentFailedAt FROM users WHERE id=?').get(OWNER_A).paymentFailedAt, failedAt);
    const paid = service.applyVerifiedStripeEvent(invoiceEvent({
      eventId: 'evt_paid', created: BASE_TIME + 200, type: 'invoice.paid', amountPaid: 11900
    }));
    assert.equal(paid.planStatus, 'active');
    assert.equal(paid.graceEndsAt, null);
    assert.deepEqual({ ...db.prepare('SELECT paymentFailedAt, graceEndsAt FROM billingAccounts WHERE ownerId=?').get(OWNER_A) }, {
      paymentFailedAt: null,
      graceEndsAt: null
    });
    assert.equal(db.prepare('SELECT paymentFailedAt FROM users WHERE id=?').get(OWNER_A).paymentFailedAt, null);
  } finally {
    db.close();
  }
});

test('expired grace is suspended idempotently and queues one transition', () => {
  const { db, service } = harness();
  try {
    service.applyVerifiedStripeEvent(subscriptionEvent({ eventId: 'evt_active_sweep', created: BASE_TIME }));
    service.applyVerifiedStripeEvent(invoiceEvent({
      eventId: 'evt_failed_sweep', created: BASE_TIME + 1, type: 'invoice.payment_failed'
    }));
    const before = db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count;
    const afterGrace = new Date((BASE_TIME + 1) * 1000 + 7 * 24 * 60 * 60 * 1000 + 1);
    assert.deepEqual(service.suspendExpiredGracePeriods({ at: afterGrace }), { suspendedCount: 1 });
    assert.deepEqual(service.suspendExpiredGracePeriods({ at: afterGrace }), { suspendedCount: 0 });
    assert.equal(db.prepare('SELECT planStatus FROM users WHERE id=?').get(OWNER_A).planStatus, 'suspended');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, before + 1);
  } finally {
    db.close();
  }
});

test('subscription deletion cancels immediately and a later stale active update cannot reopen it', () => {
  const { db, service } = harness();
  try {
    service.applyVerifiedStripeEvent(subscriptionEvent({ eventId: 'evt_active_cancel', created: BASE_TIME }));
    service.applyVerifiedStripeEvent(invoiceEvent({
      eventId: 'evt_failed_cancel', created: BASE_TIME + 50, type: 'invoice.payment_failed'
    }));
    const canceled = service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_deleted', created: BASE_TIME + 100,
      type: 'customer.subscription.deleted', status: 'canceled'
    }));
    assert.equal(canceled.planStatus, 'canceled');
    const stale = service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_active_stale', created: BASE_TIME + 50, status: 'active'
    }));
    assert.equal(stale.outcome, 'IGNORED_TERMINAL_SUBSCRIPTION');
    assert.equal(db.prepare('SELECT planStatus FROM users WHERE id=?').get(OWNER_A).planStatus, 'canceled');
    assert.equal(
      db.prepare('SELECT paymentFailedAt FROM users WHERE id=?').get(OWNER_A).paymentFailedAt,
      new Date((BASE_TIME + 50) * 1000).toISOString()
    );
  } finally {
    db.close();
  }
});

test('verified terminal deletion permits only a newer server-ledger Checkout to bind a replacement subscription', () => {
  const { db, service } = harness();
  try {
    service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_original_active',
      created: BASE_TIME,
      subscription: 'sub_original'
    }));
    service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_original_deleted',
      created: BASE_TIME + 100,
      subscription: 'sub_original',
      type: 'customer.subscription.deleted',
      status: 'canceled'
    }));

    assert.throws(() => service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_unlinked_created',
      created: BASE_TIME + 110,
      subscription: 'sub_replacement',
      status: 'trialing',
      price: 'price_quote_monthly'
    })), hasCode('SUBSCRIPTION_REPLACEMENT_NOT_AUTHORIZED'));
    assert.throws(() => service.applyVerifiedStripeEvent(checkoutEvent({
      eventId: 'evt_unlinked_checkout',
      created: BASE_TIME + 111,
      subscription: 'sub_replacement',
      setupIntent: 'seti_verified'
    })), hasCode('SUBSCRIPTION_REPLACEMENT_NOT_AUTHORIZED'));

    insertOpenCheckout(db, {
      eventId: 'evt_predelete_checkout',
      providerCreatedOffset: 50
    });
    assert.throws(() => service.applyVerifiedStripeEvent(checkoutEvent({
      eventId: 'evt_predelete_checkout',
      created: BASE_TIME + 112,
      subscription: 'sub_replacement',
      setupIntent: 'seti_verified'
    })), hasCode('SUBSCRIPTION_REPLACEMENT_NOT_AUTHORIZED'));
    db.prepare(`UPDATE billingCheckoutRequests
      SET status='EXPIRED' WHERE id='request-evt_predelete_checkout'`).run();

    insertOpenCheckout(db, { eventId: 'evt_resubscribe' });
    const rebound = service.applyVerifiedStripeEvent(checkoutEvent({
      eventId: 'evt_resubscribe',
      created: BASE_TIME + 120,
      subscription: 'sub_replacement',
      setupIntent: 'seti_verified',
      paymentStatus: 'no_payment_required'
    }));
    assert.equal(rebound.plan, 'QuoteDone');
    assert.equal(rebound.planStatus, 'pending_subscription');
    assert.deepEqual({ ...db.prepare(`
      SELECT stripeSubscriptionId, stripePriceId, canceledAt, paymentMethodVerifiedAt
      FROM billingAccounts WHERE ownerId = ?
    `).get(OWNER_A) }, {
      stripeSubscriptionId: 'sub_replacement',
      stripePriceId: 'price_quote_monthly',
      canceledAt: null,
      paymentMethodVerifiedAt: new Date((BASE_TIME + 120) * 1000).toISOString()
    });
    assert.deepEqual({ ...db.prepare(`
      SELECT status, stripeSubscriptionId, consumedAt
      FROM billingCheckoutRequests WHERE id = ?
    `).get('request-evt_resubscribe') }, {
      status: 'COMPLETED',
      stripeSubscriptionId: 'sub_replacement',
      consumedAt: new Date((BASE_TIME + 120) * 1000).toISOString()
    });
    assert.deepEqual(db.prepare(`
      SELECT stripeSubscriptionId, status FROM billingSubscriptionHistory
      WHERE ownerId = ? ORDER BY stripeSubscriptionId
    `).all(OWNER_A).map(row => ({ ...row })), [
      { stripeSubscriptionId: 'sub_original', status: 'TERMINAL' },
      { stripeSubscriptionId: 'sub_replacement', status: 'CURRENT' }
    ]);

    const preCheckoutCreated = service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_replacement_created_too_early',
      created: BASE_TIME + 114,
      subscription: 'sub_replacement',
      type: 'customer.subscription.created',
      status: 'trialing',
      price: 'price_quote_monthly'
    }));
    assert.equal(preCheckoutCreated.outcome, 'IGNORED_STALE');
    assert.equal(preCheckoutCreated.planStatus, 'pending_subscription');

    const trial = service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_replacement_trial',
      created: BASE_TIME + 119,
      subscription: 'sub_replacement',
      type: 'customer.subscription.created',
      status: 'trialing',
      price: 'price_quote_monthly'
    }));
    assert.equal(trial.planStatus, 'trialing');
    assert.deepEqual({ ...db.prepare(`
      SELECT lastStripeEventCreatedAt, lastStripeEventId
      FROM billingAccounts WHERE ownerId = ?
    `).get(OWNER_A) }, {
      lastStripeEventCreatedAt: BASE_TIME + 120,
      lastStripeEventId: 'evt_resubscribe'
    });

    const terminalReplay = service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_old_subscription_late',
      created: BASE_TIME + 1000,
      subscription: 'sub_original',
      status: 'active',
      price: 'price_operator_monthly'
    }));
    assert.equal(terminalReplay.outcome, 'IGNORED_TERMINAL_SUBSCRIPTION');
    assert.deepEqual({ ...db.prepare(`
      SELECT stripeSubscriptionId, stripePriceId FROM billingAccounts WHERE ownerId = ?
    `).get(OWNER_A) }, {
      stripeSubscriptionId: 'sub_replacement',
      stripePriceId: 'price_quote_monthly'
    });
    assert.equal(
      db.prepare("SELECT outcome FROM billingEventReceipts WHERE stripeEventId='evt_old_subscription_late'").get().outcome,
      'IGNORED_TERMINAL_SUBSCRIPTION'
    );
    assert.equal(
      db.prepare("SELECT outcome FROM billingEventReceipts WHERE stripeEventId='evt_original_deleted'").get().outcome,
      'APPLIED'
    );
    assert.throws(() => service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_intruder_subscription',
      created: BASE_TIME + 1100,
      subscription: 'sub_intruder',
      status: 'active',
      price: 'price_scale_monthly'
    })), hasCode('SUBSCRIPTION_REPLACEMENT_NOT_AUTHORIZED'));
    assert.equal(db.prepare(
      "SELECT COUNT(*) AS count FROM billingEventReceipts WHERE stripeEventId='evt_intruder_subscription'"
    ).get().count, 0);
  } finally {
    db.close();
  }
});

test('Checkout completion without paid or setup evidence cannot start a trial', () => {
  const { db, service } = harness();
  try {
    const wrongMode = checkoutEvent({ eventId: 'evt_checkout_payment_mode', created: BASE_TIME - 1 });
    wrongMode.data.object.mode = 'payment';
    assert.throws(() => service.applyVerifiedStripeEvent(wrongMode), hasCode('INVALID_EVENT'));
    const checkout = service.applyVerifiedStripeEvent(checkoutEvent({
      eventId: 'evt_checkout_unpaid', created: BASE_TIME
    }));
    assert.equal(checkout.plan, 'QuoteDone');
    assert.equal(checkout.planStatus, 'pending_payment');
    assert.equal(db.prepare('SELECT paymentMethodVerifiedAt FROM billingAccounts WHERE ownerId=?').get(OWNER_A).paymentMethodVerifiedAt, null);

    const unevidencedTrial = service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_trial_unverified', created: BASE_TIME + 1, status: 'trialing',
      price: 'price_quote_monthly', paymentMethod: null
    }));
    assert.equal(unevidencedTrial.planStatus, 'pending_payment');

    const verifiedTrial = service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_trial_verified', created: BASE_TIME + 2, status: 'trialing',
      price: 'price_quote_monthly', paymentMethod: 'pm_verified'
    }));
    assert.equal(verifiedTrial.planStatus, 'trialing');
  } finally {
    db.close();
  }
});

test('a state-write failure rolls back identifier binding, logs, outbox, and receipt', () => {
  const { db, service } = harness();
  try {
    db.exec(`CREATE TRIGGER reject_active_billing
      BEFORE UPDATE OF planStatus ON users
      WHEN NEW.planStatus = 'active'
      BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`);
    assert.throws(() => service.applyVerifiedStripeEvent(subscriptionEvent({
      eventId: 'evt_rollback', created: BASE_TIME, subscription: 'sub_rollback'
    })), /injected write failure/);
    assert.deepEqual({ ...db.prepare('SELECT stripeSubscriptionId, lastStripeEventId FROM billingAccounts WHERE ownerId=?').get(OWNER_A) }, {
      stripeSubscriptionId: null,
      lastStripeEventId: null
    });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM billingEventReceipts').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM events').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM outboxEvents').get().count, 0);
  } finally {
    db.close();
  }
});
