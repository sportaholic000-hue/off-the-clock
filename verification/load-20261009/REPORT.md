# Billing calls review and synthetic load — 2026-10-09

Base `claude/release-candidate-20261009c` at `94c0d63f7eace16eac4c97f5a95712eb443118d6`. Review is report-only; the load scripts and raw results are the sole source changes on `verify/billing-review-load-20261009`.

## Part 1: confirmed defects

1. **Duration recovery reads a call still on the fallback line.** `server/src/voiceDurationRecovery.js:37-44` selects `FALLBACK`/`AI_FALLBACK` and uses `COALESCE(v.completedAt,c.completedAt)` as the end time. `server/src/voice/voicePersistence.js:261-266` sets `c.completedAt=NULL` when moving to fallback. The AI leg can have `v.completedAt` while Twilio's call is still in a fallback Gather. Own execution: a synthetic `AI_FALLBACK` row with `calls.completedAt=null` and `billingVoiceUsage.completedAt=2026-10-20T12:00:01Z`, queried at +10 minutes with fake Twilio status `in-progress`, made **one GET**, incremented attempts to 1, and stored `DURATION_NOT_COMPLETED`. Expected: no recovery GET until the *phone call* has ended and has been ended for ten minutes. Actual: the AI leg's end qualifies a still-live fallback call.

2. **Throttling copy calls a placeholder a saved request.** `client/src/callFailureReasons.js:14` and `client/src/calls.jsx:67` state “Their request is saved for review.” `server/src/voice/voiceRecovery.js:25-28` writes “Call interrupted before a request was received” with `notes:null` when no caller words exist; `server/src/voice/voiceAdmission.js:91-96` also creates an owner alert. Own execution: signed Twilio first call consumed a synthetic limit of one, then a second call was throttled and hung up without speech. Its persisted `failureCode` was `VOICE_CALLER_THROTTLED`, transcript `[]`, lead description `Call interrupted before a request was received`, notes `null`, while `callFailureReason` returned the “request is saved” sentence. Expected: say a call/alert/contact placeholder was saved, without claiming request details were received. Actual: the owner sees a promise of request content that does not exist.

## Part 1: checked and found clean

- `server/src/voiceDurationRecovery.js:21-33,68-70` exposes one Twilio `GET`, refuses redirects, sends Basic credentials only in the request header, and emits fixed diagnostic codes without logging credentials. Own fake fetch observed only `GET` with `redirect:error`.
- `server/src/voiceDurationRecovery.js:4,37-55`: ordinary terminal calls require a ten-minute-old completion and no provider digest; durable attempts/nextAttemptAt survive a new worker instance. Own execution at +9:59.999 made zero GETs, at +10:00 one GET, retry at +4:59.999 made no extra GET, retry at +5:00 made the second GET, and at seven/eight days made no further GETs with `gaveUpAt` set. The live fallback exception is above.
- `server/src/voiceDurationRecovery.js:21-22,58-67` checks local account/CallSid and fetched account, CallSid, caller, destination, direction, completed status, and integer duration. A fake mismatched account did not set `providerDigest`.
- `server/src/voiceDurationRecovery.js:64-67` shares `createBillingVoiceUsage.providerComplete` with signed callbacks. `server/src/billingVoiceUsage.js:70-83` compares canonical receipt digests. Own run recovered 310 minutes/$3.50 overage from 300 confirmed + 10 recovered minutes; the same late callback left $3.50, while 660 seconds instead of 600 threw `Conflicting completed-call receipt.`
- `server/src/billingVoiceUsage.js:4,47-51,69-83` excludes failed/fallback/spam from minutes. Own fake recovery of one `FAILED`, one fallback and one spam call left each at zero billed minutes; the `FAILED` row had a recovered 600-second provider duration but `minutesBilled:0`, `minutesUsed:0`, `overageCents:0`.
- `server/src/billingMinuteService.js:104-160` uses the shared verified-minute proof and $25 threshold. Own fake run recovered 72 minutes beyond 300 included: `minutesUsed:372`, `overageCents:2520`, then `chargedCents:2520`, one fake invoice and one fake item of 2520 cents.
- `server/src/geminiTextModel.js:1-12` has no default model and rejects names containing Live/audio/tts/embedding/image. Own execution: unset and `gemini-2.5-flash-live`/`gemini-2.5-audio` each threw `TEXT_AI_UNAVAILABLE` with the owner-readable message; `gemini-2.5-flash` was accepted.
- `client/src/callFailureReasons.js:3-26` maps the runtime/bridge/codec failure vocabulary to owner wording, with a generic fallback for unknown codes. The render inventory covers the bridge/codec codes; own execution compared all 11 denied `server/src/planAccess.js:17-33` reasons with the map and found zero missing. The owner wording above is the confirmed false claim; the runtime-close probe produced a normal `COMPLETED` record and did not establish another persisted false restart claim.

## Part 2: method and raw runs

`voice-load.mjs` uses the production signed incoming webhook and signed WebSocket upgrade in `test/voiceLifecycle20261006Fixture.mjs`. It drives real-time, 20 ms, 160-byte µ-law caller frames and 20 ms, 960-byte, 24 kHz PCM fake-Google output frames; it acknowledges Twilio marks and sends the bound stop event. Each cohort gets a fresh process, real 120-second stream, then a real 120-second connected-process cooldown. No provider network calls occur. RSS and `process.cpuUsage()` include the in-process synthetic driver and are upper bounds for server-only overhead; per-call figures divide the cohort's peak-minus-baseline by call count. The fake audio is silence and does not model transcription, provider latency, tool work, or real network jitter.

