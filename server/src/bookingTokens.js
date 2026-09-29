import crypto from 'node:crypto';

const BOOKING_TOKEN_BYTES = 32;
const SLOT_TOKEN_VERSION = 's1';
const SLOT_TOKEN_AAD = Buffer.from('off-the-clock:booking-slot:s1', 'utf8');
const BOOKING_RECEIPT_VERSION = 'r1';
const BOOKING_RECEIPT_AAD = Buffer.from('off-the-clock:booking-token-receipt:r1', 'utf8');
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export class BookingTokenError extends Error {
  constructor(message, code = 'INVALID_SLOT_TOKEN') {
    super(message);
    this.name = 'BookingTokenError';
    this.code = code;
  }
}

function plainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON does not support non-finite numbers.');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!plainRecord(value)) throw new TypeError('Canonical JSON accepts plain JSON data only.');
  return Object.fromEntries(
    Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort()
      .map(key => [key, canonicalValue(value[key])])
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function requestDigest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function createBookingToken(randomBytes = crypto.randomBytes) {
  const token = randomBytes(BOOKING_TOKEN_BYTES).toString('base64url');
  if (!isBookingToken(token)) throw new Error('The booking token generator did not return 256 bits.');
  return token;
}

export function isBookingToken(token) {
  return typeof token === 'string' && token.length === 43 && BASE64URL.test(token);
}

export function hashBookingToken(token) {
  if (!isBookingToken(token)) throw new BookingTokenError('The booking link is invalid.', 'INVALID_BOOKING_TOKEN');
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function slotKey(secret) {
  if (!(typeof secret === 'string' || Buffer.isBuffer(secret)) || Buffer.byteLength(secret) < 32) {
    throw new TypeError('A slot-token secret of at least 32 bytes is required.');
  }
  return crypto.createHash('sha256')
    .update('off-the-clock:booking-slot-key\0', 'utf8')
    .update(secret)
    .digest();
}

function receiptKey(secret) {
  if (!(typeof secret === 'string' || Buffer.isBuffer(secret)) || Buffer.byteLength(secret) < 32) {
    throw new TypeError('A booking-token receipt secret of at least 32 bytes is required.');
  }
  return crypto.createHash('sha256')
    .update('off-the-clock:booking-token-receipt-key\0', 'utf8')
    .update(secret)
    .digest();
}

function decodePart(value, expectedLength = null) {
  if (!value || !BASE64URL.test(value)) throw new BookingTokenError('The selected time is invalid.');
  const decoded = Buffer.from(value, 'base64url');
  if (expectedLength !== null && decoded.length !== expectedLength) {
    throw new BookingTokenError('The selected time is invalid.');
  }
  return decoded;
}

export function sealSlotToken(payload, secret, { randomBytes = crypto.randomBytes } = {}) {
  if (!plainRecord(payload)) throw new TypeError('Slot payload must be a plain object.');
  const nonce = randomBytes(12);
  if (!Buffer.isBuffer(nonce) || nonce.length !== 12) throw new TypeError('Slot nonce must contain 12 bytes.');
  const cipher = crypto.createCipheriv('aes-256-gcm', slotKey(secret), nonce);
  cipher.setAAD(SLOT_TOKEN_AAD);
  const encrypted = Buffer.concat([
    cipher.update(canonicalJson(payload), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return [SLOT_TOKEN_VERSION, nonce.toString('base64url'), encrypted.toString('base64url'), tag.toString('base64url')].join('.');
}

export function openSlotToken(token, secret) {
  try {
    if (typeof token !== 'string') throw new BookingTokenError('The selected time is invalid.');
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== SLOT_TOKEN_VERSION) {
      throw new BookingTokenError('The selected time is invalid.');
    }
    const nonce = decodePart(parts[1], 12);
    const encrypted = decodePart(parts[2]);
    const tag = decodePart(parts[3], 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', slotKey(secret), nonce);
    decipher.setAAD(SLOT_TOKEN_AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    const payload = JSON.parse(plaintext);
    if (!plainRecord(payload)) throw new BookingTokenError('The selected time is invalid.');
    return payload;
  } catch (error) {
    if (error instanceof BookingTokenError) throw error;
    throw new BookingTokenError('The selected time is invalid.');
  }
}

export function sealBookingTokenReceipt(payload, secret, { randomBytes = crypto.randomBytes } = {}) {
  if (!plainRecord(payload) || payload.kind !== 'booking-token-receipt' ||
      typeof payload.ownerId !== 'string' || !payload.ownerId ||
      typeof payload.intentId !== 'string' || !payload.intentId ||
      !isBookingToken(payload.bookingToken) ||
      typeof payload.expiresAtUtc !== 'string' || !Number.isFinite(new Date(payload.expiresAtUtc).getTime())) {
    throw new TypeError('A complete booking-token receipt payload is required.');
  }
  const nonce = randomBytes(12);
  if (!Buffer.isBuffer(nonce) || nonce.length !== 12) throw new TypeError('Receipt nonce must contain 12 bytes.');
  const cipher = crypto.createCipheriv('aes-256-gcm', receiptKey(secret), nonce);
  cipher.setAAD(BOOKING_RECEIPT_AAD);
  const encrypted = Buffer.concat([cipher.update(canonicalJson(payload), 'utf8'), cipher.final()]);
  return [
    BOOKING_RECEIPT_VERSION,
    nonce.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url')
  ].join('.');
}

export function openBookingTokenReceipt(receipt, secret) {
  try {
    if (typeof receipt !== 'string') throw new BookingTokenError('The stored booking receipt is invalid.');
    const parts = receipt.split('.');
    if (parts.length !== 4 || parts[0] !== BOOKING_RECEIPT_VERSION) {
      throw new BookingTokenError('The stored booking receipt is invalid.');
    }
    const nonce = decodePart(parts[1], 12);
    const encrypted = decodePart(parts[2]);
    const tag = decodePart(parts[3], 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', receiptKey(secret), nonce);
    decipher.setAAD(BOOKING_RECEIPT_AAD);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]).toString('utf8'));
    if (!plainRecord(payload) || payload.kind !== 'booking-token-receipt' ||
        typeof payload.ownerId !== 'string' || typeof payload.intentId !== 'string' ||
        !isBookingToken(payload.bookingToken) ||
        typeof payload.expiresAtUtc !== 'string' || !Number.isFinite(new Date(payload.expiresAtUtc).getTime())) {
      throw new BookingTokenError('The stored booking receipt is invalid.');
    }
    return payload;
  } catch (error) {
    if (error instanceof BookingTokenError) throw error;
    throw new BookingTokenError('The stored booking receipt is invalid.');
  }
}

