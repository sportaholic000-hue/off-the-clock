const JSON_HEADERS = { 'content-type': 'application/json' };

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function twilioRequest(path, { method = 'GET', params } = {}) {
  const accountSid = required('TWILIO_ACCOUNT_SID');
  const apiKeySid = required('TWILIO_API_KEY_SID');
  const apiKeySecret = required('TWILIO_API_KEY_SECRET');
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${path}`);
  const options = {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64')}`
    }
  };
  if (method === 'GET' && params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  } else if (params) {
    options.headers['content-type'] = 'application/x-www-form-urlencoded';
    options.body = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  }
  const response = await fetchWithTimeout(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('Twilio request failed');
    error.code = 'TWILIO_REQUEST_FAILED';
    if (Number.isSafeInteger(payload.code)) error.providerCode = payload.code;
    error.statusCode = 502;
    throw error;
  }
  return payload;
}

export function normalizePhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw new Error('Enter a valid business phone number');
  return raw.startsWith('+') ? `+${digits}` : `+${digits.length === 10 ? `1${digits}` : digits}`;
}

export async function provisionTwilioNumber({ country = 'US', existingNumber }) {
  const normalized = normalizePhone(existingNumber);
  const nationalDigits = normalized.replace(/^\+1/, '');
  const areaCode = nationalDigits.slice(0, 3);
  const countryCode = String(country || 'US').toUpperCase() === 'CA' ? 'CA' : 'US';
  const available = await twilioRequest(`AvailablePhoneNumbers/${countryCode}/Local.json`, {
    params: { AreaCode: areaCode, VoiceEnabled: true, PageSize: 1 }
  });
  const candidate = available.available_phone_numbers?.[0]?.phone_number;
  if (!candidate) {
    const error = new Error('No local connection number is currently available');
    error.statusCode = 409;
    throw error;
  }
  const publicBaseUrl = required('PUBLIC_BASE_URL').replace(/\/$/, '');
  const purchased = await twilioRequest('IncomingPhoneNumbers.json', {
    method: 'POST',
    params: {
      PhoneNumber: candidate,
      VoiceUrl: `${publicBaseUrl}/api/twilio/voice/incoming`,
      VoiceMethod: 'POST'
    }
  });
  return { existingNumber: normalized, twilioNumber: purchased.phone_number, twilioNumberSid: purchased.sid };
}

export async function requestCarrierConnection({ ownerId, existingNumber, twilioNumber }) {
  if (!process.env.CARRIER_CONNECTION_URL) {
    return { status: 'platform_action_required' };
  }
  const response = await fetchWithTimeout(process.env.CARRIER_CONNECTION_URL, {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      authorization: `Bearer ${required('CARRIER_CONNECTION_TOKEN')}`
    },
    body: JSON.stringify({ ownerId, existingNumber, destinationNumber: twilioNumber })
  });
  if (!response.ok) throw new Error('Carrier connection request failed');
  const result = await response.json().catch(() => ({}));
  return { status: result.status || 'queued', reference: result.reference || null };
}

export async function setCarrierCoverage({ ownerId, enabled, existingNumber, twilioNumber }) {
  if (!process.env.CARRIER_CONNECTION_URL) {
    return { status: 'platform_action_required' };
  }
  const response = await fetchWithTimeout(process.env.CARRIER_CONNECTION_URL, {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      authorization: `Bearer ${required('CARRIER_CONNECTION_TOKEN')}`
    },
    body: JSON.stringify({
      action: 'set_coverage',
      ownerId,
      enabled: Boolean(enabled),
      existingNumber,
      destinationNumber: twilioNumber
    })
  });
  if (!response.ok) throw new Error('Carrier coverage update failed');
  return response.json().catch(() => ({ status: 'updated' }));
}

export async function placeTwilioTestCall({ to, from, businessName, agentName }) {
  const greeting = `${businessName || 'Your business'}, this is ${agentName || 'Nova'}. Your Off The Clock line is connected.`;
  return twilioRequest('Calls.json', {
    method: 'POST',
    params: {
      To: normalizePhone(to),
      From: normalizePhone(from),
      Twiml: `<Response><Say>${escapeXml(greeting)}</Say></Response>`
    }
  });
}

export async function getTwilioCallStatus(callSid) {
  if (!/^CA[0-9a-f]{32}$/i.test(String(callSid || ''))) throw new Error('Invalid Twilio call identifier');
  const call = await twilioRequest(`Calls/${callSid}.json`);
  return {
    sid: call.sid,
    status: call.status,
    to: call.to,
    from: call.from
  };
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  })[character]);
}

