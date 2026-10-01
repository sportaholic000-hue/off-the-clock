# Website live voice demo — go-live checklist

Branch `claude/live-demo`. Status as of 2026-10-01.

## How it works

1. The homepage loads `GET {APP}/demo/otc-live-demo.js`. The widget sits over the homepage's scripted demo area (the Claude Design runtime rebuilds its own DOM, so the widget lives outside it and keeps the original area's space).
2. On "Start", the browser calls `POST {APP}/api/demo/session` with `{"agent":"miles"|"nova"}`.
3. The server mints a single-use Gemini Live token. Model, voice and instructions are locked in the token (`bidiGenerateContentSetup`). The API key never leaves the server.
4. The browser talks to Gemini directly with that token. No audio is stored anywhere.

## Verified

| What | How it was verified |
|---|---|
| Endpoint: origin allowlist, strict body, locked setup, single use, 2 sessions per visitor per rolling hour, concurrency ceiling, daily cap, generic provider errors, config validation | `test/liveDemo.spec.mjs`, 10/10; full suite 958 tests, only the 9 known voice failures |
| A hostile browser setup ("You are Bob…") cannot override the locked instructions; a used token is refused | Live probe against Gemini, run 36835659359 |
| Google ends the session at the token's expiry (hard per-session cost bound) | `e2e/token-expiry.mjs`, two runs: closed at exactly 40 s, "auth token has expired" |
| Real browser + real Gemini, spoken question via synthetic microphone: full sentence transcribed, relevant answer, silence sign-off with closing line | E2E run 36880070372 |
| Text chat, real Gemini: weather redirected, job price refused, "digital employee" when asked, "Yes" when asked if that means AI, injection refused, QuoteDone price correct, silence sign-off | E2E run 36880070372 |
| Time cap: closing line spoken, session ends | E2E run 36880070372 (45 s test cap) |
| Layout at 375, 768 and 1280 px; widget adds no horizontal overflow | Local browser checks |

## Claims the agent makes — must be true on launch day

The demo instructions list the locked product-rule features. Each one must work in production before the demo goes public, or be removed from `server/src/demo/demoInstructions.js`. Status from code search on 2026-10-01:

| Claim | Status |
|---|---|
| 24/7 phone answering | **Not live.** The incoming-call endpoint returns a fixed message; the voice runtime is not mounted |
| Booking by phone | **Not live** (depends on phone answering). Widget booking exists |
| Calendar sync | Code exists (Google Calendar adapter, OAuth). Not verified against live Google |
| CRM / customer records | `customers` table exists. Owner-facing CRM view not verified |
| Transcripts | **Not live** (no calls reach the AI) |
| Lead capture | Widget quote requests are captured and counted |
| Automatic text follow-ups and reminders | **Not built.** `outboxEvents` has no sender. The agent currently says this (seen in two real runs) |
| Live transfer | **Not live.** Only a voice-tool definition exists |
| Spam filtering | **Not built.** Only a database column; the preview mode shows a made-up "23 spam calls blocked" figure |
| Quote-request counter | Exists (dashboard) |
| Webhooks and CSV | In progress on `codex/operator-exports-webhooks-20261001`, not merged |
| Quoting by phone | **Not live** (voice). Widget quoting exists |
| Keep your number, turn answering on/off from your phone | **Not built** (forwarding setup step pending) |
| Trial, 30-day money-back, cancel anytime | Trial requires a verified card (database guard). Checkout and cancellation not verified against live Stripe |

## Deploy settings (app server)

| Variable | Value |
|---|---|
| `DEMO_ENABLED` | `true` to turn on; `false` turns it off instantly |
| `GEMINI_API_KEY` | production key, server only |
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` (default) |
| `DEMO_ALLOWED_ORIGINS` | the homepage origin(s), e.g. `https://www.offtheclockai.com,https://offtheclockai.com` |
| `DEMO_TRUSTED_PROXY_HOPS` | number of proxies in front of the app that add `X-Forwarded-For` (Railway: to be confirmed). With `0`, every visitor behind the proxy shares one hourly allowance |
| `DEMO_SESSIONS_PER_IP_PER_HOUR` | `2` |
| `DEMO_MAX_CONCURRENT` | `10` |
| `DEMO_DAILY_SESSION_CAP` | `200` (cost ceiling: at most this many sessions, each hard-capped by Google at 3:30) |
| `DEMO_IP_SALT` | random secret (visitor IPs are stored only as salted hashes) |

Homepage line, added before `</body>` of the Claude Design export:

```html
<script src="https://APP-HOST/demo/otc-live-demo.js" data-signup="https://SIGNUP-URL" defer></script>
```

If the homepage host sends a Content-Security-Policy, it must allow `script-src` APP-HOST, `connect-src` APP-HOST and `wss://generativelanguage.googleapis.com`, and `worker-src`/`script-src` `blob:` for the microphone worklet.

## Still to verify

- On a real phone and laptop with speakers (echo, Bluetooth headsets, iOS Safari microphone permission).
- Behind the production proxy: the hourly allowance must be per visitor, not shared.
- Cost per session at current Gemini pricing.
