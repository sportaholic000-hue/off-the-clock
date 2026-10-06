# Pre-execution expectations — billing core repair batch

Pinned source b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3; tree 5329a9547c8b9364346a738663996b6d2d0e88e9. Separate clone, branch codex/billing-core-repairs-20261006. Synthetic data only.

Handwritten monetary expectations, before experiments: Operator monthly $119 = 11,900 cents; annual $119 x 10 = $1,190 = 119,000 cents. QuoteDone monthly $279 = 27,900 cents; annual $279 x 10 = $2,790 = 279,000 cents. Card-backed trial starts at $0 = 0 cents, lasts 14 days, selected-plan access, 60 voice minutes. Mixed invoice fixture: -$59.50 + $139.50 = $80.00 = 8,000 cents. These are fixture amounts, not a new proration policy. No test authorizes actual provider charges.

F01: all 24 orders of trial-created, card-attached, Checkout-completed and zero-dollar invoice converge to trialing with the same 14-day end. Repeat with all four events in one second, both plans. Zero invoice alone cannot grant paid access. Missing card remains pending.
F02: failed invoice in_CURRENT at T+10 establishes failure T+10, grace T+10+7 days. Card edit, active subscription snapshot or in_HISTORICAL paid $119 do not clear this debt. Paying in_CURRENT restores access; a late failure for that paid invoice cannot regress it. Two debts require both resolutions.
F03: session 1 completes before expiry, delayed webhook, new key after local expiry => one provider session/subscription only. Provider retrieval/reconciliation must happen before any replacement create. Provider open/unknown/timeout/mismatch blocks replacement. Provider-confirmed expired with no nonterminal customer subscriptions may allow one new session. Response loss and restart reuse original idempotency key. Conflicting subscriptions are retained for review, never adopted silently.
F04: current subscription QuoteDone price controls access after old Operator Checkout/invoice; mixed -5950/+13950 invoice paid 8000 accepted without plan change. Subscription downgrade controls likewise. Invoice-only evidence cannot select current base plan.
F05: cancel_at_period_end=true persists across invoice/Checkout events; only subscription authority changes it.
F06: unresolved invoice keeps status payment_failed (or suspended after grace), failure timestamp and grace together through paid Checkout; correlated paid invoice clears all three consistently.
F11: modern configured base item period start T=2026-10-06T12:00:00Z and end T+30 days=2026-11-05T12:00:00Z persist; supplemental item boundaries do not replace them. Changing either period under a previously receipted event ID conflicts. Explicit legacy subscription fields remain supported.

All exact repeats: one receipt/transition/outbox. Changed authoritative input with same ID: conflict and no mutations. Owner/customer/subscription mismatch: atomic rejection. Injected write failure rolls back evidence, state, receipts and outbox. Fresh and pre-repair migrated stores must retain unrelated schema and data; unknown legacy debt must fail closed, never be guessed settled. Migration repeated/restart is idempotent.

The baseline runner is copied from the historical audit and executes only assigned finding reproductions. Its assertions intentionally prove the OLD failures; it is evidence, not a passing product suite. New billingCoreRepair20261006 tests assert the corrected behavior.

F07/F08/F09/F10, refunds, metered overage, notifications and offboarding remain open. No launch-readiness claim.
