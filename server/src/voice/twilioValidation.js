const TWILIO_ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;

export class TwilioRequestValidationError extends Error {
  constructor(code, statusCode = 403) {
    super("The voice request could not be authenticated.");
    this.name = "TwilioRequestValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, statusCode) {
  throw new TwilioRequestValidationError(code, statusCode);
}

function parsePublicBaseUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    fail("PUBLIC_BASE_URL_REQUIRED", 500);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("INVALID_PUBLIC_BASE_URL", 500);
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    fail("INVALID_PUBLIC_BASE_URL", 500);
  }

  return parsed;
}

function canonicalUrl(base, requestPath, websocket) {
  if (
    typeof requestPath !== "string" ||
    !requestPath.startsWith("/") ||
    requestPath.startsWith("//") ||
    requestPath.includes("#") ||
    requestPath.includes("\\") ||
    /[\r\n\0]/.test(requestPath)
  ) {
    fail("INVALID_REQUEST_PATH", 400);
  }

  const url = new URL(requestPath, base);
  if (url.origin !== base.origin) {
    fail("INVALID_REQUEST_PATH", 400);
  }

  const scheme = websocket ? "wss:" : base.protocol;
  return `${scheme}//${base.host}${requestPath}`;
}

function assertSignature(signature) {
  if (typeof signature !== "string" || signature.trim().length === 0) {
    fail("MISSING_TWILIO_SIGNATURE");
  }
  return signature.trim();
}

function assertParams(params) {
  if (
    params === null ||
    typeof params !== "object" ||
    Array.isArray(params) ||
    Object.getPrototypeOf(params) !== Object.prototype ||
    Reflect.ownKeys(params).some((key) => typeof key !== "string")
  ) {
    fail("INVALID_TWILIO_PARAMETERS", 400);
  }
  for (const key of Object.keys(params)) {
    const descriptor = Object.getOwnPropertyDescriptor(params, key);
    if (!descriptor || descriptor.get || descriptor.set) {
      fail("INVALID_TWILIO_PARAMETERS", 400);
    }
  }
  return params;
}

function normalizeAllowedAccountSids(accountSids) {
  if (accountSids === undefined) return null;
  if (!Array.isArray(accountSids) && !(accountSids instanceof Set)) {
    fail("INVALID_ACCOUNT_ALLOWLIST", 500);
  }

  const normalized = new Set(accountSids);
  for (const sid of normalized) {
    if (typeof sid !== "string" || !TWILIO_ACCOUNT_SID.test(sid)) {
      fail("INVALID_ACCOUNT_ALLOWLIST", 500);
    }
  }
  if (normalized.size === 0) fail("INVALID_ACCOUNT_ALLOWLIST", 500);
  return normalized;
}

/**
 * Creates a fail-closed Twilio request validator.
 *
 * `validateRequest` is deliberately injected. Production wiring must pass the
 * official Twilio SDK validator; this module has no home-grown cryptographic
 * fallback. `requestPath` must be the path and query exactly as Twilio called
 * it. The public origin always comes from trusted configuration, never Host or
 * X-Forwarded-* request headers.
 */
export function createTwilioRequestValidator({
  validateRequest,
  authToken,
  publicBaseUrl,
  allowedAccountSids,
} = {}) {
  if (typeof validateRequest !== "function") {
    fail("TWILIO_VALIDATOR_REQUIRED", 500);
  }
  if (typeof authToken !== "string" || authToken.length === 0) {
    fail("TWILIO_AUTH_TOKEN_REQUIRED", 500);
  }

  const base = parsePublicBaseUrl(publicBaseUrl);
  const accountAllowlist = normalizeAllowedAccountSids(allowedAccountSids);

  function assertAccountSid(params) {
    const accountSid = params.AccountSid;
    if (typeof accountSid !== "string" || !TWILIO_ACCOUNT_SID.test(accountSid)) {
      fail("INVALID_TWILIO_ACCOUNT");
    }
    if (accountAllowlist && !accountAllowlist.has(accountSid)) {
      fail("INVALID_TWILIO_ACCOUNT");
    }
  }

  async function runValidation({ signature, requestPath, params, websocket, checkAccountSid }) {
    const safeSignature = assertSignature(signature);
    const safeParams = assertParams(params);
    if (checkAccountSid) assertAccountSid(safeParams);
    const url = canonicalUrl(base, requestPath, websocket);

    let valid = false;
    try {
      valid = await validateRequest(authToken, safeSignature, url, safeParams);
    } catch {
      fail("TWILIO_VALIDATION_FAILED");
    }
    if (valid !== true) fail("INVALID_TWILIO_SIGNATURE");

    return Object.freeze({
      ...(checkAccountSid ? { accountSid: safeParams.AccountSid } : {}),
      canonicalUrl: url,
    });
  }

  return Object.freeze({
    validateHttp({ signature, requestPath, params } = {}) {
      return runValidation({
        signature,
        requestPath,
        params,
        websocket: false,
        checkAccountSid: true,
      });
    },
    validateWebSocket({ signature, requestPath } = {}) {
      return runValidation({
        signature,
        requestPath,
        // Twilio signs the WebSocket handshake URL (including its query), not
        // a form body. Account/call identity is bound later by the one-use
        // nonce and the signed ConversationRelay setup event.
        params: {},
        websocket: true,
        checkAccountSid: false,
      });
    },
  });
}

