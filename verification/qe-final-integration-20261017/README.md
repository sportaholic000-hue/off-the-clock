# Initial final-integration checkpoint — October 17, 2026

**Incomplete:** the reporting session's approved final SHA and verification report have not been supplied. No reporting branch head is assumed approved. Final combined verification and completion remain pending that exact merge. Local broad and browser gates and this checkpoint's hosted CI are recorded separately after execution; the focused checks below do not substitute for them.

The review branch starts at exact `56e19419e6287f4fc984e9e6b650469828ce182e` and merges exact `046f9d905435495cab31f5abb02cce1413645e54` with both parents preserved. Main, deployments and customer data are untouched. Both inputs have successful hosted CI: [base 39000946889](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39000946889) and [everytrade 38994838541](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38994838541).

## Conflicts

| File | Resolution |
|---|---|
| client/src/quoteDoneControls.jsx | Keep surface row controls and the new range controls/approval disclosure imports. |
| server/quote-engine-vnext/contracts.js | Keep flat-roof/repair allocation keys, roofing decking allocation and CUSTOM materials-share key; keep adoption metadata and new business/service range fields. |
| server/quote-engine-vnext/engine.js | Keep repair dispatch and new independent-range/CUSTOM split imports. All arithmetic hooks from both branches remain. |
| server/quote-engine-vnext/priceBook.js | Keep surface/adoption copy and CUSTOM allocation copy. Preserve used-only painting/flooring readiness fixes. |
| server/src/quoteDoneBridge.js | Preserve startingValueAdoptions with new range fields; preserve surface-configuration field types and CUSTOM share metadata. Existing receipt checks remain. |

Automatically merged installedMaterialsEditor, pricebook, priceBookLabels, priceBookMoney and priceBookAI retain their existing trade behavior plus the incoming hooks. All incoming production changes are reviewed; reporting-owned files are byte-identical to everytrade and await their owner's repair merge. No independent reporting rewrite or approved trade formula change is made.

## Unavoidable nonbehavioral expectation reconciliation

The everytrade branch's 43 full-result snapshots predate the painting/flooring integration. Running those same inputs against a detached copy of exact base `56e19419` and the merged source gives identical results for all 43, except generated quote IDs. Eight old snapshots differ only in private evidence representation:

- Five straight-floor controls gain `flooringPatternLaborAdjustment` with value 1 and the `layoutLaborMultiplier.straight` path.
- Installed interior painting gains the explicit `standard` surface-height band on wall/ceiling lines.
- Itemized interior painting calls its four finish/primer height factors `Wall-height labor` instead of `Labor adjustment`; preparation retains its old label.
- Itemized interior/exterior painting records existing labor-coat quantities as confirmed measurements, replacing the prior duplicate derived-quantity representation. Quantity values are retained.

`test/finalIntegrationMetadata20261017Fixture.mjs` adjusts only those **expected private metadata fields**, then the full strict result comparison still runs. The original compressed snapshot and all dollar, quantity, scope, eligibility and customer-output expectations remain. The one changed incoming test imports this helper and applies it to its expected result; no assertion is removed. `TEST_RETENTION.json` records 371 incoming test/fixture files: 370 byte-identical and this one explicit expectation reconciliation. Newly added integration files run through normal discovery. No workflows, skips or known-failure allowances change.

## Service/channel coverage

Every row below runs through saved/approved books, the widget's `prepareApplicationIntake` + `submitQuote` application route, and the actual simulated voice dispatcher/tool runtime. These 20 parity cases compare normalized inputs, internal lines, exact ranges, customer pricing/disclosures and privacy, then test both absent and null required measurements/details. Each crosses business low 5/high 15 with an explicit service low zero override. They reuse existing synthetic controls; they do not claim browser interaction for all 20 services.

