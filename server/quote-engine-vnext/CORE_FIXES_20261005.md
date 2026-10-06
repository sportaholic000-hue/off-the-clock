# Engine core repair acceptance — October 5, 2026

Historical checkpoint. The authorized date-context continuation and the
independent proof for updating the Astra disposal assertion are recorded in
[DATE_CONTEXT_FIX_20261006.md](./DATE_CONTEXT_FIX_20261006.md).

Start: `4ff586cad88769a72a9a79f146d5702181d530b4`.
Branch: `claude/engine-core-fixes-20261005`. Synthetic data only.

## Handwritten money expectations, recorded before execution

Unless stated otherwise, fees, markup, tax, minimum and range buffer are zero.

- Flooring: $1/sqft labor and $1/sqft material, zero waste, three rooms.
  449.97 sqft / 3 = 149.99: labor $539.96 + material $449.97 = **$989.93**.
  450 / 3 = 150: labor $540 + material $450 = **$990** (small).
  450.03 / 3 = 150.01: labor $495.03 + material $450.03 = **$945.06**.
  899.97 / 3 = 299.99: labor $989.97 + material $899.97 = **$1,889.94**.
  900 / 3 = 300: labor $990 + material $900 = **$1,890** (medium).
  900.03 / 3 = 300.01: labor $900.03 + material $900.03 = **$1,800.06**.
- Roof: 1,000 sqft = 10 squares, $50 labor/square + $100 material/square
  + $20 tear-off/square = **$1,700**. Included underlayment adds zero.
  Separate $1/square underlayment adds $10 = **$1,710**.
- Grouped paint: 100 wall sqft plus 100 ceiling sqft, one finish coat;
  $1/sqft labor on each = $200. One shared $50 package covers 250 sqft;
  ceil(200/250) = 1 package, zero waste, **$250** total.
  Separate trim control: 101 linear feet, 100 linear feet/package, $30/package,
  two packages = $60; $100 wall labor + $50 wall package + $101 trim labor
  + $60 trim material = **$311**.
  Included-price identity case adds 100 LF trim labor ($100), with its material
  explicitly included in the ceiling product: $200 wall/ceiling labor + $100
  trim labor + $50 shared wall/ceiling package = **$350**.
- Installed fence: 100 LF × $40 = $4,000; materials share 40% = $1,600;
  materials-only tax 10% = $160; no gates **$4,160**. Missing selected gate
  share requires review (no dollar quote). One $250 gate with 40% share adds
  $250 + $10 tax; complete quote **$4,420**.
  With tax off, one installed gate needs no materials-only tax allocation:
  $4,000 + $250 = **$4,250**. A materials share of 0% is an explicit allocation,
  not a missing value; the ordinary roof with zero underlayment tax is **$1,710**.
- Cleanup: 100 sqft × $1 × 1 debris × 1 slope = $100; its own $20 debris
  disposal replaces the $99 common disposal; **$120** with no extra disposal.
- Concrete control: 10 × 10 sqft, 4 inches, no waste, $1/sqft labor = $100;
  concrete 100 × 4 / 324 cubic yards × $81 = $100; 40 open LF × $1 = $40.
  Base **$240**. Demolition 100 sqft × $2, including disposal, adds $200:
  **$440**; higher band at $3 adds $300: **$540**. A missing uncovered fee
  decision requires review, never an invented amount.
- Stair control: 200 sqft × $1 × 1.1 = $220 labor + $200 material = $420;
  5 steps × $10 = $50 => **$470**. Wider band at $20/step => **$520**.
- Repair controls: $100/hour; small one hour + $10 materials = **$110**;
  medium two hours + $20 = **$220**; large three hours + $30 = **$330**.
  Roof bands: below 50 small; 50 through 200 medium; over 200 large.
  Flat-roof/siding bands: below 20 small; 20 through 80 medium; over 80 large.
  Owner large maximum is inclusive; above it requires review, no price.
- Peak date control: mowing 5,000 sqft × 2 cents = **$100**; October 10%
  labor surcharge adds $10 => **$110**. At 2026-11-01T01:30:00Z, Halifax
  is still October. Invalid book zone should fall back to valid Halifax profile;
  neither valid zone with active peak pricing must require review.
- Installed-share catalog: 10 roofing squares, $500 labor + $1,000 material
  + $200 tear-off + $10 installed underlayment = $1,710. Only the installed
  underlayment is taxable in this synthetic control; 100% material share and
  10% tax adds $1 => **$1,711**. Missing share requires review, no estimate.

Timing, metadata, gate, selection, schema and readiness checks have no dollar
output. No expected money value is calculated by the implementation under test.
Existing repository test expectations are retained unless a newly approved rule
explicitly supersedes one. No skipped tests or failure allowances are added.

## Source and execution confirmation

Each changed finding was reproduced against the verified starting revision before
its implementation was edited. This is a scoped repair checkpoint, not launch
sign-off. The implementation and regressions use synthetic, isolated price books.

