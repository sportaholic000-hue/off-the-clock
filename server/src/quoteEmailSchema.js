export function installQuoteEmailSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS voiceQuoteNarrations(
    ownerId TEXT NOT NULL,requestId TEXT NOT NULL,callSid TEXT NOT NULL,narration TEXT NOT NULL,createdAt TEXT NOT NULL,
    PRIMARY KEY(ownerId,requestId),FOREIGN KEY(ownerId) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS quoteEmailRecipients(
    ownerId TEXT NOT NULL,requestId TEXT NOT NULL,callSid TEXT NOT NULL,email TEXT NOT NULL,version TEXT NOT NULL,updatedAt TEXT NOT NULL,
    PRIMARY KEY(ownerId,requestId),FOREIGN KEY(ownerId) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS quoteEmailDeliveries(
    id TEXT PRIMARY KEY,ownerId TEXT NOT NULL,requestId TEXT NOT NULL,recordId TEXT NOT NULL,callSid TEXT NOT NULL,
    recipient TEXT NOT NULL,businessName TEXT NOT NULL,narration TEXT NOT NULL,messageJson TEXT NOT NULL,
    tokenHash TEXT NOT NULL,expiresAt INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',
    attemptCount INTEGER NOT NULL DEFAULT 0,receiptChecks INTEGER NOT NULL DEFAULT 0,firstAttemptAt INTEGER,
    nextAttemptAt INTEGER NOT NULL DEFAULT 0,leaseId TEXT,leaseExpiresAt INTEGER,providerId TEXT,lastErrorCode TEXT,
    createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,UNIQUE(ownerId,requestId),UNIQUE(ownerId,tokenHash),
    FOREIGN KEY(ownerId) REFERENCES users(id),FOREIGN KEY(id) REFERENCES outboxEvents(id));
    CREATE INDEX IF NOT EXISTS quote_email_due ON quoteEmailDeliveries(ownerId,status,nextAttemptAt);
    CREATE TRIGGER IF NOT EXISTS quote_email_outbox_state AFTER UPDATE OF status ON quoteEmailDeliveries
    BEGIN UPDATE outboxEvents SET status=NEW.status,updatedAt=NEW.updatedAt WHERE ownerId=NEW.ownerId AND id=NEW.id AND eventType='quote.email_requested'; END;`);
}