| Registered service | Existing detailed coverage retained |
|---|---|
| ROOFING_REPLACEMENT | quoteRoofing20261016; browser adoption; measured products/accessories/pitch/decking |
| ROOFING_REPAIR | quoteFlatRoofRepairs20261016; units, bands, area limits, pitch/stories |
| FLAT_ROOF_REPLACEMENT | quoteFlatRoofRepairs20261016; optional item quantities, installed shares, old building answers |
| FLAT_ROOF_REPAIR | quoteFlatRoofRepairs20261016; dimensions, area/LF/each, maximum, approximate phone scope |
| INTERIOR_PAINTING | surfacePricing20261016, surfacePricingLaneCFixes20261016, voiceSurfacePricing20261016; openings, coats, optional work |
| EXTERIOR_PAINTING | same surface suites; dimensions, gross/net openings, stories, optional work |
| FLOORING_INSTALL | quoteFlooring20261016, validation, delivery and browser suites; boundaries, carpet rolls, layouts, extras |
| FLOORING_REPLACEMENT | same flooring suites; removal/subfloor and product-specific scope |
| FENCING_INSTALL | fenceLaneB20261016, boundary/property, delivery and browser suites |
| FENCING_REPLACEMENT | same fence suites; removal, gates, height/type choices |
| SIDING_REPLACEMENT | surfacePricing20261016 and LaneCFixes; opening conventions, optional soffit/fascia |
| SIDING_REPAIR | quoteFlatRoofRepairs20261016; area/units, unchanged bands and story factors |
| CONCRETE_DRIVEWAY | quoteConcreteLandscape20261016, validation, delivery and browser suites |
| CONCRETE_PATIO_SLAB | same concrete suites; quantities/short load, joints, placement and dimensions |
| LANDSCAPING_CLEANUP | landscapePricing/DeliveryLaneB20261016; bags/loads, extras and disclosures |
| LANDSCAPING_MULCH | measured-scope and landscape suites; caller volume vs derived quantity, units/access |
| LANDSCAPING_SOD | concrete/landscape suites; preparation/topsoil, slope/access, unknown allowance |
| LANDSCAPING_PLANTING | concrete/landscape suites; owner size names, counts, mulch; browser owner/customer controls |
| LANDSCAPING_MOWING | landscapePricing/DeliveryLaneB20261016; first visit, frequency, optional bagging/edging |
| CUSTOM | everytrade20261017 suites plus fixed range/CUSTOM allocation widget/voice checks |

`customerMeasurementChoices20261008.spec.mjs` retains actual rendered controls/voice question-contract checks for every registered service. Existing Chromium suites exercise selected owner and customer controls, actual widget submissions and saved public receipts. New `quoteFinalAdoption20261017` uses saved-book adoption, new unconfirmed services, explicit confirmation and actual widget/voice request paths. Straight flooring and confirmed wall-only work remain available while unrelated optional values are pending. All phone scenarios use synthetic tool inputs, including caller-confirmed estimates and the on-site sentence; no speech recognition, real model/provider behavior or live call is tested.

Focused results before publication: metadata reconciliation 53 pass/0 fail/0 skipped; all-service integration 23/0/0; adoption 2/0/0. Original failed iterations are disclosed in the execution report; they were fixture/schema/metadata expectation issues and were not solved by changing prices or production formulas.

## Specifications, wording and limits

No specs files are edited. No new pricing policy departure is introduced by the integration. Existing owner-authorized departures remain in the incoming reports, including `verification/everytrade-20261017/SPEC_DEPARTURES.md`, lane C and concrete/landscape spec-departure reports, and the pinned adoption/repair/roofing work. Range presentation remains outward-rounded; exact cents stay private. No new customer or owner label is introduced here. Incoming proposed copy remains in each branch's wording report.

Passing synthetic regressions establishes only the stated implementation and channel consistency for covered inputs. It does not measure real-world quote accuracy. Actual completed jobs, confirmed measurements, invoices, approved changes and recorded costs are still needed for that evidence. Reporting aggregation remains owned by the separate session and is not accepted as repaired by this checkpoint.
