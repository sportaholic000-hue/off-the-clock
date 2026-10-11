NOT DONE at report authoring — this report commit still needs its own hosted CI and the one-time annotated tag. The final response records their resolved outcome.

# Release candidate i

This report is committed before final-head CI and tagging, as requested. Its own
SHA and future CI result cannot be embedded without creating a different commit.
The final user-facing report supplies the exact branch SHA, final CI run/counts,
tag-object SHA and peeled commit. The annotated tag message records its commit
and successful CI run. Only this verification directory changes after the
verified source checkpoint below.

All work used synthetic data and fake providers. No subagents, main merge,
deployment, Railway changes, real provider accounts, text messages, specification
edits or public website page edits were used.

## Inputs and ordered merges

`git ls-remote` returned the exact requested values before any merge:

| Branch | Verified SHA |
|---|---|
| `claude/release-candidate-20261011h` | `c5487b1eab00d4944dd3a53a7264898adb758cde` |
| `fix/retention-hardening-20261011` | `c3c760345a24d58a303ac989ca8ed518f7cb0134` |
| `fix/demo-facts-scanner-20261011` | `01710054c08e0f87924328f0406e3a1b9135e08b` |

Two ordered two-parent merge commits preserve both histories, without squash or rebase:

1. `bc85d41daa976c3c6e4773f86897df2ed1de1513`: first parent is the base; second parent is the retention fix.
2. `07050711648e4f7a2cdb6e58e5768e08d569293c`: first parent is merge 1; second parent is the demo/scanner fix.

The candidate branch was published immediately after the merges, before the
integration checks. GitHub Git-data API publication retained the locally reviewed
trees and ordered parents; the local branch was fetched back and aligned to those
commits. No force update was used. `git ls-remote` confirmed the merged branch.

The initial verification-workflow checkpoint is
`8ea1c76bce5c7d058b1ca1c06b26d4f1a8305261`, independently confirmed on GitHub.
The final workflow checkpoint, adding required-name verification before tagging,
is `bbe7464ecd582d1c4a7091391339e952bf39ea38`. Application and test code are identical
between these checkpoints; each was independently confirmed using `git ls-remote`.

## Conflict and integration changes

Exactly one conflict occurred: `.github/workflows/ci.yml:4`. Its push list keeps
both `fix/retention-hardening-20261011` and `fix/demo-facts-scanner-20261011`, plus
every pre-existing branch. All other workflow bytes in the merge resolution
match the retention parent. No other file conflicted.

The subsequent workflow checkpoint adds candidate-i-only steps for the exact
18 requested standalone files, the existing
`verification/railway/docker-smoke.mjs`, and a tag job depending on successful
`test` and `voice-docker-startup` jobs. Every pre-existing step remains unchanged
and in its original order, including candidate h's steps and tag job. Both full
test gates, the Chromium launch check, zero-failure checker and dependency audit
remain mandatory.

A candidate-i name check reads the actual full-suite TAP before tagging becomes
eligible. It requires all 26 retention, 15 demo and 68 scanner names. A positive
control passed; removing the auditor renamed-exec test made the negative control
fail as expected. [Control evidence](required-name-check-diagnostic.json).

The new `check-release-gate.mjs` verifies the three input ancestries, exact merge
parent order, the successful source checkpoint, unchanged source since that
checkpoint, clean local non-browser/standalone results, and clean query/route
inventories. Until the completed report's `RELEASE_GATE.json` exists, the tag job
exits without creating a tag. Final tagging also verifies that the remote branch
still equals `GITHUB_SHA` and that the tag does not exist. It creates an annotated
tag without force, deletion or replacement.

No production code, scanner, test expectations, SQL exceptions, route matrix,
middleware inventory, selectors or roles were changed during integration.

## Stricter owner-query checker

The merged inventory contains **289 entries**, **246 SQL exceptions** and
**30 non-query allowances**. It reports:

- **0 unlisted entries**.
- **0 unused SQL exceptions**.
- **0 unused non-query allowances**.
- **0 forbidden extractions**.

The full stricter coverage suite passed **88/88**, including all 68 added
destructuring regressions. Evidence: [query-inventory.json](query-inventory.json)
and [query-coverage.tap](query-coverage.tap).

No new query finding appeared, so no query rewrite or exception was added.
`test/helpers/ownerQueryScan.mjs` and its coverage tests match the demo input
byte for byte. `server/src/ownerQueryExceptions.js` matches the retention input
byte for byte. The scanner was not weakened.

## Route-source inventory review

All **26/26** recorded hashes match the merged files. **No hash needed updating
after the merge.** The retention parent already supplied these three reviewed
changes relative to candidate h:

