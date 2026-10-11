All requested fixes pass hosted CI. Local browser assertions are NOT RUN because Chromium is unavailable.

# Backup and retention hardening

Base verified with `git ls-remote`: `claude/release-candidate-20261011h` was
`c5487b1eab00d4944dd3a53a7264898adb758cde`. Work is on
`fix/retention-hardening-20261011`; nothing was merged into the candidate.
All fixtures and provider/storage adapters are synthetic. No real provider
accounts, deployments, Railway settings, texts, specifications or public pages
were changed. No subagents were used.

## 1. Stale locks

The following names have the common prefix `retention hardening: `.

| Failing test before the fix | Observed failure |
|---|---|
| `ordinary snapshot recovers a dead child retention lock` | `OFFSITE_BUSY` |
| `worker recovers PID 1 from a previous process instance` | `OFFSITE_BUSY`; child exit 1, expected 0 |
| `acquire recovers PID 1 from a previous process instance` | `OFFSITE_BUSY`; child exit 1, expected 0 |
| `legacy PID 1 lock predating this process is recoverable` | `OFFSITE_BUSY`; child exit 1, expected 0 |

[Initial reproduction](item1-before.tap): **2 passed, 3 failed**. The additional
[legacy-format reproduction](item1-legacy-before.tap): **0 passed, 1 failed**.
The strengthened fast-restart case also failed before reducing the timestamp
precision margin from one second to two milliseconds:
[item1-fast-restart-before.tap](item1-fast-restart-before.tap), **0/1**.

`server/src/backupRetentionLock.js:14` identifies Linux holders using the boot ID
and process start tick, with a per-process fallback where `/proc` is unavailable.
Both workers and acquisition use `removeStaleProcessLock` at line 29. Dead PIDs,
changed birth identities and legacy self-PID locks demonstrably predating this
process recover; live or ambiguous holders remain excluded. Daily and continuous
worker locks also use the identity check. No age-based expiry steals live locks.

After: **all 6 lock tests passed** in [retention-regression.tap](retention-regression.tap).
The final lock run passed **16/16** ([item1-final.tap](item1-final.tap));
the first checkpoint passed **15/15**, including live daily/continuous
restore-versus-erasure and nested-volume exclusion: [item1-after.tap](item1-after.tap).

## 2. Interrupted snapshots and retry material

| Failing test before the fix, after `retention hardening: ` | Observed failure |
|---|---|
| `interrupted snapshot secrets disappear before provider success` | Partial copy still existed: actual `true`, expected `false` |
| `interrupted snapshot secrets disappear before 30-day permanent failure` | Partial copy still existed: actual `true`, expected `false` |
| `provider steps cannot complete while abandoned snapshot removal fails` | `dataDeletedAt` was set; expected `null` |
| `startup removes abandoned snapshots even when the next backup is not due` | Partial copy still existed |
| `retry secrets never reach the first snapshot disk write` | `SID reached snapshot disk before normalization` |

[Initial reproduction](item2-before.tap): **0 passed, 5 failed**. Additional
reproductions proved that cleanup removed another live process's snapshot
([item2-live-before.tap](item2-live-before.tap), **0/1**) and skipped cleanup after
startup lock contention ([item2-startup-retry-before.tap](item2-startup-retry-before.tap), **0/1**).

`server/src/backups.js:147` serializes committed SQLite pages, including WAL,
into memory. `removeRetrySecrets` at line 32 securely deletes the retry table's
rows and vacuums that memory database before its first snapshot disk write.
The live database retains the credentials needed for an unfinished provider retry.
This uses additional memory for the database image and working copy.

`cleanupAbandonedSnapshots` at line 15 removes legacy partial copies under the
shared lock, checks worker/partial-snapshot holders, and refuses a live holder.
Startup and scheduled retries invoke it (`backups.js:216`, `:222`).
`billingRetentionSteps.js:117` requires successful cleanup before recording
provider success or permanent failure; failures stay pending. The existing
secure-delete and WAL truncation remove the live retry material on completion.
Production wiring is at `server/src/server.js:334`.

After: **all 8 new snapshot tests and all 12 existing backup tests passed**,
**20/20**: [item2-final.tap](item2-final.tap). The earlier provider/snapshot run
passed **39/39**: [item2-after.tap](item2-after.tap). Assertions inspect the partial
file, final database and WAL, both provider outcomes, preservation of B, live
snapshot exclusion and a successful retry after the blocking restore exits.

