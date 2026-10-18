# Agent 4 — F7/F8 listed prices and import qualifications

**Incomplete:** publication and exact-final hosted verification are blocked, and both local broad-gate attempts lack final summaries.
Targeted passes are not a completed release gate. See the final verification
matrix below and `publication-access.json` for the exact access failures.

## History and scope

New branch: `codex/qe-agent4-listed-import-20261018`.
Restored exact merge: `c58ca997e9cf63739d399939bcdade83e97874d2`.
Ordered merge parents: `235eb5c978f847c2d47379ae3cf03b52c1f9104c` and
`4f6152413a650085a7fe6002dfd077a542f9c0c2`.
Bundle prerequisite `c1817621f6eccb31822979bf994efc4902682d34` was fetched
from the repository; the supplied bundle verified before restoration.
The final Agent 4 commit directly descends from the exact restored merge.

Only these existing production files change:

- `server/src/voice/listedPriceCalculation.js`
- `server/src/websitePriceExtraction.js`

New tests use `test/voiceAgent4*.spec.mjs`; all new evidence is in this directory.
No prior tests/evidence, selectors, specs, dependency manifests/lockfiles,
workflows or engine versions are changed. No subagents, force push, shared-branch
write, main merge, deployment, tag, customer data or live provider operation.

## Before and after

The expected outcomes were written in `EXPECTED.md` before production edits.
All 305 retained tests passed on the untouched restored parser. The corrected
new-test baseline registered 120 tests: 41 passed, 79 failed (37 F7 and 42 F8).
Setup mistakes are separately preserved and excluded from that behavioral count.

`before-examples.json` and `after-examples.json` capture actual direct-parser,
real-dispatcher and extraction results from the replayable `examples.mjs`.

| Exact F7 listing, quantity 3, confirmed | Before: direct / dispatcher | After: direct / dispatcher |
| --- | --- | --- |
| Widgets/on collection $10 each | calculated 30.00 / calculated 30.00 | needs_review / needs_review |
| Widgets.by arrangement $10 each | calculated 30.00 / calculated 30.00 | needs_review / needs_review |
| Widgets-on collection $10 each | calculated 30.00 / calculated 30.00 | needs_review / needs_review |
| Weather permitting $10 each | calculated 30.00 / calculated 30.00 | needs_review / needs_review |
| Online orders $10 each | calculated 30.00 / calculated 30.00 | needs_review / needs_review |

Every refusal has the existing exact verbatim-listing fallback, no extendedAmount
and no calculated voiceSummary. Saved text and compiled listing facts remain
literal. The original five reported conditions are among the unchanged 305 tests.

F7 recognizes prepositional phrases after punctuation and bounded weather/channel
phrases. Only the established Board-on-board, Nail-in and Plug-in compounds are
explicitly protected from the preposition check. Weather station, Online training
manual, Onyx tile, Inline filter, Standby lamp and Porcelain basin are additional
positive controls. The arithmetic/rounding/currency tail is byte-identical.

This is conservative, bounded English pattern recognition. It does not establish
natural-language understanding or guarantee recognition of arbitrary restrictions.
Other ambiguous product names can still be refused. Customer confirmation does
not establish eligibility for any conditional price.

For the exact requested separate-card HTML, each of these previously disappeared
while conditionsUnverified was false; each now appears verbatim in the listing's
conditions, with conditionsUnverified false because the scope is established:

- Available exclusively to members
- Available to account holders
- Payment by cash
- Eligible customers: account holders

The control `Prices apply to cash payments` remains unchanged. F8 adds bounded
availability, eligibility and payment-clause detection to the existing structural
association. It does not invent wording or evaluate eligibility. Tests cover
multiple cards, semantic sections, heading boundaries, detached plain text,
selected-item ambiguity, unrelated descriptions, inline markup/entities, hidden
content, CSS visibility uncertainty and instruction exclusions. Ambiguous binding
withholds affected entries and marks conditionsUnverified/limited.

Actual local HTTP imports pass through the production draft route, explicit owner
save and real voice dispatcher for all four qualifications in HTML and plain text.
Before save the existing $8 listing still yields $24 for quantity 3. After save,
qualified imports remain literal and yield review; stripping the qualification
fails saved-listing identity. An unconditional $10 import still yields $30.

