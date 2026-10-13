# Candidate m: local qualification passed; final-SHA hosted qualification and tag pending at authoring

Branch: `claude/release-candidate-20261013m`. Intended immutable annotated tag:
`rc-20261013m`. This report precedes publication and does not claim hosted checks
or tagging have already succeeded. The final handoff must read the exact pushed
SHA's actual logs and remote tag. No report-only commit follows tagging.

## Pinned inputs and assembly

- Base `rc-20261012l`: annotated object
  `a8fd712734f334f4edc2aab24cc5797d90e9ea40`, peeled commit
  `d38781b35d126f21fed6074844e07d4e9de7c944`.
- Runner repair `codex/ci-runner-repair-20261013`:
  `c2ced41e12f082b59236a8a9eecff12d95d43d98`.
  Exact-SHA CI [38480436585](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38480436585),
  attempt 1, independently read as completed/success during assembly.
- Restore evidence `codex/restore-recheck-20261013`:
  `39638ea110288f7813a39f95ffd534d6c6207a2c`.
  Exact-SHA CI [38462506387](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38462506387),
  attempt 1, independently read as completed/success during assembly.
- Main matched `ed12dca1253a8790c885b071ab6037e05632bea0`.

All refs were checked using `git ls-remote`; the new candidate branch/tag were
absent. Both input commits have exactly the pinned base as their sole parent.
A fresh isolated clone first checked out the base detached, then created the
candidate branch at the exact runner input and cherry-picked the exact restore
input without conflicts. Local cherry-pick:
`0b9172a1b5c9a63656e37577f7c9be0103e72916`.

CLI push authentication is unavailable (dry-run exit 128, no mutation). The
authenticated GitHub data API published the identical cherry-pick tree
`713f0f9e69d350d8d629d62866613c72c1e92042` as commit
`1999f5419988d24cfee1bf1d6085fdce59867fa5`, directly parented by the runner input.
Commit metadata differs; imported bytes and tree do not. The final qualification
commit is parented by this published cherry-pick, without a merge or force push.

All **425 imported files** were checked byte-for-byte: 378 runner source/test/
evidence files and 47 restore-evidence files. Their hashes and input identities
are recorded in `../release-candidate-20261013/import-identities.json`.
`server/`, `client/`, `specs/`, package manifests and lockfiles have no changes
relative to candidate l. The generated client build change was captured and
restored. No quote arithmetic or restore behavior changed.

Read `AGENTS.md`, `specs/BUILD_STATUS.md`, both input reports, candidate l's
workflow, required-step manifest, final marker and validator, and the relevant
TAP/sequential-runner requirements. No specs, owner rulings or approved wording
were changed. The restore intentional probes were not repeated.

## Candidate qualification changes

The task names `verification/release-candidate-20261013m/` as the report output
and `verification/release-candidate-20261013/` in the new-file allowlist. This
report uses the former; new qualification code, manifest, marker and evidence
use the latter. The validator reads this exact report path from the tested commit.

- `.github/workflows/ci.yml`: adds candidate m to the 12 relevant inherited
  branch conditions. All 25 required step names, commands, assertions and earlier
  branch behavior are preserved. Adds an early runner/tag regression step, the
  47-name full-suite guard, and a candidate-m-only immutable tagging job.
  The existing `Full test suite` / `run: npm test` layout is unchanged.
- `verification/release-candidate-20261013/ci-required-steps.json`: retains all
  25 candidate-l requirements and adds the two new requirements (**27 total**).
  This includes all four Docker entries, summary publication and every inherited
  required-name guard. No complete-suite total is hardcoded.
- `check-release-gate.mjs`: adapts candidate l's validator to m; additionally
  binds workflow name `CI` and explicitly requires every inherited manifest entry
  plus both new entries even if a modified manifest is rehashed in the marker.
  It checks repository, push/branch, workflow path/name, run/attempt, exact SHA,
  unique successful required jobs/steps, committed report/manifest hashes and
  remote branch identity. API errors, incomplete or ambiguous evidence fail.
  Tag publication is annotated, exact-SHA, non-force, and checked by remote
  peeling; a conflicting or lightweight tag cannot be replaced.
