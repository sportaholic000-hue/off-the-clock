// New grants need only event access on the owner's calendar and busy intervals.
export const GOOGLE_CALENDAR_BOOKING_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.freebusy'
]);

export const GOOGLE_CALENDAR_SCOPE_MESSAGE =
  'Reconnect Google Calendar to allow availability checks and booking updates.';

const FULL_SCOPE = 'https://www.googleapis.com/auth/calendar';
// Accept previously granted equivalent or broader scopes without reconnecting.
const EVENT_WRITE_SCOPES = new Set([
  GOOGLE_CALENDAR_BOOKING_SCOPES[0],
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.app.created'
]);
const BUSY_SCOPES = new Set([
  GOOGLE_CALENDAR_BOOKING_SCOPES[1],
  'https://www.googleapis.com/auth/calendar.events.freebusy',
  'https://www.googleapis.com/auth/calendar.readonly'
]);

export function calendarScopesSupportBooking(scopes) {
  if (!Array.isArray(scopes) || scopes.some(scope => typeof scope !== 'string')) return false;
  const granted = new Set(scopes.map(scope => scope.trim()).filter(Boolean));
  if (granted.has(FULL_SCOPE)) return true;
  return [...EVENT_WRITE_SCOPES].some(scope => granted.has(scope)) &&
    [...BUSY_SCOPES].some(scope => granted.has(scope));
}
