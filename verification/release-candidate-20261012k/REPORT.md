# Candidate k: backup admission coordination repair

Independent delayed-publication verification is PENDING. This change and its ordinary regression tests do not independently close the reported race. Release remains blocked until Astra and Sol each return clean reports for both audit scopes on the same final tagged commit.

## Starting point and boundaries

The annotated `rc-20261011j` tag was verified with `git ls-remote`. Its tag object is `6e563e6462caf2e5ce25332981077013ec16c065`; its peeled commit is the required `5783e7c0f1205c9e94a069a23fe019f1e7e29796`. Neither the repair branch `claude/release-candidate-20261012k` nor `rc-20261012k` existed when checked. The available workspace contained no usable previous checkout or unfinished source edits, so work began in a fresh clone at that exact commit.

Read `AGENTS.md`, `specs/BUILD_STATUS.md`, the relevant platform/billing retention specifications, `docs/OFFSITE_BACKUPS.md`, candidate-j verification documents, and the four locked owner-ruling/wording approval files requested by the owner. Current owner instructions govern this repair. No specifications, public website pages, owner wording, plan gates, quote arithmetic, Starter `calculateListedPrice`, or its “Quotes delivered” counter were changed. No coding subagents, live providers, deployment, Railway configuration changes, SMS, or separate delayed-publication harness were used.

## Defect and smallest production correction

Both backup streams checked retention availability in `run()` before acquiring their own worker mutex in `perform()`. Erasure holds the retention mutex, but its worker-availability probes release the worker mutex immediately. A worker that passed the earlier retention probe could therefore start after erasure's worker probe and read/publish an old pending upload while erasure proceeded.

The production correction adds one executable statement to each worker: `assertBackupRetentionIdle(deployment)` immediately inside the existing worker-mutex `try/finally`, before reading persistent retry state or using a pending artifact. The mutex already spans snapshot creation, upload, verification, completion-record publication, pruning, and final state persistence; that lifetime is preserved. The earlier fast probe remains.

Changed production locations:

- `server/src/offsiteBackups.js:102-107`: daily worker admission under its existing mutex.
- `server/src/continuousOffsite.js:116-121`: continuous worker admission under its existing mutex.

### Acquisition and release ordering

Call the volume retention/restore mutex R and a stream's worker mutex W.

1. A worker acquires W, probes R while retaining W, releases the probe of R, and retains W until the entire worker operation settles. The existing `finally` releases W on both success and failure.
2. Erasure acquires R, drains active in-process workers and snapshots, probes both stream mutexes, and retains R through cleanup and redacted-backup publication.
3. If the worker's protected admission succeeds first, W already exists when erasure checks workers. Erasure drains that work to settlement or returns `OFFSITE_BUSY` for a competing process before completing backup erasure.
4. If erasure acquires R first, a later worker may acquire W but cannot pass its protected admission probe. It returns `OFFSITE_BUSY` before state or provider use and releases W. This covers a worker that passed `run()`'s earlier probe.

The exclusion therefore persists across the operation through the two existing mutex lifetimes; correctness does not depend on repeating an unprotected availability check. There is no new lock database, lock-file replacement, or erasure-ledger format.

### Deadlock and recovery reasoning

SQLite mutex acquisition remains nonblocking (`timeout: 0`). Erasure may await an already-active worker while holding R, but a worker/snapshot encountering R returns `OFFSITE_BUSY` instead of waiting for it. That worker settles and releases W, allowing the drain to finish. Erasure's probes of another process's W also return immediately. The worker does not retain R across snapshot creation, avoiding a new conflict with snapshot admission. Existing same-process nested retention acquisition, restore locking, stale recovery, and shutdown paths remain in place.

Busy admission does not overwrite saved pending retry state. A later worker rereads it under W. The permanent SQLite mutex inode and per-owner erasure receipts are untouched. Existing erasure code still preserves other businesses and billing records, and completion/health still depend on the existing retention step barriers.

## Ordinary regression evidence

`test/backupCoordination20261012.spec.mjs` adds three contract checks for each stream:

- Retention acquired between the old fast probe and worker admission prevents provider calls, preserves pending state/ciphertext byte for byte, releases W, and allows the unchanged pending upload to retry after R is released.
- W excludes a competing worker through actual synthetic-store upload, verification, completion-record publication, and pruning; an erasure attempt cannot proceed through that active worker.
- Snapshot contention with erasure drain and shutdown settles without deadlock, completes eligible deletion, retains business B and billing evidence, reports healthy completion, and tolerates a second cleanup.

These use the existing synthetic fixture/store and real application mutex/archive code. They do not delay an HTTP publication body or implement the separate independent auditor harness.

The same six tests were first run against the unchanged candidate-j production code: **4 passed, 2 failed**, both late-admission checks failing with `Missing expected rejection.` After the two admission statements: **6 passed, 0 failed, 0 skipped/cancelled/TODO**. Exact TAP output is committed in `coordination-before.tap` and `coordination-after.tap`.

### Local commands and environment

Used supported Node **22.23.3**, with `NODE_OPTIONS` unset and no experimental SQLite-lifetime preload. Test files ran sequentially with affinity to four CPUs (`taskset -c 0-3`). Temporary files stayed in a writable synthetic workspace.

Initial plain `npm ci` failed because the environment returned HTTP 403 for the native prebuild and Node header download. Installation was completed by compiling the locked native dependency against the matching headers already shipped with the local Node 22 package:

```sh
npm_config_nodedir=<local Node 22.23.3 package directory> npm_config_build_from_source=true npm ci
npm run build
```

