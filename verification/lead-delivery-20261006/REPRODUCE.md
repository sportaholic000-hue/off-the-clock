# Reproduce the lead-delivery audit

Audited application commit: `73c00622d6f2df31f57773b32e41355a7421f1a3`, from `codex/quote-release-candidate-20261006`. The application files on the audit branch remain identical to that commit; only this directory is added. Work in a separate clone. Confirm the parent/source commit and the hashes in `source-binding.json` before interpreting results. Do not substitute a newer application branch.

Read `EXPECTED.md` before executing. It records the intended outcomes independently of observed results. `REPORT.md` adjudicates the observations against source and specifications; a mismatch is not automatically a distinct defect.

## Environment and safety

The successful cold run used Node **22.23.3**, npm **11.9.0**, the unchanged project lockfile, and a Linux temporary directory. An initially available Node 24 runtime was not used for the product runs because the SQLite native dependency needed a compatible runtime. This was an environment setup issue, not a product finding.

Run from the repository root, with Node 22 on `PATH`. Use a new scratch directory for temporary stores. Do not load production credentials or an application `.env`. The scripts create their own clearly synthetic tenants and callers, temporary databases and price-book directories, local HTTP/WebSocket servers, synthetic signatures and injected provider stubs. They remove their temporary stores on completion. No carrier, model, SMS, email, forwarding, purchase, recording or live customer operations are executed. Imported modules and child processes use synthetic configuration; public-origin `.invalid` URLs in signed fixtures do not become network destinations.

The fixture account records satisfy existing access prerequisites; billing behavior is outside this audit. Saved quote receipts in delivery experiments are synthetic fixtures; no pricing arithmetic is claimed verified. The phone tests use text and synthetic media envelopes, not real recordings. The build regenerates tracked `client/dist/index.html`; restore it to the audited commit after verification and do not commit generated application changes.

```bash
mkdir -p /path/to/scratch/lead-audit-temp
export TMPDIR=/path/to/scratch/lead-audit-temp
export NODE_NO_WARNINGS=1
node --version
npm --version
npm ci > verification/lead-delivery-20261006/cold-npm-ci.log 2>&1
npm run build > verification/lead-delivery-20261006/cold-build.log 2>&1
```

`NODE_NO_WARNINGS=1` prevents the execution environment's injected proxy warning from contaminating subprocess JSON. Dependency-install notices, the Vite bundle-size warning and the React renderer deprecation notice are not product test failures.

## Cold existing tests

Each command starts a fresh Node test process. Current product test fixtures/mocks are retained unmodified. No application or shared test changes are required.

First group: **23 files, 229 passing tests**.

```bash
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs \
  --test-concurrency=1 --test --test-reporter=tap \
  test/ownerCallVisibility.spec.mjs \
  test/ownerCallVisibilityHttp.spec.mjs \
  test/ownerCallVisibilityRendering.spec.mjs \
  test/voicePersistence.spec.mjs \
  test/voiceSecurity.spec.mjs \
  test/voiceRuntimeRoutes.spec.mjs \
  test/voiceWebSocketServer.spec.mjs \
  test/voiceEntryPoint20261005.spec.mjs \
  test/voicePromptCompiler.spec.mjs \
  test/geminiMediaBridge.spec.mjs \
  test/googleGenAiLiveAdapter.spec.mjs \
  test/ownerIntegrations.spec.mjs \
  test/integrationDownloads.spec.mjs \
  test/applicationPersistence.spec.mjs \
  test/bookingService.spec.mjs \
  test/bookingRoutes.spec.mjs \
  test/bookingPreferenceService.spec.mjs \
  test/bookingAdminRoutes.spec.mjs \
  test/bookingAdminService.spec.mjs \
  test/ownerCalendarService.spec.mjs \
  test/lifecycle.spec.mjs \
  test/serviceArea.spec.mjs \
  test/onboardingServiceArea.spec.mjs \
  > verification/lead-delivery-20261006/cold-existing.tap 2>&1
```

Second group: **five files, 47 passing tests**.

