# QE reporting-metrics scaling repair

## Scope and source

- Required base and exact parent: `046f9d905435495cab31f5abb02cce1413645e54`.
- Review branch: `codex/qe-metrics-scaling-20261017`.
- Production changes are confined to `server/src/ownerJobMetrics.js` and the
  dedicated `server/priceBookMetricArithmetic.js` helper.
- No specification, quote calculator, contract, price book, bridge, route,
  database schema, UI, dependency, workflow, runner, or existing test was changed.
- `EXPECTED.md` was written and the base was measured before production edits.

## Reproduction and measurements

The isolated dataset is one CUSTOM/CAD/per-job/TAX_NONE group. Record `i` has a
saved midpoint of `10000+i` dollars, outward-rounded 10% endpoints, a final
invoice of `(10001+i)*100` cents, and no change orders. Every invoice is exactly
one dollar above its saved midpoint.

These are local synthetic Node 22.22.0 observations, not production timings.
Construction and `ownerJobMetrics` execution are timed separately. The sandbox
does not permit `process.memoryUsage().rss`, so the table reports Linux
`process.resourceUsage().maxRSS` after the calculation. Each row used a fresh
child process and a 60-second watchdog.

| Source | Records | Construct | Calculate | Total | Max RSS after | Result |
|---|---:|---:|---:|---:|---:|---|
| Base `046f9d9` | 2,000 | 2.092 ms | 9,818.684 ms | 9,820.776 ms | 95,228 KiB | 2,000/2,000 inside; gap $1.00 / 0.01% |
| Repair worktree | 2,000 | 1.544 ms | 20.359 ms | 21.903 ms | 70,884 KiB | same |
| Repair worktree | 10,000 | 7.767 ms | 68.887 ms | 76.653 ms | 88,040 KiB | 10,000/10,000 inside; gap $1.00 / 0.01% |
| Repair worktree | 100,000 | 88.970 ms | 533.735 ms | 622.706 ms | 162,432 KiB | 100,000/100,000 inside; gap $1.00 / 0.00% |

The like-for-like 2,000-record calculation was about 482.3 times faster locally.
Raw structured results are in `baseline-2000-node22.json` and
`repaired-benchmarks-node22.json`. The separate Node 24 observations are retained
only as secondary evidence; they are not substituted for the Node 22 results.

## Algorithm and rounding proof

The old accumulator replaced its running rational after every job by a
cross-product numerator and denominator, then reduced the increasingly large
fraction. Distinct midpoints made that sequential GCD work dominate the request.

The repair keeps integer contributions separately and groups exact rational
numerators by their reduced denominator. At display time it computes a
fixed-scale BigInt lower bound for every remaining rational. If `m` grouped
fractions have nonzero remainders, their exact sum is in the half-open interval
`[lower/S, (lower+m)/S)`, where `S = 10^12`. After division by the original job
count, the interval width is at most `1/S`, regardless of record count.

The code compares that entire interval, using BigInt inequalities, with one
half-away-from-zero two-decimal rounding cell. It returns the fast result only
when every number in the interval has the same result. No per-job percentage is
rounded and no floating-point arithmetic participates.

If the interval touches a rounding boundary, the helper uses balanced exact
rational addition. It forms LCM denominators through denominator GCDs, avoiding
the old unnecessary product, and then applies the original half-away-from-zero
rule once to the exact mean. This resolves positive and negative half-ties rather
than guessing. Equal denominators are combined before either path, preserving
the original observation count even when numerators cancel.

The independent test oracle uses a separately written exact rational adder. It
covers exact `+/-0.005%`, neighboring 19,999/20,001-cent denominators, mixed
denominator half-ties that force the exact fallback, cancellation, relatively
prime denominators, large safe integers, and the existing complete output.
A separate 10,000-trial exact differential probe also passed during development.

## Preserved behavior

Dedicated regressions retain:

