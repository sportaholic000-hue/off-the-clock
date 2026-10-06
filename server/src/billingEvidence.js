// Durable billing facts. Only verified webhook/provider objects enter this module.
// No event-type priority: subscriptions describe entitlement, invoices describe debt.
export const billingReference = value => typeof value === 'string' ? value : value?.id || null;
export const billingInvoiceSubscription = invoice => billingReference(invoice.subscription) || billingReference(invoice.parent?.subscription_details?.subscription);
export const billingIso = seconds => Number.isInteger(seconds) && seconds >= 0 ? new Date(seconds * 1000).toISOString() : null;
export const billingPrice = line => billingReference(line.price) || billingReference(line.pricing?.price_details?.price);

export function subscriptionFacts(object, priceConfiguration, fail) {
  if (!Array.isArray(object.items?.data) || object.items.has_more === true) throw fail('MISSING_PRICE', 'A complete subscription item list is required.');
  const bases = [];
  for (const item of object.items.data) {
    const id = billingPrice(item), config = priceConfiguration.prices.get(id);
    if (!config && !priceConfiguration.supplemental.has(id)) throw fail('UNRECOGNIZED_PRICE', 'The subscription contains an unconfigured price.');
    if (config?.kind === 'base') bases.push({item, priceId:id, plan:config.plan});
  }
  if (bases.length !== 1) throw fail(bases.length ? 'AMBIGUOUS_PRICE' : 'MISSING_PRICE', 'Exactly one configured base subscription item is required.');
  const {item, priceId, plan} = bases[0];
  const start = item.current_period_start ?? object.current_period_start ?? null;
  const end = item.current_period_end ?? object.current_period_end ?? null;
  if ((start !== null && !billingIso(start)) || (end !== null && !billingIso(end)) || (start !== null && end !== null && end <= start)) throw fail('INVALID_PERIOD', 'Subscription period boundaries are invalid.');
  return {priceId, plan, status:object.status, trialStart:object.trial_start ?? object.created ?? null,
    trialEnd:object.trial_end ?? null, periodStart:start, periodEnd:end,
    cancelAtPeriodEnd:typeof object.cancel_at_period_end === 'boolean' ? object.cancel_at_period_end : null,
    paymentMethodId:billingReference(object.default_payment_method), latestInvoiceId:billingReference(object.latest_invoice)};
}

export function createBillingEvidence({db, fail}) {
  const sub = db.prepare('SELECT * FROM billingSubscriptionEvidence WHERE ownerId=? AND stripeSubscriptionId=?');
  function checkIdentity(row, ownerId, customerId, subscriptionId) {
    if (row && (row.ownerId !== ownerId || row.stripeCustomerId !== customerId || row.stripeSubscriptionId !== subscriptionId)) throw fail('CROSS_ACCOUNT_IDS', 'Billing evidence belongs to a different account or subscription.');
  }
  function recordSubscription({ownerId, customerId, subscriptionId, facts, created, provider=false}) {
    const global = db.prepare('SELECT * FROM billingSubscriptionEvidence WHERE stripeSubscriptionId=?').get(subscriptionId);
    checkIdentity(global,ownerId,customerId,subscriptionId);
    let ambiguous = 0, next = facts;
    if (global) {
      const prior = JSON.parse(global.stateJson);
      if (!provider && created < global.eventCreatedAt) return {facts:prior, ambiguous:global.ambiguous, stale:true};
      if (!provider && created === global.eventCreatedAt) {
        // Card attachment is independent affirmative evidence, not settlement.
        const comparable = f => JSON.stringify({...f,paymentMethodId:null});
        ambiguous = global.ambiguous || (comparable(prior) !== comparable(facts) ? 1 : 0);
        next = {...facts, paymentMethodId:facts.paymentMethodId || prior.paymentMethodId};
      }
    }
    db.prepare(`INSERT INTO billingSubscriptionEvidence (stripeSubscriptionId,ownerId,stripeCustomerId,eventCreatedAt,stateJson,ambiguous)
      VALUES(?,?,?,?,?,?) ON CONFLICT(stripeSubscriptionId) DO UPDATE SET eventCreatedAt=excluded.eventCreatedAt,stateJson=excluded.stateJson,ambiguous=excluded.ambiguous
      WHERE billingSubscriptionEvidence.ownerId=excluded.ownerId AND billingSubscriptionEvidence.stripeCustomerId=excluded.stripeCustomerId`)
      .run(subscriptionId,ownerId,customerId,Math.max(created,global?.eventCreatedAt ?? 0),JSON.stringify(next),ambiguous);
    return {facts:next,ambiguous,stale:false};
  }
  function readSubscription(ownerId,subscriptionId) {
    const row = sub.get(ownerId,subscriptionId);
    return row ? {facts:JSON.parse(row.stateJson),ambiguous:row.ambiguous} : null;
  }
  function recordInvoice({ownerId,customerId,subscriptionId,object,paid,created}) {
    if (!object.id || billingReference(object.customer)!==customerId || billingInvoiceSubscription(object)!==subscriptionId) throw fail('CROSS_ACCOUNT_IDS','Invoice ownership does not match the subscription.');
    const prior = db.prepare('SELECT * FROM billingInvoiceEvidence WHERE stripeInvoiceId=?').get(object.id);
    checkIdentity(prior,ownerId,customerId,subscriptionId);
    if (paid && object.status !== 'paid') throw fail('INVALID_EVENT','A paid invoice must have paid status.');
    if (paid && (!Number.isSafeInteger(object.amount_paid) || object.amount_paid < 0)) throw fail('INVALID_EVENT','Paid invoice amount must be nonnegative integer cents.');
    // A settled invoice cannot become unpaid through a delayed failure. Refunds
    // and credit/write-off policy are deliberately outside this repair batch.
    const settled = paid || prior?.status === 'PAID';
    const firstFailed = !paid ? Math.min(created,prior?.failedAt ?? created) : prior?.failedAt ?? null;
    db.prepare(`INSERT INTO billingInvoiceEvidence (stripeInvoiceId,ownerId,stripeCustomerId,stripeSubscriptionId,status,failedAt,paidAt,amountPaid,periodStart,periodEnd)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(stripeInvoiceId) DO UPDATE SET status=excluded.status,failedAt=excluded.failedAt,paidAt=excluded.paidAt,amountPaid=excluded.amountPaid,periodStart=excluded.periodStart,periodEnd=excluded.periodEnd
      WHERE billingInvoiceEvidence.ownerId=excluded.ownerId AND billingInvoiceEvidence.stripeSubscriptionId=excluded.stripeSubscriptionId`)
      .run(object.id,ownerId,customerId,subscriptionId,settled?'PAID':'FAILED',firstFailed,paid ? (prior?.paidAt ?? created) : prior?.paidAt ?? null,
        paid?object.amount_paid:prior?.amountPaid ?? null,object.period_start ?? prior?.periodStart ?? null,object.period_end ?? prior?.periodEnd ?? null);
    return {stale:!paid && settled};
  }
  function debt(ownerId,subscriptionId) {
    return db.prepare("SELECT MIN(failedAt) AS failedAt, COUNT(*) AS count FROM billingInvoiceEvidence WHERE ownerId=? AND stripeSubscriptionId=? AND status='FAILED'").get(ownerId,subscriptionId);
  }
  return {recordSubscription,readSubscription,recordInvoice,debt};
}
