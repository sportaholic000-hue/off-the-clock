// Plain-language formatting for owner emails and notices: times in the
// business's own time zone, labeled lines, and no raw system codes.
import {CALL_FAILURE_REASONS} from './callFailureReasons.js';

export function ownerTimeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return 'UTC';
  try { new Intl.DateTimeFormat('en-US', {timeZone: value}); return value; } catch { return 'UTC'; }
}

const instant = value => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

// ICU may use thin or narrow no-break spaces; plain-text email gets ordinary ones.
const plainSpaces = text => text.replace(/[\u00a0\u2009\u202f]/g, ' ');
const DATE_TIME = {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'};
const DATE_ONLY = {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'};

// "Wed, Oct 7, 2026, 9:00 AM ADT"
export function formatOwnerDateTime(value, timeZone) {
  const date = instant(value);
  if (!date) return value == null ? null : String(value);
  return plainSpaces(new Intl.DateTimeFormat('en-US', {...DATE_TIME, timeZone: ownerTimeZone(timeZone)}).format(date));
}

// "Mon, Nov 30, 2026" for an instant, read in the business's time zone.
export function formatOwnerDate(value, timeZone) {
  const date = instant(value);
  if (!date) return value == null ? null : String(value);
  return plainSpaces(new Intl.DateTimeFormat('en-US', {...DATE_ONLY, timeZone: ownerTimeZone(timeZone)}).format(date));
}

// A calendar date that is already local (YYYY-MM-DD), so no time-zone shift applies.
export function formatLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value == null ? null : String(value);
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime())) return value;
  return plainSpaces(new Intl.DateTimeFormat('en-US', {...DATE_ONLY, timeZone: 'UTC'}).format(date));
}

// "Wed, Oct 7, 2026, 9:00 – 9:45 AM ADT"
export function formatOwnerTimeRange(start, end, timeZone) {
  const from = instant(start), to = instant(end);
  if (!from) return formatOwnerDateTime(start, timeZone);
  if (!to || to < from) return formatOwnerDateTime(from, timeZone);
  return plainSpaces(new Intl.DateTimeFormat('en-US', {...DATE_TIME, timeZone: ownerTimeZone(timeZone)}).formatRange(from, to));
}

// "24 hours", "1 hour", "30 minutes"
export function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const minutes = Math.round(milliseconds / 60000);
  if (minutes >= 2880 && minutes % 1440 === 0) return (minutes / 1440) + ' days';
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours + (hours === 1 ? ' hour' : ' hours');
  }
  return minutes + (minutes === 1 ? ' minute' : ' minutes');
}

const SYSTEM_CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$|^[A-Z]{3,}$/;
export const isSystemCode = value => typeof value === 'string' && SYSTEM_CODE.test(value.trim());

const REASONS = Object.freeze({
  ...CALL_FAILURE_REASONS,
  FALLBACK_REQUEST_CAPTURED: 'The caller left a request on the backup line.',
  TRANSFER_OUTSIDE_HOURS: 'The caller asked for you outside your transfer hours.',
  TRANSFER_DESTINATION_UNAVAILABLE: 'The caller asked for you, but no separate transfer number is saved.',
  TRANSFER_HOURS_UNCONFIGURED: 'Live transfer hours are not set up.',
  TRANSFER_TIMEZONE_INVALID: 'Live transfer could not check your hours.',
  TRANSFER_NOT_CONFIRMED: 'The caller did not confirm the transfer.',
  TRANSFER_PROVIDER_UNAVAILABLE: 'The transfer could not be placed.',
  active_leak: 'Active leak',
  flooding: 'Flooding',
  safety: 'Safety issue',
  complaint: 'Complaint'
});

// A reason the caller or receptionist wrote stays as written; a system code
// becomes plain words, and an unknown code is never printed.
export function plainReason(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (Object.hasOwn(REASONS, text)) return REASONS[text];
  return isSystemCode(text) ? null : text;
}

const CALL_RESULTS = Object.freeze({
  COMPLETED: 'Answered by the receptionist',
  RECOVERED: 'Answered by the receptionist',
  FALLBACK: 'Taken as a message on the backup line',
  AI_FALLBACK: 'Taken as a message on the backup line',
  HUMAN_ROUTING: 'Rang through to you',
  OPERATOR_OFF: 'Rang through to you (answering was off)',
  TRANSFER_CONNECTED: 'Transferred to you',
  SPAM_FILTERED: 'Marked as spam',
  FAILED: 'Ended early'
});
export function plainCallResult({status, outcome} = {}) {
  return CALL_RESULTS[outcome] || CALL_RESULTS[status] || null;
}

const QUOTE_STATUSES = Object.freeze({
  INSTANT: 'Priced instantly',
  PARTIAL: 'Partly priced; the rest needs your review'
});
export const plainQuoteStatus = status => QUOTE_STATUSES[status] || null;

const APPOINTMENT_STATUSES = Object.freeze({
  CONFIRMED: 'Confirmed',
  BOOKED: 'Confirmed',
  CANCELLED: 'Cancelled',
  CANCELED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
  APPLIED: 'Updated',
  HELD: 'Held for the caller',
  PENDING: 'Waiting for calendar confirmation',
  PENDING_CONFIRMATION: 'Waiting for calendar confirmation',
  PROVIDER_FAILED: 'Calendar update failed',
  EXPIRED: 'Expired'
});
export const plainAppointmentStatus = status => APPOINTMENT_STATUSES[status] || null;

const TIMES_OF_DAY = Object.freeze({morning: 'morning', afternoon: 'afternoon', evening: 'evening'});
export function formatPreferredWindow(window) {
  if (!window || typeof window !== 'object') return null;
  const date = formatLocalDate(window.date), part = TIMES_OF_DAY[window.timeOfDay];
  if (!date) return null;
  return part ? date + ', ' + part : date;
}

// "FENCE_INSTALL" -> "Fence install"; plain names pass through.
export function serviceName(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (!isSystemCode(text)) return text;
  const words = text.toLowerCase().split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ADDRESS_FIELDS = ['addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'country'];
export function formatAddress(location) {
  if (!location || typeof location !== 'object') return null;
  const parts = ADDRESS_FIELDS.map(key => location[key]).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim());
  return parts.length ? parts.join(', ') : null;
}

export function labeled(label, value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? label + ': ' + text : null;
}
