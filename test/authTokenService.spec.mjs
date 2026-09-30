import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  AUTH_TOKEN_PURPOSES,
  AUTH_TOKEN_TTL_POLICY,
  AuthTokenError,
  createAuthTokenService,
  installAuthTokenSchema,
  isAuthToken
} from '../server/src/authTokenService.js';

const START_MS = Date.parse('2026-09-29T12:00:00.000Z');
const INVALID_MESSAGE = 'This link is invalid or has expired.';

function createDatabase(filename = ':memory:') {
  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 1000');
  database.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    emailVerifiedAt TEXT,
    passwordHash TEXT
  ) STRICT`);
  installAuthTokenSchema(database);
  database.prepare(`INSERT OR IGNORE INTO users (id, emailVerifiedAt, passwordHash)
    VALUES (?, NULL, 'old-hash')`).run('user-1');
  return database;
}

function expectAuthError(action, code, message) {
  let caught;
  try { action(); } catch (error) { caught = error; }
  assert.ok(caught instanceof AuthTokenError);
  assert.equal(caught.code, code);
  if (message !== undefined) assert.equal(caught.message, message);
  return caught;
}

test('issues 256-bit tokens, persists only a SHA-256 hash, and enforces TTL policy', () => {
  const database = createDatabase();
  const clock = () => new Date(START_MS);
  const service = createAuthTokenService(database, {
    clock,
    randomBytes: size => Buffer.alloc(size, 0x41)
  });

  const issued = service.issue({ userId: 'user-1', purpose: AUTH_TOKEN_PURPOSES.VERIFY_EMAIL });
  assert.equal(isAuthToken(issued.token), true);
  assert.equal(Buffer.from(issued.token, 'base64url').length, 32);
  assert.equal(issued.createdAt, '2026-09-29T12:00:00.000Z');
  assert.equal(issued.expiresAt, '2026-09-30T12:00:00.000Z');

  const row = database.prepare('SELECT * FROM authTokens').get();
  assert.equal(row.tokenHash, crypto.createHash('sha256').update(issued.token, 'utf8').digest('hex'));
  assert.equal(row.userId, 'user-1');
  assert.equal(row.purpose, 'verify_email');
  assert.equal(row.consumedAt, null);
  assert.equal(JSON.stringify(row).includes(issued.token), false);
  assert.equal(database.serialize().indexOf(Buffer.from(issued.token, 'utf8')), -1);
  assert.deepEqual(
    database.prepare('PRAGMA table_info(authTokens)').all().map(column => column.name),
    ['tokenHash', 'userId', 'purpose', 'expiresAt', 'createdAt', 'consumedAt']
  );

  expectAuthError(
    () => service.issue({
      userId: 'user-1',
      purpose: 'reset_password',
      ttlMs: AUTH_TOKEN_TTL_POLICY.reset_password.minMs - 1
    }),
    'AUTH_TOKEN_REQUEST_INVALID'
  );
  expectAuthError(
    () => service.issue({
      userId: 'user-1',
      purpose: 'reset_password',
      ttlMs: AUTH_TOKEN_TTL_POLICY.reset_password.maxMs + 1
    }),
    'AUTH_TOKEN_REQUEST_INVALID'
  );
  database.close();
});

test('purpose binding fails generically without burning a valid token and consumption is one-use', () => {
  const database = createDatabase();
  const service = createAuthTokenService(database, { clock: () => START_MS });
  const issued = service.issue({ userId: 'user-1', purpose: 'verify_email' });

  const crossPurpose = expectAuthError(
    () => service.consume({ token: issued.token, purpose: 'reset_password' }),
    'AUTH_TOKEN_INVALID',
    INVALID_MESSAGE
  );
  assert.equal(String(crossPurpose).includes(issued.token), false);

  const receipt = service.consume({ token: issued.token, purpose: 'verify_email' });
  assert.equal(receipt.userId, 'user-1');
  assert.equal(receipt.purpose, 'verify_email');
  assert.equal(receipt.consumedAt, '2026-09-29T12:00:00.000Z');
  expectAuthError(
    () => service.consume({ token: issued.token, purpose: 'verify_email' }),
    'AUTH_TOKEN_INVALID',
    INVALID_MESSAGE
  );
  database.close();
});

test('unknown, malformed, polluted-prototype, accessor, and unsupported-purpose inputs have one public failure', () => {
  const database = createDatabase();
  const service = createAuthTokenService(database, { clock: () => START_MS });
  const unknown = crypto.randomBytes(32).toString('base64url');
  const inherited = Object.create({ token: unknown, purpose: 'verify_email' });
  const accessor = {};
  Object.defineProperty(accessor, 'token', { get() { throw new Error(`secret:${unknown}`); } });
  accessor.purpose = 'verify_email';
  const cases = [
    null,
    [],
    inherited,
    accessor,
    { token: new String(unknown), purpose: 'verify_email' },
    { token: 'not-a-token', purpose: 'verify_email' },
    { token: 'A'.repeat(2000), purpose: 'verify_email' },
    { token: unknown, purpose: '__proto__' },
    { token: unknown },
    { token: unknown, purpose: 'verify_email', __proto__: { polluted: true } }
  ];

  for (const input of cases) {
    const error = expectAuthError(() => service.consume(input), 'AUTH_TOKEN_INVALID', INVALID_MESSAGE);
    assert.equal(error.message.includes(unknown), false);
    assert.equal(String(error).includes('secret:'), false);
  }
  expectAuthError(() => service.consume({ token: unknown, purpose: 'verify_email' }), 'AUTH_TOKEN_INVALID', INVALID_MESSAGE);
  expectAuthError(
    () => service.issue(Object.create({ userId: 'user-1', purpose: 'verify_email' })),
    'AUTH_TOKEN_REQUEST_INVALID'
  );
  database.close();
});

test('a token is expired at the exact expiry boundary and remains unusable', () => {
  const database = createDatabase();
  let now = START_MS;
  const service = createAuthTokenService(database, { clock: () => now });
  const ttlMs = AUTH_TOKEN_TTL_POLICY.reset_password.minMs;
  const issued = service.issue({ userId: 'user-1', purpose: 'reset_password', ttlMs });
  now += ttlMs;

  expectAuthError(
    () => service.consume({ token: issued.token, purpose: 'reset_password' }),
    'AUTH_TOKEN_INVALID',
    INVALID_MESSAGE
  );
  assert.equal(database.prepare('SELECT consumedAt FROM authTokens').get().consumedAt, null);
  database.close();
});

test('tokens survive process-style service restart without raw-token persistence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'off-the-clock-auth-token-'));
  const filename = join(directory, 'auth.sqlite');
  let first;
  let second;
  try {
    first = createDatabase(filename);
    const issued = createAuthTokenService(first, { clock: () => START_MS }).issue({
      userId: 'user-1',
      purpose: 'reset_password'
    });
    first.close();
    first = null;

    second = createDatabase(filename);
    const receipt = createAuthTokenService(second, { clock: () => START_MS + 1 }).consume({
      token: issued.token,
      purpose: 'reset_password'
    });
    assert.equal(receipt.userId, 'user-1');
  } finally {
    first?.close();
    second?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('explicit invalidation and default replacement revoke all earlier outstanding tokens', () => {
  const database = createDatabase();
  let byte = 1;
  const service = createAuthTokenService(database, {
    clock: () => START_MS,
    randomBytes: size => Buffer.alloc(size, byte++)
  });
  const first = service.issue({ userId: 'user-1', purpose: 'reset_password', replaceOutstanding: false });
  const second = service.issue({ userId: 'user-1', purpose: 'reset_password', replaceOutstanding: false });
  assert.equal(service.invalidateOutstanding({ userId: 'user-1', purpose: 'reset_password' }), 2);
  expectAuthError(() => service.consume({ token: first.token, purpose: 'reset_password' }), 'AUTH_TOKEN_INVALID');
  expectAuthError(() => service.consume({ token: second.token, purpose: 'reset_password' }), 'AUTH_TOKEN_INVALID');

  const third = service.issue({ userId: 'user-1', purpose: 'verify_email' });
  const fourth = service.issue({ userId: 'user-1', purpose: 'verify_email' });
  expectAuthError(() => service.consume({ token: third.token, purpose: 'verify_email' }), 'AUTH_TOKEN_INVALID');
  assert.equal(service.consume({ token: fourth.token, purpose: 'verify_email' }).userId, 'user-1');
  database.close();
});

test('hash collisions retry, and exhausted retries roll back replacement invalidation', () => {
  const database = createDatabase();
  const firstBytes = Buffer.alloc(32, 0x11);
  const secondBytes = Buffer.alloc(32, 0x22);
  const generated = [firstBytes, firstBytes, secondBytes];
  const service = createAuthTokenService(database, {
    clock: () => START_MS,
    randomBytes: () => generated.shift()
  });
  const first = service.issue({ userId: 'user-1', purpose: 'verify_email' });
  const second = service.issue({ userId: 'user-1', purpose: 'verify_email' });
  assert.notEqual(second.token, first.token);
  assert.equal(generated.length, 0);
  assert.equal(service.consume({ token: second.token, purpose: 'verify_email' }).userId, 'user-1');

  const reset = createAuthTokenService(database, {
    clock: () => START_MS,
    randomBytes: () => Buffer.alloc(32, 0x33),
    maxCollisionAttempts: 2
  });
  const surviving = reset.issue({ userId: 'user-1', purpose: 'reset_password' });
  const failure = expectAuthError(
    () => reset.issue({ userId: 'user-1', purpose: 'reset_password' }),
    'AUTH_TOKEN_GENERATION_FAILED'
  );
  assert.equal(String(failure).includes(surviving.token), false);
  assert.equal(reset.consume({ token: surviving.token, purpose: 'reset_password' }).userId, 'user-1');
  database.close();
});

test('database failures and consume callbacks roll back atomically without leaking internals', () => {
  const database = createDatabase();
  let byte = 1;
  const service = createAuthTokenService(database, {
    clock: () => START_MS,
    randomBytes: size => Buffer.alloc(size, byte++)
  });
  const original = service.issue({ userId: 'user-1', purpose: 'reset_password' });
  database.exec(`CREATE TRIGGER authTokens_test_failure
    BEFORE INSERT ON authTokens
    BEGIN SELECT RAISE(ABORT, 'super-sensitive-database-detail'); END`);
  const failure = expectAuthError(
    () => service.issue({ userId: 'user-1', purpose: 'reset_password' }),
    'AUTH_TOKEN_STORE_UNAVAILABLE'
  );
  assert.equal(String(failure).includes('super-sensitive'), false);
  assert.equal(String(failure).includes(original.token), false);
  database.exec('DROP TRIGGER authTokens_test_failure');

  const callbackFailure = expectAuthError(
    () => service.consume({ token: original.token, purpose: 'reset_password' }, () => {
      database.prepare(`UPDATE users SET passwordHash = 'new-hash' WHERE id = 'user-1'`).run();
      throw new Error(`do-not-leak:${original.token}`);
    }),
    'AUTH_TOKEN_STORE_UNAVAILABLE'
  );
  assert.equal(String(callbackFailure).includes('do-not-leak'), false);
  assert.equal(database.prepare(`SELECT passwordHash FROM users WHERE id = 'user-1'`).get().passwordHash, 'old-hash');

  service.consume({ token: original.token, purpose: 'reset_password' }, receipt => {
    database.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run('new-hash', receipt.userId);
  });
  assert.equal(database.prepare(`SELECT passwordHash FROM users WHERE id = 'user-1'`).get().passwordHash, 'new-hash');
  database.close();
});

test('competing consumers on separate SQLite connections cannot both consume one token', () => {
  const directory = mkdtempSync(join(tmpdir(), 'off-the-clock-auth-race-'));
  const filename = join(directory, 'auth.sqlite');
  let first;
  let second;
  try {
    first = createDatabase(filename);
    second = createDatabase(filename);
    const serviceA = createAuthTokenService(first, { clock: () => START_MS });
    const serviceB = createAuthTokenService(second, { clock: () => START_MS });
    const issued = serviceA.issue({ userId: 'user-1', purpose: 'verify_email' });

    const outcomes = [];
    for (const service of [serviceA, serviceB]) {
      try {
        outcomes.push({ ok: true, value: service.consume({ token: issued.token, purpose: 'verify_email' }) });
      } catch (error) {
        outcomes.push({ ok: false, error });
      }
    }
    assert.equal(outcomes.filter(outcome => outcome.ok).length, 1);
    const rejected = outcomes.find(outcome => !outcome.ok).error;
    assert.equal(rejected.code, 'AUTH_TOKEN_INVALID');
    assert.equal(rejected.message, INVALID_MESSAGE);
  } finally {
    first?.close();
    second?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('schema triggers make identity immutable and consumption irreversible', () => {
  const database = createDatabase();
  const service = createAuthTokenService(database, { clock: () => START_MS });
  const issued = service.issue({ userId: 'user-1', purpose: 'verify_email' });
  const hash = crypto.createHash('sha256').update(issued.token).digest('hex');
  assert.throws(() => database.prepare('UPDATE authTokens SET purpose = ? WHERE tokenHash = ?').run('reset_password', hash));
  service.consume({ token: issued.token, purpose: 'verify_email' });
  assert.throws(() => database.prepare('UPDATE authTokens SET consumedAt = NULL WHERE tokenHash = ?').run(hash));
  database.close();
});
