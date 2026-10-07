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

## Validation and integration repairs

Local cold `npm ci` and `npm run build` passed. Local Chromium exits with
SIGTRAP before opening a page, so local browser failures are recorded as an
environment limitation, never skipped or counted as passing. The initial cold
strict run reported 2,646 tests / 2,574 passes / 72 failures / zero skips; the
full run reported 3,675 tests / 3,615 passes / 60 failures / zero skips.
The runs exposed the voice-guide digest update and three older production
voice tests that assumed caller SMS was enabled. The guide remains hash-pinned
with an explicit assertion for the new owner ruling. Voice tests now assert
that production refuses SMS without invoking a provider; the slow-provider
transcript test uses an injected fake call transfer instead. Focused voice and
owner checks subsequently passed 86/86 and 27/27, with zero failures/skips.
An isolated backup check passed after its initial transient failure; no backup
code or timing assertions were changed. Local catalog timing failures remain
part of the initial cold evidence and require the hosted cold gate.

The first hosted run, 37684455471 at `20d4ef1`, completed cold installation and
build, then exposed an owner-control browser regression: implicit select labels
included their option text, so exact label lookup failed. Explicit accessible
names were added to the owner action, review and period controls, with a
component assertion and the original end-to-end test retained. Its strict
summary was 2,662 tests / 2,657 passes / 4 failures / 1 cancellation / zero skips.
The full step did not run after this failed strict gate. No passing claim is
made for that run. The corrected focused component suite passed 4/4.

The second hosted strict run, 37685694728 at `b57496e`, passed call discovery,
owner review and full quote progression. Reports direct navigation failed:
`productionAssets.js` omitted `/reports` from its HTML page allowlist. An
independent loopback HTTP reproduction returned 404 instead of the owner shell.
The allowlist and its reviewed source digest were corrected; the new HTTP
regression also checks query strings, no-store caching and unknown-page 404s.
That strict run reported 2,662 tests / 2,659 passes / 3 failures / zero skips or
cancellations. The full step did not run after the failed strict gate.

The third strict run, 37686739433 at `0d988f0`, passed the direct page and staff
boundaries. Its remaining browser assertion read the loading state between the
initial month report and the requested all-time response. The test now waits
for that exact response and the all-time range label before reading values.
Its summary was 2,663 tests / 2,661 passes / 2 failures / zero skips or
cancellations. A fast browser regression step now precedes the unchanged strict
and full gates so integration failures surface immediately after the build.

## Passing cold hosted gates

Source/test/CI commit: `ed9d52937cb7a4e7e54d22620ff7191e76347092`.
[Run 37687674965](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37687674965)
completed successfully on October 7, 2026. The workflow removes installed
dependencies before `npm ci`, installs Chromium and builds the owner app/widget.

| Command or check | Result |
| --- | --- |
| `npm ci` | Passed cold |
| `npm run build` | Passed |
| Focused dashboard browser regression | 6/6 passed |
| `npm run test:quote` | 2,663/2,663 passed |
| `npm test` | 3,690/3,690 passed |
| Full-suite zero-failure checker | Passed |
| Production dependency audit | Zero vulnerabilities |

Every test summary reports zero failures, cancellations, skips and TODOs. Suite
counts overlap and are not a count of unique tests. The browser regression
executes the compiled owner app through the production static handler and real
authenticated HTTP APIs against temporary synthetic data. The final local
direct-page and explicit tenant-route regression run passed 248/248.

The base-to-branch ancestry and exact published Git tree were verified. This
result-recording checkpoint changes documentation only; final exact-head hosted
CI is independently checked before task delivery. No application source, tests,
test exclusions, thresholds or CI gates change after the passing source commit.
No main merge, deployment, real calendar, real email or caller message was used.
