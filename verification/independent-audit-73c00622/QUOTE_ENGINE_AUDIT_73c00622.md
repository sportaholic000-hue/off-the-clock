NOT CLEAN — 3 confirmed defects (2 medium, 1 low); 0 unresolved business-policy conflicts; 37 browser tests fail in this environment.

Independent read-only audit of `sportaholic000-hue/off-the-clock`, branch `codex/quote-release-candidate-20261006`, revision `73c00622d6f2df31f57773b32e41355a7421f1a3`.

The complete confirmed defect list is:

1. **D1, Medium:** Website price imports discard adjacent eligibility and scope restrictions.
2. **D2, Medium:** Website price imports attach one item's tax conditions to other items.
3. **D3, Low:** Owner editor guidance says missing optional pricing returns review, contradicting the specified and implemented behavior of three optional extras.

**E1, verification limitation rather than a product defect:** Chromium exits with SIGSEGV before loading the application. The completed quote gate has 2,031 passes and 37 failures; the completed full suite has 2,409 passes and the same 37 failures. Therefore the required cold-green condition is not met independently of D1–D3. Browser interactions cannot be certified from this audit. No arithmetic or persistence defect was confirmed in the independently exercised engine/application cases.

## Revision, independence, and read-only controls

Before reading implementation for the audit, `git ls-remote` resolved the requested branch to the exact requested SHA. The GitHub commit lookup agreed. A single-branch clone was then checked with `git rev-parse HEAD`; it matched the SHA above. `main` was never substituted. The checkout was clean initially and is clean at completion, at the same SHA.

I read `AGENTS.md`, `specs/BUILD_STATUS.md`, `docs/QUOTE_ENGINE_AUDIT.md`, the governing engine specification and its October 3–6 amendments, the release/integration and website-import rulings, the voice flows, and the relevant platform requirements. Earlier audit reports and repair notes were treated as historical context, not evidence of correctness. In particular, superseded fixed-height fencing, paint preparation, minimum, rounding, and date assumptions were not used as current expected behavior.

No subagents were used. No source fixes, commits, pushes, merges, deployments, provider writes, messages, or live-data changes occurred. Custom experiments used explicitly synthetic data, local HTTP fixtures, and temporary SQLite/price-book directories. AI calls were stubbed with synthetic replies. No live receptionist call was made. The required build rewrote the tracked generated `client/dist/index.html`; its original bytes were restored from the audited commit after preserving the build result. Browser-test temporary folders were moved out of the checkout. No application source was edited.

All independent dollar expectations were written before the relevant calculation run. The bundle includes those handwritten ledgers, exact input JSON, scripts, actual outputs, and both initial and corrected harness logs. Corrections to my synthetic fixture setup are disclosed below; they are not product findings.

## D1 — Imported prices lose nearby restrictions

**Severity:** Medium. An owner reviewing a draft can receive an apparently unconditional price that the business never advertised. Saving the draft unchanged supplies that incomplete statement to the receptionist. This can create an incorrect customer expectation and underpricing disputes. Owner review reduces the exposure but does not satisfy the importer's promise to retain conditions.

**Location:** `server/src/websitePriceExtraction.js:60–69` for HTML; `:29–32` for plain text. The governing rule is `specs/WEBSITE_PRICE_IMPORT_20261006.md:26–31`: retain item names, nearby conditions, punctuation, currency, and numeric spelling.

**Smallest reproduced configuration:** Use “Draft from my business” for a public same-host page. No quote-engine service or price book is needed. Synthetic page:

```html
<div>
  <p>[SYNTHETIC] Cleaning $99</p>
  <p>Only homes under 1,000 sq ft; first visit only.</p>
</div>
```

Equivalent supported `text/plain` input:

```text
[SYNTHETIC] Cleaning $99
Only homes under 1,000 sq ft; first visit only.
```

**Expected, written before execution:** Preserve **$99**, its item, and both restrictions. A larger home or a repeat visit has no advertised $99 entitlement. Do not manufacture a replacement amount. If the importer cannot safely associate the restriction, omit the unsafe item and explain that manual review is needed.

**Actual:** Both formats yield only:

```text
[SYNTHETIC] Cleaning $99
```

