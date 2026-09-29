const CALENDAR_API_BASE_URL = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_EVENT_ID = /^[0-9a-v]{5,1024}$/;
const BEARER_TOKEN = /^[A-Za-z0-9._~+\/-]+=*$/;
const UTC_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;
const RFC3339_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export class GoogleCalendarAdapterError extends Error {
  constructor(code, message, {
    statusCode = 503,
    retryable = false,
    ambiguous = false,
    providerStatus
  } = {}) {
    super(message);
    this.name = 'GoogleCalendarAdapterError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.ambiguous = ambiguous;
    if (Number.isInteger(providerStatus)) this.providerStatus = providerStatus;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      ambiguous: this.ambiguous,
      ...(this.providerStatus === undefined ? {} : { providerStatus: this.providerStatus })
    };
  }
}

function adapterError(code, message, options) {
  return new GoogleCalendarAdapterError(code, message, options);
}

function invalidRequest() {
  return adapterError('INVALID_CALENDAR_REQUEST', 'The calendar request is invalid.', { statusCode: 400 });
}

function connectionUnavailable() {
  return adapterError('CALENDAR_NOT_CONNECTED', 'The calendar connection is unavailable.', { statusCode: 409 });
}

function authorizationUnavailable(code = 'CALENDAR_AUTHORIZATION_UNAVAILABLE') {
  return adapterError(code, 'The calendar authorization is unavailable.', {
    statusCode: 503,
    retryable: code !== 'CALENDAR_REAUTHORIZATION_REQUIRED'
  });
}

function invalidResponse({ ambiguous = false } = {}) {
  return adapterError('CALENDAR_INVALID_RESPONSE', 'Google Calendar returned an invalid response.', {
    statusCode: 502,
    retryable: true,
    ambiguous
  });
}

function providerUnavailable({ ambiguous = false, providerStatus } = {}) {
  return adapterError('CALENDAR_PROVIDER_UNAVAILABLE', 'Google Calendar is temporarily unavailable.', {
    statusCode: 503,
    retryable: true,
    ambiguous,
    providerStatus
  });
}

function rejectedByProvider(providerStatus, { ambiguous = false } = {}) {
  const rateLimited = providerStatus === 429;
  const needsReconciliation = providerStatus === 409 && ambiguous;
  return adapterError(
    needsReconciliation ? 'CALENDAR_WRITE_REQUIRES_RECONCILIATION' :
      rateLimited ? 'CALENDAR_RATE_LIMITED' : 'CALENDAR_REQUEST_REJECTED',
    needsReconciliation ? 'The calendar write requires reconciliation.' :
      rateLimited ? 'Google Calendar is temporarily unavailable.' : 'Google Calendar rejected the request.',
    {
      statusCode: rateLimited ? 503 : 502,
      retryable: rateLimited || needsReconciliation,
      ambiguous,
      providerStatus
    }
  );
}

function utcInstant(value) {
  if (typeof value !== 'string') throw invalidRequest();
  const match = UTC_INSTANT.exec(value);
  if (!match) throw invalidRequest();
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = ''] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.slice(0, 3).padEnd(3, '0'));
  const result = new Date(0);
  result.setUTCFullYear(year, month - 1, day);
  result.setUTCHours(hour, minute, second, millisecond);
  if (
    result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day || result.getUTCHours() !== hour ||
    result.getUTCMinutes() !== minute || result.getUTCSeconds() !== second ||
    result.getUTCMilliseconds() !== millisecond
  ) throw invalidRequest();
  return result;
}

function providerInstant(value, { ambiguous = false } = {}) {
  if (typeof value !== 'string' || !RFC3339_INSTANT.test(value)) throw invalidResponse({ ambiguous });
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw invalidResponse({ ambiguous });
  return result;
}

function orderedUtcBounds(start, end) {
  const startInstant = utcInstant(start);
  const endInstant = utcInstant(end);
  if (startInstant >= endInstant) throw invalidRequest();
  return {
    start: startInstant.toISOString(),
    end: endInstant.toISOString(),
    startMs: startInstant.getTime(),
    endMs: endInstant.getTime()
  };
}

function nowFrom(clock) {
  const value = clock();
  const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(result.getTime())) {
    throw new TypeError('Google Calendar adapter clock must return a valid instant.');
  }
  return result;
}

function safeIdentifier(value, maximumLength = 1024) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength &&
    value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

