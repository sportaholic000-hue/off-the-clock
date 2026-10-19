# Remaining-service public-intake review

Review base: `1f8b1a20e1b910c7787a05dd820814894b01a961` (approved A3). Unique branch: `codex/qe-agent1-remaining-services-chromium-review-20261019`. Personal execution; no subagents. Only new A1 test/evidence files are changed. A2's branch is untouched.

## Coverage and independent expectations

`EXPECTED.md` and `cases.mjs` record the twelve base/corrected amounts before comparisons. The new normal browser regression runs 88 independent cases across the twelve services missing from A3's representative eight-service Chromium suite. It uses production CustomerQuote, the real application public catalog/prepare/final handlers and disposable SQLite/books. Mounting HTML is test supplied; quote HTTP responses are never mocked. Failures are recorded per case and do not stop later services.

The review checks valid rendering/persistence/exact cents, rendered corrections, invalid-input correction/recovery, real stale-scope proof rejection, immutable original receipt replay after correction, stale proofs after saved price edits, and original replay after server restart. Additional transitions cover fence removal, flat-roof partial scope, patio measurement methods and selected unpriced floor removal. Hosted test diagnostics contain a lossless compressed evidence bundle without modifying workflows.

## Completed execution

- Extended HTTP history04: **72/72 passed**, zero failed. All twelve services pass base/corrected exact cents, invalid input, stale scope proofs, stale price proofs, immutable original receipt replay and replay after application restart. Its execution metadata distinguishes the uncommitted extended HTTP harness from the published production head.
- HTTP preflight03: **36/36 passed**, exit 0. Every service has independently checked base and corrected exact cents and an invalid-input review control. Every successful quote also receives an exact HTTP receipt retry.
- Owner/widget build: passed, exit 0. Generated tracked index restored exactly to the approved base.
- Chromium startup: blocked locally by SIGTRAP. No local rendered-browser pass is claimed. The real application setup/save/confirmation/approval/catalog completed before launch failed; its evidence is retained in local-chromium-01.
- HTTP preflight01 and02:25 passed /11 failed because the60/minute public limiter was reached. These are harness failures, not product findings. The inherited application fixture freezes Date.now, so adding wall-time pacing alone did not expire its window. Preflight03 and the final harness pace requests1.1seconds apart and update only the fixture's synthetic clock by actual elapsed wall time. Production rate limiting is unchanged; no limiter reset, disablement or identity rotation.
- The Playwright browser installer failed to maintain its local download lock. The matching official Chromium1194 headless archive was downloaded separately; its SHA256 is `d745c7210cc88b73c7991a22c9624819960d84bc3de77ac7336d2de841a8c91f`. It also exitsSIGTRAP here. No dependency or lockfile is changed.

Hosted Chromium at published `0e2648930ab2f3ce64e92e9578e981dcdfa3522b`, run 39284239659 / job 118165547578: **88 cases executed, 86 passed, 2 failed**. The complete A1 test section is preserved in `hosted-checkpoint-01-test-excerpt.log`. All twelve services pass their seven main lifecycle checks. Patio measurement correction and selected unpriced floor-removal review also pass. The failing transitions are isolated after all main service cases, and subsequent stale-price/restart controls continue and pass.

The first hosted strict gate completed **5998/6001 passing, 3 failing**, with zero cancellations, skips or TODOs within the suite. The failures are the two defect assertions plus their parent test. Build, the dedicated 12-test owner-alert/dashboard browser step, and Docker build/startup passed. The unchanged workflow skipped full-suite, checker and dependency-audit steps after strict failed; no completion claim is made for those gates.

The complete 555/555 diagnostic chunks were recovered and gzip/JSON validated. `hosted-checkpoint-01/complete-evidence-bundle.json.gz` preserves all 13 original files; `extracted-sha256.json` identifies their exact bytes. Earlier partial log retrieval is superseded by that complete recovery. `source-binding.json` confirms Chromium 141.0.7390.37 and the published source SHA. The individual test excerpt, gate excerpt, exact failed requests, screenshots, approved configuration and genuine original receipts are retained.