The importer returns `draft: true`, one entry, and `limited: false`. It does not report that the restriction was dropped. Compiling the resulting text as reviewed saved knowledge puts exactly that unrestricted sentence in `OWNER_FACTS_JSON.knowledge.prices`. A two-card experiment independently reproduces the same loss for **$99** and **$199**, each losing its own size restriction. This is a verified draft/prompt-data defect; it is not a claim that a live model was observed speaking an incorrect quote.

**Root cause:** The HTML traversal selects a deeper price-containing paragraph. A plain `div` parent is promoted only if it supplies a heading or the paragraph lacks an item name; it is not promoted merely because it contains the relevant sibling conditions. The parent itself is skipped as a candidate because it has a price-bearing child. Plain-text extraction independently retains price-bearing lines, so a separate non-price condition is lost. The global-condition regex does not cover ordinary eligibility, area, or first-visit restrictions.

**Execution evidence:** `website-independent.mjs`, cases **W1, W2, W3**; `website-independent-results.json`. The script executes the production extractor, the complete importer through an injected local HTTP transport, and the actual voice prompt compiler. It makes no external website request and writes no business knowledge.

**Fix, not implemented:** Extract a bounded item record that retains its associated sibling conditions, using the same item boundary for title, amount, and qualifications. For plain text, preserve bounded adjacent context without absorbing another item. Keep literal amounts unchanged. If association is ambiguous, withhold the excerpt and mark it for manual review. Add regressions for a heading-free card, adjacent text lines, and multiple cards with distinct restrictions.

## D2 — Local tax notes become contradictory global conditions

**Severity:** Medium. The imported draft changes the meaning of correctly stated prices, leaving the owner and receptionist with mutually incompatible tax instructions. This can lead to overcharging, undercharging, or an inaccurate verbal promise.

**Location:** `server/src/websitePriceExtraction.js:102–103` collects the notes without ownership; `server/src/websitePriceImport.js:43–45` appends every collected note to every entry. This violates the same literal-condition preservation rule in `specs/WEBSITE_PRICE_IMPORT_20261006.md:26–31`.

**Smallest reproduced configuration:** One synthetic public HTML page; no engine setup:

```html
<article><p>[SYNTHETIC] Item A $10</p><p>Tax included</p></article>
<article><p>[SYNTHETIC] Item B $20</p><p>Plus tax</p></article>
```

**Expected, written before execution:** Item A remains **$10, tax included**. Item B remains **$20, plus tax**. No tax rate is supplied, so the importer must not calculate a tax-inclusive amount for B. Each note must remain associated with its item.

**Actual:**

```text
[SYNTHETIC] Item A $10
Tax included
Plus tax

[SYNTHETIC] Item B $20
Plus tax
Tax included
```

The leaf extractor initially forms the correct article excerpts. The complete importer then adds the opposite item's note to each excerpt. The contradictory statements also appear in the actual voice compiler's saved-price facts. `limited` is false.

**Root cause:** Every matching paragraph, small element, or footer becomes a page-level condition, even when it belongs inside one item. `entry.excerpt.includes(note)` avoids exact duplication only; it does not establish applicability. The importer then distributes all remaining notes to all prices.

**Execution evidence:** `website-independent.mjs`, **W4**, with both the extractor output and final importer output saved in `website-independent-results.json`; the compiled voice facts are retained there as well.

**Fix, not implemented:** Retain the owning item boundary for each note. Only genuinely page-wide statements, such as a clearly global “All prices exclude tax” note outside item records, may be shared. Item-local statements must never be promoted or copied to siblings. Reject contradictory unresolved tax context instead of supplying both claims. Add the two-article regression above and a separate genuine global-note test.

D1 and D2 are separate defects: retaining more item context fixes D1 but does not stop D2's later cross-item propagation.

## D3 — Owner guidance disagrees with missing-addon behavior

**Severity:** Low. This is an owner-facing configuration and expectation defect, not a wrong arithmetic result. An owner is told that an unpriced selected extra will stop quoting and arrive for review, while the system can release the base estimate with an exclusion. The customer and phone exclusions themselves worked in the reproduced cases.

