# Quote readiness and optional-scope repairs — October 4, 2026

The previous completion claim was too broad. Passing the original five audit
reproductions did not catch the additional failures below. They were present at
`4b6deeca4bd5f3070f3262c3950210602f14b0ae` and repaired in
`42812a71ef31604d34140ea32ecc12b0bda53552`.

## Confirmed defects and changes

| Defect | User impact | Repair and verification |
| --- | --- | --- |
| Catalog validation still repeated work for every failed pair | Cold 80-by-80 public status calls blocked the event loop for 9,066 ms with unclassified zero prices, 2,911 ms with missing registrations, and 2,793 ms when only the final pair could quote. Earlier shared-blocker exits did not cover these catalogs. | Snapshot and freeze private validation inputs once per tier; reuse structure, factor and offering-registry checks while still validating each customer selection. Corresponding public calls took 377, 153 and 331 ms locally. Exact failed-pair coverage, last-pair amounts, free-price controls and snapshot isolation are tested. |
| Unselected measured-scope setup blocked priced base work | Missing prices or descriptions for stairs, floor overlay, siding trim/removal, demolition, exposed aggregate, or commercial insulation/coverboard prevented an unrelated, fully priced base request. Both installed and itemized modes were affected; tier options were also lost. | Apply missing-scope diagnostics to the selected work and probe optional additions only after their pricing is complete. Saved approval, tier completion, exact base totals, requested missing-price rejection and owner coverage are tested. Malformed prices still block quoting. |
| Incomplete shared paint packages were treated as contradictory prices | An unfinished ceiling product sharing a purchase group with wall paint could block a wall-only job. Missing price, coverage or waste was compared as if it were a conflicting supplied value. | Compare supplied purchase-group values, retain previously supplied values across incomplete members, and preserve missing-field diagnostics for the requested scope. Missing optional products no longer disable walls; genuine conflicting prices, coverage and waste still fail closed in either map order. |
| Optional configured offerings disabled base readiness and lacked price coverage | Unpriced ceiling/trim offerings and unclassified zero-price gate/removal offerings could disable independently priced wall/fence work. Owner coverage did not report those optional offering-price gaps. | Keep base activation probes, validate configured additions independently, and expose their setup through the existing coverage mechanism and existing labels. Installed/itemized painting and both fencing services have base-total and selected-work rejection checks. Gate-width compatibility remains enforced. |

No price amounts, monetary defaults, arithmetic formulas, customer rounding,
customer contract fields or approval requirements were changed. Work stayed in
the quote engine and price book; no sub-agents were used.

## Regression evidence

- **1,056/1,056 local tests**, across 38 quote/price-book test files; zero
  failures, skips or cancellations. This includes 128 new tests.
- Before the repairs, all 28 measured-scope isolation tests failed. The optional
  offering/package suite failed 20 of 22 tests; its two genuine-conflict
  controls already passed.
- **65 fixtures / 130 internal and customer quote comparisons** are unchanged,
  normalizing only generated `quoteId` fields.
- All 65 owner-status comparisons are accounted for. Eight acquire optional
  coverage rows. In the fixture missing all paint products, two ceiling-only
  diagnostics move from base blockers into coverage; its missing wall/prep
  products still block activation. No other status differences are allowed by
  the comparison script.
- Fourteen pre-existing measured-scope status assertions encoded the old
  whole-service rejection. They now implement the October 1 specification:
  priced base work remains quotable. Their selected-scope rejection and
  unchanged-customer-facts assertions remain, and incomplete owner coverage is
  now explicitly asserted. Missing essential underlayment/wall-product tests
  still expect `NEEDS PRICING`.
- All **187 materialized JavaScript, JSX, MJS and JSON files** present in the
  code checkpoint matched GitHub blob hashes, including all seven changed
  production/test files. See [source binding](source-binding.json).

Hosted verification passed: **1,234/1,234** strict quote/price-book tests and
both builds. The broader suite retains exactly nine existing allowed failures
and two skips, with no new failures. See [hosted evidence](CI_EVIDENCE.md).

## Files and reproduction

- [Local named outcomes](local-regressions.tap) and [file list](local-test-files.json)
- [Measured-scope failures before repair](measured-scope-before.tap)
- [Offering/package failures before repair](offering-scope-before.tap)
- [Public status timings before](performance-before.jsonl) and [after](performance-after.jsonl)
- [Readiness test timings](readiness-metrics.json)
- [Explained differential results](differential.json) and [comparison script](compare.mjs)
- [Machine-readable results](results.json)

Run the normal `npm run test:quote` gate from a complete checkout with the
lockfile dependencies installed. The three new regression files are selected
automatically through their quote/price-book imports. `compare.mjs` accepts a
separate checkout of the previous checkpoint. `performance.mjs` accepts a
checkout path and reproduces the cold public status cases.

The performance fixture books are deliberately unapproved, so public readiness
remains `NEEDS PRICING`. The last-pair regression separately checks raw readiness
and its exact 1,550,000-cent quote. Timings are observations on the recorded
machines, not a deployed throughput guarantee.

## Boundaries

This checkpoint fixes the reproduced defects and passes the recorded scoped
checks. It is not proof that every possible defect is absent. No merge,
deployment, live customer data change, or whole-product launch gate is included.
Historical evidence describes its original source version and is preserved.
