import {usageOwnerQuery} from './billingUsagePolicy.js';
import { isValidIanaTimeZone } from './calendarTime.js';
import { isServiceAreaConfigured, serviceAreaFromKnowledgeBase } from './serviceArea.js';

const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const E164 = /^\+[1-9]\d{7,14}$/;

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function jsonRecord(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function jsonArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveBookingCapability({ settings, policy, serviceArea } = {}) {
  if (policy && Number(policy.enabled) === 0) return 'NONE';
  if (settings?.provider === 'calendly') {
    return typeof settings.externalUrl === 'string' && /^https:\/\//i.test(settings.externalUrl)
      ? 'EXTERNAL_HANDOFF'
      : 'PREFERRED_TIME_ONLY';
  }
  const duration = policy?.bookingMode === 'site_visit_first' && !integer(policy.durationMinutes, 1, 10080)
    ? 45
    : policy?.durationMinutes;
  const direct = isServiceAreaConfigured(serviceArea) &&
    Number(settings?.directBookingEnabled) === 1 &&
    Number(policy?.enabled) === 1 &&
    settings.provider === 'google' &&
    typeof settings.calendarId === 'string' && Boolean(settings.calendarId.trim()) &&
    isValidIanaTimeZone(settings.timezone) &&
    ['site_visit_first', 'book_job'].includes(policy.bookingMode) &&
    integer(duration, 1, 10080) &&
    integer(settings.bookingHorizonDays, 1, 366) &&
    integer(settings.minimumNoticeMinutes, 0, 525600) &&
    integer(settings.slotIncrementMinutes, 1, 1440) &&
    integer(settings.bufferBeforeMinutes, 0, 1440) &&
    integer(settings.bufferAfterMinutes, 0, 1440) &&
    jsonRecord(settings.weeklyAvailabilityJson) &&
    jsonArray(settings.blackoutsJson) &&
    typeof settings.revision === 'string' && Boolean(settings.revision) &&
    typeof policy.revision === 'string' && Boolean(policy.revision);
  return direct ? 'DIRECT' : 'PREFERRED_TIME_ONLY';
}

export function loadBookingCapability(database, ownerId, serviceId) {
  const settings = usageOwnerQuery(database)(
    'SELECT * FROM bookingSettings WHERE ownerId = ?'
  ).get(ownerId);
  const policy = usageOwnerQuery(database)(
    'SELECT * FROM bookingPolicies WHERE ownerId = ? AND serviceId = ?'
  ).get(ownerId, serviceId);
  const profile = usageOwnerQuery(database)(
    'SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId = ?'
  ).get(ownerId);
  return resolveBookingCapability({
    settings, policy, serviceArea: serviceAreaFromKnowledgeBase(profile?.knowledgeBaseJson)
  });
}

export function sanitizePublicBranding(value = {}) {
  const businessName = typeof value.businessName === 'string' && value.businessName.trim()
    ? value.businessName.trim().slice(0, 120)
    : 'Service business';
  const accentColor = HEX_COLOR.test(String(value.accentColor || ''))
    ? String(value.accentColor).toUpperCase()
    : '#16A34A';
  const launcher = typeof value.launcherLabel === 'string' ? value.launcherLabel.trim() : '';
  const launcherLabel = launcher ? launcher.slice(0, 40) : 'Get an estimate';
  const candidateNumber = value.clickToCallNumber || value.twilioNumber;
  const clickToCallNumber = E164.test(String(candidateNumber || '')) ? String(candidateNumber) : null;
  return { businessName, accentColor, launcherLabel, clickToCallNumber };
}

export function loadPublicBranding(database, ownerId) {
  const row = usageOwnerQuery(database)(`
    SELECT u.businessName, w.accentColor, w.launcherLabel, w.clickToCallNumber,
      p.twilioNumber
    FROM users AS u
    LEFT JOIN widgetSettings AS w ON w.ownerId = u.id
    LEFT JOIN businessProfiles AS p ON p.ownerId = u.id
    WHERE u.id = ? AND u.role = 'owner'
  `).get(ownerId);
  return sanitizePublicBranding(row);
}
