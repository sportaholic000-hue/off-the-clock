# Headroom integration checkpoint

Hosted verification of this new merge is pending publication.

The merge is conflict-free. The only inherited-file change is the exact reviewed
60-minute test-job timeout. No production, tests, assertions or selection changes.
See preservation.json for complete inherited-index verification.

Historical run 39326003260 attempt 1 on cc0f6cf1 ended cancelled after approximately
45 minutes: strict and Docker passed; full suite cancelled; final checker and
dependency audit skipped. Exact run/job API records are retained here.
Job-log retrieval repeatedly returned `Transport closed`; the general fetch
endpoint rejected the job-log URL. No missing log or case audit is represented as
a pass. Attempt 2 was started on that same old SHA before this headroom instruction;
its result cannot qualify the new merge. No other owner's run is cancelled.

Earlier local qualification remains in the preserved integration directory:
1,208 importer cases, 59 focused cases and builds passed; local Chromium SIGTRAP
was recorded. No production/test bytes changed since that qualification.
New exact-head CI and per-case receipt audits are required before final acceptance.
