# Receptionist guide source-line diff

Source: `specs/voice_quote_flows.md` at `9c5a3b5` (SHA-256 `f33b7f324fe38443d33a660006b17fc50dea17f9f866f795afcbe8780b18ff1e`). Destination: `server/src/voice/receptionistGuide.md` (SHA-256 `f4fc3c72296d6c0a3e6efcb31a88fb11afa827bc3aaf90b562a40a9ce94c6fa0`). This table lists every source line replaced or removed in original line order. The other 301 source lines are byte-for-byte unchanged; new field inventories, contract questions and global rules are additions. Blank lines and the three major section headers retain their source text.

| Old line | Exact old text | Reason for change or removal |
| ---: | --- | --- |
| 25 | `"- Mirror the caller's units (\"about 60 feet\" → talk in feet;"` | Use the caller’s units only when accepted by the question contract; request its unit instead of converting. |
| 26 | `"  \"maybe 20 meters\" → convert silently, confirm in their unit)."` | Use the caller’s units only when accepted by the question contract; request its unit instead of converting. |
| 38 | `"     caller is invested enough to go look or pace it off."` | Measurement order now calls for a measured value, never pacing. |
| 40 | `"MEASUREMENT COACHING BANK (use when a caller hesitates on any"` | Replace the pacing, guessed-area and rough-range coaching bank with measured-input help and review handoff. |
| 41 | `"size question — coaching is a differentiator, callers love it):"` | Replace the pacing, guessed-area and rough-range coaching bank with measured-input help and review handoff. |
| 42 | `"- Linear feet: \"Quick trick — a big walking step is about"` | Replace the pacing, guessed-area and rough-range coaching bank with measured-input help and review handoff. |
| 43 | `"  three feet. Pace it off and I'll wait, or give me your best"` | Replace the pacing, guessed-area and rough-range coaching bank with measured-input help and review handoff. |
| 44 | `"  guess.\""` | Replace the pacing, guessed-area and rough-range coaching bank with measured-input help and review handoff. |
| 45 | `"- Area: \"No tape measure needed — roughly how many steps long"` | Replace the pacing, guessed-area and rough-range coaching bank with measured-input help and review handoff. |
| 46 | `"  and how many wide? I'll do the math.\""` | Replace the pacing, guessed-area and rough-range coaching bank with measured-input help and review handoff. |
| 47 | `"- \"A rough number's fine — I'll quote a range, and it gets"` | Replace the pacing, guessed-area and rough-range coaching bank with measured-input help and review handoff. |
| 48 | `"  confirmed before any work starts.\""` | Replace the pacing, guessed-area and rough-range coaching bank with measured-input help and review handoff. |
| 51 | `"- Caller can't estimate at all →"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 52 | `"  If the owner allows assumption quotes for this service:"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 53 | `"    \"No problem. Would you call it on the smaller side, about"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 54 | `"    average, or pretty big?\" → small/medium/large path. The"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 55 | `"    quote range widens automatically (engine handles it) —"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 56 | `"    the agent says: \"Since we're estimating the size, I'll"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 57 | `"    give you a slightly wider range, and we tighten it up"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 58 | `"    when we confirm measurements.\""` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 59 | `"  If not allowed: switch to capture — \"That one deserves an"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 60 | `"    exact number. Let me grab your details and the manager will"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 61 | `"    follow up — what's the best number to reach"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 62 | `"    you?\" (Everything already collected goes on the lead"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 63 | `"    card. Never say 'error', 'not configured', 'system'.)"` | Replace size-category assumption and wider-range paths with measured-number review capture. |
| 65 | `"  ask the simplified fallback listed in each flow; if still"` | Use the current question contract for unknown non-size answers; never guess. |
| 66 | `"  unknown, follow the engine's rule for that field (some"` | Use the current question contract for unknown non-size answers; never guess. |
| 67 | `"  assume-with-disclosure, some go to review)."` | Use the current question contract for unknown non-size answers; never guess. |
| 93 | `"  Most folks go [owner's default]. Want me to book you in"` | Remove the owner-default recommendation and samples promise; close by asking to book. |
| 94 | `"  and [owner] can walk you through samples?\""` | Remove the owner-default recommendation and samples promise; close by asking to book. |
| 98 | `"  let's move fast\"), keep the flow moving, and tell them the"` | Report owner notification only after flagUrgent confirms it. |
| 99 | `"  owner is being notified now."` | Report owner notification only after flagUrgent confirms it. |
| 103 | `"  Confirm date/time/address back explicitly. Then:"` | Booking is confirmed verbally with the returned date, time and address; remove the text and written-range promise. |
| 104 | `"  \"Done — you'll get a text confirmation in a minute with"` | Booking is confirmed verbally with the returned date, time and address; remove the text and written-range promise. |
| 105 | `"  your quote range in writing.\""` | Booking is confirmed verbally with the returned date, time and address; remove the text and written-range promise. |
| 114 | `"  If \"just a section\": \"Got it, a partial — roughly what"` | Keep the partial-portion question but remove “roughly”; require a confirmed portion of measured roof area or measured partial area. |
| 115 | `"  portion of the roof, like half, a quarter?\" [partialPercent]"` | Keep the partial-portion question but remove “roughly”; require a confirmed portion of measured roof area or measured partial area. |
| 116 | `"Q1 [roofType]: \"What's on there now — regular asphalt"` | Map the existing-material question to existingRoofType; replacementRoofType is a separate current field. |
| 123 | `"  it, or is it original?\" Still unsure → per engine: this"` | Unknown roof layers go to review, without a one-layer assumption or widened range. |
| 124 | `"  field is required; if truly unknown, capture for review"` | Unknown roof layers go to review, without a one-layer assumption or widened range. |
| 125 | `"  with a note, or proceed at 1 layer ONLY if the owner has"` | Unknown roof layers go to review, without a one-layer assumption or widened range. |
| 126 | `"  enabled assumption quotes (range widens, agent discloses:"` | Unknown roof layers go to review, without a one-layer assumption or widened range. |
| 127 | `"  \"I'll figure one layer — if there's more under there,"` | Unknown roof layers go to review, without a one-layer assumption or widened range. |
| 128 | `"  tear-off cost goes up a bit\")."` | Unknown roof layers go to review, without a one-layer assumption or widened range. |
| 135 | `"Q6 [roofSizeMethod + roofSizeInput] — THE CRITICAL ONE, ask"` | Require measured roof surface area with roof_measured; remove house-area conversion and assumption paths. |
| 136 | `"  exactly this way: \"Do you happen to know the roof size"` | Require measured roof surface area with roof_measured; remove house-area conversion and assumption paths. |
| 137 | `"  itself, or just the square footage of the house?\""` | Require measured roof surface area with roof_measured; remove house-area conversion and assumption paths. |
| 138 | `"  - Knows roof size → roof_measured, take the number."` | Require measured roof surface area with roof_measured; remove house-area conversion and assumption paths. |
| 139 | `"  - Knows house size → home_floor_area, take the number."` | Require measured roof surface area with roof_measured; remove house-area conversion and assumption paths. |
| 140 | `"    (\"Perfect — I can work it out from that, the pitch, and"` | Require measured roof surface area with roof_measured; remove house-area conversion and assumption paths. |
| 141 | `"    the stories.\")"` | Require measured roof surface area with roof_measured; remove house-area conversion and assumption paths. |
| 142 | `"  - Knows neither → coaching bank → assumption path."` | Require measured roof surface area with roof_measured; remove house-area conversion and assumption paths. |
| 144 | `"are the natural Good/Better/Best trade) → decking line if"` | Preserve recap, tiers and booking while removing the spoken decking price-book rate. |
| 145 | `"owner priced it: \"One heads-up — if any wood under the"` | Preserve recap, tiers and booking while removing the spoken decking price-book rate. |
| 146 | `"shingles turns out rotten, that's $X a sheet to replace,"` | Preserve recap, tiers and booking while removing the spoken decking price-book rate. |
| 147 | `"and you'd approve it first.\" → book."` | Preserve recap, tiers and booking while removing the spoken decking price-book rate. |
| 152 | `"  YES → flagUrgent, \"Okay, we'll treat that as urgent —"` | Wait for flagUrgent confirmation before saying the owner was notified. |
| 153 | `"  [owner]'s being notified as we speak. Couple quick"` | Wait for flagUrgent confirmation before saying the owner was notified. |
| 154 | `"  questions so they show up ready.\""` | Wait for flagUrgent confirmation before saying the owner was notified. |
| 163 | `"Q3 [affectedArea]: \"Roughly how big is the damaged area —"` | Use measured affected roof area instead of towel/bed-sheet size categories. |
| 164 | `"  like a patch you'd cover with a bath towel, a bedsheet, or"` | Use measured affected roof area instead of towel/bed-sheet size categories. |
| 165 | `"  bigger?\" → small / medium / large (or exact sqft if given)"` | Use measured affected roof area instead of towel/bed-sheet size categories. |
| 174 | `"  TPO, torch-down, tar and gravel?\" Unsure → \"No worries —"` | Unknown membrane goes to review without average membrane pricing or a price promise. |
| 175 | `"  I'll use average pricing and it gets confirmed on site.\""` | Unknown membrane goes to review without average membrane pricing or a price promise. |
| 176 | `"  (engine discloses 'average membrane' automatically)"` | Unknown membrane goes to review without average membrane pricing or a price promise. |
| 178 | `"  covered over before?\" Unsure → \"I'll figure one — if"` | Require a measured layer count; never assume one layer. |
| 179 | `"  there's more, tear-off adds a bit.\" (engine widens range)"` | Require a measured layer count; never assume one layer. |
| 180 | `"Q3 [roofSqft + sqftMethod]: \"About how many square feet is"` | Require measured flat-roof square footage and the exact method, with no rough geometry or assumption. |
| 181 | `"  it? Rough length times width works.\" → coaching/assumption"` | Require measured flat-roof square footage and the exact method, with no rough geometry or assumption. |
| 193 | `"Q3 [affectedArea]: towel/bedsheet/bigger scale."` | Use measured flat-roof repair area instead of household-object categories. |
| 194 | `"Q4 [membraneType]: as replacement."` | Make the unknown-membrane review handoff explicit for flat-roof repair. |
| 201 | `"Confirm: \"Interior painting — perfect. Which rooms are we"` | Interior paint area must be measured wall area; remove room and floor-area substitutes. |
| 202 | `"  doing?\""` | Interior paint area must be measured wall area; remove room and floor-area substitutes. |
| 203 | `"Q1 [areaInputMethod + roomCount/floorAreaSqft]: from their"` | Interior paint area must be measured wall area; remove room and floor-area substitutes. |
| 204 | `"  answer — \"So that's three rooms. Do you happen to know the"` | Interior paint area must be measured wall area; remove room and floor-area substitutes. |
| 205 | `"  square footage, or should I go off room sizes?\""` | Interior paint area must be measured wall area; remove room and floor-area substitutes. |
| 206 | `"  - Knows floor sqft → sqft path [floorAreaSqft]. (If they"` | Interior paint area must be measured wall area; remove room and floor-area substitutes. |
| 207 | `"    give WALL area unprompted, convert the conversation:"` | Interior paint area must be measured wall area; remove room and floor-area substitutes. |
| 208 | `"    \"Easier one — what's the floor space, roughly?\")"` | Interior paint area must be measured wall area; remove room and floor-area substitutes. |
| 209 | `"  - Rooms path → [roomCount] + optional sizes: \"Are those"` | Interior paint area must be measured wall area; remove room and floor-area substitutes. |
| 210 | `"    smaller rooms like an office, average bedrooms, or big"` | Interior paint area must be measured wall area; remove room and floor-area substitutes. |
| 211 | `"    open spaces?\" (per room if they differ)"` | Interior paint area must be measured wall area; remove room and floor-area substitutes. |
| 219 | `"Q6 [coats]: \"Are you changing colors, or freshening up the"` | Ask the caller for the coat count; do not select two or three coats from color change. |
| 220 | `"  same color?\" Same/similar → \"Two coats covers that — I'll"` | Ask the caller for the coat count; do not select two or three coats from color change. |
| 221 | `"  quote two.\" Dark-to-light or bold change → \"Going over a"` | Ask the caller for the coat count; do not select two or three coats from color change. |
| 222 | `"  dark color usually wants an extra coat — I'll quote three"` | Ask the caller for the coat count; do not select two or three coats from color change. |
| 223 | `"  to be safe.\" (Agent recommends; caller can override.)"` | Ask the caller for the coat count; do not select two or three coats from color change. |
| 224 | `"Recap (\"three average bedrooms, walls and trim, no ceilings,"` | Recap measured wall area and caller-chosen coats rather than estimated room sizes and assumed coats. |
| 225 | `"eight-foot, good shape, two coats\") → quote → book."` | Recap measured wall area and caller-chosen coats rather than estimated room sizes and assumed coats. |
| 232 | `"  → good / fair / poor. If poor: \"Okay — that'll want real"` | Keep the condition question but remove the unreturned primer/prep inclusion claim. |
| 233 | `"  prep and a primer coat, I'll build that in.\" (engine adds"` | Keep the condition question but remove the unreturned primer/prep inclusion claim. |
| 234 | `"  primer + prep automatically)"` | Keep the condition question but remove the unreturned primer/prep inclusion claim. |
| 235 | `"Q3 [coats]: same color-change logic as interior."` | Ask the caller for the exterior coat count rather than reusing inferred color-change coats. |
| 236 | `"Q4 [areaInputMethod + input]: \"Do you know the paintable"` | Use measured exterior wall area, never house-size categories or derived area. |
| 237 | `"  wall area in square feet? Most folks don't — if not, is"` | Use measured exterior wall area, never house-size categories or derived area. |
| 238 | `"  the house small, average, large, or extra large?\""` | Use measured exterior wall area, never house-size categories or derived area. |
| 239 | `"  → sqft path or homesize path (engine maps size × stories)."` | Use measured exterior wall area, never house-size categories or derived area. |
| 256 | `"  (If the caller doesn't know what that means: \"Straight is"` | Follow the current layout contract when uncertain; do not default to straight layout. |
| 257 | `"  standard — I'll quote that.\")"` | Follow the current layout contract when uncertain; do not default to straight layout. |
| 258 | `"Q6 [sqft + sqftMethod] — LAST: \"About how many square feet"` | Require measured flooring square footage and exact method; remove rough per-room math and assumption. |
| 259 | `"  total? Rough length times width per room works — I'll add"` | Require measured flooring square footage and exact method; remove rough per-room math and assumption. |
| 260 | `"  it up.\" → coaching / assumption path."` | Require measured flooring square footage and exact method; remove rough per-room math and assumption. |
| 270 | `"  damage in the floor underneath?\" YES → \"I'll build in a"` | Require measured subfloor repair area and only the returned disclosure, rather than inventing an allowance. |
| 271 | `"  subfloor allowance — the exact condition gets confirmed"` | Require measured subfloor repair area and only the returned disclosure, rather than inventing an allowance. |
| 272 | `"  when it's opened up.\" (engine discloses automatically)"` | Require measured subfloor repair area and only the returned disclosure, rather than inventing an allowance. |
| 278 | `"Q2 [fenceHeight]: \"How tall — four foot, six, or eight?\""` | Ask fence height openly in feet and inches without a four/six/eight-foot menu. |
| 280 | `"Q4 [cornerCount]: \"And how many corners does the fence line"` | cornerCount is absent from the current fence contract; remove its question and post-count explanation. |
| 281 | `"  turn? Picture walking it — every time you'd change"` | cornerCount is absent from the current fence contract; remove its question and post-count explanation. |
| 282 | `"  direction.\" (Every corner is a post; every gate is two —"` | cornerCount is absent from the current fence contract; remove its question and post-count explanation. |
| 283 | `"  this question is why our post counts are right.)"` | cornerCount is absent from the current fence contract; remove its question and post-count explanation. |
| 286 | `"Q6 [linearFeet + lfMethod] — LAST: \"About how many feet of"` | Require measured fence length and exact method, without pacing or an assumption path. |
| 287 | `"  fence line total?\" → pacing coach (\"big step is about"` | Require measured fence length and exact method, without pacing or an assumption path. |
| 288 | `"  three feet — pace it and I'll wait\") → assumption path."` | Require measured fence length and exact method, without pacing or an assumption path. |
| 301 | `"Q2 [dimensionMethod + length/width] — ask dimensions, not"` | Concrete needs measured length and width, or measured area plus perimeter; never assume standard width. |
| 302 | `"  area: \"Roughly how long and how wide? Driveways are"` | Concrete needs measured length and width, or measured area plus perimeter; never assume standard width. |
| 303 | `"  usually ten to twelve feet a car-width.\" (Length × width"` | Concrete needs measured length and width, or measured area plus perimeter; never assume standard width. |
| 304 | `"  matters — never let this collapse to 'about X square"` | Concrete needs measured length and width, or measured area plus perimeter; never assume standard width. |
| 305 | `"  feet' without asking width; if they only know area, take"` | Concrete needs measured length and width, or measured area plus perimeter; never assume standard width. |
| 306 | `"  it [areaSqft] and the engine assumes standard width.)"` | Concrete needs measured length and width, or measured area plus perimeter; never assume standard width. |
| 324 | `"Same flow, patio phrasing. Q2: \"About how long and wide?"` | Patio needs measured dimensions or area plus perimeter, not patio-size categories. |
| 325 | `"Or if it's easier — small patio, average, or big"` | Patio needs measured dimensions or area plus perimeter, not patio-size categories. |
| 326 | `"entertaining space?\" Q1 demolition becomes optional"` | Patio needs measured dimensions or area plus perimeter, not patio-size categories. |
| 334 | `"Q2 [yardSize]: \"Is it a small yard, average, or big"` | yardSize is retired; require measured cleanup square footage and exact method. |
| 335 | `"  property? Square footage if you know it.\""` | yardSize is retired; require measured cleanup square footage and exact method. |
| 347 | `"Q3 [inputMethod + mulchArea + mulchDepth]: \"Do you know how"` | Mulch quantity must be measured cubic yards or measured bed area with caller-chosen depth, never usual/ballpark size or a chosen depth. |
| 348 | `"  many yards you usually take, or should we go off bed"` | Mulch quantity must be measured cubic yards or measured bed area with caller-chosen depth, never usual/ballpark size or a chosen depth. |
| 349 | `"  size?\" Yards → take it. Beds → \"Roughly how long and wide"` | Mulch quantity must be measured cubic yards or measured bed area with caller-chosen depth, never usual/ballpark size or a chosen depth. |
| 350 | `"  is each bed? Ballpark's fine.\" Depth: \"Fresh beds usually"` | Mulch quantity must be measured cubic yards or measured bed area with caller-chosen depth, never usual/ballpark size or a chosen depth. |
| 351 | `"  get two to three inches — going over old mulch, two is"` | Mulch quantity must be measured cubic yards or measured bed area with caller-chosen depth, never usual/ballpark size or a chosen depth. |
| 352 | `"  plenty. I'll figure [X].\""` | Mulch quantity must be measured cubic yards or measured bed area with caller-chosen depth, never usual/ballpark size or a chosen depth. |
| 353 | `"Q4 [edgingNeeded + edgeLF]: \"Want the bed edges re-cut"` | Separate edging choice from measured edge length; require measured prep area instead of deriving it from bed size. |
| 354 | `"  nice and crisp? ... Roughly how many feet of edge is"` | Separate edging choice from measured edge length; require measured prep area instead of deriving it from bed size. |
| 355 | `"  that — beds are usually long and skinny, so it adds up.\""` | Separate edging choice from measured edge length; require measured prep area instead of deriving it from bed size. |
| 356 | `"  Unsure → engine estimates from bed size and widens range."` | Separate edging choice from measured edge length; require measured prep area instead of deriving it from bed size. |
| 357 | `"  (If yards-path AND beds need prep → [bedSqft]: \"About how"` | Separate edging choice from measured edge length; require measured prep area instead of deriving it from bed size. |
| 358 | `"  much bed area is that, size-wise?\")"` | Separate edging choice from measured edge length; require measured prep area instead of deriving it from bed size. |
| 369 | `"Q4 [sodSqft + sqftMethod] — LAST: \"Roughly how many square"` | Require measured sod square footage; remove steps and agent geometry. |
| 370 | `"  feet? Steps long times steps wide — I'll do the math.\""` | Require measured sod square footage; remove steps and agent geometry. |
| 375 | `"Q1 [plantCount + plantSize]: \"About how many plants, and"` | Map confirmed planting counts by size to plantsBySize, replacing retired plantCount and plantSize fields. |
| 377 | `"  medium shrubs, or big stuff like trees?\" (mixed is fine)"` | Clarify that each plant-size count is confirmed while retaining the spoken size examples. |
| 380 | `"  About how big an area is that?\""` | Require measured bed preparation area instead of an approximate size. |
| 383 | `"  kind, and do you know how many yards — or I can figure"` | Ask for measured mulch yards; never infer it from bed size. |
| 384 | `"  it from the bed size.\""` | Ask for measured mulch yards; never infer it from bed size. |
| 394 | `"Q3 [yardSqft + sqftMethod]: \"Small city lot, average yard,"` | Require measured mowing square footage rather than property-size categories. |
| 395 | `"  big yard, or half-acre plus? Square footage if you know"` | Require measured mowing square footage rather than property-size categories. |
| 396 | `"  it.\""` | Require measured mowing square footage rather than property-size categories. |
| 411 | `"Q4 [trimIncluded (+trimLF optional)]: \"Are we wrapping the"` | Use current trimLengthLF and a measured trim length when included; remove wall-size inference. |
| 412 | `"  trim too — windows, doors, fascia? ... If you happen to"` | Use current trimLengthLF and a measured trim length when included; remove wall-size inference. |
| 413 | `"  know the footage great, otherwise I'll estimate it from"` | Use current trimLengthLF and a measured trim length when included; remove wall-size inference. |
| 414 | `"  the wall size and it gets confirmed on site.\""` | Use current trimLengthLF and a measured trim length when included; remove wall-size inference. |
| 415 | `"Q5 [areaInputMethod + input] — LAST: \"Do you know the wall"` | Use measured siding wall area and sqft method instead of house-size estimates. |
| 416 | `"  area in square feet? If not — small house, average,"` | Use measured siding wall area and sqft method instead of house-size estimates. |
| 417 | `"  large, or extra large?\" (engine maps size × stories)"` | Use measured siding wall area and sqft method instead of house-size estimates. |
| 424 | `"Q3 [affectedArea]: \"How big is the damage — doormat size, a"` | Require measured siding repair area instead of doormat/plywood comparisons. |
| 425 | `"  sheet of plywood, or bigger?\""` | Require measured siding repair area instead of doormat/plywood comparisons. |
| 436 | `"  per_hour: \"Is that more of an hour-or-two job, a half"` | Ask for confirmed hours; remove time-bucket estimates. |
| 437 | `"    day, a full day, or a couple of days?\""` | Ask for confirmed hours; remove time-bucket estimates. |
| 438 | `"  per_unit: \"About how many are we talking?\" (\"a few\" →"` | Ask for a confirmed itemCount; remove vague count ranges. |
| 439 | `"    \"like two or three, or more like five to ten?\")"` | Ask for a confirmed itemCount; remove vague count ranges. |
| 440 | `"  per_sqft / per_LF: coaching bank → exact or"` | Ask for measured quantity in the configured custom-service unit, without size categories or assumption gates. |
| 441 | `"    small/medium/large (assumption gate applies)."` | Ask for measured quantity in the configured custom-service unit, without size categories or assumption gates. |

## Claude follow-up edits (on top of e59f915)

Guide SHA-256 now `aaa2446b7ed63d80e00b27096b82b1c534283d5b29aec8852cee5106b0fceb8b`. Wording that still contradicted owner rulings:

| Was | Now | Reason |
| --- | --- | --- |
| "So that's about one-fifty … one gate, four corners." | "So that's one-fifty … one gate." | Measurements are confirmed, not "about"; corners are no longer asked. |
| "you're looking at roughly $X to $Y" | "you're looking at $X to $Y" | Amounts come only from the tool result. |
| "NEVER apologize for a range ("it's a range because we haven't measured yet — the on-site number is exact")" | "NEVER apologize for a range or explain it away; the confirmed-in-person line already covers it." | Quotes now require measurements; no exactness promise. |
| "the inspection finds it, then you get an exact price" | "the inspection finds it, then [owner] can price it" | No exact-price promise. |
| "about how many steps?" / "About how many plants" | "how many steps?" / "How many plants" | Counts are confirmed, not estimated. |
| "that doesn't include baseboards" | "that doesn't include [skipped item]" | Baseboard add-on no longer exists. |
| "[baseNeeded] — confirm, default yes: "We'll include the compacted gravel base … Sound good?"" | "[baseNeeded] — ask; never assume the answer: "Do you want the compacted gravel base under it? That's standard so it doesn't crack."" | Never assume a caller's answer. |
| "the manager will follow up" | "[owner] will follow up" | [owner] maps to the saved review contact. |
