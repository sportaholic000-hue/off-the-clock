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
