# Quote Engine vNext Audit Notes

## Status and boundary

This candidate starts from `786c3e0d30a2b2418c63272ddcd51e35aeb4fa99`.
It is intentionally isolated under `server/quote-engine-vnext`. Production
routes, production imports, saved price books, and customer traffic still use
the existing engine. `npm run gate:quote-vnext` fails if `server/src` imports
this candidate.

This is an implementation candidate for independent audit. It is not a
production cutover and it does not mark Phase 2 passed.

## Service contract matrix

| Service | Customer measurements and selections | Conditional scope | Review or inspection-first conditions | Quantity and price basis |
| --- | --- | --- | --- | --- |
| Roof replacement | Measured roof surface area, existing and replacement materials, pitch, stories, measured layers, complexity, scope | Partial area or percent; measured starter, drip-edge, and ridge-cap lengths in itemized mode; confirmed decking sheets | Home-floor-area and size assumptions are inspection-first; missing selected material rates block | Roofing squares derive only from measured roof area; material waste is owner-visible; tear-off uses measured layers; accessories use their individual confirmed lengths |
| Roof repair | Repair type, canonical small/medium/large size, roof material, pitch, stories, active-leak answer | None | Unknown repair source is inspection-first; an absent exact nested hours or allowance leaf blocks | Exact owner-configured hours and material allowance for the selected material, repair, and size |
| Flat-roof replacement | Measured roof area, membrane, measured layers, access, scope, building type | Partial area or percent; owner layer assumption only when layers are unknown; commercial insulation | Assumed area is inspection-first; unknown membrane requires the configured average-with-disclosure rule; missing exact membrane rates block | Measured selected area; tear-off quantity includes layer count; the required Average key is only a fallback and cannot be the sole offering |
| Flat-roof repair | Repair type, canonical size, confirmed membrane, leak and ponding answers | Optional ponding-water add-on | Unknown leak source or membrane is inspection-first; absent exact nested rates block | Exact configured hours and material allowance for membrane, repair, and size |
| Interior painting | Measured paintable wall area, wall height, condition, finish coats, ceiling and trim choices | Measured ceiling area and measured trim length | Floor-area and room-count methods are inspection-first | Labor and material use measured wall or ceiling square-foot coats; prep uses an owner-visible hours-per-wall-square-foot factor |
| Exterior painting | Measured paintable wall area, stories, condition, finish coats | Owner-visible primer coats for poor surfaces | Home-size mapping is inspection-first | Every finish and configured primer coat receives labor and material; prep hours derive from measured wall area |
| Flooring installation | Measured floor area, offered flooring type, existing floor, removal choice, rooms, layout, stair count | Removal rate by existing floor, stairs, and explicit vinyl-underlayment rule | Assumed area is inspection-first; owner-review or unknown underlayment condition blocks | Labor uses measured area and visible average-room factor; material uses measured area plus visible product and pattern waste |
| Flooring replacement | Installation measurements plus subfloor issue answer | Measured subfloor repair area | Same inspection gates as installation; affected subfloor area cannot exceed floor area | Installation formula plus measured removal and measured subfloor allowance scope |
| Fence installation | Measured fence run, offered fence type, height, gates, corners, confirmed planned post count, terrain | Measured gate-opening width | Assumed length is inspection-first; a missing post plan or exact offering rate blocks | Solid run excludes measured gate openings; posts and footings use the confirmed plan, never inferred spacing |
| Fence replacement | Installation measurements plus old-fence removal choice | Removal and disposal use measured total run | Same inspection gates as installation | Installation formula plus measured old-fence removal scope |
| Concrete driveway | Measured length and width, or measured area and perimeter; thickness, finish, demolition, reinforcement, access, base | Measured demolition area; selected base, reinforcement, and stamped material | Area-only and assumed geometry are inspection-first | Area and perimeter come from sufficient measurements; cubic yards equal area x thickness / 12 / 27 x (1 + visible waste) |
| Concrete patio slab | Same as driveway | Same as driveway | Same as driveway | Same volume and perimeter contract as driveway, using patio owner rates |
| Landscaping cleanup | Measured cleanup area, debris level, slope, haul-away choice | Additional haul-away | Assumed area is inspection-first | Labor uses measured area and visible debris/slope factors; each debris row has an explicit disposal charge |
| Mulch installation | Measured bed area plus depth, or measured cubic yards; mulch type, bed condition, edging choice | Measured prep area and edging length | Missing selected mulch, prep, or edging price blocks | Cubic yards use area x depth / 12 / 27; only the visible ordering-overage factor changes material quantity |
| Sod installation | Measured sod area, prep choice, slope, access | Ground preparation | Assumed area is inspection-first | Material uses measured area plus visible waste; labor uses measured area and visible slope/access factors |
| Planting | Exact plant counts by small/medium/large, bed condition, mulch choice | Measured prep area and mulch yards/type | Empty or malformed count maps block | Each size count receives its own labor and material rate; mulch uses measured yards and visible overage |
| Mowing | Measured mowable area, frequency, grass condition, bagging and edging choices | Measured edging length; bagging and edging are spec-approved optional add-ons | Assumed area is inspection-first | Labor uses measured area and exact visible frequency/condition maps; missing optional add-ons are skipped and disclosed per option |
| Siding replacement | Measured siding wall area, offered siding type, stories, removal and trim choices | Measured trim length | Home-size mapping is inspection-first | Labor uses measured wall area and visible story factor; material uses measured area plus visible product waste; house wrap remains in all-in material pricing |
| Siding repair | Siding type, damage type, canonical size, stories | None | Missing exact nested hours or allowance leaf blocks | Exact owner-configured hours and material allowance for the selected siding, damage, and size |
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
  cross-validated against the selected scope they describe.
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
- Painting wall-height labor, prep hours, story labor, and poor-surface primer coats.
- Flooring product waste, pattern waste, average-room bands, and room labor factors.
- Fence height labor/material and terrain labor.
- Concrete ordering waste, finish labor, and access labor.
- Cleanup slope, mulch ordering overage, sod waste/slope/access, planting mulch overage.
- Siding product waste and story labor/removal.

## Financial rules

- Every service explicitly classifies line categories in
  `priceBasisByCategory` as owner cost or sell price. Sell-price lines are not
  marked up again.
- Every service supplies a complete `taxabilityByCategory` map. A non-zero tax
  mode enables tax calculation but does not override the service map.
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

## Calculation and customer evidence

Every ready owner result retains normalized inputs, measurements and sources,
owner assumptions, disclosures, line quantities, units, rates, rate paths,
multipliers, fee decisions, seasonal decisions, markup basis, minimum basis,
taxable and non-taxable subtotals, tax, scenario totals, and range derivation.

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
