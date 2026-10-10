import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  BillingRouteError,
  SUPPORTED_BILLING_WEBHOOK_EVENTS,
  installBillingRoutes,
  installBillingWebhookRoute
} from '../server/src/billingRoutes.js';
import { migrateDatabase } from '../server/src/migrations.js';

function routeApp() {
  const routes = [];
  return {
    routes,
    post(path, ...handlers) {
      routes.push({ method: 'post', path, handlers });
    },
    get(path, ...handlers) {
      routes.push({ method: 'get', path, handlers });
    }
  };
}

function responseCapture() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    }
  };
}

function request({ body, headers = {}, tenantOwnerId } = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    body,
    headers: normalized,
    tenantOwnerId,
    get(name) { return normalized[name.toLowerCase()]; }
  };
}

function prices() {
  return {
    Starter:{monthly:'price_SYNTHETIC_starter_month',annual:'price_SYNTHETIC_starter_year'},
  Operator: {
      monthly: 'price_operator_monthly_1',
      annual: 'price_operator_annual_1'
    },
    QuoteDone: {
      monthly: 'price_quotedone_monthly_1',
      annual: 'price_quotedone_annual_1'
    },
    Scale: {
      monthly: 'price_scale_monthly_1',
      annual: 'price_scale_annual_1'
    }
  };
}

function webhookEvent(type = 'customer.subscription.updated') {
  return {
    id: 'evt_verified',
    type,
    created: 1790683200,
    data: {
      object: {
        id: type.startsWith('checkout.') ? 'cs_verified' : 'sub_verified',
        customer: 'cus_verified',
        subscription: type.startsWith('checkout.') ? 'sub_verified' : undefined,
        status: type.startsWith('checkout.') ? 'complete' : 'active'
      }
    }
  };
}

test('webhook installer keeps the raw parser before the handler and exposes the exact supported allowlist', () => {
  const app = routeApp();
  const rawBodyMiddleware = () => {};
  installBillingWebhookRoute(app, {
    rawBodyMiddleware,
    constructEvent: () => webhookEvent(),
    webhookSecret: 'whsec_test',
    billingStateService: { applyVerifiedStripeEvent() {} },
    stripeClient: { checkout: { sessions: { retrieve() {} } } }
  });

  assert.deepEqual(SUPPORTED_BILLING_WEBHOOK_EVENTS, [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_failed'
  ]);
  assert.equal(app.routes.length, 1);
  assert.equal(app.routes[0].path, '/api/stripe/webhook');
  assert.equal(app.routes[0].handlers[0], rawBodyMiddleware);
});

test('verified webhook bytes are passed unchanged and supported events are acknowledged generically', async () => {
  const app = routeApp();
  const rawBody = Buffer.from('{"signed":true}', 'utf8');
  const event = webhookEvent();
  const verifierCalls = [];
  const applied = [];
  installBillingWebhookRoute(app, {
    rawBodyMiddleware: () => {},
    constructEvent: (...args) => (verifierCalls.push(args), event),
    webhookSecret: 'whsec_test',
    billingStateService: { applyVerifiedStripeEvent: value => applied.push(value) },
    stripeClient: { checkout: { sessions: { retrieve() { throw new Error('not expected'); } } } }
  });

  const res = responseCapture();
  await app.routes[0].handlers[1](request({
    body: rawBody,
    headers: { 'stripe-signature': 't=1,v1=signed' }
  }), res);

  assert.equal(verifierCalls.length, 1);
  assert.equal(verifierCalls[0][0], rawBody);
  assert.equal(verifierCalls[0][1], 't=1,v1=signed');
  assert.equal(verifierCalls[0][2], 'whsec_test');
  assert.equal(applied[0], event);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { received: true, status: 'PROCESSED' });
});

