# Owner billing lifecycle amendment — October 7, 2026

The owner instruction for this branch supersedes platform §12.7's 14-day
wind-down/30-day export and §12.11's reminder schedule. No other pricing or
refund policy is changed.

- Fourteen free days; the first monthly or upfront annual charge is at trial end.
- Trial reminder three days before that charge; annual reminder thirty days
  before renewal. State the selected plan, exact currency/amount and UTC date.
  Authenticated dashboard links expose cancellation and change-plan controls;
  email GET links never perform a financial mutation.
- Every settled nonzero subscription/overage invoice has one durable receipt.
  Every failed invoice has one durable failure notice with the existing seven-day
  grace deadline. Recovered/settled invoices never regress under a stale failure.
- Cancellation is at the verified paid period end without partial refunds.
  Trial cancellation is immediate without a charge (existing §12.11).
  At service end AI, quoting and widget access stop; carrier coverage is disabled
  through its existing durable confirmation flow. No new overage submissions
  are initiated at/after service end. Existing provider invoices remain evidence.
- Retain the phone until thirty days after service end; CSV leads, quotes and
  call records including transcripts remain exportable until ninety days after
  service end. At the exact deadline export closes and the retained records and
  their application copies are erased. Financial evidence remains for receipts.
- Before termination reactivation reverses the scheduled cancellation. After
  termination a new verified subscription is required; redirects alone never
  restore access. Retained data/number resume only within their own windows;
  a released number or deleted record cannot be promised back.
- Durable owner email acceptance is separate from provider-confirmed delivery.
  Replays use one immutable notice and existing provider idempotency/reconciliation;
  unresolved delivery after its safe retry window stays visible for review.

UI labels for this owner-requested flow: Cancel plan, Reactivate, Change plan,
Billing notices, Export leads (CSV), Export quotes (CSV), Export calls (CSV).
