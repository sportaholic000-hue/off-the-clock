# Codex handoff — QuoteDone correctness repairs and regression evidence

This replaces the earlier `Codex_Phase_2_Completion_Handoff.md`. The earlier audit and reproduction files are supporting evidence, not implementation instructions or approval to integrate. This handoff authorizes the isolated repair checkpoint below; it does not authorize production integration.

## Project and starting state

Continue Off The Clock AI in `sportaholic000-hue/off-the-clock`.

- Production branch: `main`.
- Existing isolated candidate branch: `codex/quote-engine-vnext-audit`.
- Previously inspected candidate SHA: `6036cdb57231993ab0f11f790d366c0cf825457d`.
- Main SHA observed during that inspection: `ed12dca1253a8790c885b071ab6037e05632bea0`.

Verify the actual current heads and working state. These are historical reference points, not instructions to reset. Preserve newer commits and legitimate uncommitted work. Do not reset, discard, overwrite, merge, or rebase unrelated work.

Read the project instructions, all governing specifications/build records, and candidate documentation before editing. Read the earlier audit as a set of findings to check against actual source and execution, not as an infallible verdict. Its executed examples were extracted-helper demonstrations, not a full repository test run.

## Acceptance target

**100% accuracy for every customer-ready quote.** Every released price must correctly apply the business's approved pricing to sufficient, confirmed job facts and the complete selected scope. A passing test suite demonstrates the exercised cases; it does not, by itself, establish universal correctness or authorize customer release.

When required information, a price, or a supported calculation model is unavailable, return review without a customer price. Preserve the request and actionable reasons. The eventual integrated product must save that outcome as a complete, actionable lead for the correct business.

Do not meet the no-wrong-quotes requirement by making previously valid supported jobs return review. Positive quoting capability and correctness must both be preserved, except where an explicit current owner requirement invalidates an older behavior.

## Locked product behavior

The current owner requirements supersede contradictory historical assumptions and test expectations. A prior document calling something an “owner ruling” is not sufficient authority when it contradicts the current instructions.

### Owner-controlled pricing: no arbitrary markup cap

There is no arbitrary commercial maximum for markup—not 100%, 1,000%, or a replacement limit elsewhere. Do not ask the owner to reconfirm that decision.

For eligible cost C and owner-entered markup percentage m:

**Selling amount = C × (1 + m / 100).**

On a $100 eligible cost, 100% markup means $200; 150% means $250; 1,200% means $1,300. An entered customer selling rate must not receive an unintended second markup.

Gross margin is a different quantity. Do not implement unrestricted markup by allowing 100% or more inside the existing gross-margin division formula. Do not silently reinterpret, relabel, delete, or migrate existing true gross-margin configurations. For example, 50% gross margin on $100 cost means a $200 selling amount, whereas 50% markup means $150. The later application migration must preserve verified intended prices or obtain owner reconfirmation of genuinely ambiguous data.

“Markup on cost (%)” is the proposed primary owner-facing label for that markup behavior. Do not treat this proposal as permission to redesign the editor or silently convert saved settings during the isolated checkpoint.

Keep numerical integrity checks. If a particular calculation cannot be represented exactly within the implementation's supported monetary precision, do not clamp the percentage, substitute another value, hide the problem in a range, or release an inaccurate price. Distinguish the technical failure from an arbitrary business pricing limit.

### Other invariants

Use the correct business, service and approved price book; preserve measurement units and owner-entered rate precision; consume every selected scope item exactly once. Apply fees, markup, tax, minimums and ranges according to the explicit owner configuration and governing product rules.

A selected item must be priced, explicitly configured as free/included under a supported owner pricing contract, or cause review. Missing is not free. A disclaimer excluding requested work is not an accurate quote for the complete requested job.

Customer-visible numbers must preserve the financial rules, including minimums. Customer outputs must not expose private costs, rates, markup settings or calculation evidence. Owner previews must not activate an offering or make an unapproved result customer-eligible.

Preserve main's established master-toggle behavior: ON means AI answers every call; OFF means calls ring the business line. Do not restore coverage-hours gating.

## Authorized checkpoint: repair and prove the isolated candidate

Implement bounded corrections to the existing candidate and its necessary tests/documentation. Preserve its working calculation method and existing justified safeguards. This is not authorization for a rewrite, unrelated refactoring, new trade-pricing models or a redesign.

Do not change production quote routes, the routed legacy engine, live price books, UI behavior, provider connections, dependencies, machine configuration or CI/workflow rules in this checkpoint. Do not connect VNext to customer traffic or relax its production-isolation check. Do not install, authenticate, reconfigure or switch tools without explicit permission.

Independently reproduce the following candidate findings before changing their behavior:

### A. Markup restrictions and pricing-model consistency

The previously inspected candidate rejected ordinary markup above 1,000% in more than one validation/evidence path. Its historical discussion also conflates the unrestricted owner-markup requirement with gross-margin restrictions.

Required outcome: safe finite nonnegative markup values are not rejected simply for exceeding a commercial percentage threshold. Calculation, owner preview, candidate price-book quoting, activation, evidence validation and customer projection must agree. Preserve true gross-margin semantics for existing explicit configurations without using them to limit markup.

Use independently written expected amounts for normal values and values below, at and above the former boundaries. Include values above 1,000%, not just 100%. Test technical overflow separately; an overflow control is not a business-policy cap.

### B. Missing prices for selected scope

The inspected candidate could omit selected lawn bagging/clipping disposal, lawn edging, or a flat-roof ponding surcharge and still return a ready quote. Some existing tests intentionally accept that older behavior.