test('webhook rejects parsed bodies, missing or bad signatures, and state failures without leaking details', async () => {
  const cases = [
    { body: {}, headers: { 'stripe-signature': 'signed' }, verifier: () => webhookEvent() },
    { body: Buffer.from('{}'), headers: {}, verifier: () => webhookEvent() },
    { body: Buffer.from('{}'), headers: { 'stripe-signature': 'bad' }, verifier: () => { throw new Error('secret diagnostic'); } }
  ];
  for (const item of cases) {
    const app = routeApp();
    let applied = 0;
    installBillingWebhookRoute(app, {
      rawBodyMiddleware: () => {},
      constructEvent: item.verifier,
      webhookSecret: 'whsec_test',
      billingStateService: { applyVerifiedStripeEvent() { applied += 1; } },
      stripeClient: { checkout: { sessions: { retrieve() {} } } }
    });
    const res = responseCapture();
    await app.routes[0].handlers[1](request(item), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid webhook request.' });
    assert.equal(applied, 0);
    assert.equal(JSON.stringify(res.body).includes('secret diagnostic'), false);
  }

  const app = routeApp();
  installBillingWebhookRoute(app, {
    rawBodyMiddleware: () => {},
    constructEvent: () => webhookEvent(),
    webhookSecret: 'whsec_test',
    billingStateService: { applyVerifiedStripeEvent() { throw new Error('database details'); } },
    stripeClient: { checkout: { sessions: { retrieve() {} } } }
  });
  const res = responseCapture();
  await app.routes[0].handlers[1](request({
    body: Buffer.from('{}'), headers: { 'stripe-signature': 'signed' }
  }), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Webhook processing failed.' });
  assert.equal(JSON.stringify(res.body).includes('database details'), false);
});

test('unsupported verified events are ignored and Checkout line items are hydrated without replacing signed identity', async () => {
  const ignoredApp = routeApp();
  let ignoredCalls = 0;
  installBillingWebhookRoute(ignoredApp, {
    rawBodyMiddleware: () => {},
    constructEvent: () => webhookEvent('charge.refunded'),
    webhookSecret: 'whsec_test',
    billingStateService: { applyVerifiedStripeEvent() { ignoredCalls += 1; } },
    stripeClient: { checkout: { sessions: { retrieve() { throw new Error('not expected'); } } } }
  });
  const ignoredResponse = responseCapture();
  await ignoredApp.routes[0].handlers[1](request({
    body: Buffer.from('{}'), headers: { 'stripe-signature': 'signed' }
  }), ignoredResponse);
  assert.deepEqual(ignoredResponse.body, { received: true, status: 'IGNORED' });
  assert.equal(ignoredCalls, 0);

  const checkout = webhookEvent('checkout.session.completed');
  checkout.data.object.payment_status = 'no_payment_required';
  const app = routeApp();
  const retrieves = [];
  const applied = [];
  installBillingWebhookRoute(app, {
    rawBodyMiddleware: () => {},
    constructEvent: () => checkout,
    webhookSecret: 'whsec_test',
    billingStateService: { applyVerifiedStripeEvent: event => applied.push(event) },
    stripeClient: {
      checkout: {
        sessions: {
          retrieve: async (...args) => {
            retrieves.push(args);
            return {
              id: 'cs_verified', customer: 'cus_verified', subscription: 'sub_verified',
              payment_status: 'paid',
              line_items: { data: [{ price: { id: 'price_quotedone_monthly_1' } }] }
            };
          }
        }
      }
    }
  });
  const res = responseCapture();
  await app.routes[0].handlers[1](request({
    body: Buffer.from('{}'), headers: { 'stripe-signature': 'signed' }
  }), res);
  assert.deepEqual(retrieves, [['cs_verified', { expand: ['line_items'] }]]);
  assert.equal(applied[0].data.object.payment_status, 'no_payment_required');
  assert.deepEqual(applied[0].data.object.line_items, {
    data: [{ price: { id: 'price_quotedone_monthly_1' } }]
  });
  assert.deepEqual(res.body, { received: true, status: 'PROCESSED' });
});

test('Checkout hydration fails closed when the retrieved first-class identity does not match the signed event', async () => {
  const app = routeApp();
  let applied = 0;
  installBillingWebhookRoute(app, {
    rawBodyMiddleware: () => {},
    constructEvent: () => webhookEvent('checkout.session.completed'),
    webhookSecret: 'whsec_test',
    billingStateService: { applyVerifiedStripeEvent() { applied += 1; } },
    stripeClient: {
      checkout: { sessions: { retrieve: async () => ({
        id: 'cs_verified', customer: 'cus_other', subscription: 'sub_verified',
        line_items: { data: [] }
      }) } }
    }
  });
  const res = responseCapture();
  await app.routes[0].handlers[1](request({
    body: Buffer.from('{}'), headers: { 'stripe-signature': 'signed' }
  }), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Webhook processing failed.' });
  assert.equal(applied, 0);
});

function billingDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrateDatabase(db);
  db.prepare(`INSERT INTO users
    (id, ownerId, email, passwordHash, firstName, businessName, plan,
      planStatus, trialEndsAt, paymentFailedAt, timezone, role, createdAt)
    VALUES (?, NULL, ?, 'hash', ?, ?, 'Operator', 'pending_payment',
      NULL, NULL, 'UTC', 'owner', '2026-09-29T00:00:00.000Z')`
  ).run('owner-a', 'owner@example.invalid', 'Maya', 'Maya Services');
  return db;
}

function billingHarness({ checkoutCreate, checkoutRetrieve, subscriptionList } = {}) {
  const app = routeApp();
  const db = billingDatabase();
  const calls = { customer: [], checkout: [], portal: [], retrieve: [], subscriptions: [] };
  const time = { value: new Date('2026-09-29T12:00:00.000Z') };
  let uuid = 0;
  const stripeClient = {
    customers: {
      create: async (...args) => (calls.customer.push(args), { id: 'cus_owner_a' })
    },
    subscriptions: { list: async (...args) => { calls.subscriptions.push(args); return subscriptionList(...args); } },
    checkout: {
      sessions: {
        retrieve: async (...args) => { calls.retrieve.push(args); return checkoutRetrieve(...args); },
        create: async (...args) => {
          calls.checkout.push(args);
          if (checkoutCreate) return checkoutCreate(...args);
          const created = Math.floor(time.value.getTime() / 1000);
          return {
            id: `cs_test_${calls.checkout.length}`,
            mode: 'subscription',
            status: 'open',
            customer: 'cus_owner_a',
            created,
            expires_at: created + 60 * 60,
            url: 'https://checkout.stripe.com/c/pay/test'
          };
        }
      }
    },
    billingPortal: {
      sessions: {
        create: async (...args) => (calls.portal.push(args), { url: 'https://billing.stripe.com/p/session/test' })
      }
    }
  };
  const billingStateService = {
    registerBillingCustomer({ ownerId, stripeCustomerId }) {
      db.prepare(`INSERT INTO billingAccounts
        (ownerId, stripeCustomerId, stripeSubscriptionId, cancelAtPeriodEnd, createdAt, updatedAt)
        VALUES (?, ?, NULL, 0, ?, ?)`
      ).run(ownerId, stripeCustomerId, time.value.toISOString(), time.value.toISOString());
    }
  };
  const authCalls = [];
  const requireAuth = roles => {
    authCalls.push(roles);
    return (_req, _res, next) => next();
  };
  const requireProviderWrites = (_req, _res, next) => next();
  installBillingRoutes(app, {
    stripeClient,
    billingStateService,
    database: db,
    requireAuth,
    requireProviderWrites,
    asyncHandler: handler => handler,
    priceIds: prices(),
    successUrl: 'https://app.offtheclock.test/settings/billing/success?session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://app.offtheclock.test/settings/billing/canceled',
    portalReturnUrl: 'https://app.offtheclock.test/settings/billing',
    integrationIdentifier: 'off_the_clock_checkout_abcdefgh',
    checkoutReceiptEncryptionKey: '11'.repeat(32),
    clock: () => new Date(time.value),
    randomUUID: () => `checkout-request-${++uuid}`
  });
  return { app, db, calls, authCalls, requireProviderWrites, time };
}

function insertBillingAccount(db, {
  customerId,
  subscriptionId = null,
  canceledAt = null
}) {
  db.prepare(`INSERT INTO billingAccounts (
    ownerId, stripeCustomerId, stripeSubscriptionId, cancelAtPeriodEnd,
    canceledAt, createdAt, updatedAt
  ) VALUES ('owner-a', ?, ?, 0, ?, '2026-09-29T00:00:00.000Z', '2026-09-29T00:00:00.000Z')`
  ).run(customerId, subscriptionId, canceledAt);
}

function routeByPath(app, path) {
  const route = app.routes.find(candidate => candidate.path === path);
  assert.ok(route, `Missing route ${path}`);
  return route;
}

async function invokeOwnerRoute(route, { body = {}, idempotencyKey = 'request-key-0001' } = {}) {
  const req = request({
    body,
    tenantOwnerId: 'owner-a',
    headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}
  });
  const res = responseCapture();
  await route.handlers.at(-1)(req, res);
  return res;
}

test('authenticated Checkout creates and persists one provider customer, uses configured prices, and never grants access', async () => {
  const { app, db, calls, authCalls, requireProviderWrites } = billingHarness();
  try {
    assert.deepEqual(app.routes.map(route => route.path), [
      '/api/billing/status', '/api/billing/checkout', '/api/billing/portal'
    ]);
    assert.deepEqual(authCalls, [['owner']]);
    assert.equal(routeByPath(app, '/api/billing/status').handlers.length, 2);
    assert.equal(app.routes.filter(route => route.method === 'post').every(route =>
      route.handlers.length === 3 && route.handlers[1] === requireProviderWrites), true);

    const initialStatus = await invokeOwnerRoute(routeByPath(app, '/api/billing/status'));
    assert.deepEqual(initialStatus.body, {
      billingEnabled: true,
      providerAvailable: true,
      plan: 'Operator',
      planStatus: 'pending_payment',
      billingInterval: null,
      trialEndsAt: null,
      paymentFailedAt: null,
      graceEndsAt: null,
      currentPeriodEndAt: null,
      cancelAtPeriodEnd: false,
      checkoutState: 'NONE',
      canCheckout: true,
      canManageBilling: false
    });

    const checkoutRoute = routeByPath(app, '/api/billing/checkout');
    const first = await invokeOwnerRoute(checkoutRoute, {
      body: { plan: 'QuoteDone', billingInterval: 'annual' }
    });
    assert.equal(first.statusCode, 201);
    const pendingStatus = await invokeOwnerRoute(routeByPath(app, '/api/billing/status'));
    assert.equal(pendingStatus.body.canManageBilling, true);
    assert.equal(pendingStatus.body.checkoutState, 'OPEN');
    assert.deepEqual(first.body, { url: 'https://checkout.stripe.com/c/pay/test' });
    assert.equal(calls.customer.length, 1);
    assert.deepEqual(calls.customer[0][0], {
      email: 'owner@example.invalid', name: 'Maya Services'
    });
    assert.equal(Object.hasOwn(calls.customer[0][0], 'metadata'), false);
    assert.match(calls.customer[0][1].idempotencyKey, /^otc:billing-customer-v1:[a-f0-9]{64}$/);

    const [params, options] = calls.checkout[0];
    assert.deepEqual(params, {
      mode: 'subscription',
      customer: 'cus_owner_a',
      line_items: [{ price: 'price_quotedone_annual_1', quantity: 1 }],
      payment_method_collection: 'always',
      payment_method_types: ['card'],
      subscription_data: {
        trial_period_days: 14,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } }
      },
      success_url: 'https://app.offtheclock.test/settings/billing/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://app.offtheclock.test/settings/billing/canceled',
      integration_identifier: 'off_the_clock_checkout_abcdefgh'
    });
    assert.deepEqual(params.payment_method_types, ['card']);
    assert.equal(Object.hasOwn(params, 'metadata'), false);
    assert.equal(Object.hasOwn(params, 'client_reference_id'), false);
    assert.match(options.idempotencyKey, /^otc:billing-checkout-v1:[a-f0-9]{64}$/);
    assert.deepEqual({ ...db.prepare(
      'SELECT ownerId, stripeCustomerId, stripeSubscriptionId FROM billingAccounts WHERE ownerId=?'
    ).get('owner-a') }, {
      ownerId: 'owner-a', stripeCustomerId: 'cus_owner_a', stripeSubscriptionId: null
    });
    assert.deepEqual({ ...db.prepare('SELECT plan, planStatus FROM users WHERE id=?').get('owner-a') }, {
      plan: 'Operator', planStatus: 'pending_payment'
    });
    const ledger = db.prepare(`
      SELECT * FROM billingCheckoutRequests WHERE ownerId = ?
    `).get('owner-a');
    assert.equal(ledger.status, 'OPEN');
    assert.equal(ledger.stripeSessionId, 'cs_test_1');
    assert.equal(ledger.plan, 'QuoteDone');
    assert.equal(ledger.billingInterval, 'annual');
    assert.equal(ledger.stripePriceId, 'price_quotedone_annual_1');
    assert.equal(ledger.idempotencyKeyHash.length, 64);
    assert.equal(ledger.requestDigest.length, 64);
    assert.equal(JSON.stringify(ledger).includes('request-key-0001'), false);
    assert.equal(JSON.stringify(ledger).includes('https://checkout.stripe.com/c/pay/test'), false);
    assert.notEqual(ledger.sessionUrlCiphertext, null);

    const replay = await invokeOwnerRoute(checkoutRoute, {
      body: { plan: 'QuoteDone', billingInterval: 'annual' }
    });
    assert.deepEqual(replay.body, first.body);
    assert.equal(calls.customer.length, 1);
    assert.equal(calls.checkout.length, 1);
    await assert.rejects(
      () => invokeOwnerRoute(checkoutRoute, {
        body: { plan: 'Operator', billingInterval: 'annual' }
      }),
      error => error instanceof BillingRouteError && error.code === 'IDEMPOTENCY_KEY_CONFLICT'
    );
    await assert.rejects(
      () => invokeOwnerRoute(checkoutRoute, {
        body: { plan: 'QuoteDone', billingInterval: 'annual' },
        idempotencyKey: 'different-request-key'
      }),
      error => error instanceof BillingRouteError && error.code === 'CHECKOUT_SESSION_OPEN'
    );
    assert.equal(calls.checkout.length, 1);
  } finally {
    db.close();
  }
});

