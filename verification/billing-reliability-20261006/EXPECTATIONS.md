# Expectations written before independent execution

Audited base: `73c00622d6f2df31f57773b32e41355a7421f1a3`.
Only synthetic accounts, in-memory/temporary SQLite and local provider stubs.

## Hand-calculated money

Platform §8 and release integration annual ruling:

| Selection | Expected recurring cents | Calculation |
|---|---:|---|
| Operator monthly | 11,900 | $119 |
| Operator annual | 119,000 | $119 × (12 − 2) = $1,190 |
| QuoteDone monthly | 27,900 | $279 |
| QuoteDone annual | 279,000 | $279 × (12 − 2) = $2,790 |
| Trial start, either interval | 0 | 14-day trial; no setup fee |
| Operator 301 connected billable minutes in one month | 35 overage | (301 − 300) × 35 cents |
| QuoteDone 1,202 connected billable minutes | 70 overage | (1,202 − 1,200) × 35 cents |
| Ordinary call lasting 61 seconds | 2 minutes | ceil(61 / 60) |
| Trial call lasting 3,601 seconds | 61 minutes, no charge | finish current call; next call falls back |
| Trial cancellation before conversion | 0 charged | platform §12.11 |

Configured Price IDs alone cannot prove actual provider amounts/currency. The
synthetic catalogue uses the above exact cents. No proration, upgrade timing,
partial refund, currency of SaaS fees, or recurring repeat-trial policy is invented.

## Expected access/state transitions

1. Signup/checkout creation/redirect alone: pending, no service. A configured
   card-backed trial: trialing through the exact end; at end no service without
   valid conversion evidence. Trials must converge under every delivery order.
2. A zero-dollar trial invoice must not activate indefinite paid access or mask
   the trial boundary/cap. Payment method attachment alone does not settle debt.
3. Failure at T: full service only through T + seven days (exclusive). Repeated
   failures and unpaid payment-method edits do not restart grace. A later paid
   invoice for the current obligation restores service once.
4. Terminal deletion: canceled, denied, old subscription cannot reopen. A new
   authorized checkout can bind a replacement. Late old invoices must not grant
   access to the wrong current plan or supersede current unpaid debt.
5. Plan changes follow current subscription base price. Invoice lines for an old
   plan cannot overwrite the current subscription plan. Scheduled cancellation
   stays visible until a subscription update/deletion changes it.
6. Exact duplicate event/request: one state mutation/outbox/session; changed
   payload same key conflicts. Cross-account customer/subscription IDs reject
   atomically. Invalid signatures/raw-body tampering/expired signatures reject.
7. Injected state/receipt/outbox failure: all mutations rollback, retry succeeds
   once. Ambiguous checkout response: same provider idempotency key on recovery.
8. An expired local checkout must be reconciled with the provider before a new
   checkout is created: a completed session with delayed webhooks is still a
   subscription. At most one nonterminal provider subscription per owner.
9. Current account state must govern HTTP/public/voice access, independent of JWT
   plan claims. Grace-state UI must agree with backend full-service permission.
10. Clock passage beyond grace must persist suspension/log/notification rather
    than leaving subscription status permanently stale. Unpaid/suspended users
    must have read-only dashboard except billing (§12.6).

Unsupported/incomplete facilities (metered overage submission, refund guarantee,
offboarding/export/notification automation) will be identified as capability
gaps separately; absence does not prove a supported refund corrupts state.
