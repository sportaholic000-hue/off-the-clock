# Expected outcomes, written before execution

Pinned baseline: eaadeca0856f1bd7fcade8685711a19aefd786d0. Synthetic SQLite stores and local fake providers only.

1. D02: newly saved leads, quotes, callbacks and urgency/preference requests have one durable notification per event. A fake accepted email is not evidence of inbox delivery. Notification outbox state must agree with the corresponding alert. SMS must retain enough durable, tenant-bound information for a worker to resume after restart, without an expired voice handle. A failed or ambiguous attempt must remain visible. Repeated dispatch must not send an accepted event again.
2. D05: a definitive pre-acceptance SMS failure allows a later bounded retry of the same request. Concurrent workers cannot send the same request twice. An ambiguous timeout must not be blindly resent by a provider without creation idempotency; a verified receipt/status callback can resolve it. No acknowledgement says sent before provider confirmation.
3. D19: owners and authorized staff can see the stored delivery action's actual status on the call and its associated saved inquiry. Wrong tenants cannot see it. Failure details are safe codes, never credentials/provider payloads or private pricing. If call visibility already works, preserve it and skip a replacement.
4. D20: more than 20 webhook events cannot hide an older unresolved event. Tenant-bound paginated all/unresolved lists must reach it and show safe failure state. No signing secret or customer payload appears in the archive. Existing endpoint configuration and historical events remain intact.

Governing rules: platform_spec_v2 sections 5.4–5.7, 12.1 and 13.2–13.4; AGENTS tenant binding and honesty. SMS is transactional to the inquiring customer; this batch does not invent owner SMS consent/destinations or implement live transfers, appointment-change adapters, billing or deadline promises.
