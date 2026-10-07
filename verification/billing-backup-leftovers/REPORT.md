# Billing cleanup and continuous backup repairs

Branch: `fix/billing-backup-leftovers`. Verified base:
`4db13a2945193762bbc4b85f9ab616a00e1dd067` on
`codex/audit-small-repairs-20261007`. No subagents, main merge, deployment,
real charges, storage accounts or live data. Providers and records are synthetic.
No attached audit file was available in this turn; the two supplied findings were
checked against `AGENTS.md`, the current build status, the repository audit reports,
`specs/BILLING_LIFECYCLE_20261007.md`, platform sections 12.7/12.19 and the backup guide.

## Reproductions before repairs

1. Source: `billingCustomerLifecycle.js` awaited `stopUsageCollection` inside
   cleanup before day-90 erasure and day-30 number release. A rejected invoice
   read threw out of the sequence. Execution: the unchanged source retained a
   synthetic overdue lead/call and did not release its saved number when Stripe
   rejected. An independently delayed read also left both untouched while the
   provider promise remained pending. The four initial billing regressions
   failed, with zero skips. Hand expectation before execution: 310 reconciled
   minutes minus 300 included = ten extra minutes × 35 cents = **$3.50 CAD**
   retained financial evidence; cleanup creates no additional charge or refund.

2. Source: the off-site worker returned immediately after a completed backup
   in the same UTC day; no replication worker existed. Platform 12.19 requires
   continuous replication **plus** a nightly snapshot, with thirty-day retention
   and a documented/tested restore. Execution: after the daily copy, both a
   same-connection commit/book replacement and an independent connection's WAL
   commit followed by worker reconstruction restored the old note instead of the
   new committed note. Both baseline recovery regressions failed, with zero skips.

## Changes

- Local retention cleanup runs before billing reconciliation. The sweep completes
  due work for all selected owners before Stripe reads. Failed collection-stop
  reconciliation remains durable on the charge and cancellation for retry; amounts
  and financial evidence survive. Exact deadlines and tenant isolation remain.
- A continuously running worker detects SQLite/WAL and price-book changes using
  notifications plus one-second polling, coalesces bursts and catches writes made
  during upload. It publishes complete encrypted online SQLite/book recovery
  copies as the replication equivalent; nightly snapshots remain independently
  covered. Full copies use more bandwidth/storage than WAL deltas.
- Checkpoints retain immutable ciphertext across outage/restart, use conditional
  publication, checksum readback and AES-GCM authentication, and become healthy
  only after protection catches up. Destination/state corruption fails closed.
  Retention covers thirty elapsed days, preserves the exact boundary and newest
  complete recovery point, and never prunes after a failed upload. Pruning runs
  at most daily. No account/bucket/lifecycle policy is provisioned.
- The actual restore CLI accepts `--checkpoint` alongside `--day`. The guide
  documents checkpoint selection, keys, restore commands and asynchronous loss
  limits. A production-server regression checks automatic replication, real admin
  authorization, healthy status and restored post-nightly data against fake S3.
- Graceful shutdown finishes routes and other workers before its final recovery
  checkpoint, with SQLite remaining open. A regression includes a disconnected
  route's last write. The existing CI workflow includes this exact repair branch;
  no gate is weakened, skipped or exempted.

## Verification checkpoint

The latest focused diagnostic run passed **330/330**, zero failures, skips,
cancellations or TODOs: both billing files, continuous/daily off-site files,
shutdown lifecycle and both actual-server tenant-isolation matrices. This includes
**22 new regressions**: five billing, sixteen continuous backup and one shutdown.
The standalone focused run before the matrix review passed 94/94.

The first hosted run at `76735577a14358aa69de5327c06050690c8c26ff`
([37682555248](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37682555248))
passed cold installation, browser setup and both builds, but strict tests had
2,608 passes and four failures (two source-review assertions and their parent
matrices). The full suite did not run. Changed files' source fingerprints had not
been updated. The four files were explicitly compared with the pinned base:
route declarations, authorization, tenant binding and global middleware remain
unchanged. Only those reviewed fingerprints were updated. The matrices now pass;
no route, assertion, middleware expectation or failure allowance was removed.

Retention's original implementation also read every retained completion record
and HEAD: an independent 100-point experiment measured 100 of each. The bounded
implementation and new regression require one marker and one HEAD for the newest
complete point, with zero deletions for the all-retained fixture. Full cold hosted
acceptance of this corrected revision remains pending.

Local verification uses available Node 24.19.0. Ordinary cold installation first
failed on native header extraction (`fchown`); a downloaded Node 22 executable
segfaulted before reporting a version. Diagnostic native rebuilds use downloaded
headers and an external native-object retention preload for the managed runtime's
cleanup assertion. These workarounds are not hosted cold acceptance. Playwright's
local browser installation also failed. No such workaround is committed to source
or CI. Fixture setup errors and interrupted install attempts are not green gates.

Unfinished at this checkpoint: final local command results and hosted cold
acceptance. Real storage/provider provisioning and deployment are excluded by the
owner's request. Replication is asynchronous; an in-flight change or sustained
provider outage is not a zero-loss recovery guarantee.
