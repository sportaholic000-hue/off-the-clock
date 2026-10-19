# Agent 4 — imported-price condition boundaries

Two owned importer defects are repaired locally. Two separate safety limitations remain for policy/runtime handoff, detailed below. Publication and exact-final hosted gates are pending at this checkpoint; a final external attestation will bind their actual results to the published commit without changing the tested head.

Branch: `codex/qe-agent4-import-condition-boundaries-20261019`.
Exact base: `4a90f73695611bb42bb9fb50d40a16f9e01c3740`.
Work performed personally, without subagents, using synthetic local websites, disposable SQLite, signed local HTTP/WebSocket calls and a synthetic voice provider. No live provider network, main/integration write, deployment or tag.

## R1 — observed website-wide conditions disappeared across pages

Exact reproduction: the landing document contains `<p>Site-wide: all prices require membership</p><a href="/prices">Next</a>`; `/prices` contains `<p>Widget $10 each</p>`. At the base the draft, saved knowledge and provider-visible facts contain only `Widget $10 each`; the real dispatcher calculates `30.00` for quantity `"3"`, confirmed `true`. A condition found on a later fetched page also fails to protect earlier prices. Entry and character budgets can retain those bare paragraphs.

Repair: the extractor exposes visible, explicitly labelled website-wide notes even on pages with no price entries. The importer collects all fetched-page candidates and notes before deduplication and output budgeting. Applicable notes are appended verbatim to each retained listing; late notes also protect earlier prices. Unsupported selected-item references and oversized global notes withhold affected prices and flag manual review. The reported `require membership` predicate is recognized under an explicit website-scope label even without another pricing keyword.

The repaired example saves `Widget $10 each\nSite-wide: all prices require membership`. Provider facts retain the entire paragraph; the dispatcher returns `needs_review` without an extended amount. Known notes survive page/request/link limits, redirects, a total-byte stop on a later page, the default 100-entry cap and default 20,000-character cap. Whole qualified paragraphs fit or are omitted; conditions are never truncated to fit.

Scope is deliberately bounded. An initial `Site-wide:` or `Website-wide:` label establishes cross-page scope for recognized visible qualifications. `All prices require membership`, `On this page, all prices require membership`, an unlabelled membership note and item/section conditions are not promoted to other pages. Hidden/instruction-like text is excluded. This does not claim general natural-language applicability detection.

## R2 — a bare duplicate bypassed a restricted version

Exact reproduction: one page has `Widget $10 each`, another has `Widget $10 each\nAvailable to members`. At the base, both distinct paragraphs survive; selecting the bare paragraph calculates `30.00`, including when an entry cap retains it before the restricted version is considered.

Repair: before output limits, compare literal item/amount text after recognizing existing standalone condition lines. Where a qualified version of the same exact text exists, withhold the bare duplicate and flag manual review. Do not copy a page-local condition to another page or decide which offer applies. Fully qualified variants remain verbatim and distinct; identical complete paragraphs deduplicate. Stripping the qualification does not match a saved paragraph. Genuinely different product names remain independent. This comparison does not perform semantic product matching or resolve which of two differently priced offers is current.

## H1 — unread conditions beyond crawl limits: policy handoff remains

Three actual draft → owner save → real dispatcher probes remain unsafe under the stronger condition-preservation expectation:

- Landing page: `<html><body><p>Widget $10 each</p><a href="/terms">Next</a></body></html>`.
- Linked `/terms`: `<html><body><p>Site-wide: all prices require membership</p></body></html>`.
- Limits: `pages:1`, `requests:1`, or a total-byte budget that admits the landing page but rejects the terms page.

In all three, the importer discloses `limited:true`, but returns `conditionsUnverified:false` and the bare price. After explicit owner save, provider facts contain the bare price and calculation returns `calculated / 30.00`. The condition was never read; no implementation can preserve its wording from that scan.

The existing import specification and retained tests expressly allow partial scans to return prices, with owner review and a partial-coverage warning. Automatically withholding every price after any incomplete crawl would change that contract and break existing assertions. Required coordinator/owner decision: whether incompletely scanned websites may produce saveable/calculable listings, or must fail closed until a different review/completeness mechanism establishes applicable terms. No arbitrary new policy, limit expansion or fabricated condition was introduced. Exact inputs, outputs and failing assertions remain in `handoff-probes.mjs`, `baseline-handoffs*` and `after-handoffs*`.

