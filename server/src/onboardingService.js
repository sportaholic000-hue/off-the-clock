import {materializeInterviewFields} from '../interviewConfiguration.js';
import crypto from 'node:crypto';
import { db, ownerQuery } from './db.js';
import { SERVICE_NAMES } from '../priceBookMetadata.js';
import { saveGoogleCalendarConnection } from './calendarCredentials.js';
import { isValidIanaTimeZone } from './calendarTime.js';
import { normalizeServiceArea } from './serviceArea.js';
import { normalizeReviewContact, readReviewContact } from './reviewContact.js';
import { hasQuoteDoneAccess } from './planAccess.js';
import { hasOperatorAccess } from './planAccess.js';
import {voiceRouteReadiness} from './voice/voiceReadiness.js';
import { applicationMetadata } from './quoteDoneBridge.js';
import { interviewField, validateInterviewValue, interpretInterviewAnswer } from './priceBookAI.js';

const EMPTY_KB = { about: '', hours: '', services: '', policies: '', faqs: '', prices: '', website: '', neverSay: [], draft: false };
const KB_TEXT_LIMIT = 20000;
function knowledgeText(value, name) {
  const text = String(value || '').trim();
  if (text.length > KB_TEXT_LIMIT) {
    const error = new Error(`${name} is too long (limit ${KB_TEXT_LIMIT} characters).`);
    error.code = 'INVALID_REQUEST';
    error.statusCode = 400;
    throw error;
  }
  return text;
}
function knowledgeWebsite(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { url = null; }
  if (!url || !['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || text.length > 2000) {
    const error = new Error('Enter your website as a web address, for example https://example.com.');
    error.code = 'INVALID_REQUEST';
    error.statusCode = 400;
    throw error;
  }
  return url.toString();
}
const EMPTY_CALENDAR = { provider: null, status: 'not_connected', calendlyUrl: null };
const CALENDAR_INPUT_KEYS = new Set(['provider', 'calendlyUrl', 'skipped']);
const CALENDLY_HOSTS = new Set(['calendly.com', 'www.calendly.com']);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const GOOGLE_CALENDAR_FULL_SCOPE = 'https://www.googleapis.com/auth/calendar';
const GOOGLE_CALENDAR_WRITE_SCOPES = new Set([
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.app.created'
]);
const GOOGLE_CALENDAR_BUSY_SCOPES = new Set([
  'https://www.googleapis.com/auth/calendar.events.freebusy',
  'https://www.googleapis.com/auth/calendar.freebusy'
]);
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

function onboardingError(message, { code = 'INVALID_REQUEST', statusCode = 400 } = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowed, label) {
  if (!record(value)) throw onboardingError(`${label} must be an object`);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) throw onboardingError(`${label} contains unsupported fields`);
}

function normalizedOwnerTimezone(owner) {
  const value = owner?.timezone;
  if (typeof value !== 'string' || value !== value.trim() || value.length > 128 ||
      CONTROL_CHARACTERS.test(value) || !isValidIanaTimeZone(value)) {
    throw onboardingError('Set a valid IANA timezone before connecting a calendar', {
      code: 'TIMEZONE_INVALID',
      statusCode: 409
    });
  }
  return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
}

function requireCalendarOwner(ownerId) {
  if (typeof ownerId !== 'string' || !ownerId.trim() || ownerId !== ownerId.trim() ||
      ownerId.length > 256 || CONTROL_CHARACTERS.test(ownerId)) {
    throw onboardingError('Owner account not found', { code: 'OWNER_NOT_FOUND', statusCode: 404 });
  }
  const owner = ownerQuery(`SELECT id, timezone FROM users
    WHERE id = ? AND (ownerId = ? OR id = ?) AND role = 'owner'`)
    .get(ownerId, ownerId, ownerId);
  if (!owner) throw onboardingError('Owner account not found', { code: 'OWNER_NOT_FOUND', statusCode: 404 });
  return { owner, timezone: normalizedOwnerTimezone(owner) };
}

