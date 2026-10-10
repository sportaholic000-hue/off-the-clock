# Office-staff login verification

Base: `be473b6542c498a6e96b056b5be2c3d59d9e4055` (`claude/release-candidate-20261009d`, newest matching GitHub head at start). Branch: `feat/staff-login-20261009`.

Handwritten expectations were recorded in [EXPECTED.md](EXPECTED.md) before implementation and test execution. Every new UI, API and email string is enumerated in [PROPOSED_COPY.md](PROPOSED_COPY.md), proposed pending owner approval.

The staff seat rule is Starter 0, Operator 1, QuoteDone 1, Scale unlimited. A downgrade suspends excess sessions on every access and refresh; it does not erase the account. Restoring the plan restores access. Invitations use durable, one-use 24-hour email tokens, bind to the account's owner and email, and let the invitee choose the password. Owner-only mutations cover invite, resend, cancel and removal; removal revokes sessions. Staff can read calls, leads, quotes, calendar and customers and can queue a saved quote email, but cannot access pricing, billing, reports or team controls.

Only synthetic users, provider stubs and example.invalid addresses were used. No text messages or external account operations were performed. The price engine and arithmetic were unchanged. The production client build succeeded; tracked `client/dist` is restored before commit.

## Focused evidence

| Test | Expected | Actual |
| --- | --- | --- |
| `test/staffLogin20261009.spec.mjs` | Nine scenarios: seat limits, pending/active/suspended transitions, expiry, one use, resend/cancel, failed delivery retry, binding, immediate revocation, tenant isolation and fake quote email. | 9/9 passed. |
| `test/staffLogin20261009.dom.spec.mjs` | Owner actions and status, five-item staff navigation, failed fake delivery visible for resend. | 3/3 passed. |
| `test/tenantIsolationRoutes.spec.mjs` | Route matrix enforces staff allowed areas and owner-only controls across two synthetic businesses. | 269/269 passed in focused run. |
| `test/ownerDashboard20261007TenantHttp.spec.mjs` | Staff report reads are 403; owner read and settings semantics remain. | 6/6 passed in focused run. |
| `test/ownerDashboard20261007.browser.spec.mjs` | Staff Reports navigation resolves to Calls; no blank screen or owner report controls. | 6/6 passed in targeted Chromium run. |
| `test/ownerQueryCoverage20261009.spec.mjs` | Exact exception inventory accepts the one pre-binding ownerId lookup and the auth token schema migration. | Passed in focused run. |

## Full gates

`npm run test:quote`, with the installed Playwright module and a single CPU assigned for this sandbox, completed **3,237 total / 3,237 passed / 0 failed / 0 skipped** across 159 selected files. The gate exited 0.

`npm test` completed **4,626 total / 4,623 passed / 3 failed / 0 skipped**. The three failures were the unchanged `test/quoteCatalogIncludedPricing20261005.spec.mjs` wall-clock assertions `cross_last` quick, `cross_last` public, and `different_basis` public: respectively 2,053/2,064 ms, 1,774/1,777 ms, and 4,025/4,032 ms elapsed/timer delay versus a 1,500 ms ceiling. The catalog test passes 26/26 in an isolated two-CPU recheck, while Chromium in this sandbox launched reliably only in the one-CPU full run and later crashed with SIGTRAP even in targeted rechecks. Attempts to restart the 231-file full gate after that run produced no TAP output and were interrupted. This means the full `npm test` gate did not pass; no production quote arithmetic was changed. The suites are not added together.

The exact proposed UI, help, API and email wording is listed in [PROPOSED_COPY.md](PROPOSED_COPY.md), pending owner approval. No live email, phone, billing or model account was used.
