# Agent 2 — price enumeration, metadata and precision

**Remaining cross-owner issue:** the existing application approval endpoint can
still stamp an approval receipt for an already-persisted legacy fractional-cent
pipe-jack price. The owned fix makes that price fail owner validation and keeps
the service at `NEEDS PRICING`; the quote requires review. The exact proposed
approval-boundary patch is supplied below and has **not** been applied.

Branch: `codex/qe-agent2-price-metadata-20261018`.
Parent/base: `0b59a401e1d8f2c2c43188c7355abb9939504b9b`.
Base tree: `2cca6042c51fdcea4c89f559c4e465e3f03ee845`.
Work performed personally, with no subagents.

## Implemented owned changes

### F9 — complete painting and surface enumeration

`server/priceBookMoney.js` now routes each dynamic map through its actual
definitions. Conversion and enumeration share that routing, so paintingRates
and surfaceExtraRates cannot silently fall through to scopeRateDefinitions.
Painting components use the same labor, material and preparation categories
as their quote lines. Every supported optional surface price uses addon and
the explicit selling-price basis of its existing quote line. An unrelated
category-wide addon cost setting therefore does not manufacture a cost-age
warning for a complete installed door price.

Coverage includes all 14 painting leaves in both painting service types,
all four interior extras, all eight exterior extras, and both siding extras
with each supported soffit unit. Every leaf is checked at base and explicit
tier boundaries. Ordinary material prices are controls. The tests cover root
and nested pricing, inherited and reordered tiers, absent/unknown/nested
non-leaves, removal of a price, and cloned metadata views.

Real `savePricebook` / `loadPricebook` and on-disk JSON checks cover every
listed leaf's source note, server timestamp, no-op saves, individual numeric
edits and independent base/tier dates. Legacy records are written without
invented timestamps and saved unchanged to prove that missing dates remain
missing. A source-note edit is not a numeric edit. Both AI source types are
covered; ordinary confirmation does not adopt a placeholder, while a numeric
edit or explicit per-price acceptance clears only that leaf's marker.

`server/priceMetadata.js` needs no change: its existing transition is correct
once enumeration supplies the missing prices. Its file is byte-identical to
the requested base.

### F16 — discrete pipe-jack prices require whole cents

`server/pricePrecision.js` now includes pipeJackEach in FIXED_PRICE_FIELDS.
The same existing rule reaches dollar/cent conversion, owner pricing
validation, application save validation, editor metadata and the shared
ExactNumericInput component. $1.005 is rejected at root, nested and tier
save boundaries without changing the submitted value or the durable book.
The actual Chromium input retains invalid text and reports the error; $1.01
is accepted as a number. Whole-cent controls include zero and $12.34.

The extension arithmetic is unchanged. Measured $1.005 rates retain 100.5
cents, and three units extend to 302 cents after the existing single rounding
step. Three valid $1.01 pipe jacks extend to 303 cents. Stored legacy
100.5-cent each-prices remain displayable as $1.005 for correction, fail owner
validation and cannot produce a quote.

### F21 — all 15 classifications follow existing pricing semantics

| Family | Fields | Category |
| --- | --- | --- |
| Roofing | iceWaterBarrierPerSqft, iceWaterBarrierPerLF, valleyPerLF, stepFlashingPerLF, pipeJackEach, ridgeVentPerLF | material |
| Concrete | shortLoadPerYard, shortLoadFlatFee, baseGravelPerCubicYard | material |
| Concrete | sawCutPerLF, baseExcavationGradingPerSqft | labor |
| Concrete | placementFlat.pump, placementPerCubicYard.pump | addon |
| Sod | sodGradingPerSqft | labor |
| Sod | topsoilPerCubicYard | material |

The classifications were read from existing quote-line builders and configured
price-basis rules before implementation, then recorded as handwritten
expectations. Tests compare all 15 against actual quote-line categories and
independently calculated line amounts. Both concrete service types and all
four placement methods are covered. No monetary formula, rate, tax rule or
approval receipt is altered by the classification fix.

For these 15 entries, costBasis follows the category's configured cost/selling
basis. Material prices remain eligible for freshness checks even when they
are selling prices; labor and addon selling prices stay excluded. Tests cover
base/tier metadata, individual changes, source notes, unknown dates, an exact
90-day threshold, one millisecond beyond it, disabled thresholds and AI
controls. Numeric quantities, selectors and minima are not mistaken for these
material/cost entries. Existing offeringRates and scopeRates behavior is left
outside this repair; the explicit basis decoration is confined to surface extras.

## Completed local verification

All successful runs below use Node **v22.23.3**. The browser uses the existing
CI version **Playwright 1.56.0 / Chromium 141.0.7390.37 (build 1194)**. No
dependency manifest, lockfile or workflow is changed.

