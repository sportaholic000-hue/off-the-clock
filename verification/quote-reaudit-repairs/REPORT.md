# Quote-engine and price-book re-audit repairs — October 2, 2026

All nine reproduced finding groups R01–R09 are repaired and verified on source commit **`33605e99c834f2fa7c189626d6d6cbfc8b1d5f61`**. This is the combined PR #16 server + PR #17 editor source, with the fixes below. No customer rounding, owner rates, pricing formulas, live data, voice implementation, merge into an existing branch, or deployment was changed. No subagents were used. This is a scoped repair checkpoint for the next independent Opus audit, not a claim that exhaustive software correctness has been proved.

## Exact source to audit

- Repository: `sportaholic000-hue/off-the-clock`.
- Branch: `codex/quote-reaudit-repairs-20261002`.
- Common PR #15 base: `c2e9efcdcc4aaca4a7b8f610e4cdf792cb135010`.
- PR #16 server source: `a7dd434fd148c86d093cb46222f539020fba974c`.
- PR #17 editor source: `4af1a2cd90fc1996a8be1ae96563a8d47ce0dc1a`.
- Exact audited combination, before these repairs: `e6f518ba4886f22515e7836b14258065a10fadf3`. This integration commit has the two existing repair commits as parents and applies the 14 PR #17 file changes to the PR #16 tree. All 300 materialized audit bindings matched that combined tree.
- Repair source: `33605e99c834f2fa7c189626d6d6cbfc8b1d5f61`; tree `1e8e38d896db50c1660973c3aadf1750cf3b1bd3`.
- Later report/evidence commits do not change application or test source. Audit the branch's full combined code; use the integration-to-repair comparison to isolate these nine fixes.
- Source upload verification: all 17 new/changed source, test, and verification-script blobs returned the expected Git object hash. Reading the resulting GitHub tree back verified every one of its 5,783 blob paths against the expected inherited tree plus these changes, with no differences.

## Finding-by-finding disposition

| Finding | Repair | Verified result |
| --- | --- | --- |
| **R01: removed AI fields / final tier retain stale approvals** | Explicit approval prunes receipts outside the current confirmable fields. The persistence bridge no longer merges obsolete current-field receipts back. Legitimate retained legacy metadata remains separate. Saving alone never reapproves. | Both AI_INTERVIEW and AI_SUGGESTED recover after deleting optional bagging or the last tier and explicitly approving. Wrong-owner and stale-revision approvals reject. Partial approval does not approve another changed value. Browser save/reapprove returns live and quotes the unchanged $300 wall fixture. |
| **R02: included-price declarations reject current offering paths or supported fractional scope rates** | Inclusion validation uses the active offering/scope rate definitions and each rate's actual money domain. Existing positive-covering, charged-line, category and price-basis checks remain in force. | Itemized fence: 392000 cents less 14 posts × 2000 included material cents = **364000 cents**. Itemized stairs with fractional underlayment: 178000 + 5×6000 + round(5×1000.5) + 5×2000 + 5×500 = **225503 cents**. HTTP persistence/approval/preview verifies both. Gate inclusion and fractional offering controls pass; unknown/inactive paths, zero covering prices and category mismatches remain blocked. |
| **R03: selecting TAX_NONE hides a positive tax percentage** | The editor updates tax mode and zero percentage together when the owner chooses no tax. Other mode changes do not invent a rate. | Save, approval and preview succeed; the wall fixture returns **$300**, and the mowing unit test returns **$100**. |
| **R04: fields accept fractional cents that their engine cannot quote** | Current whole-cent fields advertise that requirement to the controls and enforce it at conversion/save. Historical values remain readable for correction. Supported mowing, CUSTOM unit, offering, and scope unit rates retain fractional precision. | Unsupported $1.005 remains visible, invalid and editable after blur/service switches; save does not replace the prior book. Correcting wall labor to $1.01 saves and quotes **$302**. Fractional supported-rate save/reload remains exact. No rate is silently rounded. |
| **R05: current tree controls/AI ignore closed domains; planting still suggests mixed** | Current map metadata takes flooring, siding and planting domains from engine constants. Closed optional choices differ from required choices. UI, readback and server share tree validation. Starter prompts use current planting keys. | Flooring/siding allow an offered subset and reject `unobtainium`. Planting accepts small/medium/large and rejects `mixed`. Three-level repair maps retain open repair names and closed size leaves; siding's outer type is closed. |
| **R06: cleanup readback rejects valid zero disposal** | Cleanup uses typed two-level metadata: positive labor multipliers and non-negative fixed disposal amounts. Required debris rows remain explicit. | Zero disposal reads back and saves through the real interview route. Zero labor multiplier rejects. No missing price is filled in. |
| **R07: CUSTOM interview ignores its saved unit** | The current question resolves its money kind from that service's saved draft unit on render/resume. | A resumed per-square-foot interview accepts and persists **$0.005**. Flat and unresolved units reject fractional cents. The independent custom quote control prices 1000 sqft × 0.5 cents = **500 cents**. |
| **R08: interview server ignores whole-cent / mixed-leaf rules** | Server interview validation applies the same exact whole-cent and typed-leaf rules as the current metadata, including disposal's fixed-money type. AI extraction receives the current precision metadata. | Siding labor $1.005 and disposal $0.005 return HTTP 422 without modifying the saved draft. Valid fractional unit rates and valid zero fixed amounts remain accepted. |
| **R09: tier rename overwrites an occupied override; delete/add duplicates a name** | Occupied override choices are disabled and the mutation itself refuses collisions. New tiers select an unused Good/Better/Best name using the engine's case-insensitive comparison. | Browser collision attempt retains both prices and the **$550** quote. Removing Good then adding a tier produces Better/Best/Good, saves, and remains live. Lowercase-name controls also pass. |

