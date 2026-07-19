# Build Status — Off The Clock AI

## Phases
- [x] Phase 0 — Skeleton (repo, DB, auth, admin shell)
- [x] Phase 1 — Quote engine + test suite
- [ ] Phase 2 — Price book + onboarding
- [ ] Phase 3 — Voice runtime (Twilio + Gemini)
- [ ] Phase 4 — CRM, quote pages, SMS automations
- [ ] Phase 5 — Public site + demo agents
- [ ] Phase 6 — Widget, Stripe billing, production hardening

## Gate status
Update this file when each gate passes. Format:
Phase N gate passed — [date] — [what was tested]

Phase 0 gate passed — 2026-07-19 — Live run in audit sandbox:
register + login return JWTs; all 8 CREATE TABLE statements
executed in SQLite; JWT middleware attaches ownerId; role
gating verified (owner 200 on /dashboard, 403 on /admin, 401
with no token); rate limit blocks after 5 failed attempts
(successful logins exempt); admin login rate-limited;
duplicate-email registration returns 409 without crashing the
server; malformed reset-password returns 400; /api/schema
hidden when NODE_ENV=production; client builds clean via Vite
with flat-color design system (no gradients).

Phase 1 gate passed — 2026-07-19 — Audited externally across
1990e5d, 087ea0e, 5bed399, a24fc08, 76e48c1, 580bbb8: 34/34
hand-calculated tests reproduced cold; build guide Tests 1 & 2
verified to the cent against independent spec arithmetic
(concrete waste bug found and fixed en route); minimum-fields
zero ruling implemented in engine + pricebook validation; ADDON
skip-plus-disclosure verified on owner and customer paths
(disclaimer survives sanitizeForCustomer; no false disclosure
when priced); users.ownerId CHECK constraint rejects staff
without owner and owner with owner at the DB; legacy users
table rebuild migration preserves rows and installs the
constraint; staff tenantOwnerId scoping verified.