function normalizedCalendlyUrl(value) {
  if (typeof value !== 'string' || value !== value.trim() || !value || value.length > 2048 ||
      CONTROL_CHARACTERS.test(value) || /\s/.test(value)) {
    throw onboardingError('Enter a valid Calendly link');
  }
  let url;
  try { url = new URL(value); }
  catch { throw onboardingError('Enter a valid Calendly link'); }
  if (url.protocol !== 'https:' || !CALENDLY_HOSTS.has(url.hostname.toLowerCase()) ||
      url.username || url.password || url.port || url.search || url.hash ||
      url.pathname === '/' || /\s/.test(url.pathname)) {
    throw onboardingError('Enter a valid Calendly link');
  }
  return `https://${url.hostname.toLowerCase()}${url.pathname}`;
}

function normalizedCalendarInput(input) {
  rejectUnknownKeys(input, CALENDAR_INPUT_KEYS, 'Calendar selection');
  if (Object.hasOwn(input, 'skipped') && typeof input.skipped !== 'boolean') throw onboardingError('Calendar skipped must be true or false');
  if (Object.hasOwn(input, 'provider') &&
      (typeof input.provider !== 'string' || input.provider !== input.provider.trim() ||
       input.provider.length > 32 || CONTROL_CHARACTERS.test(input.provider))) {
    throw onboardingError('Choose Google Calendar, Calendly, or skip for now');
  }
  if (Object.hasOwn(input, 'calendlyUrl') && input.calendlyUrl !== null &&
      (typeof input.calendlyUrl !== 'string' || input.calendlyUrl !== input.calendlyUrl.trim() ||
       input.calendlyUrl.length > 2048 || CONTROL_CHARACTERS.test(input.calendlyUrl))) {
    throw onboardingError('Enter a valid Calendly link');
  }
  if (Object.hasOwn(input, 'provider') && !['google', 'calendly'].includes(input.provider)) throw onboardingError('Choose Google Calendar, Calendly, or skip for now');
  if (input.skipped === true) return { provider: null, externalUrl: null, skipped: true };
  if (!Object.hasOwn(input, 'provider')) throw onboardingError('Choose Google Calendar, Calendly, or skip for now');
  if (input.provider === 'google') {
    if (input.calendlyUrl !== undefined && input.calendlyUrl !== null && input.calendlyUrl !== '') throw onboardingError('A Calendly link cannot be saved for Google Calendar');
    return { provider: 'google', externalUrl: null, skipped: false };
  }
  return { provider: 'calendly', externalUrl: normalizedCalendlyUrl(input.calendlyUrl), skipped: false };
}

function calendarScopesSupportBooking(scopes) {
  const normalized = new Set(scopes);
  if (normalized.has(GOOGLE_CALENDAR_FULL_SCOPE)) return true;
  return [...GOOGLE_CALENDAR_WRITE_SCOPES].some(scope => normalized.has(scope)) &&
    [...GOOGLE_CALENDAR_BUSY_SCOPES].some(scope => normalized.has(scope));
}

function normalizedCalendarId(value) {
  if (typeof value !== 'string' || value !== value.trim() || !value || value.length > 1024 ||
      CONTROL_CHARACTERS.test(value) || /[\s\/\\?]/.test(value)) {
    throw onboardingError('Google Calendar returned an invalid calendar destination');
  }
  return value;
}

