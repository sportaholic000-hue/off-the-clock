# Candidate l follow-up — final exact-SHA hosted validation and tag PENDING at authoring

The final test candidate is prepared. This report is committed **before** its final hosted run: it does not claim that pending checks passed or that the tag already exists. `FINAL_CANDIDATE.json` authorizes only the narrowly gated Actions tag after all 25 required steps succeed on this exact commit. The final handoff must give the exact branch SHA, report readback, hosted counts/steps and remote peeled tag. Four independent clean audits—Astra and Sol for each of the two scopes on the same tagged commit—remain required before merge.

## Starting refs and preserved work

`git ls-remote origin refs/heads/claude/release-candidate-20261012l refs/heads/main 'refs/tags/rc-20261012l*'` initially returned:

```
36c2c4530643f75bb42755df607c776db9856ab7 refs/heads/claude/release-candidate-20261012l
ed12dca1253a8790c885b071ab6037e05632bea0 refs/heads/main
```

No candidate-l tag existed. Work continued from that exact branch in the existing separate clone. No reset or unrelated branch overwrite. The prior base `ead53fa174d577b280506b67573a29d6b0358237`, integrated restore commit `d52fb4003c21ba7f300af2073b1d329eb6d2cc99`, launch commit `4417e7b749a71fbee6207315ebcd75425fa25036`, retention repair and all previous evidence are preserved. The previous report is retained verbatim in [followup/report-before-final-followup.md](followup/report-before-final-followup.md), including its historical pending checks and limitations; this current report supersedes its statement that candidate-l Actions tagging is unavailable.

Read AGENTS.md, BUILD_STATUS.md, this candidate's report and required-step manifest, and owner-alert EXPECTED.md. Read the fixture, production worker/email service, server scheduling, retry routes and compiled UI source flow. No specs, production/client source, owner wording, public pages, manifests, lockfiles, restore diagnostics or launch drafts changed in this follow-up. Generated client/dist restored.

## Historical failure and controlled reproduction

[Original run 38322067104](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38322067104), SHA `36c2c4530643f75bb42755df607c776db9856ab7`: full suite **4976 total / 4974 pass / 2 fail**. The retry POST returned 200/PENDING, then the browser timed out at test line 22 waiting for visible PENDING. The two failures were the nested retry test and its parent. The actual rendered state and alert ID were not captured; they remain **unknown**. The strict gate passed 4245/4245 and Docker passed, but subsequent standalone checks were skipped. The always-running summary publication also failed when its missing checker file made `cat` terminate bash -e. See [original-ci-failure.txt](followup/original-ci-failure.txt). No unchanged failure was rerun merely to obtain green.

Before changing the original failing browser file, diagnostic checkpoint **`cf041d55e1b179c3fee791d4af3e01416c4fb4a3`** added only opt-in worker scheduling control and a separate reproduction. [Hosted run 38328411221](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38328411221), test job 115072362118, reports the controlled browser reproduction **success**. The original browser file was unchanged at that checkpoint. [diagnostic-hosted-observation.json](followup/diagnostic-hosted-observation.json) preserves the inspected step states; long suites were still in progress at this report's authoring and are not counted as passes.

The controlled reproduction uses the actual server, actual retry and call routes and actual compiled UI. It selects one synthetic callback alert, binds the POST URL, GET notification and database lookup to its exact ID, and binds the rendered row through the unique event type of that same GET object. Its bounded JSON diagnostics contain only synthetic alert ID, HTTP/status/error/attempt counts, worker ordering and acceptance counts—no auth headers, tokens, contacts, notes or message bodies.

| Ordered action | Verified controlled result |
|---|---|
| Pause automatic owner-alert scheduling; retry the selected FAILED alert through UI | POST 200, PENDING |
| Intercept its refresh GET, run the actual disabled-provider worker, then release GET | Same alert DB BLOCKED / EMAIL_NOT_CONFIGURED, attemptCount 0; dispatch processed 0 |
| Actual call GET and compiled UI render | Same alert BLOCKED; row has zero PENDING labels. The old PENDING predicate is false. |
| Run ready fake worker, refresh actual call route/UI | Same alert ACCEPTED, exactly one fake-provider call and one unique acceptance |
| Dispatch fake worker again | Still one call/acceptance, no resend |
| Staff/foreign-owner checks | Staff retry 403 and no UI mutation button; foreign retry/call 404; callback text retained |