**Location:** `client/src/pricebook.jsx:946–950`, under **Optional prices and add-on charges**. It states: “Selected scope needs its configured price; missing pricing returns review.” Current behavior is implemented at `server/quote-engine-vnext/templates.js:971–973` and `:1005–1008`, with the analogous ponding branch in the flat-roof repair template. The governing distinction is `specs/quote_engine_v2.md:289–315`: unpriced SCOPE blocks; the three named ADDON exceptions are omitted with explicit per-option exclusions.

**Smallest reproduced configuration and inputs:** A valid enabled mowing service with no `baggingSurchargePercent`. Supply all normal service rules and required business defaults; use zero markup, fees, tax, minimum, and range buffer. Set mowing rate **$1 per sq ft** and every frequency/overgrowth multiplier to **1**. Input:

```json
{
  "yardSqft": 100,
  "sqftMethod": "exact",
  "serviceFrequency": "weekly",
  "grassCondition": "maintained",
  "bagClippings": true,
  "edgingIncluded": false
}
```

The complete rule maps and service identity are supplied by the independent `mowing` fixture in `independent.mjs` / `independent-cases.json`; no prices are inferred.

**Expected, written before execution:** Step 2b gives **100 × $1 = $100.00 CAD per visit**, explicitly excluding bagging and disposal. The owner editor must explain this exception instead of promising that every missing optional price returns review. The same distinction applies to measured mowing edging and flat-roof ponding treatment.

**Actual:** `INSTANT_ESTIMATE_READY`, **$100.00**, with `Clipping bagging and disposal` excluded. The phone summary also says “Not included”. Unpriced 20 ft of mowing edging likewise produces **$100.00** with edging excluded. Unpriced ponding treatment on the synthetic repair produces **$110.00** (one hour at $100 plus $10 materials), excluding ponding treatment. Meanwhile, execution of the actual owner component renders the quoted “missing pricing returns review” guidance.

**Root cause:** One generic section subtitle describes hard-required scope behavior for a section that also contains the three explicitly permitted skippable extras. The editor does not explain that distinction there.

**Execution evidence:** `edge.mjs`, **unpriced-bagging**, **unpriced-edging**, and **unpriced-ponding**; `edge-results.json`. `render-owner.mjs` bundles the unchanged actual `PriceBook` component, supplies synthetic initial React state, and server-renders it; `render-owner-final.log` and `owner-missing-addon-guidance.html` confirm the displayed sentence and the optional bagging/edging fields. This is a component-render verification, not a browser-interaction pass.

**Fix, not implemented:** Use scope-specific owner copy. Explain that unpriced selected scope requires review, while these three extras can be excluded from the estimate and will be named in the customer disclosure. Label the affected optional fields accordingly. Keep the specified engine behavior and its correct exclusions.

## Business-policy conclusions

**No unresolved genuine business-policy conflict was identified.** D3 is resolved by the explicit SCOPE/ADDON distinction, not by asking the owner to choose new math. Current dated amendments settle the other examined conflicts: pre-tax minima; height-proportional fencing; direct versus area-derived mulch waste; independently measured roof layers; inclusive upper scope bands; labor-only seasonal adjustments; and recorded quote-local month rather than job month.

The phone compiler permits one explicit exception for multiplying a listed per-unit price by a caller-stated quantity; it otherwise forbids price invention, mixing items, tax calculations, discounts, and unit conversion. That exception is present in the emitted current instruction. It was distinguished from raw engine rates, which are not supplied to the model. This audit did not run a live model or certify its spoken compliance. Listed-price input defects D1/D2 are verified before any model behavior is involved.

## Workflow trace and coverage

