# Repair source and browser-test checkpoint

Starting source: b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3. Historical audit: 1de55bebfd6f916404df7493a8b3d7dbd3ba38f2. No historical audit artifacts or excluded application files changed.

The first checkpoint, 6bb9e72ad11fb480b6a6b37b906b3b3490644409, passed hosted run 37513649445: strict quote 2,085/2,085 (95 files), full suite 2,468/2,468, zero failures/skips/cancellations/TODOs. Its source precedes the correction refinements and new route/browser regressions, so that success is not proof of this checkpoint.

Final focused local capture/feed/actual-route/render checks: 35/35, zero failures/skips. The historical after-fix rerun selected twelve assigned experiments: ten complete expectations passed; E05 and E28 retain expected failures of the unowned delivery/older-inbox clauses, while the repaired urgency and corrected-contact clauses now succeed. Mounted E41 succeeds after the documented five-second feed cadence.

New production-browser tests require Chromium and the real compiled owner app, proxying to the actual server with synthetic sessions and temporary SQLite. They cover contact visibility, deep links/reload/Refresh, open-dashboard arrival, in-flight tenant switching and timer cleanup. They deliberately fail if a browser prerequisite is absent.

Local cold installation and build succeed. Cold strict/full suites and exact-source hosted verification remain in progress. No owner-notification, voice-lifecycle or launch-readiness claim is made.
