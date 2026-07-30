# Quote Engine vNext Audit Notes

## Status and boundary

This repair pass starts from isolated baseline `6529d64379adf0c457198a992ab0a2ab442f8020`.
It is intentionally isolated under `server/quote-engine-vnext`. Production
routes, production imports, saved price books, and customer traffic still use
the existing engine. `npm run gate:quote-vnext` fails if `server/src` imports
this candidate.

This is an implementation candidate for independent audit. It is not a
production cutover and it does not mark Phase 2 passed.

The public `index.js` surface exposes only validated quote, price-book,
sanitization, evidence, and validation helpers. The line-template calculator
remains internal to the module and independently enforces the shared customer
and owner-pricing contracts as a defense in depth.

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
| Fence installation | Measured fence run, offered fence type, height, gate count, terrain | Measured gate-opening width when gates are selected; caller post counts and corner counts are rejected | Assumed length is inspection-first; all quotes block until post geometry and concrete/digging allocation are approved; selected gates also block until a measured-width pricing model is approved | No post count, spacing, mixed-charge split, gate-width formula, or per-gate reinterpretation is inferred |
| Fence replacement | Installation measurements plus old-fence removal choice | Removal and disposal are conditional on measured replacement scope | Same inspection gates and unresolved owner pricing contracts as installation | No customer-ready replacement price is emitted until the fencing owner decisions are resolved |
| Concrete driveway | Measured length and width, or measured area and perimeter; thickness, finish, demolition, reinforcement, access, base | Measured demolition area; selected base, reinforcement, and stamped material | Area-only and assumed geometry are inspection-first; exposed aggregate blocks until its material pricing contract is approved | Area and perimeter come from sufficient measurements; cubic yards equal area x thickness / 12 / 27 x (1 + visible waste) |
| Concrete patio slab | Same as driveway | Same as driveway | Same as driveway | Same volume and perimeter contract as driveway, using patio owner rates |
| Landscaping cleanup | Measured cleanup area, debris level, slope, haul-away choice | Additional haul-away | Assumed area is inspection-first | Labor uses measured area and visible debris/slope factors; each debris row has an explicit disposal charge |
| Mulch installation | Measured bed area plus depth, or measured cubic yards; mulch type, bed condition, edging choice | Measured prep area and edging length | Missing selected mulch, prep, or edging price blocks | Cubic yards use area x depth / 12 / 27; only the visible ordering-overage factor changes material quantity |
| Sod installation | Measured sod area, prep choice, slope, access | Ground preparation | Assumed area is inspection-first | Material uses measured area plus visible waste; labor uses measured area and visible slope/access factors |
| Planting | Exact plant counts by small/medium/large, bed condition, mulch choice | Measured prep area and mulch yards/type | Empty or malformed count maps block | Each size count receives its own labor and material rate; mulch uses measured yards and visible overage |
| Mowing | Measured mowable area, frequency, grass condition, bagging and edging choices | Measured edging length; bagging and edging are spec-approved optional add-ons | Assumed area is inspection-first | Labor uses measured area and exact visible frequency/condition maps; missing optional add-ons are skipped and disclosed per option |
| Siding replacement | Measured siding wall area, offered siding type, stories, removal and trim choices | Measured trim length | Home-size mapping is inspection-first; selected trim blocks until labor/material classification is approved | Base labor uses measured wall area and visible story factor; base material uses measured area plus visible product waste; house wrap remains in all-in material pricing |
| Siding repair | Siding type, damage type, measured affected area, stories | The engine derives small, medium, or large from the locked area boundaries | Missing affected area or the exact derived nested hours or allowance leaf blocks | Exact owner-configured hours and material allowance for siding, damage, and the measured-area category |
| Custom | Exact configured service name, confirmed match, configured unit, matching measured quantity | Quantity field depends on flat/hour/item/square-foot/linear-foot/roofing-square unit | Ambiguous name, mismatched or extra quantity, unconfirmed match, inspection-first mode, or missing charge classification blocks | No custom charge line is emitted until the owner approves a category or explicit mixed allocation; both public quote paths and the internal calculator fail closed |

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
- Accessory, underlayment, gate-opening, subfloor, partial-area, demolition,
  preparation, edging, trim, mulch, and custom-unit measurements are
  cross-validated against selected scope. Inputs the selected formula cannot
  consume are rejected instead of ignored.
- Cost-based underlayment and paint, non-vinyl product underlayment, fencing,
  siding trim, custom charge classification, exact flooring thresholds, poor
  exterior primer scope, and exposed aggregate remain review-only until their
  missing owner contracts are approved.
- Concrete base labor and finish-extra labor are rounded as separate formula
  components and preserved separately in the calculation record.
- Price-book status validation includes the complete business-default draft and
  executes every activation scenario through fees, seasonal pricing, markup,
  tax, minimums, range construction, and final integer-cent integrity. It also
  rejects duplicate built-in services and case-insensitive duplicate custom
  service names before activation or quote selection.
- Price-book tier validation evaluates merged tiers rather than an incomplete
  base. A bad tier does not block valid tiers, and the real quote helper carries
  the reduced-option notice to the customer-safe result.
- Owner preview may calculate an unconfirmed AI draft while identifying every
  unconfirmed field. Customer quoting remains blocked and preview does not
  mutate confirmation state.
- Structured diagnostics retain exact missing, invalid, unsupported, and
  cross-field dotted paths for Class 2 maps, repair cubes, debris rows, rule
  maps, business defaults, and tier definitions.
