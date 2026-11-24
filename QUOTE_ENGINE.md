# Quote engine and price book

This is the one place to start an audit of the quote engine and price book.

All quote engine and price book work is committed to the `quote-engine` branch.
Other work goes on its own branch. The `quote-engine` branch also contains work
merged from the homepage, demo agent, launch hardening, carrier call forwarding
and owner email branches (October 29–30, 2026).

- Current engine version: `quote-engine-vnext-accuracy-20261124-v47`
  (`ENGINE_VERSION` in `server/quote-engine-vnext/engine.js`).
- Production refuses to start on any other engine version
  (`EXPECTED_QUOTE_ENGINE_VERSION` in `server/src/runtimeConfig.js`).
- Run every quote-engine and price-book test: see "Running the tests" below.

## Running the tests

Supported environment: Linux with Node 22, the same as production (`node:22-bookworm-slim`
in `Dockerfile`) and CI (`ubuntu-24.04` in `.github/workflows/ci.yml`). Running the
server on Windows is not supported.

From a fresh checkout, the same steps CI runs. Use a full clone: one test
checks commit history, and a shallow clone fails it (`git fetch --unshallow`
repairs a shallow one).

1. `npm ci`
2. `npm install --no-save --no-audit --no-fund playwright@1.56.0`
   (the browser tests load Playwright at run time; it is not in `package.json`,
   so this leaves the lockfile unchanged)
3. `npx playwright install chromium`
4. Only if Chromium cannot launch: `npx playwright install-deps chromium`
5. `npm run build`
6. `npm run test:quote`

The gate fails on any failed, skipped, cancelled or missing test.

On Windows the gate does not complete. Known causes: directory flushes without a
Windows guard in `eraseTenantPricebookFiles` (`server/src/billingTenantErasure.js`)
and in `save()` in `server/src/offsiteBackups.js`; SQLite files still open during
test cleanup; and price-book save tests that simulate Linux. None of these is a
quote calculation.

## How a quote is calculated

1. The owner's price book is saved and approved through `server/src/quoteDoneBridge.js`.
2. A customer, widget or phone request reaches the engine only through that bridge.
   `npm run test:quote` fails if any other application file imports the engine.
3. `contracts.js` checks the customer's measurements and the owner's prices.
4. `templates.js` turns measurements and prices into priced lines for the service.
5. `engine.js` runs each line in this order: common fees, busy-season charge,
   taxability, markup, minimum, tax. It then builds the customer range and
   removes everything private before the customer sees it.
   Each busy-season charge inherits the price basis and markup eligibility of
   the labor that generated it. The engine splits the charge by source
   category and price basis, including tear-off, removal and preparation labor
   and the labor share of a combined ground or base preparation price. Each
   charge is taxed like the work it comes from.
   Travel and permit fees are charged on top of the job minimum unless the
   owner chooses to count them toward it.
   Under "Tax entire job" and "No tax" the per-category tax choices are not
   read, so a blank one does not hold a service.
   Sod: an existing lawn keeps the combined Ground preparation price until
   old-lawn removal and grading both have their own prices. Imported topsoil
   with its own price is a separate line with either method.
   Carpet: a room no wider than the roll takes one width; the 0.5 ft trim
   stays on the cut length and the fit is confirmed on site.
   Roofing: a roof with no existing layers does not need the old roof
   material, and every multi-storey footprint is confirmed as the ground floor.
   Concrete: placement by volume is priced in the book's ready-mix unit.
   Roofing: underlayment bought by the roll follows the low-slope method: two
   layers buy rolls for twice the roof area, and one self-adhered layer
   replaces the rolls.
   Mowing: the busy-season note is decided on each visit's own price.
   Painting: rooms of one height share one ceiling line.
   Roofing: on a low-slope roof where one self-adhered layer replaces the
   regular underlayment, the customer is not asked to confirm underlayment
   rolls that are not bought, and the rolls' owner setup stands in for the
   per-square underlayment price.
   Sales tax by job location: the status check for a Canadian business
   samples a job in the province saved at onboarding, so a missing Quebec,
   British Columbia, Manitoba or Saskatchewan rate shows the service as
   needing pricing. A 5-digit ZIP that holds a ZIP+4 tax zone at another rate
   asks the customer for the ZIP+4 code.
   Fences: a fence catalog lists the labor portions its terrain adjustments
   need, by fence type, option and height row.
   Concrete: isolation joints are an installed selling price; markup on a line
   split between labor and materials is taxed on its taxable share. A measured
   outline is thickened along its edges; only parts no wider than two band
   widths are thickened through. A quote's winter concrete charge is kept only
   for an appointment in the same winter or non-winter pricing.
   Carpet: separate areas are turned together when that lets rooms share a
   roll-width cut.
   Options that leave out different add-ons keep their shared disclosures and
   the validity statement in the overall disclaimer.
   A $0 surface extra, repair price or low-slope shingle price can be marked as
   included in another price; a $0 flat-roof detail or repair price asks for no
   labor and materials split.
   v46 and v47 (November 24, 2026, audit of f1501ff): one unreadable service
   no longer takes the others offline, and a book whose readiness cannot be
   evaluated is not saved. Fence catalogs are checked like a single fence
   (coverage per type and height row, the same sample jobs, withheld rows
   named). Readiness reads the travel rule from the service, answers the
   floor-sound question for floating overlays, tests low-slope roofs bought
   by the roll, finds included $0 prices in fence catalogs, and keeps the
   concrete base-included labor share a per-condition notice. An empty
   short-load band list is no band list. Tree-shaped price fields are edited
   as JSON. A not-sure roof pitch with a band or rise reaches the customer.
   Optional-item quantities that were not selected, unpriced leveling asked
   for without an area, and flashing and vents excluded by the base material
   wording are listed as not included. A repair's own $0 unit price or
   first-area minimum needs an included-in-another-price classification.