## H2 — running provider facts remain a snapshot: runtime handoff remains

Two signed production voice probes discover and calculate `Widget $10 each`, then use the actual owner-save route to replace it with either `Widget $12 each` or `Widget $10 each\nAvailable to members`.

The same real dispatcher, including reuse of the same tool-call ID, rereads current saved knowledge. The old paragraph returns `needs_review` with no amount. The new $12 paragraph calculates `36.00`; the new membership paragraph returns `needs_review`. Read-only calculation is not replayed from an old idempotency receipt. No stale multiplied amount was observed.

However, the synthetic provider records one connection whose delivered `OWNER_FACTS_JSON` still contains `Widget $10 each`; it receives no updated fact payload after save. Freshly compiled facts contain the new text. The already-running session can therefore retain an obsolete listed price or miss a newly added restriction. This is an observed stale provider-input boundary, not a claim that a real model spoke an obsolete amount.

Required runtime-owner handoff: `server/src/voice/productionVoiceRuntime.js` and the live-session/provider update contract need an explicit refresh/revision or safe session behavior after saved-knowledge changes. Those files are outside ownership. The importer cannot update an already-running provider session. Both failing refresh assertions and successful stale-calculation guards are preserved in the handoff probe.

## Actual local verification

| Run | Actual result |
| --- | --- |
| New regressions on exact unchanged base | 34 pass / 40 fail / 74 |
| New regressions after repair | 74/74 pass |
| Unchanged retained selection | 874/874 pass |
| Retained selection plus new file | 948/948 pass |
| Build owner app and widget | Pass |
| Separate H1/H2 handoff probes, base and repair | 0 pass / 5 fail, intentionally unresolved |

Passing TAP runs have zero failures, cancellations, skips and TODOs. Counts overlap. The five known failing handoff probes are outside the ordinary selectors and are not included in passing regression counts. The original 305 parser assertions remain within the retained selection. Node 22.23.1; dependencies installed from the unchanged lockfile; build-generated tracked output restored to base bytes.

Every route/control exercise uses actual draft/save handlers and current saved data. Five boundary cases and both update cases additionally pass through signed production HTTP/WebSocket setup and the synthetic provider's tool calls. Other cases use the real runtime/dispatcher and compiled provider facts. Drafting is read-only; synthetic foreign owner IDs in request bodies do not redirect writes. Foreign knowledge is unchanged and absent from facts/results. Unconditional $10 × 3 = $30.00, $0.10 × 3 = $0.30, CAD 0.335 × 3 = CAD 1.01, Board-on-board, Nail-in, Plug-in, tax wording and contact-only cleanup remain intact. No tax or extra charge is invented.

`EXPECTED.md` predates execution. `SETUP.md` distinguishes fixture mistakes from implementation failures, preserving original logs and source. The official baseline files are `baseline-new-command.json`, `baseline-new.spec.mjs.txt`, `baseline-new.tap` and `baseline-new-exit.json`. Final commands and hashes are in `final-local-commands.json` and `local-results.json`.

## Retention and hosted completion requirement

Only `server/src/websitePriceImport.js` and `server/src/websitePriceExtraction.js` differ among 3,234 base files. All other 3,232 files are byte-identical, including 389 existing test/fixture files and 2,135 existing verification files. New regression: `test/voiceAgent4ImportConditionBoundaries20261019.spec.mjs`; no selectors changed. No pricing arithmetic, engine versions, specifications, dependencies or workflows changed.

The punctuation branch remains at `4a90f73695611bb42bb9fb50d40a16f9e01c3740`; the parser branch remains at `9af52ddc13c78beec84e7f090506da8c9b5fd691`. Both histories remain ancestral through merge `c58ca997e9cf63739d399939bcdade83e97874d2`, whose ordered parents are `235eb5c978f847c2d47379ae3cf03b52c1f9104c` and `4f6152413a650085a7fe6002dfd077a542f9c0c2`. A2's integration and A1/A3 work are untouched.

Before delivery, publish only this unique branch; verify remote SHA/tree/parent/ancestry; require exact-head cold install, build, browser, strict quote, full-suite, result checker, audit and Docker success. Match all original 305, retained 874 and new 74 assertion names in hosted full-suite logs. Expected hosted counts are 5,006 strict and 6,667 full; actual summaries are authoritative. The final external attestation must identify H1/H2 as remaining limitations even if all in-scope CI gates pass.
