import test from "node:test";
import assert from "node:assert/strict";

import { createTwilioRequestValidator } from "../server/src/voice/twilioValidation.js";
import { createVoiceTenantResolver } from "../server/src/voice/tenantResolver.js";
import { createVoiceSessionNonceService } from "../server/src/voice/sessionNonceService.js";
import { validateVoiceToolCall } from "../server/src/voice/toolSchemas.js";
import { createVoiceToolDispatcher } from "../server/src/voice/toolDispatcher.js";

const ACCOUNT_SID = `AC${"a".repeat(32)}`;
const CALL_SID = `CA${"b".repeat(32)}`;
const FROM = "+19025550100";
const TO = "+19025550101";
const HANDLE_A = "a".repeat(32);
const HANDLE_B = "b".repeat(32);

const hasCode = (code) => (error) => error?.code === code;

test("Twilio validation fails closed without the official validator dependency", () => {
  assert.throws(
    () =>
      createTwilioRequestValidator({
        authToken: "secret",
        publicBaseUrl: "https://voice.example.test",
      }),
    hasCode("TWILIO_VALIDATOR_REQUIRED"),
  );
});

test("Twilio validation rejects missing and forged signatures", async () => {
  const validator = createTwilioRequestValidator({
    validateRequest: () => false,
    authToken: "secret",
    publicBaseUrl: "https://voice.example.test",
    allowedAccountSids: [ACCOUNT_SID],
  });

  await assert.rejects(
    validator.validateHttp({
      requestPath: "/voice/inbound",
      params: { AccountSid: ACCOUNT_SID },
    }),
    hasCode("MISSING_TWILIO_SIGNATURE"),
  );
  await assert.rejects(
    validator.validateHttp({
      signature: "forged",
      requestPath: "/voice/inbound",
      params: { AccountSid: ACCOUNT_SID },
    }),
    hasCode("INVALID_TWILIO_SIGNATURE"),
  );
});

test("Twilio validation uses only the configured public origin", async () => {
  const calls = [];
  const validator = createTwilioRequestValidator({
    validateRequest: (...args) => {
      calls.push(args);
      return true;
    },
    authToken: "secret",
    publicBaseUrl: "https://voice.example.test",
    allowedAccountSids: [ACCOUNT_SID],
  });

  const result = await validator.validateHttp({
    signature: "signed",
    requestPath: "/voice/inbound?region=ca",
    params: { AccountSid: ACCOUNT_SID, To: TO },
  });
  assert.equal(result.canonicalUrl, "https://voice.example.test/voice/inbound?region=ca");
  assert.deepEqual(calls[0], [
    "secret",
    "signed",
    "https://voice.example.test/voice/inbound?region=ca",
    { AccountSid: ACCOUNT_SID, To: TO },
  ]);

  await assert.rejects(
    validator.validateHttp({
      signature: "signed",
      requestPath: "https://attacker.invalid/voice/inbound",
      params: { AccountSid: ACCOUNT_SID },
    }),
    hasCode("INVALID_REQUEST_PATH"),
  );

  await validator.validateWebSocket({
    signature: "signed-websocket",
    requestPath: "/voice/stream?nonce=opaque",
  });
  assert.deepEqual(calls[1], [
    "secret",
    "signed-websocket",
    "wss://voice.example.test/voice/stream?nonce=opaque",
    {},
  ]);
});

test("tenant resolution is by normalized To only and rejects cross-tenant selectors", async () => {
  const lookups = [];
  const resolver = createVoiceTenantResolver({
    findByTwilioNumber: async (number) => {
      lookups.push(number);
      return [{ ownerId: "owner-a", twilioNumber: TO, operatorEnabled: true }];
    },
  });

  const tenant = await resolver.resolveByCalledNumber({ To: ` ${TO} ` });
  assert.deepEqual(tenant, { ownerId: "owner-a", calledNumber: TO });
  assert.deepEqual(lookups, [TO]);

  await assert.rejects(
    resolver.resolveByCalledNumber({ To: TO, ownerId: "owner-b" }),
    hasCode("INVALID_TENANT_LOOKUP"),
  );
});

