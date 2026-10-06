# Agent 2 prompt: captured leads and owner delivery

Repo: https://github.com/sportaholic000-hue/off-the-clock
Base: `codex/quote-release-candidate-20261006` at exact SHA
`73c00622d6f2df31f57773b32e41355a7421f1a3`. Verify the SHA before working;
do not substitute main or another agent's branch. Use a separate clone/worktree
and branch `codex/lead-delivery-audit-20261006`. No subagents.

Perform a focused, independent READ-ONLY audit answering: when a prospective
customer contacts a business, does their request reliably reach the right owner
with enough accurate information to follow up and win the job?

Read AGENTS.md, specs/BUILD_STATUS.md and the governing lead, receptionist,
notification and owner-call specifications first. Trace phone and web lead
capture through durable storage, tenant ownership, owner dashboard visibility,
notification attempts, retry/failure states and follow-up information. Follow
actual code paths; start with `server/src/ownerCallService.js`,
`ownerCallRoutes.js`, the voice captureLead path and their real dependencies.
Audit configured delivery channels only; do not assume a channel exists.

Stress duplicate events, repeated submissions, timeouts after persistence,
notification-provider failures, incomplete contact details, wrong-owner IDs,
stale call/lead handles, concurrent requests, missing configuration and restarts.
Verify that a caller is never told their request was saved, delivered or booked
before the corresponding operation succeeds. Check that an owner can distinguish
delivery failure from successful delivery and recover the saved request.
Readiness labels must agree with the backend behavior. Check for cross-tenant
exposure and sensitive customer data leaking into inappropriate logs.

Use clearly synthetic callers and temporary stores with local provider stubs.
No real phone calls, SMS, email, recordings, number purchases, provider changes
or live-data writes. Do not audit pricing arithmetic, website price extraction,
subscription billing or payment access gates; those belong to other workstreams.
Run relevant existing tests cold and add temporary reproductions where needed.
Separate environment failures from product defects; do not trust old reports.

Confirm every defect with source and execution. Report severity, lost-lead or
customer impact, file/line, smallest reproduction, expected rule/result, actual
result, root cause and recommended fix. Resolve suspicions instead of leaving
unverified concerns. List genuine policy conflicts separately.

Do not edit production source, shared tests, AGENTS.md, BUILD_STATUS.md, CI,
quote/price-book code, website imports or another agent's files. Save only your
report and synthetic reproduction artifacts under
`verification/lead-delivery-20261006/` on your own branch. Commit and push those
artifacts to GitHub and verify the uploaded revision. No merge, deployment or
application fixes in this task.

End with a prioritized paid-pilot blocker list, exact audited SHA, tests and
experiment counts, and the verified GitHub report link. State plainly if there
are no confirmed defects. Do not claim release readiness beyond this scope.
