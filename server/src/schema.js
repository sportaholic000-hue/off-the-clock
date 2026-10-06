export const CREATE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    ownerId TEXT,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    firstName TEXT NOT NULL,
    businessName TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'Operator',
    planStatus TEXT NOT NULL DEFAULT 'pending_payment',
    trialEndsAt TEXT,
    paymentFailedAt TEXT,
    emailVerifiedAt TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    role TEXT NOT NULL CHECK (role IN ('owner', 'staff', 'admin')),
    createdAt TEXT NOT NULL,
    CHECK (
      (role = 'staff' AND ownerId IS NOT NULL) OR
      (role IN ('owner', 'admin') AND ownerId IS NULL)
    ),
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS billingAccounts (
    ownerId TEXT PRIMARY KEY,
    stripeCustomerId TEXT NOT NULL UNIQUE,
    stripeSubscriptionId TEXT UNIQUE,
    stripePriceId TEXT,
    paymentMethodVerifiedAt TEXT,
    paymentFailedAt TEXT,
    graceEndsAt TEXT,
    currentPeriodEndAt TEXT,
    currentPeriodStartAt TEXT,
    cancelAtPeriodEnd INTEGER NOT NULL DEFAULT 0 CHECK (cancelAtPeriodEnd IN (0, 1)),
    canceledAt TEXT,
    lastStripeEventCreatedAt INTEGER,
    lastStripeEventRank INTEGER,
    lastStripeEventId TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS billingEventReceipts (
    stripeEventId TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    eventType TEXT NOT NULL,
    objectId TEXT NOT NULL,
    eventCreatedAt INTEGER NOT NULL,
    eventDigest TEXT NOT NULL,
    outcome TEXT NOT NULL,
    sanitizedReceiptJson TEXT NOT NULL,
    resultJson TEXT NOT NULL,
    processedAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS billingSubscriptionHistory (
    stripeSubscriptionId TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    stripeCustomerId TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('CURRENT', 'TERMINAL')),
    firstEventId TEXT NOT NULL,
    firstEventCreatedAt INTEGER NOT NULL,
    terminalEventId TEXT,
    terminalEventCreatedAt INTEGER,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    CHECK (
      (status = 'CURRENT' AND terminalEventId IS NULL AND terminalEventCreatedAt IS NULL) OR
      (status = 'TERMINAL' AND terminalEventId IS NOT NULL AND terminalEventCreatedAt IS NOT NULL)
    ),
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS billingCheckoutRequests (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    idempotencyKeyHash TEXT NOT NULL,
    requestDigest TEXT NOT NULL,
    plan TEXT NOT NULL CHECK (plan IN ('Operator', 'QuoteDone', 'Scale')),
    billingInterval TEXT NOT NULL CHECK (billingInterval IN ('monthly', 'annual')),
    stripePriceId TEXT NOT NULL,
    stripeCustomerId TEXT NOT NULL,
    providerIdempotencyKey TEXT NOT NULL,
    successUrl TEXT NOT NULL,
    cancelUrl TEXT NOT NULL,
    integrationIdentifier TEXT NOT NULL,
    stripeSessionId TEXT,
    stripeSubscriptionId TEXT,
    sessionUrlCiphertext TEXT,
    sessionUrlIv TEXT,
    sessionUrlTag TEXT,
    sessionUrlKeyVersion TEXT,
    status TEXT NOT NULL CHECK (status IN ('CREATING', 'OPEN', 'COMPLETED', 'FAILED', 'EXPIRED')),
    attemptCount INTEGER NOT NULL DEFAULT 1 CHECK (attemptCount >= 1),
    leaseExpiresAt TEXT NOT NULL,
    expiresAt TEXT,
    providerCreatedAt TEXT,
    providerExpiredVerifiedAt TEXT,
    reconciliationError TEXT,
    consumedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE (ownerId, idempotencyKeyHash),
    CHECK (
      (status = 'CREATING' AND stripeSessionId IS NULL AND stripeSubscriptionId IS NULL AND
        sessionUrlCiphertext IS NULL AND sessionUrlIv IS NULL AND sessionUrlTag IS NULL AND
        sessionUrlKeyVersion IS NULL AND expiresAt IS NULL AND providerCreatedAt IS NULL AND
        consumedAt IS NULL) OR
      (status = 'OPEN' AND stripeSessionId IS NOT NULL AND
        sessionUrlCiphertext IS NOT NULL AND sessionUrlIv IS NOT NULL AND sessionUrlTag IS NOT NULL AND
        sessionUrlKeyVersion IS NOT NULL AND expiresAt IS NOT NULL AND providerCreatedAt IS NOT NULL AND
        consumedAt IS NULL) OR
      (status = 'EXPIRED' AND stripeSessionId IS NOT NULL AND stripeSubscriptionId IS NULL AND
        expiresAt IS NOT NULL AND providerCreatedAt IS NOT NULL AND consumedAt IS NULL) OR
      (status IN ('COMPLETED', 'FAILED') AND stripeSessionId IS NOT NULL AND
        stripeSubscriptionId IS NOT NULL AND expiresAt IS NOT NULL AND
        providerCreatedAt IS NOT NULL AND consumedAt IS NOT NULL)
    ),
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS billingSubscriptionEvidence (
    stripeSubscriptionId TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id),
    stripeCustomerId TEXT NOT NULL, eventCreatedAt INTEGER NOT NULL,
    stateJson TEXT NOT NULL, ambiguous INTEGER NOT NULL DEFAULT 0 CHECK(ambiguous IN (0,1))
  )`,
  `CREATE TABLE IF NOT EXISTS billingInvoiceEvidence (
    stripeInvoiceId TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id),
    stripeCustomerId TEXT NOT NULL, stripeSubscriptionId TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('FAILED','PAID')), failedAt INTEGER, paidAt INTEGER,
    amountPaid INTEGER, periodStart INTEGER, periodEnd INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS billingOperationLeases (
    ownerId TEXT PRIMARY KEY REFERENCES users(id), token TEXT NOT NULL, expiresAt TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS billingRecoveryHolds (
    ownerId TEXT NOT NULL REFERENCES users(id), stripeSubscriptionId TEXT NOT NULL,
    reason TEXT NOT NULL, createdAt TEXT NOT NULL, PRIMARY KEY(ownerId,stripeSubscriptionId)
  )`,
  `CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    callSid TEXT,
    accountSid TEXT,
    streamSid TEXT,
    callerNumber TEXT,
    destinationNumber TEXT,
    duration INTEGER,
    status TEXT,
    outcome TEXT,
    transcriptJson TEXT,
    summaryText TEXT,
    urgency TEXT,
    spamFiltered INTEGER NOT NULL DEFAULT 0,
    minutesBilled INTEGER NOT NULL DEFAULT 0,
    aiInputTokens INTEGER NOT NULL DEFAULT 0,
    aiOutputTokens INTEGER NOT NULL DEFAULT 0,
    aiEstimatedCostMicros INTEGER NOT NULL DEFAULT 0,
    failureCode TEXT,
    completedAt TEXT,
    updatedAt TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    callId TEXT,
    customerName TEXT,
    callerNumber TEXT,
    describedService TEXT,
    collectedInputsJson TEXT,
    type TEXT,
    status TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id),
    FOREIGN KEY (callId) REFERENCES calls(id)
  )`,
  `CREATE TABLE IF NOT EXISTS quoteRequests (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    callId TEXT,
    describedService TEXT,
    estimatedValue INTEGER,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id),
    FOREIGN KEY (callId) REFERENCES calls(id)
  )`,
  `CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    callId TEXT,
    quoteId TEXT,
    serviceType TEXT,
    customerInputsJson TEXT,
    resultJson TEXT,
    tierChosen TEXT,
    status TEXT,
    finalInvoiceAmount INTEGER,
    pageToken TEXT,
    pageExpiresAt TEXT,
    callerType TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id),
    FOREIGN KEY (callId) REFERENCES calls(id)
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    phoneE164 TEXT,
    name TEXT,
    address TEXT,
    notesJson TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    customerId TEXT,
    quoteId TEXT,
    serviceType TEXT,
    bookingMode TEXT,
    datetime TEXT,
    durationMinutes INTEGER,
    status TEXT,
    depositRequested INTEGER NOT NULL DEFAULT 0,
    depositPaid INTEGER NOT NULL DEFAULT 0,
    bookingIntentId TEXT,
    holdId TEXT,
    provider TEXT,
    providerCalendarId TEXT,
    providerEventId TEXT,
    providerEventStatus TEXT,
    startAtUtc TEXT,
    endAtUtc TEXT,
    lockStartAtUtc TEXT,
    lockEndAtUtc TEXT,
    timezone TEXT,
    policyRevision TEXT,
    tierChosen TEXT,
    customerJson TEXT,
    locationJson TEXT,
    confirmedAt TEXT,
    updatedAt TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id),
    FOREIGN KEY (customerId) REFERENCES customers(id),
    FOREIGN KEY (quoteId) REFERENCES quotes(id),
    FOREIGN KEY (bookingIntentId) REFERENCES bookingIntents(id),
    FOREIGN KEY (holdId) REFERENCES bookingHolds(id)
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    eventType TEXT NOT NULL,
    payloadJson TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS businessProfiles (
    ownerId TEXT PRIMARY KEY,
    businessTypesJson TEXT NOT NULL DEFAULT '[]',
    country TEXT,
    region TEXT,
    existingPhoneNumber TEXT,
    twilioNumber TEXT,
    twilioNumberSid TEXT,
    phoneProvisioningStatus TEXT NOT NULL DEFAULT 'not_started',
    carrierSetupStatus TEXT NOT NULL DEFAULT 'not_started',
    knowledgeBaseJson TEXT NOT NULL DEFAULT '{}',
    calendarJson TEXT NOT NULL DEFAULT '{}',
    voiceId TEXT,
    agentName TEXT,
    greeting TEXT,
    operatorEnabled INTEGER NOT NULL DEFAULT 0 CHECK (operatorEnabled IN (0, 1)),
    onboardingStep INTEGER NOT NULL DEFAULT 1,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS priceBookDrafts (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status = 'DRAFT'),
    mode TEXT NOT NULL CHECK (mode IN ('phone', 'browser')),
    serviceTypesJson TEXT NOT NULL DEFAULT '[]',
    fieldsJson TEXT NOT NULL DEFAULT '{}',
    confirmedFieldsJson TEXT NOT NULL DEFAULT '{}',
    currentField TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`
,
  `CREATE TABLE IF NOT EXISTS quoteAccessKeys (
    ownerId TEXT PRIMARY KEY,
    publicKey TEXT NOT NULL UNIQUE,
    allowedOriginsJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS quoteSubmissions (
    ownerId TEXT NOT NULL,
    requestId TEXT NOT NULL,
    contentDigest TEXT NOT NULL,
    recordId TEXT NOT NULL,
    resultType TEXT NOT NULL,
    bookRevision TEXT NOT NULL,
    originalSubmissionJson TEXT NOT NULL,
    internalOutcomeJson TEXT NOT NULL,
    customerResponseJson TEXT NOT NULL,
    bookingIntentId TEXT,
    bookingTokenReceipt TEXT,
    createdAt TEXT NOT NULL,
    PRIMARY KEY (ownerId, requestId),
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS calendarOAuthStates (
    stateHash TEXT PRIMARY KEY NOT NULL,
    ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL,
    consumedAt INTEGER,
    CHECK (length(stateHash) = 64),
    CHECK (stateHash NOT GLOB '*[^0-9a-f]*'),
    CHECK (createdAt >= 0),
    CHECK (expiresAt > createdAt),
    CHECK (consumedAt IS NULL OR consumedAt >= createdAt)
  ) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS calendarConnections (
    ownerId TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    calendarId TEXT,
    credentialsCiphertext TEXT,
    credentialsIv TEXT,
    credentialsTag TEXT,
    keyVersion TEXT,
    externalUrl TEXT,
    expiresAtUtc TEXT,
    scopesJson TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS widgetSettings (
    ownerId TEXT PRIMARY KEY,
    accentColor TEXT NOT NULL DEFAULT '#16A34A',
    launcherLabel TEXT NOT NULL DEFAULT 'Get an estimate',
    clickToCallNumber TEXT,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS bookingSettings (
    ownerId TEXT PRIMARY KEY,
    revision TEXT NOT NULL,
    timezone TEXT NOT NULL,
    provider TEXT,
    calendarId TEXT,
    externalUrl TEXT,
    weeklyAvailabilityJson TEXT NOT NULL DEFAULT '{}',
    blackoutsJson TEXT NOT NULL DEFAULT '[]',
    bookingHorizonDays INTEGER,
    minimumNoticeMinutes INTEGER,
    slotIncrementMinutes INTEGER,
    bufferBeforeMinutes INTEGER,
    bufferAfterMinutes INTEGER,
    directBookingEnabled INTEGER NOT NULL DEFAULT 0 CHECK (directBookingEnabled IN (0, 1)),
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS bookingPolicies (
    ownerId TEXT NOT NULL,
    serviceId TEXT NOT NULL,
    revision TEXT NOT NULL,
    bookingMode TEXT NOT NULL CHECK (bookingMode IN ('site_visit_first', 'book_job')),
    durationMinutes INTEGER,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    updatedAt TEXT NOT NULL,
    PRIMARY KEY (ownerId, serviceId),
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS bookingIntents (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    tokenHash TEXT NOT NULL UNIQUE,
    sourceType TEXT NOT NULL,
    sourceId TEXT NOT NULL,
    serviceId TEXT NOT NULL,
    resultType TEXT NOT NULL,
    allowedTierNamesJson TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL,
    expiresAtUtc TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS bookingHolds (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    intentId TEXT NOT NULL,
    calendarId TEXT NOT NULL,
    slotIdDigest TEXT NOT NULL,
    startAtUtc TEXT NOT NULL,
    endAtUtc TEXT NOT NULL,
    lockStartAtUtc TEXT NOT NULL,
    lockEndAtUtc TEXT NOT NULL,
    policyRevision TEXT NOT NULL,
    status TEXT NOT NULL,
    expiresAtUtc TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id),
    FOREIGN KEY (intentId) REFERENCES bookingIntents(id)
  )`,
  `CREATE TABLE IF NOT EXISTS bookingIdempotency (
    ownerId TEXT NOT NULL,
    operation TEXT NOT NULL,
    idempotencyKey TEXT NOT NULL,
    intentId TEXT NOT NULL,
    requestDigest TEXT NOT NULL,
    httpStatus INTEGER,
    responseJson TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY (ownerId, operation, idempotencyKey),
    FOREIGN KEY (ownerId) REFERENCES users(id),
    FOREIGN KEY (intentId) REFERENCES bookingIntents(id)
  )`,
  `CREATE TABLE IF NOT EXISTS bookingPreferences (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    intentId TEXT NOT NULL,
    preferredWindowsJson TEXT NOT NULL,
    customerJson TEXT NOT NULL,
    locationJson TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'REQUESTED',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id),
    FOREIGN KEY (intentId) REFERENCES bookingIntents(id)
  )`,
  `CREATE TABLE IF NOT EXISTS outboxEvents (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    eventType TEXT NOT NULL,
    aggregateId TEXT NOT NULL,
    payloadJson TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS voiceSessionNonces (
    id TEXT PRIMARY KEY,
    nonceHash TEXT NOT NULL UNIQUE,
    ownerId TEXT NOT NULL,
    accountSid TEXT NOT NULL,
    callSid TEXT NOT NULL,
    fromNumber TEXT NOT NULL,
    toNumber TEXT NOT NULL,
    expiresAtUtc TEXT NOT NULL,
    consumedAtUtc TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS voiceToolReceipts (
    ownerId TEXT NOT NULL,
    callSid TEXT NOT NULL,
    toolName TEXT NOT NULL,
    idempotencyKey TEXT NOT NULL,
    requestDigest TEXT NOT NULL,
    responseJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    PRIMARY KEY (ownerId, callSid, toolName, idempotencyKey),
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS voiceToolIdempotencyReceipts (
    scopeHash TEXT NOT NULL,
    idempotencyKey TEXT NOT NULL,
    requestDigest TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED')),
    responseJson TEXT,
    leaseExpiresAtUtc TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY (scopeHash, idempotencyKey),
    CHECK (
      (status = 'RUNNING' AND responseJson IS NULL) OR
      (status = 'COMPLETED' AND responseJson IS NOT NULL)
    )
  )`,
  `CREATE TABLE IF NOT EXISTS voiceOpaqueHandles (
    handleHash TEXT PRIMARY KEY,
    resourceKeyDigest TEXT NOT NULL,
    ownerId TEXT NOT NULL,
    callSid TEXT NOT NULL,
    accountSid TEXT NOT NULL,
    callerNumber TEXT NOT NULL,
    destinationNumber TEXT NOT NULL,
    handleType TEXT NOT NULL,
    referenceJson TEXT NOT NULL,
    expiresAtUtc TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS transcriptTurns (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    callId TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('caller', 'operator', 'system')),
    text TEXT NOT NULL,
    interrupted INTEGER NOT NULL DEFAULT 0 CHECK (interrupted IN (0, 1)),
    createdAt TEXT NOT NULL,
    UNIQUE (ownerId, callId, sequence),
    FOREIGN KEY (ownerId) REFERENCES users(id),
    FOREIGN KEY (callId) REFERENCES calls(id)
  )`
];

export const CREATE_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS calendarOAuthStates_unconsumedExpiry ON calendarOAuthStates(expiresAt) WHERE consumedAt IS NULL`,
  `CREATE INDEX IF NOT EXISTS calendarOAuthStates_ownerCreated ON calendarOAuthStates(ownerId, createdAt DESC)`,
  `CREATE INDEX IF NOT EXISTS billing_event_receipts_owner
    ON billingEventReceipts(ownerId, eventCreatedAt)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS billing_subscription_history_current_owner
    ON billingSubscriptionHistory(ownerId) WHERE status = 'CURRENT'`,
  `CREATE INDEX IF NOT EXISTS billing_subscription_history_owner
    ON billingSubscriptionHistory(ownerId, status, firstEventCreatedAt)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_session_unique
    ON billingCheckoutRequests(stripeSessionId) WHERE stripeSessionId IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_one_active_owner
    ON billingCheckoutRequests(ownerId) WHERE status IN ('CREATING', 'OPEN')`,
  `CREATE INDEX IF NOT EXISTS billing_checkout_owner_status
    ON billingCheckoutRequests(ownerId, status, expiresAt)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS business_profiles_twilio_number_unique
    ON businessProfiles(twilioNumber)
    WHERE twilioNumber IS NOT NULL AND twilioNumber <> ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS business_profiles_twilio_sid_unique
    ON businessProfiles(twilioNumberSid)
    WHERE twilioNumberSid IS NOT NULL AND twilioNumberSid <> ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS calls_call_sid_unique
    ON calls(callSid) WHERE callSid IS NOT NULL AND callSid <> ''`,
  `CREATE INDEX IF NOT EXISTS booking_holds_overlap
    ON bookingHolds(ownerId, calendarId, status, lockStartAtUtc, lockEndAtUtc, expiresAtUtc)`,
  `CREATE INDEX IF NOT EXISTS appointments_overlap
    ON appointments(ownerId, providerCalendarId, status, lockStartAtUtc, lockEndAtUtc)`,
  `CREATE INDEX IF NOT EXISTS booking_intents_source
    ON bookingIntents(ownerId, sourceType, sourceId)`,
  `CREATE INDEX IF NOT EXISTS booking_preferences_owner
    ON bookingPreferences(ownerId, status, createdAt)`,
  `CREATE INDEX IF NOT EXISTS transcript_turns_call
    ON transcriptTurns(ownerId, callId, sequence)`,
  `CREATE INDEX IF NOT EXISTS voice_tool_receipts_status
    ON voiceToolIdempotencyReceipts(status, leaseExpiresAtUtc)`,
  `CREATE INDEX IF NOT EXISTS voice_opaque_handles_binding
    ON voiceOpaqueHandles(ownerId, callSid, handleType, expiresAtUtc)`,
  `CREATE INDEX IF NOT EXISTS outbox_pending
    ON outboxEvents(status, createdAt)`
];

export const CREATE_TRIGGER_STATEMENTS = [
  `CREATE TRIGGER IF NOT EXISTS billing_event_receipts_immutable_update
    BEFORE UPDATE ON billingEventReceipts
    BEGIN
      SELECT RAISE(ABORT, 'billing event receipts are immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS billing_event_receipts_immutable_delete
    BEFORE DELETE ON billingEventReceipts
    BEGIN
      SELECT RAISE(ABORT, 'billing event receipts are immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS billing_subscription_history_identity_immutable
    BEFORE UPDATE ON billingSubscriptionHistory
    WHEN NEW.stripeSubscriptionId != OLD.stripeSubscriptionId
      OR NEW.ownerId != OLD.ownerId
      OR NEW.stripeCustomerId != OLD.stripeCustomerId
      OR NEW.firstEventId != OLD.firstEventId
      OR NEW.firstEventCreatedAt != OLD.firstEventCreatedAt
      OR NEW.createdAt != OLD.createdAt
      OR OLD.status = 'TERMINAL'
    BEGIN
      SELECT RAISE(ABORT, 'billing subscription history evidence is immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS billing_subscription_history_immutable_delete
    BEFORE DELETE ON billingSubscriptionHistory
    BEGIN
      SELECT RAISE(ABORT, 'billing subscription history evidence is immutable');
    END`,
  `CREATE TRIGGER IF NOT EXISTS users_billing_evidence_insert
    AFTER INSERT ON users
    WHEN NEW.role = 'owner'
      AND NEW.planStatus IN ('trialing', 'active', 'payment_failed', 'past_due')
      AND NOT EXISTS (
        SELECT 1 FROM billingAccounts AS billing
        WHERE billing.ownerId = NEW.id
          AND billing.paymentMethodVerifiedAt IS NOT NULL
      )
    BEGIN
      UPDATE users
      SET planStatus = 'pending_payment', trialEndsAt = NULL, paymentFailedAt = NULL
      WHERE id = NEW.id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS users_billing_evidence_update
    AFTER UPDATE OF planStatus, trialEndsAt, paymentFailedAt ON users
    WHEN NEW.role = 'owner'
      AND NEW.planStatus IN ('trialing', 'active', 'payment_failed', 'past_due')
      AND NOT EXISTS (
        SELECT 1 FROM billingAccounts AS billing
        WHERE billing.ownerId = NEW.id
          AND billing.paymentMethodVerifiedAt IS NOT NULL
      )
    BEGIN
      UPDATE users
      SET planStatus = 'pending_payment', trialEndsAt = NULL, paymentFailedAt = NULL
      WHERE id = NEW.id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS users_staff_parent_insert
    BEFORE INSERT ON users
    WHEN NEW.role = 'staff'
      AND NOT EXISTS (
        SELECT 1 FROM users AS parent
        WHERE parent.id = NEW.ownerId AND parent.role = 'owner'
      )
    BEGIN
      SELECT RAISE(ABORT, 'staff ownerId must reference an owner');
    END`,
  `CREATE TRIGGER IF NOT EXISTS users_staff_parent_update
    BEFORE UPDATE OF role, ownerId ON users
    WHEN NEW.role = 'staff'
      AND NOT EXISTS (
        SELECT 1 FROM users AS parent
        WHERE parent.id = NEW.ownerId AND parent.role = 'owner'
      )
    BEGIN
      SELECT RAISE(ABORT, 'staff ownerId must reference an owner');
    END`,
  `CREATE TRIGGER IF NOT EXISTS users_owner_demotion_guard
    BEFORE UPDATE OF role ON users
    WHEN OLD.role = 'owner'
      AND NEW.role != 'owner'
      AND EXISTS (
        SELECT 1 FROM users AS staff
        WHERE staff.ownerId = OLD.id AND staff.role = 'staff'
      )
    BEGIN
      SELECT RAISE(ABORT, 'owner role cannot change while staff reference it');
    END`
];
