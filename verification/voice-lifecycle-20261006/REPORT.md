# Voice lifecycle repairs — 2026-10-06

Source checkpoint; hosted verification pending. Do not treat this checkpoint as a completed release gate.

Branch: `fix/voice-lifecycle-20261006`, created from verified `eaadeca0856f1bd7fcade8685711a19aefd786d0` on `codex/lead-capture-repairs-20261006`.
No subagents, merge, deployment, live data, real calls or texts. All provider executions use synthetic fakes and disposable SQLite stores.

## Changes and evidence

`EXPECTED.md` records source inspection and expected behavior before execution. The initial 13 production/interface regression scenarios produced 12 failures and one pass before any application changes. D06 was already repaired in the pinned base; its source and execution were verified rather than assuming the audit label was current. The later blocked-provider transcription experiment also failed before that queue was repaired.

| Item | Change / verified behavior |
|---|---|
| D04 | Production composition constructs Twilio SMS, warm-transfer and booking-change adapters. Transfer has a signed child-leg whisper/accept route and reports pending until explicit acceptance. Calendar cancellation/rescheduling uses authenticated PATCH, fresh availability and a local slot reservation. Ambiguous remote changes retain both reservations for review rather than releasing a potentially booked slot. Failed appointment changes retain a follow-up inquiry. |
| D06 | Existing failed-transfer callback capture passes; asynchronous transfer failure now routes through it with the original caller notes and inquiry number. Duplicate failures retain one callback identity. |
| D07 | Signed fallback gathers speech and persists partial/final text before any forward or hang-up. Failed persistence returns retryable HTTP, without a success acknowledgment or forward. AI failure preserves received text as a lead; an empty fallback response asks again. No audio recording. |
| D08 | Tenant resolution continues to use signed To. Legitimate withheld From values are accepted through nonce, dispatcher and persistence validation. Anonymous customer identity is scoped to its call; prior anonymous customer history is never exposed. |
| D25 | Completed/recovered calls are terminal in fallback, storage and media authorization. Replayed completed capture cannot forward again or overwrite its request. |
| D26 | Provider text receipt has an independent queue, so slow SMS/calendar tools do not block caller-text persistence. Cleanup drains received text and buffered operator transcript before final status. Existing captured inquiries are enriched without a duplicate recovery lead. |
| D27 | Production startup atomically recovers stranded persisted calls into idempotent owner-bound leads, including when voice configuration is disabled. |
| D28 | Owner eligibility checks the same inbound runtime/provider/security configuration used by production voice. Enabled state also requires current plan eligibility. |
| D31 | Encrypted durable inbound receipts replay one nonce/TwiML response per signed call. One-use media authorization prevents parallel sessions. Completed calls cannot reopen. |
| D32 | Session reservation checks the default five-active-call owner limit within the creation transaction. Excess callers receive request-capture fallback. Other tenants retain independent capacity. |
| P01 | Guide, versioned guide digest, prompt compiler and governing complaint wording now allow callback/quote deadlines only from explicit owner policies. No default today/two-hour promise. |

Production files: `server/src/voice/`, `server/src/voiceRuntimeRoutes.js`, `server/src/onboardingService.js`, `server/src/bookingService.js`, `server/src/googleCalendarAdapter.js`. Regression suite: `test/voiceLifecycle20261006.spec.mjs`, using the real production HTTP/WS/SQLite composition and fake external providers; existing entry-point, prompt and fallback tests updated to the repaired contracts.

## Verification at this checkpoint

- Cold `npm ci`: passed; lockfile unchanged.
- Cold `npm run build`: passed.
- Targeted existing plus new voice/booking/calendar/capture tests: 271 passed, zero failures/skips at the first broad run.
- Final focused lifecycle suite: 38 passed, zero failures/skips.
- Local `npm test`: attempted; Chromium startup failures and no final TAP summary. Not green; incomplete output retained.
- Local `npm run test:quote`: running at checkpoint preparation.
- Hosted cold CI: pending. Exact branch added to the existing workflow push filter; no test gates, skips or failure allowances changed.

The guarantees apply to authenticated callbacks and transcript text actually received by the application. No software can recover speech that neither transcription provider nor callback delivered, or promise persistence if the only storage volume is permanently lost. Ambiguous calendar writes are deliberately blocked for owner review; no unsupported success is reported.

Provider protocol references checked during implementation: Twilio Voice TwiML [Gather](https://www.twilio.com/docs/voice/twiml/gather), [Dial](https://www.twilio.com/docs/voice/twiml/dial), [Number](https://www.twilio.com/docs/voice/twiml/number), [request fields](https://www.twilio.com/docs/voice/twiml); Google Calendar [events reference](https://developers.google.com/workspace/calendar/api/v3/reference/events).
