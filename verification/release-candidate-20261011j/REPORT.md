NOT DONE — the Railway Docker smoke job exits 1 during synthetic-directory cleanup. No `rc-20261011j` tag is created.

**Release candidate j — 2026-10-11**

The lock repair, ledger migration and merge are complete. Hosted tests and every standalone file pass. Docker's smoke assertions print success, but cleanup throws `EACCES`; the job is a failure, not a pass. Per the instruction to stop on failed release checks, the smoke harness is unchanged and the release is not tagged.

**Pinned inputs and publication**

- Base `claude/release-candidate-20261011i`: `a7effaf39ae382eadb0513979bf077ba236ea88f`, verified with `git ls-remote` before starting.
- Fix `fix/lock-recovery-race-20261011`: `4051dbf28a27f37d5953083ad62512cc80ce152c`, confirmed on GitHub and fetched back with an identical file tree.
- First working fix checkpoint: `088aecfbaa617034badf2bea60b849d631b39aea`; published immediately after the 151/151 focused run. The final fix adds the independent multi-process ledger regression.
- Merge commit: `06726a1fb4f3c13b82140f3d16f4a0db0edd9a52`. Its ordered parents are exactly `a7effaf39ae382eadb0513979bf077ba236ea88f` and `4051dbf28a27f37d5953083ad62512cc80ce152c`. Created with `--no-ff`; no conflict, squash, rebase or main merge.
- Verified application/test/CI checkpoint: `5c6b019ce02cc5bf997eb31e241660786ea32022`. Subsequent report/evidence files are confined to this verification directory.
- Shell push lacked HTTPS credentials. Publication used the connected GitHub Git-data API, preserving the exact local tree and ordered merge parents; each published commit was fetched back and checked.

This report's enclosing commit and its exact-head CI run are verified after publication and supplied in the final reply. A commit cannot contain its own SHA or the outcome of a workflow that starts after it is created. The final report commit keeps the same application, tests and CI code as the verified checkpoint above.

**Lock design and atomic recovery**

`server/src/backupRetentionLock.js:59` acquires `BEGIN EXCLUSIVE` on a dedicated SQLite lock database through the existing better-sqlite3 dependency, with `timeout:0`. Contention becomes `OFFSITE_BUSY` immediately. The transaction stays open for the entire protected callback; release rolls back and closes the handle. The operating system releases the lock when the process dies. Current holders do not depend on PIDs, process birth times or an unlink operation.

The shared volume mutex is `<volume>/backups/.tenant-erasure.lock.sqlite`. Daily and continuous workers use their respective `<backupPath>/.offsite/run.lock.sqlite` and `<backupPath>/.offsite-continuous/run.lock.sqlite` (`offsiteBackups.js:102`, `continuousOffsite.js:116`). These persistent mutex files are not unlinked or replaced during acquisition, recovery or release.

Legacy PID JSON files remain upgrade evidence only. Their stale check, last re-read and removal now occur **inside the already-held SQLite transaction** (`backupRetentionLock.js:69`). This fences that old boundary: a second repaired worker cannot recover or acquire the same mutex between the read and unlink. A known live or ambiguous legacy holder still fails closed. Recovery of current holders is the atomic OS/SQLite lock operation; there is no application-level stale-holder deletion. This also handles a restarted container whose new server is PID 1.

The AsyncLocalStorage map at `backupRetentionLock.js:88` allows nested sync/async acquisitions within the same live operation. Its active flag is cleared before release, so a retained async context cannot reuse a released acquisition. The existing volume-wide restore/erasure exclusion remains.

Two exact SQL exceptions were added at `server/src/ownerQueryExceptions.js:4`: `BEGIN EXCLUSIVE` and `ROLLBACK`, both category **admin**, reason: an administrative mutex transaction on a dedicated empty database containing no tenant rows. The scanner and its assertions are unchanged.

**Auditor reproductions: red on the base, green after repair**

Expectations were written first in [EXPECTED.md](../lock-recovery-race-20261011/EXPECTED.md). The production lock and ledger functions are used directly. Only synthetic files, child processes and filesystem barriers are involved.

| Test in `test/lockRecoveryRace20261011.spec.mjs` | Observed on the base | Expected / observed after repair |
|---|---|---|
| `two child recoverers never enter protected callbacks together` | `true !== false`: both children enter while the replacement holder remains alive | Only one enters; the contender receives `OFFSITE_BUSY`. PASS |
| `stale recovery cannot lose a replacement holder erasure ledger entry` | Actual ledger `[SYNTHETIC-A]`; expected `[SYNTHETIC-A, SYNTHETIC-B]` | Busy contender retries after release; final ledger contains A and B. PASS |
| `overlapping ledger publications preserve both owners without a retention lock` | Actual `[SYNTHETIC-A]`; B is overwritten | Independent receipts preserve both owners. PASS |

