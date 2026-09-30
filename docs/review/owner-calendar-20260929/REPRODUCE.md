# Reproduce the owner Calendar verification

Use source commit `aa90b65dd7d88801c5f5dcf720b0e0dfd8ade49f` or the final evidence-only successor. Use Node 22.23.2 with compatible installed dependencies and a configured Playwright module and Edge/Chromium executable. The test wrapper expects `.portable-runtime/node-v22.23.2-win-x64/node.exe`, or a matching `QUOTEDONE_NODE`; browser application helpers use that same local runtime path. No dependency or permission expansion is performed by these checks.

Set PRICEBOOK_BROWSER_MODULE to the installed Playwright module, PRICEBOOK_BROWSER_EXECUTABLE to the browser executable and ESBUILD_BINARY_PATH to the installed esbuild binary when necessary. The evidence directory must be fresh, outside the repository, and must not be an existing/live database location. Each label is write-once. Run checks sequentially on memory-constrained computers.

The wrapper clears inherited credentials, generates synthetic secrets, disables voice/live provider operations and records exact arguments/source hashes/output. Calendar fixtures explicitly enable only the intercepted synthetic provider boundary, whose fetch handler blocks unexpected endpoints. A synthetic paid entitlement is seeded only in the isolated fixture database. Authentication, quote calculation, persistence, slot selection, holds and confirmation are real application code.

Example commands, from the source root:

```text
node verification/quotedone/run-resume-check.cjs build ../review-evidence verification/quotedone/build-resume-client.mjs
node verification/quotedone/run-resume-check.cjs calendar ../review-evidence client/test/owner-calendar-browser.mjs . ../review-evidence/calendar after
node verification/quotedone/run-resume-check.cjs whole ../review-evidence verification/quotedone/pricing-envelope-workflow.mjs . ../review-evidence/whole
node verification/quotedone/run-resume-check.cjs widget ../review-evidence client/test/widget-real-booking-browser.mjs . ../review-evidence/widget
node verification/quotedone/run-resume-check.cjs owner ../review-evidence client/test/widget-full-page-browser.mjs . ../review-evidence/owner
node verification/quotedone/run-resume-check.cjs boundary ../review-evidence verification/quotedone/resume-integration-boundary.mjs .
```

The full regression is split into 33 application test files and four engine test files to keep the load bounded. Exact commands, including module-mock and single-concurrency flags, are recorded in TEST_RESULTS.json. The price-book browser and transport arguments are there as well. Do not replace the explicit application list with an all-tests command and silently discard the separately documented incomplete voice failures.

To reproduce the original navigation/API gap, build a separate checkout of `7df3fcee45dc3fce19904c67f0cf5575449fdf15`, then run this final owner-calendar-browser.mjs script against that checkout with mode `before` and a fresh evidence directory. The preserved original before-run script and full records are hashed in EVIDENCE_INDEX.json.

The final tests preserve confirmed and pending appointments, a preferred-time request, failed validation/retry evidence, quote/lead links, provider failure/recovery responses and restart persistence. See WORKFLOWS.json for the twelve assertion groups. RUN_LOGS.txt includes the original failed verification attempts as well as final passing runs; setup/assertion mistakes are explained in FINAL_REPORT.md.
