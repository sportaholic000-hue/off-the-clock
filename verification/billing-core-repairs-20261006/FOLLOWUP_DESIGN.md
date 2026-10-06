# Continuation design and constraints

Pinned source: 3d3b88c2b6b1be08453499ae0e827d28ea889c5a, containing tested source9e93cf5. Remote branch and local HEAD matched before edits. No subagents, live provider traffic/data, merge or deploy.

Four existing test changes are the exact previously proposed patch. FOLLOWUP_EXPECTATIONS.md records old expectations, policy/spec citations and correct outcomes before application; the actual files now pass16+13 tests. No other existing test was edited.

## Reproduced failures
- F07 actual unchanged server: eight-day-old unresolved debt reported payment_failed until manual sweep. Followup baseline server artifacts.
- F08 backend allowed PAYMENT_FAILURE_GRACE but canContinueSetup=false. Followup baseline UI JSON and JSX inspected.
- F09 actual unchanged server: lead PATCH and onboarding account POST returned200 and changed SQLite after grace. Same baseline script.
- F10 signed local incoming HTTP and authenticated WebSocket, fake Google adapter:3601seconds stored0minutes, next call started AI. Baseline voice artifacts.

## Changes
F07: bounded100-row startup/60-second worker, transactionally persisted state/event/outbox, stop on lifecycle shutdown. Billing status reads reconcile that owner only. Repeated sweeps/restarts are idempotent; injected outbox failure rolls back all state.
F08: existing client helper now recognizes the exact seven-day grace boundary and rejects invalid/future failure instants. Billing page shows payment recovery, retains setup while entitled. Existing trial behavior preserved.
F09: common authenticated mutation boundary reloads the tenant owner. GET/HEAD/OPTIONS remain readable. Only existing billing Checkout/portal and authenticated resend-verification recover independently. The existing POST /api/pricebook/validate is a read-only draft-validation operation and remains available at the mutation boundary; its separate feature gate is unchanged. Other authentication endpoints already have separate authentication/recovery handlers. Initial pending account step remains allowed per platform section4; later product writes require lifecycle access. Staff use owner state. Admin authentication remains separate.
F10: additive billingVoiceUsage table binds call/owner/provider IDs and stores local connected start/end plus provider receipt duration/digest. A signed incoming media session supplies provisional local connected seconds; full Twilio CallDuration is authoritative when received. Exact retries cannot add minutes; changed identity/duration receipts fail, SQLite errors roll back. Signed callbacks can complete metering after process restart. Meter/final-call state updates commit together. Fallback/spam excluded. Per-call ceiling is applied once to each duration. Trial scope comes from the persisted subscription trial facts; paid scope comes from the current base-item period. Unknown boundaries return unavailable usage instead of using lifetime usage. New number provisioning includes the status callback URL. No Stripe meter submission is added.

Provider references checked against installed Twilio types and official docs:
- https://www.twilio.com/docs/voice/api/call-resource#statuscallbackevent : terminal CallDuration is seconds; callbacks can arrive out of order.
- https://www.twilio.com/docs/voice/twiml/stream : media start/stop alone does not supply the entire inbound leg duration.
- node_modules/twilio/lib/rest/api/v2010/account/incomingPhoneNumber.d.ts : statusCallback and statusCallbackMethod supported.

## Current capability classification
Refunds: not built. Current /api/billing/refund is404; charge.refunded is outside supported webhook set (ignored at transport, rejected by direct state API). No supported refund mutation corrupted in this inspection.
Overage charging: not built. Existing code has no Stripe meter/usage submission or overage price configuration. The confirmed zero-minute recording defect is F10, repaired separately; no paid overage charges introduced.
Notifications: delivery/reminder worker not built. Billing transitions durably enqueue PENDING billing.state_changed events; current production workers do not dispatch those as email. F07 repairs missing suspension transitions, not notification delivery.
Offboarding: wind-down/export/number-release orchestration not built. Existing terminal cancellation disables entitlement and logs/enqueues the transition. No invented refund/access or wind-down policy.

## Operational limitations
No live provider configuration changed. Existing numbers require attaching /api/twilio/voice/status at deployment; new provisioning supplies it. Without a terminal provider receipt, local connected duration remains provisional, not proof of full Twilio leg duration. Pre-existing zero-minute records are not retroactively assigned invented durations or charges; matched provider receipts can reconcile those records. Permanent callback loss/provider reconciliation is not established by these local tests. These limitations prevent an unconditional historical-metering or launch-readiness claim.

## First hosted checkpoint corrections
Run37526820008 at e9e0cd0 passed2067/2072 strict checks, failing5. Two existing naming checks forbid a selected filename containing voice; the new metering entry regression was renamed CallEntry, with identical contents and execution retained in both gates. Three existing release-guard tests showed that POST draft validation is read-only and must not be classified as a mutation. The guard now explicitly recognizes this existing read operation; saving/approval/edit routes remain blocked and their existing feature gates remain unchanged. No existing test or gate was weakened.
