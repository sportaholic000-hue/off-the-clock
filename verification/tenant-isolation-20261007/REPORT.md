# Tenant isolation execution — October 7, 2026

Base: `codex/quote-release-candidate-20261006` at `73c00622d6f2df31f57773b32e41355a7421f1a3`.
Fix branch: `fix/tenant-isolation-20261007`.
No subagents, main merge, deployment, live tenants or live provider calls.

The previous audit did not clear tenant isolation. Three disclosures were reproduced in source and execution and fixed. The reviewed inventory covers **98 registered routes**: **95 explicit HTTP method/path registrations**, **2 path-mounted middleware handlers**, and **1 WebSocket callback**. Express's implicit HEAD handling for GET shares the same handlers; global CORS, body parsing, lifecycle and error middleware have an additional reviewed inventory fingerprint.

## Reproduced disclosures and fixes

| Finding | Source at the base revision | Executed result before the fix | Fixed result / regression |
| --- | --- | --- | --- |
| Cross-tenant voice fallback disclosure | `voiceRuntimeRoutes.js` converts a `createSession` CallSid collision into fallback; `resolveFallbackTwiml` swallows `recordFallback`'s binding exception. `voicePersistence.js` detects but generically throws on the collision. | A real SDK-signed incoming callback with A's existing CallSid and B's `To` returned HTTP 200 TwiML containing B's private forwarding number `+19025550299`. | Validate the stored signed account/caller/destination before looking up `To`; validate tenant binding before issuing a nonce. Binding collisions propagate through fallback persistence and return the same 403 `Forbidden` for B's number and an unknown number. Real-server matrix plus persistence and HTTP race regressions. |
| Cross-tenant CallSid existence oracle | `server.js` phone-test status route uses one error for a found-but-foreign provider call, but lets provider missing-call exceptions reach the error response. | A querying B's synthetic provider CallSid got 404 `{"error":"Test call not found"}`; an absent CallSid got 404 `{"error":"SYNTHETIC provider missing call"}`. | Normalize provider 404/20404 to the identical fixed 404 response. Real-server foreign-versus-absent response equality regression. |
| Public account email existence oracle | `auth.js` registration returns 409 for existing email; a new email returns 201, an account and a session. | HTTP execution of the exact base-revision handler returned 409 `An account with this email already exists` for B, versus 201 with account, token and cookie for a fresh synthetic email. | Both return 202 `{"ok":true}` without account, token or cookie. New owners cannot sign in before email verification; existing accounts/passwords remain untouched. Failed delivery and concurrent duplicate handling stay generic. Real-server response equality plus verification/recovery/login regressions. |

Two additional refusal gaps were hardened: contradictory owner/tenant/business selectors in parameters, query, body and headers now receive generic 403 responses; quote submission/preparation refuses another tenant's saved service ID with the same 404 as an absent service. These previously stayed within the caller's tenant but accepted requests that explicitly named another business.

Signup now waits for email verification instead of starting an authenticated session immediately. Unverified owners must use the existing verification/recovery flow before sign-in. Paid access still requires independently verified billing evidence.

## Fixture and matrix

`test/helpers/tenantIsolationFixture.mjs` starts the actual production server entry point with real migrations, bcrypt/session validation, price-book storage, billing state, booking capabilities, durable voice nonce/session stores and SDK signature verification. Each of A and B has an owner, staff member, saved and approved price book, quote, quote request, lead, call, appointment/booking intent, confirmed hold, signed confirmation handle, failed outbound webhook delivery, knowledge base, billing customer/subscription and its own phone/fallback number. B has extra rows to detect aggregate-count contamination.

The fixture replaces only provider transports with explicit synthetic responses. External HTTP(S) and fetch are blocked and counted; the matrix requires zero blocked network attempts and zero provider mutations. Every tenant table and price book is snapshotted, including owner and staff user rows. Foreign attempts cannot change B; public email recovery may issue only its intended opaque recovery receipt and cannot change B's password or business records.

`test/tenantIsolationRoutes.spec.mjs` compares runtime registration to the separately reviewed `routes.json` in both production and development/preview. It recursively walks mounted routers; lifecycle wrappers retain router inventory. `middleware.json` catches added global handlers. The guard is itself executed with a new route and an anonymous router and must fail coverage for both. A separately reviewed `route-sources.json` fingerprints route-declaring server files; new declarations hidden behind unconfigured feature flags also fail. An unexecuted conditional-route source probe verifies that guard. The matrix is automatically selected by both `npm test` and `npm run test:quote`.

