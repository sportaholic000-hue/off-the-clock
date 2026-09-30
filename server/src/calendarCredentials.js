import { ownerQuery } from './db.js';
import {
  decryptCredentialPayload,
  encryptCredentialPayload
} from './credentialEncryption.js';
import { migrateLegacyGoogleCalendarRows } from './calendarCredentialMigration.js';

export { decryptCredentialPayload, encryptCredentialPayload } from './credentialEncryption.js';

export function saveGoogleCalendarConnection(ownerId, tokens, options = {}) {
  const now = new Date().toISOString();
  const expiresAtUtc = tokens.expiresAtUtc
    ? new Date(tokens.expiresAtUtc).toISOString()
    : tokens.expiresAt
      ? new Date(Number(tokens.expiresAt)).toISOString()
      : tokens.expires_in
        ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
        : null;
  const encrypted = encryptCredentialPayload({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    tokenType: tokens.token_type || 'Bearer'
  }, options);
  ownerQuery(`INSERT INTO calendarConnections (
      ownerId,provider,status,calendarId,credentialsCiphertext,credentialsIv,
      credentialsTag,keyVersion,externalUrl,expiresAtUtc,scopesJson,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(ownerId) DO UPDATE SET
      provider=excluded.provider,status=excluded.status,calendarId=excluded.calendarId,
      credentialsCiphertext=excluded.credentialsCiphertext,credentialsIv=excluded.credentialsIv,
      credentialsTag=excluded.credentialsTag,keyVersion=excluded.keyVersion,
      externalUrl=excluded.externalUrl,expiresAtUtc=excluded.expiresAtUtc,
      scopesJson=excluded.scopesJson,updatedAt=excluded.updatedAt`
  ).run(
    ownerId, 'google', 'connected', tokens.calendarId || 'primary',
    encrypted.credentialsCiphertext, encrypted.credentialsIv,
    encrypted.credentialsTag, encrypted.keyVersion, null, expiresAtUtc,
    JSON.stringify(String(tokens.scope || '').split(/\s+/).filter(Boolean)), now, now
  );
  return { provider: 'google', status: 'connected', calendarId: tokens.calendarId || 'primary', expiresAtUtc };
}

export function readGoogleCalendarConnection(ownerId, options = {}) {
  const row = ownerQuery(`SELECT * FROM calendarConnections
    WHERE ownerId = ? AND provider = 'google'`).get(ownerId);
  if (!row || row.status !== 'connected') return null;
  return { ...row, credentials: decryptCredentialPayload(row, options) };
}

export function migrateLegacyGoogleCalendarCredentials(options = {}) {
  const listProfiles = options.listProfiles || (() => ownerQuery(
    'SELECT ownerId, calendarJson FROM businessProfiles WHERE ownerId IS NOT NULL'
  ).all());
  const saveConnection = options.saveConnection || ((ownerId, tokens) =>
    saveGoogleCalendarConnection(ownerId, tokens, options));
  const scrubProfile = options.scrubProfile || ((ownerId, calendar) =>
    ownerQuery('UPDATE businessProfiles SET calendarJson = ?, updatedAt = ? WHERE ownerId = ?')
      .run(JSON.stringify(calendar), new Date().toISOString(), ownerId));
  return migrateLegacyGoogleCalendarRows({
    rows: listProfiles(),
    saveConnection,
    scrubProfile
  });
}
