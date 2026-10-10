import { randomUUID } from 'node:crypto';
import { installTelephonyOperationsSchema } from './telephonyOperationsMigration.js';
import {geminiTextModel,TextAIConfigurationError} from './geminiTextModel.js';

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
  if(method==='DELETE'&&(response.status===204||response.status===404))return {released:true};
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

// Deleting one saved number resource is idempotent. A 404 on replay confirms
// the exact SID is gone; a timeout never clears the tenant's local receipt.
export async function releaseTwilioNumber({sid}) {
  if(!/^PN[0-9a-f]{32}$/i.test(String(sid||'')))throw new Error('Invalid saved phone SID');
  return twilioRequest(`IncomingPhoneNumbers/${sid}.json`,{method:'DELETE'});
}

export function normalizePhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw new Error('Enter a valid business phone number');
  return raw.startsWith('+') ? `+${digits}` : `+${digits.length === 10 ? `1${digits}` : digits}`;
}

// Select separately so the durable service can commit the exact candidate
// before crossing the purchase boundary.
export async function selectTwilioNumber({ country = 'US', existingNumber }) {
  const normalized = normalizePhone(existingNumber);
  const areaCode = normalized.replace(/^\+1/, '').slice(0, 3);
  const countryCode = String(country || 'US').toUpperCase() === 'CA' ? 'CA' : 'US';
  const available = await twilioRequest(`AvailablePhoneNumbers/${countryCode}/Local.json`, {
    params: { AreaCode: areaCode, VoiceEnabled: true, PageSize: 1 }
  });
  const candidate = available.available_phone_numbers?.[0]?.phone_number;
  if (!candidate) throw telephonyError('PHONE_NUMBER_UNAVAILABLE', 409);
  return candidate;
}

export async function provisionTwilioNumber({ country = 'US', existingNumber, candidateNumber, operationId }) {
  const normalized = normalizePhone(existingNumber);
  const candidate = candidateNumber || await selectTwilioNumber({ country, existingNumber });
  const publicBaseUrl = required('PUBLIC_BASE_URL').replace(/\/$/, '');
  const purchased = await twilioRequest('IncomingPhoneNumbers.json', {
    method: 'POST',
    params: {
      PhoneNumber: candidate,
      ...(operationId ? { FriendlyName: provisioningTag(operationId) } : {}),
      VoiceUrl: `${publicBaseUrl}/api/twilio/voice/incoming`,
      VoiceMethod: 'POST',
      StatusCallback: `${publicBaseUrl}/api/twilio/voice/status`,
      StatusCallbackMethod: 'POST'
    }
  });
  return { existingNumber: normalized, twilioNumber: purchased.phone_number, twilioNumberSid: purchased.sid };
}

function provisioningTag(operationId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
    throw telephonyError('PHONE_OPERATION_INVALID', 400);
  }
  return `otc-provision-${operationId}`;
}

