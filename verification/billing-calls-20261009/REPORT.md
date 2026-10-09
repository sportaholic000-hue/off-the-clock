# October 9 billing, calls and text-AI repairs

Branch: `fix/billing-calls-20261009`.
Base: `fc6efdea1266ed0e4be750d3cc4f3ed6d336645b`
(`claude/release-candidate-20261009b`).

## Incomplete verification / owner decisions

- Docker is not installed, so the requested image-based voice smoke was not run.
- Proposed owner wording below is awaiting approval. It is present on this
  review branch; nothing is deployed or merged.
- A real, supported text model must be explicitly selected in `GEMINI_TEXT_MODEL`
  before either text-AI feature can run. No default model is supplied and no
  environment was changed. The old `PRICEBOOK_GEMINI_MODEL` setting is no longer
  used. Voice continues using `GEMINI_MODEL`.
- Chromium fails to launch with SIGTRAP for 57 browser checks in each final
  full gate. Those browser assertions remain unverified in this sandbox.

## What changed

### 1. Missing duration recovery

`server/src/voiceDurationRecovery.js` adds a read-only Calls API job with a
60-second scheduler and bounded owner/call batches. Calls must have ended at
least ten minutes ago; missing metering rows are included. Calls API responses must be completed, have an integer
nonnegative duration, and match the saved account, call, caller, destination
and inbound direction. The job calls the same `providerComplete` path as a
signed status callback. `server/src/billingVoiceUsage.js` adds an optional
owner binding to that existing path; conflicting canonical receipts remain
refused. A separate SHA-256 digest records the fetched JSON and status.

The durable per-call retry ledger reserves attempts across concurrent workers.
Retries start at five minutes and double to a 24-hour maximum. A ten-second
request/body timeout bounds each read. At seven days after local completion,
no more read or recovery confirmation is allowed. Failed receptionist and
spam calls remain excluded. A late identical callback cannot count twice.

`server/src/server.js` starts and drains the worker. Every new query goes
through the injected `ownerQuery`; the only cross-owner read inventories owner
IDs for scheduling. All call and retry rows are explicitly owner-bound.
`server/src/billingMinuteService.js` and `client/src/minuteUsage.jsx` retain
unconfirmed call counts even after an allowance period ends, without assigning
money to those calls. The existing approved count wording is unchanged.

### 2. Readable call failure reasons

The base `client/src/calls.jsx` rendered `failureCode` directly under Failure.
The actual rendered component reproduced this for `GEMINI_SESSION_CLOSED`
and the other known codes. It now calls `client/src/callFailureReasons.js`:
111 known codes have plain-English explanations, and unknown codes have an
honest generic fallback. The raw value remains under `Technical detail`.
Protocol/codec code inventory is checked by a regression. Admission, access,
restart and generated gate-refusal codes are included in the reviewed mapping.
The render tests use actual React server rendering plus JSDOM to inspect the
result; they do not claim Chromium layout verification.

### 3. Explicit text-model configuration

Both production `generateContent` call sites were found:
`geminiJson` in `server/src/platformIntegrations.js` (knowledge draft only),
and `generateDraft` in `server/src/priceBookAI.js` (starter book and interview
answer extraction). The base knowledge fake-fetch test observed the Live
setting in the REST URL. Price-book AI independently used an invented fallback
when its dedicated setting was absent.

`server/src/geminiTextModel.js` now validates a single explicit
`GEMINI_TEXT_MODEL`, with no fallback to voice or legacy price-book settings.
Both callers refuse missing/invalid configuration before making a Google
request. Knowledge API credentials move from the URL into the provider header.
`server/src/runtimeConfig.js` validates supplied model names and returns a
missing-setting inventory. `server/src/server.js` lists missing text settings
at startup and exposes only the fixed configuration message to the owner.
Missing text configuration disables text features, without preventing voice
or manual editing from starting. `.env.example` documents the blank setting.
Website price import remains literal and does not need a text model.

### Google documentation and limits

