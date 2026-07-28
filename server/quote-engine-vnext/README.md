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
- `templates.js` contains measurement-driven formulas. Every mandatory line
  throws for review when its quantity or rate is invalid.
- `engine.js` applies explicit fee rules, rate-basis-aware markup, service line
  taxability, pre-tax minimums, mathematically bounded ranges, strict customer
  sanitization, and a complete internal calculation record.
- `priceBook.js` validates candidate price books and makes preview and live
  calculations call the same engine entry point.

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
  multipliers.
- `fixed_amount`: an explicit integer-cent amount plus its owner field path or
  the recorded minimum-basis inputs that derive it.
- `percentage_derived`: an integer-cent basis amount, percentage, and rounded
  derived amount.
- `composite`: independently rounded component lines whose sum is the line
  amount.
- `ranged`: explicit low and high integer-cent amounts for an approved ranged
  service.

## Decisions intentionally left open

The candidate fails closed instead of inventing these pricing contracts:

- Cost-based roofing or flooring underlayment needs product-specific coverage
  and purchasable-quantity data. Only an owner-classified installed-area
  `sell_price` may use measured installed area directly.
- Fencing `concretePerPost` combines concrete and digging. It needs separate
  labor and material prices or an explicit owner-confirmed allocation rule.
- The locked `gatePrice` is per gate and cannot distinguish opening widths.
  Selected gates need an owner-approved measured-width pricing model and rates;
  the existing value is not reinterpreted.
- Fair or poor interior preparation needs measured-scope preparation pricing.
- Poor exterior surfaces need separate primer pricing or an explicit
  all-inclusive owner rule.
- Exposed aggregate needs material pricing or an explicit all-inclusive owner
  rule.

Until those decisions exist, the affected path returns
`ESTIMATE_REQUIRES_REVIEW`; no rate is duplicated, split, or reinterpreted.
