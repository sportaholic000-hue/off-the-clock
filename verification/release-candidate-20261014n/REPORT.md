# Candidate n qualification checkpoint — 2026-10-14 UTC

Prepared personally by Codex (OpenAI; no subagents). This is candidate assembly and qualification, not an independent release audit.

## Identity and status at commit

- Starting repair: `64e2229c8ee4819eba7a641c5c5ac04438fc4916`, branch `codex/booking-service-end-repair-20261014`.
- Candidate branch: `claude/release-candidate-20261014n`; requested annotated tag `rc-20261014n`.
- Candidate-m tag object `7c7e5a9363ed7113ea8969cdd3e400f58b1b538f`, peeled `95e1631f42461ca8ae7d46d859940bffc302d155`.
- Main `ed12dca1253a8790c885b071ab6037e05632bea0`.
- Remote identities matched before work; candidate n and its tag were absent. Candidate m is an ancestor of the repair. Main is separate history (common ancestor `9ba339de4caeb6f6045b56e0beecc44ff5208e5c`); no main or diagnostic branch was imported.

**Local qualification PASS. Final exact-commit hosted qualification and immutable tag publication PENDING at this commit.** The ready marker requests tagging only after the Actions validator verifies successful evidence. It is not a declaration that CI already passed. The subsequent run and remote tag must be inspected separately. No report-only commit should be presented as that tested candidate.

## Changes and constraints

Only `.github/workflows/ci.yml`, this new verification directory, new `test/candidateNTagGate20261014.spec.mjs`, and the narrowly authorized workflow-contract check inside `test/candidateMTagGate20261013.spec.mjs` change.

The workflow adds n's branch clause to all branch-conditioned inherited requirements, preserving every original clause, complete command, step name, assertion and guard. Existing unconditional steps and prior tag jobs remain intact. The new early step runs the unchanged 17-case booking repair and n's validator before the long suites; the new after-full-suite guard requires each actual repair name exactly once, successful, without skip/TODO. Its inventory is derived from the unchanged test source's literals and bounded parameter expansions and verified against actual local TAP. No broad-suite total is hard-coded as a qualification threshold.

The manifest retains all 27 m requirements and adds these two required steps (29 total). n's validator retains m's committed marker/report/manifest hash checks; repository, branch, workflow, event, run/attempt and exact-SHA checks; successful complete required jobs/steps; complete paginated Actions inventory; remote branch binding; and refusal of lightweight/conflicting existing tags. Only the qualified Actions entry point can publish the requested annotated tag, without force or replacement. Locally only exported validation functions are exercised, using synthetic metadata.

Candidate m's workflow-contract check still compares complete inherited blocks. It explicitly permits only the authorized additional n branch clause, retains earlier conditions, and asserts n enables each inherited requirement. All other m assertions remain byte-identical. n additionally compares all 27 inherited blocks against the pinned repair workflow and pins the two booking production files and unchanged regression source hashes.

The completed booking repair, dependencies, test runners, application regressions, specs (including BUILD_STATUS), public pages, owner wording and earlier evidence remain byte-identical to the pinned repair. Source-scope verification is in `local/09-source-scope.json`. Generated build differences were preserved before restoring the tracked build output to its original bytes for publication. No application repair or unrelated refactoring is included.

## Personally executed local checks

Fresh clone and checkout from the exact repair; Node **v22.23.3**, npm **11.9.0**, git **2.51.1**. `npm ci` and `npm run build` both exited 0, no signal. Exact commands, cwd, non-secret PATH/TMPDIR, timestamps, exits and complete stdout/stderr are in `local/`.

```
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs   --test --test-reporter=tap   test/bookingServiceEnd20261014.spec.mjs   test/candidateNTagGate20261014.spec.mjs   test/candidateMTagGate20261013.spec.mjs   test/ciRunnerRepair20261013.spec.mjs   test/candidateLTagGate20261012.spec.mjs   test/ciSummary20261012.spec.mjs
```

Complete result: **264 tests, 264 pass, 0 fail/cancelled/skipped/TODO, 0 suites**, exit 0, no signal. Composition: 17 unchanged booking cases, 91 n validator/guard/contract controls, 76 m controls, 47 runner controls, 30 l controls, 3 summary controls. Valid and refusal fixtures cover missing/changed authorization documents; omitted inherited/new requirements; wrong repository/event/branch/workflow/run/attempt/SHA; missing, duplicate, failed, cancelled, skipped or unfinished evidence; conflicting/lightweight tags; missing Actions evidence; and every required-name refusal type. The strict existing result checker separately accepted the complete local output; the new guard separately confirmed all 17 actual names.

No failed test execution occurred in this preparation. The expected `git merge-base --is-ancestor main repair` result was 1 and is recorded as ancestry information, not a failed application test. Install emitted existing dependency deprecation/proxy notices; build emitted its bundle-size warning. Complete first outputs are retained. No failed job was rerun to obtain green.

## Hosted requirements and remaining work

The committed `ci-required-steps.json` is the exact required inventory: 25 steps in `test`, 4 in `voice-docker-startup`. It includes Chromium installation and real launch, controlled/dedicated/shared browser checks, quote and full suites, required-name guards, runner and tag regressions, retention/expiry/locks/coordination/standalone restore, strict complete-summary checking and publication, dependency audit, production Docker build, synthetic voice, Railway restart/redeploy/SIGTERM/restore smoke and production-user lock proof. Railway smoke is local synthetic Docker work, not a Railway operation.

At commit time those final-SHA hosted outcomes, complete quote/full summaries and n's qualified tag job remain pending. Earlier repair-branch passes and candidate-only skips are supporting history and do not qualify n. Conditional h/i-only extra standalone/smoke steps and prior candidates' tag jobs remain ineligible on n; they are not counted as successful required evidence.

## SHARE / SKIP / limitations

SHARE: none confirmed by this bounded qualification preparation. This is not an independent scope vote.

SKIP: local Chromium/browser assertions and Docker execution NOT RUN; working final-SHA hosted execution must supply this coverage. Full/quote suites are reserved for hosted exact-commit qualification. No live carrier, OAuth, Stripe, inbox, Gemini or deployed storage acceptance is claimed. No provider requests, SMS, merge, deployment, Railway/account changes or tag mutation were performed locally.

Historical restore observations and the 27 temporary files' preservation provenance remain unresolved. Existing reports and archives remain unchanged; no historical reproduction campaign was started. A passing current restore does not establish the historical cause.

## Evidence and release boundary

`local/` contains the explicit allowlisted preparation evidence; `INVENTORY.sha256` hashes every file under this candidate verification directory except the inventory itself. No temporary application volume or database snapshot is packaged. Source identities are in `repair-source-hashes.json`; inherited complete step contracts are in `inherited-step-contracts.json`.

Publication requires independent remote fetch/readback comparison of this report and qualification tree, and final `git ls-remote` verification of n's branch/tag/peel, unchanged m tag and unchanged main. Subsequent final observations belong in the delivery report, preserving this checkpoint's truthful pending state.

After n qualifies, four independent clean scope votes on this same immutable tag remain required. This work authorizes neither merge nor deployment.