function stripJsonFences(text) {
  return String(text || '').trim().replace(/^\`\`\`json\s*/i, '').replace(/\s*\`\`\`$/, '').trim();
}

async function geminiJson({ systemInstruction, userMessage, timeoutMs = 15000 }) {
  const key = required('GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      })
    },
    timeoutMs
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || 'AI request failed');
  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  return JSON.parse(stripJsonFences(text));
}

import { getServiceMetadata } from '../priceBookMetadata.js';

const SERVICE_TYPE_OPTIONS = [
  'ROOFING_REPLACEMENT','ROOFING_REPAIR','FLAT_ROOF_REPLACEMENT','FLAT_ROOF_REPAIR',
  'INTERIOR_PAINTING','EXTERIOR_PAINTING','FLOORING_INSTALL','FLOORING_REPLACEMENT',
  'FENCING_INSTALL','FENCING_REPLACEMENT','SIDING_REPLACEMENT','SIDING_REPAIR',
  'CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB','LANDSCAPING_CLEANUP','LANDSCAPING_MULCH',
  'LANDSCAPING_SOD','LANDSCAPING_PLANTING','LANDSCAPING_MOWING','CUSTOM'
];
const UNIT_OPTIONS = ['flat','per_sqft','per_hour','per_unit','per_LF','per_square'];

function validCustomRange(entry) {
  const validMinimum = entry?.minimumJob === undefined ||
    (Number.isInteger(entry.minimumJob) && Number.isFinite(entry.minimumJob) && entry.minimumJob >= 0);
  return entry && typeof entry.service === 'string' && entry.service.length > 0 && entry.service.length <= 40 &&
    Number.isInteger(entry.low) && Number.isFinite(entry.low) && entry.low >= 0 &&
    Number.isInteger(entry.high) && Number.isFinite(entry.high) && entry.high >= 0 && entry.high > entry.low &&
    UNIT_OPTIONS.includes(entry.unit) && validMinimum;
}

// Scalar (dollar) Class 1 fields for a service. Shaped/keyed fields and
// select/boolean scope switches are intentionally excluded from AI
// suggestions: their key domains are customer-facing selections and must
// not be invented by the model. They stay empty and surface in NEEDS
// PRICING for the owner to fill.
export function starterFieldSpecs(serviceType) {
  const service = getServiceMetadata().find(item => item.serviceType === serviceType);
  if (!service) return [];
  // Scalar number fields, plus shaped fields whose key domain is CLOSED
  // (spec-enumerated). Open-domain shaped fields and select/boolean
  // switches stay excluded so the model can never invent keys.
  return service.fields.filter(def =>
    def.type === 'number' ||
    (def.type === 'json' && Array.isArray(def.shapedKeys?.keys))
  );
}

function describeStarterField(def) {
  if (def.type !== 'json') return `${def.field}: number (${def.money ? 'dollars' : 'quantity'})`;
  const keys = def.shapedKeys.keys;
  if (def.shapedKeys.nested) {
    return `${def.field}: { ${keys.map(key => `${key}: { ${def.shapedKeys.nested.map(nested => `${nested}: number`).join(', ')} }`).join(', ')} }`;
  }
  return `${def.field}: { ${keys.map(key => `${key}: number (${def.money ? 'dollars' : 'quantity'})`).join(', ')} }`;
}

function validStarterValue(def, value) {
  if (def.type !== 'json') {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const domain = def.shapedKeys;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (!domain.keys.includes(key)) continue;
    if (domain.nested) {
      if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
      const row = {};
      for (const nestedKey of domain.nested) {
        const leaf = child[nestedKey];
        if (typeof leaf === 'number' && Number.isFinite(leaf) && leaf >= 0) row[nestedKey] = leaf;
      }
      if (Object.keys(row).length === domain.nested.length) out[key] = row;
    } else if (typeof child === 'number' && Number.isFinite(child) && child >= 0) {
      out[key] = child;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

// Validate/normalize the model's output for the upgraded starter book:
// per-field Class 1 draft values for formula services; generic
// low/high/unit reserved for CUSTOM. Invalid fields are dropped, never
// coerced. Values are DOLLARS and remain DRAFT/unconfirmed.
export function validateStarterServices(raw, serviceTypes) {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(serviceTypes);
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const serviceType = entry.serviceType;
    if (!allowed.has(serviceType) || seen.has(serviceType)) continue;
    if (serviceType === 'CUSTOM') {
      if (!validCustomRange(entry)) continue;
      seen.add(serviceType);
      out.push({
        serviceType,
        service: entry.service.slice(0, 40),
        fields: { low: entry.low, high: entry.high, unit: entry.unit, minimumJob: entry.minimumJob ?? 0 }
      });
      continue;
    }
    const specs = starterFieldSpecs(serviceType);
    const fields = {};
    for (const def of specs) {
      const value = validStarterValue(def, entry.fields?.[def.field]);
      if (value !== undefined) fields[def.field] = value;
    }
    if (!Object.keys(fields).length) continue;
    seen.add(serviceType);
    out.push({
      serviceType,
      service: String(entry.service || '').slice(0, 40) || serviceType,
      fields
    });
  }
  return out;
}

// These are AI-suggested placeholder prices. Review and confirm each value before going live.
export { suggestStarterBook } from './priceBookAI.js';

export async function draftKnowledgeBase({ businessName, businessTypes, websiteUrl }) {
  const systemInstruction = 'Draft a business knowledge base as strict JSON with exactly these keys: about, hours, services, policies, faqs, neverSay. Use only facts supplied by the owner. Leave unknown values empty. neverSay must be an array. Do not add markdown or explanations.';
  const userMessage = `Business name: ${businessName || ''}\nBusiness types: ${(businessTypes || []).join(', ')}\nWebsite URL supplied by owner: ${websiteUrl || 'none'}\nCreate a DRAFT for owner review. Do not invent facts from the URL.`;
  const draft = await geminiJson({ systemInstruction, userMessage });
  return {
    about: String(draft.about || ''),
    hours: String(draft.hours || ''),
    services: String(draft.services || ''),
    policies: String(draft.policies || ''),
    faqs: String(draft.faqs || ''),
    neverSay: Array.isArray(draft.neverSay) ? draft.neverSay.map(String) : [],
    draft: true
  };
}

export function googleCalendarAuthorizationUrl(state) {
  const clientId = required('GOOGLE_CLIENT_ID');
  const redirectUri = required('GOOGLE_CALENDAR_REDIRECT_URI');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/calendar',
    state
  }).toString();
  return url.toString();
}

export async function exchangeGoogleCalendarCode(code) {
  const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: required('GOOGLE_CLIENT_ID'),
      client_secret: required('GOOGLE_CLIENT_SECRET'),
      redirect_uri: required('GOOGLE_CALENDAR_REDIRECT_URI'),
      grant_type: 'authorization_code'
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || 'Google Calendar connection failed');
  return payload;
}
