import {isVoiceCaller} from './callerIdentity.js';
import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";

const E164 = /^\+[1-9]\d{7,14}$/;
const CALL_SID = /^CA[0-9a-fA-F]{32}$/;
const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;
const OWNER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const BINDING_KEYS = ["ownerId", "callSid", "from", "to", "accountSid"];

export class VoiceSessionNonceError extends Error {
  constructor(code, statusCode = 403) {
    super("The voice session is invalid or no longer available.");
    this.name = "VoiceSessionNonceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, statusCode) {
  throw new VoiceSessionNonceError(code, statusCode);
}

function exactObjectKeys(value, expected) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function normalizeBinding(value) {
  if (!exactObjectKeys(value, BINDING_KEYS)) fail("INVALID_SESSION_BINDING", 400);

  const ownerId = typeof value.ownerId === "string" ? value.ownerId.trim() : "";
  const callSid = typeof value.callSid === "string" ? value.callSid.trim() : "";
  const from = typeof value.from === "string" ? value.from.trim() : "";
  const to = typeof value.to === "string" ? value.to.trim() : "";
  const accountSid = typeof value.accountSid === "string" ? value.accountSid.trim() : "";

  if (
    !OWNER_ID.test(ownerId) ||
    !CALL_SID.test(callSid) ||
    !isVoiceCaller(from) ||
    !E164.test(to) ||
    !ACCOUNT_SID.test(accountSid)
  ) {
    fail("INVALID_SESSION_BINDING", 400);
  }

  return Object.freeze({ ownerId, callSid, from, to, accountSid });
}

function digestNonce(nonce) {
  return createHash("sha256").update(nonce, "utf8").digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), "utf8");
  const rightBuffer = Buffer.from(String(right), "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function recordMatches(record, nonceHash, binding) {
  if (!record || typeof record !== "object") return false;
  return (
    safeEqual(record.nonceHash, nonceHash) &&
    BINDING_KEYS.every((key) => safeEqual(record[key], binding[key]))
  );
}

/**
 * Repository contract:
 * - insert(record) atomically inserts the unique `nonceHash`; return false only
 *   for a hash collision.
 * - consume({ nonceHash, binding, now }) atomically verifies hash, all binding
 *   fields, expiry and unused state, then marks the nonce consumed. It returns
 *   { status: "consumed", record } or a status of not_found, mismatch,
 *   expired, or replayed. A read-then-write implementation is not sufficient.
 */
export function createVoiceSessionNonceService({
  repository,
  now = () => Date.now(),
  randomBytes = nodeRandomBytes,
  ttlMs = 60_000,
} = {}) {
  if (
    !repository ||
    typeof repository.insert !== "function" ||
    typeof repository.consume !== "function"
  ) {
    fail("NONCE_REPOSITORY_REQUIRED", 500);
  }
  if (typeof now !== "function" || typeof randomBytes !== "function") {
    fail("INVALID_NONCE_DEPENDENCY", 500);
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 5_000 || ttlMs > 300_000) {
    fail("INVALID_NONCE_TTL", 500);
  }

  return Object.freeze({
    async issue(bindingValue) {
      const binding = normalizeBinding(bindingValue);
      const issuedAt = now();
      if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) fail("INVALID_CLOCK", 500);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const entropy = randomBytes(32);
        if (!Buffer.isBuffer(entropy) || entropy.length !== 32) {
          fail("INVALID_RANDOM_SOURCE", 500);
        }
        const nonce = entropy.toString("base64url");
        const nonceHash = digestNonce(nonce);
        const expiresAt = issuedAt + ttlMs;
        const record = Object.freeze({
          nonceHash,
          ...binding,
          issuedAt,
          expiresAt,
          consumedAt: null,
        });
        const inserted = await repository.insert(record);
        if (inserted !== false) return Object.freeze({ nonce, expiresAt });
      }
      fail("NONCE_COLLISION", 500);
    },

    async consume({ nonce, binding: bindingValue } = {}) {
      if (
        typeof nonce !== "string" ||
        nonce.length < 32 ||
        nonce.length > 200 ||
        !/^[A-Za-z0-9_-]+$/.test(nonce)
      ) {
        fail("INVALID_SESSION_NONCE");
      }
      const binding = normalizeBinding(bindingValue);
      const consumedAt = now();
      if (!Number.isSafeInteger(consumedAt) || consumedAt < 0) fail("INVALID_CLOCK", 500);
      const nonceHash = digestNonce(nonce);
      const outcome = await repository.consume({ nonceHash, binding, now: consumedAt });

      switch (outcome?.status) {
        case "consumed":
          if (
            !recordMatches(outcome.record, nonceHash, binding) ||
            !Number.isSafeInteger(outcome.record.expiresAt) ||
            outcome.record.expiresAt <= consumedAt
          ) {
            fail("INVALID_NONCE_REPOSITORY_RESULT", 500);
          }
          return Object.freeze({ consumedAt, expiresAt: outcome.record.expiresAt });
        case "expired":
          fail("SESSION_NONCE_EXPIRED");
          break;
        case "replayed":
          fail("SESSION_NONCE_REPLAYED");
          break;
        case "mismatch":
        case "not_found":
          fail("INVALID_SESSION_NONCE");
          break;
        default:
          fail("INVALID_NONCE_REPOSITORY_RESULT", 500);
      }
    },
  });
}

