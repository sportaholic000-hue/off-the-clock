# Customer quote wording repair — October 1, 2026

The requested wording repairs pass verification. The full hosted suite remains red with the same 28 failures present upstream; this is not a whole-project or launch acceptance. The extended local cold run has no completed result and is not counted as a pass.

## Tested source

- Final code/test commit: `b7b329f59303159618588c24d01747daf22be533`.
- Final code/test tree: `a439074281d28991d0bcdfc0d25a60464d1a80d0`.
- Original reproduction baseline: `d03a2a3b5e80eb78ca40d3620d0f6dd47d54e809`.
- Later upstream CI changes at `fbf6e2767f1fae66fbc232c5d03a6ed4c9215364` were preserved unchanged.
- [Draft PR #8](https://github.com/sportaholic000-hue/off-the-clock/pull/8), branch `codex/customer-quote-wording-20261001`.
- This report and its evidence are a documentation-only addition after the tested code commit. [TESTED_SOURCE.json](TESTED_SOURCE.json) contains the final file hashes and exact expanded cold-test arguments.

No quote amount or calculation was changed. No voice, phone, account, billing, public-site or dependency implementation was changed. No merge, deployment, live-data change or environment-permission expansion was performed.

## Reproduced and repaired

1. **Roof decking:** unknown sheet count now has only “Any additional decking is priced per sheet and confirmed on site.” The internal reviewed-charge sentence is removed. Measured included sheets are stated once. The configured owner rate is absent from customer output.
2. **Roof layers:** the measured layer count appears once. The same duplicate-fact repair applies to flat-roof layers.
3. **Mowing:** the per-visit sentence appears once in the generated customer explanation/disclaimer. In the rendered quote, the unit remains beside the price and is removed from the displayed disclaimer only when already shown there.
4. The scan of all services also found repeated painting coats, cleanup area/debris, mulch volume/edging and sod area. Matching explanations now use one canonical sentence so the existing duplicate removal works.
5. Configured fence/painting quotes describe the measured work instead of “Owner-defined installed/itemized offering.” Gate footing and disposal explanations use customer wording while retaining the scope and exclusions.
6. The shared customer quote display and owner preview avoid repeating the exact unit/tax sentence already displayed beside the amount. Stored/API disclaimers retain their information.

The original repair-133 test required the obsolete internal decking sentence. Its wording assertion was updated to require the approved customer sentence and reject the obsolete one. Its existing amount assertions were retained.

## Exact checks and results

| Check | Before | Repaired result | Evidence |
|---|---:|---:|---|
| `node --test test/customerExplanation.spec.mjs` | 11 pass / 13 fail of 24 on exact d03 source, including all three supplied regressions | **24/24 pass** | [Original complete run](baseline-wording-complete.log), [repaired run](candidate-wording.log) |
| `node --test test/quotePresentation.spec.mjs` | New display checks | **4/4 pass** | [Display log](presentation-tests.log) |
| `node --test --test-name-pattern="repair 133:" test/quoteEngineVNextRepairs.spec.js` | Old assertion required superseded wording | **1/1 pass**, including its eight cost/sell and sheet-count cases | [Decking log](decking-assertion-updated.log) |
| Cross-service full-response comparison | 108 duplicate/internal findings in 174 requests | **174/174 identical calculations and non-wording output; 0 findings** | [Per-service results](SERVICE_SCAN.json), complete archived responses |
| Actual shared `QuoteResult` rendering | 204 duplicate unit/tax findings | **174 rendered quotes / 180 options; 0 findings** | [Before render](baseline-render.log), [after render](candidate-render.log), archived HTML |
| Existing local editor/preview browser checks | See existing tests | **19/19 individual checks pass** in the first local cold run | [Named checks](LOCAL_BROWSER_CHECKS.json), [original partial log](local-cold-first-incomplete.log) |
| Owner production build: `node node_modules/vite/bin/vite.js build`, cwd `client` | — | **Pass** | [Both build logs](final-builds.log) |
| Widget production build: `node node_modules/vite/bin/vite.js build --config vite.widget.config.js`, cwd `client` | — | **Pass** | [Both build logs](final-builds.log) |

Counts overlap; the focused tests are included in the full hosted run. Rendering used the actual React component through server-side rendering; it is not a claim of a new end-to-end customer browser journey. The owner build retains the existing large-chunk warning.

The 174 comparisons cover all 20 registered service types, all three tax modes, configured installed/itemized offerings, measured scopes, four mowing frequencies, and options with different exclusions. The comparison omits only generated `quoteId` and these wording fields: `customerDriver`, `priceDrivers`, `disclaimer`, `disclosures`. All other internal and customer fields compare exactly. Every control remains an instant estimate.

### Service scan

Every row below has **zero remaining findings** in the checked cases. This is coverage of the retained inputs, not a claim that every possible future owner-entered phrase has been enumerated.

| Service | Cases | Reproduced wording issue |
|---|---:|---|
| ROOFING_REPLACEMENT | 15 | Duplicate roof-layer/decking facts; internal decking-charge wording |
| ROOFING_REPAIR | 3 | None |
| FLAT_ROOF_REPLACEMENT | 9 | Duplicate existing membrane-layer count |
| FLAT_ROOF_REPAIR | 3 | None |
| INTERIOR_PAINTING | 12 | Duplicate coats; internal offering wording |
| EXTERIOR_PAINTING | 6 | Internal offering wording |
| FLOORING_INSTALL | 36 | None |
| FLOORING_REPLACEMENT | 3 | None |
| FENCING_INSTALL | 6 | Internal offering wording |
| FENCING_REPLACEMENT | 12 | Internal offering/post/disposal wording |
| SIDING_REPLACEMENT | 15 | None |
| SIDING_REPAIR | 3 | None |
| CONCRETE_DRIVEWAY | 3 | None |
| CONCRETE_PATIO_SLAB | 15 | None |
| LANDSCAPING_CLEANUP | 3 | Duplicate area/debris facts |
| LANDSCAPING_MULCH | 3 | Duplicate volume/edging facts |
| LANDSCAPING_SOD | 3 | Duplicate area |
| LANDSCAPING_PLANTING | 3 | None |
| LANDSCAPING_MOWING | 18 | Duplicate per-visit sentence |
| CUSTOM | 3 | None |

### Full cold regression

The hosted runs installed from the committed lockfile:

| Source | Tests | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|---:|
| Preserved upstream fbf6e27 | 948 | 918 | 28 | 2 | 0 |
| Final tested b7b329f | 976 | 946 | 28 | 2 | 0 |

**No new failure names.** The same nine voice failures and 19 browser-fixture failures occur in both hosted runs. The CI script calls the 19 browser failures “new” relative to its nine-name allowlist; comparison against the actual upstream run shows all 19 already present before this PR. This work does not change that allowlist or the CI setup.

- [Upstream cold run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36835956484), [saved complete failure list](github-ci-upstream.txt).
- [Final source cold run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36839872301), [saved complete failure list](github-ci-final.txt).
- [Machine comparison](github-ci-comparison.json): 28 before, 28 after, zero added/removed names.

The hosted build steps were skipped after the existing failure gate. The two passing builds reported above are completed **local** builds, not hosted builds.

Local Node was 22.23.2. The available local Express package was 4.22.2 versus locked 4.22.3; [runtime-versions.json](runtime-versions.json) records this. The completed hosted cold run used the exact lockfile. The 19 browser checks passed locally with the configured installed Playwright and Edge. Their hosted failure cause was not independently repaired or waived.

The first local cold run reached its 25-minute limit without totals. The extended final local run stalled and had no completed result when this report was prepared. Neither is counted as a successful full cold run. The complete hosted source-bound run is the evidence for “no new failures.” No local 965/976 claim is made.

## Evidence and reproduction

[ARCHIVES.json](ARCHIVES.json) gives compressed, part and restored SHA-256 hashes. [ARCHIVE_VERIFICATION.json](ARCHIVE_VERIFICATION.json) records successful hash checks and in-memory decompression of every archive.

The archives retain complete synthetic inputs, full internal calculations, sanitized customer responses, original failures, repaired responses and rendered HTML. The fixtures are existing marked test data, not live customer records. Binary archives are split only for transfer size; `restore.mjs` rejoins and verifies them.

From a checkout of this report commit:

```sh
node docs/review/customer-wording-20261001/restore.mjs ../restored-customer-wording-evidence
node --test test/customerExplanation.spec.mjs
node --test test/quotePresentation.spec.mjs
node --test --test-name-pattern="repair 133:" test/quoteEngineVNextRepairs.spec.js
node verification/customer-wording/scan.mjs . ../repeated-wording-scan.json ../restored-customer-wording-evidence/baseline-complete.json
node verification/customer-wording/render.mjs . ../repeated-wording-scan.json ../repeated-wording-render.json
```

For red verification, make a separate exact d03 checkout. Set `OPUS_SOURCE_ROOT` to that checkout and execute this branch's `test/customerExplanation.spec.mjs`; it imports the original engine while keeping the regression fixtures fixed. Expected complete result: 24 tests, 11 pass, 13 fail, with all three required regressions failing. Unset `OPUS_SOURCE_ROOT` for repaired-source tests.

The exact expanded 58-file cold command is in `TESTED_SOURCE.json.args`; it runs `node --test --test-concurrency=1` over all `test/*.spec.js` and `test/*.spec.mjs`. Use an isolated test database, synthetic test credentials and disabled provider writes. The per-run `*.source.json` files bind the original executions to their source hashes.

The per-run source snapshots show the exact files tested. The wording and calculation scan ran before the two UI files received their final display changes; all engine and fixture files those checks execute match final source. The render, display and build checks ran after the UI changes. [SOURCE_REUSE_VERIFICATION.json](SOURCE_REUSE_VERIFICATION.json) records these comparisons. The only code/test change after checkpoint `92e940269d600460fe25834652d09fa42bbe73d8` is the repair-133 wording assertion, retested separately. The full hosted suite ran at final b7b329f.

## Remaining limits

- Existing voice failures and the upstream hosted browser-test setup remain outside this wording task.
- The extended local full-run completion is unverified.
- No live voice/provider flow or new public-launch acceptance is claimed.
