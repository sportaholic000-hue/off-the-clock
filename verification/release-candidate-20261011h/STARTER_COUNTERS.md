# Starter quote counters — report only

These existing counters are not new quoting entitlements. A fresh Starter has
no engine-generated quotes; existing quotes can remain after a downgrade.
The following UI and storage traces were reviewed directly at candidate h.

| Location | What a Starter owner sees / exactly what it counts |
| --- | --- |
| client/src/dashboard.jsx:235 | `QUOTES` / `ALL SAVED QUOTES`: every row in `quotes` for this tenant, all time, including dismissed/superseded rows. It does not count quoteRequests, ordinary lead capture, or spoken listed-price arithmetic. This is the normal stored-activity branch, even with zero calls. Query: server/src/ownerCallService.js:100. |
| client/src/dashboard.jsx:243–244 | `QUOTES DELIVERED` in local preview only: fixed synthetic `$23,400`, with `6 TODAY · 19 THIS WEEK`; no business records are counted. Comes from server/src/previewMode.js:80–104. Production refuses local preview. |
| client/src/dashboard.jsx:253 | `QUOTES DELIVERED` / `NO QUOTES DELIVERED YET`: fallback em dash `—`, not a computed zero or a count; shown only when neither stored nor preview activity is available. |
| client/src/pricebook.jsx:856 | Locked Starter Price Book `QUOTE REQUESTS CAPTURED`: all `quoteRequests` rows for the tenant, all time, no status/date/spam filter. Includes retained requests from previous plans. server/src/server.js:457. A request can be saved for review without any price or saved quote. |
| client/src/reports.jsx:14 | `QUOTES` / `SAVED IN THIS PERIOD`, both inside Dashboard via ReportsPanel (dashboard.jsx:178) and on /reports: quote rows created in the selected period, excluding DISMISSED and SUPERSEDED. Default is the current month in the owner's business timezone. All time includes undated records. No restriction to successful email delivery. server/src/ownerReportService.js:7,69–75,111–115. |
| client/src/reports.jsx:11 | Undated-record notice includes a quote count: all tenant quotes with invalid/missing createdAt, including dismissed/superseded. They are only eligible for the report's all-time totals; that total still excludes those statuses. server/src/ownerReportService.js:115. |
| client/src/reports.jsx:21–22 | Quoted-value `N records` and excluded-value counts: selected active quote rows grouped by currency, per-job/per-visit basis and tax treatment. Complete eligible estimate ranges count once per saved quote, not once per tier; partial/unpriced/invalid currency/unit/tier/qualification rows increment the named exclusion count instead. These report historical saved data on Starter. Booked/invoiced value rows count linked quote/invoice evidence under the report's separate rules, not newly delivered quotes. server/src/ownerReportService.js:11–33,77–97. |
| client/src/reports.jsx:25 | Service-funnel `Quoted`: distinct non-spam calls started in the selected period that have an active quote with a valid, complete saved price, grouped by recorded service; later quote stages count cumulatively, regardless of the quote's creation period. `Calls to quotes` divides that call count by the service's call cohort, and `Quotes to bookings` divides distinct calls with a confirmed book_job by that quoted-call count. No tenant data from other businesses and no listed-price read-back counts. server/src/ownerReportService.js:99–118. |
| client/src/reports.jsx:28–29 | Follow-up count includes quote follow-ups as well as leads: OPEN ownerRecordWorkflows linked to existing records, all periods, with overdue based on dueAt; not a delivered-quote count. server/src/ownerReportService.js:110,120–121. |
| client/src/dashboard.jsx:196–225,323–325 | Service-pricing activity, not delivered-quote totals: SERVICES WAITING ON YOUR PRICING count, and `N ready · N need pricing`, come from saved book service statuses. Dormant retained services after downgrade can still contribute. The specified Starter fallback READY TO QUOTE / NEEDS PRICING cards are hidden by this change; these other service summaries are unchanged, as requested. |
| client/src/dashboard.jsx:211–218 with server/src/previewMode.js:100–104 | Local-only `QUOTE REQUESTS WAITING ON YOUR PRICING` priority count is the fixed synthetic value 2, not a tenant request count. Never production data. |

Call details render individual saved quotes / quote requests (calls.jsx:82,97),
and the Quotes list has a `No saved quotes yet.` empty state (quotedone.jsx:227);
neither adds a numerical counter. Starter's separate quote-record access and
review actions remain gated at the route layer. This inventory changes no text,
count calculation, public page, plan entitlement or quote arithmetic.