| Stage | Source examined | Independent execution and conclusion |
|---|---|---|
| Manual configuration | `pricebook.jsx`, `pricebookEditing.js`, `pricebookInputs.jsx`, offering/scope editors, shared metadata | Exact rate parsing, fractional measured rates, fixed cents, scope modes, price options, and owner rules traced. Actual owner SSR confirms D3. Browser editing tests remain blocked by E1. |
| AI starter | `priceBookAI.js`, starter handling in `pricebook.jsx`, onboarding source metadata | Explicit synthetic $1 starter retained; approval injection rejected. AI_SUGGESTED save/preview/approve/edit/reapprove/replay exercised. Starter prices remain drafts and cannot supply approval receipts. |
| AI interview | `priceBookAI.js`, `onboardingService.js`, interview helpers and structured controls | Fractional measured rate preserved; fractional-cent gate rejected; null extraction requires clarification. AI_INTERVIEW lifecycle exercised. Server revision checks and late-answer protection traced; corresponding non-browser regression tests pass. |
| Website prices | Import routes, transport, extractor, knowledge draft application/save, voice facts | Five independent synthetic website cases; D1/D2 reproduced. Explicit hidden content excluded. Existing same-host, private-address, DNS/redirect, bounded-read and draft/save tests pass. No live crawl or model request. |
| Validation and storage | `priceBookMoney.js`, tree/structure validators, bridge, price-book service | Dollars/cents round trip, protected origin/source/receipts, exact revision conflicts, fsync/rename/unconfirmed-save barrier and per-owner locking traced. Synthetic approval and stale-save probes pass. |
| Approval/readiness | Bridge approval digest/version boundary; `priceBook.js` activation; pricing merge | All 30 selected application cases validate live only after approval. Edits and business-default changes pause new quoting. AI field confirmations are bound to saved current values. Large/partial catalog behavior independently verified. |
| Questions and owner preview | Shared customer field definitions, `CustomerMeasurements`, wizard, scope variants, preview bridge | Required fields/units, tier unions, confirmation clearing, unknown measurements, optional scope, and owner/customer fee authority traced. Independent owner previews and real calculations agree for all three sources. Browser interaction coverage is limited by E1. |
| Calculation | Active contracts, templates, configured offerings, scope pricing, exact math, engine pipeline | 118 independently specified numerical/scope cases cover all 20 services, custom units and ranges, fees, splits, markup/margin, tax, minima, rounding, packages, tiers, and invalid inputs. |
| Customer presentation | Engine sanitizer/evidence checks, quote scope disclosure, summary and display helpers | Customer results exclude rates, internal line items, revisions, and approval data in the exercised application cases. Forged displayed or line amounts fail sanitization. Currency, per-visit labels and exclusions verified. |
| Stored quote/replay | `quoteDoneRoutes.js`, owner record views, immutable submissions | Identical request returns the original receipt; changed request content rejects; new rates and later markup do not rewrite old $100 quotes. Missing contact writes no submission. Additional unpriced work has no whole-job total. |
| Phone engine quotes | Voice question binding, runtime, handles, prompt, projection | Actual local voice runtime matches, quotes $100 CAD per visit, enforces recap confirmation, deduplicates, and replays the original amount after a price change. No raw rates exposed. Existing full-suite voice tests pass. |
| Retired paths and duplicated logic | Import graph, active route composition, engine exports, legacy directory, old starter helpers | Production quote calculation reaches the shared bridge; the architecture gate passes. Retired engine source is outside production routing. The development quote-test route uses the bridge and is disabled in production. Readiness probes reuse validation/calculation, and the customer sanitizer reproduces monetary evidence. |

No passing test label was used to establish expected trade math. The numerical ledgers below and in the bundle were derived separately. Existing tests supplied additional execution coverage of concurrency, isolation, malformed structures, signed intake, geometry, approval history, and UI helpers.

## Independent service and arithmetic results

Amounts below assume no fees, markup, tax, minimum, or buffer except where explicitly stated. All data are synthetic; amounts are CAD in the fixtures. Configured known products have explicit identities and confirmations where the contract requires them.

