# Exact coverage matrix

All amounts are independently recorded synthetic controls in integer cents. “DOM” means the actual React control ran in JSDOM; it does not mean a real browser ran. Real-browser coverage is zero for every row.

| Registered service | Valid expected cents | Public HTTP valid + saved customer path | Correction / invalid public case | DOM control evidence | Real browser |
|---|---:|---|---|---|---|
| ROOFING_REPLACEMENT | 244,600 | Pass | 1,000 → 1,000.5 sq ft; stale proof 409; corrected 244,698 | — | Untested |
| ROOFING_REPAIR | 58,600 | Pass | 100 → 100.5 sq ft; stale proof 409; corrected 58,600 | Pass: edited product removed only its stale receipt | Untested |
| FLAT_ROOF_REPLACEMENT | 1,805,000 | Pass | partial area zero → `needs_details`, no receipt | — | Untested |
| FLAT_ROOF_REPAIR | 36,000 | Pass | ponding toggle invalidated proof; corrected 36,000 | — | Untested |
| INTERIOR_PAINTING | 300,000 | Pass, disclosed wall-only control | hidden ceiling area with ceilings off → `needs_details`, no receipt | — | Untested |
| EXTERIOR_PAINTING | 318,000 | Pass | 500 → 500.5 sq ft; stale proof 409; corrected 318,318 | — | Untested |
| FLOORING_INSTALL | 260,670 | Pass | removal off with hidden area → `needs_details`, no receipt | — | Untested |
| FLOORING_REPLACEMENT | 311,280 | Pass | subfloor off with hidden area rejected; corrected 305,280 | PI-03 retained hidden area | Untested |
| FENCING_INSTALL | 450,000 | Pass | changed configured height rejected; no receipt | Pass: decimal inches transformed; total fields cleared on run mode | Untested |
| FENCING_REPLACEMENT | 490,000 | Pass | removal off with hidden length rejected; corrected 450,000 | — | Untested |
| SIDING_REPLACEMENT | 1,170,000 | Pass | trim off with hidden length → `needs_details`, no receipt | — | Untested |
| SIDING_REPAIR | 54,000 | Pass | 50 → 50.25 sq ft; stale proof 409; corrected 54,000 | — | Untested |
| CONCRETE_DRIVEWAY | 892,222 | Pass | contradictory method/geometry → `needs_details`, no receipt | PI-02 retained hidden length/width | Untested |
| CONCRETE_PATIO_SLAB | 353,889 | Pass | impossible direct perimeter → `needs_details`, no receipt | — | Untested |
| LANDSCAPING_CLEANUP | 40,000 | Pass | haul-away removed; stale proof 409; corrected 35,000 | — | Untested |
| LANDSCAPING_MULCH | 32,275 | Pass | area/depth → 2.75 yd3 with stale depth rejected; corrected 32,400 | PI-01 retained hidden depth | Untested |
| LANDSCAPING_SOD | 253,750 | Pass | prep off with stale topsoil zero rejected; corrected 203,750 | — | Untested |
| LANDSCAPING_PLANTING | 28,500 | Pass | mulch off with stale yards/type rejected; corrected 12,500 | PI-04 retained hidden mulch values/receipt | Untested |
| LANDSCAPING_MOWING | 16,000 | Pass | weekly → one-time stale proof 409; corrected 24,800; edging removal corrected 11,000 | PI-05 retained hidden edging; omitted vs zero preserved | Untested |
| CUSTOM | 12,500 | Pass | flat unit plus stale hours → `needs_details`, no receipt | — | Untested |

## Additional public-boundary transitions

| ID | Transition | Result |
|---|---|---|
| H01 | Mowing edging included → excluded | Hidden length rejected; corrected body saved at 11,000 cents |
| H02 | Flat-roof separate work added, changed, removed | Added output partial at 36,000 cents plus separate work; changed/removed stale proofs 409; fresh removal output complete at 36,000 cents |
| H03 | Saved CUSTOM service-label revision + fresh approval | Old proof 409; pre-revision saved optional-work receipt retried 200 with identical historical response |

Public HTTP service coverage: **20/20**. Correction/invalid coverage: **20/20**. React DOM service coverage: **7/20**. Real-browser service coverage: **0/20**.
