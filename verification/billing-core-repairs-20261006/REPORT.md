# Billing core repairs — October 6, 2026

**Implementation checkpoint; acceptance remains incomplete.** All seven assigned defects have repairs and new regression coverage. Four assertions in existing tests outside the assigned ownership conflict with these repairs. They remain unchanged. The exact proposed test-only patch is [UNAPPLIED-test-integration.patch](UNAPPLIED-test-integration.patch); a private-index validation passes **29/29**, with no working-tree changes. Full CI cannot be represented as green while those assertions remain.

Start verified: `b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3`, tree `5329a9547c8b9364346a738663996b6d2d0e88e9`. Separate clone, branch `codex/billing-core-repairs-20261006`. No subagents, merges, deployment, live provider operations or production data. Governing trial decision retained: selected-plan features, 14 days, card required, 60 voice minutes. The unapproved callback/deadline policy is untouched.

## Findings

| Finding | Implementation and proof | Acceptance state |
|---|---|---|
| F01 | Object-specific subscription evidence replaces account-wide event suppression. **96** trial permutations cover both plans, different-second and same-second events. Conflicting snapshots require provider reconciliation; no event-type priority. | Repair implemented; **open integration dependency** for the old test forbidding card-only Checkout. |
| F02 | Durable tenant/subscription/invoice obligations; unrelated paid invoices and card edits cannot clear them. Settlement correlates the invoice ID. **240** five-fact debt/recovery permutations plus distinct-debt and migration checks. | Repair implemented; **open integration dependency**: old tests assume an active card snapshot or a different paid invoice settles debt. |
| F03 | Durable owner lease, provider-confirmed expiry and subscription checks before replacement; completed/lost-response sessions bind without access; delayed expired-ledger completion is consumed, duplicate subscriptions quarantined. | Repair implemented; **open integration dependency**: old expiry test lacks provider reconciliation and expects local time alone to release the slot. |
| F04 | Current subscription base items govern access; Checkout/invoice history cannot override them. Mixed credit/debit invoices accepted as invoice evidence. **48** plan/cancellation permutations, SDK contract and overlapping provider-read regression. | Fixed in owned source and targeted tests. Full acceptance still depends on overall gate. |
| F05 | Cancellation comes from subscription evidence and survives invoices/Checkout. | Fixed in owned source and targeted tests. |
| F06 | Failure status/time/grace reconcile together; unrelated paid Checkout preserves debt. Legacy missing failure time stays suspended; exact invoice recovery restores original grace or paid access. | Repair implemented; **open integration dependency** overlaps the incorrectly correlated old recovery test. |
| F11 | Configured base item period start/end persist; supplemental periods do not replace them. Modern item fields enter v2 receipt integrity; deliberately supported legacy fields continue working. | Fixed in owned source and targeted tests. |

All seven reproduced on the pinned source **before source edits**: 12 assigned experiments, including 24 trial orders (35 expanded scenarios). [Prewritten expectations](EXPECTATIONS.md), [baseline log](baseline.log), [baseline results](baseline-results.json). The baseline assertions prove old bugs; they are not passing product tests.

## Source and regression evidence

- `server/src/billingStateService.js`: normalization/digest, transactional evidence reducer, provider reconciliation, current-plan authority, terminal protection and debt recovery.
- `server/src/billingEvidence.js`: subscription facts and identity-checked invoice obligations.
- `server/src/billingProvider.js`: durable owner lease, fencing, bounded provider operations.
- `server/src/billingRoutes.js`: card-required Checkout, provider reconciliation before expiry replacement, closed-session response-loss recovery, webhook integration.
- `server/src/billingCoreMigration.js`, billing-only schema/migrations: closed-session persistence and legacy debt holds.
- `test/billingCoreRepair20261006.spec.mjs`: **116** core cases.
- `test/billingCoreRepair20261006Permutations.spec.mjs`: **288** further delivery-order cases.
- `test/billingCoreRepair20261006Provider.spec.mjs`: **11** SDK/provider/concurrency cases.
- `test/billingCoreRepair20261006Recovery.spec.mjs`: **10** migration/rollback/restart cases.

**425 distinct new tests pass in complete local per-file runs**, zero failures/skips/cancellations/TODOs. The proposed integration validation's 29 tests overlap existing repository tests and are not added to that distinct-new-test count. An earlier combined local attempt exited without a final summary and is not counted as a passing combined gate.

Installed SDK **Stripe Node 22.6.2**, default API **2026-08-26.dahlia**, checked against installed types and official Stripe references in [DESIGN.md](DESIGN.md). The SDK contract test sends only to a local synthetic HTTP server. Money expectations were written before execution: 11900/27900 monthly, 119000/279000 annual, zero trial charge; mixed fixture -5950+13950=8000 cents. No provider amount, proration timing or refund policy is invented.

## Migration and recovery

The new migration preserves old receipts and unrelated schema. Only billingCheckoutRequests is rebuilt, atomically, to preserve closed provider sessions without a redirect URL after response loss. Fresh and legacy stores, interrupted copy/drop rollback, repeated migrations, actual process restart, receipt loss, changed/exact retries, wrong-tenant responses, concurrent operations, lease takeover and provider timeout are tested.

Unattributable legacy debt stays held for explicit recovery. A known old failure invoice is retrieved and checked against the exact owner/customer/subscription before releasing its hold. Missing failure times suspend access until evidence recovers the original time; no new grace is invented. No live migration ran. Refund/void/write-off handling is not added.

## Gates and publication

Cold npm ci and owner/widget build passed. Local browser startup encounters SIGTRAP; local broad attempts and their incomplete summaries are retained, not counted as passes. No skipped tests, weakened gates or known-failure allowances were introduced.

First verified checkpoint: `43a71dec195d3d29506f91f5c97c5741868b6809`, exact uploaded tree `f95df52bbb45fef9f9f5466565cf1f1892d7490e`. [Hosted run 37512559114](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37512559114): strict quote **2068/2068**; full **2568 passed / 3 failed / 0 skipped** (2571 total). Failures are precisely the three old unsafe expectations above. This was before the explicit card-only control and expanded final tests. Final source revision/gate results will be recorded separately after publication; this checkpoint does not claim them in advance.

## Still open

**F07, F08, F09 and F10 remain open.** Refund/guarantee handling, metered overage, notification/reminder delivery, cancellation/offboarding and permanent missing-event reconciliation remain incomplete. F10 means the 60-minute trial cap is not established end to end by this batch. Protected feature entry points and client wording outside the assigned source ownership are unchanged. No real Stripe configuration/catalogue acceptance was performed. This batch **does not establish launch readiness**.
