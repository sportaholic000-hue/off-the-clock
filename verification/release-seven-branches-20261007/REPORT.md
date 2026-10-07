# Seven-branch release integration

Base and target: `codex/quote-release-candidate-20261006` at `109f68722dc399ba2e8ffa8bae7ad7fbda951e0a`. The active agent performed the integration alone. No main merge, deployment, live data or real providers.

## Inclusion and policy

The seven pinned commits are ordered merge parents, not squashed copies: `4db13a2`, `2f89e6e`, `87ce8b7`, `4891365`, `5a2a80f`, `d699f4c`, `ad951a4`. Every local ancestry check returned zero. Published objects are checked against the local tree and ancestry again after ref update.

Owner ruling controls conflicting behavior: no SMS tool, sender, status route, worker or settings UI remains. Historical SMS tables are inert migration/retention evidence; pending work is cancelled. The receptionist gives booking confirmation verbally; the owner gets dashboard/email alerts. Only caller-requested quote email is supported, after address read-back, correction and confirmation. Frozen spoken qualifications and secure tenant-bound links are retained.

## Every textual conflict

Steps 1 and 2 merged without textual conflicts. All remaining conflicted file occurrences follow; the raw list is `conflicts.json`.

| Merge | File | Resolution |
|---|---|---|
| 3 / `87ce8b7` | `.github/workflows/ci.yml` | Union of both push allowlists; all gates retained. |
| 3 / `87ce8b7` | `server/src/voice/toolDispatcher.js` | Accept complete bounded narration AND saved scope qualifications; neither is truncated. |
| 3 / `87ce8b7` | `server/src/voice/toolSchemas.js` | Add calculateListedPrice alongside prepareQuoteEmail/sendQuoteEmail; sendSms stays absent. Preserve scope-confirmation fields and the nonmutating listed-price classification. |
| 3 / `87ce8b7` | `server/src/voice/voicePromptCompiler.js` | Retain exact spoken/email narration, add historical qualifications and server-only listed arithmetic; preserve scope-token confirmation. |
| 3 / `87ce8b7` | `server/src/voice/voiceQuotePresentation.js` | Keep projectSavedQuoteContext and full quoteNarration. Do not restore the obsolete SMS formatter. |
| 3 / `87ce8b7` | `server/src/voice/voiceToolRuntime.js` | Keep listed-price calculation import/handler and quote-email prepare/send handlers; no SMS import/handler. |
| 4 / `4891365` | `.github/workflows/ci.yml` | Union of both push allowlists. |
| 4 / `4891365` | `client/src/deliveryActions.jsx` | Quote email recipient/status labels plus owner-local timestamps. |
| 4 / `4891365` | `server/src/ownerAlertService.js` | Retain appointment alerts and add unreadable-quote-storage owner alerts. |
| 4 / `4891365` | `server/src/voice/voicePromptCompiler.js` | Combine lead-backed general appointments with requested quote-email read-back and verbal-only booking confirmation. |
| 4 / `4891365` | `specs/BUILD_STATUS.md` | Preserve both evidence histories in verification patches, then restore the entire specs tree to 109f687. |
| 4 / `4891365` | `verification/tenant-isolation-20261007/route-sources.json` | Review merged route sources and regenerate final hashes; neither branch hash alone describes merged source. |
| 5 / `5a2a80f` | `.github/workflows/ci.yml` | Union allowlists; retain bounded Playwright/Chromium setup and mandatory launch probe, with system dependencies installed only if necessary. |
| 5 / `5a2a80f` | `client/src/calls.jsx` | Spam controls and throttling notice alongside owner-local timestamps. |
| 5 / `5a2a80f` | `server/src/billingCustomerLifecycle.js` | Union blocklist and quote-email erasure tables; keep inert historical notification cleanup. |
| 5 / `5a2a80f` | `server/src/demo/demoInstructions.js` | Use the corrected, narrower current-product claims, dashboard/email owner updates and no-text rule. |
| 5 / `5a2a80f` | `server/src/ownerAlertService.js` | Keep repeat-caller notices AND callback contact-correction alerts. |
| 5 / `5a2a80f` | `server/src/ownerCallService.js` | Return spam/block permissions AND owner timezone. |
| 5 / `5a2a80f` | `server/src/server.js` | Retain quote-email service and add platform voice admission status; no SMS imports and no obsolete A2P UI section. |
| 5 / `5a2a80f` | `server/src/voice/productionVoiceRuntime.js` | Combine admission checks and persistent circuit breaker with confirmed OFF human routing, saved voices/greeting and corrupt-book recovery. Spam rejection takes precedence and is never recorded as a human-forwarded call. |
| 5 / `5a2a80f` | `verification/tenant-isolation-20261007/route-sources.json` | Review combined routes and regenerate final hashes; omit the deleted SMS provider. |
| 6 / `d699f4c` | `.github/workflows/ci.yml` | Union of both push allowlists; keep the newer Chromium setup. |
| 6 / `d699f4c` | `client/src/calls.jsx` | Keep blocklist/mark-spam controls, search/date/service/status filters, transcript export, stored billing/transport fields and owner-local times. |
| 6 / `d699f4c` | `client/src/ownerAlerts.jsx` | Booking-confirmed label, unreadable-price-book notice and owner-local timestamps all retained. |
| 6 / `d699f4c` | `server/src/ownerAlertService.js` | Frozen confirmed-booking source, repeat-caller notices and corrected lead contact source all retained. |
| 6 / `d699f4c` | `server/src/ownerCallService.js` | Use richer tenant-scoped filtered list and hidden-by-default spam, while adding owner timezone to every row and retaining blocklist controls. |
| 6 / `d699f4c` | `server/src/server.js` | Compose owner report/workflow routes with quote-email and voice admission services. Do not reintroduce a disabled SMS worker. |
| 6 / `d699f4c` | `server/src/voice/productionVoiceRuntime.js` | Retain saved voice/greeting, admission and the email-enabled no-text prompt. Omit the older blanket no-email policy because requested quote copies are allowed. |
| 6 / `d699f4c` | `server/src/voice/voiceToolRuntime.js` | Keep prepareQuoteEmail/sendQuoteEmail; reject the older sendSms implementation entirely. |
| 6 / `d699f4c` | `server/src/voiceSmsService.js` | Modify/delete conflict: retain deletion, as required by owner ruling. |
| 6 / `d699f4c` | `specs/BUILD_STATUS.md` | Preserve both evidence histories in verification, then restore to 109f687. |
| 6 / `d699f4c` | `test/voiceLifecycle20261006.spec.mjs` | Retain BOTH SMS-rejection tests as separate cases; combine slow fake-transfer checks with caller-specific fake IDs. All four removed templates remain tested. |
| 6 / `d699f4c` | `verification/tenant-isolation-20261007/route-sources.json` | Review merged routes and regenerate final hashes; preserve both route-matrix additions. |
| 7 / `ad951a4` | `.github/workflows/ci.yml` | Union of both push allowlists. |
| 7 / `ad951a4` | `server/src/server.js` | Stop quote-email and other workers before final continuous backup checkpoint; retain drain-aware close handling. No SMS worker. |
| 7 / `ad951a4` | `specs/BUILD_STATUS.md` | Preserve all evidence histories in verification, then restore to 109f687. |
| 7 / `ad951a4` | `verification/tenant-isolation-20261007/route-sources.json` | Review billing, backup and server route changes and regenerate final hashes. |

