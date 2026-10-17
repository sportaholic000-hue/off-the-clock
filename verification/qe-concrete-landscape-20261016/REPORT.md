# Concrete, sod preparation and planting — October 16, 2026

## Broken, skipped or not run

**Local Chromium cannot complete launch**: the workspace-installed Playwright 1.56.0 headless shell exits with `SIGTRAP`. Browser results are not locally verified.

**The first hosted CI run failed**: [run 38982131338](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38982131338), on exactly `5b506224dafaaf17010cde4e2854e22cabda9de1`, printed **4,686 passed, 1 failed, 0 skipped** in the strict quote gate (4,687 tests; cancelled 0, todo 0). It exposed a real metadata defect: the three new concrete choices rendered as numeric inputs, so the owner browser test could not select control-joint inclusion. The field lookup is repaired in this checkpoint, and the actual owner DOM test now checks that all three choices start blank and persist unchanged. The first hosted full suite, failure checker and production dependency audit were skipped after that failed gate. The final pushed commit and its exact hosted CI run/result are supplied in the delivery message; this earlier failure is not counted as a pass.

**The second hosted run also failed**: [run 38983580213](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38983580213), on `6102c1d0ac380e82207c7d6c8349470780e1e960`, again printed **4,686 passed, 1 failed, 0 skipped** (4,687 tests; cancelled 0, todo 0). The dropdown actions, saved rates and reopened price passed. The remaining failure was the browser test reading the spacing warning while asynchronous validation still displayed `CHECKING`. This checkpoint waits for that warning before applying the same original assertion; it changes no production code, timeout or expected warning. An expanded DOM check independently confirms the displayed 15-foot/10-foot warning. The second hosted full suite, checker and audit were also skipped. A later five-file local focused attempt exited without a TAP summary and is not counted as passing; the final isolated DOM run passed **2/2**, with zero failures, cancellations, skips or TODOs.

The initial Node 24 clean install failed compiling `better-sqlite3`; subsequent local installs and builds use Node 22.23.3. Earlier failed test attempts and their repairs are retained below rather than counted as passes. The first unauthenticated push failed and a verified bundle was delivered. After the owner supplied credentials and explicitly authorized another attempt, the native Git push succeeded and `git ls-remote` verified the exact published commit above. The bundle-only publication limitation is resolved.

The first local strict quote gate failed: **4,555 passed, 119 failed, 0 skipped** (4,674 tests; cancelled 0, todo 0). One failure was the new shared field lookup calling `startsWith` on an absent service type; this is repaired. One was an existing catalog timing assertion (2,096/2,098 ms against its budget). The other failures were Chromium launch failures, including the new browser tests. The full suite also failed locally: **5,536 passed, 118 failed, 0 skipped** (5,654 tests; cancelled 0, todo 0). Its 117 Chromium failures and one different catalog timing assertion remain in the original log. The repaired persistence test passed. The isolated catalog rerun subsequently passed **8/8**, with no failures or skips. All 35 new non-browser tests passed in the full run. After the hosted dropdown defect was reproduced locally, its focused repair run passed **45/45**, with zero failures, cancellations, skips or TODOs. No production deployment or live telephone/audio test is part of this change.

## Branch and final revision

Branch: `codex/qe-concrete-landscape-20261016`.

Exact starting commit: `8b53169b2d6019e6769481b5c0551aca42a91f42`, verified against `origin/codex/qe-flooring-20261016`. No main merge. Source/test commit `bf191bc0249b446fa45e57341d0fab5737e46da0` and the historical bundle-delivery commit `5b506224dafaaf17010cde4e2854e22cabda9de1` are preserved. The latter was successfully pushed after the owner's authorized retry and verified with `git ls-remote`. This subsequent checkpoint repairs the concrete dropdown metadata and extends its DOM coverage; the final delivery message supplies its exact remote SHA and hosted CI result.

The metadata repair was pushed as `6102c1d0ac380e82207c7d6c8349470780e1e960` and independently verified by `git ls-remote`. The following warning-wait checkpoint changes tests and this report/evidence only; production files retain the metadata-repaired revision. Its final commit is also checked with `git ls-remote` before delivery.

## Files changed