Full validation caught a startup collision introduced by the first retry fix.
`actual production server starts continuous replication and gates health through
the admin route` failed alone on two CPUs with both workers reporting
`OFFSITE_BUSY` ([before](startup-production-before.tap), **0/1**). The deterministic
`retention hardening: a clean startup does not block scheduled snapshots on active
off-site workers` also failed ([before](startup-collision-before.tap)). Cleanup now
retries only while startup cleanup is pending; an ordinary scheduled backup does
not acquire the erasure lock. The same production case then passed alone on two
CPUs ([after](startup-production-after.tap), **1/1**), and the full local gates
were restarted on the final source. This failure was fixed, not waived as timing.

## 3. Overdue deletion health

| Failing test before the fix, after `retention hardening: ` | Observed failure |
|---|---|
| `admin returns 503 for day-90 erasure blocked before initialization` | HTTP **200**, expected **503**, with A's private profile still present |
| `missing due steps count, calendar connected=true` | Missing due phone step was omitted |
| `missing due steps count, calendar connected=false` | Missing due phone step was omitted |

[Before](item3-before.tap): **0 passed, 3 failed**.

`server/src/billingRetentionSteps.js:182` derives due steps from service end:
phone +30 days; local/backups +90; calendar +90 when connected. Missing steps
count even if another worker's lease prevents initialization. Before-deadline
controls remain healthy. `server/src/offsiteBackups.js:187` combines this result
into both HTTP 503 and `ok:false`; the existing admin-only `/api/admin` at
`server/src/server.js:475` consumes the same status.

[After](item3-after.tap): **25/25**, including all 3 new cases and existing
provider/admin authentication and secret-exclusion regressions.

## 4. Versioned off-site storage

| Failing test before the fix, after `retention hardening: ` | Observed failure |
|---|---|
| `Enabled daily erasure removes every historic version and marker` | Historic tenant version survived completion |
| `Enabled continuous erasure removes every historic version and marker` | Historic tenant version survived completion |
| `Suspended daily erasure removes every historic version and marker` | Historic tenant version survived completion |
| `Suspended continuous erasure removes every historic version and marker` | Historic tenant version survived completion |
| `Unsupported versioning permits ordinary off-site erasure` | Versioning state absent; no versioning probe |
| `NeverEnabled versioning permits ordinary off-site erasure` | Versioning state absent; no versioning probe |
| `version delete rejected keeps erasure pending and admin unhealthy` | `Missing expected rejection.` |
| `version delete ignored keeps erasure pending and admin unhealthy` | `Missing expected rejection.` |
| `versioning access denied keeps erasure pending and admin unhealthy` | `Missing expected rejection.` |

[Before](item4-before.tap): **0 passed, 9 failed**.

`server/src/offsiteStore.js:34` checks bucket versioning. Its version inventory
paginates using both markers and includes object versions and delete markers;
deletions explicitly send `VersionId`. Only an explicit unsupported response or
never-enabled state permits current-object-only handling. Other errors fail closed.

`server/src/tenantBackupErasure.js:117` requires that check before completion.
The purge at line 240 also discovers keys hidden by delete markers.
`server/src/offsiteVersionErasure.js:4` retains the verified redacted current copy,
deletes historical data before markers, then verifies the remaining versions and
current identity. Failed or ignored deletes leave the backup step pending with
an admin-visible fixed reason. `offsiteBackups.js:172` reports the versioning
state, check time and safe error code. [OFFSITE_BACKUPS.md](../../docs/OFFSITE_BACKUPS.md)
documents the behavior and additional S3 permissions.

[After](item4-after.tap): **9/9**. The tests decrypt retained daily and continuous
copies, verify A erased, B unchanged and A billing retained; cover suspended
`null` versions, pagination, marker-hidden objects, unrelated prefixes, failed
deletes, falsely acknowledged deletes, denied inspection and successful retries.
Running cleanup twice makes no further remote requests.

## 5. Existing guarantees and route review

The focused run passed **402/402**, zero failures/skips/cancellations/TODOs:

```sh
node --test --test-reporter=tap --test-concurrency=1 \
  test/retentionHardening*.spec.mjs test/day90*.spec.mjs \
  test/tenantRetention20261010.spec.mjs \
  test/continuousOffsite20261007.spec.mjs test/backups.spec.mjs \
  test/offsiteBackups20261007.spec.mjs \
  test/ownerQueryCoverage20261009.spec.mjs test/tenantIsolationRoutes.spec.mjs
```

[Log](retention-regression.tap). This includes all requested existing suites,
A/B replacement interleaving for both streams, complete tenant erasure inventory,
preserved billing, exact preservation of B, repeated-cleanup idempotence,
provider retry/deadline/WAL handling, restore exclusion, actual fake-store restore
CLI drills, and authenticated route isolation. The final startup retry and collision refinements
were then verified with **20/20** using:

