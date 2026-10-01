# Railway setup and recovery

This deploys the existing owner app, widget assets and Express API as one Docker service. It does not deploy the public marketing site. No Railway project, paid resource, domain record or off-site bucket has been created by this change. Review PR #11 and choose the Railway account/plan before provisioning.

## 1. Create one service and its persistent volume

1. In Railway, create a project from GitHub repository `sportaholic000-hue/off-the-clock`. Select the reviewed integration branch containing PR #11 (or its implementation branch for an isolated infrastructure trial). Keep Root Directory at the repository root.
2. Confirm Railway detects the root `Dockerfile`. Leave custom build/start commands empty: the image runs `npm ci`, builds both bundles, and starts `node server/src/server.js` directly as PID 1. Never use the repository's committed dependencies or dist files. [Railway Dockerfile support](https://docs.railway.com/builds/dockerfiles).
3. Attach a volume to this service, mount path **/data**. Use exactly one replica and one deployment region. Do not attach the same SQLite data to independent services. Leave serverless/app sleeping off.
4. Configure Healthcheck Path **/api/health**, Healthcheck Timeout **300 seconds**, and an On Failure restart policy. Railway's deployment health check is not ongoing uptime monitoring. Volume attachment means a brief interruption during redeploys is expected. [Health checks](https://docs.railway.com/deployments/healthchecks).
5. Set the variables below before deploying. Set **RAILWAY_DEPLOYMENT_DRAINING_SECONDS=120** and **SHUTDOWN_TIMEOUT_SECONDS=110**. Railway sends SIGTERM and eventually SIGKILL; the longer platform window allows the app to finish HTTP handlers, webhook delivery and backups before closing SQLite. Leave overlap at 0 for this single-volume setup. [Deployment teardown](https://docs.railway.com/deployments/deployment-teardown).
6. Deploy. Confirm health returns 200 and logs show the API listening. A missing mount, unwritable storage or invalid production configuration must stop startup, rather than quietly create a fresh database inside the image.

Railway bills compute and storage separately. Choose the plan in your own account; this work purchases nothing. Volume storage currently lists $0.15/GB-month. Size it for the live database, price books, temporary backup staging and at least 120 full snapshots at the default four per day for 30 days, plus headroom. Set a usage budget and watch free space. [Railway pricing](https://docs.railway.com/pricing).

## 2. Set environment variables

Use [deployment/railway.env.example](../deployment/railway.env.example) as the complete template; comments identify optional feature groups. Enter secrets in Railway Variables, never GitHub. Preserve a separate private recovery copy of the credential encryption key and key version. Restoring encrypted calendar credentials and stored checkout receipts requires the same key. Keep JWT and booking secrets stable across redeploys.

Required for the production service:

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

Defaults/settings: **CREDENTIAL_ENCRYPTION_KEY_VERSION=v1**, **BCRYPT_COST=12** (10..16), **BACKUP_INTERVAL_SECONDS=21600** (60..86400), **BACKUP_RETENTION_DAYS=30** (30..365), **OUTBOUND_WEBHOOKS_ENABLED=true**. Keep **LOCAL_PREVIEW_MODE=false**, **EMAIL_DELIVERY_ENABLED=false**, **EMAIL_PROVIDER=console**. Do not set **DATABASE_PATH**, **PRICEBOOK_PATH**, **TMPDIR**, **TEMP** or **TMP**: startup derives all of them inside APP_DATA_DIR. Remove **DEMO_TRUSTED_PROXY_HOPS**; the shared TRUST_PROXY policy replaces it. Legacy CLIENT_BASE_URL is unnecessary; if present it must equal PUBLIC_BASE_URL.

For the first infrastructure check, leave **ALLOW_PROVIDER_WRITES=false**, **STRIPE_BILLING_ENABLED=false**, **VOICE_RUNTIME_ENABLED=false**, **DEMO_ENABLED=false**. These are explicit disabled features, not evidence that paid signup, calendar provider writes or voice are launch-ready. Complete the relevant group before enabling:

- **Google Calendar:** GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALENDAR_REDIRECT_URI must be provided together. Register exactly `https://app.offtheclockai.com/api/onboarding/calendar/google/callback` in Google's OAuth application. The existing global provider-write gate also needs enabling for the callback.
- **Provider writes:** ALLOW_PROVIDER_WRITES=true requires TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET in this baseline, even for other provider routes sharing that gate. Keep carrier URL/token only if the separate telephony lane uses them. This deployment does not change that coupling.
- **Stripe:** STRIPE_BILLING_ENABLED=true requires the live secret/restricted key, webhook secret, four distinct Operator/QuoteDone monthly/annual Price IDs, checkout success/cancel URLs, portal return URL, and integration identifier shown in the template. Redirect URLs must share an HTTPS app origin. The identifier ends in eight letters. Register the existing endpoint `https://app.offtheclockai.com/api/stripe/webhook`; the supported event list is exported in server/src/billingRoutes.js. Checkout/portal also require ALLOW_PROVIDER_WRITES=true. Reuse approved prices; Scale is not offered. No Stripe resource is created here.
- **Website demo:** DEMO_ENABLED=true requires GEMINI_API_KEY and the exact website origins in DEMO_ALLOWED_ORIGINS. DEMO_IP_SALT defaults to JWT_SECRET; a separate stable salt is preferable. GEMINI_LIVE_MODEL and the six demo limit/voice settings in the template retain the current implementation's defaults. Verify the existing model with the demo owner before enabling billable sessions. The JS endpoint and session API remain present when disabled; sessions return their existing 503 response.
- **Voice:** keep VOICE_RUNTIME_ENABLED=false until Claude's voice integration passes. The current baseline is not a complete live-call runtime. Existing validation also requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, GEMINI_API_KEY and an explicit live GEMINI_MODEL when enabled. Its future WebSocket shutdown must join lifecycle.stopWorkers before real calls are enabled.
- **Admin:** optional ADMIN_EMAIL and ADMIN_PASSWORD_HASH together; the hash must be bcrypt with cost 10..16. Never enter a plaintext password.
- **Email:** live delivery remains deferred. EMAIL_FROM/RESEND_API_KEY belong to the future email setup, not this deployment. Console delivery does not deliver recovery or verification email.

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

In the running container at /app:

```sh
node server/scripts/backup.js
```

The command prints the new bundle path. Watch backup creation times and `[backup] BACKUP_FAILED` in logs. The default recovery point can lose up to six hours of changes after the last successful snapshot; a disk-full or sustained backup failure can make that longer. These are full application snapshots, not incremental copies.

To test recovery without overwriting current data:

```sh
node server/scripts/restore.js --backup /data/app/backups/snapshot-EXACT_BUNDLE_NAME --target /data/restores/drill-20261001
```

Use a real complete bundle name printed by backup. The target must be a **new** direct child of /data/restores. Restore refuses an existing target, corrupted checksums, unsafe paths or invalid SQLite. After success, change **APP_DATA_DIR=/data/restores/drill-20261001** in Railway and redeploy with the same encryption key, key version and signing secrets. Confirm health and exact test data. Leave DATABASE_PATH/PRICEBOOK_PATH unset; they are derived again. The original /data/app remains intact. Backups then run under the restored root; older snapshots remain under the previous root until you intentionally manage them.

For an independently stored bundle returned from an off-site destination, download it privately into the mounted volume first, then run the same command. Review the schema/source-commit compatibility before restoring an older application's data; the automated drill covers this implementation and its baseline schema.

## 6. Choose an independent off-site destination

Snapshots on /data can recover from application mistakes but not loss of that entire volume. No upload destination has been selected or connected. The earlier platform spec's continuous replication/point-in-time recovery is also not implemented by these six-hour snapshots.

These storage-only USD estimates use an average **50 GB stored**, not a promise of your final bill. API operations, transfers and taxes may add cost.

| Option | Published storage rate | 50 GB/month illustration |
|---|---|---|
| Cloudflare R2 Standard | $0.015/GB-month, with 10 GB-month free allowance | $0.75 before the free allowance; $0.60 if the allowance is unused |
| Backblaze B2 | $6.95/TB-month | approximately $0.35 before applicable credits |

Sources checked 2026-10-01: [R2 pricing and operation charges](https://developers.cloudflare.com/r2/pricing/), [B2 pricing](https://www.backblaze.com/cloud-storage/pricing). R2 lists free internet egress; B2 includes egress up to its published allowance. Choose the destination, region, access policy and budget before an uploader is added. Preserve secrets separately; never make the bucket or DB public.

Railway's own volume backup schedules are an additional account-level option with its own storage charges, not this app's independent off-site destination. [Railway volume backups](https://docs.railway.com/volumes/backups).

## Before admitting customers

Complete the real Railway ingress/domain/storage checks above, choose and test off-site retention, enable and verify existing paid signup/calendar integrations, and resolve the nine baseline voice failures in their assigned lane. Read the source-bound results in docs/review/railway-20261001. No launch-ready voice claim is made by this deployment change.