- Configured integer-cent zero means intentionally free for every money field.
  Missing, invalid, positive, and zero values remain distinct.
- Range buffering preserves the configured tax-mode minimum semantics:
  `TAX_NONE` has no tax, `TAX_MATERIALS` applies the minimum after materials
  tax, and `TAX_ALL` applies the minimum before tax. The displayed low value
  cannot fall below the final customer floor for the selected mode.
- The canonical result field is `rangeBufferUsed`. The prior alias remains on
  owner results temporarily, while customer output uses the canonical field.

## Remaining visible assumptions

The following Class 2 values remain in the candidate arithmetic. Each is stored
per service, strictly shaped, owner-editable, bounded, and copied into internal
calculation evidence. Passing arithmetic tests does not prove that the category
selection or default factor is objectively correct. Objective selection
criteria and approved default values remain release decisions:

- Roofing waste by complexity, pitch labor, and story labor.
- Flat-roof access labor.
- Painting wall-height labor, exterior fair-prep hours, and exterior story labor.
- Flooring product waste, pattern waste, average-room bands, and room labor factors.
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
- Service and business minimums follow the governing tax-mode order.
  `TAX_NONE` applies the minimum after markup. `TAX_MATERIALS` applies materials
  tax before the minimum, so tax can satisfy that post-tax floor. `TAX_ALL`
  applies the minimum before tax. Displayed low values cannot fall below the
  resulting customer floor.
- Travel, disposal, permit, and overhead each use a service applicability mode.
  Quantity-based disposal replaces the common disposal fee rather than stacking
  with it.
- The generic range materializer validates independent low, midpoint, and high
  evidence before use. No custom line is calculated at any boundary until the
  charge category or mixed allocation is approved.

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
5. Cost-based underlayment and paint need product coverage, package size,
   yield, waste, and purchasable-quantity rounding. These paths fail closed.
6. Hardwood, laminate, and carpet need product-specific underlayment contracts.
   The vinyl-plank scalar is not reused and these paths fail closed.
7. Fencing needs post geometry, gate-width pricing, footing scope, and separate
   concrete/digging labor and material prices or an explicit allocation. Every
   fencing quote remains review-only.
8. Siding trim and custom services need explicit charge categories or approved
   mixed allocations. These selected paths fail closed.
9. Interior preparation, exterior primer, exposed aggregate, and exact flooring
   threshold boundaries need approved pricing or behavior contracts. These
   selected paths fail closed.
10. Maximum permissible margin remains undecided. The arithmetic validates a
    finite margin below 100 percent, but that mathematical domain is not an
    approved product safety limit.
11. First-coat versus additional-coat labor, interior primer requirements, and
    valid wall-height productivity factors remain undecided.
12. Objective selection criteria remain undecided for plant size, debris,
    grass condition, access, slope, terrain, pitch, and complexity. Tests prove
    deterministic use of configured factors, not the truth of a selection.
13. Seasonal pricing still receives a month from its caller. The owner must
    decide whether that month is the work date or quote date.
14. A production route must persist original inputs, the unsanitized internal
    review result, and urgency before customer sanitization, then expose owner
    follow-up. This isolated candidate supplies the envelope but does not wire
    or persist it.

15. The older flat-roof shape requires an `average` key, while the later
    accuracy ruling requires unknown membrane and layer facts to fail closed.
    The candidate requires `average` structurally but never consumes it. The
    owner must decide whether that dormant key remains required or is removed.
16. The later VNext directive makes `TAX_MATERIALS` follow each service's
    explicit `taxabilityByCategory` map, while older global prose prohibits tax
    on some categories. The candidate follows the later VNext directive. The
    governing text must be reconciled before integration.
17. When both partial area and percentage are supplied, the candidate accepts
    agreement within the larger of one square foot or one percent of the
    percentage-derived area. That tolerance needs explicit owner approval.
18. The pure engine requires an explicit boolean for every owner-selected fee,
    but it cannot authenticate who supplied that boolean. Production must bind
    `feeSelections.owner` to an authenticated owner action.
19. Flooring Class 2 factor maps retain entries for all supported flooring
    products even when a service offers only a subset. Quotes consume only the
    selected offered product, but the owner must decide whether dormant factor
    rows are hidden, retained, or removed in the eventual editor contract.

## Calculation and customer evidence

Every ready owner result retains normalized inputs, measurements and sources,
owner assumptions, disclosures, line quantities, units, rates, rate paths,
multipliers, fee decisions, seasonal decisions, markup basis, minimum basis,
taxable and non-taxable subtotals, tax, scenario totals, and range derivation.
Each line declares `quantity_rate`, `fixed_amount`, `percentage_derived`,
`composite`, or `ranged` evidence sufficient to reproduce its rounded cents.

Every internal review result retains service type, original submitted customer
inputs, normalized scope when validation reached that point, validated
measurements, exact diagnostics, and urgency. `buildInternalLeadVNext` clones
that result together with the original request and rejects a customer-sanitized
review payload.

Customer results are allowlisted to ranges, approved price drivers,
per-option exclusions/disclaimers, and quote identity. Review diagnostics,
line items, owner rates, factors, fee rules, tax rules, and calculation records
are removed.

No production route currently persists the lead envelope. That integration
remains a release gate and is not represented as complete by these engine
tests.

## Audit commands

From the repository root:

```text
npm run test:vnext
npm run gate:quote-vnext
```

The gate also proves that production `server/src` has no import of this
candidate. Existing Phase 0-2 gates and the production client build must still
be run separately before handing the branch to independent audit.
