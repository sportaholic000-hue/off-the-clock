# Fencing and painting completion — starting evidence

Fencing and exterior painting do not yet issue automatic prices. Interior painting issues prices for supported good-condition measured jobs, but fair/poor preparation remains unavailable. This is a reproduction checkpoint, not a repair or completion claim.

The owner made completing these quote paths the highest priority on September 29, 2026. That authorizes the necessary engine work and supersedes the earlier engine freeze for this work. It does not authorize invented prices or trade rules, unrelated voice implementation, live-data changes, provider operations, deployment, merge, or permission expansion. No subagents are used.

## Preserved starting source

- GitHub branch: `codex/quotedone-audit-repairs-20260927`.
- Starting HEAD: `e7f216804516f5bad4c28a2f78d0ee72cc50d11a`; existing PR #3 remains draft.
- Engine tree: `dcd481193b10c3cfc667cb23d22fb41b16322cff`, all 19 files unchanged at this checkpoint.
- Original voice guide blob: `7329bde3db8e3b38916e1cd6fbe1ca3fffaffaa5`, unchanged.
- A separate source copy preserves the Calendar work and other application repairs. This checkpoint changes only verification and documentation.

## Reproduced application behavior

Ten complete input variants were submitted through owner preview, authenticated calculation and public submission: 30 observed responses. The two submission routes created two quotes and eighteen review leads. Owner preview created no customer record. Full requests, responses, books and stored records are retained in isolated synthetic evidence.

| Case | Preview, authenticated and public result |
|---|---|
| Interior painting, good condition | $1,650 instant estimate |
| Interior painting, fair / poor condition | Review, no price |
| Exterior painting, good / fair / poor condition | Review, no price |
| Fence installation, zero / one gate | Review, no price |
| Fence replacement, zero / one gate | Review, no price |

The interior control was specified independently before execution: 500 measured wall square feet × 2 coats × ($1 labor + $0.30 materials), plus 200 trim feet × ($1.25 labor + $0.50 materials) = $1,650. These are synthetic test prices, never defaults for real businesses. Markup, taxes, fees and range are explicitly zero in this control.

Both fence fixtures had no missing or invalid existing owner price fields. Their reviews were caused by the engine's unresolved post-quantity, footing/digging allocation and selected-gate width rules. The painting material rates were explicitly classified as selling prices, so these cases were not accidentally blocked by purchase-cost classification. The review outcomes confirm the functional gaps; they do not count as successful delivery of automatic quoting.

The first run used an older test-account helper and stopped at a 403 because registration now requires a paid entitlement. That setup failure is retained. The corrected run uses the existing isolated synthetic paid-account helper; no production permission or billing behavior was changed. A subsequent run added explicit assertions for all owner-preview results as well as both submission paths and passed.

## One pending product choice

The original specification uses floor-area interior painting rates and a length/corner/gate estimate for fence posts. The later accepted engine uses measured wall-area/per-coat painting rates and rejects inferred fence post counts. Old rates cannot be silently reassigned to different units.

The owner has been asked whether to add owner-defined complete installed rates alongside itemized pricing: for example, an installed fence price per foot with standard posts and footings included, with gates/removal separately priced, and similarly defined painting offerings with preparation/primer inclusions. The alternative is itemized measured-component pricing only. No answer has been assumed and no new pricing mode has been implemented.

This is a pricing-design question, not another request for permission to repair the engine. Repository AGENTS.md says, “Where a spec is ambiguous, stop and ask one specific question.” Work that establishes the original behavior and preserves evidence proceeded while that answer was pending.

## Completion checks to perform after the choice

1. Implement supported complete fencing and painting offerings, with explicit owner-entered rates, units and inclusions. Preserve already-working interior painting and all unrelated arithmetic behavior.
2. Specify independent expected prices before execution; exercise normal jobs, gates/removal, applicable preparation/primer, and missing or contradictory selected scope.
3. Verify price-book entry, save/reload/approval, preview, public and authenticated quoting, customer interface and persisted records.
4. Recheck precision, markup/tax/minimum behavior, contact, editable rejection/retry, partial-work disclosure, permissions and tenant isolation; run final source-bound engine/application regressions and integration checks.
5. Save and read back the implementation and evidence on GitHub. Keep PR #3 in draft. Passing checks establish the tested cases, not universal real-world accuracy or public-launch acceptance.

## Reproduce this starting evidence

From this source with the already-installed dependencies and Node 22.23.2:

```text
node verification/quotedone/run-resume-check.cjs fence-paint-before ../fresh-evidence verification/quotedone/fencing-painting-baseline.mjs . ../fresh-evidence/application
node verification/quotedone/run-resume-check.cjs fence-paint-boundary ../fresh-evidence verification/quotedone/resume-integration-boundary.mjs .
```

Use a fresh evidence directory and write-once labels. The wrapper disables live provider operations and uses only a synthetic test database. The old frozen-boundary check applies to this unchanged starting checkpoint; an authorized engine implementation will need a new explicit source-bound check while retaining the unrelated voice, dependency and application-boundary protections.
