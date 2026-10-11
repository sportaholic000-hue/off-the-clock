NOT DONE at report authoring — this report commit still needs its own hosted CI and annotated tag. Source checks below are complete; tagging is fail-closed until the final-commit checks pass.

# Release candidate h

This file is deliberately committed **before** the final CI and tag, as requested.
Its own SHA and future CI result cannot be embedded without creating another
commit. The final user-facing report supplies the resolved branch SHA, final CI
run/counts and both tag refs. The annotated tag's message also records its exact
commit and successful CI run. No source changes are allowed after the verified
checkpoint below; only this verification directory changes in the report commit.

## Inputs, merge commits and published source

All three input refs matched `git ls-remote` before work and again after checks:

| Ref | Verified SHA |
| --- | --- |
| claude/release-candidate-20261010g | 8973f429df487c58f3ad7a49bfdb35ebbb9a274a |
| fix/day90-erasure-20261011 | 04ef98aa44625e6a2e7fb4e1cc74f4691ac1f40b |
| fix/billing-staff-scan-20261011 | 0939ae3c8b17ad9c1529d1420e8bbb128bb4913c |

Ordered two-parent merge commits, without squash or rebase:

1. `14ae447b3df03f78b6cf3d2bdf93915a8c7288c3`: base first parent, day-90 second parent. Clean merge.
2. `e5e8b25a07c314188a438bed5fa47a6013114944`: first merge first parent, billing/staff/scanner second parent. Published immediately after resolving the merge.

Approved wording / release-check checkpoint, local and confirmed on GitHub:
`1b8b25ab7a1027b68de3338e75e796a5e890820b` on
`claude/release-candidate-20261011h`.
Local Git push had no HTTPS credentials. The connected GitHub Git Data API
published identical verified trees and ordered parents; local HEAD was aligned
to those API-created commits. No force push and no main/candidate-g merge.

## Every conflict and its resolution

Exactly three textual conflicts occurred in the second merge:

| File | Resolution |
| --- | --- |
| .github/workflows/ci.yml:4 | Union of both push lists; keep fix/day90-erasure-20261011 and fix/billing-staff-scan-20261011. Existing test gates remain strict. |
| server/src/ownerQueryExceptions.js | Keep the union of reviewed entries with no duplicate keys. Re-review the extended lifecycle CREATE TABLE exec, updating its obsolete signature rather than retaining an unused exception. Explicitly classify two newly discovered day-90 exec calls below. |
| verification/tenant-isolation-20261007/route-sources.json | Keep reviewed day-90 hashes and billing staffRoutes hash; use the combined server.js hash only after route review. No route/middleware matrix, role, selector or assertion was weakened. |

`server/src/server.js` **did not conflict**; its automatic merge was manually
reviewed. Line 219 injects the shared staff recovery limiter. Line 227 supplies
retention status to the backup admin route. Lines 474–477 keep the admin
retention summary and 503 on unfinished erasure. The shared retention lock and
its backup/restore callers are byte-identical to the day-90 input; staff
validation order, atomic consume re-check, limiter, scanner and inventory
assertions are byte-identical to the billing input.

Route-source hash changes from base (no other entries changed):

| File under server/ | Before SHA-256 | After SHA-256 | Review |
| --- | --- | --- | --- |
| src/billingCustomerLifecycle.js | `5e41264cee1bb520b506da1a7761d1409c3d118b28025b170aa6a2d5e39af20d` | `6c29811dd838b4d47ff647deec1b4d2e328abc1f08620b41221ea30bc486d0be` | Lifecycle GET, cancel/reactivate POST and CSV-export paths still owner-only, with unchanged tenant binding and provider-write guards; retention internals changed. |
| src/offsiteBackups.js | `bcbb60194c4593095149776cd1557fd605e352b46a026e1a12afa42d581512c8` | `f247115573db7b4a08bb5c537228b2e62f7f6caa6f5a4e1c46810387f4f38714` | GET /api/admin/backups/offsite still admin-only; includes erasure status and returns 503 for unfinished erasure. |
| src/server.js | `6d47404801b807d11cc49a8f06fbd727ed0224470442fdaa0c3ba2f2dbd579a9` | `bbea024a983128ddc61d8cdb2186870987b3346b27cfbf39a868992b75fe5d59` | Same paths, authentication and roles. Keep staff rate-limiter injection and both retention callbacks; GET /api/admin remains admin-only and returns retention summary/503. |
| src/staffRoutes.js | `d6114497fc95126190d9b6e53c14be7a9573de047e58e78fe96af12ecfc0da4e` | `09a4b526a3dc2cea40c672a328ad28c4fe9ce7d68e8415b4d851e1fce5a8a849` | Same paths and roles. Staff-invite acceptance keeps origin validation/no-store, then shared recovery limiter before service. All existing owner/team/plan guards stay. |

