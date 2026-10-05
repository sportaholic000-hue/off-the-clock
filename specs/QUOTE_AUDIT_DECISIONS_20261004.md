# Owner decisions — October 4, 2026 audit follow-up

The owner agreed these refinements after discussing the nine reported issues.
They supersede conflicting earlier quote/price-book rules only as listed below.
The agreed removal-labor peak surcharge changes arithmetic and requires fresh
owner approval through the existing engine-version mechanism.

1. Insulation and coverboard are independent customer Yes/No choices on every
   flat-roof replacement, residential or commercial. Building type selects
   neither layer. Each selected layer requires its own measured area and owner
   prices; an unselected layer needs no area and adds no charge. Missing answers
   or uncertain work require clarification/review, never an assumed No.
2. Owners can configure multiple siding-removal, concrete-demolition, floor-
   overlay and stair entries. Match the actual stated facts exactly. Demolition
   access can explicitly cover a maximum category; existing saved entries keep
   exact access matching. Reject overlapping entries when the owner saves,
   including overlaps created by effective tier overrides. Do not silently
   substitute another product, interpolate prices or pick a cheaper entry.
   Quote-time validation remains a defense for malformed historical records.
3. AI setup can collect complete offering and scope definitions and prices,
   including required flooring underlayment and scope variations. Interview
   answers contain only owner-stated facts and prices. Missing or ambiguous
   decisions prompt clarification. Suggestions remain unconfirmed drafts until
   the owner reviews and approves them.
4. Measured per-unit rates allow fractional cents; each extended charge is
   rounded once. Fixed amounts and discrete per-item prices require whole cents.
   Classify each individual price inside mixed offering/scope maps: gates,
   posts, footings, steps, plants and purchased packages are discrete items;
   area, length, volume and hourly rates are measured rates. Minimums and fixed
   fees retain whole-cent precision. No silently rounded owner input.
5. Customers state whether edges adjoin a house foundation, garage foundation,
   or existing concrete and supply the total measured adjoining-edge length.
   Formwork quantity is the measured/calculated perimeter minus those edges,
   for rectangle, area/perimeter and outline measurements alike. Explicit No
   uses the full perimeter. Reject missing, negative or excessive edge lengths;
   never infer them from an address, building label or photograph.
6. Customer job summaries include each numeric field's defined units. Keep the
   existing special fence-height formatting and the customer privacy boundary.
7. Remove executable retired stair, siding-removal, slab-demolition, flat-roof-
   insulation and base exterior-painting formulas. Retain historical saved
   values for owner visibility; they cannot become a fallback calculation.
8. Tests and their child processes use temporary price-book storage. Normal
   application data directories must not receive synthetic test price books.
9. Peak surcharge includes explicitly defined roof/flat-roof tear-off labor,
   flooring removal labor and itemized siding-removal/demolition labor. Complete
   removal packages use only their declared labor portion. An absent installed
   labor allocation contributes zero under the existing peak policy. Relabel
   flat-roof tear-off as removal labor. Mixed preparation and separately priced
   disposal retain their existing treatment; do not classify them as labor.

No deployment, merge, other-feature work, or whole-product launch approval is
included in these decisions. No customer-facing unit prices or cost breakdowns
are introduced.

## October 5 amendments (owner-approved; supersede the items above where they differ)

- Peak pricing is an optional seasonal labor surcharge. New owners start with it
  off (no peak months, 0%), so it never blocks quoting. When an owner turns it
  on, it applies to all explicit labor, including roof and flat-roof tear-off,
  flooring removal, and itemized siding-removal, demolition and stair-covering
  removal labor. Complete packages use only their declared labor portion.
  Disposal and mixed preparation are never surcharged.
- Demolition and stair entries may set an optional lower limit ("over X") in
  addition to the maximum, so owners can price thickness and width bands.
  A band covers values above its lower limit up to and including its maximum.
  Bands that share any value are rejected when the owner saves.
- The AI starter suggests prices only. It never writes offering or scope
  definitions, descriptions or inclusions; owners state those in the interview
  or the manual editor.
- The AI interview never collects the baseline-price confirmation or the legacy
  terrain, wall-height or stories settings. New offerings are baseline prices.
- A requested insulation or coverboard layer that the owner has not priced goes
  to review with that reason, and its measured area is still collected.
- Price books are stored in the persistent data folder (APP_DATA_DIR/pricebooks);
  the storage folder is read at each use, never fixed at module load.
