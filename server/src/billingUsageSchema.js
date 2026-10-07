export function installBillingUsageSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS billingAnnualTerms (
    invoiceId TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id), stripeSubscriptionId TEXT NOT NULL,
    plan TEXT NOT NULL, startAt TEXT NOT NULL, endAt TEXT NOT NULL, amountPaidCents INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS billingUsagePeriods (
    id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id),
    stripeCustomerId TEXT NOT NULL, stripeSubscriptionId TEXT NOT NULL, stripePriceId TEXT NOT NULL,
    plan TEXT NOT NULL CHECK(plan IN ('Operator','QuoteDone')), billingInterval TEXT NOT NULL CHECK(billingInterval IN ('monthly','annual')),
    startAt TEXT NOT NULL, endAt TEXT NOT NULL, termStartAt TEXT NOT NULL, termEndAt TEXT NOT NULL,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
    UNIQUE(ownerId,stripeSubscriptionId,startAt), CHECK(endAt>startAt)
  );
  CREATE TABLE IF NOT EXISTS billingUsageCharges (
    periodId TEXT PRIMARY KEY REFERENCES billingUsagePeriods(id), ownerId TEXT NOT NULL REFERENCES users(id),
    amountCents INTEGER NOT NULL CHECK(amountCents>0), minutesUsed INTEGER NOT NULL, usageDigest TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SUBMITTED','PAID','REVIEW')),
    providerInvoiceId TEXT, providerItemId TEXT, currency TEXT,
    operationsJson TEXT NOT NULL DEFAULT '{}', lastError TEXT, nextAttemptAt TEXT NOT NULL,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS billingMinuteAlerts (
    id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id), periodId TEXT NOT NULL REFERENCES billingUsagePeriods(id),
    threshold INTEGER NOT NULL CHECK(threshold IN (60,30,0)), message TEXT NOT NULL, createdAt TEXT NOT NULL,
    UNIQUE(ownerId,periodId,threshold)
  );
  CREATE TABLE IF NOT EXISTS ownerEmailDeliveries (
    id TEXT PRIMARY KEY REFERENCES outboxEvents(id), ownerId TEXT NOT NULL REFERENCES users(id),
    messageJson TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','ACCEPTED','DELIVERED','REVIEW','BOUNCED')),
    providerId TEXT, firstAttemptAt TEXT, nextAttemptAt TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    leaseToken TEXT, leaseUntil TEXT, lastError TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS billing_usage_period_owner ON billingUsagePeriods(ownerId,startAt,endAt);
  CREATE INDEX IF NOT EXISTS owner_email_due ON ownerEmailDeliveries(ownerId,nextAttemptAt);
  CREATE INDEX IF NOT EXISTS billing_usage_charge_due ON billingUsageCharges(ownerId,nextAttemptAt);`);
}
