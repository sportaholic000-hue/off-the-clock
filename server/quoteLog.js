import { db } from './src/db.js';
import crypto from 'node:crypto';

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
}

export function ensureQuoteLogSchema() {
  db.prepare(`CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL,
    quoteId TEXT,
    serviceType TEXT,
    customerInputsJson TEXT,
    resultJson TEXT,
    callerType TEXT,
    urgency TEXT,
    createdAt TEXT NOT NULL
  )`).run();
  if (!hasColumn('quotes', 'urgency')) db.prepare('ALTER TABLE quotes ADD COLUMN urgency TEXT').run();
}

export function insertQuoteLog(ownerId, quoteId, serviceType, customerInputs, result, callerType, urgency) {
  ensureQuoteLogSchema();
  db.prepare(`INSERT INTO quotes (id, ownerId, quoteId, serviceType, customerInputsJson, resultJson, callerType, urgency, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      crypto.randomUUID(), ownerId, quoteId, serviceType, JSON.stringify(customerInputs || {}), JSON.stringify(result || {}), callerType || 'owner', urgency || null, result?.resultType || null, new Date().toISOString()
    );
}
