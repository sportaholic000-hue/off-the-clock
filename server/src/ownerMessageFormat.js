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
  TRANSFER_OUTSIDE_HOURS: 'It was outside your transfer hours.',
  TRANSFER_DESTINATION_UNAVAILABLE: 'No separate transfer number is saved.',
  TRANSFER_HOURS_UNCONFIGURED: 'Live transfer hours are not set up.',
  TRANSFER_TIMEZONE_INVALID: 'Live transfer could not check your hours.',
  TRANSFER_NOT_CONFIRMED: 'The transfer did not connect.',
  TRANSFER_PROVIDER_UNAVAILABLE: 'The transfer did not go through.',
  active_leak: 'Active leak',
  flooding: 'Flooding',
  safety: 'Safety issue',
  complaint: 'Complaint'
});

// The receptionist's reason for a transfer (transferCall's reason), in plain words.
const TRANSFER_REQUEST_REASONS = Object.freeze({
  caller_requested: 'The caller asked to speak with you.',
  urgent: 'The receptionist marked the call urgent.',
  escalation: 'The receptionist escalated the call to you.'
});
const CALLBACK_ASKED = 'The caller asked for a callback.';
const TRANSFER_NOT_PLACED = 'The transfer was not placed.';
const LOWER_CODE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

// Plain words for a saved callback request; a stored code is never returned.
// transfer: why a transfer was not placed (callbacks saved after one).
// source: how the request came in (the transfer line, or the caller asking).
// reason: the receptionist's reason for the transfer.
// Requests saved before the transfer outcome was kept say only that the
// transfer was not placed.
export function callbackRequestWords(callback) {
  let history = callback?.history;
  if (!Array.isArray(history)) { try { history = JSON.parse(callback?.historyJson || '[]'); } catch { history = []; } }
  if (!Array.isArray(history)) history = [];
  const transfer = callback?.source === 'transfer_failed'
    ? plainReason(history[0]?.transferOutcome) || TRANSFER_NOT_PLACED
    : null;
  const source = transfer || (callback?.source === 'caller_requested' ? CALLBACK_ASKED : null);
  const raw = typeof callback?.reason === 'string' ? callback.reason.trim() : '';
  const reason = Object.hasOwn(TRANSFER_REQUEST_REASONS, raw) ? TRANSFER_REQUEST_REASONS[raw]
    : !raw || LOWER_CODE.test(raw) ? null : plainReason(raw);
  return { transfer, source, reason };
}

// Each owner alert's title: the first line and the email subject after
// "Off The Clock: ". Owner screens name an alert by the same title.
export const OWNER_ALERT_TITLES = Object.freeze({
  'booking.confirmed': 'Booking confirmed',
  'voice.caller_throttled': 'Repeated caller \u2014 review requested',
  'lead.created': 'New lead',
  'lead.contact_updated': 'Callback contact updated',
  'callback.requested': 'Callback requested',
  'callback.updated': 'Callback notes corrected',
  'quote.created': 'New quote',
  'quote.requested': 'Quote review requested',
  'booking.preference_requested': 'Preferred-time request (not booked)',
  'appointment.booked': 'Booking confirmed',
  'appointment.changed': 'Booking changed',
  'voice.settings_invalid': 'Receptionist setting needs correction',
  'voice.quoting_unavailable': 'Quoting is paused. Answering remains available.',
  'voice.urgent_flagged': 'Urgent caller request',
  'call.completed': 'Call ended'
});
export const BOOKING_CHANGE_NOT_APPLIED = 'Booking change not applied';
// changeStatus: the stored status of an appointment change ('REJECTED' when not applied).
export function ownerAlertTitle({ eventType, changeStatus } = {}) {
  if (eventType === 'appointment.changed' && changeStatus === 'REJECTED') return BOOKING_CHANGE_NOT_APPLIED;
  return Object.hasOwn(OWNER_ALERT_TITLES, eventType) ? OWNER_ALERT_TITLES[eventType] : 'Owner alert';
}

// The stored status of an appointment change, so its title matches its email.
export const OWNER_ALERT_CHANGE_STATUS="CASE WHEN eventType='appointment.changed' THEN (SELECT json_extract(o.payloadJson,'$.status') FROM outboxEvents o WHERE o.ownerId=ownerAlerts.ownerId AND o.id=ownerAlerts.aggregateId AND o.eventType='appointment.changed' AND json_valid(o.payloadJson)) END AS changeStatus";
// A bounced alert names the address the provider tried; it counts as unresolved.
export const OWNER_ALERT_SENT_TO="CASE WHEN status='BOUNCED' AND json_valid(messageJson) THEN json_extract(messageJson,'$.to') END AS sentTo";
export const OWNER_ALERT_RESOLVED="('ACCEPTED','DELIVERED')";
// Owner screens name each alert by its email title; the stored status used for it is not sent.
export function withOwnerAlertTitles(rows){return rows.map(({changeStatus,...row})=>({...row,title:ownerAlertTitle({eventType:row.eventType,changeStatus})}));}

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
