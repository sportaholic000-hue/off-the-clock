# Accepted-zero roofing repair — local validation complete; exact-final hosted CI pending at authoring

Base: **1857b7779b83b70f7753b41b72c3677270cd4ffc**.
Reviewed evidence: **befc00358dfc82a864eaffeb229db7c386045051**.
Branch: **codex/qe-roof-zero-adjustments-20261018**.

The new remote branch was absent before creation. Work uses an isolated clone at the exact base, not another agent's checkout. No subagents, main merge, tag, deployment, provider calls, real data or messages. Main was read as ed12dca1253a8790c885b071ab6037e05632bea0. The final chat supplies the published SHA, readback, exact-SHA CI and actual hosted outcomes; this committed report does not claim pending checks passed.

## Defect and repair

The accepted Class2 zero pitch/layer values pass contracts.js validation, but four adopted-roof multiplier uses rejected zero through makeLine's default quantityFactor guard. Baseline normal regressions produced **127 tests:37 pass/90 fail**, including all four required zero controls. Original TAP, expected calculations, source and exit status are retained.

Only the adopted-roof function in `server/quote-engine-vnext/templates.js` changes calculation construction:
- Steep-pitch installation and removal lines accept explicit numeric zero.
- Additional-layer tear-off and its separate story adjustment accept explicit numeric zero.
- Each opt-in is conditional on `===0`, leaving positive-factor evidence byte-identical.
- Missing/null/blank/string/nonfinite/negative factors still fail. The shared guard is untouched. Story/shape multipliers, their ranges and calculations are untouched. Disposal remains charged for every layer.

Both production version literals advance to **quote-engine-vnext-accuracy-20261018-v9**: `server/quote-engine-vnext/engine.js` and `server/src/runtimeConfig.js`. Prior-version approval cannot authorize new requests. Explicit reapproval retains prices; historical receipts retain their original version and amounts.

`check-scope.mjs` verifies templates.js is byte-identical outside the adopted-roof function, including the shared quantity guard and concrete/sod sections. It also verifies normal full and strict-quote selection includes the new file. No selection or workflow edit.

## Independent controls and coverage

All expected arithmetic was written before engine execution in EXPECTED-FIRST.md; EXPECTED.md contains the documented arithmetic correction. Synthetic base:10 roofing squares,20000c labor,10000c material with10% waste,6000c first-layer removal,100c installed underlay and2000c disposal per layer/square. Base391000c; markup/tax/buffer zero. No owner rate or policy is inferred.

| Control | Expected / repaired actual cents |
|---|---:|
| Positive upper pitch .31/.41 |485800 /485800|
| Zero upper installation |423800 /423800|
| Zero upper removal |453000 /453000|
| Three layers, additional-layer factor0, one story |431000 /431000|
| Same scope, two stories |457000 /457000|

The new normal file has **136 tests**:
- Separate and combined zero installation/removal for7–9,10–12 and explicitly configured over12; up-to-six inactive-zero control.
- Full scope, measured partial area, partial percentage, mixed measured pitch areas, and owner-selected unknown pitch.
- Two/three/four layers with one/two/three stories and full/partial scope; combined zero pitch/layers; exact half-cent rounding.
- Missing, malformed, negative and nonfinite factors; missing product confirmation.
- Four genuine pre-edit positive line-item snapshots remain exactly equal, including private calculation evidence.
- Six actual saved-book widget submitQuote and real voice dispatcher scenarios persist matching expected amounts; no private pricing in public responses and no email sends.
- Owner-entered zeros survive save/confirmation/approval. Missing confirmConfiguration rejects. An approved configuration with used unconfirmed proposals remains non-live; each explicit setting confirmation remains required. Confirmation metadata does not rewrite an existing explicit configuration approval.
- A genuine v8 saved book/receipt, captured on unchanged pinned production, remains stale through read/save. Fresh widget and voice requests are blocked. Explicit v9 approval preserves pricing. A subsequent zero-price-factor edit requires fresh approval. The corrected423800c quote and original485800c receipt coexist; replay preserves entire original submission and quote rows byte-for-byte.

The new version guard also refuses v8 startup while retaining its v6/v7/empty rejection controls.

## Files changed

Production: the scoped four multiplier sites plus the two version literals above.

New normal regression: `test/qeRoofZeroAdjustments20261018.spec.mjs`.

Directly affected current-version expectations only:
- `test/backupRestoreRehearsal.spec.mjs`: current ready version literal.
- `test/finalIntegrationMetadata20261017Fixture.mjs`: explicit live metadata target; original v7 fixtures untouched.
- `test/qeAccuracyIntegration20261018.spec.mjs`: current version identifier (renamed local constant CURRENT); all dollars and frozen historical assertions preserved.
- `test/qeRoofUnderlaymentAccuracy20261018.spec.mjs`: live version/metadata assertions and descriptions; historical v7 evidence and dollar assertions preserved.
- `test/quoteReviewFixes.spec.mjs`, `test/quoteStartingValues20261017.spec.mjs`, `test/quoteStartingValues20261017.browser.spec.mjs`: current version literals; old approval rejection and explicit reapproval assertions preserved.
- `test/releaseProductionEngineGuard.spec.mjs`: expected current version and newly stale v8 case; previous cases retained.

