import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { migrateDatabase } from './migrations.js';

const defaultPath = resolve(process.cwd(), '..', 'data', 'off-the-clock.sqlite');
const databasePath = process.env.DATABASE_PATH || defaultPath;
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('foreign_keys = ON');

export function migrate() {
  return migrateDatabase(db);
}

export function ownerQuery(sql) {
  if (!/\bownerId\b/.test(sql)) {
    throw new Error('Owner data queries must filter by ownerId');
  }
  return db.prepare(sql);
}
