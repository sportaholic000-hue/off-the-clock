# Voice session and caller memory regression

Base: `5f5a719aa45aedb8bba3b9219f3f137bb0ac1a60` on `fix/voice-session-memory-20261008`.

The synthetic tests in `test/voiceSessionMemory20261008.spec.mjs` were copied into a detached, otherwise untouched worktree at that base commit. `base-full.tap` records **1/16 passing, 15 failing** at the base; `fixed-full.tap` records **16/16 passing** with the fix. Both used fake Google and Twilio clients and signed local Twilio requests; no provider messages or calls were sent.

| Part | Regression cases | Base | Fixed |
| --- | --- | ---: | ---: |
| A | goAway with handle, compression and ordered media; unexpected close; completed 12 minute synthetic call; failed resumption and zero minute fallback | Fail | Pass |
| B | confirmed recent call and backup words, ownerQuery, old price redaction, dropped Twilio socket, no or unclear answer, natural Yes, withheld and other tenant, 24 hour boundary, early dropped request | Fail except existing withheld/tenant control | Pass |
| C | exact backup lines, documented Chirp names, signed male and female TwiML, ring-through | Fail | Pass |

The adapter sets `sessionResumption: {}` and `contextWindowCompression: {slidingWindow: {}}`, leaving `triggerTokens` and `targetTokens` unset for Google's defaults. It uses the latest `sessionResumptionUpdate.newHandle`, switches Google connections on `goAway` or an unexpected close with a handle, and leaves the Twilio stream open. A reconnection failure reaches the existing zero minute fallback. Google documents the connection and session limits, resumption and compression at <https://ai.google.dev/gemini-api/docs/live-api/session-management>.

Twilio lists English US Google Chirp 3 HD Charon (male) and Kore (female) and requires `Provider.Voice` for `<Say>`: <https://www.twilio.com/docs/voice/twiml/say/text-speech>. The backup uses `Google.en-US-Chirp3-HD-Charon` or `Google.en-US-Chirp3-HD-Kore` when the saved voice is recognized; otherwise it omits the voice attribute. The throttled, service-ended and operator-off lines and owner ring-through remain covered by the existing tests.

`npm test` on the final code reported **4,325 tests: 4,268 passed, 57 failed**. `npm run test:quote` with `PRICEBOOK_BROWSER_MODULE=$(npm root -g)/playwright` reported **3,004 tests: 2,947 passed, 57 failed**. In both runs every failure block reported the sandbox's missing Chromium executable; there were **zero non-browser failures**, skips, cancellations or TODOs. The Docker smoke was attempted and could not start: the `docker` executable is absent (`ENOENT`). Parts A and C remain unverified on a real call; the owner will test a 12+ minute call and a hang-up-and-call-back with the real key.

No `specs/`, `site/`, or `server/quote-engine-vnext/` file was changed. The route-source inventory was regenerated from `routeSourceInventory('server')` after the route edits.
