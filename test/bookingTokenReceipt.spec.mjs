import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBookingToken,
  openBookingTokenReceipt,
  sealBookingTokenReceipt
} from '../server/src/bookingTokens.js';

const secret = 'receipt-secret-that-is-longer-than-thirty-two-bytes';
const payload = {
  kind: 'booking-token-receipt',
  ownerId: 'owner-1',
  intentId: 'intent-1',
  bookingToken: createBookingToken(),
  expiresAtUtc: '2026-10-06T12:00:00.000Z'
};

test('booking token receipts round trip without exposing the public token', () => {
  const receipt = sealBookingTokenReceipt(payload, secret, { randomBytes: () => Buffer.alloc(12, 4) });
  assert.equal(receipt.includes(payload.bookingToken), false);
  assert.deepEqual(openBookingTokenReceipt(receipt, secret), payload);
});

test('booking token receipts reject tampering, wrong keys, and incomplete payloads', () => {
  const receipt = sealBookingTokenReceipt(payload, secret);
  const parts = receipt.split('.');
  const tamperedNonce = Buffer.from(parts[1], 'base64url');
  tamperedNonce[0] ^= 0x80;
  parts[1] = tamperedNonce.toString('base64url');
  assert.throws(() => openBookingTokenReceipt(parts.join('.'), secret));
  assert.throws(() => openBookingTokenReceipt(receipt, 'another-secret-that-is-long-enough-for-the-test'));
  assert.throws(() => sealBookingTokenReceipt({ ...payload, bookingToken: 'plain' }, secret));
});