function baseRequest(input) {
  if (!record(input) || !safeIdentifier(input.ownerId, 256) || !safeIdentifier(input.calendarId) ||
      (input.provider !== undefined && input.provider !== 'google')) throw invalidRequest();
  return { ownerId: input.ownerId, calendarId: input.calendarId };
}

function parseScopes(connection) {
  if (Array.isArray(connection.scopes)) {
    return connection.scopes.filter(scope => typeof scope === 'string' && scope.trim()).map(scope => scope.trim());
  }
  if (typeof connection.scopesJson !== 'string') return [];
  try {
    const scopes = JSON.parse(connection.scopesJson);
    return Array.isArray(scopes)
      ? scopes.filter(scope => typeof scope === 'string' && scope.trim()).map(scope => scope.trim())
      : [];
  } catch {
    return [];
  }
}

function credentialToken(value) {
  return typeof value === 'string' && value.length <= 8192 && BEARER_TOKEN.test(value) ? value : null;
}

function normalizeConnection(connection, ownerId, calendarId) {
  if (!record(connection) || connection.provider !== 'google' || connection.status !== 'connected') {
    throw connectionUnavailable();
  }
  if (connection.ownerId !== ownerId) throw connectionUnavailable();
  if (connection.calendarId !== calendarId) {
    throw adapterError('CALENDAR_SCOPE_MISMATCH', 'The calendar connection is unavailable.', { statusCode: 403 });
  }
  if (!record(connection.credentials)) throw authorizationUnavailable();
  const accessToken = credentialToken(connection.credentials.accessToken);
  const refreshToken = credentialToken(connection.credentials.refreshToken);
  if (!accessToken && !refreshToken) throw authorizationUnavailable();
  if (connection.credentials.tokenType !== undefined &&
      String(connection.credentials.tokenType).toLowerCase() !== 'bearer') throw authorizationUnavailable();
  let expiresAtMs = null;
  if (connection.expiresAtUtc !== null && connection.expiresAtUtc !== undefined && connection.expiresAtUtc !== '') {
    try {
      expiresAtMs = utcInstant(connection.expiresAtUtc).getTime();
    } catch {
      throw authorizationUnavailable();
    }
  }
  return {
    calendarId,
    accessToken,
    refreshToken,
    expiresAtMs,
    scopes: parseScopes(connection)
  };
}

async function defaultLoadConnection(ownerId) {
  const { readGoogleCalendarConnection } = await import('./calendarCredentials.js');
  return readGoogleCalendarConnection(ownerId);
}

async function defaultSaveConnection(ownerId, tokens) {
  const { saveGoogleCalendarConnection } = await import('./calendarCredentials.js');
  return saveGoogleCalendarConnection(ownerId, tokens);
}

function resolveCredentialRepository({ credentialRepository, loadConnection, saveConnection }) {
  if (!credentialRepository) {
    const load = loadConnection || defaultLoadConnection;
    const save = saveConnection || defaultSaveConnection;
    if (typeof load !== 'function' || typeof save !== 'function') {
      throw new TypeError('Google Calendar adapter requires credential load and save functions.');
    }
    return { load, save };
  }
  const load = credentialRepository.loadGoogleCalendarConnection || credentialRepository.load;
  const save = credentialRepository.saveGoogleCalendarConnection ||
    credentialRepository.saveRefreshed || credentialRepository.save;
  if (typeof load !== 'function' || typeof save !== 'function') {
    throw new TypeError('Google Calendar credential repository must provide load and save methods.');
  }
  return {
    load: ownerId => load.call(credentialRepository, ownerId),
    save: (ownerId, tokens) => save.call(credentialRepository, ownerId, tokens)
  };
}

function discardResponse(response) {
  if (response && typeof response.arrayBuffer === 'function') return response.arrayBuffer().catch(() => undefined);
  if (response && typeof response.text === 'function') return response.text().catch(() => undefined);
  return Promise.resolve();
}

function responseStatus(response, { ambiguous = false } = {}) {
  if (!record(response) || !Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
    throw invalidResponse({ ambiguous });
  }
  return response.status;
}

async function responseJson(response, { ambiguous = false } = {}) {
  if (typeof response.json !== 'function') throw invalidResponse({ ambiguous });
  let value;
  try {
    value = await response.json();
  } catch {
    throw invalidResponse({ ambiguous });
  }
  if (!record(value)) throw invalidResponse({ ambiguous });
  return value;
}

