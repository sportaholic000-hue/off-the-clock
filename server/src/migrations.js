import { CREATE_TABLE_STATEMENTS, CREATE_TRIGGER_STATEMENTS } from './schema.js';
import { findInvalidStaffOwnerLinks } from './tenant.js';

const USERS_CREATE_SQL = CREATE_TABLE_STATEMENTS[0];
const USERS_MIGRATION_TABLE = 'users_owner_migration';
const USERS_COLUMNS = [
  'id', 'ownerId', 'email', 'passwordHash', 'firstName', 'businessName',
  'plan', 'planStatus', 'trialEndsAt', 'timezone', 'role', 'createdAt'
];
const USERS_ROLE_NULLABILITY_CHECK = /CHECK\s*\(\s*\(\s*role\s*=\s*'staff'\s+AND\s+ownerId\s+IS\s+NOT\s+NULL\s*\)\s+OR\s+\(\s*role\s+IN\s*\(\s*'owner'\s*,\s*'admin'\s*\)\s+AND\s+ownerId\s+IS\s+NULL\s*\)\s*\)/i;

function tableSql(database, table) {
  return database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)?.sql || '';
}

function tableColumns(database, table) {
  return database.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
}

export function usersTableNeedsRebuild(database) {
  const sql = tableSql(database, 'users');
  if (!sql) return false;
  return !tableColumns(database, 'users').includes('ownerId') || !USERS_ROLE_NULLABILITY_CHECK.test(sql);
}

export function assertMigrationIntegrity(database) {
  const errors = [];
  const integrityFailures = database.pragma('integrity_check')
    .map(row => Object.values(row)[0])
    .filter(value => value !== 'ok');
  if (integrityFailures.length) {
    errors.push(`integrity_check: ${integrityFailures.join(', ')}`);
  }

  const foreignKeyFailures = database.pragma('foreign_key_check');
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
  const foreignKeysWereEnabled = Boolean(database.pragma('foreign_keys', { simple: true }));

  database.pragma('foreign_keys = OFF');
  try {
    database.transaction(() => {
      database.prepare(`DROP TABLE IF EXISTS ${USERS_MIGRATION_TABLE}`).run();
      database.prepare(createMigrationTableSql).run();
      database.prepare(`
        INSERT INTO ${USERS_MIGRATION_TABLE} (${USERS_COLUMNS.join(', ')})
        SELECT ${selectColumns} FROM users
      `).run();
      database.prepare('DROP TABLE users').run();
      database.prepare(`ALTER TABLE ${USERS_MIGRATION_TABLE} RENAME TO users`).run();
      assertMigrationIntegrity(database);
    })();
  } finally {
    database.pragma(`foreign_keys = ${foreignKeysWereEnabled ? 'ON' : 'OFF'}`);
  }
  return true;
}

export function migrateDatabase(database) {
  for (const statement of CREATE_TABLE_STATEMENTS) {
    database.prepare(statement).run();
  }
  const rebuilt = rebuildUsersTableForOwnerConstraint(database);
  if (!rebuilt) assertMigrationIntegrity(database);
  for (const statement of CREATE_TRIGGER_STATEMENTS) {
    database.prepare(statement).run();
  }
  return CREATE_TABLE_STATEMENTS;
}