## Engine: `server/quote-engine-vnext/`

- `index.js`: the engine's public functions.
- `engine.js`: fees, busy-season charge, markup, minimum, tax, range, customer-safe output.
- `templates.js`: the per-service formulas (all 20 services).
- `contracts.js`: what each service asks the customer, owner price checks, starting factors.
- `exactMath.js`: exact fraction arithmetic; money is rounded once per line.
- `roofGeometry.js`, `roofSlopeRules.js`: footprint-to-surface area; IRC and NBC minimum slopes and low-slope methods.
- `flatRoofRepairPricing.js`: flat-roof details, repair size bands and unit repair prices.
- `flooringPricing.js`: flooring extras, pattern waste, room measurements, carpet roll cutting.
- `floatConditionNames.js`: the floating-floor product condition setting names and their
  earlier names, carried under the current name at each tier level before merging.
- `fencePricing.js`, `configuredOfferings.js`: fence runs, posts, gates and height rows; fence and painting offerings.
- `surfacePricing.js`: painting and siding areas from rooms or building dimensions, coat ratios, optional surface items.
- `concreteLandscapePricing.js`, `landscapePricing.js`: concrete joints, placement, base, mix; sod topsoil; plant sizes; cleanup disposal.
- `scopePricing.js`: owner-defined extra scope and whole-package purchases.
- `packagePurchasing.js`: when a material bought in packages needs its package size.
- `tradeAdjustments.js`: waste and labor adjustments applied to measured lines.
- `buildingAgeRules.js`: lead paint and asbestos year questions.
- `customPriceSplit.js`: labor and materials split of a custom price.
- `priceBook.js`: price-book validation, activation checks and owner labels.
- `priceGroundwork.js`, `startingFactorUpdates.js`: sourced starting values and their adoption.
- `answerDefinitions.js`: customer wording for judgment answers.
- `workMonth.js`, `quoteValidity.js`: work-month busy-season choice; quote validity date.
- `geometry.js`, `pricingMerge.js`, `safeData.js`, `activationBoundaries.js`: outline geometry, tier merging, input safety, activation test inputs.
- `carpetUnitConversion.js`: exact carpet price conversion between square feet and square yards, shared by tier merging, the price book and conflict recovery.

## Price book: `server/`

- `priceBookService.js`: loading and saving price books.
- `priceBookMoney.js`, `pricePrecision.js`: dollars to cents and which prices must be whole cents.
- `carpetPriceUnits.js`: exact carpet price conversion between square feet and square yards
  (refuses a price that cannot be stated exactly). Used by the owner editor
  (`client/src/pricebookEditing.js`: base and tier unit changes, removed tier price rows)
  and the AI interview (`server/src/priceBookAI.js`: a carpet price stated in the other unit).
