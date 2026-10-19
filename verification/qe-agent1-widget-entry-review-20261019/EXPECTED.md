# Independent widget-entry expectations — before execution

Base `04df35cd8e9ced136ef611cfc2b25f2de64c21bf`; the test-only checkpoint
`59d5c282ad8d88be0cce6d59eff2c6fb207d41d2` is merged with both histories intact.
No production, existing assertions, policies, prices, versions or approvals change.
Synthetic isolated service fixtures reuse the approved A3 `auditFixtures()` values.
Expected amounts are handwritten; no calculator output supplies an expectation.

All numbers below are cents. Round each extended charge once, half up. Business
defaults are the fixture's CUSTOM zero-markup, zero-tax, zero-buffer defaults;
no fees, minimum or seasonal surcharge apply. Service-specific settings remain.

| Service | Hand calculation | Expected cents | Required answer deliberately left blank first |
|---|---|---:|---|
| ROOFING_REPLACEMENT | 50000 +110000 +20000 +15000 +11000 +22000 +6600 +10000 |244600|roofSizeInput|
| ROOFING_REPAIR | 4×10000×1.15×1.1 +8000 |58600|affectedArea|
| FLAT_ROOF_REPLACEMENT | 1000×500×1.15 +1000×700×1.1 +1000×2×200×1.15 |1805000|roofSqft|
| FLAT_ROOF_REPAIR | 3×10000 +6000 |36000|affectedArea|
| INTERIOR_PAINTING | 500×600 installed walls |300000|wallAreaSqft|
| EXTERIOR_PAINTING | 500×600 +300000×0.6×0.1 |318000|exteriorAreaSqft|
| FLOORING_INSTALL | max(300,149×1.2,299×1.1)×300 +300×1.08×500 |260670|sqft|
| FLOORING_REPLACEMENT | max(150×1.1,149×1.2)×2×300 +300×1.12×500 +300×100 +30×200 |311280|sqft|
| FENCING_INSTALL | 100×4000 +2×25000 |450000|fenceHeight|
| FENCING_REPLACEMENT | 100×4000 +2×25000 +50×800 |490000|fenceHeight|
| SIDING_REPLACEMENT | 1000×400 +1000×1.1×700 |1170000|sidingAreaSqft|
| SIDING_REPAIR | 4×10000×1.1 +10000 |54000|affectedArea|
| CONCRETE_DRIVEWAY | 500×600 +round(500×4/12/27×1.1×18000) +120×2500 +500×175 +500×1.1×150 |892222|length|
| CONCRETE_PATIO_SLAB | 200×600 +round(200×4/12/27×1.1×18000) +60×2500 +200×175 |353889|length|
| LANDSCAPING_CLEANUP | 1000×10×2 +15000 +5000 |40000|yardSqft|
| LANDSCAPING_MULCH | 270×3/12/27=2.5yd³; 2.5×1.15×5000 +2.5×3000 +270×20 +100×50 |32275|mulchArea|
| LANDSCAPING_SOD | 1000×1.05×75 +1000×125 +1000×50 |253750|sodSqft|
| LANDSCAPING_PLANTING | 2×1500 +3000 +4500 +100×20 +2×8000 |28500|plantsBySize|
| LANDSCAPING_MOWING | 5000×2 +10000×0.1 +100×50; per visit |16000|yardSqft|
| CUSTOM | Confirmed flat service, quantity one ×12500 |12500|serviceConfirmed|

Floor replacement labor specifically uses the authorized monotonic floor:
two rooms, 150 sqft each; max(150×1.1,149×1.2)×2×300 =107280, so
107280+168000+30000+6000=311280.

For every service, start a new Chromium context with empty cookies, localStorage
and sessionStorage. Load an ordinary host page containing the actual widget.js
script, open its Shadow DOM launcher and traverse the actual progressive wizard.
Enter measurements only through visible controls; product identification requires
the visible exact-offering checkbox. No draft, confirmation or React state is seeded.
Serve unchanged built widget assets through the production asset handler. Forward
public HTTP requests unchanged to the actual disposable application handlers.

Desktop viewport:1440×1000. Mobile viewport:390×844, touch/mobile enabled. Each
uses the same saved prices and independent expected cents. The mobile case also
enters explicitly separate additional work in its visible control. That must be
disclosed as an on-site estimate, with unchanged selected-work cents and no total
claim for the whole job. Desktop remains a complete selected-service estimate.

The deliberately missing answer must be asked in the wizard and require details,
with no priced result or durable quote/lead/receipt. Change details, enter the answer
through the wizard, and obtain a new preparation and valid quote. Assert the entered
scope survives preparation/final persistence; visible summaries retain measurement
units and the selected scope; output exposes no private rates or calculation data.
Generic scope/tax/currency disclosures and the service's quantity/unit disclosures
must be visible. Confirm exact stored cents and customer amount, including per-visit
mowing. Replay each genuine original final request unchanged and compare the entire
receipt, saved quote and response without duplicating rows or renewing approval.

Each service has an independent application/book so one failure cannot contaminate
the next. Two service workers may run concurrently; each service uses its original
public identity and stays below the unchanged limiter. No clock/limiter reset or
identity rotation. Capture exact source, saved book, browser controls/steps, HTTP,
screenshots and receipts for failures and continue all services. Loader retry and
race fault injection belong to A3 and are not part of this assignment. F2 is outside
scope. Existing tests and prior evidence remain immutable.
