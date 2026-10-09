import crypto from 'node:crypto';
import {ownerUtcInstant} from './ownerDate.js';
import {hasQuoteDoneAccess} from './planAccess.js';
import { loadPricebook } from '../priceBookService.js';
import { bookStatuses, bookQuoteStatuses } from './quoteDoneBridge.js';
import { isValidIanaTimeZone, parseLocalTime } from './calendarTime.js';
import { serviceAreaFromKnowledgeBase } from './serviceArea.js';
import {usageOwnerQuery} from './billingUsagePolicy.js';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const BOOKING_MODES = new Set(['site_visit_first', 'book_job']);
const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const E164 = /^\+[1-9]\d{7,14}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;
const CALENDLY_URL = /^https:\/\/(?:www\.)?calendly\.com\/[^?#\s]+$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SETTINGS_KEYS = [
  'timezone', 'weeklyAvailability', 'blackouts', 'bookingHorizonDays',
  'minimumNoticeMinutes', 'slotIncrementMinutes', 'bufferBeforeMinutes',
  'bufferAfterMinutes', 'directBookingEnabled'
];
const POLICY_KEYS = ['bookingMode', 'durationMinutes', 'enabled'];
const WIDGET_KEYS = ['accentColor', 'launcherLabel', 'clickToCallNumber', 'allowedOrigins'];
const GOOGLE_CALENDAR_FULL_SCOPE = 'https://www.googleapis.com/auth/calendar';
const GOOGLE_CALENDAR_WRITE_SCOPES = new Set([
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.app.created'
]);
const GOOGLE_CALENDAR_BUSY_SCOPES = new Set([
  'https://www.googleapis.com/auth/calendar.events.freebusy',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.readonly'
]);

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function error(code, statusCode, message, details) {
  return new BookingAdminServiceError(code, statusCode, message, details);
}

function invalid(message, details) {
  return error('INVALID_REQUEST', 400, message, details);
}

function configurationError(code, message, details) {
  return error(code, 409, message, details);
}

function requireClosedObject(value, expectedKeys, label) {
  if (!record(value)) throw invalid(`${label} must be an object.`);
  const expected = new Set(expectedKeys);
  const unknown = Object.keys(value).filter(key => !expected.has(key));
  const missing = expectedKeys.filter(key => !own(value, key));
  if (unknown.length || missing.length) {
    throw invalid(`${label} has an invalid shape.`, { unknown, missing });
  }
  return value;
}

function boundedInteger(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw invalid(`${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function normalizedText(value, label, maximumLength) {
  if (typeof value !== 'string') throw invalid(`${label} must be text.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength || CONTROL_CHARACTERS.test(normalized)) {
    throw invalid(`${label} is invalid.`);
  }
  return normalized;
}

function normalizedOwnerId(value) {
  return normalizedText(value, 'Owner identity', 256);
}

function normalizedServiceId(value) {
  const id = normalizedText(value, 'Service identity', 128);
  if (id!=='voice-appointment'&&!UUID.test(id)) throw invalid('Choose a saved service.');
  return id.toLowerCase();
}

function normalizedTimezone(value) {
  const candidate = normalizedText(value, 'Timezone', 128);
  if (!isValidIanaTimeZone(candidate)) throw invalid('Choose a valid IANA timezone.');
  return new Intl.DateTimeFormat('en', { timeZone: candidate }).resolvedOptions().timeZone;
}

function normalizedLocalTime(value, label) {
  if (typeof value !== 'string' || value !== value.trim()) throw invalid(`${label} must use HH:mm.`);
  try {
    const parsed = parseLocalTime(value);
    return { value, minute: parsed.minuteOfDay };
  } catch {
    throw invalid(`${label} must be a valid same-day time using HH:mm.`);
  }
}

function normalizedWeeklyAvailability(value) {
  requireClosedObject(value, WEEKDAYS, 'Weekly availability');
  const result = {};
  for (const day of WEEKDAYS) {
    const windows = value[day];
    if (!Array.isArray(windows) || windows.length > 24) {
      throw invalid(`Weekly availability for ${day} must contain at most 24 windows.`);
    }
    const normalized = windows.map((window, index) => {
      requireClosedObject(window, ['start', 'end'], `Availability window ${day}[${index}]`);
      const start = normalizedLocalTime(window.start, `Availability start ${day}[${index}]`);
      const end = normalizedLocalTime(window.end, `Availability end ${day}[${index}]`);
      if (end.minute <= start.minute) {
        throw invalid('Availability windows must end after they start on the same day.');
      }
      return { start: start.value, end: end.value, startMinute: start.minute, endMinute: end.minute };
    }).sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);
    for (let index = 1; index < normalized.length; index += 1) {
      if (normalized[index].startMinute < normalized[index - 1].endMinute) {
        throw invalid(`Availability windows for ${day} must not overlap.`);
      }
    }
    result[day] = normalized.map(({ start, end }) => ({ start, end }));
  }
  return result;
}

