# October 5 incomplete-catalog follow-up

Scope: the remaining quote-engine/price-book catalog stall reported by the owner.
Starting branch head: `97696354a860f06e8834f44e9c1607f0b1c3bdd0`.
No subagents, merge, deployment or live-data changes.

## Reproduction and cause

At the starting revision, an 80-by-80 flat-roof catalog whose zero membrane
prices are declared included in removal took **4,244 ms** in bookQuoteStatuses.
Declaring them included in installation labor took **8,800 ms**. A 20 ms timer
was blocked for the entire call. Both correctly returned NEEDS PRICING: material
cannot be included in a different financial category without an allocation rule.
The earlier unclassified-zero and missing-material-map short circuits do not
cover these declarations. The search repeatedly discovers the same invalid
allocation across the entire pair grid.

Preserve the existing rules: included prices require the selected billed covering
component with the same category and price basis. Every actual quote retains its
complete validation and financial calculation. Never stop searching merely because
an arbitrary number of pairs failed, and never disable a valid sibling product.
Readiness may exclude pairs with a proven unsatisfied covering-product dependency,
and reuse an allocation failure only when both affected prices belong to one
product axis. Shared missing scalar prices can be checked before pair search.
No arithmetic or owner policy changes; keep the v6 approval boundary.

After reducing candidate pairs, 320-product probes still took about 3.9 seconds
when run concurrently: complete included-price policies were revalidated for each
candidate. Reuse those diagnostics only for the existing private, deeply frozen
activation snapshots, and clone returned diagnostics. Mutable callers and fresh
price revisions must never reuse them. Invalid-policy and snapshot-mutation tests
expect the same review outcomes as ordinary uncached validation, with no quote.

## Expectations written before the new tests

All configurations are explicitly synthetic and use temporary price-book storage.
Readiness, timing, malformed-data and review checks produce no dollar estimate.

- Same-axis material-in-labor and cross-axis material-in-removal declarations
  remain NEEDS PRICING, including when the covering old product is first or last.
  Full and public readiness should avoid a Cartesian calculation grid at 320
  products per selector. Preserve the included-price allocation reason.
- A valid final flat-roof sibling must remain live next to invalid included
  siblings. For 1,000 sq ft, one existing layer, easy access, zero waste, fees,
  markup and tax: $5/sq ft labor = **$5,000**; $7/sq ft membrane = **$7,000**;
  $1/sq ft removal = **$1,000**; total **$13,000**. Invalid siblings still review.
- A valid pitched-roof included material component must remain live. For 1,000
  sq ft = 10 squares, unit pitch/story factors, zero waste, fees, markup and tax:
  10 x $50 labor = **$500**; 10 x $100 material = **$1,000**;
  10 x $20 removal = **$200**; underlayment explicitly included in the same
  selected material selling price = **$0**; total **$1,700**.
  Cost material versus selling-price underlayment must still require allocation
  review. A different unselected covering product must not make a zero price live.
- Missing required shared itemized roof accessory prices remain NEEDS PRICING;
  completing them with a tier must still allow valid work. No guessed prices.
  At $1 per foot and 10 ft each of starter, drip edge and ridge cap, add **$30**
  to the $1,700 pitched-roof control: **$1,730**. A tier that completes the
  flat-roof membrane prices retains the **$13,000** flat-roof total above.
  If the $10 starter line is explicitly included in product_11's material price,
  that selected product quotes **$1,720**; another product still reviews. A shared
  zero with a product-dependent covering price must not disable that valid product.
- Previously recorded financial and functional regression expectations remain
  unchanged for all focused and full suite executions.

## Intermediate verification

First focused run: 175/179 passed. Three pitched-roof timing checks still took
1.75–1.96 seconds. CPU profiling attributed most remaining work to rebuilding the
same scope definitions. Reuse definitions only when the pricing object and every
map whose keys affect that schema are frozen; freeze a cloned schema and retain
ordinary rebuilding for mutable inputs. The fourth failure was a synthetic
fixture that had not set accessory waste to zero as its handwritten expectation
requires. Set its three accessory waste factors to zero; **$1,730** remains the
independently written expectation. No production pricing formula changes.

The corrected focused run passed **179/179**. Before the full regression run,
add controls for the $1,720 shared included accessory, immutable schema outputs,
cross-service cache separation and mutable key maps. The schema controls produce
no dollar quote; mutations must be rejected or cause fresh definitions.

Full local `npm run test:quote`: **1,580 passed**, including all **26 new cases**;
the only 35 failures were Chromium startup failures before page creation. Cold
owner-app and widget builds passed. Same-fixture cold public timings in fresh
processes: cross-axis inclusion **4,243.673 -> 105.930 ms** and same-axis inclusion
**8,800.445 -> 92.024 ms** (80 products per selector). These are measured examples,
not an unlimited-catalog latency guarantee. The 320-product timing regressions
retain a 1,500 ms status/timer bound, without changing existing gate allowances.
