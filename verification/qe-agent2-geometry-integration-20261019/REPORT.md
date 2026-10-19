# Agent 2 geometry integration checkpoint — October 19, 2026

Branch: codex/qe-agent2-integration-checkpoint-20261019.

The reviewed A1 geometry repair is integrated with the previously verified A1,
A2, A3 and A4 F18 work. All requested local checks pass. This report precedes
publication; the final handoff must identify the new exact SHA and its completed
hosted gates. Earlier-head CI does not qualify this combined source.

F2 policy remains unchanged and unresolved. Parser recovery 9af52ddc is published,
with its separate exact-head verification pending; it is not included here.

## Merge and source preservation

Ordered merge parents:

1. Verified integration: 28c1c331e841878cce8edb1f235523e001ca0b25.
2. Coordinator-reviewed A1: 4b369be7dc9d27eb467243280070ec8bc5f6513d.

The remote target and incoming branch matched these pins at initial inspection.
The exact incoming head passed CI run 39191346010. Git found the common ancestor
abc2becff9cd252a63ff30258e9950a07af2c020 and merged automatically with zero
conflicts. No incoming commit was squashed, recreated or rewritten. No manual
production or test edits were necessary; A1's reviewed current-version
expectations applied directly.

All 90 paths changed by A1 relative to that common ancestor match the incoming
blobs. All 127 paths unique to the previous integration remain byte-identical.
The incoming 45-minute workflow is identical to the integration's workflow, so
the merge has no workflow delta. There are 89 incoming changed paths relative
to the integration base: eight production files, 17 test files and 64 verification
paths. Other additions are confined to this new evidence directory.

The eight production paths are concreteLandscapePricing.js, contracts.js,
engine.js, exactMath.js, roofGeometry.js, scopePricing.js and templates.js under
server/quote-engine-vnext/, plus server/src/runtimeConfig.js. They retain A1's
exact rational square-root comparisons, shared roof conversion and concrete
span decisions. Both literals are quote-engine-vnext-geometry-20261019-v12.

A2 money enumeration, metadata and precision; the combined F16 approval guard
and selected entry point; A3 presentation; and A4's reviewed F18 implementation
remain intact. No selectors, dependencies, specifications, F2 policy, prices or
frozen fixtures were changed. The known parser commit is absent from both merge
parents' ancestry. Source identities were checked again after all local tests.

## Historical and current-version expectations

A1's current-version assertions now require v12. Its F16 helper still uses the
genuine captured v11 receipts and explicitly requires their approval to be stale
under the new engine. Fractional fixed-price rejection, exact diagnostics and
complete durable-state equality assertions are preserved. Valid whole-cent and
fractional measured-rate controls still pass.

All eight authentic v11 geometry receipts replay unchanged through the saved
widget and actual voice paths, with original and new tool IDs. Ordinary save
does not reapprove them. Fresh estimates remain blocked until explicit owner
confirmation; reapproval preserves prices and produces the corrected v12
amounts while old rows and wording remain unchanged.

The frozen nine-cent separate-line control retains historical and new widget
and voice totals of nine cents. Existing accepted-zero, v7/v8/v9/v10 history,
rectangle, package, rounding and source-architecture controls remain in the
compatibility run. No dollar assertion was reconciled or weakened.

## Completed local verification

Node v22.23.0, existing locked dependencies, Playwright 1.56.0 and installed
Chromium were used. Every check uses isolated synthetic temporary storage.

| Check | Actual result |
| --- | --- |
| Owner app and widget build | Passed |
| A1 geometry: 490 oracle comparisons, two helper/version cases, 25 delivery cases, eight historical cases | 525/525 passed |
| Explicit A1 approval + original F16 dependency + A2 precision/metadata | 94/94 passed |
| Normal F16 integration entry point | 14/14 passed |
| Reviewed F18 regression files | 41/41 passed |
| Original unchanged F18 matrix | 91/91 passed |
| A3 rendered presentation + A2 shared editor | 5/5 passed |
| Current-version, historical, concrete, zero-adjustment and source-guard compatibility | 491/491 passed |

All test checks have zero failures, skips, cancellations and TODOs. Counts overlap.
The geometry names, 14 pipe-jack names, 41 F18 names, five rendered names and three
separate-line control names were individually checked against passing local TAP
records. The A3 prices, tier receipts, wording and confirmation labels pass
unchanged with v12.

EXPECTED.md and the geometry name inventory were written before the merge and
execution. The incoming 287-case audit and 203-case additional oracle were not
regenerated. The historical-v11 archive retains uncompressed SHA-256
3acd933e18c65b3e75249d6f0229955eb4fc2d36fc6c4a505c358c6e37453a30.
The original 91-case F18 matrix was copied byte-for-byte into this new directory
before execution because it writes observations and SQLite evidence beside
itself. Its embedded old source label remains historical; the merge parents and
source identities bind this execution to the combined v12 tree.

Exact commands, exits and durations are in local-execution.json. Raw logs and
new matrix evidence are retained losslessly as gzip archives; original-content
and archive hashes are in evidence-archives.json. The generated tracked build
HTML was restored to the merge index after successful testing.

## Final hosted qualification

Selection is unchanged: 283 strict files and 348 full files. The only new normal
files are A1's three geometry regressions. Required names are enumerated in
required-test-names.json. Every geometry name, F16 name, rendered name and
separate-line control must pass once in each hosted gate. All 41 F18 names must
pass once in full and remain absent from strict.

The expected totals are 5882 strict and 6936 full; only the completed final-head
logs qualify the reported actual totals. Cold install, build, dedicated browser,
strict, full, Docker, failure checker and dependency audit must all complete on
the published merge SHA. The final remote ref, fetched tree and ordered parents
must agree. No main merge, deployment or tag is authorized by this checkpoint.
