import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { CREATE_TABLE_STATEMENTS } from './schema.js';

const defaultPath = resolve(process.cwd(), '..', 'data', 'off-the-clock.sqlite');
const databasePath = process.env.DATABASE_PATH || defaultPath;
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('foreign_keys = ON');

export function migrate() {
  for (const statement of CREATE_TABLE_STATEMENTS) {
    db.prepare(statement).run();
  }
  return CREATE_TABLE_STATEMENTS;
}

export function ownerQuery(sql) {
  if (!/\bownerId\b/.test(sql)) {
    throw new Error('Owner data queries must filter by ownerId');
  }
  return db.prepare(sql);
}
