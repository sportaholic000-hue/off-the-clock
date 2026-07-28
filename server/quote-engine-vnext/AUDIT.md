# Quote Engine vNext Audit Notes

## Status and boundary

This repair pass starts from isolated baseline `6529d64379adf0c457198a992ab0a2ab442f8020`.
It is intentionally isolated under `server/quote-engine-vnext`. Production
routes, production imports, saved price books, and customer traffic still use
the existing engine. `npm run gate:quote-vnext` fails if `server/src` imports
this candidate.

This is an implementation candidate for independent audit. It is not a
production cutover and it does not mark Phase 2 passed.

## Service contract matrix

| Service | Customer measurements and selections | Conditional scope | Review or inspection-first conditions | Quantity and price basis |
| --- | --- | --- | --- | --- |
| Roof replacement | Measured roof surface area, existing and replacement materials, pitch, stories, measured layers, complexity, scope | Partial area or percent; measured starter, drip-edge, and ridge-cap lengths in itemized mode; confirmed decking sheets | Home-floor-area and size assumptions are inspection-first; missing selected material rates block; cost-based underlayment blocks without product coverage and purchasable quantity | Roofing squares derive only from measured roof area; product waste affects roof materials, while an owner-classified installed-area underlayment sell price uses measured installed area |
| Roof repair | Repair type, measured affected area, roof material, pitch, stories, active-leak answer | The engine derives small, medium, or large from the locked area boundaries | Unknown repair source or missing affected area is inspection-first; an absent exact derived nested hours or allowance leaf blocks | Exact owner-configured hours and material allowance for the measured-area category; caller-selected size is rejected |
| Flat-roof replacement | Measured roof area, confirmed membrane, measured layers, access, scope, building type | Partial area or percent; commercial insulation | Assumed area, unknown membrane, or unknown layer count is inspection-first; no disclosure or Average fallback makes missing facts quotable | Measured selected area; tear-off quantity includes the confirmed layer count; only exact configured membrane rates are consumed |
| Flat-roof repair | Repair type, measured affected area, confirmed membrane, leak and ponding answers | Optional ponding-water add-on | Unknown leak source, unknown membrane, or missing affected area is inspection-first; absent exact derived nested rates block | Exact configured hours and material allowance for membrane, repair, and the measured-area category |
| Interior painting | Measured paintable wall area, wall height, condition, finish coats, ceiling and trim choices | Measured ceiling area and measured trim length | Floor-area and room-count methods are inspection-first; fair or poor preparation blocks until measured-scope prep pricing exists | Good-condition labor and material use measured wall or ceiling square-foot coats; wall height affects wall labor only |
| Exterior painting | Measured paintable wall area, stories, condition, finish coats | Fair-condition preparation uses the existing measured-area production factor | Home-size mapping is inspection-first; poor surfaces block until primer pricing or an all-inclusive rule is approved | Finish coats retain their labor and material rates; no finish rate is silently reused for primer |
| Flooring installation | Measured floor area, offered flooring type, existing floor, removal choice, rooms, layout, stair count | Removal rate by existing floor, stairs, and explicit vinyl-underlayment rule | Assumed area is inspection-first; owner-review or unknown underlayment condition blocks; cost-based underlayment blocks without product ordering facts | Labor uses measured area and visible average-room factor; flooring material uses product waste; installed-area underlayment sell pricing uses measured installed area only |
| Flooring replacement | Installation measurements plus subfloor issue answer | Measured subfloor repair area | Same inspection gates as installation; affected subfloor area cannot exceed floor area | Installation formula plus measured removal and measured subfloor allowance scope |
| Fence installation | Measured fence run, offered fence type, height, gate count, confirmed planned post count, terrain | Measured gate-opening width when gates are selected; corner count is not accepted | Assumed length is inspection-first; all quotes block until concrete/digging has an approved labor/material contract; selected gates also block until a measured-width pricing model is approved | No post spacing, mixed-charge split, gate-width formula, or per-gate reinterpretation is inferred |
| Fence replacement | Installation measurements plus old-fence removal choice | Removal and disposal are conditional on measured replacement scope | Same inspection gates and unresolved owner pricing contracts as installation | No customer-ready replacement price is emitted until the fencing owner decisions are resolved |
| Concrete driveway | Measured length and width, or measured area and perimeter; thickness, finish, demolition, reinforcement, access, base | Measured demolition area; selected base, reinforcement, and stamped material | Area-only and assumed geometry are inspection-first; exposed aggregate blocks until its material pricing contract is approved | Area and perimeter come from sufficient measurements; cubic yards equal area x thickness / 12 / 27 x (1 + visible waste) |
| Concrete patio slab | Same as driveway | Same as driveway | Same as driveway | Same volume and perimeter contract as driveway, using patio owner rates |
| Landscaping cleanup | Measured cleanup area, debris level, slope, haul-away choice | Additional haul-away | Assumed area is inspection-first | Labor uses measured area and visible debris/slope factors; each debris row has an explicit disposal charge |
| Mulch installation | Measured bed area plus depth, or measured cubic yards; mulch type, bed condition, edging choice | Measured prep area and edging length | Missing selected mulch, prep, or edging price blocks | Cubic yards use area x depth / 12 / 27; only the visible ordering-overage factor changes material quantity |
| Sod installation | Measured sod area, prep choice, slope, access | Ground preparation | Assumed area is inspection-first | Material uses measured area plus visible waste; labor uses measured area and visible slope/access factors |
| Planting | Exact plant counts by small/medium/large, bed condition, mulch choice | Measured prep area and mulch yards/type | Empty or malformed count maps block | Each size count receives its own labor and material rate; mulch uses measured yards and visible overage |
| Mowing | Measured mowable area, frequency, grass condition, bagging and edging choices | Measured edging length; bagging and edging are spec-approved optional add-ons | Assumed area is inspection-first | Labor uses measured area and exact visible frequency/condition maps; missing optional add-ons are skipped and disclosed per option |
| Siding replacement | Measured siding wall area, offered siding type, stories, removal and trim choices | Measured trim length | Home-size mapping is inspection-first | Labor uses measured wall area and visible story factor; material uses measured area plus visible product waste; house wrap remains in all-in material pricing |
| Siding repair | Siding type, damage type, measured affected area, stories | The engine derives small, medium, or large from the locked area boundaries | Missing affected area or the exact derived nested hours or allowance leaf blocks | Exact owner-configured hours and material allowance for siding, damage, and the measured-area category |
| Custom | Exact configured service name, confirmed match, configured unit, matching measured quantity | Quantity field depends on flat/hour/item/square-foot/linear-foot/roofing-square unit | Ambiguous name, mismatched unit, unconfirmed match, or inspection-first mode blocks | Fixed and ranged prices multiply only the quantity associated with the configured unit; every range scenario receives fees, markup, minimum, and tax independently |

