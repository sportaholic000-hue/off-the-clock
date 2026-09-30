import { allowedCorsOrigins } from './runtimeConfig.js';

const PUBLIC_BROWSER_PATH = /^\/api\/public\/(?:quote|bookings)\//;

export function createCorsOptionsDelegate({
  env = process.env,
  configuredOrigins = allowedCorsOrigins(env)
} = {}) {
  const trusted = new Set(configuredOrigins);
  return function corsOptions(req, callback) {
    const origin = typeof req.get === 'function' ? req.get('Origin') : req.headers?.origin;
    const publicBrowserRequest = PUBLIC_BROWSER_PATH.test(String(req.path || req.url || ''));
    const allowed = !origin || publicBrowserRequest || trusted.has(origin);
    callback(null, {
      origin: allowed ? Boolean(origin) : false,
      credentials: Boolean(origin) && trusted.has(origin) && !publicBrowserRequest,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
      maxAge: 600
    });
  };
}
