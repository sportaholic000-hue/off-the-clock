# Billing repair continuation — verified source

Source **d654f1edcc0ce62963bc8ae9369bd56bd31aac40**, tree **c4d95b49229b8fb4030068895e3516628a9488a4**, on `codex/billing-core-repairs-20261006`. Started from verified **3d3b88c2b6b1be08453499ae0e827d28ea889c5a**. No subagents, main merge, deployment, live data or real provider operations. All accounts, payments, calls and SQLite stores used for verification were synthetic.

## What changed

- Applied the four specifically authorized old-test corrections. Their old expectations, governing rule/citations and required behavior were written before applying the previously tested patch in [FOLLOWUP_EXPECTATIONS.md](FOLLOWUP_EXPECTATIONS.md). The two existing billing files pass **29/29**. No other existing test file, CI gate, known-failure allowance, dependency manifest or lockfile changed.
- **F07 fixed in source:** bounded startup/periodic grace sweep, owner-scoped status reconciliation, atomic suspension/event/outbox writes and shutdown cleanup. Boundary, retry, rollback, multiple-owner batch and restart controls pass.
- **F08 fixed in source:** setup remains available inside valid seven-day grace, while the billing screen explains payment recovery. Expired, future and malformed failure times cannot unlock setup. Existing trial behavior remains intact.
- **F09 fixed in source:** authenticated product mutations reload the tenant owner's current lifecycle. Expired-grace/suspended accounts retain reads and billing/auth recovery. Staff use the owner's state. Existing read-only draft validation and explicitly documented canceled-owner webhook removal remain available; saves, approvals and new deliveries remain gated.
- **F10 repaired for newly observed calls:** durable per-call metering, per-call upward rounding, trial/current-period scope, exclusion of spam/fallback, exact-retry protection, conflicting-receipt rejection and signed provider-duration reconciliation. A 3,601-second synthetic call records **61 minutes**, finishes normally, and the next trial call takes fallback; trial overrun charge is **$0**. Completion after restart and late-close/fallback ordering are covered. New number provisioning supplies the duration-callback URL.

Each F07–F10 defect was confirmed in source and executed before fixes; see the `followup-baseline-*` artifacts. Correct-behavior tests use the `billingCoreRepair20261006` prefix. Hand expectations were written before their experiments. Implementation decisions, exact policy exceptions and provider references are in [FOLLOWUP_DESIGN.md](FOLLOWUP_DESIGN.md).

The migration adds `billingVoiceUsage`; it does not rewrite unrelated schema, fabricate historic provider durations or submit charges. Existing records remain intact. Local completion commits call state and metering together; signed provider duration can replace provisional local duration without adding it twice. Historical records lacking authoritative duration remain an explicit recovery limitation.

## Test counts and publication

**Hosted source run [37528441027](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37528441027) is fully green at d654f1e.** Exact metadata/steps are in [FOLLOWUP_HOSTED.json](FOLLOWUP_HOSTED.json), with selected log evidence in [followup-hosted-accepted.txt](followup-hosted-accepted.txt).

| Check | Result |
|---|---|
| Cold `npm ci` | Passed |
| `npm run build` | Owner app and widget passed |
| `npm run test:quote` | **2,072/2,072**, zero failures/skips/cancellations/TODOs |
| `npm test` | **2,908/2,908**, zero failures/skips/cancellations/TODOs |
| Known-failure check | Passed; list unchanged and empty |
| Production dependency audit | **0 vulnerabilities** |
| New continuation regressions | **37**: lifecycle/UI/access21; metering12; capability/provider2; actual server1; signed HTTP/WebSocket1 |
| Existing billing regression files | **29/29** |
| Existing owner integration tests | **39/39**, unchanged |
| Existing affected release guards | **4/4**, unchanged |
| Separate client billing transport checks | **7/7**, unchanged |

Targeted counts overlap the full suite; they must not be added to2,908. The strict suite is also a subset of the full suite. The seven client `.test.mjs` checks were additionally run locally because the full runner's selection is `.spec.js/.spec.mjs`.

Intermediate hosted failures were retained, not excused: the first checkpoint failed5 strict checks; the next passed all2,072 strict checks but failed1/2,907 full checks. Their causes were a new test filename conflicting with an existing selection invariant, the guard misclassifying read-only draft validation, and the guard blocking documented canceled-owner webhook removal. Those were corrected in new code/new tests; existing tests and gates stayed unchanged. An additional failing-before/passing-after regression fixed a late media-close race in the new metering implementation.

**Local limitations:** the final cold install/build passed. The final local quote run completed **2,035 passed /37 failed**, all37 failing at Chromium startup, with zero skips. The final local full run exited1 after154 completed tests without a final summary; it is **not** claimed as a pass or a complete test count. An earlier local full attempt completed2,869/2,907 with37 browser failures and the subsequently fixed webhook-removal regression. [FOLLOWUP_COLD_RUNS.json](FOLLOWUP_COLD_RUNS.json) records the final commands/exits. Compressed raw logs and SHA-256 bindings are in [FOLLOWUP_LOG_ARCHIVES.json](FOLLOWUP_LOG_ARCHIVES.json). Hosted CI provides the completed browser-inclusive gates; no test was skipped or gate loosened to obtain green.

GitHub source/tree were matched against the local staged tree and fetched back. `git merge-base --is-ancestor 3d3b88c HEAD` succeeds. [FOLLOWUP_SOURCE_BINDINGS.json](FOLLOWUP_SOURCE_BINDINGS.json) binds all21 changed application/test files to the tested source. Subsequent evidence-only publication preserves those exact source/test bytes.

## Not built — unchanged

- **Refunds:** self-serve guarantee/refund processing and refund-to-access policy; `/api/billing/refund` is absent and refund events have no supported state transition.
- **Overage:** paid allowance enforcement/meter submission and overage charging; this repair records minutes but submits no Stripe usage or charges.
- **Notifications:** billing lifecycle delivery and trial day-10/day-13 reminder worker; durable queued events already exist, but queuing is not delivery.
- **Offboarding:** cancellation wind-down, un-forwarding communications, timed full-export access and number release; existing limited CSV exports and cancellation entitlement changes are preserved.

No confirmed corruption of an implemented refund/overage/offboarding operation was established. The confirmed existing minute-recording and missing grace-transition defects belong to F10/F07 and are addressed above; absent capabilities were not built.

## Unfinished / limits

- Local browser startup and the incomplete local full-run result remain environment/execution limits, despite the fully green hosted run.
- Existing phone numbers still require the new `/api/twilio/voice/status` configuration during an authorized rollout. No live configuration was changed. Until a signed terminal receipt arrives, local connected duration is provisional, not proof of the full Twilio inbound-leg duration.
- Pre-existing zero-minute records with missing authoritative duration are not retroactively fabricated. Matching provider receipts can reconcile them; historical-provider recovery and permanent callback loss have not been established. Therefore F10 is not an unconditional claim that all historic deployed usage is already accurate.
- The four not-built capabilities above remain open. This batch does not establish launch readiness.
