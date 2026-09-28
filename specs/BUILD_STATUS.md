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
constraint; staff tenantOwnerId derivation verified at unit
level only.

Phase 1.1 (tenant + ADDON hardening) gate passed — 2026-07-19 —
Branch agent/phase-1-1-tenant-addon-hardening (9e464b8) merged
after external audit in a real Node environment: 45/45 tests
cold. Auth is DB-authoritative — independently attacked with
forged JWTs: deleted-staff, deleted-owner, role-flip
(owner->admin), forged-tenant, garbage, and expired tokens all
return 401; the pre-fix 200 on a deleted-staff token is closed.
Parent-role invariant enforced by 3 SQLite triggers, attacked
directly: staff under staff/admin parent rejected, owner
demotion blocked while staff reference it, staff repoint to
non-owner rejected. Migration runs integrity_check +
foreign_key_check + tenant-invariant validation: a seeded
legacy staff-under-admin row aborts the migration, a valid
legacy set migrates with all 3 triggers installed. ADDON
disclosure is per-option (STEP 2b/3/11/12): divergent tiers
verified — top-level disclaimer never claims an exclusion a
priced option includes; shared exclusions disclosed at top
level; single unnamed option uses unprefixed wording; no
"null tier" in output; customer sanitization preserves
per-option disclaimers and hides line items.


## QuoteDone audit repair candidate — September 27, 2026

Scoped QuoteDone audit repair gate passed — 2026-09-27 — candidate `codex/quotedone-audit-repairs-20260927`, based on preserved completion `9670fdb`. Runtime/application/regression ran at `f96c14a`; the complete browser group passed at `d218c85` after a test-selector-only correction. Application and engine bytes are identical between those commits. Real runtime, 8 application workflows, 5 browser workflows, 430 ordinary tests, 311 VNext tests, 46 Phase 1 tests, 22 original precision cases, 30 focused tests, 35 replay controls and the client build passed. Counts overlap. The current integration boundary passes; the historical no-import gate remains expected exit 1 for the authorized bridge. The accepted 19-file engine is unchanged. See [the repair report](../docs/quotedone-completion/REPAIR_REPORT_20260927.md), [current status](../docs/quotedone-completion/REPAIR_STATUS_20260927.json) and [verified evidence index](../docs/quotedone-completion/REPAIR_EVIDENCE_INDEX_20260927.json). This is not a pass for the whole unfinished Phase 2–6 scope.

The owner now requires a callback contact for every estimate request. Supported measured inputs may quote; untriaged additional scope/unknowns and unsupported contracts require review. Both fencing services, exterior painting and CUSTOM remain wholly review-only. Operator CRM access is separate from QuoteDone pricing permission.

The running production build, live data, provider integrations, published public pages/demo, backup restoration and multi-instance operation have not been accepted by these local tests. See `../docs/quotedone-completion/REPAIR_CONTRACT_20260927.md` and `OWNER_DECISIONS.md` for governing rules and capability limits.
