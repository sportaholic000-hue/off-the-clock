# New-issues audit of v53 (a7d138f9) — verdicts

Claude, November 25, 2026. Repaired version `quote-engine-vnext-accuracy-20261125-v54`.

| # | Finding | Verdict | Commit |
|---|---|---|---|
| 1 | Flat per-visit mowing: one price for every lot size and condition | Real (reproduced: $50 for 10,000,000 sq ft, one-time, severe). Introduced by my v53 change. Fixed as proposed | f4c0301c |
| 2 | Every engine version change pauses every approved service | Real. Fixed with a per-service-type approval version and a gate | 36f0e0f4 |
| 3 | Control-joint sentence only when the setting is blank | Real. Fixed as proposed | 965d1fa3 |
| 4 | Fence post spacing: 0.1 ft accepted, chain link to 12 ft, limit not stated | Real (reproduced: 0.1 ft quoted $33,850). Fixed, with one deviation (below) | 0f0888c4 |
| 5 | Over-12/12 owner row overstates which roofs go to review | Real (reproduced: $9,700 with no old layers). Fixed as proposed | c31854ab |
| 6 | Raw decimals in customer measurement text | Real. Fixed as proposed | 2aaefabb |
| 7 | "coat(s)" and unpunctuated owner text | Real. Fixed as proposed | b1ca4351 |
| 8 | Spec bagging formula (specs/quote_engine_v2.md lines 1184–1185) | Real code/spec wording gap. Not changed: specs are edited only by the owner | — |

## Deviation from the proposed fix (finding 4)

The auditor proposed 8 ft for every fence type other than chain link and marked it as an unsourced decision. Split-rail installation instructions set posts about 10 ft 3 in to 10 ft 4 in apart for 10.5 ft rails, so 8 ft would refuse ordinary split-rail jobs. Decision (industry practice, quote as many jobs as possible):

- every type: at least 3 ft;
- chain link: at most 10 ft (ASTM F567, F1043);
- other types: at most 12 ft.

Chain link is recognized by the owner's fence-type name containing "chain".

## Owner items

- **New field label, not in a spec:** "Largest lawn this flat price covers (square feet)" (the auditor's wording). It is shipped and needs owner approval (AGENTS.md: UI labels).
- **Spec sentence:** the bagging formula in specs/quote_engine_v2.md lines 1184–1185 should base bagging on the area labor plus the per-visit charge, as the code does under the November 26 ruling.
- **One-time pause:** approvals saved before this version carry no approval version. They pause once, at v54, and then follow the new rule.

## Tests changed on purpose

- test/owner-ruling-20261126/mowingBaggingWholeVisit.spec.mjs: flat mode sets the new size limit.
- test/audit-third-v51/controlJointsBlank.spec.mjs and the October 17 baseline helper: "included" also carries the sentence.
- test/qeLaunchE_20261119.spec.mjs and test/audit-f1501ff/item08InstalledPaintingCoats.spec.mjs: "coat"/"coats" wording.
- October 17 baseline helper: a wording-only step adds the coat nouns and the periods. Prices match exactly.
- test/releaseQuoteGuards.spec.mjs, test/quoteAudit20261005.spec.mjs, test/engineLaunchFixes20261005.spec.mjs, test/quoteReviewFixes.spec.mjs and server/quote-engine-vnext/tests/dateContext.spec.mjs: stale approvals are modelled as receipts from before approval versions. The last two were found by the full suite, not by my search. test/approvalDiagnosticsLaneB20261016.spec.mjs: the receipt check is named approvalVersion.
