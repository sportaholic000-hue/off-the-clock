# Quote display corrections — 2026-10-06

Base verified before work: `6e6cd5b10e0558477cfe32d255a6ad58907988c2`
from `codex/quote-reaudit-fixes-20261006`. Work branch:
`fix/quote-display-defects-20261006`. Synthetic fixtures and temporary storage only.

## Handwritten expected results (before executing reproductions)

1. Roofing: 1,000 measured roof square feet / 100 = 10 roofing squares.
   Low pitch, one story, one layer, simple roof: labor 10 × $75 = $750;
   material 10 × 1.10 × $120 = $1,320; tear-off 10 × $30 = $300;
   installed-area underlayment 10 × $15 = $150. No other charges, markup,
   minimum adjustment, tax or range: $750 + $1,320 + $300 + $150 = **$2,520.00**.
   The display rule renders this whole-dollar total as **$2,520**. Typed
   `Asphalt shingle` must bind to the registered product only after explicit
   confirmation; an unregistered name must not gain a confirmation receipt.
2. Missing `materialPerSqft.tile` must display the editor's material-price label
   plus `Tile`, never the raw engine path, in production status and preview.
   Product and tier diagnostic rows must use that same label source.
3. Mowing: 5,000 square feet × $0.02 = $100. The $150 minimum binds.
   Tax = $150 × 15% = $22.50; total = **$172.50**. The approved minimum rule
   collapses the 10% range to this single amount on the widget, owner list,
   preview and phone. Phone example: `$172.50 CAD per visit. Includes
   applicable tax.` (one period per sentence).
4. Display boundaries: 4621.5 becomes **$4,621.50**; 172.5–200 becomes
   **$172.50 – $200.00**; 2520–3000 becomes **$2,520 – $3,000**;
   0–0.5 becomes **$0.00 – $0.50**. In a group with a $172.50 option,
   a $200 option displays **$200.00**. Equal $172.50 endpoints display once.

These are display changes. No pricing formula, price-book values, approval,
scope or trade-policy rules are changed. The shared formatter applies to
quoted amounts, not owner unit rates that may legitimately have fractional cents.
