CHECKPOINT PASSED — the product repair is verified; final release is gated on this report commit’s own successful CI and annotated tag.

# Release candidate j — cleanup and lock-database follow-up

## Pinned input and changes

Before work, `git ls-remote` confirmed candidate j at
`001b85dba56770549526beff9bc7b40a36a580c6`, exactly as requested, and no
`rc-20261011j` tag. The repaired source checkpoint is now confirmed locally
and on GitHub at **`952f32f68c34b2ebd06653340831c7ebb85ed8b4`**.

1. **Harness cleanup:** `verification/railway/docker-smoke.mjs:97` adds only
   `/cleanup/backups` to the existing temporary root-container cleanup list.
   Every original assertion is unchanged. The host runner cannot traverse the
   application's private 0700 backups directory once it contains the permanent
   0600 mutex. Cleanup now removes that synthetic directory from the same
   existing cleanup container before removing the host temporary tree.
2. **Product fix found by the additional proof:** `server/src/backups.js:26`
   now calls `removeStaleSnapshotOwner`; the helper at
   `server/src/backupRetentionLock.js:87` inspects the snapshot ownership marker
   under the existing volume-wide SQLite lock, without making another lock
   database inside the snapshot directory.

The harness cleanup failure was not a production permission defect. However,
**the additional concurrent-snapshot test found a real product issue**, fixed
above. Only these two application files changed. Dockerfile, dependencies,
client, specs, public pages and quote arithmetic are unchanged.
[Exact change proof](product-fix-change-proof.json).

## Product defect: reproduction, root cause and fix

The new child-process test pauses a real snapshot writer after the SQLite
copy finishes, before publication. Another process runs production staging
cleanup. Cleanup correctly refuses the live writer with `OFFSITE_BUSY`, then
the writer resumes and publishes. Expected: only manifest, application SQLite
and price books in the bundle. Before repair: the recursive inventory contains
an extra **`.snapshot-owner.json.sqlite`**. The valid reproduction is
**1 total / 0 passed / 1 failed / 0 skipped** on unchanged candidate-j product
source. [Failing TAP](live-staging-base.tap).

Root cause: staging cleanup used the generic `removeStaleProcessLock` API on
`.snapshot-owner.json`. Since candidate j, that API creates a persistent SQLite
mutex beside its argument. It created the auxiliary database before noticing
that the snapshot owner was still alive; normal publication removed only the
JSON marker and left the SQLite file in the bundle. The archive manifest did
not include that file, so uploads already excluded it, but the local snapshot
inventory violated the requirement.

The marker is immutable ownership evidence for a uniquely named partial
snapshot, not a worker mutex. The repair runs its existing stale-owner check
inside `withBackupRetentionLockSync`, using the same volume-wide SQLite fence
already held by staging cleanup. No per-marker database is created. Live
owners still cause `OFFSITE_BUSY`; dead-owner cleanup still works. Primary
retention, daily and continuous mutex databases stay permanent and their
acquisition/recovery logic is unchanged. No unfenced stale-lock deletion or
new PID-based mutex authority is introduced.

After repair, the new six-case file passes **6/6** independently, and the
focused lock/secret/scanner selection passes **117/117**, zero failed, skipped,
cancelled or TODO. [Six-case TAP](product-fix-backup.tap),
[focused TAP](product-fix-focused.tap). The new interleaving
asserts the entire published directory inventory, not only the manifest.

## Each requested item 2 proof

Pre-execution oracles are in [FOLLOWUP_EXPECTED.md](FOLLOWUP_EXPECTED.md).