function normalizedGoogleTokens(tokens) {
  if (!record(tokens)) throw onboardingError('Google Calendar returned an invalid token response');
  const token = (value, label, { allowWhitespace = false } = {}) => {
    if (typeof value !== 'string' || value !== value.trim() || !value || value.length > 16384 ||
        CONTROL_CHARACTERS.test(value) || (!allowWhitespace && /\s/.test(value))) {
      throw onboardingError(`Google Calendar returned an invalid ${label}`);
    }
    return value;
  };
  const accessToken = token(tokens.access_token, 'access token');
  const refreshToken = token(tokens.refresh_token, 'refresh token');
  const tokenType = tokens.token_type === undefined ? 'Bearer' : token(tokens.token_type, 'token type');
  if (tokenType.toLowerCase() !== 'bearer') throw onboardingError('Google Calendar returned an unsupported token type');
  const scope = token(tokens.scope, 'permission scope', { allowWhitespace: true });
  const scopes = [...new Set(scope.split(/\s+/).filter(Boolean))];
  if (!calendarScopesSupportBooking(scopes)) {
    throw onboardingError('Google Calendar did not grant availability-read and event-write access', {
      code: 'CALENDAR_SCOPES_INSUFFICIENT', statusCode: 409
    });
  }
  if (!Number.isInteger(tokens.expires_in) || tokens.expires_in < 60 || tokens.expires_in > 86400) throw onboardingError('Google Calendar returned an invalid token expiry');
  const calendarId = normalizedCalendarId(tokens.calendarId === undefined ? 'primary' : tokens.calendarId);
  return {
    access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer',
    scope: scopes.join(' '), calendarId,
    expiresAtUtc: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  };
}

function safeCalendar(value) {
  const calendar = { ...EMPTY_CALENDAR, ...parseJson(value, {}) };
  return {
    provider: calendar.provider || null,
    status: calendar.status || 'not_connected',
    calendlyUrl: calendar.calendlyUrl || null,
    calendarId: calendar.calendarId || null,
    expiresAtUtc: calendar.expiresAtUtc || null
  };
}

export function ensureBusinessProfile(ownerId) {
  const now = new Date().toISOString();
  ownerQuery(`INSERT OR IGNORE INTO businessProfiles (
    ownerId, businessTypesJson, knowledgeBaseJson, calendarJson,
    agentName, greeting, updatedAt
  ) VALUES (?, '[]', ?, ?, 'Nova', '', ?)`).run(ownerId, JSON.stringify(EMPTY_KB), JSON.stringify(EMPTY_CALENDAR), now);
  return getBusinessProfile(ownerId);
}

