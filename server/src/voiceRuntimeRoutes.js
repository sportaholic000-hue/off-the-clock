import {isVoiceCaller} from './voice/callerIdentity.js';
import {isFinalVoiceCall} from './voice/voiceRecovery.js';
import { createHash } from "node:crypto";

import express from "express";

const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;
const CALL_SID = /^CA[0-9a-fA-F]{32}$/;
const E164 = /^\+[1-9]\d{7,14}$/;
const NONCE = /^[A-Za-z0-9_-]{32,200}$/;
const REASON = /^[A-Z][A-Z0-9_]{2,63}$/;
const DEFAULT_INCOMING_PATH = "/api/twilio/voice/incoming";
const DEFAULT_STREAM_PATH = "/api/twilio/voice/stream";
const DEFAULT_FALLBACK_MESSAGE =
  "We're sorry, this business can't take your call right now. Please try again later.";

export class VoiceRuntimeBoundaryError extends Error {
  constructor(code, statusCode = 500) {
    super("The voice call could not be routed safely.");
    this.name = "VoiceRuntimeBoundaryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, statusCode) {
  throw new VoiceRuntimeBoundaryError(code, statusCode);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).every((key) => typeof key === "string")
  );
}

function normalizedFormParameters(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some((key) => typeof key !== "string")
  ) {
    fail("INVALID_TWILIO_FORM", 400);
  }
  const output = {};
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      descriptor.get ||
      descriptor.set ||
      ["__proto__", "prototype", "constructor"].includes(key) ||
      typeof descriptor.value !== "string"
    ) {
      fail("INVALID_TWILIO_FORM", 400);
    }
    Object.defineProperty(output, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return output;
}

function exactPath(value, fallback) {
  const candidate = value === undefined ? fallback : value;
  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.endsWith("/") ||
    candidate.includes("?") ||
    candidate.includes("#") ||
    candidate.includes("\\") ||
    /[\r\n\0]/.test(candidate)
  ) {
    fail("INVALID_VOICE_ROUTE_PATH");
  }
  return candidate;
}

function publicOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("INVALID_PUBLIC_BASE_URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    fail("INVALID_PUBLIC_BASE_URL");
  }
  return url;
}

function normalizeAccountAllowlist(value) {
  if (!Array.isArray(value) && !(value instanceof Set)) {
    fail("TWILIO_ACCOUNT_ALLOWLIST_REQUIRED");
  }
  const result = new Set(value);
  if (result.size === 0 || [...result].some((sid) => typeof sid !== "string" || !ACCOUNT_SID.test(sid))) {
    fail("INVALID_TWILIO_ACCOUNT_ALLOWLIST");
  }
  return result;
}

function assertRuntimeDependencies({ twilioValidator, tenantResolver, nonceService }) {
  if (
    !twilioValidator ||
    typeof twilioValidator.validateHttp !== "function" ||
    typeof twilioValidator.validateWebSocket !== "function"
  ) {
    fail("TWILIO_VALIDATOR_REQUIRED");
  }
  if (!tenantResolver || typeof tenantResolver.resolveByCalledNumber !== "function") {
    fail("VOICE_TENANT_RESOLVER_REQUIRED");
  }
  if (
    !nonceService ||
    typeof nonceService.issue !== "function" ||
    typeof nonceService.consume !== "function"
  ) {
    fail("VOICE_NONCE_SERVICE_REQUIRED");
  }
}

function safeReason(value, fallback) {
  return typeof value === "string" && REASON.test(value) ? value : fallback;
}

function normalizeGateDecision(value, fallbackReason, allowedProperty = "allowed") {
  if (value === true) return Object.freeze({ allowed: true, reason: null });
  if (value === false || value === null || value === undefined) {
    return Object.freeze({ allowed: false, reason: fallbackReason });
  }
  if (!isPlainObject(value)) {
    return Object.freeze({ allowed: false, reason: `${fallbackReason}_INVALID` });
  }
  const decision = value[allowedProperty];
  if (decision !== true && decision !== false) {
    return Object.freeze({ allowed: false, reason: `${fallbackReason}_INVALID` });
  }
  return Object.freeze({
    allowed: decision,
    reason: decision ? null : safeReason(value.reason, fallbackReason),
  });
}

