# Billing-system repair evidence — 2026-10-08

Branch: `fix/billing-system-20261008`
Base: `4e6cf6330a7253f086fa167037d572d28eac0029` (`fix/engine-audit-20261008`).

All test data, provider identities and Stripe/email/carrier responses are synthetic. No deployment or merge is part of this change. The prohibited directories and voice prompt/guide files are unchanged. Billing arithmetic and stored charge amounts use integer cents; tenant operations use `ownerQuery`.

## Before and after

The identical regression files were executed against a detached worktree at the pinned base (no tracked source changes) and against the fix. The 9 baseline passes are existing safe behaviors; every requested item has failing baseline regressions.

| Item / test-name prefix | Base passes / failures | Fixed passes / failures |
| --- | ---: | ---: |
| `billing repair 1` — failed-call routing | 5 / 20 | 25 / 0 |
| `billing repair 2` — trial warnings | 1 / 2 | 3 / 0 |
| `billing repair 3` — overage installments | 1 / 16 | 17 / 0 |
| `billing repair 4` — owner dates | 2 / 6 | 8 / 0 |
| Total | 9 / 44 | 53 / 0 |

Raw outputs: [base TAP](regressions-base.tap), [fixed TAP](regressions-after.tap). [Every test name and result](regressions.json).

Regression command:

```sh
node --test --test-concurrency=1 --test-reporter=tap test/billingSystem20261008.spec.mjs test/voiceBillingSystem20261008.spec.mjs
```

## Changes and file mapping

1. **Failed receptionist calls bill zero.** Persist the exclusion through operator-off routing, startup/session failures, fallback capture (including direct/partial/again entry), warm-transfer acceptance in either callback order, late media completion, summary enrichment and restart recovery. Signed whole-call duration and replay tests include the owner's leg. Source: `server/src/billingVoiceUsage.js`, `server/src/billingMinuteService.js`, `server/src/callSummaryService.js`, `server/src/voice/voicePersistence.js`, `server/src/voice/voiceFallbackRoutes.js`, `server/src/voice/voiceProviderAdapters.js`. Tests: `voiceBillingSystem20261008.spec.mjs` and item 1 in `billingSystem20261008.spec.mjs`.

2. **Trial warnings.** Confirmed usage produces the 30-left and zero-left dashboard/email warnings once per trial. No signup warning at 60, no provisional-duration warning and no trial overage. A corrected trial end does not reset warning identities. Source: `server/src/billingMinuteService.js`, `server/src/billingUsageSchema.js`. Tests: item 2 in `billingSystem20261008.spec.mjs`; updated trial expectation in `overageMinute20261006.spec.mjs`.

3. **Incremental overage collection.** Reserve immutable confirmed-duration evidence for each installment, charge at 2,500 cents or more (72 extra minutes = 2,520 cents), and charge positive remainders at month/service end. Unconfirmed calls never contribute charged cents and do not delay an already-confirmed threshold. An unpaid invoice blocks subsequent Stripe invoices across months. Closed remainders are retained locally while blocked and survive recorded call-data retention. Preserve old invoice identities during migration; use a distinct idempotency key for every later installment. Retain automatic collection after service end, receipts and seven-day payment grace; ended-service notices report unpaid debt without promising a retry or ongoing service. Monthly and annual allowance periods follow the same rule. Dashboard separates charged and uncharged amounts; all three specified policy sentences match the owner's text exactly. Source: `server/src/billingMinuteService.js`, `server/src/billingUsageSchema.js`, `server/src/billingUsagePeriods.js`, `server/src/billingOverageProvider.js`, `server/src/billingCustomerLifecycle.js`, `server/src/server.js`, `client/src/billing.jsx`, `client/src/minuteUsage.jsx`. Tests: item 3 in `billingSystem20261008.spec.mjs`; existing lifecycle, retention and overage expectations updated in `billingCustomerLifecycle20261007.spec.mjs`, `billingBackupLeftovers20261007.spec.mjs`, `overageMinute20261006.spec.mjs`, `overageDashboard20261006.browser.spec.mjs`. The production wiring assertion in `voiceQuotePathCases20261005.mjs` now requires immediate usage processing.

4. **Impossible owner dates.** A shared UTC round-trip helper rejects rolled calendar dates with the existing follow-up error, and is shared by blackout validation and owner report-date checks. Valid leap dates and existing second/millisecond UTC formats remain accepted. The other `Date.parse` sites handle stored timestamps, provider receipts or server-generated slot data rather than owner-entered dates. Source: `server/src/ownerDate.js`, `server/src/ownerWorkflowService.js`, `server/src/ownerReportTime.js`, `server/src/bookingAdminService.js`. Tests: item 4 in `billingSystem20261008.spec.mjs`, plus existing booking and owner-dashboard date tests.

The route hashes in `verification/tenant-isolation-20261007/route-sources.json` were regenerated with `routeSourceInventory('server')` from `test/helpers/tenantRouteInventory.mjs` and checked against the live source inventory.

## Full verification

| Command | Total | Passed | Failed | Skipped / cancelled / TODO |
| --- | ---: | ---: | --- | --- |
| `npm test` | 4,274 | 4,217 | 57 Chromium launch failures | 0 / 0 / 0 |
| `npm run test:quote` | 2,996 | 2,939 | 57 Chromium launch failures | 0 / 0 / 0 |

No non-browser failures. The quote architecture check passed. The final targeted billing/lifecycle/voice run passed **174/174**. Failure names and log hashes are in [full-gates.json](full-gates.json).

Runtime: Node 22.16.0. Counts are the actual local TAP totals. `npm ci` and `npm run build` completed successfully. Tracked `client/dist` output is restored before committing.

Browser module: `PRICEBOOK_BROWSER_MODULE=$(npm root -g)/playwright` (Playwright 1.56.0). The installed Chromium 141 headless shell exits with `SIGTRAP` at launch in this sandbox, before browser assertions execute. These browser checks remain for Claude's working browser environment; no failure is silently skipped or exempted by a test change.
