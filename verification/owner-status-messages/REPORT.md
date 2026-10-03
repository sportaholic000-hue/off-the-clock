# Owner status message repair

Base: `0c8c77420ec84bdd1c6004ce06a25d219ebb8baa`, branch `codex/quote-trade-decisions-20261003`, draft PR #19. Scope: quote-engine/price-book owner messages only. No dependency, phone, billing or onboarding changes. No merge or deployment.

## Behavior

The activation evaluator previously collected all failed condition diagnostics when an itemized painting offering had a shared blocker. That made missing optional good/poor prep rates look like service requirements. The existing activation checks still decide readiness and per-condition eligibility. A separate presentation step now removes missing condition-price diagnostics from required lists and exposes them in surface-condition coverage as **Not yet priced. Requests for this condition go to review.** Invalid prices remain errors. If every condition lacks preparation pricing, the owner is asked to price at least one condition; the service remains NEEDS PRICING.

The reproduced 2-story legacy exterior offering lists only baseline confirmation as required. Good and poor are separately unpriced. After explicit confirmation and ordinary approval, fair quotes at $2,475 while good/poor still return review. Saved prices are unchanged.

Only two application files changed: `server/quote-engine-vnext/priceBook.js` and `client/src/pricebook.jsx`. No arithmetic, raw quote validation, service activation probes, approval version or dependency files changed.

## Results

| Verification | Result | Evidence |
| --- | --- | --- |
| New regression file on original status source | 8 failures reproduce old messages | `before-regression.tap`, `before-source-binding.json` |
| New regression file on final source | 8/8 pass | `regression.tap` |
| Complete quote output and eligibility comparison | 48/48 byte-identical snapshots | `comparison.json`, `before-quotes.json.gz`, `after-quotes.json.gz` |
| Full suite | 1,295 pass, 9 known voice failures, 2 skipped; 1,306 total records | `full-suite.tap.gz` |
| Existing known-failure checker | Pass; same 9/9 known failures, no new failure | `full-suite-check.txt` |
| Owner and widget builds | Both pass | `build.log` |
| Actual built editor + authenticated save/approval + public quotes | Pass, no browser errors | `browser/public/result.json`, screenshots and sanitized HTTP evidence |
| Application source binding | All 153 entries match final files | `browser/public/source-binding.json` |

The eight regressions cover interior/exterior legacy confirmation, clearing the real blocker, an unrelated missing wall-labor rate, no priced conditions, partially priced conditions, existing zero-price review rules, malformed optional prices and mixed price options.

The 48-case comparison covers both itemized painting types, eight setup states and good/fair/poor customer conditions. Synthetic service and quote UUIDs are fixed for reproducibility. Entire internal results, sanitized customer results, service status, valid tiers and condition eligibility match; no monetary or eligibility fields are excluded. Owner setup messages are intentionally different and are tested separately.

Hand-check for the priced exterior control: 500 sqft × (2 × $1.00 wall labor + $1.00 prep labor + $0.50 primer labor) × 1.10 stories = $1,925 labor. Materials: 500 × (2 × $0.30 wall material + $0.20 prep material + $0.20 primer material) × 1.10 waste = $550. Total $2,475.

## Reproduction commands

Run from the repository root with Node 22 and the existing lockfile dependencies:

```sh
node --test test/ownerStatusMessages.spec.mjs
node --test --test-concurrency=1 test/*.spec.js test/*.spec.mjs > full-suite.tap 2>&1
node .github/scripts/check-test-results.mjs full-suite.tap
npm --prefix client run build
node verification/owner-status-messages/quote-invariance.mjs after-quotes.json
node verification/owner-status-messages/browser.mjs <fresh-output-directory>
```

The full suite and standalone browser harness use `PRICEBOOK_BROWSER_MODULE` and `PRICEBOOK_BROWSER_EXECUTABLE` pointing to external Playwright/Chromium test tooling, without changing repository dependencies. Local Node version was 22.23.2. The browser harness uses isolated synthetic local accounts and SQLite data; private test credentials/databases are excluded from committed evidence.

This verifies the scoped repair locally. Existing voice failures remain unresolved and outside this task. It does not claim a production deployment or a new audit of every engine decision. GitHub CI results are recorded on PR #19 after the verified commit is published.
