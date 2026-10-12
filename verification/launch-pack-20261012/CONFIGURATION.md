# Launch configuration worksheet — owner review

Prepared October 12, 2026 for the October 20, 2026 target. Configuration source remains `rc-20261012k` / `ead53fa174d577b280506b67573a29d6b0358237`; candidate l preserves these names and values. The retention repair and final candidate validation are recorded in [candidate l’s report](../release-candidate-20261012l/REPORT.md). This worksheet remains unapproved and undeployed. These are proposed settings, not a readback of any account. No credentials were obtained or created. Replace every angle-bracket placeholder privately; do not paste this document as an environment file.

## Configuration order and dependencies

1. Confirm the deployment source and suspend automatic deployment under separate owner authorization before changing infrastructure or merging to `main`. Attach the actual `/data` volume and select the root Dockerfile first.
2. Enter the core configuration and independent secrets. For the first infrastructure check use `ALLOW_PROVIDER_WRITES=false`, `VOICE_RUNTIME_ENABLED=false`, `STRIPE_BILLING_ENABLED=false`, `DEMO_ENABLED=false`, `EMAIL_DELIVERY_ENABLED=false`, `EMAIL_PROVIDER=console`, and `OUTBOUND_WEBHOOKS_ENABLED=false`. This is an acceptance stage, not a launch configuration.
3. Prepare the complete provider groups, domain/TLS and private backup destination. Record secret names and recovery custody, never secret values, in evidence.
4. Only in the complete, separately owner-authorized launch configuration set `ALLOW_PROVIDER_WRITES=true` and enable the accepted features. Restore the intended email values below. The provider-write flag alone does not enable Stripe, voice, email or the demo, and is not a universal network-off switch: backups, demo sessions and basic transactional email have separate gates. The Twilio duration-recovery reader also operates independently of the write gate.

| Dependency | Actual behavior/source |
|---|---|
| Provider writes and Twilio | `ALLOW_PROVIDER_WRITES=true` requires `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` at startup, even if the immediate operation is Stripe or Google. `runtimeConfig.js:90–100`. |
| Stripe | Enable flag plus the complete Stripe group below; Checkout/portal/cancel/reactivate additionally require provider writes. `billingConfig.js:47–118`; `billingRoutes.js:785,827`; `billingCustomerLifecycle.js:384–387`. |
| Calendar | All three Google variables or none. OAuth callback requires provider writes and Operator/QuoteDone entitlement. New grants request only `calendar.freebusy` and `calendar.events.owned`; older equivalent/full grants remain accepted. `deploymentConfig.js:69–72`; `server.js:352–374`; `googleCalendarScopes.js:2–28`. |
| Voice | Enable flag plus Twilio account/auth token, Gemini key and explicit Live model. Route readiness also requires provider writes and a signing secret. `runtimeConfig.js:102–118`; `voice/voiceReadiness.js:2–12`. |
| Email | Basic account sender checks its own four email settings at send time, not startup. Owner alerts/quote delivery also require provider writes; billing delivery uses that gate. Receipt reconciliation reads Resend as well as sending. `email.js:14–57`; `ownerAlertEmail.js:3–7`; `ownerEmailDelivery.js:5–15`; `quoteEmailProvider.js:2–21`; `server.js:200,329–334`. |
| Off-site storage | Complete five required values enable daily and continuous workers automatically in production. No extra enable flag exists. Invalid/missing configuration can coexist with `/api/health` 200, but backup health is unhealthy. `offsiteStore.js:7–23`; `offsiteBackups.js:161–192`. |

Source paths in tables are relative to `server/src/`, unless prefixed otherwise. All variable names were checked against the pinned source and [Railway template](../../deployment/railway.env.example). A code default is not evidence of provider support or owner approval.

## Core application and storage