| Requirement | Evidence location | Result on repaired source |
|---|---|---|
| Restore CLI uses lock with production user and permissions | `verification/railway/lock-database-smoke.mjs:67` | PASS: actual CLI fails while mutex held, creates no target; succeeds after release under the unchanged image user. |
| Normal restart uses the existing lock | `verification/railway/lock-database-smoke.mjs:65` | PASS: same-container restart acquires/releases the existing mutex; child is excluded; inode and permissions preserved. |
| Fresh-container redeploy uses the existing lock | `verification/railway/lock-database-smoke.mjs:66` | PASS: replacement container on the synthetic volume uses the same inode. Restored-root startup also passes at line 76. |
| Backup listing excludes mutex databases | `test/lockDatabaseBackup20261011.spec.mjs:70` | PASS: three mutexes alone list zero backups; one real snapshot lists exactly one bundle. |
| Pruning never treats mutexes as backups | `test/lockDatabaseBackup20261011.spec.mjs:78` | PASS: expired snapshot removed, latest retained; all three mutexes with epoch mtimes retain inode, bytes, ownership, mode and usability. |
| Snapshot creation excludes mutex databases | `test/lockDatabaseBackup20261011.spec.mjs:91` and `:96` | PASS after product fix: manifest and full recursive directory inventories contain only application SQLite, books and manifest, including the live-cleanup interleaving. |
| Off-site uploads exclude mutexes | `test/lockDatabaseBackup20261011.spec.mjs:111` | PASS: real encryption/S3 client against loopback fake S3; all PUT keys checked; both daily and continuous archives decrypted and completely inventoried. Two archives and two receipts only. |
| Day-90 erasure correctly handles mutexes | `test/lockDatabaseBackup20261011.spec.mjs:117` | PASS: actual lifecycle erases A locally, from two local bundles, and both remote archives; billing evidence and B survive; all mutexes retain inode/bytes/0600 mode and exclusive usability. |

The separate Docker proof uses the actual image's default UID/GID **0**,
matching server UID, with no `--user` override or relaxed permission. The
retention file stays **0600**, parent directory **0700**, and the same inode
through initial startup, restart, fresh-container redeploy, actual restore and
restored-root startup. Each probe excludes an independent child with
`OFFSITE_BUSY`. Containers have networking disabled. This demonstrates the
production Docker configuration, not an arbitrary different user or real
Railway deployment. [Repaired checkpoint Docker proof](product-checkpoint-docker.json).

## Local commands and counts

Node **22.23.3**, nine available CPUs. `npm run build` passes; generated
`client/dist` is restored from git before committing. Docker is unavailable
locally; the Docker evidence is hosted. Local broad-suite Chromium limitations
from the original task remain in [PRE_FOLLOWUP_REPORT.md](PRE_FOLLOWUP_REPORT.md);
those are not represented as new broad local runs here. Hosted CI runs the
complete browser/full/quote gates.

Focused command:

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/lockDatabaseBackup20261011.spec.mjs test/lockRecoveryRace20261011.spec.mjs test/retentionHardeningLocks20261011.spec.mjs test/retentionHardeningSecrets20261011.spec.mjs test/ownerQueryCoverage20261009.spec.mjs
```

**117 total / 117 passed / 0 failed / 0 skipped**, zero cancelled/TODO.
Every file below also ran independently with:

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap FILE
```

| File | Local passed/total | Hosted passed/total | Failed | Skipped |
|---|---:|---:|---:|---:|
| `test/lockDatabaseBackup20261011.spec.mjs` | 6/6 | 6/6 | 0 | 0 |
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

**17 files / 496 tests, all passed locally and hosted**, zero failed/skipped/cancelled/TODO.
[Commands, exact counts and local TAP hashes](product-fix-standalone.json).
Counts overlap and are not added together.

Two fixture errors are preserved separately from the valid product failure:
first five-case run **4/5** assumed continuous uploads retained their local
staging copy; the fixture now explicitly seeds one without weakening the
inventory assertion ([initial TAP](followup-backup-initial.tap)). The first
IPC assertion for the new child test saw an extra undefined Node callback
argument; it was corrected to compare the message payload before producing
the valid product reproduction ([fixture TAP](live-staging-fixture-initial.tap)).

## Inventory and original merge

The unchanged scanner reports **291 entries; zero unlisted queries, unused
exceptions, duplicate exceptions or forbidden extractions**. Route-source
hashes have zero mismatches. No route-bearing file changed and no hash or
exception was updated. [Inventory](product-fix-inventory.json).

