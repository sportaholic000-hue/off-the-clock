import {migrateBillingCheckoutRecovery} from './billingCoreMigration.js';
import {installBillingUsageSchema} from './billingUsageSchema.js';
import {installBillingLifecycleSchema} from './billingCustomerLifecycle.js';
import { installOutboundWebhookSchema } from './outboundWebhookSchema.js';
import { CREATE_INDEX_STATEMENTS, CREATE_TABLE_STATEMENTS, CREATE_TRIGGER_STATEMENTS } from './schema.js';
import { findInvalidStaffOwnerLinks } from './tenant.js';
import { installAuthTokenSchema } from './authTokenService.js';
import {installAuthSessionSchema} from './authSessionService.js';
import {installAuthLimitSchema} from './authRateLimitService.js';

const USERS_CREATE_SQL = CREATE_TABLE_STATEMENTS[0];
const USERS_MIGRATION_TABLE = 'users_owner_migration';
const USERS_COLUMNS = [
  'id', 'ownerId', 'email', 'passwordHash', 'firstName', 'businessName',
  'plan', 'planStatus', 'trialEndsAt', 'paymentFailedAt', 'annualPaidThroughAt', 'paidThroughAt', 'serviceEndsAt', 'emailVerifiedAt', 'timezone', 'role', 'createdAt'
];
const USERS_ROLE_NULLABILITY_CHECK = /CHECK\s*\(\s*\(\s*role\s*=\s*'staff'\s+AND\s+ownerId\s+IS\s+NOT\s+NULL\s*\)\s+OR\s+\(\s*role\s+IN\s*\(\s*'owner'\s*,\s*'admin'\s*\)\s+AND\s+ownerId\s+IS\s+NULL\s*\)\s*\)/i;

const ADDITIVE_COLUMNS = {
  billingInvoiceEvidence: { invoiceJson: 'TEXT', currency: 'TEXT' },
  billingAccounts: { currentPeriodStartAt: 'TEXT' },
  billingCheckoutRequests: { providerExpiredVerifiedAt: 'TEXT', reconciliationError: 'TEXT' },
  users: {
    paidThroughAt: 'TEXT',
    serviceEndsAt: 'TEXT',
    annualPaidThroughAt: 'TEXT',
    paymentFailedAt: 'TEXT',
    emailVerifiedAt: 'TEXT'
  },
  quoteSubmissions: {
    bookingIntentId: 'TEXT',
    bookingTokenReceipt: 'TEXT'
  },
  calls: {
    accountSid: 'TEXT',
    streamSid: 'TEXT',
    destinationNumber: 'TEXT',
    status: 'TEXT',
    aiInputTokens: 'INTEGER NOT NULL DEFAULT 0',
    aiOutputTokens: 'INTEGER NOT NULL DEFAULT 0',
    aiEstimatedCostMicros: 'INTEGER NOT NULL DEFAULT 0',
    failureCode: 'TEXT',
    completedAt: 'TEXT',
    updatedAt: 'TEXT'
  },
  appointments: {
    bookingIntentId: 'TEXT',
    holdId: 'TEXT',
    provider: 'TEXT',
    providerCalendarId: 'TEXT',
    providerEventId: 'TEXT',
    providerEventStatus: 'TEXT',
    startAtUtc: 'TEXT',
    endAtUtc: 'TEXT',
    lockStartAtUtc: 'TEXT',
    lockEndAtUtc: 'TEXT',
    timezone: 'TEXT',
    policyRevision: 'TEXT',
    tierChosen: 'TEXT',
    customerJson: 'TEXT',
    locationJson: 'TEXT',
    confirmedAt: 'TEXT',
    updatedAt: 'TEXT'
  }
};

function tableSql(database, table) {
  return database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)?.sql || '';
}

function tableColumns(database, table) {
  return database.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
}

