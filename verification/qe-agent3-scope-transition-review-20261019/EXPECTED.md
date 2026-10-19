# Scope-transition audit expectations (recorded before execution)

Branch base: `eaca39b875fd11274ca00bb56a9d67fa8b48142f`.

All cases use synthetic registered services, CAD, no tax, no markup, no common fees, no minimum, no seasonal surcharge and no range buffer. Owner-entered rates below are internal cents. These expectations were calculated from the declared fixture inputs and quote-engine specification before executing `review.spec.mjs`.

## Existing coverage inspected first

| Existing coverage | What it establishes | Transition gap retained for this review |
| --- | --- | --- |
| `test/voiceCorrectionSequences20261018.spec.mjs` | Voice dimension correction; stair addition and narrow-to-wide package change; flooring-product change; stale service handle after one book revision; call/service/token isolation; dispatcher call-ID conflicts; original receipt replay | No widget correction path; no optional-work removal; no measurement-method change; no partial-to-full change; no recurring-to-one-time change; no first-visit removal check |
| `test/quoteOptionalScopeIsolation.spec.mjs` and `test/quoteOfferingScopeIsolation.spec.mjs` | Static engine/application boundaries for selected vs unselected optional scope and tier configuration | No saved request transition, stale intake proof, or original receipt retry |
| `test/landscapePricingLaneB20261016.spec.mjs` and `test/landscapeDeliveryLaneB20261016.spec.mjs` | Steady-state recurring/first-visit and one-time mowing amounts across widget/voice | No correction from recurring to one-time or added-to-removed extras using saved receipts |
| `test/quoteDeliveryBatch20261015Evidence.spec.mjs` and `test/qeAccuracyIntegration20261018.spec.mjs` | Static partial/full roof arithmetic and saved delivery controls | No change of measurement method or partial-to-full correction sequence |
| A4 approved repair `17d224c421b82f39cb2c6eb786db45e118e13ac3` | F18 valid-option qualification and per-option inclusion/exclusion projection, including saved and live voice | F18 is pre-existing/approved and must not be reported as a new finding from this base |

## Independently calculated amounts and scope

### A. Optional mowing work added, then removed

Registered service: `LANDSCAPING_MOWING`.

- Measured mowable area: 10,000 sq ft.
- Base rate: 0.5 cents/sq ft.
- Weekly multiplier: 1.
- Recurring visits use maintained multiplier 1; an overgrown first visit uses 1.5.
- Selected additions: bagging at 20% of the mowing-labor line, plus 100 LF edging at 50 cents/LF.

| State | Independent calculation | Expected recurring / first visit | Expected customer scope |
| --- | --- | --- | --- |
| Base | `10,000 × 0.5 × 1 × 1` recurring; `10,000 × 0.5 × 1 × 1.5` first | 5,000 / 7,500 cents ($50 / $75) | `bagClippings:false`, `edgingIncluded:false`; no skipped add-ons |
| Added | base 5,000 + bagging 1,000 + edging `100 × 50 = 5,000`; first 7,500 + bagging 1,500 + edging 5,000 | 11,000 / 14,000 cents ($110 / $140) | bagging and 100 LF edging included; no skipped add-ons |
| Removed again | same as Base | 5,000 / 7,500 cents ($50 / $75) | no inherited bagging/edging identity or charge |

Each correction must reject the prior widget intake confirmation. Voice must reject `customerConfirmed:false`; a fresh confirmed invocation gets a distinct receipt fingerprint. Exact retries of each original request must return its own saved amount and scope without changing stored rows.

### B. Named priced gate option changed

Registered service: installed `FENCING_INSTALL`.

- Base fence: `100 LF × 4,000 = 400,000` cents.
- Original option: two named four-foot `walk` gates at 25,000 cents each.
- Corrected option: one named twelve-foot `drive` gate at 40,000 cents.

| State | Independent calculation | Expected amount | Expected option identity |
| --- | --- | --- | --- |
| Walk | `400,000 + 2 × 25,000` | 450,000 cents ($4,500) | exactly `{walk:2}` and the four-foot walk-gate presentation |
| Drive | `400,000 + 1 × 40,000` | 440,000 cents ($4,400) | exactly `{drive:1}` and the twelve-foot drive-gate presentation; no walk gate |

