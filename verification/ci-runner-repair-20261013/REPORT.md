# CI-runner repair: local validation passed; exact-SHA hosted CI pending at authoring

Branch: `codex/ci-runner-repair-20261013`.
Pinned base: `rc-20261012l`; annotated object
`a8fd712734f334f4edc2aab24cc5797d90e9ea40`; peeled commit
`d38781b35d126f21fed6074844e07d4e9de7c944`.
`starting-refs.stdout.log` preserves the matching remote tag and absent repair
branch. The fresh checkout was detached at the pinned commit before creating
the branch. The restore-verification branch was not integrated or rerun.

## Reproduction before repair

The actual tagged wrapper and checker were copied byte-for-byte into isolated
synthetic subprocess fixtures. The wrapper's spawn boundary launches one real
Node child instead of the repository suite; its checker still runs as a real
subprocess. Every fixture records stdout, stderr, input TAP, executed child and
preload sources, selected arguments, exit status and signal. Temporary fixture
roots are removed after capture; no database or provider fixtures are involved.

| Case | Tagged behavior | Repaired behavior |
|---|---|---|
| Complete one-test passing TAP | checker 0 | checker 0 |
| TAP ending immediately after `# tests 1` | checker **0, incorrect** | checker 1; missing counts named |
| No summary | checker 1 | checker 1 |
| Real child emits complete passing TAP, exits 7 | wrapper **0, incorrect** | wrapper **7**; child failure retained |

`baseline-confirmed.stdout.log`: **4 tests, 2 pass, 2 fail**, exit 1. The failures
are the two regression assertions rejecting the incorrect successes, not
expected-failure exemptions. The baseline entry-point sources and regression
source are retained under `baseline-source/`; each subprocess's original evidence
is under `baseline-confirmed-fixtures/`.

The first `baseline.stdout.log` is also preserved: **4 tests, 2 pass, 2 fail**.
Its wrapper fixture additionally hit an over-strict equality assertion because
the wrapper correctly combines stderr with stdout, and this environment emitted
an experimental proxy warning before the complete TAP. Its recorded wrapper
status was still 0. Before editing either entry point, the new test was corrected
to require the complete TAP within the combined output, then the corrected
baseline exposed the intended exit-status assertion. This was a diagnosed test
fixture correction, not a retry to hide a failure. Both runs and both initial
regression sources remain available.

The original candidate's hosted CI contained complete passing summaries. These
synthetic reproductions establish runner weaknesses; they do **not** establish
that the original candidate's hosted run falsely passed.

## Changes

- `.github/scripts/check-test-results.mjs:7`: requires exactly one of every
  final Node TAP count (`tests`, `suites`, `pass`, `fail`, `cancelled`, `skipped`,
  `todo`). Counts must be nonnegative safe decimal integers. Missing, malformed,
  duplicate or contradictory counts fail. A completed summary followed by more
  test output fails. Tests must be positive, outcome totals consistent, passes
  equal tests, and failures/cancellations/skips/TODOs zero. Actual failed TAP
  entries also fail even if summary counts claim success. Existing known-failure
  notices remain diagnostic only; the exemption file is unchanged.
- `scripts/test-full.mjs:34`: waits for the TAP output to open before launching
  tests, observes stream open/write/close errors, and waits for stream completion
  before checking it. Child spawn failures, nonzero exits and termination signals
  cannot be overridden by a successful checker. Checker errors, signals and
  unsuccessful exits also fail. Original nonzero child codes take precedence;
  available TAP and useful checker diagnostics remain visible. An output-file
  error terminates a still-running child and prevents success.
- `test/ciRunnerRepair20261013.spec.mjs`: **47** subprocess regressions, including
  complete and CRLF controls, each missing count, malformed values, inconsistent
  totals, duplicate/stale summaries, known-failure non-exemption, failed child
  after passing TAP, signal/spawn errors, real stream open/write/close failure
  boundaries, checker failures and child-error precedence.
- `test/helpers/ciRunnerRepairFixture20261013.mjs`: narrow isolated fixtures
  copying the actual wrapper/checker and substituting only synthetic children or
  failing I/O boundaries. Never recursively starts the repository suite.
- `verification/ci-runner-repair-20261013/`: expectations, original baseline and
  repaired evidence, exact commands/runtime, source snapshots and hash inventory.