| Files | Change |
|---|---|
| `server/quote-engine-vnext/concreteLandscapePricing.js` (new) | Scoped optional fields, exact quantity helpers, definitions, validation, warning and copy. |
| `server/quote-engine-vnext/templates.js` | Concrete short loads, saw cuts, placement and base preparation; sod preparation/topsoil; named plant pricing. |
| `server/quote-engine-vnext/contracts.js` | Scoped customer/owner fields, ranges, placement choices, topsoil unknown allowance and custom plant keys. |
| `server/quote-engine-vnext/priceBook.js` | Scoped readiness scenarios, optional metadata and owner notices. |
| `server/priceBookMoney.js`, `server/pricePrecision.js`, `server/priceBookLabels.js` | Monetary units, flat-charge precision, and exact owner plant names. |
| `server/interviewConfiguration.js`, `server/src/priceBookAI.js` | Plant definition/pricing interviews; new optional concrete/sod fields excluded from starter-price suggestions. |
| `server/src/quoteDoneBridge.js` | Scoped metadata, plant interview order and metadata-helper exports through the existing bridge; receipt functions unchanged. |
| `server/src/quoteIntake.js` | Exact plant names in saved customer job facts. |
| `server/src/voice/voiceQuoteContract.js`, `server/src/voice/voicePromptCompiler.js` | Exact plant-name binding, Not sure chute binding and additive concrete/landscaping instructions. |
| `client/src/PlantSizesEditor.jsx` (new) | Named shrub/tree definitions and matching per-plant price rows. |
| `client/src/pricebook.jsx`, `client/src/interviewConfiguration.jsx`, `client/src/interviewStructuredValue.js` | Owner placement and plant controls, interview trees. |
| `client/src/quoteDoneControls.jsx` | Customer named plant counts; clear stale placement/topsoil answers when their scope changes. |
| `test/quoteConcreteLandscape20261016.spec.mjs` (new) | Requested arithmetic, disclosures, blank defaults and 42 baseline comparisons. |
| `test/quoteConcreteLandscapeDelivery20261016.spec.mjs` (new) | Phone/web/save/synthetic email delivery, owner persistence, live readiness and copy. |
| `test/quoteConcreteLandscapeValidation20261016.spec.mjs` (new) | Boundary/invalid cases, tier ranges, zero import depth and labor access. |
| `test/quoteConcreteLandscape20261016.browser.spec.mjs` (new) | Three actual React/browser owner and customer workflows. |
| `test/quoteConcreteLandscape20261016.dom.spec.mjs` (new) | Actual React owner controls exposed and edited with DOM events, persisted through the real bridge. |
| `test/quoteConcreteLandscape20261016Fixture.mjs`, `test/quoteConcreteLandscapeLegacy20261016.json` (new) | Synthetic fixtures and baseline results captured before production edits from the exact starting SHA. |
| `verification/qe-concrete-landscape-20261016/` (new) | This report, complete proposed wording and execution evidence. |

No spec file, `priceGroundwork.js`, `purchasedQuantityVNext`, `quoteDoneApproval.js`, immutable receptionist guide, or roofing/painting/siding/flooring/fencing/mowing/cleanup implementation was changed. Existing generated client build files are restored before committing; CI builds the changed source.

## Spec lines departed from

The owner's written October 16 task expressly authorizes these departures. Line numbers refer to the unchanged files at the pinned base. Additive extensions are identified separately from formulas that are replaced only when an owner opts in.

