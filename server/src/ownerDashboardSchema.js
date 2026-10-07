// Additive migration only; historical receipts and historical alerts are not rewritten.
export function installOwnerDashboardSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ownerRecordWorkflows (
    ownerId TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('leads','quotes')), recordId TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0, followUpAction TEXT, followUpStatus TEXT,
    dueAt TEXT, note TEXT, reviewedQuoteId TEXT, updatedAt TEXT NOT NULL,
    PRIMARY KEY(ownerId,kind,recordId), FOREIGN KEY(ownerId) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS ownerRecordEvents (
    id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, kind TEXT NOT NULL, recordId TEXT NOT NULL,
    idempotencyKey TEXT NOT NULL, requestJson TEXT NOT NULL, action TEXT NOT NULL,
    fromStatus TEXT, toStatus TEXT, note TEXT, actorId TEXT NOT NULL, payloadJson TEXT NOT NULL,
    responseJson TEXT NOT NULL, createdAt TEXT NOT NULL,
    UNIQUE(ownerId,kind,recordId,idempotencyKey), FOREIGN KEY(ownerId) REFERENCES users(id));
    CREATE INDEX IF NOT EXISTS owner_record_history ON ownerRecordEvents(ownerId,kind,recordId,createdAt);
    CREATE TABLE IF NOT EXISTS ownerReportSettings (
    ownerId TEXT PRIMARY KEY, weeklyHoursJson TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
    updatedAt TEXT NOT NULL, FOREIGN KEY(ownerId) REFERENCES users(id));
    CREATE INDEX IF NOT EXISTS calls_owner_time ON calls(ownerId,createdAt,id);
    CREATE INDEX IF NOT EXISTS quotes_owner_time ON quotes(ownerId,createdAt,id);
    CREATE INDEX IF NOT EXISTS appointments_owner_confirmed ON appointments(ownerId,confirmedAt,id);`);
}
