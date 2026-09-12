# Website sales demo — execution evidence

## Scope and source

Based on main `ed12dca1253a8790c885b071ab6037e05632bea0`; additions confined to `sales-demo/` on a separate demo branch. No production file, quote engine, growth file, price book, dependency manifest or provider configuration was changed. The final delivery identifies the commit and read-back source hashes.

## Executed final checks

| Check | Result | What this establishes |
|---|---|---|
| `node --test sales-demo/tests/*.test.mjs` | 44/44 pass; zero failures/skips | Configuration, SQLite admission ledger, timer behavior, rate/concurrency/budget bounds, IP handling, protocol payloads, PCM conversion, and actual local HTTP requests |
| `python sales-demo/tests/browser.py` | 48/48 pass; zero page errors | Current browser controller and layout using explicitly substituted transport/media; not an actual microphone or Gemini call |
| Browser viewport checks | 320, 375, 390, 768, 1024, 1440 pixels | No horizontal overflow in the tested initial/disconnected view; additional interactive checks at desktop size |
| Browser direct HTTP navigation probe | `ERR_BLOCKED_BY_ADMINISTRATOR` | This environment blocks browser navigation to the local server; no direct-launch claim |

The Node provider protocol suite uses a fake WebSocket and inspects setup, audio/text envelopes, sequencing, transcription, malformed response handling and teardown. The HTTP suite opens a real loopback server and SQLite ledger, but injects a visibly synthetic provider. Test helpers are outside the static allowlist and never imported by production code.

The browser suite renders current HTML/CSS/JavaScript inside the already-installed Chromium. It substitutes fetch and media APIs explicitly. It exercises voice/text selection, microphone-denial handling, cancelling a pending permission request, late permission completion, buffer interruption, text escaping, server-close events and tab cleanup. These tests do not establish real network latency, real microphone quality, real generated audio or natural-language compliance.

The actual Gemini adapter is implemented. No API key/model configuration, paid test, live provider request, real voice call, deployed URL, hosted acceptance, or Phase 5 completion is claimed. The required live gate is in `LIVE_ACCEPTANCE.md`.

## Development failures retained

- The first 22 core tests passed. Adding protocol/HTTP tests produced 37/37.
- Adding six audio tests initially produced 42/43: at 44.1 kHz, floating fractional phase could quantize a constant half-scale sample one PCM step low. Integer interval units replaced fractional phase. All 44.1/48/16 kHz count, clipping, byte-order and block-phase assertions now pass; the expectation was not weakened.
- Review identified a concurrency lease that needed to include both the pre-attachment wait and provider setup interval. Its lifetime now covers both plus the full session and a one-second timer margin. A real HTTP admission test verifies that bound, bringing the final Node total to 44.
- The initial default Playwright executable path was missing. The environment's existing `/usr/bin/chromium` was used; no browser or package was installed.
- Direct navigation was blocked as documented above. No policy bypass was attempted. Synthetic test transport is not substituted into the delivered public demo.

Final logs, browser per-check JSON, the failed audio-development log, navigation-probe result and inspected desktop/mobile screenshots are in the downloadable evidence package. They are actual local results, not fabricated GitHub Actions results.

## Acceptance limits

Model scope adherence and honest disclosure cannot be proved by checking prompt text. Microphone/audio behavior cannot be certified by browser API doubles. Daily reservations and observed token costs are conservative controls, not an invoice guarantee: in-flight generation and delayed usage reports require verification against the approved provider. No signup URL is invented; its link remains hidden until configured. Default review mode is disconnected and cannot incur API usage.
