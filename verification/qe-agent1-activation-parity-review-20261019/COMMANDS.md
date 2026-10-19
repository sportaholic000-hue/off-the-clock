# Executed commands

All executed in the repository; Node22.23.3 at
`/workspace/scratch/db2901c56e80/runtime/node_modules/node/bin` and TMPDIR under
`/workspace/scratch/db2901c56e80/tmp`. No dependencies changed.

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs verification/qe-agent1-activation-parity-review-20261019/run.mjs run-06-final
# Exit1:161 cases,157 matched,4 mismatches documenting AP01/AP02.
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test verification/qe-agent1-activation-parity-review-20261019/reproduce-findings.spec.mjs
# Exit1:2 controls pass,2 intended availability assertions fail.
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test test/quoteActivationParity20261005.spec.mjs test/quoteOptionalScopeIsolation.spec.mjs test/quoteReadinessRepairs.spec.mjs test/quoteReadinessExhaustive.spec.mjs test/quoteOfferingScopeIsolation.spec.mjs test/auditFixes20261003.spec.mjs test/quoteRoofing20261016.spec.mjs test/qeAgent1InteriorActivation20261019.spec.mjs
# Exit0:303 tests pass,0 failures/skips/cancelled/TODO.
python verification/qe-agent1-activation-parity-review-20261019/pack-evidence.py
```

Run01/02 used CASE_FILTER='--base$'. Run03 executed127 initial cases; run04
executed152 expanded cases. Run05 used
CASE_FILTER='(unknown-pitch|over12|itemized-|explicit-bag)' and executed10 cases.
Original failed expectation manifests, results and all wire remain archived.
Final run has no filter and executes161 cases across all20 registered services.

Source-preservation check: git diff against c743 is restricted to this directory.
The final publication tree is compared with the staged local tree and fetched back.
No hosted release gate, browser-rendering, deployment or provider-write claim.
