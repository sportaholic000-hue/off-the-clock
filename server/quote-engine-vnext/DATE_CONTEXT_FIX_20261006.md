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
