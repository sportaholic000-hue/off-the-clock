# Railway setup and recovery

This deploys the existing owner app, widget assets and Express API as one Docker service. It does not deploy the public marketing site. No Railway project, paid resource, domain record or off-site bucket has been created by this change. PR #11 is the historical infrastructure implementation; use the currently reviewed release candidate and choose the Railway account/plan before provisioning. Configuration below was audited against `be473b6542c498a6e96b056b5be2c3d59d9e4055` on 2026-10-09, without accessing any provider account.

## 1. Create one service and its persistent volume

1. In Railway, create a project from GitHub repository `sportaholic000-hue/off-the-clock`. Select the currently reviewed release-candidate branch containing the infrastructure implementation. Keep Root Directory at the repository root.
2. Confirm Railway detects the root `Dockerfile`. Leave custom build/start commands empty: the image runs `npm ci`, builds both bundles, and starts `node server/src/server.js` directly as PID 1. Never use the repository's committed dependencies or dist files. [Railway Dockerfile support](https://docs.railway.com/builds/dockerfiles).
3. Attach a volume to this service, mount path **/data**. Use exactly one replica and one deployment region. Do not attach the same SQLite data to independent services. Leave serverless/app sleeping off.
4. Configure Healthcheck Path **/api/health**, Healthcheck Timeout **300 seconds**, and an On Failure restart policy. Railway's deployment health check is not ongoing uptime monitoring. Volume attachment means a brief interruption during redeploys is expected. [Health checks](https://docs.railway.com/deployments/healthchecks).
5. Set the variables below before deploying. Set **RAILWAY_DEPLOYMENT_DRAINING_SECONDS=120** and **SHUTDOWN_TIMEOUT_SECONDS=110**. Railway sends SIGTERM and eventually SIGKILL; the longer platform window allows the app to finish HTTP handlers, webhook delivery and backups before closing SQLite. Leave overlap at 0 for this single-volume setup. [Deployment teardown](https://docs.railway.com/deployments/deployment-teardown).
6. Deploy. Confirm health returns 200 and logs show the API listening. A missing mount, unwritable storage or invalid production configuration must stop startup, rather than quietly create a fresh database inside the image.

Railway bills compute and storage separately. Choose the plan in your own account; this work purchases nothing. The historical 2026-10-01 volume estimate was $0.15/GB-month; recheck published pricing before provisioning. Size storage for the live database, price books, retained six-hour/daily snapshots and temporary continuous-replica staging, plus headroom. Continuous off-site checkpoints are full copies whose count depends on write activity; the old 150-snapshot estimate is not a bound on total retained off-site storage. Set a usage budget and watch free space. [Railway pricing](https://docs.railway.com/pricing).

## 2. Set environment variables

Use [deployment/railway.env.example](../deployment/railway.env.example) as the complete template; comments identify optional feature groups. Enter secrets in Railway Variables, never GitHub. Preserve a separate private recovery copy of the credential encryption key and key version. Restoring encrypted calendar credentials and stored checkout receipts requires the same key. Keep JWT and booking secrets stable across redeploys.

Production configuration (some values have code defaults; exact requiredness is in the inventory below):

| Variable | Value or requirement |
|---|---|
| NODE_ENV | production; a Railway environment refuses development mode |
| PORT | 3000 |
| APP_DATA_DIR | /data/app |
| TRUST_PROXY | railway on Railway's protected public ingress |
| RAILWAY_DEPLOYMENT_DRAINING_SECONDS | 120 |
| SHUTDOWN_TIMEOUT_SECONDS | 110 (default); allowed 5..115, platform draining at least 5 seconds longer |
| PUBLIC_BASE_URL | https://app.offtheclockai.com, no trailing slash |
| CLIENT_URL | identical to PUBLIC_BASE_URL |
| CORS_ALLOWED_ORIGINS | https://app.offtheclockai.com; exact HTTPS origins separated by commas, no wildcard |
| JWT_SECRET | independently generated, at least 32 characters |
| BOOKING_SLOT_TOKEN_SECRET | independently generated, at least 32 bytes |
| CREDENTIAL_ENCRYPTION_KEY | 32 random bytes encoded as 64 hex characters or base64 |

Generate the three different secrets privately with Node's `crypto.randomBytes`, or a password manager; repeated placeholders and reuse across these keys are rejected. The template intentionally contains unusable placeholders. Railway supplies **RAILWAY_ENVIRONMENT_ID**, **RAILWAY_GIT_COMMIT_SHA** and, after attachment, **RAILWAY_VOLUME_MOUNT_PATH=/data**. Verify the last value in Variables. Never fake the metadata to bypass startup checks.

Defaults/settings: **CREDENTIAL_ENCRYPTION_KEY_VERSION=v1**, **BCRYPT_COST=12** (12..16), **BACKUP_INTERVAL_SECONDS=21600** (60..86400), **BACKUP_RETENTION_DAYS=30** (30..365), **OUTBOUND_WEBHOOKS_ENABLED=true**. Keep **LOCAL_PREVIEW_MODE=false**, **EMAIL_DELIVERY_ENABLED=false**, **EMAIL_PROVIDER=console**. Do not set **DATABASE_PATH**, **PRICEBOOK_PATH**, **TMPDIR**, **TEMP** or **TMP**: startup derives all of them inside APP_DATA_DIR. Remove **DEMO_TRUSTED_PROXY_HOPS**; the shared TRUST_PROXY policy replaces it. Legacy CLIENT_BASE_URL is unnecessary; if present it must equal PUBLIC_BASE_URL.

For the first infrastructure check, leave **ALLOW_PROVIDER_WRITES=false**, **STRIPE_BILLING_ENABLED=false**, **VOICE_RUNTIME_ENABLED=false**, **DEMO_ENABLED=false**. These are explicit disabled features, not evidence that paid signup, calendar provider writes or voice are launch-ready. Complete the relevant group before enabling:

- **Google Calendar:** GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALENDAR_REDIRECT_URI must be provided together. Register exactly `https://app.offtheclockai.com/api/onboarding/calendar/google/callback` in Google's OAuth application. The existing global provider-write gate also needs enabling for the callback.
- **Provider writes:** ALLOW_PROVIDER_WRITES=true requires TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET in this baseline, even for other provider routes sharing that gate. Keep CARRIER_CONNECTION_URL/CARRIER_CONNECTION_TOKEN only if the separate telephony lane uses them; the token is required at request time when the URL is configured, not by startup. This deployment does not change that coupling.
- **Stripe:** STRIPE_BILLING_ENABLED=true requires the live secret/restricted key, webhook secret, six distinct Starter/Operator/QuoteDone monthly/annual Price IDs, checkout success/cancel URLs, portal return URL, and integration identifier shown in the template. Redirect URLs must share an HTTPS app origin. The identifier ends in eight letters. Register the existing endpoint `https://app.offtheclockai.com/api/stripe/webhook`; the supported event list is exported in server/src/billingRoutes.js. Checkout/portal also require ALLOW_PROVIDER_WRITES=true. Reuse approved prices; Scale is not offered. No Stripe resource is created here.

  | Plan | Monthly Price ID variable / cents | Annual Price ID variable / cents | Included minutes per billing month |
  |---|---|---|---|
  | Starter | `STRIPE_STARTER_MONTHLY_PRICE_ID` / 6900 | `STRIPE_STARTER_ANNUAL_PRICE_ID` / 69000 | 150 |
  | Operator | `STRIPE_OPERATOR_MONTHLY_PRICE_ID` / 11900 | `STRIPE_OPERATOR_ANNUAL_PRICE_ID` / 119000 | 300 |
  | QuoteDone | `STRIPE_QUOTEDONE_MONTHLY_PRICE_ID` / 27900 | `STRIPE_QUOTEDONE_ANNUAL_PRICE_ID` / 279000 | 1200 |

  These six IDs are required when billing is enabled. Configure the approved prices and billing-portal plan choices in the authorized Stripe account before enabling billing; this code change does not create prices or alter the portal. Annual allowances reset monthly. All three plans use the existing 14-day, 60-minute trial and 35-cent overage installments at 2500 cents, plus any month-end remainder. Legacy Scale IDs remain reconciliation-only.

- **AI knowledge and price-book drafts:** both GEMINI_API_KEY and a separate GEMINI_TEXT_MODEL are needed. There is no text-model default and neither Live model setting substitutes for it. Missing text configuration leaves startup running but disables drafting with its existing unavailable message; an invalid nonempty text-model name rejects startup. Use an approved text generation model; this guide supplies no model name.
- **Website demo:** DEMO_ENABLED=true requires GEMINI_API_KEY and the exact website origins in DEMO_ALLOWED_ORIGINS. DEMO_IP_SALT defaults to JWT_SECRET; a separate stable salt is preferable. GEMINI_LIVE_MODEL and the six demo limit/voice settings in the template retain the current implementation's defaults. Verify the existing model with the demo owner before enabling billable sessions. The JS endpoint and session API remain present when disabled; sessions return their existing 503 response.
- **Voice:** keep VOICE_RUNTIME_ENABLED=false until Claude's voice integration passes. The phone runtime is now mounted (`server/src/server.js:512`); its WebSocket boundary drains through the wrapped HTTP server close (`server/src/voice/productionVoiceRuntime.js:176-180`). Source wiring is not live acceptance. Validation requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, GEMINI_API_KEY and an explicit live GEMINI_MODEL when enabled. The six admission settings in the template are validated even while voice is disabled. VOICE_HANDLE_SECRET optionally overrides the booking/JWT signing-secret fallback; readiness requires at least 32 bytes. TWILIO_AUTH_TOKEN validates callbacks and is also the REST fallback if API-key credentials are absent, including the read-only duration recovery worker. That worker is configured independently of the provider-write gate.
- **Admin:** optional ADMIN_EMAIL and ADMIN_PASSWORD_HASH together; the hash must be bcrypt with cost 12..16. Never enter a plaintext password.
- **Email:** live delivery remains deferred. Delivery code already exists and checks EMAIL_PROVIDER=resend, EMAIL_DELIVERY_ENABLED=true, EMAIL_FROM and RESEND_API_KEY at send time, not at startup. Some owner-alert delivery also checks ALLOW_PROVIDER_WRITES. Console delivery does not deliver recovery or verification email in production.

Production also rejects unsafe paths, symlink escapes, non-mounted Linux Railway storage, incomplete OAuth/admin groups, invalid feature booleans, invalid demo limits/origins, invalid billing configuration, local preview, missing built bundles and an unwritable volume. The startup error identifies the setting without logging its secret value.

## 3. Connect app.offtheclockai.com

1. In service Settings > Networking, add custom domain **app.offtheclockai.com**, target port **3000**.
2. Railway displays the service-specific CNAME destination and TXT ownership challenge. Create these at your DNS provider:

| Type | DNS name | Exact value |
|---|---|---|
| CNAME | app | Copy the assigned Railway destination verbatim, typically a service-specific *.up.railway.app name |
| TXT | Copy the challenge name Railway displays | Copy its exact challenge token |

There is no service yet, so its CNAME destination and TXT token cannot be known in advance. Do not substitute a guessed hostname or token. Enter the exact dashboard values after creation; account for DNS providers that append your domain automatically. Preserve existing root/www/mail records. For the initial check use DNS-only routing directly to Railway, so its trusted-ingress assumption is clear. Railway verifies ownership and provisions TLS. [Current domain instructions](https://docs.railway.com/networking/domains/working-with-domains).

3. Wait for Railway's domain/TLS confirmation. Check `https://app.offtheclockai.com/api/health`, `/login`, `/dashboard`, `/widget.js`, `/widget-app.js` and `/demo/otc-live-demo.js`. Validate session minting from the configured public website origin if the demo is enabled.

## 4. Confirm storage, identity and shutdown on the real service

Use Railway SSH to enter the **running container**, not `railway run` on your computer. The latter executes locally and does not provide the deployed volume. At /app, confirm the SQLite file, pricebooks, backups and tmp directories all live under /data/app. Create a test owner's price book and lead, restart and redeploy, then confirm those exact records remain. Record the deployment commit, timestamps and shutdown log.

The Railway mode uses its protected **X-Real-IP** as the single canonical req.ip for all existing rate limits, including the live demo. It ignores X-Forwarded-For. Railway staff states its edge overwrites X-Real-IP; this contract is supported by simulated-proxy tests, but your actual service ingress must still be verified. Never expose a separate direct backend path that accepts client-authored X-Real-IP. [Railway employee explanation](https://station.railway.com/questions/security-critical-questions-on-edge-prox-8fddd775).

From one real connection, exhaust the auth/demo allowance with synthetic test credentials; changing forged X-Forwarded-For and X-Real-IP headers must not create new allowances. Then use another real connection, such as a mobile hotspot, to confirm it has an independent allowance. Perform the demo check only when its billable feature is intentionally enabled. Do not add public diagnostic endpoints or log raw visitor addresses. TRUST_PROXY=none is the safe direct/local mode and ignores all forwarded headers.

During restart, expect `[shutdown] requests and workers drained; database closed`. A deadline failure exits nonzero for recovery and does not close the DB beneath unfinished work. Linux Docker proof additionally checks actual SIGTERM, fresh containers and restore.

## 5. Back up and restore

The process schedules an online SQLite backup every six hours and takes an overdue snapshot after startup. Each private snapshot includes the committed SQLite state, complete approved price-book JSON files, checksums, source commit and creation time. Verification checks SQLite integrity, foreign keys and every included file before publishing it. Failed staging is discarded; completed snapshots remain. At least the newest snapshot is kept and owned snapshots older than 30 days are pruned.

The database snapshot is transactionally consistent and includes committed WAL pages. Each price book is a complete JSON file; the bundle is not one global transaction spanning the database and all price books. No runtime keys or .env files are included. The database contains customer information, password hashes and encrypted provider credentials; keep the whole bundle private.

Snapshot verification cross-checks every durable price-book creation record in
the copied database against the bundle inventory. Missing recorded books fail
both backup verification and restore. An unconfirmed price-book save also blocks
new snapshots: its pause marker must never be dropped and silently resume quoting
after recovery. A changed price-book inventory during the online database copy
fails the attempt and preserves the last accepted snapshot. Finish the save or
recover the missing book, then rerun backup. Do not delete a pause marker to force
a backup through.

In the running container at /app:

```sh
node server/scripts/backup.js
```

The command prints the new bundle path. Watch backup creation times and `[backup] BACKUP_FAILED` in logs. Local six-hour snapshots alone can lose up to six hours of changes after the last successful snapshot; a disk-full or sustained backup failure can make that longer. Configured continuous off-site replication provides a separate, asynchronous recovery point (see below). These are full application snapshots, not incremental copies.

To test recovery without overwriting current data:

```sh
node server/scripts/restore.js --backup /data/app/backups/snapshot-EXACT_BUNDLE_NAME --target /data/restores/drill-20261001
```

Use a real complete bundle name printed by backup. The target must be a **new** direct child of /data/restores. Restore refuses an existing target, corrupted checksums, unsafe paths or invalid SQLite. After success, change **APP_DATA_DIR=/data/restores/drill-20261001** in Railway and redeploy with the same encryption key, key version and signing secrets. Confirm health and exact test data. Leave DATABASE_PATH/PRICEBOOK_PATH unset; they are derived again. The original /data/app remains intact. Backups then run under the restored root; older snapshots remain under the previous root until you intentionally manage them.

For an independently stored bundle returned from an off-site destination, download it privately into the mounted volume first, then run the same command. Review the schema/source-commit compatibility before restoring an older application's data; the automated drill covers this implementation and its baseline schema.

The synthetic production rehearsal is `test/backupRestoreRehearsal.spec.mjs`,
included in both normal test gates. It registers synthetic owners, saves and
approves pricing through HTTP, creates an actual quote, review lead and confirmed
booking (local calendar stub), restarts, runs both real CLIs, and wipes the entire
temporary volume before restoring from a separate temporary archive. It compares
book bytes, approval, database rows and repeated quote/booking receipts, then
checks missing and corrupt price books without crashing. Its provider and billing
fixtures are not live integration acceptance. See
`verification/backup-restore-20261006/REPORT.md` for evidence and limits.

## 6. Choose an independent off-site destination

Snapshots on /data alone cannot recover from loss of the entire volume. The application supports both encrypted daily uploads and continuous complete recovery copies to the same separately configured private S3-compatible bucket. `server/src/offsiteBackups.js:161-170` starts both using the same OFFSITE_BACKUP settings; no extra enable flag is read. Continuous copies respond to local changes with a one-second polling fallback, coalesce bursts, and retry failures with backoff starting at one minute (`server/src/continuousOffsite.js:61-67,159`). Replication is asynchronous and cannot promise zero loss during an outage. Missing or invalid destination settings warn and report unhealthy rather than rejecting startup. See the current [off-site status and restore guide](OFFSITE_BACKUPS.md) for checkpoint retention and recovery commands. No real destination was provisioned or checked in this documentation task.

These storage-only USD estimates use an average **50 GB stored**, not a promise of your final bill. API operations, transfers and taxes may add cost.

| Option | Published storage rate | 50 GB/month illustration |
|---|---|---|
| Cloudflare R2 Standard | $0.015/GB-month, with 10 GB-month free allowance | $0.75 before the free allowance; $0.60 if the allowance is unused |
| Backblaze B2 | $6.95/TB-month | approximately $0.35 before applicable credits |

Sources checked 2026-10-01: [R2 pricing and operation charges](https://developers.cloudflare.com/r2/pricing/), [B2 pricing](https://www.backblaze.com/cloud-storage/pricing). R2 lists free internet egress; B2 includes egress up to its published allowance. Choose the destination, region, access policy and budget before enabling the uploader. Preserve secrets separately; never make the bucket or DB public.

Railway's own volume backup schedules are an additional account-level option with its own storage charges, not this app's independent off-site destination. [Railway volume backups](https://docs.railway.com/volumes/backups).

## Before admitting customers

Complete the real Railway ingress/domain/storage checks above, choose and test off-site retention, enable and verify existing paid signup/calendar integrations, and verify the current voice integration in its assigned lane. The nine-failure count and docs/review/railway-20261001 are historical evidence, not a current failure count. No launch-ready voice claim is made by this deployment change.

## Production environment inventory (2026-10-09)

Scope: first-party runtime modules reachable from `server/src/server.js`, plus the
backup/restore CLIs. The audit followed imports through 183 modules, inspected
`process.env`, its `env`/`environment` parameters, destructuring and computed reads,
and resolved every name passed through `required`, `requiredExact`, integer
helpers, the Stripe plan map, demo voice map and validation loops. No destructured
environment reads were found in this revision. The result is **84 names**, not
just a search for `env.NAME`. Third-party SDK/Node environment behavior and
build/test/development-only scripts are outside this server-runtime inventory.

All source locations in the table are relative to `server/src/` (`../priceBookService.js`
means `server/priceBookService.js`). Startup checks below run in production; a
feature's conditional requirements do not imply it should be enabled. `None`
means no usable code default. Secret means credential/signing material; public
IDs are not authentication secrets. Keep private identifiers out of public logs too.

The **Absent at base** column records the comparison in both directions against
the audited revision: **R** = Railway template, **S** = this setup guide, **G** =
demo go-live guide, **L** = local `.env.example`; a dash means all four named it.
The demo guide intentionally covers its own feature and links here for all other
server settings. Missing optional settings are documentation gaps, not necessarily
startup requirements. Listed-but-unread settings are explained after the table.

### Exact startup checks used in the table

- **D-mode** (`deploymentConfig.js:33`): `"Railway requires NODE_ENV=production; refusing development storage defaults."`
- **D-path** (`deploymentConfig.js:48-52`): `" must name an absolute persistent directory."`; `"APP_DATA_DIR must be within RAILWAY_VOLUME_MOUNT_PATH."` Actual mount, containment, writable storage and bundles are checked at lines 86-102.
- **D-derived** (`deploymentConfig.js:55`): `" must equal its APP_DATA_DIR-derived path; remove the override."`
- **D-int** (`deploymentConfig.js:13-14`): `if (!Number.isInteger(n) || n < min || n > max)` throws `" is outside its allowed integer range."`
- **D-proxy** (`clientAddress.js:5`, `deploymentConfig.js:45-46`): `"TRUST_PROXY must be none or railway."`; `"Production requires an explicit TRUST_PROXY."`; `"TRUST_PROXY=railway requires Railway environment metadata."`
- **D-drain** (`deploymentConfig.js:58`): `"RAILWAY_DEPLOYMENT_DRAINING_SECONDS must exceed SHUTDOWN_TIMEOUT_SECONDS by at least 5."`
- **D-origin** (`runtimeConfig.js:79`, `deploymentConfig.js:62`): `"PUBLIC_BASE_URL must be a valid HTTPS origin in production"`; `"PUBLIC_BASE_URL must be a bare HTTPS origin without a trailing slash."`
- **D-client/D-legacy** (`deploymentConfig.js:64-65`): `"CLIENT_URL must equal PUBLIC_BASE_URL for owner account links."`; `"CLIENT_BASE_URL, if set, must equal PUBLIC_BASE_URL."`
- **D-cors** (`runtimeConfig.js:52,81`, `deploymentConfig.js:63`): `"CORS_ALLOWED_ORIGINS must contain exact HTTPS origins"`; `"CORS_ALLOWED_ORIGINS is required in production"`; `"CORS_ALLOWED_ORIGINS must include PUBLIC_BASE_URL."`
- **D-secret** (`runtimeConfig.js:64-66,83`, `deploymentConfig.js:37,41`): `"JWT_SECRET is required"`; `"JWT_SECRET must be a non-default secret of at least 32 characters"`; `"BOOKING_SLOT_TOKEN_SECRET must contain at least 32 bytes"`; `" must not be a repeated placeholder."`; `"Production signing and encryption secrets must be distinct."`
- **D-key** (`runtimeConfig.js:71`, `deploymentConfig.js:40`): `"CREDENTIAL_ENCRYPTION_KEY must encode exactly 32 bytes"`; `"CREDENTIAL_ENCRYPTION_KEY must not be a repeated placeholder."`
- **D-cost/D-admin** (`passwordHashConfig.js:6`, `deploymentConfig.js:74-75`): `"BCRYPT_COST must be an integer from 12 through 16."`; `"Admin email and password hash must be set together."`; `"ADMIN_PASSWORD_HASH must be a bcrypt hash with cost 12 through 16."`
- **D-bool** (`deploymentConfig.js:42-43`): `if (env[key] !== undefined && !['true','false'].includes(env[key]))` throws `" must be true or false."`
- **D-preview/D-hops** (`deploymentConfig.js:66,47`): `"Local preview is forbidden in production."`; `"Remove DEMO_TRUSTED_PROXY_HOPS; TRUST_PROXY controls every client address."`
- **R-provider/R-voice** (`runtimeConfig.js:91-110`): `" is required when provider writes are enabled"`; `" is required when the voice runtime is enabled"`; `"TWILIO_ACCOUNT_SID must be a valid Account SID"`; `"TWILIO_API_KEY_SID must be a valid API Key SID"`; `"GEMINI_MODEL must be an explicit Gemini Live model"`. The Live regex is `/^[A-Za-z0-9][A-Za-z0-9._/-]*live[A-Za-z0-9._/-]*$/i` (`voice/liveModelName.js:2`), length ≤128.
- **V-int** (`voice/voiceAdmission.js:5-6`): `if(!Number.isSafeInteger(n)||n<1||n>max)` throws `" must be an integer from 1 to "` plus the maximum. This runs when the voice runtime is installed, including when disabled.
- **T-model** (`runtimeConfig.js:62`): `"GEMINI_TEXT_MODEL must be an explicit text generation model, separate from GEMINI_MODEL"`. `geminiTextModel.js:7` allows 1..128 characters matching `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/` and refuses `/live|audio|tts|embedding|image/i`. No actual model availability is checked. Missing configuration gives the existing feature-time message: "AI drafting is unavailable because its text model is not configured. You can enter your business information and prices manually. Contact support@offtheclockai.com for help."
- **D-model/D-demo** (`demo/liveDemo.js:39-43`, `deploymentConfig.js:68`): `"GEMINI_LIVE_MODEL is invalid."` (name regex `/^[a-zA-Z0-9._-]{1,120}$/`); `"DEMO_ALLOWED_ORIGINS entry must be a bare origin: "`; `"DEMO_ENABLED=true requires GEMINI_API_KEY."`; `"DEMO_ENABLED=true requires DEMO_IP_SALT or JWT_SECRET."`; `"DEMO_ENABLED=true requires DEMO_ALLOWED_ORIGINS."`; `"Production DEMO_ALLOWED_ORIGINS must use HTTPS."`
- **D-demo-int/D-audition** (`demo/liveDemo.js:23,38`): `if (!Number.isInteger(n) || n < min || n > max)` throws the setting's allowed integer range; `"DEMO_VOICE_AUDITION is for the owner test link only and cannot run in production."`
- **D-google** (`deploymentConfig.js:69-72`): `"Google Calendar requires all three OAuth settings."`; `"GOOGLE_CALENDAR_REDIRECT_URI must use the public service callback."`
- **B-required** (`billingConfig.js:16-20`): `if (typeof value !== 'string' || !value || value.trim() !== value)` throws `" is required when Stripe billing is enabled"`.
- **B-key/B-webhook** (`billingConfig.js:24-29,57-64`): key regex `/^(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+$/`; webhook `/^whsec_[A-Za-z0-9_]+$/`; production throws `"Production Stripe billing requires a live-mode key"` for non-live prefixes. These validate syntax, not actual account credentials.
- **B-price** (`billingConfig.js:32-33,74-75,87-88`): `/^price_[A-Za-z0-9_]+$/`; `"Every Stripe plan interval must have a distinct Price ID"`.
- **B-url/B-id** (`billingConfig.js:36-43,96-102`): `" must be a trusted HTTPS URL"`; `"Stripe redirect URLs must share one trusted application origin"`; identifier `/^[A-Za-z][A-Za-z0-9_-]{0,54}_[A-Za-z]{8}$/`, otherwise `"STRIPE_INTEGRATION_IDENTIFIER must end with eight letters"`.
- **P-required** is **not startup validation** (`platformIntegrations.js:8-9`): missing value throws the setting name plus `" is not configured"` when a provider operation requests it.
- **E-send** is **not startup validation** (`email.js:26-30`): `provider !== 'resend' || environment.EMAIL_DELIVERY_ENABLED !== 'true'` and missing/invalid key/from throw `EMAIL_NOT_CONFIGURED` at send time. Console only simulates delivery outside production.
- **O-config** is **not fatal startup validation** (`offsiteStore.js:8-21`): missing required settings return `{enabled:false,reason:'OFFSITE_CONFIG_MISSING',missing}`; invalid values return `{enabled:false,reason:'OFFSITE_CONFIG_INVALID',missing:[]}`. Both daily and continuous backups use this configuration. The five required destination values are endpoint, bucket, access key ID, secret access key and encryption key; prefix/region/session token are optional.

### All server-read names

| Variable | Read at (relative to server/src/) | Production startup / validation | Code default | Secret? | Absent at base |
|---|---|---|---|---|---|
| `ADMIN_EMAIL` | deploymentConfig.js:74; authSessionService.js:41 | D-admin: optional, paired with hash; no startup email-format validation | None | Private identifier | G |
| `ADMIN_PASSWORD_HASH` | deploymentConfig.js:74-75; authSessionService.js:42 | D-admin: optional, paired with email; bcrypt 2a/2b/2y cost 12..16 | None | Yes (password hash) | G |
| `ALLOW_PROVIDER_WRITES` | runtimeConfig.js:31; deploymentConfig.js:42-43 | D-bool: optional; if supplied exactly true or false | false | No | G |
| `APP_DATA_DIR` | deploymentConfig.js:48-52 | D-path: required within volume | None; template /data/app | No | G L |
| `BACKUP_INTERVAL_SECONDS` | deploymentConfig.js:78 → integer:13 | D-int: 60..86400 | 21600 seconds | No | G L |
| `BACKUP_RETENTION_DAYS` | deploymentConfig.js:79 → integer:13 | D-int: 30..365 | 30 days (local snapshots) | No | G L |
| `BCRYPT_COST` | passwordHashConfig.js:3 | D-cost: integer 12..16 | 12 | No | G |
| `BOOKING_SLOT_TOKEN_SECRET` | runtimeConfig.js:82-83; deploymentConfig.js:37,41 | D-secret: required ≥32 bytes and ≥8 distinct characters; three secrets distinct | None | Yes | G |
| `CARRIER_CONNECTION_TOKEN` | platformIntegrations.js:123,139 → required:8 | No startup check; P-required only on configured carrier requests | None | Yes | S G |
| `CARRIER_CONNECTION_URL` | platformIntegrations.js:118-119,134-135 | No startup check; absent returns platform_action_required | None | No | S G |
| `CLIENT_BASE_URL` | deploymentConfig.js:65 | D-legacy: if nonempty must equal PUBLIC_BASE_URL | None; unnecessary legacy validation only | No | R G L |
| `CLIENT_URL` | deploymentConfig.js:64; server.js:406 | D-client: required and equal to PUBLIC_BASE_URL | None in production; dev account links use localhost:5173 | No | G |
| `CORS_ALLOWED_ORIGINS` | runtimeConfig.js:39,81; deploymentConfig.js:63 | D-cors: required exact HTTPS origins, comma separated; includes public origin | Empty list (rejected in production) | No | G |
| `CREDENTIAL_ENCRYPTION_KEY` | runtimeConfig.js:70-71; deploymentConfig.js:38-41; credentialEncryption.js:5 | D-key: required 32 decoded bytes, ≥8 distinct bytes; three secrets distinct | None; 64 hex characters or base64 | Yes | G |
| `CREDENTIAL_ENCRYPTION_KEY_VERSION` | credentialEncryption.js:33 | No startup check | v1 | No | G |
| `DATABASE_PATH` | db.js:9; deploymentConfig.js:54-55 | D-derived: supplied override must match derived path | Production: APP_DATA_DIR/off-the-clock.sqlite; dev: repo/data/off-the-clock.sqlite | No | G |
| `DEMO_ALLOWED_ORIGINS` | demo/liveDemo.js:29,40,43; deploymentConfig.js:68 | D-demo: exact bare origins; required and HTTPS when enabled | Empty list | No | L |
| `DEMO_DAILY_SESSION_CAP` | demo/liveDemo.js:31 → intEnv:23 | D-demo-int: 1..100000, even with demo off | 200 | No | S L |
| `DEMO_ENABLED` | demo/liveDemo.js:26; deploymentConfig.js:42-43 | D-bool: optional; if supplied exactly true or false | false | No | L |
| `DEMO_IP_SALT` | demo/liveDemo.js:34,42 | D-demo: salt or JWT needed when enabled; JWT already mandatory in production | JWT_SECRET | Yes | L |
| `DEMO_MAX_CONCURRENT` | demo/liveDemo.js:32 → intEnv:23 | D-demo-int: 1..1000, even with demo off | 10 | No | S L |
| `DEMO_MILES_VOICE` | demo/liveDemo.js:10,36 | No startup voice-catalog validation | Charon | No | S G L |
| `DEMO_NOVA_VOICE` | demo/liveDemo.js:10,36 | No startup voice-catalog validation | Kore | No | S G L |
| `DEMO_SESSIONS_PER_IP_PER_HOUR` | demo/liveDemo.js:30 → intEnv:23 | D-demo-int: 1..100, even with demo off | 2 | No | S L |
| `DEMO_SESSION_SECONDS` | demo/liveDemo.js:33 → intEnv:23 | D-demo-int: 30..600, even with demo off | 180 | No | S G L |
| `DEMO_TRUSTED_PROXY_HOPS` | deploymentConfig.js:47 | D-hops: any presence rejects production, including empty/0 | Must be absent; replaced by TRUST_PROXY | No | L |
| `DEMO_VOICE_AUDITION` | demo/liveDemo.js:35,38 | D-audition: true forbidden in production, even with demo off | false; other values not strictly checked | No | R S G L |
| `EMAIL_DELIVERY_ENABLED` | email.js:26; deploymentConfig.js:42-43 | D-bool: optional; if supplied exactly true or false | false | No | G |
| `EMAIL_FROM` | email.js:28-29; ownerAlertEmail.js:6 | No startup check; E-send requires bare email address | None (local template supplies address) | No | G |
| `EMAIL_PROVIDER` | email.js:20,26 | No startup check; E-send requires resend for production delivery | console | No | G |
| `GEMINI_API_KEY` | runtimeConfig.js:103-104; demo/liveDemo.js:28; geminiTextModel.js:11; platformIntegrations.js:196 | R-voice/D-demo: required when voice or demo enabled; otherwise missing disables text drafting | None | Yes | — |
| `GEMINI_LIVE_MODEL` | demo/liveDemo.js:28,39 | D-model: valid name 1..120 characters, even with demo off; no provider availability check | gemini-3.8-live | No | L |
| `GEMINI_MODEL` | runtimeConfig.js:103-110; voice/liveModelName.js:2-3 | R-voice: required when voice enabled; live-name regex, ≤128 characters | None; .env.example contains an example, not a fallback | No | G |
| `GEMINI_TEXT_MODEL` | geminiTextModel.js:6-7,11; runtimeConfig.js:62 | T-model: missing allowed at startup but drafting unavailable; invalid nonempty value rejects startup | None; never falls back to either Live model | No | R S G |
| `GOOGLE_CALENDAR_REDIRECT_URI` | deploymentConfig.js:69-72; platformIntegrations.js:353 → required:8 | D-google: all three or none; callback exactly public origin + /api/onboarding/calendar/google/callback | None | No | G |
| `GOOGLE_CLIENT_ID` | deploymentConfig.js:69-72; platformIntegrations.js:352 → required:8 | D-google: all three or none; callback exactly public origin + /api/onboarding/calendar/google/callback | None | No | G |
| `GOOGLE_CLIENT_SECRET` | deploymentConfig.js:69-72; platformIntegrations.js:374 → required:8 | D-google: all three or none; callback exactly public origin + /api/onboarding/calendar/google/callback | None | Yes | G |
| `JWT_SECRET` | runtimeConfig.js:63-66; deploymentConfig.js:37,41 | D-secret: required ≥32 characters, non-default, ≥8 distinct characters; three secrets distinct | None | Yes | G |
| `LOCAL_PREVIEW_MODE` | previewMode.js:6; deploymentConfig.js:66 | D-preview: true forbidden in production; no strict boolean validation | false | No | G L |
| `NODE_ENV` | deploymentConfig.js:32-33 | D-mode: Railway metadata requires production | No env default; Dockerfile sets production | No | G |
| `OFFSITE_BACKUP_ACCESS_KEY_ID` | offsiteStore.js:20 (required loop:8-9) | O-config: not fatal startup; nonempty; no credential validity check | None | Credential identifier | S G |
| `OFFSITE_BACKUP_BUCKET` | offsiteStore.js:18-19 (required loop:8-9) | O-config: not fatal startup; 1..128 name characters; first alphanumeric, then alphanumeric/dot/underscore/hyphen | None | No | S G |
| `OFFSITE_BACKUP_ENCRYPTION_KEY` | offsiteStore.js:14-16 (required loop:8-9) | O-config: not fatal startup; exactly 32 bytes in 64 hex or canonical base64 | None | Yes | S G |
| `OFFSITE_BACKUP_ENDPOINT` | offsiteStore.js:12-13 (required loop:8-9) | O-config: not fatal startup; HTTPS with no credentials/query/hash; HTTP loopback also accepted by code | None | No | S G |
| `OFFSITE_BACKUP_PREFIX` | offsiteStore.js:17-18 | O-config: not fatal startup; 1..128 alphanumeric/underscore/hyphen/slash; first alphanumeric, no empty segments | off-the-clock (Railway template off-the-clock/production) | No | S G |
| `OFFSITE_BACKUP_REGION` | offsiteStore.js:19 | O-config: not fatal startup; no region validation | us-east-1 | No | S G |
| `OFFSITE_BACKUP_SECRET_ACCESS_KEY` | offsiteStore.js:20 (required loop:8-9) | O-config: not fatal startup; nonempty; no credential validity check | None | Yes | S G |
| `OFFSITE_BACKUP_SESSION_TOKEN` | offsiteStore.js:20 | O-config: not fatal startup; optional; no token validation | None | Yes | S G |
| `OUTBOUND_WEBHOOKS_ENABLED` | outboundWebhookTransport.js:108-109; deploymentConfig.js:42-43 | D-bool: optional; if supplied exactly true or false | true in production; false outside production | No | G |
| `PORT` | deploymentConfig.js:59 → integer:13; server.js:115 | D-int: 1..65535 | 3000 | No | G L |
| `PRICEBOOK_PATH` | ../priceBookService.js:16; deploymentConfig.js:54-55 | D-derived: supplied override must match derived path | Production: APP_DATA_DIR/pricebooks; dev: repo/data/pricebooks | No | G |
| `PUBLIC_BASE_URL` | runtimeConfig.js:74-79; deploymentConfig.js:61-62 | D-origin: required bare HTTPS origin, no trailing slash | None | No | G |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | deploymentConfig.js:58 → integer:13 | D-drain: 0..3600 and at least shutdown + 5 | 0; missing therefore rejects production startup | No | G L |
| `RAILWAY_ENVIRONMENT_ID` | deploymentConfig.js:33,46,89 | D-proxy: required for railway proxy; enables actual Linux mount check | None; platform metadata | No | G L |
| `RAILWAY_GIT_COMMIT_SHA` | backups.js:90 | No startup check; snapshot provenance only | null | No | G L |
| `RAILWAY_VOLUME_MOUNT_PATH` | deploymentConfig.js:48-51 | D-path: required absolute non-root directory; actual mount checked | None; template expects platform /data | No | G L |
| `RESEND_API_KEY` | email.js:27,37; ownerEmailDelivery.js:9 | No startup check; E-send requires nonempty value without CR/LF | None | Yes | G |
| `SHUTDOWN_TIMEOUT_SECONDS` | deploymentConfig.js:57 → integer:13 | D-int: 5..115 | 110 seconds | No | G L |
| `STRIPE_BILLING_ENABLED` | billingConfig.js:48; deploymentConfig.js:42-43 | D-bool: optional; if supplied exactly true or false | false | No | G |
| `STRIPE_CHECKOUT_CANCEL_URL` | billingConfig.js:94 → requiredExact:17 | B-required/B-url: if billing on, HTTPS, no credentials/hash; all three share origin (not compared to PUBLIC_BASE_URL) | None | No | S G |
| `STRIPE_CHECKOUT_SUCCESS_URL` | billingConfig.js:93 → requiredExact:17 | B-required/B-url: if billing on, HTTPS, no credentials/hash; all three share origin (not compared to PUBLIC_BASE_URL) | None | No | S G |
| `STRIPE_INTEGRATION_IDENTIFIER` | billingConfig.js:100-102 → requiredExact:17 | B-required/B-id: if billing on, leading letter, up to 55 prefix characters, underscore + 8 letters | None | No | S G |
| `STRIPE_OPERATOR_ANNUAL_PRICE_ID` | billingConfig.js:4,73 → requiredExact:17 | B-required/B-price: if billing on, price_ syntax and distinct IDs | None | No | S G |
| `STRIPE_OPERATOR_MONTHLY_PRICE_ID` | billingConfig.js:3,73 → requiredExact:17 | B-required/B-price: if billing on, price_ syntax and distinct IDs | None | No | S G |
| `STRIPE_PORTAL_RETURN_URL` | billingConfig.js:95 → requiredExact:17 | B-required/B-url: if billing on, HTTPS, no credentials/hash; all three share origin (not compared to PUBLIC_BASE_URL) | None | No | S G |
| `STRIPE_QUOTEDONE_ANNUAL_PRICE_ID` | billingConfig.js:8,73 → requiredExact:17 | B-required/B-price: if billing on, price_ syntax and distinct IDs | None | No | S G |
| `STRIPE_QUOTEDONE_MONTHLY_PRICE_ID` | billingConfig.js:7,73 → requiredExact:17 | B-required/B-price: if billing on, price_ syntax and distinct IDs | None | No | S G |
| `STRIPE_SCALE_ANNUAL_PRICE_ID` | billingConfig.js:84-89 | B-price: optional legacy reconciliation; validate syntax/distinctness only if billing on and value supplied | None; never offered at Checkout | No | R S G |
| `STRIPE_SCALE_MONTHLY_PRICE_ID` | billingConfig.js:84-89 | B-price: optional legacy reconciliation; validate syntax/distinctness only if billing on and value supplied | None; never offered at Checkout | No | R S G |
| `STRIPE_SECRET_KEY` | billingConfig.js:55 → requiredExact:17 | B-required/B-key: if billing on, sk/rk live key syntax in production | None | Yes | S G |
| `STRIPE_WEBHOOK_SECRET` | billingConfig.js:56 → requiredExact:17 | B-required/B-webhook: if billing on, whsec_ syntax | None | Yes | S G |
| `TRUST_PROXY` | clientAddress.js:4; deploymentConfig.js:45-46 | D-proxy: explicit none or railway; railway needs metadata | none outside production; explicit in production | No | G L |
| `TWILIO_ACCOUNT_SID` | runtimeConfig.js:91-106; voiceDurationRecovery.js:18 | R-provider/R-voice: required for either flag; AC + 32 hex characters | None; also REST username fallback | No | G |
| `TWILIO_API_KEY_SECRET` | runtimeConfig.js:91-92; voiceDurationRecovery.js:18 | R-provider: required nonblank when provider writes enabled | REST client falls back to auth token | Yes | G |
| `TWILIO_API_KEY_SID` | runtimeConfig.js:91-98; voiceDurationRecovery.js:18 | R-provider: required when provider writes enabled; SK + 32 hex characters | REST client falls back to account SID | No | G |
| `TWILIO_AUTH_TOKEN` | runtimeConfig.js:103-104; voiceDurationRecovery.js:18 | R-voice: required nonblank when voice enabled; no token-format check | None; callback signing and REST fallback | Yes | G |
| `VOICE_BREAKER_COOLDOWN_SECONDS` | voice/voiceAdmission.js:16 → integer:5 | V-int: 1..3600, even when voice disabled | 30 | No | R S G |
| `VOICE_BREAKER_FAILURE_THRESHOLD` | voice/voiceAdmission.js:14 → integer:5 | V-int: 1..1000, even when voice disabled | 3 | No | R S G |
| `VOICE_BREAKER_WINDOW_SECONDS` | voice/voiceAdmission.js:15 → integer:5 | V-int: 1..3600, even when voice disabled | 60 | No | R S G |
| `VOICE_CALLER_DAILY_LIMIT` | voice/voiceAdmission.js:13 → integer:5 | V-int: 1..1000, even when voice disabled | 6 | No | R S G |
| `VOICE_HANDLE_SECRET` | voice/voiceReadiness.js:10; voice/productionVoiceRuntime.js:78 | No fatal startup check; readiness requires ≥32 bytes | BOOKING_SLOT_TOKEN_SECRET, then JWT_SECRET | Yes | S G L |
| `VOICE_MAX_CONCURRENT` | voice/voiceAdmission.js:11 → integer:5 | V-int: 1..100000, even when voice disabled | 100 | No | R S G |
| `VOICE_MAX_CONCURRENT_PER_OWNER` | voice/voiceAdmission.js:12 → integer:5 | V-int: 1..1000, even when voice disabled | 5 | No | R S G |
| `VOICE_RUNTIME_ENABLED` | runtimeConfig.js:35; deploymentConfig.js:42-43 | D-bool: optional; if supplied exactly true or false | false | No | G |

### Reverse comparison and excluded names

- `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0` is a Railway platform control, not read by server source. Its existing recommendation is unchanged. Draining seconds **are** read by the server for shutdown validation.
- `TMPDIR`, `TEMP`, `TMP` are written to the derived temporary directory at `deploymentConfig.js:105`; no first-party server reads were found. Node/SDK behavior is outside this inventory. Keep manual production overrides unset.
- `VITE_API_URL` is a client build variable (`client/src/api.js:3`), not a server variable; retained and marked accordingly in the local template.
- `.env.example` formerly assigned `DEMO_DAILY_BUDGET_USD=25` and `DEMO_CONCURRENT_MAX=10`. Neither is read. The assignments are removed and marked obsolete; the actual count controls are `DEMO_DAILY_SESSION_CAP` and `DEMO_MAX_CONCURRENT`. No USD-to-session equivalence is implied.
- `DEMO_TRUSTED_PROXY_HOPS` is not merely unused: production reads it in order to reject it. The demo guide's old proxy-count advice is replaced by `TRUST_PROXY`.
- `CLIENT_BASE_URL` and both legacy Scale price IDs still have readers. They are optional/legacy, not stale variables to delete.
- Placeholder labels (`REPLACE_WITH_*`, `APP-HOST`, `SIGNUP-URL`, `EXACT_BUNDLE_NAME`), error codes such as `BACKUP_FAILED`, and document filenames are not environment settings. No other documented server settings lacked a reader.

The regression `test/railwayConfigDocs20261009.spec.mjs` hand-lists 34 core and
conditional startup settings, validates synthetic configurations using the real
pure validators, and checks that deleting each documented setting is detected.
It separately covers the text-model omission, no-default/Live-model behavior,
and retired demo settings. It opens no account, database, network client or mount.
Missing and invalid off-site/email/carrier settings are deliberately not described
as fatal startup requirements. No feature-enable recommendation was changed by
this audit; real integration acceptance remains an owner/Claude decision.
