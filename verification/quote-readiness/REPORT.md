# QuoteDone B1–B2 / M1–M7 repair verification

Final tested source: `25fca4812bbc0eb905b1d91124c2aa53aced791a`.
Draft [PR #14](https://github.com/sportaholic000-hue/off-the-clock/pull/14) is based on draft [PR #12](https://github.com/sportaholic000-hue/off-the-clock/pull/12), preserving its AI repairs. Review/merge order is #12, then #14. Neither was merged or deployed by this task.

The original baseline is PR #12 head `1b70096e25a1310df556e2f8672f9741d025c04e`, not the older integration snapshot. Tests used isolated synthetic owners, staff, customer requests, SQLite databases and price books. No live customer data was changed.

## Findings and repairs

| Finding | Reproduction and final behavior |
|---|---|
| B1: roof minimum units | Confirmed through editor save, stored book, public submission, authenticated staff calculation and owner preview. A $2,500 entry previously stored 2,500 cents and returned $848–$1,038. It now stores 250,000 cents. With 15% whole-job tax, midpoint and lower bound are $2,875; the unchanged 10% range makes the upper bound $3,163. Root, nested and tier minima use the same exact-cent boundary. |
| B1: historical values | Old positive roof minima without the corrected money-version receipt require the owner to re-enter/check the intended amount and confirm the saved configuration. No historical amount is multiplied or inferred. Public/staff requests stay review-only until corrected. A further reproduced edge case—an old 2500.5-cent value causing the editor GET to fail—was repaired: the editor displays $25.005 exactly, rejects approval/save as a cent amount, and permits an explicit owner correction to $2,500.50. This stores 250050 cents and produces the independently calculated $2,875.58 taxed floor. |
| B2 and M1: readiness | Confirmed together. Public and staff customer calculations now enforce the same saved readiness decision as the service catalog. Base wall painting, concrete and clean-bed mulch remain quotable without unrequested ceilings, trim, stamping, reinforcement, base preparation or edging. The same reproduced activation defect was corrected for cleanup without haul-away, sod without preparation and planting without mulch/preparation. Selecting missing optional scope still gives review without a customer subtotal. Coverage messages tell the owner which requests will become leads. |
| M1: owner sidebar | Visual review of the otherwise passing 9f18866 run found a live service could simultaneously say “prices needed”: the sidebar fallback read top-level fields instead of nested pricing. The display now reads the current fields and follows the actual readiness status. Browser assertions cover the live base-service captions; final screenshots wait for validation to settle. Original misleading screenshots are retained. |
| M2: exterior/fence setup | Confirmed that old standard fields alone cannot define supported work. The editor now presents the existing installed-price or itemized offering setup and its inclusions, instead of asking for unused standard prices. Both modes quote in public/staff/preview controls. Fence and exterior installed offerings were also configured through the real editor. Prior standard values are retained; no inclusion, product, height or price is invented. Internal setup wording was replaced with owner-facing wording. |
| M3: AI starter fields | Partly already corrected in PR #12: measured wall-area painting and typed material/condition maps are accepted, obsolete floor-area fields/scalars rejected. This repair additionally removes unused exterior/fence standard fields from the offered AI schema. Those services can receive a draft minimum; their detailed offerings still require the owner’s manual setup. Real Gemini starters covered all 20 service types and remained inactive/unconfirmed after saving. |
| M4: interview fields | The PR #12 current-field validator already accepted measured wall labor, the roof minimum and material-keyed roof labor. The initial interview cursor still came from the old list; that residual defect is fixed. Authenticated writes accepted the three current examples and rejected old floor-area labor and scalar roof labor. Stored drafts remained DRAFT with no confirmations. |
| M5: Average membrane | Qualified finding: the current editor metadata already requested identified membranes, so the exact visible-editor allegation was not reproduced on the chosen baseline. Shared legacy help still said “Include an Average”; those three strings were corrected. Unknown/unoffered membranes still go to review. No Average rate is silently substituted. |
| M6: paint products | Confirmed. Missing paint-product diagnostics now identify the actual wall, ceiling, trim, primer or preparation product needed. A missing trim product no longer produces the misleading generic coverage message. Fully configured wall-only purchased-paint work still quotes. |
| M7: governing specification | Confirmed and corrected. The interior-painting section now describes measured wall square feet per coat, wall-height labor adjustments, separate measured ceilings/trim, product coverage and explicit inclusions. The obsolete mandatory floor-area instruction was removed. No pricing formula was changed. |

Owner draft preview retains its existing diagnostic behavior: it can show a draft/unready configuration to its owner, but that preview does not authorize a customer quote. The ready positive controls match public, staff and owner results.

## Expected amounts and controls

The roof hand calculation before the minimum is 2 squares × $90 labor + 2.2 material squares × $150 + 2 squares × $45 tear-off = $600 cost; 30% markup adds $180; sell-price underlayment adds $40 without markup. $820 + 15% tax = $943. Applying the intended pre-tax minimum gives $2,500 + $375 = $2,875.

Unchanged positive-control midpoints: cleanup $150; sod $2,037.50; planting $105; concrete $3,188.89; wall painting $300; purchased wall paint $250; clean-bed mulch $77.78; installed/itemized fence $4,500/$3,920; installed/itemized exterior painting $3,000/$1,794. The separate browser-configured 100-foot fence with no gates quotes $4,000.

[EXPECTED.md](./EXPECTED.md) retains the pre-execution calculations and an explicit correction to the initial mulch test expectation. That first expectation mistakenly applied material waste to installed labor; the engine’s existing $77.78 result was correct and its arithmetic was not changed.

## Exact verification

Final runs: [cold CI](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37022927057) and [application, browser and real Gemini verification](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37022927668).

| Check | Result |
|---|---|
| New regression file against original 1b70096 source | 30 tests: 16 positive controls passed; 14 reproduced failures. Complete original TAP retained. |
| `node --test test/quoteReadinessRepairs.spec.mjs test/priceBookAI.spec.mjs test/opusQuoteRepairs.spec.mjs` | 116/116 passed. |
| `READINESS_ASSERT_FIXED=true node verification/quote-readiness/reproduce.mjs <evidence-dir>` | 15 complete base cases through actual save/approval/catalog/preview/public/staff routes; 26 selected-unpriced-scope submissions; historical-unit recovery and authenticated interview checks passed. Stored application records: 58 submissions, 24 quotes, 34 leads. |
| `node verification/quote-readiness/browser.mjs <evidence-dir>` | 8/8 checks passed, including the real editor, cross-origin snippet/widget, matching $300 wall-only quote, unpriced-trim lead and persistence. No page errors. Screenshots at 375 and 1280 pixels; captured viewports had no horizontal overflow. |
| `node --test test/priceBookAI.spec.mjs` in the live-AI job | 50/50 passed. This overlaps the 116-test focused run. |
| `node verification/pricebook-ai/verify.mjs <evidence-dir>` with the existing repository secret | 14/14 checks passed. Google’s live model list confirmed `gemini-3.5-flash-lite` supports generateContent; 8 actual generations returned HTTP 200; 2 additional live attempts reached the 15-second deadline before successful retries. Full synthetic provider inputs/outputs are recorded without the key. The malformed-output, outage and timeout acceptance cases also use explicit controlled fixtures, separate from those 2 observed live deadlines. |
| Cold `node --test test/*.spec.js test/*.spec.mjs` | 1,136 tests: 1,125 passed, the same 9 known voice failures, 2 skipped. The existing failure checker passed with zero new failures; the raw suite is not described as wholly green. |
| `npm --prefix client run build` | Both the owner application and widget production builds passed. |
| Existing `npm audit --omit=dev --audit-level=high` CI step | Passed; zero reported production vulnerabilities in this run. |

The real Gemini/application run also checks per-field confirmation, prompt injection, hostile/invalid AI output, tenant isolation, unchanged drafts on failure, manual setup after slow/down Gemini, and customer-friendly widget wording. AI can only create unconfirmed drafts; it cannot approve or activate them.

Three older assertions were updated to the owner’s supported-base-work ruling: the source-level customer gate check, optional-zero behavior in the branch matrix, and optional planting preparation activation. Tests still require selected unpriced work to review and malformed/negative values to fail closed. The known voice-failure allowlist was not changed.

## Evidence and reproduction

- [Final manifest and archive](./final-25fca48/manifest.json): complete before/after requests, responses, saved books, submissions, quote/lead records, browser traffic, source-file hashes, Gemini inputs/outputs, test logs and screenshots.
- [Readable application summary](./final-25fca48/application-summary.json), [CI result](./final-25fca48/ci-result.txt), [browser results](./final-25fca48/browser-result.json), [live AI results](./final-25fca48/ai-result.json).
- [Final screenshots](./final-25fca48/screenshots/): roof minimum, historical correction, optional scope, fence and exterior setup at the recorded widths; customer quote and review result.
- [Original baseline cases](./baseline-1b70096/), [historical fractional-cent failure](./historical-fraction-before-7ab6e2f/), and [the earlier 9f18866 run](./final-9f18866/NOTE.md) remain intact.
- Run `node decode.mjs final-25fca48` from this evidence folder to reconstruct every archived file. The decoder verifies the archived Git blob, gzip integrity and recorded SHA-256 where supplied.
- Re-run the two verification scripts and the live-AI script from the exact source SHA with the environment and isolated browser setup in `.github/workflows/quote-readiness-verification.yml`. Gemini credentials belong only in the server/runner environment. The source branch contains the actual scripts and fixture inputs.

## Remaining limits

Historical positive roof minima require an owner check; this task did not inspect or modify production books. Fence/exterior work still needs owner-defined offerings and inclusions. Configuring unused standard fields alone is deliberately not enough to infer that scope. Two live Gemini attempts timed out before successful retries, so response time still depends on the provider. The 9 known voice failures and 2 skipped tests remain; phone/telephony behavior was not accepted by this task. These results verify the listed cases and boundaries, not every possible future configuration or overall launch readiness.

No arithmetic templates, math utilities or totals formulas, voice runtime, live demo, account/billing flow, dependency versions, deployment settings or live records were changed. Only activation and diagnostic portions of the engine directory changed. Source and durable evidence are saved on GitHub; PR #14 remains draft.