- signed approved-change subtraction from the final invoice;
- mean per-job percentage gaps;
- signed/absolute money and percentage gaps;
- realized margin and labor/material/hour comparisons;
- exact selected-option handling and ambiguous-option exclusion;
- currency, unit, and tax-treatment grouping;
- missing values versus recorded zero;
- coverage counts, exclusions, records, output shape, and final two-decimal
  half-away-from-zero rounding.

The pre-existing three-job example is asserted as a complete deep-equal output,
not only as selected fields.

## Local verification

- Baseline focused reproduction after fixture validation: 7 tests, 6 pass / 1
  fail / 0 skipped; the 2,000-record child exceeded its 3-second watchdog.
- Repaired dedicated file: 10/10 pass, zero failures/skips/cancellations/TODOs.
- Repaired focused plus neighboring report/storage/UI-without-browser files:
  101/101 pass, zero failures/skips/cancellations/TODOs.
- Node 22 clean `npm ci`: exit 0, 328 packages installed. An earlier Node 24
  attempt failed because `better-sqlite3` has no matching prebuild and this
  sandbox rejected header ownership operations; that attempt is not a pass.
- Owner/widget build: exit 0.
- Playwright 1.56.0 package install: exit 0, two packages installed.
- Local Chromium installation failed: the first CDN returned a truncated
  archive and the fallback download could not maintain Playwright's lock on this
  filesystem. No local browser pass is claimed.
- Complete local strict gate: 4,708 tests; 4,593 pass / 115 fail / 0 skipped /
  0 cancelled / 0 TODO. The new 10 tests pass. The failures are browser tests;
  the first error is the missing Chromium executable.
- The first complete-suite attempt was interrupted by the execution environment
  after test 4,909 and had no final TAP summary; it is not counted as a completed
  gate. The complete rerun reported 5,686 tests; 5,571 pass / 115 fail / 0
  skipped / 0 cancelled / 0 TODO. The failing names are browser cases and the
  first error is the same missing executable. Hosted Node 22 CI is required for
  final browser and complete-gate evidence.

## Remaining limits

The report calculation remains synchronous on the server request thread. In this
local synthetic run, `ownerJobMetrics` alone occupied about 534 ms for 100,000
records; database reads, response serialization, concurrent load, and production
hardware were not measured. The exact fallback is finite and bounded by the
existing input size, but an adversarial boundary case can do more BigInt work
than the certified fast path. This repair does not introduce a worker, streaming
response, cache, lower record limit, or asynchronous report job because those
would exceed the authorized production boundary.

## Exact-boundary and request-thread follow-up (2026-10-17)

This section supersedes the final paragraph above for the reviewed follow-up
starting at `2aa54a2f9306bcd0565ea0d2010c7daf07c31d1b`. The owner explicitly
authorized reporting workers and the report-handler plumbing for this pass.
`BOUNDARY_EXPECTED.md` and the isolated watchdog reproduction were committed
before production changes.

### Reproduction and repaired measurements

The required family-major 100,000-observation fixture exceeded both local
15-second Node 24 watchdogs on `2aa54a2`: arithmetic-only and complete
`ownerJobMetrics` processes were each killed with `SIGKILL`, with no result.
This confirms the insertion-order-sensitive exact fallback; it does not claim
the separately reported 41/50-second observations as local measurements.

On repair commit `a29ed102bd61f521a3d248c6a4e614c951077f12`, isolated local
Node 22.23.3 observations were:

| Work | Construct | Calculate | Total | Max RSS | Exact result |
|---|---:|---:|---:|---:|---|
| Boundary arithmetic | 93.723 ms | 44.054 ms | 149.088 ms | 111,912 KiB | `0.01%` |
| Boundary owner metrics | 144.946 ms | 690.161 ms | 845.241 ms | 201,044 KiB | 100,000/100,000; `$4,375.73`; `0.01%` |
| Complete boundary report calculation | 151.741 ms | 1,072.654 ms | 1,234.317 ms | 195,432 KiB | same job metrics, complete report |

The normal Node 22 fixtures on the same commit remained exact:

