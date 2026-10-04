# October 4 quote-engine / price-book final repair

Base: `3e71b1bbfe15661cbc48f29e0bda809d6c77279b`, branch `claude/audit-fixes-2-20261004`. The owner authorized fixing the four findings from the direct read-only verification: N03, N05, N06 and N07. Work was performed directly, without subagents.

## Resulting behavior

- N03: a large catalog with incomplete first replacement and existing products can find a live interior reference. Already evaluated results are reused; finding a live pair avoids the previous full-grid fallback. In the independently repeated 40×40 fixture, ordinary owner readiness dropped from 6,918 ms to 460 ms and commercial-scope readiness from 7,310 ms to 455 ms. Timing is environment-specific. No-live catalogs still receive an exact exhaustive check rather than a fabricated readiness result.
- N05: the OS-managed lock writes no auxiliary SQLite data and needs no `COMMIT` after a durable JSON replacement. JSON save/approval success is not reclassified as failure by a late auxiliary commit. Cleanup retries a still-open handle and preserves the actual save outcome. Failure to close a still-open lock emits an operational warning. Existing unconfirmed-marker, rename and directory-flush rules remain intact.
- N06: each business locks a separate SQLite file, named with a SHA-256 hash of its owner ID, beside the price-book directory. A live same-owner holder still produces a bounded 409 conflict; another owner can save independently. Connections are closed after every outer operation, so an owner catalog does not create an unbounded cache of open database handles. Nested ownership is checked for the actual owner rather than any held save.
- N07: large-catalog coverage retains both products in every checked reference combination, deduplicates the repeated reference pair, and says that the result concerns the two products shown. A failing reference pairing no longer appears as an unqualified failure of a single product. Every actual customer pairing still receives full quote validation.

Quote formulas, monetary units, financial pipeline, customer amounts/wording, owner prices and the engine approval version are unchanged. No dependencies or frontend source were changed. The existing owner renderer displays both saved selection values and the specific coverage message.

## Regression evidence available before publication

- New `test/quoteFinalRepairs20261004.spec.mjs`: 10 passes, zero failures, skips or cancellations. Includes save and approval commit-error conditions, post-release cleanup errors, nested synchronous operations, rejection of an async callback before execution, real two-process same/distinct-owner behavior, partial ordinary/commercial 40×40 catalogs, no-live coverage, and the extreme-rate reference-partner counterexample. Fixed hand amounts: $125.00; 1,470,000 / 1,690,000 cents for the ordinary/commercial fixtures; 4,680,032,740,000,000 cents for the safe boundary pairing.
- Current `test/auditFixes20261003.spec.mjs`: 28 passes, zero failures/skips/cancellations. The existing live/crashed-holder helper now acquires the actual exported application lock for the selected owner; it no longer hard-codes the obsolete shared mutex database. Same-revision writers still yield one accepted edit and one conflict. Legacy PID lock files remain harmless.
- Current `test/pricebookDurability.spec.mjs`: eight passes, zero failures/skips/cancellations.
- The new four readiness tests run against untouched `3e71b1b`: one control passed and three tests failed, detecting both slow partial catalogs and the lost partner context. The full new baseline attempt was not usable because the local native runtime aborted; the earlier independently completed N05/N06 reproductions remain their before-fix evidence.
- Repeated original N02 overflow input remains incomplete/review; no arithmetic shortcut or price pruning was reintroduced.
- 65 existing independent/measured-scope fixtures have identical internal quote, sanitized customer quote and ordinary readiness snapshots before/after. Only independently generated `quoteId` fields were normalized; monetary values, inputs, identity, rules, diagnostics and wording were compared in full.
- Owner and widget builds passed locally. The automatic quote test selector includes the new regression file (45 selected files).
- Hosted final-source CI is pending at this checkpoint. Exact uploaded source hashes and the completed gate result will be added after publication; this initial report is not a launch or deployment acceptance.

Local native tests retain genuine database handles in an external harness to avoid this workspace Node 24 runtime's `RemoveEnvironmentCleanupHook` cleanup assertion. They use actual SQL, filesystem writes and real child processes, without substituting business outcomes. Initial aborted combined/native runs were not counted as successful suites. Hosted Node 22 checks run ordinary unmodified test commands without the retention workaround. Counts overlap and are not unique-test totals.

## Operational limits

All writer processes sharing a price-book directory must use the same per-owner protocol on a local filesystem. Do not replace/unlink active lock database files. The new `.saves` directory contains mutex files, not owner pricing; each price book remains the durable JSON file with the existing pause-marker safety procedure. A deployment must stop old writer processes when changing lock protocols. No merge or deployment was performed in this task.

Large catalogs with no live pair still require an exhaustive exact check. The repair removes the unnecessary seven-second fallback when an interior live pair exists; it does not claim constant-time validation for every possible catalog. Every reported coverage entry is an actually checked combination.
