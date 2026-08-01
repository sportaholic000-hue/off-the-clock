# Quote Engine vNext Audit Candidate

This directory is an isolated accuracy-repair candidate. Nothing in the
production server imports it, and no production route points to it.

The candidate intentionally requires explicit data that the routed engine can
currently estimate. It will return `ESTIMATE_REQUIRES_REVIEW` instead of using
home-size maps, size-category area maps, square-root perimeter geometry,
unconfirmed layer counts, unconfirmed material types, or unrelated quantities.

## Candidate boundary

- `contracts.js` defines a measurement-sufficiency contract for every built-in
  service, bounded input domains, exact owner-rate paths, and owner-visible
  Class 2 factors.
- `exactMath.js` carries base-10 inputs as normalized fractions through every
  money-rounding decision without an epsilon or third-party decimal
  dependency.
- `templates.js` contains the internal measurement-driven formulas. Its
  calculator independently runs the shared customer and owner-pricing
  validation before producing any line and is not re-exported by `index.js`.
- `engine.js` applies explicit fee rules, rate-basis-aware markup, service line
  taxability, tax-mode-ordered minimums, mathematically bounded ranges, strict
  customer sanitization, and a complete internal calculation record.
- `priceBook.js` validates candidate price books, executes activation
  scenarios through the complete financial pipeline, and makes preview and
  live calculations call the same engine entry point.
- `index.js` exposes the validated public candidate API. It does not expose
  the low-level template calculator.

Raw quote APIs default omitted or malformed caller context to customer-safe
output. Internal calculation and review evidence requires an explicit owner
caller or an owner-preview helper. Those preview helpers are an intentional
authorization boundary for a future integration, not an authentication system.
Shared snapshots also bound request nesting, total inspected values, and array
length before validation or calculation.

## Deliberate non-integration

The current saved price book mixes labels such as `cost`, `price`, `rate`, and
`charge` while the routed engine can apply markup to all of them. The candidate
requires `priceBasisByCategory` to classify each category as `cost` or
`sell_price`. A sell-price category is never marked up. Existing saved data is
not migrated or reinterpreted here; its intended basis requires an owner ruling
before integration.

Likewise, the candidate adds measurement and pricing shapes that require an
explicit migration and owner-facing controls before cutover. The audit gate
tests this directory directly while leaving current customer traffic unchanged.

## Calculation evidence

Every calculation line declares one reproducible evidence variant:

- `quantity_rate`: measured quantity, unit, integer-cent rate, and named
  multipliers, including exact quantity, multiplier, and unrounded-cent
  fractions.
- `fixed_amount`: an explicit integer-cent amount plus its owner field path or
  the recorded minimum-basis inputs that derive it.
- `percentage_derived`: an integer-cent basis amount, percentage, and rounded
  derived amount with its exact unrounded fraction.
- `composite`: independently rounded component lines whose sum is the line
  amount, with exact evidence for every component.
- `ranged`: explicit low and high integer-cent amounts whose complete evidence
  is revalidated before scenario materialization; the original midpoint is
  retained so low, mid, and high can be rematerialized safely in any order.
  No custom ranged line is currently executable because custom charge
  classification remains an owner decision.

Generation rejects any line whose exact evidence cannot reproduce its rounded
integer cents. Customer sanitization performs that check again against each
scenario, even when every duplicated calculation record was changed together.
JSON-facing measurements remain ordinary finite numbers; exact fractions are
internal audit evidence and never expose owner rates in customer output.

## Fail-closed owner decisions

The candidate returns `ESTIMATE_REQUIRES_REVIEW` instead of inventing these
pricing contracts:

- Cost-based roofing or vinyl-plank underlayment needs product coverage, waste,
  package size, and purchasable-quantity rounding. Only an owner-classified
  installed-area `sell_price` uses measured installed area directly.
- Hardwood, laminate, and carpet need product-specific underlayment scope and
  pricing. The vinyl-plank scalar is never reused.
- Cost-based paint needs product coverage, coat-specific yield, package size,
  and purchasable-quantity rounding.
- Fencing post quantity needs approved geometry rules for spacing, ends,
  corners, and gate posts. Caller-provided post counts are rejected.
- Fencing `concretePerPost` combines concrete and digging. It needs separate
  labor and material prices or an explicit owner-confirmed allocation rule.
- The locked `gatePrice` cannot distinguish measured opening widths.
- Siding trim installation needs separate labor and material rates or an
  explicit owner-confirmed category and allocation.
- Custom services need an owner-confirmed charge category or mixed allocation.
- Fair or poor interior preparation needs measured-scope preparation pricing.
- Poor exterior surfaces need separate primer pricing or an explicit
  all-inclusive owner rule.
- Exposed aggregate needs material pricing or an explicit all-inclusive owner
  rule.
- Flooring quotes exactly on a configured room-size threshold remain review
  only until the owner decides whether maximum thresholds are inclusive.

No affected path duplicates, splits, reclassifies, or silently reuses a rate.

## Release decisions still open

These decisions cannot be inferred by an arithmetic engine and remain explicit
production-cutover blockers:

- Maximum permissible margin.
- First-coat versus additional-coat labor pricing.
- Interior primer scope and pricing.
- Objective wall-height productivity factors.
- Objective selection criteria for plant size, debris, grass condition,
  access, slope, terrain, pitch, and complexity.
- Work-date versus quote-date seasonal pricing.
- Owner-facing controls and migration for every new measurement, price basis,
  factor, and structured map.
- Authentication and authorization for owner-only preview and internal-evidence
  paths.
- Persistence of the unsanitized internal review lead, original request, and
  urgency before returning customer-safe output.

`buildInternalLeadVNext` creates and clones the required internal persistence
envelope and rejects customer-sanitized review payloads. No production route
persists that envelope yet. Production and integration remain untouched.