| Spec and lines | Departure / extension |
|---|---|
| `quote_engine_v2.md:31–36` | The task authorizes UI edits and extensions to completed code despite the historical backend-only scope and stop-on-conflict rule. |
| `quote_engine_v2.md:69–73,1141–1143` | Custom plant definitions replace the fixed size-key domain. Both existing labor/material maps must price the owner's defined keys. Blank definitions retain the original Small/Medium/Large domain. |
| `quote_engine_v2.md:953–955` | Add the chute question and conditional offered placement choice. Missing chute input remains compatible with historical quotes. New interactive flows ask it. |
| `quote_engine_v2.md:964–969,1014–1015` | Separate gravel by owner depth/compaction plus excavation/grading labor can replace the single area-based base price. Labor uses the existing concrete access adjustment. |
| `quote_engine_v2.md:984–987,1007–1010` | Add optional thickness limits to each labor price. State control-joint inclusion separately; excluded joints may be separately priced by LF with the labor access adjustment. The existing forming/expansion-joint/cure/seal wording remains. |
| `quote_engine_v2.md:1004–1005,1011–1015` | Add a supplier short-load line based on already-rounded ordered yards, saw cuts, and flat/volume placement. No purchase-rounding formula is changed. Placement uses the existing Additional work category; supplier surcharge uses Materials; saw cuts use Labor. |
| `quote_engine_v2.md:1028–1034` | The same new options apply to patio/slab service. Square equal-area geometry is used only for the new nonrectangle joint allowance, not to infer the existing formwork perimeter or revive retired area-only inputs. |
| `quote_engine_v2.md:1109–1110` | Add usable topsoil depth or Not sure only when separately priced topsoil preparation is selected. |
| `quote_engine_v2.md:1114–1118,1131–1132` | Separate old-lawn removal/disposal and grading labor use existing sod slope/access adjustments. Imported topsoil is the nonnegative target-depth deficit, or the owner's explicit typical import depth for Not sure. Any separate preparation price replaces the old combined prep line. |
| `quote_engine_v2.md:1150–1152` | The same per-plant labor/material formulas now iterate owner-defined size keys and disclose the exact names. Legacy keys/amounts are preserved. The baseline's already-existing `plantsBySize` model is not a new departure introduced here. |
| `QUOTE_TRADE_DECISIONS_20261003.md:92` | Explicit exception to the ruling that mixed concrete/sod preparation stays a single line: optional split labor/material pricing, each following its category's markup, tax and peak rules. Blank new rates keep the old line. |
| `QUOTE_AUDIT_DECISIONS_20261004.md:62` | The old mixed-preparation line remains exempt from labor peak surcharge. New separately priced excavation, removal-with-disposal and grading are labor and use the existing labor peak rules. Standalone common disposal is unchanged. |
| `voice_quote_flows.md:307–310,319–321` | A confirmed thickness outside an owner labor range now reviews. Ask chute reach separately from general project access; price the offered method/unknown allowance and read its site note. |
| `voice_quote_flows.md:323–325` | Patio flow inherits the same concrete additions. Approximate numeric dimensions remain accepted; no size-category input is introduced. |
| `voice_quote_flows.md:363–365` | Add the conditional usable-topsoil question and allowance disclosure after preparation selection. |
| `voice_quote_flows.md:375–377` | For custom definitions, ask the owner's exact plant-size names instead of undefined Small/Medium/Large. Legacy services retain their old names. |

The approximate-measurement ruling is implemented as trade-specific additive instructions and the existing confirmed-estimate flag/site sentence. Shared voice paragraphs are unchanged. The 5-inch spacing boundary uses the more conservative 10-foot cap because the supplied 4–5 and 5–6 bands overlap at 5.

## Commands and exact counts

Counts are exactly the runner's printed summary, not sums of overlapping test runs. Install/build/probe/git commands do not print test pass/fail/skip counts and are marked “not printed”.

Runtime setup after the initial failure: `PATH=/workspace/scratch/23672e44728b/node22/node_modules/.bin:$PATH`, `TMPDIR=/workspace/scratch/23672e44728b/tmp`; browser attempts and broad gates use `PLAYWRIGHT_BROWSERS_PATH=/workspace/scratch/23672e44728b/playwright-browsers`. No skipped-test workaround or changed gate is used.

