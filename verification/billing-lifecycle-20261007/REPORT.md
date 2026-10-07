# Billing lifecycle implementation — validation in progress

Branch `feat/billing-lifecycle-20261007` begins at the verified full base
`130db2148de05cb8b62f5a2595b98b635ce863cb` on the requested overage branch.

Implemented durable trial-ending, annual-renewal, subscription/overage receipt,
payment-failed, cancellation, service-ended, suspension and reactivation notices
in the existing owner email channel and Billing screen. Reminder totals are read
from the exact subscription's invoice preview; integer cents and currency are
preserved. Email acceptance is distinct from confirmed delivery. Stable notice
identities, transactions, provider reads, tenant leases and the existing bounded
email retry window recover retries/restarts without blindly resending ambiguity.

Owners cancel in the dashboard, retain service through the verified paid term,
and receive no partial refund. The 14-day initial trial still first charges at
trial end; returning paid owners reactivate with a new paid subscription rather
than another trial. Clock checks stop AI, forwarding fallback, quoting and the
public widget at service end even before worker execution. Carrier shutdown
uses the existing durable coverage confirmation flow. No new overage invoice is
submitted after service end. Previously issued invoices remain financial evidence.

Owner-only CSV exports include leads, quotes, call records and transcripts;
spreadsheet formulas are escaped. Phone release is due at day 30; exports close
at the exact day-90 boundary and the worker erases records, transcripts, booking
and quote copies, delivery payloads and call-scoped tool receipts. Financial
receipts and account configuration are retained. Reactivation restores the
resources still retained; released numbers and deleted records cannot be restored.
A delayed worker respects the verified reactivation date instead of deleting a
resource whose owner paid within the window. Failed carrier/release actions
remain pending and retry against the saved tenant operation/SID.

Expected amounts and dates were written before execution in EXPECTED.md.
Tests use synthetic accounts, temporary SQLite storage, local fake Stripe and
email/carrier interfaces only. No real charge, refund, email, SMS, provider or
live-data change, subagent, main merge or deployment.

Cold local installation passed using locally extracted Node headers; both builds
passed. Local Node 24 has native cleanup assertions and Chromium SIGTRAP startup
failures. These are environment failures, not passing local full/browser gates.
The hosted cold CI source revision and final test counts will be recorded after
verification; **hosted validation is currently unfinished** at this checkpoint.
