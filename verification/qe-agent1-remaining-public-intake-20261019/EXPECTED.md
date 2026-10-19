# Independent expectations before execution

Base: `1f8b1a20e1b910c7787a05dd820814894b01a961`. Synthetic disposable data only. A3's existing eight-service Chromium suite and all its assertions remain unchanged. This review adds the other twelve services, using the existing A3 owner/input fixtures. No production, pricing policy, versions, approvals, selectors or workflow changes.

All amounts below are integer cents. Each line rounds half up independently, then lines sum. No markup, tax, seasonal charge, fees or minimum applies in these fixtures. The owner save uses CUSTOM's zero-buffer business defaults, as A3's representative harness does. Source fixture functions supply prices and inputs only; expected amounts do not call the quote engine.

| Service | Base hand calculation | Base cents | Correction | Corrected cents |
|---|---|---:|---|---:|
| ROOFING_REPLACEMENT | 50,000 installation +110,000 material +20,000 removal +15,000 installed-area underlayment +11,000 starter +22,000 drip +6,600 ridge +10,000 decking |244600|1,000.5 sqft: 50,025 +110,055 +20,010 +15,008 +unchanged 49,600 accessories/decking|244698|
| FLAT_ROOF_REPLACEMENT | 1,000×500×1.15 +1,000×700×1.1 +1,000×2×200×1.15 |1805000|1,000.5 sqft: 575,288 +770,385 +460,230|1805903|
| INTERIOR_PAINTING | 500×600 installed wall price |300000|500.5 sqft×600|300300|
| EXTERIOR_PAINTING | 500×600 +60% labor portion×10% second-story adjustment |318000|500.5×600 +18,018 story adjustment|318318|
| FLOORING_INSTALL | max(300,149×1.2,299×1.1)×300 +300×1.08×500; retain the approved monotonic room labor floor |260670|300.5 sqft: same 98,670 labor floor +162,270 material|260940|
| FENCING_REPLACEMENT | 100×4,000 installed +2×25,000 gates +50×800 removal |490000|100.5 LF: 402,000 +50,000 +40,000|492000|
| SIDING_REPLACEMENT | 1,000×400 +1,000×1.1×700 |1170000|1,000.5 sqft: 400,200 +770,385|1170585|
| SIDING_REPAIR | 4 hours×10,000×1.1 +10,000 material allowance |54000|50.25 sqft stays in the same medium band|54000|
| CONCRETE_PATIO_SLAB | 200×600 labor +round(200×4/12/27×1.1×18,000)=48,889 concrete +60×2,500 forms +200×175 prep |353889|20.5×10ft: 123,000 +50,111 +152,500 +35,875|361486|
| LANDSCAPING_CLEANUP | 1,000×10×2 +15,000 disposal +5,000 hauling |40000|Hauling explicitly off: subtract 5,000|35000|
| LANDSCAPING_SOD | 1,000×1.05×75 +1,000×125 +1,000×50 prep |253750|Ground preparation explicitly off: subtract 50,000|203750|
| CUSTOM | Fixed confirmed flat service, quantity one, 12,500 |12500|Correct an explicit No service confirmation to Yes; price unchanged|12500|

For every service: actual authenticated save, explicit starting-value/dependent confirmation and approval must expose the service in the public catalog. Render production CustomerQuote in real Chromium at the real application origin. Only the mounting HTML is provided by the harness; public catalog/prepare/final requests are not mocked.

Prepare creates no durable quote/lead/receipt rows. Valid final submission must persist the exact submitted scope and original body, return a customer-safe result, and match the independently expected cents in the saved calculation record and customer display. An invalid/unknown required value must require details; changing it back through the rendered form must permit quoting. Editable cached drafts must discard stale confirmation/review/clarification state.

For the eleven non-custom corrections, obtain a genuine proof for the original scope and send a changed-scope body with that same proof: expect HTTP409 and no durable rows. For CUSTOM, use the genuine valid proof with serviceConfirmed=false: also HTTP409. Fresh valid preparation and final submission use the newly returned proof.

Replay each original successful final body after correction: HTTP200, byte-identical customer result, original submitted scope and saved calculation receipt, with no duplicate rows. Then increase one explicitly identified owner price by one dollar per service using real save. Approvals must not silently renew. An unsaved original proof must be stale; old successful receipts must still replay unchanged, including after application restart. This is real history captured before the synthetic edit, not a manufactured receipt.

Additional correction controls: fence removal Yes→No should omit its now-inapplicable length and quote450000; flat roof partial→full should omit partial-only fields and quote1805000; patio exact→measured area/perimeter should omit old dimensions and quote353889. Missing selected optional prices must remain review-only. Any mismatch is recorded separately with exact input, saved configuration, HTTP response and screenshot; the remaining cases continue. F2 is outside this review.

## Independent reproduction controls

After the first hosted run recorded the two dependency failures, a separate invocation with a fresh application/database/book repeats those exact transitions. It also submits the same requested work with the inapplicable field absent: fence removal off is 100×4000+2×25000=450000 cents; full flat-roof replacement remains 1805000 cents. These expectations precede execution of the separate reproduction. The original 88-case regression and its assertions remain intact. The separate four-case regression also requires correct behavior and deliberately remains red for an unfixed defect.
