# Review production account-email configuration

The existing server supports Resend for account messages. Set values in the protected server environment; this packet does not change live configuration.

Required:
- NODE_ENV=production
- CLIENT_URL = actual HTTPS frontend origin, with no path/query/fragment/credentials
- EMAIL_PROVIDER=resend
- EMAIL_FROM = actual mailbox on the verified sending domain
- RESEND_API_KEY = mail-sending key held only on the server
- EMAIL_DELIVERY_ENABLED=true only for the configured/authorized test or release environment

Review the built VITE_API_URL and exact server CORS_ALLOWED_ORIGINS together. Changing CLIENT_URL does not rewrite a client bundle. Keep the current session-cookie transport requirements: same-site frontend/API or same-origin /api proxy. Never place provider keys in VITE variables.

Check provider domain verification and its exact SPF/DKIM records. Inspect current DNS and DMARC before preparing any change so existing business mail is preserved. Project spec 13.10 requires SPF/DKIM/DMARC and actual Gmail/Outlook owner-alert placement. Provider domain verification and account-email receipt are separate facts.

Review provider click/open tracking for transactional account links. Resend describes keeping tracking disabled for important password-reset mail; validate any current provider settings against the actual fragment-based links. [Provider domain guidance](https://resend.com/docs/dashboard/domains/introduction).

Review host/proxy timeouts against up to three five-second sender attempts plus bounded backoff. Confirm client-IP handling behind the actual trusted proxy for auth limits; the deployment topology is not known yet, so no proxy trust configuration is proposed here.

Preserve SQLite DATABASE_PATH across hosting restarts and maintain its backup. Runtime startup validation also requires the existing JWT/credential/booking secrets and public origins. This packet supplies no new credentials or deployment architecture.

The local .env.example disables actual delivery and contains example localhost URLs. It is a development template, not evidence of production readiness.
