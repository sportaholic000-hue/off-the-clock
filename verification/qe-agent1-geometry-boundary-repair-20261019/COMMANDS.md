# Reproduction commands

Use Node 22.23.3 with a writable TMPDIR. No dependency changes.

```sh
# Capture only on pristine f4978665167538917732dcd061a18a4099f090d8 / v11:
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs verification/qe-agent1-geometry-boundary-repair-20261019/capture-v11.mjs
# The original JSON was compressed losslessly after capture; hashes are in capture-proof.json.

# Offline oracle (not imported by tests; frozen before comparisons):
python3 verification/qe-agent1-geometry-boundary-repair-20261019/prepare-expectations.py

node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-concurrency=1 test/qeAgent1GeometryBoundaries20261019.spec.mjs test/qeAgent1GeometryDelivery20261019.spec.mjs test/qeAgent1GeometryHistorical20261019.spec.mjs test/qeAgent1CoreAccuracy20261018.spec.mjs test/qeAgent1Historical20261018.spec.mjs test/qeRoofExactSubtraction20261018.spec.mjs test/qeRoofZeroAdjustments20261018.spec.mjs test/qeRoofUnderlaymentAccuracy20261018.spec.mjs test/quoteConcreteLandscape20261016.spec.mjs test/quoteStartingValues20261017.spec.mjs test/qeAccuracyIntegration20261018.spec.mjs test/quoteReviewFixes.spec.mjs test/releaseProductionEngineGuard.spec.mjs test/backupRestoreRehearsal.spec.mjs
npm run build
```

The existing hosted CI runs cold npm ci, pinned Playwright/Chromium installation and launch, build, explicit browser regressions, strict quote gate, full suite, empty-known-failure checker, production dependency audit and the separate network-isolated Docker voice-startup smoke. No gates are bypassed.