function normalizedUtcInstant(value, label) {
  const match = typeof value === 'string' ? UTC_INSTANT.exec(value) : null;
  if (!match) {
    throw invalid(`${label} must be a UTC timestamp.`);
  }
  const normalized = ownerUtcInstant(value);
  if (!normalized) {
    throw invalid(`${label} must be a valid UTC timestamp.`);
  }
  return normalized;
}

function normalizedBlackouts(value) {
  if (!Array.isArray(value)) throw invalid('Blackouts must be an array.');
  const result = value.map((item, index) => {
    requireClosedObject(item, ['startAtUtc', 'endAtUtc'], `Blackout ${index}`);
    const startAtUtc = normalizedUtcInstant(item.startAtUtc, `Blackout ${index} start`);
    const endAtUtc = normalizedUtcInstant(item.endAtUtc, `Blackout ${index} end`);
    if (new Date(startAtUtc) >= new Date(endAtUtc)) {
      throw invalid('Blackout end must follow blackout start.');
    }
    return { startAtUtc, endAtUtc };
  }).sort((left, right) => left.startAtUtc.localeCompare(right.startAtUtc));
  for (let index = 1; index < result.length; index += 1) {
    if (result[index].startAtUtc < result[index - 1].endAtUtc) {
      throw invalid('Blackout windows must not overlap.');
    }
  }
  return result;
}

export function validateBookingSettingsInput(value) {
  requireClosedObject(value, SETTINGS_KEYS, 'Booking settings');
  const timezone = normalizedTimezone(value.timezone);
  const weeklyAvailability = normalizedWeeklyAvailability(value.weeklyAvailability);
  const blackouts = normalizedBlackouts(value.blackouts);
  const bookingHorizonDays = boundedInteger(value.bookingHorizonDays, 'Booking horizon days', 1, 366);
  const minimumNoticeMinutes = boundedInteger(value.minimumNoticeMinutes, 'Minimum notice minutes', 0, 525600);
  const slotIncrementMinutes = boundedInteger(value.slotIncrementMinutes, 'Slot increment minutes', 1, 1440);
  const bufferBeforeMinutes = boundedInteger(value.bufferBeforeMinutes, 'Buffer before minutes', 0, 1440);
  const bufferAfterMinutes = boundedInteger(value.bufferAfterMinutes, 'Buffer after minutes', 0, 1440);
  if (typeof value.directBookingEnabled !== 'boolean') {
    throw invalid('Direct booking enabled must be true or false.');
  }
  if (minimumNoticeMinutes > bookingHorizonDays * 1440) {
    throw invalid('Minimum notice cannot extend beyond the booking horizon.');
  }
  return {
    timezone, weeklyAvailability, blackouts, bookingHorizonDays,
    minimumNoticeMinutes, slotIncrementMinutes, bufferBeforeMinutes,
    bufferAfterMinutes, directBookingEnabled: value.directBookingEnabled
  };
}

export function validateBookingPolicyInput(value) {
  requireClosedObject(value, POLICY_KEYS, 'Booking policy');
  if (!BOOKING_MODES.has(value.bookingMode)) throw invalid('Choose a supported booking mode.');
  if (typeof value.enabled !== 'boolean') throw invalid('Booking policy enabled must be true or false.');
  let durationMinutes = value.durationMinutes;
  if (value.bookingMode === 'site_visit_first' && durationMinutes === null) {
    durationMinutes = null;
  } else {
    durationMinutes = boundedInteger(durationMinutes, 'Service duration minutes', 1, 10080);
  }
  if (value.bookingMode === 'book_job' && durationMinutes === null) {
    throw invalid('Book-job mode requires an explicit service duration.');
  }
  return { bookingMode: value.bookingMode, durationMinutes, enabled: value.enabled };
}

