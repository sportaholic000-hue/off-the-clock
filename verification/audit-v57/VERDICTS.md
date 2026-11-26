# Repairs from the read-only audit of v57

November 26, 2026. Audited version `quote-engine-vnext-accuracy-20261126-v57` (`04240a6`).
Repaired version `quote-engine-vnext-accuracy-20261126-v58`.
Tests with hand-worked expected values: `test/qeAuditFixesV58_20261126.spec.mjs` (13) and
`test/qeAuditFixesV58Editor20261126.dom.spec.mjs` (1).

## Repaired

| Item | Before | Now |
|---|---|---|
| Busy-season surcharge and winter concrete charge on one quote | With no work month (or "Not sure"), a concrete quote added both, a price no month pays ($3,773.21 on the test slab; July $3,718.89, January $3,593.21). The booking check then refused every month. | A quote priced at the assumed busy-season rate includes the winter charge only when a busy month is in the winter period. Otherwise it says the charge is not included ($3,718.89, books June to August). With no busy season the charge is still included when the month is not given. |
| Roof area from the footprint | Customer text said "Measured roof area". | "Roof area calculated from the footprint and pitch". A measured roof still says "Measured roof area". Prices unchanged. |
| Phone instruction for a job outside the travel areas | Said the quote is returned without a travel charge. The engine sends it to review. | The instruction says no price is returned and the business reviews it. |
| Business-wide settings in the editor | Changing one (markup, tax, fixed charges, range, busy season and others) un-approves every service; nothing said so. The markup column inside one service's panel was not labelled business-wide. | A notice appears above Save when a business-wide setting differs from the saved one. The column is labelled "(all services)" and the panel says which settings are business-wide. Approval rules are unchanged. |
| Siding repair and hazardous materials | No statement. | Every siding repair quote says testing for or removing asbestos or lead paint is not included. No question added, no price changed. |
| Sod waste starting value | Changed 5% to 10% on November 25 without the offer other changed starting values get. | A service saved at 5% is offered 10% in one action. The older defaults table reads 10% too. |
| Owner labor multipliers | Mowing frequency, grass condition and cleanup debris multipliers accepted any positive number (12 typed for 1.2 saved and quoted). | Refused above 10 with a plain message. |
| Flat-roof insulation waste starting value in the editor | Computed as 7.000000000000001. | 7. |
| v57 carpet cut-plan search | Changed larger-job carpet quantities without a flooring approval-version change. | Flooring approval versions advanced. |

## Not changed, with the reason

- Stated mulch yards take the overage factor. The November 17 owner round set this (v34 item 4); the October 3 ruling in `/specs/` says the opposite. Needs an owner ruling.
- Bulk re-approval after a business-wide change. It would change the approval rules. Needs an owner ruling.
- Blank or "Not sure" work month uses the busy-season price. Stated in the editor and on the quote.
- Fence height rows, hip waste 15%, medium pitch 1.00, mulch overage 10%, sod waste 10%, minimum fee treatment, roof repair factors added, tear-off extra layers at 70%: code is at or within trade practice, or is an owner setting.
- Minimum top-up taxed when labor is taxable: a tax question for the owner's accountant.
- Carpet whole-width default, one-width roll fit, "Not sure" connections: documented rules with an owner setting or a customer disclosure.
- Itemized roof accessory lengths asked of the customer; exact-match scope packages; no limits on AI starter prices; stale prices never block: by design under "never guess a price". Each loses instant quotes or relies on owner review.
- `server/quoteLog.js`: unused. The audit said its insert would fail; that was wrong. The `quotes` table is created in `server/src/schema.js` with the `status` column.
- Audit item "phone estimates read Measured roof area in the written quote": the emailed phone quote is the frozen call narration, which carries "This price is based on the measurements you gave us" and no price drivers. Only the footprint wording was wrong.
- `/specs/` files, including `voice_quote_flows.md` and `BUILD_STATUS.md`, are unchanged. They still describe earlier behavior.

## Wording for owner approval (shipped, unapproved)

- Customer: "This price does not include the winter concrete charge. That charge is added if the concrete is poured from [start] to [end]."
- Customer, work-month question with a busy season and a winter charge: "The winter concrete charge follows the month the concrete is poured. If you are not sure, the quote says whether it is included."
- Customer: "Roof area calculated from the footprint and pitch: [n] roofing squares"
- Customer: "Repair does not include testing for or removing asbestos or lead paint. Older siding can contain them; if found, that work is priced separately."
- Owner, winter charge help, added sentence: "If you also charge a busy-season rate and none of your busy months fall in that period, a customer who is not sure gets the busy-season price without the winter charge, and the quote says the charge is added for a winter pour."
- Owner: "You changed a business-wide setting. It applies to every service. After you save, each service you had confirmed must be confirmed again before it gives instant quotes."
- Owner: "Apply markup / margin (all services)"
- Owner: "Price basis, taxability and the fee rules below are for this service. The markup / margin column, currency, fixed charges, travel areas, estimate range, busy-season surcharge and time zone are business-wide and change every service."
- Owner: "[Multiplier name] ([key]): enter a value above 0 and no more than 10. For example, enter 1.5 for one and a half times the labor."
- Owner, starting-value offer: "Sod material waste allowance 5% → 10%"
- Phone agent instruction (travel areas and work month rules in `server/src/voice/voicePromptCompiler.js`).

## Approval versions

- `CONCRETE_DRIVEWAY`, `CONCRETE_PATIO_SLAB`: 1 to 2 (the work-month rule above).
- `FLOORING_INSTALL`, `FLOORING_REPLACEMENT`: 2 to 3 (the v57 carpet search).
- No earlier frozen-job result changed: the fingerprint of the 1,349 earlier jobs is the v57 value.

