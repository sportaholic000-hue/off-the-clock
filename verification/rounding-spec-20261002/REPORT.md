# R5 — reconcile the active rounding specification

October 2, 2026. Documentation correction on PR #16 base
`883182a49e2dce64653b0473043be25bec8b4121`. R5 is resolved in this
checkpoint; the other pricing-policy questions remain open. No application
calculation, owner rate, stored price book, approval or customer UI changed.

## Conflict and correction

The governing `specs/quote_engine_v2.md` still instructed nearest-$10
rounding and historical automatic confidence widening. The September
minimum-display handoff and sub-dollar correction already documented
whole-dollar outward endpoints, nearest-dollar midpoint and exact-cent
exceptions. The active engine implements that display behavior and uses
the configured buffer directly. The October 1 ruling also protects the
pre-tax minimum in every tax mode.

The October 2 clarification and replacement STEP 9 now distinguish internal
integer-cent calculations from customer display, describe the configured
buffer and intrinsic custom ranges, specify the customer floor for each
tax mode, and retain exact-price, fractional-minimum, positive-sub-dollar,
explicit-free and unsafe-representation behavior. Seven independently
calculated examples make the contract reviewable. This reconciles existing
behavior; it does not choose a new pricing policy or change formulas.

Only the clarification and STEP 9 changed in the specification. Historical
legacy-engine test expectations remain historical; they are explicitly
distinguished from the active QuoteDone/VNext display contract. Historical
reports remain untouched, including their then-current counts and limits.

## Verification actually run

Node 22.23.2; synthetic local fixtures only; no provider calls or live data.

| Check | Result | Evidence |
| --- | --- | --- |
| Seven expected examples, recorded before execution | 7 passed | `examples.mjs`, `examples.json` |
| Existing VNext, adversarial, repairs, original hand-calculated engine, tenant/add-on, Opus repairs and quote-flow suites | 405 passed; 0 failed, cancelled or skipped; exit 0 | `regressions.tap` |
| Local runtime and existing test source against the exact GitHub base | All 217 inspected files unchanged | `source-manifest.json` |
| Existing independent fixture and three historical display/owner documents | Exact base Git blob hashes verified | `source-manifest.json` |

The seven examples assert internal cents, owner and customer output, each
option, numeric JSON round-trip values, the applied buffer and unchanged
request inputs. They cover an ordinary range, an exact price, a $402.50
minimum under all three tax modes, a $0.49 total, and an intrinsic custom
range with a configured 25% business buffer that must not be applied again.
For the TAX_MATERIALS example, the entire $100 base line is explicitly
classified as taxable material; its tax is $10, and the minimum adjustment
adds no tax. Expected values were not obtained from engine output.

The pre-edit specification was saved outside the repository. A historical
document byte check initially found an extra trailing newline in earlier
local evidence copies; the exact three files were fetched from the pinned
GitHub base and their blob hashes verified before use. Their substantive
display instructions agree. No product failure was inferred from that
local-copy difference.

Commands, from the repository root:

```sh
node verification/rounding-spec-20261002/examples.mjs
node --test test/quoteEngineVNext.spec.js test/quoteEngineVNextAdversarial.spec.js test/quoteEngineVNextRepairs.spec.js test/quoteEngine.spec.js test/tenantAddon.spec.js test/opusQuoteRepairs.spec.mjs test/quoteFlowRepairs.spec.mjs
```

No browser/build or full-application rerun was needed for this documentation
change. The 405-test result is the selected regression set, not a new
full-application result or a guarantee of complete engine accuracy. No
subagents, migration, merge or deployment. The separate six-item editor
repair has not been integrated or independently verified by this checkpoint.
