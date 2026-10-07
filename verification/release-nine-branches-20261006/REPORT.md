# Nine-branch release integration — October 6, 2026

Base: `73c00622d6f2df31f57773b32e41355a7421f1a3`. Target: `codex/quote-release-candidate-20261006`.

No subagents, main merge, deployment or live data. Provider tests use synthetic credentials, local stubs and disposable storage.

## Ordered inputs

1. `fix/quote-display-defects-20261006` — `26f704b9b8e9f4d3837127716997366f7f899baa`. Actual `git merge-base --is-ancestor` exit: 0; missing parent test files: 0.
2. `feat/overage-and-minute-alerts-20261006` — `130db2148de05cb8b62f5a2595b98b635ce863cb`. Actual `git merge-base --is-ancestor` exit: 0; missing parent test files: 0.
3. `codex/trial-entitlement-policy-20261006` — `b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3`. Actual `git merge-base --is-ancestor` exit: 0; missing parent test files: 0.
4. `codex/named-review-contact-implementation-20261006` — `17101b0bde43d1ac4bb6506022070a7b1cb93535`. Actual `git merge-base --is-ancestor` exit: 0; missing parent test files: 0.
5. `fix/owner-alerts-delivery-20261006` — `a41c4de565d1beea14745335d96d5b0ae6c3b9cf`. Actual `git merge-base --is-ancestor` exit: 0; missing parent test files: 0.
6. `fix/voice-lifecycle-20261006` — `f2410f259a6361643bc490e6f127fc77ad426316`. Actual `git merge-base --is-ancestor` exit: 0; missing parent test files: 0.
7. `fix/caller-history-followup-20261006` — `46e7f3e19592a8d511a14a34e010e485fb68cbf3`. Actual `git merge-base --is-ancestor` exit: 0; missing parent test files: 0.
8. `fix/booking-calendar-20261006` — `4b6da1d767501847da1bf4aab81d0ed8368d7496`. Actual `git merge-base --is-ancestor` exit: 0; missing parent test files: 0.
9. `verify/backup-restore-rehearsal-20261006` — `fb7ae652d71610dfe940ed0678449c05c7a8fd1d`. Actual `git merge-base --is-ancestor` exit: 0; missing parent test files: 0.

Input 3 was already included by input 2; its ordered merge was a no-op. The other eight inputs have explicit two-parent merge commits.

## Every textual conflict

### feat/overage-and-minute-alerts-20261006

- `.github/workflows/ci.yml`: Union of both explicit branch triggers; retain all original gates.
- `specs/BUILD_STATUS.md`: Retain both complete historical verification records.

### codex/named-review-contact-implementation-20261006

- `specs/BUILD_STATUS.md`: Retain named-review-contact record plus all prior branch records.

### fix/owner-alerts-delivery-20261006

- `client/src/dashboard.jsx`: Keep MinuteUsage, OwnerAlerts, lead feed, manual refresh, and 30-second/focus usage refresh; apply mounted, generation and session identity guards to usage refresh.
- `client/src/quotedone.jsx`: Keep shared quote money formatter and DeliveryActions imports.
- `server/src/migrations.js`: Install both billing usage and owner-alert schemas; retain billing checkout recovery migration.
- `server/src/server.js`: One production voice installation receives both minute onUsage and SMS provider; register SMS status route and stop all five workers plus backups.
- `test/voiceQuotePathCases20261005.mjs`: Combined startup assertion requires both billing onUsage callback and SMS provider, retaining placeholder/start command checks.

### fix/voice-lifecycle-20261006

- `.github/workflows/ci.yml`: Union of all explicit branch triggers.
- `specs/BUILD_STATUS.md`: Retain complete lifecycle and all existing historical records.
- `server/src/voice/productionVoiceRuntime.js`: Combine billing meter/status routes/onUsage with lifecycle readiness, receipts, capture routes, real provider adapters, late prompt compilation, transcript flushing and recovery. Finish lifecycle before meter reconciliation; media close cannot finalize fallback capture.
- `server/src/voice/voicePersistence.js`: Retain terminal guard, durable recovery and open fallback capture; zero fallback minutes, preserve AI_FALLBACK exclusion when capture completes or restart recovers.
- `server/src/voice/voicePromptCompiler.js`: Use updated guide digest; retain confirmed named contact instead of business-name substitution, plus owner-set deadline rule once.
- `server/src/voice/voiceToolRuntime.js`: Keep durable SMS service and anonymous caller identity helpers.

### fix/caller-history-followup-20261006

