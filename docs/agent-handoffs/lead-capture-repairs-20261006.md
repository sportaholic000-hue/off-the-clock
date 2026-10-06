# Agent 2 — Lead capture and follow-up repairs

Repo: https://github.com/sportaholic000-hue/off-the-clock
Exact starting SHA: b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3
New branch: codex/lead-capture-repairs-20261006

Verify the starting SHA. Use a separate clone/worktree; do not substitute main or another agent's moving branch. No subagents.

Implement and verify the FIRST lead-capture/follow-up repair batch: D01, D03, D09, D10, D11, D12, D13, D17, D18, D22, D23, D29 and D30. This authorizes production fixes and regression tests for those thirteen findings. Do not merely write another audit.

Read AGENTS.md, specs/BUILD_STATUS.md and governing lead, voice, owner/staff and follow-up specs first. Read the report, expectations and relevant reproductions at exact audit commit:
1de55bebfd6f916404df7493a8b3d7dbd3ba38f2
Path: verification/lead-delivery-20261006/
Fetch/read that exact commit without merging its branch. Its audited application source matches the starting application source; the starting commit also includes the approved selected-plan trial decision.

Repair:
- D01: preserve caller request notes and description through storage and owner/staff views.
- D03: persist and display urgency/reason on the relevant call/request.
- D09/D10: accept usable nameless inquiries and make schema-valid urgency inputs work.
- D11/D12/D13: contact corrections update the same inquiry, retries preserve owner disposition, and omitted email does not erase known contact.
- D17: preserve saved voice email in lead webhooks and CSV.
- D18: standalone quote-review requests create/bind actionable follow-up with available caller contact.
- D22/D23: expose corrected preferred-time contact and safe instant-inquiry contact to authorized owners/staff.
- D29: production Calls deep links and refresh work.
- D30: an open dashboard receives newly saved calls reliably.

Reproduce each finding before fixing it. Preserve distinct genuine inquiries, historical receipts and correction provenance. Never recalculate a stored quote or expose rates/costs/private pricing evidence to staff. Keep all reads/writes tenant-bound. Persisting an urgency flag is NOT proof that the owner was notified.

OWNERSHIP:
You own the relevant capture/urgency/request handlers in server/src/voice/voiceToolRuntime.js, toolSchemas.js, ownerRecordViews.js, ownerCallService.js, quoteDoneRoutes.js, integrationData.js, outboundWebhookSchema.js, productionAssets.js and the contact/feed presentation in client/src/calls.jsx, dashboard.jsx and quotedone.jsx. You may add lead-specific helpers and tests prefixed leadCaptureRepair20261006. Store evidence under verification/lead-capture-repairs-20261006/.

Do not edit billing modules, planAccess.js, schema.js, migrations.js, server.js, productionVoiceRuntime.js, voicePersistence.js, the media bridge/adapter, quote arithmetic/approvals/receipts, price-book/import code, AGENTS.md, BUILD_STATUS.md, shared CI, dependency manifests or lockfiles. Use existing storage fields where sufficient. If a correct repair genuinely requires an excluded file, complete the independent work and provide an exact proposed integration patch with the affected finding explicitly incomplete; do not force a bad workaround or quietly cross ownership.

The callback/deadline rule is still PROPOSED, not approved. Do not change specs/voice_quote_flows.md, voicePromptCompiler.js or timing policy. Do not implement notification delivery, SMS/transfer adapters, session recovery, concurrency or minute metering in this batch; those need a coordinated follow-up.

Use synthetic callers, temporary storage and local stubs only. No real phone calls, SMS/email, recordings, provider operations, deployment or production data. Test missing fields, corrected contact, exact/changed-payload retries, restart, database failure, dismissed leads and wrong-tenant/staff access. Write expected outcomes before execution. Preserve all existing quote amounts.

Add regressions asserting corrected behavior, including actual routes and rendered/browser behavior for contact visibility, Calls navigation and dashboard updates. Avoid unbounded polling, duplicate timers and stale-tenant state. Run cold npm ci, npm run build, npm run test:quote and npm test. Keep environment failures separate; use existing hosted CI when local browsers cannot start. Never weaken tests or gates.

Commit/push checkpoints to your branch and verify the uploaded SHA/tree and exact-source hosted results. Do not merge or deploy. Preserve the historical audit.

Final report: each assigned finding fixed or still open, source/execution evidence, tests/counts, verified GitHub SHA/link, and all remaining audit defects. Do not claim owner delivery, voice lifecycle reliability or launch readiness from this capture-only batch.
