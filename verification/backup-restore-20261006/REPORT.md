# Backup/restore rehearsal — October 6, 2026

**Checkpoint: all six rehearsal steps pass; three confirmed defects fixed.
Cold full gates and hosted CI are pending at this source checkpoint.**

Repository: `sportaholic000-hue/off-the-clock`. Branch:
`verify/backup-restore-rehearsal-20261006`. Exact starting commit verified before
work: `73c00622d6f2df31f57773b32e41355a7421f1a3`, from
`codex/quote-release-candidate-20261006`. No other repair branch was substituted.
No subagents, merge, deployment, live data, provider call or cloud resource.

## Rehearsal evidence

The automated test starts actual production server processes using
`NODE_ENV=production`, `APP_DATA_DIR=<temporary-volume>/app`, and the real v7
release engine guard. Random ephemeral signing/encryption secrets are retained
across restarts and restore. The only provider adapter is a test-only local
calendar stub; external server fetches throw. All real-provider switches are off.

| Step | Result after fixes | Evidence |
|---|---|---|
| 1. Production startup and release guard | PASS | Server listens, reports compiled `quote-engine-vnext-date-context-20261006-v7`, health returns 200 with `ok:true`; database is under temporary `APP_DATA_DIR`. Existing stale/empty-engine rejection tests also pass. |
| 2. Owner, approved book, quote, lead, booking | PASS | Register two explicitly synthetic owners through HTTP. Save and explicitly approve first owner's mowing book through production routes. Public request creates a **$100.00** quote; explicit-review request creates a real review lead with no total. Actual availability → hold → confirm routes create a `CONFIRMED` appointment with a local calendar event. Second owner's saved empty draft tests complete backup inventory. |
| 3. Restart on same volume | PASS | Graceful SIGTERM exits zero with database-drained log; a fresh production process returns identical book bytes and approval, quote/lead receipts and booking confirmation. SQLite rows and owner calendar/lead reads match. |
| 4. Backup script | PASS | Real `server/scripts/backup.js` exits zero. Manifest includes SQLite plus both saved price books (3 files); SHA-256, byte counts, SQLite integrity and foreign keys pass. Creation-ledger completeness is now independently checked. |
| 5. Wipe, restore, restart and replay | PASS | Stop server, copy verified bundle to separate temporary archive, delete the **entire** fake volume and assert it is absent. Recreate volume, run real restore CLI to a new `restores/synthetic-drill` root, restart with that root. Exact book bytes, approval, quote/lead receipts, encrypted booking-token receipt and confirmation survive. Quote resend returns 200 with identical response. Repeated booking confirmation returns its saved response; one provider event and one appointment remain. |
| 6. Missing/corrupt saved pricing | PASS | Separately inject invalid JSON, malformed service structure and a missing file after restore; restart for each. New requests receive no estimate, historical quote resend returns the original receipt, health stays 200 and submission count stays 2. Authenticated owner receives explicit quoting-paused and restore-from-backup instructions. Missing file stays 409; corrupt file stays 503. |

The first complete baseline rehearsal passed steps 1–5 and the missing-file case.
The two corrupt-file cases failed specifically because the owner's response was
`Internal server error`. They did not crash or release a new estimate.

The expected price was handwritten in [EXPECTED.md](EXPECTED.md) before any
experiment: 5,000 sq ft × $0.02 = **$100.00**, all other adjustments zero.
No booking price/deposit is added. Review requests have no dollar total.

## Confirmed defects and repairs

### BR-1 — High: incomplete backups and restores accepted as verified

**Impact:** a missing saved price book can be silently excluded from a successful
backup and remain unrecoverable after volume loss. An omitted file is not checked
by manifest checksums because it never appears in the manifest.

**Baseline source:** `server/src/backups.js:39–47` verifies only listed files;
`:75–85` enumerates existing JSON files before the asynchronous SQLite backup.
It never compares the copied database's `priceBookCreationRecords` with files.

**Smallest execution:** temporary SQLite database with a creation-ledger row for
synthetic owner `a`; save `pricebooks/a.json`, then remove it and call
`createSnapshot`. Expected: reject incomplete backup and retain last accepted
snapshot. Actual baseline: resolves successfully. A second reproduction removes
the book and its manifest entry from an otherwise checksum-valid bundle;
`verifyBackup` accepts it. A third creates owner `b`'s file/ledger row during the
online copy; the baseline snapshot records `b` but omits its file.

**Rule:** backup contains the database and every saved price book; recovery must
not manufacture an empty replacement for recorded pricing. No dollar calculation.