- `.github/workflows/ci.yml`: Union all explicit branch triggers.
- `specs/BUILD_STATUS.md`: Retain caller-history and all prior verification records.
- `server/src/voice/productionVoiceRuntime.js`: Complete transcript/lifecycle capture, enrich with caller summary without overwriting lifecycle state, then reconcile metered usage.
- `server/src/voice/voiceToolRuntime.js`: Keep SMS and anonymous guards, add canonical customer/history helpers and bounded caller-filtered history; retain call-scoped anonymous customer fallback.

### fix/booking-calendar-20261006

- `.github/workflows/ci.yml`: Union all explicit branch triggers.
- `specs/BUILD_STATUS.md`: Retain booking/calendar and all prior historical records.

### verify/backup-restore-rehearsal-20261006

- `.github/workflows/ci.yml`: Union all explicit branch triggers.
- `specs/BUILD_STATUS.md`: Retain backup/restore and all prior historical records.

Branches 1 and 3 had no textual conflicts. No tests were removed. Existing test changes preserve their behavior checks while adapting the composed interface: the startup assertion requires billing and SMS; the trial-cap test requires capture before forwarding; the SMS adapter test requires a queued provider receipt to remain pending.

## Cross-branch integration repairs

- Lifecycle persistence, summary enrichment and recovered lead creation share a transaction. Summary failure cannot mark a call complete. Metering then reconciles provider-confirmed duration without erasing lifecycle state.
- Fallback capture and restart retain zero billable minutes even after lifecycle completion; late media cleanup cannot finalize an unfinished fallback.
- Caller summaries recognize both CONFIRMED tool receipts and CONNECTED warm-transfer receipts; an accepted handoff cannot regress to INFO after media cleanup. The new production-flow test reproduced INFO before this fix.
- Named-contact HTTP/browser fixtures now seed verified synthetic billing evidence. The stricter mutation guard is unchanged; a new negative test proves pending-payment owners cannot save contacts or request AI drafts. Existing voice fixtures update the shared billing row rather than inserting a duplicate.
- Canonical customer lookup still joins normalized phone numbers, while anonymous/legacy capture retains call-scoped identity and never returns anonymous history.
- Durable SMS keeps the prepared message, provider ID and receipt callback; queued acceptance never becomes a false sent claim.
- Dashboard retains the five-second lead feed and 30-second/focus usage refresh, with session, generation and unmount guards.

## Owner rulings and version

- Callback/quote deadlines come only from explicitly applicable owner-set saved policies. The prompt authority contains the rule once and retains the configured review contact.
- Overage is 35 integer cents per minute; the durable threshold set is 60, 30 and 0 minutes left, once per billing month.
- Annual base is charged in full at trial end; minute allowances reset each monthly anniversary. The selected-plan trial decision file appears once.
- Every input has `quote-engine-vnext-date-context-20261006-v7`. That highest version and its runtime pin are retained. The combination changes no quote formula or arithmetic policy; fallback exclusion and per-call ceiling preserve the already approved billing arithmetic.
- `.github/known-test-failures.txt` remains the empty blob. No gate allowances or skips were added.

## Prewritten integration checks

61 seconds → 2 billable minutes. Fallback capture/restart → 0. Summary failure rolls back lifecycle and recovered lead. Transferring calls stay transferring. Two anonymous callers retain distinct customers and no shared history. Named contact and owner-set deadlines coexist. An accepted warm transfer stays TRANSFERRED after summary enrichment. Eight new checks are in `test/releaseIntegration20261006.spec.mjs`.

## Local verification and hosted publication

Node 22.23.3 cold `npm ci` passed (262 packages). `npm run build` passed both owner and widget builds. Production audit found 0 vulnerabilities. Focused integration run: 111 tests, 111 passes, 0 failures, cancellations, skips or TODOs. The final warm-transfer correction passed 56/56 focused lifecycle/summary/integration tests with zero failures or skips. The local full run stalled without a complete summary and was interrupted; it is not a passing gate. The first strict local run completed 2,325 tests: 2,272 passes, 53 failures (50 missing-browser setup failures and three named-contact fixture entitlement failures), zero skips. The fixture correction and contact/voice/integration controls then passed 16/16. Hosted verification is reported against the final published SHA in the task completion report.

Earlier attempts: Node 24 install failed compiling better-sqlite3; the initial Node 22 test command lacked a usable `/tmp`, corrected by using workspace TMPDIR. The first executed focused run had 97 passes/7 failures from anonymous customer-function registration; repaired and rerun 111/111. Chromium download failed with truncated archive and directory-lock errors, so local browser prerequisites remain unavailable. These are disclosed, not passing gates.
