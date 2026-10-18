# Agent 1 core accuracy repair — v11

Local focused regressions pass. Hosted gates must be read on the published final SHA; this committed report does not claim a future CI result. The final task response supplies that SHA and exact hosted results.

## Scope and preserved history

Branch: `codex/qe-agent1-core-accuracy-20261018`.
Exact integration parent: `0b59a401e1d8f2c2c43188c7355abb9939504b9b`.
Preserved repair parent: `1fa0182458fbe8b6950e42362f2711a9293e2978` (original v10 exact subtraction repair; not squashed or reimplemented).
Published merge commit: `4562efe1e42f1098b23de1dfe6340d3e7410b43c`, with those ordered parents.
Merge tree: `6ab9a9db91677084e5e5d7d74dab3470e9ba2c03`.
The local capture commit `d0b44531c77a2eb4e55ecb58405c9975167164b1` has exactly the same tree and ordered parents; GitHub's commit API assigns different commit metadata. `capture-v10-source.bundle` preserves that exact local capture commit and requires only the two published parents. `git bundle verify` passed.

All newly edited production files are inside the assigned engine/bridge/runtime/installed-price ownership. Existing test edits are engine-version compatibility changes; frozen fixtures and historical monetary assertions are unchanged. No specs, workflows, dependencies, selectors, client files, other agents' production files, tags, deployments, main or integration refs were edited. Work was performed personally without subagents.

## Implemented findings

| Findings | Change and independent expectation |
| --- | --- |
| F1 | Merged the existing exact-subtraction repair. The 12501.25 × (1.4−1) example rounds to 5001 cents. Separate-line 9-cent control and four accepted-zero cases remain covered. |
| F2 | Below-one stored factors retain their existing bounds. Selected below-one additive adjustments require an explicit owner policy decision; readiness chooses a usable representative and discloses unusable conditions without blocking unrelated valid selections. All unusable story selections cannot activate. No clamping, signed-price policy or stacking change. |
| F3 | Explicit trim preparation labor joins seasonal labor. 10000 +2000 +2000 labor gives 1400 seasonal cents at 10%; no prep material or disposal joins it. |
| F4/F5 | All five flooring extras distinguish missing prices from approved included-zero prices, retain zero classification validation, and project only permitted skip labels. A complete option survives another option's exclusion. |
| F10 | Public closed-layout validation requires at least three sides and strict polygon inequality, including configured gate widths along straight sides. Open layouts and valid gates remain supported. Post takeoff remains a combinatorial helper; physical eligibility is enforced by the public layout/customer path. The unchanged 20000-case independent post-count property test passes. |
| F11 | Ice/water measures must use the configured unit. Correct totals are 49100 (100 sqft ×100) and 69100 (100 LF ×300); the wrong measure asks for the configured unit and never converts or quotes 39100. |
| F12 | Accessory question visibility and validation use the selected material and effective tier receipt. Unconfirmed metal does not hide confirmed asphalt. |
| F13 | Explicit material overrides have separate protected basis receipts. Base-only migration preserves the 58100 base option and withholds the unconfirmed premium. Only explicit re-entry/confirmation allows its unchanged 40000 material override to quote 88100; no inferred repricing. Edits invalidate the relevant receipt. |
| F15 | Transition and leveling installed-price allocations are accepted and validated; relevant optional-scope readiness reports missing material shares. Missing seasonal labor share contributes zero without blocking. |
| F17 | Furniture false/positive rooms and true/per-room zero require correction; consistent per-room and flat controls still charge correctly. |
| F20 | Room dimensions cannot silently overwrite a conflicting carpet method or area. Review retains the originally submitted measurements. |
| F22 | Notice attributes the thickness-band spacing to the configured spacing limit, without changing the existing joint calculation or spacing policy. |
| F23 | Complete installed surface extras use explicit shares for materials tax and seasonal labor, with no second markup or invented share. |
| F24 | Complexity metadata says multiplier; extra-layer factor states its first-layer-removal-per-additional-layer basis. Owner application metadata preserves those meanings. |

