const HANDLE = /^[A-Za-z0-9_-]{24,200}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FORBIDDEN_KEYS = new Set([
  "ownerid",
  "tenantid",
  "tenantownerid",
  "accountsid",
  "callsid",
  "from",
  "to",
  "phonenumber",
  "twilionumber",
  "twilionumbersid",
  "serviceid",
  "quoteid",
  "slotid",
  "appointmentid",
  "customerid",
  "leadid",
  "calendarid",
  "pricebook",
  "bookversion",
  "ownerspricing",
  "pricing",
  "rate",
  "rates",
  "unitrate",
  "baserate",
  "cost",
  "internalcost",
  "markup",
  "margin",
  "datetime",
  "rawdatetime",
  "startdatetime",
  "enddatetime",
  "starttime",
  "endtime",
  "durationminutes",
  "__proto__",
  "prototype",
  "constructor",
]);

const FORBIDDEN_DERIVED_KEYS = new Set([
  "hourlyrate",
  "laborrate",
  "materialrate",
  "ownerrate",
  "rawrate",
  "unitprice",
  "unitcost",
  "laborcost",
  "materialcost",
  "estimatedcost",
  "estimatedprice",
  "customerprice",
  "ownerprice",
  "requestedatetime",
  "requesteddatetime",
  "scheduleddatetime",
]);

const FORBIDDEN_ID_SUFFIXES = [
  "ownerid",
  "tenantid",
  "accountsid",
  "callsid",
  "serviceid",
  "quoteid",
  "slotid",
  "appointmentid",
  "customerid",
  "leadid",
  "calendarid",
];

export const VOICE_TOOL_NAMES = Object.freeze([
  "matchService",
  "getQuote",
  "checkAvailability",
  "bookAppointment",
  "captureLead",
  "logQuoteRequest",
  "sendSms",
  "flagUrgent",
  "transferCall",
  "modifyAppointment",
  "getCustomerContext",
]);

export const MUTATING_VOICE_TOOLS = Object.freeze(
  VOICE_TOOL_NAMES.filter((name) => !["matchService", "getCustomerContext"].includes(name)),
);

export class VoiceToolValidationError extends Error {
  constructor(code) {
    super("The requested voice action was not valid.");
    this.name = "VoiceToolValidationError";
    this.code = code;
    this.statusCode = 400;
  }
}

function fail(code) {
  throw new VoiceToolValidationError(code);
}

function normalizedKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function forbiddenNormalizedKey(key) {
  return (
    FORBIDDEN_KEYS.has(key) ||
    FORBIDDEN_DERIVED_KEYS.has(key) ||
    FORBIDDEN_ID_SUFFIXES.some((suffix) => key.endsWith(suffix)) ||
    key.endsWith("datetime")
  );
}

function assertAllowedKey(key) {
  if (typeof key !== "string" || forbiddenNormalizedKey(normalizedKey(key))) {
    fail("FORBIDDEN_TOOL_FIELD");
  }
}

function assertPlainObject(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("INVALID_TOOL_OBJECT");
  }
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) {
    fail("INVALID_TOOL_OBJECT");
  }
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) fail("INVALID_TOOL_OBJECT");
  }
}

function assertClosed(value, allowed, required = []) {
  assertPlainObject(value);
  const keys = Object.keys(value);
  for (const key of keys) {
    assertAllowedKey(key);
    if (!allowed.includes(key)) fail("EXTRA_TOOL_FIELD");
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) fail("MISSING_TOOL_FIELD");
  }
}

function text(value, { min = 1, max = 500 } = {}) {
  if (typeof value !== "string") fail("INVALID_TOOL_STRING");
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) fail("INVALID_TOOL_STRING");
  return normalized;
}

function handle(value) {
  if (typeof value !== "string" || !HANDLE.test(value)) fail("INVALID_OPAQUE_HANDLE");
  return value;
}

function oneOf(value, values) {
  if (typeof value !== "string" || !values.includes(value)) fail("INVALID_TOOL_ENUM");
  return value;
}

function confirmed(value) {
  if (value !== true) fail("CUSTOMER_CONFIRMATION_REQUIRED");
  return true;
}

function textList(value, { maxItems = 20, maxLength = 300 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) fail("INVALID_TOOL_ARRAY");
  return value.map((item) => text(item, { max: maxLength }));
}

function handleList(value, { maxItems = 50 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) fail("INVALID_TOOL_ARRAY");
  return value.map(handle);
}

function safeDynamicValue(value, depth = 0, budget = { nodes: 0 }) {
  budget.nodes += 1;
  if (budget.nodes > 250 || depth > 6) fail("TOOL_INPUT_TOO_LARGE");

  if (typeof value === "string") return text(value, { min: 0, max: 1_000 });
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) {
      fail("INVALID_TOOL_NUMBER");
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 50) fail("TOOL_INPUT_TOO_LARGE");
    return value.map((item) => safeDynamicValue(item, depth + 1, budget));
  }

  assertPlainObject(value);
  const keys = Object.keys(value);
  if (keys.length > 50) fail("TOOL_INPUT_TOO_LARGE");
  const output = {};
  for (const key of keys) {
    assertAllowedKey(key);
    if (key.length === 0 || key.length > 100) fail("INVALID_TOOL_FIELD");
    output[key] = safeDynamicValue(value[key], depth + 1, budget);
  }
  return output;
}

