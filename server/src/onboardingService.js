import crypto from 'node:crypto';
import { ownerQuery } from './db.js';
import { ALL_OWNER_FIELDS, SERVICE_NAMES } from '../priceBookMetadata.js';

const EMPTY_KB = { about: '', hours: '', services: '', policies: '', faqs: '', neverSay: [], draft: false };
const EMPTY_CALENDAR = { provider: null, status: 'not_connected', calendlyUrl: null };
const PROFILE_COLUMNS = new Set([
  'businessTypesJson','country','region','existingPhoneNumber','twilioNumber',
  'twilioNumberSid','phoneProvisioningStatus','carrierSetupStatus',
  'knowledgeBaseJson','calendarJson','voiceId','agentName','greeting',
  'operatorEnabled','onboardingStep'
]);

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

export function ensureBusinessProfile(ownerId) {
  const now = new Date().toISOString();
  ownerQuery(`INSERT OR IGNORE INTO businessProfiles (
    ownerId, businessTypesJson, knowledgeBaseJson, calendarJson,
    agentName, greeting, updatedAt
  ) VALUES (?, '[]', ?, ?, 'Nova', '', ?)`).run(
    ownerId,
    JSON.stringify(EMPTY_KB),
    JSON.stringify(EMPTY_CALENDAR),
    now
  );
  return getBusinessProfile(ownerId);
}

export function getBusinessProfile(ownerId) {
  const row = ownerQuery('SELECT * FROM businessProfiles WHERE ownerId = ?').get(ownerId);
  if (!row) return ensureBusinessProfile(ownerId);
  return {
    ...row,
    operatorEnabled: Boolean(row.operatorEnabled),
    businessTypes: parseJson(row.businessTypesJson, []),
    knowledgeBase: { ...EMPTY_KB, ...parseJson(row.knowledgeBaseJson, {}) },
    calendar: { ...EMPTY_CALENDAR, ...parseJson(row.calendarJson, {}) }
  };
}

export function updateBusinessProfile(ownerId, patch) {
  ensureBusinessProfile(ownerId);
  const entries = Object.entries(patch).filter(([key]) => PROFILE_COLUMNS.has(key));
  if (!entries.length) return getBusinessProfile(ownerId);
  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([, value]) => value);
  values.push(new Date().toISOString(), ownerId);
  ownerQuery(`UPDATE businessProfiles SET ${assignments}, updatedAt = ? WHERE ownerId = ?`).run(...values);
  return getBusinessProfile(ownerId);
}

function ownerAccount(ownerId) {
  return ownerQuery(`SELECT id, email, firstName, businessName, plan, planStatus, timezone
    FROM users WHERE id = ? AND (ownerId = ? OR id = ?)`).get(ownerId, ownerId, ownerId);
}

export function updateOnboardingAccount(ownerId, values) {
  const allowedPlans = new Set(['Operator', 'QuoteDone', 'Scale']);
  const firstName = String(values.firstName || '').trim();
  const businessName = String(values.businessName || '').trim();
  const plan = String(values.plan || '');
  if (!firstName || !businessName || !allowedPlans.has(plan)) {
    const error = new Error('firstName, businessName, and a valid plan are required');
    error.statusCode = 400;
    throw error;
  }
  ownerQuery(`UPDATE users SET firstName = ?, businessName = ?, plan = ?
    WHERE id = ? AND (ownerId = ? OR id = ?)`).run(firstName, businessName, plan, ownerId, ownerId, ownerId);
  updateBusinessProfile(ownerId, { onboardingStep: Math.max(2, getBusinessProfile(ownerId).onboardingStep) });
  return ownerAccount(ownerId);
}

export function saveBusinessTypes(ownerId, businessTypes) {
  const values = [...new Set((businessTypes || []).map(String))].filter(type => Object.hasOwn(SERVICE_NAMES, type));
  if (!values.length) {
    const error = new Error('Select at least one business type');
    error.statusCode = 400;
    throw error;
  }
  return updateBusinessProfile(ownerId, {
    businessTypesJson: JSON.stringify(values),
    onboardingStep: Math.max(3, getBusinessProfile(ownerId).onboardingStep)
  });
}

export function saveJurisdictionProfile(ownerId, { country, region }) {
  return updateBusinessProfile(ownerId, {
    country: String(country || '').toUpperCase(),
    region: String(region || '').toUpperCase(),
    onboardingStep: Math.max(4, getBusinessProfile(ownerId).onboardingStep)
  });
}

