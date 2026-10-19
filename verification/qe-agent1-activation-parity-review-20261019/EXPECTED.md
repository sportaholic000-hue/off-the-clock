# Independent expectations — written before execution

Pinned production: c743f6febdf9b758fea87545d2b930731cfb9b70. Synthetic data only.
`cases.mjs` contains handwritten cents and formula explanations, not values computed
by the engine. `run.mjs` persists and hashes the complete expectation manifest
before starting the application. Exact submitted and durable configurations,
requests, responses, receipts and diagnostics are retained per case.

No fees, tax, markup, minimum or range buffer unless explicitly stated. Installed
prices are complete selling prices. Each line rounds separately. Concrete volume
rounds its monetary line, not the volume. Planting stated mulch yards have no
ordering overage (October3 owner decision); mulch derived from area does.

| Service | Base cents | Independent calculation |
|---|---:|---|
| Roof replacement |391000|200000 labor+110000 materials+60000 removal+1000 installed-area underlayment+20000 disposal|
| Roof repair |24000|2h*10000+4000|
| Flat roof replacement |1470000|500000+770000+200000|
| Flat roof repair |36000|3h*10000+6000|
| Interior painting |300000|500sqft*600 installed|
| Exterior painting |300000|500sqft*600 installed, one story|
| Flooring installation |178000|200*300*1.1+200*500*1.12|
| Flooring replacement |178000|same new floor, no removal/preparation|
| Fencing installation |400000|100LF*4000 installed|
| Fencing replacement |400000|same new fence, no old removal|
| Siding replacement |1170000|1000*400+1000*700*1.1|
| Siding repair |25000|2h*10000+5000|
| Concrete driveway |318889|120000+round(200*4/324*1.1*18000)+150000|
| Concrete patio/slab |318889|same measured20x10ft,4in slab|
| Cleanup |15000|1000*10+5000 debris disposal|
| Mulch |21875|2.5*3000+2.5*1.15*5000|
| Sod |203750|1000*125+1000*1.05*75|
| Planting |10500|2small+1medium+1large:7000labor+3500material|
| Mowing |10000|5000*2 weekly, maintained|
| Custom |12500|one fixed selling price|

Every base must remain hidden before explicit approval, then available. Inherited
and explicitly equivalent tiers must both quote the same independently expected
amount. Missing selected SCOPE money requires review without subtotal, while the
unselected base remains available. Missing selected ADDON money retains the base
quote with a safe exclusion. A complete tier must survive an incomplete option.
Selection-level small repairs do not use a large-repair bound; the existing M03
regression nevertheless requires that bound for service activation. This known
gate is recorded, not newly assigned for repair. An explicitly exceeded bound
requires review. A concrete thickness band constrains selected work without
blocking requests inside the band. Installed painting defined coats/conditions
must match; absent optional trim constraints do not create an implied restriction.
No universal treatment of absent, zero, null or malformed money is assumed.

This targets workflow coverage absent from engine-only activation parity tests.
Existing optional-scope/PI00 tests are identified in the final matrix as reused
contract controls, not newly discovered defects. No change to F2 policy.

Corrections and expanded pre-run expectations are recorded in TRIAGE.md; original
run manifests and their failed results are immutable evidence.