The full runtime tenant matrix passed in development/preview and production;
all 264 assertions passed both locally and hosted. See MERGE_REVIEW.md and the
standalone TAP evidence.

## Approved wording applied

Every exact approved string is recorded in
`verification/owner-wording-approval-20261011.md`, dated 2026-10-11.

| File:line | Plans | Before → after |
| --- | --- | --- |
| client/src/billing.jsx:12–15,40,116 | Trial owners on their selected plan | ISO date `2026-10-25` → `Oct 25, 2026` style, using saved account timezone from the existing onboarding route and UTC fallback, like other owner screens. Labels `Trial ends` and `Days left` remain verbatim; days remain an integer. |
| client/src/pricebook.jsx:450 | Operator, QuoteDone, legacy Scale, including trials | `What your customer hears` → `What your customer gets` |
| client/src/pricebook.jsx:455 | Same | `This is what the estimate will sound like on a call. Nothing saves until you save.` → `This is the estimate your customer will get. Changes here aren't saved until you press Save & validate.` |
| client/src/pricebook.jsx:499 | Same | `RANGE YOUR CUSTOMER HEARS` → `RANGE YOUR CUSTOMER GETS` |
| client/src/dashboard.jsx:254–259 | Starter, including trial | Hide fallback READY TO QUOTE and NEEDS PRICING cards; existing CALLS ANSWERED and QUOTES DELIVERED placeholders stay. |
| client/src/dashboard.jsx:256 | Operator, including trial | Live-service fallback caption `THESE CAN QUOTE ON A CALL` → `THESE CAN QUOTE ON YOUR WIDGET` |
| client/src/dashboard.jsx:256 | QuoteDone / legacy Scale, including trial | Existing `THESE CAN QUOTE ON A CALL` unchanged. |
| client/src/onboarding.jsx:104–109 | Starter, including trial | After the unchanged first sentence, `Quoting turns on per service later. Answering never waits on your price book.` → `Price Book quoting is included with Operator and QuoteDone.` |
| client/src/onboarding.jsx:104–109 | Operator, including trial | Same prior continuation → `Website widget quoting turns on per service later. Answering never waits on your price book.` |
| client/src/onboarding.jsx:104–109 | QuoteDone / legacy Scale, including trial | Existing continuation unchanged: `Quoting turns on per service later. Answering never waits on your price book.` |

The first setup sentence stays exactly: `Ready when your account has access,
your number is set, and the About and Hours sections have content.` The actual
save button still renders `Save & validate` (pricebook.jsx:1195), verified in the
DOM. Client plan decisions use the same onboarding account plan as the existing
Operator preview fix. No new pricing-engine plan logic.

`server/src/previewMode.js` and `client/src/planDescriptions.js` are unchanged.
No specs, public website pages or quote arithmetic changed. Tracked client/dist
was restored from git before this commit.

## Starter quote-counter inventory (report only)

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

## Expected versus actual

Expectations were written in EXPECTED.md before the wording experiments.

| Check | Expected | Actual |
| --- | --- | --- |
| Trial date/timezone | 2026-10-25T01:30Z → Oct 25 in UTC/Tokyo, Oct 24 in Los Angeles; invalid/unset timezone → UTC. Days left 14. | All five DOM cases pass; whole-number 14 in each. |
| Existing trial meter | One pending 125-second call: 0/60 used and pending 1; completion: ceil(125/60)=3 used, 57 left, $0.00 overage. | Pass using the production minute service fixture and real MinuteUsage. |
| Paid usage / choices | Operator 302/300 → $0.70; three monthly/annual prices and monthly allowances unchanged. | Pass; Billing staff denial and Stripe-disabled behavior also pass. |
| Preview copy / save label | Three customer-gets strings and exact Save & validate on Operator, QuoteDone and Scale, active/trial. | Six real-editor DOM cases pass. |
| Fallback cards / setup | Per-plan approved copy, Starter hides only two specified fallback cards, trials follow selected plan. | Sixteen DOM cases pass. |
| Merge behavior | Both erasure/backup/provider guarantees and staff pre-hash validation/limiter survive. | Required standalone files all pass locally and hosted. |
| Tenant inventory | No unlisted prepare/exec, no duplicate or unused exceptions, unchanged role/route/middleware assertions. | Inventory clean; 20 scanner checks and 264 runtime matrix checks pass. |
| Docker | Existing Railway restart/restore smoke and voice-enabled synthetic startup. | Both hosted smokes pass on the checkpoint. Final report commit reruns both before tag. |

Focused final wording run: 40 total, 40 passed, 0 failed/skipped/cancelled/TODO.
The initial red run recorded 12 pass / 28 fail, including 16 new-harness CSS
compilation failures; these were test-fixture setup issues, not product defects.
The final harness supplies the normal browser structuredClone and complete
synthetic profile shape. Existing route selectors/assertions were not weakened.

