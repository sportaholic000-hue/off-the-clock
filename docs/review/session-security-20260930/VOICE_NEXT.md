# Voice/runtime and ON/OFF handoff to Claude

The owner assigned voice/runtime and ON/OFF work to Claude on September 30, superseding the earlier authorization for this account/security chat. This chat remains in auth/session/CI and has written no new voice implementation in PR #4. Coordinate with the owner-designated engine/calendar agent; its current audit and repairs have priority in that lane. The prior shared contracts remain in WORKING_DIRECTION_20260930.md.

Initial read-only inspection of the saved Git tree confirms existing tests import these absent modules:
- `server/src/voice/googleGenAiLiveAdapter.js` — provider adapter test imports it.
- `server/src/voice/voicePromptCompiler.js` — original-guide compiler test imports it.
- `server/src/voiceWebSocketServer.js` — transport-boundary test imports it.

Existing media bridge, codecs, signed request/nonce boundaries, tenant resolver, persistence and voice tool runtime need a complete wiring inspection before repairs. Missing module tests are evidence of incomplete implementation, not proof of all remaining defects. Read each entire test and the runtime entry points; do not manufacture test passes by weakening negative controls. Verify current official provider API contracts before writing adapters. Use a separate voice branch based on the verified PR #4 integration, preserve the original 459-line guide and peer runtime, and save each reviewable source checkpoint to GitHub with readback.

Keep the shared quote/booking contracts: approved owner offerings, integer cents and server-only arithmetic; no raw rates in model context; no inferred fence post layouts or paintable area from floor area; callback contact required, name optional; supported selected work may quote while separate unpriced work is retained; booking confirmation requires shared-service verified status/event identity/exact requested instants. Confirm service and numeric read-back, retain transcripts only, and enforce tenant and plan/cap boundaries.

Start with deterministic provider-free voice tests and a signed HTTP/WebSocket integration against an isolated store. Real phone calls, messages, calendar writes, deployment and carrier forwarding changes remain behind their release gates. The owner-authoritative OFF outcome is the existing business phone ringing normally without a permanent Twilio bridge; rejecting a call at Twilio alone does not meet it. No universal carrier-control claim is authorized by this plan.
