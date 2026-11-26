# Verdicts report on the deployment audit and the v54 audit — Claude's verification

Claude, November 26, 2026. Repaired version `quote-engine-vnext-accuracy-20261126-v56`.

| Item | Verdict | Commit |
|---|---|---|
| 1.1 Web quote phone not normalized for onboarded businesses (V54-1) | Real, reproduced (CA and US). Fixed: country from the business profile first | b80e0db7 |
| 1.2 Per-foot/per-item repairs require the largest repair area (V54-2) | Real, reproduced. Fixed: required only for per-square-foot rows | 99584a8d |
| 1.3 Duplicate and raw-decimal measurement text (V54-3) | Real; the duplicates came from my v54 rounding. Fixed in every remaining line (custom quantity: two decimals) | d8a2017f |
| 1.4 Owner range sentences dropped; lawn cap below 1 accepted (V54-4) | Real. Fixed, including label-based wording for sentences that named internal keys | 73a42176 |
| 1.5 "Cyclone" chain link skips the 10 ft limit | Real. Fixed: cyclone and hurricane recognized; "mesh" not; editor help states the limits | 7d859ff7 |
| 2.1 Returning-caller "sorry no idea" read as a denial | Left as designed (when unsure, reveal nothing) | — |
| 3.1 Flat-mowing cap label | Kept (owner: decide wording without asking) | — |
| 3.2 Bagging help in priceBookCopy stale | Real. Fixed | 7d859ff7 |
| 3.3 Approvals pause once | Working as designed | — |
| V54-5 / V51-3 cross-border tax | Skipped (out of scope) | — |

## Approval versions

ROOFING_REPAIR, FLAT_ROOF_REPAIR and SIDING_REPAIR move to approval version 2, because per-foot and per-item repairs now quote. The fence-name and lawn-cap changes only send more requests to review, so those types keep their approvals.

## Tenant isolation

`src/quoteDoneRoutes.js` changed in one line, and its line count is unchanged. The review is recorded in verification/tenant-isolation-20261007/route-source-review-20261015.md (third entry).

## Deployment (verified read-only on Railway, November 26)

- **Project:** brilliant-nature. **Service:** off-the-clock. **Source branch:** `main`. **Builder:** RAILPACK.
- **Variables:** none of the owner's own.
- **Deployments:** the 10 most recent all failed. The newest is 2026-07-20, on commit ed12dca.
- **Not changed by me:** I made no change to Railway.