## Commands and exact totals

Local Node 22.23.3; nine available CPUs. Local dependencies were already installed;
hosted CI performed a fresh lockfile `npm ci`, installed its test-only Playwright
and Chromium, built the owner app/widget and ran all strict checks.

Do not add the full and quote totals together: they overlap.

| Local command | Total | Passed | Failed | Skipped | Cancelled / TODO |
| --- | ---: | ---: | ---: | ---: | --- |
| npm run build | Owner + widget build | Pass | 0 | — | — |
| npm test | 4826 | 4766 | 60 | 0 | 0 / 0 |
| npm run test:quote | 4117 | 4055 | 62 | 0 | 0 / 0 |

Local npm test's 60 failures are all Chromium launch failures. The quote gate's
62 failures are those same 60 launch failures plus two coreCatalog timing
assertions. The isolated coreCatalog rerun passed **6/6**, with 0 failures/skips,
using nine available CPUs: full path 532.08 ms (535.30 ms timer delay), quick
422.71 ms (425.19 ms delay), versus the original run's approximately 1,700/1,600 ms
and 1,500 ms limit. No source or timing assertion was changed. Remaining local
non-browser failures: **zero**.

Each standalone file below ran in its own process. Local command for each:
`node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test <file>`.
Hosted CI independently runs the same command per required file. Every row has
zero failures, skips, cancellations and TODOs.

| File | Local total / passed | Hosted checkpoint total / passed |
| --- | --- | --- |
| server/quote-engine-vnext/tests/coreCatalog.spec.mjs | 6 / 6 | Isolated local timing rerun; covered by successful hosted gates |
| test/day90Backups20261011.spec.mjs | 4 / 4 | 4 / 4 |
| test/day90Cancellation20261011.spec.mjs | 4 / 4 | 4 / 4 |
| test/day90Guarantees20261011.spec.mjs | 10 / 10 | 10 / 10 |
| test/day90Providers20261011.spec.mjs | 12 / 12 | 12 / 12 |
| test/tenantRetention20261010.spec.mjs | 13 / 13 | 13 / 13 |
| test/billingTrial20261011.dom.spec.mjs | 12 / 12 | 12 / 12 |
| test/staffLogin20261009.spec.mjs | 24 / 24 | 24 / 24 |
| test/ownerQueryCoverage20261009.spec.mjs | 20 / 20 | 20 / 20 |
| test/continuousOffsite20261007.spec.mjs | 16 / 16 | 16 / 16 |
| test/ownerWording20261011.dom.spec.mjs | 16 / 16 | 16 / 16 |
| test/pricebookFirstVisit20261009.dom.spec.mjs | 12 / 12 | 12 / 12 |
| test/tenantIsolationRoutes.spec.mjs | 264 / 264 | 264 / 264 |

Local browser launch failures (all `browserType.launch: Target page, context or
browser has been closed`; no product assertion reached):

| Browser spec under test/ | Failed launch-dependent tests |
| --- | ---: |
| astraQuoteScope.browser.spec.mjs | 3 |
| billingCustomerLifecycle20261007.browser.spec.mjs | 3 |
| bookingCalendar20261006.browser.spec.mjs | 1 |
| claudeScopeEditorOrder.browser.spec.mjs | 1 |
| interviewControls.browser.spec.mjs | 3 |
| leadCaptureRepair20261006.browser.spec.mjs | 1 |
| leadsServiceArea20261010.browser.spec.mjs | 3 |
| namedReviewContact20261006.browser.spec.mjs | 2 |
| overageDashboard20261006.browser.spec.mjs | 3 |
| ownerAlertRepair20261006.browser.spec.mjs | 1 |
| ownerAlertsDelivery20261006.browser.spec.mjs | 1 |
| ownerDashboard20261007.browser.spec.mjs | 1 |
| priceBookEditor.browser.spec.mjs | 15 |
| pricebookInterviewSave.browser.spec.mjs | 7 |
| pricebookPreviewFreshness.browser.spec.mjs | 4 |
| quoteConfigurationInterview.browser.spec.mjs | 3 |
| quoteDisplay20261006.browser.spec.mjs | 4 |
| quotePreviewTier20261005.browser.spec.mjs | 1 |
| quoteReauditEditor20261006.browser.spec.mjs | 1 |
| websitePriceDraft.browser.spec.mjs | 2 |

The local environment has no Docker executable. Hosted Docker is the required
container evidence, not an unrun local pass.

## Hosted checkpoint evidence and final-commit gate

[CI run 38113522264](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38113522264),
commit `1b8b25ab7a1027b68de3338e75e796a5e890820b`: **success**.
Test job `114393769459`; Docker job `114393769298`.

