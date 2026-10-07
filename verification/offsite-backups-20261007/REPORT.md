# Off-site daily backup implementation — October 7, 2026

Implementation checkpoint; complete cold hosted verification is pending.

Verified starting application commit:
`fb7ae652d71610dfe940ed0678449c05c7a8fd1d`, branch
`verify/backup-restore-rehearsal-20261006`. Working branch:
`feat/offsite-backups-20261007`. No subagents, merge, deployment, real account,
cloud storage, provider operation or live-data change.

Production adds a daily UTC snapshot uploader while retaining existing local
backup/restore behavior. The original version-1 bundle includes online SQLite and
every saved price book, with unchanged integrity/completeness checks. Streamed
AES-256-GCM encryption, separate SHA-256 completion record, verified download
before publication, immutable conditional writes, durable pending artifact/status,
bounded retries, process lock, 30-completed-day retention, admin-only status route,
clear missing-config production warning and actual off-site restore CLI are added.
The AWS S3 SDK is pinned in the dependency manifests and lockfile. No pricing,
approval, receipt, billing, voice or tenant application source is changed beyond
the server's backup/status lifecycle integration.

[Prewritten expectations](EXPECTED.md) precede all execution. Operator variables,
restore command, status endpoint, permissions, key preservation and limits are in
[the operator guide](../../docs/OFFSITE_BACKUPS.md).

Synthetic evidence:

- First off-site test run: 12/15; three fixture prerequisites corrected (unbuilt
  client assets for the real CLI; missing actual auth sessions).
- Initial backup + off-site focused run: **32/32** pass, zero skips.
- Final new regression file: **22/22** pass, zero failures/skips. Covers actual
  fake S3 HTTP/signing SDK, real restore CLI/full-volume wipe, exact two-owner
  database/book bytes, no plaintext upload, wrong key, checksum/GCM corruption,
  daily dedupe, concurrent runs, lost responses, durable failure/restart, bounded
  retry schedule, paginated retention, missing/incomplete copies, interrupted
  pruning, missing/invalid config, actual admin auth/HTTP status, shutdown drain,
  changed destination/local state, stale/live locks and competing pending state. A worker also re-reads durable state under its lock, so
  a worker constructed before a response-loss failure reuses the first artifact.
- An overlapping multi-file focused run returned **41 pass / 2 fail**: existing
  missing-book rehearsal case plus its parent. Unchanged pinned-base rehearsal
  and changed-source rehearsal each pass **9/9** independently. This transient
  is retained in evidence; no assertion or gate is weakened.
- Cold `npm ci` and owner/widget build pass. Local Playwright browser download
  returns a truncated ZIP and lock failure; full gates are attempted and hosted
  CI must supply complete browser verification. Results are not yet claimed green.

Limits: daily snapshots do not implement platform §12.19 continuous replication
or protect changes since the last successful daily backup. No real endpoint/account
or deployment acceptance is claimed. Maximum encrypted archive 4 GiB; larger data
fails visibly. Provider-managed old versions/object-lock policies require their
own retention settings. Existing encryption keys are required for restore.
