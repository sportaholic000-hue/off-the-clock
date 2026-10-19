# Agent 2 — independent expectations, written before implementation

Requested base: `0b59a401e1d8f2c2c43188c7355abb9939504b9b`.
Branch: `codex/qe-agent2-price-metadata-20261018`.
All fixture prices, notes, owners and dates are synthetic. No live owner data is used.

## F9 — explicit painting and surface money leaves

The expected painting keys are handwritten here, not generated from enumeration:

| Painting leaf | Expected category | Expected money kind |
| --- | --- | --- |
| primerLaborPerSqftPerCoat | labor | unit_rate |
| primerMaterialPerSqftPerCoat | material | unit_rate |
| ceilingPrimerLaborPerSqftPerCoat | labor | unit_rate |
| ceilingPrimerMaterialPerSqftPerCoat | material | unit_rate |
| trimLaborPerLFPerCoat | labor | unit_rate |
| trimMaterialPerLFPerCoat | material | unit_rate |
| trimPrimerLaborPerLFPerCoat | labor | unit_rate |
| trimPrimerMaterialPerLFPerCoat | material | unit_rate |
| trimPrepLaborPerLF_good | prep | unit_rate |
| trimPrepMaterialPerLF_good | material | unit_rate |
| trimPrepLaborPerLF_fair | prep | unit_rate |
| trimPrepMaterialPerLF_fair | material | unit_rate |
| trimPrepLaborPerLF_poor | prep | unit_rate |
| trimPrepMaterialPerLF_poor | material | unit_rate |

Both interior and exterior painting support these 14 leaves. Interior surface
extras are doorSides, doorFrames, windows and cabinetFaces (fixed amounts).
Exterior surface extras are windows, doors, shutters and garageDoors (fixed),
plus exteriorTrim, soffit, fascia and powerWashing (measured rates). Siding
surface extras are soffit and fascia (measured rates), with soffit tested for
both configured square-foot and linear-foot units. Every surface extra has
category addon and an explicit sell_price basis, including when the service's
addon category is configured as cost. This follows the existing line builder,
not the name of the field.

Each supported leaf must enumerate once in base pricing and once for each
explicit tier override. Inherited tier prices must not acquire extra metadata.
An ordinary material price remains a control in every service. Unknown keys,
absent values, numeric settings, and nested non-leaf values are excluded.

Actual save/load expectations for every supported leaf:

- First save on July 10, 2026 gives each new price the server timestamp and
  retains its submitted synthetic source note; a submitted date is ignored.
- An unchanged save on October 18 retains July 10. A changed numeric price
  gets October 18 only for that leaf. A source-note edit alone is not a price edit.
- Base and tier records remain independent, including the ordinary material
  control. Reordered named tiers retain their own records.
- An unchanged legacy manual price without metadata stays undated and without
  invented provenance. A retained source note without a date does not gain one.
- A newly saved AI source marks every explicit money leaf. Ordinary field
  confirmation is not provenance adoption. Editing one price or explicitly
  accepting it clears only that price's placeholder; unchanged leaves retain it.
- At October 18, July 10 prices are 100 days old. Material prices are eligible
  regardless of selling/cost basis; non-material prices are eligible only when
  their effective basis is cost. Surface extras remain excluded from freshness
  because their existing quote lines explicitly use sell_price. A date exactly
  90 days old is not stale; older by one millisecond is stale. A disabled
  threshold produces no freshness reminders. Unknown dates are not fabricated.

## F16 — pipe-jack discrete prices

The October 4 owner money rule requires whole cents for discrete each-prices.
`pipeJackEach` must have fixed_amount kind and whole-cent editor metadata.
The server dollar boundary and shared editor parser must reject $1.005,
including root pricing, nested pricing and tier overrides. The input must
remain $1.005; no silent rounding to $1.01 or $1.00 is permitted. Stored
100.5-cent legacy values must remain displayable for correction and fail
owner pricing validation/quoting.

Controls: $0, $1.00, $1.01 and $12.34 convert to 0, 100, 101 and 1234 cents.
Measured roofing rates of $1.005 still convert to 100.5 cents. The correct
extended arithmetic is 3 * 100.5 = 301.5 cents, rounded once to 302 cents.
Three valid $1.01 pipe jacks extend to 303 cents. No arithmetic or approval
rules are changed to manufacture those outcomes.

## F21 — all 15 category expectations

| Service family | Money path | Category | Material |
| --- | --- | --- | --- |
| Roofing | iceWaterBarrierPerSqft | material | true |
| Roofing | iceWaterBarrierPerLF | material | true |
| Roofing | valleyPerLF | material | true |
| Roofing | stepFlashingPerLF | material | true |
| Roofing | pipeJackEach | material | true |
| Roofing | ridgeVentPerLF | material | true |
| Concrete | shortLoadPerYard | material | true |
| Concrete | shortLoadFlatFee | material | true |
| Concrete | sawCutPerLF | labor | false |
| Concrete | baseGravelPerCubicYard | material | true |
| Concrete | baseExcavationGradingPerSqft | labor | false |
| Concrete | placementFlat.pump | addon | false |
| Concrete | placementPerCubicYard.pump | addon | false |
| Sod | sodGradingPerSqft | labor | false |
| Sod | topsoilPerCubicYard | material | true |

Each of these follows its configured priceBasisByCategory: cost means
costBasis true; sell_price or absent basis means false. Material freshness
still applies for material selling prices. Labor and addon selling prices
remain excluded. Both concrete service types and all configured placement
methods should follow the same semantics, with pump explicitly required above.
Use base and explicit tier metadata, independent numeric changes, retained
notes, server dates, stale/fresh/undated boundaries and AI controls. Quantity
settings, multipliers, price-basis selectors and minimums must not be falsely
classified as these material/cost entries.

## Evidence and ownership

Production changes are restricted to server/priceBookMoney.js,
server/priceMetadata.js and server/pricePrecision.js. New tests use
test/qeAgent2*.spec.mjs; evidence stays in this directory. All other source,
specification, dependency, workflow and selector files remain untouched.
Run the new expectations against the unchanged production base first. Then
run focused/neighboring tests and owner/widget builds. Push only the requested
branch and inspect hosted strict, full and browser gates at the exact final
head; earlier green commits do not count as final verification.

Semantic evidence inspected before implementation: current surface definitions
and quote-line builders in server/quote-engine-vnext/surfacePricing.js,
configuredOfferings.js and templates.js; concreteLandscapePricing.js field
descriptions and quote-line builders; existing priceMetadata.js transitions;
the October 4 whole-cent owner rule. These files are read-only inputs here.
