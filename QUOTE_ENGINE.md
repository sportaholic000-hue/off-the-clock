# Quote engine and price book

This is the one place to start an audit of the quote engine and price book.
All quote-engine and price-book work is committed to the `quote-engine` branch.

- Current engine version: `quote-engine-vnext-accuracy-20261103-v16`
  (`ENGINE_VERSION` in `server/quote-engine-vnext/engine.js`).
- Production refuses to start on any other engine version
  (`EXPECTED_QUOTE_ENGINE_VERSION` in `server/src/runtimeConfig.js`).
- Run every quote-engine and price-book test: `npm ci`, then `npm run test:quote`.

## How a quote is calculated

1. The owner's price book is saved and approved through `server/src/quoteDoneBridge.js`.
2. A customer, widget or phone request reaches the engine only through that bridge.
   `npm run test:quote` fails if any other application file imports the engine.
3. `contracts.js` checks the customer's measurements and the owner's prices.
4. `templates.js` turns measurements and prices into priced lines for the service.
5. `engine.js` runs each line in this order: common fees, busy-season charge,
   taxability, markup, minimum, tax. It then builds the customer range and
   removes everything private before the customer sees it.

## Engine: `server/quote-engine-vnext/`

- `index.js`: the engine's public functions.
- `engine.js`: fees, busy-season charge, markup, minimum, tax, range, customer-safe output.
- `templates.js`: the per-service formulas (all 20 services).
- `contracts.js`: what each service asks the customer, owner price checks, starting factors.
- `exactMath.js`: exact fraction arithmetic; money is rounded once per line.
- `roofGeometry.js`, `roofSlopeRules.js`: footprint-to-surface area; IRC and NBC minimum slopes and low-slope methods.
- `flatRoofRepairPricing.js`: flat-roof details, repair size bands and unit repair prices.
- `flooringPricing.js`: flooring extras, pattern waste, room measurements, carpet roll cutting.
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

## Price book: `server/`

- `priceBookService.js`: loading and saving price books.
- `priceBookMoney.js`, `pricePrecision.js`: dollars to cents and which prices must be whole cents.
- `priceBookMetadata.js`, `priceBookCopy.js`, `priceBookLabels.js`, `priceBookLegacyFields.js`: owner field labels and help text.
- `priceBookStructure.js`, `priceBookTree.js`, `priceMetadata.js`: storage shape, map fields, price-age records.
- `installedPriceConfiguration.js`: labor and materials shares of installed prices.
- `scopeConfiguration.js`: owner-defined scope forms.
- `taxJurisdiction.js`, `travelZones.js`: tax by job location; postal-code travel zones.
- `customerQuoteFields.js`, `interviewConfiguration.js`: customer question list; AI interview answers.
- `quoteMoneyFormat.js`, `quoteRangeSettings.js`, `quoteLog.js`, `productNames.js`, `serviceName.js`, `priceBookMetricArithmetic.js`: display and supporting rules.

## Application connection

- `server/src/quoteDoneBridge.js`: the only route from the application into the engine.
- `server/src/quoteDoneRoutes.js`: quote and price-book web routes.
- `server/src/priceBookAI.js`: AI starter prices and interview.
- Owner editor: `client/src/pricebook*.js*`, `client/src/interview*.js*`.
- Customer widget: `client/src/quoteWizard.jsx`, `quotedone.jsx`, `quotePresentation.js`, `quoteSubmission.js`.

## Changing the engine

Any change in what a quote charges, or in why a quote goes to review, needs:

1. A new `ENGINE_VERSION` in `engine.js` and `runtimeConfig.js`. Saved owner
   approvals name the version that priced them, so owners re-approve after a change.
2. The new fingerprint added to `verification/engine-fingerprint/history.json`.
3. A test with hand-worked expected values written before the run.
4. `npm run test:quote` passing with zero failures.

The files `server/quote-engine-vnext/*.md` (other than README.md) are records of
past audit rounds. They describe earlier versions, not current behavior.
