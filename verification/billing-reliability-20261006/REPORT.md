NOT CLEAN

# Billing reliability audit — October 6, 2026

**11 confirmed defects, one genuine policy conflict, and two browser suites blocked by the environment.** Customers are not reliably protected against duplicate subscriptions, lost trial activation, incorrect plan access, or unpaid service. The passing baseline does not cover these failures.

Audited source: **`73c00622d6f2df31f57773b32e41355a7421f1a3`**, verified by `git ls-remote` on `codex/quote-release-candidate-20261006` and by the separate clone's HEAD before source inspection. Work branch: `codex/billing-reliability-audit-20261006`. Only this verification directory changes. No application fixes, shared-test edits, spec edits, merges, deployments, subagents, live billing operations, messages, or live-data writes.

## Authority and method

Read `AGENTS.md`, `specs/BUILD_STATUS.md`, the relevant platform sections (4, 5.5, 6.9/6.11, 7, 8, 12.5–12.7, 12.11), build-guide Phase 6, launch authority, and the annual ruling in `specs/RELEASE_BRANCH_INTEGRATION_20261006.md`. Quote/voice specifications supply the route-layer and customer-channel boundaries; their arithmetic was not changed. Historical reports and reported CI passes were not used as proof of reliability.

[Prewritten expectations](EXPECTATIONS.md) specify monetary values and access transitions. Synthetic recurring amounts are 11,900 / 27,900 cents monthly and 119,000 / 279,000 cents annually, with zero initial trial charge and no setup fee. The mixed-invoice fixture also contains handwritten literals before execution: −5,950 + 13,950 = 8,000 cents. Those are synthetic credit/debit values, **not a claimed proration policy**.

Execution uses real migrations, transactions, billing state, billing route installers, local HTTP, Stripe SDK signature verification, the unchanged server entry point, and a real local voice WebSocket with a fake Google session. The route harness has deliberately simple synthetic owner authentication; the existing cold launch/session tests and separate actual-server checks exercise production authentication. All provider session operations are local stubs. Signed local events use disposable signing secrets. No provider API was used to read or alter accounts or catalogue configuration.

