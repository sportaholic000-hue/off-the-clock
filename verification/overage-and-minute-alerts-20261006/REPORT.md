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

Hosted cold verification passed at source/test revision
**`a6de092bc876fcc8c007f7ac8ecae558088750aa`**, tree
`b9d3fba9c1bdb015407e323807e8bd07781f0491`:
[CI run 37558263595](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37558263595).

| Gate | Verified result |
| --- | --- |
| `npm ci` from removed dependency directories | Passed |
| `npm run build` — owner app and widget | Passed |
| `npm run test:quote` | 2,076/2,076; 99 files |
| `npm test` | 2,974/2,974; 150 files |
| Failures, skips, cancellations, TODOs | Zero in both hosted suites |
| Production dependency audit | Zero vulnerabilities |

There are **66 new tests**: 42 arithmetic/metering/retry tests, 19 integration
and failure-path tests, one real Stripe SDK test against a loopback fake,
one production-mode dashboard test using temporary storage, and three real
dashboard browser tests. The focused non-browser run passes **63/63** locally.
These counts overlap the complete suites and must not be added to them.

Coverage includes both plans and intervals; trial-end first charging; annual
monthly rollover and leap/month-end anniversaries; prepaid cancellation and
legacy receipt recovery; F10 per-call rounding/exclusions/provider correction;
hand-calculated 457/458-minute nudge boundaries; QuoteDone overage subtraction;
threshold uniqueness under retries and concurrent processes; tenant isolation;
restart recovery; failure before/after each provider mutation; lost local
receipts; idempotency expiration; invalid provider identities, amounts, currency
and pagination; late billing-period evidence; and owner/staff production access.
Dashboard execution verifies zero-call visibility, focus refresh, human money
amounts, annual copy, pending charges and the absence of QuoteDone upgrade nudges.

Additional defects found and repaired during implementation:

- The prior annual meter retained the whole year's calls after a monthly
  anniversary. Monthly period selection now resets it; both plans execute the
  regression through the real F10 meter.
- Prepaid cancellation status could prohibit another checkout while the actual
  checkout still allowed it without a subscription reference. The checkout
  guard now applies paid-through protection before that early return.
- Annual accounts predating the new receipt schema lacked retained paid-year
  evidence. A real cancellation reconciliation now reads the verified full base
  invoice; the reproduced missing paid-through date becomes the correct year end.
- A provisional duration could send a false threshold email or savings claim
  before a downward provider correction. Warnings now use confirmed durations;
  savings claims wait for complete reconciliation. The reproduced 239-minute
  account retains 61 minutes left and receives no false 60-minute warning.
- A signed call receipt arriving before billing-period metadata remained
  unconfirmed forever. Verified paid-period membership now reconciles that
  unknown classification; explicit trial calls remain excluded. The reproduced
  301-minute month submits exactly $0.35 after its period becomes known.

The existing production wiring assertion was updated to require the new durable
usage callback while retaining the signed-runtime and no-placeholder checks.
No test was removed, skipped or added to a known-failures allowance.

Local environment limits are recorded separately in `local-validation.json`.
Cold install/build passed. A development cold quote run had 40 Chromium launch
failures (`SIGTRAP`), and the corresponding full run had those 40 plus the old
wiring assertion, since corrected and verified hosted. A later local test
session disappeared without a complete summary; it is not claimed as a passed
gate. The authoritative complete cold result is the exact hosted revision above.

No application work remains pending for this scope. A provider's ambiguous
outcome beyond its idempotency guarantee deliberately remains visible for
reconciliation, rather than risking a duplicate charge or email. Actual live
provider configuration and delivery were not exercised because this task
authorizes fake providers only. The report/evidence commit changes documentation
and evidence only; GitHub Actions also runs on that final branch head.

Evidence: `EXPECTED.md`, `focused-tests.tap.gz`, `hosted-ci.log.gz`,
`hosted-results.json`, `local-validation.json`, and `SHA256SUMS`.

No subagents, merge to main, deployment, live data, real payment, email or text.
