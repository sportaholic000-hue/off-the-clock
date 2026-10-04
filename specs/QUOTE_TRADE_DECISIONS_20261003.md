# Owner quote-engine decisions — October 3, 2026

This amendment records the owner's supplied implementation instructions and subsequent labor-only surcharge clarification. It overrides conflicting older engine formulas only for the decisions below. Customer-facing quotes disclose the resulting estimate, scope and existing tax-treatment wording, never internal labor/material amounts, tax amounts, margins or rate allocations. Existing amount-display precision is unchanged except the expressly requested exact minimum-price result.

- A fully configured roof/floor product can quote while another product needs setup. Itemized painting conditions are also evaluated separately. Malformed pricing still fails closed; the requested incomplete scope never receives a subtotal.
- Peak pricing applies to labor in the business-local month when the quote is produced, never the scheduled job month. The optional price-book `quoteTimeZone` takes precedence over the business profile time zone. Service-level settings override business settings; owners can select business inheritance, a service-specific surcharge, or every month for a year-round labor surcharge.
- Installed prices have explicit private `installedLaborPercent` and `installedMaterialsPercent` maps keyed by price path. No production split is defaulted. Shares must be between 0 and 100 and their sum cannot exceed 100. Any remainder is unaffected other cost. Labor factors and peak surcharge apply only to the labor portion; materials-only tax applies only to the materials portion. Missing labor portions contribute zero to peak surcharge and never block seasonal quoting or readiness. Required allocations for non-seasonal labor factors and materials-only tax retain their review rules. Ordinary separately priced categories retain existing tax and markup rules. Complete installed prices never receive a second markup.
- Fence posts = ceil(measured fence length excluding gate openings / owner spacing) + 1 end + corners + 2 per gate whose installed price excludes posts/footings. Default spacing is 8 ft. Customer facts are fence length, height/type, terrain, corners and gates; post count is never requested. Fence height remains exact per offering.
- Itemized painting preparation uses the reported good/fair/poor condition over measured wall area plus selected ceiling area. No preparation-area question. Existing single-condition preparation prices retain their original condition meaning. Itemized finish coats accept 1–3; installed prices require their defined coats. All selected itemized painted areas use the stated finish-coat count.
- Owner-editable 10% material waste is added to the specifically requested membrane, roofing starter/drip/ridge, paint/primer/preparation materials, fence infill, concrete wire/rebar and stamped-finish material quantities. Previously configured package waste remains inside package calculations. No double waste on packages, installed prices, piece counts or fixed allowances. Other existing quantities and waste rules remain unchanged.
- Flooring layout labor factors: straight 1, diagonal/pattern 1.20. Fence terrain: 1/1.15/1.30. Interior painting height: 1/1.10/1.25. Exterior painting stories: 1/1.10/1.20. Ceiling labor uses wall-height factors. Flat-roof repair uses replacement's access factors. Mulch and planting use sod's access factors. All are owner-editable.
- Concrete measured area plus perimeter quotes directly. Geometrically impossible combinations are rejected. Measured rectangles/outlines keep their existing quantity rules.
- Caller-stated mulch yards are used as given, including planting's mulch yards. Only mulch yards derived from area/depth receive the existing ordering overage. Planting's retained overage setting no longer affects quotes and is shown among retained legacy settings.
- A job bound to the minimum shows the exact minimum plus applicable tax as one price. Ordinary above-minimum ranges are unchanged.
- Customer results exclude internal service UUIDs, revision hashes and owner range-buffer percentages. Historical retries preserve original prices while applying this metadata presentation boundary.

Existing saved price amounts are retained. New Class 2 defaults are materialized through the existing owner workflow. The engine-version change deliberately requires fresh owner approval of the changed arithmetic. Missing money or installed-price allocations are not inferred.

Verification, exact expected calculations and integration limits are in `verification/quote-trade-decisions/REPORT.md` and `EXPECTED.md`. No merge, deployment or phone-agent wording update is part of this implementation.

## Owner follow-up — three verified gaps

The owner's subsequent October 3 instructions override the earlier missing-allocation behavior for peak pricing only. Peak pricing adds a surcharge to explicit labor lines (including the existing painting-prep labor classification) and any entered labor portion of installed prices. Missing installed labor allocations add zero and cannot cause NEEDS PRICING or quote review. All other category arithmetic is retained.

