# Public intake audit: pre-execution expectations

Recorded before importing or executing the quote engine, application bridge, HTTP server, or browser harness. All money is synthetic integer cents. Defaults are zero markup, zero tax, zero common fees, zero minimum, and zero range buffer. The formulas below were derived directly from the configured fixture quantities and rates.

The checkpoint under review is `28c1c331e841878cce8edb1f235523e001ca0b25`. It is a pending integration checkpoint, not a release-approved baseline.

## Valid quote controls

| Service | Independent calculation | Expected cents | Expected measured scope |
|---|---:|---:|---|
| ROOFING_REPLACEMENT | labor `10 squares * 5,000` + field material `11 * 10,000` + tear-off `10 * 2,000` + underlayment `10 * 1,500` + starter `100 * 1.10 * 100` + drip `100 * 1.10 * 200` + ridge `20 * 1.10 * 300` + decking `2 * 5,000` | 244,600 | 1,000 sq ft full roof; 100 LF starter; 100 LF drip; 20 LF ridge; 2 sheets |
| ROOFING_REPAIR | labor `4 h * 10,000 * 1.15 pitch * 1.10 story` + material `8,000` | 58,600 | 100 sq ft medium shingle patch |
| FLAT_ROOF_REPLACEMENT | labor `1,000 * 500 * 1.15` + membrane `1,000 * 1.10 * 700` + tear-off `1,000 * 2 * 200 * 1.15` | 1,805,000 | 1,000 sq ft EPDM; 2 layers; moderate access |
| FLAT_ROOF_REPAIR | labor `3 h * 10,000` + material `6,000` | 36,000 | 10 sq ft EPDM seam patch |
| INTERIOR_PAINTING | installed walls `500 * 600` + ceiling `200 * 300` + trim `100 * 200` | 380,000 | 500 wall sq ft; 200 ceiling sq ft; 100 trim LF |
| EXTERIOR_PAINTING | installed walls `500 * 600` + 2-story labor adjustment `(500 * 600 * 60%) * 10%` | 318,000 | 500 wall sq ft; two stories |
| FLOORING_INSTALL | labor `300 * 300` + material `300 * 1.08 * 500` | 252,000 | 300 sq ft vinyl plank; 1 large room; straight layout |
| FLOORING_REPLACEMENT | labor `300 * 300 * 1.10` + material `300 * 1.12 * 500` + removal `300 * 100` + subfloor `30 * 200` | 303,000 | 300 sq ft tile; 2 medium rooms; 300 sq ft removal; 30 sq ft subfloor |
| FENCING_INSTALL | fence `100 * 4,000` + two configured gates `2 * 25,000` | 450,000 | 100 LF, 6 ft high, two 4-ft gates |
| FENCING_REPLACEMENT | install control `450,000` + removal `50 * 800` | 490,000 | install scope plus 50 LF removal |
| SIDING_REPLACEMENT | labor `1,000 * 400` + material `1,000 * 1.10 * 700` | 1,170,000 | 1,000 sq ft vinyl siding |
| SIDING_REPAIR | labor `4 h * 10,000 * 1.10 story` + material `10,000` | 54,000 | 50 sq ft medium repair; two stories |
| CONCRETE_DRIVEWAY | labor `500 * 600` + concrete `round(500 * 4 / 324 * 1.10 * 18,000)` + forms `120 * 2,500` + base `500 * 175` + wire `500 * 1.10 * 150` | 892,222 | 50 by 10 ft; 4 in; 120 LF perimeter; wire; base |
| CONCRETE_PATIO_SLAB | labor `200 * 600` + concrete `round(200 * 4 / 324 * 1.10 * 18,000)` + forms `60 * 2,500` + base `200 * 175` | 353,889 | 20 by 10 ft; 4 in; 60 LF perimeter; base |
| LANDSCAPING_CLEANUP | labor `1,000 * 10 * 2 heavy` + disposal `15,000` + haul `5,000` | 40,000 | 1,000 sq ft heavy cleanup |
| LANDSCAPING_MULCH | bed prep `270 * 20` + material `(270 * 3 / 324) * 1.15 * 5,000` + install `(270 * 3 / 324) * 3,000` + edge `100 * 50` | 32,275 | 270 sq ft at 3 in = 2.5 installed yd3; 2.875 ordered yd3; 100 LF edge |
| LANDSCAPING_SOD | material `1,000 * 1.05 * 75` + labor `1,000 * 125` + prep `1,000 * 50` | 253,750 | 1,000 sq ft; flat/easy; prep included |
| LANDSCAPING_PLANTING | plant labor `2*1,000 + 1*2,000 + 1*3,000` + plant material `2*500 + 1*1,000 + 1*1,500` + prep `100*20` + caller-stated mulch `2*5,000` + install `2*3,000` | 28,500 | 2 small, 1 medium, 1 large; 100 bed sq ft; 2 yd3 mulch |
| LANDSCAPING_MOWING | mow `5,000 * 2` + bagging `10% * 10,000` + edging `100 * 50` | 16,000 | 5,000 sq ft weekly; bagging; 100 LF edging |
| CUSTOM | fixed price `1 * 12,500` | 12,500 | one confirmed flat service |

