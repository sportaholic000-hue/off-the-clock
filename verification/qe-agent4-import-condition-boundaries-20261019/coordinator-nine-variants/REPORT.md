# Nine coordinator variants — repair checkpoint

The thirteen exact coordinator runs are repaired locally. Exact-final hosted qualification remains pending at this commit checkpoint; a separate final attestation will bind the completed hosted results to the published commit without changing its head. **H1 partial-import policy and H2 provider-session refresh remain unresolved separate handoffs.**

Base: `d71f8e506293714e2630ceb07ae4f947c1e1bb97`. Branch: `codex/qe-agent4-import-condition-boundaries-20261019`. Work performed personally. All website products, notes, tenants, signatures and providers are synthetic, not Off the Clock business policies. No subagents, live provider calls, deployment, tag, integration/main or other-agent branch writes.

## Exact baseline

`EXPECTED.md` and the new regression source were written before production edits. `baseline-command.json` binds the unchanged base and source/test hashes to the run. All thirteen exact default-limit runs fetched both pages and reproduced `limited:false`, `conditionsUnverified:false`, and `calculated` / `30.00` through both the direct parser and real dispatcher. Actual owner draft/save and delivered provider facts were exercised too. See `baseline-exact-thirteen.json` and the complete raw `baseline-new.tap`.

The five separate R1 landing notes were:

- `Site-wide: customers must prepay before delivery`
- `Site-wide: customers must prepay in full`
- `Site-wide: weather permitting for every job`
- `Site-wide: online orders must be prepaid`
- `Site-wide: payment must be made in advance`

Landing markup and its **Prices** link were exact. Each lost its note and imported only `Widget $10 each`.

The four R2 listings were tested in both HTML and text/plain:

- `Widget $10 each: Available to members`
- `Widget $10 each, Available to members`
- `Widget $10 each (Available to members)`
- `Widget $10 each — Only available to members`

The landing markup retained the exact **Next** link. Each imported the bare paragraph, two newlines, and its qualified copy. Selecting the bare saved paragraph calculated `30.00` with quantity `"3"`, confirmed `true`.

## Repair

The scoped recognizer now accepts the reported complete prepayment/payment/weather clause forms and their supported modifiers, with punctuation separating the same clause words. Visible text is copied unchanged. The existing cross-page association and output-budget machinery retains the full condition or omits the affected paragraph. Recognition is deliberately bounded; this does not claim unrestricted natural-language understanding.

Duplicate identity now recognizes colon, comma and terminal parenthesis boundaries after a literal price, and the `Only available` relation. A parenthesized clause must close and occupy the trailing suffix. A subsequent product description stays in identity. Product-name punctuation before the price and commas inside literal amounts cannot turn one product into another. Only the comparison key changes; saved wording is never rewritten, eligibility is never inferred and price arithmetic is untouched. The existing importer guard then withholds the conflicting bare copy before output limits.

One new unrelated-description control also reproduced a pre-existing false positive: `Site-wide: payment in advance is discussed in our guide` was treated as a restriction at the base. The first repair passed 104/105, leaving this case failing; both that attempt and the original baseline remain. A bounded, whole-sentence documentation relation now avoids labeling that description as an applicable payment condition. Other independent condition signals remain active. No assertion was weakened or changed.

The initial evidence postprocessor needed to undo Node TAP's doubled diagnostic backslashes before parsing JSON. This was a diagnostic-decoding issue, not a test/application failure; the original TAP is unchanged, and the corrected exact-case extraction verifies both fetches, literal output, flags and both calculation surfaces for all thirteen runs.

## Actual local results

| Run | Result |
| --- | --- |
| Unchanged-base new suite | 21 pass / 84 fail / 105 |
| First repair | 104 pass / 1 fail / 105 |
| Final new regressions | 105/105 pass |
| Retained selection | 1,030/1,030 pass |
| Combined selection | 1,135/1,135 pass |
| Build | Pass |
| Existing H1/H2 probes | 0 pass / 5 fail, unchanged unresolved outcomes |

Counts overlap. The 84 baseline failures are assertion-level outcomes, not 84 distinct monetary bypasses. All successful TAP runs have zero failures/cancellations/skips/TODOs. The five known handoff probes remain outside ordinary selectors and are not counted as passing coverage. Exact commands, source hashes, summaries and raw logs are retained. `after-exact-thirteen.json` records all thirteen final route/provider/dispatcher results.

The 105 new checks include every exact default case; HTML/plain extraction; late note discovery; reverse duplicate discovery; entry and text caps; exact-fit qualified text; punctuation; hidden/instruction filtering; unrelated descriptions; Board-on-board, Nail-in and Plug-in identities; product descriptions after a parenthesized clause; and literal decimal/currency/thousands spelling. Reverse plain discovery uses an HTML index, separately from the thirteen exact two-page fixtures. Actual routes preserve draft read-only behavior, saved text, provider facts, no call-time browsing and tenant isolation. Existing 1,030 cases continue to cover original parser regressions, import visibility/section/ambiguity behavior, arithmetic, tax/contact, saved identity, runtime and privacy boundaries.

## Preservation

Only `server/src/websitePriceExtraction.js` differs among 3,304 base files. All 3,303 others are byte-identical, including `websitePriceImport.js`, the entire workflow (approved 45-minute budget retained), 391 existing test/fixture files and 2,203 historical evidence files. Build-generated `client/dist/index.html` was restored to base bytes. The new test is byte-identical to its failing-baseline snapshot. No specifications, dependencies, selectors, engine versions, arithmetic, runtime-owned files or A2 work changed.

Both original histories remain ancestral through merge `c58ca997e9cf63739d399939bcdade83e97874d2`, ordered parents `235eb5c978f847c2d47379ae3cf03b52c1f9104c` and `4f6152413a650085a7fe6002dfd077a542f9c0c2`. Parser recovery `9af52ddc13c78beec84e7f090506da8c9b5fd691`, punctuation repair `4a90f73695611bb42bb9fb50d40a16f9e01c3740` and immediate base `d71f8e506293714e2630ceb07ae4f947c1e1bb97` are preserved.

H1 still requires a policy decision for conditions on unread pages under partial import. H2 still requires runtime-owned refresh of already-delivered provider facts after owner save; existing calculation rejects stale text. Neither handoff is changed or declared fixed here.

## Required hosted completion

Publish only this branch with a normal fast-forward push, verify remote SHA/tree/parent/ancestry, and complete exact-head cold install/build/browser/strict/full/checker/audit/Docker. Expected totals: strict 5,006, full 6,854 and browser 12; complete actual summaries are authoritative. Match every original 305, retained 1,030, new 105 and combined 1,135 name in passing full-suite output, and verify the new voice file remains outside strict selection. Keep final attestation external so evidence recording does not invalidate the tested head.
