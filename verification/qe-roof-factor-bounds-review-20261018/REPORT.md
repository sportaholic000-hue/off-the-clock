# Roofing story/shape factor bounds — evidence-only review

**Done: investigation and evidence. Not repaired: the two reported quote refusals, the readiness coverage gap, and the rounding defect below remain in production source.** Production, shared tests, dependencies/lockfiles, engine versions, specs and the separate zero-adjustment repair are unchanged. Only `verification/qe-roof-factor-bounds-review-20261018/` is written and published. Synthetic local data only; no subagents, deploys, live provider calls or production records.

Branch: `codex/qe-roof-factor-bounds-review-20261018`. Exact base: `1857b7779b83b70f7753b41b72c3677270cd4ffc`. Reference evidence: `befc00358dfc82a864eaffeb229db7c386045051`. The local expectation commit `cc81c18ef4c69a256ed4c4b3ee3ae8de9675d0bd` has the exact base as its only parent and predates all engine execution. Its raw commit object is preserved in `LOCAL-PREEXECUTION-COMMIT.txt`. The Git CLI lacked write credentials; publication uses the connected GitHub app, with the final evidence commit based directly on the exact requested base. Local prepublication commits are not claimed as remote ancestors. The final published SHA is returned directly in chat after remote verification.

## Findings

### 1. Clear mismatch: accepted below-one factors cannot use the adopted additive formula

Both `storyMultiplier` and `complexityLaborMultiplier` accept finite numbers from **0.1 through 5 inclusive**. All six story/shape leaves were checked. The two coordinator cases pass Class-2 validation, selected owner-price validation and service-rule validation. Nevertheless, the adopted/new calculator constructs `factor - 1` as an ordinary positive quantity multiplier. For 0.5 that is−0.5, which the line builder refuses before an amount exists. It reports the legal saved field itself as invalid.

| Selected setting | Independent cents | Actual result |
| --- | --- | --- |
| S=1, C=1, pitch up_to_six | 391000 | READY391000 |
| storyMultiplier[1]=0.5 | 261000 | REVIEW; invalidOwnerFields storyMultiplier.1 |
| complexityLaborMultiplier.simple=0.5 | 291000 | REVIEW; invalidOwnerFields complexityLaborMultiplier.simple |
| S=0.5, C=0.6 | 181000 | REVIEW despite positive installation and total |
| S=0.5, C=1.6 | 381000 | REVIEW; one negative delta defeats the compensating positive delta |
| S=0.5, C=0.5, upper pitch | 255800 | REVIEW despite positive combined installation |
| S=0.5, C=1, three layers | 343000 | REVIEW; story also affects additional-layer removal |

