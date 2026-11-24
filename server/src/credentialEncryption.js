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

function credentialAad(keyVersion, aad) {
  const version = String(keyVersion || 'v1');
  const context = aad === undefined || aad === null ? '' : String(aad);
  return Buffer.from(`otc-cred:v1:${version}:${context}`, 'utf8');
}

function resolveDecryptKey(record, options = {}) {
  const version = record.keyVersion === undefined || record.keyVersion === null
    ? 'v1'
    : String(record.keyVersion).trim();
  if (!version) {
    const error = new Error('Credential key version is invalid');
    error.code = 'CREDENTIAL_KEY_VERSION_INVALID';
    throw error;
  }
  if (options.expectedKeyVersion !== undefined && version !== String(options.expectedKeyVersion)) {
    const error = new Error('Credential key version mismatch');
    error.code = 'CREDENTIAL_KEY_VERSION_MISMATCH';
    throw error;
  }
  if (options.keys && typeof options.keys === 'object') {
    if (!Object.hasOwn(options.keys, version)) {
      const error = new Error('Unknown credential key version');
      error.code = 'CREDENTIAL_KEY_VERSION_UNKNOWN';
      throw error;
    }
    return { key: credentialKey(options.keys[version]), keyVersion: version };
  }
  return { key: credentialKey(options.key), keyVersion: version };
}

export function encryptCredentialPayload(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Credential payload must be an object');
  }
  const iv = options.iv ? Buffer.from(options.iv) : crypto.randomBytes(12);
  if (iv.length !== 12) throw new TypeError('Credential IV must be 12 bytes');
  const keyVersion = String(options.keyVersion || process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION || 'v1').trim();
  if (!keyVersion) {
    const error = new Error('Credential key version is invalid');
    error.code = 'CREDENTIAL_KEY_VERSION_INVALID';
    throw error;
  }
  const keyMaterial = options.keys && typeof options.keys === 'object' && Object.hasOwn(options.keys, keyVersion)
    ? options.keys[keyVersion]
    : options.key;
  const cipher = crypto.createCipheriv(ALGORITHM, credentialKey(keyMaterial), iv);
  cipher.setAAD(credentialAad(keyVersion, options.aad));
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    credentialsCiphertext: ciphertext.toString('base64'),
    credentialsIv: iv.toString('base64'),
    credentialsTag: cipher.getAuthTag().toString('base64'),
    keyVersion
  };
}

export function decryptCredentialPayload(record, options = {}) {
  if (!record?.credentialsCiphertext || !record?.credentialsIv || !record?.credentialsTag) {
    throw new Error('Encrypted calendar credentials are incomplete');
  }
  const { key, keyVersion } = resolveDecryptKey(record, options);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(record.credentialsIv, 'base64')
  );
  decipher.setAAD(credentialAad(keyVersion, options.aad));
  decipher.setAuthTag(Buffer.from(record.credentialsTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.credentialsCiphertext, 'base64')),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}
