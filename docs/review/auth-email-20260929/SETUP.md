# Configure account email

The implemented production provider is Resend. The draft uses native fetch and adds no dependency or marketplace subscription.

## Required production configuration

Set these in the server's protected environment:

```dotenv
NODE_ENV=production
CLIENT_URL=https://your-actual-frontend-domain
EMAIL_PROVIDER=resend
EMAIL_DELIVERY_ENABLED=true
EMAIL_FROM=account@your-verified-sending-domain
RESEND_API_KEY=<mail-sending-key>
```

These are configuration examples, not real credentials. CLIENT_URL is the frontend origin only: no credentials, path, query or fragment. Production requires HTTPS. EMAIL_FROM is a plain mailbox address. Set VITE_API_URL/CORS_ALLOWED_ORIGINS for the existing frontend/API hosting topology; changing CLIENT_URL does not rewrite the already built client.

Verify the sending domain with the provider and keep the API key server-side. Never put it in a VITE variable, repository, chat, screenshot or browser bundle. The adapter uses POST https://api.resend.com/emails. It has a five-second timeout per attempt, at most three attempts, and a stable idempotency key for retries. HTTP 408/429/5xx and ambiguous transport failures retry; permanent rejection fails safely.

Resend documentation:
- [Send email API](https://resend.com/docs/api-reference/emails/send-email)
- [Domains](https://resend.com/docs/dashboard/domains/introduction)
- [Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)

The API's accepted receipt is not an inbox delivery receipt. Bounce/delivery webhooks are not added by this slice.

## Frontend hosting

Serve the built application index for /verify-email, /reset-password, /forgot-password, /resend-verification and /account/email, preserving any fragment. A direct email link must load the app. Do not redirect it to a route that loses the fragment before the app reads it.

The app removes the fragment after reading its opaque token. A refreshed or reused link offers the recovery request form; successful verification/reset is single use. The old /api/auth/verify-email?token= endpoint still works for compatibility, but new emails use the frontend path and explicit confirmation.

## Local development

EMAIL_PROVIDER=console is only simulated delivery. It logs redacted metadata and does not print usable links. Tests capture synthetic links through an injected sender/preload; production console mode is rejected. Missing Resend configuration does not fall back to console.

The EMAIL_DELIVERY_ENABLED flag starts false in .env.example. Production settings and the real-inbox test require their own authorized release step. No live settings were changed in this draft.

## Real-inbox acceptance still required

In an authorized environment, create a synthetic owner account through the actual frontend, receive its verification email, open the link, confirm verification, request another link, reject reuse, and reset its password through the actual email. Confirm old-password failure and new-password success. Confirm the account remains pending_payment until the established billing flow provides its entitlement.

Check the actual sender, link origin, spam-folder placement and any delivery failure. Retain redacted evidence, then review enabling this configuration for customer traffic.
