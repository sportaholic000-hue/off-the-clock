# CI renewal assertion correction — September 30, 2026

The final report-only PR #4 commit `1d618cd77cf127943bddded681892dafc95ecec2` failed [run 36743299771](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36743299771) in the session browser workflow after its login check. Builds, 388 application tests, 357 engine regression tests and 25 transport tests passed; the artifact upload succeeded. This is a different failure from the earlier artifact-path error.

The failed run retained only safe outcome summaries, not its raw assertion output. A controlled browser reproduction of the next assertion deterministically fails: the test compares renewal against the original still-valid JWT, although the fixture artificially expires a copy. When login and renewal use the same second, the server legitimately restores the same original access JWT while rotating the refresh receipt. The test should compare against the expired credential it actually submitted.

The correction preserves production auth behavior and verifies the renewed signed credential, future expiry, correct session, actual authorization, successful refresh response, rotated HttpOnly cookie and preserved unsaved form. A test-only clock forces the same-second case; the corrected browser fixture passes both checks. The original assertion fails under the same control. The normal nine-check workflow and exact saved-head GitHub CI remain pending at this source checkpoint. Safe phase/error/operator metadata will now identify browser assertion failures without publishing JWT values.

The owner assigned voice and ON/OFF work to Claude on September 30. This chat remains in auth/session/CI. No application, quote engine, booking, calendar or voice source is changed in this correction. Passing regression counts do not certify the entire quote engine or product launch.

Follow draft [PR #4](https://github.com/sportaholic000-hue/off-the-clock/pull/4) for the eventual exact-head result and permanent evidence link.
