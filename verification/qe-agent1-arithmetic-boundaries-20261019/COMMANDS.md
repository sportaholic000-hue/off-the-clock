# Execution record

Commands were run from the repository root. Runtime PATH prefix was
/workspace/scratch/db2901c56e80/runtime/node_modules/node/bin; TMPDIR was
/workspace/scratch/db2901c56e80/tmp. All synthetic books/databases used the
unchanged test/pricebookTestEnv.mjs preloader.

1. npm install --prefix ../runtime node@22.23.3 --no-save --package-lock=false
2. npm ci
3. python verification/qe-agent1-arithmetic-boundaries-20261019/prepare-expectations.py
4. Committed independent expectations before engine execution (local00368b96).
5. node --import ./test/pricebookTestEnv.mjs verification/qe-agent1-arithmetic-boundaries-20261019/compare.mjs
   (first/second/final log and JSON retained; gzipped afterward without data changes)
6. python verification/qe-agent1-arithmetic-boundaries-20261019/prepare-followup.py
   before new package comparisons; original expectations retained separately.
7. node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap verification/qe-agent1-arithmetic-boundaries-20261019/delivery.spec.mjs
   First6/14, corrected harness14/14. First source and failed output retained.
8. Same Node test options, existing files unchanged:
   test/quoteConcreteLandscape20261016.spec.mjs
   test/quoteFlooring20261016.spec.mjs
   test/quoteFlatRoofRepairs20261016.spec.mjs
   test/quoteCombinationBoundaries.spec.mjs
   test/quoteStartingValues20261017.spec.mjs
   test/qeRoofUnderlaymentAccuracy20261018.spec.mjs
   test/qeRoofExactSubtraction20261018.spec.mjs
   test/qeRoofZeroAdjustments20261018.spec.mjs
   test/qeAgent1Historical20261018.spec.mjs
   Result278/279; SQLite error retained in existing-regressions.tap.
9. Same options, whole unchanged test/qeRoofUnderlaymentAccuracy20261018.spec.mjs:
   fresh process22/22, underlayment-repeat.tap. No suite exclusion or skip.
10. Same options, unchanged adjacent regression files:
    test/engineLaunchFixes20261005.spec.mjs
    test/fenceBoundaryLaneB20261016.spec.mjs
    test/surfacePricing20261016.spec.mjs
    test/surfacePricingLaneCFixes20261016.spec.mjs
    test/landscapePricingLaneB20261016.spec.mjs
    Result176/176, adjacent-regressions.tap.
11. Compared git hash-object of762 tracked production/client/test/spec/workflow/
    dependency files to the exact checkpoint; all identical (scope-check.json).

Archived JSON files are gzip containers. Read using gunzip -c or Python gzip.
The final comparison and delivery scripts read/write compressed evidence. The
first/second snapshots predate compression; decompress their matching raw JSON
when reproducing those exact harness mistakes. Final report numbers derive from
final JSON; TAP success for delivery means propagation/preservation verified,
not the monetary defects repaired.
