# Test setup and preserved runs

All corrections below preceded production edits. Original test source and raw failures are retained as `initial-harness-*`; intermediate diagnostic/candidate logs are retained too.

- Initial 72-test attempt: 15 pass / 57 fail. The navigation label `Prices` was itself classified as a page-local note by the existing extractor, contaminating duplicate and section expectations. Synthetic navigation now uses `Next`; original inputs/results remain available. This existing conservative over-inclusion was not changed in production.
- The fixture reused `PN_SYNTHETIC` despite the database uniqueness constraint. Each synthetic tenant now has a unique SID.
- The real signed voice path correctly denied the synthetic accounts: the billing evidence trigger had moved them to `pending_payment`. The fixture now seeds synthetic verified billing evidence and marks the synthetic account active after inserting that evidence, before exercising any route. No eligibility gate is bypassed or changed.
- One diagnostic query initially used the nonexistent column `summary`; it was corrected to the schema's `summaryText`. Its failed log remains.
- The unchanged-base 72-test candidate after those corrections was 34 pass / 38 fail. Two default-limit checks were then added, before any production edit. The official 74-test baseline is 34 pass / 40 fail, with no skips/cancellations/TODOs. The source snapshot and source hashes accompany it.

The separate five handoff probes assert stronger safety outcomes across an unread-page limit and a running provider snapshot. All five fail on the base. They are deliberately outside ordinary test selectors and are not claimed as passing regression coverage.

The first repair run still reproduced two failures for `Site-wide: selected items require membership`: the old general condition detector recognized `required`, but not `require` without another pricing keyword. Explicit website-scope labels now recognize that predicate. That first run also ended without a complete TAP summary; it is preserved as `first-repair-*` and is not counted as a completed test gate. The subsequent candidate completed 74/74. Final commands and results are recorded separately.