function normalizedOrigin(value, { allowInsecureLoopback }) {
  const origin = normalizedText(value, 'Allowed origin', 2048);
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw invalid('Each allowed website must be a valid origin.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const protocolAllowed = url.protocol === 'https:' ||
    (allowInsecureLoopback && loopback && url.protocol === 'http:');
  if (!protocolAllowed || url.origin !== origin || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw invalid('Use an exact HTTPS origin; local HTTP is allowed only for verification.');
  }
  return origin;
}

export function validateWidgetSettingsInput(value, { allowInsecureLoopback = process.env.NODE_ENV !== 'production' } = {}) {
  requireClosedObject(value, WIDGET_KEYS, 'Widget settings');
  if (typeof value.accentColor !== 'string' || !HEX_COLOR.test(value.accentColor)) {
    throw invalid('Accent color must be a six-digit hex color.');
  }
  const accentColor = value.accentColor.toUpperCase();
  const launcherLabel = normalizedText(value.launcherLabel, 'Launcher label', 40);
  let clickToCallNumber = null;
  if (value.clickToCallNumber !== null && value.clickToCallNumber !== '') {
    if (typeof value.clickToCallNumber !== 'string' || value.clickToCallNumber !== value.clickToCallNumber.trim() ||
        !E164.test(value.clickToCallNumber)) {
      throw invalid('Click-to-call number must be a normalized E.164 number or null.');
    }
    clickToCallNumber = value.clickToCallNumber;
  }
  if (!Array.isArray(value.allowedOrigins) || value.allowedOrigins.length < 1 || value.allowedOrigins.length > 20) {
    throw invalid('Choose between one and 20 allowed website origins.');
  }
  const allowedOrigins = value.allowedOrigins.map(origin =>
    normalizedOrigin(origin, { allowInsecureLoopback }));
  if (new Set(allowedOrigins).size !== allowedOrigins.length) {
    throw invalid('Allowed website origins must be unique.');
  }
  return { accentColor, launcherLabel, clickToCallNumber, allowedOrigins };
}

function defaultLoadServiceCatalog(ownerId) {
  const book = loadPricebook(ownerId);
  const statuses = new Map(
    bookQuoteStatuses(book).map(status => [String(status.serviceId).toLowerCase(), status.status])
  );
  return {
    services: (Array.isArray(book.services) ? book.services : []).map(service => ({
      ...service,
      quoteStatus: statuses.get(String(service.id || '').toLowerCase()) || 'NEEDS PRICING'
    }))
  };
}

function catalogTierNames(service, issues) {
  if (service.tiers === undefined || service.tiers === null) return [];
  if (!Array.isArray(service.tiers) || service.tiers.length > 3) {
    issues.push('A service may expose at most three quote tiers.');
    return [];
  }
  const names = [];
  for (const tier of service.tiers) {
    if (!record(tier) || typeof tier.name !== 'string') {
      issues.push('Every configured quote tier needs a name.');
      continue;
    }
    const name = tier.name.trim();
    if (!name || name.length > 80 || CONTROL_CHARACTERS.test(name)) {
      issues.push('Every configured quote tier needs a valid name.');
      continue;
    }
    names.push(name);
  }
  const folded = names.map(name => name.toLocaleLowerCase('en-US'));
  if (new Set(folded).size !== folded.length) issues.push('Quote tier names must be unique.');
  return issues.length ? [] : names;
}

function normalizedCatalog(raw) {
  const source = Array.isArray(raw) ? raw : raw?.services;
  if (!Array.isArray(source)) {
    throw configurationError('SERVICE_CATALOG_UNAVAILABLE', 'The saved service catalog is unavailable.');
  }
  const services = source.map(service => {
    const issues = [];
    if (!record(service)) {
      return {
        id: null,
        serviceType: null,
        name: 'Invalid service',
        quoteStatus: 'NEEDS PRICING',
        allowedQuoteTierNames: [],
        issues: ['The saved service is malformed.']
      };
    }
    const id = typeof service.id === 'string' && UUID.test(service.id.trim())
      ? service.id.trim().toLowerCase()
      : null;
    if (!id) issues.push('The saved service needs a valid unique ID.');
    const nameCandidate = service.service ?? service.name;
    const name = typeof nameCandidate === 'string' && nameCandidate.trim() &&
      nameCandidate.trim().length <= 120 && !CONTROL_CHARACTERS.test(nameCandidate.trim())
      ? nameCandidate.trim()
      : 'Saved service';
    if (name === 'Saved service') issues.push('The saved service needs a valid name.');
    const quoteStatus = typeof service.quoteStatus === 'string'
      ? service.quoteStatus
      : typeof service.status === 'string'
        ? service.status
        : service.active === false ? 'DISABLED' : 'NEEDS PRICING';
    const allowedQuoteTierNames = catalogTierNames(service, issues);
    return {
      id,
      serviceType: typeof service.serviceType === 'string' ? service.serviceType : null,
      name,
      quoteStatus,
      allowedQuoteTierNames,
      issues
    };
  });
  const counts = new Map();
  for (const service of services) {
    if (service.id) counts.set(service.id, (counts.get(service.id) || 0) + 1);
  }
  for (const service of services) {
    if (service.id && counts.get(service.id) > 1) {
      service.issues.push('Duplicate saved service IDs require owner correction.');
    }
  }
  return services;
}

function parseJson(value, fallback) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function nowIso(clock) {
  const value = clock();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Booking admin clock must return a valid instant.');
  return date.toISOString();
}

function revisionFrom(randomUUID) {
  const revision = randomUUID();
  if (typeof revision !== 'string' || !revision.trim() || CONTROL_CHARACTERS.test(revision)) {
    throw new TypeError('Booking admin revision generator returned an invalid value.');
  }
  return revision;
}

function publicKeyFrom(randomBytes) {
  const value = randomBytes(32);
  if (!Buffer.isBuffer(value) || value.length !== 32) {
    throw new TypeError('Booking admin key generator must return 32 random bytes.');
  }
  return value.toString('base64url');
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function blocker(code, message) {
  return { code, message };
}

function persistedSettings(row) {
  if (!row) return null;
  return {
    timezone: row.timezone,
    provider: row.provider || null,
    calendarId: row.calendarId || null,
    externalUrl: row.externalUrl || null,
    weeklyAvailability: parseJson(row.weeklyAvailabilityJson, null),
    blackouts: parseJson(row.blackoutsJson, null),
    bookingHorizonDays: row.bookingHorizonDays,
    minimumNoticeMinutes: row.minimumNoticeMinutes,
    slotIncrementMinutes: row.slotIncrementMinutes,
    bufferBeforeMinutes: row.bufferBeforeMinutes,
    bufferAfterMinutes: row.bufferAfterMinutes,
    directBookingEnabled: Number(row.directBookingEnabled) === 1,
    revision: row.revision,
    updatedAt: row.updatedAt
  };
}

function safeCalendarConnection(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    status: row.status,
    calendarId: row.calendarId || null,
    externalUrl: row.externalUrl || null,
    expiresAtUtc: row.expiresAtUtc || null
  };
}

function serviceAreaReadiness(profileRow) {
  if (!profileRow) {
    return {
      policy: null,
      summary: { configured: false, mode: null, cityCount: 0 },
      blockers: [blocker('SERVICE_AREA_MISSING', 'Configure a structured service area before direct booking.')]
    };
  }
  let knowledgeBase;
  try {
    knowledgeBase = JSON.parse(profileRow.knowledgeBaseJson);
  } catch {
    return {
      policy: null,
      summary: { configured: false, mode: null, cityCount: 0 },
      blockers: [blocker('SERVICE_AREA_INVALID', 'Correct the structured service-area policy before direct booking.')]
    };
  }
  if (!record(knowledgeBase) || !own(knowledgeBase, 'serviceArea') ||
      knowledgeBase.serviceArea === null || knowledgeBase.serviceArea === undefined) {
    return {
      policy: null,
      summary: { configured: false, mode: null, cityCount: 0 },
      blockers: [blocker('SERVICE_AREA_MISSING', 'Configure a structured service area before direct booking.')]
    };
  }
  const policy = serviceAreaFromKnowledgeBase(knowledgeBase);
  if (!policy) {
    return {
      policy: null,
      summary: { configured: false, mode: null, cityCount: 0 },
      blockers: [blocker('SERVICE_AREA_INVALID', 'Correct the structured service-area policy before direct booking.')]
    };
  }
  return {
    policy,
    summary: {
      configured: true,
      mode: policy.mode,
      cityCount: policy.cities.length
    },
    blockers: []
  };
}

function calendarScopesSupportBooking(value) {
  const scopes = parseJson(value, null);
  if (!Array.isArray(scopes) || scopes.some(scope => typeof scope !== 'string')) return false;
  const normalized = new Set(scopes.map(scope => scope.trim()).filter(Boolean));
  if (normalized.has(GOOGLE_CALENDAR_FULL_SCOPE)) return true;
  return [...GOOGLE_CALENDAR_WRITE_SCOPES].some(scope => normalized.has(scope)) &&
    [...GOOGLE_CALENDAR_BUSY_SCOPES].some(scope => normalized.has(scope));
}

function globalReadiness(settingsRow, connectionRow) {
  const blockers = [];
  if (!settingsRow) {
    blockers.push(blocker('BOOKING_SETTINGS_MISSING', 'Save booking hours and scheduling rules.'));
    return blockers;
  }
  if (Number(settingsRow.directBookingEnabled) !== 1) {
    blockers.push(blocker('DIRECT_BOOKING_DISABLED', 'Turn on direct booking.'));
  }
  if (!isValidIanaTimeZone(settingsRow.timezone)) {
    blockers.push(blocker('TIMEZONE_INVALID', 'Choose a valid IANA timezone.'));
  }
  let weekly;
  try {
    weekly = normalizedWeeklyAvailability(parseJson(settingsRow.weeklyAvailabilityJson, null));
  } catch {
    blockers.push(blocker('WEEKLY_AVAILABILITY_INVALID', 'Save structured, non-overlapping weekly availability.'));
  }
  if (weekly && !WEEKDAYS.some(day => weekly[day].length > 0)) {
    blockers.push(blocker('WEEKLY_AVAILABILITY_EMPTY', 'Open at least one weekly availability window.'));
  }
  try {
    normalizedBlackouts(parseJson(settingsRow.blackoutsJson, null));
  } catch {
    blockers.push(blocker('BLACKOUTS_INVALID', 'Correct the saved blackout windows.'));
  }
  const integerChecks = [
    ['BOOKING_HORIZON_INVALID', settingsRow.bookingHorizonDays, 1, 366, 'Choose a booking horizon from 1 to 366 days.'],
    ['MINIMUM_NOTICE_INVALID', settingsRow.minimumNoticeMinutes, 0, 525600, 'Choose valid minimum notice.'],
    ['SLOT_INCREMENT_INVALID', settingsRow.slotIncrementMinutes, 1, 1440, 'Choose a slot increment from 1 to 1440 minutes.'],
    ['BUFFER_BEFORE_INVALID', settingsRow.bufferBeforeMinutes, 0, 1440, 'Choose a valid before buffer.'],
    ['BUFFER_AFTER_INVALID', settingsRow.bufferAfterMinutes, 0, 1440, 'Choose a valid after buffer.']
  ];
  for (const [code, value, min, max, message] of integerChecks) {
    if (!Number.isInteger(value) || value < min || value > max) blockers.push(blocker(code, message));
  }
  if (Number.isInteger(settingsRow.minimumNoticeMinutes) && Number.isInteger(settingsRow.bookingHorizonDays) &&
      settingsRow.minimumNoticeMinutes > settingsRow.bookingHorizonDays * 1440) {
    blockers.push(blocker('NOTICE_EXCEEDS_HORIZON', 'Minimum notice cannot extend beyond the booking horizon.'));
  }
  if (!connectionRow) {
    blockers.push(blocker('CALENDAR_NOT_CONNECTED', 'Connect a destination calendar.'));
  } else if (connectionRow.status !== 'connected') {
    blockers.push(blocker('CALENDAR_NOT_CONNECTED', 'Reconnect the destination calendar.'));
  } else if (connectionRow.provider !== 'google') {
    blockers.push(blocker('CALENDAR_PROVIDER_NOT_DIRECT', 'This calendar connection does not support confirmed direct booking.'));
  } else {
    if (typeof connectionRow.calendarId !== 'string' || !connectionRow.calendarId.trim()) {
      blockers.push(blocker('CALENDAR_DESTINATION_MISSING', 'Choose a destination calendar.'));
    }
    if (![connectionRow.credentialsCiphertext, connectionRow.credentialsIv,
      connectionRow.credentialsTag, connectionRow.keyVersion].every(value => typeof value === 'string' && value)) {
      blockers.push(blocker('CALENDAR_CREDENTIALS_MISSING', 'Reconnect Google Calendar before direct booking.'));
    }
    if (!calendarScopesSupportBooking(connectionRow.scopesJson)) {
      blockers.push(blocker(
        'CALENDAR_SCOPES_INSUFFICIENT',
        'Reconnect Google Calendar with availability-read and event-write access.'
      ));
    }
  }
  if (settingsRow.provider !== (connectionRow?.provider || null) ||
      settingsRow.calendarId !== (connectionRow?.calendarId || null) ||
      settingsRow.externalUrl !== (connectionRow?.externalUrl || null)) {
    blockers.push(blocker('CALENDAR_SETTINGS_STALE', 'Save booking settings again after changing the calendar connection.'));
  }
  return blockers;
}

function policyView(row) {
  if (!row) return null;
  return {
    bookingMode: row.bookingMode,
    durationMinutes: row.durationMinutes,
    effectiveDurationMinutes: row.bookingMode === 'site_visit_first' && row.durationMinutes === null
      ? 45
      : row.durationMinutes,
    enabled: Number(row.enabled) === 1,
    revision: row.revision,
    updatedAt: row.updatedAt
  };
}

function serviceReadiness(service, policyRow, globalBlockers, connectionRow, settingsRow) {
  const blockers = [...globalBlockers];
  for (const issue of service.issues) blockers.push(blocker('SERVICE_CATALOG_INVALID', issue));
  if (service.id!=='voice-appointment' && service.quoteStatus !== 'QUOTING LIVE') {
    blockers.push(blocker('SERVICE_NOT_QUOTING_LIVE', 'Complete and approve pricing before direct booking.'));
  }
  if (!policyRow) {
    blockers.push(blocker('BOOKING_POLICY_MISSING', 'Configure booking mode and duration for this service.'));
  } else {
    if (Number(policyRow.enabled) !== 1) {
      blockers.push(blocker('BOOKING_POLICY_DISABLED', 'Turn on booking for this service.'));
    }
    if (!BOOKING_MODES.has(policyRow.bookingMode)) {
      blockers.push(blocker('BOOKING_MODE_INVALID', 'Choose a supported booking mode.'));
    }
    const effectiveDuration = policyRow.bookingMode === 'site_visit_first' && policyRow.durationMinutes === null
      ? 45
      : policyRow.durationMinutes;
    if (!Number.isInteger(effectiveDuration) || effectiveDuration < 1 || effectiveDuration > 10080) {
      blockers.push(blocker('SERVICE_DURATION_INVALID', 'Choose a valid service duration.'));
    }
    if (policyRow.bookingMode === 'book_job' && policyRow.durationMinutes === null) {
      blockers.push(blocker('SERVICE_DURATION_REQUIRED', 'Book-job mode requires an explicit duration.'));
    }
    if (Number.isInteger(effectiveDuration) && effectiveDuration > 0) {
      try {
        const weekly = normalizedWeeklyAvailability(parseJson(settingsRow?.weeklyAvailabilityJson, null));
        const longestWindow = Math.max(0, ...WEEKDAYS.flatMap(day =>
          weekly[day].map(window => {
            const start = parseLocalTime(window.start).minuteOfDay;
            const end = parseLocalTime(window.end).minuteOfDay;
            return end - start;
          })
        ));
        if (effectiveDuration > longestWindow) {
          blockers.push(blocker(
            'DURATION_EXCEEDS_AVAILABILITY',
            'Open an availability window long enough for this service duration.'
          ));
        }
      } catch {
        // The global weekly-availability diagnostic already reports malformed hours.
      }
    }
  }
  let capability = blockers.length === 0 ? 'DIRECT' : 'PREFERRED_TIME_ONLY';
  if (policyRow && Number(policyRow.enabled) === 0) capability = 'NONE';
  if (policyRow && Number(policyRow.enabled) === 1 &&
      connectionRow?.provider === 'calendly' && connectionRow.status === 'connected' &&
      typeof connectionRow.externalUrl === 'string' && CALENDLY_URL.test(connectionRow.externalUrl)) {
    capability = 'EXTERNAL_HANDOFF';
  }
  return {
    serviceId: service.id,
    serviceType: service.serviceType,
    name: service.name,
    quoteStatus: service.quoteStatus,
    allowedQuoteTierNames: service.allowedQuoteTierNames,
    policy: policyView(policyRow),
    directBookingReady: capability === 'DIRECT',
    capability,
    blockers
  };
}

export class BookingAdminServiceError extends Error {
  constructor(code, statusCode, message, details) {
    super(message);
    this.name = 'BookingAdminServiceError';
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) this.details = details;
  }
}

