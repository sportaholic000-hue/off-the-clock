NOT DONE — an additional concurrent snapshot check reproduced a product defect; release gate withdrawn pending repair verification.

# Release candidate j — cleanup and lock-database follow-up

**Additional product finding after the first checkpoint:** when staging cleanup
inspects a live child process's partial snapshot, `removeStaleProcessLock`
creates `.snapshot-owner.json.sqlite` in that staging directory before correctly
returning `OFFSITE_BUSY`. If the writer then publishes, that extra SQLite file
survives inside the finished bundle. The new controlled child-process regression
fails on unchanged product source, showing the unexpected file in the complete
inventory. [Reproduction](live-staging-base.tap).

The repair checks the immutable snapshot owner marker under the existing
volume-wide SQLite retention lock (`removeStaleSnapshotOwner`), without creating
a per-marker database inside the bundle. Worker and retention mutex acquisition
is unchanged. The six-case backup file and existing retention gates must pass
before a replacement release gate is committed. Earlier five-case checkpoint
results below are historical and do not include this new interleaving.

The pinned input `001b85dba56770549526beff9bc7b40a36a580c6` matched
`git ls-remote origin refs/heads/claude/release-candidate-20261011j` before work.
There was no `rc-20261011j` tag. The working checkpoint is confirmed on GitHub
as `1c0b772f3f84b0286ee37cf15d51bbc0a2b70aef`, with the same fetched-back local
file tree. Work stays on that candidate branch; no new merge is performed.

## Harness change and product result

`verification/railway/docker-smoke.mjs:97` adds **only** `/cleanup/backups` to
its existing temporary root-container cleanup list. Every original assertion
is byte-identical. The private persistent mutex makes the directory nonempty,
so the unprivileged host runner must let the existing cleanup container remove
it before removing the temporary host tree. Production never deletes its live
mutex as part of this repair.

**No product defect was found and no product fix was needed.** Application
source, Dockerfile, dependencies, specifications and public pages are unchanged
from the pinned candidate. [Exact change proof](followup-change-proof.json)
checks that one substitution reproduces the entire smoke diff and that these
production paths have no diff. The new Docker proof is separate, leaving the
original smoke's assertions untouched. [Pre-execution expectations](FOLLOWUP_EXPECTED.md).

## Each required proof

| Requirement | Test / assertion | Observed evidence |
|---|---|---|
| Restore CLI uses lock with production user/permissions | `verification/railway/lock-database-smoke.mjs:67` | Actual CLI returns 1 while held and creates no target; after release the same CLI returns the verified new restore root. UID/GID 0, matching the image's default user and server UID; 0600 file and 0700 parent. |
| Normal restart reopens/uses the same lock | `verification/railway/lock-database-smoke.mjs:65` | Same-container SIGTERM/restart succeeds. Existing mutex acquires; independent child gets `OFFSITE_BUSY`; inode and permissions unchanged. |
| Fresh-container redeploy reopens/uses the same lock | `verification/railway/lock-database-smoke.mjs:66` | New production container on the same synthetic volume acquires the existing mutex with the same identity, owner and permissions. Restored-root startup also passes at line 76. |
| Backup listing excludes lock databases | `test/lockDatabaseBackup20261011.spec.mjs:68` | Zero backups with only three mutexes present; one actual snapshot yields exactly one listed bundle. |
| Pruning never deletes a lock as a backup | `test/lockDatabaseBackup20261011.spec.mjs:76` | Expired snapshot removed, latest retained; mutex files with epoch mtimes retain inode, bytes, ownership, 0600 mode and exclusive usability. |
| Snapshot contains no lock or sidecar | `test/lockDatabaseBackup20261011.spec.mjs:89` | Complete manifest and recursive disk inventory equal application SQLite, two synthetic price books and manifest only. |
| Off-site upload contains no lock database | `test/lockDatabaseBackup20261011.spec.mjs:94` | Real encryption/S3 client against existing loopback fake S3: two archives and two receipts only. Every PUT key checked; both daily and continuous archives decrypted and their entire inventories checked. |
| Day-90 erasure handles lock databases correctly | `test/lockDatabaseBackup20261011.spec.mjs:100` | Actual lifecycle erases A locally and from two local bundles and both remote inventories, retains billing evidence, preserves B, and leaves all three mutexes byte/inode/mode-identical and usable. |

All five backup tests pass against unchanged production code. All production
permission/restart/restore assertions pass in hosted Docker job `114578396797`.
Its proof observes inode **4800825**, device **2049**, unchanged through all five
stages. Modes in JSON are decimal 384/448, equal to octal 0600/0700. Containers
have networking disabled. [Retrieved Docker proof](followup-checkpoint-docker.json).

The production image has no Dockerfile USER override and runs as root. This
proof uses that actual configuration without `--user`, chmod relaxation or a
privileged substitute for the runtime operations. The extra root cleanup
container handles only each proof's isolated bind-mounted temporary files.

## Local tests and initial fixture correction

Node **22.23.3**, nine available CPUs. `npm run build` passes; tracked
`client/dist` is restored. Docker is unavailable locally, so Docker results
come from GitHub Actions. No local Docker success is claimed.

