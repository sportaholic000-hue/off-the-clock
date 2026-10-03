# Three quote-decision gaps — October 3, 2026

Implemented on `535a16f33beef67cfbaa29f94f59fc65dd3dfb94`, preserving the dependency security repair after `a662b76`. This follow-up changes only the three requested quote-engine/price-book behaviors. No phone wording, billing, onboarding, dependency, CI policy, merge or deployment changes.

## 1. Peak pricing cannot require an installed labor allocation

Removed the seasonal calculator's exception for installed prices without a labor portion. Those prices contribute zero to the seasonal labor basis. Explicit labor lines, the existing painting-preparation labor classification, and entered installed labor portions retain their existing exact calculation. Readiness still probes a peak month; it now succeeds without an invented allocation.

The saved/approved roof reproduction stays QUOTING LIVE and produces customer estimates in every month. July-only pricing gives $5,990.00 in October. A 10% October surcharge adds $195.50 on $1,955.00 of explicit roofing labor, producing $6,185.50; the installed underlayment has no labor allocation and adds no surcharge. Existing removal category treatment is unchanged. With an explicit 60% underlayment labor portion, the surcharge becomes $217.10.

The 100-ft itemized fence with two corners and one gate derives 18 posts. Its explicit labor is $1,072.00; the gate's entered 60% labor portion adds $150.00. The verified 10% surcharge is exactly **$122.20 on $1,222.00**, for a total of $4,112.20. Without that gate allocation, the surcharge is $107.20.

Coverage includes installed and itemized fence/replacement, walls, ceilings, trim, gates, removal, roof underlayment, floor underlayment, and an additional installed scope. Materials-only tax remains independent: $4,500 installed fence × 40% material × 15% tax = $270 tax.

## 2. Baseline price labels and legacy offering confirmation

The offering notes, every active offering price field, and offering tier headings name the baseline: **flat ground**, **standard-height walls**, or **one-story building**. The notes state that the existing terrain/height/stories factors apply on top to labor only. Material rates are not multiplied by these factors.

An offering that retains a non-baseline condition without an explicit `offeringDetails.baselinePricesConfirmed: true` receives a specific owner notice and cannot quote. The shared owner validator enforces this for readiness and raw/application quotes. A generic save or saved-configuration approval does not automatically confirm the price basis. The owner reviews/edits the prices, checks the baseline confirmation, saves, and approves the resulting exact configuration. The previous condition and every saved rate are retained.

There was no per-offering price-basis version marker before this change, so the migration identifies legacy condition fields rather than guessing from a timestamp. Unmarked non-baseline offerings require confirmation; baseline offerings require no migration step. Confirmation must be a boolean, not a string or number. The engine approval version is unchanged so otherwise current approvals remain valid; ordinary saved-content changes still invalidate their approval receipts. The legacy guard does not rely on invalidating those receipts.

The synthetic exterior fixture now explicitly confirms its baseline prices so the existing locked calculation cases keep their expected values. Dedicated migration tests remove that confirmation and prove that the same unconfirmed prices are review-only first.

## 3. Time-zone setup prompt without a quoting block

The price book's Quote configuration prompts for a business quote time zone whenever business or service peak months are selected and no quote zone was explicitly chosen. Selecting UTC explicitly counts as a choice. Until a choice is saved, quoting uses the existing saved profile zone, or UTC when none is valid; the notice explains that fallback. No browser location or time zone is silently adopted.

Removed the missing-profile-zone exception. An explicitly selected quote time zone retains precedence. Regression tests verify $100 -> $110 October mowing and Atlantic October 31 at 10:30 pm counting as October even though UTC has entered November. Invalid saved pricing configuration retains its existing validation rules.

## Verification and evidence

- **Before/after:** the same 28-case regression file reports 25 failures / 3 passing controls against hash-checked pre-edit application source, then **28/28 pass** after the fixes. `EXPECTED.md` records hand calculations written before execution. Existing arithmetic expectations were not relaxed.
- **Full suite:** **1,298 records: 1,287 passed, nine unchanged known voice failures, two skipped**. The repository's existing failure checker exits 0 and reports 9/9 known failures. The raw test process exits 1 because those existing failures remain. Exact names are in `RESULTS.json`.
- **Builds:** owner and widget production builds both pass. The existing bundle-size warning remains informational.
- **Actual browser/application:** **4/4 workflows pass** with the built owner editor, real save/load/approval endpoints, public customer quotes, fresh isolated synthetic accounts, and local SQLite. Verified the nonblocking time-zone prompt, saved zone persistence, all three visible baseline labels, unchecked legacy notices, explicit confirmation and reload, preserved money values, and customer output privacy. Screenshots were inspected. No mocked quote responses.
- **Source binding:** all 153 application source hashes from the browser run matched the final application files. New test/harness/report hashes are included in `MANIFEST.json`. Dependency manifests and lockfile are unchanged from the security repair.

Commands: `node --test test/quoteDecisionFollowup.spec.mjs`; `node --test --test-concurrency=1 test/*.spec.js test/*.spec.mjs`; `node .github/scripts/check-test-results.mjs verification/quote-decision-followup/full-suite.tap`; `npm --prefix client run build`; and `node verification/quote-decision-followup/browser.mjs <fresh-evidence-directory>`. Local Node is 22.23.2. Browser execution uses the existing Playwright module and Chromium executable supplied through `PRICEBOOK_BROWSER_MODULE` and `PRICEBOOK_BROWSER_EXECUTABLE`.

Evidence: `before-complete.tap.gz`, `regressions.tap`, `full-suite.tap.gz`, `test-check.txt`, `build.log`, `RESULTS.json`, pre-edit source hashes, and the `application-01/public/` screenshots, sanitized HTTP/browser traces, result and source-binding files. GitHub checks are verified after publication and linked from the PR. This is a draft implementation checkpoint, not a deployment or a claim that the unrelated existing voice failures are fixed.
