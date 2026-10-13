# Targeted verification PASS — fresh evidence, not the lost historical run

Verified source: `rc-20261012l`, annotated object
`a8fd712734f334f4edc2aab24cc5797d90e9ea40`, peeled commit
`d38781b35d126f21fed6074844e07d4e9de7c944`.
Branch: `codex/restore-recheck-20261013`, absent remotely before creation.
The candidate branch matched the peeled commit. Exact `git ls-remote` output
is preserved in `starting-refs.stdout.log`.

All planned local checks passed on their first and only execution. No unexpected
result occurred. This report and all evidence are fresh October 13 material.
The lost archive, source and logs are unavailable; nothing here reconstructs
that run or determines its cause.

## Scope and preparation

Read `AGENTS.md`, `specs/BUILD_STATUS.md`,
`verification/backup-restore-20261006/EXPECTED.md`,
`verification/restore-diagnostics-20261012/REPORT.md`, its committed probe runner,
`test/backupRestoreRehearsal.spec.mjs`, and
`test/helpers/backupRestoreProcess.mjs`. Also inspected the test environment
helpers, package scripts and the existing CI branch trigger for publication.

Fresh clone from the pinned commit; Node **v22.23.3**, npm **11.9.0**.
`npm ci` added 328 packages and exited 0. `npm run build` built the owner app and
widget and exited 0; its existing large-chunk warning is retained. Runtime
proxy/npm deprecation warnings are preserved, not suppressed.
`EXPECTED.md` predates the three executions. `COMMANDS.md`, `runtime.json` and
`*.execution.json` record commands, runtime, cwd, timestamps, exits and signals.

Every new tracked file is under `verification/restore-recheck-20261013/`.
The copied probe runner adds only evidence capture. Its original injections,
expected responses and verifier assertions remain identical. No production,
quote arithmetic, existing test, CI, dependency, spec or public-page changes.
The sole build-generated tracked change, `client/dist/index.html`, was restored;
`build-generated.diff` records it. No unrelated work was present or discarded.

## Execution results

| Execution (one each) | Tests | Pass | Fail | Exit | Signal |
|---|---:|---:|---:|---:|---|
| Unchanged normal rehearsal | 9 | 9 | 0 | 0 | null |
| Assertion-only probe | 9 | 7 | 2 deliberate | 1 | null |
| Assertion-plus-cleanup probe | 9 | 7 | 2 deliberate | 1 | null |
| Intentional-probe verifier | verifies both probes | — | 0 verification failures | 0 | null |

All three TAP runs have zero cancelled, skipped or TODO results. The two failed
entries per intentional run are the injected invalid-JSON subtest and its
parent, with `INTENTIONAL_OWNER_READ_FAILURE` remaining the primary error.
The dual-failure probe separately records `INTENTIONAL_CLEANUP_FAILURE` **after
actual byte restoration**; it does not simulate an unwritable disk.
The later invalid-structure and missing-book subtests pass in all three runs.