- `priceBookMetadata.js`, `priceBookCopy.js`, `priceBookLabels.js`, `priceBookLegacyFields.js`: owner field labels and help text.
- `priceBookStructure.js`, `priceBookTree.js`, `priceMetadata.js`: storage shape, map fields, price-age records.
- `installedPriceConfiguration.js`: labor and materials shares of installed prices.
- `scopeConfiguration.js`: owner-defined scope forms; which existing floors a floating floor
  may go over. The owner's material class for each registered existing floor, or a short list of
  names with an unambiguous material (`tile` means the engine's own ceramic or porcelain tile
  flooring type; bare `vinyl` is not recognized; `laminate` is a material, and only the name
  `floating` always floats), gives the material; the customer's answer gives attachment. New
  laminate is priced only as a floating install. Each product's permitted substrates and
  conditions, with the product and instruction revision they come from, give the outcome:
  permitted, conditional (a partial estimate leaving whether the floor can stay for the site
  visit; also any floor the owner hasn't classified), or prohibited. A known violation of a
  product condition is prohibited even when the product's substrate list is blank. No overlay
  or preparation price changes the outcome. A response is partial as a whole only when every
  option carries the same unresolved item; otherwise each option keeps its own.
  Wood conditions are separate, and each product turns on only those its instructions state:
  not glued to concrete, not laid or fastened directly over concrete, and no sleeper
  construction. The glue condition is about the existing wood covering, so it applies only
  while that covering stays. The other two are construction conditions: they describe what
  the new floor is laid on, which removing the old covering leaves in place, so they apply
  when the old floor stays, when it is removed, and when there is none. An existing wood
  floor is asked what it and its wood layers sit on (`woodFloorAssembly`, read for what
  remains once it is removed); any other floor, or none, is asked what it is laid on
  (`floorSupportConstruction`), including a concrete surface, which can be a topping over
  wood. Both are asked only after the customer says they know what the floor is laid on
  (`floorConstructionKnown`); No reads exactly like Not sure, and a detail answer already
  given (an earlier draft) still decides. Answers describe construction, never room
  location: a basement or an upper floor does not establish what is under the flooring.
  An answer to the other kind of floor's question, or a detail answer together with No,
  is refused. A known violation is
  refused with wording that never says removing the old floor is enough; an answer a
  condition does not decide (Not sure included) gives a partial estimate with the
  construction left for the site visit. Choosing removal never drops a known construction
  answer. The earlier glue-only setting (`wood_not_on_concrete`) and answer
  (`woodAdheredToConcrete`) are read with exactly their meaning; the shared tier merge
  carries the earlier setting name under its current name at each level before combining
  them, so a tier's value wins whichever name it uses. Each tier's questions come from that
  tier alone; a question one tier asks is accepted, unused, by the others. Soundness wording follows the floor's material (concrete
  is asked about its surface; unclassified floors get neutral wording).
  `DEPENDENT_ANSWERS` lists answers that belong to a scope the customer turned off; the form
  and the submission drop them, and the server still rejects them if sent.
- `surfacePricing.js` (`inactiveQuantityAssumption`): the painting quantity assumptions a
  pricing method does not read (installed pricing: the three material waste allowances and
  the additional-coat ratios; every exterior method: the fair-condition preparation hours).
  The price book shows their saved values read-only as unused, and Reset all leaves them.
- `surfacePricing.js` (`activePaintingRateKeys`): the painting component prices a pricing
  method reads. The base and tier editors offer only those; a saved price the method does not
  read is shown read-only as unused, and changes nothing.
- `taxJurisdiction.js`, `travelZones.js`: tax by job location; postal-code travel zones. A job's country
  comes from its postal or ZIP code; without one, from the business country saved at onboarding. With
  neither, a decision that depends on the country goes to review. The lead-paint year rule uses the same order.
- `customerQuoteFields.js`, `interviewConfiguration.js`: customer question list; AI interview answers.
- `quoteMoneyFormat.js`, `quoteRangeSettings.js`, `quoteLog.js`, `productNames.js`, `serviceName.js`, `priceBookMetricArithmetic.js`: display and supporting rules.

## Application connection

- `server/src/quoteDoneBridge.js`: the only route from the application into the engine.
- `server/src/quoteDoneRoutes.js`: quote and price-book web routes.
- `server/src/priceBookAI.js`: AI starter prices and interview.
- Owner editor: `client/src/pricebook*.js*`, `client/src/interview*.js*`.
- Customer widget: `client/src/quoteWizard.jsx`, `quotedone.jsx`, `quotePresentation.js`, `quoteSubmission.js`.

## Consistency harness (November 24, 2026)

`test/invariants/consistency.spec.mjs` runs inside `npm run test:quote`. It
starts from the live base services in `test/invariants/harness.mjs`, removes
each price and sets each price to $0 one at a time, and checks every result:

- NO_THROW: readiness and quoting never throw.
- SILENT_LIVE: a LIVE service that holds a quote for a missing owner price
  lists that price in its owner coverage lists.
- CUSTOMER_REFUSES: a quote the owner preview prices passes the customer check.
- BLOCKED_QUOTES: a NEEDS PRICING service whose typical jobs all quote.

Findings must equal `knownFindings.json` (new ones fail; fixed ones must be
removed). Every outcome (status, ready or held, cents) is frozen in
`frozenOutcomes.json`. Any change fails until it is recorded on purpose with
`node --import ./test/pricebookTestEnv.mjs test/invariants/update-snapshot.mjs
--reason "..."`, which writes the reason and every changed outcome to
`CHANGES.md`. Read every changed outcome before recording it. Add each new
audit repro as a base service so its neighbours are checked too. Do not add a
finding to `knownFindings.json` to make the gate pass.

## Changing the engine

Any change in what a quote charges, or in why a quote goes to review, needs:

1. A new `ENGINE_VERSION` in `engine.js` and `runtimeConfig.js`. Saved owner
   approvals name the version that priced them, so owners re-approve after a change.
2. The new fingerprint added to `verification/engine-fingerprint/history.json`.
   If the frozen inputs do not reach the change, add inputs that do in a new
   `corpus-additions-*.json` file (listed in `fingerprint.mjs`); earlier input
   files are never edited.
3. A test with hand-worked expected values written before the run.
4. `npm run test:quote` passing with zero failures.

The files `server/quote-engine-vnext/*.md` (other than README.md) are records of
past audit rounds. They describe earlier versions, not current behavior.
