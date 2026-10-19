# F8 punctuation expectations — recorded before execution or production edits

Base: `9af52ddc13c78beec84e7f090506da8c9b5fd691`.
Branch: `codex/qe-agent4-import-punctuation-20261019`.
Production ownership: `server/src/websitePriceExtraction.js` only.

For each exact note below, test both `NOTE\n\nWidget $10 each` with `plain:true` and `<html><body><p>NOTE</p><div><p>Widget $10 each</p></div></body></html>`:

1. `Available (exclusively) to members`
2. `Available: to account holders`
3. `Payment (by cash)`
4. `Payment: by cash`
5. `Eligible (customers): account holders`

Each established association must preserve the note verbatim, yielding one `Widget $10 each` entry with amounts `['$10']`, conditions `[NOTE]`, and `conditionsUnverified:false`. With quantity `"3"` and `customerConfirmed:true`, the fully saved listing must return the exact existing `needs_review` fallback without `extendedAmount` or `voiceSummary`, through both `calculateSavedListedPrice` and the real voice dispatcher after actual import draft and owner-save routes. Drafting must not replace existing saved prices. Owner save must preserve exact imported spelling. Stripping the condition must fail saved identity. Dispatch must not mutate saved data or disclose private sentinel values.

The coordinator-reported baseline is an unqualified entry with `conditionsUnverified:false`, followed by `calculated` and `30.00`. Record actual extraction, direct calculation, route draft/save and dispatcher results before asserting repaired expectations. Run all new regressions against the unedited production baseline first.

Controls: retain the four original F8 phrases and `Prices apply to cash payments`; preserve unconditional prices, intervening-word descriptions, section/heading boundaries, multiple cards, and visibility/instruction exclusions. Ambiguous selected-item or detached association must withhold affected entries and set `conditionsUnverified:true`, retaining unaffected sections. Detection may treat punctuation as separators only between the bounded existing phrase words; it must not erase intervening words or modify saved text.

Hand-calculated unconditional route controls: `Widget $10 each` × 3 = `30.00`; `Widget $0.10 each` × 3 = `0.30`; `Widget CAD 0.335 each` × 3 = `1.01` (1.005 rounded to nearest cent); `Board-on-board $10 each` × 3 = `30.00`; `Nail-in $10 each` × 3 = `30.00`; `Plug-in $10 each` × 3 = `30.00`.

All existing 758 assertions and historical evidence must remain unchanged. The new voice-prefixed file must be selected once by the existing full-suite convention and excluded from strict quote without changing selectors. Run retained 758 plus the new file, build, and exact-final hosted CI; targeted passes alone are incomplete. Preserve both original merge histories. No downstream arithmetic, specification, workflow, dependency, main/integration, tag or deployment changes.
