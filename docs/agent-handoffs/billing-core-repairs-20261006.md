# Agent 1 — Billing core repairs

Repo: https://github.com/sportaholic000-hue/off-the-clock
Exact starting SHA: b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3
New branch: codex/billing-core-repairs-20261006

Verify the starting SHA. Use a separate clone/worktree; do not substitute main or another agent's moving branch. No subagents.

Implement and verify the FIRST billing repair batch: F01, F02, F03, F04, F05, F06 and F11 from verification/billing-reliability-20261006/REPORT.md. This is implementation authorization for those seven findings, including necessary local migrations and regression tests. Do not merely write another audit.

Read AGENTS.md, specs/BUILD_STATUS.md, governing billing/platform specs, the audit's report/expectations/reproductions, and specs/TRIAL_ENTITLEMENT_DECISION_20261006.md first. That owner-approved decision is binding: Operator trials receive Operator features; QuoteDone trials receive QuoteDone features; 14 days, card required, 60 voice minutes. The separate proposed callback/deadline policy has NOT been approved and is outside this task.

Repair:
- F01: trial activation converges across delivery orders and same-second events.
- F02: unrelated invoice payments or payment-method edits cannot erase unresolved current debt.
- F03: local Checkout expiry cannot create a second subscription when the previous provider session completed but its webhook is delayed.
- F04: current subscription items govern plan access; historical Checkout/invoice lines cannot override them; mixed proration invoices reconcile correctly.
- F05: invoices preserve scheduled cancellation.
- F06: recovery keeps lifecycle status, failure time and grace state consistent.
- F11: supported modern subscription-item period fields persist correctly and participate in receipt integrity.

Reproduce each finding before fixing it. Decide the technical design. Use durable, tenant-bound subscription/invoice/session evidence and atomic transitions; do not patch these failures with arbitrary event-type priority or accept a payment method as proof of settled debt. Preserve idempotency, receipt conflict detection, terminal subscription protection and rollback behavior. Check provider semantics against the installed SDK and official Stripe documentation. Do not invent refund, proration timing or repeat-trial policy.

OWNERSHIP:
You own server/src/billingConfig.js, billingRoutes.js, billingStateService.js, new billing-specific helpers, and billing-only additions to server/src/schema.js and migrations.js. Preserve all unrelated schema. Add new tests with the billingCoreRepair20261006 prefix and evidence under verification/billing-core-repairs-20261006/.

Do not edit server/src/server.js, planAccess.js, any voice/lead/booking module, client code, quote/price-book/import code, AGENTS.md, BUILD_STATUS.md, shared CI, dependency manifests or lockfiles. Do not edit historical audit artifacts. If a genuine dependency outside this ownership is necessary, complete the independent repairs and provide an exact proposed integration patch in your evidence directory; clearly mark the affected finding incomplete. Do not quietly cross ownership or weaken the fix.

Use synthetic accounts, temporary SQLite and local provider stubs only. No live Stripe reads/writes, real charges, subscriptions, refunds, messages or production data. Test fresh and migrated stores, all event permutations, exact/changed-payload retries, concurrent requests, provider timeouts, response loss and process restart. Write expected cents and state transitions BEFORE executing experiments.

Turn relevant audit reproductions into regressions that assert correct behavior; assertions that merely reproduce the old bug are not passing product tests. Run cold npm ci, npm run build, npm run test:quote and npm test. Run targeted migration/provider-contract checks. Where local browser startup is blocked, preserve the failure and use existing GitHub CI; never skip tests or loosen gates.

Commit and push checkpoints to your own branch, verify uploaded SHA/tree, and check hosted results at the exact source revision. No merge, deployment or live-data migration.

Final report: each assigned finding fixed or still open, source/test evidence, migration/recovery behavior, exact tests and counts, verified GitHub SHA and report link. Explicitly keep F07/F08/F09/F10 and incomplete refund/overage/notification/offboarding capabilities open; this batch does not establish launch readiness.
