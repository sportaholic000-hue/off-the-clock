# First comparison: 208 matched / 64 did not

Preserved direct-first.json.gz/log, fixtures-first.mjs and expected-cases-first.json.

54 failures are harness/input issues, not confirmed product defects:
- 3 mulch fixtures used cubic_yards instead of the supported yards enum.
- 3 install-fence fixtures supplied replacement-only oldFenceRemoval.
- 3 coat cases matched dollars; the oracle line label was Wall materials rather
  than Wall paint and materials. No monetary expectation changes.
- 6 paint-package fixtures used incorrect scope confirmation field names and
  fields belonging to the other painting trade. Use paintProductsConfirmed.
- 6 roof footprints were below the documented50sqft customer minimum. These
  remain review controls, not successful arithmetic comparisons.
- 3 planting fixtures omitted the required explicit medium:0 and large:0 counts.
- 30 TAX_NONE fixtures incorrectly retained taxPercent10 rather than0.

3 further comparisons used a decimal text that is not a distinct JavaScript
Number: 10.004975124378109 becomes10.00497512437811 before the engine receives
it. The engine correctly prices that canonical number above the half-cent tie.
Do not call this an arithmetic defect. Retain the original evidence and add
explicit representable below/above controls. Expected inputs must match the
numeric JSON actually submitted, not an unavailable longer decimal literal.

The remaining7 are candidate product mismatches:4 square-equivalent concrete
joint cases (2 slab types x2 area thresholds) and3 adopted-roof footprint ties.
They require saved widget/actual voice tracing and existing-regression review.
No calculator or policy is changed.

Additional expectations BEFORE testing package amplification:
- Footprint1384.62 at5:12 means1384.62 x13/12 =1500.005sqft; approved rounding
  gives1500.01sqft. At500sqft/underlayment roll, zero waste, purchase4 rolls,
  not3. At15000c/roll, underlayment60000c. Neighbor1384.619999 rounds1500.00
  and buys3;1384.620001 rounds1500.01 and buys4. With labor10000c/square,
  material/tear-off/disposal100c/square and zero field waste, totals are
  **199500 /214501 /214501 cents**. This expectation follows the same authorized
  surface-before-package rule as qeRoofUnderlaymentAccuracy20261018.
- Equivalent boundaries184.62 at5:12 ->200.005->200.01sqft with100sqft/roll;
  2584.62->2800.005->2800.01sqft with400sqft/roll. The Fraction oracle calculates
  the separate base line cents and roll totals before engine execution.

Second comparison:12 fixture failures remained (3 stated-volume mulch requests
retained depth,9 roof-package requests used the flooring confirmation name).
Remove inapplicable mulchDepth and use roofUnderlaymentScopeConfirmed, as the
existing customer contracts require. No expectations or production files change.
Preserved fixtures-second.mjs and direct-second.json.gz/log.

First delivery run6/14:all8 roof cases were rejected by the owner-save boundary
because the synthetic direct-engine fixture carried protected adoption state.
This is correct server behavior. Remove that state from the submitted draft;
let the ordinary save/explicit approval create it, as the existing delivery
fixture does. The unchanged prices and customer scope then pass14/14. Preserve
delivery-first-source.mjs, delivery-first.tap and delivery-first-results.json.gz.

Existing nine-file regression batch278/279:SQLite reported database disk image
is malformed in the underlayment historical-replay test. The same entire22-test
file passed on a fresh process rerun. The database cause was not conclusively
diagnosed; do not describe the failed batch as a pass. No test or fixture edit.
