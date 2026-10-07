# Voice lifecycle repairs — 2026-10-06

All requested lifecycle repairs are implemented or independently verified. Final source `e49ea59118fc1c442b8ee44a807b15149405136c` passed the cold hosted gates: install, build, full tests and strict quote tests. Local browser startup remains an environment limitation, detailed below. No merge or deployment was performed.

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
| D32 | Session reservation checks the default five-active-call owner limit within the creation transaction. Excess callers receive request-capture fallback. Expired, never-connected reservations release capacity while connected calls still count; retained call rows remain available for late capture/recovery. Other tenants retain independent capacity. |
| P01 | Guide, versioned guide digest, prompt compiler and governing complaint wording now allow callback/quote deadlines only from explicit owner policies. No default today/two-hour promise. |

Production files: `server/src/voice/`, `server/src/voiceRuntimeRoutes.js`, `server/src/onboardingService.js`, `server/src/bookingService.js`, `server/src/googleCalendarAdapter.js`. Regression suite: `test/voiceLifecycle20261006.spec.mjs`, using the real production HTTP/WS/SQLite composition and fake external providers; existing entry-point, prompt and fallback tests updated to the repaired contracts.

## Final verification

Cold hosted run [37545433595](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37545433595), job `112548185081`, tested exact source **`e49ea59118fc1c442b8ee44a807b15149405136c`**. Its tree was compared with the uploaded tree and the branch was verified as a direct descendant of the requested base.

| Gate | Result |
|---|---|
| `npm ci` after deleting installed dependencies | PASS |
| `npm run build` | PASS |
| `npm test` | **2,570 / 2,570 PASS** |
| `npm run test:quote` | **2,144 / 2,144 PASS**, 100 selected files |
| Production dependency audit | PASS, zero vulnerabilities |
| Targeted voice/booking/calendar/capture/owner-control tests | **325 / 325 PASS**, including **43 lifecycle scenarios** |

Both hosted suites and the targeted run have **zero failures, cancellations, skips or TODOs**. Counts overlap and are not additive. The full hosted log, per-step result metadata, failed reproductions, local command exit codes and passing targeted output are stored under `evidence/`, with SHA-256 checksums. Existing CI gates and failure/skip allowances were not weakened; only this exact branch was added to the workflow push filter. The lockfile is unchanged.

Local cold `npm ci` and build passed. The completed local four-command run recorded full suite **2,524 passed / 39 failed / zero skipped** and strict quote suite **2,098 passed / 39 failed / zero skipped**. All 39 failures in each suite were Chromium startup failures (SIGTRAP). These runs precede the final small confirmation-state/capacity follow-ups, which pass in the final targeted and hosted runs above. The seven extra hosted tests are nested browser cases that cannot run after local browser launch fails. Earlier incomplete attempts are archived but are not claimed as passing gates.

No requested application work remains unfinished. Local Chromium startup was not repaired; the complete cold hosted execution supplies the browser evidence. Real provider calls/texts and deployment were deliberately excluded by the task. Historical checkpoint logs remain archived and are not substituted for the final-source result.

The guarantees apply to authenticated callbacks and transcript text actually received by the application. Speech not delivered by a transcription provider cannot be reconstructed; permanent loss of the only storage volume cannot be repaired by application logic. Ambiguous calendar writes retain both reservations and a follow-up request for review, with no unsupported success claim.

Provider protocol references checked: Twilio Voice TwiML [Gather](https://www.twilio.com/docs/voice/twiml/gather), [Dial](https://www.twilio.com/docs/voice/twiml/dial), [Number](https://www.twilio.com/docs/voice/twiml/number), [request fields](https://www.twilio.com/docs/voice/twiml); Google Calendar [events reference](https://developers.google.com/workspace/calendar/api/v3/reference/events).
