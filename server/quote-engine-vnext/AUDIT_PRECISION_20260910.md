# Isolated VNext precision follow-up

Starting branch: `codex/quote-engine-vnext-audit`.
Starting SHA: `3261560b5e7b5fefe9de6957a676e4464624503a`; clean worktree.
Engine version: `quote-engine-vnext-precision-20260910-v1`.
Repairs 139–146 and all prior protections are retained.

This pass follows the owner's request to check accuracy across supported quote paths. It is an isolated candidate, not a guarantee of exhaustive correctness or authorization to integrate.

## Proven execution defect and repair

A composite component's `amountCents` is its rounded calculated output. The zero classifier previously treated that output as though it were a configured zero price. A positive concrete finish-extra labor charge below half a cent was therefore incorrectly labeled `explicitly_free`. If the same positive rate had a dormant `includedPrices` entry pointing across financial categories, this false classification activated the allocation gate and incorrectly returned review.

The governing rule is the owner's settled field-specific zero policy: a positive price that rounds to zero is distinct from an explicitly free or included configured price. No allocation rule changed. In `templates.js`, `recordNoChargeClassification` now recognizes configured zero from `rateCents`, or the amount of a `fixed_amount` price. It does not interpret a composite rounded result as a configured price. Cross-category inclusion of an actual zero configured price still reviews.

This is one execution defect with two observable effects (wrong evidence and false review), not two independent pricing-model changes. It affects both `CONCRETE_DRIVEWAY` and `CONCRETE_PATIO_SLAB` composite labor, including the shared direct calculator and quote/preview/price-book callers. No confirmed pre-fix customer amount error is claimed: the reproduced amount was already correct where a quote was emitted.

### Independent arithmetic and controls

The regression uses a confirmed 5 ft × 5 ft rectangle, 4-inch thickness, smooth finish, no demolition, no reinforcement, no base preparation, easy access, zero minimum, 10% concrete ordering waste, labor 1 cent/sq ft, concrete 18,000 cents/cubic yard, and formwork 2,500 cents/linear foot.

- Area = 25 sq ft; perimeter = 20 ft.
- Concrete = 25 × 4 × 1.1 / 324 cubic yards. Multiplying by 18,000 cents gives 6,111.111… cents, rounded to 6,111.
- Formwork = 20 × 2,500 = 50,000 cents.
- Base labor = 25 × 1 = 25 cents.
- Vary only `finishMultiplier.smooth`: 1 (no extra component), 1.0196, 1.02, 1.0204. Finish-extra labor is absent, 0.49, 0.50, 0.51 cents; rounded extra is 0, 0, 1, 1 cents. Final totals are 56,136, 56,136, 56,137, 56,137 cents.
- The 0.49-cent component is `rounded_fractional_cent`, with no covering-price path. Repeat the same boundaries with a dormant inclusion entry while the configured labor rate remains positive.
- An explicitly free complete concrete offering remains zero with `explicitly_free` component evidence. Removing only its zero classification returns review.
- Each result is fully traversed, its evidence independently reproduced, its direct-calculator components compared, and its separately sanitized customer projection checked.

Baseline full requests/results, independent public projections, and a failing pre-fix regression were captured before the source edit in the external delivery evidence.

## Expanded contract verification

`test/quoteEngineVNext.spec.js` now asserts that the service catalog exactly matches all 20 registered service types. Sixteen have a supported ready fixture. The four wholly review-only types—exterior painting, both fencing types, and custom—retain explicit owner-decision review controls. Direct quoting, owner preview, price-book quoting and omitted-caller customer output are exercised.

Each of the 16 ready service fixtures receives 89 independent ready checks and 7 review controls. These extend, rather than replace, the existing service-branch, measurement, consumed-price, activation, adversarial and numeric-boundary regressions. A service fixture is not every possible branch or real project.

Expected service amounts come from the existing hand-calculated fixture tables (plus an explicit base-only siding calculation). The financial oracle uses its own BigInt fractions and rounding, not engine exactMath helpers or returned monetary fields. It checks:

