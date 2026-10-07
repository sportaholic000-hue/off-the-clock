# Hand expectations, written before execution

Base: `dce04c53c336de63eaa0d0c7cdc696b9a669c634`.
All accounts, durations, providers, messages and databases are clearly synthetic.

Owner rules supersede the former 80%/100% notification wording in platform sections 8 and 12.5.

| Case | Expected by hand |
|---|---|
| Operator 300 minutes | 300 included, 0 left, 0 over; **$0.00** |
| Operator 301 minutes | 1 over × $0.35 = **$0.35** |
| QuoteDone 1,200 minutes | 1,200 included, 0 over; **$0.00** |
| QuoteDone 1,201 minutes | 1 over × $0.35 = **$0.35** |
| Operator 757 minutes | 457 over × $0.35 = **$159.95**; below $160, no nudge |
| Operator 758 minutes | 458 over × $0.35 = **$160.30**; QuoteDone overage $0.00; saving **$0.30** |
| Operator 1,200 minutes | 900 over × $0.35 = **$315.00**; saving $315.00 − $160.00 = **$155.00** |
| Operator 1,201 minutes | 901 over × $0.35 = **$315.35**; QuoteDone also has $0.35 overage; saving **$155.00**, not $155.35 |
| Two 31-second calls above allowance | Each rounds to 1 minute under F10: **$0.70**, not $0.35 |
| Provider corrects local 59 seconds to 61 seconds above allowance | 1 minute becomes 2; **$0.70**, not two additive charges |
| Spam, AI fallback and trial overrun | **$0.00** paid overage |
| Signup and 14-day trial | **$0.00** base charge at signup; card required |
| First paid Operator / QuoteDone monthly term | **$119.00 / $279.00**, first charged at trial end |
| First paid Operator / QuoteDone annual term | **$1,190.00 / $2,790.00** in full at trial end, covering 12 months |
| Annual monthly reset after 301 Operator minutes | Prior month **$0.35**; next monthly allowance 300 with **$0.00** new overage |
| Annual cancellation during paid year | Service through paid-term end; **$0.00** partial refund |

Warn at used counts 240/270/300 for Operator and 1,140/1,170/1,200 for QuoteDone. Each threshold creates one dashboard event and one durable email identity per owner/period even when a call crosses multiple thresholds, requests repeat, workers race or restart. Reset allowance on the paid subscription's monthly anniversary, preserving the original day when short months require clamping. A call crossing a boundary belongs to the month in which it connected. Annual paid term and monthly anniversaries begin at trial end, not signup.

The upgrade comparison uses the explicitly ordered $160 monthly difference for Operator, subtracts QuoteDone overage at the same real usage, and never appears for other plans or nonpositive savings. No bulk packs or discounts are introduced.

Financial submission occurs after a monthly period closes and all billable durations are provider-reconciled. Unconfirmed or inconsistent duration, ambiguous payment outcome, provider failure or disabled provider writes leaves a visible pending item. A durable period identity, frozen amount and provider receipt reconciliation prevent duplicate billing. Stripe invoice APIs through the existing billing provider interface support monthly usage invoices independently of the annual base renewal; no live configuration is changed.

The pinned base has a durable outbox and transactional email sender, but no owner-alert dispatcher. These warnings will use that sender with a durable tenant-bound delivery ledger. Provider acceptance is distinct from delivery. Ambiguous sends are retried with the same payload/key only within the provider's guaranteed idempotency window; later uncertainty remains visible rather than risking a duplicate.

Provider contracts inspected: https://docs.stripe.com/api/idempotent_requests ; https://docs.stripe.com/api/invoices/create ; https://docs.stripe.com/api/invoiceitems/create ; https://resend.com/docs/dashboard/emails/idempotency-keys .