test('provider-confirmed expiry and no live subscriptions release the owner slot; original key remains idempotent', async () => {
  const { app, db, calls, time } = billingHarness({
    checkoutRetrieve: async id => ({id,customer:'cus_owner_a',mode:'subscription',status:'expired',subscription:null}),
    subscriptionList: async () => ({data:[],has_more:false})
  });
  try {
    const route = routeByPath(app, '/api/billing/checkout');
    const first = await invokeOwnerRoute(route, {
      body: { plan: 'Operator', billingInterval: 'monthly' },
      idempotencyKey: 'first-checkout-key'
    });
    time.value = new Date('2026-09-29T14:00:00.000Z');
    const second = await invokeOwnerRoute(route, {
      body: { plan: 'QuoteDone', billingInterval: 'monthly' },
      idempotencyKey: 'second-checkout-key'
    });
    assert.equal(calls.checkout.length, 2);
    assert.equal(calls.retrieve.length, 1);
    assert.equal(calls.subscriptions.length, 1);
    assert.equal(calls.subscriptions[0][0].customer, 'cus_owner_a');
    assert.deepEqual(first.body, second.body);
    assert.deepEqual(
      db.prepare(`SELECT status FROM billingCheckoutRequests
        WHERE ownerId='owner-a' ORDER BY createdAt, id`).all().map(row => row.status).sort(),
      ['EXPIRED', 'OPEN']
    );
    const replay = await invokeOwnerRoute(route, {
      body: { plan: 'Operator', billingInterval: 'monthly' },
      idempotencyKey: 'first-checkout-key'
    });
    assert.deepEqual(replay.body, first.body);
    assert.equal(calls.checkout.length, 2);
  } finally {
    db.close();
  }
});