async function runGate(callback, input, fallbackReason, allowedProperty = "allowed") {
  try {
    return normalizeGateDecision(await callback(input), fallbackReason, allowedProperty);
  } catch {
    return Object.freeze({ allowed: false, reason: `${fallbackReason}_UNAVAILABLE` });
  }
}

function normalizeIncomingCall(body, validatedAccountSid, allowedAccountSids) {
  if (!isPlainObject(body)) fail("INVALID_TWILIO_FORM", 400);
  const accountSid = typeof body.AccountSid === "string" ? body.AccountSid.trim() : "";
  const callSid = typeof body.CallSid === "string" ? body.CallSid.trim() : "";
  const from = typeof body.From === "string" ? body.From.trim() : "";
  const to = typeof body.To === "string" ? body.To.trim() : "";
  const direction = typeof body.Direction === "string" ? body.Direction.trim() : "";

  if (
    !ACCOUNT_SID.test(accountSid) ||
    accountSid !== validatedAccountSid ||
    !allowedAccountSids.has(accountSid)
  ) {
    fail("TWILIO_ACCOUNT_NOT_ALLOWED", 403);
  }
  if (!CALL_SID.test(callSid) || !isVoiceCaller(from) || !E164.test(to) || direction !== "inbound") {
    fail("INVALID_INBOUND_CALL", 400);
  }
  return Object.freeze({ accountSid, callSid, from, to });
}

function xmlText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeMessage(value) {
  if (typeof value !== "string") return DEFAULT_FALLBACK_MESSAGE;
  const message = value.trim();
  if (
    message.length === 0 ||
    message.length > 1_000 ||
    /[\0\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message)
  ) {
    return DEFAULT_FALLBACK_MESSAGE;
  }
  return message;
}

function fallbackTwiml(value, calledNumber) {
  const fallback = isPlainObject(value) ? value : {};
  const message = safeMessage(fallback.message);
  if(fallback.mode==='capture') {
    const action=new URL(fallback.action),partial=new URL(fallback.partial);
    if(action.protocol!=='https:'||partial.origin!==action.origin)throw Error('Invalid capture URL');
    return '<Response><Gather input="speech" action="'+xmlText(action.href)+'" method="POST" partialResultCallback="'+xmlText(partial.href)+'" partialResultCallbackMethod="POST" actionOnEmptyResult="true" speechTimeout="auto" timeout="8"><Say>'+xmlText(message)+'</Say></Gather></Response>';
  }
  const number = typeof fallback.number === "string" ? fallback.number.trim() : "";
  if (fallback.mode === "forward" && E164.test(number) && number !== calledNumber) {
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response><Dial answerOnBridge="true" timeout="20"><Number>' +
      xmlText(number) +
      "</Number></Dial><Say>" +
      xmlText(message) +
      "</Say><Hangup/></Response>"
    );
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response><Say>" +
    xmlText(message) +
    "</Say><Hangup/></Response>"
  );
}

function streamUrl(base, streamPath, nonce) {
  if (!NONCE.test(nonce)) fail("INVALID_ISSUED_NONCE");
  return `wss://${base.host}${streamPath}/${nonce}`;
}

function streamTwiml(url, resumeUrl = null) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response><Connect><Stream url="' + xmlText(url) + '"/></Connect>' +
    (resumeUrl ? '<Redirect method="POST">' + xmlText(resumeUrl) + '</Redirect>' : '') + '</Response>';
}

function nonceDigest(nonce) {
  return createHash("sha256").update(nonce, "utf8").digest("hex");
}

function responsePath(request) {
  if (typeof request?.originalUrl !== "string") fail("INVALID_REQUEST_PATH", 400);
  return request.originalUrl;
}

function sendXml(response, xml) {
  return response.status(200).type("text/xml").send(xml);
}

function sendBoundaryFailure(response, error) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const publicStatus = status >= 400 && status < 600 ? status : 500;
  return response.status(publicStatus).type("text/plain").send(
    publicStatus === 403 ? "Forbidden" : publicStatus === 404 ? "Not found" : "Voice unavailable",
  );
}

async function resolveFallbackTwiml({ resolveFallback, recordFallback, context, tenant, reason }) {
  let choice;
  try {
    choice = await resolveFallback({ context, tenant, reason });
  } catch {
    choice = null;
  }
  if (typeof recordFallback === "function") {
    const saved=await recordFallback({context,tenant,reason});
    if(saved?.terminal)return '<Response><Hangup/></Response>';
  }
  return fallbackTwiml(choice, context?.to ?? tenant?.calledNumber ?? null);
}

