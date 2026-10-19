# Agent 4 F8 import punctuation repair

Local repair and verification are complete. Publication and exact-final hosted verification are pending at this commit; the final external attestation will bind them to the published SHA without changing this tested tree.

Branch: `codex/qe-agent4-import-punctuation-20261019`.
Exact base: `9af52ddc13c78beec84e7f090506da8c9b5fd691`.

## Defect and repair

The existing `accessOrPaymentCondition` detector required whitespace between its bounded phrase words. Parentheses and colons caused visible eligibility/payment notes to disappear before structural association, leaving an apparently unconditional price.

Only `server/src/websitePriceExtraction.js` changes among existing files. The same phrase detector now accepts Unicode punctuation or whitespace between those existing words. It does not remove intervening words, rewrite saved excerpts, evaluate eligibility, change association rules or modify downstream price arithmetic. This is bounded phrase recognition, not unrestricted natural-language understanding.

The exact plain input is `NOTE\n\nWidget $10 each`. The exact HTML input is `<html><body><p>NOTE</p><div><p>Widget $10 each</p></div></body></html>`. Every note below was tested in both forms, through direct extraction/calculation and actual import draft → owner save → real voice dispatcher, with quantity `"3"` and `customerConfirmed:true`.

| Qualification | Base, both forms and paths | Repaired, both forms and paths |
| --- | --- | --- |
| Available (exclusively) to members | Note discarded; calculated `30.00` | Note retained verbatim; `needs_review`, no extended amount |
| Available: to account holders | Note discarded; calculated `30.00` | Note retained verbatim; `needs_review`, no extended amount |
| Payment (by cash) | Note discarded; calculated `30.00` | Note retained verbatim; `needs_review`, no extended amount |
| Payment: by cash | Note discarded; calculated `30.00` | Note retained verbatim; `needs_review`, no extended amount |
| Eligible (customers): account holders | Note discarded; calculated `30.00` | Note retained verbatim; `needs_review`, no extended amount |

Established associations retain `conditionsUnverified:false` and the exact condition. Ambiguous detached/selected-item associations withhold affected entries and set `conditionsUnverified:true`; unrelated sections remain unchanged. Drafting does not replace existing saved prices. Saving preserves exact imported text; stripping a condition fails saved identity. Dispatch is read-only and does not expose private synthetic sentinel fields.

## Baseline and verification

`EXPECTED.md` records outcomes and hand-calculated amounts before execution and production editing. The corrected pre-edit baseline reproduced all 20 reported input/path combinations (10 inputs × direct/route paths), each with `calculated`, `30.00`, and `conditionsUnverified:false`.

| Local run | Actual result |
| --- | --- |
| Corrected new-test baseline before production edits | 54 pass / 62 fail / 116 tests |
| Final new regressions | 116/116 passed |
| Unchanged retained selection | 758/758 passed |
| Retained selection plus new file | 874/874 passed |
| Owner app and widget build | Passed |

All passing runs have zero failures, cancellations, skips and TODOs. Counts overlap. The new file is `test/voiceAgent4ImportPunctuation20261019.spec.mjs`, selected once by the existing full-suite convention and excluded from strict quote. No selector was changed. Local runs used Node 22.23.1 and a writable temporary directory outside the repository. Dependencies were installed from the unchanged lockfile. Build-generated tracked output was restored to its original bytes.

Coverage retains the four original F8 qualifications and the cash-price control, unrelated descriptions with intervening words, plain/HTML boundaries, multiple cards, semantic and heading sections, ambiguous association, hidden text/CSS/instructions, saved identity and private-data boundaries. Actual draft/save/dispatcher controls calculate $10 × 3 = $30.00, $0.10 × 3 = $0.30, and CAD 0.335 × 3 = CAD 1.01. Board-on-board, Nail-in and Plug-in controls remain exact.

Two new-test expectation mistakes are fully retained and explained in `BASELINE_SETUP.md`: the initial route-shape expectations and the later unaffected-section heading expectation. Their source snapshots and failed logs remain. The latter expected literal was checked against both the exact base and repair before correction. No pre-existing assertion was modified or relaxed. Final commands, output hashes and counts are recorded separately from those setup runs.

## Retention and history

The pre-edit manifest covers all 3,200 tracked base files. All 3,199 outside the owned extraction file remain byte-identical, including 388 existing test/fixture files and 2,102 existing verification files. The retained 305-test parser file remains SHA-256 `e522c4a0f86b30d51578d9e235c25d15e37f715d5b8cbe897c4e410e28d27bc9`. The arithmetic/parser file is unchanged.

The original merge `c58ca997e9cf63739d399939bcdade83e97874d2` and its ordered parents `235eb5c978f847c2d47379ae3cf03b52c1f9104c` and `4f6152413a650085a7fe6002dfd077a542f9c0c2` remain ancestors. No earlier branch or recovery bundle was changed. No specifications, dependencies, workflow, selectors, engine arithmetic, main/integration branch, tag or deployment changes. Work was performed personally without subagents.

## Exact-final hosted gate

The final head must be published through authenticated Git, fetched back with matching SHA/tree/ancestry, and pass cold install, build, browser checks, strict quote, full suite, checker, audit and synthetic Docker startup. The full-suite log must include all retained 758 assertions and all 116 new assertions. Local targeted passes alone are not completion. Final hosted metadata, logs, assertion-level coverage and publication readback will be delivered in a separate attestation at that exact head; this checkpoint does not claim those gates have already run.