The source of the mismatch is [server/quote-engine-vnext/templates.js:550](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/quote-engine-vnext/templates.js#L550), especially570–571 and591–594, against [server/quote-engine-vnext/contracts.js:709](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/quote-engine-vnext/contracts.js#L709) and781–785. Rejection occurs in [server/quote-engine-vnext/templates.js:88](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/quote-engine-vnext/templates.js#L88) and141–173. Changing only `allowZero` cannot repair a negative delta; that is distinct from the separate accepted-zero pitch/layer adjustment repair.

Impact demonstrated: valid saved settings lose quotes; these blocked cases do not issue a wrong positive bill. The new/adopted roof path is affected. The existing legacy multiplicative path accepts story 0.5 and quotes 261000c; its shape 0.5 setting does not affect legacy labor and quotes 391000c. A global story minimum of1 would therefore break an already-working legacy case.

### 2. Confirmed saved-book readiness gap, including a false service-wide block

Real manual draft save, explicit approval, file reload, receipt evaluation, customer application calculation, intake and owner preview were executed against disposable local storage. Application fixtures additionally set CAD/UTC and the owner-selected unknown-pitch band up_to_six; these non-rate choices prevent unrelated configuration omissions from hiding the factor problem.

| Saved setting / requested selection | Postapproval status | Current receipt | Direct selected engine | Customer application | Owner preview |
| --- | --- | --- | --- | --- | --- |
| control | QUOTING LIVE | True | INSTANT_ESTIMATE_READY | INSTANT_ESTIMATE_READY | INSTANT_ESTIMATE_READY |
| story-one-half | QUOTING LIVE | True | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW |
| shape-simple-half | QUOTING LIVE | True | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW |
| both-half | QUOTING LIVE | True | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW |
| story-two-half | QUOTING LIVE | True | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW |
| shape-moderate-half | QUOTING LIVE | True | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW |
| all-stories-half | NEEDS PRICING | True | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW |
| all-shapes-half | NEEDS PRICING | True | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW | ESTIMATE_REQUIRES_REVIEW |
| complex-shape-half-simple-request | NEEDS PRICING | True | INSTANT_ESTIMATE_READY | ESTIMATE_REQUIRES_REVIEW | INSTANT_ESTIMATE_READY |

With one-story 0.5 or simple-shape 0.5, **QUOTING LIVE plus approvalCurrent:true does not mean that selection calculates**. Activation chooses the largest story factor and the shape with the largest waste factor, rather than traversing all story/shape pairs. Here those probes use story 3/complex. If complex is the bad factor instead, a simple selection still calculates 391000c directly and in owner preview, but service-wide readiness disables the live customer path. This is the converse failure, not proof that the simple work was unpriced. Owner preview intentionally permits inactive services; it is not a live-eligibility bypass.

Source: [server/quote-engine-vnext/priceBook.js:269](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/quote-engine-vnext/priceBook.js#L269)–295 and848–865; [server/src/quoteDoneBridge.js:217](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/src/quoteDoneBridge.js#L217)–232 and449–466. Customer HTTP submission calls the same bridge at [server/src/quoteDoneRoutes.js:147](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/src/quoteDoneRoutes.js#L147); voice binds it at [server/src/voice/voiceToolRuntime.js:196](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/src/voice/voiceToolRuntime.js#L196)–205. Those HTTP/voice edges were traced, not exercised end to end. The real shared application bridge and customer projection were exercised. Rejections produce sanitized customer review outcomes, not leaked owner rates.

Draft numeric validation is deliberately weaker than full readiness: it accepts finite nonnegative drafts such as 0, 0.099999 and 5.000001, while Class-2 validation rejects them. This alone is not a bad-quote defect; incomplete drafts are allowed. The finding above uses 0.5, which passes the actual Class-2 contract. See [server/priceBookMoney.js:536](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/priceBookMoney.js#L536)–582 and [server/quote-engine-vnext/contracts.js:1179](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/quote-engine-vnext/contracts.js#L1179)–1228.

### 3. Separate exact-decimal rounding defect in the same adjustment construction

For one square at 10c installation and 10c tear-off, story 1.15 creates two exact 1.5c additions. Each should round to 2c under the existing per-line rule. With the other three 1c lines, independent total 27c becomes **actual 25c**. With shape 1.15 and story 1, only installation has that addition: expected 25c becomes **actual 24c**. Both issue READY results. Native `1.15 - 1` creates 0.1499999999999999; converting that already-distorted number to exact evidence faithfully preserves the wrong fraction. These are synthetic half-cent probes, not claims about market-sized losses.

The original positive factor must enter exact decimal arithmetic **before subtraction**, as `exactSubtract(exactDecimal(factor),1)`, with exact evidence retained through subsequent processing. This preserves the intended decimal factor, rather than rounding it to an arbitrary number of places. Sources: [server/quote-engine-vnext/templates.js:570](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/quote-engine-vnext/templates.js#L570)–571 and593–594; [server/quote-engine-vnext/exactMath.js:121](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/quote-engine-vnext/exactMath.js#L121)–128. The two monetary assertions remain failed in `rounding-reproduction.stdout.log`.

### 4. Combined zero/negative results expose a coupled-domain policy gap

For this low-pitch, one-layer fixture, formal installation is `200000*(S+C-1)` and the complete formal total is `260000*S + 200000*C - 69000`. The following are algebraic diagnostics, **not authorized quotes**:

| Case | S | C | Formal installation cents | Formal total cents | Actual |
| --- | --- | --- | --- | --- | --- |
| zero-installation | 0.5 | 0.5 | 0 | 161000 | ESTIMATE_REQUIRES_REVIEW |
| negative-installation-positive-total | 0.4 | 0.4 | -40000 | 115000 | ESTIMATE_REQUIRES_REVIEW |
| zero-grand-total | 0.1 | 0.215 | -137000 | 0 | ESTIMATE_REQUIRES_REVIEW |
| negative-one-cent-grand-total | 0.1 | 0.214995 | -137001 | -1 | ESTIMATE_REQUIRES_REVIEW |
| positive-one-cent-grand-total | 0.1 | 0.215005 | -136999 | 1 | ESTIMATE_REQUIRES_REVIEW |
| minimum-factors-negative-total | 0.1 | 0.1 | -160000 | -23000 | ESTIMATE_REQUIRES_REVIEW |

Every leaf in these combinations is accepted. All are refused before publishing a price. The 81-pair grid has 66 positive-installation/positive-total cases, 5 zero-installation/positive-total cases, 9 negative-installation/positive-total cases and 1 negative-total case. Dedicated anchors additionally exercise exact zero and±1c totals. Across all 205 observations, 82 accepted-factor refusals have positive aggregate installation; 6 have zero and 15 negative. No inference that a negative labor component is safe follows from a positive grand total.

Existing financial evidence requires nonnegative amounts and operands: [server/quote-engine-vnext/engine.js:794](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/quote-engine-vnext/engine.js#L794)–823,890–898 and1660–1669. `exactRound` explicitly rejects negative money. Therefore merely allowing a negative multiplier in the template does not fix receipt validation or authorize negative charges. The current fail-closed outcome for nonpositive combined components is not evidence for a clamp, free labor, a discount policy, or multiplication instead of addition.

### 5. Metadata ambiguity can encourage confusing a multiplier with an addition

`roofStarting` labels the shape setting’s unit **decimal addition**, although the actual field is a 1-based multiplier and its default values are 1/1.20/1.40. That unit reaches Class-2 metadata/help and the structured owner control. This already existed in the reference evidence; it is not empirical proof an owner entered the wrong value. It is relevant to this bounds review because entering 0.20 to mean “add20%” is accepted but interpreted as a factor 0.20, creating a negative adjustment. Story uses the correct multiplier unit. Proposed repair wording, not shipped: “Roof-shape labor multiplier”; help “1 means no change; 1.20 means20% more labor; 0.80 means20% less, subject to the supported combined-adjustment policy.” The last clause must follow the owner’s actual ruling.

Sources: [server/quote-engine-vnext/contracts.js:766](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/quote-engine-vnext/contracts.js#L766)–785; [server/quote-engine-vnext/priceBook.js:1352](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/quote-engine-vnext/priceBook.js#L1352)–1355; [server/src/quoteDoneBridge.js:589](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/src/quoteDoneBridge.js#L589)–592; [client/src/pricebook.jsx:1320](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/client/src/pricebook.jsx#L1320)–1348. No rendered-browser claim is made.

## What the existing instructions establish, and what they do not

**Established:** Class-2 values are stored and owner-overridable; story affects installation/removal rather than material/disposal; the legacy formula multiplies pitch/story; the explicitly opted-in roofing implementation and its unchanged acceptance tests add separate story/shape/pitch charges; neutral story/shape is 1; current permitted leaves are 0.1–5. The coordinator independently specifies the 261000/291000 algebra. The tests at [test/quoteRoofing20261016.spec.mjs:78](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/test/quoteRoofing20261016.spec.mjs#L78)–96 explicitly protect additive stacking. The older multiplication text at [specs/quote_engine_v2.md:655](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/specs/quote_engine_v2.md#L655)–658 is the legacy path, not authority to silently change the adopted path back. [specs/quote_engine_v2.md:573](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/specs/quote_engine_v2.md#L573)–585 protects owner-overridable defaults and per-line cents rounding; [specs/QUOTE_AUDIT_DECISIONS_20261004.md:25](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/specs/QUOTE_AUDIT_DECISIONS_20261004.md#L25)–30 protects fractional per-unit rates and once-rounded extended charges.

**Clear implementation mismatch:** for the reported below-one cases, the accepted factor and additive formula yield positive installation, positive removal and a positive total. Rejecting the valid factor because its internal delta is negative contradicts that contract. This conclusion does not require a new stacking rule or choosing a market rate.

**Not established by the inspected instructions:** that every Cartesian combination of independently legal leaves is priceable; that zero installation obtained by cancellation should become an offered free component; that negative installation may offset materials; how a signed adjustment rounds at a negative half cent; or whether the owner instead intends surcharge-only factors and a changed lower bound. Published starting-source examples of upward surcharges do not themselves override the stored numeric contract. No automatic clamp, new minimum factor, invented discount, or product stacking is justified. Those coupled-domain/rounding policy questions need an explicit owner ruling before a general repair. Negative grand totals cannot be published under the current financial contract.

## Concrete repair recommendation — separate production authorization required

1. **Retain the authorized formula and legal leaf bounds while resolving the representation bug.** Do not change 0.1 to 1 globally or replace addition with multiplication. Compute story/shape deltas using exact subtraction. Model a signed roof adjustment in a roof-specific, auditable relation to its positive installation/tear-off base; do not simply relax the generic quantity-factor or money validators to admit arbitrary negative amounts. The receipt verifier must independently reconstruct that relation from the same saved factor paths and measured areas. Additional-layer story terms must be included. Material, disposal and unrelated trades stay untouched.

2. **Decide the rounding boundary explicitly before implementing that representation.** The existing separate positive-line scheme must not be silently replaced with one rounded combined factor. The preserved one-square counterexample totals 9c today; rounding the combined installation once makes it 8c. Conversely a new signed-line scheme needs a negative-half-cent rule absent from the current exact-money helper. Recommended compatibility requirement: keep existing nonnegative line rounding and historic totals; have the owner approve the signed-delta tie convention and any newly combined component representation. Whichever is chosen, write literal half-cent expectations before implementation and disclose changed cents. The exact-subtraction correction itself intentionally changes the demonstrated 25→27c and 24→25c results; these are defect fixes, not prices to rewrite into history.

3. **Keep nonpositive combined cases in review until the owner sets their policy.** Diagnose the relevant story/shape paths and the combined installation/removal result; do not clamp it, let a minimum job price conceal negative labor, or infer a free complete service. If the owner chooses to disallow those combinations, add an explicit coupled-domain check consistently to validation/readiness/calculation with a clear owner reason. If the owner instead changes the allowed factor domain, show the exact saved settings affected and require review. This is an owner decision, not an unstated minimum introduced by this evidence branch.

4. **Repair readiness coverage with the same final domain rule.** Probe all 3 stories × 3 shapes and supported pitch bands, with first/additional-layer boundaries and each offered price option/product. Select the active shape factor itself, not only material waste. Ensure the advertised readiness scope matches what was actually checked: a bad unprobed combination must not be hidden behind a live badge, and a supported independently priced selection must not be represented as unpriced merely because another selection fails. Keep the existing distinction between owner preview and live customer eligibility.

5. **Plan history and approval compatibility before changing arithmetic or bounds.** Current saved-configuration receipts bind engineVersion plus content digest. Editing a factor makes the content digest stale; explicit reapproval makes the receipt current but does not prove its calculations safe. The synthetic test demonstrates both, and separately rejects a deliberately mismatched receipt version. No genuine historical-v7 record was manufactured or tested here. The starting-value definition signature omits min/max, so changing a bound alone does not automatically obtain a new source/assumption confirmation. A raw unchanged saved content digest also does not identify a changed pricing formula.

The customer receipt verifier reruns the current calculator and compares the result exactly ([server/quote-engine-vnext/engine.js:1817](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/quote-engine-vnext/engine.js#L1817)–1850). Changing cents or line representation in place can invalidate previously issued evidence even when the saved configuration is unchanged. Preserve historical quote records, old factor values, explicit adoption mode, and frozen customer copy. Coordinate a versioned calculation reader/migration and the approval policy with the coordinator; do not silently rewrite old receipts, reapprove owners, or relabel old quotes as recalculated. Existing public delivery copy reads frozen narration ([server/src/quoteEmailService.js:99](https://github.com/sportaholic000-hue/off-the-clock/blob/1857b7779b83b70f7753b41b72c3677270cd4ffc/server/src/quoteEmailService.js#L99)–104); leave that existing frozen copy alone. Version-bump scope needs review because the current app checks one global engine version for saved approvals. This branch changes no version.

Minimum acceptance evidence for the future repair: both failing coordinator tests become READY at their exact literal cents; all currently working≥1 cases and legacy0.5 remain exact except the explicitly corrected decimal-subtraction cases; all 81 combined-domain cases follow the owner ruling; half-cent signed/grouping expectations are explicit; both saved current/noncurrent receipt paths, historic replay and customer privacy pass. Coordinate with, but do not fold in or edit, the separate zero-adjustment repair.

## Commands and observed results

Node 22.23.3 was installed with only the dependencies needed by the real bridge inside this directory’s ignored runtime. The module-resolution hook changes test-process dependency lookup only; it does not mock production logic or edit module paths on disk. SQLite and books are disposable files inside that runtime. No repository-root npm install, package change or lockfile change was made.

| Command / execution | Exit | Printed tests / pass / fail / skip / cancel / todo |
| --- | --- | --- |
| npm install --prefix D/runtime --no-save --no-audit --no-fund node@22.23.3 | 0 | No test counts printed |
| Isolated runtime dependency installation, then exact locked JWT/Express addition | 0 | No test counts printed; stdout/stderr preserved |
| python3 D/prepare_expectations.py (first and ID-only revision) | 0 | 205 independent expectations; engine calls 0 |
| NODE --import D/runtime-bootstrap.mjs --test --test-reporter=tap D/reproduce.mjs | 1 | 3 / 1 / 2 / 0 / 0 / 0 |
| NODE --import D/runtime-bootstrap.mjs D/sweep.mjs (first and ID-only revision) | 0 | 205 observations each; both range-comparison executions complete |
| NODE --import D/runtime-bootstrap.mjs --test --test-reporter=tap D/rounding-reproduce.mjs | 1 | 3 / 1 / 2 / 0 / 0 / 0 |
| Application first attempt: missing isolated JWT dependency | 1 | 1 / 0 / 1 / 0 / 0 / 0 |
| Application second attempt: direct-call month mismatch | 1 | 10 / 8 / 2 / 0 / 0 / 0 |
| Application next attempt: raw-row engine input / preview assumption | 1 | 10 / 7 / 3 / 0 / 0 / 0 |
| NODE --import D/runtime-bootstrap.mjs --test --test-reporter=tap D/application.mjs (confirmed) | 0 | 10 / 10 / 0 / 0 / 0 / 0 |

Here D is `verification/qe-roof-factor-bounds-review-20261018`, and NODE is `D/runtime/node_modules/node/bin/node`. Exact command arrays, durations and exits are retained in `execution-*.json`. The arithmetic and application setup errors were investigated and preserved, not erased; see `EVIDENCE-CORRECTIONS.md`. The final ten passing application assertions document existing inconsistent states; they do not mean the product defect is fixed. Four intended regression assertions still fail. All TAP runs report zero skips/cancellations/TODOs. Runs overlap and counts must not be added as distinct coverage.

| Final205-observation sweep | Count |
| --- | --- |
| observations | 205 |
| accepted | 151 |
| rejected | 54 |
| ready | 48 |
| review | 157 |
| acceptedButReview | 103 |
| readyWithAmountMismatch | 2 |

Of 151 accepted-factor observations, 103 return review; 82 have positive aggregate installation, 6 zero and 15 negative. Of 48 READY observations, 46 match the independent exact-cent expectation and 2 expose the rounding defect. The 54 rejected observations match the independent type/range expectations. The 81 grid cases overlap named anchors; 205 is an observation count, not 205 unique real-world scenarios.

First expected JSON SHA256: `a7b2b2ac14699f71cb53c8969588c57715b3bb14fe518a5c8ff33505521363d0`. Final ID-disambiguated expected JSON SHA256: `39cbe432d57f2e875d91889e477eafbbf6170d39e0fb0e04122551cced185f59`. All205 inputs and monetary/domain expectations were compared byte-structurally after excluding the ID; they are unchanged. `SHA256SUMS` binds evidence files; `source-hashes.json` binds the inspected source to the exact base.

NOT RUN: a production repair, shared/full/strict regression gates, build, browser, HTTP server, complete phone conversation, hosted CI qualification, real supplier/job calibration or production deployment. These were not required for the scoped read-only investigation and are not claimed as passed or environment-blocked. The preserved targeted evidence covers actual validators, calculator, real disk save/approval/readiness, intake, customer application projection and owner preview. Static source tracing covers HTTP and voice entry points. Any automatic workflow after push is not substituted for these findings.

## Reproduction and publication

Recreate the isolated runtime versions recorded in `runtime-versions.json` under D/runtime; run the portable commands above from the repository root. The expected files are already frozen, so regeneration is unnecessary. Expected failures are exit1 and must not be added to an ordinary passing test selection as if they were fixed. No shared assertion, skip or known-failure allowance was modified.

Before publication, verify `git diff --exit-code 1857b7779b83b70f7753b41b72c3677270cd4ffc -- . ':!verification/qe-roof-factor-bounds-review-20261018'` and the changed-path allowlist. Final branch head, ancestry and report readback are checked after pushing; exact SHA is supplied in chat. This is an evidence handoff, not a release approval.
