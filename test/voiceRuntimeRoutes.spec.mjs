import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import express from "express";

import {
  createVoiceWebSocketSessionCoordinator,
  installVoiceRuntimeRoutes,
} from "../server/src/voiceRuntimeRoutes.js";
import { createVoiceSessionNonceService } from "../server/src/voice/sessionNonceService.js";
import { createVoiceTenantResolver } from "../server/src/voice/tenantResolver.js";
import { createTwilioRequestValidator } from "../server/src/voice/twilioValidation.js";

const ACCOUNT_SID = `AC${"a".repeat(32)}`;
const OTHER_ACCOUNT_SID = `AC${"f".repeat(32)}`;
const CALL_SID = `CA${"b".repeat(32)}`;
const FROM = "+19025550100";
const TO = "+19025550101";
const BUSINESS_NUMBER = "+19025550199";
const PUBLIC_BASE_URL = "https://voice.example.test";
const INCOMING_PATH = "/api/twilio/voice/incoming";
const STREAM_PATH = "/api/twilio/voice/stream";

const hasCode = (code) => (error) => error?.code === code;

function atomicNonceRepository() {
  const records = new Map();
  return {
    records,
    async insert(record) {
      if (records.has(record.nonceHash)) return false;
      records.set(record.nonceHash, { ...record });
      return true;
    },
    async consume({ nonceHash, binding, now }) {
      const record = records.get(nonceHash);
      if (!record) return { status: "not_found" };
      if (
        ["ownerId", "callSid", "from", "to", "accountSid"].some(
          (key) => record[key] !== binding[key],
        )
      ) {
        return { status: "mismatch" };
      }
      if (record.expiresAt <= now) return { status: "expired" };
      if (record.consumedAt !== null) return { status: "replayed" };
      record.consumedAt = now;
      return { status: "consumed", record: { ...record } };
    },
  };
}

function createHarness(overrides = {}) {
  const validatorCalls = [];
  const tenantLookups = [];
  const sessions = new Map();
  const fallbackCalls = [];
  const repository = atomicNonceRepository();
  let entropy = 1;
  const nonceService = createVoiceSessionNonceService({
    repository,
    now: () => 1_000,
    randomBytes: () => Buffer.alloc(32, entropy++),
    ttlMs: 60_000,
  });
  const twilioValidator = createTwilioRequestValidator({
    validateRequest: (authToken, signature, url, params) => {
      validatorCalls.push({ authToken, signature, url, params });
      if (url.startsWith("wss:")) return signature === "signed-websocket";
      return signature === "signed-http";
    },
    authToken: "test-auth-token",
    publicBaseUrl: PUBLIC_BASE_URL,
    allowedAccountSids: [ACCOUNT_SID],
  });
  const tenantResolver = createVoiceTenantResolver({
    findByTwilioNumber: async (number) => {
      tenantLookups.push(number);
      if (overrides.tenantRows !== undefined) return overrides.tenantRows;
      return [{ ownerId: "owner-a", twilioNumber: TO }];
    },
  });

  const events = {
    operatorChecks: 0,
    capChecks: 0,
    sessionCreates: 0,
  };
  const app = express();
  installVoiceRuntimeRoutes(app, {
    twilioValidator,
    tenantResolver,
    nonceService,
    allowedAccountSids: overrides.routeAccountSids ?? [ACCOUNT_SID],
    publicBaseUrl: PUBLIC_BASE_URL,
    runtimeEnabled: overrides.runtimeEnabled ?? true,
    checkOperatorEligibility: async (input) => {
      events.operatorChecks += 1;
      return overrides.operatorDecision === undefined ? true : overrides.operatorDecision(input);
    },
    checkVoiceCap: async (input) => {
      events.capChecks += 1;
      return overrides.capDecision === undefined
        ? { canStartNewCall: true }
        : overrides.capDecision(input);
    },
    createSession: async ({ sessionKey, context, expiresAt }) => {
      events.sessionCreates += 1;
      if (overrides.createSession) {
        return overrides.createSession({ sessionKey, context, expiresAt, sessions });
      }
      sessions.set(sessionKey, {
        context: { ...context },
        session: { callRecordId: "call-record-a" },
        expiresAt,
      });
      return { status: "created" };
    },
    resolveFallback: async (input) => {
      fallbackCalls.push(input);
      if (overrides.resolveFallback) return overrides.resolveFallback(input);
      return { mode: "message", message: "Please call again later." };
    },
    recordFallback: overrides.recordFallback,
  });

  return {
    app,
    twilioValidator,
    nonceService,
    repository,
    sessions,
    validatorCalls,
    tenantLookups,
    fallbackCalls,
    events,
  };
}

