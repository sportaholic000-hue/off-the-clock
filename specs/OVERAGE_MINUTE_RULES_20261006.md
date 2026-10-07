# Owner-approved minute billing rules

This decision records the owner's October 6–7 instructions and replaces the
older 80%/100% usage-warning wording in platform_spec_v2.md. The F10 connected
inbound duration, per-call ceiling and spam/AI_FALLBACK exclusions are unchanged.

| Plan | Monthly base | Annual base, paid in full | Minutes per billing month |
| --- | --- | --- | --- |
| Operator | $119 | $1,190 | 300 |
| QuoteDone | $279 | $2,790 | 1,200 |

Both first payments occur when the 14-day trial ends. The annual paid year and
monthly anniversaries start then, not at signup. Annual subscriptions receive
twelve monthly allowances, not one pooled annual allowance. Month ends clamp to
the last valid date and later anniversaries recover the original day. Cancelled,
fully paid annual subscriptions retain their purchased tier through the paid
year; cancellation produces no partial refund. A verified full annual base
invoice is required; card collection, partial payment and usage invoices are
insufficient evidence of a prepaid year.

Overage is 35 integer cents for each minute beyond the included allowance.
Annual and monthly subscriptions receive monthly overage invoices after the
month closes and all billable call durations reconcile with signed provider
receipts. A call belongs to the billing month in which it connected, preserving
F10 attribution. Trial calls are never paid overage. Usage is visible while
provider duration confirmation is pending; unconfirmed totals cannot be charged.

Warnings are durable and tenant-scoped, once per period at 60, 30 and zero
minutes left. Crossing several thresholds in one call records all crossed
warnings. Retries retain the exact warning identity and message. Dashboard
usage shows minutes used, minutes left and overage so far even with zero calls.
Email acceptance is distinguished from confirmed delivery. Failed or uncertain
delivery stays visible; provider idempotency-window expiry requires receipt
reconciliation rather than a blind resend. No exactly-once inbox guarantee is
claimed beyond provider-confirmed delivery.

For Operator only, when overage exceeds $160, show
"Upgrading to QuoteDone would have saved you $X this month". X is the real
Operator overage less the same usage's QuoteDone overage less $160; it must be
positive. The owner's $160 comparison also applies to annual subscriptions.
No pack purchases, automatic plan changes or multi-plan discounts are introduced.

Implementation uses the existing Stripe client/provider lease interface and
durable outbox plus existing Resend sender. Independent monthly usage invoices
keep the annual base charge annual. An uncertain provider mutation is retried
under its stable key only within 23 hours; after that, provider reads recover
known objects and unresolved ambiguity remains owner-visible for review. Frozen
receipts are not rewritten if usage later changes. A single tenant's bad record
does not stop the worker serving others. No live provider changes are authorized.
