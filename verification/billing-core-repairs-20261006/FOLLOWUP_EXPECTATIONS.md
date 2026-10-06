# Pre-execution expectations — continuation from 3d3b88c

Synthetic data/providers only. Written before the baseline executions below.

## Four authorized existing test changes

| Test | Old expectation | Governing approved rule | Correct behavior / existing implementation evidence |
|---|---|---|---|
| authenticated Checkout creates and persists one provider customer | No payment_method_types field | specs/TRIAL_ENTITLEMENT_DECISION_20261006.md:19; specs/platform_spec_v2.md:873: card required | Explicit card-only collection, 14 days, zero initial charge; billingRoutes.js creates with payment_method_types=[card]. Existing new provider-contract regressions check all four selections. |
| expired open Checkout releases owner slot | Local expiry is enough; no provider retrieve/list | Owner-assigned F03; verification/billing-reliability-20261006/REPORT.md:43–51 (F03), expected/rule and fix: completed session must prevent another Checkout despite delayed webhook | Retrieve old session; verify expired and no nonterminal tenant subscription before second session. Exact same-key reply stays sealed. |
| older out-of-order failure cannot regress newer active state | Active subscription/card snapshot makes unrelated unpaid invoice stale | specs/platform_spec_v2.md:828–834: unresolved failure gets seven days then suspension; verification/billing-reliability-20261006/REPORT.md:33–41 and owner-assigned F02 expressly forbids method edits erasing debt | Invoice remains unpaid; preserve its original failure instant + seven days. Different objects are not ordered by event-type priority. |
| payment failure ... paid recovery restores immediately | Paying a different invoice clears failed invoice | specs/platform_spec_v2.md:833–834: resolved restores; owner-assigned F02 requires resolution of current debt | $119 = 11,900 cents paid on the failed invoice restores active and clears failure/grace atomically. An unrelated payment does not. |

The platform spec gives lifecycle/card policy; the explicit repair instructions and historical audit F02/F03 supply invoice/session correlation requirements, not invented spec wording.

## Baselines / regressions

F07: failure at T; T+7d-1ms still payment_failed/access allowed. T+7d and T+8d suspended/access denied; persisted user state and exactly one lifecycle event/outbox. Restart/second sweep produce no duplicate transition; injected failure rolls the transaction back; batch is bounded.
F08: inside grace, setup allowed and payment-recovery copy. At boundary/invalid/future failure instant, denied; never prompt an existing failed subscriber to start another trial.
F09: at expired grace or suspended, GET data and billing/auth recovery remain available; lead PATCH and account POST return403 with unchanged records. Inside grace both permitted. Staff use owner lifecycle. A paid JWT cannot override persisted debt. Fresh pre-checkout registration retains the spec's account setup path.
F10: connected3,601seconds =>61minutes, trial overrun $0, next call fallback. 0/1/59/60/61seconds=>0/1/1/1/2minutes. Each call rounded separately: two31second calls=>2minutes. Duplicates/restart never add again. Spam/fallback=>0. Trial usage excludes calls outside the exact persisted trial start/end; paid usage uses persisted subscription period. No Stripe usage submission or charges.

Refund/overage/notifications/offboarding: inspect current handlers and execute available local paths. Missing implementations stay missing; no feature creation. Unsupported refund must not mutate billing or call provider. No policy about refund access/proration/repeat trials is invented.
