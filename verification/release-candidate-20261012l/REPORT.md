# Candidate l — repair verified locally; final hosted gates and tag pending

This report is authored before publication of the final candidate commit. Hosted checks on that exact commit are **PENDING**, and `rc-20261012l` has **not** been created. The final handoff must record the remote SHA, report readback, actual hosted step/log results and tag decision. No candidate-k or restore-branch CI result is substituted for this commit. Independent Astra + Sol clean audits for both scopes on the same tagged commit remain required.

## Starting refs and integration

All refs were read with `git ls-remote`; the complete result is retained in [starting-refs.txt](starting-refs.txt).

| Input | Exact observed SHA |
|---|---|
| `rc-20261012k` annotated tag | `4959515817dc94dd81c393746845fc1ab68742cf` |
| `rc-20261012k^{}` | `ead53fa174d577b280506b67573a29d6b0358237` |
| `codex/restore-diagnostics-20261012` | `d52fb4003c21ba7f300af2073b1d329eb6d2cc99` |
| `codex/launch-pack-20261012` | `4417e7b749a71fbee6207315ebcd75425fa25036` |
| `main` at verification | `ed12dca1253a8790c885b071ab6037e05632bea0` |

Both integration commits have the pinned base as their sole parent. Candidate l's branch/tag were absent. A separate clone at `/workspace/scratch/5228524b6f21/candidate-l-20261012` was switched to `claude/release-candidate-20261012l` from the exact base. No branch tip was substituted.

Executed `git cherry-pick -x d52fb4003c21ba7f300af2073b1d329eb6d2cc99 4417e7b749a71fbee6207315ebcd75425fa25036`, in that order, without conflicts. Local cherry-picks were `2e1885a07a1798d423facc0a057a38694316db75` and `38eab476c7391092f08de04f4cdbf29eafad0906`. GitHub connector publication preserves their messages, `cherry picked from` references and exact trees, with GitHub-generated commit metadata: `7b869934331bdba61ce109eb20f8b52dbaddae9e`, followed by `91108abfe49aa9ddfd51637e17add552023ed708`. [integration.json](integration.json) records source, parent and tree identities. The restore diagnostics files are byte-for-byte unchanged from their pinned input; the five launch drafts receive only the authorized candidate/retention reconciliation.

Read AGENTS.md, BUILD_STATUS.md, the relevant platform security/backup and billing-lifecycle retention requirements, and all four specified owner rulings/wording approvals. Current owner instructions govern. Nothing in `specs/` was edited.

## Confirmed defect and before/after evidence

The base's `billingRetentionSteps.js` made `discard()` conditional on successful abandoned-copy cleanup. At expiry, a writable live database retained both retry values whenever that cleanup failed, despite provider retries already having stopped.

The new synthetic regression was written and run against the untouched pinned production code before any production edit. It reuses `tenantRetentionFixture`, the existing off-site service and stub Google/phone providers. It preserves an abandoned partial snapshot containing synthetic retry material and separately blocks cleanup with `BACKUP_STAGING_BUSY` and with `acquireProcessLock(retentionLockFile(deployment))` outside the reentrant context.

| Scenario | Before repair | After repair |
|---|---|---|
| Injected cleanup blocker, first attempt +30 and +31 days, reopening SQLite between runs | Live retry row remains at both times; Calendar/phone PENDING; abandoned copy remains; health unhealthy | Live retry row absent at both times; both provider steps PERMANENT_FAILURE; `retryCopies` PENDING; abandoned copy remains; health unhealthy |
| Actual held SQLite retention lock, same deadlines and restart | Same retained live row and PENDING providers; `OFFSITE_BUSY` | Live values removed despite `OFFSITE_BUSY`; original holder still excludes acquisition; residual cleanup persists |
| One millisecond before expiry | Live row retained; both stubs called a second time | Same permitted behavior; original first-attempt times unchanged |
| At/after expiry | No further provider attempts, but live values survive blockers | No further provider attempts; live values removed; no fabricated Calendar success or number release |
| Release blocker and reopen again | Original defect clears only once copy cleanup is possible | Already-deleted live values stay absent; terminal-provider processing still removes the partial copy and marks `retryCopies` DONE; permanent provider failure remains unhealthy/incomplete |
| Reader pins old SQLite history | Existing flush-pending behavior already passed | Live row removed; WAL/main-history cleanup stays pending/unhealthy until reader release; then physical bytes disappear and flush marker clears |

