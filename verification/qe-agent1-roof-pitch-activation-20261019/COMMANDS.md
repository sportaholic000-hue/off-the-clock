# Commands and provenance

All commands use Node22.23.3, `TMPDIR=/workspace/scratch/db2901c56e80/tmp`, synthetic disposable storage and disabled live provider writes. No subagents.

1. `git switch -c codex/qe-agent1-roof-pitch-activation-20261019 2b452feeb1af7c288c19b12bea5b95e48b81920e` (branch created before editing).
2. Read AGENTS.md, BUILD_STATUS and applicable pricing decisions; original AP01/AP02 evidence remains untouched.
3. Wrote EXPECTED.md and independent cases before comparisons.
4. `CAPTURE=1 CASE_FILTER='ROOFING_REPLACEMENT--(base|absent-unknown-pitch-policy.*|absent-over12-adjustment.*)$' node --experimental-test-module-mocks verification/qe-agent1-roof-pitch-activation-20261019/audit.mjs before-01` — expected failing baseline:1match,4mismatches.
5. `CAPTURE=1 REPAIR_CASES=1 CASE_FILTER=historical-missing-measurement node --experimental-test-module-mocks verification/qe-agent1-roof-pitch-activation-20261019/audit.mjs before-02`. Repeated as `before-03` with `CAPTURE_CONTEXT_OFFSET=6` to keep real captured call IDs distinct across isolated capture databases. Both original outputs preserved.
6. Pre-repair normally selected channel/history tests: before-regressions.tap had harness errors (absolute output path used in owner URL; conflicting call IDs). Corrected only new harness, re-ran before-regressions-02.tap:27pass/41fail. Historical full-book equality also exposed a restore clock mismatch, corrected by using the genuine capture timestamp. Pre-repair readiness suite:18pass/25fail. None of these failed logs is discarded. Original five-case HTTP baseline supplies independent unambiguous defect reproduction.
7. Two production readiness conditions repaired in priceBook.js; no other production edit.
8. First focused run:111/111 passed. Added2 comprehensive optional-band overflow controls and actual HTTP stale-approval/replay checks, then ran focused-final.tap.
9. `node --experimental-test-module-mocks verification/qe-agent1-roof-pitch-activation-20261019/audit.mjs audit-161-after-01` —161/161.
10. `REPAIR_CASES=1 node --experimental-test-module-mocks verification/qe-agent1-roof-pitch-activation-20261019/audit.mjs repair-matrix-after-01` —61/61.
11. `npm run build` — owner and widget builds passed; restored only the generated tracked client/dist/index.html output to the pinned source.
12. `python3 verification/qe-agent1-roof-pitch-activation-20261019/pack-evidence.py` — archives complete wire JSON without changing any decompressed bytes; SHA256 index and archive readback checked before redundant gzip removal.

The final focused command is:

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-concurrency=1 test/qeAgent1RoofPitchActivation*.spec.mjs test/qeRoofExactSubtraction20261018.spec.mjs test/qeRoofZeroAdjustments20261018.spec.mjs test/qeAgent1Geometry*.spec.mjs test/qeAgent1ApprovalPrecision20261018.spec.mjs test/qeAgent2IntegrationF16PricePrecision20261019.spec.mjs test/voiceAgent4F18Integration20261018.spec.mjs test/voiceAgent4F18Repair20261018.spec.mjs test/quoteActivationParity20261005.spec.mjs test/quoteCatalogIncludedPricing20261005.spec.mjs test/quoteCatalogScaling20261005.spec.mjs test/qeAgent1Interior*.spec.mjs
```

Strict and full selectors include all three new spec files without selector changes. Channels/history files test both saved widget and actual voice, so are mixed-channel tests, not voice-only files. Hosted CI supplies full strict, full-suite, browser, build, Docker, checker and production dependency-audit evidence on the published commit. No local Chromium/Docker pass is claimed.