Offering price fields and notes explicitly state their baseline: fencing covers flat ground, interior painting covers standard-height walls, and exterior painting covers a one-story building. The existing terrain, height and stories factors apply on top to labor only. Saved non-baseline offering conditions without `offeringDetails.baselinePricesConfirmed: true` require owner review and cannot quote. The price book explains the prior condition and lets the owner explicitly confirm the current rates as baseline prices. No money or previous condition is automatically changed. Generic save/approval alone does not supply this confirmation. The current saved-configuration approval still binds the confirmed details and prices. Baseline offerings need no additional migration confirmation.

When any business or service peak months are selected and no quote time zone has been explicitly chosen, the price book prompts for one without blocking quoting. Until selected, the existing saved profile zone is used, with UTC as a temporary fallback when unavailable. A selected quote time zone takes precedence; Atlantic October 31 at 10:30 pm remains October even when UTC has moved to November. No time zone is inferred from the browser.

This follow-up leaves the engine approval version unchanged to avoid invalidating otherwise current approvals; the legacy-offering condition gate runs in shared owner validation for every quote and readiness check. Changes to saved price-book content still require ordinary fresh approval. Evidence is in `verification/quote-decision-followup/`.

## Owner follow-up — required status messages

Owner status messages list actual service blockers separately from optional itemized-painting surface-condition coverage. Missing good/fair/poor preparation prices are shown as “Not yet priced. Requests for this condition go to review.” They are not individual service requirements. If no condition has complete preparation pricing, the required message asks for at least one condition. Malformed saved prices remain validation errors. Activation results, per-condition eligibility, quote calculations, approvals and customer outputs are unchanged. Evidence is in `verification/owner-status-messages/`.

## Owner follow-up — component pricing and usable price-book controls

The owner authorized the latest confirmed engine/price-book findings for repair and expressly requires arbitrary positive fence heights, including fractional inches. This authorization includes the plain owner-facing labels below.