These are the same nine groups from [the original audit](BEFORE-AUDIT.md), not nine additional issues. R02 and R09 each contain related variants, as they did in that audit.

## Verification

- **35/35 new regression tests** in `test/quoteReauditRepairs.spec.mjs`.
- **409/409 independent arithmetic and boundary checks**, covering all 20 service types and the existing measured-scope, fee, financial, range, privacy and fail-closed controls. The financial oracle uses independent integer-ratio arithmetic.
- **11/11 authenticated local application checks** in Chromium: all nine groups, with two inclusion paths and both tier variants. These use real HTTP, persistence and approvals with isolated synthetic owners; no production accounts or paid providers.
- **Complete final suite: 1,244 tests; 1,233 passed; nine failures exactly matching the repository's existing voice failure list; two skipped; zero unexpected failures.** These nine voice test failures are not nine outstanding quote-engine findings.
- **Owner and widget builds passed**. Vite's existing large-bundle advisory is retained in the logs; it is not a failed build.
- Original arithmetic/rounding implementations remain byte-identical to the combined baseline. The only engine-module edit is the approval/inclusion/metadata contract file. No customer display formatter or voice pricing presentation was changed.

Commands (Node 22.23.2; the installed Chromium path was provided through the existing browser environment variables):

```sh
node --test --experimental-test-isolation=none test/quoteReauditRepairs.spec.mjs
node verification/quote-reaudit-repairs/arithmetic.mjs
node --test --test-concurrency=1 test/*.spec.js test/*.spec.mjs
node .github/scripts/check-test-results.mjs verification/quote-reaudit-repairs/full-suite-serial.tap
npm --prefix client run build
node verification/quote-reaudit-repairs/browser.mjs /absolute/path/to/new-evidence-directory
```

For the local application harness, use the repository's documented Node runtime path and an empty evidence directory. The browser runner also needs `PRICEBOOK_BROWSER_MODULE` and `PRICEBOOK_BROWSER_EXECUTABLE` when those are not installed in their standard locations. `interviewControls.browser.spec.mjs` now honors the same existing executable variable as the other browser tests.

One existing F14 assertion accepted a partial cleanup map containing only `light`; its fixture now supplies all three engine-required debris rows, and the negative controls explicitly reject a partial map. That is an intentional R05/R06 validation alignment. The tests still require zero disposal to remain valid and reject malformed nesting. No voice test or known-failure entry was changed.

## Evidence and verification history

- [Machine-readable final results](RESULTS.json)
- [Tested source binding](SOURCE-BINDING.json)
- [Hand-calculated expected results](EXPECTED.md)
- [Original before-audit evidence ZIP](BEFORE-EVIDENCE.zip)
- [Final after-repair evidence ZIP](AFTER-EVIDENCE.zip)

The after archive includes complete TAP, build logs, independent arithmetic results, redacted browser/HTTP exchanges, saved synthetic books/interviews, DOM snapshots, screenshots and a SHA-256 manifest. Private application stores and authentication secrets are excluded. The original before archive is unchanged.

Failed development attempts are retained separately and are not counted as passes. They include initial test-harness result/envelope mistakes, a missing local browser executable setting, an obsolete partial-cleanup expectation, an incomplete parallel TAP run, and a browser assertion that read the previously selected input before React finished switching. The captured DOM from that attempt contains the retained `1.005` text; the corrected check waits for that exact input, then proves save rejection and correction. The final serial suite and final browser run have complete summaries bound to the source above.

## Opus handoff

Review the entire quote engine and price-book functionality at the repair source above, including the combined PR #16 and #17 work. Start with R01–R09 and the before/after reproductions; independently challenge the fixes, their failure paths, price domains, tiers, approval identity/revision binding and save/reload behavior. Keep any new findings confined to engine or price-book functionality and distinguish a new reproducible defect from a duplicate, an existing known limitation, or a policy question. Verify expected amounts independently. Do not change customer rounding or unrelated website/voice features. This checkpoint has not been deployed or merged into the existing branches.
