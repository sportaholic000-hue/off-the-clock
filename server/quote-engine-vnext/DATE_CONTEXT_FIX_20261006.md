# Date-context completion: handwritten expectations before execution

Starting branch: `claude/engine-core-fixes-20261005`.
Verified starting commit: `527959fb8dba46049d2ef6b00fbf508a7b66cf41`.
Synthetic data only. No subagents, merge, deployment or live data.

## Astra 5 control: independent expected results

Approved rule: readiness uses the real fee-replacement rules. A configured,
selected demolition package that includes disposal replaces the common disposal
fee and does not require that replaced fee's selection. Independently supported
jobs keep the service ready; an uncovered job still needs its own fee choice.

- Flat roof: 1,000 sqft at $5 labor = $5,000; membrane including 10% waste
  is 1,100 sqft at $7 = $7,700; tear-off 1,000 sqft at $2 = $2,000.
  Selected travel $9: **$14,709.00**, service **QUOTING LIVE**, quote ready.
- Concrete: 200 sqft at $6 labor = $1,200; concrete is
  200 × 4 / 324 × 1.10 × $180 = $488.888888..., rounded once to $488.89;
  60 LF of formwork at $25 = $1,500; preparation $350.
  Base = **$3,538.89**. Installed demolition: 200 sqft at $5 = $1,000,
  including disposal. Total **$4,538.89**, with **no extra $9 disposal**.
  Service **QUOTING LIVE**, selected demolition quote ready, even without a
  common disposal choice. Same configuration without demolition and without
  that choice: quote **requires review**, no dollar estimate. Explicitly
  selecting the $9 common disposal for that uncovered base job: **$3,547.89**.

Both commits must be executed before changing the existing assertion.

Executed before editing the test: both commits quoted the demolition at
$4,538.89; `4ff586c` reported NEEDS PRICING and `527959f` reported QUOTING LIVE.
Both rejected the uncovered job without a disposal choice, and both quoted it
at $3,547.89 with the choice. Both quoted the travel control at $14,709. The
existing service-status expectation therefore contradicts the approved rule;
only that named test is changed, preserving and strengthening its money checks.

## Date-context expectations

All seasonal controls: mowing 5,000 sqft × $0.02 = **$100.00**.
An October 10% labor surcharge is **$10.00**, final **$110.00**.
No tax, markup, minimum uplift or range buffer.

- West boundary: `2026-11-01T06:30:00.000Z` is October in
  `America/Los_Angeles`: **$110.00**; UTC is November: **$100.00**.
- East boundary: `2026-09-30T15:30:00.000Z` is October in `Asia/Tokyo`:
  **$110.00**; UTC is September: **$100.00**.
- `2026-11-01T01:30:00.000Z` is October in `America/Halifax`:
  **$110.00**. An invalid book zone must use this valid profile zone.
- A valid book zone takes precedence over a different valid profile zone.
- With neither valid zone and an effective nonzero surcharge with configured
  months: service **not ready**, quote **requires review**, no dollar estimate.
- Explicit zero surcharge or an empty month list disables peak pricing; a
  missing zone must not block the ordinary **$100.00** quote.
- Stored date evidence must retain the exact trusted UTC instant and resolved
  IANA zone, reproduce the local quote month, and reject tampered evidence.

Status, cache, validation and record-integrity tests have no money result.
New numeric money assertions will use the literal amounts above.

## Implementation and verification checkpoint

- Invalid book zones now fall back to valid profile zones. Missing valid zones
  block application readiness, customer quoting and preview when peak pricing
  is enabled. Zero percentages and empty month lists remain explicit opt-outs.
- Quote date evidence retains the resolved zone and exact UTC instant. Month
  validation and receipt replay use this evidence. Customer payloads cannot
  provide the trusted context. Profile changes invalidate readiness cache keys.
- Application date callers pass the context through status, save, approval,
  preview and quote paths. The route composition root supplies the database
  used for owner-scoped profile fallback by existing readiness callers. No other
  bridge or route behavior was changed.
- Engine version is `quote-engine-vnext-date-context-20261006-v7`; previous
  application approvals are stale.
- Thirty new date regressions and the complete Astra file passed **52/52**,
  zero skipped. Hand calculations were recorded above before execution.
- Cold `npm ci` installed 255 packages; fresh `npm run build` passed.
- The local strict attempt failed and ended without a complete test summary;
  it is not used as an acceptance count. It includes the known local Chromium
  startup failure and unchanged tests whose prerequisites or expectations
  conflict with the new date rule. The hosted strict gate remains mandatory.

Only the named Astra existing test was authorized to change. Existing tests
that require missing-zone peak pricing to remain live, omit a valid zone from
peak fixtures, or assert the literal pre-context bridge call remain unchanged.
They cannot be silenced or excluded to manufacture a green strict gate.