Original merge `06726a1fb4f3c13b82140f3d16f4a0db0edd9a52` remains, with ordered
parents `a7effaf39ae382eadb0513979bf077ba236ea88f` and
`4051dbf28a27f37d5953083ad62512cc80ce152c`. No new merge, squash, rebase or
main change. Original OS-lock and per-owner ledger migration/reproduction
evidence is preserved in [PRE_FOLLOWUP_REPORT.md](PRE_FOLLOWUP_REPORT.md).

## Hosted verification and publication

Repaired checkpoint workflow **CI**, [run 38178045098](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38178045098),
source `952f32f68c34b2ebd06653340831c7ebb85ed8b4`:

- `voice-docker-startup` (114584506534): **success**. Production image, existing
  voice smoke, original Railway smoke including cleanup, and new lock-database
  production-user proof all pass.
- `test` (114584506659): **success**. Cold install, Chromium launch, build,
  browser/quote/full/standalone tests, required-name checker and audit pass.
- `tag-candidate-j` (114587350718): **success**, checkpoint-only exit without
  a release marker or tag.
- `tag-candidate-h` (114587352353): **skipped**, other-branch condition.
- `tag-candidate-i` (114587352488): **skipped**, other-branch condition.

Workflow conclusion: **success**. Every applicable candidate-j job succeeded.

| Hosted command | Total | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Dedicated owner-alert/dashboard browser tests | 9 | 9 | 0 | 0 |
| `npm run test:quote` | 4,231 | 4,231 | 0 | 0 |
| `npm test` | 4,962 | 4,962 | 0 | 0 |
| 17 independent standalone files | 496 | 496 | 0 | 0 |

All summaries have zero cancelled/TODO results. No catalog timing failure or
rerun occurred. Counts overlap and are never added together. Each of the six
backup test names passes in quote, full and standalone gates (18 lines), and
all nine lock-race names pass in full and standalone gates (18 lines).
[Retrieved counts, job conclusions and passing names](product-checkpoint-ci.json).

The first harness-only checkpoint `1c0b772f3f84b0286ee37cf15d51bbc0a2b70aef`
passed [CI 38175997495](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38175997495)
with quote 4,230/4,230, full 4,961/4,961, dedicated browser 9/9 and standalone
495/495. It did not include the live-cleanup interleaving. Its initial conclusion
of no product defect is superseded by the valid reproduction and repair above.
[Historical harness report](HARNESS_CHECKPOINT_REPORT.md).

The prospective report commit `64ab13aa57e0996fbdff71bfb8bd24cc634421e4` and
[run 38177523648](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38177523648)
were superseded before tagging. Its release gate was withdrawn in the product
fix commit; its tag job's exact-branch-HEAD guard prevents tagging that old
commit after the branch advances. No tag is moved or recreated.

That superseded run finished with workflow **failure**: test and Docker jobs
passed, but `tag-candidate-j` (114586410888) correctly failed its exact-HEAD
guard after the branch advanced to the repair. The unrelated h/i jobs skipped.
`git ls-remote` confirmed the tag remained absent. This is a refused stale
release, not passing release evidence or a product-test failure.
[Superseded run counts and guard output](superseded-ci.json).

The repaired checkpoint has succeeded. This report-only final commit restores
`RELEASE_GATE.json`, bound to that verified source and zero local/inventory
failures. Its own complete CI must pass before tagging. The existing
one-shot tag job depends on test and Docker success, verifies exact branch HEAD
and report-only ancestry, and refuses an existing tag. The final reply records
the actual final SHA, CI run/jobs/counts, and both annotated-tag and peeled
`git ls-remote` lines. A report cannot contain its own future commit SHA or
workflow outcome; those are verified after its publication.

Report, expectations, regressions, valid red reproduction, focused passing TAP,
compact hosted proofs, local counts/hashes and inventory are committed. Large
local standalone logs remain at the paths recorded in the JSON evidence and
are not described as uploaded artifacts. Connected GitHub Git-data publication
preserves the exact local tree; published commits are fetched back and checked.

All data and providers are synthetic. No deployments, real Railway changes,
provider accounts, real storage accounts, messages or calls. No subagents,
public pages, specs or quote arithmetic changed.
