import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveBookingCapability,
  sanitizePublicBranding
} from '../server/src/bookingCapabilities.js';

const directSettings = {
  revision: 'settings-v1',
  timezone: 'America/Halifax',
  provider: 'google',
  calendarId: 'primary',
  weeklyAvailabilityJson: JSON.stringify({ mon: [{ start: '09:00', end: '17:00' }] }),
  blackoutsJson: '[]',
  bookingHorizonDays: 30,
  minimumNoticeMinutes: 120,
  slotIncrementMinutes: 30,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  directBookingEnabled: 1
};
const directPolicy = {
  revision: 'policy-v1',
  bookingMode: 'site_visit_first',
  durationMinutes: null,
  enabled: 1
};
const allServiceArea = { mode: 'all', cities: [] };

test('booking capability fails closed through explicit, direct, handoff, and preference states', () => {
  assert.equal(resolveBookingCapability(), 'PREFERRED_TIME_ONLY');
  assert.equal(resolveBookingCapability({ settings: directSettings }), 'PREFERRED_TIME_ONLY');
  assert.equal(resolveBookingCapability({
    settings: directSettings,
    policy: { ...directPolicy, enabled: 0 }
  }), 'NONE');
  assert.equal(resolveBookingCapability({
    settings: { provider: 'calendly', externalUrl: 'https://calendly.com/example' },
    policy: directPolicy
  }), 'EXTERNAL_HANDOFF');
  assert.equal(resolveBookingCapability({
    settings: directSettings,
    policy: directPolicy,
    serviceArea: allServiceArea
  }), 'DIRECT');
  assert.equal(resolveBookingCapability({
    settings: directSettings,
    policy: directPolicy
  }), 'PREFERRED_TIME_ONLY');
  assert.equal(resolveBookingCapability({
    settings: directSettings,
    policy: directPolicy,
    serviceArea: { mode: 'cities', cities: [] }
  }), 'PREFERRED_TIME_ONLY');
  assert.equal(resolveBookingCapability({
    settings: { ...directSettings, timezone: 'Atlantic/Imaginary' },
    policy: directPolicy,
    serviceArea: allServiceArea
  }), 'PREFERRED_TIME_ONLY');
  assert.equal(resolveBookingCapability({
    settings: directSettings,
    policy: { ...directPolicy, bookingMode: 'book_job', durationMinutes: null },
    serviceArea: allServiceArea
  }), 'PREFERRED_TIME_ONLY');
});

test('public branding validates every owner-configurable value', () => {
  assert.deepEqual(sanitizePublicBranding({
    businessName: '  Example Contracting  ',
    accentColor: '#1a2b3c',
    launcherLabel: '  Request a quote  ',
    clickToCallNumber: '+19025550123',
    twilioNumber: '+19025550999'
  }), {
    businessName: 'Example Contracting',
    accentColor: '#1A2B3C',
    launcherLabel: 'Request a quote',
    clickToCallNumber: '+19025550123'
  });
  assert.deepEqual(sanitizePublicBranding({
    businessName: '',
    accentColor: 'red',
    launcherLabel: '',
    clickToCallNumber: '555-0123',
    twilioNumber: 'bad'
  }), {
    businessName: 'Service business',
    accentColor: '#16A34A',
    launcherLabel: 'Get an estimate',
    clickToCallNumber: null
  });
});
