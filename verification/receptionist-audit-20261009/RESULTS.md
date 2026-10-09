# October 9 receptionist audit verification

Base: `c99ea0519c3966b9b6a2bc4c750c036cd16d6b80` (`claude/release-candidate-20261009`). Branch: `fix/receptionist-audit-20261009`.

## Remaining limits

- Production uses `new GoogleGenAI({apiKey})`. In installed `@google/genai` 2.24.0, `SessionResumptionConfig.transparent` exists in the types but the Gemini Developer API converter throws: `transparent parameter is only supported in Gemini Enterprise Agent Platform mode, not in Gemini Developer API mode.` The adapter supports bounded, indexed replay when a compatible fake/Enterprise client explicitly opts in; production keeps ordinary session resumption without a guarantee of exact audio replay after the last consumed message. Enabling the flag unconditionally would prevent calls from opening.
- Docker is not installed here, so `node verification/receptionist-20261008/docker-voice-smoke.mjs <image>` could not run. No real Google/Twilio call was made. The owner still needs to test a 12+ minute call and a hang-up-and-call-back with the real key.

## Regressions

The final `test/receptionistAudit20261009.spec.mjs` ran against a detached clean base worktree, then the fixed branch. The exact [base TAP](BASE.tap) and [fixed TAP](FIXED.tap) are retained.

| Item | Production files | Regression tests | Clean base | Fixed |
| --- | --- | --- | ---: | ---: |
| 1. Go-away and audio switching | `server/src/voice/googleGenAiLiveAdapter.js` | Four fake-client tests: active speech, late handle, idle/deadline, indexed replay. Existing `test/voiceSessionMemory20261008.spec.mjs` also checks one greeting, tool response, transcript, billing and fallback. | 0/4 | 4/4 |
| 2. Identity confirmation | `server/src/voice/voiceToolRuntime.js` | Twelve natural-answer, no-name, silence and refusal cases; existing memory test updated for the approved no-name question. | 3/12 | 12/12 |
| 3. Old amounts | `server/src/customerHistoryService.js` | Previous receptionist turns and caller money in digits/words, with measurements retained. | 0/1 | 1/1 |
| 4. Numeric product names | `server/src/voice/listedPriceCalculation.js` | Five hand-calculated products and six quantity/condition refusals. [Expectations](EXPECTATIONS.md) were written before execution. | 6/11 | 11/11 |

Total new file: **9/28 pass on base (19 expected failures)**, **28/28 pass after**. The existing synthetic session-memory suite passes **16/16** after its wording update.

## Required gates

- `npm ci` under workspace-local Node 22: passed.
- `npm run build`: passed. Tracked `client/dist` is restored before commit.
- `npm run test:quote` with workspace Playwright 1.56 Chromium headless shell: **3,054/3,054**, zero failures/skips/cancellations/TODOs.
- `npm test` with the same browser: **4,393/4,393**, zero failures/skips/cancellations/TODOs; known-failure checker 0/0.
- Docker voice smoke: unavailable (no Docker binary).

All test phone numbers, names, amounts and clients are synthetic. No specs, site, quote engine, route source, guide, or production deployment changed.