| Exact name | Purpose / required condition | Intended non-secret value or private placeholder | Source |
|---|---|---|---|
| `NODE_ENV` | Required production mode on Railway | `production` | `deploymentConfig.js:31–36`; root `Dockerfile` |
| `PORT` | Listener; integer 1–65535 | `3000`; domain target must match | `deploymentConfig.js:59`; `server.js:116` |
| `APP_DATA_DIR` | Required persistent application root inside attached volume | `/data/app` initially | `deploymentConfig.js:48–55,83–106` |
| `TRUST_PROXY` | Required explicit ingress policy | `railway`; use only protected Railway ingress | `deploymentConfig.js:45–47`; `clientAddress.js` |
| `PUBLIC_BASE_URL` | Required bare HTTPS application origin; no trailing slash | `https://app.offtheclockai.com` — repository's proposed app domain, owner to confirm | `runtimeConfig.js:74–79`; `deploymentConfig.js:61–63` |
| `CLIENT_URL` | Required account-link origin | Exactly `PUBLIC_BASE_URL` | `deploymentConfig.js:64`; `server.js:373` |
| `CORS_ALLOWED_ORIGINS` | Required comma-separated exact HTTPS origins, including app origin | `https://app.offtheclockai.com`; add only reviewed origins if needed | `runtimeConfig.js:38–55`; `deploymentConfig.js:63` |
| `JWT_SECRET` | Required session signing secret, at least 32 characters, non-placeholder | `<OWNER_SUPPLIED_INDEPENDENT_JWT_SECRET>` | `runtimeConfig.js:63–66`; `deploymentConfig.js:37–41` |
| `BOOKING_SLOT_TOKEN_SECRET` | Required production booking/signing secret, at least 32 bytes | `<OWNER_SUPPLIED_INDEPENDENT_BOOKING_SECRET>` | `runtimeConfig.js:82–84`; `deploymentConfig.js:37–41` |
| `CREDENTIAL_ENCRYPTION_KEY` | Required, exactly 32 decoded bytes; preserve for recovery | `<OWNER_SUPPLIED_INDEPENDENT_64_HEX_KEY>` | `runtimeConfig.js:70–72`; `deploymentConfig.js:38–41`; `credentialEncryption.js:5–17` |
| `CREDENTIAL_ENCRYPTION_KEY_VERSION` | Version label for encrypted credentials | `v1`; retain same label during restore | `credentialEncryption.js:33` |
| `BCRYPT_COST` | Password hashing; 12–16 | `12` | `passwordHashConfig.js:2–8` |
| `SHUTDOWN_TIMEOUT_SECONDS` | Application drain deadline, 5–115 | `110` | `deploymentConfig.js:57`; `lifecycle.js` |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | Owner-set Railway control, also validated by app; at least app timeout +5 | `120` | `deploymentConfig.js:58`; Railway template |
| `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` | Owner-set platform control, not read by application | `0`, single-volume setup | Railway template; `docs/RAILWAY_SETUP.md` |
| `BACKUP_INTERVAL_SECONDS` | Local snapshot interval, 60–86400 | `21600` (six hours) | `deploymentConfig.js:78`; `backups.js:204–229` |
| `BACKUP_RETENTION_DAYS` | Local snapshot age retention, 30–365; always preserve newest | `30` | `deploymentConfig.js:79`; `backups.js:122–125` |
| `LOCAL_PREVIEW_MODE` | Production refuses local preview | `false` | `deploymentConfig.js:66` |
| `ALLOW_PROVIDER_WRITES` | Shared permission gate | `false` during infrastructure checks; `true` only in complete, owner-authorized launch configuration | `runtimeConfig.js:30–32,90–100` |
| `OUTBOUND_WEBHOOKS_ENABLED` | Existing customer webhook worker; separate outbound control | `false` during infrastructure/restore isolation; template launch value `true` after owner authorization | `outboundWebhookTransport.js:106–110` |
| `ADMIN_EMAIL` | Optional at startup, necessary with hash for this pack's authenticated health acceptance | `<OWNER_SUPPLIED_ADMIN_EMAIL>` | `deploymentConfig.js:74`; `auth.js:255–262` |
| `ADMIN_PASSWORD_HASH` | Paired admin bcrypt hash; never plaintext; cost 12–16 | `<OWNER_SUPPLIED_BCRYPT_HASH>` | `deploymentConfig.js:75`; `authSessionService.js:51–52` |

The three signing/encryption secrets must be distinct and not repeated placeholders. Keep a private recovery copy outside the Railway volume. Changing credential or archive keys without a recovery plan can make retained data unreadable.