Published-checkpoint HTTP rerun 05 at `fe2387e3f2cf0e8271557c7f464e09feada43d0c`: **72/72 passed**, exit 0, using the committed HTTP harness. Its output is separate from all earlier runs. The 88-case review reproduced86 passed/2 failed at that checkpoint. The new separate-reproduction file was selected by full but did not initially reach quote sources through imports, so strict did not run it and the workflow skipped full after strict failed. This harness gap is preserved in the run evidence. The reproduction now uses its documented service-fixture catalog to validate the two service types; both strict and full selectors include it without any selector changes. Independent Chromium reproduction results remain pending.

## Confirmed findings

- **A1-R12-01 — fence removal deselection retains hidden length.** In the configured FENCING_REPLACEMENT fixture, change oldFenceRemoval from true to false using the rendered select. The real prepare request still has removalLengthLF=50, violating the existing configured-offering contract. The requested work should omit removal and quote **450000 cents** (100×4000 +2×25000), versus the original 490000. Source: `client/src/quoteDoneControls.jsx`, CustomerMeasurements.update; server diagnostic: `server/quote-engine-vnext/configuredOfferings.js` (removal length supplied while removal excluded). No arithmetic or server-validation relaxation is proposed.
- **A1-R12-02 — flat-roof full scope retains hidden partial area.** Restore the valid partial-scope draft with partialAreaSqft=500, then choose full scope in Chromium. The real prepare request retains partialAreaSqft=500. Correct full-scope work should omit partial measurements and quote **1805000 cents**. Source: the same CustomerMeasurements.update; existing flat-roof contract: `server/quote-engine-vnext/contracts.js`, full-scope partial-measurement diagnostics. These are customer correction failures, not evidence of incorrect engine arithmetic.

A separate fresh-application Chromium invocation repeats those two transitions and includes clean-scope controls with independent 450000/1805000 expectations. `test/qeAgent1RemainingDependenciesReproduction20261019.browser.spec.mjs` is normally selected without selector changes. Both new tests require correct behavior and retain failing assertions until the product defects are repaired. Production is outside this review's ownership and remains untouched.

## Commands

```sh
node verification/qe-agent1-remaining-public-intake-20261019/http-preflight.mjs <new-output-directory>
node verification/qe-agent1-remaining-public-intake-20261019/browser-audit.mjs . <new-output-directory>
node --test test/qeAgent1RemainingPublicIntake20261019.browser.spec.mjs
npm run build
```

Local runtime Node22.23.3; Playwright1.56.0 tooling is installed outside the repository. Existing A3 tests/assertions, all production, specifications, versions, approvals, selectors and workflows are preserved. This review does not cover actual provider calls, deployment or every possible configuration within each service; F2 remains outside scope.

## Twelve-service execution matrix

Each row passed all seven main Chromium/public-HTTP lifecycle checks: valid, correction, invalid/recovery, stale scope, original replay after correction, stale price/original replay and original replay after restart. Counts are from checkpoint01, not inferred from source.

| Service | Base cents | Corrected cents | Main cases | Extra cases |
|---|---:|---:|---:|---|
| ROOFING_REPLACEMENT | 244600 | 244698 | 7/7 passed | — |
| FLAT_ROOF_REPLACEMENT | 1805000 | 1805903 | 7/7 passed | Partial-to-full failed |
| INTERIOR_PAINTING | 300000 | 300300 | 7/7 passed | — |
| EXTERIOR_PAINTING | 318000 | 318318 | 7/7 passed | — |
| FLOORING_INSTALL | 260670 | 260940 | 7/7 passed | Unpriced removal review passed |
| FENCING_REPLACEMENT | 490000 | 492000 | 7/7 passed | Removal-off failed |
| SIDING_REPLACEMENT | 1170000 | 1170585 | 7/7 passed | — |
| SIDING_REPAIR | 54000 | 54000 | 7/7 passed | — |
| CONCRETE_PATIO_SLAB | 353889 | 361486 | 7/7 passed | Measurement correction passed |
| LANDSCAPING_CLEANUP | 40000 | 35000 | 7/7 passed | — |
| LANDSCAPING_SOD | 253750 | 203750 | 7/7 passed | — |
| CUSTOM | 12500 | 12500 | 7/7 passed | — |

Coverage limits: one documented base configuration per service, with targeted corrections; no exhaustive product/tier/optional-work matrix, live provider calls, mobile layout or every possible field transition. A3's existing representative eight-service suite is preserved, not relabeled as a complete lifecycle matrix. F2 remains outside this review. Local Chromium remains blocked by SIGTRAP; hosted Chromium supplies the rendered execution.
