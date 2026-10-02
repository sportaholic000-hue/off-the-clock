export function installCallUsageSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS voiceUsagePeriods (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      stripeSubscriptionId TEXT NOT NULL,
      stripeCustomerId TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('TRIAL','PAID')),
      plan TEXT NOT NULL CHECK (plan IN ('Operator','QuoteDone')),
      includedMinutes INTEGER NOT NULL CHECK (includedMinutes IN (60,300,1200)),
      startMs INTEGER NOT NULL,
      endMs INTEGER NOT NULL CHECK (endMs > startMs),
      stripeUsageItemId TEXT,
      currency TEXT,
      sourceEventId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE (ownerId, stripeSubscriptionId, kind, startMs),
      FOREIGN KEY (ownerId) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS voice_usage_period_lookup ON voiceUsagePeriods(ownerId,startMs,endMs);
    CREATE TABLE IF NOT EXISTS voiceUsageAllowanceRevisions (
      id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, periodId TEXT NOT NULL,
      includedMinutes INTEGER NOT NULL CHECK (includedMinutes IN (300,1200)),
      sourceEventId TEXT NOT NULL, createdAt TEXT NOT NULL,
      UNIQUE(ownerId,periodId,sourceEventId),
      FOREIGN KEY(ownerId) REFERENCES users(id), FOREIGN KEY(periodId) REFERENCES voiceUsagePeriods(id)
    );
    CREATE TRIGGER IF NOT EXISTS voice_usage_allowance_immutable BEFORE UPDATE ON voiceUsageAllowanceRevisions
      BEGIN SELECT RAISE(ABORT,'Usage allowance revisions are immutable'); END;
    CREATE TABLE IF NOT EXISTS voiceUsageEvidenceReceipts (
      ownerId TEXT NOT NULL, sourceEventId TEXT NOT NULL, reportDigest TEXT NOT NULL, createdAt TEXT NOT NULL,
      PRIMARY KEY(ownerId,sourceEventId), FOREIGN KEY(ownerId) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS callUsageRecords (
      callId TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      answeredStartMs INTEGER NOT NULL,
      answeredEndMs INTEGER NOT NULL CHECK (answeredEndMs >= answeredStartMs),
      durationMs INTEGER NOT NULL CHECK (durationMs >= 0),
      spamFiltered INTEGER NOT NULL CHECK (spamFiltered IN (0,1)),
      exclusion TEXT CHECK (exclusion IN ('SPAM','AI_FALLBACK')),
      minutesBilled INTEGER NOT NULL CHECK (minutesBilled >= 0),
      reportDigest TEXT NOT NULL,
      recordedAt TEXT NOT NULL,
      CHECK ((exclusion IS NULL) OR minutesBilled = 0),
      FOREIGN KEY (ownerId) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS call_usage_owner_period ON callUsageRecords(ownerId,answeredStartMs);
    CREATE TRIGGER IF NOT EXISTS call_usage_immutable BEFORE UPDATE ON callUsageRecords
      BEGIN SELECT RAISE(ABORT,'Call usage reports are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS voice_usage_period_immutable BEFORE UPDATE ON voiceUsagePeriods
      BEGIN SELECT RAISE(ABORT,'Verified usage periods are immutable'); END;
    CREATE TABLE IF NOT EXISTS voiceUsageSubmissions (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      periodId TEXT NOT NULL,
      stripeCustomerId TEXT NOT NULL,
      stripeSubscriptionId TEXT NOT NULL,
      stripeUsageItemId TEXT NOT NULL,
      units INTEGER NOT NULL CHECK (units > 0),
      overageUnitCents INTEGER NOT NULL CHECK (overageUnitCents = 35),
      eventTimestamp INTEGER NOT NULL,
      eventName TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING','SENDING','RETRY','ACCEPTED','REVIEW')),
      attempts INTEGER NOT NULL DEFAULT 0,
      firstAttemptMs INTEGER,
      nextAttemptMs INTEGER NOT NULL,
      leaseUntilMs INTEGER,
      lastErrorCode TEXT,
      acceptedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (ownerId) REFERENCES users(id),
      FOREIGN KEY (periodId) REFERENCES voiceUsagePeriods(id)
    );
    CREATE INDEX IF NOT EXISTS voice_usage_submission_work ON voiceUsageSubmissions(status,nextAttemptMs);
    CREATE TABLE IF NOT EXISTS voiceUsageItemProvisioning (
      ownerId TEXT NOT NULL, stripeSubscriptionId TEXT NOT NULL, stripeCustomerId TEXT NOT NULL,
      stripePriceId TEXT NOT NULL, idempotencyKey TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('PENDING','SENDING','RETRY','READY','REVIEW')),
      firstAttemptMs INTEGER, attempts INTEGER NOT NULL DEFAULT 0, leaseUntilMs INTEGER,
      nextAttemptMs INTEGER NOT NULL, lastErrorCode TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
      PRIMARY KEY(ownerId,stripeSubscriptionId), FOREIGN KEY(ownerId) REFERENCES users(id)
    );
    CREATE TRIGGER IF NOT EXISTS voice_usage_submission_identity_immutable
      BEFORE UPDATE OF id,ownerId,periodId,stripeCustomerId,stripeSubscriptionId,stripeUsageItemId,
        units,overageUnitCents,eventTimestamp,eventName ON voiceUsageSubmissions
      BEGIN SELECT RAISE(ABORT,'Usage submission identity is immutable'); END;
  `);
}