Focused execution of those existing files completed **124/130**, zero skipped.
The six unchanged failures are:

- `test/auditFixes20261003.spec.mjs`: D01 (installed labor portion control) and
  M04 use enabled peak pricing without either a book or profile zone. Their
  money checks need an explicitly configured valid zone in the fixtures.
- `test/quoteDecisionFollowup.spec.mjs`: G1 asserts live status without any
  date/profile context; G3 explicitly requires missing-zone quotes to succeed.
- `test/quoteTradeDecisions.spec.mjs`: T03 “configured peak season does not
  disable service” asserts live status with no valid zone.
- `test/phase2.spec.js`: “customer eligibility is enforced before quote
  generation” searches source for the exact former three-argument call text.
  The actual eligibility-before-calculation ordering is preserved, but the call
  now passes date context. The test's literal source match no longer describes
  the implementation.

All six are outside the single existing test authorized for modification. Their
presence means acceptance is unfinished; none is excluded from the strict gate.

## Authorized existing-test corrections: expectations before execution

The hosted run at `c09ab9ab3075c9d875d9379bf61d62c68b0c5b7d` completed
1,846 tests: 1,839 passed, seven failed, zero skipped. The seventh failure was
the existing assertion requiring engine version v6 after the required v7 bump.
The owner subsequently authorized continuing with these seven test corrections.
The checkpoint above records the earlier restriction, not the current scope.

Approved rule: enabled peak pricing requires a valid book or profile time zone.
The valid book zone wins; an invalid book zone falls back to a valid profile
zone; neither valid zone means NEEDS PRICING and review without an estimate.
Existing unrelated test cases and all financial rules stay unchanged.

Hand calculations, written before running the corrected tests:

- D01 fence: 95.01 LF x $39.50 = $3,752.895, line rounded to **$3,752.90**.
  At 5% tax on all or a 100% materials share, tax is $187.645, rounded to
  **$187.65**, total **$3,940.55**. A 40% materials share is $1,501.16;
  5% tax rounds to **$75.06**, total **$3,827.96**. At 100% labor share,
  5% peak adds **$187.65**, total **$3,940.55**. Explicit UTC makes the
  all-month peak fixture complete and ready; it changes no expected dollars.
- M04 installed fence: $100 selling price, 60% labor share, 10% peak = **$6**;
  no additional markup on either line, final **$106.00**, ready.
  Itemized control: 100 LF at $10 labor = $1,000; ceil(100/8) + 1 = 14 posts,
  footing labor 14 x $4 = $56. Eligible labor **$1,056**, peak **$105.60**.
  Infill 100 x 1.10 x $20 = $2,200, posts 14 x $20 = $280, footing material
  14 x $6 = $84. Subtotal including peak = $3,725.60; 30% markup = $1,117.68;
  final **$4,843.28**, ready. Both controls explicitly configure UTC.
- G1 roof: 20 squares x $85 x 1.15 = $1,955 labor; 20 x $45 x 1.15 =
  $1,035 tear-off; 22 waste-adjusted squares x $120 = $2,640 materials;
  20 x $18 = $360 installed underlayment. Base **$5,990**. Eligible regular
  labor $2,990 x 10% = $299: July **$6,289**, all other months **$5,990**.
  A declared 60% underlayment labor share adds $21.60 in peak months:
  **$6,310.60**. Valid Halifax profile context keeps the service ready.
- G3 mowing: 5,000 sqft x $0.02 = **$100**. Missing book and profile zones:
  **NEEDS PRICING**, review, no estimate and no computed seasonal month.
  With valid Halifax book zone, `2026-11-01T01:30:00Z` is still October:
  10% peak adds $10, final **$110**. At `2026-11-01T04:30:00Z`, November:
  **$100**. A different or invalid profile zone cannot override that book zone.
- T03 readiness: a configured March peak plus an explicit valid UTC book zone
  remains **QUOTING LIVE**. This case has no money assertion.
- Eligibility ordering and engine-version approval controls have no money
  assertions. Eligibility must receive date context before activation and
  calculation; v7 approvals are current and earlier approvals are stale.

Existing regression suites retain their previously handwritten expectations.

Pre-push verification of these corrections: all five affected test files plus
the 30 date-context regressions passed **168/168**, with zero failures, skips,
TODOs or cancellations. Cold `npm ci` installed 255 packages and both owner-app
and widget builds passed. Only these seven existing tests and this evidence
file changed; production code, test selection and failure policies did not.
The local full gate encountered Chromium startup failures before page creation;
the complete hosted strict gate at the resulting commit is the acceptance check.
