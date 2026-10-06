# Owner alert delivery repair — checkpoint

Base verified: `eaadeca0856f1bd7fcade8685711a19aefd786d0`. Branch: `fix/owner-alerts-delivery-20261006`. Synthetic temporary SQLite stores, fake email/SMS/voice providers; no live provider operations, deployment or merge.

## Already fixed on the pinned base, preserved

- D02 owner email production and dispatch: `server/src/ownerAlertSchema.js` capture triggers; `ownerAlertService.js` durable claim/attempt/failure/retry worker; `server.js` starts/stops it. `before.json` shows five separate lead, quote, callback, urgency and preference emails ACCEPTED after two dispatch passes, with exactly five sends. Acceptance is not an inbox/read receipt. Existing owner-alert regressions are preserved.
- D19 Call visibility: base `ownerCallService.js:63` reads tenant-bound action states and `client/src/calls.jsx:30` renders them. `before.json` executes the original call projection for both stored FAILED and SENT states. This working behavior is preserved; the missing saved-inquiry projection is repaired.

## Reproduced gaps and changes

| Finding | Pinned source and execution | Repair and regression evidence |
|---|---|---|
| D02 | `ownerAlertService.js` only dispatches ownerAlerts, not corresponding outbox state; `voiceToolRuntime.js:835–913` persists only an opaque reference digest, without a restartable SMS message. `before.json`: urgency/preference outboxes remain PENDING after email ACCEPTED. Production voice receives no SMS provider. | Transactional notification-outbox state synchronization; durable SMS messages/attempts with tenant, call, recipient and historical record binding; production worker and gated Twilio adapter. Owner email delivery is unchanged. `ownerAlertsDelivery20261006.spec.mjs` tests urgency, preference and quote-review synchronization, real close/reopen, missing configuration, all existing SMS templates, message privacy, opt-out and rollback. |
| D05 | Base `voiceToolRuntime.js:849–858` returns early for every existing non-SENT row. `before.json`: a definitive fake rejection leaves FAILED, and a second runtime/tool invocation still makes only one provider attempt. | Five bounded retries after definite pre-acceptance failure, immutable message/event identity, atomic claims, attempt history. Ambiguous timeouts and interrupted sends become UNKNOWN rather than an unsafe resend. Signed callbacks and bounded receipt GETs resolve known provider receipts. Tests cover backoff, exhaustion, concurrent workers, restart, delayed/repeated/reordered callbacks and uncertain acceptance. |
| D19 | Base `leadCaptureRepair20261006FollowUp.js` omits delivery actions. `before.json`: the same FAILED SMS is visible on Calls but absent from the saved lead. | Tenant-bound safe action projections on saved leads/quotes and Calls, with status, attempts and safe error code. Stored estimates are never recalculated. HTTP and rendered tests verify owner/staff views and foreign-tenant denial; browser regressions exercise compiled production UI. |
| D20 | Base `outboundWebhookService.js:56–66` ends at LIMIT 20; routes expose no archive. `before.json`: 55 stored events, only 20 discoverable, oldest FAILED absent. | Separate paginated all/unresolved archive, totals and next page, tenant-only reads, existing retry route and dashboard components. Delivery refresh/retry preserves unsaved webhook settings. Tests reach the oldest failure among 105 events, reject foreign owner/staff archive access and malformed filters, and render the real route data. |

Expected outcomes were written in `EXPECTED.md` before baseline execution. `baseline.mjs` was executed in a separate detached worktree at the exact base; it intentionally asserts the original gaps and should be run against that revision, not the repaired source.

## Verification at this checkpoint

- Cold `npm ci` and build pass locally using Node 22.23.3.
- Relevant existing/new service, provider, HTTP and rendered regression run: 102/102, zero failures/skips. Final provider/startup verification: 36/36, zero failures/skips.
- The full run exposed an older literal startup-call assertion that disallowed adding the production SMS dependency. It now explicitly requires `providers:{smsDelivery}`; the assertion is stronger and the production wiring remains tested. No behavioral test or gate was weakened.
- Local Chromium launches fail with SIGTRAP before test execution (`browser-local.tap`). Browser tests fail rather than skip. Local strict completed 2,164 tests: 2,124 passed and 40 browser-launch failures; zero skips. Local full completed 2,549 tests: 2,508 passed, 40 browser-launch failures and the now-corrected literal startup assertion. Its focused rerun passes 27/27. Hosted verification remains pending; no green-gate claim at this checkpoint.
- `concurrent-restart.json`: two independent worker processes compete for one persisted SMS; a third restarted process dispatches nothing. Exactly one provider send, one durable attempt, SENT state.
- Twilio API/status receipt behavior follows the official Message resource and status callback documentation: https://www.twilio.com/docs/messaging/api/message-resource . No Messages-create idempotency capability is assumed.

## Unfinished and limits

- D02's literal requirement to deliver every historical voice outbox action is not fully met: live-transfer and appointment-change adapters remain the separate D04 work, outside this notification/SMS repair. They are not retried after a call ends.
- Legacy SMS rows without original message/record references cannot safely be replayed. They migrate to visible UNKNOWN (`LEGACY_SMS_NOT_REPLAYABLE`); already SENT/DELIVERED history is preserved. Uncertain SMS acceptance without a provider SID remains UNKNOWN until a verified callback resolves it; manual customer follow-up is safer than a blind duplicate.
- New SMS production sending stays BLOCKED until existing provider-write authorization, SMS enablement, confirmed carrier registration, signed callback origin, credentials and the owner's provisioned sender are configured. No live configuration was changed or verified.
- The callback timing-policy business conflict remains unapproved and untouched. This work does not claim voice lifecycle or launch readiness.
