# First comparison preserved, then diagnosed

`comparison-first.*` and `expected-cases-first.json`, `EXPECTED-FIRST.md`, `prepare-cases-first.mjs` preserve the original 36-pass / 9-fail run. No production changes. Revised expectations were written before the next comparison, with these explicit corrections:

- `flooring_install-waste`: my fixture added the replacement-only `subfloorIssues` field to installation. Remove it only from installation; money expectation unchanged.
- `fencing_replacement-terrain-waste`: my arithmetic omitted the configured 60% labor share of the installed removal price. The actual rule applies terrain to that share: 40000 × (0.4 + 0.6 × 1.3) = 47200, not 40000. Expected total increases by 7200. Source: installed-price adjustments plus fixture's explicit split; not double-adjustment of material.
- `mulch-overage-access`: my fixture used `bedSqft` instead of `mulchArea` and unregistered hardwood. Use the existing registered synthetic `standard` product; amounts unchanged. `bedSqft` is preparation area and is forbidden for a clean bed.
- `mulch-direct-yards-no-overage`: correct method `yards`, quantity `mulchArea`, omit area/depth-only fields; same registered product and unchanged expected amount.
- `planting-retained-overage-unused`: register the synthetic mulch product and its confirmed fact; expected amount unchanged.
- `concrete-compaction-owner`: arithmetic typo in constant sum: 360000 + 153000 + 250000 + 72000 = 835000, not 835500. Both totals reduce 500; expected compaction difference remains 6667.
- `sod-owner-topsoil-allowance`: separately configured topsoil selects the component ground-prep path (`templates.js:1135` onward); it replaces the legacy prep line. No default removal/grading rates are invented. Remove the incorrectly assumed 150000 legacy prep charge from both expectations; difference unchanged, exclusions remain disclosed.
- `paint-package-coverage`: `paintProductsConfirmed` is not applicable with only one selected painted surface; remove the extraneous fact. Coverage and price expectations unchanged.
- `roof-adopted-upper-pitch`: both zero adders passed Class 2 validation but the calculator refused one as an invalid quantity factor. This is NOT corrected by accepting the refusal. Keep its original failure and test the valid-zero contract separately in `reproduce-zero-roof-adders.mjs`. The passing sensitivity comparison instead contrasts the upper pitch band with the valid up-to-six band, holding rates and all factors fixed. Expected 391000 → 485800 remains unchanged.

The second comparison is a diagnosed fixture/expectation correction, not an unchanged rerun to obtain green. The separate zero-factor reproduction must remain failing until a production owner addresses it; this assignment changes no production code.

## Second comparison

44/45 pairs matched. The remaining `paint-package-coverage` pair returned 53200 on both sides, i.e. the measured selling-price material line. My original fixture still declared `priceBasisByCategory.material='sell_price'`. The selected package-cost path is deliberately conditional on material **cost** (`scopeConfiguration.js:77`, `scopePricing.js:12`), so its stored but inactive scope had no effect. Correct the hypothetical declaration to cost and reinstate the now-applicable structured product confirmation. Expected 45000/50000 remains unchanged. Only this corrected pair is executed again; the other 44 passing pairs are not repeated. `expected-cases-corrected.json` preserves the second input set.
