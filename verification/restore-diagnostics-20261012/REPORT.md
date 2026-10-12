# Backup/restore test diagnostics — 2026-10-12

Test-harness improvement completed and locally verified. The historical missing-book HTTP 200/503 discrepancy is **NOT REPRODUCED** in this task and remains unexplained. No production defect or quote-engine repair is claimed. Hosted CI for the commit containing this report is **PENDING at report authoring**; the final handoff must identify the exact pushed SHA and its observed CI status.

## Starting identity and boundaries

- Repository: `sportaholic000-hue/off-the-clock`.
- Required starting tag: `rc-20261012k`.
- Remote annotated tag object: `4959515817dc94dd81c393746845fc1ab68742cf`.
- Remote peeled commit and verified detached HEAD: `ead53fa174d577b280506b67573a29d6b0358237`.
- Branch: `codex/restore-diagnostics-20261012`, created from that detached commit. It was absent remotely and locally when checked; no existing branch was overwritten.
- Fresh clone: `/workspace/scratch/7877037ce74a/restore-diagnostics-20261012`.

Commands used to establish the starting point:

```sh
git clone https://github.com/sportaholic000-hue/off-the-clock.git restore-diagnostics-20261012
git ls-remote origin refs/tags/rc-20261012k 'refs/tags/rc-20261012k^{}' refs/heads/codex/restore-diagnostics-20261012
git checkout --detach 'refs/tags/rc-20261012k^{}'
git rev-parse HEAD
git branch --list codex/restore-diagnostics-20261012
git switch -c codex/restore-diagnostics-20261012
```

`starting-refs.txt` retains a repeat remote verification before publication. The starting refs agreed; no alternate commit was substituted.

Read `AGENTS.md`, `specs/BUILD_STATUS.md`, platform section 12.19, the backup/restore handwritten expectations, `docs/OFFSITE_BACKUPS.md`, candidate-k's report, and all four requested owner-ruling/wording approval documents. Current owner instructions govern this work. `BUILD_STATUS.md` was not edited.

All committed changes are confined to the two authorized test files and this verification directory. Production code, arithmetic, pricing, owner wording, manifests, lockfile and CI are unchanged. Build-generated tracked client assets were restored after validation. No work from the launch-pack branch/directory was incorporated. No subagents, PR mutation, merge, tag operation, deployment, Railway/provider operation, real customer data or messages/SMS were used.

## Precise test changes

`test/helpers/backupRestoreProcess.mjs` now reports through its existing test-only IPC channel:

- Actual child PID, random process-instance identity, startup/readiness/observation times, process uptime and actual listening port.
- The actual SQLite main filename from the application's open connection (`PRAGMA database_list`) and the Price Book directory used by the application.
- The target file's existence, SHA-256, byte length and modification time, without printing its contents.
- Whether this owner has a durable creation record and the owner's submission count, read through the actual application connection using owner-scoped queries.

The observation handler does not invoke the Price Book loader, backfill a ledger, write application data, add an HTTP endpoint or introduce a production runtime flag. It is in the existing test-only entry point, not the deployed entry point.

`test/backupRestoreRehearsal.spec.mjs` now:

1. Correlates IPC observations with bounded request IDs/timeouts and validates reported PID/port against the launched child.
2. Records parent-side fixture state before corruption, after corruption, after recovery requests and after restoration, alongside old/new process identities and exit state.
3. Collects owner read, fresh quote, historical replay, changed-binding replay and health responses before asserting the behavioral outcomes. A non-JSON response or transport error is recorded without preventing the other observations.
4. Retains statuses, response hashes/lengths and a restricted body projection. It omits headers, token values, contacts, full books and full receipts. Only fixed recovery/internal-error text is printed; unknown error text is fingerprinted. The failure payload is capped at 32,768 characters. Child output is only a 4,096-character scan window for the existing graceful-drain check and is not dumped into error messages.
5. Stops the corruption-case child in `finally`, then restores and verifies the original book bytes even if stopping fails. Cleanup errors are diagnosed separately; the original error remains the thrown failure. Shutdown is bounded to ten seconds, and repeated stop calls share the same result.
6. Checks exact original bytes before applying the next corruption, so a failed restoration cannot silently become the next case's fixture.

The existing requirements remain: missing previously-created book is `409` plus `PRICEBOOK_UNREADABLE`; invalid JSON/structure are `503` plus that code; fresh quotes are denied without low/mid/high dollar estimates; the complete historical receipt is equal; changed bindings conflict; health stays successful; submissions remain exactly two. Owner recovery wording checks remain. Receipt equality uses a boolean deep comparison so an assertion failure cannot dump receipt tokens.

Relevant new locations: parent body projection line 30, child orchestration line 58, corruption case line 248, request collection line 259, cleanup line 311 and original-failure preservation line 328; child identity line 42 and read-only observation handler line 47.

## Runtime, commands and results

Exact local runtime: **Node v22.23.3**, **npm 11.9.0** (`runtime.txt`). The existing task-local Node 22 executable was selected through PATH. No dependency installation overlapped test execution.

```sh
export PATH=/workspace/scratch/7877037ce74a/audit-tools/node_modules/node/bin:$PATH
export TMPDIR=/workspace/scratch/7877037ce74a/restore-diagnostics-runtime/tmp
npm ci
npm run build
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/backupRestoreRehearsal.spec.mjs
```

`npm ci` passed and added 328 packages. Owner/widget builds passed; the build retained its existing large-chunk warning. `npm-ci.log`, `npm-ci.exit`, `build.log` and `build.exit` are raw evidence. The final command ran once against the unchanged rehearsal before either test file was edited, then five times sequentially against the final changed test files. No CPU-affinity wrapper or test retry was used for these runs.

