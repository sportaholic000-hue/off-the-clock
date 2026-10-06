# Active QuoteDone engine

The application imports this engine through `server/src/quoteDoneBridge.js`.
Owner preview, public widget submissions and authenticated team submissions use
that bridge; `server/src/quoteDoneRoutes.js` installs the application routes.
The bridge preserves the dollar/cent boundary, saved configuration approvals
and tenant-specific price books. This repository wiring does not establish
which commit is deployed or certify launch readiness.

Current scope and checkpoint records are in `specs/BUILD_STATUS.md` and the
source-bound repair reports it links. The engine uses configured measured
contracts; a supported configured offering can quote even when an older
unconfigured path below was review-only. Customer output excludes private
rates and financial evidence. Authentication and persistence are application
responsibilities implemented outside this directory.

## Historical isolated-candidate notes

Everything below describes earlier isolated September checkpoints, before the
application integration and subsequent configured-scope repairs. Statements
about non-integration, unsupported services or outstanding application work
are historical, not a description of current routing or capabilities. Their
original source-bound evidence remains intact. Use the current specifications
and build record when assessing present behavior.

---

Current checkpoint: [Customer numeric-amount integrity repair](CUSTOMER_AMOUNT_PRECISION.md), frozen start `11d4ef70fae472b1f18168fa9ea9cc61c4b9a1f7`. Numeric customer amounts must serialize the intended displayed cents exactly or return technical review. Accepted A–C pricing and display rules remain unchanged. Final-SHA execution evidence belongs to the delivery report.

Current checkpoint: [Revised owner handoff corrections A–C](HANDOFF_ABC.md), starting at `6036cdb57231993ab0f11f790d366c0cf825457d`. Ordinary markup has no commercial cap; every selected extra requires pricing or a supported explicit zero; customer display preserves the tax-mode minimum. This supersedes contradictory historical descriptions below. Final-commit execution evidence belongs to the delivery report.

Current pass: [Repairs 147–150](AUDIT_REPAIRS_147_150.md), frozen start `47e88279d54e52e6af6f19a79e9df8dbe1231685`. The owner's latest identity, free-minimum, sub-dollar display and inclusion-path rules govern this snapshot. Final-SHA execution results belong to the delivery report.

Accepted precision follow-up: [service-wide financial verification and composite rounding provenance](AUDIT_PRECISION_20260910.md), starting at `3261560b5e7b5fefe9de6957a676e4464624503a`. This retains all earlier protections. See the delivery report for final-commit execution results.

Previous pass: [Repairs 139–146](AUDIT_REPAIRS_139_146.md), frozen start `0242784d5835ee2f0ca6f0c5c1c8098a2f0a3e8f`. Its exact selector identity, unique service IDs, diagnostic ownership, lead identity, included-price classification, metadata and configured-evidence binding contracts supersede conflicting historical descriptions. Earlier counts are historical, not verification of this snapshot.

This directory is the routed QuoteDone pricing engine. Customer and staff
quotes reach it only through `server/src/quoteDoneBridge.js`, which the
quote routes in `server/src/quoteDoneRoutes.js` call. It began as an isolated
accuracy-repair candidate; the history below is kept as the record of that work.

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
- Flooring room-size thresholds are inclusive maximums: average room area at
  or below the small maximum is small; otherwise at or below the medium maximum
  is medium; otherwise large (owner decision, October 5, 2026).

No affected path duplicates, splits, reclassifies, or silently reuses a rate.

## Release decisions still open

These decisions cannot be inferred by an arithmetic engine and remain explicit
production-cutover blockers:

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

## Completion checkpoint

### October 6 quote-date context

Application quotes resolve the book's valid IANA time zone first, then the
current owner's valid profile zone. If neither is valid and the effective peak
month list and surcharge percentage enable seasonal pricing, application
readiness is false and both quotes and previews require review. No UTC fallback
can price such a seasonal quote. An explicitly zero percentage or empty month
list disables the surcharge, respecting service overrides of business defaults.

The application captures one trusted quote instant and passes its resolved date
context into the engine. The root calculation record and its financial inputs
retain `quoteDate.timeZone` and the exact UTC `quoteDate.quoteInstant`; replay
checks the month against this evidence. Missing zones are recorded as null when
seasonal pricing is off. The profile is read by owner ID, and readiness cache
keys include the effective time zone so profile changes cannot reuse stale
eligibility. Existing explicit-month engine calculations and private activation
probes remain supported; production entry points always supply date context.

Engine version `quote-engine-vnext-date-context-20261006-v7` invalidates earlier
application approvals. Handwritten controls and the two-commit disposal proof
are in [DATE_CONTEXT_FIX_20261006.md](./DATE_CONTEXT_FIX_20261006.md).

See [COMPLETION.md](./COMPLETION.md) for the 2026-09-09 continuation, regression evidence, and narrow remaining owner rulings. Inactive or unconfirmed owner previews carry `customerEligible: false` in the result and root calculation record; customer sanitization rejects those previews. Numeric quantity and multiplier fields are floating-point views; their exact fractions remain authoritative for calculation and reproduction. Scenario materialization validates regular and ranged evidence before returning any line. Both concrete services enforce the 10,000,000-square-foot area limit using exact decimal arithmetic for measured dimensions and measured orthogonal outlines; unverified area/perimeter-only geometry remains review-only.
