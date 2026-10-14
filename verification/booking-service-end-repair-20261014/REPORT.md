# Booking service-end repair — 2026-10-14

Published checkpoint: repaired local controls and relevant existing regressions pass; exact-SHA hosted qualification pending when this document was committed. The final observed hosted result must be reported separately with its run/SHA. Not merge or release clearance.

Performed personally by Codex, the primary GPT-based assistant; no subagents. Precise underlying model identifier is not exposed. No specification, public-page, engine, Price Book, dependency or workflow change. Synthetic data/provider adapters only.

## Base and scope

Remote candidate branch `claude/release-candidate-20261013m` and peeled `rc-20261013m`: `95e1631f42461ca8ae7d46d859940bffc302d155`. Annotated object: `7c7e5a9363ed7113ea8969cdd3e400f58b1b538f`. Verified with `git ls-remote` before work and `git cat-file`/`rev-parse` in a fresh checkout. Repair branch `codex/booking-service-end-repair-20261014` did not exist; it starts from that exact commit.

Read AGENTS, BUILD_STATUS, applicable booking/platform/voice sections, BILLING_LIFECYCLE_20261007 and the four controlling October 10/11 owner approvals. The service-end rule stops widget access. No specification or owner wording is changed.

## Baseline and corrections

The supplied original audit ZIP is available and unchanged; its SHA-256 is `39b0a1597a1814b372ff558b8cb4a1baeb90ff60fd5f6870961aff80bcc05ced`. Its probe and command records were inspected. It is not recursively repackaged here.

`05-baseline` ran the original probe before production edits and reproduced 403 availability versus 200/CONFIRMED status, one recovery creation and one outbox event. Subsequent controls established a limitation in that fixture: the production billing-evidence trigger changes an unsupported initial `active` insert to `pending_payment`. Therefore the original claim of an initially entitled account is corrected; the old bytes remain preserved.

`baseline-entitled.mjs` adds synthetic billing verification, updates active state, and asserts the centralized entitlement decision before preparing the booking. It was run in a separate untouched detached worktree at the exact base, using the same lockfile-installed dependencies. `08-entitled-base` reproduced the unauthorized creation: exit 1, no signal, 07:58:21 UTC. Current owner access was proved active before dispatch; after service end the provider reported the saved event absent, then received listBusy/createEvent. The appointment became CONFIRMED and one notification was inserted. This is service reconstruction over persisted SQLite, not a process restart or duplicate-event finding.

The identical corrected probe on repaired source (`10-entitled-repaired`) exited 0: public status 403/BOOKING_UNAVAILABLE; no provider calls; unchanged PENDING_PROVIDER appointment; zero outbox events.

Two intermediate regression executions are preserved rather than hidden. `06-new-regression` had 17 setup failures because the appointment-request fixture used a generic service ID instead of required `voice-appointment`. `07-new-regression-corrected` had 6 passes, 6 failures and 5 cancellations: the billing fixture lacked verification, and the first implementation query omitted the explicit ownerId token required by usageOwnerQuery. Sources, diffs, complete outputs and corrections are retained. No passing assertion was weakened, and no failed execution is called PASS.

## Repair

- `server/src/bookingRoutes.js`: apply existing requireBookingAccess to public confirmation polling, retaining token, tenant, origin, rate-limit and handle behavior and the existing 403 wording.
- `server/src/bookingService.js`: missing-event recovery reads the current persisted owner with an owner-bound query and calls centralized hasOperatorAccess with the current service clock. Check after getEvent, and read/check again after listBusy immediately before createEvent. Denial returns existing pending uncertainty without releasing a slot or discarding receipts. Already-dispatched writes and existing-event reconciliation retain their completion behavior.
- `test/bookingServiceEnd20261014.spec.mjs`: 17 bounded controls using migrated SQLite, real registered HTTP routes and synthetic calendars. Every fixture has a legitimate owner and synthetic verified billing evidence. Explicit database close/reopen is distinguished from a process restart.
- `test/bookingService.spec.mjs`: existing recovery fixture gains a production-schema owner and synthetic billing evidence; all existing assertions retained.
- `verification/tenant-isolation-20261007/route-sources.json`: only the reviewed bookingRoutes source hash changes. No route/middleware matrix or denial expectation is relaxed.

## Validation at this checkpoint

Node 22.23.3, npm 11.9.0, Git 2.51.1. Fresh npm ci and npm run build passed before tests. Build-generated index.html asset-reference differences are preserved as evidence and excluded from the repair commit.

New regression: **17/17**, zero failures/cancellations/skips/TODOs (`09-new-regression-entitled`, exit 0/no signal).

Controls cover: service already ended; expired trial; lost booking plan; one millisecond before versus at service end; deadline/plan loss during getEvent and listBusy; active same-ID recovery/concurrent polling; exact receipt and notification idempotency; existing event/already-confirmed appointment; lookup uncertainty; database reopen with entitled/expired owners; original/recovery writes dispatched before expiry finishing afterward; tenant/origin/token/handle refusal and unaffected other-owner access.

Relevant existing booking/calendar/plan/billing lifecycle and full-server tenant tests: **497/497**, zero failures/cancellations/skips/TODOs (`11-existing-focused`, exit 0/no signal, 07:59:55–08:00:13 UTC). Its exact 20-file selection and complete output are preserved. New and existing totals overlap the future broad suites and must not be added to them.

Hosted qualification on this published checkpoint is pending. Repair-branch CI is not candidate-m qualification: candidate-specific steps and tagging jobs conditionally skip. No tagging entry point will be run by this task. A report that says pending records its commit-time state, not a later observed CI failure or pass.

## Evidence and limits

Evidence contains exact commands/cwd, allowlisted PATH/TMPDIR, runtime, UTC start/end, exit/signal, complete stdout/stderr, source copies/diffs and hashes. `INVENTORY.json` and `SHA256SUMS` explicitly identify the bounded evidence and changed source hashes. Temporary SQLite databases, volumes and WALs are not packaged. Existing original archive remains untouched. Historical restore observations are outside this repair; no historical reproduction or full/quote local campaign was started.

Local browser/Docker assertions are not claimed; exact-final-SHA hosted evidence is required for broad full/quote/browser/Docker results. Live providers/deployed acceptance remain outside scope. Candidate assembly, tagging and four independent clean scope votes follow separately.
