# Caller history and follow-up repairs — assigned findings fixed

Hosted cold gates passed at exact application/test/CI source
**e9590d46e95d6ad44e16201d720c43e3d7fc2505**, tree
`771ba8295223ec186efd1a0540dbc29b34daa5a7`.

Base verified: eaadeca0856f1bd7fcade8685711a19aefd786d0.
Branch: fix/caller-history-followup-20261006. No subagents, merge, deployment or live data.

All five assigned defects reproduced in source and execution before changes.
Prewritten expected behavior and stored dollar amounts: EXPECTED.md.
Baseline core tests: 0/4; signed-call summary: null; corrected web baseline: no customer.
The first web fixture included a prohibited pricing-time name; that fixture error
is retained in baseline-web-live.tap and corrected in baseline-web.tap before repair.

- D14: customerHistoryService filters caller identity inside tenant-bound SQL before
  LIMIT 5. Legacy duplicate customer IDs retain booking visibility; contradictory
  or foreign customer links are excluded. No unrelated tenant-wide LIMIT remains.
- D15: runtime and dispatcher agree on greetingName/address and bounded, allowlisted
  open leads, saved quote ranges/status and quote request descriptions. Values come
  from stored receipts; no recalculation, internal rates or tenant identifiers.
- D16: shared customerIdentityService resolves exact normalized international phone
  within the producer's IMMEDIATE transaction. Handles no longer define customers.
  Web/voice submissions link the durable customer; secret rotation, concurrent
  processes and retries reuse it. Names/emails never deduplicate. Public web contact
  does not authenticate anyone or overwrite an established customer's information.
  Numbers with no explicit country prefix remain separate, rather than guessing.
  Legacy duplicates/receipt IDs remain intact; lookup supports their phone binding.
- D21: REQUESTED preferences remain in the calendar request list regardless of date;
  resolved historical requests still follow the selected date range. No request is
  auto-booked, resolved or deleted because its preferred date passed.
- D24: production call completion atomically stores an extractive summary, semantic
  outcome from saved records, and separate transportOutcome. Summary uses attributed
  verbatim transcript excerpts, skips unfinished/system/tool turns, and makes no
  payment, booking or callback promises. Empty transcripts produce no invented text.
  Existing owner Calls/feed displays this saved text. No generative/provider call.

Source/test map (all paths relative to the repository):

| Finding | Production | Regression |
|---|---|---|
| D14 | server/src/customerHistoryService.js:8; server/src/voice/voiceToolRuntime.js:getCustomerContext | callerHistoryFollowup20261006.spec.mjs: older booking, per-caller limit, duplicate/contradictory/foreign IDs |
| D15 | server/src/customerHistoryService.js:14; server/src/voice/toolDispatcher.js:getCustomerContext | core saved ranges/projection/foreign joins/malformed entries; Web history |
| D16 | server/src/customerIdentityService.js; server/src/leadCaptureRepair20261006.js; server/src/quoteDoneRoutes.js; server/src/voice/voiceToolRuntime.js | core rotation/distinct contacts/rollback; Web concurrency/restart/receipt rollback |
| D21 | server/src/ownerCalendarService.js:82 | core past/future/resolved; actual Http owner/staff calendar |
| D24 | server/src/callSummaryService.js; server/src/voice/productionVoiceRuntime.js:onSessionEnd; schema.js/migrations.js | Live signed call; Summary extraction/migration/rollback; Http owner rendering |

Regression file names have the `test/callerHistoryFollowup20261006` prefix.

Migration: one additive nullable calls.transportOutcome column, installed on fresh
and existing stores by the normal migration path. Repeated migration preserves
transcripts. No production migration/backfill performed; lost historical transcript
content is not reconstructed. Customer identity is resolved lazily without deleting
legacy rows or rewriting old quote receipts. Atomic failures roll back; retry recovers.

Verification checkpoint: 61/61 focused checks, zero failures/skips. Includes 24 new
regressions, real signed HTTP/WebSocket call, actual authenticated owner/staff routes,
owner rendering, separate-process concurrency/restart, foreign links and rollback.
Earlier focused failure exposed Node SQLite isTransaction vs better-sqlite3
inTransaction and was fixed in source; the original regression expectation remains.
A repeated test fixture CallSid collision was corrected without changing product expectations.

A final malformed saved-option regression exposed null optional entries breaking the
new history projection. It was reproduced against the checkpoint, repaired by
rejecting only malformed optional entries, and retains the exact valid saved range.

## Completed verification

[Hosted run 37541872461](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37541872461)
completed successfully at the exact source SHA above. Cold `npm ci`, `npm run build`,
`npm run test:quote` (**2,168/2,168**) and `npm test` (**2,551/2,551**) passed;
both suites report zero failures, cancellations, skips and TODOs. The existing
production dependency audit reports zero vulnerabilities and known-failures list
is empty. [Counters and run binding](hosted-results.json),
[case/counter log excerpts](hosted-results-excerpt.log), and
[all 18 changed source/test/CI hashes](source-revision.json) are retained.
The first checkpoint also passed hosted gates; it is superseded by the malformed
optional receipt correction and this exact-source verification.

Local cold install/build passed. Focused verification: **61/61**, including all
**24 new regression tests**, zero skips/failures. These counts overlap the complete
suites and are not additional to them. The full local run reports 2,505 passed and
39 failed (2,544 records), zero skips; every failure is a Chromium launch failure.
The final local strict attempt exited 1 without a complete TAP summary after 37
observed Chromium launch failures. It is not counted as a passing or completed
local gate. Browser-failure parents prevent some nested cases from running locally;
complete hosted counts therefore differ. Full original outputs are retained in
`cold-full.log.gz` / `cold-quote.log.gz`, with machine-readable summaries and
command exit codes. Initial-checkpoint logs are separately prefixed `checkpoint1-`.
No tests, assertions, skips, timing limits or failure allowances were weakened.
The CI change adds only the exact requested branch to the existing push trigger.

Unfinished assigned findings: **none**. This is not a broader voice lifecycle,
identity-authentication, billing, delivery or launch-readiness claim. Existing
shared/reassigned phone ambiguity is not resolved by guessing from names/email;
phone matching does not prove a human identity or confer account authorization.
No historical customer rows or pricing receipts are deleted or destructively merged.
No production migration, calendar/provider operation, merge or deployment occurred.
