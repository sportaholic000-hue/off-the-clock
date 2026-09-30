# Session security progress — September 30, 2026

This is an in-progress source backup, not a completed auth or launch gate.

Implemented primitives:
- Database-backed sessions, 15-minute access JWTs and the existing eight-hour absolute maximum.
- Hashed, one-use refresh tokens; refresh preserves the absolute deadline.
- Current credential/role/tenant checks, per-session logout and all-session revocation.
- Atomic, bounded, persistent authentication rate-limit reservations.

Verified locally: 18 tests passed in test/authSessionService.spec.mjs.
Command: node verification/quotedone/run-resume-check.cjs session-primitives-r2 ../session-security-evidence --test --test-concurrency=1 test/authSessionService.spec.mjs
Output: tests 18; pass 18; fail 0; skipped 0.

The first run had 16 passes and two Windows test-cleanup hook failures because temporary databases were deleted before connections closed. Cleanup ordering and target-path verification were fixed; the second run passed. No product safeguard was weakened.

Still required: migration installation, auth route/middleware integration, cookie/origin protections, browser refresh/logout behavior, truly parallel refresh/limit races, reset/login-race checks and full application/browser verification. The primitives are not wired into production routes at this checkpoint.

The other agent's final engine/booking checkpoint is 1979792d766d6c2b2fe0dfb856d1651de03eee3f. It will be incorporated without modifying its runtime or replacing the shared BUILD_STATUS history.

No real provider traffic or deployment.


## Connected source checkpoint (2026-09-30)

The handlers now issue server-backed sessions and HttpOnly refresh cookies, reserve persistent login/recovery limits, expose bound refresh/logout endpoints, and revoke all user sessions during password reset. Middleware requires a valid current session; pre-upgrade stateless JWTs require sign-in again. The browser candidate renews access tokens within the original eight-hour absolute limit, waits for confirmed sign-out, and keeps UI/billing identity stable across token rotation.

Connected backend run `session-integration-first`: **42 tests passed**, comprising 22 account/recovery, 18 session/limiter and 2 CORS tests. No claim yet for new HTTP endpoint tests, browser refresh/sign-out, combined engine checkpoint or complete regression. This is still a draft implementation checkpoint, not a launch gate.


## Integrated test candidate

22 HTTP/browser-transport tests pass, including two concurrent workers sharing one SQLite refresh receipt. Seventeen existing tenant/migration tests pass after their valid-token fixtures were upgraded to session tokens; negative controls remain. The owner application compiles. The first build command failed due to its module path, then the corrected command succeeded; final builds are being repeated after the complete peer-source integration and browser state correction.

The isolated security candidate now restores the engine/booking agent's exact published `1979792d766d6c2b2fe0dfb856d1651de03eee3f` source. Automatic review initially rejected a booking-code payload as overlapping work; read-only verification proved the peer's original file matched GitHub blob `a403eefb71d515a2632de993396d0e2c2d62b207`, and an exact hash-checked copy into this separate test workspace was accepted. The peer's branch and working copy were unchanged. No booking behavior edits were introduced by this lane.

Real browser workflows and combined regression are still pending. No voice implementation or live provider operations have occurred.


## Regression and backup checkpoint

Combined application regression: **380 passed, zero failed** (37 test files; includes account/recovery and session tests). Both bundles pass through the repository's production build runner. GitHub comparison against peer commit `1979792d766d6c2b2fe0dfb856d1651de03eee3f` confirms all 41 peer files, including engine, booking and report history, retain their exact Git blob identities.

Browser attempt r1 failed during synthetic email fixture setup because its expected synthetic credential label did not match. Browser attempt r2 made no application API requests: the ad hoc build had retained `NODE_ENV=test`, selecting the development API URL. The source was rebuilt using `build-resume-client.mjs` with `NODE_ENV=production` and `VITE_API_URL=''`. These are verification setup failures, not accepted launch results. The real browser workflow remains pending.

The five original user-facing chat deliverables are also preserved under `docs/review/thread-deliverables-20260930/`, with dated scope explained in its README. They contain historical assessments; newer source-bound reports supersede repaired findings.


## Browser state regression and correction

Browser r3 passes five workflows, then stops because the fixture email's `to` field is an array and the test compared it to a string. Browser r4 corrects that test lookup and reproduces a genuine issue in this candidate: a successful password reset's message disappears when sign-out observes the consumed fragment's removal. The route now keeps the recovery component key stable when a consumed fragment is removed; a new link or route still receives its own key. The corrected production browser run remains pending. These attempts and their partial successes are retained separately from a final pass.

The full engine regression now passes **357/357**. No voice runtime changes have been made.


The final security review also enforces the platform's minimum bcrypt cost of twelve rounds: unsafe/invalid cost configuration now fails before creating an account or consuming a reset link. Two negative tests cover this requirement. The default remains twelve; the complete application regression and browser workflows are being verified against this final source.
