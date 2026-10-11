# Candidate h merge review — 2026-10-11

Inputs confirmed with git ls-remote before work:
- base: 8973f429df487c58f3ad7a49bfdb35ebbb9a274a
- day-90: 04ef98aa44625e6a2e7fb4e1cc74f4691ac1f40b
- billing/staff/scanner: 0939ae3c8b17ad9c1529d1420e8bbb128bb4913c

Merge order: day-90, then billing/staff/scanner, both with two parents.
First merge was clean. Second merge had exactly three conflicts:

1. .github/workflows/ci.yml: union of push branch names, including both fix/day90-erasure-20261011 and fix/billing-staff-scan-20261011.
2. server/src/ownerQueryExceptions.js: retain the union of all reviewed exceptions without duplicate keys. The day-90 schema extends the same installBillingLifecycleSchema exec; replace its obsolete signature with the reviewed combined CREATE TABLE signature, preserving its migration reason. Review two newly inventoried exec calls (backup VACUUM and retention secure_delete) as administrative database maintenance, with specific reasons. No scanner/assertion weakening.
3. verification/tenant-isolation-20261007/route-sources.json: retain day-90 source hashes and billing staffRoutes hash; compute the combined server.js hash only after route review below.

server/src/server.js merged automatically: both the shared auth recovery limiter injection and retention status callbacks/admin summary/503 survive. The shared volume-level retention lock and all callers remain byte-identical to the day-90 input. Staff token validation before bcrypt and atomic consume re-check remain byte-identical to the billing input.

## Route-source review

Only these four route-bearing sources differ from base:
- server/src/billingCustomerLifecycle.js: day-90 internals changed; lifecycle routes remain GET /api/billing/lifecycle, POST /api/billing/cancel, POST /api/billing/reactivate and GET /api/billing/export/:kind, all require owner authentication, tenant binding unchanged.
- server/src/offsiteBackups.js: GET /api/admin/backups/offsite still requires admin authentication; no path or role change. Include erasure status and return 503 for unfinished erasure.
- server/src/server.js: same route paths, authentication and roles. Inject the persistent auth recovery limiter into staff invitation acceptance. GET /api/admin still requires admin; includes retention status and returns 503 for unfinished erasure. Wire retention into the existing admin backup route. No global middleware inventory change.
- server/src/staffRoutes.js: same paths and roles. Public POST /api/auth/staff-invite/accept keeps origin validation and no-store, then applies the shared recovery limiter before service execution. Owner-only invitation management and owner/staff customers/email routes retain all existing guards.

Route matrix, middleware inventory, role assertions and selectors are unchanged. Hashes are evidence of these explicit reviews, not substitutes for the runtime matrix.

## Expected before running merge checks

Owner-query inventory: zero unlisted prepare/exec uses, zero unused exceptions, no duplicate keys. All scanner bypass tests pass. Runtime tenant matrix keeps the same registered routes, global middleware and role restrictions. Existing day-90 and staff regression tests must both pass on the combined source.
