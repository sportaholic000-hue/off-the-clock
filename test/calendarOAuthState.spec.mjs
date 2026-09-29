import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  CalendarOAuthStateError,
  createCalendarOAuthStateService,
} from "../server/src/calendarOAuthState.js";

const OWNER_A = "owner-calendar-a";
const OWNER_B = "owner-calendar-b";
const BASE_TIME = Date.parse("2026-09-29T12:00:00.000Z");
const INVALID_MESSAGE =
  "The calendar authorization request is invalid or no longer available.";

const STATE_SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL
  );
  CREATE TABLE IF NOT EXISTS calendarOAuthStates (
    stateHash TEXT PRIMARY KEY NOT NULL,
    ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL,
    consumedAt INTEGER,
    CHECK (length(stateHash) = 64),
    CHECK (stateHash NOT GLOB '*[^0-9a-f]*'),
    CHECK (createdAt >= 0),
    CHECK (expiresAt > createdAt),
    CHECK (consumedAt IS NULL OR consumedAt >= createdAt)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS calendarOAuthStates_unconsumedExpiry
    ON calendarOAuthStates(expiresAt)
    WHERE consumedAt IS NULL;
  CREATE INDEX IF NOT EXISTS calendarOAuthStates_ownerCreated
    ON calendarOAuthStates(ownerId, createdAt DESC);
`;

function openDatabase(filename = ":memory:") {
  const database = new DatabaseSync(filename);
  database.exec(STATE_SCHEMA);
  const addOwner = database.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)");
  addOwner.run(OWNER_A);
  addOwner.run(OWNER_B);
  return database;
}

function bytes(fill) {
  return Buffer.alloc(32, fill);
}

function hash(state) {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

function errorFrom(work) {
  try {
    work();
  } catch (error) {
    return error;
  }
  assert.fail("Expected operation to fail.");
}

function assertCode(code, message = undefined) {
  return (error) => {
    assert.equal(error instanceof CalendarOAuthStateError, true);
    assert.equal(error.code, code);
    if (message !== undefined) assert.equal(error.message, message);
    return true;
  };
}

test("issue returns 32-byte base64url entropy and stores only its SHA-256 hash", () => {
  const database = openDatabase();
  try {
    const entropy = bytes(0x11);
    const service = createCalendarOAuthStateService({
      database,
      clock: () => BASE_TIME,
      randomBytes: (size) => {
        assert.equal(size, 32);
        return entropy;
      },
    });

    const issued = service.issue(OWNER_A);
    assert.deepEqual(issued, {
      state: entropy.toString("base64url"),
      expiresAt: BASE_TIME + 10 * 60 * 1000,
    });
    assert.equal(Object.isFrozen(issued), true);

    const row = database.prepare("SELECT * FROM calendarOAuthStates").get();
    assert.deepEqual({ ...row }, {
      stateHash: hash(issued.state),
      ownerId: OWNER_A,
      createdAt: BASE_TIME,
      expiresAt: issued.expiresAt,
      consumedAt: null,
    });
    assert.equal(JSON.stringify(row).includes(issued.state), false);
    assert.equal(
      database.prepare("PRAGMA table_info(calendarOAuthStates)").all()
        .some((column) => column.name === "state"),
      false,
    );
  } finally {
    database.close();
  }
});
test("consume atomically marks a live state and returns its persisted owner binding", () => {
  const database = openDatabase();
  try {
    let now = BASE_TIME;
    const service = createCalendarOAuthStateService({
      database,
      clock: () => now,
      randomBytes: () => bytes(0x22),
    });
    const { state } = service.issue(OWNER_B);
    now += 1_000;

    const result = service.consume(state);
    assert.deepEqual(result, { ownerId: OWNER_B });
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual({ ...database.prepare(`
      SELECT ownerId, consumedAt FROM calendarOAuthStates WHERE stateHash = ?
    `).get(hash(state)) }, { ownerId: OWNER_B, consumedAt: now });
  } finally {
    database.close();
  }
});

test("a consumed state is rejected on replay with the generic public message", () => {
  const database = openDatabase();
  try {
    const service = createCalendarOAuthStateService({
      database,
      clock: () => BASE_TIME,
      randomBytes: () => bytes(0x33),
    });
    const { state } = service.issue(OWNER_A);
    service.consume(state);
    assert.throws(
      () => service.consume(state),
      assertCode("CALENDAR_OAUTH_STATE_REPLAYED", INVALID_MESSAGE),
    );
  } finally {
    database.close();
  }
});

test("an expired state fails closed and is not marked consumed", () => {
  const database = openDatabase();
  try {
    let now = BASE_TIME;
    const service = createCalendarOAuthStateService({
      database,
      clock: () => now,
      randomBytes: () => bytes(0x44),
      ttlMs: 5 * 60 * 1000,
    });
    const issued = service.issue(OWNER_A);
    now = issued.expiresAt;
    assert.throws(
      () => service.consume(issued.state),
      assertCode("CALENDAR_OAUTH_STATE_EXPIRED", INVALID_MESSAGE),
    );
    assert.equal(
      database.prepare("SELECT consumedAt FROM calendarOAuthStates").get().consumedAt,
      null,
    );
  } finally {
    database.close();
  }
});

test("malformed and unknown state values fail closed without reflecting input", () => {
  const database = openDatabase();
  try {
    const service = createCalendarOAuthStateService({ database, clock: () => BASE_TIME });
    for (const malformed of [
      "short",
      "calendar-secret-that-must-not-appear-in-errors!",
      `${"A".repeat(42)}B`,
      null,
    ]) {
      const error = errorFrom(() => service.consume(malformed));
      assert.equal(error.code, "CALENDAR_OAUTH_STATE_MALFORMED");
      assert.equal(error.message, INVALID_MESSAGE);
      assert.equal(error.message.includes(String(malformed)), false);
    }

    const unknown = bytes(0x55).toString("base64url");
    const error = errorFrom(() => service.consume(unknown));
    assert.equal(error.code, "CALENDAR_OAUTH_STATE_UNKNOWN");
    assert.equal(error.message, INVALID_MESSAGE);
    assert.equal(error.message.includes(unknown), false);
  } finally {
    database.close();
  }
});

test("a digest collision is retried without overwriting the existing owner", () => {
  const database = openDatabase();
  try {
    const colliding = bytes(0x66);
    const replacement = bytes(0x67);
    const collidingState = colliding.toString("base64url");
    database.prepare(`
      INSERT INTO calendarOAuthStates (
        stateHash, ownerId, createdAt, expiresAt, consumedAt
      ) VALUES (?, ?, ?, ?, NULL)
    `).run(hash(collidingState), OWNER_A, BASE_TIME, BASE_TIME + 600_000);

    let calls = 0;
    const service = createCalendarOAuthStateService({
      database,
      clock: () => BASE_TIME,
      randomBytes: () => (calls++ === 0 ? colliding : replacement),
    });
    const issued = service.issue(OWNER_B);

    assert.equal(calls, 2);
    assert.equal(issued.state, replacement.toString("base64url"));
    assert.deepEqual(database.prepare(`
      SELECT ownerId FROM calendarOAuthStates ORDER BY stateHash
    `).all().map((row) => row.ownerId).sort(), [OWNER_A, OWNER_B]);
    assert.equal(
      database.prepare("SELECT ownerId FROM calendarOAuthStates WHERE stateHash = ?")
        .get(hash(collidingState)).ownerId,
      OWNER_A,
    );
  } finally {
    database.close();
  }
});

test("collision exhaustion fails safely after a bounded number of attempts", () => {
  const database = openDatabase();
  try {
    const entropy = bytes(0x68);
    const state = entropy.toString("base64url");
    database.prepare(`
      INSERT INTO calendarOAuthStates (
        stateHash, ownerId, createdAt, expiresAt, consumedAt
      ) VALUES (?, ?, ?, ?, NULL)
    `).run(hash(state), OWNER_A, BASE_TIME, BASE_TIME + 600_000);
    let calls = 0;
    const service = createCalendarOAuthStateService({
      database,
      clock: () => BASE_TIME,
      randomBytes: () => {
        calls += 1;
        return entropy;
      },
    });
    assert.throws(
      () => service.issue(OWNER_B),
      assertCode("CALENDAR_OAUTH_STATE_COLLISION"),
    );
    assert.equal(calls, 5);
  } finally {
    database.close();
  }
});

test("database failures are replaced by stable secret-safe errors", () => {
  const database = openDatabase();
  try {
    database.exec(`
      CREATE TRIGGER reject_calendar_oauth_state
      BEFORE INSERT ON calendarOAuthStates
      BEGIN SELECT RAISE(ABORT, 'database-secret-must-not-leak'); END;
    `);
    const service = createCalendarOAuthStateService({
      database,
      clock: () => BASE_TIME,
      randomBytes: () => bytes(0x77),
    });
    const error = errorFrom(() => service.issue(OWNER_A));
    assert.equal(error.code, "CALENDAR_OAUTH_STATE_STORE_FAILURE");
    assert.equal(error.statusCode, 503);
    assert.equal(error.message.includes("database-secret-must-not-leak"), false);
    assert.equal(error.cause, undefined);
  } finally {
    database.close();
  }
});

test("a reentrant competing consumer can win, but exactly one consumer succeeds", () => {
  const database = openDatabase();
  try {
    const competitor = createCalendarOAuthStateService({
      database,
      clock: () => BASE_TIME + 1,
    });
    let state;
    let reentered = false;
    let winningResult;
    const reentrantDatabase = {
      prepare(sql) {
        const statement = database.prepare(sql);
        if (!sql.includes("UPDATE calendarOAuthStates")) return statement;
        return {
          get(...parameters) {
            if (!reentered) {
              reentered = true;
              winningResult = competitor.consume(state);
            }
            return statement.get(...parameters);
          },
        };
      },
    };
    const contender = createCalendarOAuthStateService({
      database: reentrantDatabase,
      clock: () => BASE_TIME + 1,
      randomBytes: () => bytes(0x78),
    });
    state = contender.issue(OWNER_A).state;

    assert.throws(
      () => contender.consume(state),
      assertCode("CALENDAR_OAUTH_STATE_REPLAYED", INVALID_MESSAGE),
    );
    assert.deepEqual(winningResult, { ownerId: OWNER_A });
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM calendarOAuthStates WHERE consumedAt IS NOT NULL")
        .get().count,
      1,
    );
  } finally {
    database.close();
  }
});

test("state survives a service and database restart until its one successful consume", () => {
  const directory = mkdtempSync(join(tmpdir(), "off-clock-calendar-oauth-"));
  const filename = join(directory, "state.sqlite");
  let state;
  try {
    const firstDatabase = openDatabase(filename);
    try {
      const firstService = createCalendarOAuthStateService({
        database: firstDatabase,
        clock: () => BASE_TIME,
        randomBytes: () => bytes(0x79),
      });
      state = firstService.issue(OWNER_B).state;
    } finally {
      firstDatabase.close();
    }

    const secondDatabase = openDatabase(filename);
    try {
      const secondService = createCalendarOAuthStateService({
        database: secondDatabase,
        clock: () => BASE_TIME + 1_000,
      });
      assert.deepEqual(secondService.consume(state), { ownerId: OWNER_B });
    } finally {
      secondDatabase.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("owner, TTL, clock, and random-source validation fails before unsafe state use", () => {
  const database = openDatabase();
  try {
    for (const ownerId of ["", " owner-calendar-a", "owner/calendar", "a".repeat(129)]) {
      const service = createCalendarOAuthStateService({ database, clock: () => BASE_TIME });
      assert.throws(() => service.issue(ownerId), assertCode("INVALID_CALENDAR_OAUTH_OWNER"));
    }
    for (const ttlMs of [299_999, 900_001, 300_000.5]) {
      assert.throws(
        () => createCalendarOAuthStateService({ database, ttlMs }),
        assertCode("INVALID_CALENDAR_OAUTH_STATE_TTL"),
      );
    }

    const badClock = createCalendarOAuthStateService({
      database,
      clock: () => Number.NaN,
    });
    assert.throws(() => badClock.issue(OWNER_A), assertCode("INVALID_CALENDAR_OAUTH_CLOCK"));

    const badRandom = createCalendarOAuthStateService({
      database,
      clock: () => BASE_TIME,
      randomBytes: () => Buffer.alloc(31),
    });
    assert.throws(
      () => badRandom.issue(OWNER_A),
      assertCode("INVALID_CALENDAR_OAUTH_RANDOM_SOURCE"),
    );
  } finally {
    database.close();
  }
});
