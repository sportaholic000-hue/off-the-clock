# Quote presentation fixes — October 8, 2026

**Implemented locally; push blocked. The required npm gates are not green in this environment.** This is a change verification report, not a clean audit or a deployment approval.

Branch: `fix/quote-presentation-20261008`.
Verified base: `claude/pricebook-conflict-recovery-20261008`, exact commit `c68b9bc754e8d95cc3aab8c26f286d4a94f57204`, whose parent is `a8f4dcd2771c3fa973f8cac62aa3f7b78bf5d9ab`.

## Changes

1. Scope confirmations use short labels; the complete selected descriptions are separate details in the question contract, intake summary, stored scope, website result, phone narration and history. Requested email and public quote copies retain the frozen narration. Presentation validation runs at save and approval, and affects readiness for existing oversized configurations. It checks names, detail counts, text and UTF-8 transport budgets with a conservative reserve for measurements and engine disclosures. No descriptions are truncated. The former unused, truncating phone scope helper was removed.
2. Withheld price options appear in the owner service card with their names, shared editor field labels and a plain explanation. The live chip includes the number withheld and wraps in the sidebar. The customer availability notice survives projection, spoken narration, saved history, requested email/public copy and partial estimates, once per narration/copy. Amounts are unchanged.
3. Removing the last optional map entry emits omission. Recursive map controls propagate omission through newly empty ancestors; the editor deletes the field from both existing root/nested placements. Explicit empty maps remain invalid in the backend. No dummy prices are inserted.
4. Phone fee questions wait for the engine's actual request-specific fee validation. That validator already applies the template and selected scope's replaced-fee result. Only applicable unanswered customer fees are requested, including an otherwise priced request with a fee-blocked option. Covered disposal does not require an answer; an omitted answer is never synthesized as No. No fee amounts, replacement tables or pricing calculations were added to voice code.

No files under `specs/` or `server/quote-engine-vnext/` were changed. No quote arithmetic was changed. All reproductions used marked synthetic data, disposable books/databases and synthetic email providers. No live data, messages, merges or deployments were performed.

## Regression names and counts

All **16 new tests pass**, with zero failures, skips, cancellations or TODOs. Expectations were handwritten in `EXPECTATIONS.md` before execution.

| Item | Exact test names in `test/quotePresentation20261008.spec.mjs` | Count |
| --- | --- | ---: |
| 1 | `presentation 1: 959-character scope saves, speaks, replays and emails complete $450 quote`; the corresponding `960-character` and `2000-character` tests; `presentation 1: save and approval reject oversized full presentation before writing` | 4 |
| 2 | `presentation 2a: owner sees named withheld option, owner labels and 1-of-3 live chip`; `presentation 2b: withheld notice survives phone/history/requested copy once (complete)`; corresponding `(partial)` test | 3 |
| 3 | `presentation 3: actual Remove button prunes an optional map at depth 1`; corresponding depth `2` and `3` tests; `presentation 3: omitted obsolete roof map quotes $1020; explicit empty map stays invalid` | 4 |
| 4 | `presentation 4: engine-covered disposal is never asked or defaulted; cleanup phone quote is $120`; `presentation 4: applicable travel waits for explicit Yes/No; disposal stays omitted`; `presentation 4: priced mowing clippings replace common disposal; phone quotes $110`; `presentation 4: sod preparation covers disposal; changing this request asks the now-applicable fee`; `presentation 4: measured roofing disposal replaces common fee without voice arithmetic` | 5 |

Existing scope assertions and browser locators were updated to inspect short labels and complete separate details. The signed production voice test now expects fee questions after engine evaluation, rather than before measurements are supplied. Existing assertions about dollar amounts, selected products and cleared confirmations remain.

## Required checks and environment failure

- Cold `npm ci --no-audit --no-fund`: passed using Node 22.23.3, with no lockfile edits.
- `npm run build`: passed for the owner app and widget. Tracked `client/dist` files restored before committing.
- `npm test`: invoked; browser failures occurred and the run stalled during worker shutdown. Not green.
- `npm run test:quote`: invoked; architecture checks passed, browser failures occurred and the run stalled during worker shutdown. Not green.

Chromium and Chromium Headless Shell were installed outside the repository. A separate minimal launch probe crashes with **SIGTRAP before opening any application page**. Every remaining browser failure in the completed isolated run contains that launch failure. No browser failure was converted to a skip or represented as passing UI coverage.

To finish checking files despite blocked multi-file worker shutdown, every selected test file was run independently through Node's native test harness with module mocks, disposable storage and `--test-force-exit`. This is supplemental evidence, not a replacement claim that the required npm gates passed.

| Final supplemental selection | Files reached | Tests | Passed | Failed | Skipped / cancelled / TODO |
| --- | ---: | ---: | ---: | ---: | ---: |
| All full-suite files | 201 / 201 | 3,910 | 3,853 | 57 | 0 / 0 / 0 |
| Quote/price-book selection (overlaps full suite) | 142 / 142 | 2,791 | 2,734 | 57 | 0 / 0 / 0 |

Two initial failures were obsolete `Confirmed hardwood` lookups. After updating them to assert the short label and complete selected description, their entire 35-test acceptance file passed **35/35**. The table uses that final result. All other remaining failures are the 57 native browser launch failures across 19 files.

Additional focused checks passed **66/66**, **56/56** (saved scope/history/listed-price regressions), and **35/35** (acceptance). These counts overlap the full suite and must not be added to it.

The requested push requires all four checks to be green with zero failures. That condition is not met, so no remote branch or commit was uploaded. Run the unchanged required gates in an environment where Chromium launches before pushing this local commit.