| Execution | Tests | Pass | Fail | Cancelled / skipped / TODO | Exit | Raw evidence |
|---|---:|---:|---:|---|---:|---|
| Unchanged baseline | 9 | 9 | 0 | 0 / 0 / 0 | 0 | `baseline.tap`, `baseline.exit` |
| Changed repetition 1 | 9 | 9 | 0 | 0 / 0 / 0 | 0 | `repetition-1.tap`, `repetition-1.exit` |
| Changed repetition 2 | 9 | 9 | 0 | 0 / 0 / 0 | 0 | `repetition-2.tap`, `repetition-2.exit` |
| Changed repetition 3 | 9 | 9 | 0 | 0 / 0 / 0 | 0 | `repetition-3.tap`, `repetition-3.exit` |
| Changed repetition 4 | 9 | 9 | 0 | 0 / 0 / 0 | 0 | `repetition-4.tap`, `repetition-4.exit` |
| Changed repetition 5 | 9 | 9 | 0 | 0 / 0 / 0 | 0 | `repetition-5.tap`, `repetition-5.exit` |
| INTENTIONAL assertion failure, disposable copy | 9 | 7 | 2 | 0 / 0 / 0 | 1 | `intentional-assertion.tap`, corresponding `.exit` |
| INTENTIONAL assertion plus cleanup exception, disposable copy | 9 | 7 | 2 | 0 / 0 / 0 | 1 | `intentional-assertion-and-cleanup.tap`, corresponding `.exit` |

`results.json` contains these counts. Repetitions exercise the same nine test results; they are not distinct coverage totals. The two failed entries in each intentional run are the deliberately failed corruption subtest and its parent.

Intentional probes were run with:

```sh
node verification/restore-diagnostics-20261012/run-intentional-probes.mjs
```

This verifier creates disposable copies under this verification directory, fixes only their relative imports, and injects an explicitly labeled assertion failure for invalid JSON after all recovery observations have been collected. The second copy additionally throws an explicitly labeled cleanup exception **after actual byte restoration**. The copies are deleted in the verifier's own `finally`; the committed rehearsal expectations never receive these injections. Every child result is written before the verifier checks it.

The probe verifier exited 0: `intentional-verification.log`, `intentional-verification.exit`, and `intentional-results.json`. Both induced rehearsals correctly remained exit 1. Both diagnostic records contained all five request observations: owner 503, fresh quote 503, historical replay 200, changed binding 409, health 200. They showed unchanged replay, exactly two submissions, actual child/database/book identities, retained creation records, and restoration to the original SHA-256. The subsequent invalid-structure and missing-book cases passed in both copies. In the dual-failure copy, `INTENTIONAL_OWNER_READ_FAILURE` remained the primary TAP error while `INTENTIONAL_CLEANUP_FAILURE` was separately recorded. The detailed payloads were 12,013 and 12,099 characters, below the cap.

The verifier also checked that its output contained no bearer/JWT or known synthetic password values. A separate scan of all retained TAP/log/JSON/text evidence found none of those values. No environment dump or authorization header is recorded.

## SHARE / SKIP decisions and limits

**SHARE — assertion-bypassed restoration in the original harness.** Severity: medium test-reliability issue, not an established application defect. At starting SHA `ead53fa174d577b280506b67573a29d6b0358237`, `test/backupRestoreRehearsal.spec.mjs` line 202 asserted before line 210 restored the book. Any intervening assertion failure could skip that restoration despite the comment. The change puts restoration in `finally`, verifies exact bytes, guards the next fixture and preserves the original failure. The intentional probes demonstrate the corrected failure path and unaffected subsequent corruption cases. This is suitable for review as a test improvement; it does not authorize release.

**SKIP — historical missing-book HTTP 200/503 as a confirmed product finding.** Status: **NOT REPRODUCED**, cause unknown. The original failed TAP logs were not supplied for this task. The reported subsequent personal review and its passes are context, not evidence that those failures were disproved. This task's unchanged baseline and five changed repetitions all passed; that does not establish why the reported failures occurred. No unsafe fresh quote, lost pricing data or arithmetic defect was observed here. Instrumentation and different process-stop timing can affect timing-sensitive behavior; this change must not be described as resolving the historical discrepancy.

**SKIP — intentional probe failures as product defects.** They are explicitly induced test failures in disposable copies, retained as evidence that diagnostics and cleanup work. The dual-failure probe tests error precedence after a successful restore, not an actual disk-write failure or recovery from an unwritable disk.

If the application failure recurs, the smallest justified follow-up is to compare the recorded child identity/actual database and book paths, ledger presence, pre/post file hashes and all five response observations. Preserve that failing evidence and reproduce the indicated mismatch before proposing any production change. A wrong path/process, changed fixture, HTTP error or product failure is not inferred without supporting observations.

Local browser assertions, Docker and broad suites are **NOT RUN** in this scoped task. No local browser pass is claimed. No Chromium installation or CI/dependency change was made. The normal hosted workflow remains responsible for its ordinary browser, quote, full-suite and Docker checks. Candidate-specific standalone/tag jobs do not apply to this branch.

## Publication and hosted evidence

At commit authoring, publication and exact-new-SHA CI are pending. The final handoff must verify `git ls-remote origin refs/heads/codex/restore-diagnostics-20261012`, read back this committed `REPORT.md` from the fetched remote commit, and inspect the ordinary push-triggered workflow for that same SHA. A run still in progress must be reported as PENDING; unavailable logs or checks must be reported as NOT RUN/unavailable, not passed. Earlier candidate-k CI is not CI for this branch.

This branch is a reviewable test improvement, **not a new release candidate and not a clean independent audit vote**.
