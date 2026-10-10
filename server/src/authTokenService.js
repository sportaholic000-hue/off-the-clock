import crypto from 'node:crypto';

const TOKEN_BYTES = 32;
const MAX_TOKEN_BYTES = 64;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const GENERIC_INVALID_MESSAGE = 'This link is invalid or has expired.';
const GENERIC_OPERATION_MESSAGE = 'We could not process this link. Please request a new one.';

export const AUTH_TOKEN_PURPOSES = Object.freeze({
  VERIFY_EMAIL: 'verify_email',
  RESET_PASSWORD: 'reset_password',
  STAFF_INVITE: 'staff_invite'
});

export const AUTH_TOKEN_TTL_POLICY = Object.freeze({
  [AUTH_TOKEN_PURPOSES.VERIFY_EMAIL]: Object.freeze({
    defaultMs: 24 * 60 * 60 * 1000,
    minMs: 5 * 60 * 1000,
    maxMs: 7 * 24 * 60 * 60 * 1000
  }),
  [AUTH_TOKEN_PURPOSES.RESET_PASSWORD]: Object.freeze({
    defaultMs: 30 * 60 * 1000,
    minMs: 5 * 60 * 1000,
    maxMs: 24 * 60 * 60 * 1000
  }),
  [AUTH_TOKEN_PURPOSES.STAFF_INVITE]: Object.freeze({
    defaultMs: 24 * 60 * 60 * 1000,
    minMs: 5 * 60 * 1000,
    maxMs: 24 * 60 * 60 * 1000
  })
});

export const AUTH_TOKEN_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS authTokens (
  tokenHash TEXT PRIMARY KEY
    CHECK(length(tokenHash) = 64 AND tokenHash NOT GLOB '*[^0-9a-f]*'),
  userId TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify_email', 'reset_password', 'staff_invite')),
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  consumedAt TEXT,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  CHECK(expiresAt > createdAt),
  CHECK(consumedAt IS NULL OR consumedAt >= createdAt)
) STRICT;

CREATE INDEX IF NOT EXISTS authTokens_user_purpose_outstanding_idx
  ON authTokens(userId, purpose, expiresAt)
  WHERE consumedAt IS NULL;

CREATE TRIGGER IF NOT EXISTS authTokens_immutable_identity
BEFORE UPDATE OF tokenHash, userId, purpose, expiresAt, createdAt ON authTokens
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'auth token identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS authTokens_consumed_once
BEFORE UPDATE OF consumedAt ON authTokens
FOR EACH ROW
WHEN OLD.consumedAt IS NOT NULL OR NEW.consumedAt IS NULL
BEGIN
  SELECT RAISE(ABORT, 'auth token consumption is irreversible');
