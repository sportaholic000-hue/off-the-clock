# Isolated VNext Repairs 139–146

Frozen starting SHA: `0242784d5835ee2f0ca6f0c5c1c8098a2f0a3e8f`, on `codex/quote-engine-vnext-audit`. Starting worktree was clean. Repairs 1–138 were retained; this pass changes only the requested verified findings and their necessary regression controls.

Immutable engine version: `quote-engine-vnext-r139-146-20260910-v1`. Git delivery SHA is reported separately. This is an isolated candidate for independent audit, not production readiness or cutover approval.

## Governing rules and current contract

The explicit owner request for Repairs 139–146 supersedes older candidate descriptions where they conflict. It implements the no-guessing and exact-evidence requirements in `specs/quote_engine_v2.md`, together with the previously settled zero-price, range-display and margin rulings. No pricing allocation, migration, authenticated adapter, or external persistence contract is invented.

- `confirmedFacts[field]` has exactly `{status: 'identified', field, value, offeringId}`. All four values must match the exact selected field/value and its explicit owner registry UUID. UUIDs are unique, case-insensitively, within each selector registry. Different selectors may maintain separate registries. Two-key historical confirmations require fresh confirmation; they are not upgraded from price-map keys.
- Persisted `service.id` UUIDs are unique, case-insensitively, across the entire owner price book. Both colliding records receive exact `services.<index>.id` diagnostics. Existing duplicate-type/name ambiguity checks remain.
- Missing or malformed owner registries stop comparison against the affected customer fact. A valid registry with a missing/mismatched fact is a customer verification issue. A priced value omitted from the registry is an owner inconsistency; an unregistered value without a matching configured price is an unsupported offering. Independent missing measurements still retain their own diagnostics.
- Configured-service leads require the exact selected identity in `request.ownerPricing.id` or `request.serviceId`; if both are supplied, both must match. Missing/ambiguous lookup reviews deliberately carry `serviceId: null` and `serviceResolution: {status: 'missing' | 'ambiguous', serviceId: null}`; lead requests must explicitly name null. Arbitrary malformed lookups and configured-service reviews cannot use that exception.
- `zeroPricePolicy.includedPrices` preserves financial category and effective price basis. The covering price must be required for the selected scope and produce an actual positive billed component in the same category and basis. Dormant prices, minima, or a positive configured rate rounded to no billed charge cannot cover another component. No cross-category or cross-basis allocation contract currently exists; these selections review. Bare structural price validation alone is not an allocation approval: actual template categories are checked at calculation, including direct calculator, quote, preview and activation.
- Internal zero reasons distinguish `explicitly_free`, `included_in_another_price` with `includedInPricePath`, `zero_physical_scope`, and `rounded_fractional_cent`. Existing zero-percentage/zero-basis reasons remain. Composite components retain their own classifications. Explicit zero decking count retains a zero line when a configured unit price is available; no rate is invented when absent.
- Ready root `calculationRecord.financialInputs` retains the complete validated `businessDefaults`, `feeSelections`, and resolved `currentMonth`. Together with ownerConfiguration and submittedCustomerInputs, these reproduce every valid option and financial result. Sanitization regenerates through the owner calculation path and compares full options, evidence, lines and customer projections, in addition to all earlier evidence checks. The recomputation has no caller-supplied bypass.
- This is binding to the retained configuration, not authentication. A client allowed to replace all retained source configuration and financial inputs can submit another self-asserted request. Protected owner configuration, authenticated fee approvals, tenant authorization and trusted persistence remain integration obligations.

Internal integer-cent calculations, outward whole-dollar range display and all safe gross margins below 100% remain the settled behavior. Customer output still contains only the existing explicit allowlists; owner paths, IDs, configuration and financial evidence stay private.

## Reproduction and regression evidence

Complete baseline requests, internal results and separately sanitized results were captured at the frozen SHA before source edits. Tests below are named `repair 139:` through `repair 146:` in `test/quoteEngineVNextRepairs.spec.js`. Each current quote control inspects the returned internal object and its independently sanitized projection. The instrumented replay additionally traverses every returned field, checks customer allowlists, and captures all instrumented calls and source hashes.

