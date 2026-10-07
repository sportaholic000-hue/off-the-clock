# Pre-execution integration expectations

Pinned base: 5c1050dce191e9b97f20234b2747554bbbf3a20c. Synthetic data only.

- Every merged runtime HTTP, mounted middleware and WebSocket route has an explicitly reviewed policy in the tenant matrix, in preview and production. Added routes, anonymous routers and hidden declarations still fail the inventory guards.
- Billing lifecycle, export, cancellation and reactivation are owner-only. Foreign query/body/header selectors return generic 403 before any provider mutation; ordinary own-tenant export remains available within retention. Off-site status is admin-only.
- Every new provider callback rejects mismatched saved owner/call/destination bindings, bad signatures and guessed capabilities without revealing another tenant's data or changing it.
- Anonymous inbound callers still work, but reusing their CallSid with a different caller or destination is forbidden. Failed capture persistence remains retryable 503 and never claims success.
- At the service-end boundary new inbound calls start no AI or forwarding. Previously issued fallback callbacks must not resume forwarding after service end.
- At day 90 customer erasure removes merged callback, alert, SMS and both tool/inbound receipt copies in child-first order. Other tenants and financial receipts remain intact.
- Backup rehearsal signup uses generic 202, verifies a captured synthetic email link through the real HTTP route, then signs in; no pre-verification session is granted.
- All parent tests remain. The known-failure list remains empty; final full and quote gates require zero failures/skips/cancellations/TODOs.
