import { createHash } from "node:crypto";

import {
  MUTATING_VOICE_TOOLS,
  isForbiddenVoiceField,
  validateVoiceToolCall,
} from "./toolSchemas.js";

const E164 = /^\+[1-9]\d{7,14}$/;
const CALL_SID = /^CA[0-9a-fA-F]{32}$/;
const ACCOUNT_SID = /^AC[0-9a-fA-F]{32}$/;
const OWNER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const HANDLE = /^[A-Za-z0-9_-]{24,200}$/;
const TOOL_CALL_ID = /^[A-Za-z0-9_.:-]{1,200}$/;

const INTERNAL_OUTPUT_KEYS = new Set([
  "booksnapshot",
  "applicationeligibility",
  "providerresponse",
  "calendarresponse",
  "calendareventid",
  "internalresult",
  "lineitems",
  "breakdown",
  "request",
  "ownerenvelope",
]);

export class VoiceToolDispatchError extends Error {
  constructor(code, statusCode = 400) {
    super("The voice action could not be completed safely.");
    this.name = "VoiceToolDispatchError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, statusCode) {
  throw new VoiceToolDispatchError(code, statusCode);
}

function assertPlainObject(value, code = "INVALID_DISPATCH_OBJECT") {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).some((key) => typeof key !== "string")
  ) {
    fail(code);
  }
}

function assertClosed(value, allowed, required = [], code = "INVALID_DISPATCH_OBJECT") {
  assertPlainObject(value, code);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key))) fail(code);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(code);
}

function normalizeCallContext(value) {
  const keys = ["ownerId", "callSid", "from", "to", "accountSid"];
  assertClosed(value, keys, keys, "INVALID_CALL_CONTEXT");
  const context = {
    ownerId: typeof value.ownerId === "string" ? value.ownerId.trim() : "",
    callSid: typeof value.callSid === "string" ? value.callSid.trim() : "",
    from: typeof value.from === "string" ? value.from.trim() : "",
    to: typeof value.to === "string" ? value.to.trim() : "",
    accountSid: typeof value.accountSid === "string" ? value.accountSid.trim() : "",
  };
  if (
    !OWNER_ID.test(context.ownerId) ||
    !CALL_SID.test(context.callSid) ||
    !E164.test(context.from) ||
    !E164.test(context.to) ||
    !ACCOUNT_SID.test(context.accountSid)
  ) {
    fail("INVALID_CALL_CONTEXT");
  }
  return Object.freeze(context);
}

function normalizeOutputKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scanCustomerSafe(value, depth = 0, budget = { nodes: 0 }) {
  budget.nodes += 1;
  if (depth > 6 || budget.nodes > 300) fail("UNSAFE_TOOL_RESULT", 502);

  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > 4_000) fail("UNSAFE_TOOL_RESULT", 502);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("UNSAFE_TOOL_RESULT", 502);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) fail("UNSAFE_TOOL_RESULT", 502);
    value.forEach((item) => scanCustomerSafe(item, depth + 1, budget));
    return;
  }

  assertPlainObject(value, "UNSAFE_TOOL_RESULT");
  const keys = Object.keys(value);
  if (keys.length > 100) fail("UNSAFE_TOOL_RESULT", 502);
  for (const key of keys) {
    const normalized = normalizeOutputKey(key);
    if (isForbiddenVoiceField(key) || INTERNAL_OUTPUT_KEYS.has(normalized)) {
      fail("UNSAFE_TOOL_RESULT", 502);
    }
    scanCustomerSafe(value[key], depth + 1, budget);
  }
}

function resultText(value, max = 2_000) {
  if (typeof value !== "string") fail("INVALID_TOOL_RESULT", 502);
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max) fail("INVALID_TOOL_RESULT", 502);
  return normalized;
}

function resultHandle(value) {
  if (typeof value !== "string" || !HANDLE.test(value)) fail("INVALID_TOOL_RESULT", 502);
  return value;
}

function resultMoney(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value)) return value;
  fail("INVALID_TOOL_RESULT", 502);
}

function resultTextList(value, maxItems = 30) {
  if (!Array.isArray(value) || value.length > maxItems) fail("INVALID_TOOL_RESULT", 502);
  return value.map((item) => resultText(item, 500));
}

function copyIf(result, output, key, reader) {
  if (Object.prototype.hasOwnProperty.call(result, key)) output[key] = reader(result[key]);
}

function baseResult(result) {
  assertPlainObject(result, "INVALID_TOOL_RESULT");
  scanCustomerSafe(result);
  return { status: resultText(result.status, 80) };
}