| Repair | Frozen execution / classification | Corrected and negative controls |
| --- | --- | --- |
| 139 | Same UUID for asphalt_shingle and materially more expensive metal; changing only replacementRoofType while retaining the asphalt fact returned ready, including customer projection. Proven selector-identity defect. | Duplicate UUIDs, including case variants, block quoting and activation at both exact registry paths. Unique registries with matching facts quote. Changing only value, field or UUID reviews; a price-map alias cannot inherit confirmation. Source: contracts.js offeringRegistryDiagnosticsVNext/validateCustomerInputs; priceBook.js activation facts. |
| 140 | Different built-in types sharing one UUID validated successfully. Differently named CUSTOM services already reviewed for unresolved custom allocation, but had no ID-collision diagnostics. Proven identity-validation gap, not a new CUSTOM execution bypass. | Both built-in and differently named custom collisions report both exact id paths. Unique built-ins validate. Approval, zero policy, quote and lead retain the selected ID. Source: priceBook.js duplicateServiceIdDiagnostics and book/quote boundaries. |
| 141 | Removing the selected registry returned owner missing-field and customer invalid-fact/inspection blame together. Proven diagnostic-ownership defect. | Missing registry is owner-only; existing registry plus missing confirmation is customer-only; missing registry entry with configured price is owner inconsistency; no registry entry or price is unsupported offering. Unchanged known selection quotes. Source: contracts.js validateCustomerInputs and hasSelectedOfferingPriceVNext. |
| 142 | Configured review A accepted a request omitting identity. Request naming ownerPricing B was already rejected by the existing ownerPricing/result service-ID comparison. Proven omission gap; B was already guarded. | A succeeds, B or omitted identity rejects, including conflicting dual identities. Explicit missing/ambiguous lookup null succeeds; fabricated configured null does not. Repair115 and earlier lead fixtures now include the configured identity. Source: engine.js leadServiceIdentityMatches/buildInternalLeadVNext and priceBook.js serviceLookupReview. |
| 143 | Zero material included in labor, and the inverse, returned ready under all three tax modes. Material-in-labor could show zero material taxable basis. Proven financial-classification gap; the true missing tax amount cannot be claimed without an approved allocation. | Same-category ceiling material included in wall material quotes with the covering path. Both cross-category directions review under TAX_NONE/ALL/MATERIALS, activation and direct calculation; separately priced controls quote. Same-category but different-basis inclusion reviews; changing only the category basis to match quotes. Independently calculated control totals below; -1/0/1 ceiling-material rate controls distinguish invalid price, included zero and separately charged material. Source: templates.js recordNoChargeClassification. |
| 144 | Metadata named nonexistent finishLaborMultiplier and omitted disposal fields for siding removal and concrete demolition. Proven metadata divergence. | Exact finishMultiplier plus exposedAggregateMaterialPricing decision; exact removalPerSqft/disposalPerSqft and demolitionPerSqft/disposalPerSqft pairs. Review-only metadata is checked against actual gates, ordinary mowing is a negative control. Source: priceBook.js reviewOnlyScopesVNext. |
| 145 | Fully rebuilt core-rate, markup and tax forgeries retained the original ownerConfiguration yet sanitized ready. Proven configured-price binding defect, beyond arithmetic consistency. | Fully rebuilt core rate, multiplier, markup, tax, travel fee and seasonal-month forgeries now sanitize review with original retained configuration/financial inputs. Missing/malformed financial inputs review. Unchanged cloned result remains ready. Source: engine.js configuredCalculationMatches and retained financialInputs. |
| 146 | Included zero used configured_zero_price, indistinguishable from free; explicit zero decking count omitted its line. Proven internal-evidence divergence. | Included ceiling material, explicitly free wall material, zero decking scope and positive sub-cent mowing charge have four distinct private reasons. Covering path is retained. One-sheet positive control has a charge and no zero reason; public projections expose none of these private paths. Source: templates.js line constructors/finalizer, engine.js evidence validation. |

Existing numeric tests that used synthetic cross-category inclusion have explicit positive component fixtures or now assert review. Their numeric variables and independently expected boundaries are preserved. The branch matrix records positive-quantity consumed-price samples separately from zero physical scope. No production price was rewritten to make a test pass.

### Independent arithmetic

Repair143 uses confirmed 100 wall sq ft and 100 ceiling sq ft, one coat each. Labor prices are 100 cents per sq-ft-coat for each surface. Wall material is 50 cents per sq-ft-coat; ceiling material is explicitly zero included in the billed wall material, both material sell prices. Labor is cost with 20% markup; the only taxable category in the material-only control is material; tax is 10%; minimum is zero.

