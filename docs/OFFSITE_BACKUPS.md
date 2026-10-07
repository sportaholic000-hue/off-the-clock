# Daily encrypted off-site backups

The production server retains its existing six-hour local snapshots and adds one
completed off-site snapshot per UTC calendar day. An overdue job runs at startup;
a running process checks every minute. These are full database plus **all** saved
price-book bundles in the existing version-1 format, not continuous replication.
The off-site recovery point can lose up to a day's changes, and longer during a
sustained outage. Platform §12.19's continuous replication remains separate work.

No storage account or bucket is created by this implementation. Provision a private
S3-compatible bucket separately, with no public read access, HTTPS, and credentials
restricted to Get/Put/Delete under the chosen prefix and ListBucket for that prefix.
Keep staging and production in separate buckets/prefixes. Bucket versioning/object
lock/lifecycle policies may retain additional old versions: this app prunes current
objects, not provider-managed historic versions. Compatible conditional PUT
(`If-None-Match: *`), metadata and ListObjectsV2 pagination are required. The SDK
uses path-style addressing and Signature V4. Plain HTTP is accepted only for a
loopback fake store; real endpoints must use HTTPS.

Required environment variables:

| Variable | Value |
|---|---|
| `OFFSITE_BACKUP_ENDPOINT` | HTTPS S3 API endpoint |
| `OFFSITE_BACKUP_BUCKET` | Existing private bucket |
| `OFFSITE_BACKUP_ACCESS_KEY_ID` | Restricted storage access key |
| `OFFSITE_BACKUP_SECRET_ACCESS_KEY` | Corresponding secret |
| `OFFSITE_BACKUP_ENCRYPTION_KEY` | Independent random 32-byte key; 64 hex characters or canonical padded base64 |

Optional: `OFFSITE_BACKUP_PREFIX` (default `off-the-clock`, **set a unique prefix
per environment**), `OFFSITE_BACKUP_REGION` (default `us-east-1`; R2 commonly uses
`auto`), `OFFSITE_BACKUP_SESSION_TOKEN` for temporary credentials. The existing
application storage/signing/credential environment remains required for startup
and the restore CLI. Never put secrets in source control.

Preserve the backup encryption key **outside the Railway volume**, alongside the
existing application credential-encryption key and signing secrets. Losing the
backup key makes the objects unrecoverable. Do not rotate a key with a pending
upload. Changing endpoint/bucket/prefix/key invalidates existing local upload state
and requires deliberate operator recovery; the worker fails closed and preserves
that state. Keep former keys until their retained backup dates have expired.

## Publication, retries and retention

The original online SQLite snapshot and complete-book verification run first.
A streamed archive is encrypted locally with AES-256-GCM, a fresh random nonce
and an authenticated version header. Maximum archive size is 4 GiB; a larger
snapshot fails visibly rather than exceeding the single-object upload boundary.
The remote object contains ciphertext only. A separate `.enc.json` completion
record stores its SHA-256, byte length, day and key fingerprint, without rates,
customer records or credentials. The worker downloads and checks the object
before publishing that record or calling the upload successful.

A private `.offsite` directory under the existing backups directory durably stores
the encrypted pending artifact and retry/status state. Conditional writes never
overwrite an accepted daily object. Response loss, restart and same-day reruns
reuse the same encrypted bytes. A process lock prevents concurrent writers on one
volume; a live lock is never stolen. A corrupted/conflicting remote object stays
failed and requires operator investigation, rather than overwriting evidence.

Each SDK request has at most three attempts and a 30-second deadline. Whole-job
retry backs off from one minute to a maximum of 30 minutes. Only one job runs at a
time, and graceful shutdown waits for the active job. After completion, retain the
newest **30 complete daily backups** and remove older data and completion records.
Incomplete/missing copies do not count toward thirty. Failed uploads never trigger
pruning; interrupted pruning resumes on retry. Unrelated keys are untouched.

## Operator status

`GET /api/admin/backups/offsite` requires a real platform-admin session. Anonymous
users, owners and staff cannot read it. It returns 200 only when a successful backup
is less than 26 hours old and no failure is active; otherwise 503. It reports last
successful day/time, attempt, pending day, retry time, failure count and a fixed
error code. Missing configuration is `NOT_CONFIGURED`, with a clear production
startup warning; local snapshots continue. `/api/health` remains the application
liveness/readiness check so an object-store outage does not trigger restart loops.

Monitor this admin status separately and investigate stale/failed backups. This
change does not add an operator email/SMS alert. Do not delete local state or remote
objects to clear a failure without first preserving evidence and verifying another
recoverable backup. Configuration/state corruption fails closed.

## Restore a chosen daily backup

Stop/recover into a **new** directory on the mounted volume, using the same
application source/schema and the key for that backup date:

```sh
npm run restore:offsite -- --day 2026-10-07 --target /data/restores/offsite-drill
```

Run inside the production container with its existing production environment,
private storage credentials and backup key. The command downloads the chosen
completion record and ciphertext, verifies SHA-256 before decrypting, authenticates
the encryption, reconstructs the original bundle and invokes the existing
`restoreBackup` path. SQLite integrity, foreign keys, book inventory and per-file
checksums are verified again. A wrong key or corrupted object exits nonzero and
publishes no restore. Existing directories/data are never overwritten. Temporary
ciphertext/plaintext is cleaned up on success/failure; the final restore directory
must be a new direct child of the volume's `restores` directory.

After a successful restore, follow the existing `docs/RAILWAY_SETUP.md` procedure
for selecting `APP_DATA_DIR` and retaining application secrets. Deployment and real
provider acceptance are separate, owner-authorized operations. All automated tests
use a local fake S3 server and temporary synthetic storage; no real cloud account,
volume-loss event or deployment is claimed.
