# Condition-extension repair — local verification

Publication and exact-commit hosted verification follow this source checkpoint.
The final delivery includes the actual remote identity and complete hosted logs;
this document does not claim those pending gates have passed.

Base: `db1dcb4cb4dedebb59811c390c8fe2ac9a608846`.
New branch: `codex/qe-agent4-condition-extensions-review-20261019`.

The original attached reproduction ran unchanged: **0/5 passed**. All five
notes also failed through actual draft/save routes, provider-visible saved
facts and the real voice dispatcher: both pages were fetched, the saved price
was bare `Widget $10 each`, both flags were false, and direct/dispatcher
calculation returned `calculated` / `30.00`. See `baseline-new-exact-five.json`.
The new 73-case suite initially had **25 passes / 48 failures**. All failures
concerned condition preservation; no expectation or assertion was weakened.

The extractor previously required a complete match against a closed list of
short clauses. Timing/applicability continuations now follow recognized
obligation/weather predicates, starting at explicit relation words. The whole
visible note enters existing association and size checks. Saved wording is
never reconstructed from matched words or truncated to a recognized prefix.
Bare online-orders clauses do not acquire arbitrary descriptive tails.
This remains bounded deterministic recognition, not general language analysis.

Each of the five exact attached notes is now retained verbatim after the price.
Both pages are fetched with default limits; the fully preserved cases correctly
have limited=false and conditionsUnverified=false. Direct and real dispatcher
results require review without an extended amount. Actual draft/save/provider
checks also cover late discovery, entry caps, exact/short text caps and multiple
prices. Short budgets withhold the complete listing instead of trimming terms.

Local results (zero skips/cancellations/TODOs in passing runs):

| Run | Passed | Failed |
| --- | ---: | ---: |
| Original attached reproduction after repair | 5 | 0 |
| New regression file | 73 | 0 |
| Retained selection | 1,135 | 0 |
| Combined selection | 1,208 | 0 |

Owner and widget build: passed. Raw commands, source hashes and TAP/log output
are retained. Literal passing test names match the previous 1,135-name set.
The existing voice filename convention keeps the new tests outside strict
quote selection; selectors are unchanged.

Of 3,326 existing tracked files, 3,325 are byte-identical. The only existing
file changed is `server/src/websitePriceExtraction.js`. All 392 existing test
files and 2,224 historical evidence files remain identical. Workflows,
dependencies, specifications, runtime, pricing arithmetic and engine versions
are unchanged. The original merge's two ordered parents and all pinned recovery
ancestors are retained; see `preservation.json`.

H1 partial-import policy and H2 connected-provider refresh remain separate
handoffs. No additional policy, runtime or deployment behavior is claimed here.
