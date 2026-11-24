# Audit f1501ff — repairs and open rulings (November 24, 2026)

Branch `quote-engine`. Engine `quote-engine-vnext-accuracy-20261124-v47`.
Every fix was reproduced before it was changed, has a test in
`test/audit-f1501ff/` with expected values written before the run, and is its
own commit.

## How regressions are now caught

`test/invariants/` (runs inside `npm run test:quote`): from 50 live base
services, every price is removed and set to $0 one at a time (1,600
outcomes). Readiness must agree with the real quote, owner preview with the
customer path, and nothing may throw. Every outcome is frozen; any change fails
the gate until it is recorded with a reason in `test/invariants/CHANGES.md`.

Proof it works: on untouched f1501ff it found 42 readiness crashes (#1), 18
silent fence-catalog holds (#4, wider than reported) and the #6 customer
refusal by itself. The engine fingerprint corpus (1,267 frozen jobs) was also
diffed against f1501ff: only 18 jobs changed, all by the intended #3
disclosure; no total and no ready/held result changed.

## Fixed

| Item | Fix |
|---|---|
| #1 critical | Unfinished or overlapping fence rows no longer crash readiness; each service is isolated; a book whose readiness throws is refused before it is written |
| #3 | Roof quotes say "Not included; confirmed and priced on site: flashing and vents" when the base wording excludes them |
| #4 | Fence catalogs: coverage per fence type and height row; same sample jobs as a single fence; withheld rows named on the owner screen. Correction: removal is a yes/no answer, so this is disclosure, not a block |
| #5a | Travel rule read from the service |
| #5b | Concrete base-included labor share is a per-condition notice |
| #5c | Overlay readiness answers the floor-sound question |
| #5d | Included $0 prices found in fence catalog rows |
| #5e | Low-slope roofs with roll underlayment are tested |
| #6 | Not-sure pitch with a band or rise reaches the customer |
| #7 | Tree-shaped fields typed JSON (rule tested for every field) |
| #11 | Empty short-load band list is no band list |
| #12 (part) | A repair's own $0 unit price/minimum needs a classification; $0 low-slope prices can be marked included |
| #13 | Unselected optional-item quantities are listed as not included (price as before, per spec STEP 2b); the widget clears unticked quantities |
| #15 (part) | Leveling disclosure; repair dimensions no longer list the hidden area; concrete non-choice notices; full-clone note |

## Not changed — needs your ruling

1. **#12 $0 add-ons, flat-roof details, disposal.** Your settled policy
   (`server/quote-engine-vnext/AUDIT.md`) keeps their $0 as free. The audit
   wants one rule (every $0 needs "included" or "free"). Keep the policy, or
   change it?
2. **Flat roof repair $0 allowance** (9 known harness findings): a $0
   medium/large patch allowance blocks every repair size, though small
   repairs quote. Block the whole service (current, cautious), or block only
   that size with a notice?
3. **#2 partial low-slope roofs** need a new customer question. Proposed
   label: "Rise of the low-slope section (inches per 12 inches)". Approve the
   label and the rule (below 2/12 review; 2/12 to under 4/12 low-slope method
   on those squares only)?
4. **#8 coats**: stop asking coats for installed painting prices and show
   "Price includes N finish coats"? Approve the wording.
5. **#9 vaulted rooms**: new questions (flat or vaulted; peak height; gable
   walls). Approve, and the labels?
6. **#10 hip factor 1.20 → 1.10**: a starting-value change. Approve 1.10?
   Keep "complex" 1.40 until a labor-only source is found?
7. **#3 new lines and #14 new lines/products** (chimney, skylight, box vents,
   exhaust caps, headwall flashing, quarter-round, siding detach-and-reset,
   sheet vinyl, engineered wood, stucco): new scope. Which, and before or
   after launch?
8. **#15 remaining**: retire the siding trim review-only field; ask roof edge
   lengths once; package rounding for roof accessories. All change owner or
   customer questions.
9. **Neon #13** (tier name not passed): no behavior difference could be
   reproduced; left unchanged.

`specs/BUILD_STATUS.md` was not updated: AGENTS.md forbids editing /specs/
without your written approval for that file.