export async function findProvisionedTwilioNumber({ operationId, candidateNumber, existingNumber }) {
  const tag = provisioningTag(operationId);
  const response = await twilioRequest('IncomingPhoneNumbers.json', {
    params: { FriendlyName: tag, PhoneNumber: candidateNumber, PageSize: 2 }
  });
  const matches = response.incoming_phone_numbers?.filter(number =>
    number.friendly_name === tag && number.phone_number === candidateNumber) || [];
  if (matches.length !== 1 || response.next_page_uri) return null;
  return { existingNumber, twilioNumber: matches[0].phone_number, twilioNumberSid: matches[0].sid };
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

function stripJsonFences(text) {
  return String(text || '').trim().replace(/^\`\`\`json\s*/i, '').replace(/\s*\`\`\`$/, '').trim();
}

async function geminiJson({ systemInstruction, userMessage, timeoutMs = 15000 }) {
  const model = geminiTextModel();
  const key = process.env.GEMINI_API_KEY;
  if(!key)throw new TextAIConfigurationError();
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {...JSON_HEADERS,'x-goog-api-key':key},
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

import {importWebsitePrices} from './websitePriceImport.js';

export async function draftKnowledgeBase({ businessName, businessTypes, websiteUrl }, {importPrices=importWebsitePrices}={}) {
  if(websiteUrl!=null&&typeof websiteUrl!=='string')throw Object.assign(new Error('Enter a public business website URL.'),{statusCode:400});
  // Website text never enters the generative prompt. Prices are copied from
  // bounded, visible excerpts and remain an unsaved owner-review draft.
  if(websiteUrl?.trim())return importPrices(websiteUrl.trim());
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

// Durable telephony operations. Leases only select a worker; they never make an
// uncertain external write safe to repeat. Expired dispatched work is read back
// from the provider, and all worker completions are fenced by their claim token.
export function createTelephonyOperations({
  database, ownerQuery, getBusinessProfile, savePhoneProvisioning,
  updateBusinessProfile,
  provider = {
    selectNumber: selectTwilioNumber,
    purchaseNumber: provisionTwilioNumber,
    findPurchasedNumber: findProvisionedTwilioNumber
  },
  now = Date.now, leaseMs = 60_000
}) {
  for (const method of ['selectNumber', 'purchaseNumber', 'findPurchasedNumber']) {
    if (typeof provider[method] !== 'function') throw new TypeError(`Missing telephony provider method: ${method}`);
  }
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new TypeError('Invalid telephony lease');
  installTelephonyOperationsSchema(database);
  const phoneRow = ownerId => ownerQuery('SELECT * FROM phoneProvisioningOperations WHERE ownerId = ?').get(ownerId);
  const transaction = work => {
    if (typeof database.transaction === 'function') return database.transaction(work).immediate();
    database.exec('BEGIN IMMEDIATE');
    try { const result = work(); database.exec('COMMIT'); return result; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  };
  const phoneSnapshot = (ownerId, statusCode = null, reused = true) => {
    const row = phoneRow(ownerId);
    const pending = !row.carrierComplete;
    return {
      statusCode: statusCode ?? (pending ? 202 : 200),
      profile: getBusinessProfile(ownerId), reused, pending,
      operationId: row.operationId, purchaseState: row.purchaseState,
      carrierStatus: row.carrierSetupStatus, carrierReference: row.carrierReference
    };
  };
  const ownsPhone = (ownerId, token) => phoneRow(ownerId)?.workerToken === token;
  const releasePhone = (ownerId, token, state, carrierStatus) => ownerQuery(`
    UPDATE phoneProvisioningOperations SET purchaseState = CASE
      WHEN twilioNumberSid IS NOT NULL THEN 'purchased' ELSE ? END,
      carrierSetupStatus = COALESCE(?, carrierSetupStatus), workerToken = NULL,
      leaseUntil = NULL, updatedAt = ? WHERE ownerId = ? AND workerToken = ?
  `).run(state, carrierStatus ?? null, now(), ownerId, token);

  async function provision(ownerId, existingNumber) {
    const claim = transaction(() => {
      const profile = getBusinessProfile(ownerId);
      let row = phoneRow(ownerId);
      const existing = phoneInput(existingNumber ?? row?.existingNumber ?? profile.existingPhoneNumber);
      if (!row) {
        // A previously purchased number is a receipt even when setup failed or
        // the legacy provisioning status is inconsistent. Never buy over it.
        if (Boolean(profile.twilioNumberSid) !== Boolean(profile.twilioNumber) ||
            (profile.twilioNumberSid && !profile.existingPhoneNumber)) {
          throw telephonyError('PHONE_RECEIPT_INCOMPLETE', 409);
        }
        if (profile.twilioNumberSid && existing !== phoneInput(profile.existingPhoneNumber)) {
          throw telephonyError('PHONE_OPERATION_CONFLICT', 409);
        }
        const purchased = Boolean(profile.twilioNumberSid);
        const complete = purchased && profile.carrierSetupStatus === 'not_required';
        ownerQuery(`INSERT INTO phoneProvisioningOperations (
          ownerId, operationId, existingNumber, country, purchaseState,
          twilioNumber, twilioNumberSid, carrierSetupStatus, carrierComplete, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ownerId) DO NOTHING`).run(
          ownerId, randomUUID(), existing, profile.country === 'CA' ? 'CA' : 'US',
          purchased ? 'purchased' : 'ready', profile.twilioNumber || null,
          profile.twilioNumberSid || null, profile.carrierSetupStatus || 'pending',
          complete ? 1 : 0, now(), now()
        );
        row = phoneRow(ownerId);
      }
      if (existing !== row.existingNumber) throw telephonyError('PHONE_OPERATION_CONFLICT', 409);
      if (row.carrierComplete || (row.workerToken && row.leaseUntil > now())) return null;
      const token = randomUUID();
      const action = row.twilioNumberSid ? 'connect'
        : ['purchasing', 'unknown'].includes(row.purchaseState) ? 'reconcile' : 'select';
      ownerQuery(`UPDATE phoneProvisioningOperations SET workerToken = ?, leaseUntil = ?,
        purchaseState = ?, updatedAt = ? WHERE ownerId = ?`).run(
          token, now() + leaseMs, action === 'select' ? 'selecting' : row.purchaseState, now(), ownerId
        );
      return { ...phoneRow(ownerId), token, action };
    });
    if (!claim) return phoneSnapshot(ownerId);
    let purchased;
    if (claim.action === 'select') {
      let candidateNumber;
      try {
        candidateNumber = phoneInput(await provider.selectNumber(claim));
      } catch {
        releasePhone(ownerId, claim.token, 'ready');
        return phoneSnapshot(ownerId, 502);
      }
      // This commit is the irreversible dispatch barrier. A stale selector may
      // not purchase, and a restarted worker may only reconcile past it.
      const dispatched = ownerQuery(`UPDATE phoneProvisioningOperations
        SET purchaseState = 'purchasing', candidateNumber = ?, leaseUntil = ?, updatedAt = ?
        WHERE ownerId = ? AND workerToken = ? AND purchaseState = 'selecting'`).run(
          candidateNumber, now() + leaseMs, now(), ownerId, claim.token
        ).changes;
      if (!dispatched) return phoneSnapshot(ownerId);
      try {
        purchased = await provider.purchaseNumber({ ...claim, candidateNumber });
      } catch {
        releasePhone(ownerId, claim.token, 'unknown');
        return phoneSnapshot(ownerId);
      }
    } else if (claim.action === 'reconcile') {
      try { purchased = await provider.findPurchasedNumber(claim); }
      catch { /* A failed read is not proof that a purchase did not happen. */ }
      if (!purchased) {
        releasePhone(ownerId, claim.token, 'unknown');
        return phoneSnapshot(ownerId);
      }
    }
    if (purchased) {
      let number;
      try {
        number = phoneInput(purchased.twilioNumber);
        if (!/^PN[0-9a-f]{32}$/i.test(String(purchased.twilioNumberSid || '')) ||
            number !== phoneRow(ownerId).candidateNumber) throw new Error('Invalid purchase receipt');
      } catch {
        releasePhone(ownerId, claim.token, 'unknown');
        return phoneSnapshot(ownerId);
      }
      // Save the receipt in its own committed statement BEFORE profile updates
      // or the final profile update. Even a stale worker may record this immutable operation's
      // receipt, but it cannot overwrite a receipt or complete another claim.
      ownerQuery(`UPDATE phoneProvisioningOperations SET twilioNumberSid = ?,
        twilioNumber = ?, purchaseState = 'purchased', updatedAt = ?
        WHERE ownerId = ? AND operationId = ? AND twilioNumberSid IS NULL`).run(
          purchased.twilioNumberSid, number, now(), ownerId, claim.operationId
        );
      const receipt = phoneRow(ownerId);
      if (receipt.twilioNumberSid !== purchased.twilioNumberSid || receipt.twilioNumber !== number) {
        throw telephonyError('PHONE_RECEIPT_CONFLICT', 409);
      }
    }
    if (!ownsPhone(ownerId, claim.token)) return phoneSnapshot(ownerId);
    const receipt = phoneRow(ownerId);
    try {
      // An exception here deliberately leaves the independently saved SID intact.
      savePhoneProvisioning(ownerId, {
        existingNumber: receipt.existingNumber, twilioNumber: receipt.twilioNumber,
        twilioNumberSid: receipt.twilioNumberSid, carrierSetupStatus: 'pending'
      });
    } catch (error) {
      releasePhone(ownerId, claim.token, 'purchased', 'failed');
      throw error;
    }
    const completedByThisWorker = transaction(() => {
      if (!ownsPhone(ownerId, claim.token)) return false;
      updateBusinessProfile(ownerId, { carrierSetupStatus: 'not_required' });
      ownerQuery(`UPDATE phoneProvisioningOperations SET carrierSetupStatus = ?,
        carrierReference = ?, carrierComplete = ?, workerToken = NULL, leaseUntil = NULL,
        updatedAt = ? WHERE ownerId = ? AND workerToken = ?`).run(
          'not_required', null, 1, now(), ownerId, claim.token
        );
      return true;
    });
    if (!completedByThisWorker) return phoneSnapshot(ownerId);
    return phoneSnapshot(ownerId, claim.action === 'select' ? 201 : 200, claim.action !== 'select');
  }

  return { provision };
}

function telephonyError(code, statusCode = 502) {
  return Object.assign(new Error(code), { code, statusCode, retryable: statusCode >= 500 });
}

function phoneInput(value) {
  try { return normalizePhone(value); }
  catch { throw telephonyError('PHONE_NUMBER_INVALID', 400); }
}
