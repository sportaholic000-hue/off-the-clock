# Agent 1 prompt: billing and paid-access reliability

Repo: https://github.com/sportaholic000-hue/off-the-clock
Base: `codex/quote-release-candidate-20261006` at exact SHA
`73c00622d6f2df31f57773b32e41355a7421f1a3`. Verify the SHA before working;
do not substitute main or another agent's branch. Use a separate clone/worktree
and branch `codex/billing-reliability-audit-20261006`. No subagents.

Perform a focused, independent READ-ONLY audit answering: can a customer pay,
receive the correct access, and keep an accurate subscription state without
duplicate charges, lost activation or unpaid access?

Read AGENTS.md, specs/BUILD_STATUS.md and the governing billing, plan and platform
specifications first. Trace the actual implemented path from plan selection
through checkout, verified webhooks, persisted billing state and backend feature
gates. Cover trials, upgrades/downgrades, renewals, failed payments, cancellation,
refunds and recovery wherever supported; distinguish unsupported behavior from
a defect instead of inventing policy. Inspect client/server agreement.

Start with `server/src/billingConfig.js`, `billingRoutes.js`,
`billingStateService.js`, `client/src/billing.jsx`, `billingTransport.js`, and
their tests, then follow real dependencies. Stress duplicate and out-of-order
events, webhook authentication, repeated requests, partial writes, stale state,
wrong-tenant/customer associations and redirect success without settled payment.
Write expected monetary amounts and access transitions before execution.

Use clearly synthetic accounts, temporary storage and local provider stubs only.
Do not create real checkouts, charges, subscriptions or refunds; do not change
Stripe settings, send messages or touch live data. Run relevant existing tests
cold and add temporary reproductions for weak coverage. Separate environment
failures from defects. Passing tests and historical approval labels are not proof.

Confirm every defect with source and execution. Report severity, business impact,
file/line, minimal synthetic reproduction, expected rule/result, actual result,
root cause and recommended fix. Resolve each suspicion to a conclusion. Identify
genuine policy conflicts separately; do not ask the owner to debug trade math.

Do not edit production source, shared tests, AGENTS.md, BUILD_STATUS.md, CI,
quote/price-book code, website imports or another agent's files. Save only your
report and synthetic reproduction artifacts under
`verification/billing-reliability-20261006/` on your own branch. Commit and push
those artifacts to GitHub and verify the uploaded revision. No merge, deployment
or application fixes in this task.

End with a prioritized paid-pilot blocker list, exact audited SHA, tests and
experiment counts, and the verified GitHub report link. State plainly if there
are no confirmed defects. Do not claim release readiness beyond this scope.