The child fixture pauses the recovering process **after its final ownership read and before unlink**, then starts the replacement process. The ledger variant also pauses replacement A immediately before publishing its older ledger, allows recovering B to record B, then resumes A. The same controlled schedule runs after the repair; the SQLite fence prevents the replacement from entering while recovery owns the transaction.

Before: **3 total / 0 passed / 3 failed / 0 skipped**, [base-before.tap](../lock-recovery-race-20261011/base-before.tap). First repaired run including the six unchanged legacy lock cases: **9/9**, [first-after.tap](../lock-recovery-race-20261011/first-after.tap). Expanded new regression file: **9/9**, [final-race.tap](../lock-recovery-race-20261011/final-race.tap), also independently confirmed locally and hosted below.

Additional new cases cover immutable migration, interrupted migration, invalid legacy entries, SIGKILL and stable mutex inode, nested acquisition and exception release, and eight independent processes concurrently migrating/appending without the retention mutex. The six existing dead-child, prior-instance PID 1, legacy PID 1 and live-exclusion tests are unchanged and pass.

**Ledger and migration**

`server/src/offsiteHistory.js:81` replaces shared `owners.json` rewrites with immutable per-owner receipts in `<backupPath>/.retention/erased-owners/<sha256(ownerId)>.json`. Each contains only version, ownerId and erasure timestamp. A complete, fsynced temporary file is atomically published with `linkSync`, which cannot replace an existing receipt. Different owners write different files. Same-owner publication is first-writer-wins and validates the existing receipt; acknowledged entries are never overwritten. Receipt and parent directories are fsynced.

Existing `<backupPath>/.retention/owners.json` is validated and imported idempotently. It remains unchanged as recovery evidence; no entry is removed during migration. A crash or competing migration can only add complete receipts, and a retry imports every old entry again. Invalid legacy content fails closed. Tests verify old timestamps stay immutable, interrupted imports resume, and all eight concurrent writers plus the legacy owner survive without any outer retention lock.

**Query inventory and route hashes**

[Inventory](inventory.json): **291 entries; 0 unlisted; 0 unused exceptions; 0 duplicate exceptions; 0 forbidden extractions; 0 route-source mismatches**. No scanner, route matrix, middleware inventory, role or selector was weakened.

Only route-bearing `server/src/offsiteBackups.js` changed. Its inventory SHA-256 changed from `06cbc06715c04f06aa4a10eed8d551fdf3fb1d59dd286df9648bbd9e282f59de` to `1d670cc60a8463c59e865d935482e79d9a87233ff6e5452256f79ac4e76ee75d`. Reviewed: the daily worker now acquires/releases the SQLite mutex; `GET /api/admin/backups/offsite`, `requireAuth(['admin'])`, `no-store`, its payload and its 200/503 pending-erasure predicate are unchanged. [Review note](../lock-recovery-race-20261011/ROUTE_REVIEW.md). No other route hash changed.

**Local commands and counts**

Node **22.23.3**, nine available CPUs, writable synthetic `TMPDIR`; the completed final local gates run sequentially. Fresh `npm ci` installed **328 packages**. [Pinned environment](pinned-environment.json) records zero installed-version mismatches. Playwright 1.56.0 is isolated outside the dependency tree with links for test resolution. Chromium was downloaded but cannot launch in this workspace; the [launch log](chromium-launch.log) reports `Target page, context or browser has been closed`. Browser assertions are not counted as locally passed.

| Command | Total | Passed | Failed | Skipped | Result |
|---|---:|---:|---:|---:|---|
| `npm run build` | — | — | — | — | Exit 0; owner app and widget |
| `npm test` | 4,942 | 4,882 | 60 | 0 | All 60 failures are Chromium startup; **0 non-browser failures** |
| `npm run test:quote` | 4,211 | 4,151 | 60 | 0 | All 60 failures are Chromium startup; **0 non-browser failures** |

Zero cancellations/TODOs in both completed gates. No catalog timing failure occurred, so no timing exception or rerun was used. [Exact summaries and all failed browser test names](local-summary.json); [sequential command results](sequential-results.json). Tracked `client/dist` was restored before committing.

Earlier attempts are retained, not concealed: the first focused run before building had 147/151 passes and four missing-production-bundle failures; after building the same focused selection passed **151/151**. A local Playwright install with the lockfile disabled changed installed packages; its full run was **4,942 total / 4,881 passed / 61 failed / 0 skipped**, including the SIGKILL exclusion assertion, while quote was **4,211 / 4,151 / 60 / 0**. Those runs are not pinned-dependency release evidence. Fresh `npm ci` restored every locked version, and the unchanged lock test passed **9/9**, then passed in the completed sequential full gate and hosted CI. An intermediate parallel retry produced no complete full summary; its quote run stalled during HTTP fixture teardown and was interrupted (exit 130). Both gates were then repeated sequentially to completion, with the results above. No test assertion or application source was changed to clear these attempts.

