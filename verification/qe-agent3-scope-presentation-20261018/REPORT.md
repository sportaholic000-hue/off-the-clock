# Agent 3 scope and presentation verification

Date: 2026-10-18

Branch: `codex/qe-agent3-scope-presentation-20261018`

## Source boundary

- Started from `0b59a401e1d8f2c2c43188c7355abb9939504b9b`.
- Merged restoration implementation
  `8aae4f4ea90047bc0ea841853a93415f5d2ef232` as a second parent in
  `8a35afde7b8f14de6fd9062de6490e4d669aeab6`.
- Did not merge the workflow-only child
  `d4f9394a0836ad007d50b2c33d6ffe56b4e4ea03`.
- Merged the personally reviewed A1 checkpoint
  `3b1e4b32c1cf31260ba2344fbf3bbdf418c81b5c` as a second parent, preserving
  both histories. Its core implementation is unchanged after the merge.
- No quote calculator, contract, money/precision module, listed-price module,
  website extractor, selector, dependency, specification, or engine version
  was changed by Agent 3. The only workflow edit is the explicitly authorized
  `jobs.test.timeout-minutes` increase from 30 to 45.

The final pushed source SHA cannot be self-referential inside the commit that
contains this report. The hosted run and the `claude/ci-results` summary must
name the exact pushed SHA; a parent or earlier run does not qualify this branch.

## Implemented checks

- F6: the real saved-approval table excludes `startingValueAdoptions`; the
  inherited restoration regression continues to exercise the real conflict,
  validation, save, retained-remote-receipt, fresh-restored-identity, and forged
  receipt rejection paths.
- F14: real owner and interview components resolve roof material wording from
  each product's effective price and validated dependent-line receipt. The
  actual tier identity now travels through `PricingContext`: inherited prices
  use the base receipt, while every explicit override uses its own A1
  tier-specific receipt even at the same numeric price. Rendered regressions
  cover both reported inversions, both accessory modes, confirmed/unconfirmed
  products, a mixed product map, inherited prices, independently confirmed
  tiers, and Base/tier-specific pending confirmation labels. The quote amounts
  remain pinned at Inherited `$581`, Same price `$581`, and Premium `$881`.
- F18: Base remains `$1,064` while excluding two door sides; Complete remains
  `$1,164` while charging `10,000c` and does not claim that door sides are
  excluded. The actual widget retry and both live and saved voice projections
  use a cloned corrected presentation. Stored historical JSON remains exact,
  genuine additional work remains partial, both options survive, and
  `fullJobTotal` remains `null`.
- F19: the actual owner preview renders Base recurring `$9–$11` / first visit
  `$18–$22`, and Complete recurring `$18–$22` / first visit `$36–$44`, with
  separate labels, units, tax wording, and midpoints. Maintained recurring and
  one-time results have no first-visit controls.
- F25: README and the audit page now pin the checked October 18 baseline,
  distinguish the independently checked restoration, label October 6/7 records
  as historical, and avoid integration or deployment claims for pending work.

## Local verification

All passing commands below used Node `v22.23.0` and the committed lockfile.

| Check | Result |
| --- | --- |
| `npm ci` | Passed; lockfile unchanged. |
| `npm run build` | Passed: owner app and widget production builds. |
| A1 core, delivery, historical and exact-roof regressions | 107/107 passed; 0 failed, skipped, cancelled or TODO. |
| Restoration, conflict/save, preview, mowing, surface, delivery, display and voice regressions | 224/224 passed; 0 failed, skipped, cancelled or TODO. |
| Direct tier-receipt oracle | Passed: pending `Inherited $581` / `Premium $881`; confirmed adds `Same price $581`; receipt JSON unchanged. |
| Architecture and production engine guards | 18/18 passed; 0 failed, skipped, cancelled or TODO. |
| `node --check test/qeAgent3ScopePresentation20261018.spec.mjs` | Passed. |
| `git diff --check` | Passed. |

The fresh workspace had no Chromium binary. The pinned Playwright installer was
attempted with a workspace cache, but the local proxy returned a zero-byte
archive. That is an environment limitation, not a passing browser claim.
`test/qeAgent3ScopePresentation20261018.spec.mjs` bundles the real rendered
components successfully and must pass with hosted Chromium as part of the
exact-head strict quote gate and full suite.

## Hosted qualification

Pending until the final source commit is pushed. Required exact-head outcomes:

- install from lockfile;
- owner app and widget build;
- browser gate;
- strict quote/price-book gate, including the Agent 3 rendered regression;
- full suite and failure checker;
- remaining required CI jobs.

No merge, deployment, tag, or production acceptance is asserted here.

### Non-qualifying hosted attempt

Run [39162450029](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39162450029)
tested `5eee6f6ba502e6622a379be947994f0b40ef4301`. Install, build,
Chromium launch, the browser gate, the voice container, and all four Agent 3
rendered tests passed. The strict gate recorded 5,153/5,155 passes, so the run
does **not** qualify the branch. It exposed two projection compatibility issues:
malformed optional historical option entries were not ignored during receipt
cleaning, and homogeneous roof wording rendered twice. Both are covered by the
subsequent owned-file repair and require a new exact-head hosted run.

Run [39164025858](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39164025858)
tested the then-exact head
`03b29925437e73acb24b916ba6e69e5a002dfff1`. Install, build, Chromium,
browser gate, strict quote gate, and voice-container checks passed. The
unchanged 30-minute job limit cancelled the full suite after test 5,292, so the
failure checker and audit did not run and that attempt also does **not** qualify
the branch. The coordinator subsequently authorized only the test-job timeout
increase to 45 minutes for this combined exact-head run.