| Supported service | Independent baseline expectation and exercised modes |
|---|---|
| ROOFING_REPLACEMENT | 1,000 sq ft: 10 squares × $50 labor + 11 waste-adjusted squares × $100 materials + 10 × $20 removal + 10 × $1 installed underlay = **$1,810.00**. Partial 25% = **$452.50**. Package underlay: four $10 rolls replaces $10 installed underlay, giving **$1,840.00**. |
| ROOFING_REPAIR | Small: one $100 hour + $10 materials = **$110.00**; medium **$220.00**; large **$330.00**; over configured maximum requires review. |
| FLAT_ROOF_REPLACEMENT | 100 sq ft: $100 labor + $220 membrane including waste + $300 removal = **$620.00**. Independently measured insulation or coverboard adds $80 each; both = **$780.00**. |
| FLAT_ROOF_REPAIR | **$110.00 / $220.00 / $330.00** by independently specified bands; oversized repair requires review. Ponding exception disclosed when unpriced. |
| INTERIOR_PAINTING | Basic two-coat 100 sq ft = $200 labor + $44 finish material = **$244.00**. Installed **$300.00**; itemized finish/prep/primer **$326.00**. Fair basic walls require review. Package boundary **$230.00 → $260.02** at 100 → 100.01 sq ft. |
| EXTERIOR_PAINTING | Installed **$300.00**; itemized finish/prep/primer **$326.00**. Both exercised through application approval/readiness/calculation. |
| FLOORING_INSTALL | 100 sq ft tile: small-room labor $120 + material $112 = **$232.00**. Diagonal **$263.00**. Inclusive room boundaries 150/150.01/300/300.01 produce **$348.00 / $333.02 / $666.00 / $636.02**. |
| FLOORING_REPLACEMENT | Same selected no-removal scope **$232.00**. Shared replacement/optional scope validation traced and covered in the existing suite. |
| FENCING_INSTALL | Installed 100 ft × $10 = **$1,000.00**. Itemized: $100 labor + $110 infill + 14 posts/footings × $3 = **$252.00**. Heights 3/6/9 ft: **$126 / $252 / $378**. Gate/corners example **$314.00**. |
| FENCING_REPLACEMENT | Same installed/itemized baselines. Half-height new fence plus independently measured removal = **$520.00**; removal is not height-scaled. |
| CONCRETE_DRIVEWAY | 10 × 10 ft × 4 in: $100 labor + $110 concrete + $40 formwork = **$250.00**. 10 ft adjoining edge **$240.00**; all adjoining **$210.00**; excessive adjacency reviews. Itemized demolition **$550.00** total. |
| CONCRETE_PATIO_SLAB | Same 10 × 10 ft configuration **$250.00**. The shared concrete geometry was also exercised with an orthogonal L-shaped 75 sq ft driveway and 40 ft perimeter, yielding **$197.50**. |
| LANDSCAPING_CLEANUP | $100 labor + $20 debris disposal = **$120.00**; template disposal replaces a configured common disposal fee, avoiding duplication. |
| LANDSCAPING_MULCH | Two stated yards = **$30.00**; 324 sq ft × 2 in derives two yards, with material overage only, = **$33.00**. |
| LANDSCAPING_SOD | $100 labor + $105 waste-adjusted material = **$205.00**. Separate markup/tax matrix exercises category taxability and waste override. |
| LANDSCAPING_PLANTING | One small plant at $10 labor + $20 material and two medium at $20 + $30 = **$130.00**. Size maps and optional prep/mulch source paths traced. |
| LANDSCAPING_MOWING | 100 sq ft × $1 = **$100.00 per visit**. Markup25% **$125.00**, margin25% **$133.33**, October10% peak **$110.00**, $15 travel **$115.00**. |
| SIDING_REPLACEMENT | 100 sq ft = $100 labor + $110 material = **$210.00**. Two-story siding plus measured itemized trim = **$241.00**. |
| SIDING_REPAIR | **$110.00 / $220.00 / $330.00** by the specified bands, with maximum-size rejection. |
| CUSTOM | Fixed flat **$100.00**; two hours/units/sq ft/LF/squares each **$200.00**. Intrinsic flat range **$100/$150/$200**; each quantity unit **$200/$300/$400**. Minimum/tax scenario **$176/$176/$220**. |

Additional independently checked boundaries:

