# Sandbox Chromium launch failures

Both `npm test` and `npm run test:quote` encountered these same 57 browser tests. Every failure stopped in `browserType.launch` with Chromium exiting on `SIGTRAP`, before browser assertions. No non-browser test failed.

Node: 22.23.3. Playwright: 1.56.0. Executable: Playwright Chromium 1194 (`chrome-linux/chrome`).

| Test file | Failing test |
| --- | --- |
| `test/astraQuoteScope.browser.spec.mjs` | Astra 2 browser: tier-only confirmation can be answered in measurement form |
| `test/astraQuoteScope.browser.spec.mjs` | Astra 2 browser: tier-only confirmation can be answered in customer wizard |
| `test/astraQuoteScope.browser.spec.mjs` | Astra 4 browser: product change shows its own confirmation and clears the old Yes |
| `test/billingCustomerLifecycle20261007.browser.spec.mjs` | billing screen shows exact notice amount/date and owner cancellation is one click, no GET mutation |
| `test/billingCustomerLifecycle20261007.browser.spec.mjs` | reactivation refreshes dashboard from persisted backend state and permits CSV download |
| `test/billingCustomerLifecycle20261007.browser.spec.mjs` | expired export window disables all CSV buttons and no longer offers setup/service |
| `test/bookingCalendar20261006.browser.spec.mjs` | real caller widget in Los Angeles books Moncton DST time, visible in owner dashboard and calendar |
| `test/claudeScopeEditorOrder.browser.spec.mjs` | scope editor groups entries of the same kind and names them by their matching facts |
| `test/interviewControls.browser.spec.mjs` | F11 browser boolean leaves preserve No, unanswered and the exact key |
| `test/interviewControls.browser.spec.mjs` | F11/F13 browser depth-three values retain zero, fractional rates and rejected text |
| `test/interviewControls.browser.spec.mjs` | F13 browser legacy flat and two-level controls use the same exact parser |
| `test/leadCaptureRepair20261006.browser.spec.mjs` | lead capture repairs: production owner app navigation, stored contacts and live feed |
| `test/namedReviewContact20261006.browser.spec.mjs` | named review contact signup prefill remains unconfirmed until save and survives reopening |
| `test/namedReviewContact20261006.browser.spec.mjs` | named review contact AI draft, empty edit and rejected save preserve the confirmed person |
| `test/overageDashboard20261006.browser.spec.mjs` | real dashboard always shows zero-call usage, then refreshes the $160.30 overage and $0.30 nudge on focus |
| `test/overageDashboard20261006.browser.spec.mjs` | QuoteDone dashboard shows $0.35 overage, annual monthly allowance and no Operator upgrade nudge |
| `test/overageDashboard20261006.browser.spec.mjs` | unverified period and pending historical charge are visible without an invented zero balance |
| `test/ownerAlertRepair20261006.browser.spec.mjs` | owner alert repairs: production dashboard, Calls, retry and staff visibility |
| `test/ownerAlertsDelivery20261006.browser.spec.mjs` | D19/D20: production browser shows saved quote email status and browses/retries older failures |
| `test/ownerDashboard20261007.browser.spec.mjs` | owner dashboard browser: real compiled calls, review, progression, reports and staff boundaries |
| `test/priceBookEditor.browser.spec.mjs` | editor D1: root factor survives no-edit blur save reopen and same-type switches |
| `test/priceBookEditor.browser.spec.mjs` | editor D1: nested factor survives no-edit blur save reopen and same-type switches |
| `test/priceBookEditor.browser.spec.mjs` | editor D1: flat factor survives no-edit blur save reopen and same-type switches |
| `test/priceBookEditor.browser.spec.mjs` | editor D1: equal factor survives no-edit blur save reopen and same-type switches |
| `test/priceBookEditor.browser.spec.mjs` | editor D1: a genuine absent default is displayed without being written by focus or blur |
| `test/priceBookEditor.browser.spec.mjs` | editor D2: conflicting minima survive no-edit focus blur preview switches and unrelated edits |
| `test/priceBookEditor.browser.spec.mjs` | editor D2: deliberate 14.02 resolves both minima and only its own AI confirmation |
| `test/priceBookEditor.browser.spec.mjs` | editor locked rate: 0.0049 types blurs saves and reopens exactly |
| `test/priceBookEditor.browser.spec.mjs` | editor locked rate: 0.0050 types blurs saves and reopens exactly |
| `test/priceBookEditor.browser.spec.mjs` | editor locked rate: 0.0051 types blurs saves and reopens exactly |
| `test/priceBookEditor.browser.spec.mjs` | editor locked invalid text: lossless rejection survives blur same-type switch and save |
| `test/priceBookEditor.browser.spec.mjs` | editor locked maps tiers and explicit enablement stay separate for two same-type records |
| `test/priceBookEditor.browser.spec.mjs` | editor D1 direct: reviewer minimal legacy fixture saves root 0.23 without a nested copy |
| `test/priceBookEditor.browser.spec.mjs` | editor D2 direct: deliberately typing the displayed candidate resolves the conflict and revokes affected approval |
| `test/priceBookEditor.browser.spec.mjs` | editor fixed-cent boundaries: 14.00 14.01 14.02 retain exact cents and adjacent sub-cent entries reject |
| `test/pricebookInterviewSave.browser.spec.mjs` | pending manual save preserves a newer numeric edit and its question |
| `test/pricebookInterviewSave.browser.spec.mjs` | pending manual save preserves a newer structured price-map edit |
| `test/pricebookInterviewSave.browser.spec.mjs` | pending manual save prevents duplicate confirmation and premature review |
| `test/pricebookInterviewSave.browser.spec.mjs` | unchanged confirmed value saves once and advances normally |
| `test/pricebookInterviewSave.browser.spec.mjs` | failed manual save keeps the confirmed value available for retry |
| `test/pricebookInterviewSave.browser.spec.mjs` | stale interview preserves the unsaved answer and requires explicit reconciliation: keep answer |
| `test/pricebookInterviewSave.browser.spec.mjs` | stale interview preserves the unsaved answer and requires explicit reconciliation: saved answer |
| `test/pricebookPreviewFreshness.browser.spec.mjs` | late 200 response cannot replace a new service preview |
| `test/pricebookPreviewFreshness.browser.spec.mjs` | late 400 response cannot replace a new service preview |
| `test/pricebookPreviewFreshness.browser.spec.mjs` | old completion cannot clear current loading and invalid input cannot retain old ready |
| `test/pricebookPreviewFreshness.browser.spec.mjs` | invalid replacement rejects an old delayed success and unchanged focus blur does not request again |
| `test/quoteConfigurationInterview.browser.spec.mjs` | interview owner can add separate demolition entries and explicitly choose up-to access |
| `test/quoteConfigurationInterview.browser.spec.mjs` | interview rate controls accept 3.5 cents per foot and reject fractional-cent gates |
| `test/quoteConfigurationInterview.browser.spec.mjs` | interview accepts ordinary floor names and retains invalid drafts for correction |
| `test/quoteDisplay20261006.browser.spec.mjs` | display browser: changing mulch quantity method requires a fresh quantity in its new unit |
| `test/quoteDisplay20261006.browser.spec.mjs` | display browser: all 15 product fields select names, invalidate confirmations, and roofing quotes $2520 |
| `test/quoteDisplay20261006.browser.spec.mjs` | display browser: actual dashboard and owner preview show production missing-price labels |
| `test/quoteDisplay20261006.browser.spec.mjs` | display browser: $172.50 minimum appears on all four surfaces and equal preview endpoints collapse |
| `test/quotePreviewTier20261005.browser.spec.mjs` | QP-02 rendered owner measurements collect tier-only hardwood confirmation and preview $1960 |
| `test/quoteReauditEditor20261006.browser.spec.mjs` | re-audit browser: Remove gate offering yields a coherent saveable draft and unchanged no-gate price |
| `test/websitePriceDraft.browser.spec.mjs` | website owner screen shows an unsaved draft, literal prices and source; saves only on review |
| `test/websitePriceDraft.browser.spec.mjs` | website owner screen says no prices found and preserves the current prices |
