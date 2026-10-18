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
- No quote calculator, contract, money/precision module, listed-price module,
  website extractor, selector, dependency, workflow, specification, or engine
  version was changed.

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
  regression covers both accessory modes, confirmed/unconfirmed products, a
  mixed product map, and a tier override.
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
| Restoration, owner-copy, surface, mowing and display regressions | 86/86 passed; 0 failed, skipped, cancelled or TODO. |
| Saved/current voice, email, scope and delivery regressions | 68/68 passed; 0 failed, skipped, cancelled or TODO. |
| Architecture and production engine guards | 16/16 passed; 0 failed, skipped, cancelled or TODO. |
| `node --check test/qeAgent3ScopePresentation20261018.spec.mjs` | Passed. |
| `git diff --check` | Passed. |

The workspace Chromium binary cannot launch under the local execution sandbox;
it exits with `SIGTRAP`. That is an environment limitation, not a passing browser
claim. `test/qeAgent3ScopePresentation20261018.spec.mjs` bundles and exercises
the real rendered components, and must pass with the hosted Chromium install as
part of the exact-head strict quote gate and full suite.

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
