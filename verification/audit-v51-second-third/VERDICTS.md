# Second and third audits of v51, and the owner ruling (November 26, 2026)

## Owner ruling (recorded)

"Stop asking me questions about how to quote when the goal is quote as many
jobs as possible using industry best practices." Applied:

- Mowing bagging is a percentage of the whole visit price, the per-visit
  charge included (overrides `specs/quote_engine_v2.md` line 1184, which is
  not edited); a $0 area rate with a positive per-visit charge is flat
  per-visit pricing and quotes.
- Repair services go live per size band; a band with incomplete prices holds
  only its own requests and is listed ("Large repairs", "Medium repairs",
  "Small repairs").
- Roofs steeper than 12/12 are listed while the over-12/12 additions are
  blank ("Roofs steeper than 12/12").

## Second audit (Codex-style, HEAD 6f57b78)

| Item | Verdict | Action |
|---|---|---|
| Tenant route hash pin | Real; already fixed in `d653b9a3` before this audit was received | — |
| Repairs blocked by large-band fields | Real | Fixed (per size band, above) |
| Malformed pitch value crashes | Real (`core-roof`, two others) | Fixed: own-key lookup |
| Fence height > 1,000,000 ft quoted at 6 ft | Real | Fixed: height checked at any size |
| Sod waste starting value 5% | Changed to 10% (Purdue AY-28-W); saved services keep theirs | Fixed |
| Chain link post spacing help | Added "Chain link line posts are set at up to 10 feet." | Fixed |
| Fence customer wording ("2 4 ft gate(s)") | Reworded | Fixed |
| Owner price-entry message | "Enter a plain number, for example 1250.50."; leading $ on money | Fixed |

## Third audit (partial, disconnected)

| # | Verdict | Action |
|---|---|---|
| Provenance | The listed commits are Claude's, made under the owner's instruction "you're in charge of all the fixing" and reported each round | — |
| 1 Control joints blank | Real | Blank = included (industry standard) and the quote says so |
| 2 Carpet roll width 12 ft default | Not reproduced: a blank width goes to review and NEEDS PRICING naming the field | Not changed |
| 3 Membrane waste | Withdrawn by the auditor (waste factor exists); whole-roll purchasing is a limitation of the standard estimating method | Not changed |
| 4 Fence removal from the new offering | Partly: removal scope is the owner's own description, printed on the quote | Added "A different existing fence is confirmed on site." |
| 5 Post spacing up to 100 ft | Real | Limit 12 ft (ASTM F567: chain link at most 10 ft) |
| 6 Flat-roof tear-off exclusion missing | Not reproduced: rate path `tearOffPerSqft.*` carries the exclusion | Not changed |
| 7 Building age as a safety certificate | Not reproduced: every priced removal carries the testing exclusion; pre-1991 goes to review | Not changed |