- Measured rate **$0.0075 × 10,000 = $75.00**. **$0.005 × 201 = $1.005**, rounded once to **$1.01**. A 25% range around that result is **$0.76/$1.01/$1.26**.
- Installed selling prices receive no cost markup/margin. $300 with 40% materials and 10% materials tax gives **$312.00**. With 60% labor, high-wall 1.1 adjustment, 10% labor peak and materials tax: $198 labor + $120 material + $19.80 peak + $12 tax = **$349.80**. Missing needed shares and shares totaling 101% reject.
- Cost/tax matrix: $100 labor + $120 material; 25% markup gives **$275.00** before tax. With material category taxable, materials-only tax gives **$290.00**; all-tax gives **$302.50**. Explicit category exemptions are respected.
- A pre-tax $150 minimum plus 10% all-tax produces **$165.00**, a single minimum-bound price despite a configured range buffer. Minimum boundaries just below, at, and above the underlying $100 were exercised.
- Six fee modes, explicit owner/customer Yes and No, unanswered selections, owner-controlled permits, and disposal replacement were exercised.
- Three-tier inheritance returns **$100/$200/$300**; a nested multiplier override returns **$150**; an incompatible sibling is withheld while a valid option remains. Scope and price options use recursive effective pricing.
- Two $10 stair steps add $20 to the $232 floor; a 4.01 ft tread cannot use an up-to-4 ft scope. An adjacent wider $20-per-step band gives **$272.00**. No fallback to an incompatible band.
- One shared material purchase group is rounded once after quantities are combined. Wall/prep quantities sharing a 400-unit $30 package give **$240.00**, not two package charges.
- The 320 replacement × 320 existing-product roofing catalog returned live readiness in approximately **2.254 seconds** for the independent complete fixture, with 639 reported reference combinations. This does not claim that every pair was enumerated: the selected customer pair was fully calculated. Removing its material price caused that pair to review while complete siblings stayed available; malformed text stopped readiness.
- Sparse arrays, non-finite rates, oversized measurements/totals, getters, cycles, unknown fields, and tampered receipts all failed closed in the independent probes. No getter was executed.

## Cold gates and environment failures

The original environment supplied Node 24. The repository's specified Node 22 was provisioned separately as **v22.23.3** before `npm ci` and the gates. Playwright **1.56.0** was installed outside the checkout and exposed through ignored dependency links; no manifest or lockfile was changed. Chromium/headless shell revision 1194 was downloaded. Temporary storage was explicitly redirected into the audit workspace.

| Command/run | Result | Evidence |
|---|---|---|
| `npm ci` on fresh clone/dependencies | PASS; 262 packages installed | `npm-ci.log` |
| `npm run build` | PASS; owner and widget production builds | `build.log` |
| First `npm run test:quote` | 2,068 tests: 2,031 pass, 37 fail; zero skip/cancel/TODO | `test-quote-cold.log` |
| Provisioned `npm run test:quote` rerun | Same 2,068 tests: 2,031 pass, 37 fail; zero skip/cancel/TODO | `test-quote-provisioned.log` |
| First `npm test` attempt | Incomplete transcript, no final summary; not counted as a completed or passing run | `test-full-cold.log` |
| Completed `npm test` rerun | 2,446 tests: 2,409 pass, 37 fail; zero skip/cancel/TODO | `test-full-second.log`, `full-second.tap` |

The first quote run was launched while browser provisioning was still finishing: 34 failures reported the not-yet-present executable and three reported the later startup crash. That initial setup error was corrected before the provisioned rerun. All 37 failures in each completed provisioned suite are browser-launch failures with SIGSEGV, before any app page or price assertion. The independent browser smoke test also crashes when launching an empty browser, including alternate process-start flags. This confirms an environment failure; it does not prove browser product behavior either way. The initial browser installer also encountered an unwritable default temporary path and a failed CDN response; using the workspace temporary directory and the installer's fallback completed the download. Those installer issues are separated from the persistent launch failure.

The 37 affected tests are in these nine files:

| Browser test file | Affected tests |
|---|---:|
| `test/astraQuoteScope.browser.spec.mjs` | 3 |
| `test/claudeScopeEditorOrder.browser.spec.mjs` | 1 |
| `test/interviewControls.browser.spec.mjs` | 3 |
| `test/priceBookEditor.browser.spec.mjs` | 15 |
| `test/pricebookInterviewSave.browser.spec.mjs` | 5 |
| `test/pricebookPreviewFreshness.browser.spec.mjs` | 4 |
| `test/quoteConfigurationInterview.browser.spec.mjs` | 3 |
| `test/quotePreviewTier20261005.browser.spec.mjs` | 1 |
| `test/websitePriceDraft.browser.spec.mjs` | 2 |

