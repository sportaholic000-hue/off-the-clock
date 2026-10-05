# October 5 launch repair decisions

Authority: the owner's launch-fixes request, starting at
`e830ca88ec7f2cd630c497d31b0e32322ed2feef`. These decisions supersede conflicting
earlier notes. Scope is the quote engine and price book. No merge or deployment.

- Basic interior painting supports good walls. Its owner status must state:
  "Fair or poor walls go to review until you use itemized pricing with preparation rates."
  Fair/poor requests name that same remedy. Hide the preparation product from
  the basic-mode scope editor; preserve any saved configuration for later use.
- Flat-roof building type is optional and has no pricing effect.
- Interview product names use the editor's shared normalization. Reject names
  that collide after normalization; never silently overwrite an entry.
- Busy-season labor pricing is optional, off unless configured, and zero means
  off. Use month names and explain the percentage applies in selected months.
- Check activation/approval before identity diagnostics for customer quoting.
  Never-approved services say "This service has not been approved for quoting yet."
- Demolition access diagnostics test access independently at the entry's maximum
  thickness; an out-of-band thickness must not create a spurious access error.
- Customer layer descriptions start with "Insulation:" and "Coverboard:".
- Remove unused legacy imports and status code only after checking callers;
  retain any legacy helpers that still have callers. Cleanup must not change prices.

## Arithmetic

Compute the peak surcharge on combined eligible regular and installed-price
labor, then round once to whole cents. Allocate that rounded charge to the two
price bases: floor each exact share, then distribute remaining cents one per part, starting with the
larger labor part; regular labor wins an equal-part tie. The sum of the lines
must equal the once-rounded combined surcharge. Installed-price surcharge
remains a selling-price line and receives no additional markup.

Room thresholds are inclusive maximums: average room area <= small maximum is
small; otherwise <= medium maximum is medium; otherwise large. Advance the
engine version so approvals made under previous arithmetic become stale.

## Owner-approved labels

- New insulation needed
- New coverboard needed
- Does any edge touch a house foundation, garage foundation, or existing concrete?
- Edges against foundation or existing concrete
- Covers slabs thicker than (optional lower limit)
- Covers treads wider than (optional lower limit)

## Expected outcomes written before execution

All prices here are synthetic. No fees, markup, tax or minimum unless stated.

1. Basic paint: 800 measured wall sq ft x 2 coats x $0.90 = **$1,440 labor**.
   Materials include the existing 10% Class 2 paint-waste factor:
   800 x 2 x $0.20 x1.10 = **$352**; total **$1,792**.
   Fair/poor walls: review, no estimate, with the remedy above. Owner notice
   visible; preparation product absent from basic scope list.
2. Flat roof: 1,000 x $5 labor = $5,000; 1,000 x 1.10 x $7 membrane =
   $7,700; 1,000 x $2 tear-off = $2,000; total **$14,700**, without building type.
3. Name conversion: vinyl plank -> vinyl_plank; Ceramic tile -> ceramic_tile;
   Cedar privacy -> cedar_privacy. Colliding names fail validation. No quote
   or dollar amount is produced by these configuration-only checks.
4. Controls: heading/explanation and January-December names appear. No quote
   or dollar amount is produced by presentation-only checks.
5. Never-approved service: review, no dollar estimate; approval message above.
6. Demolition band >4 through 6 inches, 3-inch slab with matching access and
   reinforcement: review, no dollar estimate; thickness is the only field error.
