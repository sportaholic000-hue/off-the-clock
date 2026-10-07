import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleCalendarAdapter,
  GoogleCalendarAdapterError
} from '../server/src/googleCalendarAdapter.js';

const OWNER = 'owner-a';
const OTHER_OWNER = 'owner-b';
const CALENDAR = 'calendar@example.com';
const EVENT_ID = 'b0123456789abcdef0123456789abcde';
const APPOINTMENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = '2026-09-29T12:00:00.000Z';
const ACCESS_TOKEN = 'synthetic-access-token';
const REFRESH_TOKEN = 'synthetic-refresh-token';
const CLIENT_SECRET = 'synthetic-client-secret';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function connection(overrides = {}) {
  const base = {
    ownerId: OWNER,
    provider: 'google',
    status: 'connected',
    calendarId: CALENDAR,
    expiresAtUtc: '2026-10-01T12:00:00.000Z',
    scopesJson: JSON.stringify(['https://www.googleapis.com/auth/calendar']),
    credentials: {
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      tokenType: 'Bearer'
    }
  };
  return {
    ...base,
    ...overrides,
    credentials: overrides.credentials === undefined ? base.credentials : overrides.credentials
  };
}

function repository({ value = connection(), loadError, saveError } = {}) {
  const state = { loads: [], saves: [] };
  return {
    state,
    async load(ownerId) {
      state.loads.push(ownerId);
      if (loadError) throw loadError;
      return typeof value === 'function' ? value(ownerId) : value;
    },
    async saveRefreshed(ownerId, tokens) {
      state.saves.push({ ownerId, tokens: structuredClone(tokens) });
      if (saveError) throw saveError;
    }
  };
}

function makeAdapter(fetch, credentials = repository(), overrides = {}) {
  return {
    credentials,
    adapter: createGoogleCalendarAdapter({
      fetch,
      clock: () => new Date(NOW),
      credentialRepository: credentials,
      clientId: 'synthetic-client-id',
      clientSecret: CLIENT_SECRET,
      requestTimeoutMs: 1_000,
      ...overrides
    })
  };
}

function busyRequest(overrides = {}) {
  return {
    ownerId: OWNER,
    provider: 'google',
    calendarId: CALENDAR,
    timeMinUtc: '2026-09-30T09:00:00.000Z',
    timeMaxUtc: '2026-09-30T17:00:00.000Z',
    ...overrides
  };
}

function eventRequest(overrides = {}) {
  return {
    ownerId: OWNER,
    provider: 'google',
    calendarId: CALENDAR,
    eventId: EVENT_ID,
    appointmentId: APPOINTMENT_ID,
    startAtUtc: '2026-09-30T10:00:00.000Z',
    endAtUtc: '2026-09-30T10:45:00.000Z',
    timezone: 'America/Halifax',
    bookingMode: 'site_visit_first',
    customer: {
      name: 'Alex Smith',
      email: 'alex@example.com',
      phone: '+19025550123'
    },
    location: {
      addressLine1: '123 Example Street',
      city: 'Halifax',
      region: 'NS',
      postalCode: 'B3H 0A1',
      country: 'CA'
    },
    sourceType: 'quote',
    sourceId: 'quote-row-1',
    tierName: null,
    ...overrides
  };
}

function eventResource(status = 'confirmed') {
  return {
    kind: 'calendar#event',
    id: EVENT_ID,
    status,
    start: { dateTime: '2026-09-30T10:00:00.000Z' },
    end: { dateTime: '2026-09-30T10:45:00.000Z' }
  };
}

function hasCode(code) {
  return error => error instanceof GoogleCalendarAdapterError && error.code === code;
}

test('listBusy is owner scoped and maps the Google freebusy request and response', async () => {
  const calls = [];
  const { adapter, credentials } = makeAdapter(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({
      kind: 'calendar#freeBusy',
      calendars: {
        [CALENDAR]: {
          busy: [
            { start: '2026-09-30T10:00:00Z', end: '2026-09-30T10:45:00Z' },
            { start: '2026-09-30T13:00:00.000Z', end: '2026-09-30T14:00:00.000Z' }
          ]
        }
      }
    });
  });

  const result = await adapter.listBusy(busyRequest());

  assert.deepEqual(result, [
    { startAtUtc: '2026-09-30T10:00:00.000Z', endAtUtc: '2026-09-30T10:45:00.000Z' },
    { startAtUtc: '2026-09-30T13:00:00.000Z', endAtUtc: '2026-09-30T14:00:00.000Z' }
  ]);
  assert.deepEqual(credentials.state.loads, [OWNER]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://www.googleapis.com/calendar/v3/freeBusy');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${ACCESS_TOKEN}`);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    timeMin: '2026-09-30T09:00:00.000Z',
    timeMax: '2026-09-30T17:00:00.000Z',
    timeZone: 'UTC',
    items: [{ id: CALENDAR }]
  });
});

