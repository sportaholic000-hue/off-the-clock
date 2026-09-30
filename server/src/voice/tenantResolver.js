const E164 = /^\+[1-9]\d{7,14}$/;
const OWNER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export class VoiceTenantResolutionError extends Error {
  constructor(code, statusCode = 404) {
    super("This phone number is not configured for the voice operator.");
    this.name = "VoiceTenantResolutionError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, statusCode) {
  throw new VoiceTenantResolutionError(code, statusCode);
}

export function normalizeVoicePhoneNumber(value) {
  if (typeof value !== "string") fail("INVALID_CALLED_NUMBER", 400);
  const normalized = value.trim();
  if (!E164.test(normalized)) fail("INVALID_CALLED_NUMBER", 400);
  return normalized;
}

function assertClosedLookup(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("INVALID_TENANT_LOOKUP", 400);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== "To") {
    fail("INVALID_TENANT_LOOKUP", 400);
  }
}

/**
 * Resolves a tenant solely from the signed Twilio `To` value. The repository
 * must enforce a unique mapping in persistent storage as well; duplicate rows
 * fail closed here so an ambiguous number can never select an arbitrary owner.
 */
export function createVoiceTenantResolver({ findByTwilioNumber } = {}) {
  if (typeof findByTwilioNumber !== "function") {
    fail("TENANT_REPOSITORY_REQUIRED", 500);
  }

  return Object.freeze({
    async resolveByCalledNumber(lookup) {
      assertClosedLookup(lookup);
      const calledNumber = normalizeVoicePhoneNumber(lookup.To);
      let rows;
      try {
        rows = await findByTwilioNumber(calledNumber);
      } catch {
        fail("TENANT_LOOKUP_FAILED", 503);
      }

      if (!Array.isArray(rows)) fail("INVALID_TENANT_REPOSITORY_RESULT", 500);
      if (rows.length === 0) fail("UNKNOWN_DESTINATION");
      if (rows.length !== 1) fail("AMBIGUOUS_DESTINATION", 409);

      const row = rows[0];
      if (row === null || typeof row !== "object" || Array.isArray(row)) {
        fail("INVALID_TENANT_RECORD", 500);
      }
      const ownerId = typeof row.ownerId === "string" ? row.ownerId.trim() : "";
      if (!OWNER_ID.test(ownerId)) {
        fail("INVALID_TENANT_RECORD", 500);
      }
      if (normalizeVoicePhoneNumber(row.twilioNumber) !== calledNumber) {
        fail("INVALID_TENANT_RECORD", 500);
      }
      // This resolver establishes identity only. Master-toggle, subscription,
      // runtime-health and minute-cap decisions belong to the signed inbound
      // route, which can return the owner's configured fallback instead of a
      // dead call when the AI is unavailable.
      return Object.freeze({
        ownerId,
        calledNumber,
      });
    },
  });
}