/**
 * Installs the signed, form-encoded Twilio inbound-call boundary.
 *
 * The official Twilio SDK validator must be supplied through `twilioValidator`.
 * `createSession` must durably store the supplied SHA-256 `sessionKey` with the
 * immutable call context and return exactly `{ status: "created" }`; it never
 * receives the raw nonce. Only the raw, one-use nonce is placed in the WSS
 * path. A store should also enforce one call record per Twilio CallSid.
 */
export function installVoiceRuntimeRoutes(app, {
  twilioValidator,
  tenantResolver,
  validateIncomingCall,
  validateCallBinding,
  nonceService,
  allowedAccountSids,
  publicBaseUrl,
  runtimeEnabled = false,
  checkOperatorEligibility,
  checkVoiceCap,
  createSession,
  routeIncoming,
  resolveFallback = async () => ({ mode: "message", message: DEFAULT_FALLBACK_MESSAGE }),
  recordFallback,
  incomingPath: incomingPathValue,
  streamPath: streamPathValue,
  formParser,
  resumeFallback = false,
  fallbackPath: fallbackPathValue,
  loadSessionByNonceHash,
} = {}) {
  if (!app || typeof app.post !== "function") fail("EXPRESS_APP_REQUIRED");
  assertRuntimeDependencies({ twilioValidator, tenantResolver, nonceService });
  const accountAllowlist = normalizeAccountAllowlist(allowedAccountSids);
  const base = publicOrigin(publicBaseUrl);
  const incomingPath = exactPath(incomingPathValue, DEFAULT_INCOMING_PATH);
  const streamPath = exactPath(streamPathValue, DEFAULT_STREAM_PATH);
  if (typeof checkOperatorEligibility !== "function") fail("OPERATOR_ELIGIBILITY_CHECK_REQUIRED");
  if (typeof checkVoiceCap !== "function") fail("VOICE_CAP_CHECK_REQUIRED");
  if (typeof createSession !== "function") fail("VOICE_SESSION_STORE_REQUIRED");
  if (typeof resolveFallback !== "function") fail("VOICE_FALLBACK_RESOLVER_REQUIRED");
  if (typeof validateCallBinding !== 'function') fail('VOICE_CALL_BINDING_VALIDATOR_REQUIRED');
  if (typeof validateIncomingCall !== 'function') fail('VOICE_CALL_BINDING_VALIDATOR_REQUIRED');
  if (recordFallback !== undefined && typeof recordFallback !== "function") {
    fail("VOICE_FALLBACK_RECORDER_INVALID");
  }
  if (typeof runtimeEnabled !== "boolean" && typeof runtimeEnabled !== "function") {
    fail("INVALID_VOICE_RUNTIME_SWITCH");
  }

  const fallbackPath=exactPath(fallbackPathValue,'/api/twilio/voice/fallback');
  if(typeof resumeFallback!=='boolean'||resumeFallback&&typeof loadSessionByNonceHash!=='function')fail('VOICE_RESUME_FALLBACK_REQUIRED');
  const parseForm =
    formParser ??
    express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 64 });

  app.post(incomingPath, parseForm, async (request, response) => {
    let tenant;
    let context;
    try {
      const signature = request.get("x-twilio-signature");
      // body-parser intentionally uses a null-prototype object in current
      // releases. Copy only unambiguous string fields into the strict plain
      // object expected by the Twilio SDK validation adapter.
      const signedParameters = normalizedFormParameters(request.body);
      const validation = await twilioValidator.validateHttp({
        signature,
        requestPath: responsePath(request),
        params: signedParameters,
      });
      const call = normalizeIncomingCall(signedParameters, validation?.accountSid, accountAllowlist);
      // Reject a changed destination before looking it up, so a reused CallSid
      // cannot distinguish another tenant's number from an unknown number.
      if(await validateIncomingCall({call})!==true)fail('VOICE_CALL_BINDING_MISMATCH',403);

      // Only the signed destination number is ever supplied to the tenant
      // resolver. Body/query owner selectors are intentionally ignored.
      const resolvedTenant = await tenantResolver.resolveByCalledNumber({ To: call.to });
      if (!isPlainObject(resolvedTenant) || resolvedTenant.calledNumber !== call.to) {
        fail("INVALID_TENANT_RESOLUTION", 500);
      }
      const resolvedContext = Object.freeze({
        ownerId: resolvedTenant.ownerId,
        callSid: call.callSid,
        from: call.from,
        to: resolvedTenant.calledNumber,
        accountSid: call.accountSid,
      });
      // Do not expose any tenant fallback or mint a nonce for a CallSid that
      // already belongs to a different tenant, caller or destination.
      if(await validateCallBinding({context:resolvedContext})!==true)fail('VOICE_CALL_BINDING_MISMATCH',403);
      tenant=resolvedTenant;
      context=resolvedContext;

      const build = async()=>{
      const runtimeDecision =
        typeof runtimeEnabled === "function"
          ? await runGate(runtimeEnabled, { context, tenant }, "VOICE_RUNTIME_DISABLED")
          : normalizeGateDecision(runtimeEnabled, "VOICE_RUNTIME_DISABLED");
      if (!runtimeDecision.allowed) {
        return await resolveFallbackTwiml({
            resolveFallback,
            recordFallback,
            context,
            tenant,
            reason: runtimeDecision.reason,
          });
      }

      const operatorDecision = await runGate(
        checkOperatorEligibility,
        { context, tenant },
        "OPERATOR_INELIGIBLE",
      );
      if (!operatorDecision.allowed) {
        return await resolveFallbackTwiml({
            resolveFallback,
            recordFallback,
            context,
            tenant,
            reason: operatorDecision.reason,
          });
      }

      const capDecision = await runGate(
        checkVoiceCap,
        { context, tenant },
        "VOICE_CAP_REACHED",
        "canStartNewCall",
      );
      if (!capDecision.allowed) {
        return await resolveFallbackTwiml({
            resolveFallback,
            recordFallback,
            context,
            tenant,
            reason: capDecision.reason,
          });
      }

      let issued;
      try {
        issued = await nonceService.issue(context);
        if (
          !isPlainObject(issued) ||
          !NONCE.test(issued.nonce) ||
          !Number.isSafeInteger(issued.expiresAt)
        ) {
          fail("INVALID_NONCE_ISSUE_RESULT");
        }
        const result = await createSession({
          sessionKey: nonceDigest(issued.nonce),
          context,
          expiresAt: issued.expiresAt,
        });
        if(result?.status==='capacity')return resolveFallbackTwiml({resolveFallback,recordFallback,context,tenant,reason:'VOICE_CONCURRENCY_LIMIT'});
        if (!isPlainObject(result) || result.status !== "created") {
          fail("VOICE_SESSION_NOT_PERSISTED");
        }
      } catch (error) {
        if(error?.code==='VOICE_CALL_BINDING_MISMATCH')throw error;
        return await resolveFallbackTwiml({
            resolveFallback,
            recordFallback,
            context,
            tenant,
            reason: "VOICE_SESSION_UNAVAILABLE",
          });
      }

      return streamTwiml(streamUrl(base, streamPath, issued.nonce),resumeFallback?base.origin+fallbackPath+'/'+issued.nonce:null);
      };
      return sendXml(response,routeIncoming?await routeIncoming({context,build}):await build());
    } catch (error) {
      if(error?.code==='VOICE_CALL_BINDING_MISMATCH')return sendBoundaryFailure(response,error);
      if(tenant&&context)return response.status(503).type('text/plain').send('Request capture temporarily unavailable. Retry this callback.');
      return sendBoundaryFailure(response, error);
    }
  });

  if(resumeFallback)app.post(fallbackPath+'/:nonce',parseForm,async(request,response)=>{
    try{
      const parameters=normalizedFormParameters(request.body);
      const validation=await twilioValidator.validateHttp({signature:request.get('x-twilio-signature'),requestPath:responsePath(request),params:parameters});
      const call=normalizeIncomingCall(parameters,validation?.accountSid,accountAllowlist);
      const nonce=request.params.nonce;
      if(!NONCE.test(nonce))fail('INVALID_SESSION_NONCE',403);
      const tenant=await tenantResolver.resolveByCalledNumber({To:call.to});
      const stored=await loadSessionByNonceHash({sessionKey:nonceDigest(nonce)});
      const context=stored?.context;
      if(!context||context.ownerId!==tenant.ownerId||context.callSid!==call.callSid||context.accountSid!==call.accountSid||context.from!==call.from||context.to!==call.to)fail('FALLBACK_BINDING_MISMATCH',403);
      if(isFinalVoiceCall(stored.session?.status)||stored.session?.status==='TRANSFERRING')return sendXml(response,'<Response><Hangup/></Response>');
      return sendXml(response,await resolveFallbackTwiml({resolveFallback,recordFallback,context,tenant,reason:'VOICE_SESSION_UNAVAILABLE'}));
    }catch(error){return sendBoundaryFailure(response,error);}
  });
  return Object.freeze({ incomingPath, streamPath });
}

