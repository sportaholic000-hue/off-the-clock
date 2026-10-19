# Remaining-service public-intake review

Review base: `1f8b1a20e1b910c7787a05dd820814894b01a961` (approved A3). Unique branch: `codex/qe-agent1-remaining-services-chromium-review-20261019`. Personal execution; no subagents. Only new A1 test/evidence files are changed. A2's branch is untouched.

## Coverage and independent expectations

`EXPECTED.md` and `cases.mjs` record the twelve base/corrected amounts before comparisons. The new normal browser regression runs88 independent cases across the twelve services missing from A3's representative eight-service Chromium suite. It uses production CustomerQuote, the real application public catalog/prepare/final handlers and disposable SQLite/books. Mounting HTML is test supplied; quote HTTP responses are never mocked. Failures are recorded per case and do not stop later services.

The review checks valid rendering/persistence/exact cents, rendered corrections, invalid-input correction/recovery, real stale-scope proof rejection, immutable original receipt replay after correction, stale proofs after saved price edits, and original replay after server restart. Additional transitions cover fence removal, flat-roof partial scope, patio measurement methods and selected unpriced floor removal. Hosted test diagnostics contain a lossless compressed evidence bundle without modifying workflows.

## Local results before hosted Chromium

- HTTP preflight03: **36/36 passed**, exit0. Every service has independently checked base and corrected exact cents and an invalid-input review control. Every successful quote also receives an exact HTTP receipt retry.
- Owner/widget build: passed, exit0. Generated tracked index restored exactly to the approved base.
- Chromium startup: blocked locally by SIGTRAP. No local rendered-browser pass is claimed. The real application setup/save/confirmation/approval/catalog completed before launch failed; its evidence is retained in local-chromium-01.
- HTTP preflight01 and02:25 passed /11 failed because the60/minute public limiter was reached. These are harness failures, not product findings. The inherited application fixture freezes Date.now, so adding wall-time pacing alone did not expire its window. Preflight03 and the final harness pace requests1.1seconds apart and update only the fixture's synthetic clock by actual elapsed wall time. Production rate limiting is unchanged; no limiter reset, disablement or identity rotation.
- The Playwright browser installer failed to maintain its local download lock. The matching official Chromium1194 headless archive was downloaded separately; its SHA256 is `d745c7210cc88b73c7991a22c9624819960d84bc3de77ac7336d2de841a8c91f`. It also exitsSIGTRAP here. No dependency or lockfile is changed.

Hosted browser/strict/full conclusions are pending at this checkpoint. No defect is declared from source suspicion or an environment/harness failure. Exact published identity, actual Chromium findings and final hosted results will be reported after execution.

## Commands

```sh
node verification/qe-agent1-remaining-public-intake-20261019/http-preflight.mjs <new-output-directory>
node verification/qe-agent1-remaining-public-intake-20261019/browser-audit.mjs . <new-output-directory>
node --test test/qeAgent1RemainingPublicIntake20261019.browser.spec.mjs
npm run build
```

Local runtime Node22.23.3; Playwright1.56.0 tooling is installed outside the repository. Existing A3 tests/assertions, all production, specifications, versions, approvals, selectors and workflows are preserved. This review does not cover actual provider calls, deployment or every possible configuration within each service; F2 remains outside scope.