[expiry-before.tap](expiry-before.tap) contains **7 tests: 1 pass / 6 fail**, exit 1. Its safe diagnostic records show `liveRetryRows:1` on days 30 and 31 for both blockers. The existing provider and snapshot suites still passed **20/20** in [existing-before.tap](existing-before.tap), confirming the missing combination in their coverage. [expiry-after.tap](expiry-after.tap) records the initial **7/7** repair result. [expiry-final.tap](expiry-final.tap) and the final locked standalone run record **8/8** after the additional continuation safeguard below. These are overlapping executions, not additive coverage counts.

Additional continuation check: the preparation pass can be followed by reactivation before day 90, and `restoreLocal()` clears cancellation retention state. An expired phone operation must not lose its newly recorded pending-copy obligation through that path. [preparation-valid-fixture-before.tap](preparation-valid-fixture-before.tap) reproduced `RESTORED` instead of required `ENDED` before the safeguard. The final test proves preparation stays blocked, live material is already gone, restart retains the obligation, and reactivation can proceed after real copy cleanup. No change to `billingCustomerLifecycle.js` was needed.

Three earlier preparation probe logs (`preparation-before`, `preparation-diagnostic`, `preparation-confirmed-before`) are retained but **are not accepted product reproductions**: the initial fixture lacked payment-method verification and correctly stayed `pending_payment`. Correcting that synthetic prerequisite produced the actual `RESTORED` failure above. No production assertion or billing gate was weakened.

## Repair and allowed changes

- `server/src/billingRetentionSteps.js:48–72`: permanent failure atomically removes the live retry values and records a non-secret `retryCopies` obligation. Existing secure deletion and WAL flushing remain. Historical-copy cleanup has its own durable status, safe error code and timestamps.
- `server/src/billingRetentionSteps.js:123–151`: deadline/unusable-material handling runs in the local preparation pass before external backup work. The original first-attempt clock, 30-day number schedule and 90-day data/Calendar schedule remain. Preparation reports pending physical cleanup so subsequent reactivation cannot erase the obligation.
- `server/src/billingRetentionSteps.js:189–214`: residual cleanup runs outside the terminal-provider early return, including after database/service reconstruction. Pending copies and pending database-history flushing independently block completion and appear in unhealthy admin retention status. Successful physical cleanup never converts failed provider revocation/release into success.
- `test/retentionExpiry20261012.spec.mjs`: eight regressions cover the boundary, both values, injected and actual lock blockers, restart, disabled providers, phone-only day-60 expiry, WAL contention, unusable material, preparation/reactivation, idempotence, business B and financial evidence. No existing test was weakened.
- `.github/workflows/ci.yml`: seven existing candidate conditions now also include candidate l. All old conditions, run bodies, ordinary gates and tag-job restrictions are preserved. A new candidate-l step runs the expiry file independently and checks all eight names in the full-suite TAP. No candidate-l automatic tagging job was added.
- `verification/release-candidate-20261012l/**`: this report, raw before/after/diagnostic evidence, validation records and fixed-name guard. The guard accepts only passing TAP entries for all eight tests.
- The five Markdown files under `verification/launch-pack-20261012/`: distinguish demonstrated live expiry from unresolved historical-copy/WAL cleanup; update deploy-source review to the eventual candidate-l handoff; preserve full wording alternatives and “current text not supplied.” Still OWNER REVIEW ONLY and undeployed. The original launch report remains explicitly labeled historical evidence. Extended live retention is not presented as an approved exception.

