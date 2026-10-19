# Reviewed arithmetic paths and coverage

All20 SERVICE_TYPES registered in contracts.js were inspected and exercised.
This is bounded verification, not an exhaustive claim over every price/input.

| Trade / path | Arithmetic reviewed | New direct coverage |
|---|---|---|
| Roofing replacement | Adopted additive adjustments; legacy multiplicative adjustments; partial area; surface conversion; bundle and scope-package quantities; summed tear-off/disposal rate | Footprint5:12 half-ties and neighbors; installed and purchased underlayment. Existing v10 subtraction regression retained. |
| Roofing / flat-roof / siding repair | Band thresholds; exact excess-area subtraction; hours; installed pitch/story/access allocation; dimension normalization | First10sqft boundary, fractional extended charges, hourly half-ties, representable near-tie inputs. Existing suites cover old bands/dimensions/adjustment shares. |
| Flat-roof replacement | Exact percent selection, layer multiplication, membrane waste and optional installed extras | Partial percent33.329999/33.33/33.330001 with2layers and fractional rates. |
| Interior / exterior painting | Geometry/opening subtraction; first/additional coat conversion; per-height aggregation; package pooling; installed portions | Half-ties with separate coat rounding; product coverage below/at/above200sqft. Existing surface suites cover geometry, openings, installed prices and ratios. |
| Flooring install / replacement | Additive waste; room thresholds and monotonic labor floor; carton ceiling; roll pieces, trim, repeat and connected direction; removal | Half-cent rates;20sqft carton boundary;150/300 room thresholds and330 labor-floor exit;12ft carpet roll boundary. |
| Fence install / replacement | Exact span ceiling; open/closed section quantities; integer counts; exact inches conversion; proportional height and terrain allocation | 8ft post-spacing neighbors for both trades. Existing fence boundary suite covers rows, sections, gates and inch conversion. |
| Concrete driveway / patio | Exact rectangle/outline geometry; inches-to-yards; finish extra separately rounded; order increment before short-load/placement; formwork subtraction; square-equivalent joints | Separate-line control;1yd order boundary;10ft rectangular spacing; area100/400 square-equivalent span boundaries. |
| Cleanup | Measured labor, debris/slope factors; bag/load charge vs flat minimum; area-to-load ceiling | 2000sqft/load neighbors. Existing landscape suite covers fractional stated loads/zero/minimum. |
| Mulch | Exact /324 conversion; measured overage vs already-stated yards; package increment | 108sqft at3in and1yd neighbors, .25yd purchase increments. |
| Sod | Waste; slope/access; optional split prep; exact target-minus-existing depth; /324 topsoil | Target4in below/at/above, including0.5-cent imported topsoil. |
| Planting | Integer plant counts; per-size labor/material; explicit mulch yards | 1/2/3 small plants. Existing tests cover multiple/custom sizes and access. |
| Mowing | Frequency/condition multiplication; bagging on rounded labor; seasonal, markup/margin, minimum, tax order | 90 combinations:3half-cent labor neighbors x3tax modes x2markup modes x5minimums. |
| Custom | Measured extension; exact ranged midpoint validation; split material rounding with labor remainder; exact tax/seasonal shares | Measured half-ties;3amounts x4material shares (0,33.33,50,100%). |
| Shared pipeline | Fee selection/replacement; combined seasonal round-once allocation; eligible markup; pre-tax minimum; tax bases; ranges; safe integer integrity | Mowing/custom matrix; unchanged launch/combination/starting-value regressions. |

Native arithmetic remaining in reviewed production:
- templates.js:542, scopePricing.js:130, contracts.js:1348 duplicate the adopted
  footprint Math.sqrt/Math.round conversion. Confirmed AB1.
- concreteLandscapePricing.js:62 uses Math.sqrt(exactToNumber(area)) before
  an exact ceiling. Confirmed AB2.
- fencePricing.js:25,31 converts a finite feet representation to allowed inch
  ticks with an explicit tolerance. The existing precision decision permits
  hundredth-inch entry; exact height evidence is then used for pricing. No new
  mismatch established; do not label this tolerance alone a defect.
- configuredOfferings.js:311 is a fallback display formatter; valid supported
  heights use the exact format path. Not a monetary extension.
- contracts.js:903 uses4*Math.PI for the isoperimetric eligibility check. Not a
  money extension; an independent irrational-boundary proof is not included.
- Integer line totals, count sums, fee/minimum differences and largest-part
  seasonal allocation use native integer arithmetic with safe-result checks.
- makeLine/makeCompositeLine extend exact fractions, then round each line or
  component once. tradeAdjustment carries exactQuantity/exactValue evidence.
- purchasedQuantityVNext, carpet pieces, cleanup loads and fence spans use
  rational integer ceilings. No epsilon package-ceiling workaround was added.
- Concrete finish-minus-one and topsoil-minus-existing are exact subtraction;
  both new targeted probes passed. Footprint .01sqft and nonrectangle joint
  .01LF rounding are authorized quantity steps, not defects by themselves.

Not exhaustively covered:
- Arbitrary high-precision dimension products through repair/carpet/fence input
  normalization; all possible Number/MAX_SAFE_INTEGER/overflow combinations.
- The full irrational pitch domain, every bundle/roll coverage and waste
  combination, and every joint area/spacing/thickness combination.
- Every optional scope, effective tier cross-product, fee combination or range
  endpoint. No claim that all possible supported quotes are correct.
- Browser form interaction, audio/model interpretation and live telephony.
  The delivery check invokes the actual saved widget route and voice dispatcher
  with synthetic data; it does not run a browser or call a live provider.
- A2's precision branch or any newer integration. Only the specified checkpoint
  is the production source here. Known F16 coordination is not rediscovered.
- F2's signed-adjustment policy is explicitly excluded and remains unresolved.