export function getBusinessProfile(ownerId) {
  const row = ownerQuery('SELECT * FROM businessProfiles WHERE ownerId = ?').get(ownerId);
  if (!row) return ensureBusinessProfile(ownerId);
  const { businessTypesJson, knowledgeBaseJson, calendarJson, ...profile } = row;
  const knowledgeBase = { ...EMPTY_KB, ...parseJson(knowledgeBaseJson, {}) };
  const reviewContact = readReviewContact(knowledgeBase.reviewContact, ownerId);
  delete knowledgeBase.reviewContact;
  if (reviewContact) knowledgeBase.reviewContact = reviewContact;
  return {
    ...profile,
    operatorEnabled: Boolean(row.operatorEnabled),
    businessTypes: parseJson(businessTypesJson, []),
    knowledgeBase,
    calendar: safeCalendar(calendarJson)
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
  return ownerQuery(`SELECT id, email, firstName, businessName, plan, planStatus, trialEndsAt, paymentFailedAt, annualPaidThroughAt, timezone
    FROM users WHERE id = ? AND (ownerId = ? OR id = ?)`).get(ownerId, ownerId, ownerId);
}

export function updateOnboardingAccount(ownerId, values) {
  const input = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
  const firstName = String(input.firstName || '').trim();
  const businessName = String(input.businessName || '').trim();
  if (!firstName || !businessName) { const error = new Error('First name and business name are required'); error.statusCode = 400; throw error; }
  ownerQuery(`UPDATE users SET firstName = ?, businessName = ?
    WHERE id = ? AND (ownerId = ? OR id = ?)`).run(firstName, businessName, ownerId, ownerId, ownerId);
  updateBusinessProfile(ownerId, { onboardingStep: Math.max(2, getBusinessProfile(ownerId).onboardingStep) });
  return ownerAccount(ownerId);
}

export function saveBusinessTypes(ownerId, businessTypes) {
  const values = [...new Set((businessTypes || []).map(String))].filter(type => Object.hasOwn(SERVICE_NAMES, type));
  if (!values.length) { const error = new Error('Select at least one business type'); error.statusCode = 400; throw error; }
  return updateBusinessProfile(ownerId, {
    businessTypesJson: JSON.stringify(values),
    onboardingStep: Math.max(3, getBusinessProfile(ownerId).onboardingStep)
  });
}

export function saveJurisdictionProfile(ownerId, { country, region }) {
  return updateBusinessProfile(ownerId, {
    country: String(country || '').toUpperCase(), region: String(region || '').toUpperCase(),
    onboardingStep: Math.max(4, getBusinessProfile(ownerId).onboardingStep)
  });
}

export function savePhoneProvisioning(ownerId, values) {
  return updateBusinessProfile(ownerId, {
    existingPhoneNumber: values.existingNumber, twilioNumber: values.twilioNumber,
    twilioNumberSid: values.twilioNumberSid, phoneProvisioningStatus: 'provisioned',
    carrierSetupStatus: values.carrierSetupStatus || 'queued',
    onboardingStep: Math.max(5, getBusinessProfile(ownerId).onboardingStep)
  });
}

export function saveKnowledgeBase(ownerId, knowledgeBase) {
  const incoming = knowledgeBase && typeof knowledgeBase === 'object' && !Array.isArray(knowledgeBase) ? knowledgeBase : {};
  const existing = getBusinessProfile(ownerId).knowledgeBase || EMPTY_KB;
  const reviewContact = Object.hasOwn(incoming, 'reviewContact')
    ? normalizeReviewContact(incoming.reviewContact) : existing.reviewContact;
  const clean = {
    about: String(incoming.about || '').trim(), hours: String(incoming.hours || '').trim(),
    services: String(incoming.services || '').trim(), policies: String(incoming.policies || '').trim(),
    faqs: String(incoming.faqs || '').trim(),
    // Owner's own fixed prices, said to callers exactly as written (owner ruling 2026-10-02).
    prices: knowledgeText(incoming.prices, 'Your prices'),
    website: knowledgeWebsite(Object.hasOwn(incoming, 'website') ? incoming.website : incoming.websiteUrl),
    neverSay: Array.isArray(incoming.neverSay)
      ? incoming.neverSay.map(value => String(value).trim()).filter(Boolean)
      : String(incoming.neverSay || '').split('\n').map(value => value.trim()).filter(Boolean),
    draft: Boolean(incoming.draft)
  };
  if (reviewContact) clean.reviewContact = { ...reviewContact, ownerId };
  if (Object.hasOwn(incoming, 'serviceArea')) {
    try { clean.serviceArea = normalizeServiceArea(incoming.serviceArea); }
    catch (cause) { const error = new Error(cause.message); error.code = 'INVALID_REQUEST'; error.statusCode = 400; throw error; }
  } else if (Object.hasOwn(existing, 'serviceArea')) clean.serviceArea = existing.serviceArea;
  return updateBusinessProfile(ownerId, {
    knowledgeBaseJson: JSON.stringify(clean),
    onboardingStep: Math.max(6, getBusinessProfile(ownerId).onboardingStep)
  });
}

export function operatorEligibility(profile, options={}) {
  const kb = profile.knowledgeBase || EMPTY_KB;
  const missing = [];
  if (profile.phoneProvisioningStatus !== 'provisioned' || !profile.twilioNumberSid) missing.push('phone');
  if (!String(kb.about || '').trim()) missing.push('About & area');
  if (!String(kb.hours || '').trim()) missing.push('Hours');
  if(!/^\+[1-9]\d{7,14}$/.test(profile.twilioNumber||''))missing.push('Inbound phone number');
  missing.push(...voiceRouteReadiness(options).missing);
  return { eligible: missing.length === 0, missing };
}

export function setOperatorEnabled(ownerId, enabled) {
  const profile = getBusinessProfile(ownerId);
  const eligibility = operatorEligibility(profile);
  if (enabled && !eligibility.eligible) {
    const error = new Error(`Operator cannot go live until these are ready: ${eligibility.missing.join(', ')}`);
    error.statusCode = 409; error.details = eligibility; throw error;
  }
  return updateBusinessProfile(ownerId, {
    operatorEnabled: enabled ? 1 : 0,
    onboardingStep: enabled ? Math.max(7, profile.onboardingStep) : profile.onboardingStep
  });
}

function readCalendarConnection(ownerId) {
  return ownerQuery(`SELECT ownerId, provider, status, calendarId,
      credentialsCiphertext, credentialsIv, credentialsTag, keyVersion,
      externalUrl, expiresAtUtc, scopesJson, createdAt, updatedAt
    FROM calendarConnections WHERE ownerId = ?`).get(ownerId) || null;
}

function storedGoogleConnectionIsUsable(connection) {
  const scopes = parseJson(connection?.scopesJson, null);
  let calendarIdIsValid = false;
  try { calendarIdIsValid = normalizedCalendarId(connection?.calendarId) === connection.calendarId; }
  catch { calendarIdIsValid = false; }
  return connection?.provider === 'google' && connection.status === 'connected' && calendarIdIsValid &&
    [connection.credentialsCiphertext, connection.credentialsIv, connection.credentialsTag, connection.keyVersion]
      .every(value => typeof value === 'string' && Boolean(value)) &&
    Array.isArray(scopes) && scopes.every(scope => typeof scope === 'string') && calendarScopesSupportBooking(scopes);
}

function calendarProfileFromConnection(connection, disconnectedStatus = 'skipped') {
  if (!connection) return { provider: null, status: disconnectedStatus, calendlyUrl: null };
  if (connection.provider === 'calendly') return { provider: 'calendly', status: connection.status, calendlyUrl: connection.externalUrl || null };
  return { provider: 'google', status: connection.status, calendlyUrl: null, calendarId: connection.calendarId || null, expiresAtUtc: connection.expiresAtUtc || null };
}

function replaceCalendarConnection(ownerId, connection) {
  const now = new Date().toISOString();
  ownerQuery(`INSERT INTO calendarConnections (
      ownerId, provider, status, calendarId, credentialsCiphertext, credentialsIv,
      credentialsTag, keyVersion, externalUrl, expiresAtUtc, scopesJson, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ownerId) DO UPDATE SET
      provider=excluded.provider, status=excluded.status, calendarId=excluded.calendarId,
      credentialsCiphertext=excluded.credentialsCiphertext, credentialsIv=excluded.credentialsIv,
      credentialsTag=excluded.credentialsTag, keyVersion=excluded.keyVersion,
      externalUrl=excluded.externalUrl, expiresAtUtc=excluded.expiresAtUtc,
      scopesJson=excluded.scopesJson, updatedAt=excluded.updatedAt`)
    .run(ownerId, connection.provider, connection.status, connection.calendarId || null,
      null, null, null, null, connection.externalUrl || null, null, '[]', now, now);
  return readCalendarConnection(ownerId);
}

function usableBookingCalendarMetadata(connection) {
  if (connection?.status !== 'connected') return { provider: null, calendarId: null, externalUrl: null };
  if (connection.provider === 'google' && storedGoogleConnectionIsUsable(connection)) return { provider: 'google', calendarId: connection.calendarId.trim(), externalUrl: null };
  if (connection.provider === 'calendly') {
    try { return { provider: 'calendly', calendarId: null, externalUrl: normalizedCalendlyUrl(connection.externalUrl) }; }
    catch { return { provider: null, calendarId: null, externalUrl: null }; }
  }
  return { provider: null, calendarId: null, externalUrl: null };
}

function synchronizeBookingCalendar(ownerId, timezone, connection) {
  const metadata = usableBookingCalendarMetadata(connection);
  const current = ownerQuery(`SELECT revision, timezone, provider, calendarId, externalUrl
    FROM bookingSettings WHERE ownerId = ?`).get(ownerId);
  const unchanged = current && current.timezone === timezone && current.provider === metadata.provider &&
    current.calendarId === metadata.calendarId && current.externalUrl === metadata.externalUrl;
  ownerQuery(`UPDATE users SET timezone = ?
    WHERE id = ? AND (ownerId = ? OR id = ?) AND role = 'owner'`).run(timezone, ownerId, ownerId, ownerId);
  if (unchanged) return current.revision;
  const revision = crypto.randomUUID();
  const now = new Date().toISOString();
  ownerQuery(`INSERT INTO bookingSettings (
      ownerId, revision, timezone, provider, calendarId, externalUrl,
      weeklyAvailabilityJson, blackoutsJson, bookingHorizonDays,
      minimumNoticeMinutes, slotIncrementMinutes, bufferBeforeMinutes,
      bufferAfterMinutes, directBookingEnabled, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, '{}', '[]', NULL, NULL, NULL, NULL, NULL, 0, ?)
    ON CONFLICT(ownerId) DO UPDATE SET
      revision=excluded.revision, timezone=excluded.timezone, provider=excluded.provider,
      calendarId=excluded.calendarId, externalUrl=excluded.externalUrl,
      updatedAt=excluded.updatedAt`)
    .run(ownerId, revision, timezone, metadata.provider, metadata.calendarId, metadata.externalUrl, now);
  return revision;
}

const saveCalendarTransaction = db.transaction((ownerId, selection) => {
  const { timezone } = requireCalendarOwner(ownerId);
  let connection;
  if (selection.skipped) {
    ownerQuery('DELETE FROM calendarConnections WHERE ownerId = ?').run(ownerId);
    connection = null;
  } else if (selection.provider === 'calendly') {
    connection = replaceCalendarConnection(ownerId, { provider: 'calendly', status: 'connected', calendarId: null, externalUrl: selection.externalUrl });
  } else {
    const current = readCalendarConnection(ownerId);
    connection = storedGoogleConnectionIsUsable(current)
      ? current
      : replaceCalendarConnection(ownerId, { provider: 'google', status: 'pending_oauth', calendarId: null, externalUrl: null });
  }
  synchronizeBookingCalendar(ownerId, timezone, connection);
  const profile = getBusinessProfile(ownerId);
  return updateBusinessProfile(ownerId, {
    calendarJson: JSON.stringify(calendarProfileFromConnection(connection, selection.skipped ? 'skipped' : 'not_connected')),
    onboardingStep: Math.max(9, profile.onboardingStep)
  });
});

export function saveCalendar(ownerId, input) { return saveCalendarTransaction(ownerId, normalizedCalendarInput(input)); }

const saveGoogleCalendarTokensTransaction = db.transaction((ownerId, tokens) => {
  const { timezone } = requireCalendarOwner(ownerId);
  saveGoogleCalendarConnection(ownerId, tokens);
  const connection = readCalendarConnection(ownerId);
  if (!storedGoogleConnectionIsUsable(connection)) throw onboardingError('Google Calendar connection could not be verified', { code: 'CALENDAR_CONNECTION_INVALID', statusCode: 409 });
  synchronizeBookingCalendar(ownerId, timezone, connection);
  const profile = getBusinessProfile(ownerId);
  return updateBusinessProfile(ownerId, {
    calendarJson: JSON.stringify(calendarProfileFromConnection(connection)),
    onboardingStep: Math.max(9, profile.onboardingStep)
  });
});

export function saveGoogleCalendarTokens(ownerId, tokens) {
  return saveGoogleCalendarTokensTransaction(ownerId, normalizedGoogleTokens(tokens));
}

export function saveVoice(ownerId, input) {
  const voiceId = String(input.voiceId || '');
  const agentName = String(input.agentName || '').trim();
  const greeting = String(input.greeting || '').trim();
  if (!['male','female'].includes(voiceId) || !agentName || !greeting) {
    const error = new Error('Choose a voice, enter an agent name, and enter a greeting'); error.statusCode = 400; throw error;
  }
  return updateBusinessProfile(ownerId, {
    voiceId, agentName, greeting,
    onboardingStep: Math.max(10, getBusinessProfile(ownerId).onboardingStep)
  });
}

export function onboardingState(ownerId) {
  const profile = getBusinessProfile(ownerId);
  const account = ownerAccount(ownerId);
  const eligibility=operatorEligibility(profile);
  if(!hasOperatorAccess(account)){eligibility.eligible=false;eligibility.missing.push('Operator plan access');}
  return { account, quoteDoneAccess: hasQuoteDoneAccess(account), profile, operator: { enabled: profile.operatorEnabled&&eligibility.eligible, configuredEnabled:profile.operatorEnabled, ...eligibility } };
}

function draftRevision(row) {
  return crypto.createHash('sha256').update([
    row.id,row.ownerId,row.fieldsJson,row.confirmedFieldsJson,row.currentField ?? '',row.updatedAt
  ].join('\u0000')).digest('hex');
}
function nextDraftTimestamp(previous) {
  const now = new Date().toISOString();
  if (now !== previous) return now;
  const parsed = Date.parse(previous);
  return Number.isFinite(parsed) ? new Date(parsed + 1).toISOString() : now + '.1';
}
const dependencyPriority = field => {
  if (['offeringRates','scopeRates','installedLaborPercent','installedMaterialsPercent'].includes(field)) return 3;
  if (['offeringDetails','scopeDetails','knownOfferings'].includes(field)) return 2;
  if (['offeringMode','unit','customPricingMode','customChargeClassification','accessoryPricingMode','underlaymentPriceBasis','materialAccessoryBasis','vinylPlankUnderlaymentRule'].includes(field)) return 1;
  return 0;
};

export function createInterviewDraft(ownerId, input) {
  const mode = ['phone','browser'].includes(input.mode) ? input.mode : 'browser';
  const definitions=applicationMetadata().services;
  const serviceTypes = [...new Set((input.serviceTypes || []).map(String))].filter(type => definitions.some(service=>service.serviceType===type));
  if (!serviceTypes.length) { const error = new Error('Select at least one service for the interview'); error.statusCode = 400; throw error; }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  ownerQuery(`INSERT INTO priceBookDrafts (
    id, ownerId, status, mode, serviceTypesJson, fieldsJson,
    confirmedFieldsJson, currentField, createdAt, updatedAt
  ) VALUES (?, ?, 'DRAFT', ?, ?, '{}', '{}', ?, ?, ?)`).run(
    id, ownerId, mode, JSON.stringify(serviceTypes),
    `${serviceTypes[0]}.${definitions.find(service=>service.serviceType===serviceTypes[0]).fields.find(field=>['number','json','select','boolean'].includes(field.type))?.field || ''}`,
    now, now
  );
  return getInterviewDraft(ownerId, id);
}

export function getInterviewDraft(ownerId, id) {
  const row = ownerQuery('SELECT * FROM priceBookDrafts WHERE id = ? AND ownerId = ?').get(id, ownerId);
  if (!row) return null;
  return {
    ...row,
    revision:draftRevision(row),
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
  if (!draft) { const error = new Error('Draft not found'); error.statusCode = 404; throw error; }
  const fail = message => { throw Object.assign(new Error(message), {statusCode:422}); };
  const conflict = () => { throw Object.assign(new Error('This interview draft changed. Review the newest saved answers before trying again.'), {statusCode:409}); };
  if (!record(input) || Object.keys(input).some(key=>!['fields','confirmedFields','currentField','revision'].includes(key))) fail('Unsupported interview update. Your saved draft was not changed.');
  if (input.revision !== undefined && input.revision !== draft.revision) conflict();
  for (const map of [input.fields,input.confirmedFields]) {
    if (map !== undefined && (!record(map) || Object.keys(map).some(type=>!draft.serviceTypes.includes(type)))) fail('Choose a service in this interview.');
  }
  const nextFields = structuredClone(draft.fields);
  const nextConfirmed = structuredClone(draft.confirmedFields);
  for (const serviceType of draft.serviceTypes) {
    const incoming = input.fields?.[serviceType] ?? {};
    if (!record(incoming)) fail('Enter supported price-book fields.');
    nextFields[serviceType] = { ...(nextFields[serviceType] || {}) };
    const confirmed = new Set(nextConfirmed[serviceType] || []);
    const ordered = Object.entries(incoming).map(([field,value],index)=>({field,value,index}))
      .sort((left,right)=>dependencyPriority(left.field)-dependencyPriority(right.field)||left.index-right.index);
    for (const {field,value} of ordered) {
      const validated = validateInterviewValue(serviceType,field,value,nextFields[serviceType]);
      if (JSON.stringify(validated) !== JSON.stringify(nextFields[serviceType][field])) confirmed.delete(field);
      nextFields[serviceType][field] = validated;
    }
    const explicit = input.confirmedFields?.[serviceType];
    if (explicit !== undefined) {
      if (!Array.isArray(explicit) || explicit.some(field=>typeof field!=='string'||!Object.hasOwn(nextFields[serviceType],field))) fail('Confirm only values captured in this draft.');
      for (const field of explicit) interviewField(serviceType,field);
      nextConfirmed[serviceType] = [...new Set(explicit)];
    } else nextConfirmed[serviceType] = [...confirmed];
  }
  if (input.currentField != null) {
    if (typeof input.currentField!=='string') fail('Choose a supported interview question.');
    const [type,field,...extra]=input.currentField.split('.');
    if (extra.length || !draft.serviceTypes.includes(type)) fail('Choose a supported interview question.');
    interviewField(type,field);
  }
  const currentField=Object.hasOwn(input,'currentField') ? input.currentField : draft.currentField;
  const result=ownerQuery(`UPDATE priceBookDrafts SET fieldsJson = ?, confirmedFieldsJson = ?,
    currentField = ?, updatedAt = ?
    WHERE id = ? AND ownerId = ? AND fieldsJson = ? AND confirmedFieldsJson = ?
      AND currentField IS ? AND updatedAt = ?`).run(
    JSON.stringify(nextFields), JSON.stringify(nextConfirmed), currentField, nextDraftTimestamp(draft.updatedAt),
    id, ownerId, draft.fieldsJson, draft.confirmedFieldsJson, draft.currentField, draft.updatedAt
  );
  if (result.changes !== 1) conflict();
  return getInterviewDraft(ownerId, id);
}

export function draftReviewPayload(ownerId, id) {
  const draft = getInterviewDraft(ownerId, id);
  if (!draft) { const error = new Error('Draft not found'); error.statusCode = 404; throw error; }
  const services = draft.serviceTypes.map(serviceType => {
    const fields = draft.fields[serviceType] || {};
    const confirmed = new Set(draft.confirmedFields[serviceType] || []);
    const unconfirmedFields = Object.keys(fields).filter(field => !confirmed.has(field));
    const captured=materializeInterviewFields(serviceType,fields,()=>crypto.randomUUID());
    return {
      serviceType, service: SERVICE_NAMES[serviceType], fields:captured.pricing,knownOfferings:captured.knownOfferings,
      source: 'AI_INTERVIEW', active: false, confirmedFields: {}, unconfirmedFields: Object.keys(fields)
    };
  });
  return { status: 'DRAFT', services };
}

export async function assistInterviewDraft(ownerId, id, input) {
  const before = getInterviewDraft(ownerId,id);
  if (!before) throw Object.assign(new Error('Draft not found'),{statusCode:404});
  if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['serviceType','field','answer'].includes(key)) || !before.serviceTypes.includes(input.serviceType)) {
    throw Object.assign(new Error('Choose a field in this interview. No draft values were changed.'),{statusCode:422});
  }
  const value = await interpretInterviewAnswer({...input,pricing:before.fields[input.serviceType]||{}});
  const current = getInterviewDraft(ownerId,id);
  if (!current || current.revision!==before.revision) throw Object.assign(new Error('This draft changed while AI was working. Review it and try again.'),{statusCode:409});
  const draft = saveInterviewDraft(ownerId,id,{
    revision:current.revision,
    fields:{[input.serviceType]:{[input.field]:value}},
    confirmedFields:{[input.serviceType]:(current.confirmedFields[input.serviceType]||[]).filter(field=>field!==input.field)}
  });
  return {draft,field:input.field,value,status:'DRAFT',confirmed:false};
}