test("tenant resolution fails closed for unknown and duplicate destinations", async () => {
  const unknown = createVoiceTenantResolver({ findByTwilioNumber: async () => [] });
  await assert.rejects(
    unknown.resolveByCalledNumber({ To: TO }),
    hasCode("UNKNOWN_DESTINATION"),
  );

  const duplicate = createVoiceTenantResolver({
    findByTwilioNumber: async () => [
      { ownerId: "owner-a", twilioNumber: TO },
      { ownerId: "owner-b", twilioNumber: TO },
    ],
  });
  await assert.rejects(
    duplicate.resolveByCalledNumber({ To: TO }),
    hasCode("AMBIGUOUS_DESTINATION"),
  );
});

function createAtomicNonceRepository() {
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

function binding(overrides = {}) {
  return {
    ownerId: "owner-a",
    callSid: CALL_SID,
    from: FROM,
    to: TO,
    accountSid: ACCOUNT_SID,
    ...overrides,
  };
}

test("session nonces store only a hash, bind every call identity field, and are one-use", async () => {
  let clock = 1_000;
  const repository = createAtomicNonceRepository();
  const service = createVoiceSessionNonceService({
    repository,
    now: () => clock,
    randomBytes: () => Buffer.alloc(32, 7),
    ttlMs: 5_000,
  });

  const issued = await service.issue(binding());
  const [stored] = repository.records.values();
  assert.equal(stored.nonce, undefined);
  assert.notEqual(stored.nonceHash, issued.nonce);
  assert.match(stored.nonceHash, /^[0-9a-f]{64}$/);

  await assert.rejects(
    service.consume({ nonce: issued.nonce, binding: binding({ ownerId: "owner-b" }) }),
    hasCode("INVALID_SESSION_NONCE"),
  );
  await service.consume({ nonce: issued.nonce, binding: binding() });
  await assert.rejects(
    service.consume({ nonce: issued.nonce, binding: binding() }),
    hasCode("SESSION_NONCE_REPLAYED"),
  );
});

test("session nonces reject expiration and every binding mismatch", async () => {
  const mismatchCases = [
    { callSid: `CA${"c".repeat(32)}` },
    { from: "+19025550109" },
    { to: "+19025550108" },
    { accountSid: `AC${"d".repeat(32)}` },
  ];

  for (const mismatch of mismatchCases) {
    let clock = 10_000;
    const repository = createAtomicNonceRepository();
    const service = createVoiceSessionNonceService({
      repository,
      now: () => clock,
      randomBytes: () => Buffer.alloc(32, Object.keys(mismatch)[0].length),
      ttlMs: 5_000,
    });
    const issued = await service.issue(binding());
    await assert.rejects(
      service.consume({ nonce: issued.nonce, binding: binding(mismatch) }),
      hasCode("INVALID_SESSION_NONCE"),
    );
  }

  let clock = 20_000;
  const repository = createAtomicNonceRepository();
  const service = createVoiceSessionNonceService({
    repository,
    now: () => clock,
    randomBytes: () => Buffer.alloc(32, 9),
    ttlMs: 5_000,
  });
  const issued = await service.issue(binding());
  clock = issued.expiresAt;
  await assert.rejects(
    service.consume({ nonce: issued.nonce, binding: binding() }),
    hasCode("SESSION_NONCE_EXPIRED"),
  );
});

test("tool schemas are closed and reject owner, rate, raw datetime, and raw identifier fields", () => {
  assert.throws(
    () => validateVoiceToolCall("matchService", { query: "water heater", debug: true }),
    hasCode("EXTRA_TOOL_FIELD"),
  );
  assert.throws(
    () => validateVoiceToolCall("matchService", { query: "water heater", ownerId: "owner-b" }),
    hasCode("FORBIDDEN_TOOL_FIELD"),
  );
  assert.throws(
    () =>
      validateVoiceToolCall("getQuote", {
        serviceHandle: HANDLE_A,
        customerInputs: { measurements: { squareFeet: 40 }, hourlyRate: 175 },
        customerConfirmed: true,
      }),
    hasCode("FORBIDDEN_TOOL_FIELD"),
  );
  assert.throws(
    () =>
      validateVoiceToolCall("bookAppointment", {
        slotHandle: HANDLE_A,
        leadHandle: HANDLE_B,
        customerConfirmed: true,
        datetime: "2026-10-01T10:00:00Z",
      }),
    hasCode("FORBIDDEN_TOOL_FIELD"),
  );
  assert.throws(
    () =>
      validateVoiceToolCall("getQuote", {
        serviceHandle: HANDLE_A,
        serviceId: "raw-database-id",
        customerInputs: {},
        customerConfirmed: true,
      }),
    hasCode("FORBIDDEN_TOOL_FIELD"),
  );
  for (const customerInputs of [
    { squareFeet: 40, address: "1 Main Street" },
    { squareFeet: 40, serviceAddress: { city: "Halifax" } },
    { squareFeet: 40, contact: { email: "sam@example.test" } },
  ]) {
    assert.throws(
      () => validateVoiceToolCall("getQuote", {
        serviceHandle: HANDLE_A,
        customerInputs,
        customerConfirmed: true,
      }),
      hasCode("FORBIDDEN_TOOL_FIELD"),
    );
  }
});

test("quote release requires an affirmative recap confirmation and availability requires an address-bound lead", () => {
  assert.throws(
    () => validateVoiceToolCall("getQuote", {
      serviceHandle: HANDLE_A,
      customerInputs: { squareFeet: 40 },
    }),
    hasCode("MISSING_TOOL_FIELD"),
  );
  assert.throws(
    () => validateVoiceToolCall("getQuote", {
      serviceHandle: HANDLE_A,
      customerInputs: { squareFeet: 40 },
      customerConfirmed: false,
    }),
    hasCode("CUSTOMER_CONFIRMATION_REQUIRED"),
  );
  assert.deepEqual(
    validateVoiceToolCall("getQuote", {
      serviceHandle: HANDLE_A,
      customerInputs: { squareFeet: 40 },
      customerConfirmed: true,
    }),
    {
      serviceHandle: HANDLE_A,
      customerInputs: { squareFeet: 40 },
      customerConfirmed: true,
    },
  );

  assert.throws(
    () => validateVoiceToolCall("checkAvailability", { quoteHandle: HANDLE_A }),
    hasCode("MISSING_TOOL_FIELD"),
  );
  assert.throws(
    () => validateVoiceToolCall("checkAvailability", {
      quoteHandle: HANDLE_A,
      leadHandle: HANDLE_B,
      address: { city: "Halifax" },
    }),
    hasCode("EXTRA_TOOL_FIELD"),
  );
  assert.throws(
    () => validateVoiceToolCall("checkAvailability", {
      quoteHandle: HANDLE_A,
      leadHandle: HANDLE_B,
      preference: "Tuesday afternoon",
    }),
    hasCode("INVALID_TOOL_OBJECT"),
  );
  assert.deepEqual(
    validateVoiceToolCall("checkAvailability", {
      quoteHandle: HANDLE_A,
      leadHandle: HANDLE_B,
      preference: {
        fromDate: "2026-10-06",
        days: 7,
        timeOfDay: ["morning", "afternoon"],
      },
    }),
    {
      quoteHandle: HANDLE_A,
      leadHandle: HANDLE_B,
      preference: {
        fromDate: "2026-10-06",
        days: 7,
        timeOfDay: ["morning", "afternoon"],
      },
    },
  );
  for (const preference of [
    { fromDate: "2026-02-30" },
    { days: 32 },
    { timeOfDay: ["morning", "morning"] },
    { timeOfDay: ["overnight"] },
    { fromDate: "2026-10-06", rawDatetime: "2026-10-06T10:00:00Z" },
  ]) {
    assert.throws(
      () => validateVoiceToolCall("checkAvailability", {
        quoteHandle: HANDLE_A,
        leadHandle: HANDLE_B,
        preference,
      }),
    );
  }
});

function createAtomicIdempotencyStore() {
  const records = new Map();
  return {
    records,
    async run({ scope, key, digest, execute }) {
      const composite = `${scope}:${key}`;
      const prior = records.get(composite);
      if (prior) {
        if (prior.digest !== digest) return { status: "conflict" };
        return { status: "replayed", value: prior.value };
      }
      const value = await execute();
      records.set(composite, { digest, value });
      return { status: "executed", value };
    },
  };
}

function dispatcher(options = {}) {
  return createVoiceToolDispatcher({
    handlers: options.handlers ?? {},
    callContext: binding(),
    idempotencyStore: options.idempotencyStore ?? createAtomicIdempotencyStore(),
  });
}

test("dispatcher passes immutable server tenant context and never accepts model tenant identifiers", async () => {
  let seen;
  const instance = dispatcher({
    handlers: {
      matchService: ({ context, args }) => {
        seen = { context, args };
        return { status: "matched", serviceHandle: HANDLE_A, serviceName: "Water heater" };
      },
    },
  });

  await assert.rejects(
    instance.dispatch({
      name: "matchService",
      args: { query: "water heater", ownerId: "owner-b" },
    }),
    hasCode("FORBIDDEN_TOOL_FIELD"),
  );
  const result = await instance.dispatch({
    name: "matchService",
    args: { query: "water heater" },
  });
  assert.equal(seen.context.ownerId, "owner-a");
  assert.equal(Object.isFrozen(seen.context), true);
  assert.equal(Object.isFrozen(seen.args), true);
  assert.deepEqual(result, {
    status: "matched",
    serviceHandle: HANDLE_A,
    serviceName: "Water heater",
  });
});

test("dispatcher rejects handler results containing raw rates instead of exposing them", async () => {
  const instance = dispatcher({
    handlers: {
      getQuote: () => ({
        status: "quoted",
        quoteHandle: HANDLE_B,
        midEstimate: "250.00",
        hourlyRate: "175.00",
      }),
    },
  });

  await assert.rejects(
    instance.dispatch({
      name: "getQuote",
      toolCallId: "quote-call-1",
      args: {
        serviceHandle: HANDLE_A,
        customerInputs: { squareFeet: 40 },
        customerConfirmed: true,
      },
    }),
    hasCode("UNSAFE_TOOL_RESULT"),
  );
});

test("mutations are idempotent and conflicting reuse of a tool call id is rejected", async () => {
  let calls = 0;
  const store = createAtomicIdempotencyStore();
  const instance = dispatcher({
    idempotencyStore: store,
    handlers: {
      getQuote: () => {
        calls += 1;
        return {
          status: "quoted",
          quoteHandle: HANDLE_B,
          resultType: "estimate",
          midEstimate: "250.00",
          customerMessage: "Your estimate is $250.00.",
        };
      },
    },
  });
  const request = {
    name: "getQuote",
    toolCallId: "quote-call-2",
    args: {
      serviceHandle: HANDLE_A,
      customerInputs: { squareFeet: 40 },
      customerConfirmed: true,
    },
  };

  const first = await instance.dispatch(request);
  const replay = await instance.dispatch(request);
  assert.deepEqual(replay, first);
  assert.equal(calls, 1);

  await assert.rejects(
    instance.dispatch({
      ...request,
      args: {
        serviceHandle: HANDLE_A,
        customerInputs: { squareFeet: 41 },
        customerConfirmed: true,
      },
    }),
    hasCode("IDEMPOTENCY_CONFLICT"),
  );
  assert.equal(calls, 1);
});

test("mutating tool calls execute sequentially within a call", async () => {
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  let signalStarted;
  let releaseFirst;
  const firstStarted = new Promise((resolve) => {
    signalStarted = resolve;
  });
  const firstRelease = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const instance = dispatcher({
    handlers: {
      captureLead: async () => {
        calls += 1;
        const callNumber = calls;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (callNumber === 1) {
          signalStarted();
          await firstRelease;
        }
        active -= 1;
        return {
          status: "captured",
          leadHandle: `${String(callNumber).repeat(24)}`,
          message: "Contact saved.",
        };
      },
    },
  });

  const first = instance.dispatch({
    name: "captureLead",
    toolCallId: "lead-call-1",
    args: { name: "Ada" },
  });
  const second = instance.dispatch({
    name: "captureLead",
    toolCallId: "lead-call-2",
    args: { name: "Grace" },
  });
  await firstStarted;
  assert.equal(calls, 1);
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(calls, 2);
  assert.equal(maximumActive, 1);
});