test('UTC request bounds and freebusy response bounds fail closed before use', async () => {
  let fetches = 0;
  const { adapter } = makeAdapter(async () => {
    fetches += 1;
    return jsonResponse({ calendars: { [CALENDAR]: { busy: [] } } });
  });

  await assert.rejects(
    adapter.listBusy(busyRequest({ timeMinUtc: '2026-09-30T09:00:00-03:00' })),
    hasCode('INVALID_CALENDAR_REQUEST')
  );
  await assert.rejects(
    adapter.listBusy(busyRequest({
      timeMinUtc: '2026-09-30T17:00:00.000Z',
      timeMaxUtc: '2026-09-30T09:00:00.000Z'
    })),
    hasCode('INVALID_CALENDAR_REQUEST')
  );
  assert.equal(fetches, 0);

  const outside = makeAdapter(async () => jsonResponse({
    calendars: {
      [CALENDAR]: {
        busy: [{ start: '2026-09-30T08:59:00Z', end: '2026-09-30T10:00:00Z' }]
      }
    }
  })).adapter;
  await assert.rejects(outside.listBusy(busyRequest()), hasCode('CALENDAR_INVALID_RESPONSE'));
});

test('createEvent uses the deterministic BookingService event ID and getEvent validates it', async () => {
  const calls = [];
  const { adapter } = makeAdapter(async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') return jsonResponse(eventResource());
    if (calls.filter(call => call.options.method === 'GET').length === 1) return jsonResponse(eventResource());
    return jsonResponse({ error: { message: 'not found' } }, 404);
  });

  const created = await adapter.createEvent(eventRequest());
  const found = await adapter.getEvent({ ownerId: OWNER, provider: 'google', calendarId: CALENDAR, eventId: EVENT_ID });
  const missing = await adapter.getEvent({ ownerId: OWNER, provider: 'google', calendarId: CALENDAR, eventId: EVENT_ID });

  assert.deepEqual(created, {
    status: 'CONFIRMED',
    eventId: EVENT_ID,
    startAtUtc: '2026-09-30T10:00:00.000Z',
    endAtUtc: '2026-09-30T10:45:00.000Z'
  });
  assert.deepEqual(found, created);
  assert.equal(missing, null);
  const insert = calls[0];
  assert.equal(insert.url, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR)}/events?sendUpdates=none`);
  const body = JSON.parse(insert.options.body);
  assert.equal(body.id, EVENT_ID);
  assert.deepEqual(body.start, { dateTime: '2026-09-30T10:00:00.000Z', timeZone: 'UTC' });
  assert.deepEqual(body.end, { dateTime: '2026-09-30T10:45:00.000Z', timeZone: 'UTC' });
  assert.equal(body.visibility, 'private');
  assert.deepEqual(body.reminders,{useDefault:false,overrides:[]});
  assert.equal(body.attendees,undefined);
  assert.equal(body.guestsCanInviteOthers,false);
  assert.equal(body.extendedProperties.private.appointmentId, APPOINTMENT_ID);
});

test('getEvent preserves cancelled provider status for BookingService reconciliation', async () => {
  const { adapter } = makeAdapter(async () => jsonResponse({
    kind: 'calendar#event',
    id: EVENT_ID,
    status: 'cancelled'
  }));

  assert.deepEqual(await adapter.getEvent({
    ownerId: OWNER,
    provider: 'google',
    calendarId: CALENDAR,
    eventId: EVENT_ID
  }), { status: 'CANCELLED', eventId: EVENT_ID });
});

test('an expired access token is refreshed, persisted with its refresh token, and never returned', async () => {
  const credentials = repository({
    value: connection({ expiresAtUtc: '2026-09-29T11:59:59.000Z' })
  });
  const calls = [];
  const { adapter } = makeAdapter(async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://oauth2.googleapis.com/token') {
      return jsonResponse({
        access_token: 'fresh-access-token',
        expires_in: 3600,
        token_type: 'Bearer'
      });
    }
    return jsonResponse({ calendars: { [CALENDAR]: { busy: [] } } });
  }, credentials);

  const result = await adapter.listBusy(busyRequest());

  assert.deepEqual(result, []);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(calls[0].options.body.get('grant_type'), 'refresh_token');
  assert.equal(calls[0].options.body.get('refresh_token'), REFRESH_TOKEN);
  assert.equal(calls[0].options.body.get('client_secret'), CLIENT_SECRET);
  assert.equal(calls[1].options.headers.authorization, 'Bearer fresh-access-token');
  assert.deepEqual(credentials.state.saves, [{
    ownerId: OWNER,
    tokens: {
      access_token: 'fresh-access-token',
      refresh_token: REFRESH_TOKEN,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/calendar',
      calendarId: CALENDAR
    }
  }]);
  assert.equal(JSON.stringify(result).includes('fresh-access-token'), false);
  assert.equal(JSON.stringify(result).includes(REFRESH_TOKEN), false);
});

test('concurrent expired-token requests coalesce one owner-scoped refresh', async () => {
  const credentials = repository({
    value: connection({ expiresAtUtc: '2026-09-29T11:59:59.000Z' })
  });
  let tokenCalls = 0;
  let calendarCalls = 0;
  const { adapter } = makeAdapter(async url => {
    if (url === 'https://oauth2.googleapis.com/token') {
      tokenCalls += 1;
      await new Promise(resolve => setImmediate(resolve));
      return jsonResponse({ access_token: 'fresh-access-token', expires_in: 3600, token_type: 'Bearer' });
    }
    calendarCalls += 1;
    return jsonResponse({ calendars: { [CALENDAR]: { busy: [] } } });
  }, credentials);

  const [first, second] = await Promise.all([
    adapter.listBusy(busyRequest()),
    adapter.listBusy(busyRequest())
  ]);

  assert.deepEqual(first, []);
  assert.deepEqual(second, []);
  assert.equal(tokenCalls, 1);
  assert.equal(calendarCalls, 2);
  assert.equal(credentials.state.saves.length, 1);
});

test('a 401 refreshes and retries the Calendar request once', async () => {
  let calendarCalls = 0;
  let tokenCalls = 0;
  const { adapter, credentials } = makeAdapter(async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      tokenCalls += 1;
      return jsonResponse({ access_token: 'fresh-access-token', expires_in: 3600, token_type: 'Bearer' });
    }
    calendarCalls += 1;
    if (calendarCalls === 1) return jsonResponse({ error: { message: 'expired' } }, 401);
    assert.equal(options.headers.authorization, 'Bearer fresh-access-token');
    return jsonResponse({ calendars: { [CALENDAR]: { busy: [] } } });
  });

  assert.deepEqual(await adapter.listBusy(busyRequest()), []);
  assert.equal(calendarCalls, 2);
  assert.equal(tokenCalls, 1);
  assert.equal(credentials.state.saves.length, 1);
});

test('a staggered concurrent 401 reloads a token another request already rotated', async () => {
  let stored = connection();
  const credentials = {
    saves: 0,
    async load() { return structuredClone(stored); },
    async saveRefreshed(ownerId, tokens) {
      assert.equal(ownerId, OWNER);
      this.saves += 1;
      stored = {
        ...stored,
        expiresAtUtc: '2026-09-29T13:00:00.000Z',
        credentials: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenType: tokens.token_type
        }
      };
    }
  };
  let tokenCalls = 0;
  let oldTokenCalls = 0;
  let freshTokenCalls = 0;
  let releaseSecondOld;
  const firstRetryStarted = new Promise(resolve => { releaseSecondOld = resolve; });
  const { adapter } = makeAdapter(async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      tokenCalls += 1;
      return jsonResponse({
        access_token: 'fresh-access-token',
        refresh_token: 'rotated-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer'
      });
    }
    if (options.headers.authorization === `Bearer ${ACCESS_TOKEN}`) {
      oldTokenCalls += 1;
      if (oldTokenCalls === 2) await firstRetryStarted;
      return jsonResponse({ error: { message: 'expired' } }, 401);
    }
    freshTokenCalls += 1;
    if (freshTokenCalls === 1) releaseSecondOld();
    return jsonResponse({ calendars: { [CALENDAR]: { busy: [] } } });
  }, credentials);

  const [first, second] = await Promise.all([
    adapter.listBusy(busyRequest()),
    adapter.listBusy(busyRequest())
  ]);

  assert.deepEqual(first, []);
  assert.deepEqual(second, []);
  assert.equal(oldTokenCalls, 2);
  assert.equal(freshTokenCalls, 2);
  assert.equal(tokenCalls, 1);
  assert.equal(credentials.saves, 1);
});

test('a repeated 401 is not retried or refreshed more than once', async () => {
  let calendarCalls = 0;
  let tokenCalls = 0;
  const { adapter } = makeAdapter(async url => {
    if (url === 'https://oauth2.googleapis.com/token') {
      tokenCalls += 1;
      return jsonResponse({ access_token: 'fresh-access-token', expires_in: 3600, token_type: 'Bearer' });
    }
    calendarCalls += 1;
    return jsonResponse({ error: { message: `unauthorized ${ACCESS_TOKEN}` } }, 401);
  });

  await assert.rejects(adapter.listBusy(busyRequest()), hasCode('CALENDAR_REAUTHORIZATION_REQUIRED'));
  assert.equal(calendarCalls, 2);
  assert.equal(tokenCalls, 1);
});

test('create network and timeout failures are ambiguous without exposing underlying errors', async () => {
  for (const underlying of [
    new TypeError(`network failed ${ACCESS_TOKEN} ${REFRESH_TOKEN}`),
    Object.assign(new Error(`timeout ${CLIENT_SECRET}`), { name: 'AbortError' })
  ]) {
    const { adapter } = makeAdapter(async () => { throw underlying; });
    await assert.rejects(adapter.createEvent(eventRequest()), error => {
      assert.equal(error.code, 'CALENDAR_PROVIDER_UNAVAILABLE');
      assert.equal(error.ambiguous, true);
      assert.equal(error.retryable, true);
      const visible = `${String(error)} ${JSON.stringify(error)} ${error.stack}`;
      for (const secret of [ACCESS_TOKEN, REFRESH_TOKEN, CLIENT_SECRET]) {
        assert.equal(visible.includes(secret), false);
      }
      assert.equal(visible.includes(underlying.message), false);
      return true;
    });
  }
});

test('the request deadline covers a stalled create response body', async () => {
  let requestSignal;
  const credentials = repository();
  const { adapter } = makeAdapter(async (_url, options) => {
    requestSignal = options.signal;
    return {
      status: 200,
      json() { return new Promise(() => {}); }
    };
  }, credentials, { requestTimeoutMs: 20 });

  const startedAt = Date.now();
  await assert.rejects(adapter.createEvent(eventRequest()), error => {
    assert.equal(error.code, 'CALENDAR_PROVIDER_UNAVAILABLE');
    assert.equal(error.ambiguous, true);
    assert.equal(error.retryable, true);
    return true;
  });
  assert.equal(requestSignal.aborted, true);
  assert.ok(Date.now() - startedAt < 1_000);
});

test('a known Google 4xx write failure is non-ambiguous and sanitized', async () => {
  const providerDetail = `bad event ${ACCESS_TOKEN} ${REFRESH_TOKEN} ${CLIENT_SECRET}`;
  const { adapter } = makeAdapter(async () => jsonResponse({
    error: { code: 403, message: providerDetail, errors: [{ reason: providerDetail }] }
  }, 403));

  await assert.rejects(adapter.createEvent(eventRequest()), error => {
    assert.equal(error.code, 'CALENDAR_REQUEST_REJECTED');
    assert.equal(error.providerStatus, 403);
    assert.equal(error.ambiguous, false);
    assert.equal(error.retryable, false);
    const visible = `${String(error)} ${JSON.stringify(error)} ${error.stack}`;
    assert.equal(visible.includes(providerDetail), false);
    for (const secret of [ACCESS_TOKEN, REFRESH_TOKEN, CLIENT_SECRET]) {
      assert.equal(visible.includes(secret), false);
    }
    return true;
  });
});

test('tenant and credential failures fail closed before a provider call', async () => {
  let fetches = 0;
  const fetch = async () => {
    fetches += 1;
    return jsonResponse({ calendars: { [CALENDAR]: { busy: [] } } });
  };

  // Even a faulty repository returning another tenant's row is rejected.
  const scopedCredentials = repository({ value: connection() });
  const scoped = makeAdapter(fetch, scopedCredentials).adapter;
  await assert.rejects(
    scoped.listBusy(busyRequest({ ownerId: OTHER_OWNER })),
    hasCode('CALENDAR_NOT_CONNECTED')
  );
  assert.deepEqual(scopedCredentials.state.loads, [OTHER_OWNER]);

  const mismatched = makeAdapter(fetch, repository({
    value: connection({ calendarId: 'other-calendar@example.com' })
  })).adapter;
  await assert.rejects(mismatched.listBusy(busyRequest()), hasCode('CALENDAR_SCOPE_MISMATCH'));

  const decryptDetail = `decrypt failed ${ACCESS_TOKEN} ${REFRESH_TOKEN}`;
  const failedDecrypt = makeAdapter(fetch, repository({ loadError: new Error(decryptDetail) })).adapter;
  await assert.rejects(failedDecrypt.listBusy(busyRequest()), error => {
    assert.equal(error.code, 'CALENDAR_AUTHORIZATION_UNAVAILABLE');
    assert.equal(`${String(error)} ${JSON.stringify(error)} ${error.stack}`.includes(decryptDetail), false);
    return true;
  });

  const missingTokens = makeAdapter(fetch, repository({
    value: connection({ credentials: { accessToken: null, refreshToken: null, tokenType: 'Bearer' } })
  })).adapter;
  await assert.rejects(missingTokens.listBusy(busyRequest()), hasCode('CALENDAR_AUTHORIZATION_UNAVAILABLE'));
  assert.equal(fetches, 0);
});

test('refresh rejection and persistence failures expose no OAuth or credential material', async () => {
  const expired = connection({ expiresAtUtc: '2026-09-29T11:00:00.000Z' });
  const providerDetail = `invalid_grant ${REFRESH_TOKEN} ${CLIENT_SECRET}`;
  const rejected = makeAdapter(
    async () => jsonResponse({ error: 'invalid_grant', error_description: providerDetail }, 400),
    repository({ value: expired })
  ).adapter;
  await assert.rejects(rejected.listBusy(busyRequest()), error => {
    assert.equal(error.code, 'CALENDAR_REAUTHORIZATION_REQUIRED');
    const visible = `${String(error)} ${JSON.stringify(error)} ${error.stack}`;
    assert.equal(visible.includes(providerDetail), false);
    assert.equal(visible.includes(REFRESH_TOKEN), false);
    assert.equal(visible.includes(CLIENT_SECRET), false);
    return true;
  });

  const persistenceDetail = `database rejected ${ACCESS_TOKEN} ${REFRESH_TOKEN}`;
  const persistence = makeAdapter(
    async () => jsonResponse({ access_token: 'fresh-access-token', expires_in: 3600, token_type: 'Bearer' }),
    repository({ value: expired, saveError: new Error(persistenceDetail) })
  ).adapter;
  await assert.rejects(persistence.listBusy(busyRequest()), error => {
    assert.equal(error.code, 'CALENDAR_CREDENTIAL_PERSISTENCE_FAILED');
    const visible = `${String(error)} ${JSON.stringify(error)} ${error.stack}`;
    assert.equal(visible.includes(persistenceDetail), false);
    assert.equal(visible.includes('fresh-access-token'), false);
    return true;
  });
});

test('malformed Google response shapes fail closed and create parse failures remain ambiguous', async () => {
  const malformedBusy = makeAdapter(async () => jsonResponse({ calendars: { [CALENDAR]: { busy: 'nope' } } })).adapter;
  await assert.rejects(malformedBusy.listBusy(busyRequest()), hasCode('CALENDAR_INVALID_RESPONSE'));

  const wrongEvent = makeAdapter(async () => jsonResponse({ ...eventResource(), id: 'bfffffffffffffffffffffffffffffff' })).adapter;
  await assert.rejects(wrongEvent.createEvent(eventRequest()), error => {
    assert.equal(error.code, 'CALENDAR_INVALID_RESPONSE');
    assert.equal(error.ambiguous, true);
    return true;
  });
});

for(const action of ['cancel','reschedule'])test('Owner ruling: '+action+' suppresses all calendar messages and reminders',async()=>{
  let request;const {adapter}=makeAdapter(async(url,options)=>{request={url,options};return jsonResponse(eventResource(action==='cancel'?'cancelled':'confirmed'));});
  await adapter.changeEvent({...eventRequest(),action});
  assert.match(request.url,/sendUpdates=none$/);assert.equal(request.options.method,'PATCH');const body=JSON.parse(request.options.body);
  assert.deepEqual(body.reminders,{useDefault:false,overrides:[]});assert.deepEqual(body.attendees,[]);
});
