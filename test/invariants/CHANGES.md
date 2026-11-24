# Frozen outcome and known-finding changes

Every change to `frozenOutcomes.json` or `knownFindings.json` is recorded here
with its reason, by `update-snapshot.mjs`. A change without an entry here is a
regression.

## 2026-11-24 — Initial snapshot (audit f1501ff #1 fix applied)

Snapshot of 1,244 outcomes: 42 live base services, each price removed and each
price set to $0, one at a time.

Verified against the untouched f1501ff engine: the same harness found
69 findings there, 42 of them `NO_THROW` (removing any height limit from any
fence catalog row crashed readiness; audit #1). With the #1 fix, exactly those
42 outcomes changed, all from `{"status":"THROWS"}` to
`{"status":"NEEDS PRICING","result":"ESTIMATE_REQUIRES_REVIEW","cents":[]}`.
No other outcome changed. A second snapshot run changed nothing (deterministic).

27 known findings remain, all open audit items:
- 18 `SILENT_LIVE` in fence catalogs: a height row missing its main price
  leaves the service LIVE with no owner notice (audit #4, wider than reported).
- 9 `BLOCKED_QUOTES` in flat roof repair: a $0 medium/large patch allowance or
  a missing largest-repair size blocks the whole service while small repairs
  quote (audit #12 family).
