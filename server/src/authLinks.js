export function accountEmailOrigin(environment = process.env) {
  const raw = environment.CLIENT_URL || (environment.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Account email URL is not configured.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(environment.NODE_ENV !== 'production' && local && url.protocol === 'http:'))) {
    throw new Error('Account email URL must be a trusted application origin.');
  }
  return url.origin;
}

export function accountEmailLink(environment, purpose, token) {
  const routes = {verify_email: '/verify-email', reset_password: '/reset-password'};
  if (!routes[purpose] || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43,86}$/.test(token)) {
    throw new TypeError('Invalid account link.');
  }
  // Fragments are never sent to the server or included in HTTP referrers.
  return accountEmailOrigin(environment) + routes[purpose] + '#token=' + encodeURIComponent(token);
}
