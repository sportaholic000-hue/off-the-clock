# CI headroom — expectations before editing

Base: `03ebb1a9acd0c36381ef166c7c9e78ca2e551ca3`.
Branch: `codex/qe-agent4-ci-headroom-20261019`.

The only authorized existing-file change is `.github/workflows/ci.yml`, changing
`jobs.test.timeout-minutes` from 45 to 60. Every other byte and mode of every
existing file must match the base, including production, tests, assertions,
selectors, specifications, dependencies, v12 and all historical evidence.
All new files are confined to this owned verification directory.

The previous verified test job took 44m33s. Increasing the timeout creates
execution headroom; it is not a performance improvement. Record this new run's
actual duration and remaining margin rather than inferring speed from the limit.

Required exact-head results: 6,164 strict, 8,129 full and 12 dedicated-browser
passing records, zero failures/cancellations/skips/TODOs. Strict selection must
remain 294 files and full selection 368. Every passing-name occurrence must
equal the verified base, including the 88 A1 cases and four independent controls
in each required suite, the eight-service browser coverage and all 1,208 importer
names in full. Preserve intentional repeated names; do not deduplicate them.

Require successful cold install, build, Docker synthetic voice startup, checker
and zero-vulnerability production audit on the exact published SHA. Verify its
single parent, remote ref and tree. Publish only this new branch, without a force
push. Do not cancel any other verification, touch another agent's branch, merge
main, deploy or use subagents. All failures and retrieval diagnostics are retained.
