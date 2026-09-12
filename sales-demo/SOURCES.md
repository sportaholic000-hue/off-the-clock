# Source and decision record

Repository base: `sportaholic000-hue/off-the-clock` at `ed12dca1253a8790c885b071ab6037e05632bea0`.

## Requested basis

- `AGENTS.md`, `specs/BUILD_STATUS.md` — scoped work, source/test evidence, no audio recording or engine changes.
- `specs/platform_spec_v2.md` sections 0, 2 and 3.2 — product positioning, the reference styling, Miles/Nova, live conversation, text fallback, product-only scope and the four cost/abuse controls.
- `specs/build_guide.md` Phase 5 — the existing homepage is retained; real provider and adversarial acceptance is required.
- `design-reference/homepage/index.html`, demo section — retained visual arrangement and entry copy. That reference contains timer-driven sample replies, which are not reused as live responses.
- Existing `server/src/platformIntegrations.js` at `7d251ea28fcb47d56edc2a3efe7e9ebcd852570e` — inspected for reusable Gemini work; it contains JSON generation helpers for other purposes. No engine-linked helper is imported into this demo.

The quotes, appointments and customer data parts of the application are not sources of live data for this demo. The supplied VNext report confirms its separate isolated checkpoint, not approval to modify it.

## Outside documentation checked September 11, 2026

- Gemini Live WebSocket reference: https://ai.google.dev/api/live
  Fixed endpoint; setup acknowledgement; system instructions; audio/transcript/interruption events; usage metadata; no need for customer tools.
- Live capabilities: https://ai.google.dev/gemini-api/docs/live-api/capabilities
  Raw little-endian PCM; 16 kHz input and 24 kHz output; native-audio models use AUDIO output with transcription for text display; 500–800 ms VAD silence guidance.
- Live best practices: https://ai.google.dev/gemini-api/docs/live-api/best-practices
  Context can be rebilled on each turn; transcriptions add costs. No flat per-minute spend assumption is used.
- Model pricing: https://ai.google.dev/gemini-api/docs/pricing
  Consult the chosen model's current rates before enabling. No model upgrade, new API key or financial commitment was made from this research.

## Implementation choices (not new product claims)

Native Node WebSocket and SQLite are used by a standalone server harness so no repository dependency or application route is edited. Same-origin binary uploads and a streamed response connect the UI to the harness. SQLite retains conservative admission accounting and anonymized rolling-hour attempts, not call audio or transcripts. Four-second close grace, body/stream caps, explicit origin and bounded errors are engineering protections around the specified demo; they do not change business pricing or engine behavior.