| Records | Construct | Calculate | Total | Max RSS | Percentage result |
|---:|---:|---:|---:|---:|---:|
| 2,000 | 1.520 ms | 20.645 ms | 22.165 ms | 73,392 KiB | `0.01%` |
| 10,000 | 8.356 ms | 68.210 ms | 76.567 ms | 90,100 KiB | `0.01%` |
| 100,000 | 102.571 ms | 535.551 ms | 638.122 ms | 164,784 KiB | `0.00%` |

These are synthetic local observations, not production timings. Raw results are
in `repaired-boundary-node22.json` and `repaired-benchmarks-node22.json`.

### Exact arithmetic change

The interval-certified fast path is unchanged. Only its exact fallback now
partitions reduced fractions by the denominator left after removing factors of
two and five. Each partition is summed exactly with the existing GCD/LCM adder,
then partitions with the same reduced denominator are combined before the
balanced global sum. This is an algebraic regrouping, not an approximation:
no observation or denominator changes, and rounding still occurs once on the
exact total divided by the original observation count.

For the required fixture, the second and third family already share a
denominator and combine to `(p-1)/p`; grouping that with the first family's
`(p+2)/(2p)` collapses each prime to exactly `3/2`. The final `1/2` makes the
mean exactly `0.005%`, and the unchanged half-away rule returns `0.01%`.
Negative half-ties and the independent exact-oracle cases remain covered.

### Request-thread, concurrency and failure behavior

The authenticated request thread still performs all owner-bound SQLite reads,
the existing 100,001-row completeness guards, date-range validation, and
settings validation. It then sends only those tenant-scoped rows to a bounded
worker for the pure report calculation. The synchronous `report()` API remains
available and byte-for-byte behavioral comparisons against it pass; the real
HTTP handler uses `reportAsync()`.

Production defaults to one active report worker, four queued reports, and a
60-second deadline measured from submission. Every accepted task gets a fresh
worker. Completion terminates it so no idle worker retains tenant rows.
Cancellation, timeout, worker error, invalid worker output, or queue overload
rejects the complete report; timeout and cancellation terminate the worker so
CPU work does not continue. No partial report or fabricated zero is returned.
The pool tests also run two reports concurrently under an explicit two-worker
configuration, queue the next, reject work beyond the configured bound, and
prove recovery after timeout, cancellation, and worker failure.

In a real synthetic Node 22 server run with 100,000 boundary records, an owner
price-book preview through the normal quote calculation route took 85.982 ms
without report load and 545.358 ms while the report ran. It completed before
the report response, which took 1,846.590 ms. The owner report returned the
exact expected metrics; staff received 403 and another owner received no job
metrics. The route-source review hash changed only because the existing owner-
authenticated report handler now awaits the cancellable async service.

### Remaining limits after the follow-up

SQLite reads, structured-clone submission/result transfer, and final JSON
serialization still occur on the server process and can add latency; the local
loaded quote was slower than its idle control even though it no longer waited
for report arithmetic to finish. The default single worker deliberately trades
parallel report throughput for bounded peak memory. A fifth waiting report is
rejected because four waiting reports are the queue limit; later arrivals fail
closed instead of consuming unbounded resources. Exact inputs unrelated by
decimal denominator factors can still make
the fallback more expensive than the fast path, but the bounded worker deadline
now prevents that CPU work from freezing the server indefinitely.

## Final local gates for this follow-up

- Remote production repair commit used by this evidence: `a29ed102bd61f521a3d248c6a4e614c951077f12`.
- Clean Node 22 owner/widget build: exit 0.
- Dedicated arithmetic, worker, service, HTTP, responsiveness and tenant regressions: 18/18 pass, zero failures, skips, cancellations or TODOs.
- Complete strict quote gate: 4,716 tests; 4,601 pass / 115 fail / 0 skipped / 0 cancelled / 0 TODO. Every failure was a Chromium launch hook after the installed headless shell exited with SIGTRAP in this sandbox.
- Complete repository suite: 5,694 tests; 5,579 pass / 115 fail / 0 skipped / 0 cancelled / 0 TODO. The same 115 Chromium launch hooks failed; no non-browser assertion failed.
- Hosted CI remains the authoritative working-Chromium gate for the final branch head.