## Platform-provided and derived values — do not invent

| Name | Required treatment | Source |
|---|---|---|
| `RAILWAY_ENVIRONMENT_ID` | Railway supplies it. Do not fabricate it to satisfy validation. | `deploymentConfig.js:33,46,89` |
| `RAILWAY_VOLUME_MOUNT_PATH` | Railway supplies `/data` after attachment; verify a real mount, not just a directory or manually typed metadata. | `deploymentConfig.js:48–52,85–93` |
| `RAILWAY_GIT_COMMIT_SHA` | Railway's deployed source provenance; record actual value and compare to authorized deployment SHA. Never set it to the desired SHA to make evidence match. | `backups.js:128`; Railway template |
| `DATABASE_PATH` | Leave unset; runtime derives `APP_DATA_DIR/off-the-clock.sqlite`. | `deploymentConfig.js:54–55,103` |
| `PRICEBOOK_PATH` | Leave unset; runtime derives `APP_DATA_DIR/pricebooks`. | `deploymentConfig.js:54–55,104` |
| `TMPDIR`, `TEMP`, `TMP` | Leave manual overrides unset; runtime sets `APP_DATA_DIR/tmp`. | `deploymentConfig.js:105` |
| `CLIENT_BASE_URL` | Unnecessary legacy validation-only value; leave unset or exactly equal to public origin. | `deploymentConfig.js:65` |
| `DEMO_TRUSTED_PROXY_HOPS` | Must be absent, including empty values. | `deploymentConfig.js:47` |
| `VITE_API_URL` | Client build setting, not a runtime Railway provider setting. Leave unset for this same-origin Docker deployment. | `client/src/api.js:3` |

US East is a Railway service placement choice, not an invented application environment variable. Bucket placement is a separate selection. The bucket's actual `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `ENDPOINT` and `REGION`, and Railway-assigned DNS target/verification token, must come from the account. No bucket name, service ID, CNAME or TXT token is supplied by this pack.

## Intended launch email — owner creates key on deploy day

| Exact name | Purpose / required condition | Intended value | Source |
|---|---|---|---|
| `EMAIL_PROVIDER` | Provider selection for real transactional delivery | `resend` | `email.js:20–26` |
| `EMAIL_DELIVERY_ENABLED` | Actual delivery gate | `true` in accepted launch configuration | `email.js:26`; `deploymentConfig.js:42–43` |
| `EMAIL_FROM` | Bare verified sender address; required at send time | `no-reply@offtheclockai.com` | `email.js:28–29`; `ownerAlertEmail.js:6` |
| `RESEND_API_KEY` | Sending and delivery-receipt access | `<OWNER_SUPPLIED_ON_DEPLOY_DAY>` | `email.js:27,37`; `ownerEmailDelivery.js:9–12`; `quoteEmailProvider.js:6–21` |

Owner action: verify the sending domain, review capacity, then create the Resend key directly into Railway on deploy day. No key in Git, chat, screenshots or this pack. The current adapter performs both POST `/emails` and GET `/emails/{id}`. Resend documents `sending_access` as send-only and `full_access` as including reads; with those documented choices the current adapter needs Full access. This is a source/documentation inference, not a tested account permission result. Verify both send and read during acceptance. Do not silently substitute a send-only key or change the adapter. See dated official sources in [OWNER_ACTIONS.md](OWNER_ACTIONS.md).

## Twilio, Gemini, Calendar and demo