- `FINAL_CANDIDATE.json`: only authorizes qualification after this local work
  is complete. Missing or non-ready markers cannot authorize a tag. It binds
  the committed report and manifest SHA-256 hashes. The job also depends on
  successful test and voice-Docker jobs, with only contents-write/actions-read.
- `check-required-test-names.mjs` and `required-runner-test-names.json`: require
  exactly one successful, non-skipped/non-TODO result for each of the 47 pinned
  runner regression names. Names come from the pinned repair's original evidence.
- `test/candidateMTagGate20261013.spec.mjs`: **76** new checks. These cover valid
  controls, missing/failed/skipped/cancelled/unavailable/ambiguous evidence,
  identity/hash conflicts, removal of every inherited/new requirement, new-step
  evidence, unchanged inherited workflow blocks and guard refusal paths. Tests
  use synthetic evidence and never create remote tags.

Existing application files, runner/checker repairs, tests, dependencies, test
selection, known-failure list and prior evidence remain unchanged.

## Local validation and preserved evidence

Local runtime: **Node v22.23.3 / npm 11.9.0**, Linux x64. Dependencies were
installed before testing. `capture.mjs` records exact commands, cwd, runtime,
timestamps, exit status and signal with separate original stdout/stderr.

```sh
npm ci
npm run build
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs \
  --test --test-reporter=tap \
  test/ciRunnerRepair20261013.spec.mjs \
  test/candidateMTagGate20261013.spec.mjs \
  test/candidateLTagGate20261012.spec.mjs \
  test/ciSummary20261012.spec.mjs \
  test/testFullScheduling.spec.mjs \
  test/auditFixes20261003.spec.mjs
node verification/release-candidate-20261013/check-required-test-names.mjs \
  verification/release-candidate-20261013/focused.stdout.log
node .github/scripts/check-test-results.mjs \
  verification/release-candidate-20261013/focused.stdout.log
```

| Local check | Result |
|---|---|
| `npm ci` | exit 0 |
| Owner/widget build | exit 0 |
| Focused regression command | **185 tests, 185 passed**, exit 0 |
| Runner-name guard against focused TAP | all **47** names confirmed, exit 0 |
| Repaired strict checker against focused TAP | complete **185/185**, exit 0 |

Focused breakdown: 76 new m checks, 47 runner regressions, 30 existing l checks,
3 CI-summary checks, 1 scheduling check, 28 existing audit/source-contract checks.
All counts have zero failures, cancellations, skips and TODOs. No local test
failure occurred and no test was rerun to obtain green. Expected refusal cases
are passing assertions within the synthetic tests, not failure exemptions.

Local broad quote/full/browser/Docker execution is **NOT RUN**. No local
Chromium install/launch or Docker success is claimed. Hosted CI must supply
these results on the exact final commit, including normal required restore
regressions. Prior input CI does not qualify this candidate.

## Publication, decisions and limits at authoring

The report/marker are committed before the final branch publication. Exact-SHA
CI, remote readback and tagging are pending at report authoring. The final
handoff must verify the remote branch, read back all candidate files and imported
identities, inspect complete quote/full summaries and all expected names, and
confirm each of the 27 manifest steps actually succeeded. The tagging job must
independently verify the same evidence before any tag is published. Other
candidates' inapplicable jobs may be skipped; m's requirements may not be.

**SHARE at authoring: final-SHA hosted qualification is pending.** Any missing,
failed, skipped, cancelled or unavailable required check blocks tagging.

**SKIP — unsubstantiated historical observation; fresh targeted verification
passed; historical cause remains unknown.** Imported restore evidence remains
unchanged. Assembly does not reopen the investigation or claim a quote-engine
repair. The original candidate's CI contained complete passing summaries;
the runner defects did not demonstrate a false pass in that historical run.

Four independent clean audits (Astra and Sol for each scope) remain required on
the same tagged commit before merge. This candidate is not audit or deployment
clearance. Synthetic fixtures only; no main merge, deployment, Railway/provider
change, live data, charges, email, calls or SMS. No subagents.
