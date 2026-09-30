# Auth CI assertion correction — September 30, 2026

Tested PR #4 head: `ad925d0fa368f295fd2f22b53ef115c55b5f4bdb`. [Exact-head hosted run 36746295639](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36746295639) passed all eight verification groups and artifact upload. The tested PR branch has not been moved for this evidence backup.

The report-only repeat at `1d618cd77cf127943bddded681892dafc95ecec2` failed [run 36743299771](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36743299771) in the browser session workflow after its login check. Its builds, 388 application / 357 engine / 25 transport tests and evidence upload passed. This differs from the earlier upload-path failure.

That run retained safe outcomes but did not export its raw assertion, so diagnosis used a controlled reproduction. The immediately following assertion incorrectly required a renewed access JWT to differ from the original still-valid JWT. The browser fixture had artificially expired a copy. With a fixed server second, renewal restores the identical original JWT and correctly rotates the refresh receipt. The original assertion fails deterministically, while refresh returns 200 and the synthetic database contains two receipts with exactly one consumed. [Local evidence](LOCAL_RESULTS.json).

The corrected test compares against the expired credential actually submitted, verifies the signature, correct session, future expiry, real authorized request, successful refresh, rotated HttpOnly cookie and preserved unsaved form. A test-only clock explicitly proves the same-second case. Normal browser checks continue to use the real server clock. Safe failure metadata records phase, error type/code and assertion operator without publishing JWT actual/expected values.

Validation on the exact saved head:
- Local normal browser: 9 passed, zero browser errors.
- Local controlled same-second browser: 2 passed, zero browser errors; the original assertion fails under the same control as expected.
- Hosted: both production bundles, 388 application / 357 engine / 25 transport tests and 9 normal session + 2 controlled same-second + 10 account + 7 response-order browser checks passed. Counts overlap.
- [212-file binding](SOURCE_BINDING.json) matches the tested Git blob hashes. [Permanent hosted outcomes](CI_RESULTS.json) and [prior failed-run outcomes](PRIOR_CI_FAILURE.json) are retained.

Only verification and documentation changed. Production auth, quote engine, booking, calendar, voice and client implementation bytes are unchanged. The owner assigned voice and ON/OFF to Claude; this chat remains in auth/session/CI. Independent auth recheck and separate engine/provider/launch gates remain. No merge, deployment, live provider traffic or production configuration change occurred.

Raw JWT-bearing assertion output and private stores are excluded from GitHub. [Reproduction instructions](REPRODUCE.md) retain the exact controlled repro source.
