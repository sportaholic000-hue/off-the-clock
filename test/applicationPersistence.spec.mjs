import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase } from '../server/src/migrations.js';
import { createAuthTokenService, AUTH_TOKEN_PURPOSES } from '../server/src/authTokenService.js';

test('real application migration supports verification tokens and preserves consumption on restart', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys = ON');
    migrateDatabase(database);
    database.prepare("INSERT INTO users (id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES (?,NULL,?,'hash','Synthetic','Synthetic','Operator','pending_payment','UTC','owner',?)")
      .run('synthetic-auth-owner', 'synthetic-auth@example.invalid', '2026-09-29T00:00:00.000Z');
    const options = { clock: () => new Date('2026-09-29T12:00:00.000Z') };
    const service = createAuthTokenService(database, options);
    const issued = service.issue({ userId: 'synthetic-auth-owner', purpose: AUTH_TOKEN_PURPOSES.VERIFY_EMAIL });
    service.consume({ token: issued.token, purpose: issued.purpose }, receipt => {
      database.prepare('UPDATE users SET emailVerifiedAt=? WHERE id=?').run(receipt.consumedAt, receipt.userId);
    });
    migrateDatabase(database);
    const restarted = createAuthTokenService(database, options);
    assert.throws(() => restarted.consume({ token: issued.token, purpose: issued.purpose }), { code: 'AUTH_TOKEN_INVALID' });
    assert.equal(database.prepare('SELECT emailVerifiedAt FROM users WHERE id=?').get('synthetic-auth-owner').emailVerifiedAt, '2026-09-29T12:00:00.000Z');
    assert.equal(database.prepare('SELECT count(*) AS count FROM authTokens WHERE consumedAt IS NOT NULL').get().count, 1);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(Object.values(database.prepare('PRAGMA integrity_check').get())[0], 'ok');
  } finally { database.close(); }
});