| Hosted command | Total | Passed | Failed | Skipped | Cancelled / TODO |
| --- | ---: | ---: | ---: | ---: | --- |
| Owner alerts/dashboard browser regressions | 9 | 9 | 0 | 0 | 0 / 0 |
| npm run test:quote (198 files) | 4131 | 4131 | 0 | 0 | 0 / 0 |
| npm test | 4840 | 4840 | 0 | 0 | 0 / 0 |

Hosted totals exceed local totals by 14 because failed local browser setup
prevented nested assertions from registering; no test inventory was weakened.
All required standalone names were found in the job log, with individual
summaries above. Actual executed-test evidence includes:

- `day90 complete cleanup is idempotent across live, local, daily and continuous copies`
- `day90 admin health is authenticated and secret-free — recovered` and `— permanent`
- `Billing trial shows end, fourteen days left, 60-minute cap and one unconfirmed call`
- `Billing refresh completes the same 125-second trial call as 3 of 60 minutes, never overage`
- all five `Billing approved trial date in ...` cases.

See hosted-checkpoint.json for extracted command summaries and log evidence.
The checkpoint tag job explicitly logged `Checkpoint only: no release tag requested.`

Final-commit CI repeats the cold build, both full gates, every required standalone
file, browser regressions and both Docker smokes. Only its successful dependent
`tag-candidate-h` job may tag this exact report commit. It checks that:

- no application/test/workflow source changed from the verified checkpoint;
- the branch still points to GITHUB_SHA;
- rc-20261011h does not already exist;
- report evidence has zero unresolved non-browser failures, zero standalone
  failures and a clean owner-query inventory.

It creates `git tag -a rc-20261011h <exact report SHA>` and pushes without force.
It never moves/deletes/recreates a tag. Any failing final gate prevents tagging.
The final response records the final run's actual conclusion, test counts and refs.

## Owner-query inventory and new classifications

289 inventoried occurrences: 119 listed prepare, 127 listed exec, 30 reviewed
non-query uses and 13 AST-proven regular-expression exec calls. **Zero unlisted,
zero unused exceptions, zero duplicate keys and zero unused non-query entries.**
Exec categories: 81 migrations, 37 admin and 9 authentication.

New merge classifications, all reviewed directly:

| File:line | Category / reason |
| --- | --- |
| server/src/backups.js:32 | admin — Administrative VACUUM of a copied backup database after tenant-bound removal of bounded retry secrets; no tenant row query. |
| server/src/billingRetentionSteps.js:29 | admin — Administrative SQLite secure_delete setting before tenant-bound erasure; changes page-clearing behavior, not tenant rows. |
| server/src/billingCustomerLifecycle.js:40–53 | Existing migrations exception re-reviewed for the same CREATE TABLE exec, now including billingRetentionLeases and billingRetentionSecrets. Signature a6b3b638d50e27f39ab42ee785a3bb39d0918ed4868843cfb469813811479331 → 94533983e45ce53b33d761acfe5e3297d76081c8a61441cc85a58a918b86f92f. Preserves the migration reason and adds explicit review; prevents an unused old signature. |

All seven day-90 prepare exceptions and all billing branch entries are preserved;
only that obsolete schema signature is replaced. Computed prepare/exec access
still fails even if someone attempts to whitelist it. See owner-query-inventory.json.

## Docker smoke

Hosted checkpoint Docker image:
`sha256:93e68bfd20e21a33edf6b1d6349574d26f1618db2d1c0f02c1f45a0285d5d150`.

- `node verification/receptionist-20261008/docker-voice-smoke.mjs otc-receptionist:synthetic`: PASS, voice enabled, synthetic credentials, provider network disabled, health 200.
- `node verification/railway/docker-smoke.mjs otc-receptionist:synthetic`: PASS, clean build artifacts, private paths blocked, Linux SIGTERM drain, same-container restart, fresh-container redeploy, actual restore CLI and restored application, refusal of unmounted storage and Railway development mode.

These are synthetic containers, not a Railway deployment or a real storage/provider account.

## Final reference verification / limitations

The final user-facing report must include output of:

```
git ls-remote origin refs/heads/claude/release-candidate-20261011h refs/tags/rc-20261011h 'refs/tags/rc-20261011h^{}'
```

Required invariant: branch SHA = peeled tag SHA = the commit containing this
report; the tag object's SHA is distinct because it is annotated.

Saved locally: source, reports, standalone TAPs and raw full-run logs. Published
checkpoint source and evidence are confirmed on GitHub; this report is published
before its final CI/tag. Raw full-run logs remain local; compact results,
standalone evidence and hosted log extracts are committed. No real provider
accounts, real customer data, deployments, Railway changes, messages, public
page/spec edits or subagents were used. Live-provider behavior is outside this
synthetic verification. Local Chromium and Docker could not be exercised here;
hosted evidence covers both required environments.