`http-load.mjs` starts the full local server and exercises `/api/dashboard` with 250 independently authenticated owner sessions, one owner, every 30 seconds for 10 minutes (5,000 requests). The dashboard is the product endpoint that returns `minuteUsage`; there is no separate minute-only route. It separately posts 1,000 distinct synthetic mowing submissions to `/api/public/quote/:publicKey` at 600 ms intervals for 10 minutes, alternating two businesses to stay below the public route's 60-request/minute per-business-and-IP limit. Its RSS/CPU include its in-process traffic driver. No real Stripe, Twilio, Google, email, or SMS clients are configured.

Machine: **INTEL(R) XEON(R) PLATINUM 8573C**, 9 logical CPUs visible to Node. Node: **v22.23.3**.

| Scenario | Requests/frames | Baseline RSS MiB | Peak RSS MiB | RSS after calls +2 min MiB | CPU baseline / at RSS peak ms | Peak ΔRSS per added call MiB | Peak ΔCPU per call ms | Outcome |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 voice call × 2 min | 6,001/6,001; 6,001 marks | 100.21 | 118.34 | 104.72 | 479.5 / 809.4 | 18.13 | 329.9 | 1 completed; worst tick delay 2.7 ms |
| 10 voice calls × 2 min | 60,000/60,000; 60,000 marks | 107.30 | 137.93 | 110.76 | 448.5 / 10,247.6 | 3.06 | 979.9 | 10 completed; worst tick delay 327.1 ms |
| 25 voice calls × 2 min | 150,025/150,025; 150,025 marks | 105.05 | 142.19 | 109.69 | 447.7 / 13,251.3 | 1.49 | 512.1 | 25 completed; worst tick delay 15.0 ms |
| 50 voice calls × 2 min | 300,050/300,050; 300,050 marks | 99.05 | 154.39 | 112.26 | 474.2 / 23,706.7 | 1.11 | 464.7 | 50 completed; worst tick delay 2.8 ms |
| 250 owner sessions × 10 min | 5,000 requests | 123.16 | 163.71 | n/a | 774.2 / 1,697.2 | n/a | n/a | 5,000 HTTP 200 with PAID usage; 600,004 ms |
| 1,000 widget quotes × 10 min | 1,000 requests | 149.77 | 246.13 | n/a | 769.5 / 7,081.7 | n/a | n/a | 1,000 HTTP 201; 600,001 ms |

Raw JSON for each scenario is adjacent to this report. RSS after calls is sampled with the voice runtime/server still open, before cleanup. If it stays high, the single post-run sample is evidence of retained process memory, not proof of a live object leak; the report calls out crashes and failed calls explicitly.

The voice CPU spent during the 120-second audio window (connected to paced snapshots) was **2,478.7 / 10,860.5 / 14,707.3 / 26,596.9 ms** for 1 / 10 / 25 / 50 calls. Peak-minus-baseline RSS divided by the number of calls is in the table; fresh-process baselines varied from 99.05 to 107.30 MiB. The active RSS increase across those runs was 18.13 / 30.63 / 37.14 / 55.34 MiB. Peak-minus-baseline is a cohort measure, not a guarantee of linear scaling.

The 250-owner-session dashboard poll ended at 149.23 MiB RSS and 24,637.4 ms cumulative process CPU, versus 774.2 ms CPU at baseline: **23,863.3 ms CPU over ten minutes**. Request latency median/p95/max was **400.5 / 723.3 / 819.8 ms**. The script held the process until the full 600 seconds elapsed after 20 bursts at t=0,30,…,570 seconds.

The widget submission process ended at 239.21 MiB RSS and 36,039.9 ms cumulative CPU, versus 769.5 ms CPU at baseline: **35,270.4 ms CPU over ten minutes**. Request latency median/p95/max was **27.5 / 36.3 / 108.3 ms**. All 1,000 unique submissions returned HTTP 201; no rate-limit or server failures were observed.

**Post-call retention reproduction:** run `voice-load.mjs 50 120000 120000 voice-50.json` with the synthetic fixture and compare `baseline.rssBytes=103,858,176` with `afterCooldown.rssBytes=117,714,944` (13.21 MiB higher). The smaller cohorts remained 4.51, 3.46 and 4.64 MiB above their own baselines. No call crashed or failed. This is a failure to return to baseline within two minutes; it may include V8 heap reservation or reusable caches, so a single hold cannot prove a continuing object leak. The ten-call driver had a 327 ms worst scheduling delay; its frame count and completed statuses show it recovered the delayed frames, but that one interval was not an exact 20 ms cadence.

## Gates

`npm run test:quote`: **3,207/3,207 passed**, zero skips. Detached baseline `npm test`: **4,566/4,566 passed**, zero failures/skips/cancellations/TODOs. Two direct command-session attempts ended without a runner summary after 431 and 1,325 passing subtests; neither had a `not ok` line. The detached run completed in 409.7 seconds with a zero exit. Client assets built for the gates will be restored from Git before committing.
