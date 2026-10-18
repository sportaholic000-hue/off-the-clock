# Roofing exact subtraction repair — review branch

**Implemented and focused checks passed. Exact-final hosted CI is pending at this report's authoring; local browser and Docker behavior are NOT RUN because their executables are unavailable. This is not release/audit clearance.** Final published SHA, readback and exact-SHA hosted results are reported in the final handoff after they are actually inspected; no later report-only commit is used to imply those checks covered another tree.

Branch: `codex/qe-roof-exact-subtraction-20261018`.
Base and only intended parent: `21f0ccf9ba3cd6859697483745bd4c8152274169`.
Read-only reference: `ebf2abd0b1912015f17b621b31b7ad5af0e351b2`, `verification/qe-roof-factor-bounds-review-20261018/`.
Main observed before work: `ed12dca1253a8790c885b071ab6037e05632bea0`. New branch was absent. Separate checkout; no other branch integrated. No subagents, tags, main merge, deployment, dependencies/workflows/specs edits or live-provider/data operations.

## Repair and change boundary

- `server/quote-engine-vnext/templates.js:551–553,573–574,598–599`: adopted roofing constructs exact story/shape subtraction evidence before creating all four adjustment lines (installation story/shape, first-layer removal story, additional-layer removal story). Existing line multiplication consumes the retained rational. No rounding/truncation/epsilon workaround, approximate conversion before evidence, line combination, clamping, changed rates or bounds.
- `server/quote-engine-vnext/engine.js:56` and `server/src/runtimeConfig.js:7`: both production literals advance from v9 to `quote-engine-vnext-accuracy-20261018-v10`.
- `test/qeRoofExactSubtraction20261018.spec.mjs`:47 new normally selected regressions:26 independent arithmetic/evidence cases, version binding, four genuine v9 widget/voice replay and approval sequences,16 unchanged invalid/below-one rejection controls.
- Existing current-version expectations only: `test/finalIntegrationMetadata20261017Fixture.mjs`, `test/quoteReviewFixes.spec.mjs`, `test/quoteStartingValues20261017.spec.mjs`, `test/quoteStartingValues20261017.browser.spec.mjs`, `test/qeAccuracyIntegration20261018.spec.mjs`, `test/qeRoofUnderlaymentAccuracy20261018.spec.mjs`, `test/backupRestoreRehearsal.spec.mjs`, `test/releaseProductionEngineGuard.spec.mjs`. The startup guard additionally rejects v9; its existing historical stale-version cases remain.
- `test/qeRoofZeroAdjustments20261018.spec.mjs`: current approval/version expectations advance. The frozen v8 file is unchanged. For its single affected two-story positive control, the expected private story factor changes from10000000000000009/100000000000000000 to1/10; exact unrounded installation/first/additional removal become20000/6000/8400c. Every original dollar assertion remains. All136 accepted-zero regressions are retained.
- New evidence only under this directory. `check-scope.mjs` verifies byte-identical code outside adopted roofing, all four zero opt-ins, generic guards and the two version-only edits. Existing frozen fixtures, historical version assertions and old verification directories remain unchanged. `source-hashes.json` binds the tested source; `SHA256SUMS` binds this evidence.

## Independent money expectations and observed corrections

`EXPECTED.md` and the Python Fraction oracle output were written and hashed before running the baseline. Every line is independently rounded; material, disposal, tax, minimum, rates and scope remain fixed. Hypothetical synthetic cases are not market data or recommended prices.

| Case | v9 cents | v10 expected/actual cents | Change cents | Independently explained changed lines (each1→2c) |
| --- | ---: | ---: | ---: | --- |
| story-1.15 | 25 | 27 | +2 | Story labor adjustment, Story tear-off adjustment |
| shape-1.15 | 24 | 25 | +1 | Roof-shape labor adjustment |
| additional-layers-tie | 38 | 41 | +3 | Story labor adjustment, Story tear-off adjustment, Additional-layer story adjustment |
| mixed-pitch-full | 51 | 54 | +3 | Story labor adjustment, Roof-shape labor adjustment, Story tear-off adjustment |
| mixed-pitch-partial | 51 | 54 | +3 | Story labor adjustment, Roof-shape labor adjustment, Story tear-off adjustment |
| all-zero-opt-ins | 27 | 29 | +2 | Story labor adjustment, Story tear-off adjustment |
| additive-story-shape | 26 | 29 | +3 | Story labor adjustment, Roof-shape labor adjustment, Story tear-off adjustment |

The separate-line control remains **9c ($0.09)**; combining installation would incorrectly produce8c. Story27c=$0.27, shape25c=$0.25, additional-layer41c=$0.41. In every changed line, exact1.5c now rounds to2 instead of the binary-subtracted1.499999999999999c rounding to1. The other19 synthetic totals are unchanged, including the644200c positive control. Fractional rates/areas, measured/percent partial scope, mixed pitch areas, neutral factors, immediately neighboring test factors and multiple layers all have independent line fractions and cents in `expected-cases.json`. `price-corrections.json` lists the exact before/after evidence; existing unrelated monetary assertions were not updated.

Baseline26:7 pass/19 fail, including the two requested monetary failures; the9c rounding control passes. Repaired core26/26. The first integration222 run had four new test-author error-message assertions wrong (internal error name versus public dispatch code); preserved source and output explain them in `DIAGNOSIS.md`. Corrected focused run252/252, no skips/cancellations/TODOs, includes all47 new tests, all136 zero tests, existing roofing/integration/approval/startup and9 restore-rehearsal tests. Counts overlap; do not add them as distinct coverage.

