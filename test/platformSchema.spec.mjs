import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase } from '../server/src/migrations.js';
import { CREATE_TABLE_STATEMENTS } from '../server/src/schema.js';

const columnNames = (database, table) => new Set(
  database.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name)
);

test('launch persistence tables and indexes migrate idempotently', () => {
  const database = new DatabaseSync(':memory:');
  try {
    migrateDatabase(database);
    migrateDatabase(database);
    const tables = new Set(database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all().map(row => row.name));
    for (const table of [
      'calendarConnections', 'widgetSettings', 'bookingSettings', 'bookingPolicies',
      'bookingIntents', 'bookingHolds', 'bookingIdempotency', 'outboxEvents',
      'voiceSessionNonces', 'voiceToolReceipts', 'transcriptTurns',
      'billingSubscriptionHistory', 'billingCheckoutRequests'
    ]) assert.equal(tables.has(table), true, table);

    const checkoutColumns = columnNames(database, 'billingCheckoutRequests');
    for (const column of [
      'ownerId', 'idempotencyKeyHash', 'requestDigest', 'stripeSessionId',
      'stripeSubscriptionId', 'sessionUrlCiphertext', 'sessionUrlIv',
      'sessionUrlTag', 'sessionUrlKeyVersion', 'status', 'leaseExpiresAt',
      'expiresAt', 'providerCreatedAt', 'consumedAt', 'successUrl',
      'cancelUrl', 'integrationIdentifier'
    ]) assert.equal(checkoutColumns.has(column), true, column);

    const appointmentColumns = columnNames(database, 'appointments');
    for (const column of [
      'bookingIntentId', 'holdId', 'providerEventId', 'startAtUtc', 'endAtUtc',
      'lockStartAtUtc', 'lockEndAtUtc', 'timezone', 'policyRevision',
      'customerJson', 'locationJson', 'confirmedAt', 'updatedAt'
    ]) assert.equal(appointmentColumns.has(column), true, column);

    const callColumns = columnNames(database, 'calls');
    for (const column of [
      'accountSid', 'streamSid', 'destinationNumber', 'status',
      'aiInputTokens', 'aiOutputTokens', 'aiEstimatedCostMicros',
      'failureCode', 'completedAt', 'updatedAt'
    ]) assert.equal(callColumns.has(column), true, column);

    const indexes = new Set(database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index'"
    ).all().map(row => row.name));
    for (const index of [
      'business_profiles_twilio_number_unique',
      'business_profiles_twilio_sid_unique',
      'calls_call_sid_unique',
      'booking_holds_overlap',
      'appointments_overlap',
      'billing_subscription_history_current_owner',
      'billing_checkout_session_unique',
      'billing_checkout_one_active_owner'
    ]) assert.equal(indexes.has(index), true, index);
  } finally {
    database.close();
  }
});