Both production version literals are `quote-engine-vnext-accuracy-20261018-v11`. Read/save preserves stale v10 approvals; only explicit owner reapproval enables fresh v11 quotes.

## Evidence

`EXPECTED.md` records handwritten expectations before implementation and first tests, including the explicitly documented correction to the full paint-fixture total (unchanged 10% preparation-material waste). The F3 surcharge expectation stayed 1400 throughout.

- `focused-server-final.tap`: 294/294, zero failures/skips; includes the 60 new Agent1 tests, preserved v10 repair regressions, authentic v8/v9 replay, flooring and fence property regressions.
- `version-guard-final.tap`: production current-version startup and stale-version refusal, including v10.
- `build-final.log`: owner and widget builds.
- `historical-v10.json`: authentic saved-widget and actual voice-dispatch receipts created by clean v10 source, not hand-built output. Frozen scenario amounts are 16410 trim-prep cents and the 9-cent roof control. V11 replay preserves complete original database rows and both tool-ID forms; newly reapproved quotes use 16610/9 respectively.
- `history-before.sha256`: authentic v10 capture hash verified unchanged after tests. Existing frozen v8/v9 receipts were neither edited nor regenerated.
- `capture-v10.mjs`, `capture-v10.log`, `capture-worktree.log`, and the source bundle document actual capture provenance.
- New delivery tests use saved application configuration, `prepareApplicationIntake`/`submitQuote`, and the real `matchService`/`getQuote` dispatcher with scope confirmations. Customer projections contain no raw pricing or allocation maps; no provider messages were sent.
- Early failing local logs are retained: fixture setup omissions, test adapter assertions, the independently corrected prep-waste total, and the two compatibility fixes are distinguishable from final passing focused results. No failed assertion was weakened.

An initial version-guard run overlapped the build and two cases saw temporarily missing bundles; the sequential post-build rerun is recorded separately. Local Node 24 install failed in better-sqlite3 native setup. Node 22.23.3 clean `npm ci` succeeded without dependency edits. Local strict `npm run test:quote` was interrupted (exit 130) after browser-environment failures; it is incomplete and not green. Local Chromium installation also failed to retrieve a usable archive. `focused-final.tap.gz` includes four browser setup failures plus 294 passing tests; `focused-server-final.tap` runs those 294 server tests alone. Local full-suite and Docker gates were not completed; Docker is unavailable. Hosted CI is the required authority for the final-SHA strict/full/Chromium/Docker gates.

## Remaining decisions and exact handoff

The owner still needs to decide how below-one story/shape factors should behave under additive stacking. This branch safely diagnoses the selected condition and does not adopt signed prices or alter allowed stored factors.

`client-owner-proposed.patch` is an exact, unapplied zero-context patch (check with `git apply --check --unidiff-zero`) for the client owner. The existing owner UI labels multiple effective-tier confirmation buttons identically and describes all materials as globally inactive. The proposal names the new protected `row.tierName` and explains selection-specific activation. The backend and saved-widget/voice paths already enforce each effective tier; this UI clarification was not edited outside ownership.

Reproduce focused checks with Node 22 and a writable TMPDIR:

```sh
node --test --import ./test/pricebookTestEnv.mjs test/qeAgent1*.spec.mjs test/qeRoofExactSubtraction20261018.spec.mjs test/qeRoofZeroAdjustments20261018.spec.mjs test/qeRoofUnderlaymentAccuracy20261018.spec.mjs test/qeAccuracyIntegration20261018.spec.mjs test/quoteFlooring20261016.spec.mjs test/fenceLayoutProperty20261016.spec.mjs
node --test --import ./test/pricebookTestEnv.mjs test/releaseProductionEngineGuard.spec.mjs
npm run build
npm run test:quote
npm test
```