Beyond the two exact cherry-picks, no other production file, route inventory/hash, quote arithmetic, Price Book implementation, plan gate, price, UI/public wording, specification, dependency manifest or lockfile changed. Starter's `calculateListedPrice` and Quotes delivered counter are untouched. Build-generated `client/dist` changes are restored before committing. No live lock or snapshot is removed to force completion.

## Runtime and local validation

Node **v22.23.3**, npm **11.9.0**, nine available CPUs reported locally. [runtime.json](runtime.json) records final installed/locked versions. Tests use temporary synthetic storage, fake S3 and provider stubs only.

```sh
export PATH=/workspace/scratch/5228524b6f21/node22-toolchain/node_modules/node/bin:$PATH
export TMPDIR=/workspace/scratch/5228524b6f21/candidate-l-runtime/tmp
export PLAYWRIGHT_BROWSERS_PATH=/workspace/scratch/5228524b6f21/playwright-l
npm ci
npm install --no-save --no-audit --no-fund playwright@1.56.0
npx playwright install chromium
npm run build
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/retentionExpiry20261012.spec.mjs
# Each file in standalone-locked/results.json is also run independently with those Node flags.
TEST_RESULTS_FILE=verification/release-candidate-20261012l/full-local.tap npm test
npm run test:quote
```

Install/build logs and exit codes are retained. Large logs are losslessly gzip-compressed; [compressed-evidence.json](compressed-evidence.json) records original and compressed hashes and sizes. No recorded output was omitted. No dependency installation overlapped tests. The first temporary Playwright installation used `--package-lock=false`, which ignored pinned transitive versions (observed React 19.3.0/Vite 6.4.4 versus locked 19.2.7/6.4.3). It did not change manifests or the lockfile. This was corrected with a fresh `npm ci` and CI's exact `--no-save` installation command, adding only Playwright's two packages. The final build returns to the locked outputs.

The earlier combined [focused.tap](focused.tap) ended after 205 passing entries without a final TAP summary despite exit 0. The first standalone run had 19 complete passing files (558 tests) and an incomplete day90Backups log after two passing entries; that aggregate is **not a passing run**. The incomplete termination cause is not established. Both logs/results are retained; a standalone lock diagnostic passed 6/6. The qualifying runs below use the corrected locked environment, rather than treating those early exits as passes.

| Check | Result / evidence |
|---|---|
| `npm ci`; CI-equivalent Playwright setup | PASS; `npm-ci-reset.*`, `playwright-ci-install.*`; no manifests/lockfile changed |
| `npm run build` in locked environment | PASS; `build-locked.log`, exit 0; existing chunk-size warning only |
| Chromium launch probe | FAILED with SIGTRAP; actual browser checks **NOT RUN locally**, not passed; `chromium-probe.*` |
| Final focused standalone files | **562/562 pass across 20 files**, zero failures/cancellations/skips/TODOs; [standalone-locked/results.json](standalone-locked/results.json) and per-file TAP |
| Integrated restore rehearsal | **9/9 pass**, included in the focused count; original missing-book discrepancy remains NOT REPRODUCED / cause unknown |
| `npm test` | **4,902 pass / 60 failed browser launches / 4,962 total**, exit 1; zero cancelled/skipped/TODO. All 60 failures contain `browserType.launch` and SIGTRAP; those browser checks are **NOT RUN locally**. Losslessly compressed raw `full-local.tap.gz`, `full-local.log.gz`; complete classification in [full-local-classification.json](full-local-classification.json). No other failure and no catalog timing failure occurred. |
| `npm run test:quote` | **INCOMPLETE**, interrupted (exit 130) after 282.6 seconds without new output: 1109 root entries, 1102 passing and 7 browser launch failures, **no final counts/summary**. Architecture check passed. Remaining cases **NOT RUN locally**. Raw `quote-local.log.gz`; [quote-local-classification.json](quote-local-classification.json). |
| Docker smokes locally | **NOT RUN** — Docker executable unavailable; exact-SHA hosted steps are required |

