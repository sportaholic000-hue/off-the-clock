# Owner dashboard repairs

Pinned base verified: `codex/audit-small-repairs-20261007` at
`4db13a2945193762bbc4b85f9ab616a00e1dd067`. Branch: `fix/owner-dashboard`.
No subagents, deployments, merges, real calendars, real email or caller messages
were used for this work. All reproductions use temporary/in-memory synthetic
databases and injected fake providers. The governing amendment is
`specs/OWNER_DASHBOARD_20261007.md`.

## Before edits: source and execution

1. **Confirmed booking owner alert:** base `ownerAlertSchema.js` has triggers
   for leads, quotes, requested times, urgency and completed calls, but none for
   confirmed appointments; `ownerAlertService.js` has no confirmation source.
   A real booking-service confirmation with a fake calendar produced zero
   `booking.confirmed` alerts (expected one), including replay. Independent
   actual HTTP confirmation likewise produced no dashboard booking alert.
2. **Call billing/transport:** base `ownerCallService.js` list/detail SELECTs
   omit stored `minutesBilled` and `transportOutcome` and hide the provider IDs.
   Service and actual HTTP tests set stored billed minutes to 3; both returned
   undefined. The component omitted the corresponding labels and values.
3. **Call search/filter/discovery:** the base rejects every list query key
   except offset. A transcript search failed with `Unsupported call filter`;
   actual HTTP returned 400. Existing per-call transcripts were independently
   verified to work; they were retained and given search/discovery and text/PDF
   export controls instead of claiming the entire transcript implementation was
   absent.
4. **Review/follow-up/progression:** base `quoteDoneRoutes.js` only mutates
   lead dismissal/reopen, and `quotedone.jsx` only renders stored records plus
   dismissal. No durable owner action or reviewed-receipt operation exists.
   Actual HTTP review returned Express's missing-route response; components
   lack the corresponding action forms. New tests now exercise source receipt
   preservation, reviewed quote creation, owner event progression, stale and
   repeated requests, role/tenant boundaries and transactional rollback.
5. **Reporting:** base `ownerCallService.dashboard` returns lifetime counts
   only; there is no report route or period, structured-hours, money or service
   funnel calculation. Actual report HTTP returned a missing-route response.
   Synthetic component checks expose only lifetime counters at base. New tests
   exercise the exact prewritten amounts in `EXPECTATIONS.md`, DST repeated
   hours, all-period cohort semantics, invalid receipts, duplicate appointments,
   unpriced/site-visit bookings, multiple currencies and tenant isolation.

The baseline run had **10 tests, 0 passed, 10 failed, 0 skipped**. These are
pre-fix regression failures, not a production test result. The first completed
repair run passed 15/15; expanded direct/HTTP/render checks passed 43/43.
The explicit endpoint matrix plus expanded regressions passed **292/292**,
zero failures, cancellations, skips or TODOs, before the final cold gates.

## Changes

- Atomic, idempotent booking confirmation alerts with a frozen confirmation
  snapshot; owner email via the existing durable worker and dashboard links.
- Stored call minutes and transport identifiers; composable tenant-scoped
  search/filters; per-call transcript text download and browser PDF printing.
- Versioned, idempotent owner action history; reviewed receipts preserve source
  evidence; follow-up deadlines and quote progression with explicit event
  attestation. Final invoices and price review are owner-only.
- Reports and dashboard period controls, exact qualified monetary groups,
  configured business-hour reporting and service call cohorts/conversions.
- Production caller SMS disabled, SMS declaration removed, no caller reminders
  or invites added; historical delivery records remain readable.
- Four new authenticated routes added to the explicit adversarial tenant matrix
  and source inventory. Branch included in the cold CI allowlist.

Final cold and hosted gate evidence will be recorded after execution.
