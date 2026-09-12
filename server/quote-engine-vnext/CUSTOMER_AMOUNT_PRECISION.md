# Customer numeric-amount integrity repair

Frozen starting commit: 11d4ef70fae472b1f18168fa9ea9cc61c4b9a1f7 on codex/quote-engine-vnext-audit, clean worktree.

## Governing requirement and proven defect

The supplied Codex_QuoteDone_Precision_Repair_Handoff.md authorizes this bounded representation repair and supersedes the preceding evidence-only stop. QuoteDone_11d4ef7_Independent_Review.md identifies both error directions. The existing HANDOFF_ABC.md minimum-preserving display, AUDIT_REPAIRS_147_150.md sub-dollar exception, integer-cent contract, and numeric public schema remain in effect. Historical nearest-$10 prose is superseded by those accepted display rules.

At 9,007,199,254,740,991 intended cents, division into a JavaScript dollar Number serializes as 90071992547409.9: one cent below the intended amount. At 7,036,874,417,766,401 cents it serializes as 70368744177664.02: one cent above. Retained calculation cents are correct. Repeated projections agreeing on the same wrong Number did not detect either error. These are synthetic technical-boundary cases, not claimed customer incidents.

The six failure controls are maximum business minimum with zero/tiny buffer, upward-error business minimum with zero/tiny buffer, maximum rate-derived total without a minimum, and maximum service minimum. The unchanged supplied 11 boundary requests and six narrowly derived additions were executed before editing engine.js. Complete requests, objects, wire JSON, independently parsed decimal cents and raw logs are retained outside the repository. This 17-case check is distinct from the separately referenced 22-case independent companion.

## Bounded source change

engine.js verifies every proposed public low/mid/high amount against its intended displayed integer cents. Its existing exactMultiply interprets a finite Number through its shortest decimal string, which is the decimal JSON.stringify emits for nonnegative finite numeric amounts. Exact fraction comparison against the intended cents detects the error without binary multiplication/rounding, epsilon, toFixed, or a second money schema. Independent regression oracles parse actual JSON decimal tokens using BigInt without importing these helpers.

Exact single prices and the existing cents-preserving exceptions compare to the original range cents. Ordinary ranges compare to the already established floor/nearest/ceiling whole-dollar cents; the calculation range is unchanged. The outward high remains subject to the existing safe monetary domain.

A failed conversion throws QuoteReviewError with ownerDiagnostics.kind customer_amount_representation, the customerProjection endpoint path, intendedCents, and serializedDollars. The diagnostic is technical; missingOwnerFields and invalidOwnerFields are not populated for this error. The existing owner review retains submitted scope and validated measurements. Customer review is the existing no-price allowlist. The existing tier catch keeps valid sibling options and its availability notice.

The same conversion guard is used by generation and by sanitizer reconstruction of each option's intended projection. Root values still bind to the first valid option; configured evidence still replays the original owner settings. Direct/live/preview and price-book paths retain their existing shared engine. No pricing formula, entered amount, markup/margin policy, scope validation, accepted composite classifier, schema, or production path changes.

ENGINE_VERSION advances to quote-engine-vnext-customer-amount-20260912-v1 to distinguish this output-integrity behavior. Frozen-result comparisons must verify every old/new version occurrence before normalizing only that identifier and generated quote IDs.

## Verification and evidence

Durable regression groups use the prefix customer amount precision:. They exercise both error directions, neighboring representable cents, service and business minima, rate-derived totals, more than one service, valid sibling tiers, missing-price negative controls, customer allowlists and repeated-projection tampering. Existing A–C and all-service financial tests remain.

Required final-commit commands are test:vnext, gate:quote-vnext, phase1:test and the existing selected instrumented replay, plus unchanged A–C requests against frozen 11d4ef7 outputs and retained pre-fix full internal objects against the new sanitizer. The delivery report records actual command timestamps, exit statuses, totals, tested SHA, and any blocked command. Historical passing counts are not final-commit evidence.

The handoff's precision-regressions.mjs and precision-cases.json were not present in either supplied QuoteDone ZIP, Downloads, or the supplied attachment directory when this repair began. The original 22-case companion cannot be claimed executed without those exact files. The separate 17-case evidence and durable repository regressions are not relabeled as that companion.

## Scope and remaining decisions

No new owner pricing decision is needed for this representation defect. The existing pricing-model and integration decisions remain as recorded in HANDOFF_ABC.md, COMPLETION.md and the historical repair ledgers. Ordinary markup, mathematically valid gross margin, free/included zero classification, complete selected scope and minimum-preserving display are settled.

Production engine/routes, integration, UI, onboarding, dashboard, telephony, SMS, deployment, dependencies, machine configuration and GitHub Actions are outside this change. No Phase 0 or client build is authorized here. This checkpoint awaits independent review; it is not integration approval or a universal-correctness claim.

