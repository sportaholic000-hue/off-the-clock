import crypto from 'node:crypto';

const PLANS = Object.freeze(['Operator', 'QuoteDone', 'Scale']);
const BILLING_INTERVALS = Object.freeze(['monthly', 'annual']);
const CHECKOUT_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed'
]);

export const SUPPORTED_BILLING_WEBHOOK_EVENTS = Object.freeze([
  ...CHECKOUT_EVENT_TYPES,
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed'
]);

const SUPPORTED_EVENT_SET = new Set(SUPPORTED_BILLING_WEBHOOK_EVENTS);
const CHECKOUT_RECEIPT_AAD = Buffer.from('off-the-clock:billing-checkout-url:v1', 'utf8');
const DEFAULT_CHECKOUT_LEASE_MS = 2 * 60 * 1000;
const MAX_PROVIDER_IDEMPOTENCY_RECOVERY_MS = 23 * 60 * 60 * 1000;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class BillingRouteError extends Error {
  constructor(code, statusCode, message) {
    super(message);
    this.name = 'BillingRouteError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function routeError(code, statusCode, message) {
  return new BillingRouteError(code, statusCode, message);
}

function exactObject(value, allowedKeys, label) {
  if (!isRecord(value)) {
    throw routeError('INVALID_REQUEST', 400, `${label} must be an object.`);
  }
  const extras = Object.keys(value).filter(key => !allowedKeys.includes(key));
  if (extras.length) {
    throw routeError('INVALID_REQUEST', 400, `${label} contains unsupported fields.`);
  }
  return value;
}

function requiredHeader(req, name) {
  const value = typeof req.get === 'function'
    ? req.get(name)
    : req.headers?.[name.toLowerCase()];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clientIdempotencyKey(req) {
  const value = requiredHeader(req, 'Idempotency-Key');
  if (!value) {
    throw routeError('IDEMPOTENCY_KEY_REQUIRED', 400, 'Idempotency-Key is required.');
  }
  if (Buffer.byteLength(value, 'utf8') > 200 || value.length < 8 || !/^[\x21-\x7e]+$/.test(value)) {
    throw routeError('INVALID_IDEMPOTENCY_KEY', 400, 'Idempotency-Key is invalid.');
  }
  return value;
}

function providerIdempotencyKey(kind, ...parts) {
  const digest = crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex');
  return `otc:${kind}:${digest}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function checkoutReceiptKey(value) {
  const raw = String(value || '').trim();
  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else {
    try { key = Buffer.from(raw, 'base64'); } catch { key = Buffer.alloc(0); }
  }
  if (key.length !== 32) {
    throw new TypeError('Checkout receipt encryption key must encode exactly 32 bytes.');
  }
  return key;
}

function sealCheckoutUrl(url, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(CHECKOUT_RECEIPT_AAD);
  const ciphertext = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  return {
    sessionUrlCiphertext: ciphertext.toString('base64'),
    sessionUrlIv: iv.toString('base64'),
    sessionUrlTag: cipher.getAuthTag().toString('base64'),
    sessionUrlKeyVersion: 'v1'
  };
}

function openCheckoutUrl(row, key) {
  if (!row?.sessionUrlCiphertext || !row.sessionUrlIv || !row.sessionUrlTag ||
      row.sessionUrlKeyVersion !== 'v1') {
    throw routeError('CHECKOUT_RECEIPT_INVALID', 500, 'Stored Checkout response is unavailable.');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(row.sessionUrlIv, 'base64'));
    decipher.setAAD(CHECKOUT_RECEIPT_AAD);
    decipher.setAuthTag(Buffer.from(row.sessionUrlTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(row.sessionUrlCiphertext, 'base64')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    throw routeError('CHECKOUT_RECEIPT_INVALID', 500, 'Stored Checkout response is unavailable.');
  }
}

function instant(value, label) {
  const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(result.getTime())) throw new TypeError(`${label} must be a valid instant.`);
  return result;
}

function immediate(database, work) {
  if (typeof database.transaction === 'function') {
    const transaction = database.transaction(work);
    return typeof transaction.immediate === 'function' ? transaction.immediate() : transaction();
  }
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function configuredUrl(value, label) {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw new TypeError(`${label} must be an exact HTTPS URL.`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an exact HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
    throw new TypeError(`${label} must be an exact HTTPS URL.`);
  }
  return { value, origin: parsed.origin };
}

function integrationLabel(value) {
  if (typeof value !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,54}_[A-Za-z]{8}$/.test(value)) {
    throw new TypeError('The Stripe integration identifier must end with eight letters.');
  }
  return value;
}

function normalizePriceAllowlist(value) {
  if (!isRecord(value)) {
    throw new TypeError('Stripe checkout prices must be configured by plan and billing interval.');
  }
  const extraPlans = Object.keys(value).filter(plan => !PLANS.includes(plan));
  if (extraPlans.length) throw new TypeError('Stripe checkout prices contain an unsupported plan.');

  const result = new Map();
  const seenPrices = new Set();
  for (const plan of PLANS) {
    const intervals = value[plan];
    if (!isRecord(intervals)) {
      throw new TypeError(`Stripe checkout prices are incomplete for ${plan}.`);
    }
    const extraIntervals = Object.keys(intervals).filter(interval => !BILLING_INTERVALS.includes(interval));
    if (extraIntervals.length) {
      throw new TypeError(`Stripe checkout prices contain an unsupported interval for ${plan}.`);
    }
    for (const interval of BILLING_INTERVALS) {
      const priceId = intervals[interval];
      if (typeof priceId !== 'string' || !/^price_[A-Za-z0-9_]+$/.test(priceId)) {
        throw new TypeError(`A Stripe price is required for ${plan} ${interval}.`);
      }
      if (seenPrices.has(priceId)) {
        throw new TypeError('Every plan and billing interval must use a distinct Stripe price.');
      }
      seenPrices.add(priceId);
      result.set(`${plan}:${interval}`, priceId);
    }
  }
  return result;
}

function checkoutSelection(body, prices) {
  exactObject(body, ['plan', 'billingInterval'], 'Checkout request');
  if (!PLANS.includes(body.plan) || !BILLING_INTERVALS.includes(body.billingInterval)) {
    throw routeError('INVALID_REQUEST', 400, 'Choose a configured plan and billing interval.');
  }
  return {
    plan: body.plan,
    billingInterval: body.billingInterval,
    priceId: prices.get(`${body.plan}:${body.billingInterval}`)
  };
}

function providerReference(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (isRecord(value) && typeof value.id === 'string' && value.id.trim()) return value.id.trim();
  return null;
}

function validDestination(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? value : null;
  } catch {
    return null;
  }
}

function invalidWebhook(res) {
  return res.status(400).json({ error: 'Invalid webhook request.' });
}

function failedWebhook(res) {
  return res.status(500).json({ error: 'Webhook processing failed.' });
}

async function hydrateCheckoutLineItems(event, stripeClient) {
  const object = event.data.object;
  if (Array.isArray(object.line_items?.data)) return event;
  let hydrated;
  try {
    hydrated = await stripeClient.checkout.sessions.retrieve(object.id, { expand: ['line_items'] });
  } catch {
    throw routeError('BILLING_PROVIDER_ERROR', 502, 'Stripe Checkout data could not be verified.');
  }
  const signedCustomer = providerReference(object.customer);
  const signedSubscription = providerReference(object.subscription);
  if (!isRecord(hydrated) || hydrated.id !== object.id ||
      providerReference(hydrated.customer) !== signedCustomer ||
      providerReference(hydrated.subscription) !== signedSubscription ||
      !Array.isArray(hydrated.line_items?.data)) {
    throw routeError('BILLING_PROVIDER_MISMATCH', 502, 'Stripe Checkout data could not be verified.');
  }
  return {
    ...event,
    data: {
      ...event.data,
      object: { ...object, line_items: hydrated.line_items }
    }
  };
}

export function installBillingWebhookRoute(app, {
  rawBodyMiddleware,
  constructEvent,
  webhookSecret,
  billingStateService,
  stripeClient,
  path = '/api/stripe/webhook'
}) {
  if (!app || typeof app.post !== 'function' || typeof rawBodyMiddleware !== 'function' ||
      typeof constructEvent !== 'function' || typeof webhookSecret !== 'string' || !webhookSecret ||
      !billingStateService || typeof billingStateService.applyVerifiedStripeEvent !== 'function' ||
      !stripeClient?.checkout?.sessions || typeof stripeClient.checkout.sessions.retrieve !== 'function') {
    throw new TypeError('Billing webhook route requires raw parsing, Stripe verification, state, and API dependencies.');
  }

  app.post(path, rawBodyMiddleware, async (req, res) => {
    const signature = requiredHeader(req, 'Stripe-Signature');
    if (!Buffer.isBuffer(req.body) || !signature) return invalidWebhook(res);

    let event;
    try {
      event = await constructEvent(req.body, signature, webhookSecret);
    } catch {
      return invalidWebhook(res);
    }
    if (!isRecord(event) || typeof event.type !== 'string' || !isRecord(event.data) || !isRecord(event.data.object)) {
      return invalidWebhook(res);
    }
    if (!SUPPORTED_EVENT_SET.has(event.type)) {
      return res.status(200).json({ received: true, status: 'IGNORED' });
    }

    try {
      const verifiedEvent = CHECKOUT_EVENT_TYPES.has(event.type)
        ? await hydrateCheckoutLineItems(event, stripeClient)
        : event;
      await billingStateService.applyVerifiedStripeEvent(verifiedEvent);
      return res.status(200).json({ received: true, status: 'PROCESSED' });
    } catch {
      return failedWebhook(res);
    }
  });
}

function requireOwnerContext(req) {
  if (typeof req.tenantOwnerId !== 'string' || !req.tenantOwnerId.trim()) {
    throw routeError('INVALID_OWNER_CONTEXT', 401, 'Owner authentication is required.');
  }
  return req.tenantOwnerId.trim();
}

function providerFailure() {
  return routeError('BILLING_PROVIDER_ERROR', 502, 'Billing is temporarily unavailable.');
}

export function installBillingRoutes(app, {
  stripeClient,
  billingStateService,
  database,
  requireAuth,
  requireProviderWrites,
  asyncHandler,
  priceIds,
  successUrl,
  cancelUrl,
  portalReturnUrl,
  integrationIdentifier,
  checkoutReceiptEncryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY,
  clock = () => new Date(),
  randomUUID = crypto.randomUUID,
  checkoutLeaseMs = DEFAULT_CHECKOUT_LEASE_MS
}) {
  if (!app || typeof app.post !== 'function' || !database || typeof database.prepare !== 'function' ||
      typeof requireAuth !== 'function' || typeof requireProviderWrites !== 'function' ||
      typeof asyncHandler !== 'function' ||
      !billingStateService || typeof billingStateService.registerBillingCustomer !== 'function' ||
      typeof stripeClient?.customers?.create !== 'function' ||
      typeof stripeClient?.checkout?.sessions?.create !== 'function' ||
      typeof stripeClient?.billingPortal?.sessions?.create !== 'function') {
    throw new TypeError('Billing routes require Stripe, database, auth, provider gate, and billing-state dependencies.');
  }

  const prices = normalizePriceAllowlist(priceIds);
  const success = configuredUrl(successUrl, 'Checkout success URL');
  const cancel = configuredUrl(cancelUrl, 'Checkout cancel URL');
  const portalReturn = configuredUrl(portalReturnUrl, 'Billing portal return URL');
  if (success.origin !== cancel.origin || success.origin !== portalReturn.origin) {
    throw new TypeError('Billing redirect URLs must use the same trusted application origin.');
  }
  const checkoutIntegration = integrationLabel(integrationIdentifier);
  const receiptKey = checkoutReceiptKey(checkoutReceiptEncryptionKey);
  if (!Number.isInteger(checkoutLeaseMs) || checkoutLeaseMs < 1000 || checkoutLeaseMs > 10 * 60 * 1000) {
    throw new TypeError('Checkout creation lease must be between one second and ten minutes.');
  }
  const now = () => instant(clock(), 'Checkout clock');

  const billingByOwner = database.prepare(`
    SELECT billing.ownerId, billing.stripeCustomerId, billing.stripeSubscriptionId,
      billing.canceledAt, users.planStatus
    FROM billingAccounts AS billing
    JOIN users ON users.id = billing.ownerId
    WHERE billing.ownerId = ?
  `);
  const ownerById = database.prepare(`
    SELECT id, email, firstName, businessName
    FROM users WHERE id = ? AND role = 'owner'
  `);
  const terminalDeletionReceipt = database.prepare(`
    SELECT stripeEventId, eventCreatedAt
    FROM billingEventReceipts
    WHERE ownerId = ?
      AND eventType = 'customer.subscription.deleted'
      AND objectId = ?
      AND outcome = 'APPLIED'
    ORDER BY eventCreatedAt DESC, stripeEventId DESC
    LIMIT 1
  `);
  const checkoutByKey = database.prepare(`
    SELECT * FROM billingCheckoutRequests
    WHERE ownerId = ? AND idempotencyKeyHash = ?
  `);
  const activeCheckout = database.prepare(`
    SELECT * FROM billingCheckoutRequests
    WHERE ownerId = ? AND status IN ('CREATING', 'OPEN')
    ORDER BY createdAt ASC LIMIT 1
  `);
  const expireOpenCheckouts = database.prepare(`
    UPDATE billingCheckoutRequests
    SET status = 'EXPIRED', updatedAt = ?
    WHERE ownerId = ? AND status = 'OPEN' AND expiresAt <= ?
  `);
  const insertCheckoutClaim = database.prepare(`
    INSERT INTO billingCheckoutRequests (
      id, ownerId, idempotencyKeyHash, requestDigest, plan, billingInterval,
      stripePriceId, stripeCustomerId, providerIdempotencyKey,
      successUrl, cancelUrl, integrationIdentifier, status,
      attemptCount, leaseExpiresAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATING', 1, ?, ?, ?)
  `);
  const reclaimCheckout = database.prepare(`
    UPDATE billingCheckoutRequests
    SET attemptCount = attemptCount + 1, leaseExpiresAt = ?, updatedAt = ?
    WHERE id = ? AND ownerId = ? AND status = 'CREATING'
  `);
  const releaseCheckoutLease = database.prepare(`
    UPDATE billingCheckoutRequests
    SET leaseExpiresAt = ?, updatedAt = ?
    WHERE id = ? AND ownerId = ? AND status = 'CREATING'
  `);
  const persistCheckoutSession = database.prepare(`
    UPDATE billingCheckoutRequests SET
      stripeSessionId = ?, sessionUrlCiphertext = ?, sessionUrlIv = ?,
      sessionUrlTag = ?, sessionUrlKeyVersion = ?, status = 'OPEN',
      expiresAt = ?, providerCreatedAt = ?, leaseExpiresAt = ?, updatedAt = ?
    WHERE id = ? AND ownerId = ? AND status = 'CREATING'
  `);

  async function ensureCustomer(ownerId) {
    const existing = billingByOwner.get(ownerId);
    if (existing?.stripeCustomerId) return existing;
    const owner = ownerById.get(ownerId);
    if (!owner) throw routeError('OWNER_NOT_FOUND', 404, 'Owner account not found.');

    let customer;
    try {
      customer = await stripeClient.customers.create({
        email: owner.email,
        name: owner.businessName
      }, {
        idempotencyKey: providerIdempotencyKey('billing-customer-v1', ownerId)
      });
    } catch {
      throw providerFailure();
    }
    const customerId = providerReference(customer);
    if (!customerId) throw providerFailure();

    try {
      billingStateService.registerBillingCustomer({ ownerId, stripeCustomerId: customerId });
    } catch {
      const raced = billingByOwner.get(ownerId);
      if (raced?.stripeCustomerId) return raced;
      throw routeError('BILLING_MAPPING_FAILED', 500, 'Billing customer mapping could not be saved.');
    }
    const registered = billingByOwner.get(ownerId);
    if (!registered?.stripeCustomerId) {
      throw routeError('BILLING_MAPPING_FAILED', 500, 'Billing customer mapping could not be saved.');
    }
    return registered;
  }

  function assertCheckoutAllowed(account) {
    if (!account?.stripeSubscriptionId) return;
    const terminal = account.planStatus === 'canceled' && account.canceledAt
      ? terminalDeletionReceipt.get(account.ownerId, account.stripeSubscriptionId)
      : null;
    if (!terminal) {
      throw routeError('SUBSCRIPTION_ALREADY_EXISTS', 409, 'Manage the existing subscription in the billing portal.');
    }
  }

  function replayCheckout(row) {
    const url = validDestination(openCheckoutUrl(row, receiptKey));
    if (!url) {
      throw routeError('CHECKOUT_RECEIPT_INVALID', 500, 'Stored Checkout response is unavailable.');
    }
    return { kind: 'REPLAY', url };
  }

  function claimCheckout({ ownerId, account, selection, requestKey }) {
    const checkedAt = now();
    const nowIso = checkedAt.toISOString();
    const leaseExpiresAt = new Date(checkedAt.getTime() + checkoutLeaseMs).toISOString();
    const idempotencyKeyHash = sha256(requestKey);
    const requestDigest = sha256(JSON.stringify({
      plan: selection.plan,
      billingInterval: selection.billingInterval,
      priceId: selection.priceId
    }));
    const providerKey = providerIdempotencyKey('billing-checkout-v1', ownerId, requestKey);

    return immediate(database, () => {
      expireOpenCheckouts.run(nowIso, ownerId, nowIso);
      const existing = checkoutByKey.get(ownerId, idempotencyKeyHash);
      if (existing) {
        if (existing.requestDigest !== requestDigest ||
            existing.plan !== selection.plan ||
            existing.billingInterval !== selection.billingInterval ||
            existing.stripePriceId !== selection.priceId) {
          throw routeError('IDEMPOTENCY_KEY_CONFLICT', 409, 'Idempotency-Key was already used for another checkout request.');
        }
        if (existing.stripeCustomerId !== account.stripeCustomerId ||
            existing.providerIdempotencyKey !== providerKey) {
          throw routeError('CHECKOUT_LEDGER_CONFLICT', 500, 'Stored Checkout ownership is inconsistent.');
        }
        if (existing.stripeSessionId) return replayCheckout(existing);
        const latestAccount = billingByOwner.get(ownerId);
        assertCheckoutAllowed(latestAccount);
        if (latestAccount?.stripeCustomerId !== account.stripeCustomerId) {
          throw routeError('CHECKOUT_LEDGER_CONFLICT', 500, 'Stored Checkout ownership is inconsistent.');
        }
        if (existing.status !== 'CREATING') {
          throw routeError('CHECKOUT_RECOVERY_REQUIRED', 409, 'The earlier checkout request requires review.');
        }
        const priorLease = new Date(existing.leaseExpiresAt);
        const claimCreatedAt = new Date(existing.createdAt);
        if (!Number.isFinite(priorLease.getTime()) || !Number.isFinite(claimCreatedAt.getTime())) {
          throw routeError('CHECKOUT_LEDGER_CONFLICT', 500, 'Stored Checkout timing is inconsistent.');
        }
        if (priorLease > checkedAt) {
          throw routeError('CHECKOUT_IN_PROGRESS', 409, 'Checkout creation is already in progress.');
        }
        if (checkedAt.getTime() - claimCreatedAt.getTime() >= MAX_PROVIDER_IDEMPOTENCY_RECOVERY_MS) {
          throw routeError('CHECKOUT_RECOVERY_REQUIRED', 409, 'The earlier checkout request requires review.');
        }
        reclaimCheckout.run(leaseExpiresAt, nowIso, existing.id, ownerId);
        return {
          kind: 'CREATE',
          row: { ...existing, attemptCount: existing.attemptCount + 1, leaseExpiresAt, updatedAt: nowIso },
          providerKey
        };
      }

      const latestAccount = billingByOwner.get(ownerId);
      assertCheckoutAllowed(latestAccount);
      if (latestAccount?.stripeCustomerId !== account.stripeCustomerId) {
        throw routeError('CHECKOUT_LEDGER_CONFLICT', 500, 'Stored Checkout ownership is inconsistent.');
      }
      const active = activeCheckout.get(ownerId);
      if (active?.status === 'CREATING') {
        throw routeError('CHECKOUT_RECOVERY_REQUIRED', 409, 'Finish retrying the earlier checkout request before starting another.');
      }
      if (active?.status === 'OPEN') {
        throw routeError('CHECKOUT_SESSION_OPEN', 409, 'A Checkout session is already open.');
      }

      const id = randomUUID();
      insertCheckoutClaim.run(
        id, ownerId, idempotencyKeyHash, requestDigest, selection.plan,
        selection.billingInterval, selection.priceId, account.stripeCustomerId,
        providerKey, success.value, cancel.value, checkoutIntegration,
        leaseExpiresAt, nowIso, nowIso
      );
      return {
        kind: 'CREATE',
        row: checkoutByKey.get(ownerId, idempotencyKeyHash),
        providerKey
      };
    });
  }

  function markCheckoutAttemptAmbiguous(row) {
    const nowIso = now().toISOString();
    try {
      releaseCheckoutLease.run(nowIso, nowIso, row.id, row.ownerId);
    } catch {
      // The durable CREATING claim intentionally remains fail-closed if the
      // database is unavailable after an ambiguous provider result.
    }
  }

  function providerSessionReceipt(session, expectedCustomerId) {
    const url = validDestination(session?.url);
    const sessionId = providerReference(session);
    const customerId = providerReference(session?.customer);
    const checkedAt = now();
    if (!sessionId || !url || session?.mode !== 'subscription' ||
        session?.status !== 'open' || customerId !== expectedCustomerId ||
        !Number.isInteger(session?.expires_at)) {
      throw providerFailure();
    }
    const expiresAt = new Date(session.expires_at * 1000);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= checkedAt) throw providerFailure();
    const providerCreatedAt = Number.isInteger(session.created)
      ? new Date(session.created * 1000)
      : checkedAt;
    if (!Number.isFinite(providerCreatedAt.getTime())) throw providerFailure();
    return {
      sessionId,
      url,
      expiresAt: expiresAt.toISOString(),
      providerCreatedAt: providerCreatedAt.toISOString(),
      sealed: sealCheckoutUrl(url, receiptKey)
    };
  }

  function checkoutParameters(row) {
    let storedSuccess;
    let storedCancel;
    let storedIntegration;
    try {
      storedSuccess = configuredUrl(row.successUrl, 'Stored Checkout success URL');
      storedCancel = configuredUrl(row.cancelUrl, 'Stored Checkout cancel URL');
      storedIntegration = integrationLabel(row.integrationIdentifier);
    } catch {
      throw routeError('CHECKOUT_LEDGER_CONFLICT', 500, 'Stored Checkout configuration is inconsistent.');
    }
    if (storedSuccess.origin !== storedCancel.origin) {
      throw routeError('CHECKOUT_LEDGER_CONFLICT', 500, 'Stored Checkout configuration is inconsistent.');
    }
    return {
      mode: 'subscription',
      customer: row.stripeCustomerId,
      line_items: [{ price: row.stripePriceId, quantity: 1 }],
      payment_method_collection: 'always',
      subscription_data: {
        trial_period_days: 14,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } }
      },
      success_url: storedSuccess.value,
      cancel_url: storedCancel.value,
      integration_identifier: storedIntegration
    };
  }

  function saveCheckoutReceipt(row, receipt) {
    const nowIso = now().toISOString();
    return immediate(database, () => {
      const result = persistCheckoutSession.run(
        receipt.sessionId,
        receipt.sealed.sessionUrlCiphertext,
        receipt.sealed.sessionUrlIv,
        receipt.sealed.sessionUrlTag,
        receipt.sealed.sessionUrlKeyVersion,
        receipt.expiresAt,
        receipt.providerCreatedAt,
        receipt.expiresAt,
        nowIso,
        row.id,
        row.ownerId
      );
      if (Number(result?.changes) === 1) return { kind: 'CREATED', url: receipt.url };
      const existing = checkoutByKey.get(row.ownerId, row.idempotencyKeyHash);
      if (existing?.stripeSessionId === receipt.sessionId) return replayCheckout(existing);
      throw routeError('CHECKOUT_LEDGER_CONFLICT', 500, 'Checkout response could not be saved.');
    });
  }

  const ownerOnly = requireAuth(['owner']);

  app.post('/api/billing/checkout', ownerOnly, requireProviderWrites, asyncHandler(async (req, res) => {
    const ownerId = requireOwnerContext(req);
    const selection = checkoutSelection(req.body, prices);
    const requestKey = clientIdempotencyKey(req);
    const existing = billingByOwner.get(ownerId);
    const account = existing?.stripeCustomerId ? existing : await ensureCustomer(ownerId);
    const claim = claimCheckout({ ownerId, account, selection, requestKey });
    if (claim.kind === 'REPLAY') return res.status(201).json({ url: claim.url });

    let session;
    try {
      session = await stripeClient.checkout.sessions.create(checkoutParameters(claim.row), {
        idempotencyKey: claim.providerKey
      });
    } catch {
      markCheckoutAttemptAmbiguous(claim.row);
      throw providerFailure();
    }
    let saved;
    try {
      saved = saveCheckoutReceipt(
        claim.row,
        providerSessionReceipt(session, account.stripeCustomerId)
      );
    } catch (error) {
      markCheckoutAttemptAmbiguous(claim.row);
      throw error instanceof BillingRouteError ? error : providerFailure();
    }
    return res.status(201).json({ url: saved.url });
  }));

  app.post('/api/billing/portal', ownerOnly, requireProviderWrites, asyncHandler(async (req, res) => {
    exactObject(req.body ?? {}, [], 'Billing portal request');
    const ownerId = requireOwnerContext(req);
    const requestKey = clientIdempotencyKey(req);
    const account = billingByOwner.get(ownerId);
    if (!account?.stripeCustomerId) {
      throw routeError('BILLING_CUSTOMER_REQUIRED', 409, 'Start billing before opening the billing portal.');
    }

    let session;
    try {
      session = await stripeClient.billingPortal.sessions.create({
        customer: account.stripeCustomerId,
        return_url: portalReturn.value
      }, {
        idempotencyKey: providerIdempotencyKey('billing-portal-v1', ownerId, requestKey)
      });
    } catch {
      throw providerFailure();
    }
    const url = validDestination(session?.url);
    if (!url) throw providerFailure();
    return res.status(201).json({ url });
  }));
}