**Fix:** cross-check the copied creation ledger against manifest inventory during
verification and restore staging. Re-read source books after SQLite's online copy;
reject changed contents/inventory. Failed staging is removed, last accepted bundle
is retained. Regression tests cover missing source, omitted legacy bundle and
concurrent book creation. Original bundles with no creation ledger remain readable;
their completeness cannot be retroactively proven from absent historical records.

### BR-2 — High: backup drops the saved-pricing pause state

**Impact:** an uncertain price-book replacement can be restored without the
`.unconfirmed` marker, silently allowing quoting that the source volume paused.

**Baseline source:** `server/src/backups.js:8,75–81` accepts only `.json` books;
`server/priceBookService.js:112–116` checks `.unconfirmed`; the production bridge
uses that marker to block quote readiness and calculation.

**Smallest execution:** temporary saved book `a.json` plus `a.unconfirmed`.
Expected: never publish a recovery bundle that drops the pause state. Actual
baseline: backup succeeds with database/JSON only. An independent timing case
creates the marker while SQLite backup is in progress; baseline also succeeds.

**Fix:** refuse snapshots when a pause marker exists before or after the online
copy; keep the last accepted snapshot. A confirmed save or restored valid file
must resolve storage first; operators must not delete markers to force backup.
Both timings have regression tests. This does not retrospectively identify pause
markers omitted from bundles made by older code.

### BR-3 — Medium: corrupt-book owner recovery message hidden

**Impact:** quoting correctly stops, but owners see a generic internal error with
no instruction to recover pricing, extending the outage.

**Baseline source:** `server/priceBookService.js:21–32,85–91` emits a controlled
`PRICEBOOK_UNREADABLE` / 503 for corrupt JSON/structure;
`server/src/server.js:466–477` replaces every 5xx message with `Internal server error`.

**Smallest execution:** real authenticated synthetic owner with the approved
$100.00 mowing book restored; replace the JSON with `{broken`, restart, GET
`/api/pricebook/<owner>`. Expected: 503, no new quote, and owner instructions that
quoting is paused and the saved file must be restored from backup. Actual:
503 / `PRICEBOOK_UNREADABLE`, but `error: "Internal server error"`. A valid JSON
object with `services:[null]` reproduces the same defect.

**Fix:** expose a fixed, credential-free recovery message only to authenticated
owners for `PRICEBOOK_UNREADABLE`. Keep status codes and generic treatment of
other server failures. Public callers do not receive the privileged recovery
copy. Regression rehearsal checks both corruption shapes and missing files,
no new receipts, unchanged historical resend, and server health.

## Changes and tests

- Production changes: backup inventory/pause verification and authenticated owner
  recovery copy. No quote arithmetic, approval, billing or booking-policy changes.
- New real-record production rehearsal replaces reliance on the older
  `deploymentProof` placeholder-table test; the older test is retained as a control.
- Added this exact branch to the existing CI push list; commands and gates remain
  unchanged. Both standard test selectors automatically include the rehearsal.
- Five new backup regressions plus eight rehearsal steps/cases and their parent:
  **14 new Node test results**.
- Corrected-harness baseline: **21 results, 13 pass, 8 fail**, zero skips. Seven
  failed assertions reproduce the three defects; the eighth is their parent test.
- Repaired focused run: **56/56 pass**, zero failures, cancellations, skips or
  TODOs. Files: backup rehearsal, backups, deployment process, release storage,
  production engine guard.
- Compressed raw evidence is in `evidence/`. `before.tap.gz` retains initial
  harness mistakes (health shape and omitted synthetic billing evidence); these
  are explicitly **not product defects**. `before-02.tap.gz` is the first complete
  rehearsal; `baseline.tap.gz` includes concurrent regressions before source fixes.
  `targeted.tap.gz` records the repaired 56-test run.

Cold `npm ci`, build, full suite, strict quote gate and hosted CI results will be
recorded in the final checkpoint. No pending run is claimed green here.

## Operational limits

This is local production-mode recovery acceptance with synthetic data, not a real
Railway mount, power-loss, live calendar, payment, email or object-storage drill.
Billing entitlement/calendar settings are explicitly local fixture setup; signup,
pricing, approval, quoting and booking HTTP operations are real application paths.

The launch requirement in `specs/platform_spec_v2.md:932–936` for continuous
off-site replication plus nightly snapshots is **still unimplemented** by the
existing six-hour same-volume snapshot scheduler. The independent archive in this
test is a second temporary directory. No off-site destination or uploader was
provisioned. Volume-loss protection in production remains unfinished until that
existing requirement is implemented and tested. Six-hour snapshots are not
continuous replication or one global transaction across files and SQLite.

Audited starting SHA: `73c00622d6f2df31f57773b32e41355a7421f1a3`.
