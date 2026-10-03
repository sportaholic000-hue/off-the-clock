# Quote engine and price book — October 3 implementation

Implemented on `claude/quote-engine-readme-20261002` at `c714b6eb6bbe8deed8ccac83df03a52f811019ce`. The candidate is saved on `codex/quote-trade-decisions-20261003`. No merge or deployment.

**Final verification: 1,259 passed, nine unchanged voice failures, two skipped. Owner and widget builds passed. Four real application/browser workflows passed with no browser errors.** The nine voice failures were reproduced from the starting source and compared by exact test name. They are not nine new quote-engine findings.

## Behavior implemented

| Owner decision | Result and evidence |
| --- | --- |
| Incomplete sibling product | Fully configured roof/floor products remain live. Incomplete selections still return review. Owner coverage shows which product needs setup. Asphalt control is **$5,990.00**; tile control **$1,780.00**. |
| Customer privacy | New customer quotes omit raw slug presentation, internal service identity, revision hash and owner buffer. No labor/material/tax amounts, rates, markup or allocation breakdown is added. Historical retry metadata is filtered without recalculating its saved amount. |
| Labor-only peak surcharge | Uses the local quote-date month, with an editable business time zone. Service-specific settings and business inheritance are visible. Every-month selection supports year-round labor surcharges. Separately priced labor and explicitly allocated installed-price labor are charged; unrelated price portions are unchanged. |
| Derived fence posts | `ceil(length / spacing) + 1 + corners + gate posts not already included`. Default spacing 8 ft; editable per offering. The 100 ft / 8 ft / 2 corners / 1 gate example gives 18 posts. No caller post-count question. |
| Painting preparation | Good/fair/poor prices use the entire measured painted area. No caller prep-area question. Existing preparation prices remain usable for their original condition. Complete conditions quote independently of unpriced conditions. |
| Material waste | The specifically listed membrane, starter/drip/ridge, paint/primer/preparation materials, fence infill, wire/rebar and stamped material have editable 10% defaults. Piece counts, fixed allowances, installed rates and package calculations receive no extra waste. Other existing arithmetic remains unchanged. |
| Labor factors | Flooring layout, fence terrain, offering height/stories, interior ceiling height, flat-repair access, mulch access and planting access are owner-editable. Fence height remains exact. Itemized painting accepts 1–3 coats; installed offerings keep their defined coats. |
| Installed materials-only tax | Explicit private materials shares cover installed offerings, gates/removal/trim, installed additional scopes and installed underlayment rates. Only that share is taxed. A separate explicit labor portion supports labor-only adjustments. No production split is guessed; shares sum to at most 100%. Tax-all and no-tax modes retain their arithmetic. |
| Concrete area/perimeter | Direct measured area and perimeter quote; impossible combinations reject. Equivalent rectangle and direct-area fixtures agree. |
| Mulch quantities | Direct stated yards receive no ordering overage. Area/depth-derived mulch yards retain the configured overage. Planting's direct yards are also used as stated. |
| Minimum | A binding minimum produces one exact minimum-plus-tax price. Above-minimum range and customer-cent behavior remain unchanged. |

## Verification

- [Final full suite](full-verified.tap): 1,270 records; 1,259 pass / 9 known voice fail / 2 skip. Includes the original engine suites, independent integer-fraction financial oracles, precision/adversarial checks, editor tests and application regressions.
- [New acceptance results](trade-acceptance.tap): **26 passing cases** in [quoteTradeDecisions.spec.mjs](../../test/quoteTradeDecisions.spec.mjs). Counts overlap the full suite.
- [Baseline reproductions](baseline.tap): the five focused cases for the three supplied verified failures fail on `c714b6e` (tile/vinyl, tile/hardwood, private metadata, peak readiness, asphalt/metal).
- [Independent expected calculations](EXPECTED.md): changed quantities and hand-calculated amounts. Expected values in tests are explicit; no quote response supplies its own expected total.
- [Owner build](owner-build.log) and [widget build](widget-build.log): both successful. Owner build has its existing bundle-size advisory.
- [Browser/application result](application-final/public/result.json): four workflows, no page errors. [Runnable harness](browser.mjs).
- [Source binding](application-final/public/source-binding.json): all **153** recorded source files rehashed against the final local source successfully. [Result summary](RESULTS.json) includes the exact baseline voice failures.

The four application workflows use fresh synthetic accounts and an isolated database:

1. Enter private installed labor/material portions in the actual editor; save and approve; set the local zone and service surcharge; verify a **$1,257** customer result through public and authenticated endpoints. Confirm no private pricing breakdown, safe historical retries, saved values after reopening, and rejection of another owner's price-book read.
2. Edit fence waste as **20%** and post spacing as **10 ft**; save/reload preserves original rates; preview is independently calculated **$4,100**; public questions contain corners and omit post count.
3. Save condition-based painting rates and quote three coats over measured walls/ceilings: **$5,021**; public questions omit prep area.
4. Save/approve tile beside incomplete vinyl; the actual owner screen shows product coverage and the authenticated quote is **$1,780**.

The original independent/adversarial tests retain their purpose. Historical precision fixtures explicitly set new waste to zero when their old quantities are essential to their rounding oracle; separate acceptance tests verify the new 10% defaults. Minimum, post, condition-prep and new-waste expectations were updated from the recorded formulas. The branch matrix now exercises new access factors and verifies selected incomplete products fail closed.

## Compatibility and handoff

- Saved money values are retained. The engine version changed to require fresh approval of the changed arithmetic. Installed prices need owner-entered labor portions when labor adjustments apply and materials shares when materials-only tax applies. Zero is valid; no split is assumed.
- Former exact terrain/height/story descriptors may remain in saved offering details, but labor factors now determine those adjustments. Itemized finish-coat settings no longer constrain caller coat counts.
- Waste changes follow the explicit requested material list and retain other existing quantity formulas. This implementation does not reinterpret formwork or additional-scope prices beyond that list.
- The quoted “29 Claude calculations” were not supplied as a separate named fixture set. The supplied $5,990/$1,780/18-post controls were verified, along with the repository's all-trade hand cases and financial matrices. This report does not claim a case-by-case comparison with an unavailable external fixture list.
- [Voice field handoff](VOICE_HANDOFF.md) lists the changed customer facts. The shared voice calculation adapter now supplies the trusted date context; phone-agent wording and its nine existing failures were not repaired in this task. No live-call verification is claimed.
- No billing, onboarding, unrelated website functionality, production records or deployment configuration was changed.

The governing amendment is [QUOTE_TRADE_DECISIONS_20261003.md](../../specs/QUOTE_TRADE_DECISIONS_20261003.md). This is a tested review candidate for Claude's next audit, not a claim that every possible configuration is mathematically proven correct.