function address(value) {
  assertClosed(
    value,
    ["line1", "line2", "city", "region", "postalCode", "country"],
    ["line1", "city", "region", "postalCode"],
  );
  const result = {
    line1: text(value.line1, { max: 200 }),
    city: text(value.city, { max: 100 }),
    region: text(value.region, { max: 100 }),
    postalCode: text(value.postalCode, { max: 30 }),
  };
  if (value.line2 !== undefined) result.line2 = text(value.line2, { max: 200 });
  if (value.country !== undefined) result.country = text(value.country, { max: 2 });
  return result;
}

function matchService(args) {
  assertClosed(args, ["query"], ["query"]);
  return { query: text(args.query, { max: 500 }) };
}

function getQuote(args) {
  assertClosed(
    args,
    ["serviceHandle", "customerInputs", "feeSelectionHandles", "additionalWork"],
    ["serviceHandle", "customerInputs"],
  );
  const result = {
    serviceHandle: handle(args.serviceHandle),
    customerInputs: safeDynamicValue(args.customerInputs),
  };
  if (args.feeSelectionHandles !== undefined) {
    result.feeSelectionHandles = handleList(args.feeSelectionHandles);
  }
  if (args.additionalWork !== undefined) result.additionalWork = textList(args.additionalWork);
  return result;
}

function checkAvailability(args) {
  assertClosed(args, ["quoteHandle", "preference"], ["quoteHandle"]);
  const result = { quoteHandle: handle(args.quoteHandle) };
  if (args.preference !== undefined) {
    result.preference = text(args.preference, { max: 300 });
  }
  return result;
}

function bookAppointment(args) {
  assertClosed(
    args,
    ["slotHandle", "leadHandle", "customerConfirmed"],
    ["slotHandle", "leadHandle", "customerConfirmed"],
  );
  return {
    slotHandle: handle(args.slotHandle),
    leadHandle: handle(args.leadHandle),
    customerConfirmed: confirmed(args.customerConfirmed),
  };
}

function captureLead(args) {
  assertClosed(args, ["name", "email", "address", "notes"], ["name"]);
  const result = { name: text(args.name, { max: 120 }) };
  if (args.email !== undefined) {
    const email = text(args.email, { max: 254 }).toLowerCase();
    if (!EMAIL.test(email)) fail("INVALID_TOOL_EMAIL");
    result.email = email;
  }
  if (args.address !== undefined) result.address = address(args.address);
  if (args.notes !== undefined) result.notes = text(args.notes, { max: 1_000 });
  return result;
}

function logQuoteRequest(args) {
  assertClosed(args, ["description", "leadHandle"], ["description"]);
  const result = { description: text(args.description, { max: 1_000 }) };
  if (args.leadHandle !== undefined) result.leadHandle = handle(args.leadHandle);
  return result;
}

function sendSms(args) {
  assertClosed(args, ["template", "recordHandle"], ["template", "recordHandle"]);
  return {
    template: oneOf(args.template, ["quote", "booking", "callback", "reminder"]),
    recordHandle: handle(args.recordHandle),
  };
}

function flagUrgent(args) {
  assertClosed(args, ["reason", "summary"], ["reason"]);
  const result = {
    reason: oneOf(args.reason, ["active_leak", "flooding", "safety", "complaint"]),
  };
  if (args.summary !== undefined) result.summary = text(args.summary, { max: 500 });
  return result;
}

function transferCall(args) {
  assertClosed(args, ["reason", "customerConfirmed"], ["reason", "customerConfirmed"]);
  return {
    reason: oneOf(args.reason, ["caller_requested", "urgent", "escalation"]),
    customerConfirmed: confirmed(args.customerConfirmed),
  };
}

function modifyAppointment(args) {
  assertClosed(
    args,
    ["appointmentHandle", "action", "slotHandle", "customerConfirmed"],
    ["appointmentHandle", "action", "customerConfirmed"],
  );
  const action = oneOf(args.action, ["reschedule", "cancel"]);
  if (action === "reschedule" && args.slotHandle === undefined) fail("MISSING_TOOL_FIELD");
  if (action === "cancel" && args.slotHandle !== undefined) fail("EXTRA_TOOL_FIELD");
  const result = {
    appointmentHandle: handle(args.appointmentHandle),
    action,
    customerConfirmed: confirmed(args.customerConfirmed),
  };
  if (args.slotHandle !== undefined) result.slotHandle = handle(args.slotHandle);
  return result;
}

function getCustomerContext(args) {
  assertClosed(args, []);
  return {};
}

const VALIDATORS = Object.freeze({
  matchService,
  getQuote,
  checkAvailability,
  bookAppointment,
  captureLead,
  logQuoteRequest,
  sendSms,
  flagUrgent,
  transferCall,
  modifyAppointment,
  getCustomerContext,
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export function validateVoiceToolCall(name, args) {
  if (typeof name !== "string" || !Object.prototype.hasOwnProperty.call(VALIDATORS, name)) {
    fail("UNKNOWN_VOICE_TOOL");
  }
  return deepFreeze(VALIDATORS[name](args));
}

export function isForbiddenVoiceField(key) {
  return typeof key !== "string" || forbiddenNormalizedKey(normalizedKey(key));
}

