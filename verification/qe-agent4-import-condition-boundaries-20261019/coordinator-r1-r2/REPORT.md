# Coordinator R1/R2 follow-up

The two reproduced gaps are repaired locally. Complete exact-final hosted verification remains pending at this commit checkpoint. An external attestation will bind the actual hosted results to the published SHA without changing the tested head. H1 partial-import policy and H2 provider-session refresh remain unresolved separate handoffs.

Branch: `codex/qe-agent4-import-condition-boundaries-20261019`.
Exact base: `620431bbf3036ed8141665e26ab68c684415f2e1`.
Work performed personally, with synthetic loopback websites and actual owner draft/save handlers, production voice HTTP/WebSocket admission, a synthetic provider, and the real dispatcher. No live provider, deployment or integration/main write.

## Reproductions and repairs

All three exact landing notes reproduced the coordinator's result at default limits, with both pages fetched:

- `Site-wide: customers must prepay`
- `Site-wide: weather permitting`
- `Site-wide: online orders`

The linked page contains `Widget $10 each`. Before repair the draft and provider-visible saved facts contain only that bare paragraph; `limited:false`, `conditionsUnverified:false`, and quantity `"3"`, confirmed `true`, calculates `30.00` through both parser and real dispatcher.

The extractor now recognizes these complete, explicitly scoped clause forms, including punctuation between their words. It copies the visible note unchanged into the existing cross-page association path. Each repaired example retains `Widget $10 each\nNOTE` through actual draft/save/provider facts and returns `needs_review` with no extended amount. Late discovery, entry caps and text caps are covered; a complete qualified paragraph must fit or be omitted. Unrelated descriptions, hidden content and instructions remain excluded. This is bounded clause recognition, not unrestricted language understanding or an arbitrary keyword blacklist.

The exact inline duplicate also reproduced for HTML and text/plain: a bare `Widget $10 each` and `Widget $10 each — Available to members` both survived, and selecting the bare paragraph calculated `30.00`. Duplicate identity previously recognized separate condition lines only. It now recognizes an eligibility/payment suffix after a literal price and an explicit separator. The clause must begin at that suffix boundary; intervening product descriptions stay in the comparison key. This comparison never rewrites saved wording or infers eligibility. The importer withholds the conflicting bare copy before output limits, retaining the exact qualified paragraph, or safely emits no paragraph if it cannot fit.

Tests cover both price discovery orders, HTML/plain qualified pages, default limits, entry cap 1, text budgets exactly fitting the qualified paragraph and fitting only the bare paragraph, five separators, existing punctuation clauses, distinct products, genuine product-name hyphens and intervening descriptions. Reverse plain discovery uses an HTML index linking first to the qualified plain page; plain pages do not expose HTML links.

The global-note exception to bare-duplicate comparison was removed too. The additional scoped-HST combination retained a copy missing membership wording at the base, but already returned review: it is not claimed as a demonstrated monetary bypass. Both scoped tax wording and membership wording now remain with the retained qualified copy. No arithmetic or tax policy was changed.

## Actual local results

| Run | Result |
| --- | --- |
| Official unchanged-base new-test baseline | 16 pass / 66 fail / 82 |
| Repaired new regressions | 82/82 pass |
| Unchanged retained selection | 948/948 pass |
| Combined selection | 1,030/1,030 pass |
| Build | Pass |
| Existing H1/H2 probes | 0 pass / 5 fail, same unresolved outcomes |

Counts overlap. Passing TAP suites have zero failures/cancellations/skips/TODOs. The five known handoff probes remain outside ordinary selectors and are never counted as passing coverage. The final new regression file is byte-identical to the official baseline source snapshot. The first launch encountered a missing temporary directory before test execution; its exact evidence is preserved and distinguished in `SETUP.md`.

`EXPECTED.md` was written before execution. `baseline-new.tap` and `baseline-examples.json` record failures and actual unsafe calculations. `after-new.tap`, `after-examples.json`, `retained-948.tap`, `expanded-1030.tap`, `handoffs.tap`, `build.log` and command/hash metadata record the repair. The original 305 parser cases are retained within the 948 selection. Unconditional arithmetic, exact decimals, tax/contact handling, private-data protection, tenant isolation and saved-listing identity remain covered by unchanged assertions.

## Ownership and preservation

Only `server/src/websitePriceExtraction.js`, `server/src/websitePriceImport.js` and the expressly approved `jobs.test.timeout-minutes: 30` to `45` differ among the 3,280 base files. Every other workflow byte is unchanged. All 3,277 other base files are byte-identical, including 390 prior test/fixture files and 2,180 historical evidence files. New regression: `test/voiceAgent4ImportConditionR1R2Followup20261019.spec.mjs`. No selectors, specifications, dependencies, engine versions, arithmetic or runtime-owned files changed. Build-generated tracked output was restored to base bytes.

Both original histories remain ancestral through merge `c58ca997e9cf63739d399939bcdade83e97874d2`, with ordered parents `235eb5c978f847c2d47379ae3cf03b52c1f9104c` and `4f6152413a650085a7fe6002dfd077a542f9c0c2`. The parser recovery commit `9af52ddc13c78beec84e7f090506da8c9b5fd691` and punctuation commit `4a90f73695611bb42bb9fb50d40a16f9e01c3740` remain ancestors. Other branches are not modified.

H1 still permits a bare saved price when the only condition is on an unread page; changing the explicitly partial-import contract requires a policy ruling. H2 still delivers an old snapshot to an already-connected provider after owner save; current calculation rejects stale text, but provider refresh belongs to the runtime owner. No policy is silently changed here.

## Hosted completion requirement

Publish only this branch, preserving the exact base and both histories. Verify remote SHA/tree/parent. Require complete cold install, build, browser, strict quote, full suite, checker, production audit and synthetic Docker success at the exact final head with the approved 45-minute test-job budget. Expected totals: 5,006 strict, 6,749 full and 12 browser; actual complete summaries are authoritative. Match every original 305, retained 948, new 82 and combined 1,030 assertion name in passing full-suite output. Preserve every hosted attempt and any mismatch; targeted tests or an incomplete log are insufficient.
