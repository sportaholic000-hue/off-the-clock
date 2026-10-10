export function installBillingUsageSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS billingAnnualTerms (
    invoiceId TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id), stripeSubscriptionId TEXT NOT NULL,
    plan TEXT NOT NULL, startAt TEXT NOT NULL, endAt TEXT NOT NULL, amountPaidCents INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS billingUsagePeriods (
    id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id),
    stripeCustomerId TEXT NOT NULL, stripeSubscriptionId TEXT NOT NULL, stripePriceId TEXT NOT NULL,
    plan TEXT NOT NULL CHECK(plan IN ('Starter','Operator','QuoteDone')), billingInterval TEXT NOT NULL CHECK(billingInterval IN ('monthly','annual')),
    startAt TEXT NOT NULL, endAt TEXT NOT NULL, termStartAt TEXT NOT NULL, termEndAt TEXT NOT NULL,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
    UNIQUE(ownerId,stripeSubscriptionId,startAt), CHECK(endAt>startAt)
  );
  CREATE TABLE IF NOT EXISTS billingUsageCharges (
    periodId TEXT PRIMARY KEY REFERENCES billingUsagePeriods(id), ownerId TEXT NOT NULL REFERENCES users(id),
    amountCents INTEGER NOT NULL CHECK(amountCents>0), minutesUsed INTEGER NOT NULL, usageDigest TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SUBMITTED','PAID','REVIEW')),
    providerInvoiceId TEXT, providerItemId TEXT, currency TEXT,
    operationsJson TEXT NOT NULL DEFAULT '{}', collectionStoppedAt TEXT, lastError TEXT, nextAttemptAt TEXT NOT NULL,
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
    leaseToken TEXT, leaseUntil TEXT, lastError TEXT, suppressedAt TEXT, unpaidInvoiceId TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS billing_usage_period_owner ON billingUsagePeriods(ownerId,startAt,endAt);
  CREATE INDEX IF NOT EXISTS owner_email_due ON ownerEmailDeliveries(ownerId,nextAttemptAt);
  CREATE INDEX IF NOT EXISTS billing_usage_charge_due ON billingUsageCharges(ownerId,nextAttemptAt);`);
  if(!db.prepare('PRAGMA table_info(billingUsageCharges)').all().some(column=>column.name==='collectionStoppedAt'))db.exec('ALTER TABLE billingUsageCharges ADD COLUMN collectionStoppedAt TEXT');
  if(!db.prepare('PRAGMA table_info(billingUsageCharges)').all().some(column=>column.name==='id')){
    // Preserve old monthly invoice identities and idempotency keys. New rows
    // allocate a monotonically increasing installment within the same month.
    db.exec('SAVEPOINT usage_installments');
    try { db.exec(`
      CREATE TABLE billingUsageInstallments (
        id TEXT PRIMARY KEY NOT NULL, periodId TEXT NOT NULL REFERENCES billingUsagePeriods(id),
        ownerId TEXT NOT NULL REFERENCES users(id), sequence INTEGER NOT NULL CHECK(sequence>0),
        amountCents INTEGER NOT NULL CHECK(amountCents>0), minutesUsed INTEGER NOT NULL, usageDigest TEXT NOT NULL, usageProofJson TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SUBMITTED','PAID','REVIEW')),
        providerInvoiceId TEXT, providerItemId TEXT, currency TEXT, operationsJson TEXT NOT NULL DEFAULT '{}',
        collectionStoppedAt TEXT, lastError TEXT, nextAttemptAt TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        UNIQUE(ownerId,periodId,sequence));
      INSERT INTO billingUsageInstallments SELECT periodId,periodId,ownerId,1,amountCents,minutesUsed,usageDigest,NULL,
        status,providerInvoiceId,providerItemId,currency,operationsJson,collectionStoppedAt,lastError,nextAttemptAt,createdAt,updatedAt FROM billingUsageCharges;
      DROP TABLE billingUsageCharges;
      ALTER TABLE billingUsageInstallments RENAME TO billingUsageCharges;
      CREATE INDEX billing_usage_charge_due ON billingUsageCharges(ownerId,nextAttemptAt);`);
    } catch(error) {
      db.exec('ROLLBACK TO usage_installments; RELEASE usage_installments');throw error;
    }
    db.exec('RELEASE usage_installments');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS billingTrialMinuteAlerts (
    id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id), periodId TEXT NOT NULL,
    threshold INTEGER NOT NULL CHECK(threshold IN (30,0)), message TEXT NOT NULL, createdAt TEXT NOT NULL,
    UNIQUE(ownerId,periodId,threshold));`);
  if(!db.prepare('PRAGMA table_info(ownerEmailDeliveries)').all().some(column=>column.name==='suppressedAt'))db.exec('ALTER TABLE ownerEmailDeliveries ADD COLUMN suppressedAt TEXT');
  if(!db.prepare('PRAGMA table_info(ownerEmailDeliveries)').all().some(column=>column.name==='unpaidInvoiceId'))db.exec('ALTER TABLE ownerEmailDeliveries ADD COLUMN unpaidInvoiceId TEXT');
}