test('an ambiguous provider failure permits only the same-key recovery with the same Stripe idempotency key', async () => {
  let attempt = 0;
  const harness = billingHarness({
    checkoutCreate: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('timeout after provider acceptance is unknown');
      return {
        id: 'cs_recovered',
        mode: 'subscription',
        status: 'open',
        customer: 'cus_owner_a',
        created: 1790683200,
        expires_at: 1790686800,
        url: 'https://checkout.stripe.com/c/pay/recovered'
      };
    }
  });
  const { app, db, calls } = harness;
  try {
    const route = routeByPath(app, '/api/billing/checkout');
    await assert.rejects(
      () => invokeOwnerRoute(route, {
        body: { plan: 'QuoteDone', billingInterval: 'monthly' },
        idempotencyKey: 'ambiguous-request-key'
      }),
      error => error instanceof BillingRouteError && error.code === 'BILLING_PROVIDER_ERROR'
    );
    assert.equal(db.prepare(
      "SELECT status FROM billingCheckoutRequests WHERE ownerId='owner-a'"
    ).get().status, 'CREATING');
    await assert.rejects(
      () => invokeOwnerRoute(route, {
        body: { plan: 'QuoteDone', billingInterval: 'monthly' },
        idempotencyKey: 'unsafe-parallel-key'
      }),
      error => error instanceof BillingRouteError && error.code === 'CHECKOUT_RECOVERY_REQUIRED'
    );
    const recovered = await invokeOwnerRoute(route, {
      body: { plan: 'QuoteDone', billingInterval: 'monthly' },
      idempotencyKey: 'ambiguous-request-key'
    });
    assert.deepEqual(recovered.body, { url: 'https://checkout.stripe.com/c/pay/recovered' });
    assert.equal(calls.checkout.length, 2);
    assert.equal(calls.checkout[0][1].idempotencyKey, calls.checkout[1][1].idempotencyKey);
    assert.equal(db.prepare(
      "SELECT status FROM billingCheckoutRequests WHERE ownerId='owner-a'"
    ).get().status, 'OPEN');
  } finally {
    db.close();
  }
});

