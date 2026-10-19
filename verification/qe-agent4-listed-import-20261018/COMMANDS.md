# Local commands and environment

Repository branch: codex/qe-agent4-listed-import-20261018.
Node v22.23.3 installed in a separate scratch runtime; repository engine/version
files, manifests and lockfile are unchanged. `npm ci` passed. The CI-specified
Playwright 1.56.0 was installed without saving dependencies or changing lockfile.
TMPDIR points to scratch because `/tmp` is absent in this container. Browser
files are in a scratch PLAYWRIGHT_BROWSERS_PATH; no selectors were changed.

- Baseline retained: `node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-concurrency=1 --test-reporter=tap test/voiceListedPriceConditions20261018.spec.mjs`
- Baseline new: same Node flags, `test/voiceAgent4*.spec.mjs`.
- After focused: same Node flags, retained file plus `test/voiceAgent4*.spec.mjs`.
- Neighboring: same Node flags, retained/new files plus `test/websitePriceImport.spec.mjs test/websitePriceConditionsAudit20261008.spec.mjs test/websitePriceDraftRoutes.spec.mjs test/claudeListedUnits20261008.spec.mjs test/engineAuditListedPrices20261008.spec.mjs test/fixedPricesKnowledge20261005.spec.mjs test/voiceCore20261007.spec.mjs test/voiceSurfacePricing20261016.spec.mjs test/voiceRuntimeRoutes.spec.mjs test/voicePromptCompiler.spec.mjs test/voiceSecurity.spec.mjs`.
- Build: `npm run build`.
- Audit: `npm audit --omit=dev --json` (exit 0, zero vulnerabilities).
- Browser setup: `npx playwright install chromium`, then `npx playwright install chromium --only-shell`; both fail with a stale download lock. The resulting headless-shell binary's launch probe terminates with SIGTRAP.
- Strict: `npm run test:quote`.
- Full: `TEST_RESULTS_FILE=verification/qe-agent4-listed-import-20261018/full.tap npm test` (also runs the unchanged failure checker).
- Exact examples: `node verification/qe-agent4-listed-import-20261018/examples.mjs`, saved before and after production edits.

Setup failures are retained separately, not counted as behavioral baselines:
initial tests could not create `/tmp` directories; an initial synthetic import
fixture lacked a bound call row; an attempted NODE_OPTIONS module-mock flag was
rejected by Node before running either broad gate. The corrected fixture uses a
real bound call row, and broad gates run with the unchanged package commands.

The first strict attempt stalled after top-level test 1529 without a final
summary and was interrupted (exit 130). The two adjacent unchanged fence files
passed 39/39 in an independent diagnostic using the same imports and a 60-second
test timeout. That partial log is retained as `strict-initial-stall.tap`; it is
not a passing gate. Full and strict were then started with the unchanged package
commands and a 1,200-second outer process limit, without any selector changes.

The next full attempt also stopped advancing, after top-level test 2063, without
a final summary. It was interrupted (exit 130) and both logs are preserved as
`full-initial-stall*.{tap,log}`. The custom PLAYWRIGHT_BROWSERS_PATH override was
then removed: installation never completed successfully there. Final local gates
use the default browser lookup and therefore report the missing browser prerequisite
explicitly. This does not skip tests or turn browser failures into passes.

Final broad outcomes: full exited 1 without a final summary at top-level result 4230; cause not established by its output. Its unchanged checker was run independently and rejected the missing summary (exit 1). Strict stopped advancing at top-level result 2933 and was interrupted (exit 130), without a final summary. Neither is a passing or complete local gate. Build-generated client/dist/index.html was restored to its exact base bytes after checks. Only temporary directories created by the interrupted tests were removed. Docker is unavailable (command not found, exit 127).