| Policy | Executed applicable threats |
| --- | --- |
| owner / team / admin | A→B and B→A credentials and explicit selectors; independent forged headers and mutation-body selectors; unsigned access; staff on owner/admin actions in both tenants; foreign path IDs versus absent/sequential guesses with byte-identical errors; foreign tenant snapshots unchanged. |
| widget | A key plus B business selector/service ID and the reverse; foreign Origin; guessed key; foreign versus absent service IDs; no foreign data in response or headers. |
| booking-capability | A opaque token plus B selector/record; B token from A origin; guessed token and foreign hold/confirmation IDs; no foreign reads/writes. |
| stripe | Real SDK signatures with A customer/B subscription and reverse, plus misleading owner/phone metadata; invalid signature; mismatched stored billing bindings fail generically and leave tenant records unchanged. |
| voice | Real SDK signatures with A's bound CallSid and B's number; same CallSid with unknown number; bad signature; A stream nonce plus B start metadata; guessed/unsigned stream nonce. No foreign fallback, nonce, transcript or media response. |
| oauth-capability | Unknown/guessed state receipts with A credentials and B selector; callback refuses without exposing foreign credentials/data. |
| auth | Wrong tenant password; invalid purpose/token; cross-session refresh cookie; malformed session logout; public signup/recovery response equality, no session before verification, no password replacement. |
| platform | Health/schema/JavaScript/assets/preflight/SPA carry no tenant data; demo's arbitrary tenant payload is rejected. |

Public health, assets, CORS, generic signup/recovery and idempotent malformed logout have no tenant resource to authorize and may correctly return a neutral 2xx. Valid secret booking/OAuth capabilities and provider signatures are independent authority, not owner credentials; the matrix tests mismatched bindings, not compromise of a global signing secret. The gate does not claim that genuine signed inbound calls for B, holding B's secret bearer capability, or full account credentials should be refused.

Own-tenant reads remain available. Adding B calls cannot change A's owner/staff dashboard counters. Canary identifiers, emails, phone numbers, private strings, booking tokens and widget keys must not appear in foreign response bodies or headers. Existing versus absent resource errors are compared byte for byte.

## Verification checkpoint

