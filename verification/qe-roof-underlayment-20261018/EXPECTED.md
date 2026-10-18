# Independently fixed expectations, before execution

Base: 550728daea4058c37f13952ab78785929bab39b0. Synthetic data only.

1500 × sqrt(1 + (12/12)^2) = 2121.320343…; the approved roof
conversion rounds this to 2121.32 square feet before selecting a percentage.

- Full: ceil(2121.32 × 1.10 / 500) = 5 rolls; 5 × 15000 = 75000 cents.
- 50%: selected 1060.66; ceil(1060.66 × 1.10 / 500) = 3; 45000 cents.
- Explicit partial area 800: ceil(800 × 1.10 / 500) = 2; 30000 cents.
  Explicit area is already surface area and is not converted. At the isolated
  scope boundary it takes precedence over a supplied percentage; the existing
  request contract continues to reject contradictory area/percentage pairs.
- Equivalent measured surface 2121.32 has the same full/half quantities and prices.
- Legacy measured 1500: full 4 rolls / 60000 cents; half 2 / 30000 cents.
- Package boundary at 12/12: footprint 707.105 rounds to 1000.00 surface,
  while 707.111 rounds to 1000.01. At 10% waste, 550 sqft/roll: 2 / 30000
  versus 3 / 45000 cents. Surface rounding precedes package rounding.
- Installed-area underlayment at 1500 cents/roofing square: full
  round(21.2132 × 1500) = 31820 cents; half 15910. No package waste applies.
- Package cost with 20% markup and materials-only 10% tax: 75000 cost becomes
  90000 selling cents, with 9000 tax attributable to this material. No double waste.
- A declared included-zero scope stays zero; an unexplained zero still reviews.

The synthetic roof uses labor 10000/square, field material 10000/square,
tear-off 1000/square, simple waste 10%, 31% installation and 41% removal
pitch additions. Full expected lines are 212132 + 65761 + 233345 + 21213
+ 8697 + 75000 = 616148 cents. The v7 defect instead totals 601148 cents.
Half expected lines are 106066 + 32880 + 116673 + 10607 + 4349 + 45000
= 315575 cents; defective v7 is 300575 cents.

The version becomes quote-engine-vnext-accuracy-20261018-v8. A genuine saved
v7 book must refuse new customer quotes until explicit approval; owner values
must stay unchanged. A v7 persisted request retry must retain its original
response, amount and version before and after reapproval. New widget-route and
voice-tool quotes must agree, including the existing on-site disclosure.
