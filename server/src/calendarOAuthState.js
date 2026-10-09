import {usageOwnerQuery} from './billingUsagePolicy.js';
import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";

const OWNER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const OPAQUE_STATE = /^[A-Za-z0-9_-]+$/;
const MIN_TTL_MS = 5 * 60 * 1000;
const MAX_TTL_MS = 15 * 60 * 1000;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const ENTROPY_BYTES = 32;
const MAX_STATE_BYTES = 128;
const MAX_COLLISION_ATTEMPTS = 5;

const INVALID_STATE_MESSAGE =
  "The calendar authorization request is invalid or no longer available.";
const ISSUE_FAILURE_MESSAGE =
  "The calendar authorization request could not be created.";
const STORE_FAILURE_MESSAGE =
  "The calendar authorization request is temporarily unavailable.";

export class CalendarOAuthStateError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = "CalendarOAuthStateError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, message, statusCode) {
  throw new CalendarOAuthStateError(code, message, statusCode);
}

function invalidState(code) {
  fail(code, INVALID_STATE_MESSAGE, 403);
}

function storeFailure() {
  fail("CALENDAR_OAUTH_STATE_STORE_FAILURE", STORE_FAILURE_MESSAGE, 503);
}

function normalizeOwnerId(ownerId) {
  if (
    typeof ownerId !== "string" ||
    ownerId !== ownerId.trim() ||
    !OWNER_ID.test(ownerId)
  ) {
    fail("INVALID_CALENDAR_OAUTH_OWNER", ISSUE_FAILURE_MESSAGE, 400);
  }
  return ownerId;
}

function readClock(clock) {
  let raw;
  try {
    raw = clock();
  } catch {
    fail("INVALID_CALENDAR_OAUTH_CLOCK", STORE_FAILURE_MESSAGE, 500);
  }
  const value = raw instanceof Date ? raw.getTime() : raw;
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("INVALID_CALENDAR_OAUTH_CLOCK", STORE_FAILURE_MESSAGE, 500);
  }
  return value;
}

