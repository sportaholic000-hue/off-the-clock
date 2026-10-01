# Session security implementation plan — September 30, 2026

Owner authorization: finish the remaining account-security lane, then move to voice runtime and phone-to-calendar integration. Coordinate with “quotedone engine accuracy” and save all source/test/review checkpoints to GitHub.

Current account checkpoint: 71b667d89467aed3a1c31c94ca97b49fe9b12d89 (draft PR #4).
Verified engine/booking checkpoint: 06c6fbeec94e3c87040964c24a7a0f45f2837e2d (draft PR #3).
The other agent confirmed it has not changed auth, session handling, migrations/schema or server wiring and has finished its runtime edits pending review. Its final evidence/status update will be preserved when integrating.

## Implementation decisions

- Preserve the existing eight-hour absolute session maximum. Use short-lived access JWTs and server-side session records; refresh does not extend the absolute deadline.
- Store only hashes of opaque refresh tokens. Use an HttpOnly cookie, Secure in production, with exact trusted-origin checks and credentialed CORS only for configured owner origins. Public widget traffic continues to omit credentials.
- Rotate refresh tokens atomically; handle simultaneous refresh requests without treating another tab's successful refresh as a password reset or logout.
- Validate every access token against the live session, current account role/tenant and credential fingerprint. Reset passwords and revoke all sessions atomically. Logout revokes the current session.
- Existing stateless JWTs require a new login after this upgrade. Do not silently accept an unrevocable legacy token.
- Persist bounded login and recovery counters using the application database, with atomic reservations for concurrent login attempts. Only digests of limiter identities are stored. Shared counters require processes to use the same application database; independent replicas with separate databases are not a supported shared limiter.
- Keep signup pending_payment and existing billing/tenant permissions intact.
- Add separate auth tables through a narrow migration hook; do not alter pricing, booking, calendar or voice records.
- Check frontend refresh/logout behavior against billing request identity and multi-tab changes so refreshing credentials does not resubmit a billing operation.

## Evidence required

Tests must cover exact expiry, replay, rotation races across database connections, password-reset revocation on every device, current-session logout, deleted/role-changed/reparented users, admin credential changes, reset/login races, process-style restart, durable rate limits, hostile origins/cookies and failures of the session store.

Run account/application regression and real browser recovery/refresh/logout workflows on the integrated checkpoint. Save failing attempts and final results, identify the tested source, read GitHub files back, and publish a reviewable draft. No full launch gate may be claimed from this slice.

## Later voice lane

Start only after this account slice is verified. Reconcile implementation against the original 459-line voice guide and the latest verified pricing/booking contracts. Confirm ownership with the other agent first. Real calls, messages, calendar writes, provider changes and deployment retain their separate authorized acceptance gate.

Status: planning checkpoint only; session changes are not implemented or verified yet.
