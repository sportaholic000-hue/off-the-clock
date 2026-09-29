import test from 'node:test';
import assert from 'node:assert/strict';

import { installBookingAdminRoutes } from '../server/src/bookingAdminRoutes.js';

function harness() {
  const routes = [];
  const app = {};
  for (const method of ['get', 'put']) {
    app[method] = (path, ...handlers) => routes.push({ method, path, handlers });
  }
  const auth = () => (_req, _res, next) => next();
  const gate = (_req, _res, next) => next();
  const calls = [];
  const adminService = {
    getConfiguration: input => (calls.push(['configuration', input]), { kind: 'configuration' }),
    getReadiness: input => (calls.push(['readiness', input]), { kind: 'readiness' }),
    updateSettings: input => (calls.push(['settings', input]), { kind: 'settings' }),
    updatePolicy: input => (calls.push(['policy', input]), { kind: 'policy' }),
    updateWidget: input => (calls.push(['widget', input]), { kind: 'widget' })
  };
  installBookingAdminRoutes(app, {
    adminService,
    requireAuth: auth,
    requireOperatorAccess: gate,
    requireQuoteDonePlan: gate,
    asyncHandler: handler => handler
  });
  return { routes, calls };
}

async function invoke(route, { body = {}, params = {} } = {}) {
  const req = { tenantOwnerId: 'owner-a', body, params };
  let json;
  const res = { json(value) { json = value; return value; } };
  await route.handlers.at(-1)(req, res);
  return json;
}

test('booking owner routes expose the complete configuration surface', () => {
  const { routes } = harness();
  assert.deepEqual(routes.map(({ method, path }) => `${method.toUpperCase()} ${path}`), [
    'GET /api/booking/configuration',
    'GET /api/booking/readiness',
    'PUT /api/booking/settings',
    'PUT /api/booking/policies/:serviceId',
    'PUT /api/widget/settings'
  ]);
  assert.equal(routes.every(route => route.handlers.length === 3), true);
});

test('route handlers derive tenant identity from auth context and pass bodies unchanged to strict service validation', async () => {
  const { routes, calls } = harness();
  await invoke(routes.find(route => route.path === '/api/booking/configuration'));
  await invoke(routes.find(route => route.path === '/api/booking/settings'), { body: { timezone: 'UTC' } });
  await invoke(routes.find(route => route.path.includes(':serviceId')), {
    params: { serviceId: 'service-a' }, body: { enabled: true }
  });
  await invoke(routes.find(route => route.path === '/api/widget/settings'), { body: { accentColor: '#112233' } });
  assert.deepEqual(calls, [
    ['configuration', { ownerId: 'owner-a' }],
    ['settings', { ownerId: 'owner-a', body: { timezone: 'UTC' } }],
    ['policy', { ownerId: 'owner-a', serviceId: 'service-a', body: { enabled: true } }],
    ['widget', { ownerId: 'owner-a', body: { accentColor: '#112233' } }]
  ]);
});