test('an unresolved claim cannot create a subscription after the owner becomes active', async () => {
  const harness = billingHarness({ checkoutCreate: async () => { throw new Error('ambiguous'); } });
  const { app, db, calls } = harness;
  try {
    const route = routeByPath(app, '/api/billing/checkout');
    await assert.rejects(() => invokeOwnerRoute(route, {
      body: { plan: 'QuoteDone', billingInterval: 'monthly' },
      idempotencyKey: 'claim-before-activation'
    }));
    db.prepare(`UPDATE billingAccounts SET
      stripeSubscriptionId='sub_now_active',
      paymentMethodVerifiedAt='2026-09-29T12:01:00.000Z'
      WHERE ownerId='owner-a'`).run();
    db.prepare("UPDATE users SET planStatus='active' WHERE id='owner-a'").run();

    await assert.rejects(
      () => invokeOwnerRoute(route, {
        body: { plan: 'QuoteDone', billingInterval: 'monthly' },
        idempotencyKey: 'claim-before-activation'
      }),
      error => error instanceof BillingRouteError && error.code === 'SUBSCRIPTION_ALREADY_EXISTS'
    );
    assert.equal(calls.checkout.length, 1);
    assert.equal(db.prepare(
      "SELECT status FROM billingCheckoutRequests WHERE ownerId='owner-a'"
    ).get().status, 'CREATING');
  } finally {
    db.close();
  }
});

