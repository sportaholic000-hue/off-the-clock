# Verification commands and printed counts

All fixtures are synthetic. Expected values were written in `EXPECTATIONS.md` before execution. Node 22.23.3 / npm 11.9.0; `TMPDIR` and `PLAYWRIGHT_BROWSERS_PATH` point to this workspace. No test counts are imputed for install/build/probe commands.

## Required clean-install sequence

| Command | Result | Pass | Fail | Skipped | Evidence |
|---|---|---:|---:|---:|---|
| `npm ci` | Exit 0; added 328 packages | Not printed | Not printed | Not printed | npm-ci.log.gz |
| `npm run build` | Exit 0 | Not printed | Not printed | Not printed | npm-run-build.log.gz |
| `npm install --no-save --no-audit --no-fund playwright@1.56.0` | Exit 0; added 2 packages | Not printed | Not printed | Not printed | npm-playwright.log.gz |
| `npm run test:quote` | Exit 1 | 4573 | 120 | 0 | npm-test-quote.tap.gz |
| `npm test` (first attempt) | Interrupted with exit 130 after a silent HTTP-test stall; no final TAP summary | Not printed | Not printed | Not printed | npm-test-interrupted.tap.gz |
| `npm test` (retry) | Exit 1 | 5559 | 117 | 0 | npm-test.tap.gz |

The strict run printed 4,693 tests, 0 cancelled and 0 todo. The full retry printed 5,676 tests, 0 cancelled and 0 todo; its result checker failed. The full run had Chromium failures and two catalogue timing assertion failures (4858.340516/4868.526786 ms and 2700.428693/2702.972212999999 ms, against a 1500 ms limit). The standalone catalogue rerun passed unchanged. Failures include the local Chromium launch crash, an exact SQL migration audit entry and the new route inventory. The audit and inventory were repaired and checked independently below. No gate or test was disabled. The final commit must be checked by hosted CI because local Chromium exits with SIGTRAP.

Chromium probe: `node --input-type=module -e 'import {chromium} from "playwright";const b=await chromium.launch({headless:true,args:["--no-sandbox"]});await b.close();'` — exit 1, no test counts. Evidence: chromium-probe.log.gz.

## Additional verification and repair runs

The table names the executed test files. The final focused and adjacent invocations use `node --test --test-concurrency=1 --import ./test/pricebookTestEnv.mjs`; standalone commands are stated where relevant. Counts are copied from TAP summaries, including unsuccessful iterations.

| Evidence | Test files / command | Pass | Fail | Skipped |
|---|---|---:|---:|---:|
| focused-1.tap.gz | everytrade20261017.spec.mjs; initial temporary-directory setup failure | 0 | 1 | 0 |
| focused-2.tap.gz | everytrade20261017.spec.mjs; optional-field validation regression and fixture precision, then repaired | 1 | 50 | 0 |
| focused-3.tap.gz | everytrade20261017.spec.mjs | 51 | 0 | 0 |
| focused-4.tap.gz | everytrade20261017.spec.mjs + everytrade20261017.dom.spec.mjs; test API/fixture corrections followed | 51 | 2 | 0 |
| focused-5.tap.gz | same two files; JSDOM shim and fixture metadata corrections followed | 51 | 2 | 0 |
| focused-6.tap.gz | same two files + everytrade20261017.http.spec.mjs; plan and save-response assertions corrected | 52 | 2 | 0 |
| focused-7.tap.gz | all three files above | 54 | 0 | 0 |
| adjacent.tap.gz | ownerDashboard20261007.spec.mjs + pricebookInterviewNormalization20261005.spec.mjs + pricebookPersistenceEditor20261005.spec.mjs | 47 | 0 | 0 |
| sql-audit-repair.tap.gz | `node --test --import ./test/pricebookTestEnv.mjs test/ownerQueryCoverage20261009.spec.mjs`; first insertion did not apply | 87 | 1 | 0 |
| sql-audit-final.tap.gz | same SQL-audit command after exact migration exception was added | 88 | 0 | 0 |
| tenant-matrix-final.tap.gz | `node --test --import ./test/pricebookTestEnv.mjs test/tenantIsolationRoutes.spec.mjs`; inventory passed, two preview HTTP reads returned 500 (plus failed parent) | 267 | 3 | 0 |
| catalog-timing-final.tap.gz | `node --test --import ./test/pricebookTestEnv.mjs server/quote-engine-vnext/tests/coreCatalog.spec.mjs`; unchanged standalone timing assertions | 6 | 0 | 0 |
| legacy-range-final.tap.gz | everytrade20261017.spec.mjs; final legacy 25% evidence guard plus all 43 pinned cases and arithmetic/storage/report regressions | 53 | 0 | 0 |
| startup-probe.tap.gz | `node --experimental-test-module-mocks --test --test-timeout=30000 --import ./test/pricebookTestEnv.mjs test/everytrade-startup-probe.mjs`; temporary copy of billingCalls20261009Http.spec.mjs with startup logging | 1 | 0 | 0 |
| owner-controls-tenant-final.tap.gz | everytrade20261017.dom.spec.mjs + tenantIsolationRoutes.spec.mjs; resolved-buffer confirmation and tenant/role matrix | 271 | 0 | 0 |

All additional test runs printed 0 cancelled and 0 todo. The preview HTTP 500s did not recur on rerun; their cause is unverified.

Other successful setup commands: initial `npm ci` (baseline-install.log.gz), initial `npm run build` (preflight-build.log.gz), and final wording `npm run build` (final-copy-build.log.gz), and final guard `npm run build` (final-build.log.gz). Each exited 0 and printed no pass/fail/skip counts. `node verification/everytrade-20261017/capture-base.mjs` captured 43 synthetic pinned-base cases before source changes; no TAP counts.

Shared-file scope, protected-file checks, final commit, push, remote-ref confirmation and exact-commit hosted CI are reported in the handoff. No main merge or deployment is part of this task.
