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
  const authToken = required('TWILIO_AUTH_TOKEN');
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${path}`);
  const options = {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
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
    const error = new Error(payload.message || 'Twilio request failed');
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

const SERVICE_TYPE_OPTIONS = [
  'ROOFING_REPLACEMENT','ROOFING_REPAIR','FLAT_ROOF_REPLACEMENT','FLAT_ROOF_REPAIR',
  'INTERIOR_PAINTING','EXTERIOR_PAINTING','FLOORING_INSTALL','FLOORING_REPLACEMENT',
  'FENCING_INSTALL','FENCING_REPLACEMENT','SIDING_REPLACEMENT','SIDING_REPAIR',
  'CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB','LANDSCAPING_CLEANUP','LANDSCAPING_MULCH',
  'LANDSCAPING_SOD','LANDSCAPING_PLANTING','LANDSCAPING_MOWING','CUSTOM'
];
const UNIT_OPTIONS = ['flat','per_sqft','per_hour','per_unit','per_LF','per_square'];

function validSuggestion(entry) {
  return entry && typeof entry.service === 'string' && entry.service.length > 0 && entry.service.length <= 40 &&
    SERVICE_TYPE_OPTIONS.includes(entry.serviceType) && Number.isInteger(entry.low) &&
    Number.isInteger(entry.high) && entry.high > entry.low && UNIT_OPTIONS.includes(entry.unit) &&
    typeof entry.taxable === 'boolean' && Number.isInteger(entry.minimumJob);
}

export async function suggestStarterBook(industry) {
  const systemInstruction = 'You are a contractor pricing assistant. Return ONLY a valid JSON array. No markdown. No code blocks. No backticks. No explanation. Response must start with [ and end with ] and be parseable by JSON.parse() with zero modifications.';
  const userMessage = `Return a price book for a ${String(industry || '').slice(0, 80)} business. Return between 5 and 12 services. Each object must have EXACTLY these fields: { service: string max 40 chars, serviceType: one of exactly ${SERVICE_TYPE_OPTIONS.join('|')}, low: integer no decimals no $ sign, high: integer greater than low, unit: one of exactly ${UNIT_OPTIONS.join('|')}, taxable: boolean, minimumJob: integer }`;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await geminiJson({ systemInstruction, userMessage });
      const valid = Array.isArray(result) ? result.filter(validSuggestion) : [];
      if (valid.length < 3) throw new Error('AI returned fewer than three valid services');
      return valid;
    } catch (error) {
      lastError = error;
    }
  }
  const failure = new Error('Could not generate suggestions. Please build your price book manually.');
  failure.cause = lastError;
  failure.statusCode = 503;
  throw failure;
}

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
