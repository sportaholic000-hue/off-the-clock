const PLAN_PRICE_ENV = Object.freeze({
  Starter: Object.freeze({monthly: 'STRIPE_STARTER_MONTHLY_PRICE_ID', annual: 'STRIPE_STARTER_ANNUAL_PRICE_ID'}),
  Operator: Object.freeze({
    monthly: 'STRIPE_OPERATOR_MONTHLY_PRICE_ID',
    annual: 'STRIPE_OPERATOR_ANNUAL_PRICE_ID'
  }),
  QuoteDone: Object.freeze({
    monthly: 'STRIPE_QUOTEDONE_MONTHLY_PRICE_ID',
    annual: 'STRIPE_QUOTEDONE_ANNUAL_PRICE_ID'
  })
});

function enabled(value) {
  return String(value || '').toLowerCase() === 'true';
}

function requiredExact(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw new Error(`${name} is required when Stripe billing is enabled`);
  }
  return value;
}

function validStripeSecret(value) {
  return /^(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+$/.test(value);
}

function validWebhookSecret(value) {
  return /^whsec_[A-Za-z0-9_]+$/.test(value);
}

function validPrice(value) {
  return /^price_[A-Za-z0-9_]+$/.test(value);
}

function httpsUrl(value, name, { production }) {
  let parsed;
  try { parsed = new URL(value); } catch { /* handled below */ }
  const loopback = parsed && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (!parsed || parsed.username || parsed.password || parsed.hash ||
      (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:' && !production))) {
    throw new Error(`${name} must be a trusted HTTPS URL`);
  }
  return Object.freeze({ value, origin: parsed.origin });
}

export function stripeBillingEnabled(env = process.env) {
  return enabled(env.STRIPE_BILLING_ENABLED);
}

export function loadBillingConfig(env = process.env) {
  if (!stripeBillingEnabled(env)) return Object.freeze({ enabled: false });

  const production = env.NODE_ENV === 'production';
  const secretKey = requiredExact(env, 'STRIPE_SECRET_KEY');
  const webhookSecret = requiredExact(env, 'STRIPE_WEBHOOK_SECRET');
  if (!validStripeSecret(secretKey)) {
    throw new Error('STRIPE_SECRET_KEY must be a Stripe secret or restricted key');
  }
  if (!validWebhookSecret(webhookSecret)) {
    throw new Error('STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret');
  }
  if (production && !/^(?:sk|rk)_live_/.test(secretKey)) {
    throw new Error('Production Stripe billing requires a live-mode key');
  }

  const priceIds = {};
  const pricePlanMap = new Map();
  const seen = new Set();
  for (const [plan, intervals] of Object.entries(PLAN_PRICE_ENV)) {
    priceIds[plan] = {};
    for (const [interval, name] of Object.entries(intervals)) {
      const priceId = requiredExact(env, name);
      if (!validPrice(priceId)) throw new Error(`${name} must be a Stripe Price ID`);
      if (seen.has(priceId)) throw new Error('Every Stripe plan interval must have a distinct Price ID');
      seen.add(priceId);
      priceIds[plan][interval] = priceId;
      pricePlanMap.set(priceId, Object.freeze({ plan, kind: 'base' }));
    }
    Object.freeze(priceIds[plan]);
  }

  // Legacy Scale prices reconcile existing subscriptions only; never offer Checkout.
  for (const name of ['STRIPE_SCALE_MONTHLY_PRICE_ID', 'STRIPE_SCALE_ANNUAL_PRICE_ID']) {
    const priceId = env[name];
    if (!priceId) continue;
    if (typeof priceId !== 'string' || !validPrice(priceId)) throw new Error(`${name} must be a Stripe Price ID`);
    if (seen.has(priceId)) throw new Error('Every Stripe plan interval must have a distinct Price ID');
    seen.add(priceId);
    pricePlanMap.set(priceId, Object.freeze({ plan: 'Scale', kind: 'base' }));
  }

  const success = httpsUrl(requiredExact(env, 'STRIPE_CHECKOUT_SUCCESS_URL'), 'STRIPE_CHECKOUT_SUCCESS_URL', { production });
  const cancel = httpsUrl(requiredExact(env, 'STRIPE_CHECKOUT_CANCEL_URL'), 'STRIPE_CHECKOUT_CANCEL_URL', { production });
  const portal = httpsUrl(requiredExact(env, 'STRIPE_PORTAL_RETURN_URL'), 'STRIPE_PORTAL_RETURN_URL', { production });
  if (success.origin !== cancel.origin || success.origin !== portal.origin) {
    throw new Error('Stripe redirect URLs must share one trusted application origin');
  }

  const integrationIdentifier = requiredExact(env, 'STRIPE_INTEGRATION_IDENTIFIER');
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,54}_[A-Za-z]{8}$/.test(integrationIdentifier)) {
    throw new Error('STRIPE_INTEGRATION_IDENTIFIER must end with eight letters');
  }

  return Object.freeze({
    enabled: true,
    secretKey,
    webhookSecret,
    priceIds: Object.freeze(priceIds),
    pricePlanMap,
    successUrl: success.value,
    cancelUrl: cancel.value,
    portalReturnUrl: portal.value,
    integrationIdentifier
  });
}

