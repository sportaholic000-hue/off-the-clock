NOT CLEAN — the three audited defects are repaired locally; browser verification remains blocked by Chromium startup failures.

# October 6 scoped repair verification

Branch: `codex/quote-audit-repairs-20261006`.
Base commit: `73c00622d6f2df31f57773b32e41355a7421f1a3`.
The owner has authorized a GitHub checkpoint and hosted CI. This document and
the manifest record the completed local verification before that upload; the
hosted result is pending. The original audit worktree remains clean at the base
commit. No subagents, merges, deployments, provider writes or live-data changes
were used.

## Repairs

1. **Website restrictions stay with their item.** HTML containers and adjacent
   plain-text lines retain the price's restrictions. Oversized or unsafe local
   context withholds the complete item and discloses partial extraction. Long
   page-wide restrictions are retained or cause the complete item to be withheld;
   they cannot disappear at the old 500-character note cutoff.
2. **Tax conditions keep their ownership.** Local tax notes remain within their
   item. Explicit shared notes apply within their department; page-wide notes
   outside item containers may apply to the page. One item's tax wording is no
   longer appended to every price on the page.
3. **Owner guidance matches the calculation.** The optional-prices subtitle now
   distinguishes missing required scope from optional extras that are excluded
   with a customer-visible disclosure. Existing field labels and detailed help
   already state the correct blank-versus-zero behavior and remain unchanged.

Production changes are limited to `client/src/pricebook.jsx`,
`server/src/websitePriceExtraction.js`, and `server/src/websitePriceImport.js`.
No engine arithmetic, approval, receipt or persistence rule changed.

## Expected results and regression evidence

[Handwritten expectations](../../specs/QUOTE_AUDIT_REPAIRS_20261006.md) preceded
test execution. All reproduction data is synthetic and all stores are temporary.

There are **38 new regression tests**: 33 import cases, one owner-route
fixture covering save-to-voice facts, and four owner guidance cases. The route
fixture substitutes only authentication and public-site transport with synthetic
adapters; actual tenant-scoped saving and voice-prompt compilation execute.
Owner rendering exercises the actual JSX with synthetic initial React state and
opened disclosures. It is SSR, not a replacement for browser interaction tests.

Before the repair, 18 of the first 20 new website cases failed. After the repair,
the final focused run passed **124/124**, with zero failures, skips, cancellations
or TODOs. It includes existing import, route and optional-extra calculations.
The new owner cases independently confirm **$100** mowing and **$110** flat-roof
repair when the selected optional extras lack prices, with explicit exclusions;
zero-priced extras remain included at those same amounts.

Initial owner assertions expected new wording from the legacy metadata module.
Execution showed the current application already supplies correct detailed help
from vNext metadata. The redundant production edits were removed; the tests now
verify that actual help, the repaired subtitle and the unchanged calculation.
No expected dollar amount was adjusted to match a result.

Review also reproduced two tax-ownership variants: a department footer and an
explicit all-prices note inside an unpriced department. Both now stay within
their own department. The boundary check briefly omitted a card's heading; the
existing Haircut test caught that regression, and the final repair preserves the
unchanged **$30.50** excerpt with its item name and conditions.

## Verification

Node **22.23.3**, npm **11.9.0**, fresh `npm ci` (262 packages), committed lockfile.
Playwright **1.56.0** and its Chromium revision **1194** were provided separately;
no dependency or lockfile change is included.

- Cold `npm ci`: passed.
- `npm run build`: owner app and widget passed; exit status 0 and all three
  required outputs were present. Build-generated tracked files are restored
  after testing so the review contains source changes rather than bundle churn.
- Focused four-file run: **124/124 passed**, zero skipped/cancelled/TODO.
- Final cold `npm run test:quote`: **2,069/2,106 passed**, **37 failed**, across
  **95 files**; zero skipped, cancelled or TODO.
- Final cold `npm test`: **2,447/2,484 passed**, **37 failed**, across **137 files**;
  zero skipped, cancelled or TODO. Every non-browser test passed.

The full suite includes the quote suite and focused cases; these counts overlap
and must not be added together. All 38 newly added tests passed in both gates.

Both the Chromium headless shell and full Chromium binary crash before page
creation (SIGSEGV / SIGTRAP). A standalone `about:blank` attempt also fails with
no application code loaded, including a diagnostic attempt using one process.
System-call tracing is unavailable (`PTRACE_TRACEME: Operation not permitted`).
No browser test has been skipped, weakened or counted as passing.

The first complete quote gate, before the final long-global-note boundary repair,
was **2,061/2,098 passed, 37 failed**, zero skipped/cancelled/TODO, across 95 files.
Its failures were all browser startup failures. A first full-suite invocation
used an absolute `TEST_RESULTS_FILE` although the runner joins it to the repo
directory; it failed opening that output path before a test summary. The corrected
invocation uses a relative output path. That setup error is not a product
finding and is not counted as a completed test run.

## Remaining release work

The local evidence does not establish a green release. The owner authorized
committing and pushing this repair branch and verifying the existing GitHub CI
at the resulting exact SHA. Its `codex/**` trigger already
runs fresh installation, both builds, the strict quote gate and the full suite.
No CI workflow, test allowance or dependency change is needed.

Any previously saved website imports need owner re-review if they were affected:
the code repair protects new drafts and deliberately performs no live-data
backfill. Nothing here claims the repair is deployed or verifies live calls.

The [manifest](manifest.json) binds the reviewed source and tests by SHA-256;
the hashes were checked after the final cold sequence. The
[execution archive](execution-logs.tar.gz) contains 34 logs and supporting files,
preserving setup failures and successful runs separately. Per-test browser
failures are listed in [quote failures](test-quote-final-failures.json) and
[full-suite failures](test-full-final-failures.json). All 37 in each suite are
`browserType.launch` failures with SIGSEGV before a page is created.

Audited base SHA: **73c00622d6f2df31f57773b32e41355a7421f1a3**. Repair coverage:
HTML/plain-text imports, item/group/page conditions, size and instruction limits,
repeated imports, owner review/save, stored knowledge and repeated voice facts,
plus owner optional-extra guidance and blank/zero calculation disclosures.
Tests: fresh install and two builds passed; **124 focused checks passed**,
**38 new regressions passed**, quote **2,069 passed / 37 failed**, full
**2,447 passed / 37 failed**. No unresolved pricing-policy decision was introduced.