The old widget intake confirmation must not authorize the drive option. Voice must require a newly affirmative request (`customerConfirmed:true` after a rejected false control); its saved original inputs and customer scope must identify only the corrected gate. The walk receipt must remain replayable at $4,500 with its original identity.

### C. Roof measurement method changed, then partial scope changed to full

Registered service: `ROOFING_REPLACEMENT`, asphalt shingle, simple roof, 10/12–12/12 band, one story/layer. Rates: labor 10,000 cents/square, material 10,000 cents/waste-adjusted square, tear-off 1,000 cents/square, pitch installation adder 31%, pitch removal adder 41%. Underlayment is purchased in 500-sq-ft packages with 10% waste at 15,000 cents/package.

For a 1,500-sq-ft 12/12 footprint, roof surface is rounded to 2,121.32 sq ft (`1,500 × sqrt(2)`). A 50% partial is 1,060.66 sq ft.

| State | Independent cents | Expected amount and scope |
| --- | --- | --- |
| 50% footprint | labor `106,066 + 32,880`; material `116,673`; tear-off `10,607 + 4,349`; underlayment `ceil(1,060.66 × 1.10 / 500) × 15,000 = 45,000` | 315,575 cents ($3,155.75); method Footprint; Partial 50% |
| 50% measured roof | labor `75,000 + 23,250`; material `82,500`; tear-off `7,500 + 3,075`; underlayment `ceil(750 × 1.10 / 500) × 15,000 = 30,000` | 221,325 cents ($2,213.25); method Measured roof; Partial 50%; no footprint rise input |
| Full measured roof | labor `150,000 + 46,500`; material `165,000`; tear-off `15,000 + 6,150`; underlayment `ceil(1,500 × 1.10 / 500) × 15,000 = 60,000` | 442,650 cents ($4,426.50); method Measured roof; Full; no `partialPercent` or footprint rise input |

The underlayment presentation itself is unchanged, so its current scope token may remain applicable; that token is not treated as a signature of measurements. The stale confirmation under test is the widget proof or voice recap confirmation. Corrected saved inputs and presented facts must not retain the obsolete method, rise, partial percentage or amount. Exact original receipt retries must retain all historical facts and amounts.

### D. Recurring mowing corrected to one-time, then book revision changes

The original weekly overgrown request is the Base state from A: 5,000 recurring cents plus a distinct 7,500-cent first visit.

At the same revision, changing to `one_time` uses the caller's overgrown condition directly:

`10,000 × 0.5 × 1 × 1.5 = 7,500` cents ($75), with **no** `firstVisit` field at top level or in any option.

After publishing a saved-book revision with base rate 0.75 cents/sq ft:

- revised weekly recurring: `10,000 × 0.75 = 7,500` cents;
- revised weekly first visit: `10,000 × 0.75 × 1.5 = 11,250` cents;
- revised one-time overgrown: `10,000 × 0.75 × 1.5 = 11,250` cents ($112.50), with no first-visit field.

An old widget intake confirmation must fail after either job details or book revision changes. An old voice service handle must fail for a new request after the revision. A fresh confirmation/handle must use the current 0.75-cent book. Exact retries of the pre-revision request must return $50 recurring / $75 first visit and retain the original book revision, amount and identity.

## Receipt and disclosure invariants

- A changed payload must never reuse the original widget request ID; that is a 409 conflict, not a recalculation.
- Fresh corrected requests have new request IDs and stored receipt rows.
- Exact original request retries return status 200 and the historical customer response, even after a saved-book revision.
- Rejected corrections create no quote/submission row and cannot expose a quote handle or amount.
- Customer-visible outputs and stored customer responses use sanitized fields only. No line items, rates, calculation records, book revision, service/owner identity, markup or internal outcome data may appear in voice results.
- A4's approved F18 repair is an accounted-for neighboring change, not a new finding. This review does not reinterpret failures attributable solely to the unmerged base copy of those two presentation files.

## Known evidence limit before execution

The voice API represents recap consent as a required boolean supplied with each invocation; it does not carry a signed transcript-turn receipt. This harness can prove rejection of `customerConfirmed:false`, exact request fingerprint separation, scope-token binding where applicable, service-handle revision binding and immutable saved receipts. It cannot prove ASR accuracy, model comprehension, or that a human actually reconfirmed the spoken correction.
