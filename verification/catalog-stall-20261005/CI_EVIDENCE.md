# Included-price catalog stall: verified repair

- Branch: `codex/engine-launch-fixes-20261005`
- Verified parent: `97696354a860f06e8834f44e9c1607f0b1c3bdd0`
- Tested source/test SHA: **`a7986c864f37c6a80472bf157f96f61e71a2d94b`**
- Source tree: `35ccd4435d59024a17a9c3cf60a9e61016f7f64a`
- Engine approval version: `quote-engine-vnext-launch-fixes-20261005-v6`
- [Hosted run](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37350086324)
- [Hosted job](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37350086324/job/111898445163)

## Confirmed remaining variant

An 80-product-per-selector flat-roof book with each membrane price explicitly
zero and declared included in installation labor or a particular removal price
still reached the exhaustive pair-search fallback. The quotes correctly required
allocation review; public-catalog readiness repeated that conclusion across the
grid and blocked the server thread for seconds. The earlier unclassified-zero
repair remains intact.

The repair checks declared covering-product dependencies before full pair
calculation, reuses a proven allocation failure only when both prices belong to
the same product axis, and detects shared missing required scalar prices before
searching. No arbitrary search limit or guessed price is introduced. Private
immutable activation contexts reuse included-price diagnostics. Scope definitions
are reused only when all pricing keys that determine them are immutable; returned
cached definitions cannot be mutated.

## Same-fixture cold public timings

Each measurement uses a fresh Node 22 process and bookQuoteStatuses. Both before
and after return NEEDS PRICING. The 20 ms timer is blocked for the measured call.

| 80 products per selector | Parent | Repaired | Repaired coverage rows |
| --- | ---: | ---: | ---: |
| Membrane included in a removal product | 4,243.673 ms | 105.930 ms | 80 |
| Membrane included in its installation labor | 8,800.445 ms | 92.024 ms | 80 |

The regression matrix additionally covers 320 products per selector in full,
quick and public paths, including a material cost/selling-basis mismatch. Local
focused runs completed those status calls in 175–768 ms after the final repair.
Each timing assertion retains a 1,500 ms call/timer bound. These observations
are not a latency guarantee for every possible catalog or pair-dependent failure.

## Verification

- 26 new regression cases, all passing locally.
- Focused pre-final-controls suite: 179/179 passed.
- Full local quote gate: 1,580 passes; the only 35 failures were Chromium startup
  failures before page creation. No tests were skipped or allowances added.
- Cold local owner-app and widget production builds passed.
- Hosted cold installation and both production builds passed.
- Hosted strict gate: **1,649 tests, 1,649 passes, zero failures or skips, 66 files**.
  The strict step completed at **2026-10-05T17:44:15Z**.
- The full hosted job completed successfully; its automatically run broader suite
  retained the nine previously allowed failures (9/9). No allowance was expanded;
  other features were not audited.

Valid flat-roof siblings and repaired tiers retain **$13,000**; valid same-product
roof material inclusion retains **$1,700**; completed itemized accessories yield
**$1,730**, or **$1,720** when the starter is explicitly included in the selected
material product. Wrong categories, wrong bases and unselected covering products
continue to review. Tests also compare cached and ordinary validation, change
caller prices/rules, mutate returned diagnostics, and change mutable schema keys.
All expected values were written before execution in
[the decision/evidence record](../../specs/CATALOG_STALL_REPAIR_20261005.md).

## Source binding

All six changed source/test/specification files matched local Git blob hashes
in the uploaded tree. The verified parent-to-source diff contains only those
six paths. The branch reference was read back at the tested source SHA.
Subsequent evidence-only commits do not change the tested code or tests.

No subagents, merge, deployment or live-price-book changes. This is a scoped
repair of the reproduced variants, not whole-product launch signoff.
