import {usageOwnerQuery} from './billingUsagePolicy.js';
import {syncBillingPaidThrough,syncBillingCancellationEvidence} from './billingCustomerLifecycle.js';
import crypto from 'node:crypto';
import {recordOwnerUsagePeriods} from './billingUsagePeriods.js';
import {recordAnnualPaidTerm} from './billingAnnualTerms.js';
import {withBillingLease,billingProviderRead,BILLING_PROVIDER_OPTIONS} from './billingProvider.js';
import {createBillingEvidence, subscriptionFacts, billingReference, billingInvoiceSubscription} from './billingEvidence.js';

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
  const legacyDigest = sha256(canonical(fingerprint));
  const modern = {
    ...fingerprint, mode: object.mode ?? null,
    currentPeriodStart: object.current_period_start ?? null,
    latestInvoiceId: referenceId(object.latest_invoice), invoiceId: referenceId(object.invoice),
    periodStart: object.period_start ?? null, periodEnd: object.period_end ?? null,
    cancelAtPeriodEnd: object.cancel_at_period_end ?? null,
    items: (object.items?.data ?? []).map(item => ({id:referenceId(item),price:priceIdFromLine(item),
      quantity:item.quantity ?? null,start:item.current_period_start ?? null,end:item.current_period_end ?? null})),
    itemsHasMore: object.items?.has_more ?? false,
    lines: (object.lines?.data ?? []).map(line => ({id:referenceId(line),price:priceIdFromLine(line),
      amount:line.amount ?? null,period:line.period ?? null,parent:line.parent ?? null}))
  };
  return {
    id,
    type,
    created: rawEvent.created,
    rank: 0,
    livemode: rawEvent.livemode === true,
    object,
    objectId,
    ...identifiers,
    priceIds,
    digest: `v2:${sha256(canonical(modern))}`,
    legacyDigest: (object.current_period_start!=null || object.latest_invoice!=null || object.invoice!=null || object.period_start!=null || object.period_end!=null ||
      (object.items?.data ?? []).some(item=>item.current_period_start!=null || item.current_period_end!=null)) ? null : legacyDigest,
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
  priceIds = {},
  supplementalPriceIds = [],
  clock = () => new Date(),
  randomUUID = crypto.randomUUID
}) {
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') {
    throw new TypeError('BillingStateService requires a SQLite-compatible database.');
  }
  const priceConfiguration = normalizePriceConfiguration(pricePlanMap, supplementalPriceIds);
  for(const intervals of Object.values(priceIds))for(const [interval,id] of Object.entries(intervals)){
    if(priceConfiguration.prices.has(id)&&['monthly','annual'].includes(interval))priceConfiguration.prices.get(id).interval=interval;
  }

  const evidence = createBillingEvidence({db, fail:billingError});

  const userById = db.prepare('SELECT id, role, plan, planStatus, trialEndsAt FROM users WHERE id = ?');
  const billingByOwner = usageOwnerQuery(db)(`
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
  const terminalDeletionReceipt = usageOwnerQuery(db)(`
    SELECT stripeEventId, eventCreatedAt, processedAt
    FROM billingEventReceipts
    WHERE ownerId = ?
      AND eventType = 'customer.subscription.deleted'
      AND objectId = ?
      AND outcome = 'APPLIED'
    ORDER BY eventCreatedAt DESC, stripeEventId DESC
    LIMIT 1
  `);
  const authorizedCheckoutBySession = usageOwnerQuery(db)(`
    SELECT id, ownerId, stripeCustomerId, stripeSessionId, stripePriceId,
      status, expiresAt, providerCreatedAt, createdAt
    FROM billingCheckoutRequests
    WHERE ownerId = ? AND stripeCustomerId = ? AND stripeSessionId = ?
      AND stripePriceId = ? AND status IN ('OPEN','EXPIRED','COMPLETED')
  `);
  const completedCheckoutBySubscription = usageOwnerQuery(db)(`
    SELECT id, providerCreatedAt, consumedAt
    FROM billingCheckoutRequests
    WHERE ownerId = ? AND stripeCustomerId = ? AND stripeSubscriptionId = ?
      AND status = 'COMPLETED'
    ORDER BY consumedAt DESC, id DESC
    LIMIT 1
  `);
  const insertReceipt = usageOwnerQuery(db)(`
    INSERT INTO billingEventReceipts (
      stripeEventId, ownerId, eventType, objectId, eventCreatedAt,
      eventDigest, outcome, sanitizedReceiptJson, resultJson, processedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCurrentSubscriptionHistory = usageOwnerQuery(db)(`
    INSERT INTO billingSubscriptionHistory (
      stripeSubscriptionId, ownerId, stripeCustomerId, status,
      firstEventId, firstEventCreatedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, 'CURRENT', ?, ?, ?, ?)
  `);
  const insertTerminalSubscriptionHistory = usageOwnerQuery(db)(`
    INSERT INTO billingSubscriptionHistory (
      stripeSubscriptionId, ownerId, stripeCustomerId, status,
      firstEventId, firstEventCreatedAt, terminalEventId,
      terminalEventCreatedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, 'TERMINAL', ?, ?, ?, ?, ?, ?)
  `);
  const markSubscriptionTerminal = usageOwnerQuery(db)(`
    UPDATE billingSubscriptionHistory SET
      status = 'TERMINAL', terminalEventId = ?,
      terminalEventCreatedAt = ?, updatedAt = ?
    WHERE stripeSubscriptionId = ? AND ownerId = ? AND stripeCustomerId = ?
      AND status = 'CURRENT'
  `);
  const closeCheckoutRequest = usageOwnerQuery(db)(`
    UPDATE billingCheckoutRequests SET
      status = ?, stripeSubscriptionId = ?,
      consumedAt = COALESCE(consumedAt, ?), updatedAt = ?
    WHERE ownerId = ? AND stripeCustomerId = ? AND stripeSessionId = ?
      AND stripePriceId = ?
      AND (stripeSubscriptionId IS NULL OR stripeSubscriptionId = ?)
      AND status IN ('OPEN', 'EXPIRED', 'COMPLETED', 'FAILED')
  `);
  const updateBilling = usageOwnerQuery(db)(`
    UPDATE billingAccounts SET
      stripeSubscriptionId = ?, stripePriceId = ?, paymentMethodVerifiedAt = ?,
      paymentFailedAt = ?, graceEndsAt = ?, currentPeriodEndAt = ?, currentPeriodStartAt = ?,
      cancelAtPeriodEnd = ?, canceledAt = ?, lastStripeEventCreatedAt = ?,
      lastStripeEventRank = ?, lastStripeEventId = ?, updatedAt = ?
    WHERE ownerId = ?
  `);
  const updateUser = usageOwnerQuery(db)(`
    UPDATE users SET plan = ?, planStatus = ?, trialEndsAt = ?, paymentFailedAt = ?
    WHERE id = ? AND role = 'owner' AND ownerId IS NULL
  `);
  const insertEvent = usageOwnerQuery(db)(`
    INSERT INTO events (id, ownerId, eventType, payloadJson, createdAt)
    VALUES (?, ?, 'billing.state_changed', ?, ?)
  `);
  const insertOutbox = usageOwnerQuery(db)(`
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
      configured.priceId
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
      currentPeriodStartAt: null,
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

  function applyTransition(account, event, configured, providerSubscription) {
    const object = event.object, eventIso = eventInstant(event.created);
    const identity = {ownerId:account.ownerId,customerId:event.customerId,subscriptionId:event.subscriptionId};
    const next = {...account,stripeSubscriptionId:event.subscriptionId,updatedAt:now().toISOString()};
    let subscription = evidence.readSubscription(account.ownerId,event.subscriptionId);
    let stale = false;
    if (event.type.startsWith('customer.subscription.') || providerSubscription) {
      const source = providerSubscription || object;
      if (billingReference(source.customer)!==event.customerId || source.id!==event.subscriptionId) throw billingError('CROSS_ACCOUNT_IDS','Provider subscription does not match the verified event.');
      const facts = subscriptionFacts(source,priceConfiguration,billingError);
      if (['past_due','unpaid'].includes(facts.status) && !facts.latestInvoiceId) usageOwnerQuery(db)(`INSERT OR IGNORE INTO billingRecoveryHolds(ownerId,stripeSubscriptionId,reason,createdAt) VALUES(?,?,'SUBSCRIPTION_DEBT_REFERENCE_REQUIRED',?)`).run(account.ownerId,event.subscriptionId,eventIso);
      if (facts.status === 'trialing' && (!Number.isInteger(facts.trialStart) || !Number.isInteger(facts.trialEnd) || facts.trialEnd <= facts.trialStart || facts.trialEnd-facts.trialStart>TRIAL_SECONDS)) throw billingError('INVALID_TRIAL','The Stripe trial must have valid boundaries no longer than 14 days.');
      subscription = evidence.recordSubscription({...identity,facts,created:event.created,provider:Boolean(providerSubscription)});
      stale = subscription.stale;
    }
    if (event.type.startsWith('invoice.')) {
      const invoice = evidence.recordInvoice({...identity,object,paid:event.type==='invoice.paid',created:event.created});
      if(event.type==='invoice.paid')recordAnnualPaidTerm({database:db,ownerId:account.ownerId,subscriptionId:event.subscriptionId,facts:subscription?.facts,invoice:object});
      stale = invoice.stale;
      if (event.type==='invoice.paid' && object.amount_paid>0) next.paymentMethodVerifiedAt ||= eventIso;
    }
    if (providerSubscription?.latest_invoice && typeof providerSubscription.latest_invoice==='object') {
      const invoice=providerSubscription.latest_invoice;
      if (invoice.status==='paid') {
        evidence.recordInvoice({...identity,object:invoice,paid:true,created:event.created});
        recordAnnualPaidTerm({database:db,ownerId:account.ownerId,subscriptionId:event.subscriptionId,facts:subscription?.facts,invoice});
        if (invoice.amount_paid>0) next.paymentMethodVerifiedAt ||= eventIso;
      } else if (['past_due','unpaid'].includes(providerSubscription.status)) {
        evidence.recordInvoice({...identity,object:invoice,paid:false,created:event.created});
      }
    }
    if (event.type.startsWith('checkout.session.')) {
      if (object.mode!=='subscription' || object.status!=='complete') throw billingError('INVALID_EVENT','Checkout must be complete and in subscription mode.');
      const paid = object.payment_status==='paid';
      if (event.type==='checkout.session.async_payment_succeeded' && !paid) throw billingError('INVALID_EVENT','Async payment success requires paid Checkout status.');
      // Retain legacy setup evidence as pending only. Subscription-mode Checkout
      // itself does not supply the trial boundary or current entitlement.
      const setup = object.payment_status==='no_payment_required' && referenceId(object.setup_intent);
      if (paid || setup) next.paymentMethodVerifiedAt ||= eventIso;
      if (!subscription && !account.stripePriceId) {
        next.plan=configured.plan; next.stripePriceId=configured.priceId;
      }
      if (!subscription && !SERVING_STATUSES.has(account.planStatus)) next.planStatus=setup?'pending_subscription':'pending_payment';
    }
    if (subscription) {
      const f=subscription.facts;
      next.plan=f.plan; next.stripePriceId=f.priceId;
      if (f.paymentMethodId) next.paymentMethodVerifiedAt ||= eventIso;
      next.currentPeriodStartAt=unixToIso(f.periodStart) || account.currentPeriodStartAt || null;
      next.currentPeriodEndAt=unixToIso(f.periodEnd) || account.currentPeriodEndAt || null;
      if (f.cancelAtPeriodEnd!==null) next.cancelAtPeriodEnd=f.cancelAtPeriodEnd?1:0;
      if (subscription.ambiguous) next.planStatus='pending_payment';
      else if (f.status==='trialing') {
        next.trialEndsAt=unixToIso(f.trialEnd);
        next.planStatus=next.paymentMethodVerifiedAt?'trialing':'pending_payment';
      } else if (f.status==='active') {
        next.planStatus=next.paymentMethodVerifiedAt?'active':'pending_payment'; next.trialEndsAt=null;
      } else if (['canceled','incomplete_expired'].includes(f.status)) {
        next.planStatus='canceled'; next.canceledAt=eventIso; next.cancelAtPeriodEnd=0; next.trialEndsAt=null;
      } else if (f.status==='paused') next.planStatus='suspended';
      else if (f.status==='incomplete') next.planStatus='pending_payment';
      else if (['past_due','unpaid'].includes(f.status)) {
        const invoice=f.latestInvoiceId && usageOwnerQuery(db)('SELECT status FROM billingInvoiceEvidence WHERE ownerId=? AND stripeSubscriptionId=? AND stripeInvoiceId=?').get(account.ownerId,event.subscriptionId,f.latestInvoiceId);
        if (invoice?.status==='PAID' && !providerSubscription) next.planStatus=next.paymentMethodVerifiedAt?'active':'pending_payment';
        else {
          const failure=paymentFailureState(account,eventIso);
          next.paymentFailedAt=failure.failedAt; next.graceEndsAt=failure.graceEndsAt;
          next.planStatus=next.paymentMethodVerifiedAt?failure.status:'pending_payment';
        }
      } else throw billingError('UNSUPPORTED_SUBSCRIPTION_STATUS',`Unsupported Stripe subscription status: ${f.status}.`);
    }
    // The deletion itself is terminal, regardless of any concurrent retrieval.
    if (event.type==='customer.subscription.deleted') {
      next.planStatus='canceled'; next.canceledAt=eventIso; next.cancelAtPeriodEnd=0; next.trialEndsAt=null;
    }
    const debt=evidence.debt(account.ownerId,event.subscriptionId);
    const hold=usageOwnerQuery(db)('SELECT reason FROM billingRecoveryHolds WHERE ownerId=? AND stripeSubscriptionId=?').get(account.ownerId,event.subscriptionId);
    if (hold && !debt.count && !account.paymentFailedAt) {
      if (next.planStatus!=='canceled') next.planStatus='suspended';
      next.paymentFailedAt=null; next.graceEndsAt=null;
    } else if (debt.count || hold) {
      const failedAt=debt.count?eventInstant(debt.failedAt):account.paymentFailedAt || eventIso;
      const first=[failedAt,account.paymentFailedAt].filter(Boolean).sort()[0];
      const failure=paymentFailureState({...account,paymentFailedAt:first,graceEndsAt:null},new Date(Math.max(now().getTime(),event.created*1000)).toISOString());
      next.paymentFailedAt=failure.failedAt; next.graceEndsAt=failure.graceEndsAt;
      if (next.planStatus!=='canceled') next.planStatus=next.paymentMethodVerifiedAt?failure.status:'pending_payment';
    } else if (next.planStatus==='active' || next.planStatus==='trialing') {
      // All known relevant invoice obligations have been settled. A payment
      // method or Checkout never independently deletes those obligations.
      next.paymentFailedAt=null; next.graceEndsAt=null;
    }
    return {after:next,stale};
  }

  function transitionChanged(before, after) {
    return [
      'plan', 'planStatus', 'trialEndsAt', 'stripeSubscriptionId', 'stripePriceId',
      'paymentMethodVerifiedAt', 'paymentFailedAt', 'graceEndsAt',
      'currentPeriodEndAt', 'currentPeriodStartAt', 'cancelAtPeriodEnd', 'canceledAt'
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
      after.paymentFailedAt ?? null, after.graceEndsAt ?? null, after.currentPeriodEndAt ?? null, after.currentPeriodStartAt ?? null,
      after.cancelAtPeriodEnd ? 1 : 0, after.canceledAt ?? null, orderingCreatedAt,
      orderingRank, orderingEventId, processedAt, after.ownerId
    );
    updateUser.run(
      after.plan, after.planStatus, after.trialEndsAt ?? null,
      after.paymentFailedAt ?? null, after.ownerId
    );
    const facts=evidence.readSubscription(after.ownerId,after.stripeSubscriptionId)?.facts;
    if(facts?.billingInterval==='annual')for(const invoice of usageOwnerQuery(db)("SELECT invoiceJson FROM billingInvoiceEvidence WHERE ownerId=? AND stripeSubscriptionId=? AND status='PAID' AND invoiceJson IS NOT NULL").all(after.ownerId,after.stripeSubscriptionId)){
      recordAnnualPaidTerm({database:db,ownerId:after.ownerId,subscriptionId:after.stripeSubscriptionId,facts,invoice:JSON.parse(invoice.invoiceJson)});
    }
    const paid=usageOwnerQuery(db)('SELECT MAX(endAt) endAt FROM billingAnnualTerms WHERE ownerId=? AND stripeSubscriptionId=? AND plan=? AND startAt<=?').get(after.ownerId,after.stripeSubscriptionId,after.plan,processedAt);
    usageOwnerQuery(db)('UPDATE users SET annualPaidThroughAt=? WHERE id=? AND role=\'owner\' AND ownerId IS NULL').run(paid?.endAt||null,after.ownerId);
    syncBillingPaidThrough(db,after.ownerId);
    syncBillingCancellationEvidence(db,after.ownerId,processedAt);
    recordOwnerUsagePeriods({database:db,ownerId:after.ownerId,priceIds,at:processedAt});
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
      usageOwnerQuery(db)(`INSERT INTO billingAccounts (
        ownerId, stripeCustomerId, cancelAtPeriodEnd, createdAt, updatedAt
      ) VALUES (?, ?, 0, ?, ?)`).run(cleanOwnerId, cleanCustomerId, nowIso, nowIso);
      updateUser.run(user.plan, 'pending_payment', null, null, cleanOwnerId);
      return stateResult('REGISTERED', billingByOwner.get(cleanOwnerId), user.planStatus !== 'pending_payment' || user.trialEndsAt !== null);
    });
  }

  function applyVerifiedStripeEvent(rawEvent, {providerSubscription, providerInvoices = [], providerInvoiceTimes = {}, recoveredLegacy = false, assertLease = () => {}} = {}) {
    // The HTTP integration must verify Stripe's raw-body signature before it
    // calls this state core. A redirect or client-provided session ID is never
    // payment evidence and must not reach this function as an event.
    const event = normalizeEvent(rawEvent);
    return immediate(db, () => {
      assertLease();
      const existing = receiptById.get(event.id);
      if (existing) {
        if (existing.eventDigest !== event.digest && existing.eventDigest !== event.legacyDigest) {
          throw billingError('EVENT_ID_CONFLICT', 'This Stripe event ID was already received with different state data.');
        }
        return parseStoredJson(existing.resultJson);
      }

      let context = resolveAccountContext(event);
      const account = context.account;
      const processedAt = now().toISOString();
      if (context.relationship === 'TERMINAL') {
        const terminalOutcome=event.type==='customer.subscription.deleted' && account.stripeSubscriptionId===event.subscriptionId ? 'APPLIED' : 'IGNORED_TERMINAL_SUBSCRIPTION';
        const result = stateResult(terminalOutcome, account, false);
        insertReceipt.run(
          event.id, account.ownerId, event.type, event.objectId, event.created,
          event.digest, terminalOutcome,
          JSON.stringify(event.sanitizedReceipt), JSON.stringify(result), processedAt
        );
        return result;
      }

      // Invoice lines are historical charge/credit evidence, never plan authority.
      let configured;
      if (event.type.startsWith('invoice.')) {
        for (const price of event.priceIds) if (!priceConfiguration.prices.has(price) && !priceConfiguration.supplemental.has(price)) throw billingError('UNRECOGNIZED_PRICE','The invoice contains an unconfigured price.');
        configured={plan:account.plan,priceId:account.stripePriceId};
      } else configured=resolveConfiguredPlan(event.priceIds,account,true);
      const duplicateSession=usageOwnerQuery(db)(`SELECT id FROM billingCheckoutRequests WHERE ownerId=? AND stripeCustomerId=? AND
        ((stripeSessionId=? AND stripePriceId=?) OR (stripeSubscriptionId=? AND reconciliationError IS NOT NULL)) LIMIT 1`).get(account.ownerId,event.customerId,event.objectId,configured.priceId,event.subscriptionId);
      if (context.relationship==='REPLACEMENT_CANDIDATE' && account.planStatus!=='canceled' && duplicateSession) {
        if (event.type.startsWith('checkout.session.')) {
          consumeCheckout(context,event,configured,processedAt);
          usageOwnerQuery(db)("UPDATE billingCheckoutRequests SET reconciliationError='DUPLICATE_SUBSCRIPTION_REQUIRES_REVIEW' WHERE ownerId=? AND id=?").run(account.ownerId,duplicateSession.id);
        }
        const result=stateResult('QUARANTINED_DUPLICATE_SUBSCRIPTION',account,false);
        insertReceipt.run(event.id,account.ownerId,event.type,event.objectId,event.created,event.digest,result.outcome,JSON.stringify(event.sanitizedReceipt),JSON.stringify(result),processedAt);
        return result;
      }
      context=authorizeRelationship(context,event,configured);
      let transitionAccount=account;
      if (context.relationship==='REPLACEMENT') {
        ensureTerminalHistory(account,account.stripeSubscriptionId,context.deleted,processedAt);
        transitionAccount=replacementBase(account);
      }
      ensureCurrentHistory(transitionAccount,event,processedAt);
      for (const invoice of providerInvoices) evidence.recordInvoice({ownerId:account.ownerId,customerId:event.customerId,subscriptionId:event.subscriptionId,object:invoice,paid:invoice.status==='paid',created:providerInvoiceTimes[invoice.id] ?? event.created});
      if (recoveredLegacy) usageOwnerQuery(db)("DELETE FROM billingRecoveryHolds WHERE ownerId=? AND stripeSubscriptionId=? AND reason='LEGACY_DEBT_REQUIRES_RECONCILIATION'").run(account.ownerId,event.subscriptionId);
      // Replacement creation cannot predate the server-created Checkout.
      const activation=completedCheckoutBySubscription.get(account.ownerId,event.customerId,event.subscriptionId);
      const tooEarly=event.type.startsWith('customer.subscription.') && activation && event.created*1000<Date.parse(activation.providerCreatedAt);
      const transition=tooEarly ? {after:transitionAccount,stale:true} : applyTransition(transitionAccount,event,configured,providerSubscription);
      const {after,stale}=transition;
      const changed=transitionChanged(account,after);
      const preserveOrdering=Number.isInteger(account.lastStripeEventCreatedAt) && event.created<account.lastStripeEventCreatedAt;
      writeState(account,after,event,processedAt,changed,{preserveOrdering});
      if (after.planStatus==='canceled') ensureTerminalHistory(account,event.subscriptionId,{stripeEventId:event.id,eventCreatedAt:event.created,processedAt},processedAt);
      consumeCheckout(context,event,configured,processedAt);
      const receiptOutcome=stale && !changed?'IGNORED_STALE':'APPLIED';
      const result=stateResult(receiptOutcome,after,changed);
      insertReceipt.run(
        event.id, account.ownerId, event.type, event.objectId, event.created,
        event.digest, receiptOutcome, JSON.stringify(event.sanitizedReceipt),
        JSON.stringify(result), processedAt
      );
      return result;
    });
  }

  async function reconcileVerifiedStripeEvent(rawEvent, stripeClient) {
    const event=normalizeEvent(rawEvent);
    const prior=receiptById.get(event.id);
    if (prior) return applyVerifiedStripeEvent(rawEvent); // also detects changed-ID retries
    let context=resolveAccountContext(event);
    // Accounts predating the annual receipt ledger need the paid base invoice
    // retrieved before cancellation can preserve their purchased year.
    const annualCancellation=event.type==='customer.subscription.deleted'&&
      [context.account.stripePriceId,...event.priceIds].some(id=>priceConfiguration.prices.get(id)?.interval==='annual');
    if (context.relationship==='TERMINAL' || event.type==='customer.subscription.deleted'&&!annualCancellation) return applyVerifiedStripeEvent(rawEvent);
    return withBillingLease(db,context.account.ownerId,async assertLease=>{
      if (receiptById.get(event.id)) return applyVerifiedStripeEvent(rawEvent,{assertLease});
      context=resolveAccountContext(event);
      if (context.relationship==='TERMINAL') return applyVerifiedStripeEvent(rawEvent,{assertLease});
      const known=evidence.readSubscription(context.account.ownerId,event.subscriptionId);
      const recoveryHold=usageOwnerQuery(db)('SELECT reason FROM billingRecoveryHolds WHERE ownerId=? AND stripeSubscriptionId=?').get(context.account.ownerId,event.subscriptionId);
      // Checkout supplies session/payment evidence only. A strictly newer signed
      // subscription already carries authoritative items. Equal-second conflicts
      // require retrieval, never a type/ID tie breaker. Read this decision under
      // the lease as well, so another worker cannot race the fast path.
      const stored=usageOwnerQuery(db)('SELECT eventCreatedAt FROM billingSubscriptionEvidence WHERE ownerId=? AND stripeSubscriptionId=?').get(context.account.ownerId,event.subscriptionId);
      if (!recoveryHold && !annualCancellation && ((event.type.startsWith('checkout.session.') && (known || context.relationship==='UNBOUND')) ||
          (event.type.startsWith('customer.subscription.') && (!known || event.created>stored.eventCreatedAt)))) return applyVerifiedStripeEvent(rawEvent,{assertLease});
      const subscription=await billingProviderRead(()=>stripeClient.subscriptions.retrieve(event.subscriptionId,{expand:['latest_invoice']},BILLING_PROVIDER_OPTIONS));
      assertLease();
      if (subscription?.id!==event.subscriptionId || billingReference(subscription.customer)!==event.customerId) throw billingError('CROSS_ACCOUNT_IDS','Retrieved subscription does not match the event.');
      const invoices=[], providerInvoiceTimes={};
      if (event.type==='invoice.payment_failed') {
        const invoice=await billingProviderRead(()=>stripeClient.invoices.retrieve(event.objectId,{},BILLING_PROVIDER_OPTIONS));
        assertLease();
        if (invoice?.id!==event.objectId || !['open','paid'].includes(invoice.status)) throw billingError('BILLING_PROVIDER_MISMATCH','Current invoice is unavailable.');
        invoices.push(invoice);
      }
      let recoveredLegacy=false;
      const hold=usageOwnerQuery(db)('SELECT reason FROM billingRecoveryHolds WHERE ownerId=? AND stripeSubscriptionId=?').get(context.account.ownerId,event.subscriptionId);
      if (hold?.reason==='LEGACY_DEBT_REQUIRES_RECONCILIATION') {
        const failures=usageOwnerQuery(db)(`SELECT objectId,MIN(eventCreatedAt) AS failedAt FROM billingEventReceipts WHERE ownerId=? AND eventType='invoice.payment_failed'
          AND eventCreatedAt>=? AND outcome='APPLIED' GROUP BY objectId LIMIT 101`).all(context.account.ownerId,(context.account.paymentFailedAt ? Math.floor(Date.parse(context.account.paymentFailedAt)/1000) : 0));
        if (failures.length && failures.length<=100) {
          for (const failure of failures) {
            const invoice=await billingProviderRead(()=>stripeClient.invoices.retrieve(failure.objectId,{},BILLING_PROVIDER_OPTIONS));
            assertLease();
            if (billingReference(invoice?.customer)!==event.customerId) throw billingError('CROSS_ACCOUNT_IDS','Legacy invoice customer mismatch.');
            if (billingInvoiceSubscription(invoice)===event.subscriptionId && ['open','paid'].includes(invoice.status)) {invoices.push(invoice);providerInvoiceTimes[invoice.id]=failure.failedAt;}
            else throw billingError('BILLING_RECOVERY_REQUIRED','Legacy debt cannot be attributed safely.');
          }
          recoveredLegacy=true;
        }
      }
      assertLease();
      return applyVerifiedStripeEvent(rawEvent,{providerSubscription:subscription,providerInvoices:invoices,providerInvoiceTimes,recoveredLegacy,assertLease});
    },{clock:now});
  }

  function suspendExpiredGracePeriods({ at = now(), limit = 100, ownerId = null } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('Invalid grace sweep batch size.');
    const checkedAt = instant(at, 'Grace-period check time');
    const checkedAtIso = checkedAt.toISOString();
    return immediate(db, () => {
      const rows = usageOwnerQuery(db)(`
        SELECT billing.*, users.plan, users.planStatus, users.trialEndsAt,
          users.role AS userRole
        FROM billingAccounts AS billing
        JOIN users ON users.id = billing.ownerId
        WHERE users.planStatus IN ('payment_failed', 'past_due')
          AND billing.graceEndsAt IS NOT NULL
          AND billing.graceEndsAt <= ?
        AND (? IS NULL OR billing.ownerId = ?)
        ORDER BY billing.graceEndsAt, billing.ownerId LIMIT ?
      `).all(checkedAtIso, ownerId, ownerId, limit);
      for (const row of rows) {
        const after = { ...row, planStatus: 'suspended', updatedAt: checkedAtIso };
        usageOwnerQuery(db)('UPDATE billingAccounts SET updatedAt = ? WHERE ownerId = ?').run(checkedAtIso, row.ownerId);
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
    reconcileVerifiedStripeEvent,
    suspendExpiredGracePeriods
  };
}
