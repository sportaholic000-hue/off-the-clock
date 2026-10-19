# Independent geometry repair expectations (before changing the engine)

Source: f4978665167538917732dcd061a18a4099f090d8, unchanged v11. The audit oracle in ../qe-agent1-arithmetic-boundaries-20261019/expected-cases-final.json supplies all 287 independent expectations; it is frozen and will not be regenerated.

AB1: 5:12 has exact factor 13/12. 600.06, 1200.06 and 12000.06 sqft produce 650.065, 1300.065 and 13000.065 sqft. Half-up hundredth rounding gives 650.07, 1300.07 and 13000.07. With the audit's separately extended lines, totals must be 67607, 135207 and 1352007 cents. 2584.62 yields 2800.005 -> 2800.01; ceil(2800.01/400)=8 rolls, so labor 280001 + material 2800 + tear-off 2800 + disposal 2800 + underlayment 120000 = 408401 cents. Adjacent 2584.619999 yields 2800.00 and 7 rolls (393400 cents); 2584.620001 yields 2800.01 and 8 rolls.

AB2: sqrt(100.00000000000001) is strictly above 10. ceil(side/10)=2, giving 2*side ->20.00 LF. Each concrete service must total 12500 cents. sqrt(400.00000000000006) is strictly above 20. ceil(side/10)=3, giving 4*side ->80.00 LF. Each service must total 20000 cents. Exact 100 and 400 remain 0 and 40 LF. No epsilon, decimal truncation or policy change is allowed.

Proof approach: square nonnegative operands. For rational N/D, floor(sqrt(N/D)) equals integer_sqrt(floor(N/D)). Compare N to k^2 D for ceiling and 4N to (2k+1)^2 D for positive half-up rounding. Roof: round(sqrt(footprint^2*(144+rise^2)*10000/144))/100, before partial scope or purchase rounding. Square joints: ceil(sqrt(area/spacing^2)) spans, then round(sqrt(area*(200*(spans-1))^2))/100 LF. These comparisons retain the exact decimal input on either side of each boundary.

Additional coverage will use Python Fraction and 100-digit Decimal only as an independent offline oracle, frozen before running new comparisons. Include pitches 0, 1, 2.5, 3, 6, 7, 9, 12, 16, 35, 100; rational 9:12 factor 5/4 and 16:12 factor 5/3 ties; partial percentages and measured area agreement; package ceilings after waste; both concrete services, rectangles and square allowances. F2 remains unresolved and unchanged.
