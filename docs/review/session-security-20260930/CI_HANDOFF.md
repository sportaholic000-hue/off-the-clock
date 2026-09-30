# Remote verification and restart handoff

The source is saved at `08ee7d529112c8db8098bc002dfd9be732a19d3e` and on draft PR #4. Final local application regression passed 382 tests; engine regression passed 357; the production builds and 25 transport tests passed. Nine session and ten account browser workflows passed before the final bcrypt configuration guard. The final browser repeats were launched on that guard's source, but local execution/file reads stopped responding before their outcomes could be retrieved. Do not claim those repeats passed without checking evidence.

A narrow GitHub Actions workflow now verifies this draft PR using a fresh hosted runner, the exact Node version/ABI and locked application dependencies. It runs synthetic application/engine/transport tests and the two production-bundle browser workflows sequentially. It accepts no production provider credentials, makes no deployment, and uploads only sanitized named outcomes/result summaries. It is a CI candidate until an actual run confirms success.

The hosted-runner design follows [GitHub's versioned Node setup](https://github.com/actions/setup-node) and [Playwright's CI setup](https://playwright.dev/docs/ci). This provides verification independent of the failing local runtime; it does not replace the full production-launch acceptance gate.

When resuming on a working computer, clone the PR #4 branch, read docs/WORKING_DIRECTION_20260930.md and the original specifications, install locked dependencies with Node 22.23.2, and reproduce the final browser runs with fresh evidence directories. The original local runs are under work/session-security-evidence and the final-repeat stores under work/session-browser-final and work/session-account-browser-final-v2. Never publish their private token/mail/SQLite payloads.

Voice work is owner-authorized after this security slice. Coordination confirmed the other engine/booking chat is idle, and its 41 files are preserved unchanged. Voice implementation has not begun; the original guide and shared bridge/booking contracts remain authoritative.

The first hosted run (36680944823) returned status 0 for all six verification groups, then failed artifact upload because the action rejected a relative '..' path. A corrected hosted run is pending; final named counts and downloadable evidence will be confirmed from that run.