## Tests

- `npm run test:quote`: 445 files, 7,456 of 7,456 tests, zero skips, on the committed code.
- The 20 voice and receptionist test files that read the changed phone instructions: 754 of 754.
- One earlier test changed: "repair 65" in `test/quoteEngineVNextRepairs.spec.js` forced a numeric overflow with a mowing and a cleanup multiplier of `Number.MAX_VALUE`. The new ceiling refuses those values on its own, so the two cases now reach the same overflow from the rate at the largest multiplier allowed (10) and expect the same blocked fields.
- `test/qeAgent1RoofPitchActivationChannels20261019.spec.mjs` reads an old commit, so it needs the branch's full history (a shallow checkout fails it).

## Frozen jobs

Six new ones, for 1,355: three concrete jobs with no work month (summer busy season with a winter charge, by "Not sure" and by blank; spring busy season with a winter charge), one with a winter charge and no busy season, a mowing multiplier above the ceiling (review) and a cleanup multiplier at the ceiling ($1,040.00).

# v59, same day: open items decided by trade standard and best practice

Owner direction, November 26, 2026: "this is based off the industry standards and best practices", not owner rulings; no questions. Repaired version `quote-engine-vnext-accuracy-20261126-v59`.

## Decided and built

| Item | Decision and basis | Now |
|---|---|---|
| Stated mulch yards | Bulk mulch is sold and billed by the cubic yard. Supplier and extension guides add the 10% ordering buffer to a volume worked out from area and depth, to cover settling and uneven ground. No source adds it to a quantity the customer orders. This is also the October 3 trade decision; the November 17 round had reversed it. | Stated yards (mulching and planting) are bought as stated, then rounded up to the order increment. The overage applies to yards calculated from area and depth. 5 stated yards at $45 and $30: $375.00 (was $397.50). Planting's unused overage setting is no longer offered. |
| Siding repair in older buildings | A repair takes off existing siding, the same hazard the engine already screens for siding removal. EPA Renovation, Repair and Painting rule: exterior work disturbing more than 20 sq ft of painted surface on a pre-1978 home needs lead-safe practice; asbestos-cement siding needs asbestos procedures. | Vinyl and metal: no question. Fiber cement and wood: year built asked; 1990 or earlier or not sure goes to review; the owner's exclusion policy quotes every age. Every quoted repair states the exclusion. |
| Re-confirming after a business-wide change | The codebase already carries approvals across a confirmed country and tax change. An approval that is stale only because shared settings changed needs one confirmation of those settings, not one per service. | One confirmation renews every service whose own saved content is unchanged since its approval. Anything else still needs its own confirmation. |

## Kept as it is, with the basis

- Blank or "Not sure" work month uses the busy-season price: a conservative estimate, stated on the quote and in the editor; the booking check requires a new quote for another season.
- Travel and permit fees on top of the job minimum (owner setting): they are pass-through charges.
- Minimum top-up taxed when labor is taxable: the top-up is a charge for the service.
- Roof repair pitch and story factors added, extra tear-off layers at a reduced rate: steep and high charges are separate additive lines in insurance-estimating practice (Xactimate). The percentages are owner settings.
- Carpet whole roll widths by default, one width for a room no wider than the roll: CRI 105, with an owner setting and a customer note.
- Job-size ceilings: the limits exist (roof 1,000,000 sq ft, flat roof 2,000,000, slab and lawn 10,000,000). No trade standard gives a lower number, so none was invented.
- Itemized roof accessory lengths, exact-match scope packages, no price limits on AI starter values, stale prices not blocking: "never guess a price".

## Files read in full this round

The remaining editor panels, conflict recovery, the customer quote page and widget files, the phone tool schemas, dispatcher and runtime, the booking guard for quote terms and address, and the price-book interview (server and client). Not part of the quote engine or price book, and not read: the booking calendar service, the website price crawler internals, and the account, calendar and phone setup screens.

Three display defects found and fixed: stored field names were shown for unused painting prices, for unnamed or retired plant sizes, and as the customer's detail labels in the widget's appointment check.

## Wording for owner approval (shipped, unapproved)

- Customer: "Siding in a building built in 1990 or earlier can contain asbestos or lead paint, so it is checked before the repair. The business will confirm the price."
- Owner, "Removal in older buildings" help, added sentence: "This also covers siding repair, which takes off existing siding: the year built is asked for fiber cement and wood siding, not for vinyl or metal."
- Owner, "Mulch ordering overage" help: "Adds material for settling and compaction when the mulch is worked out from the bed area and depth. Cubic yards the customer states are ordered as stated."
- Owner: "[N] services are waiting only for your business-wide settings to be confirmed. Their own prices are unchanged since you confirmed them: [names]." with "I confirm the business-wide settings saved on this page (markup, tax, currency, fixed charges, travel areas, estimate range, busy-season surcharge, time zone and quote validity) for these services." and the button "Confirm for these [N] services".
- Owner: "Unnamed plant size [N]", "Retired plant size [N]".

## Approval versions, frozen jobs, tests

- `LANDSCAPING_MULCH`, `LANDSCAPING_PLANTING`: 1 to 2. `SIDING_REPAIR`: 2 to 3.
- Ten new frozen jobs, for 1,365.
- `npm run test:quote`: 447 files, 7,472 of 7,472 tests, zero skips, on the committed code.
- The 73 test files outside that gate: 1,865 tests, 1,863 passed, 2 skipped (calendar and service-area persistence tests that need Node's module-mock flag). One of them, `test/voiceQuotePathCases20261005.mjs`, pinned the November 17 mulch value ($216.20) and is back to its original $207.00.
- Older tests the November 17 round had changed for stated yards are back to their original hand-worked values; the list is in the commit message.