## Approximations removed

- Square-root roof accessory geometry.
- Home-floor-area to roof-surface conversion for customer-ready quotes.
- Interior floor area as a proxy for paintable wall area.
- Exterior home-size maps as a proxy for paintable wall area.
- Fence post-spacing inference.
- Concrete perimeter inferred from area or an assumed driveway width.
- Siding home-size area maps and trim-ratio inference.
- Property-size and assumption-based mowing, sod, cleanup, and flooring areas.
- Hidden mulch preparation multipliers.
- Numeric coercion or fallback of named repair sizes.
- Custom-service quantities unrelated to the configured unit.

Confirmed zero is distinct from missing. For example, a supplied itemized
ridge-cap length of zero records that there is no physical ridge-cap scope. An
absent ridge-cap measurement still blocks the quote.

Additional fail-closed structural safeguards include:

- Install-only flooring and fencing contracts reject replacement-only scope
  instead of accepting and silently ignoring it.
- Underlayment, gate-opening, subfloor, and partial-area measurements are
  cross-validated against selected scope. Cost-based underlayment and selected
  gates remain review-only until their missing owner contracts are approved.
- Concrete base labor and finish-extra labor are rounded as separate formula
  components and preserved separately in the calculation record.
- Price-book status validation includes the complete business-default draft,
  rejects duplicate built-in services, and rejects case-insensitive duplicate
  custom-service names before activation or quote selection.