This establishes a genuine harness scheduling flaw and a controlled failure mechanism. It **does not retroactively prove** what the original failed CI browser rendered. No production/UI defect was demonstrated and none was changed.

## Repair

- `test/leadCaptureRepair20261006HttpFixture.mjs` and `test/helpers/controlledOwnerAlertWorker.mjs`: opt-in `controlledOwnerAlertWorker` starts the real server with a test-only Node module preload. Only the automatic worker scheduler is paused. IPC dispatch calls the unmodified production dispatch method. The preload requires NODE_ENV=test, disabled provider writes and IPC. Default shared-fixture behavior is unchanged. No sleeps, increased timeouts or repeated attempts were added to hide the race.
- `test/helpers/ownerAlertControlledScenario.mjs` and `test/ownerAlertRepair20261006.browser.spec.mjs`: two explicit orderings. With no worker consumption, the same alert must render PENDING. With worker consumption before refresh, it must render BLOCKED/EMAIL_NOT_CONFIGURED with zero attempts. Both retain dashboard/deep-link/reload/callback, one acceptance, no resend, acceptance-versus-delivery wording, staff permissions and tenant-isolation assertions. These are exact expected statuses, not an arbitrary allowed-status list.
- `test/ownerAlertScheduling20261012Http.spec.mjs`: direct route regression proves the opt-in pause and explicit real-worker transition. Existing default-fixture consumers remain exercised.
- `.github/workflows/ci.yml`: puts the previously failing browser file in the early dedicated browser command; retains its full-suite inclusion. Adds controlled reproduction, focused harness/CI tests, shared-fixture consumers and a passing-name guard. All starting required checks remain. `ci-required-steps.json` has 21 test-job and four Docker-job requirements, including summary publication.
- `render-test-summary.mjs` and `test/ciSummary20261012.spec.mjs`: explicitly handle absent checker/TAP files; show earlier gate and suite/checker outcomes, retain nested and parent TAP failures and available counts, and never infer pass from absent evidence. Summary publication no longer suppresses commit/push failure with `|| true`; it reports completion only after successful push. Original test gate outcomes are unchanged.
- `check-release-gate.mjs`, `test/candidateLTagGate20261012.spec.mjs`, workflow tag job and `FINAL_CANDIDATE.json`: candidate-l push only, dependent on successful test and voice-docker-startup jobs. Requires committed report and explicit marker bound to report/manifest hashes. Reads the current Actions run and paginated current-attempt job evidence; checks repo, workflow, event, branch, run, attempt and exact SHA; every required step must be completed/success. Missing, duplicated, skipped, failed, cancelled or unavailable evidence refuses tagging. Rechecks remote branch and tag before non-forced publication and verifies annotated peeled SHA afterward. Existing conflicting/lightweight tags are hard stops; an existing matching annotated tag is verified without mutation. Permissions are only contents:write and actions:read for this job; Docker inherits contents:read, test retains write solely for existing summary publication. No remote test tags are created by refusal tests.

## Local commands and results

Node **22.23.3**, npm **11.9.0**. All fixtures synthetic; no provider writes. Dependency setup completed before any tests.

```sh
npm ci
npm install --no-save --no-audit --no-fund playwright@1.56.0
npm run build
node --test test/ownerAlertScheduling20261012Http.spec.mjs
node --test test/candidateLTagGate20261012.spec.mjs test/ciSummary20261012.spec.mjs test/ownerAlertScheduling20261012Http.spec.mjs
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test \
  test/callerHistoryFollowup20261006Http.spec.mjs \
  test/leadCaptureRepair20261006Http.spec.mjs \
  test/ownerAlertRepair20261006Http.spec.mjs \
  test/ownerAlertsDelivery20261006Http.spec.mjs \
  test/ownerDashboard20261007TenantHttp.spec.mjs \
  test/ownerIntegrations.spec.mjs \
  test/ownerAlertRepair20261006.spec.mjs
git diff --check
```

