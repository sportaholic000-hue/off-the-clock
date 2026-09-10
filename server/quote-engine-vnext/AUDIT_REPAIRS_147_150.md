# Isolated VNext Repairs 147–150

Branch: `codex/quote-engine-vnext-audit`.
Frozen starting SHA: `47e88279d54e52e6af6f19a79e9df8dbe1231685`; clean worktree.
Engine version: `quote-engine-vnext-r147-150-20260910-v1`.

The latest owner repair prompt explicitly settles service-type identity binding, lowercase UUID equivalence, free-offering minimum bypass, the positive sub-dollar range display exception, and exact inclusion paths. These instructions supersede conflicting historical descriptions, including the earlier unconditional whole-dollar range rule. No additional owner decision was inferred. Repairs 1–146 and the accepted composite fractional-cent follow-up are preserved; `templates.js` is unchanged.

## Original reproductions and corrected behavior

Full baseline requests, internal results, separate customer projections and frozen source copies were saved outside the repository before editing. These are verified execution/validation defects under the owner's explicit rules, not new trade-pricing models.

| Repair | Original behavior at frozen SHA | Corrected behavior and responsible source |
|---|---|---|
| 147 | A MANUAL service with missing stored type or stored LANDSCAPING_SOD could quote a requested LANDSCAPING_MOWING scope using mowing prices. The customer sanitizer accepted it. Ordinary edits changed serviceType under the same ID/origin for MANUAL, AI_SUGGESTED and AI_INTERVIEW. AI mismatches already reviewed through approval checks, but lacked the required exact identity diagnostic. Tampering only ownerConfiguration.serviceType also sanitized ready for the manual control. Equivalent uppercase service/origin UUID text inconsistently reviewed. | contracts.js identityDiagnosticsVNext requires supported stored type, requested/stored equality, and origin.serviceType equality. The six-field receipt is serviceId, serviceType, source, ownerId, operationId, createdAt. engine.js generateQuoteVNext checks every source before quoting; rootCalculationRecordMatches binds retained configuration to result type. editVNextService rejects type changes; conversion must supply a new persisted ID/receipt. Canonical identity helpers normalize valid UUIDs across service, origin, approval receipts and their identity-bearing values, zero policy, registries and confirmed facts. Original submitted facts remain raw; calculation evidence is normalized. Price-book status/materialization and lead comparisons use the same equivalence. |
| 148 | Explicitly free zero-rate mowing, zero service minimum, 100-cent business minimum and no positive fees reviewed after the minimum added a charge. A free tier was omitted while its paid sibling quoted at the minimum. | engine.js optionRun resolves the explicit free designation per offering; runScenario/applyMinimum bypass service and business minima only for that offering. Internal minimum evidence retains both configured minima, configuredMinimumCents, bypassed=true, bypassReason=explicit_free_offering, effectiveMinimumCents=0 and adjustmentCents=0. Positive independent charges still review. Paid siblings keep ordinary tax/minimum order. |
| 149 | At 10% buffer, positive totals of 1/49/50/99/100/101 cents displayed respectively [0,0,1], [0,0,1], [0,1,1], [0,1,2], [0,1,2], [0,1,2] dollars. | engine.js displayedEstimates retains exact cents for all three endpoints when whole-dollar formatting would turn a positive endpoint into zero. Other ranges retain outward whole-dollar endpoints and nearest-dollar midpoint; existing exact-single output retains cents. Calculation and evidence amounts are unchanged. |
| 150 | Dormant maps accepted a misspelled source, misspelled covering path, other-service price, frequency factor and minimum as apparently valid included-price paths; direct results and customer sanitizer returned ready. | contracts.js supportedIncludedPricePath/includedPathDiagnosticsVNext validate each source/cover against the service's scalar or structured monetary contract and explicitly configured base/tier paths. Exact zeroPricePolicy.includedPrices.<source> diagnostics identify invalid mappings. Present dormant sources are checked against their effective tier's valid covering price; absent sources belonging to another configured tier do not invalidate an unrelated sibling. Existing billed-category/basis and selected-scope inclusion checks remain unchanged. |

The internal trade calculator validates measurements and pricing, but does not create a persisted quote. Repair147's identity boundary is the public quote/configuration contract; no claim is made that the low-level calculator now implements persisted-identity authorization.

## Regression controls and independent arithmetic

Six focused tests in `test/quoteEngineVNextRepairs.spec.js` cover:

1. Repair147 type agreement for each source, exact missing/mismatch paths, same-identity label edits, rejected type edits, fresh-ID conversion, and sanitized-result type tampering.
2. Repair147 UUID case equivalence changed one field at a time: service ID, origin ID, approval ID, zero-policy ID, registry ID and confirmed-fact ID. Invalid UUID and different-offering controls still review. Case-equivalent duplicate service/offering IDs remain collisions. Original submitted fact spelling survives independently of normalized calculation evidence.
3. Repair148 free/paid controls under TAX_NONE, TAX_MATERIALS and TAX_ALL, service minima 0/1/19,999/20,000/20,001 cents against a 20,000-cent business minimum, named free/paid siblings, and selected travel fee 0 versus 1 cent. A positive core charge under a free designation reviews. Public projections expose no policy or owner IDs.
4. Repair149 28 explicit cases: 1/49/50/99/100/101 cents with buffers 0/1/10/25%; 110/111/112 cents at 10% for immediately below/at/above the one-dollar-low display boundary; and the unchanged 1,000-cent whole-dollar control. Explicit free zero and unclassified zero are separate controls.
5. Repair150 misspelled source/cover, other-service and factor/rule/minimum paths; an unconfigured structured leaf; valid selected same-category/same-basis inclusion; and preserved cross-category review. Quote, price-book and status results are checked.
6. Repair150 dormant source configured only in one tier; that tier's covering price varied through -1/0/1 cent, preserving a valid sibling. Removing only the last configured source makes the mapping invalid.