The strict quote suite selects **94 files**. The full suite selects **136 files**. Its 2,446 tests include the quote suite; these counts must not be added as unique coverage. The completed full run includes voice and other application regressions outside the quote-only gate.

## Experiment accounting and reproducibility

| Independent group | Cases | Final disposition |
|---|---:|---|
| Core/service ledger, `independent.mjs` | 62 | All expected results matched after correcting custom fixture fields |
| Combined finance/scope ledger, `advanced.mjs` | 56 | All expected results matched after fixture/expectation corrections described below |
| Save/approve/change/store/replay, `workflow.mjs` | 48 | All expected results matched with booking explicitly disabled for the isolated quote fixture |
| Application validation/approval/calculation matrix | 30 | All expected results matched across all 20 services and additional modes/units |
| Catalog, malformed inputs, receipt integrity, AI, optional extras, real local voice runtime | 22 | All assertions passed; three cases also establish the behavior underlying D3 |
| Website extraction → import → voice facts | 5 | W1–W3 reproduce D1; W4 reproduces D2; W5 excludes hidden content correctly |
| Actual owner component server render | 1 | Reproduces the owner copy in D3 |
| **Total independent scenarios/render checks** | **224** | No undisposed failed suspicion; defects and environment limitations are stated above |

Initial independent harness failures were investigated rather than counted as product defects:

- Six custom baseline fixtures initially omitted their required service name/unit confirmation fields. Supplying the actual public contract made them pass; the handwritten amounts did not change.
- The advanced tax fixture initially marked materials non-taxable while expecting tax. Setting the intended category flag produced the prewritten $290 result. A fee enum was corrected to `included_in_rates`; the physically on-site mowing travel scope correctly charges its selected $15 fee, so the mistaken $100 travel expectation was corrected to $115 before rerun. Required demolition area was supplied. A registry intended for open product selectors was removed from a fixed flooring enum.
- The stored-quote harness initially omitted booking configuration, causing the real endpoint to reject the unavailable booking dependency and roll back. Explicitly disabling booking isolated the intended quote persistence test; no production behavior was altered.
- The recap-negative voice probe initially expected a returned refusal; the runtime correctly throws `CUSTOMER_CONFIRMATION_REQUIRED`. The assertion was corrected to verify that exact refusal. The owner-render harness required an esbuild namespace resolution correction; its final run executes the unchanged component.

The bundle preserves the initial logs as well as corrected outputs, so these distinctions are independently reviewable. The experiment ledgers specify amounts rather than calculating their expected answers with the production engine.

To reproduce, check out the exact SHA, use Node 22, run the four requested npm commands, and install the documented Playwright prerequisite without altering the lockfile. The audit scripts live outside the checkout and use a single absolute `root` for this workspace; adapt that root for another temporary checkout. Run the ledger-writing mode before the calculation mode. `independent-cases.json` and `advanced-cases.json` retain complete explicit configurations. No production credentials or live provider calls are needed.

No fixes are implemented in this deliverable. The report recommends the concrete behavior for each defect; it does not defer trade calculations or technical choices to the owner.

## Closing audit record

**Audited SHA:** `73c00622d6f2df31f57773b32e41355a7421f1a3` on `codex/quote-release-candidate-20261006`; final checkout unchanged.

**Covered:** all 20 supported services; basic/configured/itemized/installed pricing; six custom units and fixed/range modes; tiers and recursive inheritance; optional measured scopes and packages; manual, AI starter, AI interview and website sources; owner validation/save/approval/preview, public questions and presentation, calculation, stored receipt/replay, phone quote tools and listed-price facts; precision, limits, malformed input, large/partial catalogs, stale approvals, repeated requests, and retired-route isolation. Browser interaction verification is explicitly blocked by E1.

**Tests/experiments:** cold `npm ci` and `npm run build` passed; quote gate **2,068 = 2,031 pass + 37 environment failures**, repeated after provisioning; completed full suite **2,446 = 2,409 pass + 37 environment failures**, zero skips/cancellations/TODOs; **224 independent scenario/render checks**. **Confirmed defects: 3. Unresolved business-policy conflicts: 0. Verdict: NOT CLEAN.**