Test selection, `--test-concurrency=1`, module-mock/preload flags and adjacent
`'--test', '--test-reporter=tap'` arguments are preserved. The existing scheduling
and source-contract assertions pass without edits. No existing tests were edited.
No workflow, package, lockfile, known-failure, application, server, client source,
quote engine, restore-test, spec, public-page or earlier-evidence changes. The
build-generated tracked `client/dist/index.html` was restored; its generated diff
is recorded separately. The clone is independent and no unrelated work was
changed. `AGENTS.md`, `specs/BUILD_STATUS.md` and the relevant zero-failure,
TAP-format and sequential-runner requirements were read; no specs were edited.

## Runtime and validation

**Node v22.23.3; npm 11.9.0; Linux x64.** `runtime.txt` and each execution record
retain the runtime and selected Node PATH prefix. `process.execPath` is reported
as `node` by this environment; the explicit PATH chooses the existing Node 22
binary. The dependency install completed before all test executions.

```sh
export PATH=/workspace/scratch/5228524b6f21/restore-recheck-runtime/toolchain/node_modules/node/bin:$PATH
export TMPDIR=/workspace/scratch/5228524b6f21/ci-runner-runtime/tmp
npm ci
npm run build
node --test --test-reporter=tap test/ciRunnerRepair20261013.spec.mjs
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/ciRunnerRepair20261013.spec.mjs test/testFullScheduling.spec.mjs test/ciSummary20261012.spec.mjs test/candidateLTagGate20261012.spec.mjs test/auditFixes20261003.spec.mjs
```

`capture.mjs` records each exact child command in `*.execution.json`, with separate
original stdout/stderr and status/signal. The baseline command ran once initially
and once after the specifically described fixture correction. The focused command
ran once after the repair; no unexplained failure was discarded.

| Local command/result | Tests | Pass | Fail | Exit |
|---|---:|---:|---:|---:|
| `npm ci` (328 packages) | — | — | — | 0 |
| `npm run build` (owner app and widget) | — | — | — | 0 |
| Initial baseline regression | 4 | 2 | 2 | 1 |
| Corrected baseline regression, unchanged runner/checker | 4 | 2 | 2 | 1 |
| Focused repair and existing regressions | 109 | 109 | 0 | 0 |

Focused breakdown: **47** new runner checks; **30** existing tag/manifest checks;
**3** existing CI-summary checks; **1** existing scheduling check; **28** existing
audit/source-contract checks. All have zero cancelled/skipped/TODO results. The
baseline runs also have zero cancelled/skipped/TODO results. All outer execution
signals are null; signal fixtures intentionally terminate their synthetic child
or checker with SIGTERM and the wrapper correctly exits nonzero.

The unchanged tag validator rejects missing/failed/skipped/cancelled/unavailable
or unfinished required evidence, wrong SHA/run/branch, missing report/marker,
changed manifests, advanced branches and incompatible existing tags. Its success
control also passes. These tests call validation functions with synthetic data;
**no remote test tags are created**.

Build warnings and runtime experimental/deprecation warnings are retained.
Local browser assertions, broad `npm test`, strict `npm run test:quote` and Docker
are **NOT RUN locally**. No Chromium installation or local launch was attempted;
no local browser success or crash is claimed. The isolated wrapper fixtures have
no Playwright package and preserve its prerequisite warning. This is not browser
evidence. Hosted CI is required for the broader and browser results below.

## Publication, CI and remaining limits

At report authoring, the repair is locally validated and publication/exact-SHA
hosted CI are **pending**. The final handoff must verify the published branch with
`git ls-remote`, fetch this report and all evidence back, verify their hashes, and
inspect the exact pushed commit's actual CI logs, including complete full/quote
summaries, browser results and job outcomes. An earlier commit's CI does not count.
No report-only follow-up commit is needed after successful final-SHA inspection.

Ordinary `codex/**` CI applies to this branch. Candidate-specific standalone/name
checks, Railway/lock-database Docker proofs and tag jobs are branch conditional;
the final handoff must distinguish their skips from executed ordinary checks.
Passing this repair branch does not qualify a release or waive independent audits.

**SHARE at authoring:** exact-SHA hosted validation is not yet complete. No local
repair regression remains failing. No observed application or quote-engine defect
is asserted by this CI-runner repair.

The checksum inventory covers every evidence file except the inventory files
and records the four changed/new implementation/test files separately. No
credentials, tokens or customer data are used in these synthetic fixtures.
No tags, main merge, deployment, Railway/provider changes, calls, email or SMS.