```bash
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs \
  --test-concurrency=1 --test --test-reporter=tap \
  test/widgetEmbed.spec.mjs \
  client/test/widget-transport.test.mjs \
  test/bookingTokenReceipt.spec.mjs \
  test/voiceQuotePathRegression20261005.spec.mjs \
  test/voiceQuoteDateIntegration.spec.mjs \
  > verification/lead-delivery-20261006/cold-additional.tap 2>&1
```

Third group: **three files, 15 passing tests**.

```bash
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs \
  --test-concurrency=1 --test --test-reporter=tap \
  test/bookingCapabilities.spec.mjs \
  test/calendarForm.spec.mjs \
  test/voiceAudioCodec.spec.mjs \
  > verification/lead-delivery-20261006/cold-support.tap 2>&1
```

The total is **291 tests across 31 files**, with zero failures, cancellations, skips or TODOs. Existing voice quote-path/date tests are included for capture/handoff behavior; their passing pricing assertions are not an independent pricing audit. Full pricing, billing and payment suites are deliberately outside the scope of this audit.

## Independent reproductions

```bash
node verification/lead-delivery-20261006/reproduce.mjs \
  > verification/lead-delivery-20261006/experiments.log 2>&1
node verification/lead-delivery-20261006/phone.mjs \
  > verification/lead-delivery-20261006/phone.log 2>&1
```

`reproduce.mjs` runs **33** experiments using the real lead/booking/owner/webhook handlers and local routes. It includes owner/staff isolation, persistence faults and lost acknowledgements, a second independent process for web replay, contact corrections, opaque handles, provider retries, signed data exports, server rendering of the actual Calls component, readiness logic and production asset routing.

`phone.mjs` runs **11** experiments using signed local inbound HTTP, real WebSocket routing/bridge/persistence and a local stub for Google sessions. Its process-restart experiment restores a synthetic crash snapshot and starts the actual application server in a cold child process. Duplicate inbound and concurrent-call experiments open only local synthetic sessions.

For the **one** mounted-dashboard experiment, install the renderer **outside the repository** without changing any project package or lockfile. It must share the application's React singleton:

```bash
npm install --prefix /path/to/scratch/lead-audit-renderer --no-audit --no-fund \
  react-test-renderer@19.2.7 react@19.2.7
mv /path/to/scratch/lead-audit-renderer/node_modules/react \
  /path/to/scratch/lead-audit-renderer/node_modules/react-isolated-unused
ln -s /absolute/path/to/audit-clone/node_modules/react \
  /path/to/scratch/lead-audit-renderer/node_modules/react
AUDIT_RENDERER_PATH=/path/to/scratch/lead-audit-renderer/node_modules/react-test-renderer \
  node verification/lead-delivery-20261006/render-live.mjs \
  > verification/lead-delivery-20261006/live-render.log 2>&1
```

The mounted test runs the real Dashboard hooks and reads actual local API data from its temporary SQLite store. It proves the initial stored call renders, then independently confirms a second call exists in the backend while the open dashboard issues no additional reads and does not display it. The source has no update subscription or polling path. No new product dependency is introduced.

The three scripts write `results.json`, `phone-results.json`, `live-render-results.json`, and the Calls server-rendered HTML artifact. Synthetic IDs and temporary paths may vary on rerun; invariant assertions and finding IDs should remain stable. The scripts catch experiment errors to keep gathering evidence: inspect every `experimentError`, not only process exit status. **Exit zero means completed observations, not a clean product.** The recorded final run contains 45 experiments, 11 expected outcomes met, 34 mismatches and zero experiment errors. Repeated observations are grouped in the report; E09 is narrowed to the reachable E42 path, and E35 is a policy conflict.

Regenerate the report and bindings after successful runs:

```bash
python3 verification/lead-delivery-20261006/write-report.py
git restore --source=73c00622d6f2df31f57773b32e41355a7421f1a3 -- client/dist/index.html
git diff --name-only 73c00622d6f2df31f57773b32e41355a7421f1a3
```

Only `verification/lead-delivery-20261006/` may differ in a published audit revision. The report writer reads existing observations and logs; it does not execute or repair the application. The source-binding manifest uses the exact audited Git objects. Publishing instructions are intentionally separate from reproductions: no reproduction script commits, pushes, merges, deploys or changes provider configuration.