## Verification

The 425-test focused run is the unchanged 305 plus all 120 new tests. The 722-test
neighboring run includes those 425 and 297 extraction/import/runtime neighbors.
Both have zero failures, cancellations, skips or TODOs. Counts overlap.
Build and production dependency audit pass; the audit reports zero vulnerabilities.

Local browser installation hit a stale download lock. The resulting headless
Chromium binary was launched and exited with SIGTRAP. The first strict attempt
stalled after test 1529 and was stopped without a final summary; the two unchanged
adjacent fence suites independently passed 39/39. That partial run is retained
and is not counted as a pass. A subsequent full attempt also stalled and was
interrupted. Both gates were then retried using the default browser lookup,
which reports the missing browser prerequisite explicitly. No selectors,
assertions or workflow were edited. Final results are recorded below.

`base-retention.json` is the pre-edit hash manifest. `retention.json` compares all
previously tracked files and records the exact unchanged 305-test file hash.
`local-results.json` records counts and raw-log hashes; `gate-failures.json`
contains every captured broad-gate failure diagnostic. The new voice tests are
discovered once by full-suite selection and excluded from strict quote by existing
conventions (334 full files / 268 strict files). The incomplete full run did not
reach these voice files; their execution evidence comes from the complete focused
and neighboring runs. No partial log is promoted to a complete gate.

## Final local results and retention

| Check | Result |
| --- | --- |
| Retained parser baseline | 305/305 passed |
| Corrected new-test baseline before production edits | 41 passed / 79 failed / 120 tests |
| After-fix retained plus new tests | 425/425 passed, zero failed/cancelled/skipped/TODO |
| Expanded neighboring selection | 722/722 passed, zero failed/cancelled/skipped/TODO |
| Build | Passed |
| Production dependency audit | Passed; zero vulnerabilities |
| Final local full attempt | Incomplete; exit 1; no final summary; 4,230 top-level results recorded |
| Final local strict attempt | Incomplete; stopped advancing; interrupted with exit 130; no final summary; 2,933 top-level results recorded |
| Full-suite checker run independently on saved output | Failed; missing final summary counts |
| Local Docker | Unavailable; command not found (127) |
| Exact-final hosted install/build/browser/strict/full/checker/audit/Docker | Not run; publication blocked |

The final full log contains 93 browser-launch failure records and one failed
parent; strict contains 65 browser-launch failures and one failed parent. There
are no other assertion-failure records in these **partial** logs. That does not
establish the outcome of unexecuted tests. The full runner's early exit is not
explained by its captured output: it ends after an unrelated HTTP fixture logs
that its server is listening. No complete local or hosted pass is claimed.
Earlier interrupted attempts and setup failures remain in this directory.

Retention is verified against all 3,129 original tracked files: **3,127 are
byte-identical**, only the two owned production files differ, and none are
missing. This includes **393 existing test/fixture files and 2,034 existing
verification files**, all unchanged. The retained 305-test file SHA-256 is
`e522c4a0f86b30d51578d9e235c25d15e37f715d5b8cbe897c4e410e28d27bc9`.
Both required parent histories and the prerequisite base remain ancestors.
Build-generated `client/dist/index.html` was restored to its original bytes.

## Publication and recovery

The authorized GitHub connection reports push permission, but ordinary Git has
no credentials (`could not read Username for 'https://github.com': terminal
prompts disabled`). The connector returns 404 for the exact merge object and
422 `Object does not exist` when asked to create the new branch at that SHA.
Its available commit-creation tool does not expose original author/committer
timestamps or raw commit bytes. Recreating different commit identities would
violate the required history, so no such substitution is performed.

No exact-final hosted install/build/browser/strict/full/checker/audit/Docker
success is claimed. No result from either earlier branch substitutes for it.
A self-contained bundle and external final attestation preserve the exact final
commit, its parent, both merge histories and all evidence. Final publication
attempts and bundle verification are recorded in that attestation, avoiding a
self-referential commit hash inside its own report.
