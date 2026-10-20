# CI test-job headroom — source checkpoint

Exact-head hosted verification remains pending publication of this checkpoint.

Base: `03ebb1a9acd0c36381ef166c7c9e78ca2e551ca3`.
Branch: `codex/qe-agent4-ci-headroom-20261019`.

The only existing-file change is `jobs.test.timeout-minutes: 45 → 60` in
`.github/workflows/ci.yml`. Exact byte replacement and all other inherited blobs
and modes are verified. Production, existing tests/assertions, selectors, engine
v12, specifications, dependencies and all other workflow settings remain intact.
New files are confined to this owned evidence directory.

The unchanged selector retains 294 strict and 368 full files. The expected
passing-name inventory is frozen from the verified base's exact hosted log:
6,164 strict, 8,129 full and 12 dedicated-browser records. The auditor compares
every occurrence and checks A1's 88 cases plus four independent controls in each
required suite, existing eight-service browser coverage and all 1,208 importer
names in full. No additional product behavior or test assertions are introduced.

The base test job passed in 44m33s against a 45-minute limit. This change increases
the permitted runtime only. It does not make execution faster. Final reporting
will record actual elapsed time and margin from hosted job timestamps, with all
required cold install/build/browser/strict/full/Docker/checker/audit gates tied
to the new exact SHA and its single pinned parent.

Historical evidence remains unchanged. Final hosted logs and verification results
will be attached outside Git so recording them does not change the tested SHA.
No other agent's branch or verification is altered or cancelled. No subagents,
main merge, force push, tag or deployment is performed.
