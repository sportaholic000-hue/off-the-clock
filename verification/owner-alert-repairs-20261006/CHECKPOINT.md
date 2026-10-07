# Callback and owner-alert repair checkpoint — verification in progress

Historical checkpoint. The completed source verification, remaining policy question and limitations are recorded in [REPORT.md](REPORT.md) and `hosted-results.json`.

Policy question: Should callback and quote deadlines come only from owner-approved settings, with no deadline promised when none is configured? Recommended: yes. This is a business commitment; timing policy has not been implemented or changed.

Starting SHA: 53d6833867dcff42a6ba652e74d26364f4fa1ff1.
Source/execution reproduction: EXPECTED.md, reproduce.mjs and before.json.
Failed transfer with caller words previously produced zero callback leads; the closed transfer schema rejected notes. New leads/quotes had no owner-alert table or provider consumer.

Current changes: durable callback requests with note history, failed-transfer follow-up, schema-validated callback capture, transactional notification producers for lead/quote/callback/urgency/preferred time/call completion, tenant-scoped email worker with frozen messages and provider idempotency, acceptance/failure/unknown states and bounded retry/restart leases, owner/staff visibility and owner-only recovery routes. Saved quote receipts are never recalculated.

Cold installation and both builds passed. Focused compatibility checks passed 69/69; actual-route/rendered checks passed 59/59 (overlapping counts). New required local browser test cannot start because this environment has no installed Chromium. The local strict gate and hosted/full verification are still outstanding at this checkpoint; this is not a completion or launch-readiness claim.

Only fake providers and synthetic callers in temporary stores were executed. No live provider operation, main merge, deployment or subagent.