Identity control: confirmed 100 wall square feet × one coat × 100 labor cents plus 100 × one × 50 material cents = 15,000 cents. A freshly identified mowing service uses 10,000 measured square feet × 1 cent = 10,000 cents. Identity case changes cannot change these totals.

Minimum controls use the same 15,000-cent paid base. The larger service/business minimum supplies the floor. TAX_NONE and the explicit nontaxable-category TAX_MATERIALS control total that floor; TAX_ALL adds 10%. At a 20,001-cent floor, tax is 2,000 cents after half-up cent rounding, total 22,001. A designated free offering with all zero charges remains 0 for every tested minimum, while the paid sibling at a 20,000-cent floor totals 20,000 or 22,000 depending on the tax mode. A 1-cent independently selected travel fee is not waived.

Range controls use one measured mowing square foot at the exact entered cent rate; no markup, tax or minimum. At 49 cents and 10%, the independently rounded range is [44,49,54] cents, displayed [$0.44,$0.49,$0.54]. At 101 cents and 1%, it is [100,101,102], displayed [$1,$1,$2]. At 110/111/112 cents and 10%, the lows are 99/100/101 cents: only the first range needs the sub-dollar exception. The tests' separate BigInt fraction oracle checks containment without floating-point multiplication artifacts.

Inclusion control: 100 wall square feet and 100 ceiling square feet, one coat each, labor 100 cents on each surface; wall material 50 cents and ceiling material explicitly included at zero. Labor 20,000 + material 5,000 = 25,000 cents. The dormant tier control leaves ceiling unselected: wall material covering prices -1 and 0 invalidate that tier; 1 cent yields 100 × 100 labor + 100 × 1 material = 10,100 cents, while its unchanged sibling stays 15,000.

Complete objects are traversed and independently sanitized in the focused tests and instrumented replay. The replay retains inputs/results and source hashes, checks exact scenario sums, and includes Repairs139–150 plus the accepted composite regression and service catalog. It is not an independent external audit.

Failed development iterations are retained in external logs: a misplaced low-level-calculator identity assertion, an incorrect ceiling line name, and a TAX_NONE fixture with nonzero taxPercent were corrected against the active contract. The first execution also exposed that the new canonical customer validator's result had not yet been used in the quote calculation record; optionRun now uses it. The first full suite also found Repair100's test changing a driveway fixture's type to patio while retaining its driveway receipt. That fixture now creates a fresh service/receipt for each concrete type, retaining its exact prices, inclusion map, dimensions and numeric assertions. No concrete source or arithmetic changed. These are not passed runs or extra claimed production defects.

## Remaining decisions and review-only paths

No new ruling is needed for Repairs147–150. Margin policy, zero classification, minimum bypass and the sub-dollar range exception are settled. Keep each existing unresolved decision separate:

- [Existing decision ledger](COMPLETION.md#remaining-owner-rulings-and-affected-paths): every service/path, current behavior/consequence, specification gap and narrow owner question.
- [Additional scope ledger](AUDIT_REPAIRS_128_138.md#remaining-owner-decisions-and-review-only-paths): stairs, siding removal, concrete demolition, commercial flat-roof insulation, exterior coating/preparation and mixed interior zones.
- [Inclusion allocation](AUDIT_REPAIRS_139_146.md#remaining-owner-decisions-and-review-only-paths): which explicit financial-category and price-basis allocation an all-in covering price represents. Unsupported allocations continue to review.

All fencing, custom and exterior painting remain review-only. Conditional review paths include flooring stairs/non-vinyl underlayment/exact room thresholds; cost-based underlayment/paint without purchase quantities; fair/poor or mixed-zone interior painting; siding trim/removal; concrete demolition/exposed aggregate/unverified geometry; commercial flat-roof insulation; missing or contradictory project facts; incomplete prices; and unsupported inclusion allocations.

Existing five-field origins lack serviceType and now review. This pass does not fabricate or migrate creation receipts. Protected identity creation, real saved-book migration, authenticated owner/tenant actions, lead persistence and save-failure handling remain unverified integration work. A pure engine cannot authenticate an attacker replacing an entire configuration and receipt; authenticated storage remains required. Real-world measurement truth, objective category definitions, unresolved trade contracts and external audit are not proven by these tests.

## Required verification and delivery

Use only the existing environment:

```text
node --test --test-name-pattern='repair (147|148|149|150):' test/quoteEngineVNextRepairs.spec.js
npm.cmd run test:vnext
npm.cmd run gate:quote-vnext
npm.cmd run phase1:test
node --experimental-vm-modules test/quoteEngineVNextReplay.mjs <outside-repository-output-directory>
```

The delivery report records final SHA, exact files, actual command totals, complete logs, replay captures and hashes. Earlier passing runs are historical. No blocked test may trigger an environment repair.

Push one isolated commit, then create `off-the-clock-<SHORT_FINAL_SHA>.zip` outside the repository with `git archive --format=zip --output=<outside-repository-path> <FINAL_SHA>`. The archive contains the exact committed tree, not uncommitted files or local dependencies.

Production engine/routes, integration, UI, onboarding, dashboard, telephony/SMS, dependencies, machine configuration, workflows, Phase0, client builds and deployment remain outside this pass. Stop after push and archive for independent audit; no production readiness is claimed.
