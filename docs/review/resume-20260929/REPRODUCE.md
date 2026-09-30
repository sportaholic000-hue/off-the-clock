Run from the repository root with Node 22.23.2 (ABI 127), installed repository dependencies, and a compatible better-sqlite3 binding. The retained Windows browser harness uses .portable-runtime/node-v22.23.2-win-x64/node.exe pointing to that runtime. Set PRICEBOOK_BROWSER_MODULE to an installed Playwright module and PRICEBOOK_BROWSER_EXECUTABLE to the installed Edge/Chromium executable. Set ESBUILD_BINARY_PATH only if required by the local esbuild installation. Runtime binaries and node_modules are not committed.

Use fresh output directories outside the checkout. run-resume-check.cjs clears inherited application credentials/configuration, disables live provider operations and voice, generates synthetic secrets, captures output/source hashes and refuses to overwrite an existing label. The two calendar verification scripts enable only their explicit synthetic fixture: the preload intercepts every provider fetch and blocks unexpected endpoints. Do not point any test at an existing database.

Examples (replace ../review-evidence with a fresh evidence location):

    node verification/quotedone/run-resume-check.cjs build ../review-evidence verification/quotedone/build-resume-client.mjs
    node verification/quotedone/run-resume-check.cjs envelope ../review-evidence verification/quotedone/pricing-envelope-workflow.mjs . ../review-evidence/envelope-http
    node verification/quotedone/run-resume-check.cjs widget ../review-evidence client/test/widget-real-booking-browser.mjs . ../review-evidence/widget-browser
    node verification/quotedone/run-resume-check.cjs full-page ../review-evidence client/test/widget-full-page-browser.mjs . ../review-evidence/full-page-browser
    node verification/quotedone/run-resume-check.cjs booking ../review-evidence verification/quotedone/booking-application.mjs . ../review-evidence/booking-http
    node verification/quotedone/run-resume-check.cjs oauth ../review-evidence verification/quotedone/calendar-oauth-application.mjs . ../review-evidence/oauth-http after
    node verification/quotedone/run-resume-check.cjs precision ../review-evidence verification/quotedone/run-precision.mjs .
    node verification/quotedone/run-resume-check.cjs replay ../review-evidence --experimental-vm-modules test/quoteEngineVNextReplay.mjs ../review-evidence/replay
    node verification/quotedone/run-resume-check.cjs boundary ../review-evidence verification/quotedone/resume-integration-boundary.mjs .
    node verification/quotedone/run-resume-check.cjs transport ../review-evidence --test client/test/widget-transport.test.mjs client/test/billing-transport.test.mjs
    node verification/quotedone/run-resume-check.cjs editor ../review-evidence --test --test-concurrency=1 test/priceBookEditor.browser.spec.mjs test/pricebookPreviewFreshness.browser.spec.mjs

The complete 35-file application regression arguments and the separately failing voice-status arguments are in TEST_RESULTS.json. Run application regression with --experimental-test-module-mocks --test --test-concurrency=2 and that explicit list. Voice status is intentionally separate and currently fails; do not suppress its failures or interpret application success as full-product acceptance.

Original precision verification in this session used the exact hashed original script/corpus and retained its temporary assets instead of deleting them. The documented repository precision runner uses the same hashed assets. Engine replay captures are instrumentation of the repository tests, not an independent external audit. The original before-repair OAuth replay can be reproduced by checking the parent application snapshot before calendar state wiring and running the recorded script with mode before; its original complete local responses and stores are retained in the evidence index.

Historical integration-boundary scripts expect an older Git/dependency snapshot. resume-integration-boundary.mjs computes actual Git object identities directly, verifies the protected engine/guide and single authorized bridge import, and retains the approved September 29 dependency files. It does not modify Git metadata.
