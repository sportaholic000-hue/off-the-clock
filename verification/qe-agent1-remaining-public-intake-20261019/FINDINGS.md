# Candidate classifications withdrawn; explicit correction under verification

The initial two product-defect classifications were wrong. They were based on a new A1 test assumption that changing a controlling choice must automatically delete a supplied dependent measurement. The existing implementation deliberately preserves supplied values on screen so the customer can correct them explicitly (`server/scopeConfiguration.js:138–144`). `CustomerMeasurements` uses that visibility contract; the actual approved catalog defines both fields without a visibility condition. No production change or new automatic-deletion policy is appropriate based on the initial evidence.

The original failed tests, expected amounts, exact saved configuration, requests, responses, screenshots and genuine historical receipts remain in `hosted-checkpoint-01/` and the published checkpoint history. The full diagnostic bundle passed complete555/555 chunk reconstruction, gzip CRC and JSON decoding. The existing failed-run output is not rewritten.

## Withdrawn A1-R12-01: fence removal Yes→No

Observed in real Chromium at0e2648930ab2f3ce64e92e9578e981dcdfa3522b: oldFenceRemoval=false and previously supplied removalLengthLF=50 reach the real prepare handler. It returns needs_details and asks the customer to check removal length; it creates no durable rows. The server check in `configuredOfferings.js:204` is correct.

A3 already covers this contradictory request and an explicitly cleared valid request through its direct API fixture (`audit-fixtures.mjs:61`). The new rendered test incorrectly called the field hidden without checking visibility. The correct test must verify that the50LF field remains visible/editable, that the contradiction cannot price, and that Change details followed by explicit field clearing produces a fresh confirmation and **450000 cents** (100×4000 +2×25000). The original valid removal-included quote remains490000 cents.

## Withdrawn A1-R12-02: flat-roof partial→full

Observed in the same real Chromium run: serviceScope=full and previously supplied partialAreaSqft=500 reach prepare. It correctly returns needs_details and asks the customer to check affected area; no durable rows are created. The existing full-scope diagnostics are in `contracts.js:234–235`.

The new rendered test incorrectly required automatic deletion. The correct test verifies the500sqft field remains visible/editable, the contradiction remains review-only, and Change details followed by explicit clearing yields a fresh confirmation and **1805000 cents** (575000 labor +770000 materials +460000 removal).

## Evidence and execution

`hosted-checkpoint-01/failed-requests.json` contains exact request/response pairs. `approved-book.json.gz` is the exact saved, explicitly confirmed and approved book. `complete-evidence-bundle.json.gz` preserves all13 original files, including all results, HTTP exchanges and original receipts. `extracted-sha256.json` records exact file hashes. The initial strict failures were audit expectation errors, not confirmed product defects.

The separate normally selected reproduction uses a fresh application/database/book, repeats both explicit-correction paths and submits two clean-scope controls. Corrected expectations precede its execution in EXPECTED.md. Any failure of visibility, review, explicit correction or cents will remain a failing assertion and be investigated; production is untouched.

```sh
node verification/qe-agent1-remaining-public-intake-20261019/browser-audit.mjs . <new-directory> --dependency-reproduction
node --test test/qeAgent1RemainingDependenciesReproduction20261019.browser.spec.mjs
python3 verification/qe-agent1-remaining-public-intake-20261019/extract-hosted-evidence.py verification/qe-agent1-remaining-public-intake-20261019/hosted-checkpoint-01/complete-evidence-bundle.json.gz <new-directory>
```

No confirmed new product defect is established by these initial failures. Rendered explicit-correction verification is still pending at this checkpoint. F2 remains outside this review.
