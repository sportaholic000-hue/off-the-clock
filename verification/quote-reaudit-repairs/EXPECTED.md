# Repair regression expectations (written before implementation)

Synthetic cases only. Customer rounding is unchanged.

- R01: For AI_INTERVIEW and AI_SUGGESTED, deleting an optional field or final tier requires a fresh approval. After explicit approval, obsolete receipts are absent and the service is live again. Changed retained values still require approval; wrong owner and stale revisions fail.
- R02: Fence itemized base 392000 cents less 14 posts * 2000 cents included material = 364000 cents. Stair base flooring 178000 + 5*6000 labor + round(5*1000.5) underlayment + 5*2000 removal + 5*500 disposal = 225503 cents when stair material is explicitly included in underlayment. Unsupported paths, zero covering prices and incompatible categories stay blocked.
- R03: TAX_ALL 15% -> TAX_NONE must set taxPercent to zero; a 10000-cent mowing job becomes 10000 cents. No positive tax rate is invented on later mode changes.
- R04/R08: Legacy integer-cent fields reject $1.005 without changing the saved value. Supported mowing, custom unit, offering and scope unit rates retain fractional cents. Fixed disposal rejects $0.005; zero is valid.
- R05: Closed-domain flooring/siding maps reject unknown keys; planting accepts exactly small/medium/large and rejects mixed. Open repair types retain three levels with closed size leaves.
- R06: Cleanup debris rows accept zero disposal and positive labor multipliers, reject zero labor multipliers.
- R07: A CUSTOM per_sqft interview accepts $0.005 from its saved unit; flat and unresolved unit reject it.
- R09: Renaming a tier override onto an occupied field retains both original prices; deleting Good then adding a tier chooses an unused name. The existing 55000-cent quote remains 55000 cents.