| Exact name | Purpose / required condition | Intended value or placeholder | Source |
|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | Required for provider writes or voice; `AC` +32 hex | `<OWNER_SUPPLIED_ACCOUNT_SID>` | `runtimeConfig.js:90–106` |
| `TWILIO_API_KEY_SID` | Required for provider writes; `SK` +32 hex | `<OWNER_SUPPLIED_API_KEY_SID>` | `runtimeConfig.js:91–98`; `platformIntegrations.js:24–27` |
| `TWILIO_API_KEY_SECRET` | Required for provider writes | `<OWNER_SUPPLIED_API_KEY_SECRET>` | Same as above |
| `TWILIO_AUTH_TOKEN` | Required for voice callback signatures; REST fallback | `<OWNER_SUPPLIED_AUTH_TOKEN>` | `runtimeConfig.js:103–104`; `voiceDurationRecovery.js:18` |
| `VOICE_RUNTIME_ENABLED` | Phone runtime flag | `false` until complete acceptance configuration; intended `true` for launch | `runtimeConfig.js:34–36,102–118` |
| `GEMINI_API_KEY` | Required for phone/demo; also used by text drafting | `<OWNER_SUPPLIED_KEY_FOR_CONFIRMED_PROJECT>` | `runtimeConfig.js:103`; `demo/liveDemo.js:28,41`; `geminiTextModel.js:10–13` |
| `GEMINI_MODEL` | Explicit production phone Live model; no default | `<OWNER_CONFIRMED_AVAILABLE_LIVE_MODEL>` | `runtimeConfig.js:103–110`; `voice/liveModelName.js` |
| `GEMINI_TEXT_MODEL` | Separate text generation model; absent disables drafting; invalid nonempty rejects startup | `<OWNER_CONFIRMED_AVAILABLE_TEXT_MODEL>` if drafting included | `geminiTextModel.js:5–13`; `runtimeConfig.js:62` |
| `VOICE_HANDLE_SECRET` | Optional separate voice signing secret, at least 32 bytes | Leave unset to use booking secret, then JWT fallback | `voice/voiceReadiness.js:10`; `voice/productionVoiceRuntime.js` |
| `GOOGLE_CLIENT_ID` | OAuth group: all three or none | `<OWNER_SUPPLIED_OAUTH_CLIENT_ID>` | `deploymentConfig.js:69–72`; `platformIntegrations.js:291` |
| `GOOGLE_CLIENT_SECRET` | OAuth client credential | `<OWNER_SUPPLIED_OAUTH_CLIENT_SECRET>` | `platformIntegrations.js:313` |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Must exactly match app origin plus callback and registered Google URI | `https://app.offtheclockai.com/api/onboarding/calendar/google/callback` | `deploymentConfig.js:72`; `platformIntegrations.js:292,314` |
| `DEMO_ENABLED` | Public voice-demo flag, independent of provider-write gate | `false` until demo acceptance; `true` only if launching the accepted demo | `demo/liveDemo.js:25–44` |
| `GEMINI_LIVE_MODEL` | Demo model; separate from phone/text settings | `<OWNER_CONFIRMED_AVAILABLE_DEMO_MODEL>`; code default is `gemini-3.8-live`, not verified model availability | `demo/liveDemo.js:28,39` |
| `DEMO_ALLOWED_ORIGINS` | Required exact HTTPS public-site origins when demo enabled | `https://offtheclockai.com,https://www.offtheclockai.com` only after owner confirms actual site origins | `demo/liveDemo.js:29,40–43`; `deploymentConfig.js:68` |
| `DEMO_IP_SALT` | Stable privacy/rate-limit salt | `<OWNER_SUPPLIED_INDEPENDENT_SALT>`; code fallback JWT secret | `demo/liveDemo.js:34,42` |
| `DEMO_VOICE_AUDITION` | Development-only audition | Leave unset; `true` forbidden in production | `demo/liveDemo.js:35,38` |

Keep existing admission defaults unless separately approved; they are validated even when the feature is disabled:

| Exact name | Value / purpose | Allowed range / source |
|---|---|---|
| `VOICE_MAX_CONCURRENT` | `100`, platform calls | 1–100000; `voice/voiceAdmission.js:11` |
| `VOICE_MAX_CONCURRENT_PER_OWNER` | `5`, one owner's calls | 1–1000; same file:12 |
| `VOICE_CALLER_DAILY_LIMIT` | `6`, repeat-caller limit | 1–1000; same file:13 |
| `VOICE_BREAKER_FAILURE_THRESHOLD` | `3`, failure threshold | 1–1000; same file:14 |
| `VOICE_BREAKER_WINDOW_SECONDS` | `60`, failure window | 1–3600; same file:15 |
| `VOICE_BREAKER_COOLDOWN_SECONDS` | `30`, cooldown | 1–3600; same file:16 |
| `DEMO_SESSIONS_PER_IP_PER_HOUR` | `2`, demo allowance | 1–100; `demo/liveDemo.js:30` |
| `DEMO_DAILY_SESSION_CAP` | `200`, demo count cap, not a dollar budget | 1–100000; same file:31 |
| `DEMO_MAX_CONCURRENT` | `10`, demo concurrency | 1–1000; same file:32 |
| `DEMO_SESSION_SECONDS` | `180`, demo duration | 30–600; same file:33 |
| `DEMO_MILES_VOICE` | `Charon`, existing default | Provider availability unverified; same file:10,36 |
| `DEMO_NOVA_VOICE` | `Kore`, existing default | Provider availability unverified; same file:10,36 |

