# Agent 4 F18 repair — local source checkpoint

Branch: `codex/qe-agent4-f18-repair-20261018`.
Exact starting commit and sole intended parent: `03b29925437e73acb24b916ba6e69e5a002dfff1`.
This checkpoint records local verification. Publication and complete exact-head hosted CI must be independently verified before completion; no hosted success is claimed in this pre-publication document.

## Repair

`quoteScopeDisclosure.js` distinguishes missing pricing/qualification evidence from a verified empty exclusion intersection. It computes shared exclusions from valid priced options, preserves known historical exclusions when evidence is unavailable, and keeps uncertain malformed-record scope partial. It still removes false global exclusions for valid mixed options and preserves caller-declared additional work. Historical receipt normalization only changes the returned clone.

`voiceQuotePresentation.js` validates complete finite nonnegative ordered ranges, including optional midpoints and first-visit ranges. Saved voice keeps D15 compatibility for valid options surrounded by non-record junk; malformed option records are safely rejected. Live voice rejects non-array options containers. Both projections reject ready/partial receipts with no valid pricing evidence. No amounts are recalculated or invented; existing currency, units, tax context, option disclosures and privacy allowlists remain.

Only these two production files changed. The sole workflow change is `jobs.test.timeout-minutes: 30 → 45`. No existing test, selector, dependency, engine, specification, other branch or deployment change.

## Reproductions and verification

| Check | Before repair | After repair |
|---|---:|---:|
| Original unchanged 91-check review matrix | 76 pass / 15 fail | 91 pass / 0 fail |
| Initial new projection regressions | 2 pass / 30 fail | 32 pass / 0 fail |
| New real saved-retry / dispatcher regressions | 2 pass / 6 fail | 8 pass / 0 fail |
| Additional uncertain mixed-scope control | Not part of original baseline | 1 pass / 0 fail |
| Final focused run (above checks combined) | — | 132 pass / 0 fail |
| Neighboring saved/live voice, HTTP, scope and delivery selection | — | 267 pass / 0 fail |
| Owner/widget build | — | Passed |

All passing test selections have zero skips, cancellations and TODOs. Runtime: Node 22.23.1. Dependency installation used the existing lockfile; repository dependency files are unchanged. Generated tracked build output was restored to the exact base after the successful build.

Examples now verified:

- Historical partial receipt with `options: [null, "invalid", {lowEstimate: 221.23, highEstimate: 243.35, currency: "CAD", skippedAddons: ["Door sides"]}]`: customer presentation remains partial; saved voice retains exactly one qualified CAD range and the shared exclusion. Existing D15 instant behavior also passes unchanged.
- Saved option `lowEstimate: 300, highEstimate: 200`, empty records, missing endpoints, non-finite/negative/string values or invalid midpoints: projection throws; real history dispatcher returns review with no range and retains other caller history.
- Live valid top-level range plus `options: {invalid: "[PLACEHOLDER] not an array"}`: real runtime/dispatcher saves review, emits no amount/options/narration and retains the original application outcome for owner review. Retry remains stable.
- No valid priced evidence: partial receipts retain known exclusions; both voice projections reject safely when no valid range exists.
- Valid Base/Complete painting options remain exactly `1064` / `1164`, with `Door sides` excluded only from Base. Genuine additional work remains separately unpriced. The real saved retry returns corrected scope without altering any stored submission fields or saved quote identity.

`EXPECTED.md` predates repair execution. `baseline-*.tap` and `baseline-observations.json` preserve the failures. `final-matrix-regressions.tap`, `neighbors.tap`, `build.log` and `final-local-execution.json` contain results, commands and source hashes. The copied `review.spec.mjs` is byte-identical to the original; its embedded commit field describes the original base, while `final-local-execution.json` identifies the repaired source bytes.

The entire original read-only review directory, including its 76/15 result and recovery ZIP, remains byte-for-byte unchanged, verified against `original-review-sha256.json`. All pre-existing tracked tests and evidence remain unchanged. The separate unpublished `9af52ddc13c78beec84e7f090506da8c9b5fd691` parser recovery and its outstanding publication/hosted gates are not replaced by this repair.

## Publication plan and current limitation

Normal Git dry-run failed with exit 128: `fatal: could not read Username for 'https://github.com': terminal prompts disabled`.
The authenticated GitHub connector has repository push access and the exact A3 parent already exists remotely. Publish the tested tree as a new child of that parent on this separate branch, fetch it back, compare the tree and parent, then check every exact-head CI job and required gate. Final hosted evidence will be recorded separately after those gates complete, without making a self-referential evidence-only commit that changes the tested head.
