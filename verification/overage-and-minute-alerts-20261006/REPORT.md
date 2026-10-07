# Overage and minute alerts implementation

Branch: `feat/overage-and-minute-alerts-20261006`.
Verified base: `dce04c53c336de63eaa0d0c7cdc696b9a669c634` on
`codex/billing-core-repairs-20261006`.

Implemented integer-cent monthly overage, reconciled F10 durations, durable
payment receipts/retries, 60/30/0 dashboard and owner-email warnings, always
visible owner usage, and the Operator savings comparison. Annual base payments
remain yearly while allowances and overage are monthly. First payments and
annual anniversaries begin at trial end. Verified prepaid annual cancellation
retains service until the paid year ends, without a partial refund operation.

Expected dollars were written before execution in EXPECTED.md. The baseline
annual meter returned 301 old-month minutes after its next monthly anniversary;
expected zero. Source: the original voiceUsagePeriod returned the entire
subscription period. The regression now executes actual F10 metering and
provider evidence across annual monthly boundaries for both plans.

The base had a durable outbox and transactional email sender but no owner-email
dispatcher. This branch connects those existing components through a durable,
tenant-bound delivery ledger. Provider acceptance and confirmed delivery remain
separate. Ambiguous operations outside provider idempotency retention are held
for reconciliation, never blindly resubmitted. Pending payment/delivery is visible.

Validation is in progress. Focused billing tests: 58/58, zero failures/skips.
Real Stripe SDK against a loopback fake: 1/1. Production dashboard integration,
browser tests, final cold commands and hosted verification are pending.

No subagents, merge to main, deployment, live data, real payment, email or text.
