# Independent expectations — PI-01 through PI-05

These expectations were recorded against exact base `e50c9f58459a4362537eb5da5dc1cf082fbc3ca8` before changing production code. Amounts are calculated from the synthetic approved-book inputs in the preserved public-intake audit, not copied from the repair output.

| Finding | Transition | Required prepared/final input | Exact monetary control |
| --- | --- | --- | --- |
| PI-01 | Mulch `sqft` → `yards` | Omit old `mulchArea` and `mulchDepth`; after entering `2.75`, send `mulchArea: 2.75` cubic yards with no depth | direct volume: 2.75 × ($50 material + $30 labor) + $54 bed prep + $50 edging = **32,400 cents** |
| PI-01 | Mulch `yards` → `sqft` | Omit old quantity; require new `270` square feet and `3` inches | 2.5 calculated yards; material includes 15% overage, labor does not: $143.75 + $75 + $54 + $50 = **32,275 cents** |
| PI-02 | Concrete exact ↔ area/perimeter ↔ outline | On every method change omit `length`, `width`, `areaSqft`, `perimeterLF`, and `outlinePoints`; preserve unrelated adjoining-edge scope | Equivalent 500-square-foot / 120-linear-foot geometry: **892,222 cents** |
| PI-03 | Subfloor issues yes → no/unknown → yes | Omit `subfloorRepairAreaSqft` on no/unknown; reversing to yes requires a new area | no repair **305,280 cents**; re-entered 30-square-foot repair **311,280 cents** |
| PI-04 | Planting mulch yes → no/unknown → yes | Omit `mulchYards`, `mulchType`, and only `confirmedFacts.mulchType`; preserve unrelated confirmations; reverse requires new product and quantity | no mulch **12,500 cents**; re-entered 2-yard brown mulch **28,500 cents** |
| PI-05 | Mowing edging yes → no/unknown → yes | Omit `edgingLengthLF`; preserve unrelated values including explicit zero; reverse requires a new length | focused base option: $100 recurring mow + 10% bagging + 100 feet × $0.50 edging; no edging **11,000 cents**, 100 feet **16,000 cents** |

For every corrected public request, `/prepare` must return `ready` without persisting rows, the final handler must persist the exact submitted customer input, a byte-equivalent retry must return the same historical result without a second receipt, and customer output must not expose private pricing fields. A stale intake confirmation from an editable draft must not be reused after a scope change.
