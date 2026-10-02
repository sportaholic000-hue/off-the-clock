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

// Contact and address details belong to captureLead, never to quote measurements.
const CUSTOMER_INPUT_CONTACT_KEYS = /address|contact|email|phone|^name$|customername|callername/;
function assertNoContactKeys(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) { for (const item of value) assertNoContactKeys(item, depth + 1); return; }
  for (const key of Object.keys(value)) {
    if (CUSTOMER_INPUT_CONTACT_KEYS.test(normalizedKey(key))) fail("FORBIDDEN_TOOL_FIELD");
    assertNoContactKeys(value[key], depth + 1);
  }
}

function getQuote(args) {
  assertClosed(
    args,
    ["serviceHandle", "customerInputs", "feeSelectionHandles", "additionalWork", "customerConfirmed"],
    ["serviceHandle", "customerInputs", "customerConfirmed"],
  );
  if (args.customerInputs === null || typeof args.customerInputs !== "object" || Array.isArray(args.customerInputs)) {
    fail("INVALID_TOOL_OBJECT");
  }
  const customerInputs = safeDynamicValue(args.customerInputs);
  assertNoContactKeys(customerInputs);
  const result = {
    serviceHandle: handle(args.serviceHandle),
    customerInputs,
  };
  if (args.feeSelectionHandles !== undefined) {
    result.feeSelectionHandles = handleList(args.feeSelectionHandles);
  }
  if (args.additionalWork !== undefined) result.additionalWork = textList(args.additionalWork);
  result.customerConfirmed = confirmed(args.customerConfirmed);
  return result;
}

const TIMES_OF_DAY = ["morning", "afternoon", "evening"];
function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("INVALID_TOOL_DATE");
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) fail("INVALID_TOOL_DATE");
  return value;
}
function preference(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("INVALID_TOOL_OBJECT");
  assertClosed(value, ["fromDate", "days", "timeOfDay"]);
  const result = {};
  if (value.fromDate !== undefined) result.fromDate = calendarDate(value.fromDate);
  if (value.days !== undefined) {
    if (!Number.isInteger(value.days) || value.days < 1 || value.days > 31) fail("INVALID_TOOL_NUMBER");
    result.days = value.days;
  }
  if (value.timeOfDay !== undefined) {
    if (!Array.isArray(value.timeOfDay) || !value.timeOfDay.length || value.timeOfDay.length > 3) fail("INVALID_TOOL_ARRAY");
    const items = value.timeOfDay.map((item) => oneOf(item, TIMES_OF_DAY));
    if (new Set(items).size !== items.length) fail("INVALID_TOOL_ARRAY");
    result.timeOfDay = items;
  }
  return result;
}