| Command | Exit | Pass | Fail | Skipped | Evidence / result |
|---|---:|---:|---:|---:|---|
| `npm ci` (initial Node 24.19.0) | 1 | not printed | not printed | not printed | Native dependency/header extraction failed; `initial-npm-ci.log.gz`. |
| `npm install --prefix ../node22 --no-save --no-package-lock --no-audit --no-fund node@22` | 0 | not printed | not printed | not printed | Local Node 22.23.3 runtime installed; `node22-install.log.gz`. |
| `npm ci` (first Node 22 install) | 0 | not printed | not printed | not printed | `node22-npm-ci.log.gz`. |
| `node --test test/quoteConcreteLandscape20261016.spec.mjs` (first attempt) | 1 | 0 | 1 | 0 | Fixture could not create temporary directory before TMPDIR was set; `concrete-landscape-focused-1.tap.gz`. |
| Same command, TMPDIR set | 1 | 15 | 1 | 0 | Baseline comparison included an undefined property absent in JSON. Comparison was normalized without changing expected cents/quantities; `concrete-landscape-focused-2.tap.gz`. |
| Same command after comparison repair | 0 | 16 | 0 | 0 | `concrete-landscape-focused-3.tap.gz`. |
| `node --test test/quoteConcreteLandscapeDelivery20261016.spec.mjs` | 1 | 6 | 1 | 0 | Test omitted required business defaults in the dollars-conversion fixture. Fixture corrected; `concrete-landscape-delivery-1.tap.gz`. |
| `node --test test/quoteConcreteLandscape20261016.spec.mjs test/quoteConcreteLandscapeDelivery20261016.spec.mjs` | 1 | 20 | 3 | 0 | Parallel fixtures shared SQLite paths (READONLY_DBMOVED). Subsequent runs use the repository runners’ sequential-file setting; `concrete-landscape-focused-4.tap.gz`. |
| `node --test test/quoteConcreteLandscapeValidation20261016.spec.mjs` | 1 | 7 | 1 | 0 | Zero typical topsoil import was wrongly treated as a zero money price; fixed quantity requirement classification; `concrete-landscape-validation-1.tap.gz`. |
| `node --test --test-concurrency=1 test/quoteConcreteLandscape20261016.spec.mjs test/quoteConcreteLandscapeDelivery20261016.spec.mjs test/quoteConcreteLandscapeValidation20261016.spec.mjs` (31-test version) | 0 | 31 | 0 | 0 | `concrete-landscape-focused-5.tap.gz`. |
| Same three-file sequential command (32-test version) | 0 | 32 | 0 | 0 | `focused-final.tap.gz`; one later invalid-service-type test is included in broad gates. |
| `npm ci` (required clean install) | 0 | not printed | not printed | not printed | `npm-ci.log.gz`; added 328 packages. |
| `npm run build` | 0 | not printed | not printed | not printed | `npm-build.log.gz`; owner and widget builds passed; chunk-size warning. |
| `npm install --no-save --no-audit --no-fund playwright@1.56.0` | 0 | not printed | not printed | not printed | `npm-playwright.log.gz`; installed pinned test dependency without lockfile change. |
| `npx playwright install chromium` (default cache) | 0 | not printed | not printed | not printed | `playwright-chromium.log.gz`; command reported success, but the subsequent executable was unavailable. |
| `node --input-type=module -e 'import {chromium} from "playwright"; const browser=await chromium.launch({headless:true,args:["--no-sandbox"]}); await browser.close(); console.log("Chromium launch passed");'` | 1 | not printed | not printed | not printed | `chromium-probe.log.gz`; executable unavailable. |
| `npx playwright install chromium` (workspace browser path) | 1 | not printed | not printed | not printed | `playwright-chromium-workspace.log.gz`; truncated first mirror and browser-directory lock update failure. |
| `npx playwright install --only-shell chromium` (workspace browser path) | 1 | not printed | not printed | not printed | `playwright-shell.log.gz`; headless shell downloaded, later FFMPEG/lock update failed. |
| Same Chromium launch probe (workspace browser path) | 1 | not printed | not printed | not printed | `chromium-workspace-probe.log.gz`; process launched then exited SIGTRAP. |
| `npm run build` (second build) | 0 | not printed | not printed | not printed | `npm-build-final.log.gz`; passed. The final source build is listed with the broad gates below. |

All completed focused runs printed `cancelled 0` and `todo 0`. Expected arithmetic and statuses were written before each new test was executed. Baseline snapshots were produced before implementation changes.

