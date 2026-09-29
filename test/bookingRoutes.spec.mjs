import assert from 'node:assert/strict';
import test from 'node:test';
import { installBookingRoutes } from '../server/src/bookingRoutes.js';

function harness() {
  const routes = new Map();
  const app = {};
  for (const method of ['get', 'post', 'delete']) {
    app[method] = (path, ...handlers) => routes.set(`${method.toUpperCase()} ${path}`, handlers);
  }
  const calls = [];
  const bookingService = {
    resolveBookingToken(token) {
      if (token === 'bad') throw new Error('invalid');
      return { ownerId: 'owner-1', intentId: 'intent-1', expiresAtUtc: '2099-01-01T00:00:00.000Z' };
    },
    async availability(input) {
      calls.push(['availability', input]);
      return { statusCode: 200, body: { status: 'PREFERRED_TIME_ONLY' } };
    },
    hold(input) {
      calls.push(['hold', input]);
      return { statusCode: 201, body: { status: 'HELD' } };
    },
    releaseHold(input) {
      calls.push(['release', input]);
      return { statusCode: 200, body: { status: 'RELEASED', holdId: input.holdId } };
    },
    async confirm(input) {
      calls.push(['confirm', input]);
      return { statusCode: 202, body: { status: 'PENDING_CONFIRMATION' } };
    },
    async getConfirmationStatus(input) {
      calls.push(['confirmation', input]);
      return { statusCode: 200, body: { status: 'PENDING_CONFIRMATION' } };
    }
  };
  installBookingRoutes(app, {
    bookingService,
    asyncHandler: fn => fn,
    requireAuth: () => (_req, _res, next) => next(),
    database: {
      prepare() {
        return { get: () => ({ allowedOriginsJson: JSON.stringify(['https://customer.example']) }) };
      }
    }
  });
  return { routes, calls, bookingService };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

function request({ method = 'POST', body = {}, params = {}, headers = {} } = {}) {
  return {
    method,
    body,
    params,
    ip: '127.0.0.1',
    get(name) { return headers[name] ?? headers[name.toLowerCase()]; }
  };
}

const customer = { name: 'Alex Smith' };
const bookingCustomer = { name: 'Alex Smith', email: 'alex@example.com', phone: '' };
const location = {
  addressLine1: '123 Example Street',
  addressLine2: '',
  city: 'Halifax',
  region: 'NS',
  postalCode: 'B3H 0A1',
  country: 'CA'
};

test('public booking context binds token tenant and exact allowed website origin', () => {
  const { routes } = harness();
  const middleware = routes.get('POST /api/public/bookings/:bookingToken/availability')[0];
  const req = request({
    params: { bookingToken: 'token' },
    headers: { Origin: 'https://customer.example' }
  });
  const res = response();
  let next = false;
  middleware(req, res, () => { next = true; });
  assert.equal(next, true);
  assert.deepEqual(req.bookingContext, {
    ownerId: 'owner-1',
    intentId: 'intent-1',
    expiresAtUtc: '2099-01-01T00:00:00.000Z'
  });

  const denied = request({
    params: { bookingToken: 'token' },
    headers: { Origin: 'https://evil.example' }
  });
  const deniedRes = response();
  middleware(denied, deniedRes, () => assert.fail('denied origin advanced'));
  assert.equal(deniedRes.statusCode, 403);
  assert.equal(deniedRes.body.code, 'ORIGIN_NOT_ALLOWED');
});

test('availability requires unchanged scope and a strict post-quote identity envelope', async () => {
  const { routes, calls } = harness();
  const handler = routes.get('POST /api/public/bookings/:bookingToken/availability').at(-1);
  const base = {
    scopeConfirmation: 'UNCHANGED',
    customer,
    location,
    fromDate: '2026-10-01',
    days: 7,
    timeOfDay: ['morning']
  };
  await assert.rejects(
    handler(request({ body: { ...base, scopeConfirmation: 'CHANGED' } }), response()),
    error => error.code === 'REQUOTE_REQUIRED' && error.statusCode === 409
  );
  await assert.rejects(
    handler(request({ body: { ...base, ownerId: 'attacker' } }), response()),
    error => error.code === 'INVALID_REQUEST' && error.details.fields.includes('ownerId')
  );
  const req = request({ body: base });
  req.bookingContext = { ownerId: 'owner-1', intentId: 'intent-1' };
  const res = response();
  await handler(req, res);
  assert.equal(res.body.status, 'PREFERRED_TIME_ONLY');
  assert.equal(calls[0][1].ownerId, 'owner-1');
  assert.equal(Object.hasOwn(calls[0][1].filters, 'ownerId'), false);
});

test('hold, release, confirm, and polling forward only server-bound context', async () => {
  const { routes, calls } = harness();
  const holdReq = request({
    body: { slotId: 'opaque-slot' },
    headers: { 'Idempotency-Key': '11111111-1111-4111-8111-111111111111' }
  });
  holdReq.bookingContext = { ownerId: 'owner-1', intentId: 'intent-1' };
  await routes.get('POST /api/public/bookings/:bookingToken/holds').at(-1)(holdReq, response());

  const releaseReq = request({
    method: 'DELETE',
    params: { holdId: '22222222-2222-4222-8222-222222222222' },
    headers: { 'Idempotency-Key': '33333333-3333-4333-8333-333333333333' }
  });
  releaseReq.bookingContext = { ownerId: 'owner-1', intentId: 'intent-1' };
  await routes.get('DELETE /api/public/bookings/:bookingToken/holds/:holdId').at(-1)(releaseReq, response());

  const confirmationBody = {
    holdId: '22222222-2222-4222-8222-222222222222',
    confirmedSlotId: 'opaque-slot',
    explicitConfirmation: true,
    tierName: 'Better',
    customer: bookingCustomer,
    location,
    addressConfirmation: true
  };
  const confirmHandler = routes.get('POST /api/public/bookings/:bookingToken/confirm').at(-1);
  await assert.rejects(
    confirmHandler(request({ body: { ...confirmationBody, startUtc: '2026-10-01T13:00:00Z' } }), response()),
    error => error.code === 'INVALID_REQUEST' && error.details.fields.includes('startUtc')
  );
  const confirmReq = request({
    body: confirmationBody,
    headers: { 'Idempotency-Key': '44444444-4444-4444-8444-444444444444' }
  });
  confirmReq.bookingContext = { ownerId: 'owner-1', intentId: 'intent-1' };
  await confirmHandler(confirmReq, response());

  const pollReq = request({
    method: 'GET',
    params: { bookingToken: 'token', confirmationId: 'opaque-confirmation' }
  });
  await routes.get('GET /api/public/bookings/:bookingToken/confirmations/:confirmationId').at(-1)(pollReq, response());

  assert.deepEqual(calls.map(([name]) => name), ['hold', 'release', 'confirm', 'confirmation']);
  assert.equal(calls[0][1].slotId, 'opaque-slot');
  assert.equal(calls[1][1].holdId, releaseReq.params.holdId);
  assert.equal(Object.hasOwn(calls[2][1].body, 'startUtc'), false);
  assert.deepEqual(calls[3][1], {
    bookingToken: 'token',
    confirmationId: 'opaque-confirmation'
  });
});