function checkAvailability(args) {
  assertClosed(args, ["quoteHandle", "leadHandle", "preference"], ["quoteHandle", "leadHandle"]);
  const result = { quoteHandle: handle(args.quoteHandle), leadHandle: handle(args.leadHandle) };
  if (args.preference !== undefined) result.preference = preference(args.preference);
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


// Gemini function declarations. Every declaration mirrors its validator exactly: the same
// field names, the same required list, closed objects. Validators stay authoritative.
const S = (description) => ({ type: "STRING", description });
const HANDLE_DECL = (what) => S(`Opaque ${what} handle returned by an earlier tool result. Copy it exactly.`);
const ADDRESS_DECL = {
  type: "OBJECT",
  description: "Service address the caller gave.",
  properties: { line1: S("Street address"), line2: S("Unit or suite"), city: S("City"), region: S("Province or state"), postalCode: S("Postal or ZIP code"), country: S("Two-letter country code") },
  required: ["line1", "city", "region", "postalCode"],
  additionalProperties: false,
};
const DECLARATION_SPECS = [
  ["matchService", "Match what the caller described to one of this business's services. Returns a serviceHandle.",
    { query: S("The caller's description of the work, in their words.") }, ["query"]],
  ["getQuote", "Get the business's quote for a matched service. Call only after reading back every measurement and the caller confirming the recap.",
    {
      serviceHandle: HANDLE_DECL("service"),
      customerInputs: { type: "OBJECT", description: "The job measurements and answers, keyed by the exact field names in the active service flow. Never include contact details or an address." },
      feeSelectionHandles: { type: "ARRAY", items: HANDLE_DECL("fee option"), description: "Fee options the caller chose, if the service offers any." },
      additionalWork: { type: "ARRAY", items: S("Separately requested work, in the caller's words."), description: "Other work the caller asked about that is not part of this service." },
      customerConfirmed: { type: "BOOLEAN", description: "True only after the caller confirmed the read-back recap." },
    }, ["serviceHandle", "customerInputs", "customerConfirmed"]],
  ["checkAvailability", "Find appointment openings for a quoted job. Requires the quote handle and the lead handle from captureLead.",
    {
      quoteHandle: HANDLE_DECL("quote"),
      leadHandle: HANDLE_DECL("lead"),
      preference: {
        type: "OBJECT", description: "Optional timing the caller prefers.",
        properties: {
          fromDate: S("Earliest date, YYYY-MM-DD."),
          days: { type: "INTEGER", description: "How many days to search, 1 to 31." },
          timeOfDay: { type: "ARRAY", items: { type: "STRING", enum: TIMES_OF_DAY }, description: "Preferred parts of the day." },
        },
        additionalProperties: false,
      },
    }, ["quoteHandle", "leadHandle"]],
  ["bookAppointment", "Book an opening the caller chose and confirmed.",
    { slotHandle: HANDLE_DECL("slot"), leadHandle: HANDLE_DECL("lead"), customerConfirmed: { type: "BOOLEAN", description: "True only after the caller confirmed the date, time and address." } },
    ["slotHandle", "leadHandle", "customerConfirmed"]],
  ["captureLead", "Save the caller's name and contact details, with the service address when booking.",
    { name: S("Caller's name."), email: S("Caller's email, if given."), address: ADDRESS_DECL, notes: S("Short notes for the business.") }, ["name"]],
  ["logQuoteRequest", "Record a job that can't be priced on this call so the business follows up.",
    { description: S("What the caller needs, in plain words."), leadHandle: HANDLE_DECL("lead") }, ["description"]],
  ["sendSms", "Send the caller a text about a quote, booking, callback or reminder.",
    { template: { type: "STRING", enum: ["quote", "booking", "callback", "reminder"], description: "Which message to send." }, recordHandle: HANDLE_DECL("record") },
    ["template", "recordHandle"]],
  ["flagUrgent", "Flag an urgent situation for the business.",
    { reason: { type: "STRING", enum: ["active_leak", "flooding", "safety", "complaint"], description: "Why it is urgent." }, summary: S("One-sentence summary.") }, ["reason"]],
  ["transferCall", "Transfer the call to the business after the caller agrees.",
    { reason: { type: "STRING", enum: ["caller_requested", "urgent", "escalation"], description: "Why the call is transferred." }, customerConfirmed: { type: "BOOLEAN", description: "True only after the caller agreed to be transferred." } },
    ["reason", "customerConfirmed"]],
  ["modifyAppointment", "Reschedule or cancel an existing appointment after the caller confirms.",
    { appointmentHandle: HANDLE_DECL("appointment"), action: { type: "STRING", enum: ["reschedule", "cancel"], description: "What to do." }, slotHandle: HANDLE_DECL("new slot (reschedule only)"), customerConfirmed: { type: "BOOLEAN", description: "True only after the caller confirmed." } },
    ["appointmentHandle", "action", "customerConfirmed"]],
  ["getCustomerContext", "Look up whether this caller has an open quote or appointment with the business.", {}, []],
];

export const VOICE_TOOL_DECLARATIONS = deepFreeze(DECLARATION_SPECS.map(([name, description, properties, required]) => ({
  name, description,
  parameters: { type: "OBJECT", properties, required, additionalProperties: false },
})));

export function getVoiceToolDeclarations() {
  return VOICE_TOOL_DECLARATIONS;
}
