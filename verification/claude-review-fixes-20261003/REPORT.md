# Review follow-up fixes (October 3)

Branch `claude/quote-review-fixes-20261003`, based on Codex's `88e5040` (`codex/quote-trade-decisions-20261003`). Scope: the three minor findings and the approval-version note from Claude's re-verification of `88e5040`. Not merged or deployed. No prices or formulas change.

## Changes

| Finding at `88e5040` | Change |
|---|---|
| Product names converted differently: price tables refused names with an apostrophe or brackets that Registered products accepted ("O'Brien cedar", "Vinyl (D4)"); the AI interview tables accepted only names already typed as `lowercase_words`; every refusal was silent. | One shared conversion (`productKeyFromName`, `client/src/pricebookFormatting.js`) used by all five owner name-entry controls: main price tables, scope price tables, Registered products, gate offerings and the AI interview tables. Accents fold, punctuation becomes a word break, stored names start with a letter (the engine's canonical rule). Refusals show a reason ("Start the name with a letter…", "That name is already listed."). |
| Missing fence length and slab thickness got the general "a few details" review message. | The customer review message is chosen from the engine's own customer-field metadata (base contracts, configured offerings, owner-defined scopes): physical sizes, measured outlines and measuring methods are measurements; counts and choices are job details. Scope sizes (for example demolition thickness) are now recognised too. Malformed results still get the generic message; accessors are not invoked. |
| The approval table listed a retired price among active prices ("Per step price $40"); the retained list showed it as "40". | Retained values appear only under retained settings, formatted with the same rules as active prices ("$40"), one row per saved value. |
| Engine version unchanged although Codex's repairs changed arithmetic. | `ENGINE_VERSION` → `quote-engine-vnext-trade-decisions-20261003-v2`, per this branch's own rule that changed arithmetic needs fresh owner approval. The spec sentence saying the version was retained is amended. |

Correction to Claude's earlier report: "3-tab shingle" was refused silently by both controls (not accepted by Registered products). The mismatch was real for punctuation and brackets, and the AI interview tables refused any unconverted name.

A regression found during browser verification and fixed before commit: marking a refused name input `aria-invalid` blocked Save, because the editor's Save treats any invalid-marked input as a bad number. Name refusals now use alert text only; a test guards this.

## Verification

- New `test/quoteReviewFixes.spec.mjs`: 8 tests. On unchanged `88e5040`: 1 pass, 7 fail. After: 8 pass.
- Full suite including browser specs (`node --test test/*.spec.js test/*.spec.mjs`, Node 22): 1,353 tests, 1,342 pass, the nine known voice failures, two existing skips. `node .github/scripts/check-test-results.mjs` passes (known failures 9/9).
- Client build (owner and widget) passes.
- Real browser against the real API server (`run-local.sh` + `browser-check.mjs`, output in `browser-output.txt`, screenshots `mulch-names.png`, `flooring-approval.png`):
  - Price table: "O'Brien cedar" added; "3-tab mix" refused with a reason; repeat refused as already listed.
  - Registered products: the same name registered; repeat and "3-tab mix" refused with reasons.
  - Save after refusals: 200. Stored keys are identical in both places: price table `["brown","o_brien_cedar"]`, Registered products `["brown","o_brien_cedar"]`.
  - Approval table has no per-step row; retained settings shows "Per step price: $40". No page errors.
- Independent price check (Claude's 22 hand-calculated jobs across all 20 services): unchanged from `88e5040`.

## Limits

- Stored names are canonical keys, so display drops punctuation ("O'Brien cedar" shows as "O brien cedar"). Names must start with a letter (engine rule).
- The AI interview control is verified by source tests, the client build and the existing interview browser spec; the browser run above did not exercise the interview.
- Review message texts are unchanged; only which message is chosen changed.

## Fence height (owner ruling, October 3)

Before: a fence quoted only at the exact height its prices were entered for; any other height (2 ft, 9 ft, 13 ft) went to the owner as a lead, and the base fence contract still listed fixed 4/6/8 ft heights.

After: any positive height quotes. Prices are entered for one height ("Height these prices are for"); other heights scale every height-dependent price by requested height / priced height (fence labor and material per foot, posts, footings, installed fence per foot, gates). Old-fence removal is not scaled. Terrain, waste and installed labor shares apply on top. The quote states it was scaled from the priced height. The fence type must still match.

Exactness defect found and fixed while verifying: when a later step (waste, terrain, installed labor share) re-priced a line, it reused the rounded binary value of an earlier factor. Existing factors were all terminating decimals, so nothing changed before; with a 1/3 height factor a half-cent line rounded down ($977.07 instead of $977.08 at 2 ft). The re-pricing step now reuses the exact factor.

Verification:
- `test/fenceAnyHeight.spec.mjs` (3 tests): 2 ft, 5 ft 3.65 in, 6, 9 and 13 ft against 6 ft itemized prices, line by line in exact fractions; 2, 4 and 13 ft against 4 ft installed prices with unscaled removal; 9 in fence; wrong fence type still reviews; no fixed height list in metadata.
- Three older tests that asserted the superseded rule were updated: `opusQuoteRepairs` now checks every line at four other heights equals the priced-height line × requested/priced exactly; `configuredOfferings` uses a mismatched fence type for its no-quote case; `componentPricingRepairs` expects the 6 ft request to quote with the scaling statement.
- Real HTTP preview against the real server, 6 ft itemized wood fence (187 ft, moderate ground, walk gate): 2 ft $2,428.60; 6 ft $7,285.81; 9 ft $10,928.70; 13 ft $15,785.91. Each equals an independent exact-fraction calculation. The editor shows the new height wording (`fence-editor.png`); no page errors.
- Full suite: 1,356 tests, 1,345 pass, the nine known voice failures, two skips; checker passes. Client build passes. Claude's other price suites (22 jobs, 11 charge/tax cases, options, boundaries, all add-on scopes) are unchanged.
