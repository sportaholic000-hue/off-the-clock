# October 3 owner decisions — implementation ledger

Source: `claude/quote-engine-readme-20261002`, commit `c714b6eb6bbe8deed8ccac83df03a52f811019ce`.
This is an explicit amendment to the earlier quote specification. The owner's October 3 instructions govern seasonal quote-date pricing, derived fence posts, condition-based painting preparation, material waste, labor adjustments, installed-price material tax shares, measured concrete area/perimeter, caller-stated mulch yards, and minimum-price display. Other arithmetic remains unchanged.

Expectations recorded before implementation (money below in cents):

* Asphalt control: 20 squares × 8500 × 1.15 labor = 195500; 22 squares × 12000 materials = 264000; 20 × 4500 × 1.15 removal = 103500; 20 × 1800 underlayment = 36000. Total **599000**. Confirmed the existing pitch adjustment also applies to tear-off.
* Tile control: 200 × 300 × 1.10 labor + 200 × 1.12 × 500 material = **178000**. Pattern: labor 79200 + material 119000 = **198200**.
* Fence: 100 ft / 8 ft rounded up = 13; plus end 1, corners 2, one gate excluding posts 2 = **18 posts**. At fixture rates labor 100000, infill 220000 after 10% waste, posts 36000, footing labor 7200, footing material 10800, one gate 25000 => **399000**. Moderate terrain affects labor 107200 × 1.15 = 123280, total **415080**.
* Flat roof: 1000 × 500 labor + 1100 × 700 membrane + 1000 × 200 tear-off = **1470000**.
* Flat repair: 3 hours × 10000 × 1.15 access + 6000 fixed material allowance = **40500**; no waste on the allowance.
* Concrete 200 sqft, 60 LF perimeter, 4 inches: labor 120000 + concrete round(200 × 4 / 324 × 1.10 × 18000) 48889 + formwork 150000 + base prep 35000 = **353889**, equal to the 20 × 10 rectangular control. Rebar at 200/sqft adds 220 × 200 = **44000**.
* Mulch 10 caller-stated yards at 5000 material + 2000 labor = **70000**. Calculated 1080 sqft at 3 inches gives 10 yards, order 11.5: **77500**. Moderate access multiplies labor only by 1.10: **72000** direct / **79500** derived.
* Installed price 100000, explicit 40% material share, 8% materials-only tax => **103200**. Tax-all => **108000**; no tax => **100000**. Missing shares require owner review in materials-only mode, never a guessed split.
* Minimum 25001 with 10% tax-all: rounded tax 2500 => **27501**, all displayed endpoints **275.01** regardless of range buffer. Above-minimum rounding is unchanged.
* Local time: 2026-04-01T00:30Z is March in America/Los_Angeles and April in Asia/Tokyo. March peak labor surcharge applies only to the former. A requested July job cannot change the quote-date month.

New tests and the final report will record additional changed-line calculations and any discrepancy in the supplied controls. No claim of complete verification is made by this ledger.

Installed bundle test fixtures explicitly allocate 60% labor and 40% materials. This allocation is fixture data, not a production default. Therefore the fence moderate-terrain example also adjusts gate labor: 25000 × 60% × 15% = 2250, total **417330**. When gate posts are included, remove 4000 post material + 920 footing labor + 1200 footing material: **411210**. Painting trim at 20000 has 12000 labor; high walls add 1200 on that trim. Painting totals: walls 500 sqft and ceilings 200 sqft, two finish coats, one primer coat, fair prep over 700 sqft: **328700**. High walls with the stated trim labor share: **353400**. One finish coat: **240700**; three: **416700**. Poor prep at labor200/material40 per sqft instead of100/20 adds **85400**, giving **502100**.

Changed legacy fixture expectations: roof accessory lines add 10% of 36000 =3600. Flat-roof base adds 1000×700×10%=70000; a half-roof adds35000. Installed and itemized commercial-insulation totals become1690000 because only the base membrane changes. Purchased-paint preparation now covers700sqft, adding58000 labor and12000 purchased prep material:299000. With20% cost markup and10% materials tax this becomes279000×1.2+20000+44000×1.2×.1+20000×40%×.1=360880. Stamped material200sqft×100×10% adds2000. Standard measured wall painting adds10000×10%=1000. Fractional infill100ft×0.5×1.1=55 cents. Binding roof minimum remains287500 at every endpoint.

Additional independent checks: T15 roof base410 + starter1100 + drip2200 +ridge3300 +two sheets800 =7810; overridden0/20/30% accessory waste gives8510. T16 wire adds33000 to353889; stamped labor180000 +concrete48889 +formwork150000 +prep35000 +stamped material66000 =479889. T17 two small plants plus two caller-stated mulch yards:6000labor+11000material=17000; moderate access17600. T18 installed lines unrounded0.5 and1.5 cents round to1and2; combined50%material allocation is1 cent;100%tax adds1=>4 cents. T19 hardwood base176000+installed underlay20000+10%tax on40%of20000=196800. T22 painting labor subtotal247000 includes explicit preparation labor70000 and trim labor12000;10%season adds24700=>353400.