Google's [API reference](https://ai.google.dev/api) distinguishes standard
REST `generateContent` from the WebSocket Live `BidiGenerateContent` API.
The [Models reference](https://ai.google.dev/api/models) exposes
`supportedGenerationMethods`; the configured text model must support
`generateContent`. Naming validation is a local guard, not a live capability
or credential check. No real Google call was made.

A model unavailable for the requested method would be expected to fail with
an unsupported-model/resource error; the exact response for the configured
Live model was **not documented in the official pages found** and was not
observed against Google. Do not treat a fake response as proof of that error.
The exact relevant generic documentation is HTTP **404 / NOT_FOUND**:
> The requested resource wasn't found.

Source: [Google API errors](https://ai.google.dev/gemini-api/docs/generate-content/api-errors),
read October 9, 2026. This generic description does not establish an exact
Live-model-specific response or promise that every mismatch returns 404.

The [Twilio Call resource](https://www.twilio.com/docs/voice/api/call-resource)
documents the GET resource and string duration in seconds; busy, failed,
unanswered and ongoing calls do not have a completed duration. Recovery
requires `completed` and a valid duration and does not guess a zero.

## Regression evidence

Money expectations were written before execution in [EXPECTATIONS.md](EXPECTATIONS.md).
The final identical four new regression files ran on a detached worktree at
the pinned base, with no production-source changes, and against the fix.
The new recovery-module tests fail on the base at the explicit assertion that
the job is missing; they do not claim the nonexistent job executed its cases.
Existing-path tests additionally reproduce raw rendered codes, the Live-model
REST URL, missing configuration, hidden historical pending counts and HTTP
owner messaging. Full per-test results: [regressions.json](regressions.json).

| Item | Base pass / fail | Fixed pass / fail |
| --- | ---: | ---: |
| 1 | 0 / 21 | 21 / 0 |
| 2 | 1 / 112 | 113 / 0 |
| 3 | 1 / 10 | 11 / 0 |
| Total new regressions | 2 / 143 | 145 / 0 |

New test files:
- `test/billingCalls20261009Recovery.spec.mjs`
- `test/billingCalls20261009Render.spec.mjs`
- `test/billingCalls20261009Text.spec.mjs`
- `test/billingCalls20261009Http.spec.mjs`

[Base TAP](regressions-base.tap) and [fixed targeted TAP](regressions-fixed-targeted.tap)
retain results with trailing whitespace removed. The targeted run is **280/280**,
including the 145 new tests plus existing runtime configuration, price-book AI,
real HTTP interview, normalization, billing-system and overage tests. Counts
overlap the full suites.

Existing tests only receive explicit synthetic text-model configuration where
they formerly relied on the implicit default: `agreedAuditFollowup`,
`auditFixes20261003`, `engineLaunchFixes20261005`, `priceBookAI`, `pricebookClarificationHttp`,
`pricebookInterviewNormalization20261005`, `quoteAuditDecisions20261004`,
`quoteReauditRepairs`, `quoteSmallRepairs` and `runtimeConfig` specs.
Generation, clarification, parsing, monetary and tenant assertions are retained.

## Proposed owner wording — approval requested

Every proposed sentence is listed here. Code-to-sentence assignments, including
all 111 codes, are also in [failure-wording.json](failure-wording.json).
The existing `Failure` label remains; the proposed additional label is
**Technical detail** (requested by the owner).

1. "The AI receptionist connection closed unexpectedly."
   Codes: `GEMINI_SESSION_CLOSED`.

2. "The AI receptionist encountered a connection error."
   Codes: `GEMINI_SESSION_ERROR`, `GEMINI_CONNECT_FAILED`, `VOICE_MEDIA_FAILURE`.

3. "The phone connection closed unexpectedly."
   Codes: `TWILIO_SOCKET_CLOSED`, `TWILIO_SOCKET_ERROR`, `MEDIA_SOCKET_CLOSED`.

4. "The receptionist could not save the final call details."
   Codes: `SESSION_PERSISTENCE_FAILED`, `TRANSCRIPT_CALLBACK_FAILED`, `CALL_PERSISTENCE_FAILED`.

5. "The receptionist could not complete a requested action."
   Codes: `TOOL_CALLBACK_FAILED`, `INVALID_TOOL_RESPONSE`, `INVALID_GEMINI_TOOL_CALL`.

6. "The call exceeded a safe audio or connection limit."
   Codes: `GEMINI_AUDIO_RATE_LIMIT`, `INPUT_AUDIO_BACKPRESSURE_LIMIT`, `OUTPUT_AUDIO_BACKPRESSURE_LIMIT`, `PENDING_MARK_LIMIT`, `SOCKET_BACKPRESSURE_LIMIT`, `TWILIO_AUDIO_RATE_LIMIT`, `TWILIO_MESSAGE_BACKPRESSURE_LIMIT`, `TWILIO_MESSAGE_RATE_LIMIT`, `TWILIO_MESSAGE_TOO_LARGE`, `AUDIO_PAYLOAD_TOO_LARGE`, `MULAW_AUDIO_TOO_LARGE`, `PCM_AUDIO_TOO_LARGE`.

7. "The call connection did not match the saved call."
   Codes: `INVALID_CALL_CONTEXT`, `TWILIO_START_BINDING_MISMATCH`, `TWILIO_STOP_BINDING_MISMATCH`, `TWILIO_STREAM_SID_MISMATCH`, `VOICE_CALL_BINDING_MISMATCH`.

8. "The receptionist stopped when the service restarted."
   Codes: `VOICE_RESTART_RECOVERY`, `APPLICATION_CLOSE`, `SESSION_ENDED_DURING_CONNECT`.

9. "The receptionist was unavailable for this call."
   Codes: `VOICE_DISABLED`, `VOICE_RUNTIME_DISABLED`, `VOICE_FALLBACK`, `VOICE_SESSION_UNAVAILABLE`, `VOICE_ADMISSION_UNAVAILABLE`, `VOICE_SESSION_NOT_PERSISTED`.

10. "The receptionist is temporarily paused after repeated connection failures."
   Codes: `VOICE_CIRCUIT_OPEN`.

11. "All available receptionist call connections were in use."
   Codes: `VOICE_CONCURRENCY_LIMIT`, `VOICE_PLATFORM_CAPACITY`.

12. "The caller reached the daily answering limit. Their request is saved for review."
   Codes: `VOICE_CALLER_THROTTLED`.

13. "This caller was blocked as spam."
   Codes: `VOICE_SPAM_BLOCKED`.

14. "The account was not eligible for receptionist service."
   Codes: `OPERATOR_INELIGIBLE`, `ACCOUNT_REQUIRED`, `INVALID_PLAN`, `INVALID_STATUS`, `INVALID_NOW`, `TRIAL_END_REQUIRED`, `PAYMENT_FAILURE_TIME_REQUIRED`, `SUSPENDED_OR_CANCELED`.

15. "The trial had ended."
   Codes: `TRIAL_EXPIRED`.

16. "The payment grace period had ended."
   Codes: `PAYMENT_FAILURE_GRACE_EXPIRED`.

17. "The trial had no included call minutes left."
   Codes: `TRIAL_VOICE_CAP_REACHED`, `VOICE_CAP_REACHED`.

18. "Call usage could not be verified before answering."
   Codes: `TRIAL_USAGE_REQUIRED`.

19. "The caller safety check could not be completed."
   Codes: `VOICE_CALLER_CHECK_UNAVAILABLE`.

20. "The receptionist could not verify whether it was allowed to answer."
   Codes: `VOICE_CALLER_CHECK_UNAVAILABLE_INVALID`, `VOICE_CALLER_CHECK_UNAVAILABLE_UNAVAILABLE`, `VOICE_RUNTIME_DISABLED_INVALID`, `VOICE_RUNTIME_DISABLED_UNAVAILABLE`, `OPERATOR_INELIGIBLE_INVALID`, `OPERATOR_INELIGIBLE_UNAVAILABLE`, `VOICE_CAP_REACHED_INVALID`, `VOICE_CAP_REACHED_UNAVAILABLE`.

21. "The call contained audio or connection data the receptionist could not process safely."
   Codes: `BINARY_TWILIO_MESSAGE_REJECTED`, `EMPTY_AUDIO_PAYLOAD`, `EMPTY_MULAW_AUDIO`, `EMPTY_PCM_AUDIO`, `GEMINI_SESSION_OPENER_REQUIRED`, `INVALID_AUDIO_BASE64`, `INVALID_AUDIO_LIMIT`, `INVALID_GEMINI_AUDIO`, `INVALID_GEMINI_AUDIO_FORMAT`, `INVALID_GEMINI_SESSION_ADAPTER`, `INVALID_GEMINI_TRANSCRIPT`, `INVALID_MEDIA_CLOCK`, `INVALID_MEDIA_LIMITS`, `INVALID_MEDIA_SOCKET`, `INVALID_MULAW_BUFFER`, `INVALID_MULAW_SAMPLE`, `INVALID_PCM_BUFFER`, `INVALID_PCM_SAMPLE`, `INVALID_PROVIDER_MESSAGE`, `INVALID_SOCKET_BACKPRESSURE`, `INVALID_TWILIO_CONNECTED_EVENT`, `INVALID_TWILIO_CUSTOM_PARAMETERS`, `INVALID_TWILIO_JSON`, `INVALID_TWILIO_MEDIA_CHUNK`, `INVALID_TWILIO_MEDIA_TIMESTAMP`, `INVALID_TWILIO_MESSAGE`, `INVALID_TWILIO_SEQUENCE`, `INVALID_TWILIO_STREAM_SID`, `MARK_BEFORE_ACTIVE_START`, `MEDIA_BEFORE_ACTIVE_START`, `MEDIA_CLOCK_REQUIRED`, `MISALIGNED_PCM16_AUDIO`, `NON_CANONICAL_AUDIO_BASE64`, `SESSION_END_CALLBACK_INVALID`, `STOP_BEFORE_ACTIVE_START`, `TOOL_CALLBACK_REQUIRED`, `TRANSCRIPT_CALLBACK_REQUIRED`, `TWILIO_MEDIA_ORDER_MISMATCH`, `TWILIO_SEQUENCE_MISMATCH`, `UNEXPECTED_TWILIO_MEDIA_TRACK`, `UNEXPECTED_TWILIO_START`, `UNKNOWN_TWILIO_MARK`, `UNSUPPORTED_TWILIO_EVENT`, `UNSUPPORTED_TWILIO_MEDIA_FORMAT`.

22. "The receptionist could not load its voice settings."
   Codes: `GOOGLE_LIVE_INSTRUCTION_FAILED`.

23. "The receptionist could not complete this call. The technical detail below may help support investigate."
   Used only when a saved code has no known mapping.

Text-AI configuration message (all three sentences proposed):

- "AI drafting is unavailable because its text model is not configured."
- "You can enter your business information and prices manually."
- "Contact support@offtheclockai.com for help."

The caller-limit sentence already appeared in the call-page notice; its reuse
is listed above for completeness. No other new owner wording is introduced.

## Full gates

| Command | Total | Passed | Failed | Skipped / cancelled / TODO |
| --- | ---: | ---: | ---: | ---: |
| `npm test` | 4,549 | 4,492 | 57 | 0 / 0 / 0 |
| `npm run test:quote` | 3,190 | 3,133 | 57 | 0 / 0 / 0 |

Both commands exit 1. Every failure in both final runs is a Chromium
`browserType.launch` failure with `SIGTRAP`; no non-browser test fails.
Counts, each failed name, classification and complete-output SHA-256 hashes
are recorded in [full-gates.json](full-gates.json).

A preliminary full run (before the missing-meter-row edge case was final)
reported 4,490 passed / 58 failed / 4,548 total. Its additional non-browser
failure was the existing normalized-$5 AI-response fixture, which relied on
the removed implicit text-model default. The fixture now explicitly supplies
`synthetic-text-model`; its original rate and registry assertions passed the
isolated recheck and both final full gates. That preliminary result is retained
in `full-gates.json`; it is not counted as a passing gate.

Runtime: Node 22.23.3; Playwright 1.56.0 with installed Chromium headless shell
141. `PRICEBOOK_BROWSER_MODULE=/workspace/scratch/18cbdaa4aace/node22/lib/node_modules/playwright`.
`npm run build` passed. Generated tracked `client/dist` is restored before
publication. Route sources are re-pinned with `routeSourceInventory('server')`.
No specs, site or quote-engine-vnext files changed. No SMS, live provider calls,
subagents, deployment or merge.
