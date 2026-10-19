# Harness integration correction

Reviewed Agent1 parent: `150aa4786c0f96b2eb612bf6e02c19fd423cfb74`
Exact A2 checkpoint: `00523290be44c522254e2e736756d0a6eba0aba3`
Published branch remains `codex/qe-agent1-roof-pitch-activation-20261019`; A2 owns subsequent integration. No subagents.

## Precise correction

`audit.mjs` loses only the automatic whole-checkout ownership comparison/throw (three lines, replaced by two explanatory comments). Its behavioral cases, independent amounts, approval/capture guards, HTTP/voice operations, comparisons, error handling and exit status are unchanged. The original113 regressions and their assertions remain byte-identical. No source/test filename is added to the ownership allowance.

`qualify-source.mjs BASE_COMMIT HEAD_COMMIT` is a separate explicit ownership check. It resolves both commit refs, requires forward ancestry, and checks the changed paths in that named range using the original Agent1 ownership boundary. It does not infer a range from the checkout. Other committed or dirty checkout work is irrelevant when qualifying an Agent1-only range. Naming a range containing A2 work correctly rejects it as outside Agent1 ownership, without preventing behavioral regressions on that combined tree.

Run source qualification explicitly before handing off the Agent1 tip:

```sh
node verification/qe-agent1-roof-pitch-activation-20261019/qualify-source.mjs 2b452feeb1af7c288c19b12bea5b95e48b81920e <Agent1-correction-commit>
```

Normal behavioral test commands remain unchanged. This source-qualification command is never called automatically by audit.mjs or any existing regression.

## Reproduction and combined verification

Created detached local merge `fe15d4318315703a617f3c0b2b464bae616de890`, with ordered parents150aa478 and00523290. No conflicts. The unchanged audit exited1 with `Unowned changes` before executing any behavioral cases. Its normally selected channel spec also failed because no results.json was produced. Both failed logs are retained.

Applied only the proposed audit correction and qualification helper in that detached worktree, recording local-only commit `a335fc761ff8bf448b14a4b5cfc7b175dbe35fac` (parent fe15d431). Both exact histories remain ancestors. This local commit was never pushed. The two helper files are byte-identical to the correction branch files.

| Check | Actual result |
|---|---:|
| Agent1 unchanged regressions on its own corrected tree |113/113 passed|
| Combined Agent1 plus A2's five voice/import files |690/690 passed|
| Of combined results: unchanged Agent1 regressions |113/113 passed|
| Of combined results: A2 voice/import regressions |577/577 passed|
| Standalone source-qualification tests |5/5 passed|
| Deliberate child-server startup failure |exit1, fatal.json,0 cases executed (expected)|

All successful test runs have zero failures, skips, cancellations and TODOs. Qualifying the original scoped2b452..150aa range from the combined checkout succeeds; explicitly qualifying the combined range rejects unowned paths (expected). No growing allowlist of A2 filenames.

The independent monetary expectations are unchanged:391000-cent low pitch,539000-cent full over-12,465000-cent half-mixed,391000 accepted-zero,451800/485800 unknown complete standard bands; missing selected pricing remains review-only.

## Preservation

`source-preservation.json` records both local histories, the combined tree, reviewed priceBook blob and hashes proving the62 other original repair files are unchanged. Production, existing tests, original independent amounts, historical receipts, original evidence, versions, approvals, selectors and workflows are unchanged. The seven A2 production/test files exactly match00523290 in the combined tree. Original SHA256SUMS remains a record of the reviewed150aa checkpoint; this correction has its own separate evidence manifest.

Verification uses synthetic disposable storage, shared installed dependencies and real local application/voice runtime paths. It makes no live provider sends or deployments. No A2 branch, integration/main ref, workflow or specification is written.

## Commands

```sh
node --test verification/qe-agent1-roof-pitch-activation-20261019/harness-integration-20261019/qualification.spec.mjs
node --experimental-test-module-mocks --test --test-concurrency=1 test/qeAgent1RoofPitchActivation*.spec.mjs
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-concurrency=1 test/qeAgent1RoofPitchActivation*.spec.mjs test/voiceAgent4ImportPunctuation20261019.spec.mjs test/voiceAgent4ListedImport20261018.spec.mjs test/voiceAgent4ParenthesizedConditions20261018.spec.mjs test/voiceAgent4WebsiteQualifications20261018.spec.mjs test/voiceListedPriceConditions20261018.spec.mjs
```

Node22.23.3. Complete exact-new-head hosted conclusions and final publication identity are recorded by GitHub Actions and in the final handoff after observation; no pending gate is represented here as passed.
