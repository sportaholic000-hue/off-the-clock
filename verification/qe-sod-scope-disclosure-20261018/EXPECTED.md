# Sod scope disclosure expectations — 2026-10-18

These expectations were written before changing production code or running the
new regression. All money values are synthetic integer cents.

## Fixed pricing inputs

- Measured sod area: 1,000 square feet.
- Sod material: 100 cents/square foot with 5% waste, so 1,050 square feet costs
  105,000 cents.
- Installation labor: 100 cents/square foot, so labor costs 100,000 cents.
- Legacy combined preparation: 150 cents/square foot, so it costs 150,000 cents.
- Imported topsoil: 3,000 cents/cubic yard. A one-inch deficit uses
  `1,000 / 324 = 3.086419753...` cubic yards and rounds once to 9,259 cents.
- Split old-lawn removal: 100 cents/square foot, so it costs 100,000 cents.
- Split grading: 90 cents/square foot, so it costs 90,000 cents.

## Expected totals (unchanged by this repair)

| Scenario | Expected total |
|---|---:|
| No preparation requested | 205,000 cents |
| Legacy combined preparation | 355,000 cents |
| Split topsoil only, one-inch deficit | 214,259 cents |
| Split grading only | 295,000 cents |
| All three split components, one-inch deficit | 404,259 cents |
| Unknown depth with a two-inch owner allowance | 223,519 cents |
| Configured topsoil with no depth deficit | 205,000 cents |
| All three split rates explicitly zero and validly included | 205,000 cents |
| Split grading plus separately selected 10,000-cent project-debris disposal | 305,000 cents |

## Expected customer disclosure

- No-preparation output remains unchanged and makes no preparation-inclusion
  claim.
- Legacy combined preparation remains unchanged, including its existing broad
  combined-preparation disclosure.
- A split-preparation request says `Ground preparation requested`.
- It lists every configured split component in the fixed order:
  `old-lawn removal and disposal`, `grading`, `imported topsoil`.
- It lists every missing split component as excluded and adds the exact separate
  on-site-estimate sentence authorized by the owner.
- An explicitly valid zero/included rate counts as included; it is not described
  as missing.
- An unclassified numeric zero remains invalid and sends the estimate to review;
  this presentation repair does not authorize free work.
- Configured topsoil with a supplied depth that leaves no deficit says exactly:
  `No imported topsoil is needed for the supplied depth.` It does not call
  topsoil an unpriced exclusion.
- An unknown depth with a positive owner allowance still identifies imported
  topsoil as included and retains the existing allowance/site-confirmation note.
- Separate project-debris disposal never changes which ground-preparation
  components are described as included or excluded.
- Sanitized widget and voice results contain no private rate paths or raw owner
  prices.
- A frozen historical receipt is replayed as saved; this presentation repair
  does not rewrite its old wording or amount.

## Paths to verify

1. Direct engine result and complete customer sanitization.
2. Saved price book, reload, approval, intake preparation, submission and exact
   replay through the widget application function.
3. Real voice tool runtime using the saved approved service.
4. Historical saved-response projection without recalculation.

The engine version is asserted using the exported constant. This branch must not
change the engine version.