```sh
node --test --test-reporter=tap \
  test/retentionHardeningSecrets20261011.spec.mjs test/backups.spec.mjs
```

Only the reviewed hashes for `billingCustomerLifecycle.js`, `offsiteBackups.js`
and `server.js` changed in the route-source inventory. Route paths, middleware,
roles and inventory assertions are unchanged. The admin routes remain admin-only
and `no-store`. The query exception change adds calendar-revocation status to
the existing admin cancellation inventory; secret-table deletions remain
owner-scoped. Existing SQL exceptions moved to the in-memory scrub function with
their reasons updated. No scanner checks were removed or broadened.

## Full gates and publication

`npm run build`: **PASS**, owner app and widget; [build.log](build.log).
Tracked `client/dist` was restored and is not part of these commits.

Local test prerequisites: Node 24.19.0, 9 available CPUs, a writable `TMPDIR`,
and `PRICEBOOK_BROWSER_MODULE` pointing to the workspace Playwright package.
A workspace-only `NODE_OPTIONS` preload retains better-sqlite3 native wrappers
until exit to avoid this environment's native cleanup-hook crash. SQL,
transactions, backup transfer, close operations and assertions run unchanged.
That workaround is outside the repository and is not used in hosted CI.

The local Chromium launch probe failed because the executable is absent:
[chromium-launch.log](chromium-launch.log). Browser assertions are NOT RUN
locally and are never counted as passed.

Final source `77ce537a859c7989772059692a10cd3d77995f32` local gates:

| Command | Passed | Runner failures | Browser assertions NOT RUN | Result |
|---|---:|---:|---:|---|
| `npm test` | 4,792 | 60 | 60 | Exit 1: Chromium absent |
| `npm run test:quote` | 4,083 | 60 | 60 | Exit 1: Chromium absent |

Totals were **4,852** and **4,143**, respectively; zero skips, cancellations
or TODOs. Every unsuccessful block reports the missing browser executable;
there were no other failures. **All 26 new regression names passed in both
gates.** The actual production-startup case also passed in both. The runners
used separate CPU sets (0–3 and 4–7). [Exact summaries and names](local-gates.log).
Full raw local logs remain in the workspace at the paths and SHA-256 hashes
recorded in that summary; they are not represented as GitHub artifacts.

Hosted workflow **CI**, [run 38123390505](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38123390505),
completed **success** for final code commit
`77ce537a859c7989772059692a10cd3d77995f32`. Its test-job log was fetched directly:

| Hosted command/check | Passed | Failed / skipped / cancelled / TODO |
|---|---:|---:|
| `npm run build` | PASS | — |
| `node --test test/ownerAlertsDelivery20261006.browser.spec.mjs test/ownerDashboard20261007.browser.spec.mjs` | 9/9 | 0 / 0 / 0 / 0 |
| `npm run test:quote` | 4,157/4,157 (202 files) | 0 / 0 / 0 / 0 |
| `npm test` | 4,866/4,866 | 0 / 0 / 0 / 0 |
| `voice-docker-startup` job, synthetic credentials and no provider network | PASS | — |

**All 26 new test names appear as passing results in each gate (52 occurrences).**
[Retrieved log excerpts](hosted-code-gates.log). Hosted Node 22 has Chromium;
the missing local browser assertions therefore did run successfully here.
Candidate-only tagging and candidate-specific smoke steps were skipped by their
existing branch conditions; they are not counted as test passes. No production
deployment or provider calls were made.

Shell `git push` lacked credentials. Checkpoints were published using the
connected GitHub Git-data API, fetched back into the local branch, and verified
with `git ls-remote`. Confirmed remote checkpoints:

- `6378b7958a599aba2531be7f532b4884bf6f4478`: first passing lock fix.
- `d8c1561711e3514d72a29e2354642202416c4e65`: snapshot and health fixes.
- `17776086116eaeba3d9001bf7e0471135110e10a`: versioned erasure and live staging.
- `3a740944055a5a716dba493f8c1d5f8950b677ee`: startup cleanup retry.
- `8754db7e599664ba7933eb89d3aba971114af4f5`: fast legacy restart.
- `77ce537a859c7989772059692a10cd3d77995f32`: normal startup collision fixed; final code.

The final report-only commit's own SHA and exact-head hosted result are verified
after publication and supplied in the task's final response. A commit cannot
contain its own SHA or the result of CI that runs after that commit is created.
