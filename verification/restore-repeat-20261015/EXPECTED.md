# Restore repeat — expectations written before execution

Application commit: `019ddba0886c8a338db4583f4f069f8751581764` (`rc-20261014n`, candidate n).

This is a verification-only baseline. No application, test, helper, dependency, specification, wording, or existing workflow byte may change.

## Exact command

Every iteration in both jobs must execute this unchanged child command:

```text
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/backupRestoreRehearsal.spec.mjs
```

Expected executed-source SHA-256 values:

- `test/backupRestoreRehearsal.spec.mjs`: `a3be06ce0499d88b8cb3798ec28dcd7df1ceb21debf87a1af85a40323e1309e0`
- `test/helpers/backupRestoreProcess.mjs`: `f2696cf4ee6ea4aa1ac6fe3d364f8d9f88252a66f69efc659aed436f5b020f2f`

## Per-iteration expectations

Every one of the 200 iterations must produce:

| Field | Expected |
|---|---:|
| tests | 9 |
| pass | 9 |
| fail | 0 |
| cancelled | 0 |
| skipped | 0 |
| todo | 0 |
| exit code | 0 |
| signal | none/null |

Each hosted iteration must start with its own new, empty `TMPDIR`. Each Docker iteration must start with its own new, empty Docker named volume mounted at `/data`, with `TMPDIR=/data`.

## Aggregate expectations

| Job | Iterations passed | Iterations failed | Test outcomes |
|---|---:|---:|---:|
| Hosted Node 22 runner | 100 | 0 | 900/900 pass |
| `node:22-bookworm-slim` Docker | 100 | 0 | 900/900 pass |

Both jobs must complete on their first workflow attempt without retry or rerun. There must be no infrastructure failure.

For each job, every tracked application byte must match the detached candidate-n checkout before installation, after `npm run build`, and after all 100 iterations. The two executed source hashes above must remain unchanged at every checkpoint.

Any deviation is a failed verification result and must be reported rather than retried. All 100 iterations still run after an individual test failure; an infrastructure failure stops the affected job.
