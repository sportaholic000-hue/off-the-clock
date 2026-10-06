# October 6 independent-audit repairs

Base: `73c00622d6f2df31f57773b32e41355a7421f1a3`.
Local branch: `codex/quote-audit-repairs-20261006`.

Scope: preserve website price conditions and their item ownership; correct the
owner's optional-price guidance. No quote arithmetic or approval rules change.
The governing rules are WEBSITE_PRICE_IMPORT_20261006.md (literal excerpts,
nearby conditions, bounded imports) and quote_engine_v2.md STEP 2b (scope versus
optional extras). No new business policy is required.

## Expectations written before execution

All inputs are synthetic. Website extraction performs no arithmetic.

- `[SYNTHETIC] Cleaning $99` retains `Only homes under 1,000 sq ft; first visit
  only.` from its adjacent paragraph or plain-text line. The amount remains
  **$99**. A second card's **$199** retains only its own 2,000-sq-ft condition.
- `[SYNTHETIC] Item A $10` retains `Tax included`; `[SYNTHETIC] Item B $20`
  retains `Plus tax`. Neither receives the other's tax condition. No tax amount
  can be calculated because no tax rate is given.
- Nested cards, inline condition spans, preceding conditions inside a card,
  table rows and repeated imports retain those same literal amounts and their
  own restrictions. Identical amounts on two items do not merge their conditions.
- A page-level `All prices exclude tax.` applies to all items on that page.
  An item-local note, including one that says `All prices include tax.`, does not
  become a page-wide note. A note in an unrelated unpriced card is not propagated.
- An item whose full price-and-condition excerpt exceeds 1,500 characters is
  withheld whole, and partial extraction is disclosed. Its bare price must not
  survive without its condition. Instruction-like local context is likewise
  withheld, not passed to the receptionist or a model.
- Page-wide conditions longer than the old 500-character note cutoff remain
  attached to **$99** when the complete excerpt fits. A complete excerpt over
  1,500 characters is withheld whole. Group-wide conditions apply to that
  department only, including when the condition makes its items too long.
- A blank line separates plain-text item records. Within a record, following
  lines stay with their price until the next price line. Standalone explicit
  page-wide notes remain separate from item conditions.
- Mowing **100 sq ft × $1 = $100** with all multipliers 1 and no fees, taxes,
  markup, minimum or range: unpriced bagging and/or 20 ft of unpriced lawn edging
  preserve **$100**, with the selected extras explicitly excluded. Flat-roof
  repair **1 hour × $100 + $10 materials = $110** with an unpriced ponding-water
  surcharge preserves **$110**, with that extra explicitly excluded.
- Missing required scope prices still require review. Optional bagging, mowing
  edging and ponding-water prices that are explicitly **$0** include the extra
  without adding a charge. The owner guidance must distinguish blank from zero.

The UI repair changes explanatory copy, not approved field labels. Existing
hand-calculated quote expectations remain unchanged. All tests use temporary
storage; no provider writes or live business data are permitted.