## Semantic overlaps resolved

- Two confirmation producers initially created three owner emails for one confirmation plus one change. The appointment transaction now owns the single frozen confirmation; the older outbox confirmation trigger is removed, while booking-change alerts and historical alert rendering remain. The unchanged no-SMS regression now passes its exact two-email assertion. Dashboard confirmation/replay/rollback tests remain.
- The engine regression imported the SMS fixture removed by the no-SMS branch. It now uses the equivalent synthetic quote-email fixture; all scope, amount, history and arithmetic assertions remain.
- Two owner-dashboard policy regressions previously expected a disabled-but-present SMS tool/queue. They now assert absent declarations/handlers/provider files, rejection of every template, zero injected-provider calls, and cancellation of persisted old work. Neither test was removed or skipped. The redundant older policy module was removed.
- The dashboard branch changed the immutable guide digest and appended a caller-email ban. Restoring specs requires the original authenticated digest. The compiler still validates that exact guide, applies the owner ruling in application code, removes the obsolete text example and permits requested quote email. The guide-policy assertion now checks the compiled instruction; every per-service no-text assertion remains.
- New dashboard workflow rows contain customer notes and frozen action receipts. Added them to child-first day-90 erasure, with a new fake-provider regression proving expired-tenant deletion, other-tenant retention and progress during billing-provider outage.
- Both route additions and middleware protections are retained. The exact runtime matrix contains 123 registrations, including quote-copy links, blocklist/spam, reports, owner actions and review routes. Route-source hashes describe the final reviewed source, including disabled registration branches. No matrix assertion was relaxed.

## Specs and evidence

The complete specs tree is restored to the base. `git diff 109f687 HEAD -- specs/` must be empty on the final checkpoint. The new ENGINE_LEFTOVERS_20261007.md and OWNER_DASHBOARD_20261007.md evidence notes live here instead, with branch report links updated. Per-input `*-spec-evidence.patch.gz` files preserve added build-status and policy evidence without changing specs. Existing verification notes and tests from all branches remain. `.github/known-test-failures.txt` stays empty (zero bytes); strict failure/skip/cancellation/TODO checks are unchanged.

## Verification record

Cold local npm ci and owner/widget build passed using Node 22.23.3. Production dependency audit reports zero vulnerabilities. Initial focused integration: 432 results, 430 passed, two failed (duplicate booking alert and removed fixture import); both were repaired. Corrected quote-email/engine/billing group: 78/78, zero failures/skips/cancellations/TODOs. Counts overlap other gates.
Local Chromium independently exits with SIGTRAP before page rendering; the ordinary full/strict commands remain enabled and expose that environment failure. No passing local browser claim or skip substitution is made. Raw local setup/focused evidence is retained here. Final complete suite counts and the exact-head hosted cold run are reported in the delivery message after publication. Hosted CI runs cold npm ci, both builds, strict quote gate, full suite, zero-failure checker and production audit; no deployment is part of that workflow.