export function savePhoneProvisioning(ownerId, values) {
  return updateBusinessProfile(ownerId, {
    existingPhoneNumber: values.existingNumber,
    twilioNumber: values.twilioNumber,
    twilioNumberSid: values.twilioNumberSid,
    phoneProvisioningStatus: 'provisioned',
    carrierSetupStatus: values.carrierSetupStatus || 'queued',
    onboardingStep: Math.max(5, getBusinessProfile(ownerId).onboardingStep)
  });
}

export function saveKnowledgeBase(ownerId, knowledgeBase) {
  const clean = {
    about: String(knowledgeBase.about || '').trim(),
    hours: String(knowledgeBase.hours || '').trim(),
    services: String(knowledgeBase.services || '').trim(),
    policies: String(knowledgeBase.policies || '').trim(),
    faqs: String(knowledgeBase.faqs || '').trim(),
    neverSay: Array.isArray(knowledgeBase.neverSay)
      ? knowledgeBase.neverSay.map(value => String(value).trim()).filter(Boolean)
      : String(knowledgeBase.neverSay || '').split('\n').map(value => value.trim()).filter(Boolean),
    draft: Boolean(knowledgeBase.draft)
  };
  return updateBusinessProfile(ownerId, {
    knowledgeBaseJson: JSON.stringify(clean),
    onboardingStep: Math.max(6, getBusinessProfile(ownerId).onboardingStep)
  });
}

export function operatorEligibility(profile) {
  const kb = profile.knowledgeBase || EMPTY_KB;
  const missing = [];
  if (profile.phoneProvisioningStatus !== 'provisioned' || !profile.twilioNumberSid) missing.push('phone');
  if (!String(kb.about || '').trim()) missing.push('About & area');
  if (!String(kb.hours || '').trim()) missing.push('Hours');
  return { eligible: missing.length === 0, missing };
}

export function setOperatorEnabled(ownerId, enabled) {
  const profile = getBusinessProfile(ownerId);
  const eligibility = operatorEligibility(profile);
  if (enabled && !eligibility.eligible) {
    const error = new Error(`Operator cannot go live until these are ready: ${eligibility.missing.join(', ')}`);
    error.statusCode = 409;
    error.details = eligibility;
    throw error;
  }
  return updateBusinessProfile(ownerId, {
    operatorEnabled: enabled ? 1 : 0,
    onboardingStep: enabled ? Math.max(7, profile.onboardingStep) : profile.onboardingStep
  });
}

export function saveCalendar(ownerId, input) {
  const provider = input.skipped ? null : String(input.provider || '');
  if (!input.skipped && !['google', 'calendly'].includes(provider)) {
    const error = new Error('Choose Google Calendar, Calendly, or skip for now');
    error.statusCode = 400;
    throw error;
  }
  if (provider === 'calendly' && !/^https:\/\/(www\.)?calendly\.com\//i.test(String(input.calendlyUrl || ''))) {
    const error = new Error('Enter a valid Calendly link');
    error.statusCode = 400;
    throw error;
  }
  const calendar = input.skipped
    ? { provider: null, status: 'skipped', calendlyUrl: null }
    : { provider, status: provider === 'google' ? 'pending_oauth' : 'connected', calendlyUrl: input.calendlyUrl || null };
  return updateBusinessProfile(ownerId, {
    calendarJson: JSON.stringify(calendar),
    onboardingStep: Math.max(9, getBusinessProfile(ownerId).onboardingStep)
  });
}

export function saveGoogleCalendarTokens(ownerId, tokens) {
  const calendar = {
    provider: 'google',
    status: 'connected',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    expiresAt: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : null,
    scope: tokens.scope || null
  };
  return updateBusinessProfile(ownerId, { calendarJson: JSON.stringify(calendar) });
}

export function saveVoice(ownerId, input) {
  const voiceId = String(input.voiceId || '');
  const agentName = String(input.agentName || '').trim();
  const greeting = String(input.greeting || '').trim();
  if (!['male','female'].includes(voiceId) || !agentName || !greeting) {
    const error = new Error('voiceId, agentName, and greeting are required');
    error.statusCode = 400;
    throw error;
  }
  return updateBusinessProfile(ownerId, {
    voiceId,
    agentName,
    greeting,
    onboardingStep: Math.max(10, getBusinessProfile(ownerId).onboardingStep)
  });
}

