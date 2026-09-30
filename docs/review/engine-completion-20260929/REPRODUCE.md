# Reproduce fencing, painting and booking verification

Tested application source: `06c6fbeec94e3c87040964c24a7a0f45f2837e2d`, on draft PR #3. An evidence-only successor may add this report without changing the tested runtime. Use `APPLICATION_SOURCE.json` for exact Git blob and SHA-256 identities, and `TEST_RESULTS.json` for every command, outcome and retained failed attempt. Counts overlap; do not sum them as unique coverage.

## Environment

Use Windows x64, Node **22.23.2**, native module ABI **127**, the repository's locked dependencies, Playwright and a local Chromium-compatible browser. The application harness explicitly verifies the Node version and executable. In this run, Node was at `.portable-runtime/node-v22.23.2-win-x64/node.exe`, the browser was Microsoft Edge, and Playwright came from the existing Codex dependency runtime. No packages, provider credentials or production environment settings were changed by this work.

From a checkout of the tested source, provide that Node executable and install the locked dependencies using the same Node version. Set `PRICEBOOK_BROWSER_MODULE` to the installed Playwright module path and `PRICEBOOK_BROWSER_EXECUTABLE` to the browser executable. If the environment requires it, set `ESBUILD_BINARY_PATH` to the matching existing esbuild executable. `verification/quotedone/build-resume-client.mjs` builds both production bundles.

Run **one test group at a time**. Use a new evidence directory outside the repository and new run labels: the wrapper refuses to overwrite old logs, and application fixtures refuse to reuse old stores. Replace `../fresh-evidence` below with your chosen path.

```text
node verification/quotedone/run-resume-check.cjs build ../fresh-evidence verification/quotedone/build-resume-client.mjs
node verification/quotedone/run-resume-check.cjs focused ../fresh-evidence --test --test-concurrency=1 test/configuredOfferings.spec.mjs test/bookingService.spec.mjs test/googleCalendarAdapter.spec.mjs
node verification/quotedone/run-resume-check.cjs offering-app ../fresh-evidence verification/quotedone/configured-offerings-application.mjs . ../fresh-evidence/offering-app
node verification/quotedone/run-resume-check.cjs booking-after ../fresh-evidence verification/quotedone/booking-confirmation-integrity.mjs . ../fresh-evidence/booking-after after
node verification/quotedone/run-resume-check.cjs offering-browser ../fresh-evidence client/test/configured-offerings-browser.mjs . ../fresh-evidence/offering-browser
node verification/quotedone/run-resume-check.cjs widget-booking ../fresh-evidence client/test/widget-real-booking-browser.mjs . ../fresh-evidence/widget-booking
node verification/quotedone/run-resume-check.cjs whole-request ../fresh-evidence verification/quotedone/pricing-envelope-workflow.mjs . ../fresh-evidence/whole-request
node verification/quotedone/run-resume-check.cjs engine ../fresh-evidence --experimental-test-module-mocks --test --test-concurrency=1 test/quoteEngine.spec.js test/quoteEngineVNext.spec.js test/quoteEngineVNextAdversarial.spec.js test/quoteEngineVNextRepairs.spec.js test/configuredOfferings.spec.mjs
node verification/quotedone/run-resume-check.cjs owner-editor ../fresh-evidence --test --test-concurrency=1 test/priceBookEditor.browser.spec.mjs test/pricebookPreviewFreshness.browser.spec.mjs
node verification/quotedone/run-resume-check.cjs full-page-owner ../fresh-evidence client/test/widget-full-page-browser.mjs . ../fresh-evidence/full-page-owner
node verification/quotedone/run-resume-check.cjs transport ../fresh-evidence --test --test-concurrency=1 client/test/widget-transport.test.mjs client/test/billing-transport.test.mjs
node verification/quotedone/run-resume-check.cjs boundary ../fresh-evidence verification/quotedone/offerings-integration-boundary.mjs .
```

The application regression's 33 test-file arguments are recorded in `TEST_RESULTS.json` under `offerings-final-application-regression-v2`. Run those exact arguments through the same wrapper with a fresh label. The historical 19-file frozen-engine guard is intentionally retained for the historical source; the new guard allows only the five original files and one added module listed in `verification/quotedone/offerings-engine-boundary.json`.

## Boundaries and original failures

All accounts, rate books, customers, entitlement records and provider events in these fixtures are explicitly synthetic. Fixtures write only isolated test stores. The calendar harness intercepts the Google network boundary using synthetic credentials; it does not establish live Google acceptance. The HTTP, authentication, price-book approval, quoting, booking, browser and SQLite application paths themselves are real. Production safeguards and rate limits remain enabled. The 24-case booking matrix restarts its isolated app every four cases to stay within the existing limiter.

The original fencing/painting baseline was taken before the offering implementation. Its 30 responses and independent $1,650 good-condition interior control are documented in `CHECKPOINT.md` and `BASELINE_RESULTS.json`. The owner's subsequent selection of **both** pricing modes supersedes that checkpoint's historical pending question; see `OWNER_OFFERINGS.md`.

The booking `before` characterization uses the same matrix with the original `bookingService.js` from `aa81eaa29503a7c3e2ddf464c7462f556839562c`. Reproduce in a separate source copy, never reset the working branch. It is expected to record nine false confirmations, including erroneous stored appointment/outbox states. Use `after` with the final source to require all 24 outcomes to be correct.

`offerings-browser-final` and `offerings-browser-final-v2` retain the owner-editor race: immediately entered fence length was missing after approval refreshed the saved book. The final browser script deliberately delays the real reload response, verifies the editor is disabled while pending, then enters measurements and verifies the correct quote. `offerings-browser-final-v3` was a test interception cleanup failure; `v4` corrects the interceptor and passes. Test setup errors and product failures are classified separately in `TEST_RESULTS.json`.

Full original synthetic HTTP responses, submitted inputs, provider replies, stored records, screenshots and database files remain in the local evidence directory indexed by `EVIDENCE_INDEX.json`. Database archives, private session logs and excluded voice files are not part of this delivery. GitHub contains the reproducing fixtures, test outputs, source identities, selected screenshots and structured outcome summaries. Historical wrapper `base` fields identify older fixture ancestry; the per-file source hashes and `APPLICATION_SOURCE.json` identify what actually ran.

Publication privacy note: RUN_LOGS.txt contains only sanitized test names, outcomes, counters and failure classifications. Raw diagnostic payloads, URLs and tokens were removed after automatic approval review rejected the initial test-log upload. Complete original synthetic logs remain locally retained and indexed; no token values or private session logs are intentionally published.
