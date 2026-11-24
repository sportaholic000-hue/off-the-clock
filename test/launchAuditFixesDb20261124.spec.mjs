import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fixture, at } from './leadCaptureRepair20261006Fixture.mjs';
import { createOwnerAlertService } from '../server/src/ownerAlertService.js';
import { createQuoteEmailService } from '../server/src/quoteEmailService.js';
import { createSnapshot } from '../server/src/backups.js';
import { harness } from './voiceLifecycle20261006Fixture.mjs';
import { quoteEmailFixture, environment } from './quoteEmailFixture.mjs';

test('ownerAlertService: explicit retry unblocks OWNER_EMAIL_CHANGED and delivers to the new email with a fresh idempotency key', async t => {
  const f = fixture(t), c = f.context();
  await f.voice(c).tool('flagUrgent', { reason: 'complaint', summary: '[SYNTHETIC] callback' });
  let now = Date.parse(at);
  const sent = [];
  let fail = true;
  const service = createOwnerAlertService({
    database: f.db,
    ownerQuery: f.ownerQuery,
    clock: () => now,
    ready: () => true,
    environment: { EMAIL_FROM: 'alerts@example.invalid' },
    send: async msg => {
      sent.push(msg);
      if (fail) throw Error('SYNTHETIC_OUTAGE');
      return { accepted: true, id: 'SYNTHETIC-EMAIL-' + sent.length };
    }
  });
  await service.dispatchOnce();
  f.db.prepare('UPDATE users SET email=? WHERE id=?').run('updated-owner@example.invalid', c.ownerId);
  now += 2000;
  await service.dispatchOnce();
  const blocked = f.db.prepare("SELECT * FROM ownerAlerts WHERE ownerId=? AND eventType='voice.urgent_flagged'").get(c.ownerId);
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.lastErrorCode, 'OWNER_EMAIL_CHANGED');

  // Owner explicitly clicks Retry: unblocks and sends to updated-owner@example.invalid with a fresh key.
  fail = false;
  assert.deepEqual(service.retry(c.ownerId, blocked.id), { status: 'PENDING' });
  await service.dispatchOnce();
  const delivered = f.db.prepare("SELECT * FROM ownerAlerts WHERE ownerId=? AND id=?").get(c.ownerId, blocked.id);
  assert.equal(delivered.status, 'ACCEPTED');
  assert.equal(sent.at(-1).to, 'updated-owner@example.invalid');
  assert.notEqual(sent.at(-1).idempotencyKey, sent[0].idempotencyKey);
});

test('quoteEmailService: accepts Resend-normalized unquoted display name in from header and rejects mismatched sender', async t => {
  const f = quoteEmailFixture(t);
  await f.queue();
  const row = f.rows()[0];
  const msg = JSON.parse(row.messageJson);
  const unquotedFrom = msg.from.replace(/^"([^"]+)"\s*</, '$1 <');
  let readFrom = unquotedFrom;
  const provider = {
    ready: () => true,
    send: async () => ({ accepted: true, id: 'resend-id-1' }),
    read: async () => ({
      id: 'resend-id-1',
      to: [row.recipient],
      subject: msg.subject,
      from: readFrom,
      last_event: 'delivered'
    })
  };
  const service = createQuoteEmailService({
    database: f.db,
    ownerQuery: f.ownerQuery,
    environment,
    provider,
    clock: () => Date.parse(at) + 60_000
  });
  await service.dispatchOnce();
  const updated = f.rows()[0];
  assert.equal(updated.status, 'DELIVERED');
  assert.equal(updated.lastErrorCode, null);

  // Genuine mismatch must still be rejected.
  f.db.prepare("UPDATE quoteEmailDeliveries SET status='ACCEPTED',nextAttemptAt=0,receiptChecks=0 WHERE ownerId=? AND id=?").run(f.c.ownerId, row.id);
  readFrom = 'Attacker Co <attacker@evil.invalid>';
  await service.dispatchOnce();
  assert.equal(f.rows()[0].status, 'ACCEPTED');
  assert.equal(f.rows()[0].lastErrorCode, 'EMAIL_CONFIRMATION_PENDING');
});

test('backups: createSnapshot strips regenerable voicePreviewClips WAV BLOBs from backup SQLite copy', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'otc-backup-clips-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'live.sqlite');
  const f = fixture(t, dbPath);
  f.db.prepare('INSERT INTO voicePreviewClips(ownerId,clipKey,voiceId,model,audioWav,createdAt) VALUES(?,?,?,?,?,?)')
    .run('synthetic-a', 'a'.repeat(64), 'female', 'gemini-3.8-live', Buffer.alloc(4096, 0x55), Date.parse(at));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM voicePreviewClips').get().n, 1);
  const bundle = await createSnapshot(f.db, {
    root: dir,
    backupPath: path.join(dir, 'backups'),
    pricebookPath: path.join(dir, 'pricebooks'),
    backupRetentionDays: 30
  }, { now: () => Date.parse(at) });
  const copy = new Database(path.join(bundle, 'off-the-clock.sqlite'), { readonly: true });
  try {
    assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM voicePreviewClips').get().n, 0);
  } finally {
    copy.close();
  }
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM voicePreviewClips').get().n, 1, 'live cache stays intact');
});

test('productionVoiceRuntime: failed Gemini connect never starts a billingVoiceUsage row', async t => {
  const h = await harness(t, { fail: true });
  await h.connect(1);
  const rows = h.db.prepare('SELECT * FROM billingVoiceUsage WHERE ownerId=?').all(h.owner);
  assert.equal(rows.length, 0);
});
