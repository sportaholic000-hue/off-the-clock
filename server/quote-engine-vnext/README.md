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
