# Independent arithmetic expectations, before engine comparisons

Source: abc2becff9cd252a63ff30258e9950a07af2c020. Synthetic prices only.
No engine result, production exact-math helper or calculated receipt is used to
construct the expected amounts. `prepare-expectations.py` uses Python Fraction
and 80-digit Decimal square roots. Inputs are decimal strings until serialized.
Each positive half cent rounds up. Sum separately rounded lines; do not round
one combined unrounded job. Quantity ceilings occur before monetary extension.

Authorities read: AGENTS.md; specs/BUILD_STATUS.md; quote_engine_v2.md (October 1
minimum/access rules and per-line formulas); QUOTE_TRADE_DECISIONS_20261003.md;
QUOTE_AUDIT_DECISIONS_20261004.md; QUOTE_LAUNCH_DECISIONS_20261005.md. Later
approved behavior is recorded in the October 16–18 verification reports:
separate coat lines, flooring room labor floor, package increments, rectangular
and square-equivalent control joints, installed labor adjustments, roof surface
rounding to .01 sqft. This audit does not reinterpret those decisions.

Hand calculations anchoring the generated matrix:

- Two flooring lines, each 1 sqft at 100.49 / 100.50 / 100.51 cents, no waste or
  adjustment: totals **200 / 202 / 202**, not 201 for the two half-cent lines.
- 19.9999 / 20 / 20.0001 sqft, 20-sqft cartons, no waste: **1 / 1 / 2 cartons**.
  At 123.45 cents/sqft, material is **2469 / 2469 / 4938** cents.
- Flooring labor uses the existing monotonic boundary floor. At 150 sqft,
  100 cents/sqft and small factor1.2: **18000**; immediately above150 retains
  that labor floor until the medium calculation exceeds it. Material is separate.
- Concrete 1x1ft, 4in, zero waste, labor1.5c/sqft, broom factor1.5: base1.5->2,
  finish0.75->1, combined labor **3**, not round(2.25)=2. Concrete4c and
  formwork400c give **407 cents**. Access applies to both labor components.
- Concrete area80.9999 / 81 / 81.0001 sqft, 4in, zero waste, 1yd increment:
  **1 / 1 / 2 ordered yd**. Material at18000c/yd is18000 /18000 /36000.
  Supplier short-load deficit is threshold minus ordered yards, never raw yards.
- Rectangular saw cuts at9.9999 /10 /10.0001ft by10ft, spacing10ft:
  **0 /0 /10 LF**. For square-equivalent areas just below100, exactly100,
  and just above100 sqft: **0 /0 /20.00 LF** after the documented .01-LF
  quantity rounding. A square root just above10 must cross the span ceiling.
- Topsoil324sqft, target4in, existing3.9999 /4 /4.0001in: import
  **.0001 /0 /0 yd**. At5000c/yd the first is0.5c -> **1c**.
- Mulch108sqft x3in /324 =1yd; 1.15 overage and .25yd increment ->1.25yd.
  Labor uses1yd; material uses1.25yd. Caller-stated volume gets no second overage.
- Cleanup area1999.9999 /2000 /2000.0001sqft at2000sqft/load:
  **1 /1 /2 loads**. Disposal remains max(owner flat minimum, loads x load rate).
- Fence spans7.9999 /8 /8.0001ft at8ft spacing, one open run: **2 /2 /3 posts**.
  No gate openings are invented. Height6ft1in / priced6ft =73/72 exactly.
- Carpet square11.4999 /11.5 /11.5001ft with12ft roll: after0.5ft trim,
  **1 /1 /2 pieces** in either direction; purchase144 /144 /288.0024sqft
  (the first exact purchase is143.9988). Connected directions remain shared.
- Additional-coat ratio .5 converts two-coat basis with first factor4/3,
  additional factor2/3. At1sqft and legacy rate1.125c, two coats charge
  **2+1=3c** labor. This is authorized separate-line rounding.
- Repair first10sqft at25000c, extra100.5c/sqft: area9.9999 /10 /10.0001
  stays25000c; extra area.004974 / .004975124378109453 / .004976 exercises
  the separate extended-charge neighborhood; the Fraction oracle decides each.
- Repair old size bands remain <50 / <=200 for pitched roof and <20 / <=80
  for flat roof/siding. No repair price or band policy is changed.
- Roof footprint120.06sqft at5:12: slope13/12 exactly, surface130.065 rounds
  **130.07sqft**. This is a quantity-rounding test, distinct from factor-minus-one.
- Mowing labor100.5c ->101; 10% bagging on rounded labor ->10c. Seasonal10%
  also uses rounded labor ->10c; no seasonal charge on disposal. Combined121c
  before markup. A20% cost markup ->24c; pre-tax145c. A200c minimum then
  TAX_ALL10% yields220c; TAX_MATERIALS with disposal taxable yields201c
  (disposal10 + taxable markup2 -> tax1). Exact matrix also varies margin.
- Regular100.05 dollars + installed100.05 dollars,10% seasonal:2001c combined,
  split1001c regular and1000c installed. Never apply a second markup to the
  installed price or its seasonal part. Missing installed labor shares stay0.
- Custom10001c,33.33% materials: exact materials3333.3333c, labor6667.6667c.
  Rounded display portions3333/6668 still sum10001. Materials tax and seasonal
  labor use their exact respective shares, each charge rounded once.

Existing regressions already cover coarse package behavior, repair bands,
roof factor subtraction and9-cent control, split seasonal rounding, minimum
ordering, room floors, footprint underlayment conversion and zero-price policy.
Any mismatch must be checked against these before being called new. F2 remains
an already documented unresolved owner decision and is excluded from this audit.