Do not configure retired `CARRIER_CONNECTION_URL`, `CARRIER_CONNECTION_TOKEN`, `DEMO_DAILY_BUDGET_USD` or `DEMO_CONCURRENT_MAX`. None enables the current implementation.

## Stripe live configuration

Every row except the legacy Scale IDs is required when billing is enabled. Actual IDs, currency and account readiness must be checked by the owner; this pack creates no products, prices, customers or payments.

| Exact name | Purpose / value | Source |
|---|---|---|
| `STRIPE_BILLING_ENABLED` | `false` initially; intended `true` after live group is complete | `billingConfig.js:47–53` |
| `STRIPE_SECRET_KEY` | `<OWNER_SUPPLIED_LIVE_STRIPE_KEY>`; production accepts live `sk_`/`rk_` syntax | `billingConfig.js:55–64` |
| `STRIPE_WEBHOOK_SECRET` | `<OWNER_SUPPLIED_LIVE_ENDPOINT_SIGNING_SECRET>` | `billingConfig.js:56–61` |
| `STRIPE_STARTER_MONTHLY_PRICE_ID` | `<OWNER_SUPPLIED_PRICE_ID>`; approved price 6900 cents/month | `billingConfig.js:2,73–78`; `billingUsagePolicy.js:4` |
| `STRIPE_STARTER_ANNUAL_PRICE_ID` | `<OWNER_SUPPLIED_PRICE_ID>`; 69000 cents/year | Same sources |
| `STRIPE_OPERATOR_MONTHLY_PRICE_ID` | `<OWNER_SUPPLIED_PRICE_ID>`; 11900 cents/month | `billingConfig.js:4,73–78`; `billingUsagePolicy.js:5` |
| `STRIPE_OPERATOR_ANNUAL_PRICE_ID` | `<OWNER_SUPPLIED_PRICE_ID>`; 119000 cents/year | Same sources |
| `STRIPE_QUOTEDONE_MONTHLY_PRICE_ID` | `<OWNER_SUPPLIED_PRICE_ID>`; 27900 cents/month | `billingConfig.js:7–8,73–78`; `billingUsagePolicy.js:6` |
| `STRIPE_QUOTEDONE_ANNUAL_PRICE_ID` | `<OWNER_SUPPLIED_PRICE_ID>`; 279000 cents/year | Same sources |
| `STRIPE_CHECKOUT_SUCCESS_URL` | `https://app.offtheclockai.com/onboarding?checkout=success` | `billingConfig.js:93–98`; Railway template |
| `STRIPE_CHECKOUT_CANCEL_URL` | `https://app.offtheclockai.com/onboarding?checkout=cancel` | Same sources |
| `STRIPE_PORTAL_RETURN_URL` | `https://app.offtheclockai.com/settings` | Same sources |
| `STRIPE_INTEGRATION_IDENTIFIER` | `<OWNER_SUPPLIED_IDENTIFIER_ENDING_IN_UNDERSCORE_AND_EIGHT_LETTERS>`; stable, not a secret | `billingConfig.js:100–102` |
| `STRIPE_SCALE_MONTHLY_PRICE_ID` | Leave unset unless reconciling an existing approved legacy price | `billingConfig.js:83–90` |
| `STRIPE_SCALE_ANNUAL_PRICE_ID` | Same legacy-only rule; never offered at Checkout | Same source |

