# Proposed owner labels and wording

These are the proposed labels implemented on this review branch, expressly disclosed for owner review. No new customer labels or job-cost disclosures are added. Placeholders `{currency}` and `{n}` below stand for the saved currency and row number.

## Range controls

Labels: **Separate range buffers**; **Business low range buffer (%)**; **Business high range buffer (%)**; **This service low range buffer (%)**; **This service high range buffer (%)**.

Help: “These percentages are a commercial buffer, not a measured accuracy band. Each blank side uses the existing estimate range buffer. Minimum-price and customer display rules still apply. Custom prices entered as a low/high range keep their own endpoints.”

Service help: “Each blank side uses the business-wide setting for that side, then the existing estimate range buffer.”

Review/history labels: **Low range buffer (%)**, **High range buffer (%)**, **Business low range buffer percentage**, **Business high range buffer percentage**, **This service low range buffer percentage**, **This service high range buffer percentage**.

Saved-configuration confirmation, only when a new side is set: “I confirm these exact saved prices, units, factors and rules, including {markup}% {markup mode} and the {low}% low and {high}% high commercial range buffers.” The displayed percentages resolve service overrides and blank fallbacks; the legacy confirmation remains unchanged when both new settings are absent. Approval receipts are unchanged.

Validation: “Low range buffer must be from 0 to 100%.”; “High range buffer must be a finite non-negative percentage.” The existing fallback buffer retains its 0–25% validation. Invalid or unsafe resulting money requires review.

## Custom allocation

Labels: **Labor and materials in custom prices**; **Custom price materials share (%)**. Metadata/interview label: **Custom price materials share**.

Help: “Optional. Enter the materials share of this custom price; the remainder is labor. Labor follows labor price-basis, markup and busy-season rules. Materials follow material price-basis and markup rules and materials-only tax. Blank keeps the existing single charge category. The share applies to each scenario of a custom low/high price and stays private.”

Metadata help: “Optional percentage at price; the remainder is labor. Blank keeps the existing charge category. Applies to all custom price scenarios.”

Existing **Custom service charge category** help becomes: “Choose the line category for this complete service charge. Its saved price basis, taxability, markup and seasonal settings apply. A final selling price is not marked up again. Blank materials share keeps this category; an entered materials share uses labor and material rules.”

Owner calculation-line names: **Custom service labor**, **Custom service materials**, **Peak season adjustment on custom labor**. The existing percentage validation message is reused. The materials share is stored at `pricing.installedMaterialsPercent.price`; no separate custom labor share is required or defaulted.

## Job entry

Labels: **Job costs and approved changes**; **Final invoice**; **Actual labor hours**; **Actual labor cost ({currency})**; **Actual material cost ({currency})**; **Approved change orders**; **Change {n} amount ({currency})**; **Change {n} description**.

Actions/status: **Remove change {n}**, **Add approved change**, **Save job costs**, **Saving…**, **Reload saved job costs (replace unsaved edits)**, **Not recorded**, **currency not recorded**.

Help: “Owner only. These records never appear on the customer quote. Blank means not recorded; enter 0 only for a known zero. Costs and hours cover the whole job, including approved changes. Record costs in the invoice currency, excluding recoverable tax.”

Invoice help: “Record the final invoice through the quote action above.”

Change-order help: “Record only changes approved outside the app. Enter their signed invoice amounts on the same tax basis as the final invoice; a negative amount is a credit. Descriptions stay separate from the original quote. Accuracy uses final invoice minus these changes.”

Success: “Job costs saved. Refresh Reports to see the updated figures.”

Validation/recovery messages:

- “Job costs are available only to the owner.”
- “Quote not found.”
- “Supply job costs and the current revision.”
- “Job costs changed. Reload the saved values before editing again.”
- “Enter non-negative labor hours with at most four decimal places.”
- “Supply up to 100 approved change orders.”
- “Each approved change needs an amount and description.”
- “Approved change total exceeds the supported limit.”
- “Approved changes cannot exceed the final invoice.”

Existing invoice amount validation, authentication, plan and network errors remain in use.

## Reports

Title: **Quote accuracy and job costs**.

Help: “Owner only. Active quotes created in the selected period, including later invoices and costs. Original-scope invoice = final invoice minus approved change orders. Accuracy compares that amount with the saved customer range and middle for the accepted option. Percent gaps are the mean of each job’s gap divided by its own quote middle. A positive signed gap means the invoice was higher.”

Help: “Each figure includes only jobs with its required numbers; blank values are never zero. Currencies, price units and tax treatment stay separate. Cost comparisons use original quoted owner-cost lines against full actual costs, including changes. Selling prices are excluded from estimated costs. Realized margin = (full final invoice − actual labor cost − actual material cost) / full final invoice; it is the mean of eligible job margins, before other expenses.”

Captions/columns: **Accuracy and realized margin**, **Figure**, **Value**, **Jobs covered**, **Estimated and actual costs**, **Cost**, **Original estimate**, **Actual, including changes**, **Actual minus estimate**.

Metrics: **Invoices inside quoted range**, **Average signed gap**, **Average signed gap (%)**, **Average absolute gap**, **Average absolute gap (%)**, **Average realized margin**, **Labor**, **Materials**, **Average actual labor hours**.

Detail labels/actions: **Original-scope invoices by job**, **Open job**, **Original-scope invoice**, **Approved changes**, **Inside range**, **Yes**, **No**.

Empty/coverage wording: **No jobs in this period.**, **Not available**, **Currency not recorded**, **Tax treatment not recorded**, **Unclassified**, **per job**, **{count} of {jobs} jobs**, **{jobs} jobs**. Currency, service, price-unit and tax-treatment values are taken from saved quotes. No invoice is imputed; missing midpoints, ambiguous options and zero denominators are excluded only from the figures requiring them.