test('an unrecovered claim older than Stripe idempotency retention fails closed for every key', async () => {
  const harness = billingHarness({ checkoutCreate: async () => { throw new Error('ambiguous'); } });
  const { app, db, calls, time } = harness;
  try {
    const route = routeByPath(app, '/api/billing/checkout');
    await assert.rejects(() => invokeOwnerRoute(route, {
      body: { plan: 'Operator', billingInterval: 'annual' },
      idempotencyKey: 'old-ambiguous-key'
    }));
    time.value = new Date('2026-09-30T12:01:00.000Z');
    await assert.rejects(
      () => invokeOwnerRoute(route, {
        body: { plan: 'Operator', billingInterval: 'annual' },
        idempotencyKey: 'old-ambiguous-key'
      }),
      error => error instanceof BillingRouteError && error.code === 'CHECKOUT_RECOVERY_REQUIRED'
    );
    await assert.rejects(
      () => invokeOwnerRoute(route, {
        body: { plan: 'Operator', billingInterval: 'annual' },
        idempotencyKey: 'another-old-key'
      }),
      error => error instanceof BillingRouteError && error.code === 'CHECKOUT_RECOVERY_REQUIRED'
    );
    assert.equal(calls.checkout.length, 1);
    assert.equal(db.prepare(
      "SELECT status FROM billingCheckoutRequests WHERE ownerId='owner-a'"
    ).get().status, 'CREATING');
  } finally {
    db.close();
  }
});

