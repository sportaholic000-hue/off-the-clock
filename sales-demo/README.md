# Off The Clock AI — isolated website sales demo

**Implementation and local verification; real Gemini/microphone acceptance is not yet performed.** The default is disconnected review mode. No API call, provider change, paid test, deployment or production integration was authorized or performed during this build.

## Scope

The user approved the website sales demo from `specs/build_guide.md` Phase 5 and `specs/platform_spec_v2.md` section 3.2. This branch is based on main `ed12dca1253a8790c885b071ab6037e05632bea0`. Only the new `sales-demo/` directory is added. The homepage reference, application, original and VNext engines, price books, onboarding, growth pages, package files, deployment and workflow settings stay unchanged.

The UI retains the reference's **Hear it yourself / Miles / Nova / mic / transcript / end session** arrangement and flat green/black palette. The current reference's timer-driven `demoScript` is not copied into the live implementation. The inspected older integration branch `claude/phase-2-audit-fixes` contained ordinary Gemini JSON helpers, not a located reusable Live transport. No claim is made that a working prototype outside these inspected repository paths does not exist.

## Working implementation

- Real Gemini Live WebSocket adapter, fixed Google endpoint, server-only credential and server-selected model/voice/system instruction; 16 kHz mono PCM input and 24 kHz output.
- AudioWorklet capture, phase-preserving resampling, bounded ordered uploads, interruptible playback and streaming text transcripts. No audio files or transcript persistence.
- Text chat uses the SAME native-audio session policy and output transcription, without opening the microphone or playing audio. Google still generates audio for this mode; it is not represented as free or text-only billing.
- Server-side 180-second limit, wrap-up within the final four seconds, and 10 seconds of inactivity after a response leading to a short sign-off and a maximum four-second close grace. Waiting for the model and playing its response are not treated as visitor silence.
- Combined voice/text two-session rolling-hour allowance per client IP; configurable global concurrency (default 10). IPv4-mapped variants normalize together; IPv6 is bucketed by /64. Proxy headers are ignored unless the direct peer is explicitly trusted.
- SQLite quota/accounting transactions retain attempts and reservations across restarts. Cross-midnight sessions reserve against both affected UTC days. Concurrency leases expire even after process failure.
- Origin/Host verification, strict session input schema, opaque in-memory session tokens in headers (not URLs), bounded bodies/buffers, provider timeout, isolated static asset allowlist, no raw provider errors, no customer/action tools.
- Idempotent server cleanup plus browser cleanup for End, permission denial, late permission completion, provider disconnect, tab exit and timeout.

`server.mjs` is an isolated Node HTTP harness and request surface, not a replacement for the app's Express server. Browser traffic uses same-origin HTTP uploads and a fetch-streamed NDJSON response; server traffic uses Gemini's native WebSocket. This avoids adding a WebSocket-server dependency or changing package manifests. It uses built-in WebSocket/SQLite and was tested with the existing Node 22.16.0; SQLite emits its experimental warning. No installation was done.

## Read/run without a provider

Using an already-compatible runtime:

```sh
node sales-demo/server.mjs
```

This serves the review UI at `http://127.0.0.1:8787/sales-demo/`, with an explicit disconnected notice and disabled session controls. It does not read `.env` automatically, access an application database, or call Gemini. It creates its own ignored local quota database under `sales-demo/.runtime/`.

Do not install or change the user's tools/environment to run it without approval. The delivered single HTML preview displays the interface without a server, with an honest disconnected state.

## Provider enabling is a separate authorized step

`.env.example` documents, but does not apply, the configuration. Reuse the approved existing Gemini server-side key and explicitly select its Live model. Model selection is intentionally not guessed. Configure an approved origin, daily budget, per-session reservation, conservative maximum token price and actual signup URL; only then explicitly enable the provider. Production must serve HTTPS and review the trusted proxy path. Do not paste credentials into chat, generated HTML, logs or Git.

No provider credentials were present in the working environment. Its network also could not resolve the external host during the read-only reference download attempt. Paid/provider operations were therefore not attempted. This is not a claim that the user's original Gemini account is disconnected.

For this isolated service, use one deployment instance with its own persistent local SQLite ledger. Multiple processes must share that same ledger to share limits. Separate hosts with separate databases do not provide a global budget/concurrency ceiling; distributed admission would require a separately reviewed deployment change.

## Budget semantics — important

The daily budget is a conservative **admission and observed-usage control**, not a guarantee that Google's invoice cannot exceed a dollar threshold. Before the provider opens, the configured session reservation is durably charged to the admission ledger and is not speculatively refunded. This prevents parallel sessions, restarts or missing final reports from silently treating usage as free.

Reported token counts are charged at the configured upper token rate; overlapping fields/reports may be counted more than once. When observed conservative cost reaches the reservation, further input is stopped, the socket closes and the affected daily ledger is tripped. Missing/malformed metering also fails closed. Configure the reservation and upper rate against the chosen model and verify them with actual usage. In-flight generation and delayed provider reports can still exceed an estimated reservation. Provider billing/quota controls and real metering validation are required before public launch; this code does not mislabel an estimate as exact provider spend.

A daily value of `0.01` below the session reservation returns the specified high-demand message **before any provider connection**. Text shares all caps with voice. New pending sessions count against the rate allowance, so repeated starts cannot avoid it.

## Scope/behavior boundary

The server has no quote, appointment, transfer, SMS or tenant tools. Those actions are structurally unavailable. The common system instruction provides the approved product offer, full operator + QuoteDone story, no arbitrary markup cap, no customer-job dollar quotes, one question at a time, honest AI disclosure and off-topic redirection. Subscription prices are allowed; invented job prices are not.

No deterministic keyword test is called proof of model scope adherence. Natural-language redirection, refusals, truthful disclosure and trade-specific selling require the real-model acceptance in `LIVE_ACCEPTANCE.md`. The generated implementation does not certify unsupported job paths or claim the production operator is deployed.

## Verification

```sh
node --test sales-demo/tests/*.test.mjs
python sales-demo/tests/browser.py
```

The Node suites use real localhost HTTP and SQLite plus a protocol-level fake WebSocket; there are no external provider requests. The browser suite uses the existing `/usr/bin/chromium`. This environment blocks HTTP/file browser navigation, so the UI suite explicitly substitutes transport/media and renders current HTML, CSS and JavaScript. It is not an end-to-end browser-to-Gemini test. PCM conversion has separate executable sample-count, byte-order, clipping and phase tests.

`tests/browser-harness.mjs` and `tests/browser-fixture.js` are labelled synthetic test transports. They are not served by the real server and never imported by it. The default public interface never plays a canned test conversation. Final counts, retained failures and source hashes are in `evidence/VERIFICATION.md` and the delivery package.

## Homepage connection

No homepage rewrite is needed. After provider/browser acceptance and approval, the existing demo section can host this same-origin component or its handlers; actual app mounting and deployment remain separate changes. No invented trial endpoint or hidden provider fallback has been added. A provider `goAway` closes this short sales demo safely; this pass does not build the production operator's long-call session-resumption workflow.

Do not mark Phase 5 passed until real voice, text, scope, limits and cleanup have been demonstrated against the approved provider configuration. Do not merge this branch into main or change Codex's branch automatically.
