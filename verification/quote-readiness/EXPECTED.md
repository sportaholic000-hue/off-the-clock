# Expected values written before execution

B1: 200 measured affected sq ft = 2 roofing squares. Material waste 10% = 2.2 squares.
Labor 2 * $90 = $180. Material 2.2 * $150 = $330. Tear-off 2 * $45 * 1 layer = $90.
Cost subtotal $600; 30% markup = $180. Sell-price underlayment 2 * $20 = $40, without markup.
Before the minimum: $820 plus 15% tax = $943; a 10% range displays $848-$1,038 under the existing whole-dollar outward rounding.
The owner's $2,500 minimum must persist as 250,000 cents. Pre-tax floor $2,500; tax $375; midpoint and lower bound $2,875. Buffered upper bound $3,162.50 rounds outward to $3,163.
No migration guesses the intended value of earlier incorrectly saved roof minima.

M1 interior wall-only: 100 measured wall sq ft * 2 coats * $1 labor + 100 * 2 * $0.50 installed paint = $300 (no markup or tax).
M1 purchased wall paint: labor $200; ceil(100 * 2 * 1.10 / 400) = 1 package at $50; total $250.
M1 clean-bed mulch: 96 sq ft * 3 inches / 324 = 8/9 cubic yard; with 15% waste = 46/45 yard. Material round((46/45)*$50)=$51.11; labor round((46/45)*$30)=$30.67; total $81.78.
The concrete and configured-offering controls retain their previously independently calculated fixture totals; no pricing formula changes are planned.

Fixture correction after the first baseline run, before any formula change: mulch waste applies to purchased material only. Installed labor is round((8/9)*$30)=$26.67, so the unchanged positive-control total is $77.78. The initial $81.78 expectation incorrectly applied material waste to labor; the engine did not.

Further M1 controls, same existing arithmetic: light cleanup 1000 sqft × $0.10 + $50 debris disposal = $150 with no extra haul-away. Sod 1000 sqft × 1.05 material waste × $0.75 + 1000 sqft × $1.25 installation = $2037.50 without ground preparation. Planting: (2×$10 + 1×$20 + 1×$30) labor + (2×$5 + 1×$10 + 1×$15) material = $105, without bed preparation or mulch.

Historical editability control: an old stored 2500.5-cent minimum is displayed exactly as $25.005 and cannot be saved or approved as an exact-cent minimum. No rounding or inferred correction is allowed. When the synthetic owner explicitly enters $2500.50, storage must be 250050 cents; TAX_ALL 15% adds round(37507.5)=37508 cents, for a $2875.58 floor and midpoint.
