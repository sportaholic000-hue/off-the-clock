# Opus repair expectations - recorded before execution

Source baseline: 4df8b23dab66beba557a018d6e351a4b13febd5c. Synthetic fixtures only.
The October 1 owner rulings supersede prior minimum ordering, fixed fence-height choices and omitted finish-labor access.

1. Roof: 50000 labor +110000 field material +20000 tear-off +15000 underlayment +10000 starter +20000 drip edge +6000 ridge =231000 cents. Confirmed decking adds 8900 cents per sheet internally. A customer may receive the job total and an on-site/per-sheet scope explanation, never the 8900-cent rate.
2. Mulch: 96 sqft *3 inches /324 =8/9 cubic yards. Material is round((8/9)*(115/100)*5000)=5111 cents. Labor is round((8/9)*3000)=2667 cents. Pre-tax subtotal=7778; minimum adjustment=45000-7778=37222. TAX_NONE final=45000. TAX_MATERIALS: round(5111*15/100)=767 tax; final=45767. TAX_ALL: round(45000*15/100)=6750 tax; final=51750. The displayed lower bound cannot reduce these below the owner's 45000-cent pre-tax minimum.
3. Each fence offering defines its own positive height and prices. For 100 measured fence LF excluding two gate openings: installed=100*4000+2*25000=450000. Itemized=100*1000+100*2000+14*(2000+400+600)+2*25000=392000. Heights are exact-match selection facts, not multipliers. Every unoffered height requires review; no interpolation.
4. Mowing prices are per visit, including weekly, biweekly, monthly and one-time visits.
5. TAX_NONE states no tax added; TAX_MATERIALS and TAX_ALL state applicable tax included with the correct scope. No tax rate or private line items are exposed.
6. Missing scope setup stays review-only. Before activation and in the editor, owners must see the relevant requests will be leads until configured. Complete setups remain quotable.
7. Concrete: 20*10=200 sqft; perimeter=60 LF. Waste-adjusted volume=(200*4/324)*(110/100)=220/81 cubic yards. Material=round((220/81)*18000)=48889 cents; formwork=60*2500=150000. Difficult access=1.25. Stamped labor=round(200*600*1.25)+round(200*600*.5*1.25)=150000+75000=225000. Stamped material=200*100=20000; final=443889. Smooth labor=150000+round(200*600*.05*1.25)=157500; final=356389. Easy stamped labor=120000+60000=180000; final=398889. No extra multiplier applies to material/formwork.
8. Browser acceptance: core prices precede optional setup; service navigation and section choice remain usable at 375px; optional settings do not create a default 16000px wall of inputs. Also check 1280px, retain before/after screenshots, and test expanding/editing/saving sections.

These are expected values, not claimed execution results.

## Existing moderate-access rounding control

The first final cold run exposed a legacy test expecting the finish-extra component to omit access. Before its rerun: area 1.01 sqft, labor 101 cents/sqft, moderate access 1.1, smooth extra 0.05. Base: 1.01 × 101 × 1.1 = 112.211 cents → 112. Finish extra: 1.01 × 101 × 0.05 × 1.1 = 5.61055 cents → 6. Independent component rounding therefore yields 118 cents, replacing the superseded 117-cent expectation. No engine change is required.
