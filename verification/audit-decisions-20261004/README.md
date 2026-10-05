# Quote engine and price book — agreed October 4 audit fixes

Tested code: `bd14bfb5ac38754abd1a054d5bdc6a6ffcec67dd`, on
`codex/quote-audit-ready-20261004`, [draft PR #24](https://github.com/sportaholic000-hue/off-the-clock/pull/24).
The main implementation is `69d503cda66f24e6ea17f300565ff160cff8ae79`;
the subsequent checkpoints repair ordinary product-name entry and preserve
unrelated base quotes with historical optional scope names.
The earlier unpublished scope draft was discarded before implementing the
[owner's agreed rules](../../specs/QUOTE_AUDIT_DECISIONS_20261004.md).

## Changes and acceptance coverage

| Reported problem | Result and verification |
| --- | --- |
| Commercial flat roofs forced insulation and coverboard; residential roofs lacked the choice | Independent explicit Yes/No answers and measured areas for both layers, regardless of building type. All eight building/layer combinations have exact totals. Neither layer selected needs no scope setup; each selected layer needs only its own system, area and prices. Missing answers and invalid areas still require review. |
| Only one removal, overlay or stair situation could be priced | Named additional entries have independent details and prices. Matching covers old siding/stories, demolition reinforcement/access/thickness, old/new floor combinations and stair flooring/width/removal/disposal. Existing access matching stays exact; only explicit `up_to` broadens demolition access. Base and effective-tier overlaps are rejected before saving; historical invalid records also fail quote validation. |
| AI interview could not set up offerings or scopes | Shared typed configuration schemas and owner controls cover offerings, scopes, multiple entries, underlayment and individual prices. Explicit product registration is a separate answer; prices never create registrations implicitly. Saved interview drafts retain owner-stated settings and remain unconfirmed until review. A saved-to-approved fence workflow reaches a verified quote. |
| Measured rates rejected fractional cents while item prices accepted them | Each individual price is classified by its quantity. Measured rates preserve fractional cents; fixed amounts, gates, posts, footings, steps, plants and purchased packages require whole cents. Save, editor, validation and calculation agree. The 137-case precision matrix exercises the distinct price paths in 65 fixtures. |
| Concrete formwork always charged the full perimeter | Customers identify edges adjoining foundations or existing concrete and give their measured total. Rectangle, area/perimeter and outline methods subtract that length. A 12-by-16 slab with 16 adjoining feet charges 40 feet of forms. Missing, contradictory and excessive measurements are rejected; zero remaining formwork is valid. |
| Numeric customer summaries lacked units | Summaries use each field's defined unit and preserve the existing fence-height formatter and privacy boundary. |
| Retired formulas remained executable | Removed active fallback formulas for stairs, siding removal, slab demolition, forced flat-roof insulation and base exterior painting. Historical saved values remain visible and cannot become fallback prices. The historical legacy engine is not used by production routes. |
| Tests wrote synthetic books into application data | A temporary price-book directory is established before imports and inherited by child processes. Direct scoped tests and both hosted test commands use it. All 156 existing local price-book files retain identical content hashes after the regression run. |
| Peak surcharge omitted removal labor | Roof/flat-roof tear-off, flooring removal and itemized siding/demolition labor qualify. Complete installed packages contribute only their declared labor portion. Mixed preparation and separately priced disposal retain their previous treatment. Flat-roof tear-off now says removal labor. Exact arithmetic tests cover itemized labor, installed allocations and excluded charges. |

Final integration checks also found and repaired two setup defects: the interview
needed explicit product-registration controls, and overlay product-name entry
needed the same conversion used by the product registry. Owners can type
“Vinyl plank”; the stored selector matches `vinyl_plank`. Invalid drafts remain
visible for correction. No fuzzy product substitution was added, and no old
saved selector is silently migrated. A final compatibility check proved that
rejecting an old optional display name globally would disable unrelated base
work; that restriction was removed. The [failing reproduction](optional-selector-before.tap)
and [78 passing decision cases](decision-cases-after.tap) preserve the evidence.

## Evidence

- **1,392/1,392 local tests**, across 44 non-browser quote/price-book files;
  zero failures, skips or cancellations. [Named outcomes](local-regressions.tap)
  and [file list](local-test-files.json).
- New local coverage: 78 agreed-decision cases, 137 price-precision cases and
  four rendered-interview cases. Three additional browser interaction cases
  run in the hosted gate. These counts overlap with the full gate totals.
- Both production bundles built locally. [Build output](local-build.log).
- [Test isolation evidence](test-isolation.json): 156 files before/after,
  unchanged content hashes.
- All **190 materialized source, test, dependency and workflow files** match
  their GitHub blobs at the tested checkpoint. [Source binding](source-binding.json).
- Exact-commit browser and broader regression results: [hosted evidence](CI_EVIDENCE.md).

Run `npm run test:quote` from a complete checkout with the lockfile dependencies
and Playwright/Chromium installed. The existing CI workflow runs the production
builds, strict quote/price-book gate and full regression baseline check. The
shared selector includes the new regression files automatically.

The tests' expected monetary values were written before execution. Existing
assertions changed only where the agreed rules changed their expected behavior,
where fixtures needed explicit new customer answers, or where the test command
and setup schemas changed. The existing failure baseline was not expanded.

## Scope and release boundary

No sub-agents were used. Work is limited to quoting, price-book configuration,
their interview/editor/customer-summary paths and relevant verification.
No merge, deployment or live customer-data change is included.

The engine version is `quote-engine-vnext-audit-decisions-20261004-v4`.
Changed arithmetic and scope rules require fresh owner approval through the
existing version mechanism; older approval is not automatically carried over.
New owner controls and question wording are reviewable in the draft PR.

Passing these checks verifies the recorded cases; it does not establish that
every possible job or defect has been covered. Earlier verification reports
retain their original source bindings and are historical evidence.