test('Checkout accepts only the closed plan/interval contract and requires a stable client idempotency key', async () => {
  const { app, db, calls } = billingHarness();
  try {
    const checkout = routeByPath(app, '/api/billing/checkout');
    await assert.rejects(
      () => invokeOwnerRoute(checkout, {
        body: {
          plan: 'QuoteDone', billingInterval: 'monthly',
          priceId: 'price_attacker', successUrl: 'https://attacker.invalid'
        }
      }),
      error => error instanceof BillingRouteError && error.code === 'INVALID_REQUEST' && error.statusCode === 400
    );
    await assert.rejects(
      () => invokeOwnerRoute(checkout, {
        body: { plan: 'Enterprise', billingInterval: 'monthly' }
      }),
      error => error instanceof BillingRouteError && error.code === 'INVALID_REQUEST'
    );
    await assert.rejects(
      () => invokeOwnerRoute(checkout, {
        body: { plan: 'Operator', billingInterval: 'monthly' }, idempotencyKey: null
      }),
      error => error instanceof BillingRouteError && error.code === 'IDEMPOTENCY_KEY_REQUIRED'
    );
    assert.equal(calls.customer.length, 0);
    assert.equal(calls.checkout.length, 0);
  } finally {
    db.close();
  }
});

test('billing portal uses only the stored customer mapping and rejects body-supplied ownership', async () => {
  const { app, db, calls } = billingHarness();
  try {
    insertBillingAccount(db, { customerId: 'cus_stored' });
    const portal = routeByPath(app, '/api/billing/portal');
    await assert.rejects(
      () => invokeOwnerRoute(portal, { body: { customer: 'cus_attacker' } }),
      error => error instanceof BillingRouteError && error.code === 'INVALID_REQUEST'
    );
    assert.equal(calls.portal.length, 0);

    const res = await invokeOwnerRoute(portal, { body: {} });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { url: 'https://billing.stripe.com/p/session/test' });
    assert.deepEqual(calls.portal[0][0], {
      customer: 'cus_stored',
      return_url: 'https://app.offtheclock.test/settings/billing'
    });
    assert.match(calls.portal[0][1].idempotencyKey, /^otc:billing-portal-v1:[a-f0-9]{64}$/);
  } finally {
    db.close();
  }
});

test('Checkout blocks a second subscription and portal never creates an unmapped customer', async () => {
  const first = billingHarness();
  try {
    insertBillingAccount(first.db, { customerId: 'cus_existing', subscriptionId: 'sub_existing' });
    await assert.rejects(
      () => invokeOwnerRoute(routeByPath(first.app, '/api/billing/checkout'), {
        body: { plan: 'QuoteDone', billingInterval: 'monthly' }
      }),
      error => error instanceof BillingRouteError && error.code === 'SUBSCRIPTION_ALREADY_EXISTS' && error.statusCode === 409
    );
    assert.equal(first.calls.checkout.length, 0);
  } finally {
    first.db.close();
  }

  const second = billingHarness();
  try {
    await assert.rejects(
      () => invokeOwnerRoute(routeByPath(second.app, '/api/billing/portal'), { body: {} }),
      error => error instanceof BillingRouteError && error.code === 'BILLING_CUSTOMER_REQUIRED'
    );
    assert.equal(second.calls.customer.length, 0);
    assert.equal(second.calls.portal.length, 0);
  } finally {
    second.db.close();
  }
});

