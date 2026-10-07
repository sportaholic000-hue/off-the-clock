# Billing lifecycle implementation — hosted gates passed

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
submitted after service end. Pending unpaid overage invoices have automatic
collection disabled; the invoice remains financial evidence. Lease fencing
prevents a delayed provider response from deleting a replacement phone number.

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

## Verified cold gates

Uploaded and fetched-back source/test revision:
`0862c78bafd6b96bf5f62edca524d75a1d9907f8` (tree
`71dc89f6a678da389eee40ee5fa51b640490b423`).
[Hosted CI run 37563765418](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37563765418)
completed **successfully**, with Node 22, a clean lockfile install and Chromium.

| Gate | Result |
| --- | --- |
| `npm ci` | Passed cold; committed dependencies removed first |
| `npm run build` | Owner app and widget passed |
| `npm run test:quote` | 2,081/2,081 tests across 101 files |
| `npm test` | 3,024/3,024 tests across 153 files |
| `npm audit --omit=dev --audit-level=high` | Zero vulnerabilities |

Both hosted suites report zero failures, cancellations, skips and TODOs. The
known-failure list is empty; no assertions, allowances or test selection were
weakened. The existing CI workflow only gained this exact branch's push trigger.
There are **50 new tests**: 45 lifecycle cases, three Billing browser cases and
two production HTTP/signed-voice cases. Counts overlap the full/quote suites.

Coverage includes handwritten monthly/annual amounts and dates for both plans,
first-charge timing, renewal/reminder timing, receipts including 350-cent overage,
failure/grace/suspension/recovery, no-refund mid-month/mid-year cancellation,
service-end guards, stopped pending collection, CSV safety and tenant isolation,
30/90-day boundaries, retained-resource reactivation, delayed-worker recovery,
transaction rollback, concurrent requests, lost provider responses, restart and
email reconciliation, stale previews and lease loss. Production routes verify
authenticated owner-only exports and canceled-business quoting, while a signed
incoming voice request verifies that terminated service produces no Dial/Stream.
Browser cases verify notices, cancellation controls and CSV download behavior.

Cold local installation passed using locally extracted Node headers; both builds
passed. Local focused runs passed **120/120** at the collection-shutdown revision,
and the final lifecycle-only run passed **45/45**. These overlapping runs are
retained separately. Broad local Node 24 runs hit native cleanup assertions and
Chromium SIGTRAP startup failures; they are **not** claimed as passing gates.
The first hosted checkpoint failed three new browser fixtures because their
synthetic HTTP hostname lacked Web Crypto's secure context. Changing the fixture
to trusted loopback corrected the cause; all three assertions then passed in
the complete hosted run. Application authentication was not weakened.

## Evidence and remaining work

[Handwritten expectations](EXPECTED.md), [hosted step/count metadata](hosted-results.json),
compressed hosted/local logs and SHA256SUMS are stored alongside this report.
The source revision was verified against the uploaded GitHub tree, and final
report/evidence changes do not alter its application or tests.

No implementation work remains for this scope. Local broad-suite/browser
execution remains environment-blocked; the exact uploaded source has passed
all required cold hosted gates. Financial evidence/account settings remain
after customer-record deletion. Email outcomes that cannot safely be reconciled
remain visible for review; an unresolved carrier action stays pending instead
of being reported as confirmed. No real-provider or live-data validation was
performed, as instructed. No merge or deployment.
