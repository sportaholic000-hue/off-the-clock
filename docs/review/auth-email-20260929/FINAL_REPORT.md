# Account email and password recovery — September 30, 2026

This is a scoped, tested draft based on PR #3 commit `aa81eaa29503a7c3e2ddf464c7462f556839562c`. Production email delivery and a complete public-launch gate have not passed.

## What changed and why

The old sender printed account-link tokens in logs and could not send through a production provider. Signup could commit an account, then fail with HTTP 500 when email failed. Its relative verification/reset links had no usable frontend screens.

The draft adds a Resend HTTP adapter, HTTPS application links and explicit verification/password-recovery screens. Signup stays HTTP 201 after a delivery failure, with a truthful retry state and an authenticated resend action. A resend failure consumes only its own token, preserving previously delivered links and newer concurrent requests. Provider retries use one unchanged payload and idempotency key.

The provider's accepted response is shown as accepted, not proof of inbox delivery. Console mode is identified as simulated and is refused in production. Logs contain neither email bodies nor account-link tokens.

Account links use a URL fragment. The recovery screen reads it into memory and removes it from the address bar; a verification link requires an explicit POST confirmation. The legacy backend GET verification endpoint remains compatible. Hash navigation remounts the recovery screen, so changing links on the same page cannot retain the earlier link.

Existing durable tokens remain purpose-bound, hashed in SQLite and single use. Verification expires after 24 hours; reset expires after 30 minutes. Successful verification or reset invalidates the other outstanding tokens of that purpose. Opening a frontend verification page does not consume a token. Public recovery requests return the same body for known, unknown and failed-delivery accounts; authenticated status/resend queries derive the user from authentication.

## Verified result

| Check | Result |
|---|---|
| Account delivery and durable-token checks | 32 passed |
| Existing 33-file application regression plus new account tests | 315 passed |
| Widget/billing transport | 15 passed |
| Real application + browser + SQLite account workflows | 10 passed |
| Production application and widget builds | Passed |
| Unchanged local source compared with the verified PR #3 copy | 293 files match |

Counts overlap: the 32 focused tests are included in the application run. See TEST_RESULTS.json, SOURCE_BINDING.json and RUN_LOGS.txt for arguments, source identities and output.

The browser exercised signup with three simulated provider failures, successful resend, explicit verification, verified account state, reused links, public recovery privacy, reset after server restart, password confirmation mismatch, old/new login passwords, unchanged payment status, malformed links and mobile layout. It reported no browser runtime errors or account tokens in application logs. Provider traffic was intercepted locally; no real email was sent.

## Failed and incomplete attempts retained

- Browser attempt 1 passed six workflows, then expected a new login to route directly to billing. The existing application returns to onboarding step 2. The assertion was corrected and the established routing/payment flow preserved.
- Browser attempt 2 passed eight workflows, then exposed a real recovery-page defect: same-page fragment navigation retained the prior token. The router now listens for hash changes and remounts that screen. Attempt 3 passed all ten workflows.
- The broad all-tests attempt included unfinished voice tests. It failed importing the missing `server/src/voice/googleGenAiLiveAdapter.js`, then reached the wrapper's ten-minute time limit during the engine group. This attempt is not a regression pass and has no complete test count.
- The missing voice-file failure was separately reproduced on the untouched PR #3 source. The documented application list was then run separately and passed all 315 tests. A complete new engine run is not claimed.

## Scope boundaries and remaining gates

Signup still creates an Operator account in pending_payment and preserves the separately requested plan. No paid entitlement, billing bypass or verification-based plan upgrade was added. Pricing, booking, calendar, voice and their tests/specifications were left intact.

All 19 files in server/quote-engine-vnext match the base tree `dcd481193b10c3cfc667cb23d22fb41b16322cff`. The original voice guide remains blob `7329bde3db8e3b38916e1cd6fbe1ca3fffaffaa5`. This branch is separate from “quotedone engine accuracy” and should be integrated after its latest changes are reviewed.

Before production email can be accepted, configure a verified sender/domain and mail-sending credentials, use the real HTTPS frontend origin, verify deep-link hosting, then exercise signup/resend/reset in a real inbox. See SETUP.md. No deployment, DNS change, live message, calendar write or billing action was performed here.

This slice does not complete every requirement of platform spec 12.10. Sessions keep the existing eight-hour JWT lifetime; resetting a password clears the current browser's stored session but does not revoke already issued JWTs on other devices. Session refresh/revocation remains a separate auth gate. IP request counters are process-local; the per-account email cooldown and token consumption are durable, but a multi-instance deployment still needs a shared public-request limiter.

The full launch also still depends on the existing voice runtime and the other launch lanes. No whole phase or public-launch gate has been marked passed.

## Copy proposed for owner review

New account labels in this draft: “Forgot password?”, “Verify your email”, “Resend verification email”, “Check verification status”, “Account email”, “New password” and “Confirm new password”. Existing Email/Password and signup/plan labels are preserved. These proposed labels are reviewable in the draft; they have not been shipped.

No subagents were used.