| File | Retained SHA-256 | Review note |
|---|---|---|
| `server/src/billingCustomerLifecycle.js` | `13850e42a6106435b2426e6a9ab8c2aba70145525c3ad68cdf4cbf99b4e824af` | Adds the retry-copy cleanup dependency. Paths, authentication and roles unchanged. |
| `server/src/offsiteBackups.js` | `06cbc06715c04f06aa4a10eed8d551fdf3fb1d59dd286df9648bbd9e282f59de` | Adds versioning/retention health and cleanup wiring; the existing admin response now agrees with HTTP 503. Path, admin authentication and roles unchanged. |
| `server/src/server.js` | `dc551df50bcd208c9e4626a3c3d8bd1b70696a476c1f70140b22327e6cbff7c1` | Wires retry-copy cleanup. Paths, authentication, roles and staff-invite limiter unchanged. |

The inventory matches the retention input byte for byte. Full old/new hashes
and notes are in [route-review.json](route-review.json).

## Local verification

`npm run build` passed before the test commands; [build.log](build.log).
Tracked `client/dist` is restored before publication.

Local Node 24.19.0 uses the existing workspace-only native-wrapper retention
preload to avoid this host's SQLite cleanup-hook crash. It changes no SQL,
transactions, results, explicit close calls or assertions and is not shipped.
Hosted CI uses clean Node 22 without that accommodation.

```sh
export TMPDIR=/workspace/scratch/5228524b6f21/audit-tmp
export NODE_OPTIONS=--require=/workspace/scratch/5228524b6f21/audit-native-retain.cjs
export PRICEBOOK_BROWSER_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright
npm run build
npm test
npm run test:quote
```

Nine CPUs are available. The final local full suite uses CPUs 0–3, the quote gate 4–7,
and the independent standalone runner 6–8. Each test process has at least three
CPUs. Chromium's executable is absent: [chromium-probe.log](chromium-probe.log).
Browser assertions are **NOT RUN locally**, never counted as passed. Docker is
not installed locally; the hosted Docker job supplies the requested smoke proof.

Final completed local commands:

| Command | Registered tests | Passed | Runner failures | Result |
|---|---:|---:|---:|---|
| `npm test` | 4,933 | 4,873 | 60 | Exit 1: every failure is missing Chromium; browser assertions NOT RUN |
| `npm run test:quote` | 4,211 | 4,151 | 60 | Exit 1: every failure is missing Chromium; browser assertions NOT RUN |

Both report zero skips, cancellations and TODOs, and **zero non-browser
failures**. All 26 retention-hardening and 68 scanner-destructuring names passed
in both local gates; all 15 demo-fact/entitlement names passed in the full suite.
No catalog timing assertion failed, so no catalog rerun was required. Raw log
paths, hashes, failed browser names and counts are in
[local-full-summary.json](local-full-summary.json).

The first concurrent local attempts stalled without summaries and were
interrupted: full had 293 passing / 3 Chromium-failing top-level results;
quote had 73 passing / 0 failing top-level results. Remaining checks in those
attempts are **NOT RUN**, not passes. The stall did not reproduce in separate
45-second-bounded commands for `coreGate.spec.mjs` (**10/10**) and
`billingCalls20261009Http.spec.mjs` (**1/1**), using the same Node test flags.
The cause was not established. The unchanged full commands were then rerun
with separate four-CPU allocations and timeout monitoring; the complete results
are the table above. [Interrupted-attempt record](interrupted-local-attempts.json),
[gate diagnostic](diagnostic-core-gate.tap), [HTTP diagnostic](diagnostic-billing-http.tap).

## Standalone files

Each file ran in its own Node process, locally and in hosted CI:

```sh
for spec in \
  test/retentionHardening*.spec.mjs test/day90*.spec.mjs \
  test/tenantRetention20261010.spec.mjs \
  test/continuousOffsite20261007.spec.mjs test/backups.spec.mjs \
  test/offsiteBackups20261007.spec.mjs \
  test/ownerQueryCoverage20261009.spec.mjs test/voiceLimits20261007.spec.mjs \
  test/tenantIsolationRoutes.spec.mjs test/billingTrial20261011.dom.spec.mjs \
  test/ownerWording20261011.dom.spec.mjs test/staffLogin20261009.spec.mjs; do
  node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs \
    --test --test-reporter=tap "$spec"
done
```

All **18 files passed independently: 565/565 tests**, zero failures, skips, cancellations or TODOs.