const PROJECTORS = Object.freeze({
  matchService(result) {
    const output = baseResult(result);
    copyIf(result, output, "serviceHandle", resultHandle);
    copyIf(result, output, "serviceName", (value) => resultText(value, 200));
    copyIf(result, output, "clarification", (value) => resultText(value, 500));
    if (result.confidence !== undefined) {
      if (typeof result.confidence !== "number" || result.confidence < 0 || result.confidence > 1) {
        fail("INVALID_TOOL_RESULT", 502);
      }
      output.confidence = result.confidence;
    }
    return output;
  },

  getQuote(result) {
    const output = baseResult(result);
    copyIf(result, output, "quoteHandle", resultHandle);
    copyIf(result, output, "resultType", (value) => resultText(value, 80));
    for (const key of ["lowEstimate", "midEstimate", "highEstimate", "fullJobTotal"]) {
      copyIf(result, output, key, resultMoney);
    }
    for (const key of ["priceDrivers", "pricedScope", "additionalWork", "followUps"]) {
      copyIf(result, output, key, resultTextList);
    }
    for (const key of ["disclaimer", "customerMessage", "additionalWorkStatus"]) {
      copyIf(result, output, key, (value) => resultText(value, 2_000));
    }
    return output;
  },

  checkAvailability(result) {
    const output = baseResult(result);
    copyIf(result, output, "message", (value) => resultText(value, 1_000));
    if (result.slotOptions !== undefined) {
      if (!Array.isArray(result.slotOptions) || result.slotOptions.length > 10) {
        fail("INVALID_TOOL_RESULT", 502);
      }
      output.slotOptions = result.slotOptions.map((slot) => {
        assertClosed(slot, ["slotHandle", "label"], ["slotHandle", "label"], "INVALID_TOOL_RESULT");
        return {
          slotHandle: resultHandle(slot.slotHandle),
          label: resultText(slot.label, 200),
        };
      });
    }
    return output;
  },

  bookAppointment(result) {
    const output = baseResult(result);
    copyIf(result, output, "appointmentHandle", resultHandle);
    copyIf(result, output, "confirmation", (value) => resultText(value, 1_000));
    copyIf(result, output, "message", (value) => resultText(value, 1_000));
    return output;
  },

  captureLead(result) {
    const output = baseResult(result);
    copyIf(result, output, "leadHandle", resultHandle);
    copyIf(result, output, "message", (value) => resultText(value, 1_000));
    return output;
  },

  logQuoteRequest(result) {
    const output = baseResult(result);
    copyIf(result, output, "requestHandle", resultHandle);
    copyIf(result, output, "message", (value) => resultText(value, 1_000));
    return output;
  },

  sendSms(result) {
    const output = baseResult(result);
    copyIf(result, output, "message", (value) => resultText(value, 1_000));
    return output;
  },

  flagUrgent(result) {
    const output = baseResult(result);
    copyIf(result, output, "caseHandle", resultHandle);
    copyIf(result, output, "message", (value) => resultText(value, 1_000));
    return output;
  },

  transferCall(result) {
    const output = baseResult(result);
    copyIf(result, output, "message", (value) => resultText(value, 1_000));
    return output;
  },

  modifyAppointment(result) {
    const output = baseResult(result);
    copyIf(result, output, "appointmentHandle", resultHandle);
    copyIf(result, output, "confirmation", (value) => resultText(value, 1_000));
    copyIf(result, output, "message", (value) => resultText(value, 1_000));
    return output;
  },

  getCustomerContext(result) {
    const output = baseResult(result);
    copyIf(result, output, "customerHandle", resultHandle);
    copyIf(result, output, "greetingName", (value) => resultText(value, 120));
    copyIf(result, output, "recentAppointments", (value) => resultTextList(value, 10));
    copyIf(result, output, "message", (value) => resultText(value, 1_000));
    return output;
  },
});

export function projectVoiceToolResult(name, result) {
  const projector = PROJECTORS[name];
  if (typeof projector !== "function") fail("UNKNOWN_VOICE_TOOL");
  return Object.freeze(projector(result));
}

function requestDigest(name, args) {
  return createHash("sha256").update(JSON.stringify({ name, args }), "utf8").digest("hex");
}

/**
 * The idempotency store must implement an atomic `run` operation. It receives
 * { scope, key, digest, execute }. Exact retries return
 * { status: "replayed", value }; a new call runs execute once and returns
 * { status: "executed", value }; reuse with a different digest returns
 * { status: "conflict" }. Production wiring must use durable storage.
 */
export function createVoiceToolDispatcher({ handlers, callContext, idempotencyStore } = {}) {
  if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
    fail("TOOL_HANDLERS_REQUIRED", 500);
  }
  if (!idempotencyStore || typeof idempotencyStore.run !== "function") {
    fail("IDEMPOTENCY_STORE_REQUIRED", 500);
  }
  const context = normalizeCallContext(callContext);
  const scope = createHash("sha256")
    .update(`${context.ownerId}\0${context.callSid}`, "utf8")
    .digest("hex");
  let mutationTail = Promise.resolve();

  function invoke(name, args) {
    const handler = handlers[name];
    if (typeof handler !== "function") fail("TOOL_UNAVAILABLE", 503);
    return Promise.resolve()
      .then(() => handler({ context, args }))
      .then((result) => projectVoiceToolResult(name, result))
      .catch((error) => {
        if (error instanceof VoiceToolDispatchError) throw error;
        fail("TOOL_EXECUTION_FAILED", 502);
      });
  }

  function enqueueMutation(task) {
    const current = mutationTail.then(task, task);
    mutationTail = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  }

  return Object.freeze({
    get context() {
      return context;
    },

    async dispatch(request) {
      assertClosed(request, ["name", "args", "toolCallId"], ["name", "args"]);
      const { name } = request;
      const args = validateVoiceToolCall(name, request.args);
      const mutating = MUTATING_VOICE_TOOLS.includes(name);

      if (!mutating) return invoke(name, args);
      if (typeof request.toolCallId !== "string" || !TOOL_CALL_ID.test(request.toolCallId)) {
        fail("TOOL_CALL_ID_REQUIRED");
      }

      const digest = requestDigest(name, args);
      return enqueueMutation(async () => {
        let outcome;
        try {
          outcome = await idempotencyStore.run({
            scope,
            key: request.toolCallId,
            digest,
            execute: () => invoke(name, args),
          });
        } catch (error) {
          if (error instanceof VoiceToolDispatchError) throw error;
          fail("IDEMPOTENCY_STORE_FAILED", 503);
        }

        if (outcome?.status === "conflict") fail("IDEMPOTENCY_CONFLICT", 409);
        if (!["executed", "replayed"].includes(outcome?.status)) {
          fail("INVALID_IDEMPOTENCY_RESULT", 500);
        }
        return projectVoiceToolResult(name, outcome.value);
      });
    },
  });
}

