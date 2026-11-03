// Browser security headers for every response. The owner app's page gets its
// own Content-Security-Policy in productionAssets.js; every other response is
// data, a script or a provider callback and is never meant to render or frame.
export const DEFAULT_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
export const OWNER_APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');
export const HSTS = 'max-age=31536000; includeSubDomains';

export function installSecurityHeaders(app, {production = process.env.NODE_ENV === 'production'} = {}) {
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'DENY');
    res.set('Content-Security-Policy', DEFAULT_CSP);
    if (production) res.set('Strict-Transport-Security', HSTS);
    next();
  });
}
