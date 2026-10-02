import crypto from 'node:crypto';

const ALLOWED_PLANS = new Set(['Operator', 'QuoteDone', 'Scale']);
const SUPPORTED_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed'
]);
const SERVING_STATUSES = new Set(['trialing', 'active', 'payment_failed', 'past_due', 'suspended', 'canceled']);
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const TRIAL_SECONDS = 14 * 24 * 60 * 60;

const EVENT_RANK = {
  'checkout.session.completed': 10,
  'checkout.session.async_payment_failed': 20,
  'checkout.session.async_payment_succeeded': 30,
  'customer.subscription.created': 40,
  'customer.subscription.updated': 50,
  'invoice.payment_failed': 60,
  'invoice.paid': 70,
  'customer.subscription.deleted': 100
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BillingStateError('INVALID_EVENT', `${label} is required.`);
  }
  return value.trim();
}

function referenceId(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (isRecord(value) && typeof value.id === 'string' && value.id.trim()) return value.id.trim();
  return null;
}

function parseStoredJson(value) {
  try { return JSON.parse(value); }
  catch { throw new Error('Stored billing event receipt is invalid.'); }
}

function instant(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} must be a valid instant.`);
  return date;
}

function eventInstant(seconds) {
  return new Date(seconds * 1000).toISOString();
}

function unixToIso(value) {
  return Number.isInteger(value) && value >= 0 ? eventInstant(value) : null;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizePriceConfiguration(pricePlanMap, supplementalPriceIds) {
  const entries = pricePlanMap instanceof Map
    ? [...pricePlanMap.entries()]
    : isRecord(pricePlanMap) ? Object.entries(pricePlanMap) : [];
  if (!entries.length) throw new TypeError('BillingStateService requires a non-empty price-to-plan map.');
  const prices = new Map();
  for (const [rawPriceId, rawConfig] of entries) {
    const priceId = typeof rawPriceId === 'string' ? rawPriceId.trim() : '';
    const config = typeof rawConfig === 'string' ? { plan: rawConfig, kind: 'base' } : rawConfig;
    if (!priceId || !isRecord(config) || !ALLOWED_PLANS.has(config.plan) || !['base', 'supplemental'].includes(config.kind ?? 'base')) {
      throw new TypeError('Every configured Stripe price must map to an allowed plan and price kind.');
    }
    prices.set(priceId, { plan: config.plan, kind: config.kind ?? 'base' });
  }
  const supplemental = new Set();
  for (const rawPriceId of supplementalPriceIds ?? []) {
    if (typeof rawPriceId !== 'string' || !rawPriceId.trim()) throw new TypeError('Supplemental Stripe price IDs must be non-empty strings.');
    supplemental.add(rawPriceId.trim());
  }
  return { prices, supplemental };
}

function priceIdFromLine(line) {
  if (!isRecord(line)) return null;
  return referenceId(line.price) || referenceId(line.pricing?.price_details?.price);
}

function eventPriceIds(object) {
  const lines = [
    ...(Array.isArray(object.line_items?.data) ? object.line_items.data : []),
    ...(Array.isArray(object.lines?.data) ? object.lines.data : []),
    ...(Array.isArray(object.items?.data) ? object.items.data : [])
  ];
  return [...new Set(lines.map(priceIdFromLine).filter(Boolean))];
}

function eventIdentifiers(type, object) {
  const customerId = referenceId(object.customer);
  if (type.startsWith('customer.subscription.')) {
    return { customerId, subscriptionId: requiredText(object.id, 'Subscription ID') };
  }
  if (type.startsWith('invoice.')) {
    const subscriptionId = referenceId(object.subscription) ||
      referenceId(object.parent?.subscription_details?.subscription);
    return { customerId, subscriptionId };
  }
  return { customerId, subscriptionId: referenceId(object.subscription) };
}

function normalizeEvent(rawEvent) {
  if (!isRecord(rawEvent) || !isRecord(rawEvent.data) || !isRecord(rawEvent.data.object)) {
    throw new BillingStateError('INVALID_EVENT', 'A complete verified Stripe event object is required.');
  }
  const id = requiredText(rawEvent.id, 'Event ID');
  const type = requiredText(rawEvent.type, 'Event type');
  if (!SUPPORTED_EVENTS.has(type)) throw new BillingStateError('UNSUPPORTED_EVENT', `Unsupported billing event: ${type}.`);
  if (!Number.isInteger(rawEvent.created) || rawEvent.created < 0) {
    throw new BillingStateError('INVALID_EVENT', 'Event created must be a Unix timestamp.');
  }
  const object = rawEvent.data.object;
  const objectId = requiredText(object.id, 'Event object ID');
  const identifiers = eventIdentifiers(type, object);
  if (!identifiers.customerId || !identifiers.subscriptionId) {
    throw new BillingStateError('INVALID_EVENT', 'Billing events must contain first-class customer and subscription IDs.');
  }
  const priceIds = eventPriceIds(object);
  const fingerprint = {
    id,
    type,
    created: rawEvent.created,
    livemode: rawEvent.livemode === true,
    objectId,
    customerId: identifiers.customerId,
    subscriptionId: identifiers.subscriptionId,
    status: object.status ?? null,
    paymentStatus: object.payment_status ?? null,
    amountPaid: object.amount_paid ?? null,
    setupIntentId: referenceId(object.setup_intent),
    defaultPaymentMethodId: referenceId(object.default_payment_method),
    trialStart: object.trial_start ?? null,
    trialEnd: object.trial_end ?? null,
    currentPeriodEnd: object.current_period_end ?? null,
    cancelAtPeriodEnd: object.cancel_at_period_end === true,
    priceIds
  };
  return {
    id,
    type,
    created: rawEvent.created,
    rank: EVENT_RANK[type],
    livemode: rawEvent.livemode === true,
    object,
    objectId,
    ...identifiers,
    priceIds,
    digest: sha256(canonical(fingerprint)),
    sanitizedReceipt: {
      id,
      type,
      created: rawEvent.created,
      livemode: rawEvent.livemode === true,
      object: {
        id: objectId,
        object: typeof object.object === 'string' ? object.object : null,
        status: typeof object.status === 'string' ? object.status : null,
        paymentStatus: typeof object.payment_status === 'string' ? object.payment_status : null,
        hasCustomer: true,
        hasSubscription: true,
        priceCount: priceIds.length
      }
    }
  };
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

function stateResult(outcome, row, changed) {
  return {
    outcome,
    ownerId: row.ownerId,
    plan: row.plan,
    planStatus: row.planStatus,
    trialEndsAt: row.trialEndsAt ?? null,
    graceEndsAt: row.graceEndsAt ?? null,
    changed
  };
}

export class BillingStateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BillingStateError';
    this.code = code;
  }
}

function billingError(code, message) {
  return new BillingStateError(code, message);
}

export function createBillingStateService({
  db,
  pricePlanMap,
  supplementalPriceIds = [],
  clock = () => new Date(),
  randomUUID = crypto.randomUUID,
  onVerifiedTransition
}) {
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new TypeError('BillingStateService requires a SQLite-compatible database.');
  }
  const priceConfiguration = normalizePriceConfiguration(pricePlanMap, supplementalPriceIds);

  const userById = db.prepare('SELECT id, role, plan, planStatus, trialEndsAt FROM users WHERE id = ?');
  const billingByOwner = db.prepare(`
    SELECT billing.*, users.plan, users.planStatus, users.trialEndsAt,
      users.role AS userRole
    FROM billingAccounts AS billing
    JOIN users ON users.id = billing.ownerId
    WHERE billing.ownerId = ?
  `);
  const billingByCustomer = db.prepare(`
    SELECT billing.*, users.plan, users.planStatus, users.trialEndsAt,
      users.role AS userRole
    FROM billingAccounts AS billing
    JOIN users ON users.id = billing.ownerId
    WHERE billing.stripeCustomerId = ?
  `);
  const billingBySubscription = db.prepare(`
    SELECT billing.*, users.plan, users.planStatus, users.trialEndsAt,
      users.role AS userRole
    FROM billingAccounts AS billing
    JOIN users ON users.id = billing.ownerId
    WHERE billing.stripeSubscriptionId = ?
  `);
  const receiptById = db.prepare(`
    SELECT eventDigest, resultJson FROM billingEventReceipts WHERE stripeEventId = ?
  `);
  const subscriptionHistoryById = db.prepare(`
    SELECT * FROM billingSubscriptionHistory WHERE stripeSubscriptionId = ?
  `);
  const terminalDeletionReceipt = db.prepare(`
    SELECT stripeEventId, eventCreatedAt, processedAt
    FROM billingEventReceipts
    WHERE ownerId = ?
      AND eventType = 'customer.subscription.deleted'
      AND objectId = ?
      AND outcome = 'APPLIED'
    ORDER BY eventCreatedAt DESC, stripeEventId DESC
    LIMIT 1
  `);
  const authorizedCheckoutBySession = db.prepare(`
    SELECT id, ownerId, stripeCustomerId, stripeSessionId, stripePriceId,
      status, expiresAt, providerCreatedAt, createdAt
    FROM billingCheckoutRequests
    WHERE ownerId = ? AND stripeCustomerId = ? AND stripeSessionId = ?
      AND stripePriceId = ? AND status = 'OPEN' AND expiresAt >= ?
  `);
  const completedCheckoutBySubscription = db.prepare(`
    SELECT id, providerCreatedAt, consumedAt
    FROM billingCheckoutRequests
    WHERE ownerId = ? AND stripeCustomerId = ? AND stripeSubscriptionId = ?
      AND status = 'COMPLETED'
    ORDER BY consumedAt DESC, id DESC
    LIMIT 1
  `);
  const insertReceipt = db.prepare(`
    INSERT INTO billingEventReceipts (
      stripeEventId, ownerId, eventType, objectId, eventCreatedAt,
      eventDigest, outcome, sanitizedReceiptJson, resultJson, processedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCurrentSubscriptionHistory = db.prepare(`
    INSERT INTO billingSubscriptionHistory (
      stripeSubscriptionId, ownerId, stripeCustomerId, status,
      firstEventId, firstEventCreatedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, 'CURRENT', ?, ?, ?, ?)
  `);
  const insertTerminalSubscriptionHistory = db.prepare(`
    INSERT INTO billingSubscriptionHistory (
      stripeSubscriptionId, ownerId, stripeCustomerId, status,
      firstEventId, firstEventCreatedAt, terminalEventId,
      terminalEventCreatedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, 'TERMINAL', ?, ?, ?, ?, ?, ?)
  `);
  const markSubscriptionTerminal = db.prepare(`
    UPDATE billingSubscriptionHistory SET
      status = 'TERMINAL', terminalEventId = ?,
      terminalEventCreatedAt = ?, updatedAt = ?
    WHERE stripeSubscriptionId = ? AND ownerId = ? AND stripeCustomerId = ?
      AND status = 'CURRENT'
  `);
  const closeCheckoutRequest = db.prepare(`
    UPDATE billingCheckoutRequests SET
      status = ?, stripeSubscriptionId = ?,
      consumedAt = COALESCE(consumedAt, ?), updatedAt = ?
    WHERE ownerId = ? AND stripeCustomerId = ? AND stripeSessionId = ?
      AND stripePriceId = ?
      AND (stripeSubscriptionId IS NULL OR stripeSubscriptionId = ?)
      AND status IN ('OPEN', 'COMPLETED', 'FAILED')
  `);
  const updateBilling = db.prepare(`
    UPDATE billingAccounts SET
      stripeSubscriptionId = ?, stripePriceId = ?, paymentMethodVerifiedAt = ?,
      paymentFailedAt = ?, graceEndsAt = ?, currentPeriodEndAt = ?,
      cancelAtPeriodEnd = ?, canceledAt = ?, lastStripeEventCreatedAt = ?,
      lastStripeEventRank = ?, lastStripeEventId = ?, updatedAt = ?
    WHERE ownerId = ?
  `);
  const updateUser = db.prepare(`
    UPDATE users SET plan = ?, planStatus = ?, trialEndsAt = ?, paymentFailedAt = ?
    WHERE id = ? AND role = 'owner'
  `);
  const insertEvent = db.prepare(`
    INSERT INTO events (id, ownerId, eventType, payloadJson, createdAt)
    VALUES (?, ?, 'billing.state_changed', ?, ?)
  `);
  const insertOutbox = db.prepare(`
    INSERT INTO outboxEvents (
      id, ownerId, eventType, aggregateId, payloadJson, status, createdAt, updatedAt
    ) VALUES (?, ?, 'billing.state_changed', ?, ?, 'PENDING', ?, ?)
  `);

  function now() {
    return instant(clock(), 'Clock value');
  }

  function resolveConfiguredPlan(priceIds, account, requireEventPrice) {
    const bases = [];
    for (const priceId of priceIds) {
      const configured = priceConfiguration.prices.get(priceId);
      if (!configured) {
        if (priceConfiguration.supplemental.has(priceId)) continue;
        throw billingError('UNRECOGNIZED_PRICE', 'The Stripe event contains an unconfigured price.');
      }
      if (configured.kind === 'base') bases.push({ priceId, plan: configured.plan });
    }
    const uniquePlans = new Set(bases.map(item => item.plan));
    const uniqueBasePrices = new Set(bases.map(item => item.priceId));
    if (uniquePlans.size > 1 || uniqueBasePrices.size > 1) {
      throw billingError('AMBIGUOUS_PRICE', 'The Stripe event contains multiple base subscription prices.');
    }
    if (bases.length) return bases[0];
    if (requireEventPrice) throw billingError('MISSING_PRICE', 'The Stripe event must include an expanded configured price.');
    const existing = account.stripePriceId && priceConfiguration.prices.get(account.stripePriceId);
    if (!existing || existing.kind !== 'base') throw billingError('MISSING_PRICE', 'No configured base subscription price is available.');
    return { priceId: account.stripePriceId, plan: existing.plan };
  }

  function resolveAccountContext(event) {
    const byCustomer = billingByCustomer.get(event.customerId);
    const bySubscription = billingBySubscription.get(event.subscriptionId);
    const history = subscriptionHistoryById.get(event.subscriptionId);
    const byHistory = history ? billingByOwner.get(history.ownerId) : null;
    const ownerIds = new Set(
      [byCustomer?.ownerId, bySubscription?.ownerId, byHistory?.ownerId].filter(Boolean)
    );
    if (ownerIds.size > 1) {
      throw billingError('CROSS_ACCOUNT_IDS', 'The Stripe customer and subscription belong to different accounts.');
    }
    const account = byCustomer || bySubscription || byHistory;
    if (!account) throw billingError('BILLING_ACCOUNT_NOT_FOUND', 'No billing account matches the Stripe event.');
    if (account.userRole !== 'owner') throw billingError('BILLING_ACCOUNT_NOT_FOUND', 'No owner billing account matches the Stripe event.');
    if (account.stripeCustomerId !== event.customerId) {
      throw billingError('CROSS_ACCOUNT_IDS', 'The Stripe customer does not match the subscription account.');
    }
    if (history && (history.ownerId !== account.ownerId || history.stripeCustomerId !== event.customerId)) {
      throw billingError('CROSS_ACCOUNT_IDS', 'The Stripe subscription history does not match the customer account.');
    }
    if (history?.status === 'TERMINAL') return { account, history, relationship: 'TERMINAL' };
    if (account.stripeSubscriptionId === event.subscriptionId) {
      return { account, history, relationship: 'CURRENT' };
    }
    if (!account.stripeSubscriptionId) {
      if (history?.status === 'CURRENT') {
        throw billingError('BILLING_STATE_CONFLICT', 'Current subscription history does not match the billing account.');
      }
      return { account, history, relationship: 'UNBOUND' };
    }
    if (history) {
      throw billingError('BILLING_STATE_CONFLICT', 'Subscription history does not match the current billing account.');
    }
    return { account, history: null, relationship: 'REPLACEMENT_CANDIDATE' };
  }

  function authorizeRelationship(context, event, configured) {
    if (context.relationship !== 'REPLACEMENT_CANDIDATE') return context;
    const { account } = context;
    const deleted = terminalDeletionReceipt.get(account.ownerId, account.stripeSubscriptionId);
    if (account.planStatus !== 'canceled' || !account.canceledAt || !deleted) {
      throw billingError('SUBSCRIPTION_REPLACEMENT_NOT_AUTHORIZED', 'A current subscription cannot be replaced without verified terminal deletion.');
    }
    if (event.created <= deleted.eventCreatedAt ||
        !['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      throw billingError('SUBSCRIPTION_REPLACEMENT_NOT_AUTHORIZED', 'Resubscription requires a newer verified Checkout completion.');
    }
    const checkout = authorizedCheckoutBySession.get(
      account.ownerId,
      event.customerId,
      event.objectId,
      configured.priceId,
      eventInstant(event.created)
    );
    if (!checkout) {
      throw billingError('SUBSCRIPTION_REPLACEMENT_NOT_AUTHORIZED', 'Resubscription requires a matching open server-created Checkout session.');
    }
    const checkoutCreatedAt = new Date(checkout.createdAt);
    const providerCreatedAt = new Date(checkout.providerCreatedAt);
    const deletionProcessedAt = new Date(deleted.processedAt);
    if (!Number.isFinite(checkoutCreatedAt.getTime()) ||
        !Number.isFinite(providerCreatedAt.getTime()) ||
        !Number.isFinite(deletionProcessedAt.getTime()) ||
        checkoutCreatedAt < deletionProcessedAt ||
        providerCreatedAt.getTime() < deleted.eventCreatedAt * 1000) {
      throw billingError('SUBSCRIPTION_REPLACEMENT_NOT_AUTHORIZED', 'Resubscription Checkout must be created after terminal deletion.');
    }
    return { ...context, relationship: 'REPLACEMENT', deleted, checkout };
  }

  function validateHistoryOwnership(history, account, subscriptionId) {
    if (!history || history.ownerId !== account.ownerId ||
        history.stripeCustomerId !== account.stripeCustomerId ||
        history.stripeSubscriptionId !== subscriptionId) {
      throw billingError('BILLING_STATE_CONFLICT', 'Subscription history ownership is inconsistent.');
    }
    return history;
  }

  function ensureCurrentHistory(account, event, processedAt) {
    const existing = subscriptionHistoryById.get(event.subscriptionId);
    if (existing) {
      validateHistoryOwnership(existing, account, event.subscriptionId);
      if (existing.status !== 'CURRENT') {
        throw billingError('BILLING_STATE_CONFLICT', 'A terminal subscription cannot become current again.');
      }
      return existing;
    }
    insertCurrentSubscriptionHistory.run(
      event.subscriptionId,
      account.ownerId,
      account.stripeCustomerId,
      event.id,
      event.created,
      processedAt,
      processedAt
    );
    return validateHistoryOwnership(
      subscriptionHistoryById.get(event.subscriptionId),
      account,
      event.subscriptionId
    );
  }

  function ensureTerminalHistory(account, subscriptionId, deleted, processedAt) {
    const existing = subscriptionHistoryById.get(subscriptionId);
    if (!existing) {
      insertTerminalSubscriptionHistory.run(
        subscriptionId,
        account.ownerId,
        account.stripeCustomerId,
        deleted.stripeEventId,
        deleted.eventCreatedAt,
        deleted.stripeEventId,
        deleted.eventCreatedAt,
        deleted.processedAt || processedAt,
        processedAt
      );
    } else {
      validateHistoryOwnership(existing, account, subscriptionId);
      if (existing.status === 'CURRENT') {
        markSubscriptionTerminal.run(
          deleted.stripeEventId,
          deleted.eventCreatedAt,
          processedAt,
          subscriptionId,
          account.ownerId,
          account.stripeCustomerId
        );
      }
    }
    const terminal = validateHistoryOwnership(
      subscriptionHistoryById.get(subscriptionId),
      account,
      subscriptionId
    );
    if (terminal.status !== 'TERMINAL' ||
        terminal.terminalEventId !== deleted.stripeEventId ||
        terminal.terminalEventCreatedAt !== deleted.eventCreatedAt) {
      throw billingError('BILLING_STATE_CONFLICT', 'Terminal subscription evidence is inconsistent.');
    }
    return terminal;
  }

  function replacementBase(account) {
    return {
      ...account,
      stripeSubscriptionId: null,
      stripePriceId: null,
      paymentMethodVerifiedAt: null,
      paymentFailedAt: null,
      graceEndsAt: null,
      currentPeriodEndAt: null,
      cancelAtPeriodEnd: 0,
      canceledAt: null,
      planStatus: 'pending_payment',
      trialEndsAt: null
    };
  }

  function consumeCheckout(context, event, configured, processedAt) {
    if (!event.type.startsWith('checkout.session.')) return;
    const status = event.type === 'checkout.session.async_payment_failed' ? 'FAILED' : 'COMPLETED';
    const consumedAt = eventInstant(event.created);
    const result = closeCheckoutRequest.run(
      status,
      event.subscriptionId,
      consumedAt,
      processedAt,
      context.account.ownerId,
      event.customerId,
      event.objectId,
      configured.priceId,
      event.subscriptionId
    );
    if (context.relationship === 'REPLACEMENT' && Number(result?.changes) !== 1) {
      throw billingError('SUBSCRIPTION_REPLACEMENT_NOT_AUTHORIZED', 'The reviewed Checkout session could not be consumed.');
    }
  }

  function paymentFailureState(account, eventIso) {
    const failedAt = account.paymentFailedAt || eventIso;
    const graceEndsAt = account.graceEndsAt || new Date(new Date(failedAt).getTime() + GRACE_MS).toISOString();
    const expired = new Date(eventIso) >= new Date(graceEndsAt);
    return { failedAt, graceEndsAt, status: expired ? 'suspended' : 'payment_failed' };
  }

  function applyTransition(account, event, configured) {
    const eventIso = eventInstant(event.created);
    const object = event.object;
    const next = {
      ...account,
      plan: configured.plan,
      stripePriceId: configured.priceId,
      stripeSubscriptionId: account.stripeSubscriptionId || event.subscriptionId,
      cancelAtPeriodEnd: object.cancel_at_period_end === true ? 1 : 0,
      currentPeriodEndAt: unixToIso(object.current_period_end) || account.currentPeriodEndAt,
      updatedAt: now().toISOString()
    };
    const subscriptionEvidence = Boolean(referenceId(object.default_payment_method));
    const checkoutSetupEvidence = event.type === 'checkout.session.completed' &&
      object.status === 'complete' && object.payment_status === 'no_payment_required' &&
      Boolean(referenceId(object.setup_intent));
    const paidCheckout = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) &&
      object.payment_status === 'paid';
    if (subscriptionEvidence || checkoutSetupEvidence || paidCheckout ||
        (event.type === 'invoice.paid' && Number.isInteger(object.amount_paid) && object.amount_paid > 0)) {
      next.paymentMethodVerifiedAt ||= eventIso;
    }

    if (event.type === 'checkout.session.completed') {
      if (object.mode !== 'subscription') throw billingError('INVALID_EVENT', 'Checkout must be in subscription mode.');
      if (object.status !== 'complete') throw billingError('INVALID_EVENT', 'A completed Checkout event must have complete status.');
      if (!SERVING_STATUSES.has(account.planStatus)) {
        next.planStatus = paidCheckout ? 'active' : checkoutSetupEvidence ? 'pending_subscription' : 'pending_payment';
      }
      if (paidCheckout && account.planStatus !== 'canceled') {
        next.paymentFailedAt = null;
        next.graceEndsAt = null;
      }
      return next;
    }

    if (event.type === 'checkout.session.async_payment_succeeded') {
      if (!paidCheckout) throw billingError('INVALID_EVENT', 'Async payment success requires paid Checkout status.');
      if (account.planStatus !== 'canceled') {
        next.planStatus = 'active';
        next.paymentFailedAt = null;
        next.graceEndsAt = null;
        next.trialEndsAt = null;
      }
      return next;
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      if (!SERVING_STATUSES.has(account.planStatus)) next.planStatus = 'pending_payment';
      return next;
    }

    if (event.type === 'customer.subscription.deleted') {
      next.planStatus = 'canceled';
      next.canceledAt = eventIso;
      next.cancelAtPeriodEnd = 0;
      next.trialEndsAt = null;
      return next;
    }

    if (event.type.startsWith('customer.subscription.')) {
      const status = requiredText(object.status, 'Subscription status');
      if (account.planStatus === 'canceled' && status !== 'canceled') return next;
      if (status === 'trialing') {
        if (!Number.isInteger(object.trial_end) || !Number.isInteger(object.trial_start ?? object.created ?? event.created)) {
          throw billingError('INVALID_TRIAL', 'A trialing subscription must contain trial boundaries.');
        }
        const trialStart = object.trial_start ?? object.created ?? event.created;
        if (object.trial_end <= event.created || object.trial_end - trialStart > TRIAL_SECONDS) {
          throw billingError('INVALID_TRIAL', 'The Stripe trial must be active and no longer than 14 days.');
        }
        next.trialEndsAt = eventInstant(object.trial_end);
        if (account.paymentFailedAt && ['payment_failed', 'past_due', 'suspended'].includes(account.planStatus)) {
          next.planStatus = account.planStatus;
        } else {
          next.planStatus = next.paymentMethodVerifiedAt ? 'trialing' : 'pending_payment';
        }
        return next;
      }
      if (status === 'active') {
        next.planStatus = next.paymentMethodVerifiedAt ? 'active' : 'pending_payment';
        if (next.planStatus === 'active') {
          next.paymentFailedAt = null;
          next.graceEndsAt = null;
          next.trialEndsAt = null;
        }
        return next;
      }
      if (status === 'past_due' || status === 'unpaid') {
        if (!next.paymentMethodVerifiedAt) {
          next.planStatus = 'pending_payment';
        } else {
          const failure = paymentFailureState(account, eventIso);
          next.paymentFailedAt = failure.failedAt;
          next.graceEndsAt = failure.graceEndsAt;
          next.planStatus = failure.status;
        }
        return next;
      }
      if (status === 'canceled' || status === 'incomplete_expired') {
        next.planStatus = 'canceled';
        next.canceledAt = eventIso;
        next.cancelAtPeriodEnd = 0;
        next.trialEndsAt = null;
        return next;
      }
      if (status === 'paused') {
        next.planStatus = 'suspended';
        return next;
      }
      if (status === 'incomplete') {
        next.planStatus = 'pending_payment';
        return next;
      }
      throw billingError('UNSUPPORTED_SUBSCRIPTION_STATUS', `Unsupported Stripe subscription status: ${status}.`);
    }

    if (event.type === 'invoice.payment_failed') {
      if (account.planStatus === 'canceled') return next;
      const failure = paymentFailureState(account, eventIso);
      next.paymentFailedAt = failure.failedAt;
      next.graceEndsAt = failure.graceEndsAt;
      next.planStatus = next.paymentMethodVerifiedAt ? failure.status : 'pending_payment';
      return next;
    }

    if (event.type === 'invoice.paid') {
      if (account.planStatus === 'canceled') return next;
      if (next.paymentMethodVerifiedAt) {
        const stillTrialing = account.planStatus === 'trialing' && account.trialEndsAt &&
          new Date(account.trialEndsAt) > new Date(eventIso) && Number(object.amount_paid ?? 0) === 0;
        next.planStatus = stillTrialing ? 'trialing' : 'active';
        next.paymentFailedAt = null;
        next.graceEndsAt = null;
        if (!stillTrialing) next.trialEndsAt = null;
      } else {
        next.planStatus = 'pending_payment';
      }
      return next;
    }

    throw billingError('UNSUPPORTED_EVENT', `Unsupported billing event: ${event.type}.`);
  }

  function transitionChanged(before, after) {
    return [
      'plan', 'planStatus', 'trialEndsAt', 'stripeSubscriptionId', 'stripePriceId',
      'paymentMethodVerifiedAt', 'paymentFailedAt', 'graceEndsAt',
      'currentPeriodEndAt', 'cancelAtPeriodEnd', 'canceledAt'
    ].some(key => (before[key] ?? null) !== (after[key] ?? null));
  }

  function logTransition(before, after, reason, occurredAt) {
    const payload = {
      from: { plan: before.plan, status: before.planStatus },
      to: { plan: after.plan, status: after.planStatus },
      reason,
      trialEndsAt: after.trialEndsAt ?? null,
      paymentFailedAt: after.paymentFailedAt ?? null,
      graceEndsAt: after.graceEndsAt ?? null
    };
    const payloadJson = JSON.stringify(payload);
    insertEvent.run(randomUUID(), after.ownerId, payloadJson, occurredAt);
    insertOutbox.run(randomUUID(), after.ownerId, after.ownerId, payloadJson, occurredAt, occurredAt);
  }

  function writeState(before, after, event, processedAt, changed, { preserveOrdering = false } = {}) {
    const orderingCreatedAt = preserveOrdering ? before.lastStripeEventCreatedAt : event.created;
    const orderingRank = preserveOrdering ? before.lastStripeEventRank : event.rank;
    const orderingEventId = preserveOrdering ? before.lastStripeEventId : event.id;
    updateBilling.run(
      after.stripeSubscriptionId, after.stripePriceId, after.paymentMethodVerifiedAt ?? null,
      after.paymentFailedAt ?? null, after.graceEndsAt ?? null, after.currentPeriodEndAt ?? null,
      after.cancelAtPeriodEnd ? 1 : 0, after.canceledAt ?? null, orderingCreatedAt,
      orderingRank, orderingEventId, processedAt, after.ownerId
    );
    updateUser.run(
      after.plan, after.planStatus, after.trialEndsAt ?? null,
      after.paymentFailedAt ?? null, after.ownerId
    );
    if (changed) logTransition(before, after, event.type, eventInstant(event.created));
  }

  function registerBillingCustomer({ ownerId, stripeCustomerId }) {
    const cleanOwnerId = requiredText(ownerId, 'Owner ID');
    const cleanCustomerId = requiredText(stripeCustomerId, 'Stripe customer ID');
    return immediate(db, () => {
      const user = userById.get(cleanOwnerId);
      if (!user || user.role !== 'owner') throw billingError('OWNER_NOT_FOUND', 'Billing can only be registered for an owner account.');
      const existingOwner = billingByOwner.get(cleanOwnerId);
      const existingCustomer = billingByCustomer.get(cleanCustomerId);
      if (existingCustomer && existingCustomer.ownerId !== cleanOwnerId) {
        throw billingError('CUSTOMER_ALREADY_ASSIGNED', 'The Stripe customer is assigned to another account.');
      }
      if (existingOwner) {
        if (existingOwner.stripeCustomerId !== cleanCustomerId) {
          throw billingError('CUSTOMER_REPLACEMENT_REQUIRES_REVIEW', 'Replacing a billing customer requires an explicit reviewed migration.');
        }
        return stateResult('EXISTS', existingOwner, false);
      }
      const nowIso = now().toISOString();
      db.prepare(`INSERT INTO billingAccounts (
        ownerId, stripeCustomerId, cancelAtPeriodEnd, createdAt, updatedAt
      ) VALUES (?, ?, 0, ?, ?)`).run(cleanOwnerId, cleanCustomerId, nowIso, nowIso);
      updateUser.run(user.plan, 'pending_payment', null, null, cleanOwnerId);
      return stateResult('REGISTERED', billingByOwner.get(cleanOwnerId), user.planStatus !== 'pending_payment' || user.trialEndsAt !== null);
    });
  }

  function applyVerifiedStripeEvent(rawEvent) {
    // The HTTP integration must verify Stripe's raw-body signature before it
    // calls this state core. A redirect or client-provided session ID is never
    // payment evidence and must not reach this function as an event.
    const event = normalizeEvent(rawEvent);
    return immediate(db, () => {
      const existing = receiptById.get(event.id);
      if (existing) {
        if (existing.eventDigest !== event.digest) {
          throw billingError('EVENT_ID_CONFLICT', 'This Stripe event ID was already received with different state data.');
        }
        const replay = parseStoredJson(existing.resultJson);
        // Supplementary usage evidence is written atomically with a new receipt.
        // A replay must not reinterpret historical evidence against a changed plan.
        return replay;
      }

      let context = resolveAccountContext(event);
      const account = context.account;
      const processedAt = now().toISOString();
      if (context.relationship === 'TERMINAL') {
        const result = stateResult('IGNORED_TERMINAL_SUBSCRIPTION', account, false);
        insertReceipt.run(
          event.id, account.ownerId, event.type, event.objectId, event.created,
          event.digest, 'IGNORED_TERMINAL_SUBSCRIPTION',
          JSON.stringify(event.sanitizedReceipt), JSON.stringify(result), processedAt
        );
        return result;
      }

      const requireEventPrice = event.type.startsWith('checkout.session.') || event.type.startsWith('customer.subscription.');
      const configured = resolveConfiguredPlan(event.priceIds, account, requireEventPrice);
      context = authorizeRelationship(context, event, configured);
      const activationCheckout = context.relationship === 'CURRENT'
        ? completedCheckoutBySubscription.get(account.ownerId, event.customerId, event.subscriptionId)
        : null;
      const activationProviderCreatedAt = activationCheckout?.providerCreatedAt
        ? new Date(activationCheckout.providerCreatedAt)
        : null;
      const pendingSubscriptionActivation =
        context.relationship === 'CURRENT' &&
        account.planStatus === 'pending_subscription' &&
        event.type === 'customer.subscription.created' &&
        activationProviderCreatedAt &&
        Number.isFinite(activationProviderCreatedAt.getTime()) &&
        event.created * 1000 >= activationProviderCreatedAt.getTime();
      const orderingStale = Number.isInteger(account.lastStripeEventCreatedAt) && (
        event.created < account.lastStripeEventCreatedAt ||
        (event.created === account.lastStripeEventCreatedAt && event.rank < (account.lastStripeEventRank ?? 0))
      );
      const stale = context.relationship !== 'REPLACEMENT' &&
        !pendingSubscriptionActivation && orderingStale;
      let result;
      let receiptOutcome;
      if (stale) {
        result = stateResult('IGNORED_STALE', account, false);
        receiptOutcome = 'IGNORED_STALE';
        consumeCheckout(context, event, configured, processedAt);
      } else {
        let transitionAccount = account;
        if (context.relationship === 'REPLACEMENT') {
          ensureTerminalHistory(
            account,
            account.stripeSubscriptionId,
            context.deleted,
            processedAt
          );
          transitionAccount = replacementBase(account);
        }
        ensureCurrentHistory(transitionAccount, event, processedAt);
        const after = applyTransition(transitionAccount, event, configured);
        const changed = transitionChanged(account, after);
        writeState(account, after, event, processedAt, changed, {
          preserveOrdering: pendingSubscriptionActivation && orderingStale
        });
        if (event.type === 'customer.subscription.deleted') {
          ensureTerminalHistory(account, event.subscriptionId, {
            stripeEventId: event.id,
            eventCreatedAt: event.created,
            processedAt
          }, processedAt);
        }
        consumeCheckout(context, event, configured, processedAt);
        result = stateResult('APPLIED', after, changed);
        receiptOutcome = 'APPLIED';
      }
      insertReceipt.run(
        event.id, account.ownerId, event.type, event.objectId, event.created,
        event.digest, receiptOutcome, JSON.stringify(event.sanitizedReceipt),
        JSON.stringify(result), processedAt
      );
      if (receiptOutcome === 'APPLIED') onVerifiedTransition?.(rawEvent, result);
      return result;
    });
  }

  function suspendExpiredGracePeriods({ at = now() } = {}) {
    const checkedAt = instant(at, 'Grace-period check time');
    const checkedAtIso = checkedAt.toISOString();
    return immediate(db, () => {
      const rows = db.prepare(`
        SELECT billing.*, users.plan, users.planStatus, users.trialEndsAt,
          users.role AS userRole
        FROM billingAccounts AS billing
        JOIN users ON users.id = billing.ownerId
        WHERE users.planStatus IN ('payment_failed', 'past_due')
          AND billing.graceEndsAt IS NOT NULL
          AND billing.graceEndsAt <= ?
      `).all(checkedAtIso);
      for (const row of rows) {
        const after = { ...row, planStatus: 'suspended', updatedAt: checkedAtIso };
        db.prepare('UPDATE billingAccounts SET updatedAt = ? WHERE ownerId = ?').run(checkedAtIso, row.ownerId);
        updateUser.run(
          row.plan, 'suspended', row.trialEndsAt ?? null,
          row.paymentFailedAt ?? null, row.ownerId
        );
        logTransition(row, after, 'billing.grace_expired', checkedAtIso);
      }
      return { suspendedCount: rows.length };
    });
  }

  return {
    registerBillingCustomer,
    applyVerifiedStripeEvent,
    suspendExpiredGracePeriods
  };
}