The six launch Price IDs must be distinct; verify live mode, approved currency, amount and recurring interval. All three redirect URLs must share one trusted HTTPS app origin; use the app origin above rather than exploiting the validator's lack of comparison to `PUBLIC_BASE_URL`.

Existing endpoint: POST `/api/stripe/webhook`. Configure snapshot event payloads containing `event.data.object`, as consumed by `billingRoutes.js:245,296`; do not substitute thin events. Record and check the endpoint API version against this pinned Stripe SDK/integration before acceptance. `server.js:190–194` does not set an explicit API-version override; this task does not authorize changing the SDK or endpoint contract. Subscribe to exactly the supported event set in `billingRoutes.js:13–21`: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.

Locked terms: Starter 150, Operator 300, QuoteDone 1200 included minutes per billing month; annual prices are ten times monthly; all plans have a 14-day trial with a 60-minute cap and $0.35/min overage collected at each $25 plus period-end reconciliation. No new pricing or overage Price-ID variable is introduced.

## Private Railway backup bucket

| Exact name | Purpose / required condition | Planned setting or placeholder | Source |
|---|---|---|---|
| `OFFSITE_BACKUP_ENDPOINT` | Required HTTPS S3 endpoint | `https://t3.storageapi.dev` only if confirmed by the bucket Credentials tab | `offsiteStore.js:8,12–13`; Railway template |
| `OFFSITE_BACKUP_BUCKET` | Required actual S3 bucket identifier | `<RAILWAY_BUCKET_CREDENTIALS_BUCKET_VALUE>` — use `BUCKET`, not display name | `offsiteStore.js:8,18` |
| `OFFSITE_BACKUP_ACCESS_KEY_ID` | Required storage credential identifier | `<PRIVATE_REFERENCE_TO_BUCKET_ACCESS_KEY_ID>` | `offsiteStore.js:8,20` |
| `OFFSITE_BACKUP_SECRET_ACCESS_KEY` | Required storage secret | `<PRIVATE_REFERENCE_TO_BUCKET_SECRET_ACCESS_KEY>` | Same source |
| `OFFSITE_BACKUP_ENCRYPTION_KEY` | Required independent 32-byte AES archive key; 64 hex or canonical padded base64 | `<OWNER_SUPPLIED_INDEPENDENT_BACKUP_KEY>` | `offsiteStore.js:14–16`; `offsiteArchive.js` |
| `OFFSITE_BACKUP_PREFIX` | Unique production namespace; keep staging separate | `off-the-clock/production` after confirming no conflicting use | `offsiteStore.js:17–18`; Railway template |
| `OFFSITE_BACKUP_REGION` | S3 signing region, not proof of physical residency | `auto` if confirmed by Credentials tab | `offsiteStore.js:20`; Railway template |
| `OFFSITE_BACKUP_URL_STYLE` | SDK addressing style | `virtual` for the documented new Railway bucket; use `path` only if its Credentials tab specifies that | `offsiteStore.js:19,27–28`; Railway template |
| `OFFSITE_BACKUP_SESSION_TOKEN` | Only for temporary credentials that require it | Leave unset unless provider supplies it | `offsiteStore.js:20` |

Choose the bucket region separately and record it; the app's planned US East placement does not establish bucket, email or other provider residency. Use Railway's variable-reference selector to map bucket credentials; do not guess the bucket service name in a reference expression. Store the archive key outside the volume in the owner's private recovery vault.

Required operations: object Put/Get/Head/Delete, prefix listing with pagination, conditional PUT and metadata; version-state lookup, and version listing/deletion when Enabled or Suspended. The current SDK maps only explicit supported “unsupported” errors to `UNSUPPORTED`; a generic 403, timeout or unknown response fails closed. Railway currently documents object versioning as unsupported, but verify the actual response through application status. `offsiteStore.js:31–70`; `tenantBackupErasure.js:109–115,238–247`; `offsiteVersionErasure.js`.

Do not change endpoint/bucket/prefix/key or delete worker state to clear errors after upload. Durable destination history requires access to prior copies. Configured is not uploaded; uploaded is not restored. Acceptance requires recent daily success, continuous catch-up, healthy erasure/version status, and a successful restore/readback of synthetic records. See [DEPLOY_DAY.md](DEPLOY_DAY.md).