- Configured cost/sell basis and all-sell-price controls; all three tax modes.
- Markup at 0% and 17.5%; gross margin at 17.5%, 90%, 99%, 99.9%; invalid margin at 100%, 100.1% and infinity.
- Each category's markup applicability and taxability independently.
- Common fees, quantity-disposal replacement, owner/customer-selected travel fee true/false, and missing selection review.
- Service seasonal settings, business fallback, and in/out-of-season controls.
- Service and business minimums one cent below, at, and above the independently derived threshold for each tax mode.
- Exact-price and buffered-range display, including 0.5%, 10% and 25% buffers.
- Valid sibling tiers retained when one tier has an invalid minimum.
- All line amounts, scenario sums, markup, tax, minimum adjustment, cent ranges, outward whole-dollar display, retained financial inputs, and strict public allowlists.

The added oracle initially assumed three scenarios for ordinary buffered quotes and misclassified mowing bagging as addon. Both were test-harness errors corrected against the existing contract, not engine defects. Ordinary buffered quotes retain only the mid scenario. The v2 mowing formula explicitly classifies clipping bagging/disposal as disposal; it also replaces common disposal. Failed iteration logs remain in the external evidence.

The existing replay now selects Repairs139–146, the composite regression, and the all-service catalog (10 tests). It captures complete returned objects and inputs, checks public allowlists and cent sums independently, and records source hashes. The 16 financial matrices execute in the ordinary focused/full test run; they are not all captured by this replay. An instrumented replay is not an independent external audit.

## Owner decisions retained separately

No additional owner ruling is needed for the rounding fix or these contract checks. Zero meanings, outward whole-dollar ranges, and all mathematically safe margins below 100% are settled.

Every remaining decision's exact service/path, current behavior, operational or monetary consequence, specification gap and narrow question remains in these separate ledgers:

1. [Existing decisions](COMPLETION.md#remaining-owner-rulings-and-affected-paths): saved cost/sell classification; fresh painting rates; inactive migration confirmation; cost-based product purchase quantities; non-vinyl underlayment; fence layout, footing allocation and gate widths; siding trim; custom charge classification; interior preparation; exterior primer; exposed aggregate; flooring threshold equality; coat labor, interior primer and wall-height criteria; measurable category criteria; seasonal date; lead save-failure behavior; taxability text conflict; dual partial-scope representation; owner fee authorization; dormant flooring rows; owner-preview authorization. The explicitly resolved membrane row is historical.
2. [Additional scope decisions](AUDIT_REPAIRS_128_138.md#remaining-owner-decisions-and-review-only-paths): flooring stair packages; siding removal; concrete demolition; commercial flat-roof insulation; exterior coating/preparation offerings; mixed interior zones.
3. [Inclusion allocation decision](AUDIT_REPAIRS_139_146.md#remaining-owner-decisions-and-review-only-paths): the explicit financial-category and price-basis allocation represented by an all-in covering price. Same-category/same-basis inclusion works; unsupported allocation reviews.

Selected review-only scopes do not acquire invented formulas here. No monetary loss is asserted without confirmed pricing inputs.

## Verification and limits

Permitted commands on the final commit:

```text
node --test --test-name-pattern='precision follow-up:' test/quoteEngineVNext.spec.js test/quoteEngineVNextRepairs.spec.js
npm.cmd run test:vnext
npm.cmd run gate:quote-vnext
npm.cmd run phase1:test
node --experimental-vm-modules test/quoteEngineVNextReplay.mjs <outside-repository-output-directory>
```

Final-SHA results, exact totals, full logs, replay captures and hashes belong to the external delivery report. Earlier passing runs do not establish the final snapshot.

Unverified paths remain independent external audit, real saved-book migration, authenticated/tenant-bound owner actions and protected evidence, complete durable lead storage and save-failure recovery, the truth of real measurements/categories, unresolved pricing contracts above, and real UI/onboarding/dashboard/deployment flows. Telephony remains paused. Tests prove the exercised cases; they do not prove 100% correctness for every possible price book, object or project.

Only isolated candidate source, tests and candidate documentation are changed. No production integration, production engine/routes, UI, telephony/SMS, dependency/toolchain/configuration, GitHub Actions, Phase0/client build or deployment work is part of this pass. Stop after the reviewed snapshot is pushed for independent audit.
