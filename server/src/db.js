import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { CREATE_TABLE_STATEMENTS } from './schema.js';

const defaultPath = resolve(process.cwd(), '..', 'data', 'off-the-clock.sqlite');
const databasePath = process.env.DATABASE_PATH || defaultPath;
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('foreign_keys = ON');

const USERS_CREATE_SQL = CREATE_TABLE_STATEMENTS[0];
const USERS_MIGRATION_TABLE = 'users_owner_migration';
const USERS_COLUMNS = [
  'id', 'ownerId', 'email', 'passwordHash', 'firstName', 'businessName',
  'plan', 'planStatus', 'trialEndsAt', 'timezone', 'role', 'createdAt'
];

function tableSql(table) {
  return db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)?.sql || '';
}

function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
}

function usersTableNeedsRebuild() {
  const sql = tableSql('users');
  if (!sql) return false;
  return !tableColumns('users').includes('ownerId') || !/role\s*=\s*'staff'\s+AND\s+ownerId\s+IS\s+NOT\s+NULL/i.test(sql);
}

function rebuildUsersTableForOwnerConstraint() {
  if (!usersTableNeedsRebuild()) return;

  const existingColumns = new Set(tableColumns('users'));
  const selectColumns = USERS_COLUMNS.map(column => existingColumns.has(column) ? column : `NULL AS ${column}`).join(', ');
  const createMigrationTableSql = USERS_CREATE_SQL.replace('CREATE TABLE IF NOT EXISTS users', `CREATE TABLE ${USERS_MIGRATION_TABLE}`);

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.prepare(`DROP TABLE IF EXISTS ${USERS_MIGRATION_TABLE}`).run();
      db.prepare(createMigrationTableSql).run();
      db.prepare(`INSERT INTO ${USERS_MIGRATION_TABLE} (${USERS_COLUMNS.join(', ')}) SELECT ${selectColumns} FROM users`).run();
      db.prepare('DROP TABLE users').run();
      db.prepare(`ALTER TABLE ${USERS_MIGRATION_TABLE} RENAME TO users`).run();
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

export function migrate() {
  for (const statement of CREATE_TABLE_STATEMENTS) {
    db.prepare(statement).run();
  }
  rebuildUsersTableForOwnerConstraint();
  return CREATE_TABLE_STATEMENTS;
}

export function ownerQuery(sql) {
  if (!/\bownerId\b/.test(sql)) {
    throw new Error('Owner data queries must filter by ownerId');
  }
  return db.prepare(sql);
}