7. Layer descriptions are capitalized; amounts remain the pre-existing fixture
   amounts (recorded in the corresponding fixture's hand-calculated arithmetic).
8. Legacy cleanup: existing callers and previously recorded expected amounts
   remain unchanged; production no longer imports unused legacy entry points.
9. Peak tie: $100.05 + $100.05 = $200.10; 10% = **$20.01**.
   Exact shares $10.005 each; allocate **$10.01 regular + $10.00 installed**.
   Unequal: $100.06 + $100.05 = $200.11; 10% rounds to **$20.01**;
   larger regular share gets **$10.01**, installed **$10.00**; reversing the
   bases gives **$10.00 regular + $10.01 installed**.
   $100.04 + $100.04 = $200.08; 10% rounds to **$20.01**, split $10.01/$10.00.
   $100.09 + $100.09 = $200.18; 10% rounds to **$20.02**, split $10.01/$10.01.
10. Rooms: 450 / 3 = 150 sq ft average, small x1.20. With $3/sq ft labor:
    450 x $3 x1.20 = **$1,620 labor**. At 900 / 3 = 300 average, medium
    x1.10 gives **$2,970 labor**. Above 300 uses large x1.00.

Each execution records which pre-written expectations it verifies. Existing
regression suites retain their independently written expectations, except cases
at the newly inclusive room boundaries, which must be recalculated before running.

### Additional hand calculations before running the regression suite

- Existing tile boundary fixture at 150 sq ft: labor 150 x $3 x1.20 = $540;
  material 150 x1.12 x$5 = $840; total **$1,380** (previous $1,335).
- At 300 sq ft: labor 300 x$3 x1.10 = $990; material $1,680;
  total **$2,670** (previous $2,580).
- Peak integration fixture: 1 sq ft, room multiplier 1, regular labor $100.05,
  tile material 1 x1.12 x$1 = $1.12, installed overlay $100.05 (100% labor).
  Base **$201.22**, peak **$20.01**, final **$221.23**.
  Unequal labor $100.06/$100.05: base $201.23 +$20.01 = **$221.24**.
  Both $100.04: $201.20 +$20.01 = **$221.21**.
  Both $100.09: $201.30 +$20.02 = **$221.32**.
  With 10% markup only on regular labor and its surcharge: ($100.05 +$10.01)
  x10% = $11.006 -> $11.01; final **$232.24**.
  Peak off (0% or unselected month): **$201.22**.
- Existing roof fixture plus measured layers: $14,700 roof +800 x$2 insulation
  +600 x$1 coverboard = **$16,900**; capitalization changes no amount.
- Room boundary fixture vinyl materials: 450 x1.08 x$5 = $2,430, labor $1,620,
  final **$4,050**. For 900 sq ft, materials $4,860 +labor $2,970 = **$7,830**.
- Legacy relocation preserves historical calculations exactly. Regression
  fixtures keep their written historical expectations; production retains the
  field metadata needed to read existing books, without the old calculators.

- Two-room tile boundaries: 300 /2 =150 small: labor 300 x$3 x1.2 = $1,080;
  material 300 x1.12 x$5 = $1,680; total **$2,760**.
  600 /2 =300 medium: labor 600 x$3 x1.1 = $1,980; material $3,360;
  total **$5,340**. These replace the earlier exclusive-boundary expectations.
- First focused run: 31 passed, 4 fixture/assertion failures. Before rerun,
  supply required uniform-wall confirmation, check capitalization at sentence
  boundaries (not inside the label "Roof insulation and coverboard"), and pass
  the application's documented quoteInstant clock argument. Dollar expectations
  remain unchanged; none were copied from actual results.

- Second focused run: 34/35. The initial handwritten paint material total
  omitted the existing paintWasteFactor=0.10 in contracts.js / tradeAdjustments.js.
  Recalculated from that unchanged rule before rerunning: 800 x2 x$0.20 x1.10
  = $352; $1,440 labor +$352 material = **$1,792**. The owner's required
  **$1,440 labor** check already passed. No production paint arithmetic changed.
- First 50-file non-browser regression: 1,530/1,534. The remaining failures
  were this omitted fixture waste, one source-text check of the moved legacy
  file, the superseded rejection of normal product names, and a v5-only version
  assertion. Replacement expectations follow this decision record; no gates or
  assertions were removed.
