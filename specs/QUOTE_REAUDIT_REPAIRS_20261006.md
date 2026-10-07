# October 6 quote/price-book re-audit repairs

Starting source: `73c00622d6f2df31f57773b32e41355a7421f1a3`.
Branch: `codex/quote-reaudit-fixes-20261006`. The owner requested repair of
the five reproduced defects. Synthetic data only; no main merge or deployment.

## Handwritten expectations, before regression execution

- Tile, 200 sq ft, one medium room, straight layout: labor
  200 × $3 × 1.10 = $660; material 200 × 1.12 × $5 = $1,120.
  **$1,780**, including when an unselected carpet-removal price is unfinished.
  Selecting that unpriced removal must review with no estimate.
  A $1/sq-ft removal price adds $200: **$1,980**.
- Vinyl, same area/room: $660 + 200 × 1.08 × $5 = **$1,740**.
  Declining optional underlayment, or reporting a subfloor that does not require
  it, keeps this total even if the extra is unfinished. Selecting the unpriced
  extra requires review. A complete $1/installed-sq-ft extra adds $200:
  **$1,940**. Materials-only 10% tax on the flooring adds $108: **$1,848**
  when underlayment is declined. With selected $200 underlayment and a 50%
  material share, tax is ($1,080 + $100) × 10% = $118: **$2,058**.
  Replacement-floor subfloor allowance follows the same selection boundary:
  an unselected unfinished allowance leaves **$1,740** live; selected unpriced
  repair reviews, and $1 × 200 affected sq ft adds $200 for **$1,940**.
- Explicitly included $0 vinyl underlayment adds nothing. The same taxed
  job is **$1,848**, whether the unnecessary material allocation is absent
  or explicitly 0%. Tax off: **$1,740**. Unclassified zero, incompatible
  inclusion bases/categories and selected positive bundles without a required
  allocation must still review.
- Hardwood with explicitly 5% waste: $660 labor + 200 × 1.05 × $5 = $1,050
  material. Base $1/installed-sq-ft underlayment adds $200: **$1,910**.
  Package option: two 100-sq-ft packages at $50, zero package waste, add $100:
  **$1,810**. Approval and inclusion-choice labels must say purchased packages
  for that option and installed square feet for the base. Saved prices unchanged.
- Installed fence, 100 LF × $40, no gates: **$4,000** before and after removal
  of a $250 walk-gate offering. Removing the walk gate removes its rate and
  allocation entries, including tier overrides, without changing other gates.
  A remaining $300 gate selected once produces **$4,300**.
- Invalid supplied IDs `0` and `false` must reject without replacing the saved
  book. Missing/null/empty IDs get UUIDs. Valid identities remain unchanged.
  Synthetic custom fixed-price control is **$125**.
- Sod, no prep: 100 × $1.05 material + 100 × $1 labor = **$205**.
  Under the governing engine spec's common-fee rule, an always-applied $100
  disposal fee gives **$305** if no separate scope is declared. If a separate
  scope is declared, declined/selected gives **$205/$305**. With $1/sq-ft
  ground preparation, old-lawn disposal is already in the $100 prep price:
  **$305** without separate debris, **$405** with selected separate debris.
  Correct the evidence wording to distinguish these cases; do not change fees.

## Scope and policy

Complete flooring base jobs remain available while unfinished extras are
reported separately; actual selected extras retain full validation. Required
hardwood/laminate/carpet underlayment and always-included vinyl requirements
remain activation requirements. Malformed stored values still fail closed.
The engine approval version remains v7: these repairs restore eligibility and
correct presentation/validation; they change no amount for a previously valid
quote. Ordinary owner configuration edits still invalidate their saved approval.
The existing repair-48/73 matrix classified zero unselected flooring removal
and subfloor allowances as whole-service blockers. Its readiness expectation
now follows the same optional-price rule as other trades. Its selected-scope
review assertions, malformed-data assertions and dollar oracles are unchanged.

The sod formula in `quote_engine_v2.md` includes common flat disposal. Repair
108 prevents double billing ground-preparation disposal; its broad evidence
sentence incorrectly describes the no-preparation case. Preserve the approved
fee formula and repair-57/108 monetary tests, and correct the record/documentation.

The separate repair-catalog observation is not one of the confirmed defects.
Existing repair cube validation explicitly requires complete corresponding
hour/material maps. Changing that coverage contract is not silently included
in these repairs.
