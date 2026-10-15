# Candidate n restore-repeat baseline: rehearsals clean; strict build-byte invariant failed

## Decision summary

The earlier “price book reappeared” restore anomaly did **not** recur in this bounded baseline: all 200 independently isolated rehearsals passed, for 1,800/1,800 passing tests. There were no failed, cancelled, skipped, or TODO tests; no child process exited nonzero, received a signal, or timed out; and neither job reported an infrastructure failure.

The complete verification expectation is nevertheless **FAIL**, not PASS. Candidate n does not preserve all tracked application bytes across `npm run build`. Both strict job wrappers therefore exited 1 and the one workflow run concluded `failure`. This deviation was reported and was not retried or repaired.

This is verification evidence only. It does not change the application and does not decide candidate o.

## Immutable subject and one-shot workflow

- Repository: `sportaholic000-hue/off-the-clock`
- Branch: `codex/restore-repeat-20261015`
- Detached application commit: `019ddba0886c8a338db4583f4f069f8751581764`
- Tag/candidate: `rc-20261014n`, candidate n
- Dedicated run: [Restore repeat 20261015 #1, attempt 1](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38774419447)
- Trigger checkpoint: `be0e9cf970a0a17df821e111318fd75d7d9fbe06`
- Started: `2026-10-15T17:05:30Z`
- Completed: `2026-10-15T17:17:26Z`
- Run conclusion: `failure` solely because both strict wrappers detected the tracked-byte deviation
- Retry/rerun: none

The new branch did not exist when checked with `git ls-remote`. Expectations were committed and confirmed on GitHub at pending checkpoint `2beacdf68f1488549ae7ef903535c6d978a0d4cb` before activation. The pending push ran ordinary repository CI but did not run this marker-gated workflow. Adding `ACTIVATE` in the trigger checkpoint produced exactly one dedicated restore-repeat run. Ordinary repository CI also ran automatically on branch/ref pushes; it was not a repeat campaign or a retry.

## Exact command and executed sources

Every iteration executed:

```text
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/backupRestoreRehearsal.spec.mjs
```

The strict runners verified these hashes before build, after build, and after all iterations:

| Executed file | SHA-256 | All checkpoints |
|---|---|---|
| `test/backupRestoreRehearsal.spec.mjs` | `a3be06ce0499d88b8cb3798ec28dcd7df1ceb21debf87a1af85a40323e1309e0` | Match |
| `test/helpers/backupRestoreProcess.mjs` | `f2696cf4ee6ea4aa1ac6fe3d364f8d9f88252a66f69efc659aed436f5b020f2f` | Match |

## Expected versus actual

| Measure | Hosted expected | Hosted actual | Docker expected | Docker actual |
|---|---:|---:|---:|---:|
| Requested/completed iterations | 100/100 | 100/100 | 100/100 | 100/100 |
| Passed iterations | 100 | 100 | 100 | 100 |
| Failed iterations | 0 | 0 | 0 | 0 |
| Not-run iterations | 0 | 0 | 0 | 0 |
| Tests passed | 900/900 | 900/900 | 900/900 | 900/900 |
| Test fail / cancelled / skipped / TODO | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Child exit / signal / timeout | 0 / none / no | 0 / none / no in all 100 | 0 / none / no | 0 / none / no in all 100 |
| Unique fresh isolation targets | 100 | 100 `TMPDIR`s | 100 | 100 named volumes at `/data` |
| Infrastructure failure | none | none | none | none |
| Executed-source hashes unchanged | yes | yes | yes | yes |
| All tracked application bytes unchanged | yes | **no** | yes | **no** |
| Strict job conclusion | success | **failure** | success | **failure** |

The iteration records are complete, ordered exactly 1 through 100 in both jobs, and have 100 distinct hosted temporary paths and 100 distinct Docker volume names. `RESULTS.json` retains each iteration’s number, start/end timestamps, TAP totals, exit code, signal, timeout flag, status, and isolation target.

## Deviation: candidate n build changes tracked bytes

Both authoritative Node 22 result sets report:

- `sourceIntegrityPassed: false`
- `executedSourceHashesPassed: true`
- `infrastructureFailure: null`
- `overallStatus: FAIL`

The strict wrapper therefore returned exit 1 after all iterations had passed. This is why both jobs and the enclosing workflow are red. It is not a test failure, restore anomaly, signal, timeout, or runner outage.

A separate, non-authoritative local diagnostic used a clean archive of the same commit with Node 24/npm 11 and `npm ci --ignore-scripts`. It reproduced the build-output mechanism without changing the branch:

| Tracked path | Before build | Diagnostic after build |
|---|---|---|
| `client/dist/index.html` | 401 bytes, SHA-256 `b300a3c07711bf74c8742a87ef5e425834b972f64c3c29067a6bc5305daf3f1d` | 401 bytes, SHA-256 `65b3a5d7c603cd2767e536e12548344aa94f36b0c29fd224d256cb5195edfdc5` |
| `client/dist/assets/index-Cwi6Aiz2.css` | 53,473 bytes, SHA-256 `a79bbb1dff1691e45bcafb8746a05b7ec320ea5a38e7f6c5698bedb0339072cd` | missing after Vite cleaned/rebuilt `dist` |
| `client/dist/assets/index-DdcfYsVT.js` | 636,708 bytes, SHA-256 `30c046006597a93f674ea2c3f62668416871af48774e8e7f59e86f22e2d26080` | missing after Vite cleaned/rebuilt `dist` |

The authoritative before/after manifests from the actual Node 22 jobs remain in both run artifacts. The local probe is labelled diagnostic because it is not a substitute for those hosted manifests. No build output or application change is committed on this branch.

## Failure evidence

There were no failing iterations, so the conditional failure bundle was never needed: there is no failed TAP output, stderr, or post-failure TMPDIR/volume listing to retain. Both artifacts do retain all ordinary per-iteration TAP/stdout/stderr plus preparation records and source manifests.

| Job | Job ID | Artifact | Size | Artifact ZIP SHA-256 |
|---|---:|---|---:|---|
| Hosted Node 22 | `116558224254` | [restore-repeat-hosted-20261015-38774419447-1](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38774419447/artifacts/11993726787) | 470,635 bytes | `54f6c703837b77640260754d942ad9bf266b1c93e8bf929589ebbea0eacbeb2a` |
| Docker `node:22-bookworm-slim` | `116558223987` | [restore-repeat-docker-20261015-38774419447-1](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38774419447/artifacts/11994195226) | 618,412 bytes | `bf890d9111b0b0330ccb5cb5f09b6c0deb855dcb8c86fe0137db4d32d7d2f480` |

The artifacts expire on 2026-11-14 under the workflow’s 30-day retention setting.

## Scope and interpretation

Only `.github/workflows/restore-repeat-20261015.yml` and `verification/restore-repeat-20261015/` were added. No application, test, dependency, specification, wording, or existing workflow file changed. There was no merge, tag, deployment, Railway operation, SMS, live-data access, or contact with a real customer.

**Baseline interpretation:** the “price book reappeared” anomaly was not observed in 200/200 isolated rehearsals on candidate n. The repeat-test evidence is clean. The overall predeclared verification contract is still failed because the tracked build bytes were not identical. Candidate o must use the same workflow and expectations for the deciding comparison; this baseline does not predetermine that result.
