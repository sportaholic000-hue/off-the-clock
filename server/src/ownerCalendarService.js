import {addLocalDays, isValidIanaTimeZone, localDateForInstant, localDateTimeCandidates, parseLocalDate} from './calendarTime.js';

function invalid(message, statusCode = 400, code = 'INVALID_CALENDAR_REQUEST') {
  return Object.assign(new Error(message), {statusCode, code});
}

function json(value, fallback) {
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
}

function contact(value) {
  const source = json(value, {});
  return Object.fromEntries(['name', 'email', 'phone'].map(key => [key, typeof source[key] === 'string' ? source[key] : null]));
}

function location(value) {
  const source = json(value, {});
  return Object.fromEntries(['addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'country']
    .map(key => [key, typeof source[key] === 'string' ? source[key] : null]));
}

function sourceLink(row) {
  return ['quote', 'lead'].includes(row.sourceType) && typeof row.sourceId === 'string'
    ? {type: row.sourceType, id: row.sourceId} : null;
}

export function createOwnerCalendarService({ownerQuery, calendar, clock = () => new Date()}) {
  if (typeof ownerQuery !== 'function') throw new TypeError('Calendar reads require tenant-scoped queries.');

  function context(ownerId) {
    const row = ownerQuery(`SELECT u.timezone AS ownerTimezone, s.timezone, c.provider,
      c.calendarId, c.status, c.externalUrl FROM users u
      LEFT JOIN bookingSettings s ON s.ownerId = u.id
      LEFT JOIN calendarConnections c ON c.ownerId = u.id
      WHERE u.id = ? AND (u.ownerId = ? OR u.id = ?) AND u.role = 'owner'`)
      .get(ownerId, ownerId, ownerId);
    if (!row) throw invalid('Owner account not found.', 404, 'OWNER_NOT_FOUND');
    const timezone = isValidIanaTimeZone(row.timezone) ? row.timezone : row.ownerTimezone;
    if (!isValidIanaTimeZone(timezone)) throw invalid('Set the business timezone before opening the calendar.', 409, 'TIMEZONE_REQUIRED');
    return {timezone, connection: row.provider ? {
      provider: row.provider, status: row.status, calendarId: row.calendarId, externalUrl: row.externalUrl
    } : null};
  }

  function range(query, timezone) {
    if (Object.keys(query).some(key => !['fromDate', 'days'].includes(key))) throw invalid('Calendar filters contain unsupported fields.');
    const fromDate = query.fromDate ?? localDateForInstant(clock(), timezone);
    const daysText = query.days ?? '7';
    if (typeof daysText !== 'string' || !/^(?:[1-9]|[12][0-9]|3[01])$/.test(daysText)) throw invalid('Choose a calendar range of 1 to 31 days.');
    try { parseLocalDate(fromDate); } catch { throw invalid('Choose a valid calendar start date.'); }
    const endDate = addLocalDays(fromDate, Number(daysText));
    // A date boundary can be ambiguous or absent in some timezones. Do not guess it.
    const starts = localDateTimeCandidates(fromDate, '00:00', timezone);
    const ends = localDateTimeCandidates(endDate, '00:00', timezone);
    if (starts.length !== 1 || ends.length !== 1) throw invalid('Choose a range with unambiguous local date boundaries.');
    return {fromDate, endDate, days: Number(daysText), startAtUtc: starts[0], endAtUtc: ends[0]};
  }

  function schedule({ownerId, query = {}}) {
    const {timezone, connection} = context(ownerId), selected = range(query, timezone);
    const appointments = ownerQuery(`SELECT a.id, a.status, a.serviceType, a.bookingMode,
      a.startAtUtc, a.endAtUtc, a.timezone, a.tierChosen, a.customerJson, a.locationJson,
      a.createdAt, a.updatedAt, i.sourceType, i.sourceId
      FROM appointments a LEFT JOIN bookingIntents i ON i.id = a.bookingIntentId AND i.ownerId = a.ownerId
      WHERE a.ownerId = ? AND a.startAtUtc < ? AND a.endAtUtc > ?
      ORDER BY a.startAtUtc, a.id`).all(ownerId, selected.endAtUtc, selected.startAtUtc)
      .map(row => ({
        id: row.id, status: row.status, serviceType: row.serviceType, bookingMode: row.bookingMode,
        startAtUtc: row.startAtUtc, endAtUtc: row.endAtUtc, timezone: row.timezone,
        tierChosen: row.tierChosen, customer: contact(row.customerJson), location: location(row.locationJson),
        source: sourceLink(row), createdAt: row.createdAt, updatedAt: row.updatedAt
      }));
    const requests = ownerQuery(`SELECT p.id, p.status, p.preferredWindowsJson, p.customerJson,
      p.locationJson, p.note, p.createdAt, i.sourceType, i.sourceId
      FROM bookingPreferences p JOIN bookingIntents i ON i.id = p.intentId AND i.ownerId = p.ownerId
      WHERE p.ownerId = ? ORDER BY p.createdAt DESC, p.id`).all(ownerId)
      .map(row => ({
        id: row.id, status: row.status, preferredWindows: json(row.preferredWindowsJson, []),
        customer: contact(row.customerJson), location: location(row.locationJson), note: row.note,
        source: sourceLink(row), createdAt: row.createdAt
      }))
      .filter(row => row.status === 'REQUESTED' || row.preferredWindows.some(window => window.date >= selected.fromDate && window.date < selected.endDate));
    return {timezone, connection, range: selected, appointments, requests, checkedAt: clock().toISOString()};
  }

  async function busy({ownerId, query = {}}) {
    const {timezone, connection} = context(ownerId), selected = range(query, timezone);
    if (connection?.provider !== 'google' || connection.status !== 'connected' || !connection.calendarId) {
      throw invalid('Connect Google Calendar to view its busy times.', 409, 'CALENDAR_NOT_CONNECTED');
    }
    if (!calendar) throw invalid('Calendar access is unavailable in this environment.', 503, 'CALENDAR_UNAVAILABLE');
    const intervals = await calendar.listBusy({ownerId, calendarId: connection.calendarId,
      timeMinUtc: selected.startAtUtc, timeMaxUtc: selected.endAtUtc});
    const current = context(ownerId);
    if (current.connection?.calendarId !== connection.calendarId || current.connection?.provider !== 'google' ||
        current.connection?.status !== 'connected' || current.timezone !== timezone) {
      throw invalid('Calendar settings changed. Refresh the calendar.', 409, 'CALENDAR_CHANGED');
    }
    return {timezone, range: selected, intervals, checkedAt: clock().toISOString()};
  }

  return {schedule, busy};
}