After the focused regressions, the requested clean `npm ci` and `npm run build` were run again in that order: both succeeded; `npm ci` installed 328 packages. The build produced only its existing chunk-size warning. No package manifest or lockfile changed.

Each of the following 19 files ran independently with:

```sh
taskset -c 0-3 node --experimental-test-module-mocks \
  --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap <file>
```

| File in `test/` | Passed | Failed |
| --- | ---: | ---: |
| backupCoordination20261012.spec.mjs | 6 | 0 |
| lockRecoveryRace20261011.spec.mjs | 9 | 0 |
| lockDatabaseBackup20261011.spec.mjs | 6 | 0 |
| day90Backups20261011.spec.mjs | 4 | 0 |
| day90Cancellation20261011.spec.mjs | 4 | 0 |
| day90Guarantees20261011.spec.mjs | 10 | 0 |
| day90Providers20261011.spec.mjs | 12 | 0 |
| retentionHardeningHealth20261011.spec.mjs | 3 | 0 |
| retentionHardeningLocks20261011.spec.mjs | 6 | 0 |
| retentionHardeningSecrets20261011.spec.mjs | 8 | 0 |
| retentionHardeningVersions20261011.spec.mjs | 9 | 0 |
| tenantRetention20261010.spec.mjs | 13 | 0 |
| continuousOffsite20261007.spec.mjs | 16 | 0 |
| backups.spec.mjs | 12 | 0 |
| offsiteBackups20261007.spec.mjs | 23 | 0 |
| backupRestoreRehearsal.spec.mjs | 9 | 0 |
| ownerQueryCoverage20261009.spec.mjs | 88 | 0 |
| ownerQueryReview20261009.spec.mjs | 9 | 0 |
| tenantIsolationRoutes.spec.mjs | 264 | 0 |
| **Total** | **511** | **0** |

All 19 commands exited 0 with zero skips, cancellations, or TODOs. These are overlapping focused executions, not additional unique tests to add to the full-suite count. `local-test-results.json` records commands and counts.

The two requested full-suite commands completed with the same result:

| Command | Registered tests | Passed | Failed | Skipped/cancelled/TODO | Exit |
| --- | ---: | ---: | ---: | --- | ---: |
| `taskset -c 0-3 npm test` | 4,954 | 4,894 | 60 | 0 / 0 / 0 | 1 |
| `taskset -c 0-3 npm run test` (separate completed run) | 4,954 | 4,894 | 60 | 0 / 0 / 0 | 1 |

All 60 failure entries in each completed run were verified to contain `browserType.launch: Executable doesn't exist`. Their browser assertions are NOT RUN locally, not passed. No non-browser test or large-catalog timing assertion failed. Both full runs include the six passing new coordination cases.

The initial combined runner's second invocation stopped producing output after top-level test 1351 and produced no final TAP summary. That incomplete attempt is not counted as completed. Its next file, `test/customerExplanation.spec.mjs`, passed independently with **24 passed, 0 failed/skipped/cancelled/TODO**, using the same four-CPU Node command above. The full `npm run test` command was then run separately to completion; its definitive counts are in the table. No code or runtime workaround was introduced for that interrupted attempt.

### Local limitations

Chromium browser assertions are **NOT RUN locally**. The installer received invalid/truncated downloads, recovered the normal Chromium archive on its fallback, then failed with `Unable to update lock within the stale threshold`. A direct launch failed because `chromium_headless_shell-1194/chrome-linux/headless_shell` did not exist. No Playwright locking workaround or SQLite preload was introduced. Browser prerequisite failures in the requested full-suite commands are reported as failures of those commands, never passes of browser assertions.

Docker, Railway-container smoke, and the production-user lock-database smoke are **NOT RUN locally** because Docker is unavailable. They remain required hosted checks with synthetic credentials and no provider network.

## Inventory and hosted validation safeguards

The sole route-source inventory change is the hash for `src/offsiteBackups.js`: `1d670cc60a8463c59e865d935482e79d9a87233ff6e5452256f79ac4e76ee75d` becomes `32de221b21f11149bac23639e2fb1419f6028e28ef1d21b82f275bfc092dc8c1`. All 26 source hashes matched on review. Route declarations, authorization, `routes.json`, owner-query scanning, and exception lists are unchanged. The focused owner-query and route suites passed.

`.github/workflows/ci.yml` retains all existing validation commands. Candidate-j lock/ledger/retention standalone regressions, the required lock-test-name guard, Docker/Railway smoke, and production-user lock proof also run on branch k. The workflow adds the six new standalone coordination tests and `check-required-test-names.mjs`, which requires all six passing names in the full-suite log. Browser installation/launch, dedicated browser tests, strict quote gate, full suite, and production dependency audit remain required.

Hosted evidence for the commit containing this report is necessarily obtained after publication. No earlier candidate's CI result is counted as evidence for this repair. The final delivery must report the exact remote SHA, its CI URL/results, and remote tag verification. At report authoring, those publication checks are pending.

The k tag job depends on both required jobs (`test` and `voice-docker-startup`) succeeding. It checks that this report exists and the remote branch still points to the tested SHA, refuses an existing k tag, then creates an annotated `rc-20261012k` at that exact SHA. No existing tag is moved. A new commit requires its own successful CI before tagging; a published tag is never retargeted.

Other changed verification files are this report, the six-name guard, the two before/after TAP logs, and the compact local results. Generated `client/dist` changes are restored before committing.

## Explicitly pending independent work

The separate independent delayed-publication verification was excluded from this implementation step and remains **PENDING**. Ordinary regression success, CI success, and a candidate tag are not independent closure of the reported race or release authorization. Astra and Sol must each audit both scopes on the same final tagged commit and return clean reports before release.
