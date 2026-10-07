# Voice core repairs

Branch: `fix/voice-core`.
Verified starting branch: `codex/audit-small-repairs-20261007`.
Verified starting revision: `4db13a2945193762bbc4b85f9ab616a00e1dd067`.

Each defect was reproduced independently before repair, by reading its source at the exact base and executing the failing behavior. The original nine regression cases (two saved voices) produced **0 passed, 9 failed, 0 skipped**. Those failures were expected and recorded before product edits. The expanded suite uses SQLite/HTTP/WebSocket, server-side rendering, synthetic accounts and fake Google, Twilio, calendar and email providers.

| Defect | Source confirmation at the base | Execution regression | Repair |
|---|---|---|---|
| Fresh Operator booking | `server/src/voice/toolSchemas.js`: checkAvailability required both quoteHandle and leadHandle; production blocks calculated quote tools for Operator. | `voice-core 1` in `test/voiceCore20261007.spec.mjs` | Added an owner-enabled general Appointment policy and a persisted lead-backed intent. Existing calendar, service-area, slot, address and confirmation checks still apply. |
| Saved voice and greeting | `server/src/voice/productionVoiceRuntime.js`: Neither saved voiceId nor greeting was supplied to the live adapter/compiler. | `voice-core 2 (male and female)` in `test/voiceCore20261007.spec.mjs` | Mapped male/female to Charon/Kore and supplied the literal saved greeting to the call instruction and connection event. |
| Callback contact | `server/src/voice/toolSchemas.js`: captureLead rejected phone; persistence overwrote contact.phone with signed From. | `voice-core 3` in `test/voiceCore20261007.spec.mjs` | Validated caller-provided E.164 callback contact, retained corrections, and used it in owner lead views, emails and pending webhooks. A late number correction also queues a fresh owner alert. Caller ID remains the identity/history binding. |
| Unreadable quote storage | `server/src/voice/productionVoiceRuntime.js`: publicPrompt loaded the quote book before opening the live provider, without recovery. | `voice-core 4` in `test/voiceCore20261007.spec.mjs` | Kept ordinary answering live, omitted unavailable calculated-quote services, and queued an owner alert. Dashboard and call views expose the recovery notice. |
| Invalid voice settings | `server/src/onboardingService.js`: saveVoice coerced values to strings and accepted names that the compiler rejects. | `voice-core 5` in `test/voiceCore20261007.spec.mjs` | Validate types, name/greeting limits, controls, voice choices, transfer number and windows before saving. |
| Operator OFF | `server/src/voice/productionVoiceRuntime.js`: All ineligible calls received captureChoice, including confirmed OFF. | `voice-core 6` in `test/voiceCore20261007.spec.mjs` | Confirmed OFF routing dials the business without a live AI session or capture. Incomplete forwarding fails closed without a forwarding loop. Signed completion records the owner call with zero AI minutes. OFF human routing remains independent of subscription status. |
| Transfer hours | `server/src/voice/voiceToolRuntime.js`: transferCall dialed the existing owner number without checking owner windows. | `voice-core 7` in `test/voiceCore20261007.spec.mjs` | Added saved owner transfer number/windows in the existing settings surface, checked in the owner timezone at both runtime and provider boundaries. Outside/unconfigured windows persist a callback and failed-attempt evidence. |
| Owner-local call timestamps | `client/src/calls.jsx`: The Calls feed and detail rendered stored UTC strings directly. | `voice-core 8` in `test/voiceCore20261007.spec.mjs` | Supply the authenticated owner timezone and format call, linked-record and call-delivery timestamps locally with a zone indication. |

The added regression file also checks missing booking policy/address/service area/calendar, owner calendar configuration without a price book, foreign booking sources and lead handles, callback email corrections, invalid callback contacts, OFF replay and signed completion, pending/failed carrier routing, transfer start/end boundaries and daylight-saving changes, invalid windows, and fresh Operator booking through signed HTTP and live WebSocket tools.

Added regressions: **31** cases. Reviewed terminology/tenant/voice verification: **291/291 passed**, zero failures/skips.

Latest focused verification: **40/40 passed**, zero failures/skips/cancellations/TODOs (`voiceCore20261007.spec.mjs` plus `releaseIntegration20261006.spec.mjs`).

Cold installation and owner/widget build passed. Complete full and strict suites, followed by hosted CI, are run before task delivery; the final reply reports their exact observed counts and status. Local Chromium has independently reproduced a `SIGTRAP` before page rendering, so local browser failures are distinguished from product failures; tests remain enabled.

No subagents, main merge, deployment, real calls or live application data. No quote engine or price-book changes. The CI push filter now includes only the requested additional `fix/voice-core` branch.

Tenant route review: the dashboard retains the same owner/staff authentication and tenantOwnerId selection; signed voice routing retains To-based tenant resolution, call binding and nonce checks; transfer endpoints retain signed parent/child call binding. No route or global middleware registration was added or removed. Only these three reviewed route-source fingerprints were updated. The unchanged complete 98-registration, two-mode tenant matrix is rerun. The terminology check now reads the extracted voice validator as well as onboarding, retaining its original human-readable error wording assertion.

The review-lead regression now asserts one enriched quote-review inquiry, its original NEEDS REVIEW disposition and calculation evidence, its saved caller name, and the immutable caller number. This replaces the obsolete assumption that contact capture must create a second generic voice_lead. Focused runtime/callback verification passed **40/40**, zero failures/skips.
