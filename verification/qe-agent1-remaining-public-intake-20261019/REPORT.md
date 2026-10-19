# Remaining-service Chromium / public-HTTP review

**No new product defect is confirmed in the covered cases.** At published source `f02b8d4abb0c85bf47db7816e472de345d7a5e90`, real Chromium completed **88/88** twelve-service cases plus **4/4** independent explicit-correction controls. All passed, including exact cents, invalid-input recovery, stale confirmations and immutable original receipt replay. A separate public-HTTP run passed **72/72** at `fe2387e3f2cf0e8271557c7f464e09feada43d0c` with the committed HTTP harness.

Base: approved A3 `1f8b1a20e1b910c7787a05dd820814894b01a961`. Unique branch: `codex/qe-agent1-remaining-services-chromium-review-20261019`. Personal work; no subagents. Only new A1 tests/evidence are added relative to the base. All production, pre-existing tests/assertions, prices, versions, approvals, specifications, dependencies, selectors and workflows are byte-identical. No A2 branch, main, integration or deployment writes.

## Execution and coverage

The harness uses actual authenticated save, explicit starting/dependent-value confirmation, approval, public catalog, preparation and final submission handlers, with disposable SQLite/books and synthetic providers. Production CustomerQuote is rendered in real Chromium at the application origin. Only mounting HTML is supplied by the harness; public quote HTTP responses are never mocked. Runtime: Node 22.23.3 and Chromium 141.0.7390.37.

For each service, the seven main cases verify: valid rendered quote and exact stored/customer cents; rendered correction; invalid-input review and explicit recovery; stale-scope proof rejection with no persistence; exact original replay after correction; stale-price proof rejection and original replay after a real saved price change; and original replay after application restart. Genuine receipts are captured before changing prices, including original body, stored quote and internal calculation receipt. Replay compares these complete records and the customer response, not only the amount. Quotes never renew approval.

| Service | Base cents | Corrected cents | Main cases | Additional control |
|---|---:|---:|---:|---|
| ROOFING_REPLACEMENT | 244600 | 244698 | 7/7 passed | — |
| FLAT_ROOF_REPLACEMENT | 1805000 | 1805903 | 7/7 passed | Visible contradiction → explicit clearing →1805000 cents |
| INTERIOR_PAINTING | 300000 | 300300 | 7/7 passed | — |
| EXTERIOR_PAINTING | 318000 | 318318 | 7/7 passed | — |
| FLOORING_INSTALL | 260670 | 260940 | 7/7 passed | Selected unpriced removal requires review |
| FENCING_REPLACEMENT | 490000 | 492000 | 7/7 passed | Visible contradiction → explicit clearing →450000 cents |
| SIDING_REPLACEMENT | 1170000 | 1170585 | 7/7 passed | — |
| SIDING_REPAIR | 54000 | 54000 | 7/7 passed | — |
| CONCRETE_PATIO_SLAB | 353889 | 361486 | 7/7 passed | Exact dimensions → measured area/perimeter,353889 cents |
| LANDSCAPING_CLEANUP | 40000 | 35000 | 7/7 passed | — |
| LANDSCAPING_SOD | 253750 | 203750 | 7/7 passed | — |
| CUSTOM | 12500 | 12500 | 7/7 passed | — |

The four additional cases pass, giving 88/88. An independent fresh application/book repeats the two supplied-scope correction paths and two clean-scope controls: 4/4 passed. Existing A3 Chromium coverage for CONCRETE_DRIVEWAY, FENCING_INSTALL, FLAT_ROOF_REPAIR, FLOORING_REPLACEMENT, LANDSCAPING_MOWING, LANDSCAPING_MULCH, LANDSCAPING_PLANTING and ROOFING_REPAIR remains untouched. The new test checks that those eight plus these twelve equal the complete registered service set.

## Corrected audit assumptions and preserved failures

