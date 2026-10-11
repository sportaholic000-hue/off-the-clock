# Day-90 erasure implementation and evidence

Base: `8973f429df487c58f3ad7a49bfdb35ebbb9a274a`, verified against
`claude/release-candidate-20261010g` with `git ls-remote` before implementation.
Work branch: `fix/day90-erasure-20261011`. No merge into the candidate, deployment,
real provider operation, public-page edit, specification edit, or subagent.

The October 11 owner ruling governs: local records, backups, Google revocation
and number release are independent steps. A completed deletion requires every
step to succeed or to have no saved resource requiring cleanup. Permanent
provider failures remain visible for manual action and are never called revoked
or released.

## Reproductions

- `defect4-before.tap`: four failing provider-time/deadline tests;
  `defect4-after.tap`: four passing tests. October 1 service end, processed
  October 10, yields October 31 phone release and December 30 export/erasure.
- `defects1-2-before.tap`: missing/invalid off-site configuration prematurely
  marked deletion complete; stale A/B replacements resurrected B in both daily
  and continuous backups. Four failures; `defects1-2-after.tap`: four passes.
- `defect3-before.tap`: ten provider-failure/retry regressions failed;
  `defect3-after.tap`: all twelve provider tests passed after adding immediate
  database/WAL secret removal and a local-first sweep across all due owners.
- `provider-independence-before.tap`: two additional failing tests for those
  WAL and slow-provider gaps during implementation.
- `staging-before.tap`: four failures showing abandoned staging copies and
  restore/erasure races. `nested-lock-before.tap`: the same race with a nested
  application directory. Restore and erasure now share a volume-wide lock;
  redundant abandoned staging copies are removed after workers drain.
- `final-retention.tap`: **43 tests, 43 passed, zero failures/skips** across
  the four reported defects, complete tenant inventory, live/local/daily/
  continuous isolation, byte-preserved B price books, repeat-run idempotence,
  backup exclusion of retry credentials, and authenticated admin outcomes.

These are synthetic fixtures with fake Google/number adapters and the repo's
local S3 protocol store. No provider credentials or customer records are used.

## Route source review

The route-inventory test correctly rejected changed source hashes at the early
GitHub checkpoints. Only these existing route-bearing files changed:

- `src/billingCustomerLifecycle.js`: the owner-only lifecycle read, cancellation,
  reactivation and export routes retain their paths, authentication, provider
  write guard and tenant binding. Private retry credentials are in a separate
  table and never returned by these routes.
- `src/offsiteBackups.js`: the existing `/api/admin/backups/offsite` route retains
  `requireAuth(['admin'])` and `Cache-Control: no-store`. It adds only a safe
  retention summary and returns 503 for unfinished erasure. Restore operations
  now share the retention mutex; they create no HTTP route.
- `src/server.js`: the existing `/api/admin` route remains admin-only and adds
  the same safe summary/503 response. The existing off-site route receives its
  summary getter. Other routes and authorization middleware are unchanged.

Only those three reviewed hashes were updated in `route-sources.json`; the
route and middleware inventories, assertions, selectors and roles were not
weakened. `route-isolation.tap` records **264/264** checks in preview/production.
The new admin tests independently exercise anonymous 401, owner/staff 403,
erased-owner 401, pending/permanent 503 and successful recovery 200, including
absence of tokens/SIDs from responses and aggregate alerts.

## Retention behavior

1. The clock uses the verified paid term when one exists; otherwise the
   provider's actual subscription end/cancellation (or signed terminal event
   time for legacy evidence), never webhook processing time.
2. The existing phone-release deadline remains service end +30 days. The first
   eligible run retains the exact saved SID. Only provider success or 404 sets
   `phoneReleasedAt`.
3. At service end +90 days, encrypted Google retry material contains only the
   refresh token. Ordinary calendar credentials, tenant records, authentication,
   staff and price-book files are erased independently of provider availability.
   All due owners receive the local pass before external cleanup is awaited.
4. Local snapshots, daily archives, continuous checkpoints, pending archives,
   replacement journals and completed restores are redacted. Abandoned staging
   copies are removed under the shared lock. Every replacement applies the
   monotonic erasure ledger for all owners and rebases from the current object.
5. A durable upload intent/first-success receipt survives rotating worker state.
   Missing/invalid configuration after any upload leaves remote cleanup pending
   and unhealthy; local deletion still proceeds. A deployment with no upload
   history can finish without configuring remote storage.
6. Google refresh-token 200 or 400 `invalid_token`, and number-release success
   or 404, finish their respective steps. Other outcomes retry independently.
   At 30 days from the first attempt, or immediately for unusable retry material,
   the material is discarded and a permanent-failure timestamp is recorded.
   Completed steps never retry. No newly captured backup contains retry secrets.
7. Only all-success/not-required steps with completed local flushing set
   `dataErasureVersion=2` and `dataDeletedAt`. Pending/permanent outcomes reach
   the existing admin routes and aggregate platform alert. An inaccessible
   off-site copy or a provider grant awaiting manual cleanup is never described
   as erased.

## What remains after day 90

- Billing/financial evidence and the disabled billing account tombstone remain.
  The repository sets no automatic expiry for these billing records.
- While retrying, only the encrypted Google refresh token and/or exact number
  SID remain in the private retry table, for at most 30 days from that step's
  first attempt. Each is removed immediately on success or permanent failure,
  including current database/WAL bytes. A phone step first attempted at day 30
  therefore expires by day 60 if it continuously fails.
- Minimal billing-linked cleanup state, outcome timestamps, erased-owner IDs,
  off-site destination fingerprints/first-upload times, and aggregate admin
  alert counts remain as operational evidence. No automatic expiry is set for
  these records; the erasure ledger prevents later backups resurrecting data.
- If off-site access is unavailable, inaccessible copies still exist until
  retried successfully; completion remains unset and admin status unhealthy.
  After permanent provider failure, the grant/number can remain at the provider,
  but no local retry secret remains; admin must arrange manual cleanup.

No privacy-policy or owner-facing text was changed.

## Environment and full gates

`npm run build` passed before the restore-CLI drills (`build.log`). Tracked
`client/dist` is restored before publication. Each `continuous-restore-*.tap`
and `final-continuous-restore-*.tap` is a separate invocation of
`node --test --test-reporter=tap test/continuousOffsite20261007.spec.mjs`.
Incomplete logs have no summary and are not counted as successful suites.
No observed restore-CLI case reported `OFFSITE_RESTORE_FAILED`.

This workspace supplies Node 24, while hosted CI uses the repository's Node 22
environment. A workspace-only preload retains better-sqlite3 native database,
statement and backup wrappers until process exit to avoid this environment's
native cleanup-hook crash. SQL, transactions, backup transfer, close and
assertions run unchanged. Local Chromium immediately exits with SIGTRAP
(`chromium-launch.log`), so no local browser pass is claimed.

Local full/quote command totals and the exact final pushed-head GitHub Actions
run/conclusion/counts are reported in the task's final response. Hosted CI runs
from the lockfile without the local native-wrapper workaround.
