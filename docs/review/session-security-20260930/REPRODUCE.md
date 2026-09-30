# Reproduce account/session verification

Runtime source: `08ee7d529112c8db8098bc002dfd9be732a19d3e`. Use Windows x64, Node 22.23.2, native module ABI 127 and the locked dependencies. Install/provide Playwright and a Chromium-compatible browser. The saved run used Microsoft Edge and the existing Codex Playwright runtime. Use a fresh evidence directory outside the checkout and fresh run labels; old evidence is intentionally retained.

Set PRICEBOOK_BROWSER_MODULE and PRICEBOOK_BROWSER_EXECUTABLE to those local paths. The wrapper strips inherited credentials, configures a synthetic store, and leaves live provider writes/voice disabled.

```text
node verification/quotedone/run-resume-check.cjs build ../fresh-evidence verification/quotedone/build-resume-client.mjs
node verification/quotedone/run-resume-check.cjs session ../fresh-evidence --test --test-concurrency=1 test/authSessionService.spec.mjs test/authSessionHttp.spec.mjs test/authSessionClient.spec.mjs test/accountEmail.spec.mjs test/corsPolicy.spec.mjs
node verification/quotedone/run-resume-check.cjs transport ../fresh-evidence --test --test-concurrency=1 test/authSessionClient.spec.mjs client/test/widget-transport.test.mjs client/test/billing-transport.test.mjs
node verification/quotedone/run-resume-check.cjs session-browser ../fresh-evidence verification/session-security/browser-workflow.mjs . ../fresh-evidence/session-browser
node verification/quotedone/run-resume-check.cjs account-browser ../fresh-evidence verification/auth-email/browser-workflow.mjs . ../fresh-evidence/account-browser
```

The complete 37-file application and 5-file engine arguments are stored in TEST_RESULTS.json under session-final-application and session-engine-regression. Run them through the same wrapper with fresh labels. The browser fixture serves the production bundle and proxies only to its own isolated application, forwarding cookies and response headers. Its email preload rejects every unexpected external request. Eight-hour expiry is tested with an explicitly synthetic session-row clock adjustment; provider traffic is not used.

The two-worker refresh test synchronizes both workers before they contend on one SQLite receipt. Reset/login races and transaction rollback are deterministic controls. Browser checks exercise actual HTTP authorization, cookie rotation, two tabs, restart, mobile logout failure/retry, two owner devices, another tenant and consumed-fragment recovery state.

Source/artefact hashes and sanitized named outcomes are published. Raw synthetic stores, private token/email fixtures and complete diagnostic payloads stay outside the GitHub source tree. Historical failure classifications identify test setup errors separately from the repaired reset-state product regression.

Hosted reproduction uses `.github/workflows/session-security-verification.yml` and `verification/session-security/run-ci.mjs`: Ubuntu, Node 22.23.2 / ABI 127, locked application dependencies, Playwright 1.63.0 and Chromium for the recorded accepted run. The workflow installs its browser runtime independently; future versions/results must be recorded again. The accepted hosted command arguments and actual source SHA are permanently saved in `hosted/results.json`.
