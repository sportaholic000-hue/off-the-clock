# Accuracy integration expectations — 2026-10-18

Written before executing the integration regression. All records are synthetic.

## Live v8 roof paths

The approved roof fixture uses a 1,500-square-foot footprint at 12:12 pitch.
Surface area is `round(1500 * sqrt(2), 2) = 2121.32` square feet.

- Full roof: `ceil(2121.32 * 1.10 / 500) = 5` underlayment rolls;
  underlayment is 75,000 cents and the complete middle is 616,148 cents.
- Half roof: selected surface is 1,060.66 square feet;
  `ceil(1060.66 * 1.10 / 500) = 3` rolls; underlayment is 45,000 cents and
  the complete middle is 315,575 cents.
- Saved widget and real voice-tool results must agree for both scopes. Customer
  output must not expose line items or private rate paths.

## Live v8 sod paths

The approved sod fixture uses 1,000 square feet, 100 cents/square foot material,
5% waste, 100 cents/square foot installation, and a one-inch topsoil deficit at
3,000 cents/cubic yard.

- Material: 105,000 cents.
- Labor: 100,000 cents.
- Topsoil: `round((1000 / 324) * 3000) = 9,259` cents.
- Complete middle: 214,259 cents.
- Widget and voice must both say `Ground preparation requested`, include
  `imported topsoil`, and exclude `old-lawn removal and disposal, grading` with
  the approved separate-estimate sentence.
- The corrected disclosure must not expose private rate paths or change cents.

## Genuine common-base sod history

The fixture must be produced by running common-base commit
`550728daea4058c37f13952ab78785929bab39b0`, not by editing a v8 response.

- Its saved customer middle is 214,259 cents.
- Its persisted internal result and approval use
  `quote-engine-vnext-date-context-20261006-v7`.
- Its original driver says `Existing-ground preparation included`; it has no
  component-level included/excluded sentences.
- Loading and saving that book under v8 must not renew its approval. It remains
  `NEEDS PRICING`, and new requests cannot quote.
- Only explicit owner reapproval binds v8 and makes the service live.
- Before and after reapproval, retrying the original request must reproduce its
  original customer response exactly and must leave the persisted submission
  outcome and quote result byte-identical.
- A new post-reapproval quote remains 214,259 cents but uses the corrected
  component-level disclosure.

The integration must retain both engine-version literals as
`quote-engine-vnext-accuracy-20261018-v8`.
