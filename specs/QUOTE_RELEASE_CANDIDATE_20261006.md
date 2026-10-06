# Quote release candidate — October 6, 2026

This candidate combines these pinned inputs without changing main or deploying:

- Website import: `0e687907cca8b186d8b85eb285bb82c1deda6a6d`.
- Engine core and date repairs: `509891e39318bee344951278dd2667e4ab1f700a`.
- Voice repair and verification: `20f1cd3b9ef73c418bb5b6828da8031f2ba3bb59`.

Branch: `codex/quote-release-candidate-20261006`. Synthetic data only; no subagents.
The engine remains v7. Integration carries the already approved v7 arithmetic
and approval boundary; storage and diagnostic repairs introduce no new prices,
rounding rules, owner defaults or automatic approvals.

## Expected results written before the new regression tests

- Mowing: 5,000 square feet × $0.02 = **$100.00**. With no fees, markup,
  tax or range buffer, saving and loading the same approved service still
  quotes **$100.00**. Its saved rates, identity and approval receipt must stay
  unchanged. A second owner's book must stay unchanged.
- The same job at a configured October 10% labor surcharge adds **$10.00**,
  for **$110.00**. At `2026-11-01T06:30:00.000Z`, Los Angeles is still in
  October and quotes **$110.00**; UTC is in November and quotes **$100.00**.
- Invalid quote instants, malformed date records, contradictory months, or an
  enabled surcharge without a valid book/profile time zone require review,
  **with no dollar estimate**. The diagnostic must identify the invalid instant,
  date zone, current month, or missing business time-zone setting accurately.
- Missing/null/undefined/empty new IDs receive a UUID. Invalid supplied IDs and
  case-insensitive duplicates are rejected before file replacement. Valid IDs
  are preserved exactly, including casing; saves never rewrite existing IDs.
- Malformed saved service, pricing, tier, override and defaults containers give
  `PRICEBOOK_UNREADABLE` / 503, with quoting paused and no data replacement.
  Structurally valid incomplete drafts remain readable and not quote-ready.
- Invalid saves leave the previous accepted file and its quoting state intact.

Existing monetary suites retain their original hand-written expectations. The
core integration expectations are in
`server/quote-engine-vnext/CORE_FIXES_20261005.md` and
`server/quote-engine-vnext/DATE_CONTEXT_FIX_20261006.md`; the website import
expectations are in `specs/WEBSITE_PRICE_IMPORT_20261006.md`. No financial
assertion may be relaxed to make the combined candidate pass.

## Integration verification

The merged v7/core baseline passed 112 existing core regressions. The new
storage/date suite detected 34 failures with seven passing controls before the
repairs, then passed all 41. Storage/date checks plus existing persistence and
date tests passed 75/75. Forty-two existing financial fixtures have identical
before/after outcomes, line items and scenario totals (33 ready, nine review).

Voice integration exposed an additional date-caller gap: its readiness adapter
relied on a separately registered database, and quote preparation/calculation
used the system clock instead of the supplied trusted runtime clock. Four
synthetic integration checks reproduced the gap before the repair. The voice
prompt catalog, status, intake and calculation now pass their runtime database
and clock explicitly. The expected boundary prices above remain $100/$110;
changing the profile to an invalid zone immediately unpublishes the seasonal
service until corrected. No provider call or live data is used in these checks.

The existing module-mock tests passed 10/10 under Node 22's explicit test flag.
The full-suite runner enables that flag so these tests run instead of the two
previous skipped placeholders. The strict quote gate remains zero-skip and the
broader failure allowance remains empty.

## Full-runner scheduling regression

The documentation-only final-head run 37418389759 passed the strict gate
1,968/1,968 but the full suite passed 2,337/2,338: the 320-product
`different_basis` check took 1,576 ms with a 1,578 ms timer delay, exceeding
its unchanged 1,500 ms limit. Unlike the strict runner, the CLI full runner
started multiple test files concurrently. A synthetic two-file lock probe
reproduced overlapping workers before the repair. Its expected result is two
completed files, each once, no overlap, zero failures/skips; it calculates no
money. The runner now sets `--test-concurrency=1`. No timing or financial
assertion changes. The unchanged 26-case catalog suite passed locally, with
the affected full-path probe at 705 ms. Existing handwritten dollar expectations
remain those in `specs/CATALOG_STALL_REPAIR_20261005.md`.

The existing reporter-flag source assertion is preserved by placing the
scheduling flag before `--test`; the 28 audit controls and scheduling regression
passed 29/29 locally. Hosted run 37419693928 at
`46af683a358fd0a7dadf100d32ef9650fe87d6b9` passed cold installation, both builds,
the strict gate 1,968/1,968 and the full suite 2,339/2,339, with zero failures,
cancellations, skips or TODOs. The affected full-suite catalog probe measured
614 ms. See BUILD_STATUS for the complete verification record and local limits.