function extractNonce(requestPath, streamPath) {
  if (
    typeof requestPath !== "string" ||
    requestPath.includes("?") ||
    requestPath.includes("#") ||
    requestPath.includes("\\") ||
    /[\r\n\0]/.test(requestPath)
  ) {
    fail("INVALID_STREAM_PATH", 403);
  }
  const prefix = `${streamPath}/`;
  if (!requestPath.startsWith(prefix) || requestPath.slice(prefix.length).includes("/")) {
    fail("INVALID_STREAM_PATH", 403);
  }
  const nonce = requestPath.slice(prefix.length);
  if (!NONCE.test(nonce)) fail("INVALID_SESSION_NONCE", 403);
  return nonce;
}

function sessionRecord(value) {
  if (!isPlainObject(value) || !isPlainObject(value.context)) {
    fail("VOICE_SESSION_NOT_FOUND", 403);
  }
  if(isFinalVoiceCall(value.session?.status)||['FAILED','FALLBACK','TRANSFERRING'].includes(value.session?.status))fail("VOICE_SESSION_FINAL",403);
  return value;
}

/**
 * Creates the WebSocket-side authorization coordinator without depending on a
 * particular WebSocket or Gemini client. Production code validates the signed
 * upgrade URL with `authorizeUpgrade`, performs the actual upgrade, then calls
 * `startAuthorizedSession`. Authorization objects are in-process one-use in
 * addition to the durable nonce being one-use. `loadSessionByNonceHash` receives
 * only `{ sessionKey }` and returns `{ context, session }`; it must scope any
 * follow-on tenant reads with the owner in that nonce-bound context.
 */