Every following file ran in its own process, locally and hosted, using:

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap FILE
```

| FILE | Local passed/total | Hosted passed/total | Failed | Skipped |
|---|---:|---:|---:|---:|
| `test/lockRecoveryRace20261011.spec.mjs` | 9/9 | 9/9 | 0 | 0 |
| `test/retentionHardeningHealth20261011.spec.mjs` | 3/3 | 3/3 | 0 | 0 |
| `test/retentionHardeningLocks20261011.spec.mjs` | 6/6 | 6/6 | 0 | 0 |
| `test/retentionHardeningSecrets20261011.spec.mjs` | 8/8 | 8/8 | 0 | 0 |
| `test/retentionHardeningVersions20261011.spec.mjs` | 9/9 | 9/9 | 0 | 0 |
| `test/day90Backups20261011.spec.mjs` | 4/4 | 4/4 | 0 | 0 |
| `test/day90Cancellation20261011.spec.mjs` | 4/4 | 4/4 | 0 | 0 |
| `test/day90Guarantees20261011.spec.mjs` | 10/10 | 10/10 | 0 | 0 |
| `test/day90Providers20261011.spec.mjs` | 12/12 | 12/12 | 0 | 0 |
| `test/tenantRetention20261010.spec.mjs` | 13/13 | 13/13 | 0 | 0 |
| `test/continuousOffsite20261007.spec.mjs` | 16/16 | 16/16 | 0 | 0 |
| `test/backups.spec.mjs` | 12/12 | 12/12 | 0 | 0 |
| `test/offsiteBackups20261007.spec.mjs` | 23/23 | 23/23 | 0 | 0 |
| `test/backupRestoreRehearsal.spec.mjs` | 9/9 | 9/9 | 0 | 0 |
| `test/ownerQueryCoverage20261009.spec.mjs` | 88/88 | 88/88 | 0 | 0 |
| `test/tenantIsolationRoutes.spec.mjs` | 264/264 | 264/264 | 0 | 0 |

These are **16 independent files / 490 tests**, all passed, with zero cancelled/TODO results. Their counts overlap the broad suites and must not be added to them. [Local standalone results](standalone-results.json), with one TAP log per file in [standalone/](standalone/).

**Hosted CI**

Workflow **CI**, [run 38165293833](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38165293833), source `5c6b019ce02cc5bf997eb31e241660786ea32022`: workflow **failure** because Docker cleanup failed. Test job **114546490121: success**.

| Hosted command | Total | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Dedicated owner-alert/dashboard browser tests | 9 | 9 | 0 | 0 |
| `npm run test:quote` | 4,225 | 4,225 | 0 | 0 |
| `npm test` | 4,956 | 4,956 | 0 | 0 |

Build, strict failure checker and dependency audit also pass. Zero cancellations/TODOs. All nine new lock-race test names appear as **passing twice**, in the full suite and the independent file run (18 passing lines), including SIGKILL recovery. The workflow's required-name checker also passes. [Retrieved counts and passing lines](hosted-checkpoint.json). Hosted Chromium supplies the browser evidence missing locally; successful browser setup registers additional nested assertions, explaining the different local/hosted totals.

The final report commit's own workflow result and counts are checked after the push and supplied in the final reply; no checkpoint result is represented as that later exact-head result.

**Docker: FAIL — no tag**

Local Docker is unavailable. Hosted job **114546489847** builds the image successfully and passes the voice-enabled, network-disabled smoke. `node verification/railway/docker-smoke.mjs otc-receptionist:synthetic` prints all four successful smoke assertions, then exits **1**:

```text
Error: EACCES: permission denied, scandir '/tmp/otc-docker-proof-m9jrb1/volume/backups'
Process completed with exit code 1.
```

[Retrieved Docker excerpt](checkpoint-docker.log). `verification/railway/docker-smoke.mjs:97` cleans `/cleanup/app` and `/cleanup/restores` in its temporary root container but omits `/cleanup/backups`. The permanent private SQLite mutex leaves that directory nonempty; the host runner's recursive cleanup at line 98 cannot traverse it. This is a smoke-harness cleanup failure after the assertions, but still a failed required check. It is not waived as a pass.

The smallest follow-up would include `/cleanup/backups` in the existing synthetic root-container cleanup, retaining every smoke assertion and production permission, then rerun the required gates. That change is **not applied** under the stop-on-failed-check instruction. `RELEASE_GATE.json` is deliberately absent; no annotated tag is requested or created. Final `git ls-remote` checks for the branch and both tag refs are supplied after publication.

**Saved evidence and boundaries**

This report, expectations, source/test changes, baseline failures, focused successes, inventory, standalone TAP logs and compact local/hosted evidence are saved on GitHub. Large raw local full/quote logs remain local at the paths and SHA-256 values recorded in `local-summary.json`; they are not represented as committed artifacts. The final reply distinguishes the fetched-back local HEAD from the remote branch SHA and confirms tag absence.

No specs, public website pages or quote arithmetic changed. No subagents, main merge, deployment, Railway changes, real provider accounts, real calls/emails/storage operations or text messages were used. All application data and providers were synthetic.