function addMissingColumns(database) {
  for (const [table, definitions] of Object.entries(ADDITIVE_COLUMNS)) {
    const existing = new Set(tableColumns(database, table));
    for (const [column, definition] of Object.entries(definitions)) {
      if (!existing.has(column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

function enforceFailClosedTrialEvidence(database) {
  database.prepare(`
    UPDATE users
    SET planStatus = 'pending_payment', trialEndsAt = NULL, paymentFailedAt = NULL
    WHERE role = 'owner'
      AND planStatus IN ('trialing', 'active', 'payment_failed', 'past_due')
      AND NOT EXISTS (
        SELECT 1 FROM billingAccounts AS billing
        WHERE billing.ownerId = users.id
          AND billing.paymentMethodVerifiedAt IS NOT NULL
      )
  `).run();
}

function backfillBillingSubscriptionHistory(database) {
  database.prepare(`
    INSERT OR IGNORE INTO billingSubscriptionHistory (
      stripeSubscriptionId, ownerId, stripeCustomerId, status,
      firstEventId, firstEventCreatedAt, terminalEventId,
      terminalEventCreatedAt, createdAt, updatedAt
    )
    SELECT
      billing.stripeSubscriptionId,
      billing.ownerId,
      billing.stripeCustomerId,
      CASE WHEN deleted.stripeEventId IS NULL THEN 'CURRENT' ELSE 'TERMINAL' END,
      COALESCE(billing.lastStripeEventId, deleted.stripeEventId, 'legacy:' || billing.stripeSubscriptionId),
      COALESCE(billing.lastStripeEventCreatedAt, deleted.eventCreatedAt, 0),
      deleted.stripeEventId,
      deleted.eventCreatedAt,
      billing.createdAt,
      billing.updatedAt
    FROM billingAccounts AS billing
    LEFT JOIN billingEventReceipts AS deleted
      ON deleted.stripeEventId = (
        SELECT receipt.stripeEventId
        FROM billingEventReceipts AS receipt
        WHERE receipt.ownerId = billing.ownerId
          AND receipt.eventType = 'customer.subscription.deleted'
          AND receipt.objectId = billing.stripeSubscriptionId
          AND receipt.outcome = 'APPLIED'
        ORDER BY receipt.eventCreatedAt DESC, receipt.stripeEventId DESC
        LIMIT 1
      )
    WHERE billing.stripeSubscriptionId IS NOT NULL
  `).run();
}

function pragmaRows(database, statement) {
  if (typeof database.pragma === 'function') return database.pragma(statement);
  return database.prepare(`PRAGMA ${statement}`).all();
}

function pragmaValue(database, statement) {
  if (typeof database.pragma === 'function') return database.pragma(statement, { simple: true });
  const row = database.prepare(`PRAGMA ${statement}`).get();
  return row ? Object.values(row)[0] : undefined;
}

function setPragma(database, statement) {
  if (typeof database.pragma === 'function') return database.pragma(statement);
  return database.exec(`PRAGMA ${statement}`);
}

function runTransaction(database, work) {
  if (typeof database.transaction === 'function') return database.transaction(work)();
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

export function usersTableNeedsRebuild(database) {
  const sql = tableSql(database, 'users');
  if (!sql) return false;
  return !tableColumns(database, 'users').includes('ownerId') || !USERS_ROLE_NULLABILITY_CHECK.test(sql);
}

export function assertMigrationIntegrity(database) {
  const errors = [];
  const integrityFailures = pragmaRows(database, 'integrity_check')
    .map(row => Object.values(row)[0])
    .filter(value => value !== 'ok');
  if (integrityFailures.length) {
    errors.push(`integrity_check: ${integrityFailures.join(', ')}`);
  }

  const foreignKeyFailures = pragmaRows(database, 'foreign_key_check');
  if (foreignKeyFailures.length) {
    const details = foreignKeyFailures.map(row => `${row.table}:${row.rowid}->${row.parent}`).join(', ');
    errors.push(`foreign_key_check: ${details}`);
  }

  const invalidStaffLinks = findInvalidStaffOwnerLinks(database);
  if (invalidStaffLinks.length) {
    const details = invalidStaffLinks
      .map(row => `${row.staffId}->${row.ownerId ?? 'null'} (${row.parentRole ?? 'missing'})`)
      .join(', ');
    errors.push(`tenant invariant: ${details}`);
  }

  if (errors.length) {
    throw new Error(`Users migration validation failed: ${errors.join('; ')}`);
  }
}

export function rebuildUsersTableForOwnerConstraint(database) {
  if (!usersTableNeedsRebuild(database)) return false;

  const existingColumns = new Set(tableColumns(database, 'users'));
  const selectColumns = USERS_COLUMNS
    .map(column => existingColumns.has(column) ? column : `NULL AS ${column}`)
    .join(', ');
  const createMigrationTableSql = USERS_CREATE_SQL.replace(
    'CREATE TABLE IF NOT EXISTS users',
    `CREATE TABLE ${USERS_MIGRATION_TABLE}`
  );
  const foreignKeysWereEnabled = Number(pragmaValue(database, 'foreign_keys')) === 1;

  setPragma(database, 'foreign_keys = OFF');
  try {
    runTransaction(database, () => {
      database.exec(`DROP TABLE IF EXISTS ${USERS_MIGRATION_TABLE}`);
      database.exec(createMigrationTableSql);
      database.prepare(`
        INSERT INTO ${USERS_MIGRATION_TABLE} (${USERS_COLUMNS.join(', ')})
        SELECT ${selectColumns} FROM users
      `).run();
      database.exec('DROP TABLE users');
      database.exec(`ALTER TABLE ${USERS_MIGRATION_TABLE} RENAME TO users`);
      assertMigrationIntegrity(database);
    });
  } finally {
    setPragma(database, `foreign_keys = ${foreignKeysWereEnabled ? 'ON' : 'OFF'}`);
  }
  return true;
}

export function migrateDatabase(database) {
  for (const statement of CREATE_TABLE_STATEMENTS) {
    database.exec(statement);
  }
  addMissingColumns(database);
  migrateBillingCheckoutRecovery(database,CREATE_TABLE_STATEMENTS.find(sql=>sql.startsWith('CREATE TABLE IF NOT EXISTS billingCheckoutRequests')));
  const rebuilt = rebuildUsersTableForOwnerConstraint(database);
  if (!rebuilt) assertMigrationIntegrity(database);
  enforceFailClosedTrialEvidence(database);
  backfillBillingSubscriptionHistory(database);
  // Old receipts omit subscription identity. Never guess which invoice settled
  // an existing legacy failure. Retain it until tenant-bound provider recovery.
  database.prepare(`INSERT OR IGNORE INTO billingRecoveryHolds(ownerId,stripeSubscriptionId,reason,createdAt)
    SELECT b.ownerId,b.stripeSubscriptionId,'LEGACY_DEBT_REQUIRES_RECONCILIATION',b.updatedAt FROM billingAccounts b
    JOIN users u ON u.id=b.ownerId
    WHERE (b.paymentFailedAt IS NOT NULL OR u.planStatus IN ('payment_failed','past_due')) AND b.stripeSubscriptionId IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM billingInvoiceEvidence i WHERE i.ownerId=b.ownerId AND i.stripeSubscriptionId=b.stripeSubscriptionId)`
  ).run();
  // Repair the legacy impossible failure-without-time state without inventing a
  // new grace window. A verified invoice can later recover its actual timestamp.
  database.prepare(`UPDATE users SET planStatus='suspended'
    WHERE role='owner' AND planStatus IN ('payment_failed','past_due')
      AND EXISTS (SELECT 1 FROM billingAccounts b WHERE b.ownerId=users.id AND b.paymentFailedAt IS NULL)`
  ).run();
  for (const statement of CREATE_TRIGGER_STATEMENTS) {
    database.exec(statement);
  }
  for (const statement of CREATE_INDEX_STATEMENTS) {
    database.exec(statement);
  }
  installAuthTokenSchema(database);
  installAuthSessionSchema(database);
  installAuthLimitSchema(database);
  installOutboundWebhookSchema(database);
  installBillingUsageSchema(database);
  installBillingLifecycleSchema(database);
  return CREATE_TABLE_STATEMENTS;
}