The first new-test run was **5 total / 4 passed / 1 failed / 0 skipped**. The
fixture assumed a successful continuous upload retained its temporary local
snapshot, but `continuousOffsite.js:131` deliberately removes it. The fixture
now explicitly creates an additional retained continuous bundle before day-90
erasure. The assertion requiring at least two checked local bundles stays.
No application or existing assertion changed. [Initial TAP](followup-backup-initial.tap).
The corrected file passes **5/5**, zero failed/skipped/cancelled/TODO, then
passes again among the independently run files. [Corrected TAP](followup-backup.tap).

Each file below ran independently with:

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap FILE
```

| File | Local passed/total | Hosted passed/total | Failed | Skipped |
|---|---:|---:|---:|---:|
| `test/lockDatabaseBackup20261011.spec.mjs` | 5/5 | 5/5 | 0 | 0 |
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

**17 files / 495 tests, all passed locally and hosted**, zero failed/skipped/cancelled/TODO.
[Commands, counts and local log hashes](followup-standalone.json).
These counts overlap full-suite counts and are not added to them. The new
file is also explicitly in the candidate-j hosted standalone loop.

Local broad-suite browser limitations and the original lock-race baseline
failures are preserved in [the pre-follow-up report](PRE_FOLLOWUP_REPORT.md).
Those are historical results, not new broad local runs for this follow-up.
Hosted final-commit CI supplies the full and browser suite evidence.

## Inventory and unchanged merge

The unchanged owner-query scanner reports **291 entries, zero unlisted,
zero unused exceptions, zero duplicate exceptions and zero forbidden
extractions**. Route-source hashes have zero mismatches. No source route
changed, so no route hash or exception entry is added or updated.
[Current inventory](followup-inventory.json).

The original candidate-j merge remains
`06726a1fb4f3c13b82140f3d16f4a0db0edd9a52`, ordered parents
`a7effaf39ae382eadb0513979bf077ba236ea88f` and
`4051dbf28a27f37d5953083ad62512cc80ce152c`.
The OS-backed SQLite exclusive transaction and immutable per-owner ledger
receipts are unchanged. Their design, migration and red/green race evidence
remain in [the pre-follow-up report](PRE_FOLLOWUP_REPORT.md).

## Hosted CI and final publication gate

Checkpoint workflow **CI**, [run 38175997495](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38175997495),
head `1c0b772f3f84b0286ee37cf15d51bbc0a2b70aef`:

- `voice-docker-startup` (114578396797): **success**. Production build, existing
  voice smoke, original Railway smoke including cleanup, and separate lock
  database proof all succeed.
- `test` (114578397382): **success**. Cold install, Chromium launch, build,
  all test gates, required-name checker and production audit succeed.
- `tag-candidate-j` (114582503784): **success**, checkpoint-only exit with no
  gate marker and no tag created.
- `tag-candidate-h` (114582504191): **skipped**, other-branch condition.
- `tag-candidate-i` (114582504275): **skipped**, other-branch condition.

Workflow conclusion: **success**. Every applicable candidate-j job succeeded.

| Hosted command | Total | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Dedicated owner-alert/dashboard browser tests | 9 | 9 | 0 | 0 |
| `npm run test:quote` | 4,230 | 4,230 | 0 | 0 |
| `npm test` | 4,961 | 4,961 | 0 | 0 |
| Each of the 17 standalone files above | 495 | 495 | 0 | 0 |

Zero cancellations or TODOs in every summary. No catalog timing failure or
rerun occurred. Counts overlap and must not be added together. All five new
backup test names pass in quote, full and standalone runs (15 lines); all nine
lock-race names pass in full and standalone runs (18 lines). The required-name
checker also succeeds. [Retrieved exact counts and passing names](followup-checkpoint-ci.json).

`RELEASE_GATE.json` now records this successful checkpoint and zero inventory/
local non-browser failures. The final diff is confined to this verification
directory. The final report commit must be pushed and pass its own CI before the existing
one-shot `tag-candidate-j` job may create an annotated `rc-20261011j` tag. That
job depends on both required jobs, verifies branch HEAD, verified-source
ancestry and a report-only final diff, and refuses an existing tag. Nothing
moves, deletes or recreates a tag. Exact final SHA, run, job conclusions,
counts and tag/peeled refs are checked after publication and supplied in the
final reply; a report cannot contain its own future commit SHA and workflow
outcome.

## Evidence and boundaries

Report, expectations, test source, TAP from both new-file attempts, compact
hosted Docker evidence, local counts/hashes and inventory are committed. The
17 larger local standalone TAP logs remain at the paths in
`followup-standalone.json`; they are not represented as GitHub artifacts.
Published commits are fetched back and their trees compared. GitHub Git-data
publication preserves the exact local tree when shell HTTPS push credentials
are unavailable.

Synthetic data, local fake S3 and network-disabled Docker only. No deployments,
Railway changes, real provider accounts, real storage, messages or calls. No
subagents, main merge, specs/public-page changes or quote arithmetic changes.
