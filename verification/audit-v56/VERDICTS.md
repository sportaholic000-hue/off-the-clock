# Verdicts on the v56 launch-readiness audit, and the purchase-quantity backlog

Claude, November 26, 2026. Repaired version `quote-engine-vnext-accuracy-20261126-v57`.

## v56 audit

| Item | Verdict | Commit |
|---|---|---|
| V56-1 Repair readiness grouped all repair types into three size bands | Real, reproduced (a complete per-foot row stayed NEEDS PRICING beside a per-square-foot row with the largest area blank). Fixed: each material and repair type is checked on its own in each band; the coverage names the incomplete rows | 395fcf0d |
| V56-2 Older-home wood-on-joists removal unreachable on the form | Real, reproduced. Fixed: the form asks "Do you know what the existing floor is laid on?" and then the wood-floor question when a wood floor is removed in a building built in 1990 or earlier under the blank "Removal in older buildings" setting | cad59f98 |
| V56-3 Travel-zone tax notice on a 0% service | Real, reproduced. Fixed: the notice uses the service's own tax rate | 0d78d282 |
| V54-5 cross-border tax | Same item as V56-3 | 0d78d282 |
| Deployment (checklist item 1) | Not changed by me; needs the owner's go-ahead and secret values | — |
| Fence removal by the existing fence type (checklist item 2) | Not built; needs an owner change to specs/voice_quote_flows.md | — |

My v55 test for wood on joists called the age rule directly, so it never checked that the form asks the question. The new test checks the form.

## Backlog from the verdicts audit (purchase quantities)

Every new setting is optional. Blank keeps the exact quantity, so no saved price book changes.

| Item | Change | Commit |
|---|---|---|
| Concrete base gravel order increment | `baseGravelOrderIncrementCubicYards` | 8cdecd80 |
| Flat-roof insulation and cover board whole boards | `insulationBoardSqft`, `coverboardBoardSqft` | 3409ccfc |
| Roof accessories in bundles or pieces | `starterBundleLF`, `dripEdgePieceLF`, `ridgeCapBundleLF` | 6f0c04fc |
| Fence infill rolls (chain link fabric) | `offeringDetails.infillRollLF` (itemized, per linear foot) | 32b6e2b5 |
| Carpet cut-plan search beyond the exact limit | Exact search up to 2^areas × rooms ≤ 16,384; above that, one- and two-area turns from three starting plans | f9cd8792 |

Carpet measurement: on 1,200 random jobs of 9 to 13 rooms (12 ft roll, half with crossgrain seams allowed, 25% of rooms paired into connected areas), the purchase exceeded the best plan (every combination priced) in 23 jobs, by at most 18 sq ft. The earlier search did in 529 jobs, by up to 149 sq ft. The new search never bought more than the earlier one. The slowest job took 89 ms. These figures come from my job mix, not the audit's.

## Labels for owner approval (shipped, unapproved)

- Base gravel order increment (cubic yards)
- Insulation board size (sq ft)
- Cover board size (sq ft)
- Starter strip bundle length (linear feet)
- Drip edge piece length (linear feet)
- Ridge cap bundle length (linear feet)
- Infill roll length (linear feet)
- Coverage notice: "Repairs for [material] [repair type] go to review until their prices are complete."

## Code and spec difference (for an owner ruling)

`specs/voice_quote_flows.md` (FLOORING_INSTALL and FLOORING_REPLACEMENT) lists no building-age or floor-construction question. The engine asked both before this round. V56-2 adds the floor-construction question in one more case. The spec is unchanged.

## Approval versions

These are unchanged. No frozen-job result changed. A new setting changes a price book's content, and the approval already checks the content, so it needs a fresh approval.

## Frozen jobs

The 1,342 earlier frozen jobs are unchanged. There are 7 new ones, for 1,349.