Required outcome: missing selected pricing causes review, with the selected scope and precise missing information preserved. Explicitly supported included/free selections remain distinguishable from absent pricing. Fully priced selections still quote and are charged once. Check differing tier configurations without silently returning an incomplete option.

Do not remove the affected scope, clear its selection, assume it is included, or merely change the exclusion message to make this pass.

### C. Customer-visible minimum violation

The extracted formatter demonstration used an internally valid $200.01 customer minimum, $200.01 low/mid, $220.01 high and 10% buffer. It displayed $200 / $200 / $221, placing the low and midpoint below the minimum.

Reproduce this through actual candidate quote generation and its customer projection. If the full path behaves differently, report the exact distinction rather than claiming a full-engine reproduction from the helper alone.

Required outcome: the delivered customer amounts satisfy the correct customer minimum for the configured tax mode. Preserve range ordering and applicable display behavior for exact prices, free offerings, positive sub-dollar amounts, percentage buffers and monetary boundaries. Do not raise owner rates or remove the minimum to accommodate formatting.

## Regression evidence required for every correction

Capture the actual starting SHA, modified-worktree state and baseline test results before editing. Separate pre-existing failures from newly introduced failures; do not attribute baseline failures to a repair without evidence.

For each finding, retain the complete reproducing request, starting result, and independently calculated or logically specified expected outcome before changing the implementation. Do not obtain expected monetary values from the function being repaired or from a helper sharing its calculation.

After each bounded correction, demonstrate the repaired case, negative controls, nearby boundaries and ordinary supported quotes. Compare unaffected cases against the baseline: prices, scope, eligibility, tier behavior, privacy and review outcomes must not change without an explicit requirement and explanation. Exclude incidental generated identifiers from comparisons, not substantive behavior.

Then run the existing relevant candidate and regression suites together, including isolation verification. Do not delete or weaken a failing test merely to produce a green run. Where an old expectation contradicts the current owner requirement, identify that contradiction and replace it with an independent test of the correct behavior while retaining its meaningful boundary and safety coverage.

Financial controls must exercise cost versus sell-price treatment, markup applicability, tax modes, minimums, fees, tiers, included/free items and ranges where affected. Inputs or selected prices that change must invalidate stale approvals when the existing contract requires it. Internal and customer projections must agree on eligibility and delivered amounts.

A newly found material defect in this authorized scope must be reported and reproduced, not hidden to finish the checkpoint. Do not expand into unrelated work or resolve a genuinely new trade-pricing ambiguity by inventing a formula.

If execution is blocked, report the exact command and error. Do not repair the environment without permission, substitute a prose claim for execution, or cite earlier test counts as final-SHA results.

## Integration backlog retained — not authorized for implementation in this checkpoint

These prior source findings must remain in the handoff for the subsequent application-integration stage. Reproduce them against that stage's actual starting source; do not claim they are fixed by isolated candidate changes.

1. **Unit-rate precision:** the existing application converter changed $0.005 per square foot into $0.01. At 10,000 square feet the base changes from $50 to $100. The integrated path must preserve supported precision through input, save, reload, approval, preview and quoting. Measurement meaning must also survive migration; floor area and wall area are not interchangeable.
2. **Disabled intent:** existing application status/save behavior can treat complete pricing as enabled and overwrite a disabled state. Readiness, approval, owner enablement and support for the requested job must agree without preview activating anything.
3. **Permissions:** the calculation route accepts staff while request-controlled callerType can select owner output. Trusted identity must determine permissions and projections. Customer/staff requests must not acquire private owner pricing by omitting or forging that field. Tenant isolation needs independent verification.
4. **Durable review leads:** a pure payload or quote-log entry is not an actionable lead. The integrated outcome must retain supplied contact/location, service, selected scope, measurements, uncertainty, urgency and useful internal context; survive retries without duplication; appear to the correct owner; and acknowledge receipt only after successful persistence. Missing contact data must be explicit, not invented.
5. **Stale previews:** delayed responses from older requests must not overwrite the quote for the currently selected service, inputs and price-book revision. Verify this in the browser during the application stage.
6. **Migration and coverage:** preserve saved prices and approvals non-destructively. Report supported and review-only scopes honestly. Do not force automatic prices for currently unsupported jobs or use the old engine as a silent fallback when VNext rejects a request.
7. **Branch/release checks:** preserve newer work and main's master-toggle rule during an explicitly authorized reconciliation. Integration requires its own applicable regression/build/browser/CI evidence; the present isolation gate must not be weakened merely to declare this checkpoint finished.

These are finite required outcomes, not permission for another open-ended audit or a full CRM, billing, telephony or UI rebuild.

## Delivery and stopping condition

Return one reviewable isolated candidate with:

- Exact starting and final SHAs, affected scope and actual changed files; do not reset legitimate work merely to obtain a clean baseline.
- Each reproduced defect, independently expected outcome, before/after evidence and unchanged-behavior regression controls.
- Actual final candidate/regression/isolation results, failures, skipped or unavailable checks, and logs attached to that exact source state.
- A supported/review-only capability summary and explicit remaining blockers.
- Updated candidate documentation that no longer represents arbitrary markup caps or omission of selected scope as approved behavior.
- The bounded application-integration assignment needed next, identifying how the remaining quote-or-lead outcomes will be verified.

**Stop after delivering this evidence for independent review. Do not automatically begin application integration, migrate real pricing, merge into main, deploy, or declare Phase 2 closed.** Candidate regression success and end-to-end release readiness are different gates. The integration gate follows once the repaired candidate has been reviewed; it must not be bundled into an unverified repair sweep.
