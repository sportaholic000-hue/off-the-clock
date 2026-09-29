import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function credentialKey(value = process.env.CREDENTIAL_ENCRYPTION_KEY) {
  const raw = String(value || '').trim();
  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else {
    try { key = Buffer.from(raw, 'base64'); } catch { key = Buffer.alloc(0); }
  }
  if (key.length !== 32) {
    const error = new Error('CREDENTIAL_ENCRYPTION_KEY must encode exactly 32 bytes');
    error.code = 'CREDENTIAL_KEY_INVALID';
    throw error;
  }
  return key;
}

export function encryptCredentialPayload(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Credential payload must be an object');
  }
  const iv = options.iv ? Buffer.from(options.iv) : crypto.randomBytes(12);
  if (iv.length !== 12) throw new TypeError('Credential IV must be 12 bytes');
  const cipher = crypto.createCipheriv(ALGORITHM, credentialKey(options.key), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    credentialsCiphertext: ciphertext.toString('base64'),
    credentialsIv: iv.toString('base64'),
    credentialsTag: cipher.getAuthTag().toString('base64'),
    keyVersion: String(options.keyVersion || process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION || 'v1')
  };
}

export function decryptCredentialPayload(record, options = {}) {
  if (!record?.credentialsCiphertext || !record?.credentialsIv || !record?.credentialsTag) {
    throw new Error('Encrypted calendar credentials are incomplete');
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    credentialKey(options.key),
    Buffer.from(record.credentialsIv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(record.credentialsTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.credentialsCiphertext, 'base64')),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}
