import test from 'node:test';
import assert from 'node:assert/strict';
import { googleCalendarAuthorizationUrl } from '../server/src/platformIntegrations.js';

const EVENTS_OWNED = 'https://www.googleapis.com/auth/calendar.events.owned';
const FREEBUSY = 'https://www.googleapis.com/auth/calendar.freebusy';

test('Google Calendar authorization requests exactly the booking scopes', () => {
  const originalClient = process.env.GOOGLE_CLIENT_ID;
  const originalRedirect = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  try {
    process.env.GOOGLE_CLIENT_ID = 'synthetic-client';
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://example.invalid/calendar/callback';
    const url = new URL(googleCalendarAuthorizationUrl('synthetic-state'));
    assert.deepEqual(url.searchParams.get('scope')?.split(' '), [EVENTS_OWNED, FREEBUSY]);
    assert.equal(url.searchParams.get('state'), 'synthetic-state');
  } finally {
    if (originalClient === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalClient;
    if (originalRedirect === undefined) delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;
    else process.env.GOOGLE_CALENDAR_REDIRECT_URI = originalRedirect;
  }
});
