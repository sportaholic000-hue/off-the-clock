# Quote field handoff for the voice lane

The engine/public catalog supplies the current customer field definitions. Use those definitions; do not invent owner rates or collect cost allocations from callers.

- Fencing: remove `postCount`. Ask `cornerCount`, measured `linearFeet` excluding gate openings, and counts in the configured `gates` map. Existing fence type/height/terrain questions remain. Owner post spacing is private configuration; the engine derives posts.
- Painting offerings: remove `prepAreaSqft`. Ask `surfaceCondition` (`good`, `fair`, `poor`) and measured painted areas. Itemized `coats` accepts 1–3 and applies to walls and selected ceilings. Installed offerings retain their defined coats. Existing substrate/coating and scope confirmations remain.
- Flat-roof repair, mulch and planting: collect `accessDifficulty` (`easy`, `moderate`, `difficult`).
- Concrete: `dimensionMethod: measured_area_perimeter` accepts `areaSqft` and `perimeterLF`; do not require length/width as well. Invalid combinations still need review.
- Mulch: direct cubic yards mean the quantity stated. Area/depth-derived yards receive the owner's ordering allowance internally.
- Quote date and business time zone are trusted server inputs. A requested job date does not choose the peak-pricing month.
- Customer hears the final estimate (or configured range/review response). Never recite private rates, labor/material splits, tax amounts, cost lines, markup or margin. A minimum-bound estimate is a single price.

The shared voice quote adapter now supplies the trusted local quote-date context. Phone prompt wording and the nine pre-existing voice test failures remain for the voice lane; no live-call verification is claimed here.
