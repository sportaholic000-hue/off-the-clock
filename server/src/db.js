import Database from 'better-sqlite3';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { migrateDatabase } from './migrations.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const configuredPath = process.env.DATABASE_PATH;
const databasePath = configuredPath
  ? (isAbsolute(configuredPath) ? configuredPath : resolve(projectRoot, configuredPath))
  : resolve(projectRoot, 'data', 'off-the-clock.sqlite');
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
