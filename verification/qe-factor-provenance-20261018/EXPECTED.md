# Expectations written before the engine comparison

All amounts/rates and counterfactuals are hypothetical synthetic fixtures. Zero tax/markup/minimum/buffer unless named. Neutral factor is a mathematical reference, not a recommendation. No market, profitability or accuracy inference.

Prepared 2026-10-18T06:02:42.654Z. Engine comparisons are a separate command; preparation calls no quote calculator. Compare exact line-item cents, not outward display-range rounding. A changed roll width is a supplier-product counterfactual, not a change to the fixed trim rule.

| Case | Service | Baseline cents | Active cents | Delta cents | Independent working |
|---|---|---:|---:|---:|---|
| roof-legacy-combined | ROOFING_REPLACEMENT | 171000 | 236600 | 65600 | 10 squares: baseline 50000 labor + 20000 removal + 100000 field material + 1000 underlay. Active 50000*1.4*1.2 + 20000*1.4*1.2 + 100000*1.18 +1000. |
| roof-repair-pitch-story | ROOFING_REPAIR | 48000 | 75200 | 27200 | 4h*10000c +8000c; active labor *1.4*1.2, allowance unchanged. |
| flat-roof-access-waste | FLAT_ROOF_REPLACEMENT | 1400000 | 1680000 | 280000 | 1000sf: 500000 labor +200000 removal +700000 material; active labor/removal *1.30; material *1.10. |
| flat-repair-access | FLAT_ROOF_REPAIR | 36000 | 45000 | 9000 | 3h*10000*1.30+6000 vs 3h*10000+6000. |
| interior-height-waste | INTERIOR_PAINTING | 52000 | 63200 | 11200 | 400sf*100c*1.25 +400sf*30c*1.10 vs 400*(100+30). |
| exterior-story-waste | EXTERIOR_PAINTING | 225000 | 265000 | 40000 | 500sf: finish 2*100c, prep100c, primer50c =>175000 labor; material 2*30+20+20 =>50000. Active labor*1.20, materials*1.10. |
| flooring_install-waste | FLOORING_INSTALL | 800000 | 860000 | 60000 | 1000sf*300c labor + 1000sf*500c material; active material *1.12, large-room factor1. |
| flooring_replacement-waste | FLOORING_REPLACEMENT | 800000 | 860000 | 60000 | 1000sf*300c labor + 1000sf*500c material; active material *1.12, large-room factor1. |
| fencing_install-terrain-waste | FENCING_INSTALL | 342000 | 393680 | 51680 | 100LF, 14 posts. Labor100000+14*400=105600; *1.30 active. Material200000*1.10+14*(2000+600). Baseline waste0; selected removal50LF*800 has owner 60% labor share: 40000*(.4+.6*1.30)=47200 active, 40000 neutral. |
| fencing_replacement-terrain-waste | FENCING_REPLACEMENT | 382000 | 440880 | 58880 | 100LF, 14 posts. Labor100000+14*400=105600; *1.30 active. Material200000*1.10+14*(2000+600). Baseline waste0; selected removal50LF*800 has owner 60% labor share: 40000*(.4+.6*1.30)=47200 active, 40000 neutral. |
| concrete_driveway-finish-access-waste | CONCRETE_DRIVEWAY | 648889 | 879778 | 230889 | 400sf: labor240000*1.5*1.25=450000; concrete round(400*4/324*1.10*18000)=97778; forms80*2500=200000; stamp400*300*1.1=132000. Neutral labor240000, concrete88889, forms200000, stamp120000. |
| concrete_patio_slab-finish-access-waste | CONCRETE_PATIO_SLAB | 648889 | 879778 | 230889 | 400sf: labor240000*1.5*1.25=450000; concrete round(400*4/324*1.10*18000)=97778; forms80*2500=200000; stamp400*300*1.1=132000. Neutral labor240000, concrete88889, forms200000, stamp120000. |
| cleanup-slope | LANDSCAPING_CLEANUP | 70000 | 73500 | 3500 | 10000sf*1c*1.35 labor; ceil(10000/2000)*12000=60000 disposal (above10000 minimum). Neutral labor10000. |
| mulch-overage-access | LANDSCAPING_MULCH | 100000 | 119000 | 19000 | 1080*3/324=10yd3: material10*6000*1.15=69000; labor10*4000*1.25=50000; neutral60000+40000. |
| sod-slope-access-waste | LANDSCAPING_SOD | 200000 | 273750 | 73750 | 1000sf: material100000*1.05=105000; labor100000*1.35*1.25=168750. Neutral200000. |
| planting-access | LANDSCAPING_PLANTING | 30000 | 34500 | 4500 | 4 plants: labor4*4500*1.25=22500; allowance4*3000=12000; neutral30000. |
| mowing-no-automatic-factor | LANDSCAPING_MOWING | 5000 | 5000 | 0 | 10000sf*0.5c; owner frequency1 and maintained1. There are no automatic Class2 factors. |
| siding-waste-story | SIDING_REPLACEMENT | 1100000 | 1250000 | 150000 | 1000sf: labor400000*1.2; vinyl material700000*1.10. Neutral1100000. |
| siding-repair-story | SIDING_REPAIR | 50000 | 58000 | 8000 | 4h*10000*1.20 +10000 fixed material vs40000+10000. |
| custom-no-automatic-factor | CUSTOM | 12500 | 12500 | 0 | One fixed synthetic selling price12500; no automatic trade factors. |
| flat-access-isolated | FLAT_ROOF_REPLACEMENT | 1400000 | 1610000 | 210000 | (500000+200000)*(1.30-1)=210000 added labor/removal cents; material700000 unchanged. |
| sod-productivity-isolated | LANDSCAPING_SOD | 200000 | 268750 | 68750 | 100000 labor*(1.35*1.25-1)=68750 added cents; material100000 unchanged. |
| concrete-finish-isolated | CONCRETE_DRIVEWAY | 669778 | 789778 | 120000 | 400sf*600c*(1.50-1)=120000 additional finish labor. Other labor240000/material97778/forms200000/stamp132000 fixed. |
| roof-adopted-complexity | ROOFING_REPLACEMENT | 189000 | 209000 | 20000 | 10*5000 base labor +10*2000 tear-off +10*11800 material+1000 underlay; add50000*(1.4-1)=20000. |
| roof-adopted-upper-pitch | ROOFING_REPLACEMENT | 391000 | 485800 | 94800 | 10sq: labor200000+tear60000+disposal20000+material110000+underlay1000=391000. Compared with the up-to-six pitch band, add200000*.31 +10*(6000+2000)*.41=94800. Zero-adder defect is preserved separately. |
| roof-additional-layer-factor | ROOFING_REPLACEMENT | 551000 | 515000 | -36000 | First-layer base391000; extra2 layers disposal40000; extra tear2*60000*.70=84000 vs120000. Delta -36000. |
| floor-herringbone-labor-isolated | FLOORING_INSTALL | 602000 | 759500 | 157500 | 700*300*1.75 labor367500 vs210000; material700*1.12*500=392000 fixed. |
| floor-diagonal-laminate | FLOORING_INSTALL | 468000 | 465500 | -2500 | 500sf: labor500*300*1.20=180000; material250000*(1+0.08+old .07 or proposed 0.06); underlay500 fixed. |
| floor-diagonal-vinyl_plank | FLOORING_INSTALL | 467500 | 460000 | -7500 | 500sf: labor500*300*1.20=180000; material250000*(1+0.08+old .07 or proposed 0.04); underlay0 fixed. |
| floor-diagonal-hardwood | FLOORING_INSTALL | 473000 | 473000 | 0 | 500sf: labor500*300*1.20=180000; material250000*(1+0.1+old .07 or proposed 0.07); underlay500 fixed. |
| floor-diagonal-tile | FLOORING_INSTALL | 477500 | 467500 | -10000 | 500sf: labor500*300*1.20=180000; material250000*(1+0.12+old .07 or proposed 0.03); underlay0 fixed. |
| floor-owner-base-not-capped | FLOORING_INSTALL | 644000 | 686000 | 42000 | Labor700*300*1.2=252000; proposed .04 adds to owner base .20 =>24% total, not cited12% total. Material434000 vs392000. |
| paint-one-coat-ratio | INTERIOR_PAINTING | 53200 | 57644 | 4444 | Material400*30*1.1=13200. Labor round(400*100*2/1.8)=44444 vs40000. |
| paint-three-coat-ratio | INTERIOR_PAINTING | 159600 | 155155 | -4445 | Material400*3*30*1.1=39600; first labor44444 + additional round(400*2*100*1.6/1.8)=71111 =>115555 vs120000. |
| trim-one-coat-ratio | INTERIOR_PAINTING | 80944 | 91019 | 10075 | Wall57644 fixed; trimmaterial3300; trimlabor round(100*200*2/1.33)=30075 vs20000. |
| carpet-roll-boundary | FLOORING_INSTALL | 98859 | 141984 | 43125 | 144sf labor144*300*1.2=51840, underlay144. At12ft roll: ceil(12.5/12)*12*12.5=300sf*300=90000. At12.5ft roll:156.25sf*300=46875. Difference43125 from whole-roll geometry, not a new default roll width. |
| concrete-order-increment | CONCRETE_PATIO_SLAB | 184444 | 187000 | 2556 | 100sf: labor60000+forms100000; unrounded order100*4/324*1.1=110/81yd =>round(*18000)=24444. Half-yard increment =>1.5yd*18000=27000. |
| concrete-compaction-owner | CONCRETE_PATIO_SLAB | 868333 | 875000 | 6667 | 600sf: base gravel600*4/324*4500=33333 rounded; *1.2=40000. Other lines835000 fixed: labor360000+ready-mix8.5yd*18000=153000+forms250000+grading72000. |
| sod-whole-pallets | LANDSCAPING_SOD | 205000 | 235000 | 30000 | 1000sf*1.05=1050; ceil(1050/450)*450=1350sf at100c vs105000c; labor100000 fixed. |
| floor-whole-cartons | FLOORING_INSTALL | 178000 | 186000 | 8000 | Labor200*300*1.1=66000. Material200*1.12=224sf; ceil(224/30)*30=240sf at500c vs112000. |
| mulch-direct-yards-no-overage | LANDSCAPING_MULCH | 110000 | 110000 | 0 | Stated10yd material60000; labor40000*1.25=50000; stored1.15 deliberately bypassed. |
| planting-retained-overage-unused | LANDSCAPING_PLANTING | 50000 | 50000 | 0 | Plants30000; stated2yd mulch(6000+4000)=20000; saved1.15 unused. |
| sod-owner-topsoil-allowance | LANDSCAPING_SOD | 214259 | 223519 | 9260 | Separate topsoil configuration replaces the legacy prep line; base sod205000. Removal and grading are unpriced/excluded, not silently included. Unknown existing soil uses owner typical import:1000*2/324*3000=18519 vs1in9259. |
| shared-owner-markup-policy | CUSTOM | 12500 | 16250 | 3750 | Synthetic cost12500*(1+.30)=16250, not margin division. Default30 is owner policy; this is not a new owner rate. |
| paint-package-coverage | INTERIOR_PAINTING | 45000 | 50000 | 5000 | 400sf one coat; ceil(400/300)=2 packages at5000 vs ceil(400/400)=1; labor40000. Generic10% measured waste is not added to this explicit package path. |
