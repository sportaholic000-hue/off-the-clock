# Authorized v8 test reconciliation

Parent: `7cd59af56bcb49709d785ae1120618f2a4991c59`.
This follow-up changes tests and evidence only. Production behavior, the v8
approval guard, historical fixtures and every existing dollar expectation stay
unchanged. No other agent's production files are touched.

## Expectations written before execution

- The current engine must be `quote-engine-vnext-accuracy-20261018-v8`.
- Frozen metadata must start as `quote-engine-vnext-date-context-20261006-v7`.
- Reconcile only a clone's `engineVersion`, `calculationRecord.engineVersion`,
  `options[*].calculationRecord.engineVersion`, and
  `calculationRecord.options[*].engineVersion`. The first two applicable paths
  precede the no-options return. No recursive replacement or fixture rewriting.
- The seven historical manual/AI books begin stale. Reading and ordinary saving
  do not renew approval; stale adoption returns HTTP 409 without writing.
- Explicit saved-configuration approval supplies the current revision,
  configuration/legacy confirmations and every current AI confirmation field.
  It must leave the saved pricing object unchanged before the existing adoption
  assertions run.
- Both browser adoption tests first click the real adoption button while stale
  and expect 409. After explicit production-API reapproval and a reload, the
  original browser adoption interaction must succeed. No approval metadata is
  stamped directly.
- All 21 original roofing regressions remain. One additional regression checks
  the explicit metadata paths, the no-options case, rejection of unexpected
  historical versions, input immutability and unrelated version-text retention.

## Local verification before publication

Node 22.23.0; the existing installed dependencies and Playwright 1.56.0 are used.

Command:

```sh
node --experimental-test-module-mocks --test --test-reporter=tap test/everytrade20261017.spec.mjs test/quoteStartingValues20261017.spec.mjs test/qeRoofUnderlaymentAccuracy20261018.spec.mjs
```

Result: tests 82, suites 0, pass 82, fail 0, cancelled 0, skipped 0, todo 0.
Raw output: `reconciliation-focused.tap`.

`npm run build` passed. The local four-test browser run failed all four tests
at the shared Chromium startup hook (missing headless executable); a separate
probe of the available Chromium executable exited with SIGSEGV. No local browser
pass is claimed. Browser raw output: `reconciliation-browser.tap`.

The local strict gate and full suite are run without test changes or skips.
A 600-second process watchdog bounds a possible stalled local strict runner;
an incomplete run will be reported as incomplete, never as passing. Final local
counts and exact-commit hosted results are reported directly in the handoff.
Hosted CI must install working Chromium and complete both strict and full suites.

No dependency, workflow, specification, price, production code or historical
receipt changes are part of this follow-up.
