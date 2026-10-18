# Independent expectations — written before execution

Pinned source: `1857b7779b83b70f7753b41b72c3677270cd4ffc`.
All fixtures are synthetic. No tax, markup, minimum, fees, seasonal adjustment or range buffer. One room, straight layout. Floor area excludes stairs. No carton rounding. Owner-entered rates are cents internally.

| Work | Independent dollar calculation | Expected low / mid / high |
| --- | --- | --- |
| Laminate, 200 sqft | labor 200 × $1 × 1.10 = $220; materials 200 × 1.08 × $2 = $432; installed-area foam 200 × $1 = $200 | $852 / $852 / $852 |
| Corrected laminate, 250 sqft | 250 × $1 × 1.10 + 250 × 1.08 × $2 + 250 × $1 | $1,065 / $1,065 / $1,065 |
| Hardwood, 200 sqft | 200 × $3 × 1.10 + 200 × 1.10 × $4 + 200 × $2 | $1,940 / $1,940 / $1,940 |
| Laminate + four narrow steps | $852 + 4 × $75 installed per step | $1,152 / $1,152 / $1,152 |
| Corrected laminate + four wide steps | $852 + 4 × $120 installed per step | $1,332 / $1,332 / $1,332 |
| Revised laminate material $3, 200 sqft | 200 × $1 × 1.10 + 200 × 1.08 × $3 + 200 × $1 | $1,068 / $1,068 / $1,068 |
| Revised laminate material $3, 250 sqft | 250 × $1 × 1.10 + 250 × 1.08 × $3 + 250 × $1 | $1,335 / $1,335 / $1,335 |
| Second service, laminate labor $2, 200 sqft | 200 × $2 × 1.10 + 200 × 1.08 × $2 + 200 × $1 | $1,072 / $1,072 / $1,072 |

Sources: `specs/quote_engine_v2.md` FLOORING_INSTALL; current scope configuration's explicitly installed-area selling-price mode; the saved-book publishing fixture. Room boundary floor is below the selected 200/250-sqft labor quantities. Hardwood waste is 10%; laminate waste is 8%. Installed-area underlayment uses measured area, unlike package-cost purchasing.

## Contract and sequence expectations

- A dimension correction is not intrinsically an invalid scope token: tokens sign selected presentations, service, call and book revision. A still-applicable scope token plus a **fresh structured customerConfirmed:true** may authorize corrected dimensions. customerConfirmed:false cannot. We do not require transcript-derived confirmation or universal one-use tokens.
- Changing the selected stair package, flooring product, service, call or saved-book revision must not let the old token newly authorize different work. Each rejected attempt must leave both quote and submission counts unchanged, with no quote handle or monetary estimate in its public response.
- Explicitly confirming the newly presented affected field(s), and using a fresh tool-call ID, allows the valid corrected request at the independently calculated amount.
- Same ID + same arguments replays exactly; same ID + corrected arguments cannot produce a new quote. A fresh ID permits a corrected request. A fresh ID with the original request replays its receipt.
- Original saved receipt and quote rows remain byte-for-byte unchanged after correction/replay, including after a book revision. Separate readonly SQLite connections must see the committed records.
- Actual provider session config and every projected tool response exclude private rates, owner/service IDs, internal calculations and stored receipt internals. Synthetic fake providers perform no external writes.

These tests exercise scripted text and scripted provider tool callbacks through the real runtime/dispatcher. They do not establish model comprehension, ASR, actual spoken consent or live telephony/provider behavior. No helper automatically confirms all tokens.