| Local check | Actual result |
|---|---|
| Fresh npm ci, no-save Playwright setup, fresh build | PASS, exit 0; logs in followup/; existing build chunk-size warning |
| Controlled HTTP | 1/1 PASS; included again in safety aggregate |
| Summary cases | 3/3 PASS: complete passing inputs; failed TAP/checker missing; both inputs absent after earlier failure. Real helper CLI runs under bash -e. Included in safety aggregate. |
| Final CI safety aggregate | **34/34 PASS**, zero fail/cancel/skip/TODO; [ci-safety-final.tap](followup/ci-safety-final.tap). Includes 30 tag/workflow/refusal checks, three summary cases and one HTTP case. |
| Existing shared-fixture HTTP and worker regressions | **93/93 PASS**, zero fail/cancel/skip/TODO; [shared-fixture-worker.tap](followup/shared-fixture-worker.tap) |
| Chromium launch probe | FAILED SIGTRAP; browser tests **NOT RUN locally**. First probe also lacked a usable /tmp, then retried with the correct existing writable TMPDIR and crashed; both logs preserved. Hosted Chromium required. |
| Initial new preload test | 0 pass / 1 fail due missing brace in new test-only preload; corrected, preserved in controlled-http-preload-syntax-failure.tap. Not a product reproduction. |
| npm test / npm run test:quote in this follow-up locally | **NOT RUN** because Chromium cannot launch. Earlier task's failed/incomplete local runs remain in historical report/evidence, not relabeled passes. Exact-final-SHA hosted execution mandatory. |
| Local Docker | **NOT RUN**, executable unavailable. Hosted voice, Railway restart/redeploy/SIGTERM/restore and production-user lock proof mandatory. |
| Scope/generated-artifact/whitespace checks | PASS; no production/client/spec/dependency change from starting follow-up SHA |

Counts overlap and must not be summed as unique coverage. No dependency install occurred during tests. No timing failure was observed in these focused runs.

## Final publication contract and remaining decisions

At authoring, only the diagnostic checkpoint is confirmed remotely. Final repaired browser coverage, full/strict gates, all standalone files/guards, dependency audit and final Docker jobs are **PENDING on the final commit**. The authoritative checklist is [ci-required-steps.json](ci-required-steps.json); no skipped required step is accepted. The final report handoff must inspect actual logs/counts and every named step, not just a green job. Diagnostic runs never authorize a tag without the explicit final marker. Earlier candidate/restore results do not clear this commit.

Publication uses the available GitHub connector with the existing branch SHA as a lease, and exact Git tree comparison; no personal credentials requested. Native git fetch/ls-remote independently verify the resulting branch. The committed report is fetched back at the exact SHA. Actions' existing repository authentication performs the narrowly authorized immutable tag only after all checks pass. There is no report-only commit after tagging.

- **SHARE — final exact-SHA qualification:** pending at report authoring. Any required check failing, skipped or unavailable blocks the tag. Final handoff must resolve this with the actual run, or report the blocker untagged.
- **Resolved harness/summary findings:** controlled browser ordering fixes the test assumption without changing product behavior; summary handling preserves available failure evidence even when later checker input is absent.
- **SKIP — original CI render uncertainty:** the controlled transition is proved, but the historical failed run did not record its rendered status/alert ID; no invented historical diagnosis.
- **SKIP — historical restore discrepancy:** NOT REPRODUCED / cause unknown. Preserved diagnostics do not prove its cause or a quote-engine repair.
- **SKIP — local execution limitations:** Chromium crashes and Docker is unavailable; local browser/Docker checks are NOT RUN and must be replaced by actual hosted evidence on the final SHA.

Main remains `ed12dca1253a8790c885b071ab6037e05632bea0`. No main merge, deploy, Railway/account/provider configuration, real data, charges, messages, email, calls or SMS; no subagents. Launch drafts remain unapproved and undeployed. Independent audit requirements are unchanged.
