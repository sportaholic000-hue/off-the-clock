> **Repair update — September 30:** The later independent delayed-header finding is now repaired and verified at `3e406d2107522319038c6cdd982cfcf08c91e657`. Read [the response-order repair report](../session-response-fix-20260930/FINAL_REPORT.md) for the newer exact-commit proof and rollout requirements. The report below is retained as historical evidence for its stated earlier source; its test counts did not cover the defect.

# Account session security delivery — September 30, 2026

The account/security candidate now has server-side session revocation, short-lived access tokens with browser refresh, confirmed logout, and persistent authentication rate limits. Password reset invalidates every existing session for that account; unrelated owners remain authorized. This closes the session-security follow-up to the separately delivered account email/recovery work.

Tested runtime source: `08ee7d529112c8db8098bc002dfd9be732a19d3e`, draft [PR #4](https://github.com/sportaholic000-hue/off-the-clock/pull/4). Hosted verification ran on `67000e668a0da81fa1a85152256705c843429ca8`, whose server/client/test bytes are identical to this runtime. Later report commits retain those bytes and append this lane's progress to BUILD_STATUS.md. The peer's engine/booking checkpoint `1979792d766d6c2b2fe0dfb856d1651de03eee3f` is a preserved integration parent; all 41 peer files match their published Git blob identities at the tested runtime. Later report commits add only a separate progress paragraph to the peer's BUILD_STATUS.md; its prior text is preserved. The original voice guide remains blob `7329bde3db8e3b38916e1cd6fbe1ca3fffaffaa5`.

## Resulting behavior

- Login/register issue a signed 15-minute access token and an HttpOnly refresh cookie. Refresh rotates a 32-byte secret whose SHA-256 digest alone is stored. The original eight-hour maximum remains absolute; refreshing does not extend it.
- Access requires a current database session and current credentials, account role, owner/staff parent relationship and environment-admin provenance. Changed passwords, removed accounts, changed roles or revoked sessions stop authorizing immediately.
- Reset consumes its durable link, changes the password and revokes all user sessions in one transaction. A revocation failure rolls the entire operation back. A login whose password comparison raced with reset cannot issue a new session using the old password.
- Logout waits for server acknowledgement before clearing browser access. It revokes the selected session, works with an expired signed access token, and clears the matching cookie. An old tab does not revoke or clear a newer account's cookie.
- Refresh requires the cookie plus a signed access token identifying the same session. One refresh receipt has one winner, including across two actual workers. A stale receipt returns a conflict without clearing the winner's cookie; the browser retries using the current cookie.
- Login reservations are persisted before asynchronous password comparison. Five failed/in-flight attempts per IP per fifteen minutes stop further comparisons; a successful login releases only its own window's reservation. Recovery/registration limits persist too. IP identifiers are keyed digests, and the limiter fails closed on store failure.
- Exact trusted origins protect auth mutations. Production cookies use the Secure `__Host-` prefix, Path=/, HttpOnly and SameSite=Lax. Credentialed CORS is limited to configured application origins; public quote/booking CORS stays without credentials.
- Browser identity and saved billing request keys remain stable across access-token rotation. Account changes remount private pages, consumed email fragments preserve recovery completion state, and mobile users have a working sign-out control.
- The required bcrypt minimum of twelve rounds is enforced before registration/reset writes; invalid settings leave accounts, passwords and reset links unchanged.

## Verification

Final source checks and results are in `SOURCE_BINDING.json`, `TEST_RESULTS.json`, `WORKFLOWS.json`, `BUILD_ARTIFACTS.json` and the sanitized run transcripts. Counts overlap and must not be summed as unique tests.

- Final combined application regression: **382 passed, zero failed** across 37 test files.
- Quote engine regression: **357 passed, zero failed**. Its source is unchanged by this lane.
- Browser transport/billing/widget regression: **25 passed, zero failed**.
- Real production-bundle session workflow: **9 checks passed**.
- Existing real signup/email/recovery workflow: **10 checks passed**.
- Both production bundles build successfully through the repository's production runner.
- The final hosted source manifest verifies 184 tracked runtime/test/support files against their GitHub blob identities; the earlier Windows manifest remains in SOURCE_BINDING.json.

The final hosted run passed all six groups on saved source `67000e6`: application 382, engine 357, transport 25, session browser 9, account browser 10, and production builds. [Actions run 36681673043](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36681673043) completed successfully. Named outcomes and result metadata are committed under `hosted/`; the corresponding artifact digest is recorded in HOSTED_ARTIFACT.json. A separate read-only hosted job fetched all seven sanitized evidence files and verified all 184 source entries by Git blob hash and SHA-256. See HOSTED_SOURCE_BINDING.json.

Final local browser repeats were launched but their outcomes could not be retrieved when local execution stopped returning file reads. The fresh hosted browser runs above complete that verification independently. Historical Windows build artifact hashes remain explicitly bound to their prior checkpoint. Tests use isolated synthetic stores, accounts, mail interception and browser sessions. No live email, phone, calendar or billing traffic was performed.

## Retained failures and fixes

The first primitive run failed two Windows cleanup hooks while SQLite connections were still open; the corrected run passes all 18 cases. An initial build command used the wrong module path. Later ad hoc builds retained NODE_ENV=test and selected a development API address; the repository production runner supplies NODE_ENV=production and an empty VITE_API_URL.

Browser r1 stopped on a mismatched synthetic email-fixture label, r2 made no API requests due to the build configuration, and r3 stopped because its email-recipient lookup compared an array to a string. Browser r4 then exposed a real candidate defect: reset completion disappeared when session clearing observed the consumed URL fragment's removal. The recovery component key now preserves that state; subsequent complete browser runs pass. These attempts remain listed separately from final accepted runs. The first hosted run returned success for all six verification groups but failed artifact upload because the action rejected a relative parent path. The corrected run passed verification and artifact upload; the evidence was then copied into Git history.

Automatic review initially rejected a booking-code payload as overlapping the other agent's lane. Read-only checks established that the peer's original file exactly matched its published GitHub blob; an exact hash-checked copy into this isolated test workspace was then accepted. The peer's branch and working copy were unchanged.

## Rollout and remaining launch boundaries

Existing stateless JWTs without a session ID require sign-in again after rollout. Keep the API and frontend on the same site, or use a same-origin API proxy that forwards Cookie and Set-Cookie. SameSite=Lax does not support arbitrary unrelated frontend/API sites. Configure CLIENT_URL and exact CORS_ALLOWED_ORIGINS consistently.

Session/limiter durability depends on preserving the application SQLite database. Connections/processes sharing that database share revocations/counters; independent replica databases do not form a distributed limiter. Use the existing durable-store deployment boundary rather than claiming multi-instance readiness.

This is a verified draft account/security slice. The full public-launch gate remains open. Production email acceptance, deployment/storage restoration and the incomplete voice runtime/live phone-to-calendar path remain separate work. No merge, deployment, original-guide edit, pricing edit or booking behavior edit was performed. The owner authorized voice work after this slice and coordination confirmed the other lane is idle.

New visible copy proposed by this draft includes “Signing out…” and a retry message when a completed password reset cannot finish browser sign-out. Review it with the draft before public release.