Repository/setup and inspection commands: `git clone`, `git fetch`, `git ls-remote`, `git switch -c`, `git rev-parse`, `git branch --show-current`, `git status --short`, `git show`, `git diff` / `git diff --check`, `rg` / `rg --files`, `cat`, `sed`, `nl`, `tail`, `head`, `du`, `wc`, runtime version checks, directory creation, file copying and documentation generation. These print no test counts. `git diff --check` passed, and the forbidden-file diff was empty. Read-only searches with no matching text returned exit 1; no test pass is inferred from an inspection command. The first `npm run test:quote` exited 1 and printed `tests 4674`, `pass 4555`, `fail 119`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 1087253.130315` (`npm-test-quote.log.gz`). It selected 244 files before the two new DOM tests were added; those were separately executed with `node --test --test-concurrency=1 test/quoteConcreteLandscape20261016.dom.spec.mjs`: exit 0, `tests 2`, `pass 2`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0` (`focused-dom.tap.gz`). The final full suite includes the DOM file.

After the field-lookup repair, `node --test --test-concurrency=1 test/pricebookPersistenceEditor20261005.spec.mjs test/quoteConcreteLandscape20261016.spec.mjs test/quoteConcreteLandscape20261016.dom.spec.mjs test/quoteConcreteLandscapeDelivery20261016.spec.mjs test/quoteConcreteLandscapeValidation20261016.spec.mjs` exited 0: `tests 45`, `pass 45`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0` (`focused-post-gate.tap.gz`). This includes the existing failing persistence test and all 35 new non-browser tests.

`npm run build` on the final client source exited 0 (`npm-build-release.log.gz`); no test counts are printed. The nonrectangle joint disclosure was then made explicit about the rounded LF allowance; its expected 97.98-LF assertion is included in the full suite. `npm test` exited 1 and printed `tests 5654`, `pass 5536`, `fail 118`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 1036083.330497` (`npm-test.log.gz`). The full-suite checker also failed, as required, on those failures. The only non-browser failure was `QP-03 320-product incomplete; quick=true`, reporting status/timer durations 7,547/7,564 ms. The strict-run timing failure (`all_free; quick=false`) passed in this full run.

`node --test --test-concurrency=1 test/quoteCatalogScaling20261005.spec.mjs` then exited 0 and printed `tests 8`, `pass 8`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 3392.174942` (`catalog-timing-rerun.tap.gz`). The original test budgets and assertions were not changed. An isolated pass does not turn either broad local gate into a pass.

Evidence packaging uses Python gzip with a fixed timestamp on all raw execution logs, preserving their exact bytes. The first staged whitespace check flagged whitespace already present in raw tool output; storing those logs as gzip leaves that output intact and makes the final source/documentation whitespace check clean. `git restore --source=HEAD -- client/dist` restores only this task's generated tracked build outputs. A combined cleanup command was rejected before execution because recursive forced removal was disallowed; the safer cleanup targeted only the four known generated `controls.mjs`/`scope.mjs` files and their empty folders. The runtime restores these execution artifacts, so the two generated folders are excluded locally and are not committed. Final `git diff --check` and protected-file comparisons pass. These commands print no test counts.

The first `git commit -m "Add optional concrete and landscape pricing controls"` failed because this checkout had no author identity. The retry uses the one-command identity `git -c user.name=Codex -c user.email=codex@openai.com commit`, without changing global Git settings. No test counts are printed.

`git add` and the one-command Codex-identity commit succeeded. The original `git push -u origin HEAD:refs/heads/codex/qe-concrete-landscape-20261016` exited 128 because credentials were unavailable. The prescribed `git bundle create concrete-landscape.bundle 8b53169b2d6019e6769481b5c0551aca42a91f42..HEAD`, `git bundle verify concrete-landscape.bundle`, and `sha256sum concrete-landscape.bundle` supplied the original delivery; no alternate publication route was attempted in that turn. These commands print no test counts.

The owner then supplied a credential and explicitly said to try again. Git's native terminal prompt again failed with exit 128. The same native Git push, using a temporary askpass helper with the credential held only in the process environment, exited 0. `git ls-remote origin refs/heads/codex/qe-concrete-landscape-20261016` exited 0 and returned `5b506224dafaaf17010cde4e2854e22cabda9de1`. No credential was written to a file, remote URL, repository setting or credential store. No test counts are printed by these Git commands.

First hosted run [38982131338](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38982131338) used exactly that commit. Its `npm ci`, pinned `npm install --no-save --no-audit --no-fund playwright@1.56.0`, Chromium installation/launch probe, `npm run build`, and separate Docker voice-startup job passed; these steps do not print the requested test summary counts. The owner-alert/dashboard browser command printed `tests 12`, `pass 12`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 9170.292579`. `npm run test:quote` exited 1 and printed `tests 4687`, `pass 4686`, `fail 1`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 719301.652612`. Its only failure was the new concrete owner browser test waiting for the missing control-joint select. The planting and customer browser tests passed. `npm test`, the full-suite checker and dependency audit did not run. Exact failure context and printed summaries are preserved in `hosted-38982131338-excerpt.log.gz`; it is explicitly an excerpt, with the complete job log available in the linked run.

Before the repair, the strengthened `node --test --test-concurrency=1 test/quoteConcreteLandscape20261016.dom.spec.mjs` reproduced the missing control: exit 1, `tests 2`, `pass 1`, `fail 1`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 1913.230072` (`dropdown-reproduction.tap.gz`). The repair changes only the new metadata lookup from the field object to its field-name key. The expected blank choices, saved Excluded/Pump values and exact 150000-cent pump charge were written into the test before execution.