## Genuine historical receipt evidence

`capture-v9.mjs` asserts pinned HEAD, unchanged server files and actual v9 engine before capturing. It uses the real saved-book publishing/explicit approval helpers, widget `submitQuote` handler, actual voice runtime/dispatcher and persisted SQLite. Four scenarios produce eight original submissions: story25c, shape24c, grouping9c, additional layers38c in both channels. No fake calculation result is injected, no outbound provider invoked. Full rows and response wording are frozen in `historical-v9.json`; `history-before.sha256` was written before production edits.

V10 tests seed these genuine rows into disposable SQLite. Original widget retries, original voice tool IDs, and fresh tool IDs with the original receipt binding return the original amounts and identical public wording. Entire original quote, submission, narration and idempotency rows remain identical before/after ordinary save, explicit reapproval and new corrected quotes. Ordinary read/save retains stale v9 approval. Without explicit owner confirmation, fresh requests remain denied/review; explicit v10 approval enables the corrected27/25/9/41c new requests without altering saved rates. Public responses contain no private rates/evidence. Synthetic clock/handle binding is preserved, so this tests historical replay rather than expiry policy.

Existing frozen paths are `quoteDoneRoutes.js:118–130`, `voiceToolRuntime.js:403–418` and dispatcher idempotency. The current-result recomputation validator is not used to rewrite history. No receipt migration or historical calculator was added. These are handler/dispatcher integration tests, not a claim about model comprehension, ASR, live speech or rendered widget behavior.

## Commands, versions and results

Local Node **v22.23.3**, npm **11.9.0**, Linux6.18.55 x86_64. `npm ci` and `npm run build` both exit0. The tracked generated `client/dist/index.html` is restored before commit. No dependencies installed/changed while tests run.

Exact command arrays, timestamps, exit codes and signals are in `*.execution.json`; original stdout/stderr are separate. `run.mjs` records a single execution and never retries.

| Execution | Process | TAP summary |
| --- | --- | --- |
| baseline | exit 1; signal None | tests=26, pass=7, fail=19, cancelled=0, skipped=0, todo=0 |
| repaired-core | exit 0; signal None | tests=26, pass=26, fail=0, cancelled=0, skipped=0, todo=0 |
| integrated-first | exit 1; signal None | tests=222, pass=218, fail=4, cancelled=0, skipped=0, todo=0 |
| focused-final | exit 0; signal None | tests=252, pass=252, fail=0, cancelled=0, skipped=0, todo=0 |
| local-browser | exit 1; signal None | tests=4, pass=0, fail=4, cancelled=0, skipped=0, todo=0 |
| local-quote | exit 1; signal None | tests=5108, pass=4990, fail=118, cancelled=0, skipped=0, todo=0 |
| local-full | exit 1; signal None | tests=6093, pass=5975, fail=118, cancelled=0, skipped=0, todo=0 |

Core command: `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/qeRoofExactSubtraction20261018.spec.mjs`.
Focused command adds `--test-concurrency=1` and the eight existing files listed exactly in `focused-final.execution.json`.
Broad commands: `npm run test:quote`, then `npm test`.
Browser command: `node --test --test-reporter=tap test/quoteStartingValues20261017.browser.spec.mjs`;4 setup failures because the Chromium headless executable is missing. Browser behavior is **NOT RUN locally**, not four product failures or four passes.
Both broad local runs fail closed: their118 unsuccessful results comprise115 missing-Chromium startup failures plus three parent/file summaries, as individually classified in `local-*-failure-classification.json`. No other failure category was observed. These are not local passing gates. The full runner's original combined TAP is also preserved in `local-full.tap`.
Docker prerequisite: `docker version` fails `spawn docker ENOENT`; local Docker smoke is **NOT RUN**.

Hosted final-SHA CI must still be inspected for install/build, Chromium launch, dedicated browser tests, strict quote and full passing summaries (including all47 new names), result checker, summary publication, dependency audit, production image build and synthetic voice Docker smoke. The existing workflow runs on `codex/**`. Branch-specific candidate Railway/restart/restore/production-user-lock/tag jobs do not run on this review branch and are not claimed as passed. No workflow change was authorized or made.

## Remaining scope and publication

No remaining arithmetic blocker is known in this scoped exact-subtraction repair after focused validation. **Pending at authoring:** final-SHA hosted verification and remote readback. Any observed hosted failure remains a blocker and will be disclosed in the handoff.

The separately assigned below-one factor policy, readiness coverage and metadata correction are still outside this repair; no claim of fixing them is made. Existing frozen historical tests/receipts and zero behavior are preserved. No release qualification, independent audit clearance, real-job accuracy, provider acceptance or deployment is asserted.

Publication procedure: commit the reviewed tree, push only the new review branch without force, verify `git ls-remote`, fetch that exact branch back, compare tree/parent/report/source/evidence hashes, and inspect its actual hosted run/logs. The Git push dry-run returned exit128 because HTTP write credentials are unavailable (`push-auth.*`). Use the authenticated GitHub connector with the identical tree and pinned parent; report the connector-created commit SHA rather than the different local-author timestamp SHA. Main is read-only and checked again at handoff.
