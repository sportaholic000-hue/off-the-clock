# Stopped backend source preservation

This branch preserves the 26 staged application-source files left when the backend agent was stopped. Their canonical Git file bytes match the captured index exactly. Three files use Windows CRLF line endings in the working directory; Git stores their equivalent LF form. Both forms have recorded SHA256 hashes. No other byte differences were found.

It descends from backend WIP `38e30c53452c92b6b55f0b610095d60967858d2f`. The original backend branch subsequently published handoff commit `3d2eedb74f31494eb2086abcfa1f0702b094d7b7`; all 26 captured source blob IDs still match. Existing PR #3 and its head are unchanged.

**Unverified recovery material. Do not merge, deploy, or treat this as a launch-ready build.** The previous WIP checkpoint was reported to have a syntax defect. This preservation step does not establish recovery completeness, correct behavior, or passing tests. Any original source not reconstructed before the agent stopped is outside this snapshot.

[File hashes and limitations](STOPPED_SOURCE_SNAPSHOT_20260929.json) bind the preserved files. The backend checkout and index were read only. No repair, rollback, cleanup, reset, dependency installation, database upload or provider operation was performed by this preservation step.

The pre-incident GitHub baseline is `d2b20520cdd056e0b3ffea6f46219df7e8af3f0d`. It has documented unresolved application concerns and is not a claim of launch readiness. The accepted arithmetic engine tree is unchanged at `dcd481193b10c3cfc667cb23d22fb41b16322cff`; the original voice guide is unchanged at blob `7329bde3db8e3b38916e1cd6fbe1ca3fffaffaa5`.