| Item | Source finding and executable reproduction | Repair / status |
| --- | --- | --- |
| 1 | `priceBook.js` described exclusive maxima; executable metadata contained that text while the engine's 150-square-foot average used the small factor. Activation did not systematically probe both sides of each room, repair, thickness and width boundary. | Owner help now describes inclusive room maxima. Activation probes supported boundary neighbours and checks rejection outside supported bands. Independent money tests cover below, equal and above the boundaries. |
| 2 | `quoteDate.js` replaced an invalid book zone with UTC, discarding a valid profile zone. At `2026-11-01T01:30:00Z`, invalid book zone plus Halifax returned month 11. An approved synthetic book with peak pricing and neither valid zone remained `QUOTING LIVE` and produced $100. `engine.js` financial inputs and the application bridge contain no recorded zone/instant. | **Unfixed.** Correct readiness and calculation-record context require `server/src/quoteDoneBridge.js`, outside the allowed files. Its status cache currently depends only on the book, and it supplies only a numeric month to the engine. No helper-only workaround was applied. |
| 3 | `computeIncludedPathDiagnostics` used a shallow tier spread. A tier's second scope displaced the base scope in validation; the recursively merged calculation should quote $1,700. | Validation now uses the same recursive pricing merge as calculation. Regression quotes $1,700. |
| 4 | Grouped paint purchases retained only the first rate path; the ceiling identity used by the inclusion policy disappeared. The $350 case reviewed. | Every contributing price identity is retained in evidence and considered for inclusion classification. Category, basis, selection and receipt-integrity controls still reject invalid coverage. |
| 5 | Activation's optional-price filter omitted installed-material-share completeness. A missing optional gate share made the entire fence service unready, despite a valid $4,160 no-gate quote. | Optional share failures are reported separately. No-gate coverage stays live; selected missing-share gates review; configured gates quote $4,420. |
| 6 | Activation flattened one tier's prices while retaining inclusion paths from other tiers. A valid two-option roof configuration lost an option during readiness. | Activation preserves the original service context and internally selects the option being checked. Both configured options remain valid; a failing selected option cannot borrow another option's result. |
| 7 | Early fee checks recognized only unsuffixed scope keys and not cleanup's calculated disposal replacement. Executable cleanup ($120) and named demolition ($440) quotes succeeded while readiness rejected them. | Readiness follows the actual template's fee replacements. Missing choices still block actual uncovered jobs. A pre-existing test outside the allowed files asserts the superseded blanket-block behavior; it remains unchanged and fails. |
| 8 | Shared scope definitions labeled every paint package in square feet, while trim quantities use linear feet. Metadata execution reproduced the incorrect unit. | Trim coverage metadata, editor labels and purchase evidence state linear feet. The 101-foot control purchases two packages and quotes $311. |
| 9 | Product-axis pruning omitted installed-material-share diagnostics, leaving exhaustive failed pair checks. An 80-by-80 missing-share catalog blocked for 15,259.915 ms before repair. | Missing shares are precomputed and pruned per product axis. Full, quick and public-catalog 320-product regressions enforce a 1,500 ms bound, preserve first/last valid products and accept explicit zero shares. |
| 10 | The strict runner accepted skipped tests, and selection omitted standalone supporting-module tests. Synthetic execution returned success for a skipped test and omitted a quote-date-only spec. | The gate checks every selected file's results and the complete summary; failures, cancellation, skip, TODO, empty/missing results and zero selected files fail. Supporting modules and engine-local regressions are selected. |

The actual `npm run test:quote` entry point is
`server/scripts/quote-vnext-gate.js`; there is no root
`scripts/quote-vnext-gate.js` at the starting revision.

## Verification and remaining ownership boundaries

- All 90 new regression tests passed locally, with no skipped tests.
- Cold `npm ci` installed 255 packages from the unchanged lockfile.
- `npm run build` passed from a fresh client output directory.
- Local browser tests cannot start Chromium in this execution environment
  (`SIGTRAP` before a page is created). They remain mandatory in hosted CI.
- The completed cold local strict run selected 77 files and executed 1,816
  tests: 1,780 passed, 36 failed, zero skipped/cancelled/TODO. Of the failures,
  35 are Chromium startup failures and one is the conflicting disposal-status
  assertion described below. A separate interrupted rerun produced no complete
  summary and is not used as acceptance evidence.
- The strict gate is **not claimed green**. In addition to browser verification,
  `test/astraAuditRepairs20261004.spec.mjs` asserts `NEEDS PRICING` for the
  demolition/disposal case that item 7 explicitly makes available. The new tests
  prove both the valid scoped quote and review of the uncovered base job.
  Updating this old assertion requires a file outside the ownership list.
- Completing item 2 requires ownership of the application bridge and updates to
  conflicting existing time-zone tests/fixtures, including
  `test/quoteDecisionFollowup.spec.mjs` (which currently requires missing zones
  to keep quoting). No files outside the allowed implementation paths were
  changed for this checkpoint. No merge, deployment or live-data change occurred.