export function createBookingAdminService({
  db,
  loadServiceCatalog = defaultLoadServiceCatalog,
  clock = () => new Date(),
  randomUUID = crypto.randomUUID,
  randomBytes = crypto.randomBytes,
  allowInsecureLoopback = process.env.NODE_ENV !== 'production'
} = {}) {
  if (!db || typeof db.prepare !== 'function' || typeof db.transaction !== 'function') {
    throw new TypeError('Booking admin service requires a transactional database.');
  }
  if (typeof loadServiceCatalog !== 'function' || typeof clock !== 'function' ||
      typeof randomUUID !== 'function' || typeof randomBytes !== 'function') {
    throw new TypeError('Booking admin service dependencies are invalid.');
  }

  const query = usageOwnerQuery(db);

  const ownerStatement = query(`SELECT id, businessName, timezone FROM users
    WHERE id = ? AND (ownerId = ? OR id = ?) AND role = 'owner'`);
  const settingsStatement = query('SELECT * FROM bookingSettings WHERE ownerId = ?');
  const policiesStatement = query('SELECT * FROM bookingPolicies WHERE ownerId = ? ORDER BY serviceId');
  const policyStatement = query('SELECT * FROM bookingPolicies WHERE ownerId = ? AND serviceId = ?');
  const widgetStatement = query('SELECT * FROM widgetSettings WHERE ownerId = ?');
  const accessStatement = query('SELECT publicKey, allowedOriginsJson, createdAt FROM quoteAccessKeys WHERE ownerId = ?');
  const connectionStatement = query(`SELECT ownerId, provider, status, calendarId,
    credentialsCiphertext, credentialsIv, credentialsTag, keyVersion,
    externalUrl, expiresAtUtc, scopesJson, createdAt, updatedAt
    FROM calendarConnections WHERE ownerId = ?`);
  const profileStatement = query(
    'SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId = ?'
  );

  function requireOwner(ownerId) {
    const owner = ownerStatement.get(ownerId, ownerId, ownerId);
    if (!owner) throw error('OWNER_NOT_FOUND', 404, 'Owner account not found.');
    return owner;
  }

  function catalog(ownerId) {
    const appointment={id:'voice-appointment',serviceType:'APPOINTMENT',name:'Appointment',quoteStatus:'NOT_REQUIRED',allowedQuoteTierNames:[],issues:[]};
    const nativeCatalog=loadServiceCatalog===defaultLoadServiceCatalog;
    if(nativeCatalog){const owner=query("SELECT * FROM users WHERE id=? AND (ownerId=? OR id=?) AND role='owner'").get(ownerId,ownerId,ownerId);if(!hasQuoteDoneAccess(owner,{now:new Date(clock())}))return [appointment];}
    let loaded;
    try {
      loaded = loadServiceCatalog(ownerId);
    } catch {
      if(nativeCatalog)return [appointment];
      throw configurationError('SERVICE_CATALOG_UNAVAILABLE', 'The saved service catalog is unavailable.');
    }
    return [...normalizedCatalog(loaded),...(nativeCatalog?[appointment]:[])];
  }

  const readTransaction = db.transaction(ownerId => {
    const owner = requireOwner(ownerId);
    return {
      owner,
      settingsRow: settingsStatement.get(ownerId) || null,
      policyRows: policiesStatement.all(ownerId),
      widgetRow: widgetStatement.get(ownerId) || null,
      accessRow: accessStatement.get(ownerId) || null,
      connectionRow: connectionStatement.get(ownerId) || null,
      profileRow: profileStatement.get(ownerId) || null,
      services: catalog(ownerId)
    };
  });

  function buildConfiguration(snapshot) {
    const policies = new Map(snapshot.policyRows.map(row => [String(row.serviceId).toLowerCase(), row]));
    const globalBlockers = globalReadiness(snapshot.settingsRow, snapshot.connectionRow);
    const serviceArea = serviceAreaReadiness(snapshot.profileRow);
    const configuredServices = snapshot.services
      .filter(service => service.id)
      .map(service => serviceReadiness(
        service,
        policies.get(service.id) || null,
        globalBlockers,
        snapshot.connectionRow,
        snapshot.settingsRow
      ));
    const services = snapshot.services
      .filter(service => service.id)
      .map(service => serviceReadiness(
        service,
        policies.get(service.id) || null,
        [...globalBlockers, ...serviceArea.blockers],
        snapshot.connectionRow,
        snapshot.settingsRow
      ));
    const storedOrigins = parseJson(snapshot.accessRow?.allowedOriginsJson, []);
    const allowedOrigins = Array.isArray(storedOrigins) &&
      storedOrigins.every(value => typeof value === 'string') ? storedOrigins : [];
    const configuredReadyServices = configuredServices.filter(service => service.directBookingReady);
    const directReadyServices = services.filter(service => service.directBookingReady);
    const releaseBlockers = serviceArea.blockers;
    return {
      owner: {
        id: snapshot.owner.id,
        businessName: snapshot.owner.businessName,
        timezone: snapshot.owner.timezone
      },
      settings: persistedSettings(snapshot.settingsRow),
      calendarConnection: safeCalendarConnection(snapshot.connectionRow),
      serviceArea: serviceArea.summary,
      widget: {
        businessName: snapshot.owner.businessName,
        accentColor: snapshot.widgetRow?.accentColor || '#16A34A',
        launcherLabel: snapshot.widgetRow?.launcherLabel || 'Get an estimate',
        clickToCallNumber: snapshot.widgetRow?.clickToCallNumber || null,
        publicKey: snapshot.accessRow?.publicKey || null,
        allowedOrigins
      },
      services,
      directBooking: {
        ready: directReadyServices.length > 0,
        configurationReady: configuredReadyServices.length > 0,
        readyServiceCount: directReadyServices.length,
        globalBlockers,
        releaseBlockers
      }
    };
  }

  function getConfiguration({ ownerId }) {
    const id = normalizedOwnerId(ownerId);
    return buildConfiguration(readTransaction(id));
  }

  function getReadiness({ ownerId }) {
    const configuration = getConfiguration({ ownerId });
    return {
      directBooking: configuration.directBooking,
      services: configuration.services
    };
  }

  const updateSettingsTransaction = db.transaction((ownerId, input) => {
    requireOwner(ownerId);
    const connection = connectionStatement.get(ownerId) || null;
    const provider = connection?.status === 'connected' &&
      ['google', 'calendly'].includes(connection.provider) ? connection.provider : null;
    const calendarId = provider === 'google' && typeof connection.calendarId === 'string' &&
      connection.calendarId.trim() ? connection.calendarId.trim() : null;
    const externalUrl = provider === 'calendly' && typeof connection.externalUrl === 'string' &&
      CALENDLY_URL.test(connection.externalUrl)
      ? connection.externalUrl
      : null;
    const next = {
      timezone: input.timezone,
      provider,
      calendarId,
      externalUrl,
      weeklyAvailabilityJson: JSON.stringify(input.weeklyAvailability),
      blackoutsJson: JSON.stringify(input.blackouts),
      bookingHorizonDays: input.bookingHorizonDays,
      minimumNoticeMinutes: input.minimumNoticeMinutes,
      slotIncrementMinutes: input.slotIncrementMinutes,
      bufferBeforeMinutes: input.bufferBeforeMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes,
      directBookingEnabled: input.directBookingEnabled ? 1 : 0
    };
    const current = settingsStatement.get(ownerId);
    const comparable = current && {
      timezone: current.timezone,
      provider: current.provider || null,
      calendarId: current.calendarId || null,
      externalUrl: current.externalUrl || null,
      weeklyAvailabilityJson: current.weeklyAvailabilityJson,
      blackoutsJson: current.blackoutsJson,
      bookingHorizonDays: current.bookingHorizonDays,
      minimumNoticeMinutes: current.minimumNoticeMinutes,
      slotIncrementMinutes: current.slotIncrementMinutes,
      bufferBeforeMinutes: current.bufferBeforeMinutes,
      bufferAfterMinutes: current.bufferAfterMinutes,
      directBookingEnabled: Number(current.directBookingEnabled)
    };
    query(`UPDATE users SET timezone = ?
      WHERE id = ? AND (ownerId = ? OR id = ?) AND role = 'owner'`)
      .run(input.timezone, ownerId, ownerId, ownerId);
    if (current && same(comparable, next)) return current.revision;
    const revision = revisionFrom(randomUUID);
    const updatedAt = nowIso(clock);
    query(`INSERT INTO bookingSettings (
      ownerId, revision, timezone, provider, calendarId, externalUrl,
      weeklyAvailabilityJson, blackoutsJson, bookingHorizonDays,
      minimumNoticeMinutes, slotIncrementMinutes, bufferBeforeMinutes,
      bufferAfterMinutes, directBookingEnabled, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ownerId) DO UPDATE SET
      revision=excluded.revision, timezone=excluded.timezone, provider=excluded.provider,
      calendarId=excluded.calendarId, externalUrl=excluded.externalUrl,
      weeklyAvailabilityJson=excluded.weeklyAvailabilityJson,
      blackoutsJson=excluded.blackoutsJson, bookingHorizonDays=excluded.bookingHorizonDays,
      minimumNoticeMinutes=excluded.minimumNoticeMinutes,
      slotIncrementMinutes=excluded.slotIncrementMinutes,
      bufferBeforeMinutes=excluded.bufferBeforeMinutes,
      bufferAfterMinutes=excluded.bufferAfterMinutes,
      directBookingEnabled=excluded.directBookingEnabled, updatedAt=excluded.updatedAt`
    ).run(
      ownerId, revision, next.timezone, next.provider, next.calendarId, next.externalUrl,
      next.weeklyAvailabilityJson, next.blackoutsJson, next.bookingHorizonDays,
      next.minimumNoticeMinutes, next.slotIncrementMinutes, next.bufferBeforeMinutes,
      next.bufferAfterMinutes, next.directBookingEnabled, updatedAt
    );
    return revision;
  });

  function updateSettings({ ownerId, body }) {
    const id = normalizedOwnerId(ownerId);
    const input = validateBookingSettingsInput(body);
    updateSettingsTransaction(id, input);
    return getConfiguration({ ownerId: id });
  }

  const updatePolicyTransaction = db.transaction((ownerId, serviceId, input) => {
    requireOwner(ownerId);
    const matches = catalog(ownerId).filter(service => service.id === serviceId);
    if (matches.length !== 1) {
      throw configurationError(
        matches.length ? 'SERVICE_CATALOG_AMBIGUOUS' : 'SERVICE_NOT_FOUND',
        matches.length
          ? 'Duplicate saved service IDs require owner correction.'
          : 'Saved service not found.'
      );
    }
    if (matches[0].issues.length) {
      throw configurationError(
        'SERVICE_CATALOG_INVALID',
        'Correct the saved service before configuring booking.',
        { issues: matches[0].issues }
      );
    }
    const current = policyStatement.get(ownerId, serviceId);
    const next = {
      bookingMode: input.bookingMode,
      durationMinutes: input.durationMinutes,
      enabled: input.enabled ? 1 : 0
    };
    const comparable = current && {
      bookingMode: current.bookingMode,
      durationMinutes: current.durationMinutes,
      enabled: Number(current.enabled)
    };
    if (current && same(comparable, next)) return current.revision;
    const revision = revisionFrom(randomUUID);
    const updatedAt = nowIso(clock);
    query(`INSERT INTO bookingPolicies (
      ownerId, serviceId, revision, bookingMode, durationMinutes, enabled, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ownerId, serviceId) DO UPDATE SET
      revision=excluded.revision, bookingMode=excluded.bookingMode,
      durationMinutes=excluded.durationMinutes, enabled=excluded.enabled,
      updatedAt=excluded.updatedAt`
    ).run(
      ownerId,
      serviceId,
      revision,
      next.bookingMode,
      next.durationMinutes,
      next.enabled,
      updatedAt
    );
    return revision;
  });

  function updatePolicy({ ownerId, serviceId, body }) {
    const id = normalizedOwnerId(ownerId);
    const savedServiceId = normalizedServiceId(serviceId);
    const input = validateBookingPolicyInput(body);
    updatePolicyTransaction(id, savedServiceId, input);
    return getConfiguration({ ownerId: id });
  }

  const updateWidgetTransaction = db.transaction((ownerId, input) => {
    requireOwner(ownerId);
    const now = nowIso(clock);
    const existing = accessStatement.get(ownerId);
    const publicKey = existing?.publicKey || publicKeyFrom(randomBytes);
    query(`INSERT INTO widgetSettings (
      ownerId, accentColor, launcherLabel, clickToCallNumber, updatedAt
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(ownerId) DO UPDATE SET
      accentColor=excluded.accentColor, launcherLabel=excluded.launcherLabel,
      clickToCallNumber=excluded.clickToCallNumber, updatedAt=excluded.updatedAt`
    ).run(ownerId, input.accentColor, input.launcherLabel, input.clickToCallNumber, now);
    if (existing) {
      query('UPDATE quoteAccessKeys SET allowedOriginsJson = ? WHERE ownerId = ?')
        .run(JSON.stringify(input.allowedOrigins), ownerId);
    } else {
      query(`INSERT INTO quoteAccessKeys (
        ownerId, publicKey, allowedOriginsJson, createdAt
      ) VALUES (?, ?, ?, ?)`).run(
        ownerId,
        publicKey,
        JSON.stringify(input.allowedOrigins),
        now
      );
    }
    return publicKey;
  });

  function updateWidget({ ownerId, body }) {
    const id = normalizedOwnerId(ownerId);
    const input = validateWidgetSettingsInput(body, { allowInsecureLoopback });
    updateWidgetTransaction(id, input);
    return getConfiguration({ ownerId: id });
  }

  return {
    getConfiguration,
    getReadiness,
    updateSettings,
    updatePolicy,
    updateWidget
  };
}
