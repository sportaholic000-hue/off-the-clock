# Independent review of PR #4 — 2026-09-30

PR #4 is not fully signed off: one reproduced session-continuity defect has two real-browser variants. The ordinary account, email-recovery, and session paths pass the independent reruns described below.

Reviewed application HEAD: `8a778d5346f10d69e586d0ae46006238e4fd169c`.
PR #3 base: `1979792d766d6c2b2fe0dfb856d1651de03eee3f`.
Review scope: PR #4 changes, their existing tests/evidence, and independent delayed-response browser probes. No application-source changes, merge, deployment, live email/call/calendar/billing operation, or environment-permission expansion occurred in this audit.

## Confirmed finding — P2: a delayed old response mutates a newer login cookie

The JavaScript identity checks preserve the new account's localStorage access token, but the browser applies an earlier response's Set-Cookie header before those checks can reject the response. The refresh-flight map only coordinates requests within one tab.

Relevant code:
- [refresh response handling and tab-local coordination](https://github.com/sportaholic000-hue/off-the-clock/blob/8a778d5346f10d69e586d0ae46006238e4fd169c/client/src/api.js#L15)
- [logout response handling and login coordination](https://github.com/sportaholic000-hue/off-the-clock/blob/8a778d5346f10d69e586d0ae46006238e4fd169c/client/src/api.js#L38)
- [shared refresh-cookie writes](https://github.com/sportaholic000-hue/off-the-clock/blob/8a778d5346f10d69e586d0ae46006238e4fd169c/server/src/authSessionHttp.js#L24)

**Variant A — delayed refresh:** Sign into A. Let the server finish a successful refresh, but delay its response at the local test proxy. In another tab, sign out A and sign into B through the normal interface. B now has its own access token and refresh cookie. Release A's response. The access token remains B's, but the cookie now points to A's revoked session. B's next renewal returns 401 and clears its browser access token.

**Variant B — delayed logout:** Sign into A in two tabs. Delay delivery of the first tab's successful logout response. Complete logout in the other tab and sign into B. Release the old logout response. Its expiry header deletes B's cookie. B's next renewal returns 401 and clears its browser access token.

Both variants reproduced twice at the reviewed source. The final run has no fixture/browser errors. Normal same-account renewal and normal A sign-out → B sign-in → B renewal passed as positive controls. Application routes, authentication, SQLite, and the production-built UI were real; the test proxy delayed response delivery, and the test signing key advanced access expiry without waiting fifteen minutes.

Impact established: loss of the newer signed-in session. The mismatched account/cookie pair was rejected with 401; cross-tenant authorization bypass was not demonstrated.

Repair acceptance: an earlier account's delayed refresh or logout must not corrupt a later sign-in, including across tabs. Verify actual browser cookies and subsequent renewal, alongside the existing expired-session, reset, logout, rate-limit, draft-preservation, and tenant controls. A JavaScript localStorage-only test does not cover this failure.

The owner-designated account/session chat received the reproducer and is handling the correction. This report makes no claim that a later fix has passed.

## Independently verified

| Check | Result |
|---|---|
| Exact reviewed source | 257 tracked source/test/configuration files match GitHub blobs; generated dist files excluded and rebuilt |
| Focused auth/recovery/session/tenant/CORS tests | 93 passed, 0 failed |
| Production application and widget builds | Both passed |
| Account browser workflow | 10 checks passed |
| Session browser workflow | 9 checks passed |
| New browser controls | 2 passed |
| New delayed-response acceptance cases | 2 failed as described above |
| Engine, booking and original voice preservation | No changes in PR #4's compare for these paths |
| Runtime checkpoint comparison | No server/client-source/test changes from peer-tested 08ee7d5 to reviewed 8a778d5 |

Verified account behavior includes failed-delivery recovery, resend, explicit verification, durable reset after restart, rejection of reused/expired/wrong-purpose links, old-password rejection, revocation across devices, isolation of another tenant, paid-plan gating, and absence of tested secrets from application logs. Secure production cookie attributes are covered by handler tests; local browser runs use loopback HTTP and the test cookie name. Real HTTPS hosting remains an acceptance step.

The peer's hosted results report 382 application tests, 357 engine tests, 25 transport tests, both builds and 19 browser checks passing. I checked the saved outcomes, workflow success, and source continuity. Those full hosted counts are not an additional independent local rerun and overlap with the 93 focused checks.

The earlier GitHub failure was an invalid artifact-upload relative path after tests had passed. Successful subsequent runs include [36681673043](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36681673043) and [36683083577](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36683083577).

## Evidence and reproduction

- `SOURCE_BINDING.json`: exact source blobs and SHA-256 hashes.
- `SCOPE_BINDING.json`: reviewed checkpoints and changed-path comparisons.
- `TEST_RESULTS.json`: local commands, exits, counters, browser outcomes, and log hashes.
- `RUN_LOGS.txt`: selected test names/results, with no credential-bearing raw logs.
- `BROWSER_RACES_R1.json.gz` and `BROWSER_RACES_R2.json.gz`: complete sanitized request/response observations and cookie/session assertions.
- `browser-races.mjs`: final independent reproducer; `browser-races-r1.mjs` preserves the first version.
- `REPRODUCE.md`: execution instructions.

The first race run reached and reproduced both application failures, then failed its fixture-error assertion because the small test web server did not serve favicon.ico. That attempt is retained. The only reproducer change for run 2 returns 204 for that icon; application source stayed identical. Run 2 completed normally while recording both acceptance cases as failed. Its exit 0 means the reproduction completed, not that those product cases passed.

Private synthetic SQLite databases, cookies, mail captures, and raw logs remain excluded from publication. Their files are retained in the separate local evidence directory. Published responses redact passwords and access/reset tokens; records use marked synthetic accounts.

## Remaining launch order

1. Close and independently rerun the session response-ordering finding.
2. Finish the existing phone runtime and prove phone/widget quote parity using the approved owner price book and the original voice guide.
3. Prove real ON/OFF call routing for supported business-phone setups, including the owner-required return to the normal business line when OFF.
4. Complete authorized live acceptance for email inbox/link delivery, calendar connection and exact booking confirmation, and billing/entitlement transitions.
5. Complete the full owner/customer rehearsal plus production HTTPS configuration, persistent storage, backup restoration, monitoring, and the remaining public-site/demo/CRM/operations acceptance gates.

The stored phase list still leaves Phases 2–6 open. Passing the quoting and account slices is not a full-product launch acceptance. Claude can review this exact source and the reproduced finding now.