All other changes are evidence under this directory. Build-generated tracked client/dist/index.html was restored. No specs, workflow, dependency, public wording, frozen historical fixture, or other agent's section is edited.

## Commands and results

Node **v22.23.3**, npm **11.9.0**; platform in runtime.txt. Repo-local dependencies installed once with npm ci before testing. Synthetic temporary books/databases only. All commands below run at repository root. E means `verification/qe-roof-zero-adjustments-20261018`.

| Command | Actual result |
|---|---|
| `npm ci` |Exit0;328 packages; stdout/stderr retained.|
| `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/qeRoofZeroAdjustments20261018.spec.mjs` on unchanged production |127 tests,37 pass/90 fail;exit1 (`baseline.*`).|
| `node verification/qe-roof-zero-adjustments-20261018/capture-baseline.mjs` on unchanged production |Exit0;4 positive snapshots and genuine485800c/v8 saved receipt,0 provider calls. Guard refuses recapture on changed production.|
| Same new-file command after the scoped repair |127 tests,126 pass/1 fail;exit1 (`repaired-core.*`). My rounding-example component sum was100c too high; corrected to42402, original preserved.|
| Same command after adding integration coverage |136 tests,129 pass/7 fail;exit1 (`integrated-first.*`). Six voice-storage assertion paths and one approval-contract test assumption corrected; no production changes.|
| Same command after those test corrections |136 tests,135 pass/1 fail;exit1 (`integrated-corrected.*`). Readiness diagnostic asserted at the wrong application stage.|
| Same command with `--test-name-pattern='saved new proposals'` |1 test,0 pass/1 fail;exit1. Incorrect assumption that confirming metadata invalidates an existing explicit approval; corrected to assert the approval receipt is unchanged.|
| Focused command below |248 tests,243 pass/5 fail;exit1 (`focused-final.*`). **All136 new regressions passed**. Five startup/restore failures identified missing unbuilt bundles.|
| `npm run build` |Exit0;owner and widget bundles built.|
| Startup/restore command below after build |**14/14 pass**,0 failures/skips/cancellations/TODO;exit0. Includes5 release guards and9 restore results.|
| `node verification/qe-roof-zero-adjustments-20261018/check-scope.mjs` |Exit0;source boundaries and automatic test selection verified.|
| `node --input-type=module -e "import('playwright').then(async({chromium})=>{const b=await chromium.launch({headless:true,args:['--no-sandbox']});await b.close();console.log('Chromium launch passed');})"` |Exit1:ERR_MODULE_NOT_FOUND for local Playwright. Browser tests NOT RUN locally; hosted working Chromium required.|
| `git diff --check -- server test` |Exit0. Raw failed TAP is preserved without whitespace rewriting.|

Focused command:
```
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-concurrency=1 --test-reporter=tap test/qeRoofZeroAdjustments20261018.spec.mjs test/quoteRoofing20261016.spec.mjs test/quoteStartingValues20261017.spec.mjs test/qeRoofUnderlaymentAccuracy20261018.spec.mjs test/qeAccuracyIntegration20261018.spec.mjs test/quoteReviewFixes.spec.mjs test/releaseProductionEngineGuard.spec.mjs test/everytrade20261017.spec.mjs test/backupRestoreRehearsal.spec.mjs
```
Post-build command (only affected startup files rerun):
```
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-concurrency=1 --test-reporter=tap test/releaseProductionEngineGuard.spec.mjs test/backupRestoreRehearsal.spec.mjs
```

Counts overlap; do not sum unsuccessful attempts into distinct coverage. DIAGNOSIS.md identifies each unsuccessful execution and its correction. Final production fix did not change after the initial scoped edit; later corrections concern test-author mistakes and the build prerequisite. Original baseline/integrated test sources and unsuccessful TAP remain.

## Hosted qualification and limitations

At authoring: **pending publication / exact-final hosted CI**. Existing CI for codex/** runs installation, Chromium launch, owner/widget build, dedicated browser checks, strict quote gate, full suite, strict checker, summary publication, dependency audit, production Docker build and synthetic voice Docker smoke. The final handoff must inspect these actual results for the published SHA; green prior commits are insufficient.

Candidate-specific standalone/Railway/lock-database jobs are branch-conditional and will be skipped on this review branch. No workflow changes are authorized or made. Local full/strict suites and Docker are NOT RUN; the exact-final hosted run supplies their applicable evidence. No real spoken/model, provider, Railway, account or deployment acceptance is claimed.

SHARE at authoring: exact-final hosted qualification remains pending. No remaining accepted-zero defect was observed in the repaired136-test coverage. Below-one story/shape ranges are explicitly outside scope and unchanged; their separate investigation is not resolved here. Independent release audits/assembly remain separate.