The first A1 expectations incorrectly demanded automatic deletion of supplied fence-removal length and partial-roof area. Initial runs returned needs_details for the resulting contradictions, and those two assertions failed. The report initially mislabeled them as hidden-field defects. That classification is **withdrawn**.

`server/scopeConfiguration.js:138–144` explicitly preserves supplied fields on screen for customer correction. The correct expectations were written before the next execution. Real Chromium then proved the 50 LF and 500 sqft controls visible and editable, review-only while contradictory, and correctly priced after Change details and explicit clearing. No automatic-deletion policy or production repair was introduced. Only the new A1 assumptions were corrected; existing assertions and all independent amounts remain preserved. See `FINDINGS.md` and the superseded expectations in `EXPECTED.md`.

Failed evidence remains intact: local HTTP 01/02 reached the 60/minute limiter (25 passed/11 failed each); local Chromium failed at startup with SIGTRAP; hosted checkpoints 01/02 recorded 5998/6001 strict assertions passing (two mistaken case assertions plus parent failure); checkpoint 03 independently repeated the mistaken assertions while both clean-scope price controls passed. No failed run is rewritten or represented as a product regression. The separate reproduction initially qualified only for full selection; its fixture-catalog validation now makes the existing transitive strict selector include it as well. Selectors are unchanged.

The real limiter remains enabled. Public requests are paced 1.1 seconds apart; the inherited fixture's frozen synthetic clock advances only by actual elapsed wall time so its limiter window can expire. No limiter reset, identity rotation or production clock change occurs.

## Evidence and gate qualification

- `hosted-checkpoint-04-passing-excerpt.log`: exact hosted TAP sections for all 92 passing leaf cases at f02b8d4, run 39289284610 / job 118185396680.
- `hosted-checkpoint-04-reproduction/`: complete 133/133-chunk, CRC-validated evidence bundle, source binding, exact approved book, full case records and hashes. It records visible retained values 50/500 and all 4 passing results.
- `hosted-checkpoint-01/`: complete 555/555-chunk original failed-run bundle, exact approved configuration, HTTP, original receipts, screenshots, source binding and hashes. The artifact's failure status records the superseded test assumptions.
- `hosted-checkpoint-03-reproduction/`: complete 152/152-chunk independent old-expectation bundle and classification provenance.
- `http-published-head-05/`: 72/72 public-HTTP results, original receipts, real book edits, stale catalog and exact committed-harness source binding.
- `preservation.json`, `source-qualification.json`, `selection-verification.json` and `SHA256SUMS`: preservation, source identity, normal suite selection and artifact checksums.

Build, dedicated 12-test browser and Docker steps passed on the observed checkpoints. Early full/checker/dependency-audit steps were skipped by the unchanged workflow after the mistaken strict assertions failed; they are not claimed completed for those runs. This report records the completed case evidence. The subsequent exact published-head Actions run supplies final strict/full/build/browser/Docker/checker/dependency-audit conclusions; use that run's exact SHA and actual counts rather than inferring a gate pass from this report. The final response identifies that run.

```sh
node --test test/qeAgent1RemainingPublicIntake20261019.browser.spec.mjs test/qeAgent1RemainingDependenciesReproduction20261019.browser.spec.mjs
node verification/qe-agent1-remaining-public-intake-20261019/http-preflight.mjs <new-output-directory>
python3 verification/qe-agent1-remaining-public-intake-20261019/extract-hosted-evidence.py <job-log-or-complete-bundle.json.gz> <new-output-directory>
```

## Limits

One documented base configuration per service, with targeted corrections; no exhaustive product/tier/optional-work matrix. These additions mount CustomerQuote with editable saved fixtures; they do not exercise every blank-form entry path, the full widget loader, the progressive wizard, mobile layout or live providers. A3's eight-service representative suite is not relabeled as a complete lifecycle matrix. Actual voice-tool coverage for these twelve is outside this public-HTTP review. Local Chromium remains blocked by SIGTRAP; hosted Chromium supplies the rendered evidence. F2 remains outside scope.