test('legacy calls and appointments receive additive launch columns without data loss', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(CREATE_TABLE_STATEMENTS[0]);
    database.exec(`CREATE TABLE calls (
      id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, callSid TEXT,
      callerNumber TEXT, duration INTEGER, outcome TEXT, transcriptJson TEXT,
      summaryText TEXT, urgency TEXT, spamFiltered INTEGER NOT NULL DEFAULT 0,
      minutesBilled INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
    )`);
    database.exec(`CREATE TABLE appointments (
      id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, customerId TEXT, quoteId TEXT,
      serviceType TEXT, bookingMode TEXT, datetime TEXT, durationMinutes INTEGER,
      status TEXT, depositRequested INTEGER NOT NULL DEFAULT 0,
      depositPaid INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
    )`);
    database.prepare(`INSERT INTO users
      (id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,trialEndsAt,timezone,role,createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run('owner-1', null, 'owner@example.invalid', 'hash', 'Owner', 'Business',
      'Scale', 'active', null, 'America/Halifax', 'owner', '2026-09-29T00:00:00.000Z');
    database.prepare(`INSERT INTO calls
      (id,ownerId,callSid,callerNumber,createdAt) VALUES (?,?,?,?,?)`
    ).run('call-1', 'owner-1', 'CA00000000000000000000000000000000', '+19025550123', '2026-09-29T00:00:00.000Z');
    database.prepare(`INSERT INTO appointments
      (id,ownerId,datetime,durationMinutes,status,createdAt) VALUES (?,?,?,?,?,?)`
    ).run('appointment-1', 'owner-1', '2026-10-01T13:00:00.000Z', 45, 'CONFIRMED', '2026-09-29T00:00:00.000Z');

    migrateDatabase(database);

    assert.equal(database.prepare('SELECT callerNumber FROM calls WHERE id = ?').get('call-1').callerNumber, '+19025550123');
    assert.equal(database.prepare('SELECT datetime FROM appointments WHERE id = ?').get('appointment-1').datetime, '2026-10-01T13:00:00.000Z');
    assert.equal(columnNames(database, 'calls').has('accountSid'), true);
    assert.equal(columnNames(database, 'appointments').has('bookingIntentId'), true);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(Object.values(database.prepare('PRAGMA integrity_check').get())[0], 'ok');
  } finally {
    database.close();
  }
});

test('billing migration backfills immutable terminal subscription history without inventing deletion evidence', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys = ON');
    database.exec(CREATE_TABLE_STATEMENTS[0]);
    database.exec(`CREATE TABLE billingAccounts (
      ownerId TEXT PRIMARY KEY,
      stripeCustomerId TEXT NOT NULL UNIQUE,
      stripeSubscriptionId TEXT UNIQUE,
      stripePriceId TEXT,
      paymentMethodVerifiedAt TEXT,
      paymentFailedAt TEXT,
      graceEndsAt TEXT,
      currentPeriodEndAt TEXT,
      cancelAtPeriodEnd INTEGER NOT NULL DEFAULT 0,
      canceledAt TEXT,
      lastStripeEventCreatedAt INTEGER,
      lastStripeEventRank INTEGER,
      lastStripeEventId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`);
    database.exec(`CREATE TABLE billingEventReceipts (
      stripeEventId TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      objectId TEXT NOT NULL,
      eventCreatedAt INTEGER NOT NULL,
      eventDigest TEXT NOT NULL,
      outcome TEXT NOT NULL,
      sanitizedReceiptJson TEXT NOT NULL,
      resultJson TEXT NOT NULL,
      processedAt TEXT NOT NULL
    )`);
    database.prepare(`INSERT INTO users (
      id, ownerId, email, passwordHash, firstName, businessName, plan,
      planStatus, trialEndsAt, paymentFailedAt, timezone, role, createdAt
    ) VALUES (?, NULL, ?, 'hash', 'Owner', 'Business', 'Operator',
      'canceled', NULL, NULL, 'UTC', 'owner', ?)`
    ).run('owner-billing-legacy', 'legacy-billing@example.invalid', '2026-09-01T00:00:00.000Z');
    database.prepare(`INSERT INTO billingAccounts (
      ownerId, stripeCustomerId, stripeSubscriptionId, stripePriceId,
      paymentMethodVerifiedAt, cancelAtPeriodEnd, canceledAt,
      lastStripeEventCreatedAt, lastStripeEventRank, lastStripeEventId,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 100, ?, ?, ?)`
    ).run(
      'owner-billing-legacy', 'cus_legacy', 'sub_legacy', 'price_legacy',
      '2026-09-01T00:00:00.000Z', '2026-09-20T00:00:00.000Z',
      1790000000, 'evt_legacy_deleted',
      '2026-09-01T00:00:00.000Z', '2026-09-20T00:00:00.000Z'
    );
    database.prepare(`INSERT INTO billingEventReceipts (
      stripeEventId, ownerId, eventType, objectId, eventCreatedAt,
      eventDigest, outcome, sanitizedReceiptJson, resultJson, processedAt
    ) VALUES (?, ?, 'customer.subscription.deleted', ?, ?, 'digest',
      'APPLIED', '{}', '{}', ?)`
    ).run(
      'evt_legacy_deleted', 'owner-billing-legacy', 'sub_legacy',
      1790000000, '2026-09-20T00:00:00.000Z'
    );

    migrateDatabase(database);
    migrateDatabase(database);
    assert.deepEqual({ ...database.prepare(`
      SELECT stripeSubscriptionId, ownerId, stripeCustomerId, status,
        terminalEventId, terminalEventCreatedAt
      FROM billingSubscriptionHistory WHERE stripeSubscriptionId='sub_legacy'
    `).get() }, {
      stripeSubscriptionId: 'sub_legacy',
      ownerId: 'owner-billing-legacy',
      stripeCustomerId: 'cus_legacy',
      status: 'TERMINAL',
      terminalEventId: 'evt_legacy_deleted',
      terminalEventCreatedAt: 1790000000
    });
    assert.equal(database.prepare(
      "SELECT COUNT(*) AS count FROM billingSubscriptionHistory WHERE stripeSubscriptionId='sub_legacy'"
    ).get().count, 1);
    assert.throws(
      () => database.prepare(
        "UPDATE billingEventReceipts SET outcome='IGNORED_STALE' WHERE stripeEventId='evt_legacy_deleted'"
      ).run(),
      /billing event receipts are immutable/
    );
    assert.throws(
      () => database.prepare(
        "UPDATE billingSubscriptionHistory SET status='CURRENT' WHERE stripeSubscriptionId='sub_legacy'"
      ).run(),
      /billing subscription history evidence is immutable/
    );
    assert.throws(
      () => database.prepare(
        "DELETE FROM billingSubscriptionHistory WHERE stripeSubscriptionId='sub_legacy'"
      ).run(),
      /billing subscription history evidence is immutable/
    );
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(Object.values(database.prepare('PRAGMA integrity_check').get())[0], 'ok');
  } finally {
    database.close();
  }
});
