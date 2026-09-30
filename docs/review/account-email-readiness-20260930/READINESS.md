# Account email readiness — September 30, 2026

Status: independent preparation complete; real environment and inbox acceptance remain unverified.

Inspected source: `ad925d0fa368f295fd2f22b53ef115c55b5f4bdb`, draft PR #4. Production auth implementation is unchanged by this readiness work. The latest [exact-source hosted verification](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36746295639) passed; its emails were intercepted synthetic traffic and do not prove inbox delivery. The inspection binding accompanies this packet.

## What is implemented

The Resend sender uses a fixed provider endpoint, a five-second attempt timeout, three bounded attempts, and the same body/idempotency key on retries. It requires a valid provider receipt before reporting accepted. Accepted means provider acceptance, not inbox delivery. Console delivery is explicitly simulated and is rejected in production.

Signup preserves the created account and payment gating when delivery fails. Verification/reset tokens are hashed, purpose-bound, single use and durable; successful reset revokes the account's server sessions. New links target frontend routes with token fragments, and explicit verification submits a POST. The frontend removes token fragments from the address bar. The account recovery screens preserve truthful failure/retry states.

Existing account/provider, browser and session checks cover these behaviors on the stated saved source. This preparation does not claim a new exhaustive audit or new test pass.

## Environment evidence still needed

| Item | Current evidence | Acceptance |
|---|---|---|
| Exact deployed server/client source | No deployment source identified | Both are bound to the approved test/release commit |
| Frontend and API URLs | Repository homepage is unset; no hosting target supplied | HTTPS origins and the actual frontend/API topology are identified |
| Recovery deep links | Implemented locally; public hosting unverified | Direct /verify-email and /reset-password load the intended built app, preserving fragments |
| Same-site session transport | Required by the current HttpOnly cookie design | Same-site frontend/API or a same-origin proxy; cookies survive login, renewal and logout |
| Resend domain/account | No live provider account inspected | Sending domain is verified and key is installed server-side |
| SPF, DKIM and DMARC | No actual domain supplied or DNS inspected | Project spec 13.10 records and provider alignment are checked |
| From mailbox and tracking | Only example configuration found | Actual From domain matches the verified domain; account links survive provider settings |
| Real inbox | No designated recipient supplied | Controlled verification/reset messages arrive and work |
| Persistent store | SQLite durability implemented; production store unverified | Store survives the actual hosting restart and retains tokens/session revocation |

The connected Vercel team listing returned zero accessible teams. This does not prove that no deployment exists elsewhere. The GitHub connector does not support the attempted deployments endpoint. Neither result supplies a deployment target. The checked local candidate has no production environment file or hosting linkage; repository examples are not live configuration.

## Required inputs for the live portion

Provide the frontend URL, API URL/hosting location, sending domain/From mailbox, and controlled recipient inbox. Keep API keys in protected server/provider settings. Once the target is known, inspect actual deployment/source metadata, DNS/provider verification and direct-route responses before sending the prepared test messages.

The live test creates only designated test accounts and verification/reset emails. It preserves pending_payment and does not activate subscriptions, provision phones or write calendars. Its messages, recipients and target environment must be concrete before execution. A deployment or DNS/settings change is separate from this read-only inspection.

## Boundaries

Voice and ON/OFF belong to Claude. Engine/calendar repairs belong to the other owner-designated agent. This work changes no application/engine/booking/calendar/voice source and sends no live email. Full launch and spec 13.10 owner-alert delivery to Gmail/Outlook remain separate acceptance gates.

Read [REAL_INBOX_TEST.md](REAL_INBOX_TEST.md) for the runnable procedure and [CONFIGURATION.md](CONFIGURATION.md) for the configuration review.

Official provider contracts checked September 30:
- Resend requires an owned verified sending domain; provider settings can differ between root domains and subdomains. [Verified Domains](https://resend.com/docs/dashboard/domains/introduction).
- POST /emails returns a receipt ID. [Send Email](https://resend.com/docs/api-reference/emails/send-email).
- Retries may reuse an idempotency key for the unchanged email request; provider keys persist for 24 hours. [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