Normal command:

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/backupRestoreRehearsal.spec.mjs
```

Probe verifier command (two modes, once each):

```sh
node verification/restore-recheck-20261013/run-intentional-probes.mjs
```

Full TAP stdout and separate stderr are `normal.*.log` and
`intentional-{assertion,assertion-and-cleanup}.*.log`. The probe `.tap` files are
byte-for-byte stdout followed by stderr, as in the original verifier; they are
not an interleaved stream. `intentional-results.json` records each exact probe
command. `intentional-verifier.*` records the outer verifier result. No outputs
were truncated or edited after capture.

## Parent/child evidence

The invalid-JSON observations below come directly from each probe's preserved
`restore-recovery` JSON in stdout. Pretty-printed copies are in the corresponding
`.diagnostics.json`; `inspection.json` is a separately labelled post-execution
cross-check of those saved observations, not another application run.

| Observation | Assertion-only | Assertion plus cleanup |
|---|---|---|
| Actual child PID | 90 | 188 |
| Instance ID | `5221e8b2-06c9-4f49-8e3c-966797503af8` | `f35f7fa1-8d49-4f42-a854-e2b037d49f71` |
| Actual port | 41453 | 41341 |
| Owner read | 503 / PRICEBOOK_UNREADABLE | 503 / PRICEBOOK_UNREADABLE |
| Fresh quote | 503; no low/mid/high estimate fields | 503; no low/mid/high estimate fields |
| Historical replay | 200; complete receipt unchanged | 200; complete receipt unchanged |
| Changed binding / health | 409 / 200, ok=true | 409 / 200, ok=true |
| Submissions, parent and child | 2 throughout | 2 throughout |
| Child shutdown | exit 0, signal null | exit 0, signal null |
| Exact original restored | yes, 3,140 bytes | yes, 3,140 bytes |

Both parents recorded exactly seven bytes, `{broken`, with SHA-256
`be302461cda285db3ed2d45fb767b23e08ca8808b35a638009937df22b332d73`.
Each child recorded that same size/hash **before requests and after each of all
five requests**, with the same file modification time. The parent's
`afterRequests` record still has those corrupt bytes. Both actual child SQLite
paths match `expectedDatabasePath`; every observed book path matches the parent
fixture path. Creation records remain present. Full paths, process transitions,
request/body hashes and timestamps are retained in the diagnostic JSON.

Original/restored SHA-256:

- Assertion-only: `fdaedd57e83ee5ca330c3cfba63a9fccea5e4d83c9e5a1cdb736b652d0333859`.
- Assertion plus cleanup: `9194c57f621fb7a8abc7421f3c24d6e505826ef5f1b62547b33eb228ba68d347`.

The existing `finally` awaits child shutdown, records exit state, writes the
original bytes and checks exact equality. The saved exit/restoration timestamps
are 20:19:01.768Z and 20:19:07.480Z respectively (October 13); each pair falls
within the same millisecond, so the **source ordering**, not sub-millisecond
precision, establishes shutdown before restoration. No stop error occurred.
`probe-cleanup-order.json` proves the saved source/diff preceded each execution
and the disposable source directory was removed only after both outputs were
captured. The rehearsal removed its synthetic volumes; **no database snapshot
is preserved or claimed**.

For the normal passing run, the unchanged harness emits cleanup summaries and
TAP assertions, not its full recovery JSON. Detailed parent/child evidence above
is therefore specifically from the two intentional probes. Later structure and
missing-book behavior is evidenced by unchanged passing assertions, not invented
additional request dumps.

## Evidence integrity and redactions

`generated/*.diff` are exact diffs against the pinned rehearsal, saved before
execution. `generated/*.source.json` records the executed source SHA-256 and
preservation time. Applying each saved patch to the pinned source in memory
reproduced its executed SHA-256 during inspection.

Published `generated/*.mjs` copies mask **only the two existing synthetic fixture
password literals**, with explicit `[REDACTED_SYNTHETIC_*_PASSWORD]` placeholders.
These redacted copies were not executed. The original execution used unchanged
synthetic fixture values. Their source records distinguish executed and published
hashes. The copied verifier retains its existing credential-detection assertion;
its password-match patterns are source checks, not emitted login credentials.
No issued tokens, headers, environment secrets, full message bodies, books or
receipts are published. Execution stdout/stderr needed no redaction. Their
existing bounded diagnostics intentionally omit those values. Raw application
child stdout/stderr are not independently archived: the unchanged harness keeps
only a bounded graceful-drain scan. No additional historical material is implied.

`SHA256SUMS` covers every evidence file except itself and `FILE_INVENTORY.json`;
`FILE_INVENTORY.json` records the same paths, byte sizes and hashes. This explicit
exclusion avoids self-referential hashes. The final handoff verifies both manifest
files as well as every listed file against bytes freshly fetched from GitHub.

The whitespace review flagged the literal blank context lines in saved unified
diffs and the copied runner's terminal blank line. Those evidence bytes are
retained; no whitespace warning is counted as a test pass.

## Decisions, publication and limits

**SHARE: none from this targeted verification.** No unsafe fresh quote or
unexplained first-run failure was observed. No application defect or repair is
claimed.

**SKIP — unsubstantiated historical observation; fresh targeted verification
passed; historical cause remains unknown.** Passing fresh runs do not disprove
the lost observation. A child seeing valid pricing before a successful quote
would not establish quoting from corrupt JSON.

**SKIP — deliberate probe failures as product defects.** These are the required
injections proving that the primary assertion and subsequent cleanup/cases remain
observable, not unexpected application failures.

At report authoring, GitHub publication/readback and automatically triggered CI
are pending. The final handoff supplies the exact remote branch SHA, verifies
only this directory differs, reads back this report and every evidence file, and
identifies any exact-SHA CI separately. This report does not claim CI success.
The existing `codex/**` push trigger can start ordinary CI; no workflow, job,
branch owned by the runner-repair chat, or tag is changed here.

Browser, Docker, broad `npm test`, strict `npm run test:quote`, independent audits
and live provider/deployment acceptance are **NOT RUN** in this bounded task.
No retries, repetition campaign, browser installation, main merge, release tag,
deployment, Railway changes, real provider operations, messages or SMS occurred.
This targeted verification is not release-audit clearance.