No value above is a claim about real-world trade accuracy.

## Correction and invalid-input expectations

Each service gets one public correction or invalid request in addition to its valid quote. A stale signed intake confirmation must never authorize changed scope. Prepare-only refusals and rejected finals must create no quote, no priced submission receipt, and no lead.

| Service | Mutation under test | Expected boundary behavior |
|---|---|---|
| ROOFING_REPLACEMENT | Change measured roof from 1,000 to 1,000.5 after prepare | stale proof rejected; corrected prepare preserves decimal sq ft |
| ROOFING_REPAIR | Change affected area from 100 to 100.5 after prepare | stale proof rejected; corrected request retains decimal area and same medium price band |
| FLAT_ROOF_REPLACEMENT | Select partial scope with `partialAreaSqft: 0` | needs details; zero is not omission and cannot become a priced receipt |
| FLAT_ROOF_REPAIR | Toggle optional ponding-water work after prepare | stale proof rejected; no inherited exclusion/amount |
| INTERIOR_PAINTING | Exclude ceilings while retaining hidden ceiling area | contradictory hidden scope rejected or retained only in an unpriced review record, never priced |
| EXTERIOR_PAINTING | Change measured wall area after prepare | stale proof rejected; corrected decimal area is preserved with square-foot units |
| FLOORING_INSTALL | `removalNeeded:false` with hidden removal area | contradictory hidden removal rejected/unpriced |
| FLOORING_REPLACEMENT | `subfloorIssues:false` with hidden subfloor area | contradictory hidden optional work rejected/unpriced |
| FENCING_INSTALL | Change configured height after prepare | stale proof rejected; a mismatched configured offering is not repriced |
| FENCING_REPLACEMENT | Remove old-fence work but retain hidden removal length | contradictory hidden removal rejected/unpriced |
| SIDING_REPLACEMENT | Turn trim off but retain hidden trim length | hidden optional-work quantity cannot silently affect a price |
| SIDING_REPAIR | Change affected area after prepare | stale proof rejected; corrected decimal area retains square-foot identity |
| CONCRETE_DRIVEWAY | `measured_outline` plus stale length/width | contradictory geometry rejected/unpriced |
| CONCRETE_PATIO_SLAB | direct area/perimeter with physically impossible perimeter | rejected/unpriced; no derived alternative geometry |
| LANDSCAPING_CLEANUP | Change haul-away after prepare | stale proof rejected; optional work cannot inherit confirmation |
| LANDSCAPING_MULCH | Switch from square-foot method to yards while retaining depth | stale transformed field must not silently alter ordered quantity |
| LANDSCAPING_SOD | Turn prep off while retaining hidden topsoil depth | hidden prep facts rejected/unpriced or ignored without affecting price/scope |
| LANDSCAPING_PLANTING | Turn mulch off while retaining hidden mulch yards/type | hidden optional work rejected/unpriced or ignored without affecting price/scope |
| LANDSCAPING_MOWING | Change recurring weekly service to one-time after prepare | stale proof rejected; corrected output must not retain recurring/first-visit identity |
| CUSTOM | Flat unit plus stale `hours` quantity | unit contradiction rejected/unpriced |

## Inherited A1 controls

- Closed-fence polygon and gate-width eligibility (F10) and carpet room/area contradictions (F20) are A1 controls already present at this checkpoint. If exercised in browser coverage, they are recorded as inherited pass/fail controls and not reported as new defects.
- This audit does not change or reassess F2, pricing policy, defaults, or speech-confirmation semantics.