- Pre-tax minimums remain pre-tax through range buffering; the recorded
  customer floor includes the tax attributable to the minimum scenario.

## Remaining visible assumptions

The following Class 2 values remain because they convert real measurements or
confirmed conditions into order or labor quantities. Each is stored per
service, strictly shaped, owner-editable, bounded, and copied into the internal
calculation evidence when it affects a line:

- Roofing waste by complexity, pitch labor, and story labor.
- Flat-roof access labor.
- Painting wall-height labor, exterior fair-prep hours, and exterior story labor.
- Flooring product waste, pattern waste, average-room bands, and room labor factors.
- Fence height labor/material and terrain labor.
- Concrete ordering waste, finish labor, and access labor.
- Cleanup slope, mulch ordering overage, sod waste/slope/access, planting mulch overage.
- Siding product waste and story labor/removal.

## Financial rules

- Every service explicitly classifies line categories in
  `priceBasisByCategory` as owner cost or sell price. Sell-price lines are not
  marked up again.
- Every service supplies a complete `taxabilityByCategory` map.
  `TAX_MATERIALS` taxes the selected categories and their applicable markup
  share. `TAX_ALL` ignores that map and taxes the complete applicable pre-tax
  customer charge.
- Service and business minimums are pre-tax floors. Tax cannot satisfy the
  minimum. Displayed low values cannot fall below the actual taxed minimum
  scenario.
- Travel, disposal, permit, and overhead each use a service applicability mode.
  Quantity-based disposal replaces the common disposal fee rather than stacking
  with it.
- Custom low/high ranges are calculated as independent low, midpoint, and high
  scenarios instead of averaging away the configured range.

## Owner rulings required before integration

1. Existing saved fields mix the words cost, price, rate, allowance, and
   charge. The candidate requires a category-by-category cost versus sell-price
   classification. Existing values must not be reinterpreted until the owner
   approves a migration rule.
2. The governing v2 spec deliberately prices interior walls from floor area.
   This accuracy candidate instead requires measured paintable wall area and
   per-coat rates. That is an intentional candidate deviation requiring owner
   approval and new locked labels before cutover.
3. The governing v2 spec permits several documented assumption-based quote
   paths. This candidate makes materially approximate area/perimeter paths
   inspection-first. Owner approval is required for that stricter product
   behavior and its customer/voice copy.
4. New measurements and shapes require owner-facing editor controls, customer
   collection, voice-flow updates, and a non-destructive saved-data migration.
   None is included in this isolated candidate.
5. Cost-based underlayment needs product coverage and purchasable quantities;
   fencing needs concrete/digging labor-material allocation and a measured-width
   gate pricing model; interior prep, exterior primer, and exposed aggregate
   each need an approved pricing contract. These paths fail closed here.

## Calculation and customer evidence

Every ready owner result retains normalized inputs, measurements and sources,
owner assumptions, disclosures, line quantities, units, rates, rate paths,
multipliers, fee decisions, seasonal decisions, markup basis, minimum basis,
taxable and non-taxable subtotals, tax, scenario totals, and range derivation.
Each line declares `quantity_rate`, `fixed_amount`, `percentage_derived`,
`composite`, or `ranged` evidence sufficient to reproduce its rounded cents.

Customer results are allowlisted to ranges, approved price drivers,
per-option exclusions/disclaimers, and quote identity. Review diagnostics,
line items, owner rates, factors, fee rules, tax rules, and calculation records
are removed.

## Audit commands

From the repository root:

```text
npm run test:vnext
npm run gate:quote-vnext
```

The gate also proves that production `server/src` has no import of this
candidate. Existing Phase 0-2 gates and the production client build must still
be run separately before handing the branch to independent audit.