The strict quote gate stalled after the Calendar-scope case, before caller-history output. The next selected file, `test/callerHistoryFollowup20261006.spec.mjs`, was diagnosed alone with `timeout 60s node --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap`: **12/12 passed**, exit 0 (`quote-stall-diagnostic.*`). This does not establish why the parent runner stalled. The incomplete run and seven Chromium launch failures are preserved; the gate was not rerun to erase that evidence. Its exact-SHA hosted execution is mandatory. No catalog timing assertion failed.

The fixed-name guard passed against the full-suite TAP (all eight expiry cases passed) and correctly rejected the baseline failure log; `name-guard-positive.*` and `name-guard-negative.*` preserve both results.

The 20 standalone files and counts are recorded individually in the JSON. They include backup coordination 6, restore rehearsal 9, backups 12, billing lifecycle 52, continuous off-site 16, day90 backups/cancellation/guarantees/providers 4/4/10/12, lock database/race 6/9, off-site 23, owner-query coverage 88, new expiry 8, hardening health/locks/secrets/versions 3/6/8/9, route isolation 264 and tenant retention 13. Counts overlap full/strict gates and must not be added to them.

## Exact-SHA hosted requirements

Hosted status at report authoring: **PENDING final publication/run**. The restore branch's run `38313191411` and all candidate-k runs do not validate this commit.

[ci-required-steps.json](ci-required-steps.json) lists the required named steps to inspect on the final SHA. Required evidence includes cold install/build, working Chromium, owner browser regressions, strict quote gate, full suite, dependency audit, six coordination cases, all existing standalone retention/lock/backup/restore files, previous candidate-i/j/k name guards, eight new expiry tests and their full-suite name guard, network-isolated production voice Docker smoke, Railway restart/redeploy/SIGTERM/restore Docker smoke and production-user lock-database smoke. A green job with a required step skipped is insufficient. Historical candidate-h/i/j/k tag jobs are intentionally not eligible for candidate l.

Command-line Git write authentication is unavailable (`git push --dry-run` returned “could not read Username … terminal prompts disabled”). Publication uses the connected GitHub Git-data tools, followed by exact tree comparison and remote readback. Those tools currently provide branch writes but no tag-creation operation; a tag is not assumed available or created.

The final branch must be confirmed by `git ls-remote`, and the report fetched back from that exact SHA. Only after every required hosted step has actually passed may the immutable candidate-l tag be created on that same commit. No subsequent commit can be represented as covered by that tag.

## SHARE / SKIP and limits

- **SHARE — confirmed expired live-material retention:** fixed by the transaction/independent cleanup record, reproduced before production edits and verified afterward. Pending-copy and WAL barriers still prevent false complete/healthy status. Requires independent review; no audit waiver.
- **SHARE — loss of pending physical cleanup through preparation/reactivation:** fixed by preventing preparation from completing while the independent obligation remains. The existing reactivation path resumes after successful cleanup, without editing its production file.
- **SHARE — final release qualification:** open at authoring. Exact-SHA hosted results and the final publication/tag decision are not yet known. Do not treat this report's local passes or earlier branch CI as release authorization.
- **SKIP — historical restore discrepancy:** NOT REPRODUCED / cause unknown. The imported diagnostics improve evidence and failure cleanup; they do not establish the historical cause or a quote-engine repair.
- **SKIP — preliminary local runner/dependency limitations:** early incomplete runs are preserved and not counted as passing; their exact termination cause is unknown. Final locked standalone runs completed. Local Chromium is unavailable and Docker is absent. The local quote gate also stalled without a summary, for an unknown reason; it is incomplete, not passed. Exact-SHA hosted evidence is mandatory.
- **SKIP — physical impossibility during outages:** live deletion requires a running worker and writable live database; physical removal of inaccessible old copies or pinned database history cannot be declared complete. The repair removes the unnecessary copy-cleanup dependency without extending the maximum retry window or changing policy. Permanent provider failure stays visible even after physical cleanup finishes.

No main merge, deployment, Railway/DNS/account/provider configuration, real data, charges, messages, emails, calls or SMS. No subagents. The five launch drafts remain unapproved/unpublished. This task produces a candidate for independent review, not the required Astra + Sol clean audits for both scopes on the same tagged commit.