export function createVoiceWebSocketSessionCoordinator({
  twilioValidator,
  nonceService,
  loadSessionByNonceHash,
  startMediaSession,
  streamPath: streamPathValue,
} = {}) {
  assertRuntimeDependencies({
    twilioValidator,
    nonceService,
    tenantResolver: { resolveByCalledNumber() {} },
  });
  if (typeof loadSessionByNonceHash !== "function") fail("VOICE_SESSION_LOADER_REQUIRED");
  if (typeof startMediaSession !== "function") fail("MEDIA_SESSION_STARTER_REQUIRED");
  const streamPath = exactPath(streamPathValue, DEFAULT_STREAM_PATH);
  const pending = new WeakSet();

  return Object.freeze({
    async authorizeUpgrade({ signature, requestPath } = {}) {
      await twilioValidator.validateWebSocket({ signature, requestPath });
      const nonce = extractNonce(requestPath, streamPath);
      const sessionKey = nonceDigest(nonce);
      let stored;
      try {
        stored = sessionRecord(await loadSessionByNonceHash({ sessionKey }));
      } catch (error) {
        if (error instanceof VoiceRuntimeBoundaryError) throw error;
        fail("VOICE_SESSION_LOAD_FAILED", 503);
      }
      await nonceService.consume({ nonce, binding: stored.context });
      const authorization = Object.freeze({
        context: Object.freeze({ ...stored.context }),
        session: stored.session ?? null,
      });
      pending.add(authorization);
      return authorization;
    },

    async startAuthorizedSession({ authorization, socket, request } = {}) {
      if (!authorization || !pending.has(authorization)) {
        fail("STREAM_AUTHORIZATION_REPLAYED", 403);
      }
      pending.delete(authorization);
      if (!socket) fail("WEB_SOCKET_REQUIRED", 500);
      return startMediaSession({
        socket,
        request,
        context: authorization.context,
        session: authorization.session,
      });
    },
  });
}