Primary provider references checked on October 6: [webhook delivery order and second-resolution timestamps](https://docs.stripe.com/webhooks#event-ordering), [mixed credit/debit prorations](https://docs.stripe.com/billing/subscriptions/prorations), [subscription period fields moved to items](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end), and [Checkout creation parameters](https://docs.stripe.com/api/checkout/sessions/create). These describe supported payload semantics, not live configuration or an invented product policy. Installed SDK `Checkout/Sessions.d.ts` identifies setup_intent as setup-mode only.

Severity: **P1** blocks charging pilot customers; **P2** is a material reliability/UI defect. Every finding below has source evidence and an executable reproduction. Reproduction assertions check the recorded faulty behavior: a successful harness exit confirms the reproduction, **not that the product passed its expected behavior**.

## Confirmed defects

### F01 — P1: trial activation depends on delivery order

- **Business impact:** a customer supplies a card and starts a trial, but onboarding/quoting remains locked; conversion/support churn risk.
- **Source:** `server/src/billingStateService.js:578–593, 811–829`. A single account-wide timestamp/rank discards different objects' evidence. The activation exception only covers `pending_subscription` plus a created-event/checkout-ledger combination. Subscription-mode Checkout does not supply the setup-mode `setup_intent` that this shortcut expects.
- **Minimal reproduction:** E02/E03/E15 in `reproduce.mjs`: deliver a zero-dollar paid invoice before the older trial-created/card-attachment events; alternatively deliver Checkout before the card-attachment update. E15 applies the same four signed-event-shaped facts in all 24 orders.
- **Expected/rule:** bounded, card-backed `trialing` state in every order, under platform §8/§12.11. Stripe explicitly does not guarantee delivery order; distinct events can share second-resolution timestamps.
- **Actual:** **8 orders trialing; 16 pending_payment**. E02/E03 receipt the activation event as `IGNORED_STALE`; card evidence is lost. Retries of the same ID return the stored ignored result.
- **Root cause:** chronological receipt suppression substitutes for reconciliation across invoice, Checkout, and subscription objects.
- **Fix:** persist object-specific evidence and reconcile the current subscription, payment method/setup evidence, and trial boundary under an owner/subscription lock. Do not terminally discard necessary activation facts because an unrelated invoice has a newer timestamp. Exercise all permutations and same-second events, using subscription-mode payloads.

### F02 — P1: unresolved debt can be erased without paying the failed invoice

- **Business impact:** unlimited service after the seven-day grace period despite an unresolved current obligation; platform incurs voice/provider costs without revenue.
- **Source:** `server/src/billingStateService.js:578–586, 645–651, 692–700`; `server/src/planAccess.js:100`. Stored payment-method evidence authorizes active state, and any paid invoice clears all failure evidence. No current failed-invoice ID/period is tracked.
- **Minimal reproduction:** E01: active → failed invoice → subscription `active` update carrying a default method. E09: current invoice fails → a different, historical invoice is paid. S04 repeats the first case through the actual server's SDK-verified webhook.
- **Expected/rule:** preserve grace/debt until resolution of the current failure (platform §12.6). A payment method is not a settled invoice; a historical invoice payment does not settle a different invoice.
- **Actual:** `active`, `paymentFailedAt=null`; E01 still allows access eight days later. Actual-server S04 returns webhook 200 and passes the quote entitlement gate (422 input validation instead of 403).
- **Root cause:** payment-method presence and uncorrelated invoice events are treated as account-wide debt resolution.
- **Fix:** track invoice-specific obligations and reconcile current provider subscription/invoice state before clearing failure/grace. Preserve debt through payment-method or unrelated subscription edits. Only confirmed resolution of the relevant obligation may restore service.

### F03 — P1: local Checkout expiry permits a second provider subscription

- **Business impact:** two independently recurring subscriptions can charge one customer; the second completion fails processing rather than preventing its creation.
- **Source:** `server/src/billingRoutes.js:414–417, 509–510, 553–576`; `billingStateService.js:411–434, 531–550`. Local wall-clock expiry releases the owner slot without retrieving the provider's session/subscription state. The original expired ledger row cannot be consumed by the completion update.
- **Minimal reproduction:** E18: create session 1, complete it in the stub at T+3,500 but delay its webhook; at T+3,601 issue a different request key; complete session 2, then deliver both webhooks.
- **Expected/rule:** the already completed first session is an existing subscription and must prevent another checkout; billing's own `SUBSCRIPTION_ALREADY_EXISTS` invariant applies despite delayed webhooks.
- **Actual:** two provider sessions / two synthetic subscriptions; **zero reconciliation retrieves**. Completion responses **200 then 500**. Ledger remains `EXPIRED` for the first and `OPEN` for the second. This demonstrates the duplicate-subscription path locally; no real charge was attempted.
- **Root cause:** local session expiry is treated as proof that no subscription exists remotely.
- **Fix:** fail closed while reconciling the previous provider session and customer subscriptions, using a durable owner lease. Confirm true expiration/noncompletion before issuing a fresh key. Bind completed sessions even when their local receipt has aged; quarantine duplicate subscriptions for explicit repair rather than silently retrying forever.

### F04 — P1: event-local price lines corrupt current-plan authority and reject valid mixed invoices

- **Business impact:** paying QuoteDone customers can lose quoting; a later invoice can also grant an obsolete higher tier after downgrade. Prorated plan changes can produce permanent webhook retries.
- **Source:** `server/src/billingStateService.js:94–107, 357–376, 569–572, 803`. Every event's price IDs resolve and stamp the account plan. Invoice credit/debit lines are treated as simultaneous subscription base plans.
- **Minimal reproduction:** E04: current QuoteDone subscription → later Operator Checkout completion; E05: current QuoteDone → payment of an old Operator invoice; E06: invoice with an Operator credit and QuoteDone debit.
- **Expected/rule:** platform §5.5 requires the current subscription's plan to govern access. Invoice history must not redefine the current subscription; supported plan-management events must reconcile mixed proration lines without inventing proration timing/rates.
- **Actual:** E04/E05 persist `Operator` and deny QuoteDone access. E06 throws `AMBIGUOUS_PRICE`, writes no receipt, and would produce webhook 500. Stripe documents that a single subscription operation can create credit/debit invoice items.
- **Root cause:** subscription items, Checkout selection, and invoice line history share one plan-resolution function with no current-subscription authority.
- **Fix:** determine current entitlement from the current subscription's configured base item. Reconcile invoices to their specific obligation/period; handle mixed historical/proration lines separately. Do not permit delayed Checkout completion to overwrite an already confirmed current plan.

### F05 — P2: invoices erase scheduled cancellation from local state and UI

- **Business impact:** the owner believes cancellation is no longer scheduled; avoidable support, churn and trust loss.
- **Source:** `server/src/billingStateService.js:574`; `billingRoutes.js:703`; `client/src/billing.jsx:88`.
- **Minimal reproduction:** E07: subscription update sets `cancel_at_period_end=true`; deliver an invoice.paid object without that subscription-only field.
- **Expected/rule:** maintain accurate cancellation state (§6.11/§12.7) until a subscription update/deletion changes it.
- **Actual:** `cancelAtPeriodEnd` becomes 0; billing status returns false and the UI's cancellation notice disappears. This does not cancel the provider's cancellation instruction.
- **Root cause:** an absent field is mapped to false for every event type.
- **Fix:** update cancellation fields only from authoritative subscription/explicit cancellation evidence; preserve them for invoice/Checkout events.

### F06 — P2: paid Checkout completion can leave an impossible grace state

- **Business impact:** a supported paid-completion handler can deny access after recording payment evidence; customer recovery fails.
- **Source:** `server/src/billingStateService.js:15, 592–597`; `planAccess.js:109–112`.
- **Minimal reproduction:** E08: existing account in `payment_failed` receives a newer accepted `checkout.session.completed` with `payment_status='paid'`.
- **Expected/rule:** recovery must leave lifecycle status and timestamps consistent (§12.6); either preserve unresolved debt or restore confirmed resolved access.
- **Actual:** status stays `payment_failed` while failure/grace timestamps are cleared. Access denies with `PAYMENT_FAILURE_TIME_REQUIRED`.
- **Root cause:** serving-status preservation and failure-clearing are separate conditions.
- **Fix:** apply a single consistent recovery transition after correlating payment to the current obligation; never clear failure evidence while retaining a failure status. This is a confirmed supported-input invariant defect; the local experiment does not establish how often this event interleaving occurs at Stripe, so it is not elevated to P1.

### F07 — P2: elapsed grace does not persist suspension

- **Business impact:** billing/dashboard status and lifecycle logs remain stale, masking suspended accounts and failing the required transition workflow.
- **Source:** `server/src/billingStateService.js:867–896`; `server/src/server.js:485–488`; `billingRoutes.js:696–701`. The sweep exists but has no production caller/scheduler. Billing GET returns raw persisted status.
- **Minimal reproduction:** E20: advance the local clock eight days after failure; GET billing status. S01 starts the actual server with a failure already eight days old. E20 then invokes the sweep manually as a control.
- **Expected/rule:** unresolved after seven days → persisted SUSPENDED, logged transition (§12.6).
- **Actual:** raw status stays `payment_failed`, while access correctly denies due to expired grace. Manual sweep suspends one row; the actual entry point never does it.
- **Root cause:** lifecycle service is not connected to a worker or reconciliation path.
- **Fix:** install a bounded, restart-safe grace sweep with idempotent transition/outbox writes and lifecycle shutdown handling. Keep request-time denial as defense in depth.

### F08 — P2: grace-state billing UI contradicts full-service backend access

- **Business impact:** the owner sees instructions to start a new trial when their existing subscription is in recoverable grace; setup progress is obstructed/confusing.
- **Source:** `client/src/billingTransport.js:60–63`, `client/src/billing.jsx:89`; compare `server/src/planAccess.js:109–116`.
- **Minimal reproduction:** E14 passes a current payment-failed account inside grace to the production backend access helper and client continuation helper.
- **Expected/rule:** seven-day full service (§12.6); UI should describe existing failure/recovery and retain eligible setup access.
- **Actual:** backend allows `PAYMENT_FAILURE_GRACE`; `canContinueSetup=false`; the JSX selects “Complete checkout ... start ... 14-day trial.”
- **Root cause:** frontend recognizes only active/trialing, omitting grace.
- **Fix:** expose/use the server's access decision or mirror the exact validated grace boundary in the client, with correct payment-recovery copy. Function execution and JSX source confirm the discrepancy; rendered-browser verification was environment-blocked.

### F09 — P1: unpaid accounts retain dashboard write access

- **Business impact:** suspended/expired-grace customers retain unpaid product mutations; restriction is inconsistent across features.
- **Source:** `server/src/quoteDoneRoutes.js:208, 276–279`; `server/src/server.js:245–246, 249–251, 363–365`. These writes have role authentication without an account-lifecycle write gate.
- **Minimal reproduction:** S03, against the unchanged server, after grace is already expired: PATCH the synthetic lead to `DISMISSED`; POST account edits.
- **Expected/rule:** dashboard read-only except billing after unresolved grace (§12.6). S02 confirms normal protected quoting already denies the same account.
- **Actual:** both writes return **200** and persist changed data.
- **Root cause:** account-access enforcement is applied to selected feature/provider routes rather than all nonbilling mutations.
- **Fix:** add a consistent lifecycle mutation guard, explicitly preserving billing/auth recovery and read-only access. Enumerate intentional exceptions from an approved policy; do not assume every onboarding write is exempt.

### F10 — P1: completed voice calls never increase billed minutes, defeating the trial cap

- **Business impact:** repeated trial calls consume paid AI/telephony resources beyond the advertised 60-minute cap; metering cannot support correct overage revenue.
- **Source:** `server/src/voice/voicePersistence.js:148–151, 222–223`; `productionVoiceRuntime.js:54, 99–101`. Calls start with zero minutes; completion updates duration but not minutesBilled; the cap reads summed minutesBilled.
- **Minimal reproduction:** V01 in `voice-meter-check.mjs`: verified Operator trial, signed local incoming request, actual production voice WebSocket, synthetic Google session; advance the clock 3,601 seconds, stop the call, then send the next incoming request.
- **Expected/rule:** ceil(3,601/60)=**61** connected minutes; current trial call finishes with its overrun absorbed, next call falls back (§12.5/§12.11).
- **Actual:** completed duration **3,601**, minutesBilled **0**, usage **0**, next call starts AI. No runtime errors.
- **Root cause:** missing billable-minute finalization/provider-leg accounting; the otherwise working cap is fed a permanently zero meter.
- **Fix:** durably finalize signed provider-connected call duration once per call/leg; round each eligible call up; exclude spam and fallback as specified. Scope trial usage to the trial window and paid usage to billing periods. Verify duplicates, disconnects and recovery without double counting; retain the no-mid-call-cutoff rule. Overage provider submission remains a separate incomplete capability below.

### F11 — P2: current Stripe subscription shape loses billing-period end

- **Business impact:** persisted/API period state is missing or stale, undermining renewal/cancellation visibility and future period accounting.
- **Source:** `server/src/billingStateService.js:158, 575`; `server/src/server.js:164–169`. Installed Stripe defaults to `2026-08-26.dahlia` and server does not pin an older API; subscription period fields moved to subscription items in Basil. Installed SDK types corroborate the change.
- **Minimal reproduction:** E21 sends a signed local subscription object with only `items.data[0].current_period_end`, then GETs billing status.
- **Expected/rule:** accurate persisted billing state; configured base item's end T+30 days = `2026-11-05T12:00:00.000Z` in this fixture.
- **Actual:** event accepted 200; stored and returned currentPeriodEndAt both null.
- **Root cause:** parser and fingerprint only read the legacy subscription-level field.
- **Fix:** explicitly support and test the configured webhook/API versions, resolve period boundaries from the base subscription item, and include them in receipt integrity. Preserve tested legacy parsing only where deliberately supported. Exact deployed webhook version was not inspected, so exposure on an older pinned endpoint is conditional; modern payload failure is confirmed.

## Genuine policy conflict — separate from defects

**PC01: what features does an Operator trial receive?** Platform §8 says trials have full QuoteDone features. Platform onboarding §4 permits a trial of any tier and defers jurisdiction outside QuoteDone trials/tier; §5.5 restricts quoting to QuoteDone/Scale. Source `planAccess.js:133–134` and the cold launch tests implement selected-tier trials: Operator trial cannot quote. These statements do not establish one unambiguous entitlement rule. Decide whether trial entitlement temporarily includes QuoteDone independently of the eventual paid plan, or whether “full QuoteDone” must be amended. No policy choice or entitlement change was made in this audit.

Upgrade/downgrade effective dates/proration, annual-guarantee refund allocation, access after refund, and repeat-trial eligibility are **unspecified**, not invented conflicts. F04 concerns authoritative current plan and valid event reconciliation regardless of those choices. New Scale signup/checkout is explicitly unsupported by the current closed API/config/UI; historical Scale subscriptions are still mapped. Older platform/build-guide Scale offers need documentation alignment, but absence of new Scale purchases is not classified as a duplicate-charge or activation defect.

## Unsupported/incomplete capabilities and limits

| Capability | Source/execution conclusion | Business implication |
|---|---|---|
| Self-serve 30-day first-month guarantee/refunds | S05: POST `/api/billing/refund` 404. E22: verified `charge.refunded` 200 IGNORED, state unchanged. No refund implementation/provider call in production source. | Cannot fulfill the §8 self-serve guarantee locally. Refund-to-access policy must be approved; no supported refund corruption is claimed. |
| Paid minute allowances, overage submission | No production Stripe usage/meter submission or overage price configuration. Config maps base prices only; runtime does not pass supplemental IDs. Hand expectations: Operator 301 minutes → 35 cents; QuoteDone 1,202 → 70 cents. | Metered overage is incomplete; live price/catalogue and quota/overage billing cannot be accepted by these stubs. A future overage invoice containing an unconfigured price would be rejected; this is a compatibility gap, not an observed live invoice. |
| Notifications/trial day-10/day-13 emails | Billing enqueues `billing.state_changed` in events/outbox, but production consumers do not dispatch billing outbox emails; server's outbound-webhook worker handles its own webhookDeliveries. | Queuing is not owner notification. Required lifecycle/reminder delivery remains incomplete. |
| Cancellation wind-down/export/number release | Supported terminal webhook correctly cancels entitlement. Portal is a session handoff; no installed billing offboarding orchestrator implements §12.7. | Self-serve provider cancellation does not establish forwarding instructions, 14-day wind-down, 30-day export or release. |
| Trial cancellation/no charge | Local deletion correctly denies immediately; Checkout asks for a 14-day card-backed trial. | Whether portal cancels a trial immediately, and whether it avoids conversion, depend on external portal settings not inspected here. No charge/refund/provider change was permitted. |
| Real prices, currency, portal catalogue, webhook configuration | IDs/URL syntax validated; synthetic selections route correctly. Price amounts/currency/recurrence are not retrieved/validated by billingConfig. | Actual live monetary amounts, portal offerings, recovery/smart retries and provider behavior remain unverified. No assertion that synthetic amounts prove live amounts. |
| Missing-event/provider recovery | Webhooks retry failures; exact duplicates are durable. No installed periodic provider-state reconciliation for missed events. | This audit proves specific delivery failures above, not resilience to every permanent provider outage/lost event. No invented expiry policy for active subscriptions. |
| Browser UI | Fresh build passed; Chromium archive downloads failed as invalid/truncated ZIPs; both existing browser scripts fail before page creation due missing executable. | Zero rendered browser workflows accepted locally. Functional helper/source UI findings remain confirmed within stated limits. |

## Suspicion resolution and coverage

| Area stressed | Conclusion/evidence |
|---|---|
| Redirect success without confirmed payment | Safe in observed paths: checkout creation stays pending, URL query alone has no activation write. E17 plus source; existing cold launch tests. Browser query-return scenario not completed. |
| Duplicated events and concurrent requests | E25: 201/201/409 and one provider session. E26: two 200 acknowledgements, one receipt/log/outbox. Exact repeats safe; the distinct-key expiry path is F03. |
| Changed payload under same event/request key | Cold billing tests and E17 reject conflicts. No duplicate session. |
| Out-of-order/same-second events | F01/F04/F02 confirmed. E24 independently confirms an older failed invoice cannot regress a newer paid recovery. Timestamp ordering protects that case but does not prove convergence. |
| Raw-body webhook authentication | E16 rejects wrong secret, altered bytes, expired signatures (400/400/400); valid signature 200. E27 rejects cross-customer hydration with 500 and no activation. Actual server S04 uses SDK verification. |
| Wrong tenant/customer/subscription | E11 cross-account IDs rejected atomically; existing routes prohibit body-provided ownership and staff billing. Reads use resolved owner/customer/subscription associations. No cross-tenant access confirmed. |
| Partial state/log/outbox writes | E10 injection rolls back user/account/history/receipt/log/outbox; exact retry gives one receipt/outbox. Safe. |
| Checkout response loss | E19 local receipt-write failure gives 502 then exact-key recovery 201, same provider key, one provider session. Existing tests cover ambiguous requests, leases and recovery older than 23 hours. |
| Repeated failed-payment retries | E12 retains first failure and suspends on subsequent post-grace event. Safe in that path; F02 shows unrelated events can clear debt. |
| Cancellation/re-subscription | E13 terminal subscription cannot reopen; cold billing tests require newer authorized ledger Checkout for replacement. F05 corrupts scheduled visibility. Immediate portal behavior/wind-down remains unaccepted. |
| Current invoice API shape | E23 succeeds with parent.subscription_details and pricing.price_details; F11 isolates the unsupported period field. |
| Checkout integration_identifier parameter | Supported in the installed SDK and current official creation API; the suspected unknown-parameter failure is ruled out. Existing cold route tests execute the configured request successfully with local stubs. |
| Trial cap and metering | Existing cap helper tests pass; actual recorded voice call fails V01/F10. |
| Current-state backend enforcement | S02 denies authenticated/public quoting from an expired-grace account; S03 identifies write omissions. Production voice rereads persisted plan/status. |
| Full-service UI agreement | F08: helper diverges in grace. F05: persisted cancellation flag erases UI notice. Browser evidence remains blocked, not a product test pass. |

No open suspicion is presented as a defect without execution. Unverified provider frequency/configuration, unsupported capabilities and environment failures are labeled above.

## Reproduce and test evidence

Use Node 22 with `npm ci`. On systems without `/tmp`, set `TMPDIR` to a writable temporary directory. Then, from the repository root:

```sh
node verification/billing-reliability-20261006/reproduce.mjs
node verification/billing-reliability-20261006/server-check.mjs
node verification/billing-reliability-20261006/voice-meter-check.mjs
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-concurrency=1 --test-reporter=tap test/billingConfig.spec.mjs test/billingRoutes.spec.mjs test/billingStateService.spec.mjs test/planAccess.spec.mjs test/launchPlans.spec.mjs test/platformSchema.spec.mjs test/authSessionService.spec.mjs test/voicePersistence.spec.mjs test/voiceRuntimeRoutes.spec.mjs test/voiceQuotePathRegression20261005.spec.mjs test/bookingAdminRoutes.spec.mjs test/onboardingCalendar.spec.mjs client/test/billing-transport.test.mjs
```

| Run | Result | Evidence |
|---|---|---|
| Cold core (default Node 24) | 53 pass, 0 fail/skip/cancel/TODO | `cold-core.tap` |
| Cold relevant, fresh Node 22 install + writable TMPDIR | **139 pass**, 0 fail/skip/cancel/TODO; 13 files | `cold-relevant-recovered.tap` |
| Independent synthetic audit | **34 named experiments**, including **24 permutations + four monetary selections**, **60 expanded scenarios** total; all reproduction/control assertions completed | `independent-results.json`, `server-results.json`, `voice-meter-results.json` and corresponding logs |
| Cold owner/widget builds | both pass | `cold-build.log` |
| Initial Node 24 cold install | environment failure: node-gyp header extraction EINVAL/fchown | `ENVIRONMENT.md` |
| Node 22 cold install | 262 packages installed, exit 0 | `cold-install-node22.log` |
| Initial relevant run before TMPDIR correction | 13 preload worker failures, no application checks executed | `cold-relevant.tap` |
| Existing billing/launch browser suites | two launch failures, zero completed workflows | `billing-browser-attempt.log`, `launch-browser-attempt.log`, `browser-install.log` |

The 53 core tests overlap the 139 relevant tests: **139 distinct existing tests**, **192 successful existing-test executions**, not 192 distinct tests. The 34 independent experiments expand to 60 by counting each E15 permutation and each E17 selection separately; HTTP requests/assertions are not added as further tests. No full quote/full application suite or hosted CI result is claimed by this scoped audit. [Source binding](SOURCE_BINDINGS.json) records inspected files against the exact base; all tracked application/spec/test/CI bytes remain unchanged.

## Prioritized paid-pilot blockers and final binding

1. **Before taking money:** prevent duplicate subscriptions (F03), make trial activation converge (F01), correlate debt resolution (F02), and stop plan corruption/mixed-invoice failures (F04).
2. **Before enabling paid voice:** finalize minute accounting and enforce the trial cap (F10); finish supported allowance/overage handling rather than silently absorbing unlimited costs.
3. **Before promising lifecycle reliability:** enforce read-only restrictions (F09), install grace transitions (F07), repair cancellation/period state (F05/F11), consistent paid completion (F06), and grace UI (F08).
4. **Commercial gate:** resolve PC01, implement or explicitly amend the refund/offboarding/notification promises, obtain external catalogue/portal acceptance under separate authorization, and complete browser checks in an environment with Chromium.

**Audited SHA:** `73c00622d6f2df31f57773b32e41355a7421f1a3`.
**Coverage:** plan selection → local Checkout → verified webhooks → SQLite billing/user/history/receipts/outbox → private/public/voice access; trials, plan changes, invoices/renewals/failures/recovery, cancellation/re-subscription, unsupported refunds and metering clearly distinguished.
**Counts:** 11 confirmed defects; one policy conflict; 139 distinct existing tests passed; 34 independent experiments / 60 expanded scenarios; two builds passed; two browser suites environment-blocked.
**Verified GitHub report:** [billing-reliability-20261006/REPORT.md](https://github.com/sportaholic000-hue/off-the-clock/blob/codex/billing-reliability-audit-20261006/verification/billing-reliability-20261006/REPORT.md). Remote commit, exact-tree comparison and report readback are recorded in [UPLOAD_VERIFICATION.md](UPLOAD_VERIFICATION.md).
