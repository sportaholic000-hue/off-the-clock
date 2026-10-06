# Voice lifecycle repairs — 2026-10-06

Implementation checkpoint. The first cold hosted checkpoint passed; the follow-up source and owner readiness control changes require the final branch-head hosted run. No merge or deployment is authorized by this report.

Branch: `fix/voice-lifecycle-20261006`, created from verified `eaadeca0856f1bd7fcade8685711a19aefd786d0` on `codex/lead-capture-repairs-20261006`.
No subagents, merge, deployment, live data, real calls or texts. All provider executions use synthetic fakes and disposable SQLite stores.

## Changes and evidence

`EXPECTED.md` records source inspection and expected behavior before execution. The initial 13 production/interface regression scenarios produced 12 failures and one pass before any application changes. D06 was already repaired in the pinned base; its source and execution were verified rather than assuming the audit label was current. The later blocked-provider transcription experiment also failed before that queue was repaired.

| Item | Change / verified behavior |
|---|---|
| D04 | Production composition constructs Twilio SMS, warm-transfer and booking-change adapters. Transfer has a signed child-leg whisper/accept route and reports pending until explicit acceptance. Calendar cancellation/rescheduling uses authenticated PATCH, fresh availability, a local slot reservation and a remote busy-time recheck before writing. Ambiguous remote changes remain PENDING_CONFIRMATION and retain both reservations for review rather than claiming the old appointment is confirmed or releasing a potentially booked slot. Failed appointment changes retain a follow-up inquiry. |
| D06 | Existing failed-transfer callback capture passes; asynchronous transfer failure now routes through it with the original caller notes and inquiry number. Duplicate failures retain one callback identity. |
| D07 | Signed fallback gathers speech and persists partial/final text before any forward or hang-up. Failed persistence returns retryable HTTP, without a success acknowledgment or forward. AI failure preserves received text as a lead; an empty fallback response asks again. No audio recording. |
| D08 | Tenant resolution continues to use signed To. Legitimate withheld From values are accepted through nonce, dispatcher and persistence validation. Anonymous customer identity is scoped to its call; prior anonymous customer history is never exposed. |
| D25 | Completed/recovered calls are terminal in fallback, storage and media authorization. Replayed completed capture cannot forward again or overwrite its request. |
| D26 | Provider text receipt has an independent queue, so slow SMS/calendar tools do not block caller-text persistence. Cleanup drains received text and buffered operator transcript, including final text delivered during provider close, before final status. A transient transcript write failure is retried before finalization. Existing captured inquiries are enriched without a duplicate recovery lead. |
| D27 | Production startup atomically recovers stranded persisted calls into idempotent owner-bound leads, including when voice configuration is disabled and legacy active rows lack provider metadata. |
| D28 | Owner eligibility checks the same inbound runtime/provider/security configuration used by production voice. Enabled state also requires current plan eligibility. Both owner controls separate saved on/off intent from actual LIVE status, allowing the owner to turn an unavailable route off and avoiding inaccurate routing captions. |
| D31 | Encrypted durable inbound receipts replay one nonce/TwiML response per signed call. One-use media authorization prevents parallel sessions. Completed calls cannot reopen. |
| D32 | Session reservation checks the default five-active-call owner limit within the creation transaction. Excess callers receive request-capture fallback. Other tenants retain independent capacity. |
| P01 | Guide, versioned guide digest, prompt compiler and governing complaint wording now allow callback/quote deadlines only from explicit owner policies. No default today/two-hour promise. |

Production files: `server/src/voice/`, `server/src/voiceRuntimeRoutes.js`, `server/src/onboardingService.js`, `server/src/bookingService.js`, `server/src/googleCalendarAdapter.js`. Regression suite: `test/voiceLifecycle20261006.spec.mjs`, using the real production HTTP/WS/SQLite composition and fake external providers; existing entry-point, prompt and fallback tests updated to the repaired contracts.

## Verification at this checkpoint

- Cold `npm ci` and `npm run build`: passed; lockfile unchanged.
- Final broad voice/booking/calendar/capture/owner-control regression run: **325 passed, zero failures/skips**, including **43 lifecycle scenarios**.
- First complete hosted cold run: [37542643635](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37542643635), source `c17a01e1da77b6286046da6d7977cefca45c5f75`: **2,144/2,144 strict quote tests, 2,565/2,565 full tests**, zero failures/skips. Clean install, build and production dependency audit also passed. Raw log archived.
- Legacy-recovery follow-up `d62abc9dd84d044bc9bedf6a4c3f16551f466524`: [37542953505](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37542953505) also completed successfully. Final readiness-control and closing-transcript follow-ups are independently covered in the 325-test run and will receive their own cold hosted gate.
- Completed local full run before the final small follow-ups: **2,520 passed / 39 failed / zero skipped**, all 39 failures from Chromium startup, separate from application defects. The first attempt lacked a summary; both logs are retained. Local strict attempt exited 1 without a final summary after four Chromium failures. The repeated four-command cold run completed: install/build passed, full suite 2,524 passed / 39 Chromium-startup failures / zero skips; strict quote suite 2,098 passed / 39 Chromium-startup failures / zero skips. These local counts precede the final confirmation-state assertion; the 325-test targeted run includes it. Full raw logs and command exit codes are archived.
- Existing CI gates and failure/skip allowances were not weakened. Only this exact branch was added to the workflow push filter.

The guarantees apply to authenticated callbacks and transcript text actually received by the application. Speech not delivered by a transcription provider cannot be reconstructed; permanent loss of the only storage volume cannot be repaired by application logic. Ambiguous calendar writes retain both reservations and a follow-up request for review, with no unsupported success claim.

Provider protocol references checked: Twilio Voice TwiML [Gather](https://www.twilio.com/docs/voice/twiml/gather), [Dial](https://www.twilio.com/docs/voice/twiml/dial), [Number](https://www.twilio.com/docs/voice/twiml/number), [request fields](https://www.twilio.com/docs/voice/twiml); Google Calendar [events reference](https://developers.google.com/workspace/calendar/api/v3/reference/events).