Final focused command:

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test-concurrency=1 --test test/accountEmail.spec.mjs test/authSessionHttp.spec.mjs test/launchPlans.spec.mjs test/ownerCallVisibilityHttp.spec.mjs test/tenantIsolationRoutes.spec.mjs test/architectureGuard.spec.mjs test/voicePersistence.spec.mjs test/voiceRuntimeRoutes.spec.mjs test/bookingRoutes.spec.mjs test/lifecycle.spec.mjs
```

Actual output: **287 tests; 287 pass; 0 fail; 0 cancelled; 0 skipped; 0 TODO**. The isolation matrix contributes **199 tests** (98 route union, exercised in both server modes plus guard/control tests; mode-specific registrations differ).

The refined existing-ID matrix and owner-integration contract checks also passed **238/238**, including the same 199 matrix tests and 39 integration tests, with zero failures/skips. Existing owner-integration tests now require generic 403 for foreign selectors and retain separate positive CSV/settings reads.

Cold Node 22.22.0 `npm ci` and both production builds passed locally. The latest local cold strict run reported **2,230/2,267**, and the full run **2,612/2,649**: each has **37 failures**, all Chromium startup crashes (SIGTRAP), and zero cancellations/skips/TODOs. All other tests pass. These are failed local gates, not passing browser evidence. No tests have been skipped, removed, allowlisted or changed to hide that failure. The full-suite result checker now rejects all failures, skips, cancellations and TODOs, including known failures.

**Hosted cold verification passed at source/test/CI SHA `552585bcc964e9d4bdf4f35f9a1080c300217f48`.** [CI run 37566309857](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37566309857) completed successfully. It removed all installed dependencies, ran `npm ci`, installed Chromium, built owner/widget assets, ran `npm run test:quote` (**2,267/2,267**, 95 files) and `npm test` (**2,649/2,649**, 137 files). Both suites report **zero failures, cancellations, skips and TODOs**. The production dependency audit found zero vulnerabilities. The 199-test synthetic matrix and added-route/anonymous-router/source guards pass inside both hosted gates.

The pushed code is verified. The final documentation checkpoint changes only this report and `specs/BUILD_STATUS.md`; no application, tests or CI code changes after the tested source SHA. Its own hosted CI run is also checked before delivery.

**Unfinished environment constraint:** the same local cold gates remain failed because Chromium cannot start (37 SIGTRAP failures in each suite). Hosted cold execution supplies the complete browser and zero-failure suite evidence. No live tenant/provider validation, main merge or deployment was performed or requested as part of this isolated task.

## Every registered route

The policy column refers to the executed threats above. Explicitly reviewed source manifest: [routes.json](routes.json).

| Method / registered path | Policy |
| --- | --- |
| `DELETE /api/bookings/:bookingIntentId/holds/:holdId` | team |
| `DELETE /api/integrations/webhook` | owner |
| `DELETE /api/public/bookings/:bookingToken/holds/:holdId` | booking-capability |
| `GET *` | platform |
| `GET /api/admin` | admin |
| `GET /api/auth/account` | team |
| `GET /api/auth/verify-email` | auth |
| `GET /api/billing/status` | owner |
| `GET /api/booking/configuration` | owner |
| `GET /api/booking/readiness` | owner |
| `GET /api/calendar/busy` | team |
| `GET /api/calendar/schedule` | team |
| `GET /api/calls` | team |
| `GET /api/calls/:id` | team |
| `GET /api/dashboard` | team |
| `GET /api/exports/:kind` | owner |
| `GET /api/health` | platform |
| `GET /api/integrations/webhook` | owner |
| `GET /api/leads` | team |
| `GET /api/leads/:id` | team |
| `GET /api/onboarding/calendar/google/callback` | oauth-capability |
| `GET /api/onboarding/calendar/google/start` | owner |
| `GET /api/onboarding/phone/test/:callSid` | owner |
| `GET /api/onboarding/state` | owner |
| `GET /api/pricebook/:ownerId` | owner |
| `GET /api/pricebook/interview` | owner |
| `GET /api/pricebook/interview/:draftId` | owner |
| `GET /api/pricebook/interview/:draftId/review` | owner |
| `GET /api/pricebook/meta` | owner |
| `GET /api/public/bookings/:bookingToken/confirmations/:confirmationId` | booking-capability |
| `GET /api/public/quote/:publicKey` | widget |
| `GET /api/quotedone/access` | owner |
| `GET /api/quotes` | team |
| `GET /api/schema` | platform |
| `GET /demo/otc-live-demo.js` | platform |
| `GET /widget-app.js` | platform |
| `GET /widget.js` | platform |
| `OPTIONS /api/demo/session` | platform |
| `PATCH /api/leads/:id` | team |
| `POST /api/admin/login` | auth |
| `POST /api/auth/account/resend-verification` | team |
| `POST /api/auth/forgot-password` | auth |
| `POST /api/auth/login` | auth |
| `POST /api/auth/logout` | auth |
| `POST /api/auth/refresh` | auth |
| `POST /api/auth/register` | auth |
| `POST /api/auth/resend-verification` | auth |
| `POST /api/auth/reset-password` | auth |
| `POST /api/auth/verify-email` | auth |
| `POST /api/billing/checkout` | owner |
| `POST /api/billing/portal` | owner |
| `POST /api/bookings/:bookingIntentId/availability` | team |
| `POST /api/bookings/:bookingIntentId/confirm` | team |
| `POST /api/bookings/:bookingIntentId/holds` | team |
| `POST /api/bookings/:bookingIntentId/preference` | team |
| `POST /api/business/jurisdiction` | owner |
| `POST /api/demo/session` | platform |
| `POST /api/dev/preview/operator` | owner |
| `POST /api/dev/preview/telephony` | owner |
| `POST /api/integrations/webhook/deliveries/:id/retry` | owner |
| `POST /api/integrations/webhook/rotate-secret` | owner |
| `POST /api/onboarding/account` | owner |
| `POST /api/onboarding/business-types` | owner |
| `POST /api/onboarding/calendar` | owner |
| `POST /api/onboarding/knowledge-base` | owner |
| `POST /api/onboarding/knowledge-base/draft` | owner |
| `POST /api/onboarding/phone/provision` | owner |
| `POST /api/onboarding/phone/test` | owner |
| `POST /api/onboarding/voice` | owner |
| `POST /api/operator/toggle` | owner |
| `POST /api/pricebook/interview` | owner |
| `POST /api/pricebook/interview/:draftId/assist` | owner |
| `POST /api/pricebook/preview` | owner |
| `POST /api/pricebook/save` | owner |
| `POST /api/pricebook/services/:serviceId/approve` | owner |
| `POST /api/pricebook/suggest` | owner |
| `POST /api/pricebook/validate` | owner |
| `POST /api/public/bookings/:bookingToken/availability` | booking-capability |
| `POST /api/public/bookings/:bookingToken/confirm` | booking-capability |
| `POST /api/public/bookings/:bookingToken/holds` | booking-capability |
| `POST /api/public/bookings/:bookingToken/preference` | booking-capability |
| `POST /api/public/quote/:publicKey` | widget |
| `POST /api/public/quote/:publicKey/prepare` | widget |
| `POST /api/quote/calculate` | team |
| `POST /api/quote/prepare` | team |
| `POST /api/quote/test` | owner |
| `POST /api/quotedone/access` | owner |
| `POST /api/stripe/webhook` | stripe |
| `POST /api/twilio/voice/fallback/:nonce` | voice |
| `POST /api/twilio/voice/incoming` | voice |
| `PUT /api/booking/policies/:serviceId` | owner |
| `PUT /api/booking/settings` | owner |
| `PUT /api/integrations/webhook` | owner |
| `PUT /api/pricebook/interview/:draftId` | owner |
| `PUT /api/widget/settings` | owner |
| `USE /api/demo/session` | platform |
| `USE /assets/*` | platform |
| `WS /api/twilio/voice/stream/:nonce` | voice |
