# Session security setup

Use the existing persistent SQLite DATABASE_PATH and a non-default JWT_SECRET. Existing startup validation still governs deployment configuration. Migrations add authSessions, authRefreshTokens and authRateLimits; no user-table rewrite is added by this slice.

Production configuration:
- NODE_ENV=production, HTTPS, CLIENT_URL set to the frontend origin.
- CORS_ALLOWED_ORIGINS includes each exact trusted application origin.
- BCRYPT_COST defaults to 12; supported configured costs are integers from 12 through 31.
- Serve /api from the frontend origin or an API host on the same site. A proxy must forward Cookie, Set-Cookie, Origin and Authorization.
- Build with the standard production runner; the browser fixtures use VITE_API_URL='' and NODE_ENV=production.
- Preserve the database across restarts and backups. JWT_SECRET changes invalidate access signatures and credential bindings, requiring fresh sign-in.

Each login has its own HttpOnly cookie name: __Host-otc_refresh_<session ID> on production HTTPS, otc_refresh_<session ID> in local tests. The signed access token selects that exact cookie; unrelated cookies cannot authorize the session. Delayed responses affect only their originating session cookie.

Rollout: earlier draft-era fixed-name refresh cookies cannot renew after this update. Those sessions need a fresh sign-in. There is no fallback to the shared cookie, and no database migration is required for this change.

POST /api/auth/refresh requires that session-specific HttpOnly refresh cookie and the last signed access token in Authorization: Bearer. It returns an access token and expiry timestamps, rotates the cookie, and never returns the refresh secret in JSON. Invalid/revoked/expired sessions return 401, a consumed receipt returns 409 SESSION_REFRESH_CONFLICT, and store failures return 503.

POST /api/auth/logout accepts the last signed access token, including after its access expiry, and the browser cookie. It is idempotent for already revoked sessions. For a signed session it returns ok only after database revocation and clears only that session's cookie name. Without a signed access token it returns an idempotent ok without revoking a session or sending cookie deletion headers. Do not implement sign-out by deleting localStorage alone.

Owner/staff/admin private routes require database-backed session JWTs. Older stateless JWTs must sign in again; there is no insecure compatibility bypass. The browser SDK coalesces refreshes per session, retries a protected request once after refresh, preserves idempotency bodies/keys, and keeps private UI/billing identity stable across access rotation.

Per-IP login/recovery counters survive process restart on the same SQLite store. This does not establish global limits across deployments with separate stores.

Email provider setup is described in ../auth-email-20260929/SETUP.md. No production credentials or private databases are backed up into GitHub.
