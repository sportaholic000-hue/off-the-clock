Work only on the price-book editor/interview in:
https://github.com/sportaholic000-hue/off-the-clock

Start a separate branch from PR #15's exact commit:
`c2e9efcdcc4aaca4a7b8f610e4cdf792cb135010`
Branch: `codex/agreed-quote-followup-20261002`

Preserve PR #12, #14 and #15. Read AGENTS.md, specs/BUILD_STATUS.md and the relevant quote-engine specification before editing. Do not use subagents. Do not merge or deploy.

The other assistant owns server/engine findings F01, F02, F03, F14 and F27. Your assignment is ONLY these six editor/interview findings:

**F04 — Changing a fee rule leaves a hidden stale owner choice.**
Reproduction: set travel to owner_selected, choose Yes/No, then change travel to not_applicable. ownerFeeSelections.travel remains although its control disappears, and quotes fail validation. Fix the editor's fee-mode transitions and provide a correction path for an existing stale draft. Preserve explicit false selections. Do not silently change rates or decide whether a fee applies.

**F05 — Owner preview cannot answer customer-selected fee questions.**
The preview API already accepts customerFeeSelections, but the editor does not offer or send them. Add appropriate preview-only Yes/No controls for fees whose rule is customer_selected. Send the selections to preview, distinguish unanswered from false, and clear incompatible selections when the service/rule changes. Do not save preview answers as owner pricing decisions.

**F07 — Approving one saved service discards unsaved editor work.**
Reproduction A: edit service A without saving, then approve unchanged service B; A's draft is replaced with its saved version. Reproduction B: open A's saved approval review, edit A while it is open, then confirm; those edits disappear. Preserve all unsaved work. Approval must still apply only to the exact saved configuration being reviewed. Do not approve unsaved prices or present edited values as approved. Handle revision changes and stale previews honestly.

**F08 — Interview/suggestion drafts can cross owner accounts.**
otc_pricebook_draft and otc_pricebook_suggestions are global sessionStorage keys. A draft from account A can be consumed by account B in the same tab. Bind new drafts to the authenticated tenant owner and validate that binding before importing. Unbound legacy drafts must not be silently assigned to whoever logs in next. Clear relevant state on logout/account changes. Test both safe same-owner recovery and cross-owner rejection. Keep changes limited to price-book draft lifecycle.

**F11 — Interview controls cannot represent current price-map shapes.**
The interview relies on legacy shapedKeys and handles only numeric flat/two-level maps. Current contracts include three-level repair maps and enum/boolean leaves. Use current metadata to render the required depth and leaf types, preserving false, zero and exact offering keys. Reuse suitable existing price-book controls where practical. Do not invent product keys or required prices. The other assistant owns the server validator fix (F14); do not edit server/src/priceBookAI.js to duplicate it. Report the integration dependency explicitly.

**F13 — Interview controls convert decimal text before exact validation.**
Number(raw) can silently turn 1.0000000000000001 into 1 before validation. Use the existing exact numeric-input behavior for scalar and map leaves. Retain rejected text with useful feedback. Preserve legitimate fractional-cent unit rates; do not impose a global two-decimal limit or round owner input.

Expected files are client/src/pricebook.jsx, client/src/onboarding.jsx and their existing control/draft-lifecycle helpers. Do not edit the engine, server/src/quoteDoneBridge.js, server/src/priceBookAI.js, tax resolution or tax routes. If you need a backend change, document the specific dependency instead of duplicating the other assistant's work.

Verify each defect before and after with focused regression tests and actual browser interactions. Use synthetic owners and prices. Test service switching, tier/nested values where relevant, false/zero/blank distinctions and retention of unsaved work. Run the affected existing editor/interview suites and owner/widget builds. Do not hide failures or alter unrelated tests.

Write a scoped report at verification/pricebook-editor-repairs/REPORT.md covering the six IDs, exact source commit, changes, tests and any remaining dependency. Do not count voice, booking, CRM, general website, CI or deployment findings as price-book defects. Keep the authoritative specs unchanged unless a task-specific conflict is identified; do not announce a whole-phase gate.

Save and verify your branch on GitHub and open a draft PR against codex/agreed-quote-followup-20261002. Return the PR, commit and evidence. Do not claim complete engine accuracy from these six fixes.

Integration note: the other assistant's server branch also starts at c2e9efc. Its application-file ownership is server/quote-engine-vnext/scopePricing.js, server/quote-engine-vnext/priceBook.js, server/src/quoteDoneBridge.js, server/src/priceBookAI.js and server/taxJurisdiction.js, with one matching Alaska clarification in specs/quote_engine_v2.md. Integrate both branches and check the real interview-to-save/preview flow before claiming all eleven findings are closed. Neither branch should overwrite the other.
