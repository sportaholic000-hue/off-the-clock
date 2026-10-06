# Expectations recorded before execution

Pinned source: eaadeca0856f1bd7fcade8685711a19aefd786d0.
No monetary calculations are added by these lifecycle experiments. Existing quote fixtures retain their handwritten amounts. Five active calls are permitted for one owner; the sixth must capture the request. A repeated signed CallSid creates exactly one media session, and a completed call never restarts.

Source inspection before fixes:

| Item | Source evidence | Required execution result |
|---|---|---|
| D04 | productionVoiceRuntime.js passes default empty providers to voiceToolRuntime | Real composition invokes fake SMS, transfer, appointment adapters |
| D06 | voiceToolRuntime.js unavailable() already saves inquiry and callback in this base | Failed transfer retains caller words exactly once; no redundant repair |
| D07 | voiceRuntimeRoutes.js fallbackTwiml only Dial/Say/Hangup; persistence errors swallowed | Capture request before forward/hangup; persistence failure is retryable |
| D08 | voiceRuntimeRoutes.js normalizeIncomingCall rejects all non-E164 From values | Signed anonymous caller reaches the tenant selected by To |
| D25 | fallback route and store.recordFallback update completed calls unconditionally | Terminal call unchanged; no further forward |
| D26 | bridge finish sets ended before queued transcript; adapter close drops queue/modelText | Received caller and operator text persisted before session-end |
| D27 | production constructor/store do not recover CONNECTING/CONNECTED calls | Restart creates durable, idempotent recovery leads |
| D28 | onboardingService.operatorEligibility only checks phone/about/hours | Readiness includes actual enabled inbound route |
| D31 | each inbound callback issues a new nonce, even for an existing call | One durable response/nonce; no parallel sessions or reopened final call |
| D32 | no active-call count in gate or createSession transaction | Atomic default ceiling of five and capture fallback for excess |
| P01 | voice guide promises quote today, compiler injects it | No deadline without explicit owner-authored policy |

All owners, numbers, messages, provider clients and stores are synthetic. No real calls/texts/provider writes or deployments.

Capacity follow-up: source counted every CONNECTING row indefinitely. Before repair, an execution with one connected call and four expired unused reservations admitted zero of the expected four new sessions. The fifth new call must still use capture fallback. The failing execution is archived as `expired-reservation-before.tap.gz`; the repaired transaction counts unused reservations only while their matching nonce is unexpired.
