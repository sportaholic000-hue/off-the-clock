# Reproduce the account checks

Use Node 22.23.2 and ABI 127, with compatible installed dependencies. Tests need a fresh evidence directory outside the repository. The existing wrapper strips inherited provider credentials, uses a test database and preserves output/source hashes.

From the repository root:

```text
node verification/quotedone/run-resume-check.cjs account-unit ../account-evidence --experimental-test-module-mocks --test --test-concurrency=1 test/accountEmail.spec.mjs test/authTokenService.spec.mjs
node verification/quotedone/run-resume-check.cjs account-build ../account-evidence verification/quotedone/build-resume-client.mjs
node verification/quotedone/run-resume-check.cjs account-browser ../account-evidence verification/auth-email/browser-workflow.mjs . ../account-browser-fresh
node verification/quotedone/run-resume-check.cjs account-transport ../account-evidence --test --test-concurrency=1 client/test/widget-transport.test.mjs client/test/billing-transport.test.mjs
```

For the browser command, set PRICEBOOK_BROWSER_MODULE to Playwright and PRICEBOOK_BROWSER_EXECUTABLE to the installed Chromium/Edge executable. The harness binds ports 4690/4692 on 127.0.0.1. Browser calls go through the real application/auth/database; an explicitly guarded synthetic preload intercepts the Resend endpoint and rejects any unexpected provider URL. It never sends a real email.

The browser's synthetic-email-private.json holds only test-recipient messages/tokens and is kept in the private local evidence directory, not committed. Published WORKFLOWS.json contains only redacted request/response data. Credentials and message bodies are excluded from application logs.

TEST_RESULTS.json records the exact 34-file application command: the pre-existing documented 33-file application list plus test/accountEmail.spec.mjs. Do not call it all tests. The broad attempt and its unchanged-base voice failure are recorded separately. SOURCE_BINDING.json binds the actual tested implementation files.

The failed attempts are retained in RUN_LOGS.txt. Browser attempt 1 needed an assertion correction; attempt 2 exposed the router's fragment-navigation defect; attempt 3 passed after the source fix.
