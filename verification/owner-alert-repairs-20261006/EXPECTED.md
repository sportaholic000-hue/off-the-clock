# Expected outcomes written before execution

Starting source: 53d6833867dcff42a6ba652e74d26364f4fa1ff1.
Synthetic owners/callers, temporary SQLite, fake transfer and email providers only.

1. A requested transfer with no destination, no provider, no confirmed connection or a thrown provider error leaves one actionable callback linked to the call, with the supplied caller words. Exact retries and restart do not add callbacks. Different genuine requests remain distinct. Database failure must prevent a saved acknowledgement.
2. A caller explicitly requesting a callback through lead capture has one durable callback record, keeps original words and correction history, and is visible through authorized owner/staff call and lead routes. Wrong owner/call/lead bindings fail closed.
3. Every newly saved lead, quote and callback atomically creates one owner alert event. Rolled-back capture creates neither record nor alert. Corrected notes/contacts remain recoverable without modifying historical sent messages.
4. Fake email acceptance is recorded as provider acceptance (not human receipt). Provider failures, missing configuration and ambiguous timeouts remain stored and visible. Retries use the identical message and idempotency key. Two workers and process restart cannot send different copies of one event.
5. An ambiguous email outside the provider's idempotency retention window is visibly UNKNOWN and is not automatically resent. Exactly-once human receipt cannot be guaranteed; provider acceptance is not proof of inbox delivery or reading.
6. Tenant A cannot inspect or retry B's alerts or callback requests. Staff sees safe contact/request and delivery metadata, not email destinations or private calculation evidence. Logs contain no caller notes, contact or message bodies.
7. Timing policy remains unchanged pending an owner answer: owner-approved timing should govern; absent timing should cause a follow-up statement without a deadline. No fixed historical promises are silently implemented as business policy.
8. Existing saved quote receipts and amounts remain byte-identical. Cold installation/build/strict/full tests must finish with zero failures and zero skips; exact-source hosted CI must be green.
9. If an owner email is unusable, every queued event must reach visible BLOCKED state without a provider attempt. Repeated worker ticks must not requeue the oldest blocked event and strand later events in PENDING. Once a usable email exists, the same events recover once.