function normalizeEvent(value, expectedEventId, { ambiguous = false } = {}) {
  if (!record(value) || value.id !== expectedEventId) throw invalidResponse({ ambiguous });
  const status = value.status === 'confirmed' ? 'CONFIRMED' :
    value.status === 'tentative' ? 'PENDING_CONFIRMATION' :
      value.status === 'cancelled' ? 'CANCELLED' : null;
  if (!status) throw invalidResponse({ ambiguous });
  if (status === 'CANCELLED') return { status, eventId: expectedEventId };
  if (!record(value.start) || !record(value.end)) throw invalidResponse({ ambiguous });
  const start = providerInstant(value.start.dateTime, { ambiguous });
  const end = providerInstant(value.end.dateTime, { ambiguous });
  if (start >= end) throw invalidResponse({ ambiguous });
  return {
    status,
    eventId: expectedEventId,
    startAtUtc: start.toISOString(),
    endAtUtc: end.toISOString()
  };
}

function cleanText(value, maximumLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, maximumLength);
}

function eventLocation(location) {
  if (!record(location)) return '';
  return [location.addressLine1, location.addressLine2, location.city, location.region,
    location.postalCode, location.country]
    .map(value => cleanText(value, 256)).filter(Boolean).join(', ').slice(0, 1024);
}

function eventDescription(request) {
  const customer = record(request.customer) ? request.customer : {};
  const lines = [
    `Appointment ID: ${cleanText(request.appointmentId, 256)}`,
    `Customer: ${cleanText(customer.name, 256)}`,
    customer.email ? `Email: ${cleanText(customer.email, 320)}` : '',
    customer.phone ? `Phone: ${cleanText(customer.phone, 64)}` : '',
    request.sourceType && request.sourceId
      ? `Source: ${cleanText(request.sourceType, 64)} ${cleanText(request.sourceId, 256)}` : '',
    request.tierName ? `Quote option: ${cleanText(request.tierName, 256)}` : ''
  ];
  return lines.filter(line => line && !line.endsWith(': ')).join('\n').slice(0, 8192);
}

function createEventPayload(request, bounds) {
  if (!GOOGLE_EVENT_ID.test(request.eventId) || !safeIdentifier(request.appointmentId, 256) ||
      !['site_visit_first', 'book_job'].includes(request.bookingMode)) throw invalidRequest();
  if (request.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: request.timezone }).format(new Date(0));
    } catch {
      throw invalidRequest();
    }
  }
  const customerName = cleanText(request.customer?.name, 256);
  const label = request.bookingMode === 'book_job' ? 'Booked job' : 'Site visit';
  return {
    id: request.eventId,
    summary: customerName ? `${label} - ${customerName}` : label,
    description: eventDescription(request),
    location: eventLocation(request.location),
    start: { dateTime: bounds.start, timeZone: 'UTC' },
    end: { dateTime: bounds.end, timeZone: 'UTC' },
    transparency: 'opaque',
    visibility: 'private',
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    extendedProperties: {
      private: { appointmentId: request.appointmentId, bookingMode: request.bookingMode }
    }
  };
}

