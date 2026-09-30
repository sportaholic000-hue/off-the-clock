# Reproduce the independent PR #4 audit

Use the reviewed commit 8a778d5346f10d69e586d0ae46006238e4fd169c in an isolated checkout. Use Node 22.23.2 (ABI 127), the locked project dependencies, and a local Playwright browser. No real account/provider credentials or live data are needed.

Copy browser-races.mjs from this evidence folder to verification/peer-audit/browser-races.mjs in that checkout. Keep all evidence directories outside the checkout and use a fresh directory per browser run. The historical fixture expects the Node executable at .portable-runtime/node-v22.23.2-win-x64/node.exe; on other platforms the hosted run-ci.mjs shows how it places the same-version executable at that fixture path.

Set PRICEBOOK_BROWSER_MODULE to the absolute installed Playwright module path and PRICEBOOK_BROWSER_EXECUTABLE to the installed browser executable. On the audited Windows machine, the existing Edge installation was used. Set ESBUILD_BINARY_PATH only if needed by that machine's existing esbuild installation.

Run, from the isolated checkout:

~~~text
node verification/quotedone/run-resume-check.cjs audit-auth ../audit-evidence --experimental-test-module-mocks --test --test-concurrency=1 test/authTokenService.spec.mjs test/accountEmail.spec.mjs test/authSessionService.spec.mjs test/authSessionHttp.spec.mjs test/authSessionClient.spec.mjs test/tenantAddon.spec.js test/corsPolicy.spec.mjs
node verification/quotedone/run-resume-check.cjs audit-build ../audit-evidence verification/quotedone/build-resume-client.mjs
node verification/quotedone/run-resume-check.cjs audit-account-browser ../audit-evidence verification/auth-email/browser-workflow.mjs . ../audit-evidence/account-browser
node verification/quotedone/run-resume-check.cjs audit-session-browser ../audit-evidence verification/session-security/browser-workflow.mjs . ../audit-evidence/session-browser
node verification/quotedone/run-resume-check.cjs audit-race-browser ../audit-evidence verification/peer-audit/browser-races.mjs . ../audit-evidence/race-browser
~~~

Here "node" must resolve to the same Node 22.23.2 executable used by the fixture; the actual audit used its absolute .portable-runtime path. The wrapper strips inherited service credentials, points dotenv/database/pricebook paths at synthetic stores, and disables live voice, billing and provider writes.

Expected at the reviewed commit: 93 focused tests pass; both builds pass; account browser has 10 passing checks; session browser has 9 passing checks. The race reproducer completes with two normal controls passing and two product failures recorded as passed:false. It deliberately asserts the pre-repair failure observations. To assess a proposed repair, convert those assertions to the desired behavior: the newer account's cookie remains valid and its next renewal succeeds. A reproduction script exit 0 is not a product pass.

The real UI drives login, logout and account checks. The same-origin test proxy only controls response delivery order. The server's synthetic signing key advances access expiry for the test. It does not replace the authentication/session implementation.

Do not publish the private database, cookies, raw account mail or raw logs. Publish sanitized request/response observations and named outcomes, with exact source binding. Preserve the first failure and the later repaired run separately.

The complete sanitized browser traces are stored as .json.gz to avoid megabytes of repeated onboarding metadata. Gunzip them to read the full JSON; EVIDENCE_INDEX.json records both compressed file hashes and uncompressed trace hashes. No responses were omitted by compression.
