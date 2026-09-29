# Selected-work estimates and separate on-site work

The owner explicitly approved quoting supported work from the price book while the business estimates separate additional work on site. This supersedes the earlier requirement to suppress every amount whenever a separate part of the request remains unpriced. It does not authorize guessed prices, automatic removal of selected scope, or treating an incomplete selected job as complete.

The customer can identify separate work in **Additional work for on-site estimate**. Existing additional-details and recovered work-description questions also offer an explicit separate-work answer. Those descriptions remain unchanged. A priceable selected job receives its estimate; the additional description receives no invented amount. Missing measurements, unsupported selected engine scope, unapproved prices and uncertain facts about the selected job continue to require clarification or review.

For example, with the independent synthetic fixture, 10,000 square feet at $0.005 quotes $50 for mowing. A separate hedge-removal request is shown as requiring an on-site estimate and is not included in that $50. If 10 linear feet of lawn edging is selected and the owner has approved its $2/foot price, the same engine quotes $70 for mowing and edging. The separate hedge work still has no price. These values are test expectations, not default business rates.

The partial application response is `PARTIAL_ESTIMATE_READY`. Its `pricedEstimate` contains the unchanged, sanitized engine estimate. It has no top-level low/mid/high amount or tier options, and `fullJobTotal` is null. `pricedScope` identifies the selected service, entered facts and fee choices; `additionalWork` contains the exact declared descriptions. The customer sees that the owner will assess the extra work on site and agree its price before doing it.

The quote and a linked additional-work lead are saved in one transaction. A failed lead write rolls back the quote and receipt as well. Exact retries and restarts return the original stored response without additional rows. Staff receive the safe additional-work description and linkage, while pricing access and owner-only calculation evidence retain their existing permissions and tenant boundaries. CRM access on Operator does not acquire quote-calculation access. If the main job itself needs review, its separate work and original additional-work value are also visible in the permitted lead summary; the UI does not claim that an unissued quote already exists. This closes a reproduced omission in the first R6 candidate.

Every issued estimate also identifies its selected priced scope and retains the submitted contact, address and project text in the customer/owner view. This is not a prose classifier: it does not claim to recognize every job instruction or contradictory measurement inside arbitrary name/address text. Earlier failures remain evidence under their original policy. The new separate-work rule must not be presented as proof that every free-text interpretation concern is solved.

The existing 19-file arithmetic engine, original voice guide and original engine specification remain unchanged. No rates, markup cap, measurement conversion, scope flag or combined-job fee rule is invented here. Separate services continue to use their configured supported engine paths; this change does not introduce an automatic multi-service grand total. The proposed optional UI labels use the owner's approved on-site-estimate behavior. No voice runtime, deployment, merge, provider operation, live-data change, dependency installation or permission expansion is included.

## Verification

Before characterization is retained against the immutable source at `3eaa81287a69b1d1653a44ae963241e3cf1864d7` (the same full tree published as `18f73538e26a76002804e5541f9b39967cbab4a5`). Its complete named/addressed controls quote, while separate additional-work submissions suppress the price. This is a recorded consequence of the earlier rule, not a newly discovered arithmetic defect.

The committed application and browser checks are:

```text
node verification/quotedone/partial-work-workflow.mjs . <fresh-evidence-directory>
node verification/quotedone/partial-work-browser.mjs . <fresh-evidence-directory>
```

They use the existing Node 22.23.2 runtime, real application HTTP/authentication, the approved browser dependencies and synthetic SQLite stores. The normal controls remain complete and valid. Assertions cover the $50/$70 calculations, explicit exclusions, absent whole-job totals, retained original details, owner follow-up, permissions, atomic writes, restart and retry. The final source-bound delivery records the actual results and any failed intermediate attempts; this document alone is not a launch acceptance record.