- A siding-removal scope's price already covers its explicitly matched existing-story count. Do not apply the new-siding story factor again to removal. Separately itemized siding-trim labor does use the new-building story factor. Insulation and coverboard itemized labor use flat-roof access factors; their materials and complete installed prices retain their existing basis.
- Interior wall height adjusts walls and ceilings, never separately measured installed trim. Trim still contributes its explicitly entered labor portion to any applicable labor-only peak surcharge.
- Flooring underlayment can be explicitly **Included in flooring material price**. This mode adds no separate underlayment price or purchased quantity; saved previous scope prices remain retained and are shown as unused in this mode. Existing approved zero-included underlayment mappings can match the covering flooring material's cost or selling basis. All other inclusion validation stays in force. A zero included floor-underlayment line needs no installed materials allocation.
- Quoting-live status remains available for supported baseline jobs. The owner also sees **Conditions that still need a labor portion**, listing applicable terrain/height/stories and installed components whose missing labor portion would cause those selected requests to need review. This coverage notice never changes activation results.
- Permit applicability is chosen by the owner: always, owner selected, included in prices, or not applicable. Earlier customer-selected/scope-selected permit rules require an owner correction; the system does not infer that a permit applies. Customer permit answers cannot add or remove an owner-controlled fee, and the customer forms no longer ask that question.
- Each offering has an editable name. Any positive fence height is supported; **Enter feet and inches** accepts decimal inches and uses the same conversion in owner and customer controls. Existing decimal-foot heights remain unchanged unless edited. (Superseded by the owner's fence-height ruling below: a request at any other height is priced in proportion to height.)
- Saved approval shows labeled settings, exact monetary values, units, percentages and factors. Financial rules and tier overrides remain reviewable. Internal approval receipts and registry IDs are not owner entry fields. AI confirmations use readable labels. Included-zero classifications use price selectors instead of manually typed paths. Registered products accept ordinary names and retain their stable internal identities.
- The four retired scalar inputs (stairs, siding removal, flat-roof insulation, concrete demolition) leave the current pricing list. Saved values remain in the record and are disclosed as retained settings; current structured scopes supply the prices. Displaying these additional retained values does not by itself invalidate an existing saved approval.
- Existing specified 30% markup and 10% range-buffer starter defaults remain numerically unchanged. The saved approval explicitly states the current markup/margin percentage and range buffer; no silent replacement values are selected.
- Customer scope copy distinguishes stated and calculated mulch yards, describes bed preparation plainly, and spells out stair inclusions. Review responses distinguish missing measurements, other job details and inspection needs using fixed safe messages. Technical/malformed-result failures keep the generic safe fallback; internal diagnostic strings are never echoed to customers.

These repairs retain unrelated arithmetic. (Amended by the review follow-up below: the engine approval version now changes so this changed arithmetic receives fresh owner approval.) Changes to saved owner configuration still require ordinary approval. Evidence and independent expected values: `verification/component-pricing-repairs/REPORT.md`.

## October 3 review follow-up (Claude)

Three minor findings from the independent re-verification of `88e5040`, plus the approval-version rule, are corrected on `claude/quote-review-fixes-20261003`.

- **One product-name conversion.** Every owner control that names a product, gate or price row (price tables, scope price tables, Registered products, gate offerings and the AI interview tables) uses the same conversion: accents are folded, any punctuation becomes a word break, and the stored name is lowercase words joined by underscores starting with a letter. A name registered in one control therefore matches the same name typed in another (for example "O'Brien cedar" and "Vinyl (D4)"). A refused name is never ignored: the owner sees why ("Start the name with a letter…", "That name is already listed."). A refused name does not block saving.
- **Review wording from field metadata.** The customer review message is chosen from the engine's own customer-field metadata (base contracts, configured offerings and owner-defined scopes), not by guessing from field names. Any physical size (feet, inches, linear feet, square feet, roofing squares, cubic yards, area percentage, measured outline) or the method used to measure one reads as a measurement; counts and choices read as other job details. Fence length, slab thickness, edging length and scope sizes such as demolition thickness now get the measurement message. Malformed results keep the generic message.
- **Retained settings stay retained.** The saved-approval table no longer lists retained (retired) values among active prices; they appear only under retained settings, formatted like prices (for example "$40"), with one row per saved value.
- **Approval version.** Consistent with this document's rule that changed arithmetic requires fresh owner approval, the engine version moves to `quote-engine-vnext-trade-decisions-20261003-v2` because the component-pricing repairs changed trim, siding-removal, insulation/coverboard and siding-trim amounts. Saved prices are unchanged; owners re-confirm the saved configuration.

No prices or formulas change in this follow-up. Evidence: `verification/claude-review-fixes-20261003/REPORT.md`.

## Owner ruling — any fence height quotes (October 3)

The owner ruled that fence height must never limit a quote: 2 ft, 9 ft, 13 ft or fractional-inch requests all quote. Prices are entered for one height per fence offering ("Height these prices are for"). Any other requested height is priced in proportion to height, i.e. per square foot of fence face: fence labor and material per foot, post material, footing labor, footing material, installed fence per foot and gate prices are each multiplied by requested height / priced height. Post and footing depth follow the standard rule of burying a fixed fraction of the post, so they scale the same way. Old-fence removal is priced per foot as entered. Terrain factors, waste and installed labor shares apply as before, on top of the scaled price. The customer's quote states that it was priced from the business's priced height and scaled to the requested height. The fence type must still match the offering. The base fence contract's fixed 4/6/8 ft list is removed; fence height is any positive number of feet everywhere.

Exactness: a line re-priced by a later step (waste, terrain, installed labor share) reuses its earlier factors' exact values, so a factor such as 1/3 is never replaced by its rounded binary value (found while verifying a 2 ft request against 6 ft prices, where a half-cent line rounded down).



## Owner correction — one fence-height control (October 3)

Fence height is entered directly as whole feet and decimal inches in the owner editor and customer form. There is no decimal-feet mode toggle or fixed-height preset list. This scoped correction changes presentation only; saved numeric heights, conversion and quote arithmetic are unchanged. Verification: four rendered height examples, all five existing fence-height tests, and owner/widget builds passed. The separate precision, storage and test-runner repair draft remains paused and is not included.

## October 3 engine audit repairs (Claude, branch `claude/audit-fixes-20261003`)

- **Installed shares split the billed line.** Labor and materials shares of an installed price are fractions of the amount actually billed (the rounded line), kept exact until the tax or surcharge itself is rounded. A 100% materials share therefore taxes exactly like tax-entire-job, and the portions always add back to the billed line.
- **Surcharge basis follows its labor.** The peak surcharge on labor inside complete installed (selling) prices is its own line marked as a selling price and is never marked up; the surcharge on ordinary labor keeps the owner's surcharge-category settings.
- **Flat-roof products are isolated** like pitched roofs and floors: an incomplete membrane does not block a complete one; malformed data still fails closed.
- **Fence height precision.** Heights are feet and inches with inches to two decimal places (for example 5 ft 3.65 in); anything finer is refused with a message, never rounded. Displays use exact feet and inches. (Amended in follow-up 3 from four places.)
- **Fence type** is chosen from, or added to, Registered products through the shared product-name conversion.
- **Applied default settings** (post spacing, waste, labor factors) are stored with the service on save and listed in the approval review; older records show them marked as defaults.
- **Included-price choices** list each price option's own overrides by name and never offer minimums.
- **Price-book saves** flush the directory before reporting success; a book that cannot be read or belongs to another business stops quoting.
- **Tests.** `npm test` runs CI's full suite and known-failure check; `npm run test:quote` checks the engine architecture and runs every quote-engine and price-book test file with zero failures allowed.
- Engine version `-v3`: the billed-share and surcharge-basis rules change arithmetic and require fresh owner approval.

## October 3 audit follow-up 2 (Claude)

- **Fence height pricing stays simple (owner direction).** No second priced height and no per-price height settings. Prices are entered for one height; any other height is priced in proportion to height for fence, posts, footings and gates; old-fence removal is not scaled. This closes the audit's fence-scaling question.
- **Fence posts.** The post count is a stated allowance: ceil(length / spacing) + 1 end + 1 per corner + 2 per gate whose price excludes posts. Checked against every layout of whole-foot runs (6, 8 and 10 ft spacing, up to 60 ft, up to 3 corners, about 1.67 million layouts): it never under-counts and over-counts by at most one post per corner (one more on a closed loop). An exact takeoff would require callers to give every run length, which the owner has ruled out (posts are engine math).
- **Mixed preparation prices** (concrete base prep, sod ground prep) remain single lines that follow their category for markup, tax and peak pricing; they are not split into labor and material portions.
- **Large repairs are bounded.** Each repair service has an owner-entered largest affected area priced as a repair (more than the medium-repair limit: 200 sq ft roof, 80 sq ft flat roof and siding). It is required before large repairs quote; larger requests go to review.
- **Currency.** Price books carry CAD or USD, set from the business country in onboarding and editable in the price book. Every quote states it ("Prices are in Canadian dollars (CAD).") and the customer result carries the code. No conversion is performed.

## October 3 audit follow-up 3 (Claude)

- **Currency is required and active.** A price book must state CAD or USD before any service quotes ("Choose the currency of your prices (CAD or USD) in the price book."). Currency is an active business setting in approval review, never a retained legacy setting. Once chosen it cannot be cleared in the editor.
- **AI interview answers** apply only to the question and on-screen value they were asked about; a value the owner changed while waiting is kept.
- **Readiness** is computed once per saved price-book revision and engine version rather than on every quote; every request still validates the selected job.
- **Fence inches** accept up to two decimal places.
- **Tests.** `npm test` and CI request TAP output explicitly (Node 24 otherwise prints a different format). `npm run test:quote` selects quote-engine, price-book and quote-presentation tests by following imports through helpers and fixtures.

## Owner ruling — fence size limits are intentional (October 3)

- **Minimum fence length is 1 ft.** No fence is built shorter than a foot, so a request under 1 ft goes to review instead of quoting. This is a deliberate product boundary, not a defect. The "any height" ruling applies to fence height only.
- **Gate widths come from the gate offerings the owner configures.** Customers choose from the business's gates; they do not enter arbitrary gate widths.

Both are locked in by `test/quoteCombinationBoundaries.spec.mjs` (0.99 ft and 0 ft return review; 1 ft quotes; unknown gate types return review).