export function onboardingState(ownerId) {
  const profile = getBusinessProfile(ownerId);
  return {
    account: ownerAccount(ownerId),
    profile,
    operator: {
      enabled: profile.operatorEnabled,
      ...operatorEligibility(profile)
    }
  };
}

export function createInterviewDraft(ownerId, input) {
  const mode = ['phone','browser'].includes(input.mode) ? input.mode : 'browser';
  const serviceTypes = [...new Set((input.serviceTypes || []).map(String))]
    .filter(type => Object.hasOwn(ALL_OWNER_FIELDS, type));
  if (!serviceTypes.length) {
    const error = new Error('Select at least one service for the interview');
    error.statusCode = 400;
    throw error;
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  ownerQuery(`INSERT INTO priceBookDrafts (
    id, ownerId, status, mode, serviceTypesJson, fieldsJson,
    confirmedFieldsJson, currentField, createdAt, updatedAt
  ) VALUES (?, ?, 'DRAFT', ?, ?, '{}', '{}', ?, ?, ?)`).run(
    id, ownerId, mode, JSON.stringify(serviceTypes),
    `${serviceTypes[0]}.${ALL_OWNER_FIELDS[serviceTypes[0]][0] || ''}`,
    now, now
  );
  return getInterviewDraft(ownerId, id);
}

export function getInterviewDraft(ownerId, id) {
  const row = ownerQuery('SELECT * FROM priceBookDrafts WHERE id = ? AND ownerId = ?').get(id, ownerId);
  if (!row) return null;
  return {
    ...row,
    serviceTypes: parseJson(row.serviceTypesJson, []),
    fields: parseJson(row.fieldsJson, {}),
    confirmedFields: parseJson(row.confirmedFieldsJson, {})
  };
}

export function listInterviewDrafts(ownerId) {
  return ownerQuery(`SELECT id, status, mode, serviceTypesJson, currentField, createdAt, updatedAt
    FROM priceBookDrafts WHERE ownerId = ? ORDER BY updatedAt DESC`).all(ownerId)
    .map(row => ({ ...row, serviceTypes: parseJson(row.serviceTypesJson, []) }));
}

export function saveInterviewDraft(ownerId, id, input) {
  const draft = getInterviewDraft(ownerId, id);
  if (!draft) {
    const error = new Error('Draft not found');
    error.statusCode = 404;
    throw error;
  }
  const nextFields = { ...draft.fields };
  const nextConfirmed = { ...draft.confirmedFields };
  for (const serviceType of draft.serviceTypes) {
    const allowed = new Set(ALL_OWNER_FIELDS[serviceType] || []);
    const incoming = input.fields?.[serviceType] || {};
    nextFields[serviceType] = { ...(nextFields[serviceType] || {}) };
    for (const [field, value] of Object.entries(incoming)) {
      if (allowed.has(field)) nextFields[serviceType][field] = value;
    }
    const confirmations = Array.isArray(input.confirmedFields?.[serviceType])
      ? input.confirmedFields[serviceType].filter(field => allowed.has(field))
      : nextConfirmed[serviceType] || [];
    nextConfirmed[serviceType] = [...new Set(confirmations)];
  }
  ownerQuery(`UPDATE priceBookDrafts SET fieldsJson = ?, confirmedFieldsJson = ?,
    currentField = ?, updatedAt = ? WHERE id = ? AND ownerId = ?`).run(
    JSON.stringify(nextFields),
    JSON.stringify(nextConfirmed),
    input.currentField || draft.currentField,
    new Date().toISOString(),
    id,
    ownerId
  );
  return getInterviewDraft(ownerId, id);
}

export function draftReviewPayload(ownerId, id) {
  const draft = getInterviewDraft(ownerId, id);
  if (!draft) {
    const error = new Error('Draft not found');
    error.statusCode = 404;
    throw error;
  }
  const services = draft.serviceTypes.map(serviceType => {
    const fields = draft.fields[serviceType] || {};
    const confirmed = new Set(draft.confirmedFields[serviceType] || []);
    const unconfirmedFields = Object.keys(fields).filter(field => !confirmed.has(field));
    return {
      serviceType,
      service: SERVICE_NAMES[serviceType],
      ...Object.fromEntries(Object.entries(fields).filter(([field]) => confirmed.has(field))),
      unconfirmedFields
    };
  });
  return { status: 'DRAFT', services };
}