After the repair, `node --test --test-concurrency=1 test/pricebookPersistenceEditor20261005.spec.mjs test/quoteConcreteLandscape20261016.spec.mjs test/quoteConcreteLandscape20261016.dom.spec.mjs test/quoteConcreteLandscapeDelivery20261016.spec.mjs test/quoteConcreteLandscapeValidation20261016.spec.mjs` exited 0 and printed `tests 45`, `pass 45`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 9579.782644` (`dropdown-focused.tap.gz`). The final hosted run re-executes the ordinary cold gates; no gate, timeout, failure allowance or expected arithmetic is weakened. The delivered remote SHA, run ID and results are reported together in the final response.

Second hosted run [38983580213](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38983580213) passed the same clean install, pinned Playwright/Chromium setup, builds, browser smoke command and Docker voice-startup job. The smoke command printed `tests 12`, `pass 12`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 6118.204908`. The strict gate printed `tests 4687`, `pass 4686`, `fail 1`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 685912.994637`. Only the owner test's immediate post-reload warning assertion failed; its actual page still showed `CHECKING`. The complete log is linked above, and exact selected failure lines/counts are retained in `hosted-38983580213-excerpt.log.gz`. The hosted full suite, checker and dependency audit did not run.

After adding the asynchronous warning wait and DOM warning assertion, the same five-file focused command exited 0 but ended after 12 `ok` results without a runner summary (`warning-focused.tap.gz`). Pass/fail/skip totals were **not printed**; this incomplete attempt is not claimed as a passed suite. The isolated `node --test --test-concurrency=1 test/quoteConcreteLandscape20261016.dom.spec.mjs` then exited 0 and printed `tests 2`, `pass 2`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 3155.378136` (`warning-dom.tap.gz`). This verifies actual DOM choices, saved cents and the expected 15-foot spacing versus 10-foot cap warning. The browser assertion is preserved and now waits for the asynchronous warning rather than sampling the interim Checking state.

## Proposed labels and wording

[WORDING.md](WORDING.md) contains every new owner/customer label, help string, option, line name, notice, review message and additive phone instruction. These strings are proposed explicitly here, not represented as separately approved copy.

## Verification limits

- No real audio conversation, external email delivery or production deployment. Phone and email tests use synthetic tools, persisted receipts and an in-memory delivery adapter; the original quote receipt implementation is untouched.
- Local Chromium cannot complete launch. Both earlier hosted runs verified the existing browser smoke checks and the new planting/customer browser cases; the concrete owner case reached its save/reload assertions after the metadata repair but checked its warning too early. Its complete DOM workflow, including the warning, passes locally. The final delivery message reports the exact final commit's hosted browser and full-suite outcome.
- The 42 baseline cases cover both concrete services, multiple thickness/access/preparation selections, sod slope/access/preparation, and all legacy plant sizes. This is concrete regression evidence, not a claim to exhaust every possible quote.
- Defaults remain blank. No rate from the audit's examples was saved as a system or owner default. Prices in tests are explicitly synthetic.
