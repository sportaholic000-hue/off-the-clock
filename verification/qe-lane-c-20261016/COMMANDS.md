# Local command ledger

Node22.23.3; npm11.9.0; Git2.51.1; Python3.12.14. Commands ran in the fresh `qe-lane-c` checkout. Complete argv, cwd, UTC times, selected non-secret configuration, exits/signals and source snapshots are in each execution record inside evidence.zip. Counts below reproduce printed TAP summaries; “not printed” is not a zero-test pass claim. No totals are added across overlapping runs.

| Run | Exact command | Tests | Pass | Fail | Cancelled | Skipped | TODO | Exit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| npm-ci | `npm ci` | not printed | not printed | not printed | not printed | not printed | not printed | 0 |
| build | `npm run build` | not printed | not printed | not printed | not printed | not printed | not printed | 0 |
| playwright-install | `npm install --no-save --no-audit --no-fund playwright@1.56.0` | not printed | not printed | not printed | not printed | not printed | not printed | 0 |
| focused-first | `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/surfacePricing20261016.spec.mjs` | 19 | 15 | 4 | 0 | 0 | 0 | 1 |
| focused-serialization-fix | `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/surfacePricing20261016.spec.mjs` | 19 | 18 | 1 | 0 | 0 | 0 | 1 |
| baseline-controls | `node verification/qe-lane-c-20261016/baseline-controls.mjs` | not printed | not printed | not printed | not printed | not printed | not printed | 0 |
| compatibility-corrected | `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap --test-name-pattern=legacy.no-new-input test/surfacePricing20261016.spec.mjs` | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| chromium-install | `npx playwright install chromium` | not printed | not printed | not printed | not printed | not printed | not printed | 1 |
| existing-paint-regressions | `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/configuredOfferings.spec.mjs test/componentPricingRepairs.spec.mjs test/quoteOfferingScopeIsolation.spec.mjs` | 78 | 78 | 0 | 0 | 0 | 0 | 0 |
| focused-expanded | `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/surfacePricing20261016.spec.mjs` | 30 | 29 | 1 | 0 | 0 | 0 | 1 |
| persistence-corrected | `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap --test-name-pattern=new.settings.persist test/surfacePricing20261016.spec.mjs` | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| chromium-launch | `node --input-type=module -e 'import {chromium} from "playwright"; const browser=await chromium.launch({headless:true,args:["--no-sandbox"]}); await browser.close();'` | not printed | not printed | not printed | not printed | not printed | not printed | 1 |
| surface-ui-voice | `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/surfacePricing20261016.dom.spec.mjs test/surfacePricing20261016.voice.spec.mjs` | 4 | 3 | 1 | 0 | 0 | 0 | 1 |
| voice-cause | `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap '--test-name-pattern=confirmed estimated' test/surfacePricing20261016.voice.spec.mjs` | 1 | 0 | 1 | 0 | 0 | 0 | 1 |
| focused-final | `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/surfacePricing20261016.spec.mjs test/surfacePricing20261016.dom.spec.mjs test/surfacePricing20261016.voice.spec.mjs` | 36 | 36 | 0 | 0 | 0 | 0 | 0 |
| final-build | `npm run build` | not printed | not printed | not printed | not printed | not printed | not printed | 0 |
| quote-gate | `npm run test:quote` | 4563 | 4443 | 120 | 0 | 0 | 0 | 1 |
| focused-review-fixes | `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/surfacePricing20261016.spec.mjs test/surfacePricing20261016.dom.spec.mjs test/voiceSurfacePricing20261016.spec.mjs test/customerMeasurementChoices20261008.spec.mjs test/auditFixes20261003.spec.mjs` | 131 | 131 | 0 | 0 | 0 | 0 | 0 |
| corrected-build | `npm run build` | not printed | not printed | not printed | not printed | not printed | not printed | 0 |
| full-suite | `npm test` | 5546 | 5442 | 104 | 0 | 0 | 0 | 1 |
| release-build | `npm run build` | not printed | not printed | not printed | not printed | not printed | not printed | 0 |
| release-focused | `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test-concurrency=1 --test --test-reporter=tap test/surfacePricing20261016.spec.mjs test/surfacePricing20261016.dom.spec.mjs test/voiceSurfacePricing20261016.spec.mjs test/customerMeasurementChoices20261008.spec.mjs test/auditFixes20261003.spec.mjs test/configuredOfferings.spec.mjs test/componentPricingRepairs.spec.mjs test/quoteOfferingScopeIsolation.spec.mjs` | 214 | 214 | 0 | 0 | 0 | 0 | 0 |

Additional preparation/inspection commands: `git clone`, `git fetch`, `git switch -c codex/qe-lane-c-20261016 92a5510`, detached `git worktree add`, `git rev-parse`, `git ls-remote`, source/spec reads, `git diff --check`, dependency/spec/workflow diff checks, syntax check `node --check server/quote-engine-vnext/surfacePricing.js`, source/hash comparisons and evidence packaging. These print no TAP counts. The toolchain was installed locally with `npm install --prefix ./lane-c-toolchain --no-save --package-lock=false node@22` (exit0,2packages). The detached baseline control command asserted four independent expected totals; it printed four JSON control records and no TAP summary. A process-list diagnostic failed because /proc is unavailable; no mount was attempted (tool-observations.json). No browser assertion is represented as locally passed.
