# Diagnosis and preserved unsuccessful executions

Base: `21f0ccf9ba3cd6859697483745bd4c8152274169`; evidence reference: `ebf2abd0b1912015f17b621b31b7ad5af0e351b2` (`verification/qe-roof-factor-bounds-review-20261018/`). No evidence branch was integrated.

The owner-confirmed decimal1.15 was subtracted with JavaScript `factor - 1`, giving0.1499999999999999. Converting that number to rational evidence could not recover the decimal intention. With a10-cent rate and one square the adjustment became1499999999999999/1000000000000000 cents rather than3/2, rounding down to1 instead of up to2. The same construction occurred in installation story, installation shape, first-layer story removal and additional-layer story removal.

The repair constructs `exactEvidence(exactSubtract(factor,1))` first and supplies that evidence to the existing line builder. Its numeric conversion is only the existing checked display value; multiplication reads the retained rational. Each adjustment remains a separate line. No arithmetic helper, negative guard, factor contract, selector, readiness check, owner rate or legacy formula changed.

## Original failures

`baseline.stdout.log` is the unmodified production baseline:26 tests,7 passes,19 failures, exit1. Two named anchor failures are25≠27 and24≠25. The grouping control passes at9. Other failures include exact-factor evidence mismatches even where rounded cents agree. `baseline-test-source.txt`, `observed-v9.json`, the independently written expectation files and source guard in `capture-v9.mjs` preserve provenance.

`integrated-first.stdout.log`:222 tests,218 passes,4 failures, exit1. These four failures came from the new test asserting internal runtime error names against the public dispatcher error **message**. Inspection of `toolDispatcher.js:158` confirmed it deliberately converts the internal exception to `TOOL_EXECUTION_FAILED`. The corrected test checks that actual public error code; it still requires refusal of a fresh changed request while approval is stale, with no acceptance of alternate success states. The original test source is retained as `integrated-first-test-source.txt`. No production change was made in response. The subsequent focused252-test run passes.

Local browser execution cannot start Chromium: executable absent. Preserve the failed TAP and mark browser behavior NOT RUN locally, rather than count it as passing. Docker's executable is absent (`spawn docker ENOENT`), so local Docker smoke is NOT RUN. Broad local suite attempts are preserved separately; their complete totals are recorded in REPORT.md when available. Hosted execution supplies browser and Docker evidence only after actual final-SHA logs are read.

## Historical boundary

`quoteDoneRoutes.js:118–130` returns the persisted widget response on a matching request digest, before loading/currently calculating the book. `voiceToolRuntime.js:403–418` resolves the original receipt before revision/readiness/current calculation. The dispatcher also has persisted tool-call idempotency. These are the existing historical boundaries. `configuredCalculationMatches` in the engine verifies **current** internal results by recomputing; it is not the historical replay path.

Four actual v9 configurations were explicitly saved/approved and quoted through the widget submission handler and the real voice dispatcher on the pinned base. Full synthetic rows, public responses and voice wording are frozen in `historical-v9.json` (eight original submissions). They are not hand-authored or v10 calculations relabelled as v9. The v10 regressions seed those rows into disposable SQLite and keep the synthetic clock fixed so opaque-handle expiry does not confound arithmetic-version replay. They verify original and fresh tool-call IDs, entire immutable quote/submission/narration/original-idempotency rows, stale ordinary read/save, explicit reapproval, corrected new requests and zero provider sends. This is handler/dispatcher orchestration evidence, not rendered-widget, model comprehension, ASR or a live conversation proof.

The separate below-one policy, readiness coverage and metadata matters remain outside this repair. No historical receipt is re-priced, migrated or overwritten.
