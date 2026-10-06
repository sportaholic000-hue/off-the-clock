# Billing core repair design

Source pin b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3, separate clone. Only assigned source and new billingCoreRepair20261006 tests are changed. Historical audit unchanged.

## Provider contract checked

Installed Stripe Node **22.6.2**, default API **2026-08-26.dahlia**, confirmed from installed package and cjs/apiVersion.js. No SDK/dependency changes.

- https://docs.stripe.com/webhooks#event-ordering: ordering is not guaranteed; timestamps are not unique event identity. Retrieve missing/current objects when necessary.
- https://docs.stripe.com/billing/subscriptions/webhooks: invoice settlement and subscription entitlement are distinct; a default payment method is not invoice settlement. Cancellation is terminal.
- https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end: period fields now belong to subscription items. Installed SubscriptionItems.d.ts contains both period fields; legacy top-level periods remain deliberately supported.
- https://docs.stripe.com/billing/subscriptions/prorations: invoice credit/debit lines may refer to different prices. We consume supplied amounts, never calculate provider prorations.
- https://docs.stripe.com/api/checkout/sessions/retrieve and /expire: open, complete and expired are provider states. Local expires_at is not proof of noncompletion. Only a provider-confirmed expired, unsubscribed session releases its local slot after a customer subscription check. No expiration write is needed here.
- Installed Checkout/Sessions.d.ts: setup_intent belongs to setup mode. Normal subscription Checkout activation uses independent subscription/card evidence, not a fabricated setup intent.

## Durable transitions

billingSubscriptionEvidence retains the current subscription's configured base item, lifecycle and periods. Newer signed snapshots replace older snapshots of that same subscription, not invoices or sessions. Same-second agreeing lifecycle facts can accumulate card evidence; contradictory same-second facts fail closed until a serialized provider retrieval resolves them. No event-type rank is used to reconcile independent objects. Current subscription items alone set confirmed entitlement. Checkout selection is provisional pending subscription evidence; invoice lines never choose a plan.

billingInvoiceEvidence is keyed by invoice and bound to owner, customer and subscription. Paid is a terminal invoice fact for this batch: a late failure cannot reopen it. Outstanding failures retain the first continuous grace boundary. Unrelated invoices and payment-method edits cannot remove rows or clear failure. A zero invoice cannot create indefinite active access. Provider reads can settle only identity-checked relevant invoices. Refund/write-off policy is not invented.

State, evidence, subscription history, event receipt and outbox changes use the existing immediate transaction. Receipts use a v2 digest including base item boundaries, line identity/amounts, latest-invoice and Checkout invoice references; old receipts remain immutable. Terminal subscription protection remains. An authorized ledger-backed conflicting second subscription is quarantined and acknowledged without changing entitlement.

billingOperationLeases serializes provider reconciliation/Checkout per owner across processes. A token fences late responses after lease takeover. API reads have a 10-second transport limit, separate from the unapproved customer callback policy. No timeout is interpreted as noncompletion. Ambiguous creates retain the original durable idempotency key; the existing 23-hour recovery limit remains.

Expired local sessions, including legacy EXPIRED rows, are retrieved before replacement. A completed session is durably consumed/bound without granting entitlement and blocks another creation. An expired session requires a complete, tenant-checked subscription list showing no nonterminal subscription. Pagination/unknown state fail closed. Delayed completion can consume legacy expired rows. Legitimate re-subscription still requires verified terminal deletion and a later server ledger entry.

## Migration/recovery

Additive billing-only tables/columns preserve unrelated schema and all old receipts. Existing unresolved debt lacking invoice identity becomes a durable recovery hold. On verified webhook recovery, old failed-invoice receipt IDs are retrieved and checked against the exact current customer/subscription before the hold can clear. Unattributable history stays held for explicit recovery; a generic active snapshot/payment method never clears it. No live migration runs in this task. Repeated migration is idempotent; synthetic on-disk restart and rollback tests cover recovery.

## Ownership dependency discovered

Three old billing tests encode the actual unsafe behavior being removed: local expiry without provider verification, a default-method active event suppressing a different failed invoice, and payment of a different invoice clearing current debt. Their expected behavior contradicts F02/F03. They will not be made to pass by restoring those bugs. Any required changes outside assigned ownership will be supplied as an exact unapplied patch here, with the full gate result reported honestly.

F07/F08/F09/F10, metered overage, refunds, notifications and offboarding remain open. This batch does not establish launch readiness.
