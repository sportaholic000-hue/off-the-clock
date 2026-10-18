# Authorized F22 text-check follow-up

Continues from `58af2adc956d3b6500f80c19ec93c40fbc5554fe` on `codex/qe-agent1-core-accuracy-20261018`.

The owner explicitly authorized exactly one wording replacement in each existing concrete browser and DOM test: `NRMCA cap of 10 feet` becomes `configured spacing limit of 10 feet`. `f22-authorized-scope.json` records that every other byte in both files is unchanged. Visibility checks, timing behavior, numbers and all other assertions remain intact. No production code, suite selection, exclusions, skips, workflows, dependencies or client code changed. The engine remains v11. F2's below-one signed-adjustment policy remains explicitly unresolved. The client patch remains assigned to Agent3.

## Preserved failed hosted run

Run [39162106317](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39162106317) tested SHA `58af2adc956d3b6500f80c19ec93c40fbc5554fe`.

- Strict gate: 5247/5249 passed, exactly two failures, zero cancelled/skipped/TODO tests.
- Both failures expected the retired NRMCA wording in the two files now explicitly authorized for correction.
- All 60 new Agent1 tests passed.
- Install, Chromium, owner/widget build, 12 dedicated owner browser tests, production Docker build and synthetic no-network voice smoke passed.
- Full suite, result checker and dependency audit were skipped after the strict gate failure.
- `hosted-failed-39162106317.log.gz` preserves the complete decoded test-job log; `hosted-failed-39162106317-jobs.json` preserves all job/step conclusions. Earlier failed local evidence and frozen historical receipts remain untouched.

## Affected-file run before publication

Command (Node 22.23.3 with scratch-only Playwright 1.56.0, a writable TMPDIR and explicit browser-module/cache paths):

```sh
node --test --import ./test/pricebookTestEnv.mjs test/quoteConcreteLandscape20261016.browser.spec.mjs test/quoteConcreteLandscape20261016.dom.spec.mjs
```

Result in `f22-authorized-local.tap.gz`: both DOM tests pass; the three browser tests fail at browser startup because the Chromium executable is unavailable. The installer received unusable archives and a cache lock error (`f22-chromium-install.log.gz`). This is not a passing local browser claim. No assertions or runner behavior were altered to accommodate the environment.

## Final published SHA qualification

At this evidence commit's authoring, complete hosted qualification is pending. The final handoff will identify the actual published SHA and its independently read strict/full/browser/build/Docker/checker/dependency-audit results. No completion claim is authorized while any required gate is incomplete. The existing hosted workflow includes both affected files in the unchanged strict and full suites.