| File | Local passed | Hosted source passed |
|---|---:|---:|
| `test/retentionHardeningHealth20261011.spec.mjs` | 3/3 | 3/3 |
| `test/retentionHardeningLocks20261011.spec.mjs` | 6/6 | 6/6 |
| `test/retentionHardeningSecrets20261011.spec.mjs` | 8/8 | 8/8 |
| `test/retentionHardeningVersions20261011.spec.mjs` | 9/9 | 9/9 |
| `test/day90Backups20261011.spec.mjs` | 4/4 | 4/4 |
| `test/day90Cancellation20261011.spec.mjs` | 4/4 | 4/4 |
| `test/day90Guarantees20261011.spec.mjs` | 10/10 | 10/10 |
| `test/day90Providers20261011.spec.mjs` | 12/12 | 12/12 |
| `test/tenantRetention20261010.spec.mjs` | 13/13 | 13/13 |
| `test/continuousOffsite20261007.spec.mjs` | 16/16 | 16/16 |
| `test/backups.spec.mjs` | 12/12 | 12/12 |
| `test/offsiteBackups20261007.spec.mjs` | 23/23 | 23/23 |
| `test/ownerQueryCoverage20261009.spec.mjs` | 88/88 | 88/88 |
| `test/voiceLimits20261007.spec.mjs` | 41/41 | 41/41 |
| `test/tenantIsolationRoutes.spec.mjs` | 264/264 | 264/264 |
| `test/billingTrial20261011.dom.spec.mjs` | 12/12 | 12/12 |
| `test/ownerWording20261011.dom.spec.mjs` | 16/16 | 16/16 |
| `test/staffLogin20261009.spec.mjs` | 24/24 | 24/24 |

The individual TAP logs are in [standalone/](standalone/) and exact commands,
exits and counts in [standalone-results.json](standalone-results.json).

## Hosted source-checkpoint verification

Workflow **CI**, [run 38151374508](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38151374508),
concluded **success** for source commit
`bbe7464ecd582d1c4a7091391339e952bf39ea38`. Results were retrieved directly
from test-job log `114505367039`:

| Command/check | Passed | Failed / skipped / cancelled / TODO |
|---|---:|---:|
| `npm run build` | PASS | — |
| `node --test test/ownerAlertsDelivery20261006.browser.spec.mjs test/ownerDashboard20261007.browser.spec.mjs` | 9/9 | 0 / 0 / 0 / 0 |
| `npm run test:quote` | 4,225/4,225 | 0 / 0 / 0 / 0 |
| `npm test` | 4,947/4,947 | 0 / 0 / 0 / 0 |
| Each of the 18 standalone files above | 565/565 total | 0 / 0 / 0 / 0 |

Direct log search confirms every expected name:

- **26 retention-hardening names**, passing in quote, full and standalone runs
  (78 passing occurrences).
- **15 demo-fact/entitlement names**: the two existing fact checks plus all 13
  added session/plan checks, passing in full and standalone runs (30 occurrences).
- **68 scanner-destructuring names**, passing in quote, full and standalone runs
  (204 occurrences), including renamed/shorthand exec and shadowed-key cases.

[Exact counts and names](hosted-source-summary.json);
[expected-name inventory](expected-test-names.json). Browser tests executed with
Chromium in hosted CI. The existing zero-failure checker and production dependency
audit also passed. The new mandatory name check printed PASS for all three
groups before tagging became eligible. The checkpoint tag job explicitly logged
`Checkpoint only: no release tag requested.` because the final report gate did
not yet exist; no tag was created by this checkpoint.

## Docker smoke

**PASS** in hosted `voice-docker-startup`, job `114505366911`, at the verified
source checkpoint. Command:

```sh
node verification/railway/docker-smoke.mjs otc-receptionist:synthetic
```

The retrieved log reports `passed: true` and the exact source SHA. It verifies
rebuilt bundles and private-file denial; real Linux SIGTERM drain and restart;
fresh-container redeploy and the actual restore CLI; and startup refusal for
an unmounted volume or development-mode override. The separate synthetic voice
Docker smoke also passed with provider networking disabled and `/api/health 200`.
[Exact Docker proof](hosted-docker-proof.json). No Railway deployment was made.

## Final report and tag

The completed report and `RELEASE_GATE.json` are published only after the source
checks above succeed. The final commit then repeats the build, full suites,
all standalone files and both Docker proofs. The annotated tag is created only
after those exact-commit jobs succeed, and is never moved, deleted or recreated.

Source, tests, workflow, this report and compact verification evidence are saved
locally and published to GitHub. Raw full local-suite logs and the native runtime
preload remain workspace-only; their paths/hashes are recorded in the local
summary. Generated build output and synthetic working directories are not
published. The final delivery supplies the independently retrieved GitHub CI
result and `git ls-remote` branch, annotated-tag and peeled-commit lines.
