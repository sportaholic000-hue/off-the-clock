const API_BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '')).replace(/\/$/, '');

export function getToken() {
  return localStorage.getItem('otc_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('otc_token', token);
  else localStorage.removeItem('otc_token');
}

export async function api(path, { method = 'GET', body, auth = true, idempotencyKey } = {}) {
  const headers = { accept: 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && getToken()) headers.authorization = `Bearer ${getToken()}`;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed');
    error.status = response.status;
    error.details = payload.details;
    error.code = payload.code;
    throw error;
  }
  return payload;
}

export function go(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
