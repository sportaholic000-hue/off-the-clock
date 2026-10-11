# Candidate j lock-database follow-up — expectations before execution

Pinned input: `001b85dba56770549526beff9bc7b40a36a580c6`, confirmed with
`git ls-remote` on 2026-10-11. No `rc-20261011j` tag exists at the start.

1. The existing Railway smoke keeps every assertion. Its temporary cleanup
   container also removes `/cleanup/backups`; the host cleanup then exits 0.
2. A separate Docker proof uses the unmodified production image user (the
   Dockerfile has no USER override: UID/GID 0). On initial startup, ordinary
   restart, fresh-container redeploy and restored-root startup, the same
   volume-wide SQLite mutex can be acquired and released. Its inode, UID/GID,
   mode 0600 and parent mode 0700 survive. A second process gets OFFSITE_BUSY
   while it is held. The actual restore CLI fails while that mutex is held,
   creates no target, and succeeds after release under the same runtime user.
3. Backup listing returns snapshot bundles only, never any of the three mutex
   databases (retention, daily worker, continuous worker).
4. Pruning deletes an expired snapshot, keeps the latest snapshot and preserves
   every mutex inode, contents and mode even with an expired mtime.
5. Snapshot creation writes only the application database, the two synthetic
   price books and manifest. No mutex or SQLite mutex sidecar is in the bundle.
6. Daily and continuous uploads through the existing fake S3 server contain
   only encrypted snapshot objects plus receipts. Decrypt every uploaded
   archive: its manifest and complete on-disk inventory exclude mutexes.
7. At day 90, the real lifecycle erases synthetic business A locally and from
   local/daily/continuous backup copies, preserves B, and retains all mutex
   inodes and their usability. Decrypted replacement archives exclude mutexes.
8. Local focused tests: zero failed/skipped/cancelled/TODO. Hosted CI on both
   the source checkpoint and final report commit: test, voice-docker-startup
   (including both Railway proofs), and candidate-j gate jobs succeed. The
   unrelated h/i tag jobs are not applicable to this branch.
9. Only the final all-green commit receives a new annotated rc-20261011j tag;
   neither an existing tag nor a failed commit can be tagged by this task.

Synthetic temporary storage and fake providers only. No application change is
expected; an actual product failure must be reported and tested if discovered.

Fixture correction before the second execution: the initial test run was 4/5.
Its day-90 case assumed successful continuous uploads retained their temporary
local snapshot. `continuousOffsite.js:131` deliberately removes it. Seed an
additional retained continuous bundle before erasure, keeping the assertion
that at least two local bundles are checked. No product change or assertion
relaxation is needed. Preserve the first TAP log as evidence.

Additional concurrency check, written before execution: if staging cleanup
examines a live child process's partial snapshot, cleanup must return
OFFSITE_BUSY and leave that writer alone. When the writer completes, the
published bundle must still contain only the manifest-listed application
database and books, with no `.snapshot-owner.json.sqlite` mutex left inside it.
