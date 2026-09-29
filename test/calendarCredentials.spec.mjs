import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptCredentialPayload,
  encryptCredentialPayload
} from '../server/src/credentialEncryption.js';
import { migrateLegacyGoogleCalendarRows } from '../server/src/calendarCredentialMigration.js';

const key = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

test('calendar credentials encrypt with authenticated encryption and round trip', () => {
  const payload = {
    accessToken: 'synthetic-access-token',
    refreshToken: 'synthetic-refresh-token',
    tokenType: 'Bearer'
  };
  const encrypted = encryptCredentialPayload(payload, {
    key,
    keyVersion: 'test-v1',
    iv: Buffer.alloc(12, 7)
  });
  assert.equal(encrypted.keyVersion, 'test-v1');
  assert.equal(JSON.stringify(encrypted).includes(payload.accessToken), false);
  assert.equal(JSON.stringify(encrypted).includes(payload.refreshToken), false);
  assert.deepEqual(decryptCredentialPayload(encrypted, { key }), payload);
});

test('calendar credential tampering and invalid keys fail closed', () => {
  const encrypted = encryptCredentialPayload({ accessToken: 'synthetic' }, { key });
  const tampered = {
    ...encrypted,
    credentialsCiphertext: Buffer.from('tampered').toString('base64')
  };
  assert.throws(() => decryptCredentialPayload(tampered, { key }));
  assert.throws(
    () => encryptCredentialPayload({ accessToken: 'synthetic' }, { key: 'too-short' }),
    error => error.code === 'CREDENTIAL_KEY_INVALID'
  );
});

test('legacy plaintext Google credentials are encrypted before profile metadata is scrubbed', () => {
  const calls = [];
  const migrated = migrateLegacyGoogleCalendarRows({
    rows: [{
      ownerId: 'owner-1',
      calendarJson: JSON.stringify({
        provider: 'google',
        status: 'connected',
        accessToken: 'legacy-access',
        refreshToken: 'legacy-refresh',
        expiresAt: Date.parse('2026-10-01T00:00:00.000Z'),
        scope: 'calendar'
      })
    }],
    saveConnection(ownerId, tokens) {
      calls.push(['save', ownerId, tokens]);
      return {
        provider: 'google',
        status: 'connected',
        calendarId: 'primary',
        expiresAtUtc: '2026-10-01T00:00:00.000Z'
      };
    },
    scrubProfile(ownerId, calendar) {
      calls.push(['scrub', ownerId, calendar]);
    }
  });
  assert.equal(migrated, 1);
  assert.equal(calls[0][0], 'save');
  assert.equal(calls[0][2].access_token, 'legacy-access');
  assert.equal(calls[0][2].refresh_token, 'legacy-refresh');
  assert.equal(calls[1][0], 'scrub');
  assert.equal(JSON.stringify(calls[1][2]).includes('legacy-access'), false);
  assert.deepEqual(Object.keys(calls[1][2]).sort(), [
    'calendarId', 'calendlyUrl', 'expiresAtUtc', 'provider', 'status'
  ]);
});

test('non-secret calendar metadata does not trigger a credential migration', () => {
  let writes = 0;
  const migrated = migrateLegacyGoogleCalendarRows({
    rows: [{
      ownerId: 'owner-1',
      calendarJson: JSON.stringify({ provider: 'google', status: 'pending_oauth' })
    }],
    saveConnection: () => { writes += 1; },
    scrubProfile: () => { writes += 1; }
  });
  assert.equal(migrated, 0);
  assert.equal(writes, 0);
});