function stateHash(state) {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

function normalizeState(state) {
  if (
    typeof state !== "string" ||
    state.length < 43 ||
    state.length > 171 ||
    !OPAQUE_STATE.test(state)
  ) {
    invalidState("CALENDAR_OAUTH_STATE_MALFORMED");
  }

  let decoded;
  try {
    decoded = Buffer.from(state, "base64url");
  } catch {
    invalidState("CALENDAR_OAUTH_STATE_MALFORMED");
  }
  if (
    decoded.length < ENTROPY_BYTES ||
    decoded.length > MAX_STATE_BYTES ||
    decoded.toString("base64url") !== state
  ) {
    invalidState("CALENDAR_OAUTH_STATE_MALFORMED");
  }
  return state;
}

function randomState(randomBytes) {
  let entropy;
  try {
    entropy = randomBytes(ENTROPY_BYTES);
  } catch {
    fail("INVALID_CALENDAR_OAUTH_RANDOM_SOURCE", STORE_FAILURE_MESSAGE, 500);
  }
  if (
    !(Buffer.isBuffer(entropy) || entropy instanceof Uint8Array) ||
    entropy.byteLength !== ENTROPY_BYTES
  ) {
    fail("INVALID_CALENDAR_OAUTH_RANDOM_SOURCE", STORE_FAILURE_MESSAGE, 500);
  }
  return Buffer.from(entropy).toString("base64url");
}

function isSingleChange(result) {
  return result && Number(result.changes) === 1;
}

function isNoChange(result) {
  return result && Number(result.changes) === 0;
}

function prepareStatements(database) {
  try {
    const statements = {
      insert: usageOwnerQuery(database)(`
        INSERT OR IGNORE INTO calendarOAuthStates (
          stateHash, ownerId, createdAt, expiresAt, consumedAt
        ) VALUES (?, ?, ?, ?, NULL)
      `),
      byHash: database.prepare(`
        SELECT expiresAt, consumedAt
        FROM calendarOAuthStates
        WHERE stateHash = ?
      `),
      consume: usageOwnerQuery(database)(`
        UPDATE calendarOAuthStates
        SET consumedAt = ?
        WHERE stateHash = ?
          AND consumedAt IS NULL
          AND expiresAt > ?
        RETURNING ownerId, expiresAt, consumedAt
      `),
    };
    if (
      typeof statements.insert.run !== "function" ||
      typeof statements.byHash.get !== "function" ||
      typeof statements.consume.get !== "function"
    ) {
      storeFailure();
    }
    return statements;
  } catch (error) {
    if (error instanceof CalendarOAuthStateError) throw error;
    storeFailure();
  }
}

/**
 * Issues and atomically consumes short-lived, opaque Google Calendar OAuth
 * state values. The backing SQLite table stores only a SHA-256 digest of the
 * state. All methods are synchronous so a callback can consume state before
 * performing any provider or account mutation.
 */
export function createCalendarOAuthStateService({
  database,
  clock = () => Date.now(),
  randomBytes = nodeRandomBytes,
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  if (!database || typeof database.prepare !== "function") {
    fail("INVALID_CALENDAR_OAUTH_STATE_DATABASE", STORE_FAILURE_MESSAGE, 500);
  }
  if (typeof clock !== "function" || typeof randomBytes !== "function") {
    fail("INVALID_CALENDAR_OAUTH_STATE_DEPENDENCY", STORE_FAILURE_MESSAGE, 500);
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < MIN_TTL_MS || ttlMs > MAX_TTL_MS) {
    fail("INVALID_CALENDAR_OAUTH_STATE_TTL", ISSUE_FAILURE_MESSAGE, 500);
  }

  const statements = prepareStatements(database);

  return Object.freeze({
    issue(ownerIdValue) {
      const ownerId = normalizeOwnerId(ownerIdValue);
      const createdAt = readClock(clock);
      const expiresAt = createdAt + ttlMs;
      if (!Number.isSafeInteger(expiresAt)) {
        fail("INVALID_CALENDAR_OAUTH_CLOCK", STORE_FAILURE_MESSAGE, 500);
      }

      for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt += 1) {
        const state = randomState(randomBytes);
        const digest = stateHash(state);
        let insertResult;
        try {
          insertResult = statements.insert.run(digest, ownerId, createdAt, expiresAt);
        } catch {
          storeFailure();
        }

        if (isSingleChange(insertResult)) {
          return Object.freeze({ state, expiresAt });
        }
        if (!isNoChange(insertResult)) storeFailure();

        let collision;
        try {
          collision = statements.byHash.get(digest);
        } catch {
          storeFailure();
        }
        if (!collision) storeFailure();
      }

      fail("CALENDAR_OAUTH_STATE_COLLISION", STORE_FAILURE_MESSAGE, 503);
    },

    consume(stateValue) {
      const state = normalizeState(stateValue);
      const consumedAt = readClock(clock);
      const digest = stateHash(state);
      let consumed;
      let existing;
      try {
        consumed = statements.consume.get(consumedAt, digest, consumedAt);
        if (!consumed) existing = statements.byHash.get(digest);
      } catch {
        storeFailure();
      }

      if (consumed) {
        if (
          typeof consumed.ownerId !== "string" ||
          !OWNER_ID.test(consumed.ownerId) ||
          !Number.isSafeInteger(consumed.expiresAt) ||
          consumed.expiresAt <= consumedAt ||
          consumed.consumedAt !== consumedAt
        ) {
          storeFailure();
        }
        return Object.freeze({ ownerId: consumed.ownerId });
      }

      if (!existing) invalidState("CALENDAR_OAUTH_STATE_UNKNOWN");
      if (existing.consumedAt !== null && existing.consumedAt !== undefined) {
        invalidState("CALENDAR_OAUTH_STATE_REPLAYED");
      }
      if (!Number.isSafeInteger(existing.expiresAt)) storeFailure();
      if (existing.expiresAt <= consumedAt) {
        invalidState("CALENDAR_OAUTH_STATE_EXPIRED");
      }
      storeFailure();
    },
  });
}
