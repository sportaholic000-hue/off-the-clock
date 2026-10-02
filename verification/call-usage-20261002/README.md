# Call-minute metering verification — 2026-10-02

Source commit: `b59368154b831960c1dd7028782347d37de1a6a7`. Exact parent: `380c9153ae0598293dc81ab42072498e04483d97`.
Branch: `work/call-usage-20261002`. Runtime: Node v22.23.2, unchanged package-lock.json, Stripe SDK 22.6.2.

## Result

| Check | Exact result |
|---|---|
| Fresh lockfile install | npm ci exit 0; 311 installed; zero vulnerabilities |
| Full cold suite | 1088 tests; 1077 pass; 9 known voice failures; 2 skipped; 0 cancelled |
| Existing known-failure comparison | 9/9 match; no new failures |
| Focused billing, usage, HTTP sessions and runtime checks | 108/108 pass |
| Client billing + widget transport regressions | 17/17 pass |
| Existing real-browser price book regressions | 19/19 pass |
| Owner app and widget | both production Vite builds pass |
| npm audit --json | total 0; critical 0; high 0; moderate 0; low 0; info 0 |

The full suite added 32 new tests to the supplied 1056-test baseline. Its exit code remains 1 because the same nine voice failures are intentionally out of scope. The repository's existing known-failure checker exits 0 after normalizing Windows path separators in a COPY of the TAP failure-name lines; no CI files or failure allowlist were modified.

## What changed

- One server-only, synchronous SQLite completion entry point records the connected call's exact millisecond duration, rounds once per call, excludes spam and persisted AI_FALLBACK, and rejects conflicting or cross-tenant call-ID reuse.
- Used/remaining minutes, trial gate, included allowance and integer-cent overage derive from the same immutable records and VERIFIED Stripe item windows.
- The owner's existing dashboard now receives real usage. Owner-only, no-store usage/history endpoints derive tenant identity from the session.
- Annual allowances reset monthly; overage is monthly. Upgrade increases this window's allowance, downgrade preserves it until renewal, and neither resets already-used minutes.
- A durable background worker reports closed-window overage to Stripe, retaining the original period timestamp and customer. Stable identifiers, leases, bounded retries and REVIEW states protect against double billing and rebucketing.
- Monthly Checkout includes the monthly meter. Annual Checkout uses an annual base item in flexible mode; a verified, durable provider job attaches the monthly meter afterward. Stripe's documented Checkout limitation disallows creating mixed intervals directly.
- Production validates the catalog and the four additional usage environment settings. The existing payment-method activation guard remains.

## Commands and test coverage

Run from the repository with Node 22 and dependencies installed from the lockfile:

```text
npm ci
npm run build --workspace client
node --test --test-concurrency=4 test/*.spec.js test/*.spec.mjs
node --test test/callUsage.spec.mjs test/usageStripe.spec.mjs test/usageRoutes.spec.mjs test/billingStateService.spec.mjs test/billingRoutes.spec.mjs test/billingConfig.spec.mjs test/runtimeConfig.spec.mjs test/authSessionHttp.spec.mjs test/authSessionService.spec.mjs
node --test client/test/billing-transport.test.mjs client/test/widget-transport.test.mjs
npm audit --json
```

The cold run used a fresh Node process and temporary test directory, plus the bundled Playwright package and installed Edge through PRICEBOOK_BROWSER_MODULE and PRICEBOOK_BROWSER_EXECUTABLE. The exact expanded arguments and timings are in the result JSON files.

New regressions cover exact minute boundaries; eight independent concurrent SQLite reporters; repeated and altered reports; tenant isolation; spam/fallback exclusions; both paid allowances; the 59/60 trial boundary and overrun; start-time attribution across resets and trial end; verified short-month annual resets; upgrade/downgrade; missing or overlapping evidence; transactional billing receipts; actual HTTP session authorization; actual Stripe SDK serialization; retries, restart leases, shutdown and nonblocking completion; ambiguous or stale requests; late-call deltas; annual meter provisioning and readback; and catalog/configuration safety.

The first local full run omitted the browser-module setting and had 19 browser hook failures in addition to the nine known voice failures. After fixing the LOCAL RUNNER configuration, the browser tests passed 19/19 and the entire suite was rerun cold to the result above. No source/test/CI changes were made to hide those environment failures. Early focused runs also caught and corrected local test cleanup and result-property mistakes before publication.

## Evidence and integrity

The JSON files give exact commands, exit codes, counts and timings. The .log.gz files contain full logs (download and decompress with gzip). source-hashes.json records all 25 implementation/documentation/test files. Every uploaded source blob was matched to its tested local Git SHA and fetched back at the immutable source commit. After all tests, the same hashes remained unchanged.

483 existing local base files matched the exact requested commit; no present runtime or test source was missing. Uncopied historical evidence/binaries and committed artifacts are preserved in the Git tree through the immutable base tree. The remote implementation diff contains only the 25 explicit files. No engine, widget behavior, voice, telephony, public page, CI, lockfile or package changes.

## Required handoff and limits

Claude must wire BOTH the pre-call allowance gate and completed-call callback described in [call-usage.md](../../docs/call-usage.md). Until then this PR supplies the tested backend contract, not a live voice source or live cap enforcement.

Stripe verification uses recorded OFFICIAL API-CONTRACT fixtures with substituted test identifiers against a loopback server through the real SDK. It is not an authenticated Stripe sandbox recording or invoice proof. The connected Stripe app required reauthentication; no live charges, actual subscriptions, catalog resources or paid services were created. Validate the actual configured Stripe test catalog, annual meter attachment, asynchronous aggregation and a test invoice before production.

Monitor RETRY/REVIEW states and Stripe processing errors. Events acknowledged by the API are not proof of finalized or paid invoices. Late completion after invoice finalization, an entirely missed historical window, conflicting provider periods, a 35-day timestamp expiry, or retries nearing Stripe's 24-hour deduplication limit require reconciliation. The implementation holds uncertain work instead of charging it again or moving it into another month.

All four owner rulings are incorporated; no additional business ruling is pending.