async function listen(app) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
  };
}

async function stop(server) {
  server.closeAllConnections?.();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function inboundForm(overrides = {}) {
  return new URLSearchParams({
    AccountSid: ACCOUNT_SID,
    CallSid: CALL_SID,
    From: FROM,
    To: TO,
    Direction: "inbound",
    ...overrides,
  });
}

async function postInbound(harness, {
  signature = "signed-http",
  form = inboundForm(),
} = {}) {
  const { server, origin } = await listen(harness.app);
  try {
    return await fetch(`${origin}${INCOMING_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        connection: "close",
        "x-twilio-signature": signature,
      },
      body: form,
    });
  } finally {
    await stop(server);
  }
}

function streamRequestPath(xml) {
  const match = xml.match(/url="wss:\/\/voice\.example\.test([^\"]+)"/);
  assert.ok(match, "expected an opaque WSS stream URL");
  return match[1];
}

test("forged inbound signatures are rejected before tenant lookup or session creation", async () => {
  const harness = createHarness();
  const response = await postInbound(harness, { signature: "forged" });
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "Forbidden");
  assert.deepEqual(harness.tenantLookups, []);
  assert.equal(harness.events.operatorChecks, 0);
  assert.equal(harness.events.capChecks, 0);
  assert.equal(harness.events.sessionCreates, 0);
});

test("the independently enforced account allowlist rejects an otherwise signed account", async () => {
  const harness = createHarness({ routeAccountSids: [OTHER_ACCOUNT_SID] });
  const response = await postInbound(harness);
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "Forbidden");
  assert.deepEqual(harness.tenantLookups, []);
});

test("tenant identity comes only from signed To and the stream URL contains only a one-use nonce", async () => {
  const harness = createHarness();
  const response = await postInbound(harness, {
    form: inboundForm({ ownerId: "owner-attacker", tenantOwnerId: "owner-attacker" }),
  });
  const xml = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/xml/);
  assert.deepEqual(harness.tenantLookups, [TO]);
  assert.equal(harness.events.sessionCreates, 1);
  assert.match(
    xml,
    /^<\?xml version="1\.0" encoding="UTF-8"\?><Response><Connect><Stream url="wss:\/\/voice\.example\.test\/api\/twilio\/voice\/stream\/[A-Za-z0-9_-]{43}"\/><\/Connect><\/Response>$/,
  );
  for (const forbidden of ["owner-a", "owner-attacker", ACCOUNT_SID, CALL_SID, FROM, TO, "auth-token"]) {
    assert.equal(xml.includes(forbidden), false, `stream XML leaked ${forbidden}`);
  }
  const [sessionKey] = harness.sessions.keys();
  assert.match(sessionKey, /^[0-9a-f]{64}$/);
  assert.equal(xml.includes(sessionKey), false);
  const storedNonce = [...harness.repository.records.values()][0];
  assert.equal(storedNonce.nonce, undefined);
  assert.equal(storedNonce.ownerId, "owner-a");
});

test("unknown and ambiguous signed destinations fail closed without choosing a tenant", async () => {
  for (const tenantRows of [
    [],
    [
      { ownerId: "owner-a", twilioNumber: TO },
      { ownerId: "owner-b", twilioNumber: TO },
    ],
  ]) {
    const harness = createHarness({ tenantRows });
    const response = await postInbound(harness);
    assert.equal([404, 409].includes(response.status), true);
    assert.equal(harness.events.sessionCreates, 0);
    assert.equal(harness.fallbackCalls.length, 0);
  }
});

test("operator-off calls deterministically forward to the configured business number", async () => {
  const harness = createHarness({
    tenantRows: [{ ownerId: "owner-a", twilioNumber: TO, operatorEnabled: false }],
    operatorDecision: () => ({ allowed: false, reason: "OPERATOR_TOGGLE_OFF" }),
    resolveFallback: ({ reason }) => ({
      mode: "forward",
      number: BUSINESS_NUMBER,
      message: `No answer for ${reason}.`,
    }),
  });
  const response = await postInbound(harness);
  const xml = await response.text();
  assert.equal(response.status, 200);
  assert.equal(harness.events.operatorChecks, 1);
  assert.equal(harness.events.capChecks, 0);
  assert.equal(harness.events.sessionCreates, 0);
  assert.equal(harness.fallbackCalls[0].reason, "OPERATOR_TOGGLE_OFF");
  assert.equal(
    xml,
    '<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true" timeout="20"><Number>+19025550199</Number></Dial><Say>No answer for OPERATOR_TOGGLE_OFF.</Say><Hangup/></Response>',
  );
});

test("runtime-disabled calls never run entitlement checks or allocate an AI session", async () => {
  const harness = createHarness({ runtimeEnabled: false });
  const response = await postInbound(harness);
  assert.equal(response.status, 200);
  assert.equal(harness.events.operatorChecks, 0);
  assert.equal(harness.events.capChecks, 0);
  assert.equal(harness.events.sessionCreates, 0);
  assert.equal(harness.fallbackCalls[0].reason, "VOICE_RUNTIME_DISABLED");
});

test("a reached voice cap uses message fallback and escapes owner-authored XML", async () => {
  const injection = `Can't <script src="bad">& 'won't'.`;
  const harness = createHarness({
    capDecision: () => ({
      canStartNewCall: false,
      reason: "TRIAL_VOICE_CAP_REACHED",
    }),
    resolveFallback: () => ({ mode: "message", message: injection }),
  });
  const response = await postInbound(harness);
  const xml = await response.text();
  assert.equal(response.status, 200);
  assert.equal(harness.events.sessionCreates, 0);
  assert.equal(harness.fallbackCalls[0].reason, "TRIAL_VOICE_CAP_REACHED");
  assert.equal(xml.includes("<script"), false);
  assert.equal(xml.includes("&lt;script src=&quot;bad&quot;&gt;&amp; &apos;won&apos;t&apos;."), true);
  assert.match(xml, /<Hangup\/><\/Response>$/);
});

test("invalid or self-referential forwarding cannot create a dial loop", async () => {
  for (const number of [TO, "<Number>+19025550199</Number>"]) {
    const harness = createHarness({
      operatorDecision: () => false,
      resolveFallback: () => ({ mode: "forward", number, message: "Leave us a message." }),
    });
    const response = await postInbound(harness);
    const xml = await response.text();
    assert.equal(xml.includes("<Dial"), false);
    assert.equal(xml.includes("<Record"), false);
    assert.equal(xml.includes("<Say>Leave us a message.</Say>"), true);
  }
});

test("nonce or session persistence failure falls back instead of returning a dead stream", async () => {
  const recorded = [];
  const harness = createHarness({
    createSession: async () => {
      throw new Error("database unavailable");
    },
    recordFallback: async ({ reason }) => recorded.push(reason),
  });
  const response = await postInbound(harness);
  const xml = await response.text();
  assert.equal(response.status, 200);
  assert.equal(xml.includes("<Stream"), false);
  assert.equal(xml.includes("<Say>Please call again later.</Say>"), true);
  assert.deepEqual(recorded, ["VOICE_SESSION_UNAVAILABLE"]);
});

test("signed WebSocket authorization consumes the nonce once and starts one injected media session", async () => {
  const harness = createHarness();
  const response = await postInbound(harness);
  const requestPath = streamRequestPath(await response.text());
  const started = [];
  let loads = 0;
  const coordinator = createVoiceWebSocketSessionCoordinator({
    twilioValidator: harness.twilioValidator,
    nonceService: harness.nonceService,
    loadSessionByNonceHash: async ({ sessionKey }) => {
      loads += 1;
      return harness.sessions.get(sessionKey);
    },
    startMediaSession: async (value) => {
      started.push(value);
      return { status: "started" };
    },
  });

  const authorization = await coordinator.authorizeUpgrade({
    signature: "signed-websocket",
    requestPath,
  });
  assert.equal(authorization.context.ownerId, "owner-a");
  assert.deepEqual(authorization.session, { callRecordId: "call-record-a" });
  assert.equal(Object.prototype.hasOwnProperty.call(authorization, "nonce"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(authorization, "sessionKey"), false);

  await assert.rejects(
    coordinator.authorizeUpgrade({ signature: "signed-websocket", requestPath }),
    hasCode("SESSION_NONCE_REPLAYED"),
  );
  assert.equal(loads, 2);

  const socket = { id: "socket-a" };
  const start = await coordinator.startAuthorizedSession({
    authorization,
    socket,
    request: { headers: {} },
  });
  assert.deepEqual(start, { status: "started" });
  assert.equal(started.length, 1);
  assert.equal(started[0].context.ownerId, "owner-a");
  assert.equal(started[0].socket, socket);

  await assert.rejects(
    coordinator.startAuthorizedSession({ authorization, socket }),
    hasCode("STREAM_AUTHORIZATION_REPLAYED"),
  );
  assert.equal(started.length, 1);
});

test("forged WebSocket signatures cannot load sessions and mismatched bindings cannot consume a nonce", async () => {
  const harness = createHarness();
  const response = await postInbound(harness);
  const requestPath = streamRequestPath(await response.text());
  const nonce = requestPath.slice(`${STREAM_PATH}/`.length);
  const sessionKey = createHash("sha256").update(nonce, "utf8").digest("hex");
  let loads = 0;
  const coordinator = createVoiceWebSocketSessionCoordinator({
    twilioValidator: harness.twilioValidator,
    nonceService: harness.nonceService,
    loadSessionByNonceHash: async ({ sessionKey: requestedKey }) => {
      loads += 1;
      assert.equal(requestedKey, sessionKey);
      const stored = harness.sessions.get(requestedKey);
      return {
        ...stored,
        context: { ...stored.context, ownerId: "owner-b" },
      };
    },
    startMediaSession: async () => ({ status: "started" }),
  });

  await assert.rejects(
    coordinator.authorizeUpgrade({ signature: "forged", requestPath }),
    hasCode("INVALID_TWILIO_SIGNATURE"),
  );
  assert.equal(loads, 0);
  await assert.rejects(
    coordinator.authorizeUpgrade({ signature: "signed-websocket", requestPath }),
    hasCode("INVALID_SESSION_NONCE"),
  );
  assert.equal(loads, 1);
});

test("stream paths reject query data so secrets or identity cannot ride beside the nonce", async () => {
  const harness = createHarness();
  const response = await postInbound(harness);
  const requestPath = streamRequestPath(await response.text());
  const coordinator = createVoiceWebSocketSessionCoordinator({
    twilioValidator: harness.twilioValidator,
    nonceService: harness.nonceService,
    loadSessionByNonceHash: async ({ sessionKey }) => harness.sessions.get(sessionKey),
    startMediaSession: async () => ({ status: "started" }),
  });
  await assert.rejects(
    coordinator.authorizeUpgrade({
      signature: "signed-websocket",
      requestPath: `${requestPath}?ownerId=owner-a`,
    }),
    hasCode("INVALID_STREAM_PATH"),
  );
});

