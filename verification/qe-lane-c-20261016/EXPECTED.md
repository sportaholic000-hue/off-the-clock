# Lane C expectations written before execution

Base: 92a5510a31381cf308c3262b5a07bd2094c38aad. No spec changes.

Correction: the original compatibility numbers at the end came from stale
fixture comments. See EXPECTED-correction.md and the independently summed,
detached baseline controls for their replacement. Original failed tests remain.

Owner clarification in this chat: **Round each line** takes priority for rare
sub-cent edge cases. The exact conversion is retained, and each extended coat
line is rounded once. Do not add a reconciliation fee. This can differ by one
cent from one old combined labor line (for example 1 sqft at 0.25 cents/coat:
old two-coat line rounds 0.5 to 1; split ratio 1 rounds 0.25 + 0.25 to 0).

- 400 sqft × 100 cents/coat: blank ratio gives labor 40,000 / 80,000 / 120,000
  cents for 1 / 2 / 3 coats. Ratio 0.8 gives exact first rate 1000/9 cents and
  additional 800/9 cents: first line 44,444; additional lines 35,556 for one
  additional coat or 71,111 for two. Totals 44,444 / 80,000 / 115,555.
- Itemized poor walls: 1,000 sqft × 120 cents prep = 120,000 cents, not 168,000.
  Good ceiling 400 sqft × 60 cents × 1 coat = 24,000 cents, not 48,000. Its
  preparation uses only the independently selected good-condition rate.
- 12 × 12 × 8 room, 1 door, 2 windows: gross/labor 384 sqft; net paint
  384 - 20 - 30 = 334 sqft; ceiling 144 sqft. Two coats at 100 labor and
  30 material cents, 10% paint waste: labor 76,800 + materials 22,044 = 98,844.
- 140-foot house perimeter × 10-foot walls + two 30 × 8 / 2 gables = 1,640 sqft.
  Ten windows, two doors, one 16 × 7 garage: normal openings 150 + 40, garage
  112. Paint labor 1,528 sqft; paint material 1,338 sqft. Siding left-in basis:
  1,640 - 112/2 = 1,584 sqft. Subtracted basis: 1,338 sqft.
- Siding at 100 cents labor + 100 cents material, 10% vinyl waste: left-in
  total 158,400 + 174,240 = 332,640; subtracted 133,800 + 147,180 = 280,980.
- 4 door sides × 11,500 cents = 46,000 cents. 140 LF fascia × 800 cents =
  112,000 cents. Requested unpriced items leave these counts in the submission,
  quote the priced remainder and explicitly exclude the extra work.
- Height bands 8/10/20 feet: two 10 × 10 rooms at 8 and 10 feet have wall areas
  320/400 and ceilings 100/100. One coat at 100 cents wall labor with factors
  1/1.1 = 76,000; one coat of ceiling labor at 60 cents = 12,600. Trim is not
  height-adjusted. Equal upper boundaries belong to their stated band.
- Installed wall 600 cents/sqft, ceiling 300 cents/sqft, 60% labor share: those
  same rooms give walls 192,000 + 254,400 = 446,400, ceilings 30,000 + 31,800 =
  61,800. Only the labor portion receives the height adjustment.
- Negative/nonfinite counts, dimensions or ratios, missing measurements,
  inconsistent opening counts, overlapping dimension/direct inputs, openings
  larger than gross area, invalid units and height bands cannot produce a quote.
  A caller's confirmed approximate number alone is never a refusal reason.
- No ratio, height bands or optional rates appear by default. New owner values
  survive save/read/approval; changed values invalidate existing approval.
- Existing no-new-input controls retain baseline cents: basic walls 106,400;
  itemized interior 252,400; itemized exterior 179,400; siding 1,170,000.
- Phone and widget obtain the same field names and surface-specific questions.
  Phone returns the existing exact on-site line for caller-estimated dimensions.
  No owner rates/ratios enter voice question contracts or compiled instructions.

Follow-up expectations written before their execution:

- The authorized method choices are interior `[wall_sqft, room_dimensions]`,
  exterior `[wall_sqft, building_dimensions]`, and siding `[sqft, building_dimensions]`.
  Existing tests asserting a single method must be updated to these exact lists.
  Old floor_sqft/rooms/homesize categories still return inspection-first review.
- Voice-only tests use the repository's `voice…` filename prefix and remain
  excluded from the dedicated quote selection. The complete suite includes them.
- Large openings in rooms with different owner height bands must be attached
  to their actual room, never spread across rooms by an invented allocation.
  Two 10×10 rooms, heights8/10, each one coat at100c: first-room opening120sqft
  leaves labor200sqft and second-room labor400sqft×1.1: wall labor64000c.
  Net paint is600sqft; ceiling area remains200sqft. A global unassigned opening
  with differing room height bands requires the caller to place it in a room.
  Openings100sqft or smaller remain in labor but are removed from net paint.
- Direct wall area remains compatible without opening inputs. If the caller adds
  one door and two windows to400sqft of pre-opening wall area, wall labor stays
  400×2×100=80000c; net paint350×2×30×1.1=23100c, total103100c.
- Explicit good-trim preparation is not ignored:100LF×20c labor=2000c and
  100LF×10c material×1.1=1100c, without a height factor.
- Cost-based fair-trim preparation uses its explicit package product:
  100LF×1.1/100 =>2packages×1000c=2000c; the replaced area-rate material line
  must not also be charged. Preparation labor100LF×20c=2000c.
- Nested opening controls:12×12×8 room,1door/2windows, plus an independently
  named120sqft opening =>264sqft labor and214sqft net paint; two-coat quote
  52800+14124=66924c. The original no-large-opening room stays98844c.
- Basic explicit trim component prices are active alternatives to the retained
  legacy trim prices:400LF,3coats,labor100c with r.8 =>44444+71111c;
  material30c×400×3×1.1=39600c. Old trim rates need not also be present.
- Room summary text displays nested opening labels and numbers (“Opening area
  120 square feet”), omits absent optional rows, and shows no raw areaSqft keys
  or literal null units. This is presentation only; signed raw inputs stay intact.
- Fully open direct wall paint quantity:40sqft,2ordinarydoors,2coats at100c
  labor =>8000c. Net paint0 means0purchased packages, without blocking labor.
- Preserve exact derived quantities into preparation: for a room with all three
  dimensions1.23456789ft, wall area=4×1.23456789²=6.0966315000762084sqft.
  At1000000000000002c per sqft (synthetic precision boundary), preparation is
  6096631500076220.5932630001524168c, rounding once to6096631500076221c.
  Converting the derived area to a binary Number before multiplication loses a
  cent in this bounded-safe-integer case; pricing must retain its rational form.