| Verification | Actual result | Evidence |
| --- | --- | --- |
| Final test sources on the untouched pinned base | 61 tests: 20 pass, 41 fail; no skips/cancellations/TODOs | [before-final-tests.tap](before-final-tests.tap) |
| Focused final tests, including the new Chromium test | 61/61 pass; zero failures/skips/cancellations/TODOs | [focused.tap](focused.tap) |
| Neighboring suites, 20 existing files | 329/329 pass; zero failures/skips/cancellations/TODOs | [neighboring.tap](neighboring.tap) |
| Owner app and widget build | Both Vite builds pass; existing chunk-size warning | [build-native.log](build-native.log) |
| New test inclusion in the unchanged strict selector | All three new spec files selected | [strict-selection.json](strict-selection.json) |
| Cross-owner patch applicability | `git apply --check` passes; patch not applied | [cross-owner-approval.patch](cross-owner-approval.patch) |
| Legacy approval reproduction, base and tier | Expected rejection is absent; script exits 1 | [legacy-approval-gap.json](legacy-approval-gap.json) |

The final-base run uses a separate detached checkout at the exact specified
commit with byte-identical final test sources and fixture helper. The
independent expected categories and monetary values are never derived from
the production enumeration. [EXPECTED.md](EXPECTED.md) was written before
implementation. [source-identity.json](source-identity.json) records source
hashes, final baseline-test identity and the ownership check.

The first native baseline also had 20 passes / 41 failures
([before-first-native.tap](before-first-native.tap)). After the first fix,
53 passed and eight root/nested comparisons failed only because those two
representations enumerate in different orders ([after-first.tap](after-first.tap)).
The comparison was corrected to sort by scope/path, preserving every expected
value, kind, category, flag and entry count. The browser fixture additionally
defines its unused import.meta.env to remove a bundler warning. These are the
only changes to the three initial test files; initial hashes are retained in
[expectations-first.sha256](expectations-first.sha256). The final tests were
then rerun against both the original base and the fix.

The restricted runtime's first node --test invocation returned file-level
failure records without child TAP; direct execution and then native
subprocess access produced the complete results. Those initial attempts are
retained for honesty and are not counted as passing gates. A first Chromium
download mirror returned truncated ZIP data; Playwright's next mirror
completed the download and the browser tests actually ran. Native build output
was captured after the restricted runner omitted child output.

Commands used for the decisive focused and baseline runs:

```sh
node --test --test-reporter=tap test/qeAgent2*.spec.mjs
npm run build
node --input-type=module -e 'import {quotePricebookSpecFiles} from "./scripts/testSelection.mjs"; console.log(quotePricebookSpecFiles(process.cwd()).filter(p=>p.includes("qeAgent2")))'
git diff --check
git apply --check verification/qe-agent2-price-metadata-20261018/cross-owner-approval.patch
```

The neighboring command used `node --test --test-concurrency=1 --test-reporter=tap`
on quoteLaneAGroundwork20261016, quoteLaneIntegration20261016,
pricebookMoneyMetadataSweep20261005, pricebookConverterRegressions20261006,
pricebookPersistence, pricebookDurability, pricebookEditorRepairs,
pricebookPersistenceEditor20261005, quoteRatePrecisionMatrix,
precisionFixtureIntegrity, surfacePricing20261016 (unit and DOM),
surfacePricingLaneCFixes20261016, quoteRoofing20261016 (unit and Chromium),
and quoteConcreteLandscape20261016 (unit, validation, delivery, DOM and Chromium).
The actual file/test names and output are in neighboring.tap.

Local commands used a workspace temporary directory for TMPDIR and a workspace
browser cache via PLAYWRIGHT_BROWSERS_PATH; no test touched live owner data.
Build-generated tracked client/dist changes were restored to the base before
publication. [build-outputs.json](build-outputs.json) records their identities.

## Exact proposed cross-owner adjustment

[cross-owner-approval.patch](cross-owner-approval.patch) targets the unchanged
`server/src/quoteDoneBridge.js`, immediately after its existing roof-minimum
guard. It proposes reusing the existing numeric save validation on the
display-converted retained service before any confirmation/approval writes.
That validation already checks fixed precision across base and effective tier
prices and never rounds. The special roof-minimum error is preserved.

[legacy-approval-gap.mjs](legacy-approval-gap.mjs) exercises the real approval
function for both base and tier legacy 100.5-cent pipe-jack prices. Current
responses have `success: true`, `approvalCurrent: true`, a new receipt and
`NEEDS PRICING`; quote generation returns `ESTIMATE_REQUIRES_REVIEW`, and the
stored value remains 100.5. The proposed endpoint change requires its owner's
implementation and validation. It is not represented as a completed repair.

## Publication and hosted verification

This report is prepared before publication so the final hosted run can check
the exact delivered commit without a later evidence-only commit. It asserts
only the completed local results above. The delivery response must record the
exact published SHA/parent and the actual strict/full/browser GitHub Actions
results for that SHA. Earlier-head passes do not satisfy that requirement.

Production changes are limited to server/priceBookMoney.js and
server/pricePrecision.js. All new tests and evidence use the authorized Agent 2
paths. No source extractor, selector, engine, contract, template, UI source,
specification, dependency or workflow change is included. No main/shared
integration branch update, deployment, tag or force push is requested or made
by this work. The only publication target is the requested Agent 2 branch.
