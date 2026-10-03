# Quote-engine component pricing and price-book repairs

Scope: the owner's latest confirmed quote-engine/price-book findings, plus the explicit arbitrary-height fence requirement. Base: `9457a50a538d2c437f3f821f89ec1c49966229bf`, branch `codex/quote-trade-decisions-20261003`, existing draft PR #19. No subagents, dependency changes, merge, deployment, billing/onboarding changes, or voice implementation work.

## Result

The four reproduced component-pricing errors are corrected. Included underlayment, conditional readiness notices and owner-controlled permit rules are implemented. The price book now supports distinct offering names, fractional-inch fence entry, readable saved approval, plain product names and inclusion selectors. Customer wording and retired input fields are corrected.

**1,334 tests passed; the same nine known voice failures; two skipped.** The existing CI failure checker passes. Both owner and widget production builds pass. New direct regression file: **39/39 pass**. Seven real-browser workflows pass, including authenticated save/approval and public customer quotes. No browser page errors.

These are repaired, tested cases, not a claim that every possible business configuration has been proven defect-free.

## Findings and changes

| Finding | Implemented behavior and evidence |
|---|---|
| Siding removal charged story adjustment twice | Removal prices cover the expressly configured existing-story count. No second story factor. All three stories tested, plus rejection when the requested removal story does not match. |
| Interior offering trim inherited wall height | Trim stays at its measured-length price for standard/high/vaulted walls, in both itemized and installed offerings. No labor percentage is required just because the walls are high. Peak surcharge still uses an entered trim labor portion. |
| Flat-roof insulation and coverboard omitted access adjustment | Itemized installation labor receives the roof-access factor. Material quantities/prices and complete installed scopes retain their basis. Easy/moderate/difficult cases tested. |
| Siding trim omitted story adjustment | Itemized trim labor receives the new-building story factor. Materials remain unchanged. One/two/three-story cases tested. |
| Included flooring underlayment failed with cost pricing | Existing approved zero-included mappings use the covering flooring material's cost/selling basis. Category/basis/positive-covering-price validation remains in force. Zero-included floor underlayment needs no fictitious installed tax allocation. Laminate, hardwood and carpet tested with both bases. |
| Owner needed zero prices and internal paths just to include underlayment | New **Included in flooring material price** mode adds no separate charge or purchase quantity. Earlier scope rates remain saved and visibly unused. Both cost and selling modes verified through HTTP. |
| Live status concealed missing labor allocations | Additional coverage notices identify the applicable terrain/height/stories and installed components. Baseline jobs stay live; selected unsupported conditions still go to review until the owner enters the labor share. Tests include missing gate labor shares on moderate/steep ground and installed exterior walls on two/three stories. |
| Fence heights/names were too restrictive to manage | Arbitrary positive decimal-foot heights already worked in the engine and are preserved. Shared owner/customer controls now accept whole feet plus decimal inches. Editable names distinguish multiple offerings. Browser test saves and quotes **5 ft 3.65 in** and a separately named **6 ft** offering; using the wrong height for the selected offering still requires review. No interpolation is introduced. |
| Customer answer controlled permit charge | Owner chooses always, owner selected, included, or not applicable. Earlier customer-selected/scope-selected permit modes need an explicit owner correction. The engine does not infer that a permit is required. Customer permit answers cannot remove or add an owner-selected fee. Customer forms omit the question. |
| Mulch and bed-preparation copy | Stated yards say customer-stated; derived yards remain calculated. Bed preparation describes weeding/clearing instead of embedding a raw condition phrase. No quantity arithmetic changed. |
| Stair confirmation exposed booleans | Inclusions use ordinary sentences such as “Underlayment is included.” |
| All reviews had identical customer wording | Missing measurements, other job details and inspection needs get fixed situation-specific explanations. Technical/malformed-result failures retain the generic safe fallback. Internal diagnostic text, rates, IDs, markup and allocations are never echoed. Accessor and malformed-evidence safety tests continue to pass. |
| Saved approval/AI confirmation exposed internal fields | Readable table of settings and exact values, with monetary units, percentages, factors, rules and tier overrides. AI field confirmations use readable labels. Values remain visible alongside labels without horizontal scrolling. Internal receipts are omitted from the owner entry/review controls. |
| Product registry exposed keys and UUIDs | Owner sees plain product names; stable internal IDs remain intact. Ordinary entered names are normalized consistently with the price-map controls. |
| Labels were built from code names | Shared human labels cover fees, categories, additional work, underlayment choices and linear-foot units. Installed-component labels use the trade definitions. |
| Included-zero prices required typing paths | Dropdowns list saved zero prices and positive covering prices by readable name and exact amount. Seven-workflow browser verification includes approving this mapping and obtaining the correct customer quote. |
| Four retired fields appeared required | Stair-per-step, siding-removal scalar, flat-roof insulation scalar and concrete-demolition scalar leave the current field list. Saved values remain in the record and appear in retained-setting review. Merely displaying those retained values does not invalidate existing approvals. |
| New-book 30% markup and 10% buffer were not explicit | These existing specified defaults are numerically unchanged. Saved approval now names the current markup/margin and range-buffer percentages explicitly, and displays all business settings. Browser approval confirms 30% markup/10% buffer and the expected $130 midpoint on $100 base labor. |
| Registry readiness wording was technical | Messages tell the owner to register priced products and match product names, rather than referring to inconsistent registries/selectors. |

