import assert from 'node:assert/strict';
import test from 'node:test';
import { createCorsOptionsDelegate } from '../server/src/corsPolicy.js';

function decide(delegate, { path, origin }) {
  return new Promise((resolve, reject) => {
    delegate({
      path,
      get(name) { return name === 'Origin' ? origin : undefined; }
    }, (error, options) => error ? reject(error) : resolve(options));
  });
}

test('authenticated application CORS permits only configured exact origins', async () => {
  const delegate = createCorsOptionsDelegate({ configuredOrigins: ['https://app.example.com'] });
  assert.equal((await decide(delegate, { path: '/api/dashboard', origin: 'https://app.example.com' })).origin, true);
  assert.equal((await decide(delegate, { path: '/api/dashboard', origin: 'https://evil.example.com' })).origin, false);
  assert.equal((await decide(delegate, { path: '/api/dashboard' })).origin, false);
});

test('public quote and booking paths defer exact website authorization to tenant context', async () => {
  const delegate = createCorsOptionsDelegate({ configuredOrigins: [] });
  for (const path of [
    '/api/public/quote/public-key',
    '/api/public/bookings/token/availability'
  ]) {
    const options = await decide(delegate, { path, origin: 'https://customer-site.example' });
    assert.equal(options.origin, true);
    assert.equal(options.credentials, false);
    assert.ok(options.allowedHeaders.includes('Idempotency-Key'));
  }
  assert.equal(
    (await decide(delegate, { path: '/api/auth/login', origin: 'https://customer-site.example' })).origin,
    false
  );
});