export function createGoogleCalendarAdapter({
  fetch: fetchImpl = globalThis.fetch,
  clock = () => new Date(),
  credentialRepository,
  loadConnection,
  saveConnection,
  clientId = process.env.GOOGLE_CLIENT_ID,
  clientSecret = process.env.GOOGLE_CLIENT_SECRET,
  apiBaseUrl = CALENDAR_API_BASE_URL,
  tokenUrl = GOOGLE_TOKEN_URL,
  requestTimeoutMs = 10_000,
  refreshLeewayMs = 60_000
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof clock !== 'function') {
    throw new TypeError('Google Calendar adapter requires fetch and clock functions.');
  }
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 ||
      !Number.isInteger(refreshLeewayMs) || refreshLeewayMs < 0) {
    throw new TypeError('Google Calendar adapter timeout settings are invalid.');
  }
  const credentials = resolveCredentialRepository({ credentialRepository, loadConnection, saveConnection });
  const refreshes = new Map();

  async function timedFetch(url, options, { ambiguous = false } = {}) {
    const controller = new AbortController();
    let didTimeOut = false;
    let released = false;
    let timeout;
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        didTimeOut = true;
        controller.abort();
        reject(new Error('Google Calendar request deadline exceeded.'));
      }, requestTimeoutMs);
    });
    try {
      const response = await Promise.race([
        Promise.resolve().then(() => fetchImpl(url, { ...options, signal: controller.signal })),
        deadline
      ]);
      return {
        response,
        withDeadline: promise => Promise.race([promise, deadline]),
        timedOut: () => didTimeOut,
        release() {
          if (!released) {
            released = true;
            clearTimeout(timeout);
          }
        }
      };
    } catch {
      clearTimeout(timeout);
      throw providerUnavailable({ ambiguous });
    }
  }

  async function loadOwnerConnection(ownerId, calendarId) {
    let connection;
    try {
      connection = await credentials.load(ownerId);
    } catch {
      throw authorizationUnavailable();
    }
    return normalizeConnection(connection, ownerId, calendarId);
  }

  async function performRefresh(ownerId, connection) {
    if (!connection.refreshToken) throw authorizationUnavailable('CALENDAR_REAUTHORIZATION_REQUIRED');
    if (!safeIdentifier(String(clientId || ''), 2048) || !safeIdentifier(String(clientSecret || ''), 4096)) {
      throw authorizationUnavailable('CALENDAR_AUTH_CONFIGURATION_ERROR');
    }
    const body = new URLSearchParams({
      client_id: String(clientId),
      client_secret: String(clientSecret),
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken
    });
    const request = await timedFetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
    let payload;
    try {
      const status = responseStatus(request.response);
      if (status < 200 || status >= 300) {
        await request.withDeadline(discardResponse(request.response));
        if (status === 400 || status === 401) {
          throw authorizationUnavailable('CALENDAR_REAUTHORIZATION_REQUIRED');
        }
        throw providerUnavailable({ providerStatus: status });
      }
      payload = await request.withDeadline(responseJson(request.response));
    } catch (error) {
      if (request.timedOut()) throw providerUnavailable();
      throw error;
    } finally {
      request.release();
    }
    const accessToken = credentialToken(payload.access_token);
    const rotatedRefreshToken = payload.refresh_token === undefined
      ? connection.refreshToken : credentialToken(payload.refresh_token);
    const expiresIn = Number(payload.expires_in);
    if (!accessToken || !rotatedRefreshToken ||
        (payload.token_type !== undefined && String(payload.token_type).toLowerCase() !== 'bearer') ||
        !Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 31_536_000) {
      throw authorizationUnavailable();
    }
    const scope = typeof payload.scope === 'string' ? payload.scope : connection.scopes.join(' ');
    const tokens = {
      access_token: accessToken,
      refresh_token: rotatedRefreshToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope,
      calendarId: connection.calendarId
    };
    try {
      await credentials.save(ownerId, tokens);
    } catch {
      throw authorizationUnavailable('CALENDAR_CREDENTIAL_PERSISTENCE_FAILED');
    }
    return {
      ...connection,
      accessToken,
      refreshToken: rotatedRefreshToken,
      expiresAtMs: nowFrom(clock).getTime() + expiresIn * 1000,
      scopes: scope.split(/\s+/).filter(Boolean)
    };
  }

  async function refresh(ownerId, connection) {
    if (refreshes.has(ownerId)) return refreshes.get(ownerId);
    // Re-read before starting a refresh. A concurrent request (or another
    // application instance) may already have persisted a rotated refresh
    // token after this request loaded its credentials.
    const latest = await loadOwnerConnection(ownerId, connection.calendarId);
    const latestChanged = latest.accessToken !== connection.accessToken ||
      latest.refreshToken !== connection.refreshToken ||
      latest.expiresAtMs !== connection.expiresAtMs;
    const latestIsUsable = latest.accessToken &&
      (latest.expiresAtMs === null || latest.expiresAtMs > nowFrom(clock).getTime() + refreshLeewayMs);
    if (latestChanged && latestIsUsable) return latest;
    // Two local callers can both be awaiting the credential reload above.
    // Check the in-flight map again before either talks to Google.
    if (refreshes.has(ownerId)) return refreshes.get(ownerId);
    const pending = performRefresh(ownerId, latest);
    refreshes.set(ownerId, pending);
    try {
      return await pending;
    } finally {
      if (refreshes.get(ownerId) === pending) refreshes.delete(ownerId);
    }
  }

  async function usableConnection(ownerId, connection, { forceRefresh = false } = {}) {
    const nowMs = nowFrom(clock).getTime();
    const expired = connection.expiresAtMs !== null && connection.expiresAtMs <= nowMs;
    const nearExpiry = connection.expiresAtMs !== null && connection.expiresAtMs <= nowMs + refreshLeewayMs;
    if (forceRefresh || !connection.accessToken || expired || (nearExpiry && connection.refreshToken)) {
      return refresh(ownerId, connection);
    }
    return connection;
  }

  async function apiRequest({ ownerId, calendarId, path, method, body, write = false, notFoundIsNull = false }) {
    let connection = await loadOwnerConnection(ownerId, calendarId);
    connection = await usableConnection(ownerId, connection);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const request = await timedFetch(`${apiBaseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${connection.accessToken}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      }, { ambiguous: write });
      try {
        const status = responseStatus(request.response, { ambiguous: write });
        if (status === 401) {
          await request.withDeadline(discardResponse(request.response));
          request.release();
          if (attempt === 0) {
            connection = await usableConnection(ownerId, connection, { forceRefresh: true });
            continue;
          }
          throw authorizationUnavailable('CALENDAR_REAUTHORIZATION_REQUIRED');
        }
        if (status === 404 && notFoundIsNull) {
          await request.withDeadline(discardResponse(request.response));
          return null;
        }
        if (status < 200 || status >= 300) {
          await request.withDeadline(discardResponse(request.response));
          if (status >= 500) throw providerUnavailable({ ambiguous: write, providerStatus: status });
          const ambiguous = write && (status === 408 || status === 409 || status === 425);
          throw rejectedByProvider(status, { ambiguous });
        }
        return await request.withDeadline(responseJson(request.response, { ambiguous: write }));
      } catch (error) {
        if (request.timedOut()) throw providerUnavailable({ ambiguous: write });
        throw error;
      } finally {
        request.release();
      }
    }
    throw authorizationUnavailable('CALENDAR_REAUTHORIZATION_REQUIRED');
  }

  async function listBusy(input) {
    const { ownerId, calendarId } = baseRequest(input);
    const bounds = orderedUtcBounds(input.timeMinUtc, input.timeMaxUtc);
    const payload = await apiRequest({
      ownerId,
      calendarId,
      path: '/freeBusy',
      method: 'POST',
      body: {
        timeMin: bounds.start,
        timeMax: bounds.end,
        timeZone: 'UTC',
        items: [{ id: calendarId }]
      }
    });
    if (!record(payload.calendars) || !own(payload.calendars, calendarId)) throw invalidResponse();
    const calendar = payload.calendars[calendarId];
    if (!record(calendar) || !Array.isArray(calendar.busy) ||
        (calendar.errors !== undefined && (!Array.isArray(calendar.errors) || calendar.errors.length > 0))) {
      if (Array.isArray(calendar?.errors) && calendar.errors.length > 0) throw rejectedByProvider(200);
      throw invalidResponse();
    }
    return calendar.busy.map(interval => {
      if (!record(interval)) throw invalidResponse();
      let intervalBounds;
      try {
        intervalBounds = orderedUtcBounds(interval.start, interval.end);
      } catch (error) {
        if (error instanceof GoogleCalendarAdapterError) throw invalidResponse();
        throw error;
      }
      if (intervalBounds.startMs < bounds.startMs || intervalBounds.endMs > bounds.endMs) {
        throw invalidResponse();
      }
      return { startAtUtc: intervalBounds.start, endAtUtc: intervalBounds.end };
    });
  }

  async function createEvent(input) {
    const { ownerId, calendarId } = baseRequest(input);
    const bounds = orderedUtcBounds(input.startAtUtc, input.endAtUtc);
    const body = createEventPayload(input, bounds);
    const payload = await apiRequest({
      ownerId,
      calendarId,
      path: `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
      method: 'POST',
      body,
      write: true
    });
    const event = normalizeEvent(payload, input.eventId, { ambiguous: true });
    if (event.status === 'CANCELLED') throw invalidResponse({ ambiguous: true });
    if (new Date(event.startAtUtc).getTime() !== bounds.startMs ||
        new Date(event.endAtUtc).getTime() !== bounds.endMs) {
      throw invalidResponse({ ambiguous: true });
    }
    return event;
  }

  async function getEvent(input) {
    const { ownerId, calendarId } = baseRequest(input);
    if (!GOOGLE_EVENT_ID.test(input.eventId)) throw invalidRequest();
    const payload = await apiRequest({
      ownerId,
      calendarId,
      path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      method: 'GET',
      notFoundIsNull: true
    });
    if (payload === null) return null;
    return normalizeEvent(payload, input.eventId);
  }

  return { listBusy, createEvent, getEvent };
}