## Hand-calculated checks

All amounts below are synthetic controlled fixtures, not recommended contractor rates.

| Case | Expected arithmetic/result |
|---|---|
| Siding removal, configured for each story count | 1,000 sq ft × $1.20 = **$1,200**, with no additional story factor. |
| Interior trim, each wall height, either offering mode | 100 LF × $2.10 = **$210**, with or without an entered trim labor share. |
| Roof insulation/coverboard, moderate access | Insulation: 1,850 × $0.50 × 1.15 = **$1,063.75**. Coverboard: 1,850 × $0.25 × 1.15 = $531.875 → **$531.88**. Each line rounds once. |
| Same layers, difficult access | **$1,202.50** insulation + **$601.25** coverboard labor. Material lines remain $2,775 and $1,387.50. |
| Siding trim, two stories | 240 LF × $2.10 × 1.10 = **$554.40**; three stories = **$604.80**. |
| Included laminate underlayment | $660 labor + $1,080 floor material = **$1,740**, whether material basis is cost or selling price when markup is zero. |
| Included laminate, 20% markup and 10% materials tax | $660 × 1.20 + $1,080 × 1.20 × 1.10 = **$2,217.60**. Hardwood/carpet fixture = **$2,244**. |
| Legacy zero-included laminate with 10% materials tax | $660 + $1,080 + $108 = **$1,848**, without an installed-underlayment materials share. |
| Interior itemized high walls, existing fixture | Original $3,287 + 10% of $2,350 wall/ceiling/prep labor = **$3,522**. Trim stays $200. Vaulted = **$3,874.50**. |
| Owner-selected permit | $100 mowing + owner-selected $50 permit = **$150**, regardless of supplied customer true/false. Owner No gives **$100**. |
| Stated mulch and bed preparation | 6 yards × ($50 materials + $20 labor) + 820 sq ft × $1 prep = **$1,240**. No derived-yard overage. |

These controlled insulation rates give a $208.13 correction at moderate access. The audit's separate $263.63 example did not supply all its component rates; this report does not claim that exact delta was independently reproduced.

Existing regression expectations changed only for the intentionally corrected trim-height totals, permit applicability, situation-specific review wording and readable UI labels. The existing peak-surcharge trim test retains its $3,534 result because an entered trim labor share still participates in the labor-only surcharge. Roof/tile independence controls remain **$5,990/$1,780**.

## Verification and reproducibility

- `test/componentPricingRepairs.spec.mjs`: 39 cases. The identical file against the unchanged base produces **10 passes / 29 failures**; all 39 pass after repair. Multiple cases exercise one finding under different conditions; failures are not a count of distinct product defects. The readable-review helper is new and its base-version case fails because the module did not exist.
- 235 backed-up source/test/spec files matched the base's GitHub blob SHAs. See `before-source-binding.json` and `baseline-verification.json`.
- Focused engine/decision regression run: 267 passes, zero failures. Full final suite independently reruns these cases.
- Full command: `node --test --test-concurrency=1 test/*.spec.js test/*.spec.mjs` using Node v22.23.2. Result: 1,345 records = 1,334 passes + nine known failures + two skips. `node .github/scripts/check-test-results.mjs verification/component-pricing-repairs/full-suite.tap` succeeds.
- Known failures remain exactly those in `.github/known-test-failures.txt`; no entries were added or changed.
- Build command: `npm --prefix client run build`, which builds both owner and widget. Existing bundle-size warnings are not build failures.
- Browser command: `node verification/component-pricing-repairs/browser.mjs <fresh-output-directory>`, with the documented Playwright/Chromium environment variables from earlier repository verification. Tests use isolated synthetic accounts and SQLite stores. No live customer data or provider writes.
- Browser workflows: B01 exact fence height and distinct names; B02 included flooring; B03 labor coverage and repair; B04 owner permits; B05 readable approval and defaults; B06 registry; B07 included-price selectors. All pass with zero page errors. All 154 application source hashes in the browser binding match the tested source. The artifact manifest separately binds the stylesheet and all changed files.
- Compressed logs are ordinary gzip: `gzip -dc full-suite.tap.gz` and `gzip -dc evidence/browser-wire.json.gz`. The publishable evidence excludes private databases, synthetic passwords/session tokens and temporary execution stores.

## Deliberate limits

Existing installed labor/material allocations are never inferred. Unsupported or unpriced conditions remain review-only. Historical retry prices and customer amount precision are not changed. The engine approval version remains unchanged to avoid a blanket approval reset; editing owner settings still requires normal saved approval. Customer output remains an estimate/scope, not a labor/material/tax cost breakdown.

This checkpoint is saved for review in draft PR #19. It is not merged or deployed, and does not fix the separately tracked voice failures or change phone-agent wording. Final commit SHA and GitHub workflow results are reported with the PR/checkpoint delivery.
