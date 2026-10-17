# Owner-authorized departures from the pinned specifications

No file under specs/ was changed. References below are to base 8b53169b2d6019e6769481b5c0551aca42a91f42. The current task expressly authorizes these changes.

| Spec line | Departure on this branch |
|---|---|
| quote_engine_v2.md:438 | One business buffer bounded at 25% becomes an optional low/high pair, with independent service overrides. The original fallback and its 0–25% bounds remain. New low is 0–100%; new high is any finite non-negative percentage, subject to safe monetary results. |
| quote_engine_v2.md:453 | The lower endpoint uses the resolved low percentage instead of B when set. |
| quote_engine_v2.md:454 | The upper endpoint uses the resolved high percentage instead of B when set. |
| quote_engine_v2.md:536 | When separate buffers apply, the private legacy scalar rangeBufferUsed is null; both applied percentages are retained in the private range calculation record. Legacy quotes retain their previous scalar and full result. |
| quote_engine_v2.md:9, 356–359, 448–449 | For the opt-in CUSTOM split only, materials-only tax uses the materials allocation and excludes its labor and labor surcharge; the old single-category taxability override no longer decides the whole mixed charge. Existing unsplit and trade-category taxability is unchanged. |
| quote_engine_v2.md:365–368 | CUSTOM split labor surcharge uses the exact labor allocation and is recorded as a labor line, following the labor markup/price-basis flags. Other surcharge categories and rules remain unchanged. |
| QUOTE_TRADE_DECISIONS_20261003.md:7 | CUSTOM can use installedMaterialsPercent.price without an explicit installedLaborPercent: the remainder is labor, not unaffected other cost. These custom portions follow their labor/material cost-or-sell settings. No installed-trade split or second-markup rule is changed. |
| QUOTE_TRADE_DECISIONS_20261003.md:78 | The opt-in custom labor surcharge follows the labor category's price-basis/markup flags rather than the ordinary surcharge-category settings. |
| platform_spec_v2.md:595–598 | This task adds the expressly requested per-service accuracy and actual-cost measures. It does not implement the old 8%-over-five-jobs insight threshold or a proposed rate-adjustment action. No rates change automatically. |
| AGENTS.md (Specs are law / BUILD_STATUS update instruction) | BUILD_STATUS was not edited: this task expressly prohibits editing any specs file. |

Additions: actual labor hours/cost, material cost and approved changes are stored in a separate owner-only table; old quote, final-invoice and event records are not rewritten. The specified accuracy report is additive; existing totals/funnels retain their calculations.

Presentation discrepancy: quote_engine_v2.md:465–480 and the pinned code normally round displayed endpoints outward to whole dollars. The requested $878.40–$1,073.60 and $927.20–$1,122.40 are exact saved calculation endpoints; customer displays remain $878–$1,074 and $927–$1,123. Preserving this existing formatting honors the instruction that blank settings leave today's quotes unchanged. No display-rounding departure is claimed.