- Labor: 100 × 100 + 100 × 100 = 20,000 cents.
- Material: 100 × 50 + 100 × 0 = 5,000 cents.
- Labor markup: 20,000 × 20 / 100 = 4,000 cents.
- TAX_NONE: 29,000 cents.
- TAX_MATERIALS: 5,000 × 10 / 100 = 500 tax cents; total 29,500 cents.
- TAX_ALL: 29,000 × 10 / 100 = 2,900 tax cents; total 31,900 cents.
- Vary only ceiling material rate: -1 reviews; 0 uses inclusion and totals 29,500; 1 adds 100 material cents and 10 tax cents, totaling 29,610.

Repair145 base: 100 × 100 labor + 100 × 50 material = 15,000 cents. Changing only labor rate to 200, or wall-height factor to 2, produces a separately valid 25,000-cent quote; changing only markup to 50% yields 20,000; TAX_ALL 10% yields 16,500. Those legitimate alternate requests become forged evidence when their full calculated output is substituted while retaining the original inputs. Travel fee 100/200 gives 15,100/15,200; in-season labor surcharge 10% gives 16,000 versus 15,000 out of season.

Repair146 rounding control uses one measured mowing sq ft at 0.01 cents/sq ft: exact 1/100 cent rounds to zero. The explicitly configured 100-cent service minimum supplies the nonzero quote. It is not labeled free. Holding scope and minimum fixed, rates 0.49/0.50/0.51 cents round to 0/1/1 cent. Zero decking uses exactly zero sheets × 5,000 cents; one sheet costs 5,000 cents. No measurement below the active contract minimum is used.

## Remaining owner decisions and review-only paths

All separate earlier decisions remain in [COMPLETION.md](COMPLETION.md#remaining-owner-rulings-and-affected-paths) and the six additional scope rows in [Repairs128–138](AUDIT_REPAIRS_128_138.md#remaining-owner-decisions-and-review-only-paths). They identify each service/path, current operational or monetary consequence, specification gap and one narrow decision. Maximum margin, range display, zero classification, no-guessing and the required category-preservation rule are settled.

Cross-category inclusion has one remaining implementation-dependent contract question: **What explicit allocation between financial categories and price bases does the owner's all-in covering price represent?** Current behavior is review for any selected included component whose covering billed component differs in category/basis, across all service calculators, quote/preview helpers and activation. No customer price is released. The current specs and includedPrices path map provide no allocation amounts or tax/markup treatment, so no monetary loss is invented and no allocation is implemented. Same-category and same-basis explicit inclusion is executable.

Remaining review-only scopes include all fencing, all custom and exterior painting; selected flooring stairs/non-vinyl underlayment/exact room thresholds; cost-based underlayment and paint without purchase-quantity contracts; fair/poor or mixed-zone interior painting; siding trim/removal; concrete demolition/exposed aggregate/unverified geometry; commercial flat-roof insulation; unconfirmed project facts, incomplete owner pricing and unsupported inclusion allocations. Unaffected supported scopes retain their existing calculations.

Unverified paths: independent external audit; real saved-book identity/origin/confirmation/zero-policy migration; authenticated owner actions and protected configuration/evidence; tenant authorization; complete lead persistence and save-failure handling; truth of real measurements and objective category definitions; UI/onboarding/dashboard flows; paused phone providers; deployment. These were not implemented or claimed verified.

## Verification procedure and delivery boundary

Run only the existing environment, without installing, rebuilding dependencies or changing configuration:

1. `node --test --test-name-pattern='repair (139|14[0-6]):' test/quoteEngineVNextRepairs.spec.js`.
2. `npm.cmd run test:vnext`.
3. `npm.cmd run gate:quote-vnext` (production-import isolation plus the same VNext suites).
4. `npm.cmd run phase1:test`.
5. `node --experimental-vm-modules test/quoteEngineVNextReplay.mjs <outside-repository-output-directory>`.

The replay is an instrumented regression replay, **not an independent external audit**. Final-SHA logs/totals, complete replay captures and source hashes are in the delivery evidence. Earlier failing runs and corrected fixture errors are retained there; they are not reported as passes. Any blocked command must retain its exact error without repairing the environment.

The final commit must contain only candidate source, tests and candidate documentation. No production engine/routes, integration, UI, telephony/SMS, dependencies, machine configuration, GitHub Actions, Phase0/client build or deployment work belongs to this pass. Stop after pushing the isolated snapshot for independent audit.