test('verified terminal deletion permits resubscription while the original request remains replayable after activation', async () => {
  const { app, db, calls } = billingHarness();
  try {
    insertBillingAccount(db, {
      customerId: 'cus_owner_a',
      subscriptionId: 'sub_terminal',
      canceledAt: '2026-09-29T11:00:00.000Z'
    });
    db.prepare("UPDATE users SET planStatus='canceled' WHERE id='owner-a'").run();
    db.prepare(`INSERT INTO billingEventReceipts (
      stripeEventId, ownerId, eventType, objectId, eventCreatedAt,
      eventDigest, outcome, sanitizedReceiptJson, resultJson, processedAt
    ) VALUES (
      'evt_terminal', 'owner-a', 'customer.subscription.deleted',
      'sub_terminal', 1790679600, 'digest', 'APPLIED', '{}', '{}',
      '2026-09-29T11:00:00.000Z'
    )`).run();

    const route = routeByPath(app, '/api/billing/checkout');
    const first = await invokeOwnerRoute(route, {
      body: { plan: 'QuoteDone', billingInterval: 'annual' },
      idempotencyKey: 'resubscribe-request-key'
    });
    assert.equal(calls.checkout.length, 1);

    db.prepare(`UPDATE billingAccounts SET
      stripeSubscriptionId='sub_replacement',
      paymentMethodVerifiedAt='2026-09-29T12:01:00.000Z',
      canceledAt=NULL
      WHERE ownerId='owner-a'`).run();
    db.prepare("UPDATE users SET plan='Scale', planStatus='active' WHERE id='owner-a'").run();

    const replay = await invokeOwnerRoute(route, {
      body: { plan: 'QuoteDone', billingInterval: 'annual' },
      idempotencyKey: 'resubscribe-request-key'
    });
    assert.deepEqual(replay.body, first.body);
    assert.equal(calls.checkout.length, 1);
    await assert.rejects(
      () => invokeOwnerRoute(route, {
        body: { plan: 'QuoteDone', billingInterval: 'annual' },
        idempotencyKey: 'second-resubscribe-key'
      }),
      error => error instanceof BillingRouteError && error.code === 'SUBSCRIPTION_ALREADY_EXISTS'
    );
  } finally {
    db.close();
  }
});

test('billing route configuration fails closed on incomplete prices, unsafe redirects, and invalid integration labels', () => {
  const db = billingDatabase();
  const app = routeApp();
  const base = {
    stripeClient: {
      customers: { create() {} },
      checkout: { sessions: { create() {} } },
      billingPortal: { sessions: { create() {} } }
    },
    billingStateService: { registerBillingCustomer() {} },
    database: db,
    requireAuth: () => () => {},
    requireProviderWrites: () => {},
    asyncHandler: handler => handler,
    priceIds: prices(),
    successUrl: 'https://app.offtheclock.test/success',
    cancelUrl: 'https://app.offtheclock.test/cancel',
    portalReturnUrl: 'https://app.offtheclock.test/billing',
    integrationIdentifier: 'off_the_clock_checkout_abcdefgh',
    checkoutReceiptEncryptionKey: '11'.repeat(32)
  };
  try {
    const incomplete = structuredClone(base.priceIds);
    delete incomplete.QuoteDone.annual;
    assert.throws(() => installBillingRoutes(routeApp(), { ...base, priceIds: incomplete }), /incomplete|required/i);
    assert.throws(() => installBillingRoutes(routeApp(), {
      ...base, cancelUrl: 'https://attacker.invalid/cancel'
    }), /same trusted application origin/i);
    assert.throws(() => installBillingRoutes(routeApp(), {
      ...base, integrationIdentifier: 'off_the_clock_checkout_static'
    }), /eight letters/i);
    const loopback = {
      ...base,
      successUrl: 'http://localhost:5173/success',
      cancelUrl: 'http://localhost:5173/cancel',
      portalReturnUrl: 'http://localhost:5173/billing'
    };
    assert.doesNotThrow(() => installBillingRoutes(routeApp(), {
      ...loopback,
      allowInsecureLoopback: true
    }));
    assert.throws(() => installBillingRoutes(routeApp(), {
      ...loopback,
      allowInsecureLoopback: false
    }), /trusted URL/i);
    assert.throws(() => installBillingRoutes(routeApp(), {
      ...base,
      successUrl: 'http://app.offtheclock.test/success',
      cancelUrl: 'http://app.offtheclock.test/cancel',
      portalReturnUrl: 'http://app.offtheclock.test/billing',
      allowInsecureLoopback: true
    }), /trusted URL/i);
  } finally {
    db.close();
  }
});

test('Scale Checkout is rejected before creating a customer or session', async () => {
  const {app,db,calls}=billingHarness();
  try {
    await assert.rejects(() => invokeOwnerRoute(routeByPath(app,'/api/billing/checkout'),{body:{plan:'Scale',billingInterval:'monthly'}}), error => error.code==='INVALID_REQUEST' && error.statusCode===400);
    assert.equal(calls.customer.length,0);assert.equal(calls.checkout.length,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billingCheckoutRequests').get().n,0);
  } finally {db.close();}
});