END;
`;

export class AuthTokenError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthTokenError';
    this.code = code;
  }
}

function plainRecord(value) {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function inputSnapshot(value, fields, failure) {
  if (!plainRecord(value)) throw failure();
  const snapshot = Object.create(null);
  try {
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (descriptor && !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw failure();
      snapshot[field] = descriptor?.value;
    }
  } catch (error) {
    if (error instanceof AuthTokenError) throw error;
    throw failure();
  }
  return snapshot;
}

function invalidRequest() {
  return new AuthTokenError('AUTH_TOKEN_REQUEST_INVALID', 'The token request is invalid.');
}

function invalidToken() {
  return new AuthTokenError('AUTH_TOKEN_INVALID', GENERIC_INVALID_MESSAGE);
}

function storeUnavailable() {
  return new AuthTokenError('AUTH_TOKEN_STORE_UNAVAILABLE', GENERIC_OPERATION_MESSAGE);
}

function generationFailed() {
  return new AuthTokenError('AUTH_TOKEN_GENERATION_FAILED', GENERIC_OPERATION_MESSAGE);
}

function purposePolicy(purpose) {
  return Object.prototype.hasOwnProperty.call(AUTH_TOKEN_TTL_POLICY, purpose)
    ? AUTH_TOKEN_TTL_POLICY[purpose]
    : null;
}

function requiredPurpose(value, { publicFailure = false } = {}) {
  if (typeof value !== 'string' || !purposePolicy(value)) {
    throw publicFailure ? invalidToken() : invalidRequest();
  }
  return value;
}

function requiredUserId(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || value.trim() !== value || value.includes('\0')) {
    throw invalidRequest();
  }
  return value;
}

function ttlFor(purpose, value) {
  const policy = purposePolicy(purpose);
  if (value === undefined) return policy.defaultMs;
  if (!Number.isSafeInteger(value) || value < policy.minMs || value > policy.maxMs) {
    throw invalidRequest();
  }
  return value;
}

function clockInstant(clock) {
  const value = clock();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw storeUnavailable();
  return date;
}

export function isAuthToken(value) {
  if (typeof value !== 'string' || value.length < 43 || value.length > 86 || !BASE64URL.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length >= TOKEN_BYTES && decoded.length <= MAX_TOKEN_BYTES && decoded.toString('base64url') === value;
}

export function hashAuthToken(token) {
  if (!isAuthToken(token)) throw invalidToken();
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function generatedToken(randomBytes) {
  let bytes;
  try {
    bytes = randomBytes(TOKEN_BYTES);
  } catch {
    throw generationFailed();
  }
  if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array)) throw generationFailed();
  const buffer = Buffer.from(bytes);
  if (buffer.length < TOKEN_BYTES || buffer.length > MAX_TOKEN_BYTES) throw generationFailed();
  const token = buffer.toString('base64url');
  if (!isAuthToken(token)) throw generationFailed();
  return token;
}

function isHashCollision(error) {
  return error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

function immediate(database, work) {
  if (typeof database.transaction === 'function') {
    const transaction = database.transaction(work);
    return typeof transaction.immediate === 'function' ? transaction.immediate() : transaction();
  }
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* preserve the original failure */ }
    throw error;
  }
}

function assertDatabase(database) {
  if (database === null || typeof database !== 'object' ||
      typeof database.prepare !== 'function' || typeof database.exec !== 'function') {
    throw new TypeError('A synchronous SQLite database is required.');
  }
}

export function installAuthTokenSchema(database) {
  assertDatabase(database);
  const existing = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='authTokens'").get();
  if (existing && !existing.sql.includes("'staff_invite'")) {
    // SQLite cannot alter a CHECK constraint. Retain issued and consumed tokens
    // while replacing the table, then reinstall its index and immutable triggers.
    immediate(database, () => {
      database.exec(`DROP TRIGGER IF EXISTS authTokens_immutable_identity;
        DROP TRIGGER IF EXISTS authTokens_consumed_once;
        CREATE TABLE authTokens_staff_upgrade (
          tokenHash TEXT PRIMARY KEY CHECK(length(tokenHash)=64 AND tokenHash NOT GLOB '*[^0-9a-f]*'),
          userId TEXT NOT NULL,
          purpose TEXT NOT NULL CHECK(purpose IN ('verify_email','reset_password','staff_invite')),
          expiresAt TEXT NOT NULL, createdAt TEXT NOT NULL, consumedAt TEXT,
          FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
          CHECK(expiresAt > createdAt), CHECK(consumedAt IS NULL OR consumedAt >= createdAt)
        ) STRICT;
        INSERT INTO authTokens_staff_upgrade SELECT * FROM authTokens;
        DROP TABLE authTokens;
        ALTER TABLE authTokens_staff_upgrade RENAME TO authTokens;`);
    });
  }
  database.exec(AUTH_TOKEN_SCHEMA_SQL);
}

export function createAuthTokenService(database, {
  clock = () => new Date(),
  randomBytes = crypto.randomBytes,
  maxCollisionAttempts = 5
} = {}) {
  assertDatabase(database);
  if (typeof clock !== 'function' || typeof randomBytes !== 'function' ||
      !Number.isSafeInteger(maxCollisionAttempts) || maxCollisionAttempts < 1 || maxCollisionAttempts > 20) {
    throw new TypeError('Auth token service options are invalid.');
  }

  let insertToken;
  let consumeToken;
  let invalidateTokens;
  try {
    insertToken = database.prepare(`INSERT INTO authTokens
      (tokenHash, userId, purpose, expiresAt, createdAt, consumedAt)
      VALUES (?, ?, ?, ?, ?, NULL)`);
    consumeToken = database.prepare(`UPDATE authTokens
      SET consumedAt = ?
      WHERE tokenHash = ? AND purpose = ? AND consumedAt IS NULL AND expiresAt > ?
      RETURNING userId, purpose, expiresAt, createdAt, consumedAt`);
    invalidateTokens = database.prepare(`UPDATE authTokens
      SET consumedAt = ?
      WHERE userId = ? AND purpose = ? AND consumedAt IS NULL`);
  } catch {
    throw storeUnavailable();
  }

  function issue(input) {
    const values = inputSnapshot(input, ['userId', 'purpose', 'ttlMs', 'replaceOutstanding'], invalidRequest);
    const userId = requiredUserId(values.userId);
    const purpose = requiredPurpose(values.purpose);
    const ttlMs = ttlFor(purpose, values.ttlMs);
    const replaceOutstanding = values.replaceOutstanding === undefined ? true : values.replaceOutstanding;
    if (typeof replaceOutstanding !== 'boolean') throw invalidRequest();

    try {
      return immediate(database, () => {
        const created = clockInstant(clock);
        const createdAt = created.toISOString();
        const expiresAt = new Date(created.getTime() + ttlMs).toISOString();

        if (replaceOutstanding) invalidateTokens.run(createdAt, userId, purpose);

        for (let attempt = 0; attempt < maxCollisionAttempts; attempt += 1) {
          const token = generatedToken(randomBytes);
          const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
          try {
            insertToken.run(tokenHash, userId, purpose, expiresAt, createdAt);
            return Object.freeze({ token, purpose, expiresAt, createdAt });
          } catch (error) {
            if (!isHashCollision(error)) throw error;
          }
        }
        throw generationFailed();
      });
    } catch (error) {
      if (error instanceof AuthTokenError) throw error;
      throw storeUnavailable();
    }
  }

  function consume(input, onConsume) {
    if (onConsume !== undefined && typeof onConsume !== 'function') throw invalidToken();
    const values = inputSnapshot(input, ['token', 'purpose'], invalidToken);
    const purpose = requiredPurpose(values.purpose, { publicFailure: true });
    const tokenHash = hashAuthToken(values.token);

    try {
      return immediate(database, () => {
        const consumedAt = clockInstant(clock).toISOString();
        const row = consumeToken.get(consumedAt, tokenHash, purpose, consumedAt);
        if (!row) throw invalidToken();
        const receipt = Object.freeze({
          userId: row.userId,
          purpose: row.purpose,
          expiresAt: row.expiresAt,
          createdAt: row.createdAt,
          consumedAt: row.consumedAt
        });
        if (onConsume) {
          const result = onConsume(receipt);
          if (result !== null && (typeof result === 'object' || typeof result === 'function') &&
              typeof result.then === 'function') {
            throw storeUnavailable();
          }
        }
        return receipt;
      });
    } catch (error) {
      if (error instanceof AuthTokenError) throw error;
      throw storeUnavailable();
    }
  }

  function invalidateOutstanding(input) {
    const values = inputSnapshot(input, ['userId', 'purpose'], invalidRequest);
    const userId = requiredUserId(values.userId);
    const purpose = requiredPurpose(values.purpose);
    try {
      return immediate(database, () => {
        const consumedAt = clockInstant(clock).toISOString();
        return Number(invalidateTokens.run(consumedAt, userId, purpose).changes);
      });
    } catch (error) {
      if (error instanceof AuthTokenError) throw error;
      throw storeUnavailable();
    }
  }

  return Object.freeze({ issue, consume, invalidateOutstanding });
}
