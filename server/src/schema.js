export const CREATE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    ownerId TEXT,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    firstName TEXT NOT NULL,
    businessName TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'Operator',
    planStatus TEXT NOT NULL DEFAULT 'trialing',
    trialEndsAt TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    role TEXT NOT NULL CHECK (role IN ('owner', 'staff', 'admin')),
    createdAt TEXT NOT NULL,
    CHECK (
      (role = 'staff' AND ownerId IS NOT NULL) OR
      (role IN ('owner', 'admin') AND ownerId IS NULL)
    ),
    FOREIGN KEY (ownerId) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    callSid TEXT,
    callerNumber TEXT,
    duration INTEGER,
    outcome TEXT,
    transcriptJson TEXT,
    summaryText TEXT,
    urgency TEXT,
    spamFiltered INTEGER NOT NULL DEFAULT 0,
    minutesBilled INTEGER NOT NULL DEFAULT 0,
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
    createdAt TEXT NOT NULL,
    FOREIGN KEY (ownerId) REFERENCES users(id),
    FOREIGN KEY (customerId) REFERENCES customers(id),
    FOREIGN KEY (quoteId) REFERENCES quotes(id)
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
];

export const CREATE_TRIGGER_STATEMENTS = [
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
